# Pactra Golden Demo — Latency Results (production, 2026-08-06)

Measured on https://pactra-flame.vercel.app (Vercel serverless, MongoDB Atlas,
Firebase Storage, Gemini 2.5-flash windowed transcription). "analyze→terminal"
= time from the analyze request to the run reaching a terminal status.

| Run | analyze→terminal | total (incl. setup) | notes |
|---|---|---|---|
| failing.mp4 (4 PASS / 3 FAIL) | 76.5s | 88.1s | 3 transcription windows (60s each, serial) |
| passing.mp4 (7 PASS / 0 FAIL) | 81.6s | 90.1s | 3 windows + manifest generation |
| nospeech.mp4 (safe error) | 11.2s | 19.9s | silence guard, no transcription |
| long10.mp4 (fail-fast) | 11.0s | 19.4s | 5-minute duration guard, no transcription |

Breakdown (approx., from stage polling): upload+verify ~5s; download+hash ~3s;
audio extract ~1s; transcription (3 windows, serial, rate-paced) ~60–70s;
deterministic tests + evidence clips ~3–5s; manifest (passing only) ~1s.

Requirements evaluated per run: 7. Evidence items: transcript spans with
timestamps + video clips for each failed requirement (failing: 3 clips).

Timestamp accuracy vs deterministic TTS ground truth (measured):
mean |error| ≈ 1.3s, worst observed 2.9s. Timestamps are used for evidence
navigation (seek + clips), not frame-accurate editing.
