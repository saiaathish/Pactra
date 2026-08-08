/**
 * Deterministic comparison of two analysis runs for the same campaign and
 * immutable brief version. Callers supply stable evidence summaries; signed
 * URLs are deliberately not part of the accepted or compared shape.
 */

export type RevisionDeltaStatus =
  | "pass"
  | "fail"
  | "uncertain"
  | "human_review"
  | "not_testable";

export interface RevisionDeltaRun {
  id: string;
  campaignId: string;
  briefVersionId: string;
  videoSha256: string;
}

export interface StableEvidenceSummary {
  type: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  text?: string | null;
  sha256?: string | null;
}

export interface RevisionDeltaResult {
  requirementId: string;
  status: RevisionDeltaStatus;
  evidenceSummaries?: readonly StableEvidenceSummary[];
}

export type RevisionDeltaClassification =
  | "fixed"
  | "regression"
  | "unchanged_pass"
  | "unchanged_failure"
  | "other_status_change"
  | "unchanged_other";

export interface RevisionDeltaEntry {
  requirementId: string;
  oldStatus: RevisionDeltaStatus | null;
  newStatus: RevisionDeltaStatus | null;
  classification: RevisionDeltaClassification;
  oldEvidence: StableEvidenceSummary[];
  newEvidence: StableEvidenceSummary[];
  evidenceChanged: boolean;
}

export interface RevisionDelta {
  campaignId: string;
  briefVersionId: string;
  oldRun: { id: string; videoSha256: string };
  newRun: { id: string; videoSha256: string };
  requirements: RevisionDeltaEntry[];
  fixed: RevisionDeltaEntry[];
  regressions: RevisionDeltaEntry[];
  unchangedPasses: RevisionDeltaEntry[];
  unchangedFailures: RevisionDeltaEntry[];
  otherStatusChanges: RevisionDeltaEntry[];
  unchangedOtherStatuses: RevisionDeltaEntry[];
  changedEvidence: RevisionDeltaEntry[];
}

export type RevisionDeltaErrorCode =
  | "CAMPAIGN_MISMATCH"
  | "BRIEF_VERSION_MISMATCH"
  | "DUPLICATE_REQUIREMENT_ID";

export class RevisionDeltaError extends Error {
  constructor(
    readonly code: RevisionDeltaErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RevisionDeltaError";
  }
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeEvidence(summary: StableEvidenceSummary): StableEvidenceSummary {
  return {
    type: summary.type,
    startSeconds: summary.startSeconds ?? null,
    endSeconds: summary.endSeconds ?? null,
    text: summary.text ?? null,
    sha256: summary.sha256 ?? null,
  };
}

function evidenceKey(summary: StableEvidenceSummary): string {
  return JSON.stringify(normalizeEvidence(summary));
}

function stableEvidence(
  summaries: readonly StableEvidenceSummary[] | undefined
): StableEvidenceSummary[] {
  return (summaries ?? [])
    .map(normalizeEvidence)
    .sort((left, right) => compareIds(evidenceKey(left), evidenceKey(right)));
}

function indexResults(
  label: "old" | "new",
  results: readonly RevisionDeltaResult[]
): Map<string, RevisionDeltaResult> {
  const indexed = new Map<string, RevisionDeltaResult>();
  for (const result of results) {
    if (indexed.has(result.requirementId)) {
      throw new RevisionDeltaError(
        "DUPLICATE_REQUIREMENT_ID",
        `Revision Delta cannot compare duplicate ${label} result for requirement ${result.requirementId}`
      );
    }
    indexed.set(result.requirementId, result);
  }
  return indexed;
}

function classify(
  oldStatus: RevisionDeltaStatus | null,
  newStatus: RevisionDeltaStatus | null
): RevisionDeltaClassification {
  if (oldStatus === "fail" && newStatus === "pass") return "fixed";
  if (oldStatus === "pass" && newStatus === "fail") return "regression";
  if (oldStatus === "pass" && newStatus === "pass") return "unchanged_pass";
  if (oldStatus === "fail" && newStatus === "fail") return "unchanged_failure";
  if (oldStatus !== newStatus) return "other_status_change";
  return "unchanged_other";
}

export function computeRevisionDelta(
  oldRun: RevisionDeltaRun,
  newRun: RevisionDeltaRun,
  oldResults: readonly RevisionDeltaResult[],
  newResults: readonly RevisionDeltaResult[]
): RevisionDelta {
  if (oldRun.campaignId !== newRun.campaignId) {
    throw new RevisionDeltaError(
      "CAMPAIGN_MISMATCH",
      `Revision Delta requires the same campaign: ${oldRun.campaignId} !== ${newRun.campaignId}`
    );
  }
  if (oldRun.briefVersionId !== newRun.briefVersionId) {
    throw new RevisionDeltaError(
      "BRIEF_VERSION_MISMATCH",
      `Revision Delta requires the exact same brief version: ${oldRun.briefVersionId} !== ${newRun.briefVersionId}`
    );
  }

  const oldByRequirement = indexResults("old", oldResults);
  const newByRequirement = indexResults("new", newResults);
  const requirementIds = [...new Set([...oldByRequirement.keys(), ...newByRequirement.keys()])]
    .sort(compareIds);

  const requirements = requirementIds.map((requirementId): RevisionDeltaEntry => {
    const oldResult = oldByRequirement.get(requirementId);
    const newResult = newByRequirement.get(requirementId);
    const oldEvidence = stableEvidence(oldResult?.evidenceSummaries);
    const newEvidence = stableEvidence(newResult?.evidenceSummaries);

    return {
      requirementId,
      oldStatus: oldResult?.status ?? null,
      newStatus: newResult?.status ?? null,
      classification: classify(oldResult?.status ?? null, newResult?.status ?? null),
      oldEvidence,
      newEvidence,
      evidenceChanged:
        JSON.stringify(oldEvidence.map(evidenceKey)) !==
        JSON.stringify(newEvidence.map(evidenceKey)),
    };
  });

  const byClassification = (classification: RevisionDeltaClassification) =>
    requirements.filter((entry) => entry.classification === classification);

  return {
    campaignId: oldRun.campaignId,
    briefVersionId: oldRun.briefVersionId,
    oldRun: { id: oldRun.id, videoSha256: oldRun.videoSha256 },
    newRun: { id: newRun.id, videoSha256: newRun.videoSha256 },
    requirements,
    fixed: byClassification("fixed"),
    regressions: byClassification("regression"),
    unchangedPasses: byClassification("unchanged_pass"),
    unchangedFailures: byClassification("unchanged_failure"),
    otherStatusChanges: byClassification("other_status_change"),
    unchangedOtherStatuses: byClassification("unchanged_other"),
    changedEvidence: requirements.filter((entry) => entry.evidenceChanged),
  };
}
