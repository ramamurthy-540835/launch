import { createHash } from "node:crypto";
import { FieldValue } from "@google-cloud/firestore";
import { after, NextResponse } from "next/server";
import { firestoreClient } from "@/lib/firestore";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { logInfo } from "@/lib/logging";
import { schoolAnalytics, schoolDirectory } from "@/lib/school-locator";

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

    const id = `SR-${createHash("sha256").update(school.id).digest("hex").slice(0, 10).toUpperCase()}`;
    const reference = firestoreClient().collection("school_onboarding_requests").doc(id);
    const existing = await reference.get();
    await reference.set({
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
      status: "RECEIVED",
      request_count: FieldValue.increment(1),
      last_requested_at: FieldValue.serverTimestamp(),
      ...(!existing.exists ? { created_at: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    after(async () => { await schoolAnalytics.recordRegistration(school, school.provider).catch(() => undefined); });
    logInfo("school_selected", { city: school.city_code, zone: school.zone_code, provider: school.provider });
    return NextResponse.json({ referenceId: id, status: "RECEIVED" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RateLimitError ? error.message : "Unable to register this school right now." }, { status: error instanceof RateLimitError ? 429 : 500 });
  }
}
