import { NextResponse } from "next/server";
import { confirmCapturedPayment, updateRefundStatus } from "@/lib/firestore";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } };
    refund?: { entity?: { id?: string; status?: string } };
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Razorpay-Signature") || "";
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as RazorpayEvent;
  if (["refund.created", "refund.processed", "refund.failed"].includes(event.event || "")) {
    const refund = event.payload?.refund?.entity;
    if (!refund?.id || !refund.status) return NextResponse.json({ error: "Invalid refund payload." }, { status: 400 });
    await updateRefundStatus(refund.id, refund.status);
    return NextResponse.json({ accepted: true });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") {
    return NextResponse.json({ accepted: true, ignored: true });
  }
  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id || payment.status !== "captured" || payment.currency !== "INR" || !Number.isInteger(payment.amount)) {
    return NextResponse.json({ error: "Invalid captured-payment payload." }, { status: 400 });
  }
  await confirmCapturedPayment(payment.order_id, payment.id, payment.amount!);
  return NextResponse.json({ accepted: true });
}
