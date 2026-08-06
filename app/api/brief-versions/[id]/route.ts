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

export async function GET(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const versionId = requireObjectId((await params).id);
  if (isErrorResponse(versionId)) return versionId;

  const db = await getDb();
  const version = await db
    .collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
    .findOne({ _id: versionId, ownerFirebaseUid: uid });
  if (!version) return apiError(404, "not found");

  const requirements = await db
    .collection<RequirementDoc>(COLLECTIONS.requirements)
    .find({ ownerFirebaseUid: uid, briefVersionId: versionId })
    .sort({ createdAt: 1 })
    .toArray();

  return NextResponse.json({
    version: { id: version._id?.toString(), ...version },
    requirements: requirements.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
  });
}
