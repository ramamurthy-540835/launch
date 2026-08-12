import { describe, expect, it } from "vitest";
import { runApmcPriceAgent, type ApmcRecord } from "@/lib/inventory/apmc-price-agent";

describe("AGMARKNET pagination", () => {
  it("reads every filtered page before choosing the newest observation", async () => {
    const offsets: string[] = [];
    const makeRecord = (arrivalDate: string, modalPrice: number): ApmcRecord => ({
      Arrival_Date: arrivalDate,
      Commodity: "Onion",
      Commodity_Code: 23,
      District: "Sangli",
      Grade: "FAQ",
      Market: "Sangli APMC",
      Max_Price: modalPrice + 100,
      Min_Price: modalPrice - 100,
      Modal_Price: modalPrice,
      State: "Maharashtra",
      Variety: "Other",
    });
    const pages = [makeRecord("01/01/2020", 1000), makeRecord("10/08/2026", 1600)];
    const fetcher = async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const offset = url.searchParams.get("offset") || "0";
      offsets.push(offset);
      return new Response(JSON.stringify({ status: "ok", total: 2, count: 1, records: [pages[Number(offset)]] }), { status: 200 });
    };
    const result = await runApmcPriceAgent({
      environment: {
        DATA_GOV_IN_API_KEY: "secret",
        INVENTORY_APMC_ITEM_MAP_JSON: JSON.stringify([{ itemId: "onion", commodity: "Onion" }]),
        INVENTORY_APMC_MAX_AGE_DAYS: "7",
      },
      fetcher: fetcher as typeof fetch,
      now: new Date("2026-08-11T00:00:00Z"),
    });
    expect(offsets).toEqual(["0", "1"]);
    expect(result.rates[0]).toMatchObject({ rate: 16, source: { district: "Sangli", fallbackUsed: false } });
  });
});
