import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMandiUrl, fetchMandiPrices, freshestMandiPrice, parseMandiDate } from "@/lib/mandiPrices";

describe("Agmarknet mandi prices", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("validates and converts DD/MM/YYYY dates", () => {
    expect(parseMandiDate("13/08/2026")).toBe("2026-08-13");
    expect(parseMandiDate("31/02/2026")).toBeNull();
  });

  it("uses the resource's exact filter keys", () => {
    const url = new URL(buildMandiUrl({ state: "Tamil Nadu", district: "Chennai", market: "Koyambedu", commodity: "Tomato" }, "test-key"));
    expect(url.pathname).toContain("9ef84268-d588-465a-a308-a864a43d0070");
    expect(url.searchParams.get("filters[state.keyword]")).toBe("Tamil Nadu");
    expect(url.searchParams.get("filters[market]")).toBe("Koyambedu");
    expect(url.searchParams.has("filters[market.keyword]")).toBe(false);
  });

  it("converts per-quintal records to dated per-kg prices", async () => {
    vi.stubEnv("DATA_GOV_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 1, records: [{ state: "Tamil Nadu", district: "Chennai", market: "Koyambedu", commodity: "Tomato", variety: "Local", grade: "FAQ", arrival_date: "13/08/2026", min_price: "2,000", max_price: "3,000", modal_price: "2,500" }] }) }));
    const result = await fetchMandiPrices({ state: "Tamil Nadu", market: "Koyambedu", commodity: "Tomato" });
    expect(result.prices[0]).toMatchObject({ arrivalDate: "2026-08-13", minPerKg: 20, maxPerKg: 30, modalPerKg: 25, modalPerQuintal: 2500 });
  });

  it("selects the freshest report and never invents an empty price", () => {
    const base = { state: "", district: "", market: "", commodity: "", variety: "", grade: "", minPerKg: 1, maxPerKg: 1, modalPerKg: 1, modalPerQuintal: 100 };
    expect(freshestMandiPrice([])).toBeNull();
    expect(freshestMandiPrice([{ ...base, arrivalDate: "2026-08-11" }, { ...base, arrivalDate: "2026-08-13" }])?.arrivalDate).toBe("2026-08-13");
  });
});
