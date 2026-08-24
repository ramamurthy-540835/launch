/** Server-only Agmarknet mandi price client for data.gov.in. */

export const MANDI_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const API_BASE = `https://api.data.gov.in/resource/${MANDI_RESOURCE_ID}`;
export const KG_PER_QUINTAL = 100;

export type MandiQuery = {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  variety?: string;
  grade?: string;
  limit?: number;
  offset?: number;
};

type RawMandiRecord = {
  state?: string; district?: string; market?: string; commodity?: string; variety?: string; grade?: string;
  arrival_date?: string; min_price?: string | number; max_price?: string | number; modal_price?: string | number;
};

export type MandiPrice = {
  state: string; district: string; market: string; commodity: string; variety: string; grade: string;
  arrivalDate: string; minPerKg: number; maxPerKg: number; modalPerKg: number; modalPerQuintal: number;
};

export type MandiResult = { prices: MandiPrice[]; skipped: number; total: number };

function configuredApiKey() {
  const key = process.env.DATA_GOV_API_KEY;
  if (!key) throw new Error("DATA_GOV_API_KEY is not configured.");
  return key;
}

export function parseMandiDate(value: string | undefined): string | null {
  const match = value?.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

function positiveNumber(value: string | number | undefined) {
  if (value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildMandiUrl(query: MandiQuery, apiKey = configuredApiKey()) {
  const params = new URLSearchParams({ "api-key": apiKey, format: "json", limit: String(query.limit ?? 100), offset: String(query.offset ?? 0) });
  if (query.state) params.set("filters[state.keyword]", query.state);
  if (query.district) params.set("filters[district]", query.district);
  if (query.market) params.set("filters[market]", query.market);
  if (query.commodity) params.set("filters[commodity]", query.commodity);
  if (query.variety) params.set("filters[variety]", query.variety);
  if (query.grade) params.set("filters[grade]", query.grade);
  return `${API_BASE}?${params.toString()}`;
}

export async function fetchMandiPrices(query: MandiQuery): Promise<MandiResult> {
  const response = await fetch(buildMandiUrl(query), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`data.gov.in returned ${response.status}`);
  const body = await response.json() as { records?: RawMandiRecord[]; total?: number };
  const records = body.records ?? []; const prices: MandiPrice[] = []; let skipped = 0;
  for (const record of records) {
    const arrivalDate = parseMandiDate(record.arrival_date); const modal = positiveNumber(record.modal_price);
    const minimum = positiveNumber(record.min_price); const maximum = positiveNumber(record.max_price);
    if (!arrivalDate || modal === null) { skipped += 1; continue; }
    prices.push({
      state: record.state?.trim() ?? "", district: record.district?.trim() ?? "", market: record.market?.trim() ?? "",
      commodity: record.commodity?.trim() ?? "", variety: record.variety?.trim() ?? "", grade: record.grade?.trim() ?? "", arrivalDate,
      modalPerQuintal: modal, modalPerKg: modal / KG_PER_QUINTAL,
      minPerKg: (minimum ?? modal) / KG_PER_QUINTAL, maxPerKg: (maximum ?? modal) / KG_PER_QUINTAL,
    });
  }
  return { prices, skipped, total: Number(body.total) || records.length };
}

export function freshestMandiPrice(prices: MandiPrice[]) {
  return prices.length ? prices.reduce((latest, price) => price.arrivalDate > latest.arrivalDate ? price : latest) : null;
}
