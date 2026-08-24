import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "@google-cloud/firestore";
import { confirmCapturedPayment, firestoreClient, updateRefundStatus } from "@/lib/firestore";
import { recordFranchisePaymentEvent } from "@/lib/franchise-payment-analytics";
import { franchisePaymentAmountPaise, verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";
type Entity = Record<string, unknown>;
type RazorpayEvent = { event?: string; payload?: { payment?: { entity?: Entity }; payment_link?: { entity?: Entity }; refund?: { entity?: Entity } } };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function processFranchiseEvent(eventName: string, event: RazorpayEvent) {
  const link = event.payload?.payment_link?.entity; const payment = event.payload?.payment?.entity;
  const notes = link?.notes as Record<string, unknown> | undefined;
  const applicationId = text(notes?.application_id).toUpperCase(); const linkId = text(link?.id);
  if (!/^FR-[A-F0-9]{8}$/.test(applicationId) || !linkId) throw new Error("Invalid payment-link payload.");
  if (eventName === "payment_link.paid" && text(link?.status).toLowerCase() !== "paid") throw new Error("Invalid payment-link paid status.");

  const db = firestoreClient(); const applicationRef = db.collection("franchise_applications").doc(applicationId);
  const eventKey = `${eventName}-${linkId}-${text(payment?.id) || text(link?.status)}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const eventRef = db.collection("razorpay_franchise_events").doc(eventKey);
  return db.runTransaction(async (transaction) => {
    const [applicationSnapshot, eventSnapshot] = await Promise.all([transaction.get(applicationRef), transaction.get(eventRef)]);
    if (eventSnapshot.exists) return { duplicate: true };
    if (!applicationSnapshot.exists) throw new Error("Franchise application was not found.");
    const stored = applicationSnapshot.data() || {};
    if (text(stored.razorpay_payment_link_id) !== linkId) throw new Error("Payment link does not match the franchise application.");
    const updates: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
    if (eventName === "payment_link.paid") {
      const expected = franchisePaymentAmountPaise(); const storedAmount = Number(stored.razorpay_amount_paise);
      const webhookAmount = Number(link?.amount); const currency = text(link?.currency);
      if (storedAmount !== expected || webhookAmount !== expected) throw new Error("Franchise payment amount mismatch.");
      if (currency !== "INR") throw new Error("Franchise payment currency mismatch.");
      if (payment && (Number(payment.amount) !== expected || text(payment.currency) !== "INR" || !["captured", "authorized"].includes(text(payment.status)))) throw new Error("Invalid franchise payment payload.");
      Object.assign(updates, {
        status: "PAID", payment_status: "PAID", razorpay_status: "paid", paid_at: FieldValue.serverTimestamp(),
        ...(text(payment?.id) ? { razorpay_payment_id: text(payment?.id) } : {}),
        workflow_history: FieldValue.arrayUnion({ status: "PAID", changed_by: "RAZORPAY_WEBHOOK", changed_at: Timestamp.now() }),
      });
    } else {
      const status = eventName === "payment_link.expired" ? "EXPIRED" : "CANCELLED";
      Object.assign(updates, { payment_status: status, razorpay_status: status.toLowerCase() });
    }
    transaction.update(applicationRef, updates);
    transaction.create(eventRef, { event: eventName, application_id: applicationId, payment_link_id: linkId, processed_at: FieldValue.serverTimestamp() });
    return { duplicate: false };
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text(); const signature = request.headers.get("X-Razorpay-Signature") || "";
  if (!verifyWebhookSignature(rawBody, signature)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  let event: RazorpayEvent;
  try { event = JSON.parse(rawBody) as RazorpayEvent; } catch { return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 }); }
  try {
    if (["payment_link.paid", "payment_link.expired", "payment_link.cancelled"].includes(event.event || "")) {
      const result = await processFranchiseEvent(event.event!, event);
      if (!result.duplicate) {
        const link = event.payload?.payment_link?.entity; const payment = event.payload?.payment?.entity;
        const notes = link?.notes as Record<string, unknown> | undefined;
        await recordFranchisePaymentEvent({
          eventId: `${event.event}:${text(payment?.id) || text(link?.id)}`,
          eventType: event.event!, applicationId: text(notes?.application_id).toUpperCase(), territoryId: text(notes?.territory_id),
          paymentLinkId: text(link?.id), paymentId: text(payment?.id) || null,
          status: event.event === "payment_link.paid" ? "paid" : event.event === "payment_link.expired" ? "expired" : "cancelled",
          amountPaise: Number(link?.amount || payment?.amount || 0), rawPayload: rawBody,
        }).catch((analyticsError) => console.error("[franchise-payment] webhook analytics insert failed", analyticsError));
      }
      return NextResponse.json({ accepted: true, ...result });
    }
    if (["refund.created", "refund.processed", "refund.failed"].includes(event.event || "")) {
      const refund = event.payload?.refund?.entity;
      if (!text(refund?.id) || !text(refund?.status)) return NextResponse.json({ error: "Invalid refund payload." }, { status: 400 });
      await updateRefundStatus(text(refund?.id), text(refund?.status)); return NextResponse.json({ accepted: true });
    }
    if (event.event !== "payment.captured" && event.event !== "order.paid") return NextResponse.json({ accepted: true, ignored: true });
    const payment = event.payload?.payment?.entity;
    if (!text(payment?.id) || !text(payment?.order_id) || text(payment?.status) !== "captured" || text(payment?.currency) !== "INR" || !Number.isInteger(payment?.amount)) return NextResponse.json({ error: "Invalid captured-payment payload." }, { status: 400 });
    await confirmCapturedPayment(text(payment?.order_id), text(payment?.id), Number(payment?.amount)); return NextResponse.json({ accepted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process webhook." }, { status: 400 });
  }
}
