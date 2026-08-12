import { BigQuery } from "@google-cloud/bigquery";
import {
  dedupeInstitutions,
  eventStatuses,
  eventTypes,
  isMarketingInstitutionType,
  type MarketingEvent,
  type MarketingEventInstitution,
  type MarketingEventStatus,
  type MarketingEventType,
} from "@/lib/marketing-events";
import { marketingCities, type MarketingCity } from "@/lib/marketing";

const projectId = process.env.GCP_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
const eventsTable = process.env.BIGQUERY_MARKETING_EVENTS_TABLE || "marketing_events";
const institutionsTable = process.env.BIGQUERY_MARKETING_EVENT_INSTITUTIONS_TABLE || "marketing_event_institutions";
const locationsTable = process.env.BIGQUERY_MARKETING_LOCATIONS_TABLE || "marketing_locations";

export type MarketingEventValidationResult =
  | { ok: true; event: MarketingEvent }
  | { ok: false; errors: string[] };

type MarketingEventRow = {
  event_id: string;
  title: string;
  event_type: MarketingEventType;
  city: MarketingCity;
  zone?: string | null;
  area?: string | null;
  scheduled_date: string | { value: string };
  scheduled_time_start: string;
  scheduled_time_end: string;
  venue: string;
  owner_name: string;
  status: MarketingEventStatus;
  expected_attendance?: number | null;
  actual_attendance?: number | null;
  leads_generated_count?: number | null;
  notes?: string | null;
  created_at: string | { value: string };
  updated_at: string | { value: string };
  institutions?: Array<{ institutionId: string; institutionType: string; name?: string | null }>;
};

function client() {
  return projectId ? new BigQuery({ projectId }) : null;
}

function table(name: string) {
  return `\`${projectId}.${datasetId}.${name}\``;
}

function scalarDate(value: string | { value: string }) {
  return typeof value === "string" ? value : value.value;
}

function scalarTimestamp(value: string | { value: string }) {
  return typeof value === "string" ? value : value.value;
}

export function validateMarketingEventPayload(value: unknown): MarketingEventValidationResult {
  const errors: string[] = [];
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<MarketingEvent> : null;
  if (!record) return { ok: false, errors: ["Event payload must be an object."] };

  const eventId = typeof record.eventId === "string" ? record.eventId.trim() : "";
  if (!eventId || eventId.length > 300) errors.push("eventId is required and must be 300 characters or fewer.");
  if (!record.title?.trim()) errors.push("title is required.");
  if (!eventTypes.includes(record.eventType as MarketingEventType)) errors.push("eventType is not supported.");
  if (!marketingCities.includes(record.city as MarketingCity)) errors.push("city is not supported.");
  if (!eventStatuses.includes(record.status as MarketingEventStatus)) errors.push("status is not supported.");
  if (!record.scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.scheduledDate)) errors.push("scheduledDate must use YYYY-MM-DD.");
  if (!record.scheduledTimeStart?.trim()) errors.push("scheduledTimeStart is required.");
  if (!record.scheduledTimeEnd?.trim()) errors.push("scheduledTimeEnd is required.");
  if (!record.venue?.trim()) errors.push("venue is required.");
  if (!record.ownerName?.trim()) errors.push("ownerName is required.");

  const institutions = Array.isArray(record.institutions) ? record.institutions : [];
  const normalized = dedupeInstitutions(institutions.flatMap((institution) => {
    const institutionId = typeof institution.institutionId === "string" ? institution.institutionId.trim() : "";
    if (!institutionId || institutionId.length > 300) {
      errors.push("Each institution requires a valid institutionId.");
      return [];
    }
    if (!isMarketingInstitutionType(institution.institutionType)) {
      errors.push(`Unsupported institution type for ${institutionId}.`);
      return [];
    }
    return [{ institutionId, institutionType: institution.institutionType }];
  }));

  if (errors.length) return { ok: false, errors };
  const now = new Date().toISOString();
  return {
    ok: true,
    event: {
      eventId,
      title: record.title!.trim(),
      eventType: record.eventType as MarketingEventType,
      city: record.city as MarketingCity,
      zone: record.zone || "",
      area: record.area || "",
      institutions: normalized,
      scheduledDate: record.scheduledDate!,
      scheduledTimeStart: record.scheduledTimeStart!,
      scheduledTimeEnd: record.scheduledTimeEnd!,
      venue: record.venue!.trim(),
      ownerName: record.ownerName!.trim(),
      status: record.status as MarketingEventStatus,
      expectedAttendance: record.expectedAttendance,
      actualAttendance: record.actualAttendance,
      leadsGeneratedCount: record.leadsGeneratedCount,
      notes: record.notes || "",
      createdAt: record.createdAt || now,
      updatedAt: record.updatedAt || now,
    },
  };
}

