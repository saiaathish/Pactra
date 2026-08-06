import Link from "next/link";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSessionUser } from "@/lib/firebase/session";
import { getStorageBucket } from "@/lib/firebase/admin";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { AnalysisViewer } from "@/components/analysis-viewer";
import type { AnalysisRunDoc, VideoAssetDoc } from "@/lib/types";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const db = await getDb();
  const run = await db
    .collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
    .findOne({ _id: new ObjectId(id), ownerFirebaseUid: user.uid });
  if (!run) redirect("/campaigns");

  // Signed URL for the tested video — same mechanism as the results route
  // and report page (Admin SDK, 1h expiry) so Replay Violations can seek it.
  let videoUrl: string | null = null;
  try {
    const asset = await db
      .collection<VideoAssetDoc>(COLLECTIONS.videoAssets)
      .findOne({ _id: run.videoAssetId, ownerFirebaseUid: user.uid });
    if (asset?.storagePath) {
      const [url] = await getStorageBucket()
        .file(asset.storagePath)
        .getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
      videoUrl = url;
    }
  } catch {
    // Video asset missing or unreadable — replay falls back to clip-only.
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analysis</h1>
        <p className="mt-1 text-sm text-zinc-500">
          <Link href="/campaigns" className="text-indigo-400 hover:text-indigo-300">
            ← Campaigns
          </Link>
        </p>
      </div>

      <AnalysisViewer
        runId={id}
        videoUrl={videoUrl}
        initialRun={{
          id,
          status: run.status,
          progressPercent: run.progressPercent,
          currentStage: run.currentStage,
          summary: run.summary,
          errorMessageSafe: run.errorMessageSafe,
        }}
      />
    </div>
  );
}
