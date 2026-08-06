/**
 * Production smoke test: create a throwaway Firebase user, exercise the
 * new/auth-gated prod endpoints with a real ID token, then delete the user.
 *
 * Usage: npx tsx scripts/smoke-prod.mts
 */

import fs from "node:fs";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const BASE = process.env.PROD_BASE ?? "https://pactra-flame.vercel.app";

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

const email = `smoke-${Date.now()}@pactra.test`;
const password = "SmokeTest!123";
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY!;
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} ${detail}`);
  if (!ok) failures++;
}

try {
  // --- 1. create the user via the Firebase REST signup (Identity Toolkit) ---
  const signup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const signupJson = await signup.json();
  check("signup ok", signup.ok, signupJson.error?.message ?? "");
  const idToken = signupJson.idToken;
  const firebaseUid = signupJson.localId;
  const authHeaders = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };

  // --- 2. session bootstrap + cookie flow (server side) ---
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  check("session cookie created", sessionRes.ok, `status ${sessionRes.status}`);
  const cookie = sessionRes.headers.get("set-cookie")?.split(";")[0] ?? "";

  // --- 3. create a sponsor + brief ---
  const sponsorRes = await fetch(`${BASE}/api/sponsors`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "Smoke Sponsor" }),
  });
  const sponsorJson = await sponsorRes.json();
  check("sponsor created", sponsorRes.ok, sponsorJson.error ?? "");
  const sponsorId = sponsorJson.id;

  const briefRes = await fetch(`${BASE}/api/briefs`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ sponsorId, name: "Smoke Brief" }),
  });
  const briefJson = await briefRes.json();
  check("brief created", briefRes.ok, briefJson.error ?? "");
  const briefId = briefJson.id;

  // --- 4. upload a real PDF to Firebase Storage (admin SDK = backend path) ---
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
  const { getStorage } = await import("firebase-admin/storage");
  const pdf = Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 90 >> stream
BT /F1 24 Tf 72 720 Td (Sponsored video brief) Tj ET
BT /F1 18 Tf 72 680 Td (Use code SAI20 for a free trial) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R /Size 6 >>
%%EOF`);
  const storagePath = `users/${firebaseUid}/sponsors/${sponsorId}/briefs/smoke/brief.pdf`;
  await getStorage().bucket().file(storagePath).save(pdf, { contentType: "application/pdf" });

  // --- 5. versions route: parse the brief (no AI key → 0 candidates) ---
  const versionsRes = await fetch(`${BASE}/api/briefs/${briefId}/versions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ sourceType: "pdf", storagePath }),
  });
  const versionsJson = await versionsRes.json();
  check(
    "brief parsed into review_required version",
    versionsRes.ok && versionsJson.version?.status === "review_required",
    JSON.stringify(versionsJson).slice(0, 200)
  );
  const versionId = versionsJson.version?.id;

  // --- 6. add a requirement draft + confirm the version ---
  const reqRes = await fetch(
    `${BASE}/api/brief-versions/${versionId}/requirements`,
    {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        requirements: [
          {
            type: "required_phrase",
            description: "must say free trial",
            parameters: { phrase: "free trial" },
            verificationMode: "deterministic",
          },
        ],
      }),
    }
  );
  check("requirement draft added", reqRes.ok, (await reqRes.text()).slice(0, 150));

  const confirmRes = await fetch(`${BASE}/api/brief-versions/${versionId}/confirm`, {
    method: "POST",
    headers: authHeaders,
  });
  check("brief version confirmed", confirmRes.ok);

  // --- 7. campaign create + video asset init (auth-gated shapes) ---
  const campaignRes = await fetch(`${BASE}/api/campaigns`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sponsorId,
      briefVersionId: versionId,
      name: "Smoke Campaign",
      plannedTitle: "Acme",
    }),
  });
  const campaignJson = await campaignRes.json();
  check("campaign created", campaignRes.ok, campaignJson.error ?? "");
  const campaignId = campaignJson.id;

  const initRes = await fetch(`${BASE}/api/campaigns/${campaignId}/video-assets/init`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      campaignId,
      originalFilename: "smoke.mp4",
      contentType: "video/mp4",
      sizeBytes: 1000,
    }),
  });
  check("video asset init", initRes.ok, (await initRes.text()).slice(0, 150));

  // --- 8. youtube connect redirects to Google (auth works end-to-end) ---
  const connectRes = await fetch(`${BASE}/api/youtube/connect`, {
    headers: { Authorization: `Bearer ${idToken}` },
    redirect: "manual",
  });
  check(
    "youtube connect → 3xx to Google OAuth",
    (connectRes.status === 302 || connectRes.status === 307) &&
      (connectRes.headers.get("location") ?? "").includes("accounts.google.com"),
    `status ${connectRes.status}`
  );

  // --- 9. cookie-authenticated call (session path) ---
  const cookieRes = await fetch(`${BASE}/api/sponsors`, { headers: { cookie } });
  check("cookie session works", cookieRes.ok);

  console.log(failures === 0 ? "\nPROD SMOKE TEST PASSED" : `\nPROD SMOKE TEST FAILED (${failures})`);

  // --- cleanup: delete user (cascades to nothing in Mongo beyond bootstrap) ---
  if (!getApps().length) initializeApp({ credential: cert({}) });
  await getAuth().deleteUser(firebaseUid);
  console.log("test user deleted:", firebaseUid);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (err) {
  console.error("SMOKE TEST ERROR:", err);
  process.exitCode = 1;
}
