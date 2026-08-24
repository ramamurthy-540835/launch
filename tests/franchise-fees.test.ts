import { describe, expect, it } from "vitest";
import { APPLICATION_FEE_INR, FRANCHISE_FEE_STAGES, FRANCHISE_TOTAL_INVESTMENT_INR, resolveFranchiseFee } from "@/lib/franchiseFees";

describe("franchise fee authority", () => {
  it("resolves the approved public application fee in paise", () => {
    expect(resolveFranchiseFee("application")).toMatchObject({ amountPaise: 500_000, currency: "INR" });
    expect(APPLICATION_FEE_INR).toBe(5_000);
  });

  it("keeps the agreement stages equal to the indicative investment", () => {
    expect(FRANCHISE_FEE_STAGES.filter((stage) => !stage.preAgreement).reduce((sum, stage) => sum + stage.amountInr, 0)).toBe(FRANCHISE_TOTAL_INVESTMENT_INR);
  });

  it("rejects tier collection before an agreement is signed", () => {
    expect(() => resolveFranchiseFee("tier1")).toThrow(/before the franchise agreement/);
    expect(resolveFranchiseFee("tier1", { agreementSigned: true }).amountPaise).toBe(15_000_000);
  });
});
