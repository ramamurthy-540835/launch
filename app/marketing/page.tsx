"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MarketingMap from "@/components/MarketingMap";
import {
  audienceTypes,
  marketingCities,
  marketingGeography,
  type AudienceType,
  type MarketingCity,
  type MarketingLead,
} from "@/lib/marketing";
import styles from "./marketing.module.css";
import nearbyStyles from "./nearby.module.css";

type LeadStage = "New" | "Contacted" | "Interested" | "Meeting";
type SavedLead = MarketingLead & { stage: LeadStage; notes: string; savedAt: string };

const stages: LeadStage[] = ["New", "Contacted", "Interested", "Meeting"];
const storageKey = "lunchbox-marketing-leads-v1";

export default function MarketingPage() {
  const [city, setCity] = useState<MarketingCity>("Chennai");
  const [zone, setZone] = useState("South Chennai");
  const [area, setArea] = useState("Adyar");
  const [audience, setAudience] = useState<AudienceType>("schools");
  const [keyword, setKeyword] = useState("");
  const [campaignName, setCampaignName] = useState("Chennai school lunch pilot");
  const [results, setResults] = useState<MarketingLead[]>([]);
  const [saved, setSaved] = useState<SavedLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"discover" | "pipeline" | "outreach">("discover");
  const [selectedSchool, setSelectedSchool] = useState<MarketingLead | null>(null);
  const [communities, setCommunities] = useState<MarketingLead[]>([]);
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  useEffect(() => {
    try {
      const current = window.localStorage.getItem(storageKey);
      if (current) setSaved(JSON.parse(current));
    } catch { /* A malformed local cache should not block the workspace. */ }
  }, []);

  function persist(next: SavedLead[]) {
    setSaved(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function discover() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ city, zone, area, audience, keyword });
      const response = await fetch(`/api/marketing/search?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setResults(data.leads);
      setQuery(data.query);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not search right now.");
    } finally {
      setLoading(false);
    }
  }

  function saveLead(lead: MarketingLead) {
    if (saved.some((item) => item.id === lead.id)) return;
    persist([...saved, { ...lead, stage: "New", notes: "", savedAt: new Date().toISOString() }]);
    void fetch("/api/marketing/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead, schoolPlaceId: selectedSchool?.placeId || selectedSchool?.id }),
    });
  }

  async function findNearby(school = selectedSchool) {
    if (!school) return;
    setSelectedSchool(school);
    setNearbyLoading(true);
    setError("");
    try {
      const response = await fetch("/api/marketing/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school, radiusKm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nearby search failed");
      setCommunities(data.communities || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not find nearby communities.");
    } finally { setNearbyLoading(false); }
  }

  function updateLead(id: string, patch: Partial<SavedLead>) {
    persist(saved.map((lead) => lead.id === id ? { ...lead, ...patch } : lead));
  }

  function removeLead(id: string) {
    persist(saved.filter((lead) => lead.id !== id));
  }

  const activeCityLeads = useMemo(() => saved.filter((lead) => lead.city === city), [saved, city]);
  const zones = Object.keys(marketingGeography[city]);
  const areas = (marketingGeography[city] as Record<string, readonly string[]>)[zone] || [];
  function changeCity(nextCity: MarketingCity) {
    const nextZones = Object.keys(marketingGeography[nextCity]);
    const nextZone = nextZones[0];
    const nextAreas = (marketingGeography[nextCity] as Record<string, readonly string[]>)[nextZone];
    setCity(nextCity); setZone(nextZone); setArea(nextAreas[0]); setResults([]); setSelectedSchool(null); setCommunities([]);
  }
  function changeZone(nextZone: string) {
    const nextAreas = (marketingGeography[city] as Record<string, readonly string[]>)[nextZone] || [];
    setZone(nextZone); setArea(nextAreas[0] || ""); setResults([]); setSelectedSchool(null); setCommunities([]);
  }
  const contacted = saved.filter((lead) => lead.stage !== "New").length;
  const interested = saved.filter((lead) => lead.stage === "Interested" || lead.stage === "Meeting").length;
  const outreach = buildOutreach(campaignName, city, audience);

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/"><span>L</span>LunchBox</Link>
      <p className={styles.workspace}>MARKETING OS</p>
      <nav>
        <button className={tab === "discover" ? styles.active : ""} onClick={() => setTab("discover")}><i>⌕</i>Discover</button>
        <button className={tab === "pipeline" ? styles.active : ""} onClick={() => setTab("pipeline")}><i>◎</i>Lead pipeline <b>{saved.length}</b></button>
        <button className={tab === "outreach" ? styles.active : ""} onClick={() => setTab("outreach")}><i>↗</i>Outreach kit</button>
      </nav>
      <div className={styles.sideNote}><strong>Private by design</strong><p>The Places web-service key stays on the server. Saved leads remain in this browser.</p></div>
    </aside>

    <section className={styles.content}>
      <header className={styles.topbar}>
        <div><span>CAMPAIGN WORKSPACE</span><h1>{campaignName}</h1></div>
        <Link href="/">View LunchBox site ↗</Link>
      </header>

      <div className={styles.metrics}>
        <Metric label="Saved leads" value={saved.length} note="Across four cities" />
        <Metric label="Contacted" value={contacted} note={saved.length ? `${Math.round(contacted / saved.length * 100)}% of pipeline` : "Start with discovery"} />
        <Metric label="Interested" value={interested} note="Qualified opportunities" />
        <Metric label="Active city" value={activeCityLeads.length} note={`${city} leads`} />
      </div>

      {tab === "discover" && <>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>LIVE LOCAL DISCOVERY</span><h2>Find your next community partner.</h2></div><p>Searches Google Places by city, zone and area, then shows schools and nearby communities on Google Maps.</p></div>
          <div className={styles.builder}>
            <label><span>Campaign name</span><input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={60} /></label>
            <label><span>City</span><select value={city} onChange={(event) => changeCity(event.target.value as MarketingCity)}>{marketingCities.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Zone</span><select value={zone} onChange={(event) => changeZone(event.target.value)}>{zones.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Area</span><select value={area} onChange={(event) => setArea(event.target.value)}>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Audience</span><select value={audience} onChange={(event) => setAudience(event.target.value as AudienceType)}>{Object.entries(audienceTypes).map(([id, item]) => <option value={id} key={id}>{item.label}</option>)}</select></label>
            <label><span>Optional search phrase</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={audienceTypes[audience].searchTerm} maxLength={80} /></label>
            <button onClick={discover} disabled={loading}>{loading ? "Searching…" : "Discover leads"}<b>→</b></button>
          </div>
          <div className={styles.intent}><b>{audienceTypes[audience].label}:</b> {audienceTypes[audience].intent}</div>
        </section>

        {error && <div className={styles.error}><b>Search unavailable</b><span>{error}</span></div>}
        {(results.length > 0 || query) && <section className={styles.results}>
          <div className={styles.resultHead}><div><span>SEARCH RESULTS</span><h2>{results.length} opportunities found</h2><p>{query}</p></div><button onClick={() => results.forEach(saveLead)}>Save all results</button></div>
          <div className={styles.leadGrid}>{results.map((lead) => {
            const isSaved = saved.some((item) => item.id === lead.id);
            return <article className={styles.leadCard} key={lead.id}>
              <div className={styles.leadTop}><span>{lead.position}</span><div><small>{lead.type}</small><h3>{lead.name}</h3></div></div>
              <p className={styles.address}>{lead.address}</p>
              <div className={styles.proof}>{lead.rating && <span>★ {lead.rating} {lead.reviews ? `(${lead.reviews})` : ""}</span>}{lead.phone && <span>{lead.phone}</span>}</div>
              <div className={styles.cardActions}>{lead.website && <a href={lead.website} target="_blank" rel="noreferrer">Website ↗</a>}<button disabled={isSaved} onClick={() => saveLead(lead)}>{isSaved ? "Saved ✓" : "+ Save lead"}</button></div>
              {lead.audience === "schools" && lead.latitude != null && lead.longitude != null && <button className={nearbyStyles.schoolSelect} onClick={() => void findNearby(lead)}>Use this school</button>}
            </article>;
          })}</div>
        </section>}
        {selectedSchool && <section className={nearbyStyles.nearbyPanel}>
          <div className={nearbyStyles.nearbyHead}><div><span>SCHOOL-CENTRED DISCOVERY</span><h2>{selectedSchool.name}</h2><p>{selectedSchool.address}</p></div><div><label>Search radius<select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}><option value={2}>2 km</option><option value={5}>5 km</option><option value={8}>8 km</option><option value={10}>10 km</option></select></label><button disabled={nearbyLoading} onClick={() => void findNearby()}>{nearbyLoading ? "Searching…" : "Find communities"}</button></div></div>
          <MarketingMap school={selectedSchool} communities={communities} />
          <div className={nearbyStyles.communityList}>{communities.map((lead, index) => <article key={lead.id}><b>{index + 1}</b><div><h3>{lead.name}</h3><p>{lead.address}</p><small>{lead.distanceKm} km from school {lead.rating ? ` · ★ ${lead.rating}` : ""}</small></div><button disabled={saved.some((item) => item.id === lead.id)} onClick={() => saveLead(lead)}>{saved.some((item) => item.id === lead.id) ? "Saved" : "Save"}</button></article>)}</div>
          {!nearbyLoading && !communities.length && <p className={nearbyStyles.nearbyEmpty}>Choose a radius and search for nearby apartment communities.</p>}
        </section>}
        {!results.length && !query && !error && <section className={styles.empty}><span>⌕</span><h2>Start with a city and audience.</h2><p>Find schools, apartment communities, and parent hubs, then save the best opportunities to your pipeline.</p></section>}
      </>}

      {tab === "pipeline" && <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>PARTNER PIPELINE</span><h2>Turn discovery into conversations.</h2></div><p>Update each stage after calls, WhatsApp outreach, tastings, or meetings.</p></div>
        {saved.length ? <div className={styles.pipeline}>{saved.map((lead) => <article key={lead.id}>
          <div><small>{lead.city} · {audienceTypes[lead.audience].label}</small><h3>{lead.name}</h3><p>{lead.address}</p></div>
          <select value={lead.stage} onChange={(event) => updateLead(lead.id, { stage: event.target.value as LeadStage })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
          <input value={lead.notes} onChange={(event) => updateLead(lead.id, { notes: event.target.value })} placeholder="Next step or contact notes" />
          <div className={styles.rowActions}>{lead.phone && <a href={`tel:${lead.phone}`}>Call</a>}{lead.website && <a href={lead.website} target="_blank" rel="noreferrer">Website</a>}<button onClick={() => removeLead(lead.id)}>Remove</button></div>
        </article>)}</div> : <div className={styles.empty}><span>◎</span><h2>No saved leads yet.</h2><p>Use Discover to build your first local partner list.</p><button onClick={() => setTab("discover")}>Discover opportunities</button></div>}
      </section>}

      {tab === "outreach" && <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>OUTREACH KIT</span><h2>Start a relevant conversation.</h2></div><p>Adapt these drafts before sending. Confirm consent and use real, verifiable LunchBox claims.</p></div>
        <div className={styles.outreachGrid}>
          <CopyCard title="WhatsApp introduction" text={outreach.whatsapp} />
          <CopyCard title="Email subject" text={outreach.subject} compact />
          <CopyCard title="Email body" text={outreach.email} />
          <CopyCard title="Call opener" text={outreach.call} />
        </div>
      </section>}
    </section>
  </main>;
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function CopyCard({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return <article className={`${styles.copyCard} ${compact ? styles.compact : ""}`}><div><h3>{title}</h3><button onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button></div><p>{text}</p></article>;
}

function buildOutreach(name: string, city: MarketingCity, audience: AudienceType) {
  const group = audienceTypes[audience].label.toLowerCase();
  return {
    whatsapp: `Hello, I’m reaching out from LunchBox. We’re planning ${name}, a vegetarian school-lunch pilot for families in ${city}. We would like to explore a short introduction or tasting with your ${group}. Who would be the right person to speak with?`,
    subject: `LunchBox pilot opportunity for families in ${city}`,
    email: `Hello,\n\nLunchBox is preparing a vegetarian school-lunch pilot for students in grades 6–12 in ${city}. We are speaking with selected ${group} to understand parent interest and arrange a limited tasting.\n\nCould we schedule a brief call to discuss whether this may be relevant to your community?\n\nRegards,\nLunchBox team`,
    call: `Hello, I’m calling from LunchBox about a small school-lunch pilot in ${city}. We are looking for a few ${group} to understand parent demand. May I speak with the person who coordinates community partnerships?`,
  };
}
