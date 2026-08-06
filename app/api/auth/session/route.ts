import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE, createSessionCookie } from "@/lib/firebase/session";
import { sessionCreateSchema } from "@/lib/validation";
import { apiError } from "@/lib/api-helpers";

/**
 * Creates the httpOnly session cookie from a Firebase ID token produced by
 * the client SDK after sign-in. The ID token itself is never stored.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = sessionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "idToken is required");
  }

  let cookie: string;
  try {
    cookie = await createSessionCookie(parsed.data.idToken);
  } catch {
    return apiError(401, "invalid token");
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  // Also revoke the underlying session server-side so a stolen cookie dies.
  const response = NextResponse.json({ ok: true });
  const cookie = response.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie, false);
      await getAdminAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      // Already invalid — clearing the cookie is enough.
    }
  }
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
