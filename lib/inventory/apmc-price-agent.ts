import { z } from "zod";

export const DATA_GOV_APMC_RESOURCE_ID = "35985678-0d79-46b4-9ed6-6f13308a1d24";

const marketSchema = z.object({
  state: z.string().trim().min(1),
  district: z.string().trim().min(1),
  market: z.string().trim().min(1).optional(),
});

const itemMappingSchema = z.object({
  itemId: z.string().trim().min(2).max(120),
  commodity: z.string().trim().min(1).max(160),
  variety: z.string().trim().min(1).max(160).optional(),
  grade: z.string().trim().min(1).max(160).optional(),
  supplierId: z.string().trim().min(2).max(120).optional(),
});

export type ApmcMarket = z.infer<typeof marketSchema>;
export type ApmcItemMapping = z.infer<typeof itemMappingSchema>;

export type ApmcRecord = {
  Arrival_Date?: string;
  Commodity?: string;
  Commodity_Code?: string | number;
  District?: string;
  Grade?: string;
  Market?: string;
  Max_Price?: string | number;
  Min_Price?: string | number;
  Modal_Price?: string | number;
  State?: string;
  Variety?: string;
};

export type ApmcNormalizedRate = {
  itemId: string;
  supplierId?: string;
  unit: "KG";
  rate: number;
  currency: "INR";
  sourceReferenceId: string;
  source: {
    provider: "data.gov.in/AGMARKNET";
    state: string;
    district: string;
    market: string;
    commodity: string;
    commodityCode: string | null;
    variety: string;
    grade: string;
    arrivalDate: string;
    minPricePerQuintal: number;
    maxPricePerQuintal: number;
    modalPricePerQuintal: number;
    fallbackUsed: boolean;
    fallbackReason: string | null;
  };
};

export type ApmcSelection =
  | { status: "RESOLVED"; rate: ApmcNormalizedRate }
  | { status: "UNRESOLVED"; itemId: string; commodity: string; reason: string };

const DEFAULT_MARKETS: [ApmcMarket, ApmcMarket] = [
  { state: "Maharashtra", district: "Sangli" },
  { state: "Tamil Nadu", district: "Salem" },
];

function same(left: unknown, right: string) {
  return String(left || "").trim().localeCompare(right.trim(), undefined, { sensitivity: "accent" }) === 0;
}

function finitePositive(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseApmcDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) || date.getUTCMonth() + 1 !== Number(month) ? null : date;
}

function matchingRecords(records: ApmcRecord[], mapping: ApmcItemMapping) {
  return records.flatMap((record) => {
    if (!same(record.Commodity, mapping.commodity)) return [];
    if (mapping.variety && !same(record.Variety, mapping.variety)) return [];
    if (mapping.grade && !same(record.Grade, mapping.grade)) return [];
    const date = parseApmcDate(String(record.Arrival_Date || ""));
    const modal = finitePositive(record.Modal_Price);
    const min = finitePositive(record.Min_Price);
    const max = finitePositive(record.Max_Price);
    if (!date || modal === null || min === null || max === null || min > modal || modal > max) return [];
    return [{ record, date, modal, min, max }];
  }).sort((left, right) => right.date.getTime() - left.date.getTime());
}

function freshCandidate(records: ApmcRecord[], mapping: ApmcItemMapping, now: Date, maxAgeDays: number) {
  return matchingRecords(records, mapping).find(({ date }) => {
    const age = (now.getTime() - date.getTime()) / 86_400_000;
    return age >= -1 && age <= maxAgeDays;
  });
}

export function selectApmcRate(input: {
  mapping: ApmcItemMapping;
  primaryRecords: ApmcRecord[];
  fallbackRecords: ApmcRecord[];
  now?: Date;
  maxAgeDays?: number;
}): ApmcSelection {
  const now = input.now || new Date();
  const maxAgeDays = input.maxAgeDays ?? 7;
  const primary = freshCandidate(input.primaryRecords, input.mapping, now, maxAgeDays);
  const fallback = primary ? undefined : freshCandidate(input.fallbackRecords, input.mapping, now, maxAgeDays);
  const selected = primary || fallback;
  if (!selected) {
    return {
      status: "UNRESOLVED",
      itemId: input.mapping.itemId,
      commodity: input.mapping.commodity,
      reason: `No valid AGMARKNET record newer than ${maxAgeDays} day(s) in Sangli or Salem.`,
    };
  }

  const record = selected.record;
  const fallbackUsed = !primary;
  const sourceReferenceId = [
    "AGMARKNET",
    record.Commodity_Code || input.mapping.commodity,
    record.State,
    record.District,
    record.Market,
    record.Arrival_Date,
    record.Variety,
    record.Grade,
  ].map((part) => String(part || "").replace(/[^A-Za-z0-9._-]+/g, "-")).join(":").slice(0, 200);

  return {
    status: "RESOLVED",
    rate: {
      itemId: input.mapping.itemId,
      supplierId: input.mapping.supplierId,
      unit: "KG",
      rate: Number((selected.modal / 100).toFixed(4)),
      currency: "INR",
      sourceReferenceId,
      source: {
        provider: "data.gov.in/AGMARKNET",
        state: String(record.State || ""),
        district: String(record.District || ""),
        market: String(record.Market || ""),
        commodity: String(record.Commodity || ""),
        commodityCode: record.Commodity_Code == null ? null : String(record.Commodity_Code),
        variety: String(record.Variety || ""),
        grade: String(record.Grade || ""),
        arrivalDate: selected.date.toISOString().slice(0, 10),
        minPricePerQuintal: selected.min,
        maxPricePerQuintal: selected.max,
        modalPricePerQuintal: selected.modal,
        fallbackUsed,
        fallbackReason: fallbackUsed ? "No fresh matching Sangli record was available." : null,
      },
    },
  };
}

