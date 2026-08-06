import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

/**
 * SERVER-ONLY Firebase Admin SDK — initialized exactly once.
 *
 * Credential sources, in order:
 *  1. FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL /
 *     FIREBASE_ADMIN_PRIVATE_KEY (Vercel, local). The private key is commonly
 *     stored with escaped newlines ("\n") — handled below.
 *  2. Application Default Credentials (Cloud Run service account).
 *
 * Never import this module from client code. Never log credentials.
 */
function buildConfig() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
    };
  }
  if (projectId) {
    return { projectId }; // ADC (e.g. Cloud Run)
  }
  throw new Error(
    "FIREBASE_ADMIN_* env vars are required (or Application Default Credentials on Cloud Run)"
  );
}

export function getAdminApp(): App {
  if (getApps().length === 0) {
    initializeApp(buildConfig());
  }
  return getApps()[0];
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}

export function getStorageBucket() {
  const name = process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  return name ? getAdminStorage().bucket(name) : getAdminStorage().bucket();
}
