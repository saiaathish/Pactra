/**
 * PRODUCTION golden demo runner for Pactra.
 *
 * Creates a throwaway Firebase user and drives the REAL prod API:
 * sponsor → brief → PDF → version → 7 requirements → confirm → campaign →
 * video asset init → admin upload → complete → analyze → poll → results →
 * manifest. Asserts the golden expectation (failing: 4P/3F, passing: 7P/0F)
 * and prints an evidence report with latencies. The user is deleted after.
 *
 * Usage:
 *   node scripts/run-golden-demo.mts --video scripts/demo-media/failing.mp4 --expect failing --tag failing-v1
 *   node scripts/run-golden-demo.mts --video scripts/demo-media/passing.mp4 --expect passing --tag passing-v1
 *   node scripts/run-golden-demo.mts --video scripts/demo-media/nospeech.mp4 --expect nospeech --tag nospeech-v1
 *   node scripts/run-golden-demo.mts --video scripts/demo-media/long10.mp4 --expect long10 --tag long10-v1
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

const BASE = process.env.PROD_BASE ?? "https://pactra-flame.vercel.app";

// --- args ---
const argv = process.argv.slice(2);
const videoArg = argv[argv.indexOf("--video") + 1];
const expect = argv[argv.indexOf("--expect") + 1] ?? "failing";
const tag = argv[argv.indexOf("--tag") + 1] ?? expect;
if (!videoArg || !fs.existsSync(videoArg)) {
  console.error("missing --video path");
  process.exit(2);
}
const VIDEO = path.resolve(videoArg);
const VIDEO_SHA = crypto.createHash("sha256").update(fs.readFileSync(VIDEO)).digest("hex");
const VIDEO_SIZE = fs.statSync(VIDEO).size;

// --- load .env.local ---
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

const DESCRIPTION =
  "Sponsored by Acme. Get the 30-day free trial with code PACTRA20 at https://pactra.app/trial.";
const REQUIREMENTS = [
  { type: "segment_placement", description: "Integration starts after 00:20", parameters: { start_min_s: 20 } },
  { type: "segment_duration", description: "Segment lasts 35–50 seconds", parameters: { minimum_seconds: 35, maximum_seconds: 50 } },
  { type: "required_phrase", description: "Must say '30-day free trial'", parameters: { phrase: "30-day free trial" } },
  { type: "required_phrase", description: "Must mention code PACTRA20", parameters: { phrase: "pactra20" } },
  { type: "spoken_disclosure", description: "Must disclose sponsorship before the pitch", parameters: { before_segment: true } },
  { type: "forbidden_claim", description: "Must not say 'guaranteed results'", parameters: { phrase: "guaranteed results" } },
  { type: "description_url", description: "Description must include the correct URL", parameters: { url: "https://pactra.app/trial" } },
];

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const t0 = Date.now();
const email = `demo-${Date.now()}@pactra.test`;
const password = "DemoTest!123";
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY!;

try {
  // --- 1. throwaway user via Identity Toolkit ---
  const signup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signupJson = await signup.json();
  check("firebase user created", signup.ok, signupJson.error?.message ?? "");
  const idToken = signupJson.idToken;
  const firebaseUid = signupJson.localId;
  const H = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  check("session bootstrap", sessionRes.ok);

  // --- 2. sponsor + brief + PDF + version ---
  const sponsorRes = await fetch(`${BASE}/api/sponsors`, {
    method: "POST", headers: H,
    body: JSON.stringify({ name: "Acme Corp" }),
  });
  const sponsorJson = await sponsorRes.json();
  check("sponsor created", sponsorRes.ok);
  const sponsorId = sponsorJson.id;

  const briefRes = await fetch(`${BASE}/api/briefs`, {
    method: "POST", headers: H,
    body: JSON.stringify({ sponsorId, name: "Acme Launch Brief" }),
  });
  const briefJson = await briefRes.json();
  check("brief created", briefRes.ok);
  const briefId = briefJson.id;

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
  const pdf = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 90 >> stream
BT /F1 24 Tf 72 720 Td (Acme Launch Brief) Tj ET
BT /F1 18 Tf 72 680 Td (Integration after 20s, 35-50s, free trial, PACTRA20) Tj ET
endstream endobj
trailer << /Root 1 0 R /Size 5 >>
%%EOF`);
  const briefPdfPath = `users/${firebaseUid}/sponsors/${sponsorId}/briefs/demo/brief.pdf`;
  await getStorage().bucket().file(briefPdfPath).save(pdf, { contentType: "application/pdf" });

  const versionsRes = await fetch(`${BASE}/api/briefs/${briefId}/versions`, {
    method: "POST", headers: H,
    body: JSON.stringify({ sourceType: "pdf", storagePath: briefPdfPath }),
  });
  const versionsBody = await versionsRes.text();
  const versionsJson = JSON.parse(versionsBody);
  check("brief parsed into version", versionsRes.ok && !!versionsJson.version?.id, versionsRes.ok ? "" : versionsBody.slice(0, 200));
  const versionId = versionsJson.version?.id;

  // --- 3. clear parser candidates, add the 7 golden requirements + confirm ---
  // The brief parser drafts candidate requirements from the PDF; the confirm
  // route confirms ALL drafts, so replace the version's drafts wholesale.
  const verGetRes = await fetch(`${BASE}/api/brief-versions/${versionId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const verGetJson = await verGetRes.json();
  const existingDraftIds = (verGetJson.requirements ?? [])
    .filter((r: { status?: string }) => r.status === "draft")
    .map((r: { id: string }) => r.id);
  const reqRes = await fetch(`${BASE}/api/brief-versions/${versionId}/requirements`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({
      deletedIds: existingDraftIds,
      requirements: REQUIREMENTS.map((r) => ({ ...r, verificationMode: "deterministic" })),
    }),
  });
  const reqBody = await reqRes.text();
  let reqCount = 0;
  try {
    reqCount = JSON.parse(reqBody).requirements?.length ?? 0;
  } catch { /* body not JSON */ }
  check("7 requirements drafted", reqRes.ok && reqCount === 7, reqRes.ok ? `count=${reqCount}` : reqBody.slice(0, 200));

  const confirmRes = await fetch(`${BASE}/api/brief-versions/${versionId}/confirm`, {
    method: "POST", headers: H,
  });
  check("brief version confirmed", confirmRes.ok);

  // --- 4. campaign ---
  const campaignRes = await fetch(`${BASE}/api/campaigns`, {
    method: "POST", headers: H,
    body: JSON.stringify({ sponsorId, briefVersionId: versionId, name: "Acme launch — sponsored video", plannedTitle: "Acme" }),
  });
  const campaignJson = await campaignRes.json();
  check("campaign created", campaignRes.ok);
  const campaignId = campaignJson.id;

  // --- 5. video asset init + admin upload + complete ---
  const initRes = await fetch(`${BASE}/api/campaigns/${campaignId}/video-assets/init`, {
    method: "POST", headers: H,
    body: JSON.stringify({ campaignId, originalFilename: path.basename(VIDEO), contentType: "video/mp4", sizeBytes: VIDEO_SIZE }),
  });
  const initJson = await initRes.json();
  check("video asset init", initRes.ok);
  const videoAssetId = initJson.id;
  const storagePath = initJson.storagePath;
  await getStorage().bucket().upload(VIDEO, { destination: storagePath, contentType: "video/mp4" });
  const completeRes = await fetch(`${BASE}/api/campaigns/${campaignId}/video-assets/complete`, {
    method: "POST", headers: H,
    body: JSON.stringify({ videoAssetId, storagePath }),
  });
  check("video asset complete", completeRes.ok, (await completeRes.text()).slice(0, 150));

  // --- 6. analyze (latency: request → terminal) ---
  const tAnalyze = Date.now();
  const analyzeRes = await fetch(`${BASE}/api/campaigns/${campaignId}/analyze`, {
    method: "POST", headers: H,
    body: JSON.stringify({ campaignId, videoAssetId, descriptionSnapshot: DESCRIPTION }),
  });
  const analyzeJson = await analyzeRes.json();
  check("analysis run created", analyzeRes.ok, analyzeJson.error ?? "");
  const runId = analyzeJson.analysisRunId;
  console.log(`analysisRunId: ${runId}`);

  let run: any = null;
  // The analyze request now runs the pipeline synchronously (blocking), so the
  // poll loop is a short safety net rather than the main wait.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const rRes = await fetch(`${BASE}/api/analysis-runs/${runId}`, { headers: { Authorization: `Bearer ${idToken}` } });
    run = (await rRes.json()).run;
    if (["passed", "failed", "partial", "error", "cancelled"].includes(run?.status)) break;
    console.log(`  ...stage ${run?.currentStage} (${run?.progressPercent}%)`);
  }
  const tTerminal = Date.now();
  check("run reached terminal state", ["passed", "failed", "partial", "error", "cancelled"].includes(run?.status), `status=${run?.status} stage=${run?.currentStage}`);
  console.log(`latencies: analyze-request→terminal ${((tTerminal - tAnalyze) / 1000).toFixed(1)}s | total ${((tTerminal - t0) / 1000).toFixed(1)}s`);

  // --- 7. results + evidence report ---
  const resultsRes = await fetch(`${BASE}/api/analysis-runs/${runId}/results`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const resultsJson = await resultsRes.json();
  const results = resultsJson.results ?? [];
  const evidence = resultsJson.evidence ?? [];
  const counts = { passed: 0, failed: 0, uncertain: 0, humanReview: 0, notTestable: 0 };
  const statusMap: Record<string, "passed" | "failed" | "uncertain" | "humanReview" | "notTestable"> = {
    pass: "passed",
    fail: "failed",
    uncertain: "uncertain",
    human_review: "humanReview",
    not_testable: "notTestable",
  };
  const perReq: Array<Record<string, unknown>> = [];
  for (const r of results) {
    counts[statusMap[r.status as string] ?? "uncertain"] += 1;
    const evs = evidence.filter((e: any) => e.testResultId === r.id);
    const tsEv = evs.filter((e: any) => e.startSeconds != null);
    const clips = evs.filter((e: any) => e.type === "video_clip" && e.signedUrl);
    perReq.push({
      req: r.requirement?.description,
      type: r.requirement?.type,
      status: r.status,
      confidence: r.confidence,
      explanation: r.explanation,
      evidenceTs: tsEv.map((e: any) => `${e.startSeconds.toFixed(1)}–${e.endSeconds?.toFixed(1) ?? "?"}s`),
      clips: clips.length,
    });
    console.log(`  [${r.status.toUpperCase().padEnd(9)}] ${r.requirement?.type ?? "?"} — ${r.explanation}${tsEv.length ? ` | ts=${tsEv.map((e: any) => e.startSeconds.toFixed(1)).join(",")}` : ""}${clips.length ? ` | clips=${clips.length}` : ""}`);
  }
  console.log(`COUNTS: ${JSON.stringify(counts)}`);
  fs.writeFileSync(`/tmp/golden-${tag}.json`, JSON.stringify({ tag, runId, status: run?.status, counts, perReq, videoSha256: VIDEO_SHA, videoSize: VIDEO_SIZE, latencyS: (tTerminal - tAnalyze) / 1000, totalS: (tTerminal - t0) / 1000 }, null, 2));

  // --- 8. assertions per expectation ---
  if (expect === "failing") {
    check("run failed", run?.status === "failed", run?.status);
    check("counts 4P/3F", counts.passed === 4 && counts.failed === 3 && counts.uncertain === 0 && counts.humanReview === 0, JSON.stringify(counts));
    const failReqs = results.filter((r: any) => r.status === "fail");
    const allFailTs = failReqs.every((r: any) =>
      evidence.some((e: any) => e.testResultId === r.id && e.startSeconds != null)
    );
    check("every failure has timestamped evidence", allFailTs);
  } else if (expect === "passing") {
    check("run passed", run?.status === "passed", run?.status);
    check("counts 7P/0F", counts.passed === 7 && counts.failed === 0 && counts.uncertain === 0 && counts.humanReview === 0, JSON.stringify(counts));
    const manifestRes = await fetch(`${BASE}/api/analysis-runs/${runId}/manifest`, {
      method: "POST", headers: { Authorization: `Bearer ${idToken}` },
    });
    const manifestJson = await manifestRes.json();
    check("manifest generated", manifestRes.ok && !!manifestJson.manifest?.manifestSha256);
    const m = manifestJson.manifest ?? {};
    check("manifest binds correct video hash", m.videoSha256 === VIDEO_SHA);
    check("manifest has brief + description hashes", !!m.briefSha256 && !!m.descriptionSha256);
    check("manifest lists 7 results", (m.manifestJson?.results ?? []).length === 7);
  } else if (expect === "nospeech") {
    check("nospeech run errors safely (no transcript)", run?.status === "error", run?.status);
    check("no spoken requirement passed", !results.some((r: any) => ["required_phrase", "forbidden_claim", "spoken_disclosure"].includes(r.requirement?.type) && r.status === "pass"));
    check("error message mentions transcript", /transcript/i.test(run?.errorMessageSafe ?? ""));
  } else if (expect === "long10") {
    check("long10 rejected with clear duration error", run?.status === "error" && /exceeds the maximum demo duration/.test(run?.errorMessageSafe ?? ""), `status=${run?.status} msg=${run?.errorMessageSafe}`);
    console.log(`long10 note: errored at ${((tTerminal - tAnalyze) / 1000).toFixed(1)}s — fail-fast guard, no serverless timeout hang`);
  }

  // --- cleanup: delete the user ---
  if (!getApps().length) initializeApp({ credential: cert({}) });
  await getAuth().deleteUser(firebaseUid);
  console.log("demo user deleted:", firebaseUid);

  console.log(failures === 0 ? `\nGOLDEN DEMO (${tag}) OK` : `\nGOLDEN DEMO (${tag}) FAILED (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (err) {
  console.error("GOLDEN DEMO ERROR:", err);
  process.exitCode = 1;
}
