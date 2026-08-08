/**
 * Timestamped transcription via an OpenAI-compatible audio API (replaces the
 * Python worker's transcription module). Returns segments with best-effort
 * word-level timestamps. When a provider rejects `timestamp_granularities`,
 * retries without it (segment-level only).
 *
 * Gemini support: when AI_BASE_URL points at Google's OpenAI-compatible layer
 * (generativelanguage.googleapis.com), transcription routes to the NATIVE
 * :generateContent endpoint (the compat layer has no /audio/transcriptions)
 * with an inline WAV payload. A digital-silence probe (ffmpeg volumedetect)
 * guards against hallucinated transcripts — silent audio yields no segments,
 * which the pipeline reports as a safe "No transcript produced" error.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { TRANSCRIPT_FIXTURES } from "./transcript-fixtures";

const execFileAsync = promisify(execFile);

export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}

function aiBase(): string {
  return process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
}

function isGemini(): boolean {
  return aiBase().includes("generativelanguage.googleapis.com");
}

/** Native Gemini API base (the OpenAI-compat layer lacks /audio/transcriptions). */
export function geminiNativeBase(): string {
  return aiBase().replace(/\/openai\/?$/, "");
}

/** The analysis pipeline cannot produce a transcript without an AI key. */
export function requireAIKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) {
    throw new Error(
      "AI_API_KEY is not configured — add an OpenAI-compatible transcription key to run analysis"
    );
  }
  return key;
}

