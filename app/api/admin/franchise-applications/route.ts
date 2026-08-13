import { FieldValue, Timestamp } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { verifyStaffRole, ParentAuthError } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { franchiseApplicationStatuses, toFranchiseApplication, type FranchiseApplicationStatus } from "@/lib/franchise-applications";
import { writeAuditLog } from "@/lib/hardening";

const collection = "franchise_applications";
function failure(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage franchise applications." }, { status: error instanceof ParentAuthError ? 403 : 500 }); }

export async function GET(request: Request) {
  try {
    await verifyStaffRole(request, "admin"); const url = new URL(request.url); const db = firestoreClient();
    const [snapshot, territorySnapshot] = await Promise.all([db.collection(collection).limit(500).get(), db.collection("franchise_locations").limit(500).get()]);
    let applications = snapshot.docs.map((item) => toFranchiseApplication(item.id, item.data())).sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")).slice(0, 250);
    const status = (url.searchParams.get("status") || "").toUpperCase(); const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    if (franchiseApplicationStatuses.includes(status as FranchiseApplicationStatus)) applications = applications.filter((item) => item.status === status);
    if (query) applications = applications.filter((item) => `${item.referenceId} ${item.applicantName} ${item.companyName} ${item.phone} ${item.email} ${item.selectedCity} ${item.area}`.toLowerCase().includes(query));
    const allApplications = snapshot.docs.map((item) => toFranchiseApplication(item.id, item.data()));
    const territoryCounts = territorySnapshot.docs.reduce((total, item) => {
      const data = item.data(); const planned = Number(data.planned_franchise_count ?? data.plannedFranchiseCount ?? 0); const allocated = Number(data.allocated_franchise_count ?? data.franchiseCount ?? 0);
      return { available: total.available + Math.max(0, planned - allocated), allocated: total.allocated + allocated };
    }, { available: 0, allocated: 0 });
    const amount = Number(process.env.FRANCHISE_PAYMENT_AMOUNT_INR || 0); const liveMode = Boolean(process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_"));
    const paid = allApplications.filter((item) => item.paymentStatus === "PAID").length;
    const summary = {
      targetFranchises: 198, applications: allApplications.length,
      underReview: allApplications.filter((item) => ["RECEIVED", "UNDER_REVIEW", "SHORTLISTED"].includes(item.status)).length,
      approvedForPayment: allApplications.filter((item) => item.status === "APPROVED_FOR_PAYMENT").length,
      paymentLinksIssued: allApplications.filter((item) => Boolean(item.razorpayPaymentLinkId)).length,
      paid, activated: allApplications.filter((item) => item.status === "ACTIVATED").length,
      availableTerritories: territoryCounts.available, allocatedTerritories: territoryCounts.allocated,
      franchisePaymentAmount: amount, paymentsCollected: liveMode ? paid * amount : 0,
      paymentsPending: allApplications.filter((item) => item.paymentStatus === "PAYMENT_LINK_CREATED").length * amount,
      paidApplications: paid, refunds: 0, liveMode,
    };
    return NextResponse.json({ applications, summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    const staff = await verifyStaffRole(request, "admin"); const body = await request.json() as Record<string, unknown>;
    const referenceId = typeof body.referenceId === "string" ? body.referenceId.trim().toUpperCase() : "";
    const status = typeof body.status === "string" ? body.status.toUpperCase() as FranchiseApplicationStatus : "RECEIVED";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : ""; const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim().slice(0, 120) : "";
    if (!/^FR-[A-F0-9]{8}$/.test(referenceId) || !franchiseApplicationStatuses.includes(status)) return NextResponse.json({ error: "Choose a valid franchise application and status." }, { status: 400 });
    if (status === "PAID" || status === "ACTIVATED") return NextResponse.json({ error: "Paid status is set only by the verified Razorpay webhook; activation uses the Activate Franchise action." }, { status: 409 });
    const reference = firestoreClient().collection(collection).doc(referenceId); const snapshot = await reference.get();
    if (!snapshot.exists) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const current = toFranchiseApplication(referenceId, snapshot.data() || {});
    if (current.paymentStatus === "PAID" && status !== "REJECTED") return NextResponse.json({ error: "A paid application cannot be moved back into a pre-payment status." }, { status: 409 });
    await reference.set({ status, notes: notes || null, assigned_to: assignedTo || null, updated_at: FieldValue.serverTimestamp(), updated_by: staff.uid, workflow_history: FieldValue.arrayUnion({ status, changed_by: staff.uid, changed_at: Timestamp.now() }) }, { merge: true });
    await writeAuditLog(staff.uid, "franchise_application.update", "franchise_application", referenceId, { status, assignedTo, hasNotes: Boolean(notes) });
    return NextResponse.json({ updated: true, referenceId, status });
  } catch (error) { return failure(error); }
}
