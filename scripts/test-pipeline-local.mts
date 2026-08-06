/**
 * Local end-to-end test of the in-app analysis pipeline against REAL
 * MongoDB Atlas + REAL Firebase Storage, with a mock OpenAI-compatible
 * server standing in for transcription/LLM (no real AI key needed).
 *
 * Fixtures are created with a fake uid, then deleted after the run.
 * Usage: AI_BASE_URL=http://localhost:8787/v1 AI_API_KEY=test AI_MODEL=whisper-1 \
 *        npx tsx scripts/test-pipeline-local.mts
 */

import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import ffmpegStatic from "ffmpeg-static";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// --- load .env.local (handles multiline values like the PEM key) ---
const env: Record<string, string> = {};
const lines = fs.readFileSync(".env.local", "utf8").split("\n");
let currentKey: string | null = null;
for (const line of lines) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    currentKey = m[1];
    env[currentKey] = m[2];
  } else if (currentKey) {
    env[currentKey] += "\n" + line;
  }
}

const UID = "testuser-pipeline-0001";

// --- 1. mock OpenAI-compatible server (random free port) ---
const segments = [
  {
    start: 0.5, end: 1.2, text: "hey everyone this video is sponsored by acme",
    words: [
      { start: 0.5, end: 0.8, text: "hey" }, { start: 0.8, end: 1.0, text: "everyone" },
      { start: 1.0, end: 1.05, text: "this" }, { start: 1.05, end: 1.1, text: "video" },
      { start: 1.1, end: 1.12, text: "is" }, { start: 1.12, end: 1.18, text: "sponsored" },
      { start: 1.18, end: 1.2, text: "by" }, { start: 1.2, end: 1.35, text: "acme" },
    ],
  },
  {
    start: 1.4, end: 3.0, text: "use code SAI20 for a free trial today",
    words: [
      { start: 1.4, end: 1.5, text: "use" }, { start: 1.5, end: 1.6, text: "code" },
      { start: 1.6, end: 1.75, text: "SAI20" }, { start: 1.75, end: 1.85, text: "for" },
      { start: 1.85, end: 1.95, text: "a" }, { start: 1.95, end: 2.1, text: "free" },
      { start: 2.1, end: 2.3, text: "trial" }, { start: 2.3, end: 3.0, text: "today" },
    ],
  },
];

const server = http.createServer((req, res) => {
  if (req.url === "/v1/audio/transcriptions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: segments.map((s) => s.text).join(" "), segments }));
    });
  } else if (req.url === "/v1/chat/completions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ requirements: [] }) } }],
      }));
    });
  } else {
    res.writeHead(404);
    res.end("{}");
  }
});
const MOCK_PORT = await new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, () => {
    const addr = server.address();
    if (addr && typeof addr === "object") resolve(addr.port);
    else reject(new Error("no port"));
  });
});
console.log(`mock AI server on :${MOCK_PORT}`);

process.env.AI_BASE_URL = `http://localhost:${MOCK_PORT}/v1`;
process.env.AI_API_KEY = "test-key";
process.env.AI_MODEL = "whisper-1";
process.env.MONGODB_URI = env.MONGODB_URI;
process.env.MONGODB_DB_NAME = env.MONGODB_DB_NAME ?? "pactra";
process.env.FIREBASE_ADMIN_PROJECT_ID = env.FIREBASE_ADMIN_PROJECT_ID;
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = env.FIREBASE_ADMIN_CLIENT_EMAIL;
process.env.FIREBASE_ADMIN_PRIVATE_KEY = env.FIREBASE_ADMIN_PRIVATE_KEY;
process.env.FIREBASE_ADMIN_STORAGE_BUCKET = env.FIREBASE_ADMIN_STORAGE_BUCKET;
process.env.ANALYSIS_ENGINE_VERSION = env.ANALYSIS_ENGINE_VERSION ?? "0.2.0";

// --- 2. generate a 4s test video ---
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pactra-e2e-"));
const videoPath = path.join(work, "test.mp4");
execFileSync(ffmpegStatic!, [
  "-y", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=10",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", videoPath,
]);

// --- 3. connect Atlas + Firebase ---
const client = new MongoClient(env.MONGODB_URI!);
await client.connect();
const db = client.db(env.MONGODB_DB_NAME ?? "pactra");

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    storageBucket: env.FIREBASE_ADMIN_STORAGE_BUCKET,
  });
}
const bucket = getStorage().bucket();

