import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { briefCreateSchema } from "@/lib/validation";
import type { SponsorBriefDoc } from "@/lib/types";

/**
 * Creates the sponsor-brief shell (no file yet). The uploader then streams
 * the PDF to Firebase Storage and POSTs /api/briefs/:id/versions to extract
 * requirement candidates.
 */
export async function POST(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const body = await request.json().catch(() => null);
  const parsed = briefCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }
  const sponsorId = requireObjectId(parsed.data.sponsorId);
  if (isErrorResponse(sponsorId)) return sponsorId;

  const db = await getDb();
  const sponsor = await db
    .collection(COLLECTIONS.sponsors)
    .findOne({ _id: sponsorId, ownerFirebaseUid: uid });
  if (!sponsor) return apiError(404, "sponsor not found");

  const now = new Date();
  const brief: SponsorBriefDoc = {
    ownerFirebaseUid: uid,
    sponsorId,
    name: parsed.data.name,
    currentVersionNumber: 0,
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await db.collection(COLLECTIONS.sponsorBriefs).insertOne(brief);

  return NextResponse.json({ id: inserted.insertedId.toString() }, { status: 201 });
}
