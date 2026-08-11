import { NextRequest, NextResponse } from "next/server";
import { deleteMarketingEvent, listMarketingEvents, saveMarketingEvent } from "@/lib/marketing-events-gcp";
import { eventCategories, eventStatuses, type MarketingEvent } from "@/lib/marketing-events";

export const runtime = "nodejs";

function validEvent(value: unknown): value is MarketingEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<MarketingEvent>;
  return typeof event.eventId === "string" && typeof event.title === "string" && event.title.trim().length > 0
    && typeof event.eventCategory === "string" && eventCategories.includes(event.eventCategory as MarketingEvent["eventCategory"])
    && typeof event.scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.scheduledDate)
    && typeof event.scheduledTimeStart === "string" && typeof event.scheduledTimeEnd === "string"
    && typeof event.city === "string" && typeof event.venue === "string" && typeof event.ownerName === "string"
    && typeof event.status === "string" && eventStatuses.includes(event.status as MarketingEvent["status"])
    && Array.isArray(event.linkedLeadIds) && typeof event.createdAt === "string" && typeof event.updatedAt === "string";
}

export async function GET() {
  try {
    return NextResponse.json(await listMarketingEvents());
  } catch {
    return NextResponse.json({ error: "Marketing events could not be loaded from BigQuery." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const event = await request.json().catch(() => null);
  if (!validEvent(event)) return NextResponse.json({ error: "A valid event is required." }, { status: 400 });
  try {
    return NextResponse.json({ mode: await saveMarketingEvent(event), event });
  } catch {
    return NextResponse.json({ error: "Marketing event could not be saved to BigQuery." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId is required." }, { status: 400 });
  try {
    return NextResponse.json({ mode: await deleteMarketingEvent(eventId) });
  } catch {
    return NextResponse.json({ error: "Marketing event could not be deleted from BigQuery." }, { status: 502 });
  }
}
