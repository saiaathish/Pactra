import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, apiError, isErrorResponse, parseObjectId } from "@/lib/api-helpers";
import { campaignCreateSchema } from "@/lib/validation";
import type { BriefVersionDoc, CampaignDoc, SponsorDoc } from "@/lib/types";

export async function GET(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const db = await getDb();
  const campaigns = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .find({ ownerFirebaseUid: uid })
    .sort({ updatedAt: -1 })
    .toArray();

  return NextResponse.json({
    campaigns: campaigns.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
  });
}

export async function POST(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const body = await request.json().catch(() => null);
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const sponsorId = parseObjectId(parsed.data.sponsorId);
  const briefVersionId = parseObjectId(parsed.data.briefVersionId);
  if (!sponsorId || !briefVersionId) return apiError(400, "invalid id");

  const [sponsor, briefVersion] = await Promise.all([
    db.collection<SponsorDoc>(COLLECTIONS.sponsors).findOne({ _id: sponsorId, ownerFirebaseUid: uid }),
    db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions).findOne({ _id: briefVersionId, ownerFirebaseUid: uid }),
  ]);
  if (!sponsor) return apiError(404, "sponsor not found");
  if (!briefVersion) return apiError(404, "brief version not found");
  if (briefVersion.status !== "confirmed") {
    return apiError(409, "brief version must be confirmed before creating a campaign");
  }

  const now = new Date();
  const doc: CampaignDoc = {
    ownerFirebaseUid: uid,
    sponsorId: sponsorId!,
    briefVersionId: briefVersionId!,
    name: parsed.data.name,
    status: parsed.data.assignedYoutubeVideoId ? "planned" : "awaiting_video",
    plannedTitle: parsed.data.plannedTitle ?? null,
    plannedDescription: parsed.data.plannedDescription ?? null,
    assignedYoutubeVideoId: parsed.data.assignedYoutubeVideoId ?? null,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection<CampaignDoc>(COLLECTIONS.campaigns).insertOne(doc);
  return NextResponse.json({ id: result.insertedId.toString(), ...doc });
}
