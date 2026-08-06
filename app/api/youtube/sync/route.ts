import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, apiError, isErrorResponse } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/encryption";
import { refreshAccessToken, syncChannelAndVideos } from "@/lib/youtube";
import type { YouTubeConnectionDoc } from "@/lib/types";

/** Manual resync: refresh the access token and re-pull channel + videos. */
export async function POST(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const db = await getDb();
  const connection = await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .findOne({ ownerFirebaseUid: uid });
  if (!connection) return apiError(404, "no youtube connection");

  const refreshToken = decryptSecret(connection.encryptedRefreshToken);
  try {
    const tokens = await refreshAccessToken(refreshToken);
    const { channelTitle, videoCount } = await syncChannelAndVideos(
      tokens.access_token,
      uid,
      db,
      connection._id!
    );
    return NextResponse.json({ ok: true, channelTitle, videoCount });
  } catch (err) {
    const code =
      err instanceof Error && err.message.includes("invalid_grant")
        ? "invalid_grant"
        : "sync_failed";
    await db
      .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
      .updateOne(
        { _id: connection._id },
        { $set: { syncStatus: "error", lastErrorCode: code, updatedAt: new Date() } }
      );
    return apiError(502, code === "invalid_grant" ? "YouTube access revoked — reconnect" : "sync failed");
  }
}
