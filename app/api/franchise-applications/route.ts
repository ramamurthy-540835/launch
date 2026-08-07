import { FieldValue } from "@google-cloud/firestore";
import { NextResponse } from "next/server";
import { firestoreClient, isFirestoreConfigured } from "@/lib/firestore";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { logError, logInfo, requestId } from "@/lib/logging";

export const runtime = "nodejs";

const supportedCities = new Set(["Chennai", "Coimbatore", "Madurai", "Trichy"]);
const readinessOptions = new Set(["Funds available now", "Available within 30 days", "Available within 3 months", "Exploring finance options"]);
const timelineOptions = new Set(["Within 1 month", "1–3 months", "3–6 months", "Just exploring"]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const correlationId = requestId(request);
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    await enforceRateLimit("franchise_application", forwardedFor || "unknown", 5, 3600);
    const body = await request.json() as Record<string, unknown>;
    const application = {
      full_name: cleanText(body.fullName, 80), phone: cleanText(body.phone, 10), email: cleanText(body.email, 120).toLowerCase(),
      city: cleanText(body.city, 30), area: cleanText(body.area, 100), occupation: cleanText(body.occupation, 120),
      investment_readiness: cleanText(body.investmentReadiness, 50), start_timeline: cleanText(body.startTimeline, 30), motivation: cleanText(body.motivation, 800),
    };
    if (application.full_name.length < 2 || application.area.length < 2 || application.occupation.length < 2 || application.motivation.length < 20) return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
    if (!/^[6-9]\d{9}$/.test(application.phone)) return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!supportedCities.has(application.city) || !readinessOptions.has(application.investment_readiness) || !timelineOptions.has(application.start_timeline)) return NextResponse.json({ error: "Choose a valid city, investment readiness and timeline." }, { status: 400 });
    if (body.consent !== "accepted") return NextResponse.json({ error: "Please accept the contact consent to apply." }, { status: 400 });

    const applicationId = `FR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    if (isFirestoreConfigured()) await firestoreClient().collection("franchise_applications").doc(applicationId).create({ ...application, planned_investment_inr: 500000, consent: true, status: "NEW", source: "website", created_at: FieldValue.serverTimestamp() });
    logInfo("franchise.application_received", { correlationId, applicationId, city: application.city, stored: isFirestoreConfigured() });
    return NextResponse.json({ applicationId, stored: isFirestoreConfigured() }, { status: 201, headers: { "X-Request-Id": correlationId } });
  } catch (error) {
    logError("franchise.application_failed", error, { correlationId });
    const status = error instanceof RateLimitError ? 429 : error instanceof SyntaxError ? 400 : 500;
    const message = status === 429 && error instanceof Error ? error.message : status === 400 ? "Invalid application data." : "Unable to submit your application right now.";
    return NextResponse.json({ error: message, correlationId }, { status, headers: { "X-Request-Id": correlationId } });
  }
}
