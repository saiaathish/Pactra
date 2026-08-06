"""Pactra video-analysis worker (Cloud Run).

Server-to-server auth: every request carries
`Authorization: Bearer <WORKER_SHARED_SECRET>` (from the web backend) or a
verified Firebase ID token. The worker:
  1. Authenticates the caller.
  2. Loads the analysis run from MongoDB (never accepts arbitrary file URLs).
  3. Verifies the owning Firebase UID and referenced resources.
  4. Downloads the video + brief from Firebase Storage via Admin SDK.
  5. Computes SHA-256 itself — rejects the run on hash mismatch (fail closed).
  6. Extracts audio, transcript, frames, and evidence clips.
  7. Runs deterministic + AI-assisted tests (policy-gated verdicts).
  8. Uploads evidence to Firebase Storage, saves structured results to MongoDB.
  9. Updates progress after each major stage.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
import tempfile
from typing import Optional

import firebase_admin
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from firebase_admin import auth as fb_auth
from firebase_admin import credentials as fb_credentials
from firebase_admin import storage as fb_storage
from pydantic import BaseModel
from pymongo import MongoClient

from . import brief_parser, evidence, requirement_tests, transcription, video_analysis
from .requirement_tests import Transcript

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pactra-worker")

ENGINE_VERSION = os.environ.get("ANALYSIS_ENGINE_VERSION", "0.2.0")

app = FastAPI(title="Pactra worker")

for _env in ("MONGODB_URI",):
    if not os.environ.get(_env):
        raise RuntimeError(f"Missing required env var: {_env}")


# --- Firebase Admin (ADC on Cloud Run, env credentials elsewhere) -----------

def init_firebase():
    if firebase_admin._apps:
        return
    options = {"storageBucket": os.environ.get("FIREBASE_ADMIN_STORAGE_BUCKET") or None}
    project_id = os.environ.get("FIREBASE_ADMIN_PROJECT_ID")
    client_email = os.environ.get("FIREBASE_ADMIN_CLIENT_EMAIL")
    private_key = os.environ.get("FIREBASE_ADMIN_PRIVATE_KEY", "").replace("\\n", "\n")
    if project_id and client_email and private_key:
        cred = fb_credentials.Certificate({
            "type": "service_account",
            "project_id": project_id,
            "client_email": client_email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        firebase_admin.initialize_app(cred, options=options)
    else:
        firebase_admin.initialize_app(options=options)  # ADC


init_firebase()


# --- MongoDB singleton --------------------------------------------------------

_client: MongoClient | None = None


def get_db():
    global _client
    if _client is None:
        _client = MongoClient(os.environ["MONGODB_URI"], serverSelectionTimeoutMS=5000)
    return _client[os.environ.get("MONGODB_DB_NAME", "pactra")]


def get_bucket():
    return fb_storage.bucket()


# --- Stage tracking -----------------------------------------------------------

STAGES = [
    "queued",
    "validating_inputs",
    "downloading",
    "hashing",
    "extracting_audio",
    "transcribing",
    "sampling_frames",
    "running_deterministic_tests",
    "running_semantic_tests",
    "running_visual_tests",
    "creating_evidence",
    "saving_results",
    "complete",
]

TERMINAL = ("passed", "failed", "partial", "error", "cancelled")


def set_stage(db, run_id: ObjectId, stage_idx: int, status: str | None = None,
              summary: dict | None = None, error_code: str | None = None,
              error_message_safe: str | None = None, started_at: datetime.datetime | None = None):
    update = {
        "currentStage": STAGES[stage_idx],
        "progressPercent": int(stage_idx / (len(STAGES) - 1) * 100),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
    }
    if status:
        update["status"] = status
    if summary is not None:
        update["summary"] = summary
    if error_code:
        update["errorCode"] = error_code
    if error_message_safe:
        update["errorMessageSafe"] = error_message_safe
    if started_at is not None:
        update["startedAt"] = started_at
    if status in TERMINAL:
        update["completedAt"] = datetime.datetime.now(datetime.timezone.utc)
    db["analysisRuns"].update_one({"_id": run_id}, {"$set": update})


# --- Auth ---------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    analysisRunId: str


class ParseBriefRequest(BaseModel):
    sponsorBriefId: str
    storagePath: str


def authenticate(authorization: Optional[str]) -> tuple[str | None, str | None]:
    """Returns (firebase_uid, error). uid is None for the shared-secret path —
    ownership is then asserted from the run/brief documents themselves."""
    if not authorization or not authorization.startswith("Bearer "):
        return None, "Missing bearer token"
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None, "Missing bearer token"
    if token == os.environ.get("WORKER_SHARED_SECRET"):
        return None, None
    try:
        decoded = fb_auth.verify_id_token(token)
        return decoded["uid"], None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firebase token verification failed: %s", exc)
        return None, "Invalid token"


def require_owner(uid: str | None, doc_uid: str):
    if uid is not None and uid != doc_uid:
        raise HTTPException(status_code=403, detail="Not your resource")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine_version": ENGINE_VERSION}


# --- /analyze ------------------------------------------------------------------


@app.post("/analyze")
def analyze(payload: AnalyzeRequest, authorization: Optional[str] = Header(None)) -> dict:
    db = get_db()
    auth_uid, err = authenticate(authorization)
    if err:
        raise HTTPException(status_code=401, detail=err)

    run = db["analysisRuns"].find_one({"_id": ObjectId(payload.analysisRunId)})
    if not run:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    if run["status"] not in ("queued", "processing"):
        raise HTTPException(status_code=409, detail="Run already started or finished")
    require_owner(auth_uid, run["ownerFirebaseUid"])
    uid = run["ownerFirebaseUid"]
    run_id = run["_id"]

    started_at = datetime.datetime.now(datetime.timezone.utc)
    set_stage(db, run_id, 0, status="processing", started_at=started_at)

    work_dir = tempfile.mkdtemp(prefix="pactra-")
    try:
        return _run_pipeline(db, run, uid, work_dir)
    except HTTPException as exc:
        set_stage(db, run_id, 12, status="error", error_code="pipeline_failed",
                  error_message_safe=str(exc.detail)[:500])
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Analysis failed")
        set_stage(db, run_id, 12, status="error", error_code="internal",
                  error_message_safe="Analysis failed — check inputs and retry")
        raise HTTPException(status_code=500, detail=str(exc)[:300])
    finally:
        import shutil

        shutil.rmtree(work_dir, ignore_errors=True)


def _run_pipeline(db, run: dict, uid: str, work_dir: str) -> dict:
    run_id = run["_id"]

    # --- validating_inputs: ownership of every referenced resource ----------
    set_stage(db, run_id, 1)
    campaign = db["campaigns"].find_one({"_id": run["campaignId"], "ownerFirebaseUid": uid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    brief_version = db["briefVersions"].find_one({
        "_id": run["briefVersionId"], "ownerFirebaseUid": uid})
    if not brief_version or brief_version.get("status") != "confirmed":
        raise HTTPException(status_code=409, detail="Brief version is not confirmed")
    asset = db["videoAssets"].find_one({"_id": run["videoAssetId"], "ownerFirebaseUid": uid})
    if not asset:
        raise HTTPException(status_code=404, detail="Video asset not found")

    requirements = list(db["requirements"].find({
        "ownerFirebaseUid": uid,
        "briefVersionId": run["briefVersionId"],
        "status": "confirmed",
    }))

    # --- downloading: Firebase Admin download (no signed URLs needed) --------
    set_stage(db, run_id, 2)
    video_path = os.path.join(work_dir, "input.mp4")
    get_bucket().blob(asset["storagePath"]).download_to_filename(video_path)

    # --- hashing: compute ourselves; fail closed on mismatch ------------------
    set_stage(db, run_id, 3)
    computed_sha256 = video_analysis.sha256_file(video_path)
    stored_sha256 = asset.get("sha256")
    if stored_sha256 and stored_sha256 != computed_sha256:
        raise HTTPException(
            status_code=409,
            detail="Video hash mismatch — the uploaded file differs from the recorded asset",
        )

    # --- extracting_audio -----------------------------------------------------
    set_stage(db, run_id, 4)
    audio_path = os.path.join(work_dir, "audio.wav")
    video_analysis.extract_audio(video_path, audio_path)

    # --- transcribing ---------------------------------------------------------
    set_stage(db, run_id, 5)
    segments = transcription.transcribe_audio_file(audio_path)
    transcript = Transcript(segments)
    if not segments:
        raise HTTPException(status_code=422, detail="No transcript produced")

    # --- sampling_frames (best-effort; stretch visuals) ----------------------
    set_stage(db, run_id, 6)
    try:
        video_analysis.sample_frames(video_path, os.path.join(work_dir, "frames"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Frame sampling failed: %s", exc)

    # --- running tests ---------------------------------------------------------
    set_stage(db, run_id, 7)
    description = run.get("descriptionSnapshot") or ""
    ai_key = os.environ.get("AI_API_KEY")
    model = os.environ.get("AI_MODEL", "gpt-4o-mini")
    brand_names = [campaign.get("plannedTitle") or ""] if campaign.get("plannedTitle") else None

    outcomes = requirement_tests.run_all(
        [
            {"id": str(r["_id"]), "type": r["type"], "parameters": r.get("parameters") or {}}
            for r in requirements
        ],
        transcript,
        description,
        brand_names=brand_names,
        ai_key=ai_key,
        model=model,
        video_duration_s=asset.get("durationSeconds"),
    )

    # --- creating_evidence -----------------------------------------------------
    set_stage(db, run_id, 10)
    counts = {"passed": 0, "failed": 0, "uncertain": 0, "humanReview": 0}
    for outcome in outcomes:
        status = outcome["status"]
        if status == "pass":
            counts["passed"] += 1
        elif status == "fail":
            counts["failed"] += 1
        elif status == "uncertain":
            counts["uncertain"] += 1
        elif status == "human_review":
            counts["humanReview"] += 1

        inserted = db["testResults"].insert_one({
            "ownerFirebaseUid": uid,
            "analysisRunId": run_id,
            "requirementId": ObjectId(outcome["requirement_id"]),
            "status": status,
            "observedValue": outcome["observed_value"],
            "requiredValue": outcome["required_value"],
            "confidence": outcome["confidence"],
            "explanation": outcome["explanation"],
            "evidenceIds": [],
            "createdAt": datetime.datetime.now(datetime.timezone.utc),
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        })
        test_result_id = inserted.inserted_id

        evidence_ids = []
        for ev in outcome["evidence"]:
            if ev["type"] == "description_span":
                eid = evidence.create_evidence_item(
                    db, uid=uid, analysis_run_id=run_id, test_result_id=test_result_id,
                    etype="description_span", text=ev.get("text")[:2000],
                )
                evidence_ids.append(eid)
            elif ev["type"] == "transcript":
                eid = evidence.create_evidence_item(
                    db, uid=uid, analysis_run_id=run_id, test_result_id=test_result_id,
                    etype="transcript", text=ev.get("text"),
                    start_seconds=ev.get("startSeconds"), end_seconds=ev.get("endSeconds"),
                )
                evidence_ids.append(eid)
                # Clip for fails/uncertain with timestamps.
                if status in ("fail", "uncertain") and ev.get("startSeconds") is not None:
                    try:
                        clip_path = evidence.build_clip(
                            video_path, ev["startSeconds"], ev["endSeconds"] or ev["startSeconds"] + 15,
                            work_dir)
                        ev_id = str(evidence_ids[-1])
                        clip_storage_path = (
                            f"users/{uid}/analysis/{run_id}/evidence/{ev_id}/clip.mp4")
                        evidence.upload_file(clip_path, clip_storage_path, "video/mp4")
                        eid = evidence.create_evidence_item(
                            db, uid=uid, analysis_run_id=run_id, test_result_id=test_result_id,
                            etype="video_clip", start_seconds=ev["startSeconds"],
                            end_seconds=ev["endSeconds"],
                            storage_path=clip_storage_path,
                            sha256=evidence.file_sha256(clip_path),
                        )
                        evidence_ids.append(eid)
                    except Exception as clip_exc:  # noqa: BLE001
                        logger.warning("Clip generation failed: %s", clip_exc)

        db["testResults"].update_one(
            {"_id": test_result_id}, {"$set": {"evidenceIds": evidence_ids}})

    # --- saving_results ---------------------------------------------------------
    set_stage(db, run_id, 11, summary=counts)
    metadata = video_analysis.probe_video(video_path)
    db["videoAssets"].update_one(
        {"_id": asset["_id"]},
        {"$set": {
            "sha256": computed_sha256,
            "durationSeconds": metadata.get("duration_seconds"),
            "width": metadata.get("width"),
            "height": metadata.get("height"),
            "uploadStatus": "ready",
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        }},
    )

    if counts["failed"] > 0:
        run_status = "failed"
    elif counts["uncertain"] > 0 or counts["humanReview"] > 0:
        run_status = "partial"
    else:
        run_status = "passed"
    set_stage(db, run_id, 12, status=run_status, summary=counts)

    return {
        "analysisRunId": str(run_id),
        "status": run_status,
        "videoSha256": computed_sha256,
        "tests": counts,
    }


# --- /parse-brief ---------------------------------------------------------------


@app.post("/parse-brief")
def parse_brief(payload: ParseBriefRequest, authorization: Optional[str] = Header(None)) -> dict:
    db = get_db()
    auth_uid, err = authenticate(authorization)
    if err:
        raise HTTPException(status_code=401, detail=err)

    brief = db["sponsorBriefs"].find_one({"_id": ObjectId(payload.sponsorBriefId)})
    if not brief:
        raise HTTPException(status_code=404, detail="Brief not found")
    require_owner(auth_uid, brief["ownerFirebaseUid"])
    uid = brief["ownerFirebaseUid"]

    if not payload.storagePath.startswith(f"users/{uid}/sponsors/{payload.sponsorBriefId}/briefs/"):
        raise HTTPException(status_code=400, detail="Storage path is not owned by the brief owner")

    with tempfile.TemporaryDirectory(prefix="pactra-brief-") as tmp:
        pdf_path = os.path.join(tmp, "brief.pdf")
        get_bucket().blob(payload.storagePath).download_to_filename(pdf_path)
        parsed = brief_parser.parse_brief(pdf_path)

    candidates = []
    for req in parsed["requirements"]:
        candidates.append({
            "key": req.get("key"),
            "type": req["type"],
            "description": req["description"],
            "parameters": req.get("parameters") or {},
            "verificationMode": req.get("verificationMode"),
            "sourceEvidence": req.get("sourceEvidence") or {"page": None, "quote": None},
        })

    return {
        "sponsorBriefId": payload.sponsorBriefId,
        "sourceSha256": parsed["sha256"],
        "rawText": parsed["text"][:100_000],
        "requirements": candidates,
    }
