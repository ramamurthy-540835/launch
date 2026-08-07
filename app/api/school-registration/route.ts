import { createHash } from "node:crypto";
import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { firestoreClient } from "@/lib/firestore";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { supportedSchoolCities } from "@/lib/school-search";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await enforceRateLimit("school_registration", forwardedFor, 5, 3600);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const address = typeof body.address === "string" ? body.address.trim().slice(0, 240) : "";
    const cityId = typeof body.cityId === "string" ? body.cityId.toLowerCase() : "";
    const placeId = typeof body.placeId === "string" ? body.placeId.trim().slice(0, 300) : "";
    const latitude = body.latitude === null ? null : Number(body.latitude);
    const longitude = body.longitude === null ? null : Number(body.longitude);
    if (name.length < 3 || address.length < 3 || !(cityId in supportedSchoolCities) || !placeId) return NextResponse.json({ error: "Select a valid school suggestion before registering." }, { status: 400 });
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) return NextResponse.json({ error: "The selected school location is invalid." }, { status: 400 });

    const id = `SR-${createHash("sha256").update(`${cityId}:${placeId}`).digest("hex").slice(0, 10).toUpperCase()}`;
    await firestoreClient().collection("school_onboarding_requests").doc(id).set({
      school_name: name,
      formatted_address: address,
      city_id: cityId,
      source_place_id: placeId,
      latitude,
      longitude,
      source: "google_maps_via_serpapi",
      status: "RECEIVED",
      request_count: FieldValue.increment(1),
      last_requested_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ referenceId: id, status: "RECEIVED" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RateLimitError ? error.message : "Unable to register this school right now." }, { status: error instanceof RateLimitError ? 429 : 500 });
  }
}
