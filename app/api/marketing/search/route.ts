import { NextRequest, NextResponse } from "next/server";
import {
  audienceTypes, cityCenters, marketingCities, marketingGeography,
  type AudienceType, type MarketingCity, type MarketingLead,
} from "@/lib/marketing";

export const runtime = "nodejs";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
};

function isCity(value: string): value is MarketingCity {
  return marketingCities.includes(value as MarketingCity);
}
function isAudience(value: string): value is AudienceType { return value in audienceTypes; }

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not configured on the server." }, { status: 503 });
  const city = request.nextUrl.searchParams.get("city")?.trim() || "";
  const zone = request.nextUrl.searchParams.get("zone")?.trim() || "";
  const area = request.nextUrl.searchParams.get("area")?.trim() || "";
  const audience = request.nextUrl.searchParams.get("audience")?.trim() || "";
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim().slice(0, 80) || "";
  if (!isCity(city) || !isAudience(audience)) return NextResponse.json({ error: "Choose a supported city and audience." }, { status: 400 });
  const zones = marketingGeography[city] as Record<string, readonly string[]>;
  if (!zone || !zones[zone] || !area || !zones[zone].includes(area)) {
    return NextResponse.json({ error: "Choose a valid zone and area for the selected city." }, { status: 400 });
  }
  const query = `${keyword || audienceTypes[audience].searchTerm} in ${area}, ${city}, Tamil Nadu`;
  const center = cityCenters[city];
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName",
      },
      body: JSON.stringify({
        textQuery: query, pageSize: 20, languageCode: "en", regionCode: "IN",
        locationBias: { circle: { center, radius: 25_000 } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json() as { places?: GooglePlace[]; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: data.error?.message || "Google Places search failed." }, { status: response.status });
    const leads: MarketingLead[] = (data.places || []).flatMap((place, index) => {
      if (!place.displayName?.text) return [];
      return [{
        id: place.id || `${city}-${area}-${audience}-${index}`, placeId: place.id,
        name: place.displayName.text, type: place.primaryTypeDisplayName?.text || audienceTypes[audience].label,
        address: place.formattedAddress || `${area}, ${city}`, phone: place.nationalPhoneNumber,
        website: place.websiteUri, mapsUrl: place.googleMapsUri, rating: place.rating,
        reviews: place.userRatingCount, city, zone, area, audience, position: index + 1,
        latitude: place.location?.latitude, longitude: place.location?.longitude,
      }];
    });
    return NextResponse.json({ query, leads, provider: "Google Places API (New)", fetchedAt: new Date().toISOString() });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json({ error: timedOut ? "Google Places search timed out." : "Discovery is temporarily unavailable." }, { status: 502 });
  }
}
