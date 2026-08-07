"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Suggestion = {
  id: string; name: string; address: string; district: string; latitude: number | null; longitude: number | null;
  placeId: string | null; rating: number | null; reviewCount: number | null;
};

const cityOptions = [
  ["", "All Tamil Nadu"], ["chennai", "Chennai"], ["madurai", "Madurai"], ["trichy", "Trichy"], ["coimbatore", "Coimbatore"],
];

function mapsUrl(school: Suggestion) {
  const params = new URLSearchParams({ api: "1", query: school.address });
  if (school.placeId) params.set("query_place_id", school.placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

export default function PrivateSchoolSearch() {
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Type the first three letters of a private school name.");

  useEffect(() => {
    const prefix = query.trim();
    if (prefix.length < 3) {
      setSuggestions([]);
      setSelected(null);
      setMessage("Type the first three letters of a private school name.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      try {
        const params = new URLSearchParams({ q: prefix });
        if (city) params.set("city", city);
        const response = await fetch(`/api/locations/autocomplete?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to search schools.");
        setSuggestions(data.suggestions);
        setMessage(data.suggestions.length ? "" : `No private schools begin with “${prefix}”.`);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage(error instanceof Error ? error.message : "Unable to search schools.");
      } finally { setLoading(false); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [city, query]);

  return <main className="school-search-page">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link><span className="school-directory-pill">Tamil Nadu private schools</span></header>
    <section className="school-search-shell">
      <div className="school-search-heading"><span className="kicker">SCHOOL REGISTRATION</span><h1>Find your school.</h1><p>Search the verified discovery directory by entering the beginning of the school name.</p></div>
      <div className="school-search-controls">
        <label>Location<select value={city} onChange={(event) => { setCity(event.target.value); setSelected(null); }}>{cityOptions.map(([value, label]) => <option value={value} key={label}>{label}</option>)}</select></label>
        <label>Private school name<input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} minLength={3} maxLength={80} placeholder="e.g. PSB, Vel, DAV" autoComplete="off" /></label>
      </div>
      <div className="school-search-results" aria-live="polite">
        {loading && <p>Searching the Tamil Nadu directory…</p>}
        {!loading && message && <p>{message}</p>}
        {!loading && suggestions.length > 0 && <div role="listbox" aria-label="Matching private schools">{suggestions.map((school) => <button type="button" role="option" aria-selected={selected?.id === school.id} key={school.id} onClick={() => setSelected(school)}><span><b>{school.name}</b><small>{school.address}</small></span><span>{school.district}</span></button>)}</div>}
      </div>
      {selected && <article className="selected-school-card"><div><span className="kicker">SELECTED PRIVATE SCHOOL</span><h2>{selected.name}</h2><p>{selected.address}</p>{selected.rating !== null && <small>Google rating {selected.rating} · {selected.reviewCount || 0} reviews</small>}</div><a className="checkout-button" href={mapsUrl(selected)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a></article>}
    </section>
  </main>;
}
