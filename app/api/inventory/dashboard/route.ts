import { NextResponse } from "next/server";
import { isParentAuthRequired, verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError } from "@/lib/inventory/api";
import { serialize } from "@/lib/inventory/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const locationId = url.searchParams.get("locationId");
    const actor = isParentAuthRequired()
      ? await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "procurement_manager", "finance_analyst", "planning_manager"], locationId || undefined)
      : { uid: "public-inventory-dashboard", roles: [], isAdmin: true, locationIds: [] };
    let balancesQuery: FirebaseFirestore.Query = firestoreClient().collection("inventory_balances");
    let alertsQuery: FirebaseFirestore.Query = firestoreClient().collection("inventory_alerts").where("status", "in", ["OPEN", "ACKNOWLEDGED", "ESCALATED"]);
    if (locationId) { balancesQuery = balancesQuery.where("location_id", "==", locationId); alertsQuery = alertsQuery.where("location_id", "==", locationId); }
    const [balancesSnapshot, alertsSnapshot, transferSnapshot] = await Promise.all([balancesQuery.limit(2000).get(), alertsQuery.limit(200).get(), firestoreClient().collection("stock_transfer_orders").where("status", "in", ["REQUESTED", "APPROVED", "PICKED", "DISPATCHED", "IN_TRANSIT", "PARTIALLY_RECEIVED"]).limit(200).get()]);
    const allowed = (record: Record<string, unknown>) => actor.isAdmin || actor.locationIds.includes(String(record.location_id || record.source_location_id || "")) || actor.locationIds.includes(String(record.destination_location_id || ""));
    const balances = balancesSnapshot.docs.map(serialize).filter(allowed); const alerts = alertsSnapshot.docs.map(serialize).filter(allowed); const transfers = transferSnapshot.docs.map(serialize).filter(allowed);
    const stockValue = balances.reduce((sum, balance) => sum + Number(balance.current_stock || 0) * Number(balance.landed_cost_per_unit || balance.weighted_average_cost || 0), 0);
    return NextResponse.json({ generatedAt: new Date().toISOString(), metrics: { stockValue, itemBatches: balances.length, redItems: balances.filter((balance) => balance.alert_color === "RED").length, amberItems: balances.filter((balance) => balance.alert_color === "AMBER").length, openAlerts: alerts.length, inTransitTransfers: transfers.filter((transfer) => transfer.status === "IN_TRANSIT").length }, balances, alerts, transfers });
  } catch (error) { return apiError(error); }
}
