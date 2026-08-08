import { createHash } from "node:crypto";
import { FieldValue } from "@google-cloud/firestore";
import { entityAnalytics, entityDirectory } from "@/lib/entity-locator";
import { buildEntitySearchKeywords, normalizeEntityName } from "@/lib/entity-locator/normalization";
import { ENTITY_PROFILES } from "@/lib/entity-locator/profiles";
import type { EntityType, LocationEntityResult } from "@/lib/entity-locator/types";
import { firestoreClient } from "@/lib/firestore";
import { CITY_BY_CODE, ZONE_BY_CODE, type CityCode, type ZoneCode } from "@/lib/school-locator/territories";

function text(body: Record<string, unknown>, key: string, max: number) { return typeof body[key] === "string" ? body[key].trim().slice(0, max) : ""; }
function nullableText(body: Record<string, unknown>, key: string, max: number) { return text(body, key, max) || null; }
function nullableInteger(body: Record<string, unknown>, key: string) {
  const value = body[key]; if (value === "" || value === null || value === undefined) return null;
  const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : NaN;
}

export function createManualEntity(entityType: EntityType, body: Record<string, unknown>): { entity?: LocationEntityResult; error?: string } {
  const name = text(body, "display_name", 160);
  const address = text(body, "formatted_address", 300);
  const locality = text(body, "locality", 100);
  const postalCode = text(body, "postal_code", 6);
  const cityCode = text(body, "city_code", 20).toUpperCase() as CityCode;
  const zoneCode = text(body, "zone_code", 40).toUpperCase() as ZoneCode;
  const city = CITY_BY_CODE.get(cityCode); const zone = ZONE_BY_CODE.get(zoneCode);
  if (name.length < 3 || address.length < 5 || locality.length < 2 || !/^\d{6}$/.test(postalCode) || !city || !zone || zone.city.code !== city.code) {
    return { error: `Enter a valid ${entityType} name, address, locality, city, zone and six-digit pincode.` };
  }
  const normalizedName = normalizeEntityName(name);
  const profile = ENTITY_PROFILES[entityType];
  const id = `MANUAL-${profile.idPrefix}-${createHash("sha256").update(`${cityCode}:${zoneCode}:${normalizedName}:${postalCode}`).digest("hex").slice(0, 20).toUpperCase()}`;
  return { entity: {
    id, entity_type: entityType, display_name: name, normalized_name: normalizedName, formatted_address: address,
    locality, sub_locality: null, zone_code: zoneCode, zone_name: zone.name, city_code: cityCode, city_name: city.name,
    state: "Tamil Nadu", postal_code: postalCode, latitude: null, longitude: null, provider: "manual",
    provider_place_id: null, category: null, verification_status: "unverified", confidence: 0.5, is_active: true,
    search_keywords: buildEntitySearchKeywords(name), zone_resolution: "locality", company_id: null, legal_name: null,
    company_type: null, industry: null, primary_office_id: null, website: null, phone: null, email: null, gstin: null, cin: null,
    employee_strength: null, student_strength: null,
  } };
}

export type RegistrationResult = { referenceId?: string; status?: "RECEIVED"; error?: string };
export function registrationEntityFields(entity: LocationEntityResult) {
  return {
    [`${entity.entity_type}_id`]: entity.id,
    display_name: entity.display_name,
    formatted_address: entity.formatted_address,
    locality: entity.locality,
    city_code: entity.city_code,
    zone_code: entity.zone_code,
    latitude: entity.latitude,
    longitude: entity.longitude,
    provider: entity.provider,
    source_place_id: entity.provider_place_id,
  };
}
export async function registerEntity(entityType: EntityType, body: Record<string, unknown>, defer: (task: () => Promise<void>) => void = (task) => queueMicrotask(() => void task().catch(() => undefined))): Promise<RegistrationResult> {
  const entityId = text(body, `${entityType}_id`, 100);
  if (!/^[A-Z0-9-]{8,100}$/i.test(entityId)) return { error: `Select a valid ${entityType} before registering.` };
  const entity = await entityDirectory.getById(entityType, entityId);
  if (!entity || !entity.is_active) return { error: `The selected ${entityType} is unavailable.` };
  const contactPhone = nullableText(body, "contact_phone", 15);
  const contactEmail = nullableText(body, "contact_email", 160);
  if (contactPhone && !/^(?:\+91)?[6-9]\d{9}$/.test(contactPhone.replace(/[\s-]/g, ""))) return { error: "Enter a valid Indian mobile number." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: "Enter a valid email address." };
  const strengthField = entityType === "college" ? "student_strength" : "employee_strength";
  const employeeStrength = nullableInteger(body, strengthField);
  const expectedLunchUsers = nullableInteger(body, "expected_lunch_users");
  if (Number.isNaN(employeeStrength) || Number.isNaN(expectedLunchUsers) || employeeStrength === 0) return { error: `${entityType === "college" ? "Student" : "Employee"} strength must be a positive whole number and lunch users must be zero or more.` };
  if (employeeStrength !== null && expectedLunchUsers !== null && expectedLunchUsers > employeeStrength) return { error: `Expected lunch users cannot exceed ${entityType === "college" ? "student" : "employee"} strength.` };
  const prefix = entityType === "office" ? "OR" : entityType === "company" ? "CR" : "CLR";
  const referenceId = `${prefix}-${createHash("sha256").update(`${entity.id}:${Date.now()}`).digest("hex").slice(0, 10).toUpperCase()}`;
  const collection = `${entityType}_registrations`;
  await firestoreClient().collection(collection).doc(referenceId).set({
    registration_id: referenceId, ...registrationEntityFields(entity),
    ...(entityType === "office" ? { company_id: nullableText(body, "company_id", 100) } : entityType === "company" ? { primary_office_id: nullableText(body, "primary_office_id", 100) } : {}),
    contact_name: nullableText(body, "contact_name", 120), contact_designation: nullableText(body, "contact_designation", 120),
    contact_phone: contactPhone, contact_email: contactEmail,
    employee_strength: entityType === "college" ? null : employeeStrength,
    student_strength: entityType === "college" ? employeeStrength : null,
    expected_lunch_users: expectedLunchUsers, meal_interest: nullableText(body, "meal_interest", 80),
    existing_food_vendor: nullableText(body, "existing_food_vendor", 160), preferred_meal_time: nullableText(body, "preferred_meal_time", 40),
    meal_price_range: nullableText(body, "meal_price_range", 80), status: "RECEIVED", created_at: FieldValue.serverTimestamp(),
    office_type: entityType === "office" ? nullableText(body, "office_type", 100) : null,
    employees_in_office_daily: entityType === "office" ? nullableInteger(body, "employees_in_office_daily") : null,
    lunch_shift_count: entityType === "office" ? nullableInteger(body, "lunch_shift_count") : null,
    cafeteria_available: entityType === "office" ? nullableText(body, "cafeteria_available", 20) : null,
    company_type: entityType === "company" ? nullableText(body, "company_type", 100) : null,
    industry: entityType === "company" ? nullableText(body, "industry", 120) : null,
    number_of_offices: entityType === "company" ? nullableInteger(body, "number_of_offices") : null,
    city_employee_strength: entityType === "company" ? nullableInteger(body, "city_employee_strength") : null,
    college_type: entityType === "college" ? nullableText(body, "college_type", 100) : null,
    student_hostel_available: entityType === "college" ? nullableText(body, "student_hostel_available", 20) : null,
  });
  defer(async () => { await entityAnalytics.recordRegistration(entity, entity.provider).catch(() => undefined); });
  return { referenceId, status: "RECEIVED" };
}
