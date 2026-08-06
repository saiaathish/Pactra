import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { YouTubeConnectCard } from "@/components/youtube-connect-card";
import { formatSeconds } from "@/lib/utils";
import type { YouTubeConnectionDoc, YouTubeVideoDoc } from "@/lib/types";

export default async function YoutubePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const [connection, videos] = await Promise.all([
    db.collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections).findOne({ ownerFirebaseUid: user.uid }),
    db.collection<YouTubeVideoDoc>(COLLECTIONS.youtubeVideos)
      .find({ ownerFirebaseUid: user.uid })
      .sort({ publishedAt: -1 })
      .limit(20)
      .toArray(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">YouTube</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Read-only connection. Synced videos can be assigned to campaigns;
          full analysis still needs the matching rough-cut MP4.
        </p>
      </div>

      <Card>
        <CardTitle>Channel connection</CardTitle>
        <div className="mt-4">
          <YouTubeConnectCard
            hasConnection={!!connection}
            syncStatus={connection?.syncStatus}
            channelTitle={connection?.channelTitle}
            lastErrorCode={connection?.lastErrorCode}
          />
        </div>
        {connection?.channelThumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={connection.channelThumbnailUrl}
            alt={connection.channelTitle}
            className="mt-4 h-12 w-12 rounded-full"
          />
        )}
      </Card>

      <Card>
        <CardTitle>Synced videos</CardTitle>
        {videos.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No synced videos yet. Connect YouTube above, then re-sync.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {videos.map((v) => (
              <li key={v._id?.toString()} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-zinc-500">
                    {v.publishedAt ? v.publishedAt.toLocaleDateString() : "—"} ·{" "}
                    {v.durationSeconds ? formatSeconds(v.durationSeconds) : "?"}
                  </p>
                </div>
                <Badge className="bg-zinc-800 text-zinc-400">{v.privacyStatus}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
