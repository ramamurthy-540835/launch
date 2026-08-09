"use client";

import { useState } from "react";
import FranchiseOpportunityDrawer from "@/components/franchises/FranchiseOpportunityDrawer";

export default function FranchiseNetworkExplorer() {
  const [open, setOpen] = useState(false);
  return <section className="network-explorer" aria-labelledby="network-explorer-title">
    <div><span className="kicker">CHENNAI OPPORTUNITIES</span><h3 id="network-explorer-title">Find your LunchBox territory.</h3><p>Explore zones, compare local demand and see whether a franchise location is open or completed.</p></div>
    <button className="network-explorer-button" onClick={() => setOpen(true)}>Explore Chennai zones <span>→</span></button>
    <FranchiseOpportunityDrawer open={open} onClose={() => setOpen(false)} />
  </section>;
}
