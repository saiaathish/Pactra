import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getStorageBucket } from "@/lib/firebase/admin";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, apiError, isErrorResponse } from "@/lib/api-helpers";
import { revokeGoogleToken } from "@/lib/youtube";
import { decryptSecret } from "@/lib/encryption";
import type { YouTubeConnectionDoc } from "@/lib/types";

/**
 * Full account deletion: Firebase Storage files → MongoDB documents →
 * YouTube OAuth tokens (revoked) → Firebase Auth user. Any stage failure
 * returns an error so the client knows deletion did not complete.
 */
export async function DELETE(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const stages: string[] = [];

  // 1. Storage files.
  try {
    await getStorageBucket().deleteFiles({ prefix: `users/${uid}/` });
    stages.push("storage");
  } catch (err) {
    return apiError(500, `Storage deletion failed: ${(err as Error).message}`);
  }

  // 2. Revoke YouTube token, then delete documents.
  try {
    const db = await getDb();
    const connection = await db
      .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
      .findOne({ ownerFirebaseUid: uid });
    if (connection?.encryptedRefreshToken) {
      try {
        await revokeGoogleToken(decryptSecret(connection.encryptedRefreshToken));
      } catch {
        // Best-effort revocation; local removal still proceeds.
      }
    }

    for (const collection of Object.values(COLLECTIONS)) {
      await db.collection(collection).deleteMany({ ownerFirebaseUid: uid });
    }
    stages.push("mongodb");
  } catch (err) {
    return apiError(500, `Database deletion failed: ${(err as Error).message}`);
  }

  // 3. Firebase Auth user (last — identity removal is irreversible).
  try {
    await getAdminAuth().deleteUser(uid);
    stages.push("auth");
  } catch (err) {
    return apiError(
      500,
      `Account data deleted (${stages.join(", ")}) but auth user removal failed: ${(err as Error).message}`
    );
  }

  return NextResponse.json({ ok: true, deleted: stages });
}
