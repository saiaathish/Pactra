import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { videoAssetInitSchema } from "@/lib/validation";
import type { CampaignDoc, VideoAssetDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Creates a videoAsset row (status "uploading") so the client knows the
 * storage path before uploading: users/{uid}/campaigns/{campaignId}/videos/
 * {videoAssetId}/{filename}. Every revised rough cut is a NEW version — prior
 * tested videos are never overwritten.
 */
export async function POST(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const campaignId = requireObjectId((await params).id);
  if (isErrorResponse(campaignId)) return campaignId;

  const body = await request.json().catch(() => null);
  const parsed = videoAssetInitSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const campaign = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .findOne({ _id: campaignId, ownerFirebaseUid: uid });
  if (!campaign) return apiError(404, "campaign not found");

  const col = db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets);
  const latest = await col
    .find({ ownerFirebaseUid: uid, campaignId })
    .sort({ versionNumber: -1 })
    .limit(1)
    .toArray();
  const versionNumber = (latest[0]?.versionNumber ?? 0) + 1;

  const now = new Date();
  const doc: VideoAssetDoc = {
    ownerFirebaseUid: uid,
    campaignId,
    versionNumber,
    storagePath: "",
    originalFilename: parsed.data.originalFilename,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes, // verified against trusted metadata on complete
    sha256: null,
    durationSeconds: null,
    width: null,
    height: null,
    uploadStatus: "uploading",
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(doc);

  return NextResponse.json({
    id: result.insertedId.toString(),
    versionNumber,
    storagePath: `users/${uid}/campaigns/${campaignId.toString()}/videos/${result.insertedId.toString()}/${encodeURIComponent(parsed.data.originalFilename)}`,
  });
}
