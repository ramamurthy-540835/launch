import { NextResponse } from "next/server";
import {
  deleteMarketingEvent,
  listMarketingEvents,
  saveMarketingEvent,
  validateMarketingEventPayload,
  verifyMarketingInstitutions,
} from "@/lib/marketing-events-gcp";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await listMarketingEvents();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Marketing events could not be read from BigQuery." }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const payload = await request.json().catch(() => null);
  const validated = validateMarketingEventPayload(payload);
  if (!validated.ok) return NextResponse.json({ error: "Enter a valid marketing event.", details: validated.errors }, { status: 400 });

  try {
    const verification = await verifyMarketingInstitutions(validated.event.institutions);
    if (verification.missing.length > 0) {
      return NextResponse.json({
        error: "One or more mapped institutions were not found in saved schools or colleges.",
        details: verification.missing,
      }, { status: 400 });
    }
    const result = await saveMarketingEvent(validated.event);
    return NextResponse.json({ ...result, eventId: validated.event.eventId });
  } catch {
    return NextResponse.json({ error: "Marketing event could not be saved to BigQuery." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim() || "";
  if (!eventId || eventId.length > 300) return NextResponse.json({ error: "Choose a valid marketing event." }, { status: 400 });
  try {
    const result = await deleteMarketingEvent(eventId);
    return NextResponse.json({ ...result, eventId });
  } catch {
    return NextResponse.json({ error: "Marketing event could not be deleted from BigQuery." }, { status: 502 });
  }
}

