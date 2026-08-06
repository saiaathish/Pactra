import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { clientEnv } from "@/lib/env";
import { requireApiUser } from "@/lib/firebase/session";
import {
  exchangeCodeForTokens,
  storeOAuthConnection,
  syncChannelAndVideos,
} from "@/lib/youtube";

function redirectTo(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, clientEnv.appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url.toString());
}

/**
 * OAuth callback: verify state, require an active session, exchange the code,
 * store the refresh token encrypted, and sync channel + videos.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) return redirectTo("/youtube", { error: oauthError });

  const code = params.get("code");
  const state = params.get("state");
  const cookieState = request.cookies.get("pactra_youtube_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectTo("/youtube", { error: "state_mismatch" });
  }

  // The connection is bound to the verified session user — this prevents one
  // Firebase user from attaching another user's YouTube account.
  const uid = await requireApiUser(request);
  if (!uid) return redirectTo("/login", { next: "/youtube" });

  try {
    const tokens = await exchangeCodeForTokens(code);
    const { connectionId } = await storeOAuthConnection(
      await getDb(),
      uid,
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token, // may be absent on reconnection
        scopes: tokens.scope?.split(" ") ?? [],
      }
    );
    const { channelTitle, videoCount } = await syncChannelAndVideos(
      tokens.access_token,
      uid,
      await getDb(),
      connectionId
    );
    return redirectTo("/youtube", { connected: "1", channel: channelTitle, videos: String(videoCount) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return redirectTo("/youtube", { error: "sync_failed", detail: message.slice(0, 200) });
  }
}
