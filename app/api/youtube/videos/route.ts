import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { requireVerifiedUid, apiError, isErrorResponse } from "@/lib/api-helpers";
import { youtubeVideosQuerySchema } from "@/lib/validation";
import type { YouTubeVideoDoc } from "@/lib/types";

/** Paginated synced videos (publishedAt desc). */
export async function GET(request: Request) {
  const uid = await requireVerifiedUid(request);
  if (isErrorResponse(uid)) return uid;

  const url = new URL(request.url);
  const parsed = youtubeVideosQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? "50",
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return apiError(400, "invalid query");

  const { limit, cursor } = parsed.data;
  const db = await getDb();
  const col = db.collection<YouTubeVideoDoc>(COLLECTIONS.youtubeVideos);

  const filter: Record<string, unknown> = { ownerFirebaseUid: uid };
  const skip = cursor ? parseInt(cursor, 10) || 0 : 0;

  const total = await col.countDocuments(filter);
  const videos = await col
    .find(filter)
    .sort({ publishedAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const nextCursor = skip + videos.length < total ? String(skip + videos.length) : null;

  return NextResponse.json({
    videos: videos.map(({ _id, ownerFirebaseUid, ...rest }) => ({
      id: _id?.toString(),
      ...rest,
    })),
    nextCursor,
    total,
  });
}
