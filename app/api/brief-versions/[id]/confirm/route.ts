import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import type { BriefVersionDoc, RequirementDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Confirms a review_required version: all its drafts become confirmed, the
 * version becomes immutable (confirmed), and any earlier confirmed version of
 * the same brief is superseded.
 */
export async function POST(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const versionId = requireObjectId((await params).id);
  if (isErrorResponse(versionId)) return versionId;

  const db = await getDb();
  const version = await db
    .collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
    .findOne({ _id: versionId, ownerFirebaseUid: uid });
  if (!version) return apiError(404, "not found");
  if (version.status !== "review_required") {
    return apiError(409, "version is not awaiting review");
  }

  const reqCol = db.collection<RequirementDoc>(COLLECTIONS.requirements);
  const drafts = await reqCol
    .find({ ownerFirebaseUid: uid, briefVersionId: versionId, status: "draft" })
    .toArray();
  if (drafts.length === 0) {
    return apiError(400, "no draft requirements to confirm");
  }

  const now = new Date();
  await reqCol.updateMany(
    { ownerFirebaseUid: uid, briefVersionId: versionId, status: "draft" },
    { $set: { status: "confirmed", updatedAt: now } }
  );
  await reqCol.updateMany(
    { ownerFirebaseUid: uid, briefVersionId: versionId, status: "rejected" },
    { $set: { status: "confirmed", updatedAt: now } }
  );

  await db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions).updateOne(
    { _id: versionId },
    { $set: { status: "confirmed", confirmedAt: now, updatedAt: now } }
  );

  // Supersede earlier confirmed versions of the same brief.
  await db.collection<BriefVersionDoc>(COLLECTIONS.briefVersions).updateMany(
    {
      ownerFirebaseUid: uid,
      sponsorBriefId: version.sponsorBriefId,
      _id: { $ne: versionId },
      status: "confirmed",
    },
    { $set: { status: "superseded", updatedAt: now } }
  );

  return NextResponse.json({ ok: true, versionId: versionId.toString(), confirmed: drafts.length });
}
