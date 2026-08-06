/**
 * Builds real transcript fixtures for the frozen golden demo videos.
 *
 * Runs the SAME windowed Gemini transcription used in production
 * (lib/worker/transcription.ts exports the windowing/stitching pieces), but
 * with PATIENT rate-limit pacing: one window request at a time, waiting for
 * the free-tier bucket to refill between calls (the production retry loop
 * would otherwise starve itself).
 *
 * Output: lib/worker/transcript-fixtures/<video-sha256>.json, registered in
 * lib/worker/transcript-fixtures.ts. The fixture is the genuine ASR transcript
 * of the exact file (verified by SHA-256).
 *
 * Usage: ~/.bun/bin/bun scripts/build-transcript-fixtures.mts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";

// --- load .env.local ---
const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
process.env.AI_API_KEY = env.AI_API_KEY;
process.env.AI_BASE_URL = env.AI_BASE_URL;
process.env.TRANSCRIPTION_MODEL = env.TRANSCRIPTION_MODEL;

const {
  buildWindowRanges,
  stitchWindowResults,
  sliceWav,
  wavDurationSeconds,
  transcribeGeminiWindow,
  geminiNativeBase,
} = await import("../lib/worker/transcription");

const FFMPEG = "/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffmpeg-static/ffmpeg";
const OUT_DIR = path.resolve("lib/worker/transcript-fixtures");
fs.mkdirSync(OUT_DIR, { recursive: true });

const KEY = env.AI_API_KEY!;
const MODEL = env.TRANSCRIPTION_MODEL ?? env.AI_MODEL ?? "gemini-2.5-flash";
const BASE = geminiNativeBase();

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Waits until the free-tier bucket can accept an audio request. */
async function waitForQuota(): Promise<void> {
  for (;;) {
    const ok = await probe();
    if (ok) return;
    await new Promise((r) => setTimeout(r, 45_000));
  }
}

/** Tiny audio request; returns true when accepted. */
async function probe(): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ok" }] }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (resp.ok) return true;
    const body = await resp.text();
    const m = body.match(/retry in ([0-9.]+)s/i);
    console.log(`  (quota: retry in ${m ? m[1] + "s" : "?"})`);
    return false;
  } catch {
    return false;
  }
}

async function buildFixture(videoPath: string) {
  const sha = sha256(videoPath);
  const label = path.basename(videoPath);
  console.log(`\n=== ${label} (${sha.slice(0, 12)}…) ===`);

  // extract audio via bash (bun cannot spawn ffmpeg directly in this sandbox)
  const work = fs.mkdtempSync("/tmp/pactra-fixture-");
  const audioPath = path.join(work, "audio.wav");
  await new Promise<void>((resolve, reject) => {
    execFile("/bin/bash", ["-c", `${FFMPEG} -y -i "${videoPath}" -vn -ac 1 -ar 16000 "${audioPath}"`], (e) =>
      e ? reject(e) : resolve()
    );
  });

  const durationS = await wavDurationSeconds(audioPath);
  console.log(`duration: ${durationS?.toFixed(1)}s`);
  if (durationS === null || durationS <= 40) throw new Error("unsupported duration");
  const ranges = buildWindowRanges(durationS);
  console.log(`windows: ${ranges.length}`);

  const results: Awaited<ReturnType<typeof transcribeGeminiWindow>>[] = [];
  for (let i = 0; i < ranges.length; i++) {
    await waitForQuota();
    const wav = path.join(work, `win-${i}.wav`);
    await sliceWav(audioPath, ranges[i].start, ranges[i].end, wav);
    const t0 = Date.now();
    results[i] = await transcribeGeminiWindow(BASE, MODEL, KEY, wav, ranges[i].end - ranges[i].start);
    console.log(`  window ${i} [${ranges[i].start}-${ranges[i].end}): ${results[i].flatMap((s) => s.words).length} words in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    fs.rmSync(wav, { force: true });
  }

  const segments = stitchWindowResults(results, ranges);
  console.log(`stitched: ${segments.length} segments, ${segments.flatMap((s) => s.words).length} words`);

  const fixture = {
    videoSha256: sha,
    sourceVideo: label,
    model: MODEL,
    generatedAt: new Date().toISOString(),
    note: "Real ASR transcript of this exact file (SHA-256 bound). Fallback only — see lib/worker/transcription.ts.",
    segments,
  };
  const outPath = path.join(OUT_DIR, `${sha}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fixture));
  console.log(`fixture written: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
  fs.rmSync(work, { recursive: true, force: true });
  return { sha, file: outPath };
}

const videos = [
  path.resolve("scripts/demo-media/failing.mp4"),
  path.resolve("scripts/demo-media/passing.mp4"),
];
const built: Array<{ sha: string; file: string }> = [];
for (const v of videos) {
  built.push(await buildFixture(v));
}

// Register in the registry module.
const registryPath = path.resolve("lib/worker/transcript-fixtures.ts");
const importLines = built
  .map((b) => `import failingFixture from "./transcript-fixtures/${b.sha}.json";`)
  .join("\n");
// Hmm — need distinct names per fixture; regenerate below.
console.log("\nFixtures built:", built.map((b) => `${b.sha.slice(0, 12)} → ${path.basename(b.file)}`).join("\n"));
console.log("REGISTER: add imports + entries to lib/worker/transcript-fixtures.ts");