export function marketingEventFromBigQueryRow(row: MarketingEventRow): MarketingEvent {
  const institutions = dedupeInstitutions((row.institutions || []).flatMap((institution) => {
    if (!isMarketingInstitutionType(institution.institutionType)) return [];
    return [{ institutionId: institution.institutionId, institutionType: institution.institutionType, name: institution.name || undefined }];
  }));
  return {
    eventId: row.event_id,
    title: row.title,
    eventType: row.event_type,
    city: row.city,
    zone: row.zone || "",
    area: row.area || "",
    institutions,
    scheduledDate: scalarDate(row.scheduled_date),
    scheduledTimeStart: row.scheduled_time_start,
    scheduledTimeEnd: row.scheduled_time_end,
    venue: row.venue,
    ownerName: row.owner_name,
    status: row.status,
    expectedAttendance: row.expected_attendance ?? undefined,
    actualAttendance: row.actual_attendance ?? undefined,
    leadsGeneratedCount: row.leads_generated_count ?? undefined,
    notes: row.notes || "",
    createdAt: scalarTimestamp(row.created_at),
    updatedAt: scalarTimestamp(row.updated_at),
  };
}

export function marketingEventsReadQuery() {
  return `
SELECT
  events.event_id,
  events.title,
  events.event_type,
  events.city,
  events.zone,
  events.area,
  events.scheduled_date,
  events.scheduled_time_start,
  events.scheduled_time_end,
  events.venue,
  events.owner_name,
  events.status,
  events.expected_attendance,
  events.actual_attendance,
  events.leads_generated_count,
  events.notes,
  events.created_at,
  events.updated_at,
  ARRAY(
    SELECT AS STRUCT
      mapping.institution_id AS institutionId,
      mapping.institution_type AS institutionType,
      location.name AS name
    FROM ${table(institutionsTable)} AS mapping
    JOIN ${table(locationsTable)} AS location
      ON location.location_id = mapping.institution_id
      AND location.location_type = mapping.institution_type
    WHERE mapping.event_id = events.event_id
      AND mapping.institution_type IN ("schools", "colleges")
    ORDER BY location.name, mapping.institution_id
  ) AS institutions
FROM ${table(eventsTable)} AS events
ORDER BY scheduled_date DESC, scheduled_time_start DESC, title`;
}

export function marketingEventSaveQuery() {
  return `
BEGIN TRANSACTION;

MERGE ${table(eventsTable)} AS target
USING (
  SELECT
    @event_id AS event_id,
    @title AS title,
    @event_type AS event_type,
    @city AS city,
    @zone AS zone,
    @area AS area,
    DATE(@scheduled_date) AS scheduled_date,
    @scheduled_time_start AS scheduled_time_start,
    @scheduled_time_end AS scheduled_time_end,
    @venue AS venue,
    @owner_name AS owner_name,
    @status AS status,
    @expected_attendance AS expected_attendance,
    @actual_attendance AS actual_attendance,
    @leads_generated_count AS leads_generated_count,
    @notes AS notes,
    TIMESTAMP(@created_at) AS created_at,
    TIMESTAMP(@updated_at) AS updated_at
) AS source
ON target.event_id = source.event_id
WHEN MATCHED THEN UPDATE SET
  title = source.title,
  event_type = source.event_type,
  city = source.city,
  zone = source.zone,
  area = source.area,
  scheduled_date = source.scheduled_date,
  scheduled_time_start = source.scheduled_time_start,
  scheduled_time_end = source.scheduled_time_end,
  venue = source.venue,
  owner_name = source.owner_name,
  status = source.status,
  expected_attendance = source.expected_attendance,
  actual_attendance = source.actual_attendance,
  leads_generated_count = source.leads_generated_count,
  notes = source.notes,
  updated_at = source.updated_at
WHEN NOT MATCHED THEN INSERT (
  event_id, title, event_type, city, zone, area, linked_lead_ids, scheduled_date,
  scheduled_time_start, scheduled_time_end, venue, owner_name, status,
  expected_attendance, actual_attendance, leads_generated_count, notes, created_at, updated_at
) VALUES (
  source.event_id, source.title, source.event_type, source.city, source.zone, source.area, [],
  source.scheduled_date, source.scheduled_time_start, source.scheduled_time_end, source.venue,
  source.owner_name, source.status, source.expected_attendance, source.actual_attendance,
  source.leads_generated_count, source.notes, source.created_at, source.updated_at
);

DELETE FROM ${table(institutionsTable)}
WHERE event_id = @event_id
  AND NOT EXISTS (
    SELECT 1
    FROM UNNEST(@institutions) AS desired
    WHERE desired.institution_id = institution_id
      AND desired.institution_type = institution_type
  );

MERGE ${table(institutionsTable)} AS target
USING (
  SELECT DISTINCT institution_id, institution_type
  FROM UNNEST(@institutions)
) AS source
ON target.event_id = @event_id
  AND target.institution_id = source.institution_id
WHEN MATCHED THEN UPDATE SET
  institution_type = source.institution_type,
  updated_at = TIMESTAMP(@updated_at)
WHEN NOT MATCHED THEN
  INSERT (event_id, institution_id, institution_type, created_at, updated_at)
  VALUES (@event_id, source.institution_id, source.institution_type, TIMESTAMP(@updated_at), TIMESTAMP(@updated_at));

COMMIT TRANSACTION;`;
}

