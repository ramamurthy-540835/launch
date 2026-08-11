import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError } from "@/lib/inventory/api";
import { serialize } from "@/lib/inventory/service";

export async function GET(request: Request) { try { const url = new URL(request.url); const locationId = url.searchParams.get("locationId"); const itemId = url.searchParams.get("itemId"); const actor = await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "procurement_manager", "finance_analyst", "planning_manager"], locationId || undefined); let query: FirebaseFirestore.Query = firestoreClient().collection("inventory_balances"); if (locationId) query = query.where("location_id", "==", locationId); if (itemId) query = query.where("item_id", "==", itemId); const snapshot = await query.limit(1000).get(); return NextResponse.json({ balances: snapshot.docs.map(serialize).filter((entry) => actor.isAdmin || actor.locationIds.includes(String(entry.location_id))) }); } catch (error) { return apiError(error); } }
