import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import type { AnalysisRunDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Cancels a queued/processing run. */
export async function POST(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const runId = requireObjectId((await params).id);
  if (isErrorResponse(runId)) return runId;

  const db = await getDb();
  const result = await db.collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns).updateOne(
    { _id: runId, ownerFirebaseUid: uid, status: { $in: ["queued", "processing"] } },
    { $set: { status: "cancelled", updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) return apiError(404, "run not found or not cancellable");

  return NextResponse.json({ ok: true });
}
