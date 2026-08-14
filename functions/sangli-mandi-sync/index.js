/* eslint-disable @typescript-eslint/no-require-imports -- Cloud Functions loads this CommonJS entry point. */
"use strict";
const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");
const dns = require("node:dns");
const https = require("node:https");
const { BigQuery } = require("@google-cloud/bigquery");
dns.setDefaultResultOrder("ipv4first");

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const API_URL = "https://api.data.gov.in/resource/" + RESOURCE_ID;
const PAGE_SIZE = 500;
const FOOD_GRAIN_TERMS = [
  "arhar", "bajra", "barley", "bengal gram", "black gram", "chana", "cowpea", "foxtail millet",
  "gram", "green gram", "horse gram", "jowar", "kabuli", "kodo millet", "lentil", "little millet", "maize",
  "masur", "matki", "millet", "moong", "paddy", "peas", "proso millet", "ragi", "rice", "sorghum",
  "tur", "urad", "wheat",
];
const NON_GRAIN_TERMS = ["(veg)", "vegetable", "green peas", "peas wet"];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
function parseArrivalDate(value) {
  const match = clean(value).match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return null;
  const day = match[1], month = match[2], year = match[3];
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? year + "-" + month + "-" + day : null;
}
function positivePrice(value) {
  const parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function isFoodGrain(commodity) {
  const normalized = clean(commodity).toLowerCase();
  return !NON_GRAIN_TERMS.some((term) => normalized.includes(term))
    && FOOD_GRAIN_TERMS.some((term) => normalized.includes(term));
}
function normalizeRecord(record, fetchedAt = new Date().toISOString()) {
  const arrivalDate = parseArrivalDate(record.arrival_date);
  const commodity = clean(record.commodity);
  const modal = positivePrice(record.modal_price);
  if (!arrivalDate || !commodity || !isFoodGrain(commodity) || modal === null) return null;
  const minimum = positivePrice(record.min_price) || modal;
  const maximum = positivePrice(record.max_price) || modal;
  const identity = [arrivalDate, clean(record.state), clean(record.district), clean(record.market), commodity, clean(record.variety), clean(record.grade)].join("|").toLowerCase();
  return {
    row_key: createHash("sha256").update(identity).digest("hex"),
    state: clean(record.state), district: clean(record.district), market: clean(record.market), commodity,
    variety: clean(record.variety), grade: clean(record.grade), category: "food_grain", arrival_date: arrivalDate,
    min_per_quintal: minimum, max_per_quintal: maximum, modal_per_quintal: modal,
    min_per_kg: Number((minimum / 100).toFixed(4)), max_per_kg: Number((maximum / 100).toFixed(4)),
    modal_per_kg: Number((modal / 100).toFixed(4)), source: "data.gov.in/agmarknet",
    resource_id: RESOURCE_ID, fetched_at: fetchedAt,
  };
}
function buildApiUrl(apiKey, offset, limit = PAGE_SIZE) {
  const params = new URLSearchParams({
    "api-key": apiKey, format: "json", offset: String(offset), limit: String(limit),
    "filters[state.keyword]": "Maharashtra", "filters[district]": "Sangli",
  });
  return API_URL + "?" + params;
}
function directHttpsResponse(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      family: 4,
      agent: false,
      headers: { Accept: "application/json", "User-Agent": "LunchBox-Mandi-Sync/1.0", Connection: "close" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const status = response.statusCode || 500;
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => JSON.parse(body),
        });
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error("data.gov.in request timed out.")));
    request.on("error", reject);
  });
}
function curlResponse(url) {
  return new Promise((resolve, reject) => {
    execFile("/usr/bin/curl", [
      "--silent", "--show-error", "--fail", "--max-time", "30",
      "--header", "Accept: application/json",
      "--header", "User-Agent: LunchBox-Mandi-Sync/1.0",
      url,
    ], { maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        if (error.code === "ENOENT") {
          directHttpsResponse(url).then(resolve, reject);
          return;
        }
        reject(new Error("data.gov.in curl transport failed with exit code " + String(error.code || "unknown") + "."));
        return;
      }
      resolve({ ok: true, status: 200, json: async () => JSON.parse(stdout) });
    });
  });
}
async function fetchPage(url, fetchImpl) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = fetchImpl
        ? await fetchImpl(url, {
          headers: { Accept: "application/json", "User-Agent": "LunchBox-Mandi-Sync/1.0", Connection: "close" },
          signal: AbortSignal.timeout(30000),
        })
        : await curlResponse(url);
      if (response.ok || response.status < 500) return response;
      lastError = new Error("data.gov.in returned HTTP " + response.status);
    } catch (error) { lastError = error; }
    if (attempt < 4) await wait(500 * (2 ** (attempt - 1)));
  }
  throw lastError;
}
async function fetchSangliRecords(apiKey, fetchImpl) {
  const records = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetchPage(buildApiUrl(apiKey, offset), fetchImpl);
    if (!response.ok) throw new Error("data.gov.in returned HTTP " + response.status);
    const body = await response.json();
    const page = Array.isArray(body.records) ? body.records : [];
    records.push(...page);
    const total = Number(body.total) || records.length;
    if (!page.length || records.length >= total || page.length < PAGE_SIZE) return records;
  }
}

