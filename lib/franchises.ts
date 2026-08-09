import { firestoreClient } from "@/lib/firestore";

export type Franchise = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  imageUrl: string;
  category: string;
  companyName: string;
  area: string;
  website: string;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string;
  sourceUrl: string;
  lastVerifiedAt: string;
  studentCount: number;
  location: { lat: number; lng: number } | null;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function numberOrNull(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function franchiseFrom(id: string, value: Record<string, unknown>): Franchise {
  return {
    id, name: text(value.name), city: text(value.city) || "Chennai", address: text(value.address), phone: text(value.phone), email: text(value.email),
    description: text(value.description), imageUrl: text(value.imageUrl), category: text(value.category), companyName: text(value.companyName), area: text(value.area),
    website: text(value.website), rating: numberOrNull(value.rating), reviews: numberOrNull(value.reviews), mapsUrl: text(value.mapsUrl), sourceUrl: text(value.sourceUrl),
    lastVerifiedAt: text(value.lastVerifiedAt), studentCount: Math.max(0, Number(value.studentCount) || 0), location: value.location && typeof value.location === "object" && typeof (value.location as { lat?: unknown }).lat === "number" && typeof (value.location as { lng?: unknown }).lng === "number" ? value.location as { lat: number; lng: number } : null,
  };
}

export async function getFranchises(filters: { area?: string; category?: string; search?: string; limit?: number } = {}) {
  const snapshot = await firestoreClient().collection("franchises").where("status", "==", "active").limit(Math.min(Math.max(filters.limit || 100, 1), 250)).get();
  const term = filters.search?.trim().toLowerCase();
  const records = snapshot.docs.map((document) => franchiseFrom(document.id, document.data())).filter((item) => (!filters.area || item.area === filters.area) && (!filters.category || item.category === filters.category) && (!term || [item.name, item.companyName, item.area, item.category].join(" ").toLowerCase().includes(term)));
  return { franchises: records.sort((a, b) => a.name.localeCompare(b.name)), source: "firestore" as const };
}

export async function getFranchise(id: string) {
  const document = await firestoreClient().collection("franchises").doc(id).get();
  return document.exists ? franchiseFrom(document.id, document.data() || {}) : null;
}

export function externalUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : ""; } catch { return ""; }
}
