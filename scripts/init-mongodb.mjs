#!/usr/bin/env node
/**
 * Pactra MongoDB Atlas index initialization.
 *
 * Run once against the Atlas cluster (committed so indexes are never created
 * by hand in the dashboard):
 *
 *   MONGODB_URI="mongodb+srv://..." npm run db:init-indexes
 *
 * Safe to re-run: createIndex is idempotent (same spec → no-op).
 */
import { MongoClient } from "mongodb";
import { readFileSync, existsSync } from "node:fs";

// Load KEY=VALUE pairs from .env.local if present (native, no deps).
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "pactra";
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const INDEXES = {
  users: [{ key: { firebaseUid: 1 }, unique: true }],

  youtubeConnections: [
    { key: { ownerFirebaseUid: 1, channelId: 1 }, unique: true },
    { key: { ownerFirebaseUid: 1, syncStatus: 1 } },
  ],

  youtubeVideos: [
    { key: { ownerFirebaseUid: 1, youtubeVideoId: 1 }, unique: true },
    { key: { ownerFirebaseUid: 1, publishedAt: -1 } },
  ],

  sponsors: [{ key: { ownerFirebaseUid: 1, name: 1 } }],

  sponsorBriefs: [
    { key: { ownerFirebaseUid: 1, sponsorId: 1 } },
    { key: { ownerFirebaseUid: 1, createdAt: -1 } },
  ],

  briefVersions: [
    { key: { ownerFirebaseUid: 1, sponsorBriefId: 1, versionNumber: 1 }, unique: true },
    { key: { ownerFirebaseUid: 1, sponsorBriefId: 1, status: 1 } },
  ],

  requirements: [{ key: { ownerFirebaseUid: 1, briefVersionId: 1 } }],

  campaigns: [
    { key: { ownerFirebaseUid: 1, status: 1, updatedAt: -1 } },
    { key: { ownerFirebaseUid: 1, sponsorId: 1 } },
  ],

  videoAssets: [
    { key: { ownerFirebaseUid: 1, campaignId: 1, versionNumber: 1 }, unique: true },
    { key: { ownerFirebaseUid: 1, campaignId: 1, createdAt: -1 } },
  ],

  analysisRuns: [
    { key: { ownerFirebaseUid: 1, campaignId: 1, createdAt: -1 } },
    { key: { status: 1, createdAt: 1 } },
    { key: { ownerFirebaseUid: 1, status: 1 } },
  ],

  testResults: [{ key: { ownerFirebaseUid: 1, analysisRunId: 1 } }],

  evidenceItems: [{ key: { ownerFirebaseUid: 1, analysisRunId: 1 } }],

  approvalManifests: [
    { key: { ownerFirebaseUid: 1, campaignId: 1, createdAt: -1 } },
    { key: { ownerFirebaseUid: 1, analysisRunId: 1 } },
  ],
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

try {
  await client.connect();
  const db = client.db(dbName);
  let total = 0;

  for (const [collection, specs] of Object.entries(INDEXES)) {
    for (const spec of specs) {
      const name = await db.collection(collection).createIndex(spec.key, {
        unique: spec.unique ?? false,
        name: Object.entries(spec.key)
          .map(([k, v]) => `${k}_${v === -1 ? "desc" : "asc"}`)
          .join("_"),
      });
      console.log(`  ${collection}.${name}${spec.unique ? " (unique)" : ""}`);
      total++;
    }
  }
  console.log(`Done — ${total} indexes ensured in "${dbName}".`);
} catch (err) {
  console.error("Index initialization failed:", err.message);
  process.exit(1);
} finally {
  await client.close();
}
