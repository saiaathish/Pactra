import { NextResponse } from "next/server";
import { z } from "zod";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import {
  requireVerifiedUid,
  apiError,
  isErrorResponse,
  requireObjectId,
} from "@/lib/api-helpers";
import { getStorageBucket } from "@/lib/firebase/admin";
import { parseBrief } from "@/lib/worker/briefParser";
import type {
  BriefVersionDoc,
  RequirementDoc,
  SponsorBriefDoc,
} from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

const versionCreateSchema = z.object({
  sourceType: z.enum(["pdf", "docx", "text", "manual"]),
  storagePath: z.string().min(1).max(1000),
});

/**
 * Downloads the uploaded brief from Firebase Storage, parses it (PDF/DOCX/TXT
 * text extraction + optional LLM requirement candidates), and creates an
 * immutable review_required brief version with draft requirements. The
 * creator reviews candidates before confirming.
 */
export async function POST(request: Request, { params }: Params) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;
  const briefId = requireObjectId((await params).id);
  if (isErrorResponse(briefId)) return briefId;

  const body = await request.json().catch(() => null);
  const parsed = versionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "invalid body");
  }
  const { sourceType, storagePath } = parsed.data;

  // The file must live under the brief owner's own storage prefix.
  const briefPrefix = `users/${uid}/sponsors/`;
  if (!storagePath.startsWith(briefPrefix) || !storagePath.includes("/briefs/")) {
    return apiError(400, "storage path is not owned by the verified user");
  }

  const db = await getDb();
  const brief = await db
    .collection<SponsorBriefDoc>(COLLECTIONS.sponsorBriefs)
    .findOne({ _id: briefId, ownerFirebaseUid: uid });
  if (!brief) return apiError(404, "brief not found");

  const filename = storagePath.split("/").pop() ?? "brief.pdf";

  // Parse (text extraction + LLM candidates). Failures create a `failed`
  // version so the upload UI gets a clear, recorded reason.
  let parsedBrief;
  try {
    const [buffer] = await getStorageBucket().file(storagePath).download();
    parsedBrief = await parseBrief(buffer, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date();
    const failedVersion: BriefVersionDoc = {
      ownerFirebaseUid: uid,
      sponsorBriefId: briefId,
      sponsorId: brief.sponsorId,
      versionNumber: brief.currentVersionNumber + 1,
      sourceType: sourceType === "manual" ? "text" : sourceType,
      sourceStoragePath: storagePath,
      sourceSha256: null,
      rawText: null,
      status: "failed",
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.briefVersions).insertOne(failedVersion);
    await db.collection(COLLECTIONS.sponsorBriefs).updateOne(
      { _id: briefId },
      { $set: { currentVersionNumber: brief.currentVersionNumber + 1, updatedAt: now } }
    );
    return apiError(422, `Brief parsing failed: ${message.slice(0, 300)}`);
  }

  const now = new Date();
  const versionNumber = brief.currentVersionNumber + 1;
  const version: BriefVersionDoc = {
    ownerFirebaseUid: uid,
    sponsorBriefId: briefId,
    sponsorId: brief.sponsorId,
    versionNumber,
    sourceType: sourceType === "manual" ? "text" : sourceType,
    sourceStoragePath: storagePath,
    sourceSha256: parsedBrief.sha256,
    rawText: parsedBrief.text.slice(0, 100_000),
    status: "review_required",
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await db.collection(COLLECTIONS.briefVersions).insertOne(version);

  // Draft requirement candidates — never confirmed automatically.
  if (parsedBrief.requirements.length > 0) {
    const drafts: RequirementDoc[] = parsedBrief.requirements.map((req) => ({
      ownerFirebaseUid: uid,
      briefVersionId: inserted.insertedId,
      sponsorId: brief.sponsorId,
      type: req.type,
      description: req.description,
      parameters: req.parameters,
      verificationMode: req.verificationMode,
      sourceEvidence: req.sourceEvidence,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }));
    await db.collection(COLLECTIONS.requirements).insertMany(drafts);
  }

  await db.collection(COLLECTIONS.sponsorBriefs).updateOne(
    { _id: briefId },
    { $set: { currentVersionNumber: versionNumber, updatedAt: now } }
  );

  return NextResponse.json(
    {
      version: {
        id: inserted.insertedId.toString(),
        versionNumber,
        status: version.status,
        sourceSha256: version.sourceSha256,
        requirements: parsedBrief.requirements.length,
      },
    },
    { status: 201 }
  );
}
