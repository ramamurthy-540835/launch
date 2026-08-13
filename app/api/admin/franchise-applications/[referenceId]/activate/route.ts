import { NextResponse } from "next/server";
import { ParentAuthError, verifyStaffRole } from "@/lib/firebase-admin";
import { activateFranchise, FranchiseWorkflowError } from "@/lib/franchise-applications";
import { writeAuditLog } from "@/lib/hardening";

type Context = { params: Promise<{ referenceId: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const staff = await verifyStaffRole(request, "admin"); const referenceId = (await params).referenceId.trim().toUpperCase();
    if (!/^FR-[A-F0-9]{8}$/.test(referenceId)) return NextResponse.json({ error: "Invalid application reference." }, { status: 400 });
    const result = await activateFranchise(referenceId, staff.uid);
    await writeAuditLog(staff.uid, "franchise.activate", "franchise_application", referenceId, result);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ParentAuthError ? 403 : error instanceof FranchiseWorkflowError ? error.statusCode : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to activate the franchise." }, { status });
  }
}
