/**
 * Local ASR + engine verification: extracts audio (via bash+ffmpeg — bun
 * cannot spawn the ffmpeg binary directly in this sandbox), transcribes with
 * the REAL production path (lib/worker/transcription.ts -> Gemini), then runs
 * the REAL requirement engine (runAll) with the golden demo requirement set.
 *
 * Usage: node scripts/verify-asr.mts scripts/demo-media/failing.mp4
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

// --- load .env.local into process.env ---
const env: Record<string, string> = {};
const lines = fs.readFileSync(".env.local", "utf8").split("\n");
for (const line of lines) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
for (const k of ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "TRANSCRIPTION_MODEL"]) {
  if (env[k]) process.env[k] = env[k];
}

const videoPath = path.resolve(process.argv[2]);
const { transcribeAudioFile } = await import("../lib/worker/transcription");
const { Transcript, findPhrase, detectSponsorSegment, runAll } = await import(
  "../lib/worker/requirementTests"
);

const work = fs.mkdtempSync("/tmp/pactra-asr-");
const audioPath = path.join(work, "audio.wav");
const t0 = Date.now();
await new Promise<void>((resolve, reject) => {
  execFile(
    "/bin/bash",
    [
      "-c",
      `/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffmpeg-static/ffmpeg -y -i "${videoPath}" -vn -ac 1 -ar 16000 "${audioPath}"`,
    ],
    (e) => (e ? reject(e) : resolve())
  );
});
const t1 = Date.now();
const segments = await transcribeAudioFile(audioPath);
const t2 = Date.now();
console.log(`audio extract: ${t1 - t0}ms | transcription: ${t2 - t1}ms | segments: ${segments.length}`);

const transcript = new Transcript(segments);
const words = transcript.words();
const lastWordEnd = words.length > 0 ? words[words.length - 1].end : 0;
console.log(`words: ${words.length} | last word end: ${lastWordEnd.toFixed(2)}s`);
console.log(`full text: ${transcript.fullText().slice(0, 900)}`);

const hits: Array<[string, string[]]> = [
  ["sponsored", ["sponsored"]],
  ["acme", ["acme"]],
  ["30-day free trial", ["30-day free trial"]],
  ["code", ["pactra20", "pactra 20"]],
  ["guaranteed results", ["guaranteed results"]],
];
for (const [label, phrases] of hits) {
  const occs = phrases.flatMap((p) => findPhrase(words, p));
  console.log(
    `  "${label}": ${occs.length === 0 ? "NOT FOUND" : occs.map((o) => `${o.start.toFixed(2)}-${o.end.toFixed(2)}s`).join(" | ")}`
  );
}
const seg = detectSponsorSegment(transcript, ["Acme"]);
console.log(
  seg
    ? `detected segment: ${seg.start.toFixed(2)} -> ${seg.end.toFixed(2)}s (duration ${(seg.end - seg.start).toFixed(2)}s)`
    : "no segment detected"
);

// --- golden requirement set (mirrors the demo brief) ---
const DESCRIPTION = "Sponsored by Acme. Get the 30-day free trial with code PACTRA20 at https://pactra.app/trial.";
const REQUIREMENTS = [
  { id: "r1", type: "segment_placement", parameters: { start_min_s: 20 } },
  { id: "r2", type: "segment_duration", parameters: { minimum_seconds: 35, maximum_seconds: 50 } },
  { id: "r3", type: "required_phrase", parameters: { phrase: "30-day free trial" } },
  { id: "r4", type: "required_phrase", parameters: { phrase: "pactra20" } },
  { id: "r5", type: "spoken_disclosure", parameters: { before_segment: true } },
  { id: "r6", type: "forbidden_claim", parameters: { phrase: "guaranteed results" } },
  { id: "r7", type: "description_url", parameters: { url: "https://pactra.app/trial" } },
];
const outcomes = await runAll(REQUIREMENTS, transcript, DESCRIPTION, {
  brandNames: ["Acme"],
  aiKey: env.AI_API_KEY,
  model: env.AI_MODEL ?? "gemini-3.5-flash",
});
const counts = { pass: 0, fail: 0, uncertain: 0, human_review: 0, not_testable: 0 };
for (const o of outcomes) {
  counts[o.status as keyof typeof counts] += 1;
  console.log(
    `  [${o.status.toUpperCase().padEnd(11)}] ${o.requirement_id} — ${o.explanation}${o.evidence.length ? ` (${o.evidence.length} evidence)` : ""}`
  );
}
console.log(`COUNTS: ${JSON.stringify(counts)}`);
fs.rmSync(work, { recursive: true, force: true });
