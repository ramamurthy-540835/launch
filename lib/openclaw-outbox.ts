import { BigQuery } from "@google-cloud/bigquery";

const projectId = process.env.GCP_PROJECT_ID;
const datasetId = process.env.BIGQUERY_DATASET || "school_lunch";
const tableId = process.env.BIGQUERY_OPENCLAW_COMMUNICATION_TABLE || "openclaw_communication";

export type OpenClawOutboxRequest = {
  name: string;
  whatsappNumber: string;
  messageText: string;
  mediaUrl?: string;
  campaignName?: string;
};

export type OpenClawBroadcastRequest = Pick<OpenClawOutboxRequest, "messageText" | "mediaUrl" | "campaignName">;

function client() {
  return projectId ? new BigQuery({ projectId }) : null;
}

function table() {
  return `\`${projectId}.${datasetId}.${tableId}\``;
}

export function validateOpenClawOutboxRequest(value: unknown): { ok: true; value: OpenClawOutboxRequest } | { ok: false; error: string } {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<OpenClawOutboxRequest> : null;
  if (!record) return { ok: false, error: "Message payload must be an object." };
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const whatsappNumber = typeof record.whatsappNumber === "string" ? record.whatsappNumber.replace(/[\s-]/g, "") : "";
  const messageText = typeof record.messageText === "string" ? record.messageText.trim() : "";
  const mediaUrl = typeof record.mediaUrl === "string" ? record.mediaUrl.trim() : "";
  const campaignName = typeof record.campaignName === "string" ? record.campaignName.trim() : "";
  if (!name || name.length > 200) return { ok: false, error: "Enter a recipient name of 200 characters or fewer." };
  if (!/^\+[1-9]\d{7,14}$/.test(whatsappNumber)) return { ok: false, error: "Enter the WhatsApp number in international format, for example +919363119334." };
  if (!messageText || messageText.length > 4096) return { ok: false, error: "Enter a message between 1 and 4,096 characters." };
  if (mediaUrl && mediaUrl.length > 2048) return { ok: false, error: "Media path or URL is too long." };
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl) && !/^[A-Za-z]:\\/.test(mediaUrl)) return { ok: false, error: "Media must be a public HTTPS URL or an absolute Windows file path." };
  return { ok: true, value: { name, whatsappNumber, messageText, mediaUrl: mediaUrl || undefined, campaignName: campaignName || undefined } };
}

export function validateOpenClawBroadcastRequest(value: unknown): { ok: true; value: OpenClawBroadcastRequest } | { ok: false; error: string } {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<OpenClawBroadcastRequest> : null;
  if (!record) return { ok: false, error: "Message payload must be an object." };
  const messageText = typeof record.messageText === "string" ? record.messageText.trim() : "";
  const mediaUrl = typeof record.mediaUrl === "string" ? record.mediaUrl.trim() : "";
  const campaignName = typeof record.campaignName === "string" ? record.campaignName.trim() : "";
  if (!messageText || messageText.length > 4096) return { ok: false, error: "Enter a message between 1 and 4,096 characters." };
  if (mediaUrl && mediaUrl.length > 2048) return { ok: false, error: "Media path or URL is too long." };
  if (mediaUrl && !/^https?:\/\//i.test(mediaUrl) && !/^gs:\/\//i.test(mediaUrl) && !/^[A-Za-z]:\\/.test(mediaUrl)) return { ok: false, error: "Media must be a public HTTPS URL, Cloud Storage URI, or an absolute Windows file path." };
  return { ok: true, value: { messageText, mediaUrl: mediaUrl || undefined, campaignName: campaignName || undefined } };
}

export async function queueOpenClawMessage(message: OpenClawOutboxRequest) {
  const bigquery = client();
  if (!bigquery) throw new Error("BigQuery is not configured.");
  const contactId = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();
  await bigquery.query({
    query: `INSERT ${table()} (contact_id, name, whatsapp_number, whatsapp_consent, message_text, media_url, campaign_name, content_type, source, idempotency_key, status, scheduled_at, created_at, updated_at)
      VALUES (@contact_id, @name, @whatsapp_number, TRUE, @message_text, @media_url, @campaign_name, @content_type, 'marketing_os', @idempotency_key, 'QUEUED', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    params: {
      contact_id: contactId,
      name: message.name,
      whatsapp_number: message.whatsappNumber,
      message_text: message.messageText,
      media_url: message.mediaUrl || null,
      campaign_name: message.campaignName || null,
      content_type: message.mediaUrl ? "media" : "text",
      idempotency_key: idempotencyKey,
    },
  });
  return { contactId, idempotencyKey };
}

type RecipientRow = { name?: string; whatsapp_number?: string };

export async function queueOpenClawBroadcast(message: OpenClawBroadcastRequest) {
  const bigquery = client();
  if (!bigquery) throw new Error("BigQuery is not configured.");
  const [rows] = await bigquery.query({
    query: `SELECT name, whatsapp_number FROM (
      SELECT name, whatsapp_number, ROW_NUMBER() OVER (PARTITION BY whatsapp_number ORDER BY updated_at DESC) AS row_number
      FROM ${table()}
      WHERE whatsapp_consent = TRUE AND whatsapp_number IS NOT NULL AND whatsapp_number != ''
    ) WHERE row_number = 1`,
  });
  const recipients = (rows as RecipientRow[]).flatMap((row) => {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const whatsappNumber = typeof row.whatsapp_number === "string" ? row.whatsapp_number.trim() : "";
    return name && /^\+[1-9]\d{7,14}$/.test(whatsappNumber) ? [{ name, whatsappNumber }] : [];
  });
  await Promise.all(recipients.map((recipient) => queueOpenClawMessage({ ...recipient, ...message })));
  return { queued: recipients.length };
}
