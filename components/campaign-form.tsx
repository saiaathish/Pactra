"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SponsorOption {
  id: string;
  name: string;
  briefs: Array<{ id: string; versionNumber: number; briefName: string }>;
}

interface Props {
  sponsors: SponsorOption[];
  youtubeVideos: Array<{ youtubeVideoId: string; title: string }>;
  initialBriefVersionId?: string;
}

export function CampaignForm({ sponsors, youtubeVideos, initialBriefVersionId }: Props) {
  const router = useRouter();
  const [sponsorId, setSponsorId] = useState(sponsors[0]?.id ?? "");
  const [briefVersionId, setBriefVersionId] = useState(initialBriefVersionId ?? "");
  const [name, setName] = useState("");
  const [plannedTitle, setPlannedTitle] = useState("");
  const [assignedYoutubeVideoId, setAssignedYoutubeVideoId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSponsor = sponsors.find((s) => s.id === sponsorId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sponsorId,
        briefVersionId,
        name,
        plannedTitle: plannedTitle || null,
        assignedYoutubeVideoId: assignedYoutubeVideoId || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    });
    setBusy(false);
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? "Failed to create campaign");
      return;
    }
    router.push(`/campaigns/${payload.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Campaign name</label>
          <Input placeholder="Acme launch video" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Sponsor</label>
          <select
            value={sponsorId}
            onChange={(e) => {
              setSponsorId(e.target.value);
              setBriefVersionId("");
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            required
          >
            <option value="">Select sponsor…</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          Confirmed brief version (requirements to test against)
        </label>
        <select
          value={briefVersionId}
          onChange={(e) => setBriefVersionId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          required
        >
          <option value="">Select brief version…</option>
          {(currentSponsor?.briefs ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.briefName} v{b.versionNumber}
            </option>
          ))}
        </select>
        {!currentSponsor?.briefs.length && (
          <p className="mt-1 text-xs text-zinc-600">
            No confirmed brief versions for this sponsor yet.
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Planned video title (optional)</label>
          <Input value={plannedTitle} onChange={(e) => setPlannedTitle(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Due date (optional)</label>
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">
          Assign existing YouTube video (sponsor added after publication)
        </label>
        <select
          value={assignedYoutubeVideoId}
          onChange={(e) => setAssignedYoutubeVideoId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="">No existing video (planned rough cut)</option>
          {youtubeVideos.map((v) => (
            <option key={v.youtubeVideoId} value={v.youtubeVideoId}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create campaign"}
      </Button>
    </form>
  );
}