const cleanups: Array<() => Promise<void>> = [];
async function cleanup() {
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* ignore */ }
  }
}

try {
  // --- 4. fixture docs ---
  const now = new Date();
  const sponsorId = new ObjectId();
  const briefId = new ObjectId();
  const versionId = new ObjectId();
  const campaignId = new ObjectId();
  const assetId = new ObjectId();
  const runId = new ObjectId();

  await db.collection("sponsors").insertOne({
    _id: sponsorId, ownerFirebaseUid: UID, name: "Acme Test", website: null,
    contactName: null, contactEmail: null, logoStoragePath: null, notes: null,
    createdAt: now, updatedAt: now,
  });
  cleanups.push(async () => { await db.collection("sponsors").deleteOne({ _id: sponsorId }); });

  await db.collection("sponsorBriefs").insertOne({
    _id: briefId, ownerFirebaseUid: UID, sponsorId, name: "Acme Launch",
    currentVersionNumber: 1, createdAt: now, updatedAt: now,
  });
  cleanups.push(async () => { await db.collection("sponsorBriefs").deleteOne({ _id: briefId }); });

  await db.collection("briefVersions").insertOne({
    _id: versionId, ownerFirebaseUid: UID, sponsorBriefId: briefId, sponsorId,
    versionNumber: 1, sourceType: "pdf", sourceStoragePath: null,
    sourceSha256: "abc", rawText: "fixture", status: "confirmed", confirmedAt: now,
    createdAt: now, updatedAt: now,
  });
  cleanups.push(async () => { await db.collection("briefVersions").deleteOne({ _id: versionId }); });

  const requirementRows = [
    { type: "required_phrase", description: "must say free trial", parameters: { phrase: "free trial" }, verificationMode: "deterministic" },
    { type: "forbidden_claim", description: "never say guaranteed growth", parameters: { phrase: "guaranteed growth" }, verificationMode: "deterministic" },
    { type: "discount_code", description: "description must include SAI20", parameters: { code: "SAI20" }, verificationMode: "deterministic" },
    { type: "description_disclosure", description: "description must disclose sponsorship", parameters: {}, verificationMode: "deterministic" },
    { type: "description_url", description: "description must include url", parameters: { url: "https://acme.com/sai20" }, verificationMode: "deterministic" },
    { type: "segment_duration", description: "segment 20-60s", parameters: { minimum_seconds: 20, maximum_seconds: 60 }, verificationMode: "deterministic" },
    { type: "human_review", description: "feels natural", parameters: {}, verificationMode: "human_required" },
    { type: "logo_visibility", description: "logo visible", parameters: {}, verificationMode: "visual_with_evidence" },
  ];
  const reqIds: ObjectId[] = [];
  for (const r of requirementRows) {
    const res = await db.collection("requirements").insertOne({
      ownerFirebaseUid: UID, briefVersionId: versionId, sponsorId,
      type: r.type, description: r.description, parameters: r.parameters,
      verificationMode: r.verificationMode,
      sourceEvidence: { page: 1, quote: null }, status: "confirmed",
      createdAt: now, updatedAt: now,
    });
    reqIds.push(res.insertedId);
  }
  cleanups.push(async () => {
    await db.collection("requirements").deleteMany({ _id: { $in: reqIds } });
  });

  await db.collection("campaigns").insertOne({
    _id: campaignId, ownerFirebaseUid: UID, sponsorId, briefVersionId: versionId,
    name: "Acme launch — sponsored video", status: "analyzing",
    plannedTitle: "Acme", plannedDescription: null, assignedYoutubeVideoId: null,
    dueAt: null, createdAt: now, updatedAt: now,
  });
  cleanups.push(async () => { await db.collection("campaigns").deleteOne({ _id: campaignId }); });

  const storagePath = `users/${UID}/campaigns/${campaignId}/videos/${assetId}/test.mp4`;
  await db.collection("videoAssets").insertOne({
    _id: assetId, ownerFirebaseUid: UID, campaignId, versionNumber: 1,
    storagePath, originalFilename: "test.mp4", contentType: "video/mp4",
    sizeBytes: fs.statSync(videoPath).size, sha256: null, durationSeconds: null,
    width: null, height: null, uploadStatus: "uploaded", createdAt: now, updatedAt: now,
  });
  cleanups.push(async () => {
    await db.collection("videoAssets").deleteOne({ _id: assetId });
    await bucket.file(storagePath).delete().catch(() => {});
  });

  await db.collection("analysisRuns").insertOne({
    _id: runId, ownerFirebaseUid: UID, campaignId, briefVersionId: versionId,
    videoAssetId: assetId, videoSha256: "", descriptionSnapshot: "Sponsored by Acme — use code SAI20 at https://acme.com/sai20",
    descriptionSha256: "x", engineVersion: "0.2.0", status: "queued",
    progressPercent: 0, currentStage: "queued", startedAt: null, completedAt: null,
    summary: { passed: 0, failed: 0, uncertain: 0, humanReview: 0 },
    errorCode: null, errorMessageSafe: null, createdAt: now, updatedAt: now,
  });
  cleanups.push(async () => {
    const results = await db.collection("testResults").find({ analysisRunId: runId }).toArray();
    const evIds = results.flatMap((r) => r.evidenceIds ?? []);
    const evs = await db.collection("evidenceItems").find({ _id: { $in: evIds } }).toArray();
    for (const ev of evs) {
      if (ev.storagePath) await bucket.file(ev.storagePath).delete().catch(() => {});
    }
    await db.collection("evidenceItems").deleteMany({ analysisRunId: runId });
    await db.collection("testResults").deleteMany({ analysisRunId: runId });
    await db.collection("analysisRuns").deleteOne({ _id: runId });
  });

  // upload the video as the "backend" (admin SDK bypasses rules)
  await bucket.upload(videoPath, { destination: storagePath, contentType: "video/mp4" });
  console.log("video uploaded:", storagePath);

  // --- 5. run the pipeline ---
  const { runAnalysisPipeline } = await import("../lib/worker/pipeline");
  const result = await runAnalysisPipeline(runId);
  console.log("PIPELINE RESULT:", JSON.stringify(result));

  // --- 6. verify persisted state ---
  const run = await db.collection("analysisRuns").findOne({ _id: runId });
  console.log("run status:", run?.status, "| stage:", run?.currentStage, "| summary:", JSON.stringify(run?.summary));
  const results = await db.collection("testResults").find({ analysisRunId: runId }).toArray();
  const byType: Record<string, string> = {};
  for (const r of results) {
    const req = await db.collection("requirements").findOne({ _id: r.requirementId });
    byType[req?.type ?? "?"] = r.status;
  }
  console.log("test verdicts:", JSON.stringify(byType));
  const evCount = await db.collection("evidenceItems").countDocuments({ analysisRunId: runId });
  console.log("evidence items:", evCount);
  const asset = await db.collection("videoAssets").findOne({ _id: assetId });
  console.log("asset after:", JSON.stringify({ sha256: asset?.sha256?.slice(0, 12), duration: asset?.durationSeconds, status: asset?.uploadStatus }));

  // --- 7. assert expectations (verdicts match the Python engine semantics) ---
  const expectations = {
    "run failed (1 deterministic fail)": run?.status === "failed",
    "required_phrase pass": byType["required_phrase"] === "pass",
    "forbidden_claim pass (not spoken)": byType["forbidden_claim"] === "pass",
    "discount_code pass": byType["discount_code"] === "pass",
    "description_disclosure pass": byType["description_disclosure"] === "pass",
    "description_url pass (present in description)": byType["description_url"] === "pass",
    "segment_duration fail (1.9s < 20s minimum)": byType["segment_duration"] === "fail",
    "human_review": byType["human_review"] === "human_review",
    "logo_visibility not_testable": byType["logo_visibility"] === "not_testable",
    "evidence created": evCount > 0,
    "asset ready with sha+duration": asset?.uploadStatus === "ready" && !!asset?.sha256 && asset?.durationSeconds === 4,
  };
  let failed = 0;
  for (const [name, ok] of Object.entries(expectations)) {
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
    if (!ok) failed++;
  }
  if (failed > 0) {
    console.error(`E2E FAILED: ${failed} expectations`);
    process.exitCode = 1;
  } else {
    console.log("E2E PIPELINE TEST PASSED");
  }
} finally {
  await cleanup();
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
  await client.close();
}
