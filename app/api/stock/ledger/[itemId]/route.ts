import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError } from "@/lib/inventory/api";
import { serialize } from "@/lib/inventory/service";

export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) { try { const { itemId } = await params; const locationId = new URL(request.url).searchParams.get("locationId"); const actor = await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "procurement_manager", "finance_analyst", "planning_manager"], locationId || undefined); let query: FirebaseFirestore.Query = firestoreClient().collection("stock_transactions").where("item_id", "==", itemId); if (locationId) query = query.where("location_id", "==", locationId); const snapshot = await query.orderBy("performed_at", "desc").limit(500).get(); return NextResponse.json({ transactions: snapshot.docs.map(serialize).filter((entry) => actor.isAdmin || actor.locationIds.includes(String(entry.location_id))) }); } catch (error) { return apiError(error); } }
