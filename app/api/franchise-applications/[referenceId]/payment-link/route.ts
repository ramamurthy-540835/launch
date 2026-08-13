import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { firestoreClient } from "@/lib/firestore";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { toFranchiseApplication } from "@/lib/franchise-applications";
import { recordFranchisePaymentCreated } from "@/lib/franchise-payment-analytics";
import { createFranchisePaymentLink, franchisePaymentAmountPaise, isFranchisePaymentLinksConfigured } from "@/lib/razorpay";

export const runtime = "nodejs";
type Context = { params: Promise<{ referenceId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const referenceId = (await params).referenceId.trim().toUpperCase();
    if (!/^FR-[A-F0-9]{8}$/.test(referenceId)) return NextResponse.json({ error: "Invalid application reference." }, { status: 400 });
    await enforceRateLimit("franchise_payment_link", request.headers.get("x-forwarded-for") || "unknown", 5, 3600);
    const db = firestoreClient(); const reference = db.collection("franchise_applications").doc(referenceId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const application = toFranchiseApplication(referenceId, snapshot.data() || {});
    if (application.status !== "APPROVED_FOR_PAYMENT") return NextResponse.json({ error: "This franchise application has not yet been approved for payment." }, { status: 403 });
    if (application.paymentStatus === "PAID") return NextResponse.json({ error: "This franchise application has already been paid." }, { status: 409 });
    if (!application.opportunityId) return NextResponse.json({ error: "This application is not linked to a franchise territory." }, { status: 409 });
    const territory = await db.collection("franchise_locations").doc(application.opportunityId).get();
    if (!territory.exists) return NextResponse.json({ error: "The selected territory was not found." }, { status: 409 });
    const territoryData = territory.data() || {};
    const planned = Number(territoryData.planned_franchise_count ?? territoryData.plannedFranchiseCount ?? 0);
    const allocated = Number(territoryData.allocated_franchise_count ?? territoryData.franchiseCount ?? 0);
    if (String(territoryData.status).toUpperCase() === "INACTIVE" || planned <= allocated) return NextResponse.json({ error: "The selected territory no longer has franchise capacity." }, { status: 409 });
    if (application.razorpayShortUrl && !["paid", "expired", "cancelled"].includes(application.razorpayStatus.toLowerCase())) return NextResponse.json({ url: application.razorpayShortUrl, reused: true });
    if (!isFranchisePaymentLinksConfigured()) return NextResponse.json({ error: "Franchise payments are not enabled yet. Please wait for a verified payment request." }, { status: 409 });
    const callbackUrl = new URL(`/franchise/payment?applicationId=${encodeURIComponent(referenceId)}`, request.url).toString();
    const link = await createFranchisePaymentLink({ applicationId: referenceId, territoryId: application.opportunityId, name: application.contactName || application.applicantName, email: application.email, phone: application.phone, callbackUrl });
    if (link.amount !== franchisePaymentAmountPaise()) throw new Error("Razorpay returned an unexpected franchise amount.");
    await reference.update({
      payment_status: "PAYMENT_LINK_CREATED", razorpay_payment_link_id: link.id, razorpay_short_url: link.shortUrl,
      razorpay_reference_id: link.referenceId, razorpay_amount_paise: link.amount, razorpay_status: link.status,
      razorpay_created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
    });
    await recordFranchisePaymentCreated({
      applicationId: referenceId,
      territoryId: application.opportunityId,
      paymentLinkId: link.id,
      referenceId: link.referenceId,
      amountPaise: link.amount,
      isTest: (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_"),
    }).catch((analyticsError) => console.error("[franchise-payment] analytics insert failed", analyticsError));
    return NextResponse.json({ url: link.shortUrl, reused: false });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the payment link." }, { status });
  }
}
