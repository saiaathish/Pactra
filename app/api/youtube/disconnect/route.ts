import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, isErrorResponse } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/encryption";
import { revokeGoogleToken } from "@/lib/youtube";
import type { YouTubeConnectionDoc } from "@/lib/types";

/**
 * Explicit disconnect: revokes the Google token (best-effort) and removes the
 * connection. Synced youtubeVideos rows stay as read-only history; campaign
 * assignments are unaffected.
 */
export async function POST(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const db = await getDb();
  const connection = await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .findOne({ ownerFirebaseUid: uid });

  if (connection?.encryptedRefreshToken) {
    try {
      await revokeGoogleToken(decryptSecret(connection.encryptedRefreshToken));
    } catch {
      // Best-effort; local removal still proceeds.
    }
  }

  await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .deleteOne({ ownerFirebaseUid: uid });

  return NextResponse.json({ ok: true });
}
