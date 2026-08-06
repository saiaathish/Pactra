# Demo Media Timing Report — Pactra sponsor-compliance demo files

Generated: 2026-08-05
TTS voice: Samantha (en_US), rate 175 wpm (`/usr/bin/say -v Samantha -r 175`)
Toolchain: ffmpeg-static 6.0 (darwin arm64), ffprobe-static (darwin arm64), /usr/bin/say, shasum.
All audio was TTS-synthesized per section, converted to 44.1 kHz stereo 16-bit PCM wav, then
assembled with exact silence gaps (anullsrc, sample-accurate `-t` durations) via the ffmpeg
concat demuxer, then muxed with a plain 1280x720@30 color video (0x2a3b4c) or SMPTE bars
(nospeech.mp4), H.264 yuv420p + AAC 96k 44.1 kHz stereo, forced to the exact target length with `-t`.

## Measured per-section durations (TTS audio, incl. natural leading/trailing silence)

| clip | duration (s) | content |
|---|---|---|
| fA  | 12.894603 | failing intro (no disclosure terms) |
| fB  | 4.566984  | failing disclosure ("this video is sponsored by Acme") |
| fC  | 20.441814 | failing pitch (30-day free trial, PACTRA20, guaranteed results) |
| fD  | 28.045850 | failing outro filler core |
| fD2 | 27.657143 | failing outro filler extra 2 |
| fD3s| 15.967982 | failing outro filler extra 3 |
| pA  | 36.578957 | passing intro part 1 |
| pA2 | 7.448707  | passing intro part 2 |
| pA3 | 8.605170  | passing intro part 3 |
| pA4 | 6.370023  | passing intro part 4 |
| pB  | 4.996553  | passing disclosure ("this video is sponsored by Acme") |
| pC  | 20.232834 | passing pitch |
| F1..F12 | 27.58–36.18 | long10 filler paragraphs (12 distinct, rotated) |
| F13 | 22.374603 | long10 final filler paragraph |

## failing.mp4 (target 120.0 s) — concat layout and silence gaps

| segment | duration (s) | cumulative end (s) |
|---|---|---|
| fA speech | 12.894603 | 12.895 |
| silence gap A | 4.105397 | 17.000 |
| fB disclosure | 4.566984 | 21.567 |
| fC pitch | 20.441814 | 42.009 |
| fD + fD2 + fD3s | 71.670975 | 113.680 (last speech word ≈ 113.7 s) |
| silence gap D | 6.320227 | 120.000 |

- Intro section A ends exactly at 17.000 s; disclosure section B starts at 17.000 s.
  TTS lead-in silence measured < 0.1 s (silencedetect), so the first spoken word of B
  lands ≈ 17.0–17.1 s.
- Gaps used: gapA = 4.105397 s, gapD = 6.320227 s.
- Final duration (ffprobe): 120.000000 s. 3600 video frames @30fps.

## passing.mp4 (target 120.0 s) — concat layout and silence gaps

| segment | duration (s) | cumulative end (s) |
|---|---|---|
| pA+pA2+pA3+pA4 speech | 59.002857 | 59.003 |
| silence gap A | 5.997143 | 65.000 |
| pB disclosure | 4.996553 | 69.997 |
| pC pitch | 20.232834 | 90.229 (pitch ends ≤ 112 s requirement: OK) |
| silence gap C | 29.770613 | 120.000 |

- Intro section A ends exactly at 65.000 s; disclosure section B starts at 65.000 s.
  TTS lead-in silence measured < 0.1 s (silencedetect), so the first spoken word of B
  lands ≈ 65.0–65.1 s.
- Gaps used: gapA = 5.997143 s, gapC = 29.770613 s.
- Final duration (ffprobe): 120.000000 s. 3600 video frames @30fps.

## probe.mp4 (target ~40 s, exactly 40.0 s)

| segment | duration (s) | cumulative end (s) |
|---|---|---|
| silence (lead) | 2.000000 | 2.000 |
| fB disclosure | 4.566984 | 6.567 |
| fC pitch | 20.441814 | 27.009 |
| silence (tail) | 12.991202 | 40.000 |

