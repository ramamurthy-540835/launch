import { FieldValue, Timestamp } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { ParentAuthError, verifyStaffRole } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { writeAuditLog } from "@/lib/hardening";
import {
  addDuplicateCounts, isPartnerRegistrationType, normalizePartnerRegistration, partnerRegistrationStatuses,
  partnerRegistrationTypes, registrationCollections, type PartnerRegistrationStatus,
} from "@/lib/partner-registrations";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const status = error instanceof ParentAuthError ? 403 : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to manage registrations." }, { status });
}

export async function GET(request: Request) {
  try {
    await verifyStaffRole(request, "admin");
    const url = new URL(request.url);
    const selectedType = (url.searchParams.get("type") || "").toLowerCase();
    const types = isPartnerRegistrationType(selectedType) ? [selectedType] : [...partnerRegistrationTypes];
    const snapshots = await Promise.all(types.map(async (entityType) => ({
      entityType,
      snapshot: await firestoreClient().collection(registrationCollections[entityType]).orderBy("created_at", "desc").limit(150).get(),
    })));
    let registrations = addDuplicateCounts(snapshots.flatMap(({ entityType, snapshot }) =>
      snapshot.docs.map((document) => normalizePartnerRegistration(document.id, entityType, document.data()))));

    const status = (url.searchParams.get("status") || "").toUpperCase();
    const city = (url.searchParams.get("city") || "").toUpperCase();
    const zone = (url.searchParams.get("zone") || "").toUpperCase();
    const query = (url.searchParams.get("q") || "").trim().toLocaleLowerCase("en-IN").slice(0, 100);
    if (partnerRegistrationStatuses.includes(status as PartnerRegistrationStatus)) registrations = registrations.filter((item) => item.status === status);
    if (city) registrations = registrations.filter((item) => item.cityCode === city);
    if (zone) registrations = registrations.filter((item) => item.zoneCode === zone);
    if (query) registrations = registrations.filter((item) => `${item.registrationId} ${item.displayName} ${item.contactName || ""} ${item.contactPhone || ""}`.toLocaleLowerCase("en-IN").includes(query));
    registrations.sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
    const summary = Object.fromEntries(partnerRegistrationStatuses.map((item) => [item, registrations.filter((registration) => registration.status === item).length]));
    return NextResponse.json({ registrations: registrations.slice(0, 250), summary, total: registrations.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const staff = await verifyStaffRole(request, "admin");
    const body = await request.json() as Record<string, unknown>;
    const entityType = typeof body.entityType === "string" ? body.entityType.toLowerCase() : "";
    const registrationId = typeof body.registrationId === "string" ? body.registrationId.trim().slice(0, 100) : "";
    const status = typeof body.status === "string" ? body.status.toUpperCase() as PartnerRegistrationStatus : "RECEIVED";
    const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim().slice(0, 120) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
    const followUpDate = typeof body.followUpDate === "string" ? body.followUpDate : "";
    if (!isPartnerRegistrationType(entityType) || !/^[A-Z0-9-]{8,100}$/i.test(registrationId) || !partnerRegistrationStatuses.includes(status)) {
      return NextResponse.json({ error: "Choose a valid registration and workflow status." }, { status: 400 });
    }
    let followUpAt: Timestamp | null = null;
    if (followUpDate) {
      const parsed = new Date(`${followUpDate}T09:00:00+05:30`);
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Enter a valid follow-up date." }, { status: 400 });
      followUpAt = Timestamp.fromDate(parsed);
    }
    const reference = firestoreClient().collection(registrationCollections[entityType]).doc(registrationId);
    const existing = await reference.get();
    if (!existing.exists) return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    await reference.set({
      status, assigned_to: assignedTo || null, internal_notes: notes || null, follow_up_at: followUpAt,
      updated_at: FieldValue.serverTimestamp(), updated_by: staff.uid,
      workflow_history: FieldValue.arrayUnion({ status, assigned_to: assignedTo || null, changed_by: staff.uid, changed_at: Timestamp.now() }),
    }, { merge: true });
    await writeAuditLog(staff.uid, "partner_registration.update", entityType, registrationId, { status, assignedTo, hasFollowUp: Boolean(followUpAt), hasNotes: Boolean(notes) });
    return NextResponse.json({ updated: true, registrationId, status });
  } catch (error) { return errorResponse(error); }
}
