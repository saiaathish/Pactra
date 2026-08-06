# Pactra Data Model

MongoDB Atlas database `pactra` (driver: official `mongodb` Node driver).
All indexes are created by `scripts/init-mongodb.mjs` (`npm run
db:init-indexes`) — never by hand in the dashboard.

Every user-owned document: `ownerFirebaseUid` · `createdAt` · `updatedAt`.

## Collections

### users
`firebaseUid` (unique) · `email` · `displayName` · `photoUrl` · `onboardingComplete`

### youtubeConnections
`ownerFirebaseUid` · `googleAccountSubject` · `channelId` · `channelTitle` ·
`channelThumbnailUrl` · `uploadsPlaylistId` · `encryptedRefreshToken` (AES-256-GCM) ·
`grantedScopes[]` · `tokenVersion` · `connectedAt` · `lastSyncedAt` ·
`syncStatus (connected|syncing|error|disconnected)` · `lastErrorCode`
Indexes: **unique** `(ownerFirebaseUid, channelId)` · `(ownerFirebaseUid, syncStatus)`

### youtubeVideos
`ownerFirebaseUid` · `youtubeConnectionId` · `youtubeVideoId` · `channelId` ·
`title` · `description` · `thumbnailUrl` · `durationSeconds` · `privacyStatus` ·
`publishedAt` · `etag` · `lastSyncedAt`
Indexes: **unique** `(ownerFirebaseUid, youtubeVideoId)` · `(ownerFirebaseUid, publishedAt desc)`

### sponsors
`ownerFirebaseUid` · `name` · `website` · `contactName` · `contactEmail` ·
`logoStoragePath` · `notes`
Index: `(ownerFirebaseUid, name)`

### sponsorBriefs
`ownerFirebaseUid` · `sponsorId` · `name` · `currentVersionNumber`
Indexes: `(ownerFirebaseUid, sponsorId)` · `(ownerFirebaseUid, createdAt desc)`

### briefVersions (immutable once confirmed)
`ownerFirebaseUid` · `sponsorBriefId` · `sponsorId` · `versionNumber` ·
`sourceType (pdf|docx|text|manual)` · `sourceStoragePath` · `sourceSha256` ·
`rawText` · `status (extracting|review_required|confirmed|superseded|failed)` ·
`confirmedAt`
Indexes: **unique** `(ownerFirebaseUid, sponsorBriefId, versionNumber)` ·
`(ownerFirebaseUid, sponsorBriefId, status)`

### requirements
`ownerFirebaseUid` · `briefVersionId` · `sponsorId` ·
`type (segment_placement|segment_duration|required_phrase|required_meaning|
forbidden_claim|spoken_disclosure|description_disclosure|description_url|
discount_code|logo_visibility|human_review)` · `description` · `parameters{}` ·
`verificationMode (deterministic|semantic_with_evidence|visual_with_evidence|
human_required)` · `sourceEvidence {page, quote}` · `status (draft|confirmed|rejected)`
Index: `(ownerFirebaseUid, briefVersionId)`

### campaigns
`ownerFirebaseUid` · `sponsorId` · `briefVersionId` · `name` ·
`status (planned|awaiting_video|analyzing|revision_required|passed|approved|
published|archived)` · `plannedTitle` · `plannedDescription` ·
`assignedYoutubeVideoId` · `dueAt`
Indexes: `(ownerFirebaseUid, status, updatedAt desc)` · `(ownerFirebaseUid, sponsorId)`

### videoAssets (never overwritten)
`ownerFirebaseUid` · `campaignId` · `versionNumber` · `storagePath` ·
`originalFilename` · `contentType` · `sizeBytes` · `sha256` · `durationSeconds` ·
`width` · `height` · `uploadStatus (uploading|uploaded|validating|ready|failed)`
Indexes: **unique** `(ownerFirebaseUid, campaignId, versionNumber)` ·
`(ownerFirebaseUid, campaignId, createdAt desc)`

### analysisRuns
`ownerFirebaseUid` · `campaignId` · `briefVersionId` · `videoAssetId` ·
`videoSha256` · `descriptionSnapshot` · `descriptionSha256` · `engineVersion` ·
`status (queued|processing|passed|failed|partial|error|cancelled)` ·
`progressPercent` · `currentStage` · `startedAt` · `completedAt` ·
`summary {passed, failed, uncertain, humanReview}` · `errorCode` · `errorMessageSafe`
Indexes: `(ownerFirebaseUid, campaignId, createdAt desc)` · `(status, createdAt)` ·
`(ownerFirebaseUid, status)`

### testResults
`ownerFirebaseUid` · `analysisRunId` · `requirementId` ·
`status (pass|fail|uncertain|human_review|not_testable)` · `observedValue{}` ·
`requiredValue{}` · `confidence` · `explanation` · `evidenceIds[]`
Index: `(ownerFirebaseUid, analysisRunId)`

### evidenceItems
`ownerFirebaseUid` · `analysisRunId` · `testResultId|null` ·
`type (transcript|video_clip|audio_clip|frame|description_span|brief_span)` ·
`startSeconds` · `endSeconds` · `text` · `storagePath` · `sha256`
Index: `(ownerFirebaseUid, analysisRunId)`

### approvalManifests
`ownerFirebaseUid` · `campaignId` · `analysisRunId` · `briefVersionId` ·
`briefSha256` · `videoAssetId` · `videoSha256` · `descriptionSha256` ·
`manifestJson{}` · `manifestSha256` · `reportStoragePath`
Indexes: `(ownerFirebaseUid, campaignId, createdAt desc)` · `(ownerFirebaseUid, analysisRunId)`

## Storage layout (Firebase Cloud Storage, all private)

```
users/{uid}/sponsors/{sponsorId}/briefs/{briefVersionId}/{filename}
users/{uid}/campaigns/{campaignId}/videos/{videoAssetId}/{filename}
users/{uid}/campaigns/{campaignId}/brand-assets/{assetId}/{filename}
users/{uid}/analysis/{analysisRunId}/evidence/{evidenceId}/{filename}   (backend write)
users/{uid}/analysis/{analysisRunId}/reports/{filename}                 (backend write)
```

File bytes are never stored in MongoDB — only `storagePath` + hashes.

## Versioning rules

- A changed requirement creates a **new** brief version; confirmed versions
  are immutable.
- Each revised rough cut creates a **new** video asset version; previously
  tested videos are never overwritten.
- Resync upserts YouTube videos (unique `ownerFirebaseUid + youtubeVideoId`);
  missing videos are never hard-deleted — campaign history is preserved.
