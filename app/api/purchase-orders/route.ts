import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError, jsonBody } from "@/lib/inventory/api";
import { createPurchaseOrder } from "@/lib/inventory/procurement";
import { serialize } from "@/lib/inventory/service";
export async function GET(request: Request) { try { const actor = await verifyInventoryAccess(request, ["admin", "procurement_manager", "finance_analyst", "warehouse_manager"]); const snapshot = await firestoreClient().collection("purchase_orders").orderBy("created_at", "desc").limit(300).get(); return NextResponse.json({ purchaseOrders: snapshot.docs.map(serialize).filter((po) => actor.isAdmin || actor.locationIds.includes(String(po.destination_location_id))) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const body = await jsonBody(request) as Record<string, unknown>; const actor = await verifyInventoryAccess(request, ["admin", "procurement_manager"], String(body.destinationLocationId || "")); return NextResponse.json(await createPurchaseOrder(body, actor.uid), { status: 201 }); } catch (error) { return apiError(error); } }
