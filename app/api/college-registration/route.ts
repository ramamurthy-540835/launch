import { after, NextResponse } from "next/server";
import { registerEntity } from "@/lib/entity-locator/api";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { logInfo } from "@/lib/logging";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await enforceRateLimit("college_registration", identity, 5, 3600);
    const result = await registerEntity("college", await request.json() as Record<string, unknown>, (task) => after(task));
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    logInfo("entity_registered", { entity_type: "college" });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RateLimitError ? error.message : "Unable to register this college right now." }, { status: error instanceof RateLimitError ? 429 : 500 });
  }
}
