import { getStorageBucket } from "@/lib/firebase/admin";

/**
 * SERVER-ONLY Firebase Storage helpers. The backend never trusts
 * client-supplied size, MIME type, or storage ownership — it reads trusted
 * metadata from Firebase Storage itself and verifies the path prefix.
 */

/** Every user file lives under users/{uid}/… — enforced by storage rules too. */
export function assertOwnedStoragePath(uid: string, storagePath: string): boolean {
  return storagePath.startsWith(`users/${uid}/`);
}

export interface TrustedFileMetadata {
  name: string;
  sizeBytes: number;
  contentType: string | null;
  updatedAt: string | null;
  md5Hash: string | null;
}

/**
 * Verifies the path is owned by `uid`, then reads trusted metadata directly
 * from Firebase Storage via the Admin SDK. Throws on ownership violations.
 */
export async function verifyUploadedFile(
  uid: string,
  storagePath: string,
  expectedPrefix?: string
): Promise<TrustedFileMetadata> {
  if (!assertOwnedStoragePath(uid, storagePath)) {
    throw new Error("Storage path is not owned by the verified user");
  }
  if (expectedPrefix && !storagePath.startsWith(expectedPrefix)) {
    throw new Error("Storage path does not match the expected location");
  }
  const file = getStorageBucket().file(storagePath);
  const [metadata] = await file.getMetadata();
  return {
    name: metadata.name ?? storagePath,
    sizeBytes: Number(metadata.size ?? 0),
    contentType: metadata.contentType ?? null,
    updatedAt: metadata.updated ?? null,
    md5Hash: metadata.md5Hash ?? null,
  };
}

export function buildStoragePaths(uid: string, campaignId: string) {
  return {
    briefs: (sponsorBriefId: string, versionId: string, filename: string) =>
      `users/${uid}/sponsors/${sponsorBriefId}/briefs/${versionId}/${filename}`,
    videos: (videoAssetId: string, filename: string) =>
      `users/${uid}/campaigns/${campaignId}/videos/${videoAssetId}/${filename}`,
    brandAssets: (assetId: string, filename: string) =>
      `users/${uid}/campaigns/${campaignId}/brand-assets/${assetId}/${filename}`,
    evidence: (analysisRunId: string, evidenceId: string, filename: string) =>
      `users/${uid}/analysis/${analysisRunId}/evidence/${evidenceId}/${filename}`,
    reports: (analysisRunId: string, filename: string) =>
      `users/${uid}/analysis/${analysisRunId}/reports/${filename}`,
  };
}
