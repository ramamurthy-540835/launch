"use client";

import { useMemo, useState } from "react";
import { audienceTypes, type MarketingLead } from "@/lib/marketing";
import { canonicalInstitutionId } from "@/lib/marketing-events";
import styles from "./MarketingLeadPicker.module.css";

type Props = {
  leads: MarketingLead[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  label?: string;
};

export default function MarketingLeadPicker({ leads, selectedIds, onChange, multiple = false, label = "Pipeline lead" }: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => leads.filter((lead) => !search || `${lead.name} ${lead.area || ""} ${lead.city}`.toLowerCase().includes(search.toLowerCase())), [leads, search]);
  return <div className={styles.picker}>
    <label>{label}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved beneficiaries" /></label>
    <div className={styles.options}>{filtered.length ? filtered.map((lead) => {
      const id = canonicalInstitutionId(lead);
      return <label key={id}>
        <input type={multiple ? "checkbox" : "radio"} name={multiple ? undefined : "marketing-lead-picker"} checked={selectedIds.includes(id)} onChange={(event) => onChange(multiple ? event.target.checked ? [...selectedIds, id] : selectedIds.filter((selectedId) => selectedId !== id) : [id])} />
        <span>{lead.name}<small>{audienceTypes[lead.audience].label} · {lead.area || lead.city}</small></span>
      </label>;
    }) : <p>No matching beneficiaries. Add schools, colleges, apartment communities, or parent hubs from Discover first.</p>}</div>
  </div>;
}

