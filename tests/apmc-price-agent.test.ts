import { describe, expect, it } from "vitest";
import { buildApmcUrl, parseApmcDate, runApmcPriceAgent, selectApmcRate, type ApmcRecord } from "@/lib/inventory/apmc-price-agent";

const mapping = { itemId: "onion", commodity: "Onion", supplierId: "supplier_apmc" };
const record = (overrides: Partial<ApmcRecord> = {}): ApmcRecord => ({
  Arrival_Date: "10/08/2026",
  Commodity: "Onion",
  Commodity_Code: 23,
  District: "Sangli",
  Grade: "FAQ",
  Market: "Sangli APMC",
  Max_Price: 1600,
  Min_Price: 1200,
  Modal_Price: 1400,
  State: "Maharashtra",
  Variety: "Other",
  ...overrides,
});

describe("AGMARKNET inventory price agent", () => {
  it("parses government DD/MM/YYYY dates strictly", () => {
    expect(parseApmcDate("10/08/2026")?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(parseApmcDate("31/02/2026")).toBeNull();
  });

  it("builds a government API query scoped to commodity and market geography", () => {
    const url = buildApmcUrl({ resourceId: "35985678-0d79-46b4-9ed6-6f13308a1d24", apiKey: "secret", mapping, market: { state: "Maharashtra", district: "Sangli" } });
    expect(url.hostname).toBe("api.data.gov.in");
    expect(url.searchParams.get("filters[Commodity]")).toBe("Onion");
    expect(url.searchParams.get("filters[District]")).toBe("Sangli");
  });

  it("uses fresh Sangli modal price and converts quintal to kg", () => {
    const result = selectApmcRate({ mapping, primaryRecords: [record()], fallbackRecords: [record({ District: "Salem", State: "Tamil Nadu", Modal_Price: 1800 })], now: new Date("2026-08-11T00:00:00Z") });
    expect(result.status).toBe("RESOLVED");
    if (result.status === "RESOLVED") expect(result.rate).toMatchObject({ rate: 14, unit: "KG", source: { district: "Sangli", fallbackUsed: false } });
  });

  it("uses Salem only when Sangli has no fresh matching record", () => {
    const result = selectApmcRate({ mapping, primaryRecords: [record({ Arrival_Date: "01/06/2026" })], fallbackRecords: [record({ District: "Salem", State: "Tamil Nadu", Market: "Salem Market", Modal_Price: 1800, Min_Price: 1700, Max_Price: 1900 })], now: new Date("2026-08-11T00:00:00Z"), maxAgeDays: 7 });
    expect(result.status).toBe("RESOLVED");
    if (result.status === "RESOLVED") expect(result.rate).toMatchObject({ rate: 18, source: { district: "Salem", fallbackUsed: true } });
  });

  it("refuses stale or internally inconsistent records", () => {
    const result = selectApmcRate({ mapping, primaryRecords: [record({ Arrival_Date: "01/06/2026" })], fallbackRecords: [record({ District: "Salem", Min_Price: 2000, Modal_Price: 1800 })], now: new Date("2026-08-11T00:00:00Z"), maxAgeDays: 7 });
    expect(result).toMatchObject({ status: "UNRESOLVED", itemId: "onion" });
  });

  it("queries Salem only after Sangli cannot resolve the item", async () => {
    const calls: URL[] = [];
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input)); calls.push(url);
      const isSalem = url.searchParams.get("filters[District]") === "Salem";
      return new Response(JSON.stringify({ status: "ok", records: isSalem ? [record({ District: "Salem", State: "Tamil Nadu", Market: "Salem Market" })] : [] }), { status: 200 });
    };
    const result = await runApmcPriceAgent({
      environment: {
        DATA_GOV_IN_API_KEY: "secret",
        INVENTORY_APMC_ITEM_MAP_JSON: JSON.stringify([mapping]),
        INVENTORY_APMC_MAX_AGE_DAYS: "7",
      },
      fetcher: fetcher as typeof fetch,
      now: new Date("2026-08-11T00:00:00Z"),
    });
    expect(calls.map((url) => url.searchParams.get("filters[District]"))).toEqual(["Sangli", "Salem"]);
    expect(result.rates[0].source.fallbackUsed).toBe(true);
    expect(result.rawPayload).not.toContain("secret");
  });
});
