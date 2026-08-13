import { NextResponse } from "next/server";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { franchiseApplicationSchema } from "@/lib/validation/franchise";
import { createFranchiseApplication } from "@/lib/franchise-applications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = franchiseApplicationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please correct the highlighted details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    await enforceRateLimit("franchise_application", request.headers.get("x-forwarded-for") || "unknown", 5, 3600);
    const referenceId = await createFranchiseApplication(parsed.data);
    return NextResponse.json({ id: referenceId, reference_id: referenceId, status: "RECEIVED", payment_status: "NOT_REQUESTED" }, { status: 201 });
  } catch (error) {
    const status = error instanceof RateLimitError ? 429 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit your application." }, { status });
  }
}
