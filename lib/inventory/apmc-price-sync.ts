import { createHash } from "node:crypto";
import { FieldValue } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { firestoreClient } from "@/lib/firestore";
import { runApmcPriceAgent } from "@/lib/inventory/apmc-price-agent";

export async function syncApmcPriceFeed(actorId = "system:apmc-price-agent") {
  const requestedAt = new Date();
  const result = await runApmcPriceAgent();
  const bucketName = process.env.INVENTORY_DOCUMENTS_BUCKET || process.env.GCS_BUCKET;
  let payloadUri: string | null = null;

  if (bucketName) {
    const objectName = `inventory-price-feeds/agmarknet/${requestedAt.toISOString().slice(0, 10)}/${crypto.randomUUID()}.json`;
    await new Storage({ projectId: process.env.GCP_PROJECT_ID }).bucket(bucketName).file(objectName).save(result.rawPayload, {
      contentType: "application/json",
      resumable: false,
    });
    payloadUri = `gs://${bucketName}/${objectName}`;
  }

  const db = firestoreClient();
  const batch = db.batch();
  const ids: string[] = [];
  const responseHash = createHash("sha256").update(result.rawPayload).digest("hex");
  for (const rate of result.rates) {
    const ref = db.collection("online_price_feed_log").doc();
    ids.push(ref.id);
    batch.create(ref, {
      feed_log_id: ref.id,
      item_id: rate.itemId,
      supplier_id: rate.supplierId || null,
      feed_provider: result.provider,
      requested_at: requestedAt.toISOString(),
      responded_at: new Date().toISOString(),
      raw_response_payload_uri: payloadUri,
      raw_response_sha256: responseHash,
      parsed_rate: rate.rate,
      unit: rate.unit,
      currency: rate.currency,
      source_reference_id: rate.sourceReferenceId,
      source_state: rate.source.state,
      source_district: rate.source.district,
      source_market: rate.source.market,
      source_commodity: rate.source.commodity,
      source_commodity_code: rate.source.commodityCode,
      source_variety: rate.source.variety,
      source_grade: rate.source.grade,
      source_arrival_date: rate.source.arrivalDate,
      source_min_price_per_quintal: rate.source.minPricePerQuintal,
      source_max_price_per_quintal: rate.source.maxPricePerQuintal,
      source_modal_price_per_quintal: rate.source.modalPricePerQuintal,
      fallback_used: rate.source.fallbackUsed,
      fallback_reason: rate.source.fallbackReason,
      applied: false,
      applied_by: null,
      status: "PENDING_APPROVAL",
      created_by: actorId,
      created_at: FieldValue.serverTimestamp(),
    });
  }
  if (ids.length) await batch.commit();

  return {
    provider: result.provider,
    feedRecords: ids.length,
    unresolved: result.unresolved,
    payloadUri,
  };
}
