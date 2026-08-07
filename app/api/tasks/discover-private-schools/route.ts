import { randomUUID } from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";
import { NextResponse } from "next/server";
import { discoverPrivateSchools, savePrivateSchools, tamilNaduDistricts } from "@/lib/private-school-discovery";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const expectedSecret = process.env.SCHOOL_DISCOVERY_TASK_SECRET;
  if (!expectedSecret || request.headers.get("X-Task-Secret") !== expectedSecret) return NextResponse.json({ error: "Unauthorized task request." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { districts?: unknown; maxPages?: unknown };
  const requested = Array.isArray(body.districts) ? body.districts.filter((value): value is string => typeof value === "string") : [];
  const districts = (requested.length ? requested : [tamilNaduDistricts[new Date().getUTCDate() % tamilNaduDistricts.length]])
    .filter((district) => (tamilNaduDistricts as readonly string[]).includes(district)).slice(0, 5);
  if (!districts.length) return NextResponse.json({ error: "Provide valid Tamil Nadu districts." }, { status: 400 });
  const maxPages = Math.min(Math.max(Number(body.maxPages || 2), 1), 6);
  const runId = randomUUID();
  const projectId = process.env.GCP_PROJECT_ID || "chennaifood";
  const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
  const bigquery = new BigQuery({ projectId });
  const results: Array<{ district: string; discovered: number }> = [];
  try {
    for (const district of districts) {
      const schools = await discoverPrivateSchools(district, maxPages);
      results.push({ district, discovered: await savePrivateSchools(schools, runId) });
    }
    await bigquery.dataset(datasetId).table("private_school_discovery_runs").insert([{ run_id: runId, started_at: new Date(), completed_at: new Date(), districts, max_pages: maxPages, schools_discovered: results.reduce((sum, result) => sum + result.discovered, 0), status: "COMPLETED", error_message: null }]);
    return NextResponse.json({ runId, results });
  } catch (error) {
    await bigquery.dataset(datasetId).table("private_school_discovery_runs").insert([{ run_id: runId, started_at: new Date(), completed_at: new Date(), districts, max_pages: maxPages, schools_discovered: results.reduce((sum, result) => sum + result.discovered, 0), status: "FAILED", error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" }]).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Private-school discovery failed.", runId, results }, { status: 500 });
  }
}
