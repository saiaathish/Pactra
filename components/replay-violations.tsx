"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, SkipForward, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Replay Violations — plays ONLY the failing moments of an analysis run back
 * to back, with the requirement, finding, and transcript evidence overlaid,
 * so a judge can grasp every failure in well under a minute.
 *
 * Evidence URL resolution reuses the EXISTING mechanism: the results API
 * (`/api/analysis-runs/[id]/results`) attaches short-lived `signedUrl`s to
 * every evidence item with a storagePath, so `video_clip` evidence already
 * carries a playable URL. Moments without a clip fall back to seeking the
 * main campaign video, whose signed URL is resolved server-side (Admin SDK
 * `getSignedUrl`, same as the results route / report page) and passed in as
 * `videoUrl`.
 */

interface ReplayRequirement {
  description: string | null;
  type: string | null;
}

interface ReplayResult {
  id: string;
  status: string;
  explanation: string;
  observedValue: Record<string, unknown> | null;
  requirement: ReplayRequirement | null;
}

interface ReplayEvidence {
  id: string;
  testResultId?: string | null;
  type: string;
  startSeconds: number | null;
  endSeconds: number | null;
  text: string | null;
  signedUrl: string | null;
}

interface ReplayMoment {
  result: ReplayResult;
  evidence: ReplayEvidence;
  /** "clip" plays an extracted segment file; "seek" seeks the main video. */
  kind: "clip" | "seek";
  src: string | null;
  start: number;
  /** Evidence span length in seconds (may be null when only a start is known). */
  duration: number | null;
}

/** Fallback play length when a moment has no end time. */
const DEFAULT_SEEK_SECONDS = 10;

function spanDuration(ev: ReplayEvidence): number | null {
  if (ev.startSeconds == null || ev.endSeconds == null) return null;
  const d = ev.endSeconds - ev.startSeconds;
  return d > 0 ? d : null;
}

