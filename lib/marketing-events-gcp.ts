import { BigQuery } from "@google-cloud/bigquery";
import type { MarketingEvent } from "@/lib/marketing-events";

const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GCP_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
const eventsTable = process.env.BIGQUERY_MARKETING_EVENTS_TABLE || "marketing_events";

function client() {
  return projectId ? new BigQuery({ projectId }) : null;
}

function tableReference() {
  if (!projectId) throw new Error("BigQuery is not configured.");
  return `\`${projectId}.${datasetId}.${eventsTable}\``;
}

export async function listMarketingEvents() {
  const bigquery = client();
  if (!bigquery) return { mode: "demo" as const, events: [] as MarketingEvent[] };
  const [rows] = await bigquery.query({
    query: `SELECT event_id, event_category, event_title, scheduled_date, scheduled_time_start, scheduled_time_end, city, zone, area, venue, owner_name, status, linked_lead_ids, expected_attendance, actual_attendance, leads_generated_count, notes, created_at, updated_at FROM ${tableReference()} ORDER BY scheduled_date, scheduled_time_start`,
  });
  const value = (input: unknown) => typeof input === "object" && input && "value" in input ? String((input as { value: unknown }).value) : String(input || "");
  return {
    mode: "gcp" as const,
    events: rows.map((row) => ({
      eventId: row.event_id,
      eventCategory: row.event_category,
      title: row.event_title,
      scheduledDate: value(row.scheduled_date),
      scheduledTimeStart: value(row.scheduled_time_start).slice(0, 5),
      scheduledTimeEnd: value(row.scheduled_time_end).slice(0, 5),
      city: row.city,
      zone: row.zone || "",
      area: row.area || "",
      venue: row.venue,
      ownerName: row.owner_name,
      status: row.status,
      linkedLeadIds: row.linked_lead_ids || [],
      expectedAttendance: row.expected_attendance ?? undefined,
      actualAttendance: row.actual_attendance ?? undefined,
      leadsGeneratedCount: row.leads_generated_count ?? undefined,
      notes: row.notes || "",
      createdAt: value(row.created_at),
      updatedAt: value(row.updated_at),
    })) as MarketingEvent[],
  };
}

export async function saveMarketingEvent(event: MarketingEvent) {
  const bigquery = client();
  if (!bigquery) return "demo" as const;
  await bigquery.query({
    query: `MERGE ${tableReference()} AS target
      USING (SELECT @event_id AS event_id) AS source ON target.event_id = source.event_id
      WHEN MATCHED THEN UPDATE SET event_category = @event_category, event_title = @event_title, scheduled_date = DATE(@scheduled_date), scheduled_time_start = TIME(@scheduled_time_start), scheduled_time_end = TIME(@scheduled_time_end), city = @city, zone = @zone, area = @area, venue = @venue, owner_name = @owner_name, status = @status, linked_lead_ids = @linked_lead_ids, expected_attendance = @expected_attendance, actual_attendance = @actual_attendance, leads_generated_count = @leads_generated_count, notes = @notes, updated_at = TIMESTAMP(@updated_at)
      WHEN NOT MATCHED THEN INSERT (event_id, event_category, event_title, scheduled_date, scheduled_time_start, scheduled_time_end, city, zone, area, venue, owner_name, status, linked_lead_ids, expected_attendance, actual_attendance, leads_generated_count, notes, created_at, updated_at)
      VALUES (@event_id, @event_category, @event_title, DATE(@scheduled_date), TIME(@scheduled_time_start), TIME(@scheduled_time_end), @city, @zone, @area, @venue, @owner_name, @status, @linked_lead_ids, @expected_attendance, @actual_attendance, @leads_generated_count, @notes, TIMESTAMP(@created_at), TIMESTAMP(@updated_at))`,
    params: {
      event_id: event.eventId, event_category: event.eventCategory, event_title: event.title,
      scheduled_date: event.scheduledDate, scheduled_time_start: event.scheduledTimeStart, scheduled_time_end: event.scheduledTimeEnd,
      city: event.city, zone: event.zone, area: event.area, venue: event.venue, owner_name: event.ownerName,
      status: event.status, linked_lead_ids: event.linkedLeadIds, expected_attendance: event.expectedAttendance ?? null,
      actual_attendance: event.actualAttendance ?? null, leads_generated_count: event.leadsGeneratedCount ?? null,
      notes: event.notes, created_at: event.createdAt, updated_at: event.updatedAt,
    },
  });
  return "gcp" as const;
}

export async function deleteMarketingEvent(eventId: string) {
  const bigquery = client();
  if (!bigquery) return "demo" as const;
  await bigquery.query({ query: `DELETE FROM ${tableReference()} WHERE event_id = @event_id`, params: { event_id: eventId } });
  return "gcp" as const;
}
