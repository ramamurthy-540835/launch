import { NextResponse } from "next/server";
import { verifyInventoryAccess, type InventoryRole } from "@/lib/firebase-admin";
import { apiError, jsonBody } from "@/lib/inventory/api";
import { applyStockMovement } from "@/lib/inventory/service";

const config: Record<string, { type: string; roles: InventoryRole[] }> = {
  receipt: { type: "RECEIPT", roles: ["admin", "warehouse_manager", "branch_store_manager"] }, issue: { type: "ISSUE", roles: ["admin", "branch_store_manager"] },
  wastage: { type: "WASTAGE", roles: ["admin", "branch_store_manager"] }, adjustment: { type: "ADJUSTMENT", roles: ["admin", "warehouse_manager", "branch_store_manager"] },
};
export async function POST(request: Request, { params }: { params: Promise<{ movement: string }> }) { try { const { movement } = await params; const selected = config[movement]; if (!selected) return NextResponse.json({ error: "Unsupported stock movement." }, { status: 404 }); const body = await jsonBody(request) as Record<string, unknown>; const actor = await verifyInventoryAccess(request, selected.roles, String(body.locationId || "")); return NextResponse.json(await applyStockMovement({ ...body, transactionType: selected.type }, actor.uid), { status: 201 }); } catch (error) { return apiError(error); } }
