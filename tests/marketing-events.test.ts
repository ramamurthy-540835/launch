import { describe, expect, it } from "vitest";
import {
  audienceToInstitutionType,
  buildMarketingSeeds,
  dedupeInstitutions,
  normalizeMarketingEventRecord,
  outcomeToLeadStage,
  type MarketingEvent,
} from "../lib/marketing-events";
import {
  deleteMarketingEvent,
  marketingEventFromBigQueryRow,
  marketingEventSaveQuery,
  validateMarketingEventPayload,
} from "../lib/marketing-events-gcp";

describe("marketing events integration", () => {
  it("maps outreach outcomes onto the existing pipeline stages", () => {
    expect(outcomeToLeadStage("NO_ANSWER")).toBe("Contacted");
    expect(outcomeToLeadStage("FOLLOW_UP_NEEDED")).toBe("Contacted");
    expect(outcomeToLeadStage("INTERESTED")).toBe("Interested");
    expect(outcomeToLeadStage("MEETING_SCHEDULED")).toBe("Meeting");
    expect(outcomeToLeadStage("CONVERTED")).toBe("Meeting");
  });

  it("maps one event to one school with the canonical institution id", () => {
    const seed = buildMarketingSeeds([
      { id: "lead-1", placeId: "place-school-1", name: "Adyar School", city: "Chennai", audience: "schools" },
    ], new Date("2026-08-11T08:00:00.000Z"));
    expect(seed.events[0].institutions).toEqual([{ institutionId: "place-school-1", institutionType: "schools", name: "Adyar School" }]);
  });

  it("maps one event to multiple schools and colleges", () => {
    const event = normalizeMarketingEventRecord({
      eventId: "event-1",
      title: "Campus week",
      eventType: "CAMPUS_SAMPLING",
      city: "Chennai",
      zone: "",
      area: "",
      institutions: [
        { institutionId: "school-1", institutionType: "schools" },
        { institutionId: "college-1", institutionType: "colleges" },
      ],
      scheduledDate: "2026-08-20",
      scheduledTimeStart: "10:00",
      scheduledTimeEnd: "12:00",
      venue: "Shared venue",
      ownerName: "Priya",
      status: "PLANNED",
      notes: "",
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    });
    expect(event.institutions).toHaveLength(2);
    expect(event.institutions.map((institution) => institution.institutionType).sort()).toEqual(["colleges", "schools"]);
  });

  it("rejects apartments and parent hubs as institution mappings", () => {
    expect(audienceToInstitutionType("apartments")).toBeNull();
    expect(audienceToInstitutionType("parent_hubs")).toBeNull();
    const invalid = validateMarketingEventPayload({
      ...validEvent(),
      institutions: [{ institutionId: "apt-1", institutionType: "apartments" }],
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.ok ? [] : invalid.errors).toContain("Unsupported institution type for apt-1.");
  });

  it("deduplicates submitted mappings", () => {
    expect(dedupeInstitutions([
      { institutionId: "school-1", institutionType: "schools" },
      { institutionId: "school-1", institutionType: "schools" },
      { institutionId: "college-1", institutionType: "colleges" },
    ])).toEqual([
      { institutionId: "school-1", institutionType: "schools" },
      { institutionId: "college-1", institutionType: "colleges" },
    ]);
  });

  it("reconciles mappings during edit by deleting missing mappings and merging new mappings", () => {
    const query = marketingEventSaveQuery();
    expect(query).toContain("DELETE FROM");
    expect(query).toContain("NOT EXISTS");
    expect(query).toContain("MERGE");
    expect(query).toContain("UNNEST(@institutions)");
  });

  it("deletes mappings with an event in demo mode", async () => {
    const result = await deleteMarketingEvent("event-1");
    expect(result).toEqual({ mode: "demo", deleted: true });
  });

  it("reconstructs events from joined BigQuery rows without duplicating the event", () => {
    const event = marketingEventFromBigQueryRow({
      event_id: "event-1",
      title: "Campus week",
      event_type: "CAMPUS_SAMPLING",
      city: "Chennai",
      zone: "South",
      area: "Velachery",
      scheduled_date: { value: "2026-08-20" },
      scheduled_time_start: "10:00",
      scheduled_time_end: "12:00",
      venue: "Shared venue",
      owner_name: "Priya",
      status: "PLANNED",
      expected_attendance: 100,
      actual_attendance: null,
      leads_generated_count: null,
      notes: "Bring kiosk.",
      created_at: { value: "2026-08-11T08:00:00.000Z" },
      updated_at: { value: "2026-08-12T08:00:00.000Z" },
      institutions: [
        { institutionId: "school-1", institutionType: "schools", name: "Adyar School" },
        { institutionId: "college-1", institutionType: "colleges", name: "Velachery College" },
      ],
    });
    expect(event.eventId).toBe("event-1");
    expect(event.institutions).toHaveLength(2);
    expect(event.institutions[1].name).toBe("Velachery College");
  });

  it("normalizes legacy linkedLeadIds for migration compatibility", () => {
    const event = normalizeMarketingEventRecord({
      ...validEvent(),
      institutions: undefined,
      linkedLeadIds: ["lead-1", "lead-2"],
    }, [
      { id: "lead-1", placeId: "place-school-1", name: "Adyar School", type: "School", address: "", city: "Chennai", audience: "schools", position: 1 },
      { id: "lead-2", placeId: "place-college-1", name: "Velachery College", type: "College", address: "", city: "Chennai", audience: "colleges", position: 2 },
    ]);
    expect(event.institutions).toEqual([
      { institutionId: "place-school-1", institutionType: "schools", name: "Adyar School" },
      { institutionId: "place-college-1", institutionType: "colleges", name: "Velachery College" },
    ]);
  });
});

function validEvent(): MarketingEvent {
  return {
    eventId: "event-1",
    title: "Tasting day",
    eventType: "TASTING_DAY",
    city: "Chennai",
    zone: "",
    area: "",
    institutions: [{ institutionId: "school-1", institutionType: "schools" }],
    scheduledDate: "2026-08-20",
    scheduledTimeStart: "10:00",
    scheduledTimeEnd: "12:00",
    venue: "Adyar School",
    ownerName: "Priya",
    status: "PLANNED",
    notes: "",
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:00:00.000Z",
  };
}

