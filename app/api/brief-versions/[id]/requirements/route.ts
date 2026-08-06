import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { requirementPatchSchema } from "@/lib/validation";
import type { BriefVersionDoc, RequirementDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Edits the draft requirements of a review_required version. Never allowed on
 * confirmed/superseded versions. Requirements are replaced wholesale:
 * existing ids are updated, new entries inserted, deletedIds removed.
 */
export async function PATCH(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const versionId = requireObjectId((await params).id);
  if (isErrorResponse(versionId)) return versionId;

  const body = await request.json().catch(() => null);
  const parsed = requirementPatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const version = await db
    .collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
    .findOne({ _id: versionId, ownerFirebaseUid: uid });
  if (!version) return apiError(404, "not found");
  if (version.status !== "review_required") {
    return apiError(409, "confirmed versions are immutable — create a new version to change requirements");
  }

  const col = db.collection<RequirementDoc>(COLLECTIONS.requirements);
  const now = new Date();
  const incoming = parsed.data.requirements;

  for (const req of incoming) {
    const sourceEvidence = {
      page: req.sourcePage ?? null,
      quote: req.sourceQuote ?? null,
    };
    if (req.id) {
      const oid = requireObjectId(req.id);
      if (isErrorResponse(oid)) continue;
      await col.updateOne(
        { _id: oid, ownerFirebaseUid: uid, briefVersionId: versionId },
        {
          $set: {
            type: req.type,
            description: req.description,
            parameters: req.parameters,
            verificationMode: req.verificationMode,
            sourceEvidence,
            updatedAt: now,
          },
        }
      );
    } else {
      await col.insertOne({
        ownerFirebaseUid: uid,
        briefVersionId: versionId,
        sponsorId: version.sponsorId,
        type: req.type,
        description: req.description,
        parameters: req.parameters,
        verificationMode: req.verificationMode,
        sourceEvidence,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (parsed.data.deletedIds.length > 0) {
    await col.deleteMany({
      ownerFirebaseUid: uid,
      briefVersionId: versionId,
      _id: { $in: parsed.data.deletedIds.map((id) => new ObjectId(id)) },
    });
  }

  const updated = await col
    .find({ ownerFirebaseUid: uid, briefVersionId: versionId })
    .sort({ createdAt: 1 })
    .toArray();
  return NextResponse.json({
    requirements: updated.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
  });
}
