import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type DocumentData } from "@google-cloud/firestore";
import { firestoreClient } from "@/lib/firestore";
import { franchiseApplicationStatuses, franchisePaymentStatuses, type FranchiseApplication, type FranchiseApplicationStatus, type FranchisePaymentStatus } from "@/lib/franchise-types";
export { franchiseApplicationStatuses, franchisePaymentStatuses };
export type { FranchiseApplication, FranchiseApplicationStatus, FranchisePaymentStatus };

export class FranchiseWorkflowError extends Error {
  constructor(message: string, public readonly statusCode = 400) { super(message); this.name = "FranchiseWorkflowError"; }
}

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const firstText = (data: Record<string, unknown>, keys: string[]) => keys.map((key) => text(data[key])).find(Boolean) || "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
export function timestampToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
  if (value && typeof value === "object") { const stamp = value as { toDate?: () => Date; _seconds?: number; seconds?: number }; if (stamp.toDate) return stamp.toDate().toISOString(); const seconds = stamp.seconds ?? stamp._seconds; if (typeof seconds === "number") return new Date(seconds * 1000).toISOString(); }
  return null;
}

export function generateFranchiseReferenceId(bytes: () => Buffer = () => randomBytes(4)) {
  return `FR-${bytes().toString("hex").toUpperCase().slice(0, 8).padEnd(8, "0")}`;
}

export function normalizeFranchiseStatus(value: unknown): FranchiseApplicationStatus {
  const normalized = text(value).toUpperCase().replace(/[ -]+/g, "_");
  if (normalized === "NEW" || normalized === "PENDING") return "RECEIVED";
  return franchiseApplicationStatuses.includes(normalized as FranchiseApplicationStatus) ? normalized as FranchiseApplicationStatus : "RECEIVED";
}
export function normalizePaymentStatus(value: unknown): FranchisePaymentStatus {
  const normalized = text(value).toUpperCase().replace(/[ -]+/g, "_");
  return franchisePaymentStatuses.includes(normalized as FranchisePaymentStatus) ? normalized as FranchisePaymentStatus : "NOT_REQUESTED";
}

export function canonicalApplicationRecord(input: Record<string, unknown>, referenceId: string) {
  return {
    reference_id: referenceId,
    applicant_name: firstText(input, ["applicant_name", "contact_name", "contactName", "name"]),
    company_name: firstText(input, ["company_name", "companyName"]),
    contact_name: firstText(input, ["contact_name", "contactName", "applicant_name", "name"]),
    phone: text(input.phone), email: text(input.email).toLowerCase(), website: text(input.website), category: text(input.category),
    address: text(input.address), area: text(input.area), city: text(input.city) || "Chennai",
    opportunity_id: firstText(input, ["opportunity_id", "opportunityId", "territory_id", "territoryId"]),
    latitude: typeof input.latitude === "number" ? input.latitude : null,
    longitude: typeof input.longitude === "number" ? input.longitude : null,
    status: "RECEIVED" as const, payment_status: "NOT_REQUESTED" as const,
    notes: null, assigned_to: null,
    workflow_history: [{ status: "RECEIVED", changed_by: "PUBLIC_APPLICATION", changed_at: Timestamp.now() }],
    created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
  };
}

export function toFranchiseApplication(referenceId: string, data: Record<string, unknown>): FranchiseApplication {
  const paymentLink = (data.payment_link || data.paymentLink || {}) as Record<string, unknown>;
  const amountPaise = number(data.razorpay_amount_paise ?? paymentLink.amount_paise ?? paymentLink.amountPaise);
  return {
    referenceId: firstText(data, ["reference_id"]) || referenceId,
    applicantName: firstText(data, ["applicant_name", "full_name", "name", "contact_name", "contactName"]),
    companyName: firstText(data, ["company_name", "companyName"]), contactName: firstText(data, ["contact_name", "contactName", "applicant_name", "name"]),
    phone: firstText(data, ["phone", "phone_number", "mobile"]), email: firstText(data, ["email", "email_address"]),
    website: text(data.website), category: text(data.category), address: text(data.address), area: text(data.area),
    selectedCity: firstText(data, ["city", "selected_city"]), opportunityId: firstText(data, ["opportunity_id", "opportunityId", "territory_id"]),
    latitude: typeof data.latitude === "number" ? data.latitude : null, longitude: typeof data.longitude === "number" ? data.longitude : null,
    status: normalizeFranchiseStatus(data.status), paymentStatus: normalizePaymentStatus(data.payment_status ?? data.paymentStatus),
    submittedAt: timestampToIso(data.created_at ?? data.createdAt ?? data.submitted_at), updatedAt: timestampToIso(data.updated_at ?? data.updatedAt),
    notes: firstText(data, ["notes", "admin_notes"]) || null, assignedTo: firstText(data, ["assigned_to", "assignedTo"]) || null,
    razorpayPaymentLinkId: firstText(data, ["razorpay_payment_link_id"]) || firstText(paymentLink, ["id"]),
    razorpayShortUrl: firstText(data, ["razorpay_short_url"]) || firstText(paymentLink, ["short_url", "shortUrl"]),
    razorpayReferenceId: firstText(data, ["razorpay_reference_id"]), razorpayAmountPaise: amountPaise,
    razorpayStatus: firstText(data, ["razorpay_status"]) || firstText(paymentLink, ["status"]), amountInr: amountPaise / 100,
    investmentReadiness: firstText(data, ["investment_readiness", "investmentReadiness"]),
    experienceBackground: [firstText(data, ["experience_background", "experience", "background", "occupation"]), text(data.motivation)].filter(Boolean).join("\n\n"),
  };
}

