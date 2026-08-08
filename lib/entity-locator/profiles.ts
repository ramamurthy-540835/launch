import type { EntityType } from "@/lib/entity-locator/types";

export type EntitySearchProfile = {
  entityType: EntityType;
  label: string;
  collection: "offices" | "companies";
  idPrefix: "OFFICE" | "COMPANY";
  googleQueryTerm: string;
  serpQueryTerms: readonly string[];
  preferredTypes: readonly string[];
  includePattern: RegExp;
  excludePattern: RegExp;
};

export const ENTITY_PROFILES: Record<EntityType, EntitySearchProfile> = {
  office: {
    entityType: "office",
    label: "Office",
    collection: "offices",
    idPrefix: "OFFICE",
    googleQueryTerm: "office",
    serpQueryTerms: ["office", "corporate office"],
    preferredTypes: ["corporate_office", "business_center", "business_park", "office", "software_company"],
    includePattern: /\b(office|corporate|business (?:center|centre|park)|it park|software|bpo|consulting|regional|head office|branch|financial services|professional services|workspace|cowork|co-work)\b/i,
    excludePattern: /\b(school|college|university|hospital|restaurant|cafe|shop|store|apartment|residency|temple|salon|gym|cinema|theatre)\b/i,
  },
  company: {
    entityType: "company",
    label: "Company",
    collection: "companies",
    idPrefix: "COMPANY",
    googleQueryTerm: "company",
    serpQueryTerms: ["company", "private limited"],
    preferredTypes: ["corporate_office", "company", "software_company", "manufacturer", "consultant"],
    includePattern: /\b(company|companies|private limited|pvt\.? ltd|limited|ltd|llp|technologies|technology|solutions|industries|enterprise|consulting|logistics|software|services|systems|manufacturing|corporation)\b/i,
    excludePattern: /\b(school|college|university|hospital|restaurant|cafe|apartment|temple|salon|gym|cinema|theatre|dance|music|studio|fitness)\b/i,
  },
};

export function isEntityType(value: string): value is EntityType {
  return value === "office" || value === "company";
}
