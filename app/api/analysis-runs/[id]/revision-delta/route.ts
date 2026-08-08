import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import {
  computeRevisionDelta,
  type RevisionDeltaResult,
  type RevisionDeltaRun,
  type StableEvidenceSummary,
} from "@/lib/revision-delta";
import type {
  AnalysisRunDoc,
  AnalysisRunStatus,
  EvidenceItemDoc,
  RequirementDoc,
  TestResultDoc,
} from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const COMPLETED_STATUSES: AnalysisRunStatus[] = ["passed", "failed", "partial"];

/**
 * Revision delta between two completed analysis runs of the same campaign and
 * the exact same immutable brief version.
 *
 * - Without ?compareTo=: lists earlier completed runs of the same
 *   campaign + brief version (the picker for the UI).
 * - With ?compareTo=<runId>: computes the deterministic delta (fixed,
 *   regressed, unchanged) between the current run and the earlier one.
 *
 * Evidence is compared via stable summaries (type / timestamps / text / sha256)
 * only — signed URLs never enter the comparison.
 */
export async function GET(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const runId = requireObjectId((await params).id);
  if (isErrorResponse(runId)) return runId;

  const compareTo = new URL(request.url).searchParams.get("compareTo");
  const compareToId = compareTo ? requireObjectId(compareTo) : null;
  if (isErrorResponse(compareToId)) return compareToId;

  const db = await getDb();
  const run = await db
    .collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
    .findOne({ _id: runId, ownerFirebaseUid: uid });
  if (!run) return apiError(404, "not found");

  if (!COMPLETED_STATUSES.includes(run.status)) {
    // Current run still in flight — no delta until it has persisted results.
    return NextResponse.json({ ready: false, runs: [] });
  }

  const candidates = await db
    .collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
    .find({
      ownerFirebaseUid: uid,
      campaignId: run.campaignId,
      briefVersionId: run.briefVersionId,
      status: { $in: COMPLETED_STATUSES },
      _id: { $ne: runId },
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  if (!compareToId) {
    return NextResponse.json({
      ready: true,
      runs: candidates.map(({ _id, videoSha256, summary, createdAt }) => ({
        id: _id?.toString(),
        videoSha256,
        summary,
        createdAt: createdAt.toISOString(),
      })),
    });
  }

  const olderRun = candidates.find((candidate) => candidate._id?.equals(compareToId));
  if (!olderRun) {
    return apiError(
      404,
      "The compared run is not an earlier completed run of this campaign and brief version"
    );
  }

  const [oldResults, newResults, oldEvidence, newEvidence, requirements] = await Promise.all([
    db
      .collection<TestResultDoc>(COLLECTIONS.testResults)
      .find({ ownerFirebaseUid: uid, analysisRunId: olderRun._id })
      .toArray(),
    db
      .collection<TestResultDoc>(COLLECTIONS.testResults)
      .find({ ownerFirebaseUid: uid, analysisRunId: runId })
      .toArray(),
    db
      .collection<EvidenceItemDoc>(COLLECTIONS.evidenceItems)
      .find({ ownerFirebaseUid: uid, analysisRunId: olderRun._id })
      .toArray(),
    db
      .collection<EvidenceItemDoc>(COLLECTIONS.evidenceItems)
      .find({ ownerFirebaseUid: uid, analysisRunId: runId })
      .toArray(),
    db
      .collection<RequirementDoc>(COLLECTIONS.requirements)
      .find({ ownerFirebaseUid: uid, briefVersionId: run.briefVersionId })
      .toArray(),
  ]);

  if (oldResults.length === 0 || newResults.length === 0) {
    return apiError(400, "One of the compared runs has no persisted test results");
  }

  const evidenceById = new Map<string, EvidenceItemDoc>();
  for (const item of [...oldEvidence, ...newEvidence]) {
    evidenceById.set(item._id?.toString() ?? "", item);
  }

  const summarize = (result: TestResultDoc): StableEvidenceSummary[] =>
    result.evidenceIds
      .map((id) => evidenceById.get(id.toString()))
      .filter((item): item is EvidenceItemDoc => Boolean(item))
      .map((item) => ({
        type: item.type,
        startSeconds: item.startSeconds,
        endSeconds: item.endSeconds,
        text: item.text,
        sha256: item.sha256,
      }));

  const toDeltaResult = (result: TestResultDoc): RevisionDeltaResult => ({
    requirementId: result.requirementId.toString(),
    status: result.status,
    evidenceSummaries: summarize(result),
  });

  const oldRunInput: RevisionDeltaRun = {
    id: olderRun._id?.toString() ?? "",
    campaignId: olderRun.campaignId.toString(),
    briefVersionId: olderRun.briefVersionId.toString(),
    videoSha256: olderRun.videoSha256,
  };
  const newRunInput: RevisionDeltaRun = {
    id: run._id?.toString() ?? "",
    campaignId: run.campaignId.toString(),
    briefVersionId: run.briefVersionId.toString(),
    videoSha256: run.videoSha256,
  };

  let delta;
  try {
    delta = computeRevisionDelta(
      oldRunInput,
      newRunInput,
      oldResults.map(toDeltaResult),
      newResults.map(toDeltaResult)
    );
  } catch (err) {
    console.error("Revision delta computation failed:", err);
    return apiError(400, "The compared runs could not be reconciled");
  }

  const requirementMeta: Record<string, { description: string }> = {};
  for (const requirement of requirements) {
    const id = requirement._id?.toString();
    if (id) requirementMeta[id] = { description: requirement.description };
  }

  return NextResponse.json({
    delta,
    requirements: requirementMeta,
    runs: {
      old: {
        id: olderRun._id?.toString(),
        videoSha256: olderRun.videoSha256,
        summary: olderRun.summary,
        createdAt: olderRun.createdAt.toISOString(),
      },
      new: {
        id: run._id?.toString(),
        videoSha256: run.videoSha256,
        summary: run.summary,
        createdAt: run.createdAt.toISOString(),
      },
    },
  });
}
