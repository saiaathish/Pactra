/**
 * In-app analysis pipeline (replaces the Python Cloud Run worker's /analyze).
 *
 * Runs entirely inside the Next.js server function on Vercel:
 *   1. Loads the analysis run from MongoDB (never accepts arbitrary URLs).
 *   2. Verifies the owning Firebase UID and referenced resources.
 *   3. Downloads the video + brief from Firebase Storage via Admin SDK.
 *   4. Computes SHA-256 itself — rejects the run on hash mismatch (fail closed).
 *   5. Extracts audio, transcript, frames, and evidence clips.
 *   6. Runs deterministic + AI-assisted tests (policy-gated verdicts).
 *   7. Uploads evidence to Firebase Storage, saves structured results to MongoDB.
 *   8. Updates progress after each major stage.
 *
 * Stage/status writes are deliberately identical to the worker contract so the
 * existing polling UI (`/api/analysis-runs/:id`) works unchanged.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ObjectId, type Db } from "mongodb";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { getStorageBucket } from "@/lib/firebase/admin";
import {
  extractAudio,
  probeVideo,
  sampleFrames,
  sha256File,
} from "./ffmpeg";
import { transcribeAudioFile } from "./transcription";
import { Transcript, runAll } from "./requirementTests";
import { buildClip, createEvidenceItem, fileSha256, uploadFile } from "./evidence";
import type {
  AnalysisRunDoc,
  CampaignDoc,
  RequirementDoc,
  VideoAssetDoc,
  TestResultStatus,
} from "@/lib/types";

export const STAGES = [
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
] as const;

const TERMINAL = new Set(["passed", "failed", "partial", "error", "cancelled"]);

/** Hard cap on analyzable video length (serverless + transcription budget). */
const MAX_VIDEO_DURATION_S = 300;

interface StageUpdate {
  status?: AnalysisRunDoc["status"];
  summary?: AnalysisRunDoc["summary"];
  errorCode?: string | null;
  errorMessageSafe?: string | null;
  startedAt?: Date | null;
}

async function setStage(
  db: Db,
  runId: ObjectId,
  stageIdx: number,
  extra: StageUpdate = {}
): Promise<void> {
  const update: Record<string, unknown> = {
    currentStage: STAGES[stageIdx],
    progressPercent: Math.round((stageIdx / (STAGES.length - 1)) * 100),
    updatedAt: new Date(),
  };
  if (extra.status) update.status = extra.status;
  if (extra.summary !== undefined) update.summary = extra.summary;
  if (extra.errorCode !== undefined) update.errorCode = extra.errorCode;
  if (extra.errorMessageSafe !== undefined) update.errorMessageSafe = extra.errorMessageSafe;
  if (extra.startedAt !== undefined) update.startedAt = extra.startedAt;
  if (extra.status && TERMINAL.has(extra.status)) {
    update.completedAt = new Date();
  }
  await db.collection(COLLECTIONS.analysisRuns).updateOne({ _id: runId }, { $set: update });
}

/** Loads the run and asserts it is still queued/processing. */
async function loadPendingRun(db: Db, runId: ObjectId) {
  const run = await db
    .collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
    .findOne({ _id: runId });
  if (!run) throw new Error("Analysis run not found");
  if (!["queued", "processing"].includes(run.status)) {
    throw new Error("Run already started or finished");
  }
  return run;
}

