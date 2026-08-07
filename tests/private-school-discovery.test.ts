import { describe, expect, it } from "vitest";
import { normalizePrivateSchoolResults } from "@/lib/private-school-discovery";

describe("private school discovery", () => {
  it("keeps private-school candidates and excludes government schools", () => {
    const schools = normalizePrivateSchoolResults([
      { title: "Alpha Matriculation Higher Secondary School", type: "Private school", address: "Salem, Tamil Nadu", place_id: "private-1" },
      { title: "Government Higher Secondary School", type: "School", address: "Salem, Tamil Nadu", place_id: "government-1" },
    ], "Salem");
    expect(schools).toHaveLength(1);
    expect(schools[0]).toMatchObject({ schoolName: "Alpha Matriculation Higher Secondary School", namePrefix3: "alp", ownership: "PRIVATE_CANDIDATE" });
  });
});
