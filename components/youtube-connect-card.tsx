"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  hasConnection?: boolean;
  syncStatus?: string;
  channelTitle?: string | null;
  lastErrorCode?: string | null;
}

/**
 * Connect / re-sync / disconnect YouTube. Connect redirects to Google OAuth
 * (read-only, offline); the callback syncs channel + videos. Re-sync never
 * duplicates videos (upsert on ownerFirebaseUid + youtubeVideoId).
 */
export function YouTubeConnectCard({ hasConnection, syncStatus, channelTitle, lastErrorCode }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSync() {
    setBusy(true);
    await fetch("/api/youtube/sync", { method: "POST" }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  async function handleDisconnect() {
    setBusy(true);
    await fetch("/api/youtube/disconnect", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (!hasConnection) {
    return (
      <a href="/api/youtube/connect">
        <Button>Connect YouTube</Button>
      </a>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
        <span
          className={
            "inline-block h-2 w-2 rounded-full " +
            (syncStatus === "error" ? "bg-red-500" : syncStatus === "syncing" ? "bg-amber-400" : "bg-emerald-500")
          }
        />
        {channelTitle ?? "YouTube connected"}
        {syncStatus === "error" && lastErrorCode === "invalid_grant" && (
          <span className="text-xs text-red-400">access revoked — reconnect</span>
        )}
      </span>
      <Button variant="secondary" onClick={handleSync} disabled={busy || syncStatus === "syncing"}>
        {syncStatus === "syncing" ? "Syncing…" : "Re-sync"}
      </Button>
      <Button variant="danger" onClick={handleDisconnect} disabled={busy}>
        Disconnect
      </Button>
    </div>
  );
}
