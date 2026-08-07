import { BigQuery } from "@google-cloud/bigquery";
import { NextResponse } from "next/server";
import { enforceRateLimit, RateLimitError } from "@/lib/hardening";
import { logError, requestId } from "@/lib/logging";
import { normalizeSchoolName } from "@/lib/private-school-discovery";

export const runtime = "nodejs";

const cityDistricts: Record<string, string> = {
  chennai: "Chennai", madurai: "Madurai", trichy: "Tiruchirappalli", coimbatore: "Coimbatore",
};

type SchoolRow = {
  school_id: string; school_name: string; address: string; district: string; latitude: number | null;
  longitude: number | null; google_place_id: string | null; rating: number | null; review_count: number | null;
};

export async function GET(request: Request) {
  const correlationId = requestId(request);
  try {
    const url = new URL(request.url);
    const prefix = normalizeSchoolName((url.searchParams.get("q") || "").slice(0, 80));
    const cityId = (url.searchParams.get("city") || "").toLowerCase();
    if (prefix.length < 3) return NextResponse.json({ error: "Enter at least the first three letters of the school name." }, { status: 400 });
    if (cityId && !(cityId in cityDistricts)) return NextResponse.json({ error: "Choose a supported city." }, { status: 400 });
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await enforceRateLimit("private_school_autocomplete", forwardedFor, 60, 60);

    const projectId = process.env.GCP_PROJECT_ID || "chennaifood";
    const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
    const [rows] = await new BigQuery({ projectId }).query({
      location: "asia-south1",
      params: { prefix, district: cityId ? cityDistricts[cityId] : "" },
      query: `SELECT school_id,school_name,address,district,latitude,longitude,google_place_id,rating,review_count
        FROM \`${projectId}.${datasetId}.private_schools\`
        WHERE active=TRUE AND state='Tamil Nadu' AND ownership='PRIVATE_CANDIDATE'
          AND STARTS_WITH(normalized_name, @prefix)
          AND (@district='' OR district=@district)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY school_id ORDER BY last_seen_at DESC)=1
        ORDER BY normalized_name, district LIMIT 15`,
    });
    const suggestions = (rows as SchoolRow[]).map((row) => ({
      id: row.school_id, name: row.school_name, address: row.address, district: row.district, state: "Tamil Nadu",
      latitude: row.latitude, longitude: row.longitude, placeId: row.google_place_id, rating: row.rating,
      reviewCount: row.review_count, source: "google_maps", schoolOwnership: "PRIVATE_CANDIDATE", serviceability: "NOT_ONBOARDED",
    }));
    return NextResponse.json({ suggestions, prefix, match: "starts_with" }, { headers: { "Cache-Control": "private, max-age=60", "X-Request-Id": correlationId } });
  } catch (error) {
    logError("private_school.autocomplete_failed", error, { correlationId });
    return NextResponse.json({ error: error instanceof RateLimitError ? error.message : "Private-school search is temporarily unavailable.", correlationId }, { status: error instanceof RateLimitError ? 429 : 500 });
  }
}
