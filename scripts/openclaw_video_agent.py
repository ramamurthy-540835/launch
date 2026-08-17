"""Create WhatsApp-ready video ads from GCS videos and deliver them through OpenClaw.

Only records with status QUEUED, consent enabled, and a gs:// media_url are processed.
Text-only records remain the responsibility of process-openclaw-outbox.ps1.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from google import genai
from google.genai.types import Part
from google.cloud import bigquery, storage


def project_id() -> str:
    configured = os.getenv("GCP_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
    if configured:
        return configured
    result = subprocess.run(["gcloud", "config", "get-value", "project"], capture_output=True, text=True, check=True)
    value = result.stdout.strip()
    if not value or value == "(unset)":
        raise RuntimeError("Set GCP_PROJECT_ID or configure a gcloud project.")
    return value


PROJECT_ID = project_id()
DATASET_ID = os.getenv("BIGQUERY_DATASET", "school_lunch")
TABLE = f"`{PROJECT_ID}.{DATASET_ID}.openclaw_communication`"
BUCKET_NAME = os.getenv("GCS_BUCKET")
MODEL = os.getenv("VERTEX_VIDEO_MODEL", "gemini-2.5-flash")
LOCATION = os.getenv("VERTEX_AI_LOCATION", "global")
FFMPEG = os.getenv("FFMPEG_PATH", "ffmpeg")
OPENCLAW = os.getenv("OPENCLAW_COMMAND", "openclaw")
APP_LINK = os.getenv("LUNCHBOX_APP_URL", "").strip()


def gcs_parts(uri: str) -> tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError("Only gs:// media URLs are accepted by the video agent.")
    bucket, _, object_name = uri[5:].partition("/")
    if not bucket or not object_name:
        raise ValueError("Invalid Cloud Storage media URL.")
    return bucket, object_name


def clean_json(text: str) -> dict[str, object]:
    content = text.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
    data = json.loads(content)
    if not isinstance(data, dict):
        raise ValueError("Video model did not return an object.")
    return data


def create_ad_copy(media_uri: str, mime_type: str, direction: str) -> tuple[str, float, float]:
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
    prompt = f"""Analyze this LunchBox promotional video, including visible content and audio.
