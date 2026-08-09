export const marketingCities = ["Chennai", "Madurai", "Trichy", "Coimbatore"] as const;

export const marketingGeography = {
  Chennai: {
    "North Chennai": ["Tiruvottiyur", "Manali", "Madhavaram", "Tondiarpet", "Royapuram"],
    "South Chennai": ["Adyar", "Velachery", "Thiruvanmiyur", "Sholinganallur", "Tambaram"],
    "West Chennai": ["Anna Nagar", "Ambattur", "Mogappair", "Porur", "Poonamallee"],
    "East-Central Chennai": ["Mylapore", "T Nagar", "Nungambakkam", "Egmore", "Perambur"],
  },
  Madurai: {
    "Madurai North": ["Tallakulam", "K Pudur", "Iyer Bungalow", "Oomachikulam"],
    "Madurai South": ["Thirunagar", "Avaniyapuram", "Villapuram", "Thiruparankundram"],
    "Madurai East": ["Anna Nagar", "KK Nagar", "Mattuthavani", "Vandiyur"],
    "Madurai West": ["Arasaradi", "Kalavasal", "Kochadai", "Nagamalai Pudukottai"],
  },
  Trichy: {
    "Trichy North": ["Srirangam", "Thiruvanaikoil", "Samayapuram", "No. 1 Tollgate"],
    "Trichy South": ["KK Nagar", "Airport", "Edamalaipatti Pudur", "Panjappur"],
    "Trichy East": ["Cantonment", "Thillai Nagar", "Woraiyur", "Tennur"],
    "Trichy West": ["Vayalur", "Somarasampettai", "Karumandapam", "Ramji Nagar"],
  },
  Coimbatore: {
    "Coimbatore North": ["Thudiyalur", "Vadavalli", "Koundampalayam", "Saravanampatti"],
    "Coimbatore South": ["Sundarapuram", "Kuniyamuthur", "Podanur", "Eachanari"],
    "Coimbatore East": ["Peelamedu", "Singanallur", "Kalapatti", "Vilankurichi"],
    "Coimbatore West": ["RS Puram", "Saibaba Colony", "Gandhipuram", "Selvapuram"],
  },
} as const;

export const cityCenters: Record<MarketingCity, { latitude: number; longitude: number }> = {
  Chennai: { latitude: 13.0827, longitude: 80.2707 },
  Madurai: { latitude: 9.9252, longitude: 78.1198 },
  Trichy: { latitude: 10.7905, longitude: 78.7047 },
  Coimbatore: { latitude: 11.0168, longitude: 76.9558 },
};

export const audienceTypes = {
  schools: {
    label: "Schools",
    searchTerm: "schools",
    intent: "Reach principals, coordinators and parent communities",
  },
  apartments: {
    label: "Apartment communities",
    searchTerm: "apartment complexes",
    intent: "Reach resident associations and families",
  },
  parent_hubs: {
    label: "Parent hubs",
    searchTerm: "kids activity centres and tuition centres",
    intent: "Find places where parents already gather",
  },
} as const;

export type MarketingCity = (typeof marketingCities)[number];
export type AudienceType = keyof typeof audienceTypes;

export type MarketingLead = {
  id: string;
  name: string;
  type: string;
  address: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  rating?: number;
  reviews?: number;
  city: MarketingCity;
  audience: AudienceType;
  position: number;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  zone?: string;
  area?: string;
};

export type NearbySearch = {
  school: MarketingLead;
  radiusKm: number;
  communities: MarketingLead[];
  fetchedAt: string;
};
