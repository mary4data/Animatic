"""Local-disk media storage, served back out by FastAPI's static mount in api/main.py.

Hackathon scope: writes to backend/storage/{job_id}/... on local disk.
Only safe on Cloud Run with --min-instances=1 --max-instances=1 (see README).
Swap for a GCS bucket for anything beyond the demo.
"""

from __future__ import annotations

import os
from pathlib import Path

STORAGE_ROOT = Path(__file__).resolve().parent.parent / "storage"


def _public_base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")


def save_media(job_id: str, filename: str, data: bytes) -> str:
    job_dir = STORAGE_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    path = job_dir / filename
    path.write_bytes(data)
    return f"{_public_base_url()}/media/{job_id}/{filename}"


def delete_media(job_id: str, filename: str) -> None:
    """Best-effort cleanup for a frame removed via DELETE .../images/{order}
    -- the job record is the source of truth either way, so a failure here
    (already gone, permissions) isn't worth surfacing as an error."""
    (STORAGE_ROOT / job_id / filename).unlink(missing_ok=True)


def read_media(job_id: str, filename: str) -> bytes | None:
    """Reads back a previously-saved file's bytes -- e.g. an existing
    storyboard frame, used as an image reference for a later regenerate call.
    Returns None rather than raising if it's gone (deleted, bad filename);
    callers treat that reference as simply unavailable."""
    try:
        return (STORAGE_ROOT / job_id / filename).read_bytes()
    except OSError:
        return None