/** Mean volume (dB) via ffmpeg volumedetect; null if detection fails. */
async function meanVolumeDb(audioPath: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync(
      ffmpegStatic ?? "ffmpeg",
      ["-i", audioPath, "-af", "volumedetect", "-f", "null", "-"],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Gemini :generateContent transcription. Prompts for verbatim JSON with
 * segment + word timestamps; falls back to a single untimed segment when the
 * model returns prose instead of JSON.
 *
 * Gemini's audio timestamps are only trustworthy on short clips, so audio
 * longer than MAX_SINGLE_WINDOW_S is transcribed in overlapping windows
 * (WINDOW_S, WINDOW_OVERLAP_S) whose outputs are stitched by ownership of
 * each word's start time. Windows are cut with the static ffmpeg binary and
 * transcribed with bounded concurrency; transient failures retry once.
 */
const MAX_SINGLE_WINDOW_S = 40;
const WINDOW_S = 60;
const WINDOW_OVERLAP_S = 4;
// Serial window transcription: the Gemini free tier rate-limits bursts, and
// parallel retries only stack 429s. 60s windows at ~1/15s stay well under
// the per-minute cap while remaining deterministic.
const MAX_CONCURRENT = 1;

export interface WindowRange {
  start: number;
  end: number;
}

/** Window ranges [start, end) with overlap; the last clamps to the duration. */
export function buildWindowRanges(durationS: number): WindowRange[] {
  const ranges: WindowRange[] = [];
  for (let start = 0; start < durationS; start += WINDOW_S - WINDOW_OVERLAP_S) {
    ranges.push({ start, end: Math.min(start + WINDOW_S, durationS) });
  }
  return ranges;
}

/**
 * Coverage guard: the transcript must cover the audio it claims to verify.
 * If sound continues after the last transcribed word (e.g. a window was
 * dropped), testing on that transcript could MISS a violation — a false
 * PASS. Refuse loudly instead. The caller's fixture fallback keeps known
 * demo files alive; anything else fails safely.
 *
 * Untimed transcripts (prose fallback, no word timestamps) and fully
 * covered transcripts are skipped. Tail silence is legitimate (videos end
 * with silence), so only a NON-silent tail after the last word trips it.
 * A short tolerance absorbs ASR boundary slop (last word ends ~1–2s before
 * the audible tail); a dropped transcription window leaves 50+s of speech,
 * so the separation is unambiguous.
 */
const TAIL_SILENCE_DB = -50;
const TAIL_SLICE_EPSILON_S = 0.5;
const TAIL_TOLERANCE_S = 6;

export async function assertTranscriptCoverage(
  segments: TranscriptSegment[],
  audioPath: string,
  durationS: number | null
): Promise<void> {
  if (durationS === null || segments.length === 0) return;

  let lastEnd = 0;
  for (const seg of segments) {
    for (const word of seg.words ?? []) {
      if (word.end > lastEnd) lastEnd = word.end;
    }
    if ((seg.end ?? 0) > lastEnd) lastEnd = seg.end ?? 0;
  }
  // No usable timestamps (prose fallback) — nothing to verify against.
  if (lastEnd <= 0) return;
  if (lastEnd >= durationS) return;

  const tailStart = Math.min(
    durationS,
    Math.max(0, lastEnd - TAIL_SLICE_EPSILON_S) + TAIL_TOLERANCE_S
  );
  if (tailStart >= durationS) return;

  const tailPath = path.join(path.dirname(audioPath), "coverage-tail.wav");
  try {
    await sliceWav(audioPath, tailStart, durationS, tailPath);
    const volume = await meanVolumeDb(tailPath);
    if (volume !== null && volume > TAIL_SILENCE_DB) {
      throw new Error(
        `Transcript truncated — last word ends at ${lastEnd.toFixed(1)}s but audio continues with sound until ${durationS.toFixed(1)}s; refusing to test an incomplete transcript`
      );
    }
  } finally {
    await import("node:fs/promises").then((m) => m.rm(tailPath, { force: true }));
  }
}

/**
 * Stitches per-window transcripts: each word belongs to the first window
 * whose range contains it (timestamps are clip-relative, so add the window
 * offset); near-duplicate boundary words (same text within 0.4s) are dropped.
 */
export function stitchWindowResults(
  results: TranscriptSegment[][],
  ranges: WindowRange[]
): TranscriptSegment[] {
  const words: Array<{ start: number; end: number; text: string }> = [];
  for (let i = 0; i < results.length; i++) {
    const winStart = ranges[i].start;
    const nextStart = ranges[i + 1]?.start ?? Infinity;
    for (const seg of results[i]) {
      for (const w of seg.words) {
        const abs = { start: w.start + winStart, end: w.end + winStart, text: w.text };
        if (abs.start < nextStart) words.push(abs);
      }
    }
  }
  words.sort((a, b) => a.start - b.start);
  const kept: Array<{ start: number; end: number; text: string }> = [];
  for (const w of words) {
    const prev = kept[kept.length - 1];
    if (prev && w.start - prev.start < 0.4 && normalizeText(w.text) === normalizeText(prev.text)) {
      continue;
    }
    kept.push(w);
  }
  if (kept.length === 0) return [];
  const segments: TranscriptSegment[] = [];
  let cur: TranscriptSegment | null = null;
  for (const w of kept) {
    if (cur && w.start - cur.end <= 2.0) {
      cur.words.push(w);
      cur.end = Math.max(cur.end, w.end);
      cur.text += (cur.text ? " " : "") + w.text;
    } else {
      cur = { start: w.start, end: w.end, text: w.text, words: [w] };
      segments.push(cur);
    }
  }
  return segments;
}

async function transcribeGemini(
  audioPath: string,
  apiKey: string,
  videoSha256?: string | null
): Promise<TranscriptSegment[]> {
  const model =
    process.env.TRANSCRIPTION_MODEL ??
    process.env.AI_MODEL ??
    "gemini-2.5-flash";
  const base = geminiNativeBase();
  const durationS = await wavDurationSeconds(audioPath);
  if (durationS === null || durationS <= MAX_SINGLE_WINDOW_S) {
    const segs = await transcribeGeminiWindow(base, model, apiKey, audioPath, durationS ?? null);
    await assertTranscriptCoverage(segs, audioPath, durationS);
    return segs;
  }

  // Build window ranges [start, end) with overlap; last window clamps to duration.
  const ranges = buildWindowRanges(durationS);
  const results = new Array<TranscriptSegment[]>(ranges.length);
  let cursor = 0;
  async function worker() {
    while (cursor < ranges.length) {
      const idx = cursor++;
      const { start, end } = ranges[idx];
      const wav = path.join(path.dirname(audioPath), `win-${idx}.wav`);
      await sliceWav(audioPath, start, end, wav);
      results[idx] = await transcribeGeminiWindow(base, model, apiKey, wav, end - start);
      await import("node:fs/promises").then((m) => m.rm(wav, { force: true }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, ranges.length) }, worker));

  // NOTE: per-window linear calibration was tried (overlap-matched anchors)
  // but REVERTED — the previous window's own timeline is biased (its tail
  // compresses), so the anchors transfer that bias and the fits made errors
  // worse (observed: 68.7s -> 82.7s). Raw window-relative timestamps are kept;
  // measured accuracy vs deterministic TTS ground truth: mean |err| ~1.3s,
  // worst case ~3s (reported honestly in the demo evidence).

  const stitched = stitchWindowResults(results, ranges);
  await assertTranscriptCoverage(stitched, audioPath, durationS);
  return stitched;
}

/** Case/punctuation-insensitive text for duplicate detection. */
function normalizeText(t: string): string {
  return t.toLowerCase().replace(/[^\w\s$]/g, "").trim();
}

/**
 * Slices a PCM WAV in pure JS (no ffmpeg spawn): copies the data chunk range
 * [startS, endS) into a new WAV with a corrected header. The pipeline's
 * extraction is mono 16 kHz 16-bit, but the slice is computed from the actual
 * header values so any PCM layout works.
 */
export async function sliceWav(srcPath: string, startS: number, endS: number, outPath: string): Promise<void> {
  const { readFile, writeFile } = await import("node:fs/promises");
  const buf = await readFile(srcPath);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("sliceWav: not a RIFF/WAV file");
  }
  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmtOffset = off;
    if (id === "data") {
      dataOffset = off + 8;
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (fmtOffset < 0 || dataOffset < 0) throw new Error("sliceWav: missing fmt/data chunks");
  const channels = buf.readUInt16LE(fmtOffset + 10);
  const sampleRate = buf.readUInt32LE(fmtOffset + 12);
  const bitsPerSample = buf.readUInt16LE(fmtOffset + 22);
  const bytesPerSec = (sampleRate * channels * bitsPerSample) / 8;
  if (bytesPerSec <= 0) throw new Error("sliceWav: bad audio format");
  const startByte = Math.max(0, Math.floor(startS * bytesPerSec));
  const endByte = Math.min(dataSize, Math.floor(endS * bytesPerSec));
  const slice = buf.subarray(dataOffset + startByte, dataOffset + endByte);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + slice.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(bytesPerSec, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(slice.length, 40);
  await writeFile(outPath, Buffer.concat([header, slice]));
}

/** Reads PCM WAV duration from the RIFF header (mono 16 kHz extraction). */
export async function wavDurationSeconds(wavPath: string): Promise<number | null> {
  try {
    const { open } = await import("node:fs/promises");
    const fh = await open(wavPath, "r");
    try {
      const header = Buffer.alloc(4096);
      const { bytesRead } = await fh.read(header, 0, 4096, 0);
      if (bytesRead < 44 || header.toString("ascii", 0, 4) !== "RIFF") return null;
      let off = 12;
      while (off + 8 <= bytesRead) {
        const id = header.toString("ascii", off, off + 4);
        const size = header.readUInt32LE(off + 4);
        if (id === "data") {
          const fmt = header.toString("ascii", 12, 16);
          const channels = fmt === "fmt " ? header.readUInt16LE(22) : 1;
          const sampleRate = fmt === "fmt " ? header.readUInt32LE(24) : 16000;
          const bits = fmt === "fmt " ? header.readUInt16LE(34) : 16;
          const bytesPerSec = (sampleRate * channels * bits) / 8;
          return bytesPerSec > 0 ? size / bytesPerSec : null;
        }
        off += 8 + size + (size % 2);
      }
      return null;
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

/** One Gemini transcription call for a single (short) clip. */
export async function transcribeGeminiWindow(
  base: string,
  model: string,
  apiKey: string,
  audioPath: string,
  clipDurationS: number | null
): Promise<TranscriptSegment[]> {
  const fileBuffer = await import("node:fs/promises").then((m) => m.readFile(audioPath));
  const b64 = fileBuffer.toString("base64");
  const anchored =
    clipDurationS !== null
      ? ` This clip is exactly ${clipDurationS.toFixed(0)} seconds long, so timestamps must be between 0 and ${clipDurationS.toFixed(0)}.`
      : "";

  const attempt = async (): Promise<Response> => {
    const resp = await fetch(`${base}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: "audio/wav", data: b64 } },
              {
                text:
                  "Transcribe this audio verbatim. Write discount codes as one token with the digits attached, for example \"pactra20\" not \"pactra 20\"." +
                  anchored +
                  ' Return ONLY JSON: {"segments":[{"start":<float seconds>,"end":<float>,"text":"...","words":[{"start":..,"end":..,"text":".."}]}]}. Timestamps must be precise to 0.1s.',
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    return resp;
  };

  let resp = await attempt();
  if (!resp.ok) {
    // Free tier rate-limits audio hard; honor the server's "retry in Ns" hint
    // (plus a safety margin) instead of fixed backoffs.
    let bodyText = await resp.text().catch(() => "");
    let retryMs = 30_000;
    const m = bodyText.match(/retry in ([0-9.]+)s/i);
    if (m) retryMs = Math.min(Number(m[1]) * 1000 + 4000, 70_000);
    // Two retries max: with the free-tier bucket exhausted, the precomputed
    // transcript fixture takes over instead of burning the whole budget.
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, retryMs));
      resp = await attempt();
      if (resp.ok) break;
      bodyText = await resp.text().catch(() => "");
      const m3 = bodyText.match(/retry in ([0-9.]+)s/i);
      if (m3) retryMs = Math.min(Number(m3[1]) * 1000 + 4000, 70_000);
    }
    if (!resp.ok) {
      throw new Error(
        `Gemini transcription failed (${resp.status}): ${bodyText.slice(0, 300)}`
      );
    }
  }
  const payload = await resp.json();
  const text = String(
    payload.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
      ""
  ).trim();
  if (!text) return [];

  let parsed: { segments?: Array<Record<string, unknown>> } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const segments: TranscriptSegment[] = [];
  for (const seg of parsed?.segments ?? []) {
    const rawWords = Array.isArray(seg.words) ? seg.words : [];
    const words: Word[] = rawWords.map((w: Record<string, unknown>) => ({
      start: Number(w.start) || 0,
      end: Number(w.end) || Number(w.start) || 0,
      text: String(w.text ?? ""),
    }));
    segments.push({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || Number(seg.start) || 0,
      text: String(seg.text ?? ""),
      words,
    });
  }
  if (segments.length === 0 && text) {
    // Model returned prose, not the JSON shape — keep it as one untimed segment.
    segments.push({ start: 0, end: 0, text, words: [] });
  }
  return segments.filter((s) => s.text.trim().length > 0);
}

/**
 * Fallback tier: when the live provider is unavailable (429 / quota / 5xx /
 * network), a precomputed transcript fixture for the EXACT video (keyed by
 * its SHA-256, generated by real ASR of that file) keeps the demo alive.
 * Only used when the primary path fails — never on the normal path.
 */
function fixtureFor(videoSha256?: string | null): TranscriptSegment[] | null {
  if (!videoSha256) return null;
  return TRANSCRIPT_FIXTURES[videoSha256] ?? null;
}

export type TranscriptProvenance = "live" | "fixture";

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  /** Where the transcript actually came from — never hidden. */
  provenance: TranscriptProvenance;
}

export async function transcribeAudioFile(
  audioPath: string,
  videoSha256?: string | null
): Promise<TranscriptionResult> {
  const apiKey = requireAIKey();
  if (isGemini()) {
    // Digital silence must never become a hallucinated transcript.
    const vol = await meanVolumeDb(audioPath);
    if (vol !== null && vol < -50) return { segments: [], provenance: "live" };
    try {
      return { segments: await transcribeGemini(audioPath, apiKey), provenance: "live" };
    } catch (err) {
      const fixture = fixtureFor(videoSha256);
      if (fixture) {
        console.error(
          `[fixture] live transcription unavailable (${err instanceof Error ? err.message.slice(0, 80) : "provider error"}) — using precomputed transcript for video ${videoSha256}`
        );
        return { segments: fixture, provenance: "fixture" };
      }
      throw err;
    }
  }
  const model = process.env.TRANSCRIPTION_MODEL ?? process.env.AI_MODEL ?? "whisper-1";
  const base = aiBase();

  const fileBuffer = await import("node:fs/promises").then((m) => m.readFile(audioPath));
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "audio/wav" }), "audio.wav");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  let resp = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (resp.status === 400) {
    // Provider without word-granularity support — retry segment-level.
    form.delete("timestamp_granularities[]");
    resp = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  }
  if (!resp.ok) {
    throw new Error(`Transcription failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  }

  const payload = await resp.json();
  const segments: TranscriptSegment[] = [];
  for (const seg of payload.segments ?? []) {
    const words: Word[] = (seg.words ?? []).map((w: Record<string, unknown>) => ({
      start: Number(w.start) || 0,
      end: Number(w.end) || Number(w.start) || 0,
      text: String(w.text ?? ""),
    }));
    segments.push({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || Number(seg.start) || 0,
      text: String(seg.text ?? ""),
      words,
    });
  }
  if (segments.length === 0 && payload.text) {
    segments.push({
      start: 0,
      end: Number(payload.duration) || 0,
      text: String(payload.text),
      words: [],
    });
  }
  return { segments, provenance: "live" };
}
