import { createHash } from "node:crypto";
import { FieldValue } from "@google-cloud/firestore";
import { after, NextResponse } from "next/server";
import { firestoreClient } from "@/lib/firestore";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { logInfo } from "@/lib/logging";
import { validateRegistrationIntake } from "@/lib/registration-intake";
import { schoolAnalytics, schoolDirectory } from "@/lib/school-locator";

function optionalText(body: Record<string, unknown>, key: string, max: number) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) || null : null;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await enforceRateLimit("school_registration", forwardedFor, 5, 3600);
    const body = await request.json() as Record<string, unknown>;
    const schoolId = typeof body.school_id === "string" ? body.school_id.trim().slice(0, 80) : "";
    if (!/^[A-Z0-9-]{8,80}$/i.test(schoolId)) return NextResponse.json({ error: "Select a valid school before registering." }, { status: 400 });
    const school = await schoolDirectory.getById(schoolId);
    if (!school || !school.is_active) return NextResponse.json({ error: "The selected school is unavailable." }, { status: 400 });
    const intake = validateRegistrationIntake(body, { strengthField: "student_strength", strengthLabel: "Student strength" });
    if (!intake.data) return NextResponse.json({ error: intake.error }, { status: 400 });

    const id = `SR-${createHash("sha256").update(`${school.id}:${intake.data.contactPhone}:${Date.now()}`).digest("hex").slice(0, 10).toUpperCase()}`;
    const reference = firestoreClient().collection("school_onboarding_requests").doc(id);
    await reference.set({
      registration_id: id,
      school_id: school.id,
      school_name: school.school_name,
      formatted_address: school.formatted_address,
      locality: school.locality,
      zone_code: school.zone_code,
      zone_name: school.zone_name,
      city_code: school.city_code,
      city_name: school.city_name,
      state: school.state,
      postal_code: school.postal_code,
      latitude: school.latitude,
      longitude: school.longitude,
      provider: school.provider,
      source_place_id: school.provider_place_id,
      contact_name: intake.data.contactName,
      contact_designation: intake.data.contactDesignation,
      contact_phone: intake.data.contactPhone,
      contact_email: intake.data.contactEmail,
      student_strength: intake.data.strength,
      expected_lunch_users: intake.data.expectedLunchUsers,
      working_days: intake.data.workingDays,
      preferred_meal_time: optionalText(body, "preferred_meal_time", 40),
      existing_food_vendor: optionalText(body, "existing_food_vendor", 160),
      meal_interest: optionalText(body, "meal_interest", 80),
      consent_given: true,
      consent_at: FieldValue.serverTimestamp(),
      status: "RECEIVED",
      registration_source: "public_form",
      request_count: 1,
      last_requested_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    });
    after(async () => { await schoolAnalytics.recordRegistration(school, school.provider).catch(() => undefined); });
    logInfo("school_selected", { city: school.city_code, zone: school.zone_code, provider: school.provider });
    return NextResponse.json({ referenceId: id, status: "RECEIVED" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RateLimitError ? error.message : "Unable to register this school right now." }, { status: error instanceof RateLimitError ? 429 : 500 });
  }
}
