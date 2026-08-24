/**
 * Server-authoritative franchise fee schedule.
 *
 * Public checkout may collect only the application fee. The remaining stages
 * are retained for reviewed, agreement-backed invoicing and cannot be resolved
 * by the public payment flow.
 */

export const FRANCHISE_TOTAL_INVESTMENT_INR = 500_000;
export const APPLICATION_FEE_INR = 5_000;

export type FranchiseFeeStageId = "application" | "tier1" | "tier2" | "tier3" | "tier4" | "tier5";

export type FranchiseFeeStage = {
  id: FranchiseFeeStageId;
  label: string;
  amountInr: number;
  description: string;
  preAgreement: boolean;
};

// These post-agreement allocations are planning placeholders from the supplied
// commercial pack. They are never offered through the public payment route.
const AGREEMENT_STAGES: FranchiseFeeStage[] = [
  { id: "tier1", label: "Franchise fee", amountInr: 150_000, description: "One-time territory franchise fee.", preAgreement: false },
  { id: "tier2", label: "Kitchen setup", amountInr: 150_000, description: "Equipment, fit-out and compliant kitchen setup.", preAgreement: false },
  { id: "tier3", label: "Cold chain and delivery", amountInr: 100_000, description: "Insulated carriers, tiffin inventory and delivery kit.", preAgreement: false },
  { id: "tier4", label: "Working capital", amountInr: 75_000, description: "First-cycle raw material and staffing float.", preAgreement: false },
  { id: "tier5", label: "Training and launch", amountInr: 25_000, description: "Staff training, branding and school onboarding.", preAgreement: false },
];

export const FRANCHISE_FEE_STAGES: FranchiseFeeStage[] = [
  {
    id: "application",
    label: "Application fee",
    amountInr: APPLICATION_FEE_INR,
    description: "Territory application and verification fee, collected only after approval.",
    preAgreement: true,
  },
  ...AGREEMENT_STAGES,
];

const stageIndex = new Map(FRANCHISE_FEE_STAGES.map((stage) => [stage.id, stage]));

export function toPaise(amountInr: number) {
  return Math.round(amountInr * 100);
}

export function resolveFranchiseFee(stageId: string, options: { agreementSigned?: boolean } = {}) {
  const stage = stageIndex.get(stageId as FranchiseFeeStageId);
  if (!stage) throw new Error(`Unknown franchise fee stage: ${stageId}`);
  if (!stage.preAgreement && !options.agreementSigned) {
    throw new Error(`Stage "${stage.id}" cannot be collected before the franchise agreement is signed.`);
  }
  return { stage, amountPaise: toPaise(stage.amountInr), currency: "INR" as const };
}

const agreementTotal = AGREEMENT_STAGES.reduce((total, stage) => total + stage.amountInr, 0);
if (agreementTotal !== FRANCHISE_TOTAL_INVESTMENT_INR) {
  throw new Error(`Franchise stages total ${agreementTotal}, expected ${FRANCHISE_TOTAL_INVESTMENT_INR}.`);
}
