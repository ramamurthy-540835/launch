import { NextResponse } from "next/server";
import { verifyInventoryAccess, type InventoryRole } from "@/lib/firebase-admin";
import { apiError, jsonBody } from "@/lib/inventory/api";
import { transitionTransfer } from "@/lib/inventory/service";
const roles: Record<string, InventoryRole[]> = { approve: ["admin", "warehouse_manager"], dispatch: ["admin", "warehouse_manager", "logistics_manager"], receive: ["admin", "branch_store_manager", "logistics_manager"] };
export async function PUT(request: Request, { params }: { params: Promise<{ transferId: string; action: string }> }) { try { const { transferId, action } = await params; if (!(action in roles)) return NextResponse.json({ error: "Unsupported transfer action." }, { status: 404 }); const actor = await verifyInventoryAccess(request, roles[action]); return NextResponse.json(await transitionTransfer(transferId, action as "approve" | "dispatch" | "receive", actor.uid, await jsonBody(request) as Record<string, unknown>)); } catch (error) { return apiError(error); } }
