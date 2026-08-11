import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { apiError } from "@/lib/inventory/api";
import { approvePurchaseOrder } from "@/lib/inventory/procurement";
export async function PUT(request: Request, { params }: { params: Promise<{ poId: string }> }) { try { const actor = await verifyInventoryAccess(request, ["admin", "finance_analyst"]); return NextResponse.json(await approvePurchaseOrder((await params).poId, actor.uid)); } catch (error) { return apiError(error); } }
