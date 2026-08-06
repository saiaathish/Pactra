import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { campaignUpdateSchema } from "@/lib/validation";
import type {
  AnalysisRunDoc,
  BriefVersionDoc,
  CampaignDoc,
  VideoAssetDoc,
} from "@/lib/types";

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
  if (!campaign) return apiError(404, "not found");

  const [videoAssets, analysisRuns, briefVersion] = await Promise.all([
    db.collection<VideoAssetDoc>(COLLECTIONS.videoAssets)
      .find({ ownerFirebaseUid: uid, campaignId })
      .sort({ versionNumber: -1 })
      .toArray(),
    db.collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
      .find({ ownerFirebaseUid: uid, campaignId })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
    db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
      .findOne({ _id: campaign.briefVersionId, ownerFirebaseUid: uid }),
  ]);

  return NextResponse.json({
    campaign: { id: campaign._id?.toString(), ...campaign },
    briefVersion: briefVersion
      ? { id: briefVersion._id?.toString(), ...briefVersion }
      : null,
    videoAssets: videoAssets.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
    analysisRuns: analysisRuns.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const campaignId = requireObjectId((await params).id);
  if (isErrorResponse(campaignId)) return campaignId;

  const body = await request.json().catch(() => null);
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "dueAt") {
      update.dueAt = value ? new Date(value as string) : null;
    } else if (value !== undefined) {
      update[key] = value;
    }
  }

  const result = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .updateOne({ _id: campaignId, ownerFirebaseUid: uid }, { $set: update });
  if (result.matchedCount === 0) return apiError(404, "not found");

  const campaign = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .findOne({ _id: campaignId, ownerFirebaseUid: uid });
  return NextResponse.json({ id: campaign?._id?.toString(), ...campaign });
}
