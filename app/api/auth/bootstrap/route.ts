import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, apiError, isErrorResponse } from "@/lib/api-helpers";
import { bootstrapSchema } from "@/lib/validation";
import type { UserDoc } from "@/lib/types";

/**
 * Creates/updates the Pactra `users` document from the verified Firebase
 * identity. Called on first login and from /onboarding.
 */
export async function POST(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const body = await request.json().catch(() => ({}));
  const parsed = bootstrapSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }

  const db = await getDb();
  const users = db.collection<UserDoc>(COLLECTIONS.users);
  const existing = await users.findOne({ firebaseUid: uid });

  const now = new Date();
  const update: Partial<UserDoc> = {
    email: parsed.data.email ?? existing?.email ?? "",
    displayName: parsed.data.displayName ?? existing?.displayName ?? null,
    photoUrl:
      parsed.data.photoUrl === undefined
        ? (existing?.photoUrl ?? null)
        : parsed.data.photoUrl,
    // Providing a display name completes onboarding.
    onboardingComplete: parsed.data.displayName ? true : (existing?.onboardingComplete ?? false),
    updatedAt: now,
  };

  await users.updateOne(
    { firebaseUid: uid },
    { $set: update, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  const user = await users.findOne({ firebaseUid: uid });
  return NextResponse.json(user);
}
