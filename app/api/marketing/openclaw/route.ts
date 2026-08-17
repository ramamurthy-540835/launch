import { NextResponse } from "next/server";
import { queueOpenClawBroadcast, queueOpenClawMessage, validateOpenClawBroadcastRequest, validateOpenClawOutboxRequest } from "@/lib/openclaw-outbox";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  try {
    if (payload?.sendToAll) {
      const validated = validateOpenClawBroadcastRequest(payload);
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
      return NextResponse.json(await queueOpenClawBroadcast(validated.value), { status: 201 });
    }
    const validated = validateOpenClawOutboxRequest(payload);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const result = await queueOpenClawMessage(validated.value);
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The message could not be queued in BigQuery." }, { status: 502 });
  }
}
