import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError, jsonBody } from "@/lib/inventory/api";
import { receiveGoods } from "@/lib/inventory/procurement";
import { serialize } from "@/lib/inventory/service";
export async function GET(request: Request) { try { const actor = await verifyInventoryAccess(request, ["admin", "warehouse_manager", "procurement_manager", "finance_analyst"]); const snapshot = await firestoreClient().collection("goods_receipts").orderBy("created_at", "desc").limit(300).get(); return NextResponse.json({ goodsReceipts: snapshot.docs.map(serialize).filter((grn) => actor.isAdmin || actor.locationIds.includes(String(grn.location_id))) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const body = await jsonBody(request) as Record<string, unknown>; const actor = await verifyInventoryAccess(request, ["admin", "warehouse_manager"], String(body.locationId || "")); return NextResponse.json(await receiveGoods(body, actor.uid), { status: 201 }); } catch (error) { return apiError(error); } }
