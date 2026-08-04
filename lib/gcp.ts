import { BigQuery } from "@google-cloud/bigquery";
import { Storage } from "@google-cloud/storage";

export type OrderRecord = {
  order_id: string;
  parent_uid: string | null;
  student_id: string | null;
  allergies_json: string | null;
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

  let createdObject = false;
  try {
    await storage.bucket(bucketName).file(objectName).save(JSON.stringify(storedOrder, null, 2), {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "no-store" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    createdObject = true;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 412) throw error;
  }

  try {
    await bigquery.dataset(datasetId).table(tableId).insert(
      [{ insertId: order.order_id, json: storedOrder }],
      { raw: true },
    );
  } catch (error) {
    if (createdObject) {
      await storage.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true }).catch(() => undefined);
    }
    throw error;
  }

  return { mode: "gcp" as const, receiptUri };
}

export async function storeDeliveryProof(serviceDate: string, routeId: string, schoolId: string, file: File) {
  if (!projectId || !bucketName) throw new Error("GCS delivery-proof storage is not configured.");
  if (file.size < 1 || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Proof must be a JPG, PNG or WebP image under 5 MB.");
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectName = `delivery-proofs/${serviceDate}/${routeId}/${schoolId}-${crypto.randomUUID()}.${extension}`;
  await new Storage({ projectId }).bucket(bucketName).file(objectName).save(Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    resumable: false,
    metadata: { cacheControl: "private, no-store" },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  return `gs://${bucketName}/${objectName}`;
}
