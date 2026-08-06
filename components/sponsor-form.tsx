"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SponsorForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sponsors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, website_url: website }),
    });
    setBusy(false);
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error ?? "Failed to create sponsor");
      return;
    }
    if (redirectTo) {
      router.push(redirectTo.replace("[id]", payload.id));
    } else {
      router.push("/sponsors");
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <label className="mb-1 block text-xs text-zinc-500">Sponsor name</label>
        <Input
          placeholder="Acme Corp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="min-w-48 flex-1">
        <label className="mb-1 block text-xs text-zinc-500">Website (optional)</label>
        <Input
          placeholder="https://acme.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create sponsor"}
      </Button>
    </form>
  );
}
