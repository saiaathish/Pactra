# worker/ — ARCHIVED (Python reference implementation)

This was the original Cloud Run worker (FastAPI + FFmpeg + pymongo +
firebase-admin). **It is no longer deployed.** On 2026-08-05 the analysis
engine was ported 1:1 to TypeScript inside the Next.js app:

| Python (this dir) | TypeScript replacement |
|---|---|
| `app/main.py` (`/analyze`, `/parse-brief`) | `lib/worker/pipeline.ts` + `app/api/briefs/[id]/versions/route.ts` |
| `app/requirement_tests.py` | `lib/worker/requirementTests.ts` (+ ported tests in `tests/`) |
| `app/video_analysis.py` (ffmpeg) | `lib/worker/ffmpeg.ts` (ffmpeg-static / ffprobe-static) |
| `app/transcription.py` | `lib/worker/transcription.ts` |
| `app/evidence.py` | `lib/worker/evidence.ts` |
| `app/brief_parser.py` (pypdf) | `lib/worker/briefParser.ts` + `lib/worker/pdf.ts` (pdfjs-dist) |

Kept only as a reference for the engine's design and its 26-check test suite
(`tests/test_requirement_tests.py`). Do not deploy it; delete it when the
project is archived.
