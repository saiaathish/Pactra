import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, apiError, isErrorResponse } from "@/lib/api-helpers";
import { sponsorCreateSchema } from "@/lib/validation";
import type { SponsorDoc } from "@/lib/types";

export async function GET(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const db = await getDb();
  const sponsors = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .find({ ownerFirebaseUid: uid })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    sponsors: sponsors.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
  });
}

export async function POST(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const body = await request.json().catch(() => null);
  const parsed = sponsorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const now = new Date();
  const doc: SponsorDoc = {
    ownerFirebaseUid: uid,
    name: parsed.data.name,
    website: parsed.data.website ?? null,
    contactName: parsed.data.contactName ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
    logoStoragePath: null,
    notes: parsed.data.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection<SponsorDoc>(COLLECTIONS.sponsors).insertOne(doc);
  return NextResponse.json({ id: result.insertedId.toString(), ...doc });
}
