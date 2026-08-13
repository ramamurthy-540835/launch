"use client";
import { useCallback, useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebase-client";

type RecordValue = Record<string, unknown>;
type Dashboard = { generatedAt: string; metrics: { stockValue: number; estimatedMarketValue: number | null; estimatedProfit: number | null; pricedItems: number; unpricedItems: number; priceSource: string | null; itemBatches: number; redItems: number; amberItems: number; openAlerts: number; inTransitTransfers: number }; balances: RecordValue[]; alerts: RecordValue[]; transfers: RecordValue[] };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export default function InventoryDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null); const [error, setError] = useState(""); const [locationId, setLocationId] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const token = await firebaseAuth()?.currentUser?.getIdToken(); const headers = token ? { Authorization: `Bearer ${token}` } : undefined; const response = await fetch(`/api/inventory/dashboard${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`, { headers }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Inventory dashboard failed."); setDashboard(data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Inventory dashboard failed."); } finally { setLoading(false); } }, [locationId]);
  useEffect(() => { void load(); }, [load]);
  return <div className="inventory-dashboard">
    <section className="inventory-toolbar"><div><span className="kicker">SUPPLY CHAIN CONTROL</span><h1>Multi-location inventory</h1><p>Operational balances, transfer pipeline, alerts and audit-ready stock value.</p></div><form onSubmit={(event) => { event.preventDefault(); void load(); }}><label>Location ID<input value={locationId} onChange={(event) => setLocationId(event.target.value)} placeholder="All assigned locations" /></label><button className="checkout-button">Refresh</button></form></section>
    {error && <section className="ops-warning" role="alert"><b>Access or configuration required</b><p>{error}</p></section>}
    {loading && <p>Loading inventory controls…</p>}
    {dashboard && <>
      <section className="inventory-metrics">
        <article><small>Stock value</small><b>{money(dashboard.metrics.stockValue)}</b></article><article className={dashboard.metrics.estimatedProfit !== null && dashboard.metrics.estimatedProfit < 0 ? "red" : ""}><small>Estimated inventory margin</small><b>{dashboard.metrics.estimatedProfit === null ? "Awaiting prices" : money(dashboard.metrics.estimatedProfit)}</b><span>{dashboard.metrics.priceSource || "Configure Sangli APMC feed"}</span></article><article><small>Tracked batches</small><b>{dashboard.metrics.itemBatches}</b></article>
        <article className="amber"><small>Amber items</small><b>{dashboard.metrics.amberItems}</b></article><article className="red"><small>Red items</small><b>{dashboard.metrics.redItems}</b></article>
        <article><small>Open alerts</small><b>{dashboard.metrics.openAlerts}</b></article><article><small>In transit</small><b>{dashboard.metrics.inTransitTransfers}</b></article>
      </section>
      <section className="inventory-grid"><article className="ops-panel"><h2>Stock availability</h2><div className="inventory-table"><table><thead><tr><th>Location</th><th>Item</th><th>Batch</th><th>Available</th><th>Coverage</th><th>Status</th></tr></thead><tbody>{dashboard.balances.slice(0, 50).map((balance) => <tr key={String(balance.id)}><td>{String(balance.locationName || balance.locationId || "—")}</td><td>{String(balance.itemName || balance.itemId || "—")}</td><td>{String(balance.batchNumber || "—")}</td><td>{Number(balance.availableStock || 0).toLocaleString("en-IN")} {String(balance.unit || "")}</td><td>{Number(balance.stockAvailabilityPercent || 0).toFixed(1)}%</td><td><span className={`inventory-status ${String(balance.alertColor || "GREEN").toLowerCase()}`}>{String(balance.alertColor || "GREEN")}</span></td></tr>)}</tbody></table></div></article>
      <article className="ops-panel"><h2>Action queue</h2>{dashboard.alerts.length === 0 ? <p>No open alerts in scope.</p> : dashboard.alerts.slice(0, 20).map((alert) => <div className="inventory-alert" key={String(alert.id)}><span className={`inventory-status ${String(alert.severity).toLowerCase()}`}>{String(alert.severity)}</span><div><b>{String(alert.alertType)}</b><small>{String(alert.locationName || alert.locationId || "")} · {String(alert.itemName || alert.itemId || "")}</small><p>{typeof alert.recommendedAction === "object" ? JSON.stringify(alert.recommendedAction) : String(alert.recommendedAction || "Review stock")}</p></div></div>)}</article></section>
      <small>Generated {new Date(dashboard.generatedAt).toLocaleString("en-IN")}. Financial analytics are exported asynchronously to BigQuery.</small>
    </>}
  </div>;
}
