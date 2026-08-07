import { createHash } from "node:crypto";
import { BigQuery } from "@google-cloud/bigquery";

export const tamilNaduDistricts = [
  "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram", "Kanniyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar",
] as const;

type SerpResult = {
  title?: unknown; address?: unknown; type?: unknown; types?: unknown; phone?: unknown; website?: unknown;
  rating?: unknown; reviews?: unknown; place_id?: unknown; data_id?: unknown; data_cid?: unknown;
  gps_coordinates?: { latitude?: unknown; longitude?: unknown };
};

export type PrivateSchoolRecord = {
  schoolId: string;
  schoolName: string;
  normalizedName: string;
  namePrefix3: string;
  address: string;
  district: string;
  state: "Tamil Nadu";
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  schoolType: string;
  googlePlaceId: string | null;
  googleDataId: string | null;
  googleDataCid: string | null;
  ownership: "PRIVATE_CANDIDATE";
  verificationStatus: "DISCOVERED";
  source: "SERPAPI_GOOGLE_MAPS";
};

function text(value: unknown, max = 300) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function normalizeSchoolName(value: string) { return value.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, " ").trim(); }

function isPrivateSchoolCandidate(result: SerpResult) {
  const name = text(result.title, 160);
  const categories = [text(result.type), ...(Array.isArray(result.types) ? result.types.map((value) => text(value)) : [])].join(" ");
  const schoolLike = /school|vidyalaya|vidhyalaya|academy|matriculation|montessori|higher secondary|public school|international school|convent/i.test(`${name} ${categories}`);
  const government = /government|govt\.?|corporation school|municipal school|panchayat union|kendriya vidyalaya|jawahar navodaya|army public school/i.test(`${name} ${categories}`);
  return schoolLike && !government;
}

export function normalizePrivateSchoolResults(results: unknown, district: string): PrivateSchoolRecord[] {
  if (!Array.isArray(results)) return [];
  return results.filter((item): item is SerpResult => Boolean(item && typeof item === "object" && isPrivateSchoolCandidate(item as SerpResult))).map((result) => {
    const schoolName = text(result.title, 160);
    const address = text(result.address, 300);
    const normalizedName = normalizeSchoolName(schoolName);
    const googlePlaceId = text(result.place_id) || null;
    const googleDataId = text(result.data_id) || null;
    const stableValue = googlePlaceId || googleDataId || `${normalizedName}:${normalizeSchoolName(address)}`;
    const latitude = Number(result.gps_coordinates?.latitude);
    const longitude = Number(result.gps_coordinates?.longitude);
    const rating = Number(result.rating);
    const reviewCount = Number(result.reviews);
    return {
      schoolId: `TN-PS-${createHash("sha256").update(stableValue).digest("hex").slice(0, 16).toUpperCase()}`,
      schoolName,
      normalizedName,
      namePrefix3: normalizedName.slice(0, 3),
      address,
      district,
      state: "Tamil Nadu" as const,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      phone: text(result.phone, 40) || null,
      website: text(result.website, 300) || null,
      rating: Number.isFinite(rating) ? rating : null,
      reviewCount: Number.isFinite(reviewCount) ? Math.max(0, Math.round(reviewCount)) : null,
      schoolType: text(result.type, 100) || "School",
      googlePlaceId,
      googleDataId,
      googleDataCid: text(result.data_cid) || null,
      ownership: "PRIVATE_CANDIDATE" as const,
      verificationStatus: "DISCOVERED" as const,
      source: "SERPAPI_GOOGLE_MAPS" as const,
    };
  }).filter((school) => school.schoolName.length >= 3 && school.address);
}