- Gaps used: lead 2.0 s, tail 12.991202 s. Final duration (ffprobe): 40.000000 s. 1200 frames.

## long10.mp4 (target 600.0 s)

| segment | duration (s) | cumulative end (s) |
|---|---|---|
| passing intro A (pA+pA2+pA3+pA4) | 59.002857 | 59.003 |
| silence gap A | 5.997143 | 65.000 |
| pB disclosure | 4.996553 | 69.997 |
| fillers F1..F12, F1..F4, F13 (17 clips, rotated) | 525.596553 | 595.593 (last speech word ≈ 595.6 s) |
| silence tail | 4.406894 | 600.000 |

- No disclosure terms / "Acme" in any filler paragraph.
- Gaps used: gapA = 5.997143 s, tail = 4.406894 s.
- Final duration (ffprobe): 600.000000 s. 18000 video frames @30fps.

## nospeech.mp4 (target 120.0 s)

- SMPTE color bars video + anullsrc silent AAC track, no speech at all.
- Final duration (ffprobe): 120.000000 s. 3600 frames. volumedetect over 0–120 s:
  mean/max volume −91.0 dB (digital silence).

## Verification results

All 5 files: video stream h264, 1280x720, 30 fps, yuv420p; audio stream AAC 44.1 kHz stereo.

| file | duration (ffprobe) | video frames | audio bitrate | size | sha256 |
|---|---|---|---|---|---|
| failing.mp4 | 120.000000 s | 3600 | 88.6 kbps | 1 603 002 B (1.53 MB) | 00da70c9c6a6faa3aceff1d88ec7b226c146b82230c6704173e210016e19e3fa |
| passing.mp4 | 120.000000 s | 3600 | 68.5 kbps | 1 302 146 B (1.24 MB) | 1aaf1c742f688be6c0028b429a9ab2a263990fe41e089d3ab4e765ef67188bf2 |
| probe.mp4 | 40.000000 s | 1200 | 61.6 kbps | 400 911 B (0.38 MB) | d1dd09882063002bdbc63fd778d6654cc935dc95b230fdf124585ee1fbd045f2 |
| long10.mp4 | 600.000000 s | 18000 | 95.1 kbps | 8 495 370 B (8.10 MB) | f0337fc78a3fe55f8fed377d531427d66d0b956b84215a9c3a20423557da03de |
| nospeech.mp4 | 120.000000 s | 3600 | 2.1 kbps | 314 911 B (0.30 MB) | 67c3f12a5dfedb870a9230c99aec8cc01cb12177e36798f31063640c8f6906d7 |

Spot checks (volumedetect):
- failing.mp4: 5–8 s speech (−19.1 dB mean), 15–16.5 s silence (−91.0 dB), 17.5–20 s disclosure speech (−18.4 dB).
- passing.mp4: 62–64 s silence (−91.0 dB), 66–69 s disclosure speech (−18.4 dB).
- long10.mp4: 10–15 s speech (−18.4 dB), 596–599 s tail silence (−91.0 dB).
- probe.mp4: 1–1.5 s lead silence (−91.0 dB), 5–10 s speech (−18.5 dB).
- nospeech.mp4: 0–120 s digital silence (−91.0 dB, no speech).

## Timing anchors (from assembly plan, not ASR)

- failing.mp4: disclosure "sponsored by Acme" starts at 17.000 s (first word ≈ 17.0–17.1 s);
  last speech word ≈ 113.7 s; total 120.0 s.
- passing.mp4: disclosure starts at 65.000 s (first word ≈ 65.0–65.1 s); pitch ends ≈ 90.2 s (≤ 112 s);
  total 120.0 s.
- long10.mp4: disclosure at 65.0 s; continuous clean filler speech until ≈ 595.6 s; total 600.0 s.
- probe.mp4: 2 s silence, then disclosure, then pitch; total 40.0 s.

## Build artifacts

- gen_tts.sh / gen_tts2.sh / gen_tts3.sh — TTS generation (Samantha, 175 wpm) and measurement.
- assemble.sh — computes gaps from measured durations, builds audio concat, muxes final mp4s.
- work/ — intermediate wav/aiff files (deleted after build; not needed for playback).
