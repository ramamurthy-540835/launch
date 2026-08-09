"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Google Maps SDK is loaded dynamically. */

import { useEffect, useRef, useState } from "react";
import FranchiseRegistration from "@/components/FranchiseRegistration";
import type { FranchiseOpportunityLocation, FranchiseOpportunityZone } from "@/lib/franchise-opportunities";

type Props = { open: boolean; onClose: () => void };
declare global { interface Window { google?: any; } }

export default function FranchiseOpportunityDrawer({ open, onClose }: Props) {
  const [zones, setZones] = useState<FranchiseOpportunityZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState("");
  const [selected, setSelected] = useState<FranchiseOpportunityLocation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mapNode = useRef<HTMLDivElement>(null);
  const registerOpenRef = useRef(false);

  useEffect(() => { registerOpenRef.current = registerOpen; }, [registerOpen]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && (registerOpenRef.current ? setRegisterOpen(false) : onClose());
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    setLoading(true); setError("");
    fetch("/api/franchise-opportunities").then(async (response) => {
      if (!response.ok) throw new Error("We couldn't load Chennai opportunities.");
      return response.json();
    }).then((data) => {
      const nextZones = data.zones || [];
      setZones(nextZones);
      setActiveZoneId((current) => current || nextZones[0]?.id || "");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "We couldn't load Chennai opportunities."))
      .finally(() => setLoading(false));
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; previous?.focus(); };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !mapNode.current || !zones.length) return;
    let cancelled = false;
    const locations = zones.flatMap((zone) => zone.locations).filter((location) => location.lat !== null && location.lng !== null);
    if (!locations.length) return;
    const loadGoogleMaps = async () => {
      const { key } = await (await fetch("/api/maps/config")).json();
      if (!key) throw new Error("Google Maps is not configured.");
      if (!window.google) await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector("script[data-lunchbox-google-maps]") as HTMLScriptElement | null;
        if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")), { once: true }); return; }
        const script = document.createElement("script"); script.dataset.lunchboxGoogleMaps = "true"; script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("Google Maps failed to load.")); document.head.append(script);
      });
      if (cancelled || !mapNode.current) return;
      const map = new window.google.maps.Map(mapNode.current, { center: { lat: 13.0827, lng: 80.2707 }, zoom: 10, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      const info = new window.google.maps.InfoWindow();
      const bounds = new window.google.maps.LatLngBounds();
      locations.forEach((location) => {
        const position = { lat: location.lat as number, lng: location.lng as number }; bounds.extend(position);
        const marker = new window.google.maps.Marker({ map, position, title: `${location.name} — ${location.status === "completed" ? "Completed" : "Franchise opportunity"}`, icon: location.status === "completed" ? "https://maps.google.com/mapfiles/ms/icons/grey-dot.png" : "https://maps.google.com/mapfiles/ms/icons/green-dot.png" });
        const showInfo = () => { const card = document.createElement("div"); const title = document.createElement("strong"); title.textContent = location.name; const status = document.createElement("p"); status.textContent = location.status === "completed" ? "Location completed" : location.status === "coming_soon" ? "Opening soon" : "Franchise opportunity available"; card.append(title, status); info.setContent(card); info.open({ map, anchor: marker }); };
        marker.addListener("mouseover", showInfo); marker.addListener("click", () => { showInfo(); setActiveZoneId(location.zoneId); setSelected(location); });
      });
      if (locations.length > 1) map.fitBounds(bounds, 60); else { map.setCenter(bounds.getCenter()); map.setZoom(13); }
    };
    loadGoogleMaps().catch((reason) => !cancelled && setError(reason instanceof Error ? reason.message : "Unable to load Google Maps."));
    return () => { cancelled = true; };
  }, [open, zones]);

  if (!open) return null;
  const activeZone = zones.find((zone) => zone.id === activeZoneId) || zones[0];
  const available = activeZone?.locations.filter((location) => location.status === "available").length || 0;
  return <div className="opportunity-overlay" role="dialog" aria-modal="true" aria-labelledby="opportunity-title" onMouseDown={onClose}>
    <aside className="opportunity-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <header className="opportunity-header">
        <div><span className="kicker">CHENNAI NETWORK</span><h2 id="opportunity-title">Choose your franchise location</h2><p>Compare Chennai zones, then reserve your opportunity for review.</p></div>
        <button ref={closeButton} className="opportunity-close" onClick={onClose} aria-label="Close franchise opportunities">×</button>
      </header>
      {loading && <div className="opportunity-loading" aria-live="polite">Loading Chennai locations…</div>}
      {error && <p className="opportunity-error" role="alert">{error}</p>}
      {!loading && !error && !zones.length && <div className="opportunity-empty"><b>No locations are published yet.</b><p>Our operations team can add public Chennai zones in Firestore. You can still submit a general franchise application below.</p><button onClick={() => setRegisterOpen(true)}>Register your interest</button></div>}
      {!!zones.length && <>
        <div className="zone-tabs" role="tablist" aria-label="Chennai zones">{zones.map((zone) => <button key={zone.id} role="tab" aria-selected={zone.id === activeZone?.id} className={zone.id === activeZone?.id ? "active" : ""} onClick={() => { setActiveZoneId(zone.id); setSelected(null); }}><i aria-hidden="true">{zone.icon}</i><span>{zone.name}</span><small>{zone.locations.length} locations</small></button>)}</div>
        <div className="opportunity-map-shell"><div className="opportunity-map" ref={mapNode} /><div className="opportunity-map-key"><span><i className="open" />Opportunity open</span><span><i className="complete" />Location completed</span><small>Hover a marker to inspect it. Click to select.</small></div></div>
        <div className="opportunity-content">
          <section className="location-list"><div className="location-list-head"><div><span className="kicker">{activeZone?.name}</span><h3>{available} opportunities open</h3></div><span>Pick a location</span></div>
            <div className="location-options">{activeZone?.locations.map((location) => <button key={location.id} className={`location-option ${location.status} ${selected?.id === location.id ? "selected" : ""}`} onClick={() => setSelected(location)} title={location.status === "completed" ? `${location.name} is completed` : `${location.name} franchise opportunity`}><span className="location-status" aria-hidden="true">{location.status === "completed" ? "✓" : location.status === "coming_soon" ? "…" : "→"}</span><span><b>{location.name}</b><small>{location.status === "completed" ? "Location completed" : location.status === "coming_soon" ? "Opening soon" : "Franchise opportunity"}</small></span><em>{location.franchiseCount ? `${location.franchiseCount} partner${location.franchiseCount === 1 ? "" : "s"}` : "View"}</em></button>)}</div>
          </section>
          <aside className="opportunity-summary">{selected ? <><span className="kicker">LOCATION SUMMARY</span><h3>{selected.name}</h3><p>{selected.zoneName} · Chennai</p><dl><div><dt>Availability</dt><dd className={selected.status}>{selected.status === "completed" ? "Completed" : selected.status === "coming_soon" ? "Coming soon" : "Available"}</dd></div><div><dt>Active delivery autos</dt><dd>{selected.activeDriverCount}</dd></div><div><dt>Franchise distribution</dt><dd>{selected.franchiseCount} active partner{selected.franchiseCount === 1 ? "" : "s"}</dd></div></dl>{selected.status === "available" ? <button className="opportunity-primary" onClick={() => setRegisterOpen(true)}>Register for {selected.name} <span>→</span></button> : <p className="completed-note">This location is shown in grey because the franchise opportunity is completed. Choose another open Chennai location.</p>}</> : <><span className="kicker">HOW IT WORKS</span><h3>Plan your Chennai territory</h3><p>Like selecting a flight: start with a zone, compare locations, then submit one application for verification.</p><ol><li>Choose a Chennai zone</li><li>Inspect location availability</li><li>Register your interest</li></ol></>}</aside>
        </div>
      </>}
      {registerOpen && <div className="registration-overlay" role="dialog" aria-modal="true" aria-labelledby="registration-title" onMouseDown={() => setRegisterOpen(false)}><aside className="registration-drawer" onMouseDown={(event) => event.stopPropagation()}><button className="opportunity-close" onClick={() => setRegisterOpen(false)} aria-label="Close registration form">×</button><FranchiseRegistration initialArea={selected?.name || ""} opportunityId={selected?.id || ""} /></aside></div>}
    </aside>
  </div>;
}
