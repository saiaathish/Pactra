import { NextResponse } from "next/server";
import { requireVerifiedUid, isErrorResponse } from "@/lib/api-helpers";
import { buildYouTubeAuthUrl } from "@/lib/youtube";

/**
 * Starts Google OAuth for YouTube. The callback validates `state` and binds
 * the connection to the session user (never to a client-supplied uid).
 */
export async function GET(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const { url, state } = buildYouTubeAuthUrl();
  const res = NextResponse.redirect(url);
  res.cookies.set("pactra_youtube_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
