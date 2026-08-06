"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  hasConnection: boolean;
  hasChannel: boolean;
  channelTitle?: string | null;
}

/**
 * Connect / disconnect the YouTube account. Connecting redirects to Google's
 * OAuth (read-only scope, offline access); the callback syncs channel +
 * videos. Reconnecting upserts — it never duplicates videos.
 */
export function YouTubeConnectButton({ hasConnection, hasChannel, channelTitle }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDisconnect() {
    setBusy(true);
    await fetch("/api/integrations/youtube/disconnect", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (!hasConnection) {
    return (
      <a href="/api/integrations/youtube/auth">
        <Button>Connect YouTube</Button>
      </a>
    );
  }

  if (!hasChannel) {
    return (
      <p className="text-sm text-zinc-400">
        Connected — syncing channel&hellip; refresh shortly.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        {channelTitle ?? "YouTube connected"}
      </span>
      <a href="/api/integrations/youtube/auth">
        <Button variant="secondary">Re-sync</Button>
      </a>
      <Button variant="danger" onClick={handleDisconnect} disabled={busy}>
        Disconnect
      </Button>
    </div>
  );
}
