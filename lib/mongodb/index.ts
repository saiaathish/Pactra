import { MongoClient, type Db } from "mongodb";

/**
 * Singleton MongoDB connection for Next.js serverless execution.
 * The client is cached on globalThis so it survives hot reloads and is
 * reused across serverless invocations (never created per-request).
 */

const globalForMongo = globalThis as unknown as { _pactraMongo?: MongoClient };

export async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }
  if (!globalForMongo._pactraMongo) {
    globalForMongo._pactraMongo = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    });
  }
  await globalForMongo._pactraMongo.connect();
  return globalForMongo._pactraMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB_NAME || "pactra");
}

export const COLLECTIONS = {
  users: "users",
  youtubeConnections: "youtubeConnections",
  youtubeVideos: "youtubeVideos",
  sponsors: "sponsors",
  sponsorBriefs: "sponsorBriefs",
  briefVersions: "briefVersions",
  requirements: "requirements",
  campaigns: "campaigns",
  videoAssets: "videoAssets",
  analysisRuns: "analysisRuns",
  testResults: "testResults",
  evidenceItems: "evidenceItems",
  approvalManifests: "approvalManifests",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
