import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError, jsonBody } from "@/lib/inventory/api";
import { createTransfer, serialize } from "@/lib/inventory/service";

export async function GET(request: Request) { try { const actor = await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "planning_manager"]); const snapshot = await firestoreClient().collection("stock_transfer_orders").orderBy("created_at", "desc").limit(200).get(); return NextResponse.json({ transfers: snapshot.docs.map(serialize).filter((entry) => actor.isAdmin || actor.locationIds.includes(String(entry.source_location_id)) || actor.locationIds.includes(String(entry.destination_location_id))) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { const body = await jsonBody(request) as Record<string, unknown>; const actor = await verifyInventoryAccess(request, ["admin", "branch_store_manager", "kitchen_manager", "planning_manager"], String(body.destinationLocationId || "")); return NextResponse.json(await createTransfer(body, actor.uid), { status: 201 }); } catch (error) { return apiError(error); } }
