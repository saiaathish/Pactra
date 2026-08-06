/**
 * Environment access helpers.
 *
 * `clientEnv` — values safe to expose to the browser (NEXT_PUBLIC_*).
 * `getServerEnv()` — server-only values; throws a descriptive error when a
 * required variable is missing. Never call from client components.
 */

export const clientEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  },
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check .env.local`
    );
  }
  return value;
}

export function getServerEnv() {
  return {
    googleClientId: required("GOOGLE_CLIENT_ID"),
    googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? `${clientEnv.appUrl}/api/youtube/callback`,
    engineVersion: process.env.ANALYSIS_ENGINE_VERSION ?? "0.2.0",
  };
}
