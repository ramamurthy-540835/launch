import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const sync = require("../functions/sangli-mandi-sync/index.js");

describe("Sangli mandi daily sync", () => {
  it("uses Sangli filters", () => {
    const url = new URL(sync.buildApiUrl("secret", 0));
    expect(url.searchParams.get("filters[state.keyword]")).toBe("Maharashtra");
    expect(url.searchParams.get("filters[district]")).toBe("Sangli");
  });
  it("recognizes food grains and rejects vegetables", () => {
    expect(sync.isFoodGrain("Jowar(Sorghum)")).toBe(true);
    expect(sync.isFoodGrain("Bengal Gram(Gram)(Whole)")).toBe(true);
    expect(sync.isFoodGrain("Cowpea(Veg)")).toBe(false);
    expect(sync.isFoodGrain("Tomato")).toBe(false);
  });
  it("converts rupees per quintal to per kilogram", () => {
    expect(sync.parseArrivalDate("14/08/2026")).toBe("2026-08-14");
    expect(sync.normalizeRecord({ state:"Maharashtra",district:"Sangli",market:"Sangli",commodity:"Wheat",arrival_date:"14/08/2026",min_price:2400,max_price:2600,modal_price:2500 })).toMatchObject({
      min_per_kg:24,max_per_kg:26,modal_per_kg:25,modal_per_quintal:2500,category:"food_grain",
    });
  });
  it("persists only food-grain rows", async () => {
    const query = vi.fn().mockResolvedValue([{}]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok:true, json:async()=>({ total:2, records:[
      {state:"Maharashtra",district:"Sangli",market:"Sangli",commodity:"Maize",arrival_date:"14/08/2026",modal_price:2400},
      {state:"Maharashtra",district:"Sangli",market:"Sangli",commodity:"Tomato",arrival_date:"14/08/2026",modal_price:2000},
    ]})});
    const result = await sync.runSync({apiKey:"secret",fetchImpl,bigquery:{query},projectId:"project",datasetId:"dataset"});
    expect(result).toMatchObject({sourceRecords:2,foodGrainRecords:1,skipped:1});
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("creates the table and view when today's feed contains no grains", async () => {
    const query = vi.fn().mockResolvedValue([{}]);
    const fetchImpl = vi.fn().mockResolvedValue({ ok:true, status:200, json:async()=>({ total:1, records:[
      {state:"Maharashtra",district:"Sangli",market:"Vita APMC",commodity:"Tomato",arrival_date:"14/08/2026",modal_price:1200},
    ]})});
    const result = await sync.runSync({apiKey:"secret",fetchImpl,bigquery:{query},projectId:"project",datasetId:"dataset"});
    expect(result.foodGrainRecords).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].query).toContain("CREATE TABLE IF NOT EXISTS");
  });
});
