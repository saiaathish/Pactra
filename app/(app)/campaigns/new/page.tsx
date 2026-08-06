import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { CampaignForm } from "@/components/campaign-form";
import type { BriefVersionDoc, SponsorBriefDoc, SponsorDoc, YouTubeVideoDoc } from "@/lib/types";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ briefVersionId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { briefVersionId } = await searchParams;

  const db = await getDb();
  const [sponsors, confirmedVersions, youtubeVideos] = await Promise.all([
    db.collection<SponsorDoc>(COLLECTIONS.sponsors)
      .find({ ownerFirebaseUid: user.uid })
      .sort({ name: 1 })
      .toArray(),
    db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
      .find({ ownerFirebaseUid: user.uid, status: "confirmed" })
      .sort({ versionNumber: -1 })
      .toArray(),
    db.collection<YouTubeVideoDoc>(COLLECTIONS.youtubeVideos)
      .find({ ownerFirebaseUid: user.uid })
      .sort({ publishedAt: -1 })
      .limit(50)
      .toArray(),
  ]);

  const briefs = await db
    .collection<SponsorBriefDoc>(COLLECTIONS.sponsorBriefs)
    .find({ ownerFirebaseUid: user.uid })
    .toArray();
  const briefById = new Map(briefs.map((b) => [b._id?.toString(), b.name]));

  const sponsorOptions = sponsors.map((s) => ({
    id: s._id!.toString(),
    name: s.name,
    briefs: confirmedVersions
      .filter((v) => v.sponsorId.toString() === s._id?.toString())
      .map((v) => ({
        id: v._id!.toString(),
        versionNumber: v.versionNumber,
        briefName: briefById.get(v.sponsorBriefId.toString()) ?? "Brief",
      })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New campaign</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Requires a sponsor and a confirmed brief version. Assign a planned
          video or an existing YouTube video.
        </p>
      </div>
      <Card>
        <CardTitle>Campaign details</CardTitle>
        <div className="mt-4">
          <CampaignForm
            sponsors={sponsorOptions}
            youtubeVideos={youtubeVideos.map((v) => ({
              youtubeVideoId: v.youtubeVideoId,
              title: v.title,
            }))}
            initialBriefVersionId={briefVersionId}
          />
        </div>
      </Card>
    </div>
  );
}