async function serpPage(district: string, start: number, apiKey: string) {
  const params = new URLSearchParams({
    engine: "google_maps", type: "search", q: `private schools in ${district}, Tamil Nadu`,
    ll: "@11.1271,78.6569,7z", start: String(start), hl: "en", gl: "in", api_key: apiKey,
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error(`SerpAPI Google Maps returned ${response.status} for ${district}.`);
  const payload = await response.json() as { local_results?: unknown[]; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.local_results || [];
}

export async function discoverPrivateSchools(district: string, maxPages = 2) {
  const apiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("SERP_API_KEY is not configured.");
  const discovered: PrivateSchoolRecord[] = [];
  for (let page = 0; page < Math.min(Math.max(maxPages, 1), 6); page += 1) {
    const results = await serpPage(district, page * 20, apiKey);
    discovered.push(...normalizePrivateSchoolResults(results, district));
    if (results.length < 20) break;
  }
  return [...new Map(discovered.map((school) => [school.schoolId, school])).values()];
}

export async function savePrivateSchools(schools: PrivateSchoolRecord[], runId: string) {
  if (!schools.length) return 0;
  const projectId = process.env.GCP_PROJECT_ID || "chennaifood";
  const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
  const bigquery = new BigQuery({ projectId });
  const payload = JSON.stringify(schools);
  await bigquery.query({
    location: "asia-south1",
    params: { schoolsJson: payload, runId },
    query: `MERGE \`${projectId}.${datasetId}.private_schools\` T
      USING (
        SELECT
          JSON_VALUE(item, '$.schoolId') AS school_id, JSON_VALUE(item, '$.schoolName') AS school_name,
          JSON_VALUE(item, '$.normalizedName') AS normalized_name, JSON_VALUE(item, '$.namePrefix3') AS name_prefix_3,
          JSON_VALUE(item, '$.address') AS address, JSON_VALUE(item, '$.district') AS district,
          JSON_VALUE(item, '$.state') AS state, SAFE_CAST(JSON_VALUE(item, '$.latitude') AS FLOAT64) AS latitude,
          SAFE_CAST(JSON_VALUE(item, '$.longitude') AS FLOAT64) AS longitude, JSON_VALUE(item, '$.phone') AS phone,
          JSON_VALUE(item, '$.website') AS website, SAFE_CAST(JSON_VALUE(item, '$.rating') AS NUMERIC) AS rating,
          SAFE_CAST(JSON_VALUE(item, '$.reviewCount') AS INT64) AS review_count, JSON_VALUE(item, '$.schoolType') AS school_type,
          JSON_VALUE(item, '$.googlePlaceId') AS google_place_id, JSON_VALUE(item, '$.googleDataId') AS google_data_id,
          JSON_VALUE(item, '$.googleDataCid') AS google_data_cid, JSON_VALUE(item, '$.ownership') AS ownership,
          JSON_VALUE(item, '$.verificationStatus') AS verification_status, JSON_VALUE(item, '$.source') AS source
        FROM UNNEST(JSON_QUERY_ARRAY(PARSE_JSON(@schoolsJson))) AS item
      ) S ON T.school_id=S.school_id
      WHEN MATCHED THEN UPDATE SET school_name=S.school_name,normalized_name=S.normalized_name,name_prefix_3=S.name_prefix_3,address=S.address,district=S.district,state=S.state,latitude=S.latitude,longitude=S.longitude,phone=S.phone,website=S.website,rating=S.rating,review_count=S.review_count,school_type=S.school_type,google_place_id=S.google_place_id,google_data_id=S.google_data_id,google_data_cid=S.google_data_cid,ownership=S.ownership,verification_status=S.verification_status,source=S.source,last_seen_at=CURRENT_TIMESTAMP(),last_run_id=@runId,active=TRUE
      WHEN NOT MATCHED THEN INSERT (school_id,school_name,normalized_name,name_prefix_3,address,district,state,latitude,longitude,phone,website,rating,review_count,school_type,google_place_id,google_data_id,google_data_cid,ownership,verification_status,source,discovered_at,last_seen_at,last_run_id,active) VALUES (S.school_id,S.school_name,S.normalized_name,S.name_prefix_3,S.address,S.district,S.state,S.latitude,S.longitude,S.phone,S.website,S.rating,S.review_count,S.school_type,S.google_place_id,S.google_data_id,S.google_data_cid,S.ownership,S.verification_status,S.source,CURRENT_TIMESTAMP(),CURRENT_TIMESTAMP(),@runId,TRUE)`,
  });
  return schools.length;
}
