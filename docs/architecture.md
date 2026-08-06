# Pactra Architecture

## System overview

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│ Browser (Next.js on Vercel)│        │ In-app analysis engine       │
│  Firebase Auth SDK         │        │  (Vercel server function)    │
│  Firebase Storage (resumable)│      │  TS pipeline + ffmpeg-static │
└──────┬──────────────┬──────┘        │  mongodb + Firebase Admin    │
       │              │               └───────┬───────────┬──────────┘
       │ session      │ uploads               │ downloads │ uploads
       │ cookie/API   │ (direct)              │ (Admin)   │ evidence
       ▼              ▼                       ▼           ▼
┌──────────────┐  ┌────────────────┐   ┌─────────────┐  ┌────────────────┐
│ Firebase Auth│  │ Firebase Storage│  │ MongoDB Atlas│  │ Firebase Storage│
│ (identity)   │  │ users/{uid}/…  │   │ (all app data)│ │ evidence/reports│
└──────────────┘  └────────────────┘   └─────────────┘  └────────────────┘

  Google OAuth (separate): browser → /api/youtube/connect → Google →
  /api/youtube/callback → refresh token encrypted → youtubeConnections
```

**No Cloud Run.** The FastAPI/FFmpeg worker was ported into the Next.js app
(`lib/worker/*`) and runs as a serverless function with `maxDuration = 300`
(fluid compute). `POST /api/campaigns/:id/analyze` creates the run, then
`after()` starts the pipeline behind the response; the UI polls
`/api/analysis-runs/:id` for live stage progress. The old Python worker
remains in `worker/` as an archived reference (same test engine, ported 1:1
to `lib/worker/requirementTests.ts`).

## Responsibility split (non-negotiable)

| Concern | Owner |
|---|---|
| App accounts | Firebase Auth (Google + email/password) |
| App identity on the backend | Firebase Admin SDK token/session verification |
| YouTube authorization | **Separate** Google OAuth (read-only scope, offline access) |
| Application data | MongoDB Atlas (only application data store) |
| Files | Firebase Cloud Storage, all private, `users/{firebaseUid}/…` |
| Video processing | In-app pipeline (FFmpeg via `ffmpeg-static`, transcription, deterministic tests) |
| Web app | Next.js 15 on Vercel (`pactra-flame.vercel.app`) |

The canonical user ID is `firebaseUid`, derived **only** from a verified token
or session cookie — never from request bodies, URLs, or client claims.

## Auth flow

1. Client signs in with Firebase (Google popup or email/password).
2. Client POSTs the ID token to `/api/auth/session`; the server creates an
   httpOnly `pactra_session` cookie (14 days) via `createSessionCookie`.
3. `POST /api/auth/bootstrap` upserts the `users` doc (display name completes
   onboarding).
4. Every protected route calls `requireApiUser(request)` (the single shared
   helper) — it verifies the session cookie **or** `Authorization: Bearer
   <id-token>` and returns the verified uid (401 otherwise).
5. Sign-out revokes refresh tokens and clears the cookie.

## YouTube sync flow

`/api/youtube/connect` → Google (state stored in an httpOnly cookie,
`access_type=offline`, `include_granted_scopes=true`, `prompt=consent`) →
`/api/youtube/callback` verifies state + session → token exchange →
`storeOAuthConnection` (refresh token AES-256-GCM encrypted, preserves an
existing token when Google returns none on reconnect, `tokenVersion` bumped) →
`syncChannelAndVideos`:

1. `channels.list?mine=true&part=snippet,contentDetails`
2. `playlistItems.list` paginated through the uploads playlist
3. `videos.list` in batches of 50 (`snippet,contentDetails,status`)

Videos upsert on `ownerFirebaseUid + youtubeVideoId` (unique index) — resyncs
never duplicate. Campaign assignments live on `campaigns.assignedYoutubeVideoId`
and survive resync. Disconnect revokes the Google token and deletes the
connection; synced video rows stay as read-only history.

## Brief → requirements flow

1. `POST /api/briefs` creates the brief shell.
2. The browser streams the PDF/DOCX/TXT to `users/{uid}/sponsors/…/briefs/…`
   (resumable, never proxied).
3. `POST /api/briefs/:id/versions` downloads the file server-side, extracts
   text (`pdfjs-dist` legacy build, adm-zip for DOCX), hashes it, and asks the
   LLM (optional `AI_API_KEY`) for typed requirement candidates.
4. Candidates become `draft` requirements on a `review_required` version; the
   creator edits/confirms them (`/api/brief-versions/:id/confirm`). The LLM
   never issues verdicts.

## Analysis pipeline (in-app stages)

```
queued → validating_inputs → downloading → hashing → extracting_audio →
transcribing → sampling_frames → running_deterministic_tests →
running_semantic_tests → running_visual_tests → creating_evidence →
saving_results → complete
```

- The route receives only an `analysisRunId` (never file URLs).
- Ownership asserted from the run document (`ownerFirebaseUid` on every query).
- Downloads the video from Firebase Storage via the Admin SDK.
- Recomputes SHA-256 and **fails closed** if it differs from the recorded
  asset hash.
- Deterministic tests decide objective requirements; the LLM only assists
  semantic matching with evidence and confidence — it never issues final
  verdicts (see `lib/worker/requirementTests.ts` safety model; ported 1:1
  from the Python engine with the same 26-check test suite).
- Evidence clips upload to backend-only paths; results save to MongoDB with
  per-stage progress updates.
- Transcription requires `AI_API_KEY` (any OpenAI-compatible
  `/audio/transcriptions` endpoint; `AI_BASE_URL` overrides the default).
  Without it the run fails at `transcribing` with a clear error.

## Manifest

`POST /api/analysis-runs/:id/manifest` (web backend, Admin SDK) binds:

- `briefSha256` — SHA-256 of the confirmed brief source file
- `videoSha256` — pipeline-computed SHA-256 of the exact video bytes tested
- `descriptionSha256` — SHA-256 of the description snapshot

The manifest JSON + report are written to `users/{uid}/analysis/{runId}/reports/`
and the `approvalManifests` doc stores `manifestSha256`. A modified file
invalidates the binding — the judge claim: *the exact file Pactra tested is
the exact file captured by the manifest.*
