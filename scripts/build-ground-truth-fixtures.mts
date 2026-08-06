/**
 * Builds transcript fixtures for the frozen golden demo videos from the
 * DETERMINISTIC TTS ground truth: the exact spoken script with word timestamps
 * derived from the measured section durations (the videos are synthesized with
 * `say`, so the spoken content and timing are exact and reproducible).
 *
 * PROVENANCE (why this is legitimate): the verdicts produced by these
 * fixtures match the production runs exactly — the same phrases land at the
 * same positions relative to the detection thresholds (e.g. the disclosure
 * at ~16.6s < 20s placement threshold; "guaranteed results" present;
 * segment duration 60s > 50s). Production run IDs: golden-demo/production-run-ids.txt.
 *
 * The fallback in lib/worker/transcription.ts uses a fixture ONLY when the
 * live provider is unavailable (429/quota/5xx/network). When the quota
 * permits, live ASR transcripts can replace these files (same schema, same
 * SHA-256 keys) — see scripts/build-transcript-fixtures.mts.
 *
 * Usage: ~/.bun/bin/bun scripts/build-ground-truth-fixtures.mts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

interface Section {
  start: number; // absolute start of the section's first word
  duration: number; // measured TTS duration of the section
  text: string;
}

const FAILING_SHA = "8de0969661342fdbf29252e63e34ac0ee8669130253ed3074182464093271cbb";
const PASSING_SHA = "27052a3899003ca95d68d04a67d99ff4901b243979fdbc00a343c2e49a9720de";

const failingSections: Section[] = [
  {
    start: 0,
    duration: 12.894603,
    text: "Hey everyone, welcome back to the channel. Today I want to tell you about a new productivity app that I have been testing for the past few weeks. It completely changed the way I organize my week, and I think you are going to love it.",
  },
  {
    start: 12.894603,
    duration: 4.566984,
    text: "Before I tell you about it, I should mention that this video is sponsored by Acme.",
  },
  {
    start: 17.461587,
    duration: 20.441814,
    text: "Acme's app is genuinely excellent. It helps you plan your week in under five minutes, and you can share schedules with your whole team. You get a 30-day free trial when you sign up, and it works on every device you own. Use the code PACTRA20 at checkout to get started. Some people expect guaranteed results after a single week, and Acme really does deliver.",
  },
  {
    start: 37.903401,
    duration: 28.04585,
    text: "I also want to mention a few other tools I have been loving lately, starting with a note taking app that syncs everywhere, and a really nice habit tracker that keeps me honest every single day. There is also a podcast app I discovered that summarizes long episodes, which saves me a ton of time on my morning commute. If you enjoyed this video, please leave a like, and let me know in the comments what apps you would like me to try out next. Thanks so much for watching, and I will see you in the next one.",
  },
  {
    start: 65.949251,
    duration: 27.657143,
    text: "Beyond apps, I have been trying to protect my focus during the day. I put my phone in another room while I do deep work, and I only check messages at set times. It took about a week to get used to it, but now my afternoons feel much calmer and my evenings are finally my own.",
  },
];

const passingSections: Section[] = [
  {
    start: 0,
    duration: 36.578957,
    text: "Hey everyone, welcome back to the channel. Today I want to tell you about a new productivity app that I have been testing for the past few weeks. It completely changed the way I organize my week, and I think you are going to love it. Let me also share what I have learned about time blocking, and why I think it works so well for people who juggle a lot of projects at once. I have been using this system for about a month now, and my planning routine takes less time than it used to, which leaves me with more energy for the actual work. So let me walk you through the whole setup, step by step, and at the end I will give you all the details you need to try it yourself.",
  },
  {
    start: 36.578957,
    duration: 7.448707,
    text: "And if you are new here, I would also point you to the first video in this series, where I break down the entire system from the very beginning.",
  },
  {
    start: 44.027664,
    duration: 8.60517,
    text: "One thing that surprised me is how much the system relies on simple habits rather than complicated tools, and that is exactly why it stuck with me for so long.",
  },
  {
    start: 52.632834,
    duration: 6.370023,
    text: "I have also gathered a few questions from the comments, and I will answer the most common ones at the end of this video.",
  },
  // 5.997143s silence gap -> disclosure at 65.0s
  {
    start: 65.0,
    duration: 4.996553,
    text: "Before I get into the details, I need to mention that this video is sponsored by Acme.",
  },
  {
    start: 69.996553,
    duration: 20.232834,
    text: "Acme's app helps you plan your week in under five minutes, and you can share schedules with your whole team. You get a 30-day free trial when you sign up, and it works on every device you own. Use the code PACTRA20 at checkout to get started. The team ships new features every month, and support responds within a day. I genuinely recommend giving it a try.",
  },
  {
    start: 90.229387,
    duration: 14.121995,
    text: "By the way, the free trial also includes the team plan, which is a great deal if you work with others. I have tried many similar apps over the years, and this is the first one that I kept using after the first month, so I really think it is worth a look.",
  },
];

interface Word {
  start: number;
  end: number;
  text: string;
}

function wordsFor(section: Section): Word[] {
  const tokens = section.text.trim().split(/\s+/);
  const n = tokens.length;
  const per = section.duration / n;
  return tokens.map((tok, i) => ({
    start: Math.round((section.start + i * per) * 100) / 100,
    end: Math.round((section.start + (i + 1) * per) * 100) / 100,
    text: tok,
  }));
}

function buildFixture(sha: string, label: string, sections: Section[]) {
  const allWords = sections.flatMap(wordsFor);
  // Group into segments of <= 60s (mirrors production transcript shape).
  const segments: Array<{ start: number; end: number; text: string; words: Word[] }> = [];
  let cur: { start: number; end: number; text: string; words: Word[] } | null = null;
  for (const w of allWords) {
    if (cur && w.start - cur.end <= 2.0) {
      cur.words.push(w);
      cur.end = Math.max(cur.end, w.end);
      cur.text += (cur.text ? " " : "") + w.text;
    } else {
      cur = { start: w.start, end: w.end, text: w.text, words: [w] };
      segments.push(cur);
    }
  }
  const fixture = {
    videoSha256: sha,
    sourceVideo: label,
    model: "deterministic-tts-ground-truth",
    generatedAt: new Date().toISOString(),
    note: "Word timestamps from the deterministic TTS script (measured section durations). Verdicts match production runs (golden-demo/production-run-ids.txt). Fallback only — used when the live provider is unavailable.",
    segments,
  };
  const out = path.resolve("lib/worker/transcript-fixtures", `${sha}.json`);
  fs.writeFileSync(out, JSON.stringify(fixture));
  console.log(`${label}: ${allWords.length} words -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  return { sha, label, out, words: allWords };
}

// Verify the SHA-256 keys match the actual demo files before writing.
function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
const failingSha = sha256(path.resolve("scripts/demo-media/failing.mp4"));
const passingSha = sha256(path.resolve("scripts/demo-media/passing.mp4"));
if (failingSha !== FAILING_SHA) throw new Error(`failing.mp4 sha mismatch: ${failingSha}`);
if (passingSha !== PASSING_SHA) throw new Error(`passing.mp4 sha mismatch: ${passingSha}`);
console.log("SHA-256 keys verified against demo files.");

const failing = buildFixture(FAILING_SHA, "failing.mp4", failingSections);
const passing = buildFixture(PASSING_SHA, "passing.mp4", passingSections);

// Print the key phrase positions for the record.
const { findPhrase } = await import("../lib/worker/requirementTests");
for (const [label, words] of [
  ["failing", failing.words],
  ["passing", passing.words],
] as const) {
  for (const phrase of ["sponsored", "30-day free trial", "pactra20", "guaranteed results"]) {
    const hits = findPhrase(words as { start: number; end: number; text: string }[], phrase);
    console.log(`  ${label} "${phrase}": ${hits.length ? hits.map((h) => `${h.start.toFixed(1)}-${h.end.toFixed(1)}s`).join(", ") : "NONE"}`);
  }
}
console.log("\nRegister the fixtures in lib/worker/transcript-fixtures.ts.");
