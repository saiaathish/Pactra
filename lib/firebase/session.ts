import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/firebase/admin";

export const SESSION_COOKIE = "pactra_session";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
}

/** Creates the httpOnly session cookie from a verified Firebase ID token. */
export async function createSessionCookie(idToken: string): Promise<string> {
  return getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_COOKIE_MAX_AGE * 1000,
  });
}

/** Server components: returns the verified session user or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      displayName: decoded.name,
      photoURL: decoded.picture,
    };
  } catch {
    return null;
  }
}

/** Server components: redirects to /login when unauthenticated. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/**
 * THE shared authentication helper for every protected API route.
 *
 * Accepts either:
 *   1. the `pactra_session` cookie (browser calls), or
 *   2. `Authorization: Bearer <firebase-id-token>` (programmatic/worker).
 *
 * Returns the verified `firebaseUid`, or null when missing/invalid/expired.
 * Callers must reject with 401 on null. Never trust a uid from the body,
 * query string, or client-side claims.
 */
export async function requireApiUser(request: Request): Promise<string | null> {
  const adminAuth = getAdminAuth();

  const cookieToken = parseCookieHeader(request.headers.get("cookie"), SESSION_COOKIE);
  if (cookieToken) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookieToken, true);
      return decoded.uid;
    } catch {
      // Invalid/expired/revoked session — fall through to bearer check.
    }
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authorization.slice(7), true);
      return decoded.uid;
    } catch {
      return null;
    }
  }

  return null;
}
