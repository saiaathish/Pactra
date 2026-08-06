import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { sponsorUpdateSchema } from "@/lib/validation";
import type { SponsorDoc } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(_request);
  if (isErrorResponse(uid)) return uid;
  const oid = requireObjectId((await params).id);
  if (isErrorResponse(oid)) return oid;

  const db = await getDb();
  const sponsor = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .findOne({ _id: oid, ownerFirebaseUid: uid });
  if (!sponsor) return apiError(404, "not found");

  const [briefs, campaigns] = await Promise.all([
    db.collection(COLLECTIONS.sponsorBriefs)
      .find({ ownerFirebaseUid: uid, sponsorId: oid })
      .sort({ createdAt: -1 })
      .toArray(),
    db.collection(COLLECTIONS.campaigns)
      .find({ ownerFirebaseUid: uid, sponsorId: oid })
      .sort({ createdAt: -1 })
      .toArray(),
  ]);

  return NextResponse.json({
    sponsor: { id: sponsor._id?.toString(), ...sponsor },
    briefs: briefs.map((b) => ({ id: b._id?.toString(), ...b })),
    campaigns: campaigns.map((c) => ({ id: c._id?.toString(), ...c })),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const oid = requireObjectId((await params).id);
  if (isErrorResponse(oid)) return oid;

  const body = await request.json().catch(() => null);
  const parsed = sponsorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(parsed.data)) {
    update[key] = value ?? null;
  }

  const result = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .updateOne({ _id: oid, ownerFirebaseUid: uid }, { $set: update });
  if (result.matchedCount === 0) return apiError(404, "not found");

  const sponsor = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .findOne({ _id: oid, ownerFirebaseUid: uid });
  return NextResponse.json({ id: sponsor?._id?.toString(), ...sponsor });
}

export async function DELETE(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const oid = requireObjectId((await params).id);
  if (isErrorResponse(oid)) return oid;

  const db = await getDb();
  const result = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .deleteOne({ _id: oid, ownerFirebaseUid: uid });
  if (result.deletedCount === 0) return apiError(404, "not found");

  // Orphaned briefs/versions/requirements are cleaned up too.
  await db.collection(COLLECTIONS.sponsorBriefs).deleteMany({ ownerFirebaseUid: uid, sponsorId: oid });
  const orphanBriefs = await db
    .collection(COLLECTIONS.sponsorBriefs)
    .find({ ownerFirebaseUid: uid })
    .toArray();
  if (orphanBriefs.length === 0) {
    await db.collection(COLLECTIONS.briefVersions).deleteMany({ ownerFirebaseUid: uid, sponsorId: oid });
    await db.collection(COLLECTIONS.requirements).deleteMany({ ownerFirebaseUid: uid, sponsorId: oid });
  }

  return NextResponse.json({ ok: true });
}
