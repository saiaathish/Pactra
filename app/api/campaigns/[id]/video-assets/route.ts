import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import type { CampaignDoc, VideoAssetDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const campaignId = requireObjectId((await params).id);
  if (isErrorResponse(campaignId)) return campaignId;

  const db = await getDb();
  const campaign = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .findOne({ _id: campaignId, ownerFirebaseUid: uid });
  if (!campaign) return apiError(404, "campaign not found");

  const assets = await db
    .collection<VideoAssetDoc>(COLLECTIONS.videoAssets)
    .find({ ownerFirebaseUid: uid, campaignId })
    .sort({ versionNumber: -1 })
    .toArray();

  return NextResponse.json({
    videoAssets: assets.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
  });
}
