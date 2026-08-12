import { NextResponse } from "next/server";
import { verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError } from "@/lib/inventory/api";
import { serialize } from "@/lib/inventory/service";
export async function GET(request: Request) { try { const actor = await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "procurement_manager", "finance_analyst", "planning_manager"]); const status = new URL(request.url).searchParams.get("status") || "OPEN"; const snapshot = await firestoreClient().collection("inventory_alerts").where("status", "==", status).limit(500).get(); return NextResponse.json({ alerts: snapshot.docs.map(serialize).filter((alert) => actor.isAdmin || actor.locationIds.includes(String(alert.location_id))) }); } catch (error) { return apiError(error); } }
