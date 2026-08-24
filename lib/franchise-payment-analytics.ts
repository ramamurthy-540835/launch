import { BigQuery } from "@google-cloud/bigquery";

const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";

function client() {
  return projectId ? new BigQuery({ projectId }) : null;
}

export async function recordFranchisePaymentCreated(input: {
  applicationId: string;
  territoryId: string;
  paymentLinkId: string;
  referenceId: string;
  amountPaise: number;
  isTest: boolean;
}) {
  const bigquery = client();
  if (!bigquery) return "demo" as const;
  const now = new Date().toISOString();
  await bigquery.dataset(datasetId).table("franchise_payments").insert([{
    application_id: input.applicationId,
    territory_id: input.territoryId,
    payment_link_id: input.paymentLinkId,
    razorpay_reference_id: input.referenceId,
    payment_id: null,
    stage: "application",
    amount_paise: input.amountPaise,
    currency: "INR",
    status: "created",
    is_test: input.isTest,
    created_at: now,
    updated_at: now,
  }]);
  return "gcp" as const;
}

export async function recordFranchisePaymentEvent(input: {
  eventId: string;
  eventType: string;
  applicationId: string;
  territoryId: string;
  paymentLinkId: string;
  paymentId: string | null;
  status: string;
  amountPaise: number;
  rawPayload: string;
}) {
  const bigquery = client();
  if (!bigquery) return "demo" as const;
  await bigquery.dataset(datasetId).table("franchise_payment_events").insert([{
    insertId: input.eventId,
    json: {
      event_id: input.eventId,
      event_type: input.eventType,
      application_id: input.applicationId,
      territory_id: input.territoryId,
      payment_link_id: input.paymentLinkId,
      payment_id: input.paymentId,
      status: input.status,
      amount_paise: input.amountPaise,
      received_at: new Date().toISOString(),
      raw_payload: input.rawPayload.slice(0, 100_000),
    },
  }], { raw: true });
  return "gcp" as const;
}
