"use client";

import { useEffect, useState } from "react";
import type {
  RevisionDelta,
  RevisionDeltaClassification,
  RevisionDeltaEntry,
} from "@/lib/revision-delta";

interface CandidateRun {
  id: string;
  videoSha256: string;
  summary: { passed: number; failed: number; uncertain: number; humanReview: number };
  createdAt: string;
}

interface DeltaPayload {
  delta: RevisionDelta;
  requirements: Record<string, { description: string }>;
  runs: {
    old: CandidateRun;
    new: CandidateRun;
  };
}

const SECTION_LABELS: Partial<Record<RevisionDeltaClassification, string>> = {
  fixed: "Fixed in this revision",
  regression: "New regressions",
  unchanged_pass: "Unchanged passes",
  unchanged_failure: "Unchanged failures",
  other_status_change: "Other status changes",
  unchanged_other: "Unchanged other",
};

const SECTION_ORDER: RevisionDeltaClassification[] = [
  "fixed",
  "regression",
  "other_status_change",
  "unchanged_pass",
  "unchanged_failure",
  "unchanged_other",
];

/** classification -> field on the RevisionDelta object (entry-array fields only) */
type DeltaEntryField =
  | "fixed"
  | "regressions"
  | "otherStatusChanges"
  | "unchangedPasses"
  | "unchangedFailures"
  | "unchangedOtherStatuses";

const SECTION_FIELD: Record<RevisionDeltaClassification, DeltaEntryField> = {
  fixed: "fixed",
  regression: "regressions",
  other_status_change: "otherStatusChanges",
  unchanged_pass: "unchangedPasses",
  unchanged_failure: "unchangedFailures",
  unchanged_other: "unchangedOtherStatuses",
};

function shaPrefix(sha: string): string {
  return `${sha.slice(0, 10)}…`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RunSummaryLine({ label, run }: { label: string; run: CandidateRun }) {
  return (
    <p className="text-sm text-zinc-300">
      <span className="font-medium text-zinc-200">{label}</span>{" "}
      <span className="text-emerald-400">{run.summary.passed} passed</span>
      <span className="text-zinc-600"> · </span>
      <span className="text-red-400">{run.summary.failed} failed</span>
      {run.summary.uncertain > 0 && (
        <>
          <span className="text-zinc-600"> · </span>
          <span className="text-amber-400">{run.summary.uncertain} uncertain</span>
        </>
      )}
      <span className="ml-2 font-mono text-xs text-zinc-500">{shaPrefix(run.videoSha256)}</span>
      <span className="ml-2 text-xs text-zinc-600">{shortDate(run.createdAt)}</span>
    </p>
  );
}

function EntryList({ entries, requirements }: { entries: RevisionDeltaEntry[]; requirements: Record<string, { description: string }> }) {
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-500">None</p>;
  }
  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => (
        <li key={entry.requirementId} className="flex items-start justify-between gap-3">
          <p className="text-sm text-zinc-200">
            {requirements[entry.requirementId]?.description ?? `Requirement ${entry.requirementId}`}
          </p>
          {entry.evidenceChanged && (
            <span className="shrink-0 text-xs text-zinc-500">evidence changed</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Deterministic comparison of the current completed analysis run against an
 * earlier completed run of the same campaign and brief version. Pure server
 * computation — no LLM, no invented claims.
 */
export function RevisionDeltaViewer({ runId }: { runId: string }) {
  const [candidates, setCandidates] = useState<CandidateRun[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [payload, setPayload] = useState<DeltaPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/analysis-runs/${runId}/revision-delta`);
      if (!res.ok) {
        if (!cancelled) setError("Revision history could not be loaded.");
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      if (!data.ready) return;
      setCandidates(data.runs);
      setSelected(data.runs[0]?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!selected) {
      setPayload(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await fetch(`/api/analysis-runs/${runId}/revision-delta?compareTo=${selected}`);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Revision comparison failed.");
        setPayload(null);
        return;
      }
      setPayload(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, selected]);

  if (error && !candidates) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Revision delta</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Deterministic comparison against an earlier run of the same brief version.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Compare with
          <select
            value={selected ?? ""}
            onChange={(event) => setSelected(event.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200"
          >
            {candidates.map((run) => (
              <option key={run.id} value={run.id}>
                {shortDate(run.createdAt)} · {shaPrefix(run.videoSha256)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="mt-3 text-xs text-zinc-500">Comparing revisions…</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {payload && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <RunSummaryLine label="Revision 1" run={payload.runs.old} />
            <RunSummaryLine label="Revision 2" run={payload.runs.new} />
          </div>

          {SECTION_ORDER.map((classification) => {
            const entries = payload.delta[SECTION_FIELD[classification]];
            if (entries.length === 0) return null;
            return (
              <div key={classification}>
                <h3 className="text-sm font-medium text-zinc-300">
                  {SECTION_LABELS[classification] ?? classification}
                  <span className="ml-2 text-xs font-normal text-zinc-500">({entries.length})</span>
                </h3>
                <div className="mt-1.5">
                  <EntryList entries={entries} requirements={payload.requirements} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
