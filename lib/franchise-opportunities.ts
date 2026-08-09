import { firestoreClient } from "@/lib/firestore";

export type FranchiseOpportunityStatus = "available" | "completed" | "coming_soon";

export type FranchiseOpportunityLocation = {
  id: string;
  name: string;
  zoneId: string;
  zoneName: string;
  status: FranchiseOpportunityStatus;
  franchiseCount: number;
  activeDriverCount: number;
  lat: number | null;
  lng: number | null;
};

export type FranchiseOpportunityZone = {
  id: string;
  name: string;
  icon: string;
  locations: FranchiseOpportunityLocation[];
};

const zoneMeta: Record<string, { name: string; icon: string; order: number }> = {
  north: { name: "North Chennai", icon: "⚓", order: 1 },
  central: { name: "Central Chennai", icon: "⌘", order: 2 },
  west: { name: "West Chennai", icon: "◒", order: 3 },
  south: { name: "South Chennai", icon: "⌁", order: 4 },
  omr: { name: "OMR & ECR", icon: "↗", order: 5 },
};

const cleanText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const cleanNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export async function getFranchiseOpportunities() {
  const snapshot = await firestoreClient().collection("franchise_locations").limit(300).get();
  const locations = snapshot.docs.map((document) => {
    const data = document.data();
    const zoneId = cleanText(data.zoneId).toLowerCase() || "other";
    const status = data.status === "completed" || data.status === "coming_soon" ? data.status : "available";
    return {
      id: document.id,
      name: cleanText(data.name) || document.id,
      zoneId,
      zoneName: cleanText(data.zoneName) || zoneMeta[zoneId]?.name || "Chennai",
      status,
      franchiseCount: Math.max(0, Number(data.franchiseCount) || 0),
      activeDriverCount: Math.max(0, Number(data.activeDriverCount) || 0),
      lat: cleanNumber(data.lat),
      lng: cleanNumber(data.lng),
    } satisfies FranchiseOpportunityLocation;
  });
  const grouped = new Map<string, FranchiseOpportunityZone>();
  for (const location of locations) {
    const meta = zoneMeta[location.zoneId] || { name: location.zoneName, icon: "•", order: 99 };
    const existing = grouped.get(location.zoneId) || { id: location.zoneId, name: location.zoneName || meta.name, icon: meta.icon, locations: [] };
    existing.locations.push(location);
    grouped.set(location.zoneId, existing);
  }
  const zones = [...grouped.values()].sort((a, b) => (zoneMeta[a.id]?.order || 99) - (zoneMeta[b.id]?.order || 99));
  zones.forEach((zone) => zone.locations.sort((a, b) => a.name.localeCompare(b.name)));
  return { zones, source: "firestore" as const };
}
