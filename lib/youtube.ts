import { randomBytes } from "node:crypto";
import type { Db, ObjectId } from "mongodb";
import { getServerEnv } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { COLLECTIONS } from "@/lib/mongodb";
import type { YouTubeConnectionDoc, YouTubeVideoDoc } from "@/lib/types";
import { parseIsoDuration } from "@/lib/utils";

/**
 * SERVER-ONLY Google OAuth for YouTube (separate from Firebase Auth).
 *
 *   Firebase Auth  = who is using Pactra
 *   Google OAuth   = which YouTube account Pactra may access
 *
 * Initial scope is read-only; upload scope is added later via incremental
 * authorization only when the creator chooses "Upload approved video".
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export const YOUTUBE_READ_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
];

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

// --- OAuth ---------------------------------------------------------------

export function buildYouTubeAuthUrl(): { url: string; state: string } {
  const { googleClientId, googleRedirectUri } = getServerEnv();
  const state = randomBytes(32).toString("hex");
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: "code",
    scope: YOUTUBE_READ_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, state };
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { googleClientId, googleClientSecret, googleRedirectUri } = getServerEnv();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: googleRedirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { googleClientId, googleClientSecret } = getServerEnv();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function revokeGoogleToken(refreshToken: string): Promise<void> {
  await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
    { method: "POST" }
  );
}

export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo failed (${res.status})`);
  }
  return res.json();
}

/** Returns the stored encrypted refresh token, decrypted, for a user. */
export async function getDecryptedRefreshToken(
  db: Db,
  uid: string
): Promise<{ refreshToken: string; connection: YouTubeConnectionDoc } | null> {
  const connection = await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .findOne({ ownerFirebaseUid: uid });
  if (!connection) return null;
  return { refreshToken: decryptSecret(connection.encryptedRefreshToken), connection };
}

// --- YouTube Data API ------------------------------------------------------

async function youtubeGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>
): Promise<{ data: T; etag?: string | null }> {
  const query = new URLSearchParams(params);
  const res = await fetch(`${YOUTUBE_API_BASE}${path}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${path} failed (${res.status}): ${body}`);
  }
  const etag = res.headers.get("etag");
  return { data: await res.json(), etag };
}

interface ChannelsResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: Array<{ contentDetails?: { videoId?: string } }>;
}

interface VideosResponse {
  items?: Array<{
    id: string;
    etag?: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: Record<string, { url?: string }>;
      publishedAt?: string;
      channelId?: string;
    };
    contentDetails?: { duration?: string };
    status?: { privacyStatus?: string };
  }>;
}

