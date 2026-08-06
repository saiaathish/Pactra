import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { runAnalysisPipeline } from "@/lib/worker/pipeline";
import type { AnalysisRunDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

// The pipeline can take minutes (transcription is windowed and rate-paced), so
// the polling route must not be cut at the default function duration.
export const maxDuration = 300;

/**
 * Run status + progress — polled by the analysis page.
 *
 * Lazy pipeline start: if the analyze route's after() handler did not pick
 * the run up (e.g. the runtime skipped it), the first poll claims the run
 * atomically (queued -> processing) and runs the pipeline itself. Only one
 * poller can win the flip, so this is race-safe; the pipeline's own
 * loadPendingRun accepts queued/processing.
 */
export async function GET(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const runId = requireObjectId((await params).id);
  if (isErrorResponse(runId)) return runId;

  const db = await getDb();
  const col = db.collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns);
  const run = await col.findOne({ _id: runId, ownerFirebaseUid: uid });
  if (!run) return apiError(404, "not found");

  if (run.status === "queued") {
    const claimed = await col.findOneAndUpdate(
      { _id: runId, status: "queued" },
      { $set: { status: "processing", currentStage: "queued", updatedAt: new Date() } }
    );
    if (claimed) {
      void runAnalysisPipeline(runId).catch((err) => {
        console.error("Analysis pipeline background failure (lazy start):", err);
      });
    }
  }

  const updated = await col.findOne({ _id: runId, ownerFirebaseUid: uid });
  return NextResponse.json({
    run: { id: updated?._id?.toString(), ...updated },
  });
}
