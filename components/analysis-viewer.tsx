"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReplayViolations } from "@/components/replay-violations";

interface EvidenceView {
  id: string;
  testResultId: string | null;
  type: string;
  startSeconds: number | null;
  endSeconds: number | null;
  text: string | null;
  signedUrl: string | null;
}

interface ResultView {
  id: string;
  status: string;
  confidence: number | null;
  explanation: string;
  observedValue: Record<string, unknown> | null;
  requirement: { description: string; type: string } | null;
  evidenceIds: string[];
}

interface RunView {
  id: string;
  status: string;
  progressPercent: number;
  currentStage: string | null;
  summary: { passed: number; failed: number; uncertain: number; humanReview: number };
  errorMessageSafe: string | null;
}

interface ResultsPayload {
  run: RunView;
  results: ResultView[];
  evidence: EvidenceView[];
}

const STAGES = [
  "queued", "validating_inputs", "downloading", "hashing", "extracting_audio",
  "transcribing", "sampling_frames", "running_deterministic_tests",
  "running_semantic_tests", "running_visual_tests", "creating_evidence",
  "saving_results", "complete",
];

/**
 * Live analysis progress + timestamped results. Polls the run endpoint until
 * completion, then loads results with signed evidence URLs.
 */
export function AnalysisViewer({
  runId,
  initialRun,
  videoUrl = null,
}: {
  runId: string;
  initialRun: RunView;
  /** Signed URL for the main campaign video (server-resolved), for seeking transcript-only violations. */
  videoUrl?: string | null;
}) {
  const [run, setRun] = useState<RunView>(initialRun);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [manifestId, setManifestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const finished = ["passed", "failed", "partial", "error", "cancelled"].includes(run.status);

  useEffect(() => {
    async function loadResults() {
      const res = await fetch(`/api/analysis-runs/${runId}/results`);
      if (!res.ok) {
        setError("Analysis finished, but its results could not be loaded.");
        return;
      }
      setResults(await res.json());
    }

    // Completed runs are the primary demo path. Load their persisted results
    // immediately instead of waiting for a polling transition that will never
    // occur after a page refresh or direct link.
    if (finished) {
      void loadResults();
      return;
    }

    const timer = setInterval(async () => {
      const res = await fetch(`/api/analysis-runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRun(data.run);
      if (["passed", "failed", "partial", "error", "cancelled"].includes(data.run.status)) {
        clearInterval(timer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [runId, finished]);

  async function handleCancel() {
    await fetch(`/api/analysis-runs/${runId}/cancel`, { method: "POST" });
    window.location.reload();
  }

  async function handleManifest() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/analysis-runs/${runId}/manifest`, { method: "POST" });
    const payload = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(payload.error ?? "Failed to generate manifest");
      return;
    }
    setManifestId(payload.manifest?.id ?? runId);
  }

  const stageIndex = STAGES.indexOf(run.currentStage ?? "");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">
              Status: <span className="text-indigo-300">{run.status}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">{run.currentStage ?? "queued"}</p>
          </div>
          <div className="flex items-center gap-3">
            {!finished && (
              <Button variant="danger" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            {run.status === "passed" && (
              <Button onClick={handleManifest} disabled={generating}>
                {generating ? "Generating…" : "Generate approval manifest"}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${run.progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">{run.progressPercent}%</p>
        {stageIndex >= 0 && stageIndex < STAGES.length - 1 && (
          <p className="mt-2 text-xs text-zinc-600">
            Stage {stageIndex + 1}/{STAGES.length - 1} — {STAGES[stageIndex + 1].replace(/_/g, " ")}
          </p>
        )}
        {run.errorMessageSafe && <p className="mt-2 text-sm text-red-400">{run.errorMessageSafe}</p>}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {manifestId && (
          <p className="mt-2 text-sm text-emerald-400">
            Manifest generated —{" "}
            <Link href={`/analysis/${runId}/report`} className="underline">
              view approval packet
            </Link>
          </p>
        )}
      </div>

      {results && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="pass" />
            <span className="text-xs text-zinc-500">{results.run.summary.passed} passed</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-red-400">{results.run.summary.failed} failed</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-amber-400">{results.run.summary.uncertain} uncertain</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-sky-400">{results.run.summary.humanReview} human review</span>
          </div>

          <div className="mt-4">
            <ReplayViolations
              testResults={results.results}
              evidence={results.evidence}
              videoUrl={videoUrl}
            />
          </div>

          <ul className="mt-4 space-y-4">
            {results.results.map((r) => {
              const evs = results.evidence.filter((ev) => ev.testResultId === r.id);
              return (
                <li key={r.id} className="border-t border-zinc-800 pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {r.requirement?.description ?? "Requirement"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{r.explanation}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {evs.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {evs.map((ev) => (
                        <div key={ev.id} className="rounded-lg bg-zinc-950 p-3">
                          {ev.type === "transcript" && ev.text && (
                            <p className="text-xs italic text-zinc-400">
                              “[{ev.text}]”
                              {ev.startSeconds != null && (
                                <span className="text-zinc-500"> at {Math.round(ev.startSeconds)}s</span>
                              )}
                            </p>
                          )}
                          {ev.type === "description_span" && ev.text && (
                            <p className="text-xs text-zinc-500">
                              Description: “{ev.text.slice(0, 200)}…”
                            </p>
                          )}
                          {(ev.type === "video_clip" || ev.type === "audio_clip") && ev.signedUrl && (
                            <video
                              src={ev.signedUrl}
                              controls
                              className="mt-1 max-h-40 rounded-lg border border-zinc-800"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
