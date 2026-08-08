"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { toSchoolRegistrationFields } from "@/lib/school-locator/registration-fields";
import { CITY_BY_CODE, SCHOOL_CITIES, type CityCode, type ZoneCode } from "@/lib/school-locator/territories";
import type { SchoolSearchResult } from "@/lib/school-locator/types";

type SearchPayload = {
  results?: SchoolSearchResult[];
  meta?: { cache_hit?: boolean; manual_available?: boolean };
  error?: string;
};

function mapsUrl(school: SchoolSearchResult) {
  const params = new URLSearchParams({ api: "1", query: school.formatted_address });
  if (school.provider_place_id) params.set("query_place_id", school.provider_place_id);
  return `https://www.google.com/maps/search/?${params}`;
}

function sourceLabel(school: SchoolSearchResult, cacheHit: boolean) {
  if (cacheHit) return "Cached";
  if (school.provider === "google") return "Google";
  if (school.provider === "manual") return "Manual";
  return "Directory";
}

export default function PrivateSchoolSearch() {
  const [cityCode, setCityCode] = useState<CityCode | "">("");
  const [zoneCode, setZoneCode] = useState<ZoneCode | "">("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolSearchResult[]>([]);
  const [selected, setSelected] = useState<SchoolSearchResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [cityWide, setCityWide] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);
  const [message, setMessage] = useState("Choose a city and zone to begin.");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");

  const city = useMemo(() => cityCode ? CITY_BY_CODE.get(cityCode) : null, [cityCode]);
  const zones = city?.zones || [];
  const selectedZone = zoneCode ? zones.find((zone) => zone.code === zoneCode) : null;
  const registrationFields = selected ? toSchoolRegistrationFields(selected) : null;

  useEffect(() => {
    const prefix = query.trim();
    if (!cityCode || !zoneCode) {
      setResults([]);
      setMessage("Choose a city and zone to begin.");
      return;
    }
    if (selected && prefix === selected.school_name) {
      setResults([]);
      setMessage("");
      return;
    }
    if (prefix.length < 3) {
      setResults([]);
      setActiveIndex(-1);
      setMessage("Type at least three characters of the school name.");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      try {
        const params = new URLSearchParams({ city: cityCode, zone: zoneCode, q: prefix, limit: "10" });
        if (cityWide) params.set("scope", "city");
        const response = await fetch(`/api/schools/search?${params}`, { signal: controller.signal });
        const data = await response.json() as SearchPayload;
        if (!response.ok) throw new Error(data.error || "School search is temporarily unavailable.");
        const matches = data.results || [];
        setResults(matches);
        setCacheHit(Boolean(data.meta?.cache_hit));
        setActiveIndex(matches.length ? 0 : -1);
        setMessage(matches.length ? "" : `No matching schools found in ${cityWide ? city?.name || "the selected city" : selectedZone?.name}.`);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setMessage("School search is temporarily unavailable. You can enter the school manually.");
        }
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [cityCode, zoneCode, query, cityWide, city, selectedZone, selected]);

  function resetSelection() {
    setSelected(null);
    setRegistrationMessage("");
    setManualOpen(false);
  }

  function chooseSchool(school: SchoolSearchResult) {
    setSelected(school);
    setQuery(school.school_name);
    setResults([]);
    setActiveIndex(-1);
    setMessage("");
    setManualOpen(false);
    setRegistrationMessage("");
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseSchool(results[activeIndex]);
    } else if (event.key === "Escape") {
      setResults([]);
      setActiveIndex(-1);
    }
  }

  async function addManualSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cityCode || !zoneCode) return;
    setManualSaving(true);
    setRegistrationMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/schools/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_name: form.get("school_name"),
          formatted_address: form.get("formatted_address"),
          locality: form.get("locality"),
          postal_code: form.get("postal_code"),
          city_code: cityCode,
          zone_code: zoneCode,
        }),
      });
      const data = await response.json() as { school?: SchoolSearchResult; error?: string };
      if (!response.ok || !data.school) throw new Error(data.error || "Unable to add this school.");
      chooseSchool(data.school);
    } catch (error) {
      setRegistrationMessage(error instanceof Error ? error.message : "Unable to add this school.");
    } finally {
      setManualSaving(false);
    }
  }

  async function registerSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setRegistering(true);
    setRegistrationMessage("");
    try {
      const response = await fetch("/api/school-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: selected.id }),
      });
      const data = await response.json() as { referenceId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to request school registration.");
      setRegistrationMessage(`Registration request received. Reference: ${data.referenceId}`);
    } catch (error) {
      setRegistrationMessage(error instanceof Error ? error.message : "Unable to request school registration.");
    } finally {
      setRegistering(false);
    }
  }

  return <main className="school-search-page">
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link>
      <nav className="registration-mini-nav" aria-label="Registration types"><Link className="active" href="/schools/register">School</Link><Link href="/register/office">Office</Link><Link href="/register/company">Company</Link></nav>
    </header>

    <section className="school-search-shell">
      <div className="school-search-heading">
        <span className="kicker">SCHOOL REGISTRATION</span>
        <h1>Find your school.</h1>
        <p>Select your territory, then type the first three letters of a private school name.</p>
      </div>

      <section className="school-location-card" aria-labelledby="school-location-heading">
        <div className="school-card-title"><span>01</span><div><h2 id="school-location-heading">School location</h2><p>Four cities · twenty LunchBox search territories</p></div></div>
        <div className="school-location-grid">
          <label>City *<select value={cityCode} onChange={(event) => {
            setCityCode(event.target.value as CityCode | ""); setZoneCode(""); setQuery(""); setCityWide(false); resetSelection();
          }}><option value="">Select city</option>{SCHOOL_CITIES.map((option) => <option value={option.code} key={option.code}>{option.name}</option>)}</select></label>
          <label>Zone *<select value={zoneCode} disabled={!cityCode} onChange={(event) => {
            setZoneCode(event.target.value as ZoneCode | ""); setQuery(""); setCityWide(false); resetSelection();
          }}><option value="">Select zone</option>{zones.map((zone) => <option value={zone.code} key={zone.code}>{zone.name}</option>)}</select></label>
        </div>

        <label className="school-combobox-label" htmlFor="school-search-input">School *</label>
        <div className="school-combobox">
          <input
            id="school-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={results.length > 0}
            aria-controls="school-search-list"
            aria-activedescendant={activeIndex >= 0 ? `school-option-${activeIndex}` : undefined}
            value={query}
            disabled={!cityCode || !zoneCode}
            minLength={3}
            maxLength={80}
            autoComplete="off"
            placeholder={cityCode && zoneCode ? "Type first 3 letters…" : "Select city and zone first"}
            onKeyDown={onSearchKeyDown}
            onChange={(event) => { setQuery(event.target.value); setCityWide(false); resetSelection(); }}
          />
          {loading && <span className="school-search-spinner" aria-hidden="true" />}
        </div>

        <div className="school-search-results" aria-live="polite">
          {loading && <p>Searching schools...</p>}
          {!loading && message && <p>{message}</p>}
          {!loading && results.length > 0 && <ul id="school-search-list" role="listbox" aria-label="Matching private schools">
            {results.map((school, index) => <li
              id={`school-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={school.id}
              onMouseDown={(event) => { event.preventDefault(); chooseSchool(school); }}
              onMouseEnter={() => setActiveIndex(index)}
            ><div><b>{school.school_name}</b><span>{school.formatted_address}</span><small>{school.locality} · {school.zone_name} · {school.city_name}</small></div><em>{sourceLabel(school, cacheHit)}</em></li>)}
          </ul>}
        </div>

        {!loading && cityCode && zoneCode && query.trim().length >= 3 && results.length === 0 && !selected && <div className="school-fallback-actions">
          {!cityWide && <button type="button" onClick={() => setCityWide(true)}>Search all {city?.name}</button>}
          <button type="button" onClick={() => setManualOpen((open) => !open)}>School not found? Add manually</button>
        </div>}

        {manualOpen && city && selectedZone && <form className="manual-school-form" onSubmit={addManualSchool}>
          <div className="manual-heading"><h3>Add school manually</h3><p>Manual entries are marked unverified until reviewed.</p></div>
          <div className="manual-grid">
            <label>School name *<input name="school_name" required minLength={3} maxLength={160} /></label>
            <label>Locality *<input name="locality" required minLength={2} maxLength={100} /></label>
            <label className="manual-address">Full address *<textarea name="formatted_address" required minLength={5} maxLength={300} /></label>
            <label>City<input readOnly value={city.name} /></label>
            <label>Zone<input readOnly value={selectedZone.name} /></label>
            <label>Pincode *<input name="postal_code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} /></label>
          </div>
          <button className="checkout-button" disabled={manualSaving}>{manualSaving ? "Saving…" : "Use this school"}</button>
        </form>}
      </section>

      {selected && registrationFields && <form className="selected-school-panel" onSubmit={registerSchool}>
        <div className="selected-school-heading"><div><span className="kicker">02 · SELECTED SCHOOL</span><h2>{selected.school_name}</h2></div><span className="school-source-badge">{sourceLabel(selected, cacheHit)}</span></div>
        {selected.outside_selected_zone && <p className="school-zone-warning">{selected.zone_code !== zoneCode
          ? `Located in another zone: ${selected.zone_name}`
          : `Location could not be confirmed within the configured ${selectedZone?.name} localities.`}</p>}
        <div className="selected-school-fields">
          <label>School name<input name="school_name" readOnly value={registrationFields.school_name} /></label>
          <label>Locality<input name="school_locality" readOnly value={registrationFields.school_locality} /></label>
          <label className="selected-address">Address<textarea name="school_address" readOnly value={registrationFields.school_address} /></label>
          <label>Zone<input name="school_zone" readOnly value={registrationFields.school_zone} /></label>
          <label>City<input name="school_city" readOnly value={registrationFields.school_city} /></label>
          <label>State<input name="school_state" readOnly value={registrationFields.school_state} /></label>
          <label>Pincode<input name="school_pincode" readOnly value={registrationFields.school_pincode} /></label>
          <input type="hidden" name="selected_school_id" value={registrationFields.selected_school_id} />
          <input type="hidden" name="school_latitude" value={registrationFields.school_latitude ?? ""} />
          <input type="hidden" name="school_longitude" value={registrationFields.school_longitude ?? ""} />
          <input type="hidden" name="provider_place_id" value={registrationFields.provider_place_id} />
        </div>
        <div className="selected-school-actions">
          <button className="checkout-button" disabled={registering}>{registering ? "Submitting…" : "Request school registration"}</button>
          <a href={mapsUrl(selected)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
          <button type="button" className="change-school-button" onClick={() => { setSelected(null); setQuery(""); }}>Change school</button>
        </div>
        {registrationMessage && <p className="school-registration-message" role="status">{registrationMessage}</p>}
      </form>}
    </section>
  </main>;
}
