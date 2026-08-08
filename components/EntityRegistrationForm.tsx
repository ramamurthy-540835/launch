"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import EntitySearchAutocomplete from "@/components/EntitySearchAutocomplete";
import type { EntityType, LocationEntityResult } from "@/lib/entity-locator/types";

const COPY = {
  office: { label: "Office", kicker: "OFFICE REGISTRATION", heading: "Find your workplace.", description: "Locate a physical office, branch, business park or professional workspace.", action: "Request office registration" },
  company: { label: "Company", kicker: "COMPANY REGISTRATION", heading: "Find your company.", description: "Locate a business organization and its primary city office for corporate lunch onboarding.", action: "Request company registration" },
  college: { label: "College", kicker: "COLLEGE REGISTRATION", heading: "Find your college.", description: "Locate a college or higher-education campus for student and staff lunch onboarding.", action: "Request college registration" },
} as const;

function mapsUrl(entity: LocationEntityResult) {
  const params = new URLSearchParams({ api: "1", query: entity.formatted_address });
  if (entity.provider_place_id) params.set("query_place_id", entity.provider_place_id);
  return `https://www.google.com/maps/search/?${params}`;
}

export default function EntityRegistrationForm({ entityType, onBusinessTypeChange }: { entityType: EntityType; onBusinessTypeChange?: (type: "office" | "company") => void }) {
  const copy = COPY[entityType];
  const [selected, setSelected] = useState<LocationEntityResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setSubmitting(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const body = Object.fromEntries(form.entries()); body[`${entityType}_id`] = selected.id;
      const response = await fetch(`/api/${entityType}-registration`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { referenceId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || `Unable to register this ${entityType}.`);
      setMessage(`Registration request received. Reference: ${data.referenceId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : `Unable to register this ${entityType}.`); }
    finally { setSubmitting(false); }
  }

  return <main className="school-search-page">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link><nav className="registration-mini-nav" aria-label="Registration types"><Link href="/schools/register">School</Link><Link className={entityType === "office" || entityType === "company" ? "active" : ""} href="/register/office-company">Office / Company</Link><Link className={entityType === "college" ? "active" : ""} href="/register/college">College</Link></nav></header>
    <section className="school-search-shell">
      <div className="school-search-heading"><span className="kicker">{copy.kicker}</span><h1>{copy.heading}</h1><p>{copy.description}</p>{onBusinessTypeChange && <div className="business-type-switch" role="group" aria-label="Choose Office or Company"><button className={entityType === "office" ? "active" : ""} type="button" onClick={() => onBusinessTypeChange("office")}>Office location</button><button className={entityType === "company" ? "active" : ""} type="button" onClick={() => onBusinessTypeChange("company")}>Company organization</button></div>}</div>
      <EntitySearchAutocomplete entityType={entityType} value={selected} onChange={(entity) => { setSelected(entity); setMessage(""); }} />
      {selected && <form className="selected-school-panel entity-registration-panel" onSubmit={submit}>
        <div className="selected-school-heading"><div><span className="kicker">02 · SELECTED {copy.label.toUpperCase()}</span><h2>{selected.display_name}</h2></div><span className="school-source-badge">{selected.provider === "google" ? "Google" : selected.provider === "manual" ? "Manual" : "Directory"}</span></div>
        {selected.outside_selected_zone && <p className="school-zone-warning">Located in another zone: {selected.zone_name}</p>}
        <div className="selected-school-fields">
          <label>{copy.label} name<input readOnly value={selected.display_name} /></label><label>Locality<input readOnly value={selected.locality} /></label>
          <label className="selected-address">Address<textarea readOnly value={selected.formatted_address} /></label><label>Zone<input readOnly value={selected.zone_name} /></label><label>City<input readOnly value={selected.city_name} /></label><label>State<input readOnly value={selected.state} /></label><label>Pincode<input readOnly value={selected.postal_code || ""} /></label>
        </div>
        <div className="entity-form-section"><h3>Contact</h3><div className="selected-school-fields"><label>Contact name<input name="contact_name" maxLength={120} /></label><label>Designation<input name="contact_designation" maxLength={120} /></label><label>Phone<input name="contact_phone" inputMode="tel" pattern="(?:\+91)?[6-9][0-9]{9}" /></label><label>Email<input name="contact_email" type="email" maxLength={160} /></label></div></div>
        <div className="entity-form-section"><h3>{entityType === "office" ? "Workforce & meal details" : entityType === "company" ? "Business & lunch opportunity" : "Campus & lunch opportunity"}</h3><div className="selected-school-fields"><label>{entityType === "college" ? "Student strength" : "Employee strength"}<input name={entityType === "college" ? "student_strength" : "employee_strength"} type="number" min="1" step="1" /></label><label>Expected lunch users<input name="expected_lunch_users" type="number" min="0" step="1" /></label><label>Existing food vendor<input name="existing_food_vendor" maxLength={160} /></label><label>Preferred lunch time<input name="preferred_meal_time" type="time" /></label><label>Meal price range<input name="meal_price_range" maxLength={80} placeholder="e.g. ₹80–₹120" /></label><label>Meal interest<select name="meal_interest" defaultValue=""><option value="">Select</option><option value="daily_lunch">Daily lunch</option><option value="subscription">Subscription</option><option value="events">Events / bulk meals</option><option value="exploring">Exploring</option></select></label>{entityType === "company" && <><label>Industry<input name="industry" maxLength={120} /></label><label>Company type<select name="company_type" defaultValue=""><option value="">Select</option><option>Private Limited</option><option>Limited Company</option><option>LLP</option><option>Partnership</option><option>Startup / SME</option></select></label></>}{entityType === "college" && <><label>College type<select name="college_type" defaultValue=""><option value="">Select</option><option>Arts and Science</option><option>Engineering</option><option>Medical</option><option>Polytechnic</option><option>Management</option><option>Other</option></select></label><label>Hostel available?<select name="student_hostel_available" defaultValue=""><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label></>}</div></div>
        <div className="selected-school-actions"><button className="checkout-button" disabled={submitting}>{submitting ? "Submitting…" : copy.action}</button><a href={mapsUrl(selected)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a><button type="button" className="change-school-button" onClick={() => setSelected(null)}>Change {entityType}</button></div>
        {message && <p className="school-registration-message" role="status">{message}</p>}
      </form>}
    </section>
  </main>;
}