async function fetchChannelData(accessToken: string) {
  const { data } = await youtubeGet<ChannelsResponse>(accessToken, "/channels", {
    part: "snippet,contentDetails",
    mine: "true",
  });
  const item = data.items?.[0];
  if (!item) return null;
  return {
    channelId: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

async function fetchUploadedVideoIds(
  accessToken: string,
  playlistId: string
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      part: "contentDetails",
      playlistId,
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;
    const { data } = await youtubeGet<PlaylistItemsResponse>(
      accessToken,
      "/playlistItems",
      params
    );
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function fetchVideos(
  accessToken: string,
  ids: string[]
): Promise<Array<YouTubeVideoDoc & { _id?: ObjectId }>> {
  const videos: Array<YouTubeVideoDoc & { _id?: ObjectId }> = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { data } = await youtubeGet<VideosResponse>(accessToken, "/videos", {
      part: "snippet,contentDetails,status",
      id: batch.join(","),
    });
    for (const item of data.items ?? []) {
      const privacy = item.status?.privacyStatus;
      videos.push({
        youtubeVideoId: item.id,
        channelId: item.snippet?.channelId ?? "",
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        thumbnailUrl: item.snippet?.thumbnails?.default?.url ?? null,
        durationSeconds: item.contentDetails?.duration
          ? parseIsoDuration(item.contentDetails.duration)
          : 0,
        privacyStatus:
          privacy === "private" || privacy === "unlisted" || privacy === "public"
            ? privacy
            : "public",
        publishedAt: item.snippet?.publishedAt
          ? new Date(item.snippet.publishedAt)
          : null,
        etag: item.etag ?? null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as YouTubeVideoDoc & { _id?: ObjectId });
    }
  }
  return videos;
}

/**
 * Full sync: channel → uploads playlist (paginated) → videos.list (batched).
 * Upserts on ownerFirebaseUid + youtubeVideoId so resyncs never duplicate.
 * Campaign assignments live on the campaign doc (assignedYoutubeVideoId) and
 * are therefore preserved untouched by resync.
 */
export async function syncChannelAndVideos(
  accessToken: string,
  uid: string,
  db: Db,
  connectionId: ObjectId
): Promise<{ channelTitle: string; videoCount: number }> {
  const channel = await fetchChannelData(accessToken);
  if (!channel) {
    throw new Error("No YouTube channel found for this account");
  }

  await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .updateOne(
      { ownerFirebaseUid: uid, channelId: channel.channelId },
      {
        $set: {
          channelTitle: channel.title,
          channelThumbnailUrl: channel.thumbnailUrl,
          uploadsPlaylistId: channel.uploadsPlaylistId,
          lastSyncedAt: new Date(),
          syncStatus: "syncing",
        },
      },
      { upsert: false }
    );

  const videoIds = await fetchUploadedVideoIds(accessToken, channel.uploadsPlaylistId);
  const videos = await fetchVideos(accessToken, videoIds);

  const videosCol = db.collection<YouTubeVideoDoc>(COLLECTIONS.youtubeVideos);
  for (const video of videos) {
    const { _id: _ignoredId, createdAt: _ignoredCreatedAt, ...set } = video;
    await videosCol.updateOne(
      { ownerFirebaseUid: uid, youtubeVideoId: video.youtubeVideoId },
      {
        $set: {
          ...set,
          ownerFirebaseUid: uid,
          youtubeConnectionId: connectionId,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .updateOne(
      { _id: connectionId },
      { $set: { syncStatus: "connected", lastErrorCode: null, updatedAt: new Date() } }
    );

  return { channelTitle: channel.title, videoCount: videos.length };
}

/** Creates/updates the connection after OAuth, handling missing refresh
 * tokens on reconnection by preserving the existing stored token. */
export async function storeOAuthConnection(
  db: Db,
  uid: string,
  input: {
    accessToken: string;
    refreshToken?: string;
    scopes: string[];
  }
): Promise<{ connectionId: ObjectId; isNewToken: boolean }> {
  const info = await getUserInfo(input.accessToken);
  const existing = await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .findOne({ ownerFirebaseUid: uid });

  let encrypted: string;
  let tokenVersion: number;
  if (input.refreshToken) {
    encrypted = encryptSecret(input.refreshToken);
    tokenVersion = (existing?.tokenVersion ?? 0) + 1;
  } else if (existing?.encryptedRefreshToken) {
    // Google did not return a new refresh token during reconnection —
    // preserve the existing valid one.
    encrypted = existing.encryptedRefreshToken;
    tokenVersion = existing.tokenVersion;
  } else {
    throw new Error("No refresh token received and none stored");
  }

  const now = new Date();
  const connection: YouTubeConnectionDoc = {
    ownerFirebaseUid: uid,
    googleAccountSubject: info.id,
    channelId: existing?.channelId ?? "",
    channelTitle: existing?.channelTitle ?? "",
    channelThumbnailUrl: existing?.channelThumbnailUrl ?? null,
    uploadsPlaylistId: existing?.uploadsPlaylistId ?? "",
    encryptedRefreshToken: encrypted,
    grantedScopes: input.scopes,
    tokenVersion,
    connectedAt: existing?.connectedAt ?? now,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    syncStatus: existing?.syncStatus ?? "connected",
    lastErrorCode: existing?.lastErrorCode ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const result = await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .updateOne(
      { ownerFirebaseUid: uid },
      { $set: connection, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

  const saved = await db
    .collection<YouTubeConnectionDoc>(COLLECTIONS.youtubeConnections)
    .findOne({ ownerFirebaseUid: uid });

  return {
    connectionId: (saved?._id ?? result.upsertedId) as ObjectId,
    isNewToken: !!input.refreshToken,
  };
}
