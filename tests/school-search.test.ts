import { describe, expect, it } from "vitest";
import { mergeSchoolSuggestions, onboardedSchoolSuggestions, serpSchoolSuggestions } from "@/lib/school-search";
import { schools } from "@/lib/meals";

describe("school search", () => {
  it("finds onboarded schools by initial name characters", () => {
    expect(onboardedSchoolSuggestions(schools, "chennai", "ady")[0]).toMatchObject({ name: "Adyar Pilot School", serviceability: "ACTIVE" });
  });

  it("normalizes school results from SerpAPI Google Maps", () => {
    const results = serpSchoolSuggestions([{ title: "PSBB Millennium School", type: "School", address: "Gerugambakkam, Chennai, Tamil Nadu 600122", place_id: "ChIJ123", gps_coordinates: { latitude: 13.01, longitude: 80.13 } }], "chennai");
    expect(results[0]).toMatchObject({ name: "PSBB Millennium School", cityId: "chennai", placeId: "ChIJ123", serviceability: "NOT_ONBOARDED" });
  });

  it("keeps only prefix matches and removes duplicates", () => {
    const discovered = serpSchoolSuggestions([
      { title: "Alpha School", type: "School", address: "Adyar, Chennai", place_id: "same" },
      { title: "Alpha School Duplicate", type: "School", address: "Adyar, Chennai", place_id: "same" },
      { title: "The Alpha Academy", type: "School", address: "OMR, Chennai", place_id: "other" },
    ], "chennai");
    const merged = mergeSchoolSuggestions([], discovered, "alp");
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Alpha School");
  });
});
