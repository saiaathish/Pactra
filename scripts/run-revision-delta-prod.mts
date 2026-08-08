/**
 * PRODUCTION revision-delta proof for Pactra.
 *
 * One throwaway account, ONE campaign, ONE brief version: run the golden
 * failing video, then the golden passing video as the second version, and
 * verify the deterministic Revision Delta: exactly 3 FIXED requirements
 * (placement / duration / forbidden claim), 0 regressions, same brief
 * version, both video SHA-256s bound. User deleted afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

const BASE = process.env.PROD_BASE ?? "https://pactra-flame.vercel.app";
const FAILING = path.resolve("scripts/demo-media/failing.mp4");
const PASSING = path.resolve("scripts/demo-media/passing.mp4");

const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
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
const email = `delta-${Date.now()}@pactra.test`;
const password = "DemoTest!123";
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY!;

async function shaOf(file: string): Promise<string> {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function uploadAndRun(H: Record<string, string>, idToken: string, campaignId: string, videoPath: string, tag: string) {
  const size = fs.statSync(videoPath).size;
  const initRes = await fetch(`${BASE}/api/campaigns/${campaignId}/video-assets/init`, {
    method: "POST", headers: H,
    body: JSON.stringify({ campaignId, originalFilename: path.basename(videoPath), contentType: "video/mp4", sizeBytes: size }),
  });
  const initJson = await initRes.json();
  check(`${tag}: video asset init`, initRes.ok);
  const videoAssetId = initJson.id;
  await getStorage().bucket().upload(videoPath, { destination: initJson.storagePath, contentType: "video/mp4" });
  const completeRes = await fetch(`${BASE}/api/campaigns/${campaignId}/video-assets/complete`, {
    method: "POST", headers: H,
    body: JSON.stringify({ videoAssetId, storagePath: initJson.storagePath }),
  });
  check(`${tag}: video asset complete`, completeRes.ok);

  const analyzeRes = await fetch(`${BASE}/api/campaigns/${campaignId}/analyze`, {
    method: "POST", headers: H,
    body: JSON.stringify({ campaignId, videoAssetId, descriptionSnapshot: DESCRIPTION }),
  });
  const analyzeJson = await analyzeRes.json();
  check(`${tag}: analysis run created`, analyzeRes.ok, analyzeJson.error ?? "");
  const runId = analyzeJson.analysisRunId;

  let run: any = null;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const rRes = await fetch(`${BASE}/api/analysis-runs/${runId}`, { headers: { Authorization: `Bearer ${idToken}` } });
    run = (await rRes.json()).run;
    if (["passed", "failed", "partial", "error", "cancelled"].includes(run?.status)) break;
  }
  check(`${tag}: run terminal`, ["passed", "failed", "partial", "error", "cancelled"].includes(run?.status), `status=${run?.status}`);
  const resultsRes = await fetch(`${BASE}/api/analysis-runs/${runId}/results`, { headers: { Authorization: `Bearer ${idToken}` } });
  const resultsJson = await resultsRes.json();
  const summary = resultsJson.run?.summary ?? {};
  console.log(`  ${tag}: status=${run?.status} provenance=${resultsJson.run?.transcriptProvenance ?? null} summary=${JSON.stringify(summary)}`);
  return { runId, run, summary, sha: await shaOf(videoPath) };
}

try {
  const signup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signupJson = await signup.json();
  check("firebase user created", signup.ok, signupJson.error?.message ?? "");
  const idToken = signupJson.idToken;
  const firebaseUid = signupJson.localId;
  const H = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };

  await fetch(`${BASE}/api/auth/session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  const sponsorRes = await fetch(`${BASE}/api/sponsors`, { method: "POST", headers: H, body: JSON.stringify({ name: "Acme Corp" }) });
  const sponsorId = (await sponsorRes.json()).id;
  check("sponsor created", sponsorRes.ok);

  const briefRes = await fetch(`${BASE}/api/briefs`, { method: "POST", headers: H, body: JSON.stringify({ sponsorId, name: "Acme Launch Brief" }) });
  const briefId = (await briefRes.json()).id;
  check("brief created", briefRes.ok);

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
  const versionsJson = await versionsRes.json();
  check("brief parsed into version", versionsRes.ok && !!versionsJson.version?.id);
  const versionId = versionsJson.version?.id;

  const verGetJson = await (await fetch(`${BASE}/api/brief-versions/${versionId}`, { headers: { Authorization: `Bearer ${idToken}` } })).json();
  const existingDraftIds = (verGetJson.requirements ?? [])
    .filter((r: { status?: string }) => r.status === "draft")
    .map((r: { id: string }) => r.id);
  const reqRes = await fetch(`${BASE}/api/brief-versions/${versionId}/requirements`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ deletedIds: existingDraftIds, requirements: REQUIREMENTS.map((r) => ({ ...r, verificationMode: "deterministic" })) }),
  });
  const reqCount = (await reqRes.json().catch(() => ({}))).requirements?.length ?? 0;
  check("7 requirements drafted", reqRes.ok && reqCount === 7, `count=${reqCount}`);

  const confirmRes = await fetch(`${BASE}/api/brief-versions/${versionId}/confirm`, { method: "POST", headers: H });
  check("brief version confirmed", confirmRes.ok);

  const campaignRes = await fetch(`${BASE}/api/campaigns`, {
    method: "POST", headers: H,
    body: JSON.stringify({ sponsorId, briefVersionId: versionId, name: "Acme launch — sponsored video", plannedTitle: "Acme" }),
  });
  const campaignId = (await campaignRes.json()).id;
  check("campaign created", campaignRes.ok);

  const first = await uploadAndRun(H, idToken, campaignId, FAILING, "failing");
  check("failing counts 4P/3F", first.summary.passed === 4 && first.summary.failed === 3, JSON.stringify(first.summary));
  const second = await uploadAndRun(H, idToken, campaignId, PASSING, "passing");
  check("passing counts 7P/0F", second.summary.passed === 7 && second.summary.failed === 0, JSON.stringify(second.summary));

  // --- the delta ---
  const deltaRes = await fetch(`${BASE}/api/analysis-runs/${second.runId}/revision-delta?compareTo=${first.runId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const deltaJson = await deltaRes.json();
  check("revision-delta endpoint ok", deltaRes.ok);
  console.log("  DEBUG delta keys:", Object.keys(deltaJson.delta ?? {}).join(","));
  console.log("  DEBUG oldRun:", JSON.stringify(deltaJson.delta?.oldRun));
  console.log("  DEBUG newRun:", JSON.stringify(deltaJson.delta?.newRun));
  const delta = deltaJson.delta;
  check("same brief version required+kept", delta?.briefVersionId === versionId, delta?.briefVersionId);
  check("old video sha bound", delta?.oldRun?.videoSha256 === first.sha, `${delta?.oldRun?.videoSha256?.slice(0, 12)}…`);
  check("new video sha bound", delta?.newRun?.videoSha256 === second.sha, `${delta?.newRun?.videoSha256?.slice(0, 12)}…`);
  check("fixed = 3 (placement, duration, forbidden)", delta?.fixed?.length === 3, `fixed=${JSON.stringify(delta?.fixed?.map((e: any) => e.requirementId))}`);
  check("regressions = 0", delta?.regressions?.length === 0);
  const fixedDescriptions = (delta?.fixed ?? []).map((e: any) => deltaJson.requirements[e.requirementId]?.description ?? "?");
  console.log("  FIXED:", fixedDescriptions.join(" | "));

  if (failures === 0) console.log("\nREVISION DELTA (delta-prod) OK");
  else console.log(`\nREVISION DELTA (delta-prod) FAILED (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  try {
    const u = await getAuth().getUserByEmail(email);
    await getAuth().deleteUser(u.uid);
    console.log("demo user deleted:", u.uid);
  } catch { /* already gone */ }
  console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
