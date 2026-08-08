"use client";

import Link from "next/link";
import { FormEvent, useCallback, useMemo, useState } from "react";
import ParentAuth from "@/components/ParentAuth";
import { firebaseAuth } from "@/lib/firebase-client";
import { partnerRegistrationStatuses, partnerRegistrationTypes, type PartnerRegistration, type PartnerRegistrationType } from "@/lib/partner-registrations";
import { SCHOOL_CITIES } from "@/lib/school-locator/territories";

const statusLabel = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const typeLabel: Record<PartnerRegistrationType, string> = { school: "School", office: "Office", company: "Company", college: "College" };
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Not set"; }
function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

type Payload = { registrations?: PartnerRegistration[]; summary?: Record<string, number>; total?: number; error?: string };

export default function PartnerRegistrationDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [registrations, setRegistrations] = useState<PartnerRegistration[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<PartnerRegistration | null>(null);
  const [type, setType] = useState(""); const [status, setStatus] = useState("");
  const [city, setCity] = useState(""); const [zone, setZone] = useState(""); const [query, setQuery] = useState("");
  const zones = useMemo(() => SCHOOL_CITIES.find((item) => item.code === city)?.zones || [], [city]);

  const load = useCallback(async (filters: { type?: string; status?: string; city?: string; zone?: string; query?: string } = {}) => {
    setLoading(true); setMessage("");
    try {
      const token = await firebaseAuth()?.currentUser?.getIdToken(true);
      if (!token) throw new Error("Your administrator session has expired.");
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type); if (filters.status) params.set("status", filters.status);
      if (filters.city) params.set("city", filters.city); if (filters.zone) params.set("zone", filters.zone); if (filters.query) params.set("q", filters.query);
      const response = await fetch(`/api/admin/registrations?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || "Unable to load registrations.");
      setRegistrations(payload.registrations || []); setSummary(payload.summary || {});
      setSelected((current) => current ? (payload.registrations || []).find((item) => item.registrationId === current.registrationId && item.entityType === current.entityType) || null : null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load registrations."); }
    finally { setLoading(false); }
  }, []);

  const authenticationChanged = useCallback(async (phone: string | null) => {
    setRegistrations([]); setSelected(null); setMessage("");
    if (!phone) return setAuthorized(false);
    const claims = await firebaseAuth()?.currentUser?.getIdTokenResult(true);
    const roles = Array.isArray(claims?.claims.roles) ? claims.claims.roles : [];
    const isAdmin = claims?.claims.admin === true || roles.includes("admin");
    setAuthorized(isAdmin);
    if (isAdmin) await load(); else setMessage("This internal page requires administrator access.");
  }, [load]);

  function filter(event: FormEvent) { event.preventDefault(); void load({ type, status, city, zone, query }); }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSaving(true); setMessage("");
    try {
      const token = await firebaseAuth()?.currentUser?.getIdToken(true); if (!token) throw new Error("Your administrator session has expired.");
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/registrations", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({
        entityType: selected.entityType, registrationId: selected.registrationId, status: form.get("status"), assignedTo: form.get("assigned_to"), followUpDate: form.get("follow_up_date"), notes: form.get("notes"),
      }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update registration.");
      setMessage("Registration workflow updated."); await load({ type, status, city, zone, query });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update registration."); }
    finally { setSaving(false); }
  }

  function exportCsv() {
    const rows = [["Reference", "Type", "Name", "City", "Zone", "Status", "Contact", "Phone", "Expected lunch users", "Assigned to", "Follow-up"], ...registrations.map((item) => [item.registrationId, typeLabel[item.entityType], item.displayName, item.cityName, item.zoneName, statusLabel(item.status), item.contactName, item.contactPhone, item.expectedLunchUsers, item.assignedTo, item.followUpAt])];
    const blob = new Blob([rows.map((row) => row.map(csv).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `lunchbox-registrations-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <main className="partner-admin-page">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link><nav className="partner-admin-nav"><Link href="/admin">Kitchens</Link><Link className="active" href="/admin/registrations">Registrations</Link><Link href="/admin/franchise-applications">Franchise</Link></nav></header>
    <section className="partner-admin-shell">
      <div className="partner-admin-heading"><div><span className="kicker">PARTNER ACQUISITION</span><h1>Registration pipeline</h1></div><p>Review, qualify and activate School, Office, Company and College meal opportunities.</p></div>
      <section className="admin-auth-panel"><div><b>Secure internal access</b><span>Firebase administrator role required.</span></div><ParentAuth onChange={(phone) => void authenticationChanged(phone)} /></section>
      {authorized && <>
        <form className="partner-filters" onSubmit={filter}>
          <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{partnerRegistrationTypes.map((item) => <option key={item} value={item}>{typeLabel[item]}</option>)}</select></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{partnerRegistrationStatuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
          <label>City<select value={city} onChange={(event) => { setCity(event.target.value); setZone(""); }}><option value="">All cities</option>{SCHOOL_CITIES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label>Zone<select disabled={!city} value={zone} onChange={(event) => setZone(event.target.value)}><option value="">All zones</option>{zones.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label className="partner-query">Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, reference or phone" maxLength={100} /></label>
          <button className="checkout-button" disabled={loading}>{loading ? "Loading…" : "Apply filters"}</button><button type="button" className="partner-export" onClick={exportCsv} disabled={!registrations.length}>Export CSV</button>
        </form>
        <section className="partner-summary">{partnerRegistrationStatuses.slice(0, 6).map((item) => <article key={item}><span>{statusLabel(item)}</span><b>{summary[item] || 0}</b></article>)}</section>
        {message && <p className="partner-message" role="status">{message}</p>}
        <div key={selected ? `${selected.entityType}:${selected.registrationId}` : "empty"} className="partner-workspace">
          <section className="partner-list"><header><h2>Registrations</h2><span>{registrations.length} records</span></header>{!loading && !registrations.length && <div className="partner-empty">No registrations match these filters.</div>}{registrations.map((item) => <button type="button" className={selected?.registrationId === item.registrationId && selected.entityType === item.entityType ? "selected" : ""} key={`${item.entityType}:${item.registrationId}`} onClick={() => { setSelected(item); setMessage(""); }}><div><span className={`partner-type type-${item.entityType}`}>{typeLabel[item.entityType]}</span>{item.duplicateCount > 1 && <em>{item.duplicateCount} possible duplicates</em>}</div><b>{item.displayName}</b><small>{item.registrationId} · {item.cityName || "Unknown city"}</small><span className={`pipeline-status status-${item.status.toLowerCase().replaceAll("_", "-")}`}>{statusLabel(item.status)}</span></button>)}</section>
          <section className="partner-detail">{!selected ? <div className="partner-empty"><b>Select a registration</b><span>Review its opportunity and update the acquisition workflow.</span></div> : <><header><div><span className={`partner-type type-${selected.entityType}`}>{typeLabel[selected.entityType]}</span><h2>{selected.displayName}</h2><small>{selected.registrationId}</small></div><span className={`pipeline-status status-${selected.status.toLowerCase().replaceAll("_", "-")}`}>{statusLabel(selected.status)}</span></header><div className="partner-detail-grid"><span><small>Location</small><b>{selected.locality || selected.formattedAddress || "Not provided"}</b></span><span><small>Territory</small><b>{selected.zoneName || "Not resolved"} · {selected.cityName}</b></span><span><small>Contact</small><b>{selected.contactName || "Not provided"}</b><em>{selected.contactPhone || selected.contactEmail || ""}</em></span><span><small>Opportunity</small><b>{selected.expectedLunchUsers ?? "Unknown"} expected lunches</b><em>{selected.strength !== null ? `${selected.strength} total strength` : "Strength not provided"}</em></span><span><small>Submitted</small><b>{date(selected.createdAt)}</b></span><span><small>Follow-up</small><b>{date(selected.followUpAt)}</b></span></div><form className="partner-review-form" onSubmit={update}><label>Status<select name="status" defaultValue={selected.status}>{partnerRegistrationStatuses.map((item) => <option value={item} key={item}>{statusLabel(item)}</option>)}</select></label><label>Assigned owner<input name="assigned_to" defaultValue={selected.assignedTo || ""} maxLength={120} placeholder="Name or work email" /></label><label>Follow-up date<input name="follow_up_date" type="date" defaultValue={selected.followUpAt?.slice(0, 10) || ""} /></label><label className="review-notes">Internal notes<textarea name="notes" defaultValue={selected.notes || ""} maxLength={2000} /></label><button className="checkout-button" disabled={saving}>{saving ? "Saving…" : "Save workflow"}</button></form></>}</section>
        </div>
      </>}
      {!authorized && message && <p className="partner-message error" role="alert">{message}</p>}
    </section>
  </main>;
}
