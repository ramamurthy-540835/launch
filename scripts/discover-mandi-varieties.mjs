#!/usr/bin/env node

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const [state, market, commodity] = process.argv.slice(2);
if (!state || !market) {
  console.error("Usage: npm run discover:mandi -- <state> <market> [commodity]");
  process.exit(1);
}
const apiKey = process.env.DATA_GOV_API_KEY;
if (!apiKey) {
  console.error("Set DATA_GOV_API_KEY to your data.gov.in API key first.");
  process.exit(1);
}

const params = new URLSearchParams({
  "api-key": apiKey, format: "json", limit: "500", "filters[state.keyword]": state, "filters[market]": market,
});
if (commodity) params.set("filters[commodity]", commodity);
const response = await fetch(`https://api.data.gov.in/resource/${RESOURCE_ID}?${params}`, { headers: { Accept: "application/json" } });
if (!response.ok) {
  console.error(`data.gov.in returned ${response.status}`);
  process.exit(1);
}
const { records = [], total = records.length } = await response.json();
if (!records.length) {
  console.log(`No records for ${market}, ${state}${commodity ? ` / ${commodity}` : ""}.`);
  console.log("Drop the commodity filter to distinguish an exact-string mismatch from a market reporting gap.");
  process.exit(0);
}

const sortableDate = (value) => {
  const match = String(value || "").match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return match ? `${match[3]}${match[2]}${match[1]}` : "";
};
const distinct = new Map();
for (const record of records) {
  const key = `${record.commodity}|${record.variety}|${record.grade}`;
  const existing = distinct.get(key);
  if (!existing || sortableDate(record.arrival_date) > sortableDate(existing.arrival_date)) distinct.set(key, record);
}
console.log(`\n${market}, ${state}: ${distinct.size} combinations (${total} total rows)\n`);
console.log("COMMODITY | VARIETY | GRADE | LATEST DATE | ₹/kg");
console.log("-".repeat(72));
for (const record of [...distinct.values()].sort((left, right) => String(left.commodity).localeCompare(String(right.commodity)))) {
  const modal = Number(String(record.modal_price || "").replace(/,/g, ""));
  console.log(`${record.commodity} | ${record.variety} | ${record.grade} | ${record.arrival_date} | ₹${Number.isFinite(modal) ? (modal / 100).toFixed(2) : "?"}`);
}
console.log("\nCopy exact values into lib/commodityMapping.ts and verify the inventory item ID before setting verified: true.\n");