function tableName(project, dataset, name) {
  return String.fromCharCode(96) + project + "." + dataset + "." + name + String.fromCharCode(96);
}
function ddl(project, dataset) {
  const history = tableName(project, dataset, "sangli_mandi_prices");
  const current = tableName(project, dataset, "sangli_mandi_price_current");
  return [
    "CREATE TABLE IF NOT EXISTS " + history + " (",
    "row_key STRING NOT NULL, state STRING NOT NULL, district STRING NOT NULL, market STRING NOT NULL,",
    "commodity STRING NOT NULL, variety STRING, grade STRING, category STRING NOT NULL, arrival_date DATE NOT NULL,",
    "min_per_quintal NUMERIC, max_per_quintal NUMERIC, modal_per_quintal NUMERIC NOT NULL,",
    "min_per_kg NUMERIC, max_per_kg NUMERIC, modal_per_kg NUMERIC NOT NULL,",
    "source STRING NOT NULL, resource_id STRING NOT NULL, fetched_at TIMESTAMP NOT NULL",
    ") PARTITION BY arrival_date CLUSTER BY commodity, market;",
    "CREATE OR REPLACE VIEW " + current + " AS SELECT * EXCEPT(row_number) FROM (",
    "SELECT *, ROW_NUMBER() OVER (PARTITION BY market, commodity, variety, grade ORDER BY arrival_date DESC, fetched_at DESC) row_number",
    "FROM " + history + ") WHERE row_number=1;",
  ].join("\n");
}
function mergeSql(project, dataset) {
  const history = tableName(project, dataset, "sangli_mandi_prices");
  return [
    "MERGE " + history + " target USING (SELECT",
    "JSON_VALUE(row,'$.row_key') row_key, JSON_VALUE(row,'$.state') state, JSON_VALUE(row,'$.district') district,",
    "JSON_VALUE(row,'$.market') market, JSON_VALUE(row,'$.commodity') commodity, JSON_VALUE(row,'$.variety') variety,",
    "JSON_VALUE(row,'$.grade') grade, JSON_VALUE(row,'$.category') category, DATE(JSON_VALUE(row,'$.arrival_date')) arrival_date,",
    "CAST(JSON_VALUE(row,'$.min_per_quintal') AS NUMERIC) min_per_quintal, CAST(JSON_VALUE(row,'$.max_per_quintal') AS NUMERIC) max_per_quintal,",
    "CAST(JSON_VALUE(row,'$.modal_per_quintal') AS NUMERIC) modal_per_quintal, CAST(JSON_VALUE(row,'$.min_per_kg') AS NUMERIC) min_per_kg,",
    "CAST(JSON_VALUE(row,'$.max_per_kg') AS NUMERIC) max_per_kg, CAST(JSON_VALUE(row,'$.modal_per_kg') AS NUMERIC) modal_per_kg,",
    "JSON_VALUE(row,'$.source') source, JSON_VALUE(row,'$.resource_id') resource_id, TIMESTAMP(JSON_VALUE(row,'$.fetched_at')) fetched_at",
    "FROM UNNEST(JSON_QUERY_ARRAY(@payload)) row) source ON target.row_key=source.row_key",
    "WHEN MATCHED THEN UPDATE SET min_per_quintal=source.min_per_quintal,max_per_quintal=source.max_per_quintal,",
    "modal_per_quintal=source.modal_per_quintal,min_per_kg=source.min_per_kg,max_per_kg=source.max_per_kg,modal_per_kg=source.modal_per_kg,fetched_at=source.fetched_at",
    "WHEN NOT MATCHED THEN INSERT (row_key,state,district,market,commodity,variety,grade,category,arrival_date,min_per_quintal,max_per_quintal,modal_per_quintal,min_per_kg,max_per_kg,modal_per_kg,source,resource_id,fetched_at) VALUES (source.row_key,source.state,source.district,source.market,source.commodity,source.variety,source.grade,source.category,source.arrival_date,source.min_per_quintal,source.max_per_quintal,source.modal_per_quintal,source.min_per_kg,source.max_per_kg,source.modal_per_kg,source.source,source.resource_id,source.fetched_at);",
  ].join("\n");
}
async function persistRows(rows, options = {}) {
  const project = options.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  const dataset = options.datasetId || process.env.BIGQUERY_DATASET || "school_lunch";
  if (!project) throw new Error("GCP project is not configured.");
  const client = options.bigquery || new BigQuery({ projectId: project });
  const location = process.env.BIGQUERY_LOCATION || "asia-south1";
  await client.query({ query: ddl(project, dataset), location });
  if (!rows.length) return;
  await client.query({ query: mergeSql(project, dataset), params: { payload: JSON.stringify(rows) }, location });
}
async function runSync(options = {}) {
  const apiKey = options.apiKey || process.env.DATA_GOV_API_KEY;
  if (!apiKey) throw new Error("DATA_GOV_API_KEY is not configured.");
  const raw = await fetchSangliRecords(apiKey, options.fetchImpl);
  const fetchedAt = new Date().toISOString();
  const rows = raw.map((record) => normalizeRecord(record, fetchedAt)).filter(Boolean);
  await persistRows(rows, options);
  return { sourceRecords: raw.length, foodGrainRecords: rows.length, skipped: raw.length - rows.length, district: "Sangli", state: "Maharashtra" };
}
async function syncSangliMandi(request, response) {
  if (request.method !== "POST") {
    response.set("Allow", "POST");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }
  try {
    const result = await runSync();
    console.log(JSON.stringify({ event: "sangli_mandi_sync.completed", ...result }));
    response.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("sangli_mandi_sync.failed", error);
    response.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Sync failed." });
  }
}
module.exports = { RESOURCE_ID, buildApiUrl, fetchSangliRecords, isFoodGrain, normalizeRecord, parseArrivalDate, persistRows, runSync, syncSangliMandi };
