"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Sets display name (completes onboarding), then heads to YouTube connect. */
export function OnboardingForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName || "Creator" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Failed to save profile");
      return;
    }
    router.push("/youtube?first=1");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Input
        placeholder="Display name (optional)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : "Continue to YouTube"}
      </Button>
    </form>
  );
}
