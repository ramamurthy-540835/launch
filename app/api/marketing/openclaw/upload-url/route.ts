import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { fileName?: unknown; contentType?: unknown } | null;
  const fileName = typeof payload?.fileName === "string" ? payload.fileName.trim() : "";
  const contentType = typeof payload?.contentType === "string" ? payload.contentType.trim() : "";
  if (!fileName || fileName.length > 180 || (!contentType.startsWith("video/") && !contentType.startsWith("image/"))) {
    return NextResponse.json({ error: "Choose a valid video or image file." }, { status: 400 });
  }
  try {
    const bucketName = process.env.GCS_BUCKET;
    const projectId = process.env.GCP_PROJECT_ID;
    if (!bucketName || !projectId) throw new Error("Cloud Storage is not configured.");
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const objectName = `openclaw-outreach/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    const file = new Storage({ projectId }).bucket(bucketName).file(objectName);
    const [uploadUrl] = await file.getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60_000, contentType });
    return NextResponse.json({ uploadUrl, mediaUrl: `gs://${bucketName}/${objectName}` });
  } catch {
    return NextResponse.json({ error: "A Cloud Storage upload URL could not be created." }, { status: 502 });
  }
}
