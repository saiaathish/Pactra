# Pactra Demo Runbook

The judge-winning path: real account → real YouTube videos → real sponsor
brief → tests → real rough cut → failures at exact timestamps → corrected
video passes → cryptographically bound approval manifest.

## Before the demo

1. Everything from `docs/setup-firebase-mongodb.md` is live (Firebase, Atlas,
   in-app analysis engine, Vercel).
2. Two rough cuts exist (2 min each):
   - **failing.mp4** — 45-second integration, says "guaranteed growth" at
     ~02:47, no discount code in the description, no URL.
   - **passing.mp4** — corrected: 45–60s integration after 01:30, says
     "30-day free trial" and code `SAI20`, discloses sponsorship before the
     segment, description has the URL + code + disclosure.
3. A realistic sponsor brief PDF with the demo requirements.
4. Test creator account added as a Firebase test/verified user.

## Demo script (2–3 minutes)

### 0:00–0:20 — Problem
> "Creators lose days to sponsor review because every brief is a PDF checklist
> and every rough cut is checked manually. Pactra treats the brief like a
> software specification — the video either passes or fails before the brand
> sees it."

### 0:20–0:50 — Compile
1. `/login` — sign in (Google popup or email/password).
2. `/youtube` — Connect YouTube → Google consent (read-only) → channel and
   synced videos appear.
3. `/sponsors` → create sponsor → upload the brief PDF → the engine extracts
   candidate requirements → review screen (`/briefs/:id`).

### 0:50–1:30 — Confirm + campaign
1. Show the extracted requirements (typed: segment duration 45–60s, placement
   after 01:30, required phrase "free trial", discount code SAI20, forbidden
   claim "guaranteed growth", disclosure, URL).
2. Confirm → immutable brief version.
3. `/campaigns/new` → sponsor + brief version → "planned video" → create.

### 1:30–2:10 — Fail with evidence
1. `/campaigns/:id` → upload **failing.mp4** (resumable, shows progress) →
   paste the intended description → **Run preflight**.
2. `/analysis/:id` — live stage progress (hashing → transcribing → tests).
3. Results: `5 passed · 3 failed` — click failures:
   - Integration lasts only 38 seconds (segment 02:14–02:51).
   - "Guaranteed growth" spoken at 02:47 — transcript evidence + clip.
   - Description missing `SAI20` and the URL.
4. Generate manifest is refused (run has failures).

### 2:10–2:40 — Pass + manifest
1. Upload **passing.mp4** (new version) + corrected description → run.
2. `8 passed · 1 human review` (the subjective "feels natural" requirement —
   never auto-passed).
3. **Generate approval manifest** → `/analysis/:id/report`:
   - brief SHA-256, video SHA-256, description SHA-256
   - test summary + evidence, `manifestSha256`
   - Downloadable JSON report.
4. Close: "The exact file Pactra tested is the exact file in the manifest —
   change a single byte and the binding breaks."

## What to say if asked

**"Why isn't this just an LLM reviewing a video?"** — The LLM extracts
candidate requirements and assists semantic matching. Verdicts come from a
deterministic engine with timestamped evidence; low-confidence matches are
`uncertain`, subjective items are `human_review`. Same input → same output.

**"What happens when the brief says 'make it feel natural'?"** — It becomes a
`human_review` requirement. Pactra never pretends subjective direction is
machine-verifiable.

**"How do you know the spoken sentence satisfies the requirement?"** — Exact
requirements use deterministic phrase matching with timestamps; semantic ones
require ≥0.7 confidence + evidence, else `uncertain`.

**"What prevents a creator from passing here and uploading a different video
to YouTube?"** — SHA-256 of the exact file is bound into the manifest;
reprocessing any modified file creates a new report. Future: upload the exact
passing hash to YouTube.

## Honest limitations to mention

- YouTube API doesn't return original MP4s — post-publication videos need the
  matching source file uploaded.
- Logo visibility is flagged `not_testable` (stretch feature).
- Disclosure checks are automated heuristics — not legal certification.
