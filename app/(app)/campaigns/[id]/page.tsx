import Link from "next/link";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoUploader } from "@/components/video-uploader";
import { AnalysisPanel } from "@/components/analysis-panel";
import type { AnalysisRunDoc, BriefVersionDoc, CampaignDoc, VideoAssetDoc } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-zinc-500/15 text-zinc-400",
  awaiting_video: "bg-amber-500/15 text-amber-400",
  analyzing: "bg-indigo-500/15 text-indigo-400",
  revision_required: "bg-red-500/15 text-red-400",
  passed: "bg-emerald-500/15 text-emerald-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  published: "bg-emerald-500/15 text-emerald-400",
  archived: "bg-zinc-500/15 text-zinc-400",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const db = await getDb();
  const campaign = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .findOne({ _id: new ObjectId(id), ownerFirebaseUid: user.uid });
  if (!campaign) redirect("/campaigns");

  const [briefVersion, videoAssets, analysisRuns] = await Promise.all([
    db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions).findOne({ _id: campaign.briefVersionId, ownerFirebaseUid: user.uid }),
    db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets)
      .find({ ownerFirebaseUid: user.uid, campaignId: campaign._id })
      .sort({ versionNumber: -1 })
      .toArray(),
    db.collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
      .find({ ownerFirebaseUid: user.uid, campaignId: campaign._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {campaign.assignedYoutubeVideoId
              ? `Assigned YouTube video: ${campaign.assignedYoutubeVideoId}`
              : "Planned video (rough cut from creator)"}
            {briefVersion && (
              <Link href={`/briefs/${briefVersion._id?.toString()}`} className="ml-2 text-indigo-400 hover:text-indigo-300">
                brief v{briefVersion.versionNumber}
              </Link>
            )}
          </p>
        </div>
        <Badge className={STATUS_COLORS[campaign.status] ?? ""}>{campaign.status.replace("_", " ")}</Badge>
      </div>

      <Card>
        <CardTitle>Upload rough cut (new version)</CardTitle>
        <div className="mt-4">
          <VideoUploader campaignId={id} />
        </div>
      </Card>

      <Card>
        <CardTitle>Run preflight</CardTitle>
        <div className="mt-4">
          <AnalysisPanel
            campaignId={id}
            assets={videoAssets.map((v) => ({
              id: v._id!.toString(),
              versionNumber: v.versionNumber,
              uploadStatus: v.uploadStatus,
            }))}
            defaultDescription={campaign.plannedDescription ?? ""}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Video versions</CardTitle>
        {videoAssets.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No videos uploaded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {videoAssets.map((v) => (
              <li key={v._id?.toString()} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">
                    v{v.versionNumber} · {v.originalFilename}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(v.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    {v.sha256 && ` · sha256:${v.sha256.slice(0, 12)}…`}
                  </p>
                </div>
                <Badge className="bg-zinc-800 text-zinc-400">{v.uploadStatus}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Analysis history</CardTitle>
        {analysisRuns.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No runs yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {analysisRuns.map((run) => (
              <li key={run._id?.toString()} className="flex items-center justify-between py-3">
                <Link href={`/analysis/${run._id?.toString()}`} className="text-sm font-medium hover:text-indigo-300">
                  {new Date(run.createdAt).toLocaleString()} · {run.currentStage ?? run.status}
                </Link>
                <Badge className="bg-zinc-800 text-zinc-400">{run.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