/** Compact human-readable rendering of a test's observedValue. */
function describeObserved(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(value)) {
    if (key === "found" || val == null) continue; // "found: false" is implied by a failure
    if (typeof val === "string") parts.push(`${key.replace(/_/g, " ")}: ${val}`);
    else if (typeof val === "number" || typeof val === "boolean") parts.push(`${key.replace(/_/g, " ")}: ${val}`);
    else if (Array.isArray(val)) parts.push(`${key.replace(/_/g, " ")}: ${val.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function ReplayViolations({
  testResults,
  evidence,
  videoUrl,
}: {
  testResults: ReplayResult[];
  evidence: ReplayEvidence[];
  videoUrl: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);
  const [mounted, setMounted] = useState(false); // video element created after first start
  const [skipNote, setSkipNote] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const indexRef = useRef(0);

  /**
   * One moment per failed test, sorted by start time: prefer a playable clip
   * (extracted segment with a signed URL); otherwise the earliest timestamped
   * evidence (usually a transcript span) to seek in the main video. Evidence
   * without timestamps is skipped.
   */
  const moments = useMemo<ReplayMoment[]>(() => {
    const failed = testResults.filter((r) => r.status === "fail");
    if (failed.length === 0) return [];

    const out: ReplayMoment[] = [];
    for (const result of failed) {
      const evs = evidence.filter((ev) => ev.testResultId === result.id);
      const clip = evs.find(
        (ev) =>
          (ev.type === "video_clip" || ev.type === "audio_clip") &&
          ev.signedUrl &&
          ev.startSeconds != null
      );
      if (clip) {
        out.push({
          result,
          evidence: clip,
          kind: "clip",
          src: clip.signedUrl,
          start: clip.startSeconds ?? 0,
          duration: spanDuration(clip),
        });
        continue;
      }
      const seek = evs.find((ev) => ev.startSeconds != null);
      if (seek) {
        out.push({
          result,
          evidence: seek,
          kind: "seek",
          src: videoUrl,
          start: seek.startSeconds ?? 0,
          duration: spanDuration(seek),
        });
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }, [testResults, evidence, videoUrl]);

  const needsMainVideo = moments.some((m) => m.kind === "seek");
  const blocked = moments.length > 0 && needsMainVideo && !videoUrl;
  const currentMoment = playing ? moments[current] : null;

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    return () => clearTimer();
  }, []);

  useEffect(() => {
    if (!playing) return;
    playMoment(indexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  function armTimer(seconds: number) {
    clearTimer();
    timerRef.current = window.setTimeout(() => advance(), Math.max(seconds, 1) * 1000);
  }

  function advance() {
    clearTimer();
    const next = indexRef.current + 1;
    if (next >= moments.length) {
      finish();
      return;
    }
    playMoment(next);
  }

  function finish() {
    clearTimer();
    setPlaying(false);
    setFinished(true);
    const video = videoRef.current;
    if (video) {
      video.onloadedmetadata = null;
      video.pause();
    }
  }

  function start() {
    if (blocked || moments.length === 0) return;
    setMounted(true);
    setFinished(false);
    setSkipNote(null);
    indexRef.current = 0;
    setCurrent(0);
    setPlaying(true);
  }

  function stop() {
    clearTimer();
    setPlaying(false);
    const video = videoRef.current;
    if (video) {
      video.onloadedmetadata = null;
      video.pause();
    }
  }

  function skip() {
    if (!playing) return;
    advance();
  }

  function handleEnded() {
    // Only treat the natural end as a trigger while the auto-advance timer is
    // still armed — otherwise an already-advanced clip's late event would
    // double-advance.
    if (!playing || timerRef.current == null) return;
    advance();
  }

  function handleError() {
    if (!playing) return;
    clearTimer();
    setSkipNote("Skipped a segment that failed to load.");
    advance();
  }

  async function playMoment(i: number) {
    const video = videoRef.current;
    if (!video) return;
    clearTimer();
    const m = moments[i];
    if (!m) {
      finish();
      return;
    }
    indexRef.current = i;
    setCurrent(i);
    setSkipNote(null);
    // Drop any stale handler from a previously played clip so it cannot
    // re-arm the timer with the wrong (e.g. main video) duration.
    video.onloadedmetadata = null;

    if (m.kind === "clip" && m.src) {
      // Clip files are extracted segments (worker buildClip) that start at
      // time 0 — the evidence startSeconds refers to the original timeline.
      try {
        if (video.src !== m.src) video.src = m.src;
        video.currentTime = 0;
        await video.play();
      } catch {
        advance();
        return;
      }
      // Prefer the real clip length (capped at 20s by the worker) once the
      // metadata is in; fall back to the evidence span / default meanwhile.
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        armTimer(video.duration);
      };
      armTimer(m.duration ?? DEFAULT_SEEK_SECONDS);
    } else if (m.kind === "seek" && m.src) {
      try {
        if (video.src !== m.src) {
          video.src = m.src;
          await new Promise<void>((resolve, reject) => {
            const onLoaded = () => {
              cleanup();
              resolve();
            };
            const onErr = () => {
              cleanup();
              reject(new Error("main video failed to load"));
            };
            const cleanup = () => {
              video.removeEventListener("loadedmetadata", onLoaded);
              video.removeEventListener("error", onErr);
            };
            video.addEventListener("loadedmetadata", onLoaded);
            video.addEventListener("error", onErr);
          });
        }
        // Seeking can throw for out-of-range/unseekable sources — move on.
        video.currentTime = m.start;
        await video.play();
      } catch {
        advance();
        return;
      }
      armTimer(m.duration ?? DEFAULT_SEEK_SECONDS);
    } else {
      // No playable source (e.g. clip URL missing and no main video) — skip.
      advance();
    }
  }

  if (moments.length === 0) return null;

  const observed = currentMoment ? describeObserved(currentMoment.result.observedValue) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!playing ? (
          <Button
            onClick={start}
            disabled={blocked}
            title={blocked ? "Main video unavailable — transcript-only violations cannot be replayed." : undefined}
          >
            <Play className="mr-2 h-4 w-4" />
            Replay violations
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={skip}>
              <SkipForward className="mr-2 h-4 w-4" />
              Skip
            </Button>
            <Button variant="danger" onClick={stop}>
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          </>
        )}
        {blocked && (
          <p className="text-xs text-zinc-600">
            Main video unavailable — transcript-only violations cannot be replayed.
          </p>
        )}
        {finished && !playing && (
          <p className="text-xs text-emerald-400">
            Replay complete — reviewed {moments.length} violation{moments.length === 1 ? "" : "s"}.
          </p>
        )}
        {skipNote && <p className="text-xs text-amber-400">{skipNote}</p>}
      </div>

      {mounted && (
        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <video
            ref={videoRef}
            className={playing ? "block max-h-[420px] w-full bg-black" : "hidden"}
            playsInline
            preload="metadata"
            onEnded={handleEnded}
            onError={handleError}
          />
          {currentMoment && (
            <div className="absolute inset-x-0 bottom-0 space-y-2 bg-zinc-950/90 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-zinc-400">
                  Failure {current + 1} of {moments.length}
                  {currentMoment.kind === "clip" ? " · clip" : ` · ${Math.round(currentMoment.start)}s`}
                </p>
                {currentMoment.result.requirement?.type && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                    {currentMoment.result.requirement.type.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${((current + 1) / moments.length) * 100}%` }}
                />
              </div>
              <p className="text-sm font-medium text-zinc-100">
                {currentMoment.result.requirement?.description ?? "Requirement"}
              </p>
              {observed && <p className="text-xs text-zinc-400">Observed: {observed}</p>}
              <p className="text-xs text-zinc-300">{currentMoment.result.explanation}</p>
              {currentMoment.evidence.text && (
                <p className="text-xs italic text-zinc-400">“{currentMoment.evidence.text}”</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