export async function runAnalysisPipeline(runId: ObjectId): Promise<{
  analysisRunId: string;
  status: string;
  videoSha256: string;
  tests: { passed: number; failed: number; uncertain: number; humanReview: number };
}> {
  const db = await getDb();
  const run = await loadPendingRun(db, runId);
  const uid = run.ownerFirebaseUid;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pactra-"));

  try {
    await setStage(db, runId, 0, { status: "processing", startedAt: new Date() });

    // --- validating_inputs: ownership of every referenced resource ----------
    await setStage(db, runId, 1);
    const campaign = await db
      .collection<CampaignDoc>(COLLECTIONS.campaigns)
      .findOne({ _id: run.campaignId, ownerFirebaseUid: uid });
    if (!campaign) throw new Error("Campaign not found");
    const briefVersion = await db.collection(COLLECTIONS.briefVersions).findOne({
      _id: run.briefVersionId,
      ownerFirebaseUid: uid,
    });
    if (!briefVersion) throw new Error("Brief version not found");
    if (briefVersion.status !== "confirmed") {
      throw new Error("Brief version is not confirmed");
    }
    const asset = await db
      .collection<VideoAssetDoc>(COLLECTIONS.videoAssets)
      .findOne({ _id: run.videoAssetId, ownerFirebaseUid: uid });
    if (!asset) throw new Error("Video asset not found");

    const requirements = await db
      .collection<RequirementDoc>(COLLECTIONS.requirements)
      .find({
        ownerFirebaseUid: uid,
        briefVersionId: run.briefVersionId,
        status: "confirmed",
      })
      .toArray();

    // --- downloading: signed URL + fetch (the Admin SDK's streaming download
    // can hang inside the Vercel lambda; plain fetch is reliable there) -------
    await setStage(db, runId, 2);
    const videoPath = path.join(workDir, "input.mp4");
    const [signedUrl] = await getStorageBucket().file(asset.storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
    });
    const dlResp = await fetch(signedUrl);
    if (!dlResp.ok) {
      throw new Error(`Video download failed (${dlResp.status})`);
    }
    await fs.promises.writeFile(videoPath, Buffer.from(await dlResp.arrayBuffer()));

    // --- hashing: compute ourselves; fail closed on mismatch ------------------
    await setStage(db, runId, 3);
    const computedSha256 = await sha256File(videoPath);
    if (asset.sha256 && asset.sha256 !== computedSha256) {
      throw new Error(
        "Video hash mismatch — the uploaded file differs from the recorded asset"
      );
    }

    // --- duration guard: fail fast with a clear error instead of timing out ---
    // Transcription is windowed (Gemini free tier paces ~1 request/40s), so
    // videos beyond the demo budget cannot complete inside the serverless
    // function window. Refuse them loudly rather than hang mid-run.
    const { durationSeconds: videoDuration } = await probeVideo(videoPath);
    if (videoDuration > MAX_VIDEO_DURATION_S) {
      throw new Error(
        `Video is ${Math.round(videoDuration)}s — exceeds the maximum demo duration of ${MAX_VIDEO_DURATION_S / 60} minutes`
      );
    }

    // --- extracting_audio -----------------------------------------------------
    await setStage(db, runId, 4);
    const audioPath = path.join(workDir, "audio.wav");
    await extractAudio(videoPath, audioPath);

    // --- transcribing ---------------------------------------------------------
    await setStage(db, runId, 5);
    const { segments, provenance } = await transcribeAudioFile(audioPath, computedSha256);
    const transcript = new Transcript(segments);
    if (segments.length === 0) throw new Error("No transcript produced");
    // Persist where the transcript came from so results always show it (no
    // hidden fallback: LIVE vs SHA-bound DEMO RECOVERY FIXTURE).
    await db.collection(COLLECTIONS.analysisRuns).updateOne(
      { _id: runId },
      { $set: { transcriptProvenance: provenance, updatedAt: new Date() } }
    );

    // --- sampling_frames (best-effort; stretch visuals) ----------------------
    await setStage(db, runId, 6);
    try {
      await sampleFrames(videoPath, path.join(workDir, "frames"));
    } catch (err) {
      console.warn("Frame sampling failed:", err);
    }

    // --- running tests ---------------------------------------------------------
    await setStage(db, runId, 7);
    const description = run.descriptionSnapshot ?? "";
    const aiKey = process.env.AI_API_KEY ?? null;
    const model = process.env.AI_MODEL ?? "gpt-4o-mini";
    const brandNames = campaign.plannedTitle ? [campaign.plannedTitle] : null;

    const outcomes = await runAll(
      requirements.map((r) => ({
        id: r._id!.toString(),
        type: r.type,
        parameters: r.parameters ?? {},
      })),
      transcript,
      description,
      {
        brandNames,
        aiKey,
        model,
        videoDurationS: asset.durationSeconds,
      }
    );

    // --- creating_evidence -----------------------------------------------------
    await setStage(db, runId, 10);
    const counts = { passed: 0, failed: 0, uncertain: 0, humanReview: 0 };
    for (const outcome of outcomes) {
      const status = outcome.status as TestResultStatus;
      if (status === "pass") counts.passed += 1;
      else if (status === "fail") counts.failed += 1;
      else if (status === "uncertain") counts.uncertain += 1;
      else if (status === "human_review") counts.humanReview += 1;

      const inserted = await db.collection(COLLECTIONS.testResults).insertOne({
        ownerFirebaseUid: uid,
        analysisRunId: runId,
        requirementId: new ObjectId(outcome.requirement_id),
        status,
        observedValue: outcome.observed_value,
        requiredValue: outcome.required_value,
        confidence: outcome.confidence,
        explanation: outcome.explanation,
        evidenceIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const testResultId = inserted.insertedId;

      const evidenceIds: ObjectId[] = [];
      for (const ev of outcome.evidence) {
        if (ev.type === "description_span") {
          evidenceIds.push(
            await createEvidenceItem(db, {
              uid,
              analysisRunId: runId,
              testResultId,
              type: "description_span",
              text: (ev.text ?? "").slice(0, 2000),
            })
          );
        } else if (ev.type === "transcript") {
          const evId = await createEvidenceItem(db, {
            uid,
            analysisRunId: runId,
            testResultId,
            type: "transcript",
            text: ev.text ?? null,
            startSeconds: ev.startSeconds ?? null,
            endSeconds: ev.endSeconds ?? null,
          });
          evidenceIds.push(evId);
          // Clip for fails/uncertain with timestamps.
          if (
            ["fail", "uncertain"].includes(status) &&
            ev.startSeconds !== null &&
            ev.startSeconds !== undefined
          ) {
            try {
              const clipPath = await buildClip(
                videoPath,
                ev.startSeconds,
                ev.endSeconds ?? ev.startSeconds + 15,
                workDir
              );
              const clipStoragePath = `users/${uid}/analysis/${runId}/evidence/${evId}/clip.mp4`;
              await uploadFile(clipPath, clipStoragePath, "video/mp4");
              evidenceIds.push(
                await createEvidenceItem(db, {
                  uid,
                  analysisRunId: runId,
                  testResultId,
                  type: "video_clip",
                  startSeconds: ev.startSeconds,
                  endSeconds: ev.endSeconds ?? ev.startSeconds + 15,
                  storagePath: clipStoragePath,
                  sha256: await fileSha256(clipPath),
                })
              );
            } catch (clipErr) {
              console.warn("Clip generation failed:", clipErr);
            }
          }
        }
      }

      await db
        .collection(COLLECTIONS.testResults)
        .updateOne({ _id: testResultId }, { $set: { evidenceIds } });
    }

    // --- saving_results ---------------------------------------------------------
    await setStage(db, runId, 11, { summary: counts });
    const metadata = await probeVideo(videoPath);
    await db.collection(COLLECTIONS.videoAssets).updateOne(
      { _id: asset._id },
      {
        $set: {
          sha256: computedSha256,
          durationSeconds: metadata.durationSeconds,
          width: metadata.width,
          height: metadata.height,
          uploadStatus: "ready",
          updatedAt: new Date(),
        },
      }
    );

    let runStatus: AnalysisRunDoc["status"];
    if (counts.failed > 0) runStatus = "failed";
    else if (counts.uncertain > 0 || counts.humanReview > 0) runStatus = "partial";
    else runStatus = "passed";
    await setStage(db, runId, 12, { status: runStatus, summary: counts });
    // The run doc's own hash (the asset doc already carries it). Revision
    // delta and any downstream binding read it from the run.
    await db.collection(COLLECTIONS.analysisRuns).updateOne(
      { _id: runId },
      { $set: { videoSha256: computedSha256, updatedAt: new Date() } }
    );

    return {
      analysisRunId: runId.toString(),
      status: runStatus,
      videoSha256: computedSha256,
      tests: counts,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Analysis pipeline failed:", err);
    await setStage(db, runId, 12, {
      status: "error",
      errorCode: "pipeline_failed",
      errorMessageSafe: message.slice(0, 500),
    });
    throw err;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
