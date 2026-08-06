/**
 * Evidence: clips + transcript/description spans persisted to MongoDB with
 * files uploaded to Firebase Storage (backend-only evidence paths). Replaces
 * the Python worker's evidence module.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { ObjectId, type Db } from "mongodb";
import { getStorageBucket } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/mongodb";
import { sha256File, extractSegment } from "./ffmpeg";
import type { EvidenceType } from "@/lib/types";

export const ALLOWED_EVIDENCE_TYPES: EvidenceType[] = [
  "transcript",
  "video_clip",
  "audio_clip",
  "frame",
  "description_span",
  "brief_span",
];

export async function buildClip(
  videoPath: string,
  startS: number,
  endS: number,
  workDir: string
): Promise<string> {
  const outPath = path.join(workDir, `clip-${randomUUID().slice(0, 10)}.mp4`);
  await extractSegment(videoPath, startS, endS, outPath);
  return outPath;
}

/** Uploads a local file via the Firebase Admin SDK; returns the storage path. */
export async function uploadFile(
  localPath: string,
  storagePath: string,
  contentType: string
): Promise<string> {
  await getStorageBucket().upload(localPath, {
    destination: storagePath,
    contentType,
    metadata: { contentType },
  });
  return storagePath;
}

export interface EvidenceInput {
  uid: string;
  analysisRunId: ObjectId;
  testResultId: ObjectId;
  type: EvidenceType;
  text?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  storagePath?: string | null;
  sha256?: string | null;
}

export async function createEvidenceItem(
  db: Db,
  input: EvidenceInput
): Promise<ObjectId> {
  if (!ALLOWED_EVIDENCE_TYPES.includes(input.type)) {
    throw new Error(`invalid evidence type: ${input.type}`);
  }
  const now = new Date();
  const inserted = await db.collection(COLLECTIONS.evidenceItems).insertOne({
    ownerFirebaseUid: input.uid,
    analysisRunId: input.analysisRunId,
    testResultId: input.testResultId,
    type: input.type,
    startSeconds: input.startSeconds ?? null,
    endSeconds: input.endSeconds ?? null,
    text: input.text ?? null,
    storagePath: input.storagePath ?? null,
    sha256: input.sha256 ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return inserted.insertedId;
}

export async function fileSha256(filePath: string): Promise<string> {
  return sha256File(filePath);
}
