"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from "firebase/storage";
import { getFirebaseApp } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

const ALLOWED = ["video/mp4", "video/quicktime", "video/webm"];
/** Demo budget: pipeline fails fast past this (server-side guard too). */
const MAX_DURATION_S = 300;

/** Reads a local video file's duration via a temporary media element. */
function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the video file"));
    };
    video.src = url;
  });
}

/**
 * Rough-cut upload: init a videoAsset row → resumable upload to the user-owned
 * Firebase Storage path (never through Vercel) → complete (backend verifies
 * trusted metadata). Each upload is a NEW version — previous tested videos
 * are never overwritten.
 */
export function VideoUploader({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "initializing" | "uploading" | "paused" | "finalizing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const taskRef = useRef<UploadTask | null>(null);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress(0);
    setStatus("initializing");

    if (!ALLOWED.includes(file.type)) {
      setStatus("error");
      setError("Unsupported type — use MP4, MOV, or WebM");
      return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setStatus("error");
      setError("File exceeds 2 GB limit");
      return;
    }

    // Duration is checked BEFORE upload so a too-long rough cut is rejected
    // immediately (the pipeline also enforces the same limit server-side).
    let duration = 0;
    try {
      duration = await probeVideoDuration(file);
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
      return;
    }
    if (duration > MAX_DURATION_S) {
      setStatus("error");
      setError(
        `Video is ${Math.round(duration)}s — the maximum demo video length is ${MAX_DURATION_S / 60} minutes`
      );
      return;
    }

    // 1. Init row → we get the storage path from the server.
    const initRes = await fetch(`/api/campaigns/${campaignId}/video-assets/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        originalFilename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    });
    const init = await initRes.json();
    if (!initRes.ok) {
      setStatus("error");
      setError(init.error ?? "Failed to initialize upload");
      return;
    }

    // 2. Resumable upload.
    const task = uploadBytesResumable(
      ref(getStorage(getFirebaseApp()), init.storagePath),
      file,
      { contentType: file.type }
    );
    taskRef.current = task;
    setStatus("uploading");

    await new Promise<void>((resolve) => {
      task.on(
        "state_changed",
        (snapshot) => {
          setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        },
        (err) => {
          setStatus("error");
          setError(err.message);
          resolve();
        },
        () => resolve()
      );
    });
    if (status === "error") return;

    // 3. Complete — backend verifies trusted storage metadata.
    setStatus("finalizing");
    const completeRes = await fetch(`/api/campaigns/${campaignId}/video-assets/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoAssetId: init.id, storagePath: init.storagePath }),
    });
    const complete = await completeRes.json();
    if (!completeRes.ok) {
      setStatus("error");
      setError(complete.error ?? "Failed to finalize upload");
      return;
    }

    setStatus("idle");
    setFile(null);
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
      <div className="flex gap-2">
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
            setProgress(0);
          }}
          className="min-w-0 flex-1 text-sm text-zinc-400 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-200"
        />
        {status === "idle" && (
          <Button type="submit" disabled={!file}>
            Upload new version
          </Button>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Maximum demo video length: <span className="text-zinc-300">5 minutes</span> · Supported
        formats: <span className="text-zinc-300">MP4, MOV, WebM</span> · Length is checked before
        upload.
      </p>

      {(status === "initializing" || status === "finalizing") && (
        <p className="text-sm text-zinc-500">
          {status === "initializing" ? "Initializing…" : "Verifying upload…"}
        </p>
      )}

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

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
