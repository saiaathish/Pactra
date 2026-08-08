import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeRevisionDelta,
  RevisionDeltaError,
  type RevisionDeltaResult,
  type RevisionDeltaRun,
} from "../lib/revision-delta";

const oldRun: RevisionDeltaRun = {
  id: "run-old",
  campaignId: "campaign-1",
  briefVersionId: "brief-version-7",
  videoSha256: "old-video-hash",
};

const newRun: RevisionDeltaRun = {
  id: "run-new",
  campaignId: "campaign-1",
  briefVersionId: "brief-version-7",
  videoSha256: "new-video-hash",
};

function result(
  requirementId: string,
  status: RevisionDeltaResult["status"]
): RevisionDeltaResult {
  return { requirementId, status };
}

test("requires the same campaign and exact same brief version", () => {
  assert.throws(
    () => computeRevisionDelta(oldRun, { ...newRun, campaignId: "campaign-2" }, [], []),
    (error) => error instanceof RevisionDeltaError && error.code === "CAMPAIGN_MISMATCH"
  );
  assert.throws(
    () => computeRevisionDelta(oldRun, { ...newRun, briefVersionId: "brief-version-8" }, [], []),
    (error) => error instanceof RevisionDeltaError && error.code === "BRIEF_VERSION_MISMATCH"
  );
});

test("classifies fixed, regression, unchanged, and other status changes", () => {
  const delta = computeRevisionDelta(
    oldRun,
    newRun,
    [result("fixed", "fail"), result("regression", "pass"), result("pass", "pass"), result("fail", "fail"), result("other", "uncertain")],
    [result("fixed", "pass"), result("regression", "fail"), result("pass", "pass"), result("fail", "fail"), result("other", "human_review")]
  );

  assert.deepEqual(delta.fixed.map((entry) => entry.requirementId), ["fixed"]);
  assert.deepEqual(delta.regressions.map((entry) => entry.requirementId), ["regression"]);
  assert.deepEqual(delta.unchangedPasses.map((entry) => entry.requirementId), ["pass"]);
  assert.deepEqual(delta.unchangedFailures.map((entry) => entry.requirementId), ["fail"]);
  assert.deepEqual(delta.otherStatusChanges.map((entry) => entry.requirementId), ["other"]);
  assert.deepEqual(delta.oldRun, { id: "run-old", videoSha256: "old-video-hash" });
  assert.deepEqual(delta.newRun, { id: "run-new", videoSha256: "new-video-hash" });
});

test("joins missing results by requirement ID", () => {
  const delta = computeRevisionDelta(
    oldRun,
    newRun,
    [result("removed", "fail")],
    [result("added", "pass")]
  );

  assert.deepEqual(delta.requirements.map((entry) => entry.requirementId), ["added", "removed"]);
  assert.deepEqual(
    delta.otherStatusChanges.map(({ requirementId, oldStatus, newStatus }) => ({ requirementId, oldStatus, newStatus })),
    [
      { requirementId: "added", oldStatus: null, newStatus: "pass" },
      { requirementId: "removed", oldStatus: "fail", newStatus: null },
    ]
  );
});

test("compares stable evidence summaries and ignores signed URLs", () => {
  const shared = { type: "transcript", startSeconds: 2, endSeconds: 4, text: "sponsored", sha256: null };
  const oldEvidence = { ...shared, signedUrl: "https://signed.example/old" };
  const newEvidence = { ...shared, signedUrl: "https://signed.example/new" };
  const unchanged = computeRevisionDelta(
    oldRun,
    newRun,
    [{ ...result("r1", "pass"), evidenceSummaries: [oldEvidence] }],
    [{ ...result("r1", "pass"), evidenceSummaries: [newEvidence] }]
  );
  assert.equal(unchanged.requirements[0].evidenceChanged, false);

  const changed = computeRevisionDelta(
    oldRun,
    newRun,
    [{ ...result("r1", "pass"), evidenceSummaries: [shared] }],
    [{ ...result("r1", "pass"), evidenceSummaries: [{ ...shared, text: "paid partnership" }] }]
  );
  assert.deepEqual(changed.changedEvidence.map((entry) => entry.requirementId), ["r1"]);
});

test("orders requirements and evidence deterministically", () => {
  const delta = computeRevisionDelta(
    oldRun,
    newRun,
    [
      { ...result("z", "pass"), evidenceSummaries: [{ type: "frame", sha256: "b" }, { type: "frame", sha256: "a" }] },
      result("a", "fail"),
    ],
    [result("a", "pass"), { ...result("z", "pass"), evidenceSummaries: [{ type: "frame", sha256: "a" }, { type: "frame", sha256: "b" }] }]
  );

  assert.deepEqual(delta.requirements.map((entry) => entry.requirementId), ["a", "z"]);
  assert.equal(delta.requirements[1].evidenceChanged, false);
  assert.deepEqual(delta.requirements[1].oldEvidence.map((evidence) => evidence.sha256), ["a", "b"]);
});
