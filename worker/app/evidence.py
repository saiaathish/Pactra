"""Evidence: clips + transcript/description spans persisted to MongoDB with
files uploaded to Firebase Storage (backend-only evidence paths)."""

from __future__ import annotations

import hashlib
import os
import uuid

from firebase_admin import storage as fb_storage

from .video_analysis import extract_segment

ALLOWED_EVIDENCE_TYPES = ("transcript", "video_clip", "audio_clip", "frame",
                          "description_span", "brief_span")


def get_bucket():
    return fb_storage.bucket()


def build_clip(video_path: str, start_s: float, end_s: float, work_dir: str) -> str:
    out_path = os.path.join(work_dir, f"clip-{uuid.uuid4().hex[:10]}.mp4")
    extract_segment(video_path, start_s, end_s, out_path)
    return out_path


def upload_file(local_path: str, storage_path: str, content_type: str) -> str:
    """Uploads via the Firebase Admin SDK; returns the storage path."""
    blob = get_bucket().blob(storage_path)
    blob.upload_from_filename(local_path, content_type=content_type)
    return storage_path


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def create_evidence_item(db, *, uid: str, analysis_run_id, test_result_id,
                         etype: str, text: str | None = None,
                         start_seconds: float | None = None,
                         end_seconds: float | None = None,
                         storage_path: str | None = None,
                         sha256: str | None = None):
    if etype not in ALLOWED_EVIDENCE_TYPES:
        raise ValueError(f"invalid evidence type: {etype}")
    now = __import__("datetime").datetime.now()
    doc = {
        "ownerFirebaseUid": uid,
        "analysisRunId": analysis_run_id,
        "testResultId": test_result_id,
        "type": etype,
        "startSeconds": start_seconds,
        "endSeconds": end_seconds,
        "text": text,
        "storagePath": storage_path,
        "sha256": sha256,
        "createdAt": now,
        "updatedAt": now,
    }
    inserted = db["evidenceItems"].insert_one(doc)
    return inserted.inserted_id
