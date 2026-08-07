import type { School } from "@/lib/meals";

export const supportedSchoolCities = {
  chennai: { name: "Chennai", latitude: 13.0827, longitude: 80.2707 },
  madurai: { name: "Madurai", latitude: 9.9252, longitude: 78.1198 },
  trichy: { name: "Trichy", latitude: 10.7905, longitude: 78.7047 },
  coimbatore: { name: "Coimbatore", latitude: 11.0168, longitude: 76.9558 },
} as const;

export type SchoolCityId = keyof typeof supportedSchoolCities;
export type SchoolSuggestion = {
  id: string;
  name: string;
  address: string;
  area: string;
  city: string;
  cityId: SchoolCityId;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  source: "lunchbox" | "google_maps";
  serviceability: "ACTIVE" | "NOT_ONBOARDED";
};

type SerpMapsResult = {
  title?: unknown;
  address?: unknown;
  type?: unknown;
  types?: unknown;
  place_id?: unknown;
  data_id?: unknown;
  gps_coordinates?: { latitude?: unknown; longitude?: unknown };
};

function clean(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function normalize(value: string) { return value.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, " ").trim(); }

function looksLikeSchool(result: SerpMapsResult) {
  const categories = [clean(result.type), ...(Array.isArray(result.types) ? result.types.map((item) => clean(item)) : [])].join(" ");
  const name = clean(result.title);
  return /school|vidyalaya|vidhyalaya|academy|matriculation|montessori|higher secondary|public school|international school|kendriya|college/i.test(`${categories} ${name}`);
}

function areaFromAddress(address: string, city: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => normalize(part) !== normalize(city) && !/tamil nadu|india|\d{6}/i.test(part)) || address;
}

export function onboardedSchoolSuggestions(schools: School[], cityId: SchoolCityId, query: string): SchoolSuggestion[] {
  const city = supportedSchoolCities[cityId].name;
  const normalizedQuery = normalize(query);
  return schools.filter((school) => school.city === city && normalize(school.name).startsWith(normalizedQuery)).map((school) => ({
    id: school.id,
    name: school.name,
    address: `${school.area}, ${city}, Tamil Nadu`,
    area: school.area,
    city,
    cityId,
    latitude: null,
    longitude: null,
    placeId: null,
    source: "lunchbox",
    serviceability: "ACTIVE",
  }));
}

export function serpSchoolSuggestions(results: unknown, cityId: SchoolCityId): SchoolSuggestion[] {
  const city = supportedSchoolCities[cityId].name;
  if (!Array.isArray(results)) return [];
  return results.filter((value): value is SerpMapsResult => Boolean(value && typeof value === "object" && looksLikeSchool(value as SerpMapsResult))).map((result) => {
    const name = clean(result.title, 120);
    const address = clean(result.address, 240);
    const placeId = clean(result.place_id || result.data_id, 300) || null;
    const latitude = Number(result.gps_coordinates?.latitude);
    const longitude = Number(result.gps_coordinates?.longitude);
    return {
      id: `external:${placeId || normalize(`${name}-${address}`)}`,
      name,
      address,
      area: areaFromAddress(address, city),
      city,
      cityId,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      placeId,
      source: "google_maps" as const,
      serviceability: "NOT_ONBOARDED" as const,
    };
  }).filter((school) => school.name && school.address);
}

export function mergeSchoolSuggestions(onboarded: SchoolSuggestion[], discovered: SchoolSuggestion[], query: string, limit = 10) {
  const normalizedQuery = normalize(query);
  const seen = new Set<string>();
  return [...onboarded, ...discovered].filter((school) => normalize(school.name).startsWith(normalizedQuery))
    .sort((left, right) => Number(normalize(right.name).startsWith(normalizedQuery)) - Number(normalize(left.name).startsWith(normalizedQuery)) || left.name.localeCompare(right.name))
    .filter((school) => {
      const key = school.placeId || `${normalize(school.name)}:${normalize(school.address)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
}
