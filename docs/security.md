# Pactra Security Model

## Identity

- **Canonical user ID:** `firebaseUid`, derived only from:
  1. `pactra_session` cookie → `verifySessionCookie(token, checkRevoked=true)`, or
  2. `Authorization: Bearer <firebase-id-token>` → `verifyIdToken(token, checkRevoked=true)`.
- One shared helper (`lib/firebase/session.ts` → `requireApiUser`) gates every
  protected API route. No ad-hoc auth logic anywhere.
- Server pages use `getSessionUser()` (same verification) and redirect.
- A client-supplied uid in a body/query is never used for authorization.

## Data isolation (MongoDB)

- Every user-owned document carries `ownerFirebaseUid`, `createdAt`, `updatedAt`.
- **Every query includes `ownerFirebaseUid: verifiedUid`** — ID lookups too
  (`{ _id: oid, ownerFirebaseUid: uid }`). An ID lookup without an ownership
  filter is a security failure.
- Invalid ObjectIds return 400 (never 500).
- Indexes (committed in `scripts/init-mongodb.mjs`) enforce uniqueness for
  the invariant pairs (`youtubeConnections.owner+channelId`,
  `youtubeVideos.owner+youtubeVideoId`, `briefVersions.owner+brief+version`,
  `videoAssets.owner+campaign+version`).

## Storage isolation (Firebase Storage)

`firebase/storage.rules` (`firebase deploy --only storage`):

- All user files live under `users/{uid}/…`; `request.auth.uid` must equal the
  path uid (no cross-user reads/writes, no public wildcards).
- Size + content-type limits:
  - briefs: 20 MB, `application/pdf|text/plain|docx`
  - brand assets: 10 MB, `image/png|jpeg|webp`
  - videos: 2 GB, `video/mp4|quicktime|webm`
  - evidence/reports: **backend-write-only** (`request.auth.token.admin`),
    owner-read allowed.
- Upload flow is init → resumable upload → complete; `complete` verifies the
  path prefix and reads **trusted metadata** (size, content type) from Storage
  via the Admin SDK — client-supplied size/MIME/hash are never trusted.

## Secrets

| Secret | Where | Rules |
|---|---|---|
| `FIREBASE_ADMIN_PRIVATE_KEY` | server env | never `NEXT_PUBLIC_`, never committed, never logged; `\n` escapes handled |
| `MONGODB_URI` | server env | server-only |
| `GOOGLE_CLIENT_SECRET` | server env | server-only |
| `TOKEN_ENCRYPTION_KEY` | server env | AES-256-GCM key for refresh tokens |
| `AI_API_KEY` | server env | server-only |

Service-account JSON files are gitignored (`service-account*.json`,
`firebase-adminsdk*.json`).

## YouTube OAuth

- `state` is a cryptographic random value held in an httpOnly cookie; the
  callback rejects mismatches.
- The connection is bound to the **verified session user** — one Firebase user
  cannot attach another user's YouTube account.
- Refresh tokens are encrypted at rest and never reach the browser; access
  tokens are refreshed server-side on demand.
- Reconnection without a new refresh token preserves the existing stored token.
- Disconnect revokes the Google token (best-effort) and deletes the row.

## Analysis integrity

- Runs are pinned to hashes: brief source, video file, description snapshot.
- The pipeline recomputes the video SHA-256 and **fails closed** on mismatch.
- Confirmed brief versions are immutable (confirmation supersedes older
  versions; PATCH rejected on confirmed versions).
- Tested videos are never overwritten — each upload is a new version.
- The LLM never issues verdicts: objective → deterministic engine, low-
  confidence semantic → `uncertain`, subjective → `human_review`, missing
  input → `not_testable`. Every automatic verdict carries evidence.

## Account deletion (`DELETE /api/account`)

Staged, and reported honestly: Storage files → YouTube token revocation +
MongoDB documents → Firebase Auth user. Any stage failure returns an error so
the client knows deletion did not complete.

## Rate limiting / idempotency

- Max 3 active analysis runs per user (429).
- Duplicate active runs for the same campaign+video are rejected (409).
