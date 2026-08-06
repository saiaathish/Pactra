import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
  parseObjectId,
} from "@/lib/api-helpers";
import { videoAssetCompleteSchema } from "@/lib/validation";
import { verifyUploadedFile } from "@/lib/storage";
import type { CampaignDoc, VideoAssetDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Called after the client finishes uploading. The backend verifies:
 *  - the path is owned by the verified uid and inside this campaign's videos
 *  - trusted metadata (size, content type) read directly from Firebase Storage
 * The row moves to "uploaded"; the worker later computes SHA-256 and media
 * metadata and flips it to "ready" (never trust the client's hash/duration).
 */
export async function POST(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const campaignId = requireObjectId((await params).id);
  if (isErrorResponse(campaignId)) return campaignId;

  const body = await request.json().catch(() => null);
  const parsed = videoAssetCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }
  const videoAssetId = parseObjectId(parsed.data.videoAssetId);
  if (!videoAssetId) return apiError(400, "invalid videoAssetId");

  const db = await getDb();
  const [campaign, asset] = await Promise.all([
    db.collection<CampaignDoc>(COLLECTIONS.campaigns).findOne({ _id: campaignId, ownerFirebaseUid: uid }),
    db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets).findOne({ _id: videoAssetId, ownerFirebaseUid: uid }),
  ]);
  if (!campaign) return apiError(404, "campaign not found");
  if (!asset || asset.campaignId.toString() !== campaignId.toString()) {
    return apiError(404, "video asset not found");
  }

  let meta;
  try {
    meta = await verifyUploadedFile(
      uid,
      parsed.data.storagePath,
      `users/${uid}/campaigns/${campaignId.toString()}/videos/`
    );
  } catch (err) {
    return apiError(400, (err as Error).message);
  }

  const allowedTypes = ["video/mp4", "video/quicktime", "video/webm"];
  if (!meta.contentType || !allowedTypes.includes(meta.contentType)) {
    return apiError(400, `unsupported content type: ${meta.contentType}`);
  }
  if (meta.sizeBytes === 0) {
    return apiError(400, "uploaded file is empty");
  }

  await db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets).updateOne(
    { _id: videoAssetId },
    {
      $set: {
        storagePath: parsed.data.storagePath,
        contentType: meta.contentType,
        sizeBytes: meta.sizeBytes, // trusted metadata wins over client claim
        uploadStatus: "uploaded",
        updatedAt: new Date(),
      },
    }
  );

  return NextResponse.json({ ok: true, videoAssetId: videoAssetId.toString() });
}
