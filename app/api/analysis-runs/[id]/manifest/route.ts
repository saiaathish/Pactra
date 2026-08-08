import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
  canonicalJson,
  sha256Hex,
} from "@/lib/api-helpers";
import { getStorageBucket } from "@/lib/firebase/admin";
import type {
  AnalysisRunDoc,
  ApprovalManifestDoc,
  BriefVersionDoc,
  EvidenceItemDoc,
  RequirementDoc,
  TestResultDoc,
  VideoAssetDoc,
} from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Generates the cryptographically bound approval manifest for a passed run:
 * SHA-256 of the exact brief version, the exact video file, and the exact
 * description snapshot. A JSON + HTML report is written to Firebase Storage
 * via the Admin SDK. Refuses to generate for runs with failures.
 */
export async function POST(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const runId = requireObjectId((await params).id);
  if (isErrorResponse(runId)) return runId;

  const db = await getDb();
  const run = await db
    .collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
    .findOne({ _id: runId, ownerFirebaseUid: uid });
  if (!run) return apiError(404, "run not found");
  if (run.status !== "passed") {
    return apiError(
      409,
      run.status === "failed" || run.status === "error"
        ? "run has failures — fix them and re-run before generating a manifest"
        : "run is not finished"
    );
  }

  const [briefVersion, asset, results, evidence, requirements] = await Promise.all([
    db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions).findOne({ _id: run.briefVersionId, ownerFirebaseUid: uid }),
    db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets).findOne({ _id: run.videoAssetId, ownerFirebaseUid: uid }),
    db.collection<TestResultDoc>(COLLECTIONS.testResults).find({ ownerFirebaseUid: uid, analysisRunId: runId }).toArray(),
    db.collection<EvidenceItemDoc>(COLLECTIONS.evidenceItems).find({ ownerFirebaseUid: uid, analysisRunId: runId }).toArray(),
    db.collection<RequirementDoc>(COLLECTIONS.requirements).find({ ownerFirebaseUid: uid, briefVersionId: run.briefVersionId }).toArray(),
  ]);
  if (!briefVersion?.sourceSha256) return apiError(409, "brief version has no source hash");
  if (!asset?.sha256) return apiError(409, "video asset has no verified hash");

  const reqById = new Map(requirements.map((r) => [r._id?.toString(), r]));
  const manifestJson = {
    engineVersion: run.engineVersion,
    briefSha256: briefVersion.sourceSha256,
    videoSha256: asset.sha256,
    descriptionSha256: run.descriptionSha256,
    tests: run.summary,
    results: results.map((r) => ({
      requirementId: r.requirementId.toString(),
      requirement: reqById.get(r.requirementId.toString())?.description ?? "",
      status: r.status,
      confidence: r.confidence,
      explanation: r.explanation,
    })),
    evidence: evidence.map((e) => ({
      type: e.type,
      startSeconds: e.startSeconds,
      endSeconds: e.endSeconds,
      storagePath: e.storagePath,
    })),
    transcriptProvenance: run.transcriptProvenance ?? null,
    generatedAt: new Date().toISOString(),
  };
  const manifestSha256 = sha256Hex(canonicalJson(manifestJson));

  const now = new Date();
  const manifestDoc: ApprovalManifestDoc = {
    ownerFirebaseUid: uid,
    campaignId: run.campaignId,
    analysisRunId: runId,
    briefVersionId: run.briefVersionId,
    briefSha256: briefVersion.sourceSha256,
    videoAssetId: run.videoAssetId,
    videoSha256: asset.sha256,
    descriptionSha256: run.descriptionSha256,
    manifestJson,
    manifestSha256,
    reportStoragePath: `users/${uid}/analysis/${runId.toString()}/reports/manifest.json`,
    createdAt: now,
  };

  const existing = await db
    .collection<ApprovalManifestDoc>(COLLECTIONS.approvalManifests)
    .findOne({ ownerFirebaseUid: uid, analysisRunId: runId });
  if (!existing) {
    await db.collection<ApprovalManifestDoc>(COLLECTIONS.approvalManifests).insertOne(manifestDoc);
  }

  // Write the JSON report to Firebase Storage (backend-only path). Guarded by
  // the same existence check as the DB insert so a re-POST never rewrites the
  // stored packet with a different generatedAt/hash than the DB record.
  if (!existing) {
    const bucket = getStorageBucket();
    const reportFile = bucket.file(manifestDoc.reportStoragePath);
    await reportFile.save(JSON.stringify(manifestJson, null, 2), {
      contentType: "application/json",
    });
  }

  return NextResponse.json({
    manifest: {
      ...manifestDoc,
      id: (existing?._id ?? undefined)?.toString(),
    },
  });
}
