import { BigQuery } from "@google-cloud/bigquery";
import { Storage } from "@google-cloud/storage";

export type OrderRecord = {
  order_id: string;
  created_at: string;
  student_name: string;
  school_name: string;
  parent_phone: string;
  city: string;
  grade_band: string;
  items_json: string;
  total_inr: number;
  status: string;
  receipt_uri: string | null;
};

const projectId = process.env.GCP_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
const tableId = process.env.BIGQUERY_ORDERS_TABLE || "orders";
const bucketName = process.env.GCS_BUCKET;

export function isGcpConfigured() {
  return Boolean(projectId && bucketName);
}

export async function persistOrder(order: OrderRecord) {
  if (!projectId || !bucketName) return { mode: "demo" as const, receiptUri: null };

  const storage = new Storage({ projectId });
  const bigquery = new BigQuery({ projectId });
  const objectName = `order-packets/${order.created_at.slice(0, 10)}/${order.order_id}.json`;
  const receiptUri = `gs://${bucketName}/${objectName}`;
  const storedOrder = { ...order, receipt_uri: receiptUri };

  await storage.bucket(bucketName).file(objectName).save(JSON.stringify(storedOrder, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: { cacheControl: "no-store" },
    preconditionOpts: { ifGenerationMatch: 0 },
  });

  try {
    await bigquery.dataset(datasetId).table(tableId).insert([storedOrder]);
  } catch (error) {
    await storage.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }

  return { mode: "gcp" as const, receiptUri };
}
