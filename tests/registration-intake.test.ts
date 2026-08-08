import { describe, expect, it } from "vitest";
import { validateRegistrationIntake } from "@/lib/registration-intake";

const options = { strengthField: "student_strength", strengthLabel: "Student strength" };

function valid(overrides: Record<string, unknown> = {}) {
  return {
    contact_name: "Anita Kumar",
    contact_phone: "9876543210",
    consent: "on",
    ...overrides,
  };
}

describe("registration intake validation", () => {
  it("requires a contact name", () => {
    expect(validateRegistrationIntake(valid({ contact_name: "" }), options).error).toMatch(/name/i);
  });

  it("rejects an invalid Indian mobile number", () => {
    expect(validateRegistrationIntake(valid({ contact_phone: "12345" }), options).error).toMatch(/mobile/i);
  });

  it("requires contact consent", () => {
    expect(validateRegistrationIntake(valid({ consent: undefined }), options).error).toMatch(/contact/i);
  });

  it("rejects expected lunch users above student strength", () => {
    const result = validateRegistrationIntake(valid({ student_strength: "100", expected_lunch_users: "101" }), options);
    expect(result.error).toMatch(/cannot exceed/i);
  });

  it("normalizes a valid intake and permits optional estimates", () => {
    const result = validateRegistrationIntake(valid({ contact_phone: "+91 98765-43210", contact_email: "admin@example.com", working_days: "Monday–Friday" }), options);
    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({
      contactName: "Anita Kumar",
      contactPhone: "+919876543210",
      contactEmail: "admin@example.com",
      strength: null,
      expectedLunchUsers: null,
      workingDays: "Monday–Friday",
      consentGiven: true,
    });
  });
});
