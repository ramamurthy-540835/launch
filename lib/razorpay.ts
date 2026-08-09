import { createHmac, timingSafeEqual } from "node:crypto";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

function providerTimeoutMs() {
  const configured = Number(process.env.RAZORPAY_API_TIMEOUT_MS || 8_000);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 30_000 ? configured : 8_000;
}

export function isRazorpayConfigured() {
  return process.env.ENABLE_PAYMENTS !== "false" && Boolean(keyId && keySecret);
}

function amountPaise(amountInr: number) {
  const amount = Math.round(amountInr * 100);
  if (!Number.isFinite(amountInr) || !Number.isSafeInteger(amount) || amount < 100) throw new Error("Payment amount must be at least ₹1.");
  return amount;
}

function validSignature(signature: string) { return /^[a-f0-9]{64}$/i.test(signature); }

export function paymentCheckoutDetails(id: string, amountInr: number) {
  if (!keyId) throw new Error("Razorpay is not configured.");
  return { id, amount: amountPaise(amountInr), currency: "INR", keyId };
}

function authorization() {
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function createPaymentOrder(appOrderId: string, amountInr: number) {
  if (!/^LB-[0-9a-f-]{36}$/i.test(appOrderId)) throw new Error("Invalid LunchBox order reference.");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authorization(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise(amountInr), currency: "INR", receipt: appOrderId.slice(0, 40), notes: { app_order_id: appOrderId } }),
    signal: AbortSignal.timeout(providerTimeoutMs()),
  });
  const data = await response.json() as { id?: string; amount?: number; currency?: string; error?: { description?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.description || "Unable to initialize payment.");
  return { id: data.id, amount: data.amount!, currency: data.currency!, keyId: keyId! };
}

export function verifyCheckoutSignature(serverOrderId: string, paymentId: string, signature: string) {
  if (!keySecret || !/^order_[A-Za-z0-9]+$/.test(serverOrderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !validSignature(signature)) return false;
  const expected = createHmac("sha256", keySecret).update(`${serverOrderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  if (!webhookSecret || !validSignature(signature)) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function fetchPayment(paymentId: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("Invalid Razorpay payment reference.");
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authorization() },
    signal: AbortSignal.timeout(providerTimeoutMs()),
  });
  const data = await response.json() as { id?: string; order_id?: string; amount?: number; currency?: string; status?: string };
  if (!response.ok) throw new Error("Unable to verify payment status.");
  return data;
}

export async function createRefund(paymentId: string, amountPaise: number, idempotencyKey: string, reason: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("Invalid Razorpay payment reference.");
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) throw new Error("Refund amount must be at least ₹1.");
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(idempotencyKey)) throw new Error("Invalid refund idempotency key.");
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { Authorization: authorization(), "Content-Type": "application/json", "X-Refund-Idempotency": idempotencyKey },
    body: JSON.stringify({ amount: amountPaise, speed: "normal", receipt: idempotencyKey.slice(0, 40), notes: { reason: reason.slice(0, 256) } }),
    signal: AbortSignal.timeout(providerTimeoutMs()),
  });
  const data = await response.json() as { id?: string; status?: string; amount?: number; error?: { description?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.description || "Unable to initiate refund.");
  return data as { id: string; status: string; amount: number };
}
