import { timingSafeEqual } from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { NextResponse } from "next/server";
import { verifiedCommodityMappings, unverifiedCommodityCount } from "@/lib/commodityMapping";
import { fetchMandiPrices, freshestMandiPrice } from "@/lib/mandiPrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validRefreshToken(received: string) {
  const expected = process.env.PRICE_REFRESH_TOKEN;
  if (!expected) return false;
  const left = Buffer.from(received); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!validRefreshToken(request.headers.get("X-Refresh-Token") || "")) return NextResponse.json({ error: "Unauthorized refresh request." }, { status: 401 });
  const mappings = verifiedCommodityMappings();
  if (!mappings.length) return NextResponse.json({ ok: true, refreshed: 0, unverifiedMappings: unverifiedCommodityCount(), note: "No verified commodity mappings. Run npm run discover:mandi before enabling price-driven metrics." });

  const rows: Record<string, unknown>[] = []; const missing: string[] = []; const fetchedAt = new Date().toISOString();
  for (const mapping of mappings) {
    try {
      const result = await fetchMandiPrices({ state: mapping.state, district: mapping.district, market: mapping.market, commodity: mapping.commodity, variety: mapping.variety, grade: mapping.grade, limit: 100 });
      const price = freshestMandiPrice(result.prices);
      if (!price) { missing.push(`${mapping.itemName} (${mapping.market})`); continue; }
      rows.push({
        item_id: mapping.itemId, item_name: mapping.itemName, state: price.state, district: price.district, market: price.market,
        commodity: price.commodity, variety: price.variety, grade: price.grade, arrival_date: price.arrivalDate,
        modal_per_quintal: price.modalPerQuintal, modal_per_kg: Number(price.modalPerKg.toFixed(4)),
        min_per_kg: Number(price.minPerKg.toFixed(4)), max_per_kg: Number(price.maxPerKg.toFixed(4)), source: "agmarknet", fetched_at: fetchedAt,
      });
    } catch (error) {
      missing.push(`${mapping.itemName} (fetch failed)`); console.error(`[mandi] fetch failed for ${mapping.itemName}`, error);
    }
  }

  if (rows.length) {
    const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) return NextResponse.json({ error: "GCP project is not configured." }, { status: 503 });
    try { await new BigQuery({ projectId }).dataset(process.env.BIGQUERY_DATASET || "school_lunch").table("market_prices").insert(rows); }
    catch (error) { console.error("[mandi] BigQuery insert failed", error); return NextResponse.json({ error: "Market price storage failed." }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true, refreshed: rows.length, missing, unverifiedMappings: unverifiedCommodityCount() });
}
