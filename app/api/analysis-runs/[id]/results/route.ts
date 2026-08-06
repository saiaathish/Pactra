import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { getStorageBucket } from "@/lib/firebase/admin";
import type {
  AnalysisRunDoc,
  EvidenceItemDoc,
  RequirementDoc,
  TestResultDoc,
} from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Full results for a run: test results joined with their requirements and
 * evidence. Evidence files get short-lived signed URLs via the Admin SDK
 * (never public download tokens).
 */
export async function GET(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const runId = requireObjectId((await params).id);
  if (isErrorResponse(runId)) return runId;

  const db = await getDb();
  const run = await db
    .collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
    .findOne({ _id: runId, ownerFirebaseUid: uid });
  if (!run) return apiError(404, "not found");

  const [results, evidence, requirements] = await Promise.all([
    db.collection<TestResultDoc>(COLLECTIONS.testResults)
      .find({ ownerFirebaseUid: uid, analysisRunId: runId })
      .toArray(),
    db.collection<EvidenceItemDoc>(COLLECTIONS.evidenceItems)
      .find({ ownerFirebaseUid: uid, analysisRunId: runId })
      .toArray(),
    db.collection<RequirementDoc>(COLLECTIONS.requirements)
      .find({ ownerFirebaseUid: uid, briefVersionId: run.briefVersionId })
      .toArray(),
  ]);

  // Short-lived signed URLs for evidence files.
  const signedUrls: Record<string, string> = {};
  const bucket = getStorageBucket();
  for (const ev of evidence) {
    if (!ev.storagePath) continue;
    try {
      const [url] = await bucket.file(ev.storagePath).getSignedUrl({
        action: "read",
        expires: Date.now() + 60 * 60 * 1000,
      });
      signedUrls[ev.storagePath] = url;
    } catch {
      // File may not exist yet — skip.
    }
  }

  const requirementById = new Map(requirements.map((r) => [r._id?.toString(), r]));

  return NextResponse.json({
    run: { id: run._id?.toString(), ...run },
    results: results.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
      requirement: rest.requirementId
        ? requirementById.get(rest.requirementId.toString()) ?? null
        : null,
    })),
    evidence: evidence.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
      signedUrl: rest.storagePath ? (signedUrls[rest.storagePath] ?? null) : null,
    })),
  });
}
