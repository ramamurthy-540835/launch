import { NextResponse } from "next/server";
import { isParentAuthRequired, verifyInventoryAccess } from "@/lib/firebase-admin";
import { firestoreClient } from "@/lib/firestore";
import { apiError } from "@/lib/inventory/api";
import { serialize } from "@/lib/inventory/service";
import { dashboardMetrics, itemNameMap, latestMarketRates, normalizeAlert, normalizeBalance } from "@/lib/inventory/dashboard";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const locationId = url.searchParams.get("locationId");
    const actor = isParentAuthRequired()
      ? await verifyInventoryAccess(request, ["admin", "warehouse_manager", "branch_store_manager", "kitchen_manager", "logistics_manager", "procurement_manager", "finance_analyst", "planning_manager"], locationId || undefined)
      : { uid: "public-inventory-dashboard", roles: [], isAdmin: true, locationIds: [] };
    const balancesQuery: FirebaseFirestore.Query = firestoreClient().collection("inventory_balances");
    const alertsQuery: FirebaseFirestore.Query = firestoreClient().collection("inventory_alerts").where("status", "in", ["OPEN", "ACKNOWLEDGED", "ESCALATED"]);
    const [balancesSnapshot, alertsSnapshot, transferSnapshot, itemsSnapshot, priceSnapshot] = await Promise.all([
      balancesQuery.limit(2000).get(), alertsQuery.limit(200).get(),
      firestoreClient().collection("stock_transfer_orders").where("status", "in", ["REQUESTED", "APPROVED", "PICKED", "DISPATCHED", "IN_TRANSIT", "PARTIALLY_RECEIVED"]).limit(200).get(),
      firestoreClient().collection("inventory_items").limit(1000).get(),
      firestoreClient().collection("online_price_feed_log").limit(1000).get(),
    ]);
    const rawBalances = balancesSnapshot.docs.map(serialize); const rawAlerts = alertsSnapshot.docs.map(serialize); const transfers = transferSnapshot.docs.map(serialize);
    const recordLocation = (record: Record<string, unknown>) => String(record.locationId || record.location_id || record.sourceLocationId || record.source_location_id || record.destinationLocationId || record.destination_location_id || "");
    const allowed = (record: Record<string, unknown>) => actor.isAdmin || actor.locationIds.includes(recordLocation(record));
    const inLocation = (record: Record<string, unknown>) => !locationId || recordLocation(record) === locationId;
    const names = itemNameMap(itemsSnapshot.docs.map(serialize));
    const balances = rawBalances.filter(allowed).filter(inLocation).map((record) => normalizeBalance(record, names));
    const alerts = rawAlerts.filter(allowed).filter(inLocation).map((record) => normalizeAlert(record, names));
    const scopedTransfers = transfers.filter(allowed).filter((record) => !locationId || [record.sourceLocationId, record.source_location_id, record.destinationLocationId, record.destination_location_id].includes(locationId));
    return NextResponse.json({ generatedAt: new Date().toISOString(), metrics: dashboardMetrics(balances, alerts, scopedTransfers, latestMarketRates(priceSnapshot.docs.map(serialize))), balances, alerts, transfers: scopedTransfers });
  } catch (error) { return apiError(error); }
}