Return JSON only with these fields:
- promotional_text: an accurate, appealing WhatsApp promotional message of 120-180 words. Start with a warm, attention-grabbing opening about what is visibly or audibly shown. Use 4-6 relevant emojis, short easy-to-scan paragraphs, and a helpful, confident LunchBox tone. Describe only genuine details evident in the video, explain why they may be useful, and end with one natural call to action asking the recipient to reply for details or a discussion. Do not invent prices, nutritional claims, partnerships, availability, or outcomes. Do not claim the recipient has watched the video.
- clip_start_seconds: the most compelling point to begin a short advertisement (number, at least 0).
- clip_duration_seconds: duration between 12 and 30 seconds.
Optional campaign direction from the operator: {direction or 'none'}"""
    response = client.models.generate_content(
        model=MODEL,
        contents=[Part.from_uri(file_uri=media_uri, mime_type=mime_type), prompt],
    )
    data = clean_json(response.text or "")
    text = str(data.get("promotional_text", "")).strip()
    if not text or len(text) > 1200:
        raise ValueError("Video model did not provide a usable promotional message.")
    if APP_LINK:
        text = f"{text}\n\n📲 Download the LunchBox app: {APP_LINK}"
    start = max(0.0, float(data.get("clip_start_seconds", 0)))
    duration = min(30.0, max(12.0, float(data.get("clip_duration_seconds", 20))))
    return text, start, duration


def make_short_ad(source: Path, destination: Path, start: float, duration: float) -> None:
    command = [
        FFMPEG, "-y", "-ss", str(start), "-i", str(source), "-t", str(duration),
        "-vf", "scale='min(720,iw)':-2:force_original_aspect_ratio=decrease",
        "-c:v", "libx264", "-preset", "medium", "-crf", "27", "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart", str(destination),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)


def set_status(client: bigquery.Client, contact_id: str, status: str, *, message: str | None = None, media_uri: str | None = None, message_id: str | None = None, error: str | None = None) -> None:
    assignments = ["status = @status", "updated_at = CURRENT_TIMESTAMP()"]
    parameters: list[bigquery.ScalarQueryParameter] = [
        bigquery.ScalarQueryParameter("status", "STRING", status),
        bigquery.ScalarQueryParameter("contact_id", "STRING", contact_id),
    ]
    for field, value in (("message_text", message), ("media_url", media_uri), ("openclaw_message_id", message_id), ("error_message", error)):
        if value is not None:
            assignments.append(f"{field} = @{field}")
            parameters.append(bigquery.ScalarQueryParameter(field, "STRING", value[:4000] if field == "error_message" else value))
    if status == "SENT":
        assignments.append("sent_at = CURRENT_TIMESTAMP()")
    query = f"UPDATE {TABLE} SET {', '.join(assignments)} WHERE contact_id = @contact_id"
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=parameters)).result()


def download_and_upload(storage_client: storage.Client, media_uri: str, directory: Path, contact_id: str, start: float, duration: float) -> tuple[Path, str]:
    bucket_name, object_name = gcs_parts(media_uri)
    extension = Path(object_name).suffix or ".mp4"
    source = directory / f"{contact_id}{extension}"
    clip = directory / f"{contact_id}-short-ad.mp4"
    storage_client.bucket(bucket_name).blob(object_name).download_to_filename(source)
    make_short_ad(source, clip, start, duration)
    output_bucket = BUCKET_NAME or bucket_name
    output_name = f"openclaw-outreach/short-ads/{uuid.uuid4()}.mp4"
    storage_client.bucket(output_bucket).blob(output_name).upload_from_filename(clip, content_type="video/mp4")
    return clip, f"gs://{output_bucket}/{output_name}"


def send_openclaw(number: str, message: str, clip: Path) -> str:
    """Send video and promotional copy separately so WhatsApp does not truncate a media caption."""
    media_result = subprocess.run(
        [OPENCLAW, "message", "send", "--channel", "whatsapp", "--account", "default", "--target", number, "--media", str(clip), "--message", "🎬 A special LunchBox video for you"],
        check=False, capture_output=True, text=True,
    )
    media_id = re.search(r"Message ID:\s*([A-Za-z0-9]+)", media_result.stdout + media_result.stderr)
    if media_result.returncode or not media_id:
        raise RuntimeError((media_result.stdout + media_result.stderr).strip() or "OpenClaw video delivery failed.")
    text_result = subprocess.run(
        [OPENCLAW, "message", "send", "--channel", "whatsapp", "--account", "default", "--target", number, "--message", message],
        check=False, capture_output=True, text=True,
    )
    text_id = re.search(r"Message ID:\s*([A-Za-z0-9]+)", text_result.stdout + text_result.stderr)
    if text_result.returncode or not text_id:
        raise RuntimeError((text_result.stdout + text_result.stderr).strip() or "OpenClaw promotional-text delivery failed.")
    return f"video:{media_id.group(1)}, text:{text_id.group(1)}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    bigquery_client = bigquery.Client(project=PROJECT_ID)
    storage_client = storage.Client(project=PROJECT_ID)
    query = f"""SELECT contact_id, whatsapp_number, message_text, media_url
      FROM {TABLE}
      WHERE status = 'QUEUED' AND whatsapp_consent = TRUE AND STARTS_WITH(media_url, 'gs://')
      ORDER BY scheduled_at, created_at LIMIT @limit"""
    rows = bigquery_client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("limit", "INT64", args.limit)])).result()
    processed = 0
    with tempfile.TemporaryDirectory(prefix="lunchbox-video-agent-") as temp:
        directory = Path(temp)
        for row in rows:
            try:
                set_status(bigquery_client, row.contact_id, "VIDEO_PROCESSING")
                mime_type = mimetypes.guess_type(row.media_url)[0] or "video/mp4"
                text, start, duration = create_ad_copy(row.media_url, mime_type, row.message_text or "")
                clip, generated_uri = download_and_upload(storage_client, row.media_url, directory, row.contact_id, start, duration)
                message_id = send_openclaw(row.whatsapp_number, text, clip)
                set_status(bigquery_client, row.contact_id, "SENT", message=text, media_uri=generated_uri, message_id=message_id, error="")
                processed += 1
            except Exception as error:  # The failure is retained in the outbox for audit and retry decisions.
                set_status(bigquery_client, row.contact_id, "FAILED", error=str(error))
    print(f"Processed {processed} video outreach job(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
