"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AssetOption {
  id: string;
  versionNumber: number;
  uploadStatus: string;
}

interface Props {
  campaignId: string;
  assets: AssetOption[];
  defaultDescription: string;
}

/** Pick a ready video version + paste the description → run the preflight. */
export function AnalysisPanel({ campaignId, assets, defaultDescription }: Props) {
  const router = useRouter();
  const [assetId, setAssetId] = useState("");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyAssets = assets.filter((a) => a.uploadStatus === "ready" || a.uploadStatus === "uploaded");

  async function handleRun() {
    if (!assetId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, videoAssetId: assetId, descriptionSnapshot: description }),
    });
    setBusy(false);
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? "Failed to start analysis");
      return;
    }
    router.push(`/analysis/${payload.analysisRunId}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Video version to test</label>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="">Select video version…</option>
          {readyAssets.map((a) => (
            <option key={a.id} value={a.id}>
              v{a.versionNumber} ({a.uploadStatus})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          Intended YouTube description (checked for URLs, codes, disclosure)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
          placeholder="Paste the description you plan to publish with…"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button onClick={handleRun} disabled={!assetId || busy || readyAssets.length === 0}>
        {busy ? "Starting…" : "Run preflight"}
      </Button>
    </div>
  );
}
