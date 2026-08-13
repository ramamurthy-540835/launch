import { describe, expect, it } from "vitest";
import { canonicalApplicationRecord, generateFranchiseReferenceId, normalizeFranchiseStatus, toFranchiseApplication } from "@/lib/franchise-applications";

describe("franchise application records", () => {
  it("generates the public FR-XXXXXXXX reference format", () => {
    expect(generateFranchiseReferenceId(() => Buffer.from("7f3a91c2", "hex"))).toBe("FR-7F3A91C2");
  });

  it("writes the canonical schema and territory linkage", () => {
    const record = canonicalApplicationRecord({ name: "Anita", companyName: "Bright Foods", contactName: "Anita", phone: "9876543210", email: "ANITA@example.com", city: "Chennai", opportunityId: "adyar" }, "FR-7F3A91C2");
    expect(record).toMatchObject({ reference_id: "FR-7F3A91C2", applicant_name: "Anita", company_name: "Bright Foods", contact_name: "Anita", email: "anita@example.com", city: "Chennai", opportunity_id: "adyar", status: "RECEIVED", payment_status: "NOT_REQUESTED" });
    expect(record).not.toHaveProperty("createdAt");
  });
  it("normalizes the public application form record for the admin view", () => {
    const application = toFranchiseApplication("FR-FA5B231F", {
      full_name: "Anita Kumar",
      phone: "9876543210",
      email: "anita@example.com",
      city: "Chennai",
      investment_readiness: "Funds available now",
      occupation: "Restaurant operator",
      motivation: "I have managed food operations for eight years.",
      status: "NEW",
      created_at: { seconds: 1_786_000_000 },
    });

    expect(application).toMatchObject({
      referenceId: "FR-FA5B231F",
      applicantName: "Anita Kumar",
      selectedCity: "Chennai",
      status: "RECEIVED",
      notes: null,
    });
    expect(application.experienceBackground).toContain("Restaurant operator");
    expect(application.submittedAt).toMatch(/^2026-/);
  });

  it("supports each admin status and safely defaults unknown values", () => {
    expect(normalizeFranchiseStatus("under review")).toBe("UNDER_REVIEW");
    expect(normalizeFranchiseStatus("SHORTLISTED")).toBe("SHORTLISTED");
    expect(normalizeFranchiseStatus("approved for payment")).toBe("APPROVED_FOR_PAYMENT");
    expect(normalizeFranchiseStatus("paid")).toBe("PAID");
    expect(normalizeFranchiseStatus("activated")).toBe("ACTIVATED");
    expect(normalizeFranchiseStatus("rejected")).toBe("REJECTED");
    expect(normalizeFranchiseStatus("unexpected")).toBe("RECEIVED");
  });
});
