import { firestoreClient } from "@/lib/firestore";

export type Franchise = {
  id: string; name: string; city: string; address: string; phone: string; email: string; description: string;
  imageUrl: string; category: string; companyName: string; area: string; website: string; rating: number | null;
  reviews: number | null; mapsUrl: string; sourceUrl: string; lastVerifiedAt: string; studentCount: number;
  location: { lat: number; lng: number } | null;
};
type FranchiseFilters = { area?: string; category?: string; search?: string; limit?: number };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
export function franchiseFrom(id: string, value: Record<string, unknown>): Franchise {
  const location = value.location as { lat?: unknown; lng?: unknown } | undefined;
  return {
    id, name: text(value.name), city: text(value.city) || "Chennai", address: text(value.address), phone: text(value.phone), email: text(value.email),
    description: text(value.description), imageUrl: text(value.image_url ?? value.imageUrl), category: text(value.category) || "LunchBox franchise partner",
    companyName: text(value.company_name ?? value.companyName), area: text(value.area), website: text(value.website), rating: numeric(value.rating), reviews: numeric(value.reviews),
    mapsUrl: text(value.maps_url ?? value.mapsUrl), sourceUrl: "", lastVerifiedAt: text(value.updated_at ?? value.lastVerifiedAt),
    studentCount: Math.max(0, Number(value.student_count ?? value.studentCount) || 0),
    location: location && typeof location.lat === "number" && typeof location.lng === "number" ? { lat: location.lat, lng: location.lng } : null,
  };
}
const limit = (value?: number) => Math.min(Math.max(Number.isFinite(value) ? Math.trunc(value!) : 1000, 1), 1000);
export async function getFranchises(filters: FranchiseFilters = {}) {
  const snapshot = await firestoreClient().collection("franchises").where("status", "==", "ACTIVE").limit(limit(filters.limit)).get();
  const term = filters.search?.trim().toLowerCase();
  const records = snapshot.docs.map((document) => franchiseFrom(document.id, document.data())).filter((item) =>
    (!filters.area || item.area === filters.area) && (!filters.category || item.category === filters.category) &&
    (!term || [item.name, item.companyName, item.area, item.category].join(" ").toLowerCase().includes(term)));
  return { franchises: records.sort((a, b) => a.name.localeCompare(b.name)), source: "firestore" as const };
}
export async function getFranchise(id: string) {
  const document = await firestoreClient().collection("franchises").doc(id).get();
  return document.exists && document.get("status") === "ACTIVE" ? franchiseFrom(document.id, document.data() || {}) : null;
}
export function externalUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : ""; } catch { return ""; }
}
