from __future__ import annotations

import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def build_run_id(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return current.astimezone(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def build_gcs_run_prefix(bucket: str, prefix: str, run_id: str) -> str:
    clean_bucket = bucket.removeprefix("gs://").strip("/")
    clean_prefix = prefix.strip("/")
    if not clean_bucket:
        raise ValueError("GCS bucket name is required")
    return f"gs://{clean_bucket}/{clean_prefix}/{run_id}/" if clean_prefix else f"gs://{clean_bucket}/{run_id}/"


def find_gcloud() -> str:
    command = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    if command:
        return command
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd",
        Path("C:/Program Files/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"),
        Path("C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError("Google Cloud CLI was not found. Install gcloud or use --no-gcs-upload.")


def upload_files(
    files: list[Path],
    bucket: str,
    prefix: str,
    project: str,
    run_id: str | None = None,
) -> str:
    """Upload already-written local files. Local files are never removed on failure."""
    selected_run_id = run_id or build_run_id()
    destination = build_gcs_run_prefix(bucket, prefix, selected_run_id)
    gcloud = find_gcloud()
    for path in files:
        if not path.is_file():
            raise FileNotFoundError(f"Cannot upload missing local output: {path}")
        process = subprocess.run(
            [gcloud, "storage", "cp", str(path), f"{destination}{path.name}", f"--project={project}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if process.returncode:
            detail = (process.stderr or process.stdout or "unknown gcloud error").strip()
            raise RuntimeError(f"GCS upload failed for {path.name}: {detail}")
    return destination
