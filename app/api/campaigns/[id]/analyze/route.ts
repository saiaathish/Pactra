import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
  parseObjectId,
  sha256Hex,
} from "@/lib/api-helpers";
import { analyzeSchema } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";
import { runAnalysisPipeline } from "@/lib/worker/pipeline";
import type {
  AnalysisRunDoc,
  BriefVersionDoc,
  CampaignDoc,
  VideoAssetDoc,
} from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

// The in-app pipeline (download → ffmpeg → transcribe → tests → evidence)
// runs in this function after the response, within Vercel's fluid compute
// budget. Hobby caps this at 300s — plenty for demo videos.
export const maxDuration = 300;

/**
 * Creates an analysis run pinned to the exact brief version, video asset, and
 * description snapshot (all SHA-256 bound), then hands the run id to the
 * in-app analysis pipeline (run in the background via `after()`; the UI polls
 * live stage progress). Idempotency: an active run for the same campaign+asset
 * is rejected (409). Rate limiting: at most 3 active runs per user.
 */
export async function POST(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const campaignId = requireObjectId((await params).id);
  if (isErrorResponse(campaignId)) return campaignId;

  const body = await request.json().catch(() => null);
  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }
  const videoAssetId = parseObjectId(parsed.data.videoAssetId);
  if (!videoAssetId) return apiError(400, "invalid videoAssetId");

  const db = await getDb();
  const runsCol = db.collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns);

  // Rate limit: 3 concurrent active runs per user.
  const activeCount = await runsCol.countDocuments({
    ownerFirebaseUid: uid,
    status: { $in: ["queued", "processing"] },
  });
  if (activeCount >= 3) {
    return apiError(429, "too many active analysis runs — wait for one to finish");
  }

  // Idempotency: reject a duplicate active run for the same inputs.
  const existing = await runsCol.findOne({
    ownerFirebaseUid: uid,
    campaignId,
    videoAssetId,
    status: { $in: ["queued", "processing"] },
  });
  if (existing) {
    return apiError(409, "an active run already exists for this video");
  }

  const [campaign, asset] = await Promise.all([
    db.collection<CampaignDoc>(COLLECTIONS.campaigns).findOne({ _id: campaignId, ownerFirebaseUid: uid }),
    db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets).findOne({ _id: videoAssetId, ownerFirebaseUid: uid }),
  ]);
  if (!campaign) return apiError(404, "campaign not found");
  const version = await db
    .collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
    .findOne({ _id: campaign.briefVersionId, ownerFirebaseUid: uid });
  if (!version || version.status !== "confirmed") {
    return apiError(409, "campaign has no confirmed brief version");
  }
  if (!asset || asset.campaignId.toString() !== campaignId.toString()) {
    return apiError(404, "video asset not found");
  }

  const { engineVersion } = getServerEnv();
  const descriptionSnapshot = parsed.data.descriptionSnapshot ?? "";
  const now = new Date();
  const run: AnalysisRunDoc = {
    ownerFirebaseUid: uid,
    campaignId,
    briefVersionId: version._id!,
    videoAssetId: asset._id!,
    videoSha256: asset.sha256 ?? "", // pipeline verifies/fills this
    descriptionSnapshot,
    descriptionSha256: sha256Hex(descriptionSnapshot),
    engineVersion,
    status: "queued",
    progressPercent: 0,
    currentStage: "queued",
    startedAt: null,
    completedAt: null,
    summary: { passed: 0, failed: 0, uncertain: 0, humanReview: 0 },
    errorCode: null,
    errorMessageSafe: null,
    createdAt: now,
    updatedAt: now,
  };
  const insert = await runsCol.insertOne(run);

  await db.collection<CampaignDoc>(COLLECTIONS.campaigns).updateOne(
    { _id: campaignId },
    { $set: { status: "analyzing", updatedAt: new Date() } }
  );

  // The pipeline runs SYNCHRONOUSLY inside this request. Serverless runtimes
  // suspend lambdas shortly after the response is sent, so fire-and-forget
  // work (after() or a void promise) stalls mid-run. A blocking request keeps
  // the invocation alive for the full maxDuration (300s) budget. The client
  // polls the run afterward (already terminal here).
  const runId = insert.insertedId;
  try {
    const result = await runAnalysisPipeline(runId);
    return NextResponse.json({ ...result, analysisRunId: runId.toString() });
  } catch {
    // The pipeline records the failure on the run (status: error) — surface it.
    return NextResponse.json({ analysisRunId: runId.toString(), status: "error" });
  }
}
