import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.OUTREACH_WRITE_TOKEN;
  if (!token || request.headers.get("x-outreach-token") !== token) {
    return NextResponse.json({ error: "Outreach sending is not configured." }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const file = form.get("media");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a video or image file." }, { status: 400 });
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) return NextResponse.json({ error: "Only video and image files are supported." }, { status: 400 });
    if (file.size < 1 || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Media must be between 1 byte and 25 MB." }, { status: 400 });
    const bucketName = process.env.GCS_BUCKET;
    const projectId = process.env.GCP_PROJECT_ID;
    if (!bucketName || !projectId) throw new Error("Cloud Storage is not configured.");
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
    const objectName = `openclaw-outreach/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
    await new Storage({ projectId }).bucket(bucketName).file(objectName).save(Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    return NextResponse.json({ mediaUrl: `gs://${bucketName}/${objectName}` }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The media file could not be uploaded." }, { status: 502 });
  }
}