type ApmcEnvironment = Record<string, string | undefined>;

export function getApmcConfiguration(environment: ApmcEnvironment = process.env) {
  const mappings = z.array(itemMappingSchema).min(1).parse(JSON.parse(environment.INVENTORY_APMC_ITEM_MAP_JSON || "[]"));
  const markets = z.array(marketSchema).length(2).parse(JSON.parse(environment.INVENTORY_APMC_MARKETS_JSON || JSON.stringify(DEFAULT_MARKETS)));
  const maxAgeDays = z.coerce.number().int().min(0).max(90).parse(environment.INVENTORY_APMC_MAX_AGE_DAYS || "7");
  const resourceId = environment.INVENTORY_APMC_RESOURCE_ID || DATA_GOV_APMC_RESOURCE_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(resourceId)) throw new Error("INVENTORY_APMC_RESOURCE_ID must be a data.gov.in resource UUID.");
  if (!environment.DATA_GOV_IN_API_KEY) throw new Error("DATA_GOV_IN_API_KEY is required for the AGMARKNET feed.");
  return { mappings, markets: markets as [ApmcMarket, ApmcMarket], maxAgeDays, resourceId, apiKey: environment.DATA_GOV_IN_API_KEY };
}

export function buildApmcUrl(input: { resourceId: string; apiKey: string; mapping: ApmcItemMapping; market: ApmcMarket; limit?: number }) {
  const url = new URL(`https://api.data.gov.in/resource/${input.resourceId}`);
  url.searchParams.set("api-key", input.apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(input.limit || 1000));
  url.searchParams.set("filters[State]", input.market.state);
  url.searchParams.set("filters[District]", input.market.district);
  url.searchParams.set("filters[Commodity]", input.mapping.commodity);
  if (input.market.market) url.searchParams.set("filters[Market]", input.market.market);
  if (input.mapping.variety) url.searchParams.set("filters[Variety]", input.mapping.variety);
  if (input.mapping.grade) url.searchParams.set("filters[Grade]", input.mapping.grade);
  return url;
}

async function fetchRecords(url: URL, fetcher: typeof fetch) {
  const records: ApmcRecord[] = [];
  let offset = 0;
  while (true) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("offset", String(offset));
    const response = await fetcher(pageUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`data.gov.in returned HTTP ${response.status}.`);
    const payload = await response.json() as { status?: string; total?: number; records?: ApmcRecord[] };
    if (payload.status !== "ok" || !Array.isArray(payload.records)) throw new Error("data.gov.in returned an invalid AGMARKNET payload.");
    records.push(...payload.records);
    const total = Number(payload.total ?? records.length);
    offset += payload.records.length;
    if (payload.records.length === 0 || offset >= total) break;
    if (offset >= 20_000) throw new Error("AGMARKNET result exceeds the 20,000-record safety limit; narrow the item mapping.");
  }
  return records;
}

export async function runApmcPriceAgent(options: { environment?: ApmcEnvironment; fetcher?: typeof fetch; now?: Date } = {}) {
  const environment = options.environment || process.env;
  const fetcher = options.fetcher || fetch;
  const config = getApmcConfiguration(environment);
  const rates: ApmcNormalizedRate[] = [];
  const unresolved: Array<Extract<ApmcSelection, { status: "UNRESOLVED" }>> = [];
  const responses: Array<{ itemId: string; source: ApmcMarket; records: ApmcRecord[] }> = [];

  for (const mapping of config.mappings) {
    const primaryRecords = await fetchRecords(buildApmcUrl({ ...config, mapping, market: config.markets[0] }), fetcher);
    responses.push({ itemId: mapping.itemId, source: config.markets[0], records: primaryRecords });
    let selection = selectApmcRate({ mapping, primaryRecords, fallbackRecords: [], now: options.now, maxAgeDays: config.maxAgeDays });
    if (selection.status === "UNRESOLVED") {
      const fallbackRecords = await fetchRecords(buildApmcUrl({ ...config, mapping, market: config.markets[1] }), fetcher);
      responses.push({ itemId: mapping.itemId, source: config.markets[1], records: fallbackRecords });
      selection = selectApmcRate({ mapping, primaryRecords, fallbackRecords, now: options.now, maxAgeDays: config.maxAgeDays });
    }
    if (selection.status === "RESOLVED") rates.push(selection.rate); else unresolved.push(selection);
  }

  return { provider: "data.gov.in/AGMARKNET" as const, rates, unresolved, rawPayload: JSON.stringify({ responses }) };
}
