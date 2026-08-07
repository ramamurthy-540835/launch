import { NextResponse } from "next/server";
import { getFranchises } from "@/lib/franchises";
import { logError, requestId } from "@/lib/logging";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = requestId(request);
  try {
    return NextResponse.json(await getFranchises());
  } catch (error) {
    logError("franchises.load_failed", error, { correlationId });
    return NextResponse.json({ error: "Unable to load franchise details.", correlationId }, { status: 500, headers: { "X-Request-Id": correlationId } });
  }
}
