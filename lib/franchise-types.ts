export const franchiseApplicationStatuses = ["RECEIVED", "UNDER_REVIEW", "SHORTLISTED", "APPROVED_FOR_PAYMENT", "REJECTED", "PAID", "ACTIVATED"] as const;
export const franchisePaymentStatuses = ["NOT_REQUESTED", "PAYMENT_LINK_CREATED", "PAID", "EXPIRED", "CANCELLED"] as const;
export type FranchiseApplicationStatus = typeof franchiseApplicationStatuses[number];
export type FranchisePaymentStatus = typeof franchisePaymentStatuses[number];
export type FranchiseApplication = {
  referenceId: string; applicantName: string; companyName: string; contactName: string; phone: string; email: string;
  website: string; category: string; address: string; area: string; selectedCity: string; opportunityId: string;
  latitude: number | null; longitude: number | null; status: FranchiseApplicationStatus; paymentStatus: FranchisePaymentStatus;
  submittedAt: string | null; updatedAt: string | null; notes: string | null; assignedTo: string | null;
  razorpayPaymentLinkId: string; razorpayShortUrl: string; razorpayReferenceId: string; razorpayAmountPaise: number;
  razorpayStatus: string; amountInr: number; investmentReadiness: string; experienceBackground: string;
};