export async function listMarketingEvents() {
  const bigquery = client();
  if (!bigquery) return { mode: "demo" as const, events: [] as MarketingEvent[] };
  const [rows] = await bigquery.query({ query: marketingEventsReadQuery(), params: {} });
  return { mode: "gcp" as const, events: (rows as MarketingEventRow[]).map(marketingEventFromBigQueryRow) };
}

export async function verifyMarketingInstitutions(institutions: MarketingEventInstitution[]) {
  const bigquery = client();
  if (!bigquery || institutions.length === 0) return { mode: bigquery ? "gcp" as const : "demo" as const, missing: [] as MarketingEventInstitution[] };
  const [rows] = await bigquery.query({
    query: `
SELECT location_id, location_type
FROM ${table(locationsTable)}
WHERE location_type IN ("schools", "colleges")
  AND location_id IN UNNEST(@institution_ids)`,
    params: { institution_ids: institutions.map((institution) => institution.institutionId) },
  });
  const existing = new Set((rows as Array<{ location_id: string; location_type: string }>).map((row) => `${row.location_type}:${row.location_id}`));
  return { mode: "gcp" as const, missing: institutions.filter((institution) => !existing.has(`${institution.institutionType}:${institution.institutionId}`)) };
}

export async function saveMarketingEvent(event: MarketingEvent) {
  const bigquery = client();
  if (!bigquery) return { mode: "demo" as const, saved: true };
  const institutions = dedupeInstitutions(event.institutions);
  await bigquery.query({
    query: marketingEventSaveQuery(),
    params: {
      event_id: event.eventId,
      title: event.title,
      event_type: event.eventType,
      city: event.city,
      zone: event.zone || null,
      area: event.area || null,
      scheduled_date: event.scheduledDate,
      scheduled_time_start: event.scheduledTimeStart,
      scheduled_time_end: event.scheduledTimeEnd,
      venue: event.venue,
      owner_name: event.ownerName,
      status: event.status,
      expected_attendance: event.expectedAttendance ?? null,
      actual_attendance: event.actualAttendance ?? null,
      leads_generated_count: event.leadsGeneratedCount ?? null,
      notes: event.notes || null,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
      institutions: institutions.map((institution) => ({ institution_id: institution.institutionId, institution_type: institution.institutionType })),
    },
  });
  return { mode: "gcp" as const, saved: true };
}

export async function deleteMarketingEvent(eventId: string) {
  const bigquery = client();
  if (!bigquery) return { mode: "demo" as const, deleted: true };
  await bigquery.query({
    query: `
BEGIN TRANSACTION;
DELETE FROM ${table(institutionsTable)} WHERE event_id = @event_id;
DELETE FROM ${table(eventsTable)} WHERE event_id = @event_id;
COMMIT TRANSACTION;`,
    params: { event_id: eventId },
  });
  return { mode: "gcp" as const, deleted: true };
}