export async function createFranchiseApplication(input: Record<string, unknown>) {
  const collection = firestoreClient().collection("franchise_applications");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referenceId = generateFranchiseReferenceId();
    try { await collection.doc(referenceId).create(canonicalApplicationRecord(input, referenceId)); return referenceId; }
    catch (error) { if ((error as { code?: number }).code !== 6 && (error as { code?: string }).code !== "already-exists") throw error; }
  }
  throw new Error("Unable to allocate a franchise application reference.");
}

function canonicalTerritory(data: DocumentData) {
  const planned = number(data.planned_franchise_count ?? data.plannedFranchiseCount ?? data.franchiseSlots) || 1;
  const allocated = number(data.allocated_franchise_count ?? data.activeFranchiseCount ?? data.franchiseCount);
  return { planned, allocated, available: Math.max(0, planned - allocated), status: text(data.status).toUpperCase() };
}

export async function activateFranchise(referenceId: string, staffUid: string) {
  const db = firestoreClient(); const applicationRef = db.collection("franchise_applications").doc(referenceId);
  const franchiseId = `LBX-${referenceId.slice(3)}`; const franchiseRef = db.collection("franchises").doc(franchiseId);
  return db.runTransaction(async (transaction) => {
    const applicationSnapshot = await transaction.get(applicationRef);
    if (!applicationSnapshot.exists) throw new FranchiseWorkflowError("Application not found.", 404);
    const application = toFranchiseApplication(referenceId, applicationSnapshot.data() || {});
    if (application.paymentStatus !== "PAID" || !["PAID", "ACTIVATED"].includes(application.status)) throw new FranchiseWorkflowError("Only a verified paid application can be activated.", 409);
    if (!application.opportunityId) throw new FranchiseWorkflowError("The application is not linked to a territory.", 409);
    const territoryRef = db.collection("franchise_locations").doc(application.opportunityId);
    const [territorySnapshot, existingFranchise] = await Promise.all([transaction.get(territoryRef), transaction.get(franchiseRef)]);
    if (existingFranchise.exists || application.status === "ACTIVATED") return { franchiseId, duplicate: true };
    if (!territorySnapshot.exists) throw new FranchiseWorkflowError("The selected territory no longer exists.", 409);
    const territory = canonicalTerritory(territorySnapshot.data() || {});
    if (territory.available < 1 || territory.status === "FULL" || territory.status === "INACTIVE") throw new FranchiseWorkflowError("The selected territory has no available franchise capacity.", 409);
    const now = FieldValue.serverTimestamp(); const nextAllocated = territory.allocated + 1; const available = territory.planned - nextAllocated;
    transaction.create(franchiseRef, {
      franchise_id: franchiseId, application_reference: referenceId, territory_id: application.opportunityId,
      name: application.companyName || application.applicantName, company_name: application.companyName, operator_name: application.contactName || application.applicantName,
      city: application.selectedCity, area: application.area, address: application.address, phone: application.phone, email: application.email, website: application.website,
      location: application.latitude !== null && application.longitude !== null ? { lat: application.latitude, lng: application.longitude } : null,
      daily_student_capacity: 1500, student_count: 0, payment_status: "PAID", status: "ACTIVE", activated_at: now, created_at: now, updated_at: now,
    });
    transaction.update(territoryRef, { allocated_franchise_count: nextAllocated, available_slots: available, status: available === 0 ? "FULL" : "PARTIALLY_ALLOCATED", updated_at: now });
    transaction.update(applicationRef, { status: "ACTIVATED", activated_franchise_id: franchiseId, activated_at: now, updated_at: now, workflow_history: FieldValue.arrayUnion({ status: "ACTIVATED", changed_by: staffUid, changed_at: Timestamp.now() }) });
    return { franchiseId, duplicate: false };
  });
}
