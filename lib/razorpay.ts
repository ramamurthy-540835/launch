import { createHmac, timingSafeEqual } from "node:crypto";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

export function isRazorpayConfigured() {
  return Boolean(keyId && keySecret);
}

export function paymentCheckoutDetails(id: string, amountInr: number) {
  if (!keyId) throw new Error("Razorpay is not configured.");
  return { id, amount: Math.round(amountInr * 100), currency: "INR", keyId };
}

function authorization() {
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function createPaymentOrder(appOrderId: string, amountInr: number) {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authorization(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: "INR", receipt: appOrderId.slice(0, 40), notes: { app_order_id: appOrderId } }),
  });
  const data = await response.json() as { id?: string; amount?: number; currency?: string; error?: { description?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.description || "Unable to initialize payment.");
  return { id: data.id, amount: data.amount!, currency: data.currency!, keyId: keyId! };
}

export function verifyCheckoutSignature(serverOrderId: string, paymentId: string, signature: string) {
  if (!keySecret) return false;
  const expected = createHmac("sha256", keySecret).update(`${serverOrderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  if (!webhookSecret) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function fetchPayment(paymentId: string) {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: authorization() } });
  const data = await response.json() as { id?: string; order_id?: string; amount?: number; currency?: string; status?: string };
  if (!response.ok) throw new Error("Unable to verify payment status.");
  return data;
}

export async function createRefund(paymentId: string, amountPaise: number, idempotencyKey: string, reason: string) {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { Authorization: authorization(), "Content-Type": "application/json", "X-Refund-Idempotency": idempotencyKey },
    body: JSON.stringify({ amount: amountPaise, speed: "normal", receipt: idempotencyKey.slice(0, 40), notes: { reason: reason.slice(0, 256) } }),
  });
  const data = await response.json() as { id?: string; status?: string; amount?: number; error?: { description?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.description || "Unable to initiate refund.");
  return data as { id: string; status: string; amount: number };
}
