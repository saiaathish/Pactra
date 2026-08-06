"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import { getFirebaseApp } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  sponsorId: string;
}

/**
 * Full brief pipeline: create the brief → resumable upload to Firebase
 * Storage (never proxied through Vercel) → worker extracts candidate
 * requirements → route to the review screen.
 */
export function BriefUploader({ sponsorId }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "paused" | "extracting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const taskRef = useRef<UploadTask | null>(null);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);

    const uid = getAuth(getFirebaseApp()).currentUser?.uid;
    if (!uid) {
      setError("Not signed in");
      return;
    }

    // 1. Create the brief shell.
    const briefRes = await fetch("/api/briefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsorId, name: name || file.name }),
    });
    const brief = await briefRes.json();
    if (!briefRes.ok) {
      setStatus("error");
      setError(brief.error ?? "Failed to create brief");
      return;
    }

    // 2. Resumable upload to the user-owned path.
    const versionId = crypto.randomUUID();
    const storagePath = `users/${uid}/sponsors/${sponsorId}/briefs/${versionId}/${file.name}`;
    const task = uploadBytesResumable(
      ref(getStorage(getFirebaseApp()), storagePath),
      file,
      { contentType: file.type || "application/pdf" }
    );
    taskRef.current = task;
    setStatus("uploading");

    const uploaded = await new Promise<boolean>((resolve) => {
      task.on(
        "state_changed",
        (snapshot) => {
          setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        },
        (err) => {
          setStatus("error");
          setError(err.message);
          resolve(false);
        },
        () => resolve(true)
      );
    });
    if (!uploaded) return;

    // 3. Extract requirements via the worker (creates the version).
    setStatus("extracting");
    const versionRes = await fetch(`/api/briefs/${brief.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "pdf", storagePath }),
    });
    const versionPayload = await versionRes.json();
    if (!versionRes.ok) {
      setStatus("error");
      setError(versionPayload.error ?? "Extraction failed");
      return;
    }

    router.push(`/briefs/${versionPayload.version.id}`);
    router.refresh();
  }

  function handlePause() {
    taskRef.current?.pause();
    setStatus("paused");
  }

  function handleResume() {
    taskRef.current?.resume();
    setStatus("uploading");
  }

  return (
    <form onSubmit={handleStart} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Brief title</label>
        <Input
          placeholder="Acme launch — sponsored video"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">PDF / DOCX / TXT brief (max 20 MB)</label>
        <input
          type="file"
          accept="application/pdf,text/plain,.docx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
            setProgress(0);
          }}
          className="text-sm text-zinc-400 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-200"
        />
      </div>

      {(status === "uploading" || status === "paused") && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-zinc-500">{progress}%</p>
          <div className="flex gap-2">
            {status === "uploading" ? (
              <Button type="button" variant="secondary" onClick={handlePause}>Pause</Button>
            ) : (
              <Button type="button" variant="secondary" onClick={handleResume}>Resume</Button>
            )}
          </div>
        </div>
      )}

      {status === "extracting" && <p className="text-sm text-amber-400">Extracting requirements…</p>}
      {status === "error" && <p className="text-sm text-red-400">{error}</p>}

      {status === "idle" && (
        <Button type="submit" disabled={!file}>
          Upload & extract
        </Button>
      )}
    </form>
  );
}
