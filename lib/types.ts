import type { ObjectId } from "mongodb";

/**
 * MongoDB document types mirroring docs/data-model.md and the indexes in
 * scripts/init-mongodb.mjs. Every user-owned document carries
 * ownerFirebaseUid + createdAt + updatedAt.
 */

export interface UserDoc {
  _id?: ObjectId;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  onboardingComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SyncStatus = "connected" | "syncing" | "error" | "disconnected";

export interface YouTubeConnectionDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  googleAccountSubject: string | null;
  channelId: string;
  channelTitle: string;
  channelThumbnailUrl: string | null;
  uploadsPlaylistId: string;
  encryptedRefreshToken: string;
  grantedScopes: string[];
  tokenVersion: number;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  syncStatus: SyncStatus;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface YouTubeVideoDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  youtubeConnectionId: ObjectId;
  youtubeVideoId: string;
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  privacyStatus: "private" | "unlisted" | "public";
  publishedAt: Date | null;
  etag: string | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  name: string;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  logoStoragePath: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SponsorBriefDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  sponsorId: ObjectId;
  name: string;
  currentVersionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export type BriefVersionStatus =
  | "extracting"
  | "review_required"
  | "confirmed"
  | "superseded"
  | "failed";

export interface BriefVersionDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  sponsorBriefId: ObjectId;
  sponsorId: ObjectId;
  versionNumber: number;
  sourceType: "pdf" | "docx" | "text" | "manual";
  sourceStoragePath: string | null;
  sourceSha256: string | null;
  rawText: string | null;
  status: BriefVersionStatus;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RequirementType =
  | "segment_placement"
  | "segment_duration"
  | "required_phrase"
  | "required_meaning"
  | "forbidden_claim"
  | "spoken_disclosure"
  | "description_disclosure"
  | "description_url"
  | "discount_code"
  | "logo_visibility"
  | "human_review";

export type VerificationMode =
  | "deterministic"
  | "semantic_with_evidence"
  | "visual_with_evidence"
  | "human_required";

export interface RequirementDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  briefVersionId: ObjectId;
  sponsorId: ObjectId;
  type: RequirementType;
  description: string;
  parameters: Record<string, unknown>;
  verificationMode: VerificationMode;
  sourceEvidence: { page: number | null; quote: string | null };
  status: "draft" | "confirmed" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignStatus =
  | "planned"
  | "awaiting_video"
  | "analyzing"
  | "revision_required"
  | "passed"
  | "approved"
  | "published"
  | "archived";

export interface CampaignDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  sponsorId: ObjectId;
  briefVersionId: ObjectId;
  name: string;
  status: CampaignStatus;
  plannedTitle: string | null;
  plannedDescription: string | null;
  assignedYoutubeVideoId: string | null;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VideoUploadStatus = "uploading" | "uploaded" | "validating" | "ready" | "failed";

export interface VideoAssetDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  campaignId: ObjectId;
  versionNumber: number;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  uploadStatus: VideoUploadStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AnalysisRunStatus =
  | "queued"
  | "processing"
  | "passed"
  | "failed"
  | "partial"
  | "error"
  | "cancelled";

export interface AnalysisRunDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  campaignId: ObjectId;
  briefVersionId: ObjectId;
  videoAssetId: ObjectId;
  videoSha256: string;
  descriptionSnapshot: string;
  descriptionSha256: string;
  engineVersion: string;
  status: AnalysisRunStatus;
  progressPercent: number;
  currentStage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  summary: {
    passed: number;
    failed: number;
    uncertain: number;
    humanReview: number;
  };
  errorCode: string | null;
  errorMessageSafe: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TestResultStatus = "pass" | "fail" | "uncertain" | "human_review" | "not_testable";

export interface TestResultDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  analysisRunId: ObjectId;
  requirementId: ObjectId;
  status: TestResultStatus;
  observedValue: Record<string, unknown>;
  requiredValue: Record<string, unknown>;
  confidence: number | null;
  explanation: string;
  evidenceIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type EvidenceType =
  | "transcript"
  | "video_clip"
  | "audio_clip"
  | "frame"
  | "description_span"
  | "brief_span";

export interface EvidenceItemDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  analysisRunId: ObjectId;
  testResultId: ObjectId | null;
  type: EvidenceType;
  startSeconds: number | null;
  endSeconds: number | null;
  text: string | null;
  storagePath: string | null;
  sha256: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalManifestDoc {
  _id?: ObjectId;
  ownerFirebaseUid: string;
  campaignId: ObjectId;
  analysisRunId: ObjectId;
  briefVersionId: ObjectId;
  briefSha256: string;
  videoAssetId: ObjectId;
  videoSha256: string;
  descriptionSha256: string;
  manifestJson: Record<string, unknown>;
  manifestSha256: string;
  reportStoragePath: string;
  createdAt: Date;
}
