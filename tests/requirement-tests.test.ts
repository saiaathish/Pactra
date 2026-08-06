/**
 * Ported smoke tests for the deterministic test engine (wrapper test: no LLM).
 * Mirrors worker/tests/test_requirement_tests.py check-for-check — the TS
 * engine must produce identical verdicts.
 *
 * Covers the analysis safety model:
 *   deterministic → engine decides; semantic low-confidence → uncertain;
 *   subjective → human_review; unimplemented visual → not_testable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Transcript,
  detectSponsorSegment,
  runAll,
  testDescriptionDisclosure,
  testDescriptionUrl,
  testDiscountCode,
  testForbiddenClaim,
  testHumanReview,
  testLogoVisibility,
  testRequiredMeaning,
  testRequiredPhrase,
  testSegmentDuration,
  testSegmentPlacement,
  testSpokenDisclosure,
  type Word,
} from "@/lib/worker/requirementTests";

function makeTranscript(): Transcript {
  const words: Word[] = [
    { start: 0.0, end: 0.8, text: "hey everyone" },
    { start: 0.8, end: 1.6, text: "today's" },
    { start: 1.6, end: 2.4, text: "video" },
    { start: 2.4, end: 3.2, text: "is" },
    { start: 3.2, end: 4.0, text: "sponsored" },
    { start: 4.0, end: 4.8, text: "by" },
    { start: 4.8, end: 5.6, text: "acme" },
    { start: 5.6, end: 6.4, text: "use" },
    { start: 6.4, end: 7.2, text: "code" },
    { start: 7.2, end: 8.0, text: "SAI20" },
    { start: 8.0, end: 8.8, text: "for" },
    { start: 8.8, end: 9.6, text: "a" },
    { start: 9.6, end: 10.4, text: "free" },
    { start: 10.4, end: 11.2, text: "trial" },
    { start: 11.2, end: 12.0, text: "guaranteed" },
    { start: 12.0, end: 12.8, text: "growth" },
  ];
  return new Transcript(words.map((w) => ({ ...w, words: [w] })));
}

test("required_phrase (deterministic)", async () => {
  const transcript = makeTranscript();
  const r = await testRequiredPhrase(transcript, "free trial");
  assert.equal(r.status, "pass", `exact phrase found -> pass (got ${r.status})`);
  assert.ok(r.evidence.length > 0 && r.evidence[0].startSeconds === 9.6, "timestamped evidence");
  const absent = await testRequiredPhrase(transcript, "30 day free trial");
  assert.equal(absent.status, "uncertain", "absent phrase -> uncertain, never pass");
});

test("forbidden_claim (deterministic)", async () => {
  const transcript = makeTranscript();
  const r = await testForbiddenClaim(transcript, "guaranteed growth");
  assert.equal(r.status, "fail");
  assert.equal(r.evidence[0].startSeconds, 11.2, "fail with timestamp");
});

test("segment tests (deterministic)", async () => {
  const transcript = makeTranscript();
  const segment = detectSponsorSegment(transcript);
  assert.ok(segment !== null, "segment detected");
  if (segment) {
    assert.ok(Math.abs(segment.start - 3.2) < 0.01, "segment starts at disclosure");
  }
  let r = await testSegmentPlacement(segment, 2.0, 4.0);
  assert.equal(r.status, "pass", "placement in window -> pass");
  r = await testSegmentPlacement(segment, 0.0, 2.0);
  assert.equal(r.status, "fail", "placement outside window -> fail");
  r = await testSegmentDuration(segment, 45, 60);
  assert.equal(r.status, "fail", `duration too short -> fail (got ${r.status})`);
  r = await testSegmentDuration(null, 45, 60);
  assert.equal(r.status, "not_testable", "missing segment -> not_testable");
});

test("disclosure (deterministic)", async () => {
  const transcript = makeTranscript();
  const segment = detectSponsorSegment(transcript);
  let r = await testSpokenDisclosure(transcript, segment, true);
  assert.equal(r.status, "pass", "spoken disclosure before segment -> pass");
  r = await testDescriptionDisclosure("Great video! link in bio");
  assert.equal(r.status, "fail", "description without disclosure -> fail");
  r = await testDescriptionDisclosure("Sponsored by Acme — link below");
  assert.equal(r.status, "pass", "description with disclosure -> pass");
});

test("description deliverables (deterministic)", async () => {
  let r = await testDescriptionUrl("Get 20% off at https://acme.com/sai20", "https://acme.com/sai20");
  assert.equal(r.status, "pass", "URL present -> pass");
  r = await testDescriptionUrl("Great video!", "https://acme.com/sai20");
  assert.equal(r.status, "fail", "URL missing -> fail");
  r = await testDiscountCode("Use SAI20 at checkout", "SAI20");
  assert.equal(r.status, "pass", "code present -> pass");
  r = await testDiscountCode("Great video!", "SAI20");
  assert.equal(r.status, "fail", "code missing -> fail");
});

test("safety model", async () => {
  const transcript = makeTranscript();
  assert.equal((await testHumanReview()).status, "human_review");
  assert.equal((await testLogoVisibility()).status, "not_testable", "no fake pass");
  const r = await testRequiredMeaning(transcript, "mentions a discount", null, "gpt-4o-mini");
  assert.equal(r.status, "uncertain", `semantic without AI key -> uncertain (got ${r.status})`);
});

test("run_all orchestration", async () => {
  const transcript = makeTranscript();
  const requirements = [
    { id: "r1", type: "required_phrase", parameters: { phrase: "free trial" } },
    { id: "r2", type: "forbidden_claim", parameters: { phrase: "guaranteed growth" } },
    { id: "r3", type: "human_review", parameters: {} },
    { id: "r4", type: "logo_visibility", parameters: {} },
    { id: "r5", type: "discount_code", parameters: { code: "SAI20" } },
  ];
  const outcomes = await runAll(requirements, transcript, "Use SAI20 at checkout", {
    brandNames: ["acme"],
  });
  const byId = new Map(outcomes.map((o) => [o.requirement_id, o]));
  assert.equal(byId.get("r1")!.status, "pass");
  assert.equal(byId.get("r2")!.status, "fail");
  assert.equal(byId.get("r3")!.status, "human_review");
  assert.equal(byId.get("r4")!.status, "not_testable");
  assert.equal(byId.get("r5")!.status, "pass", "description code -> pass");
  assert.ok(
    outcomes.every((o) => o.status !== "fail" || o.evidence.length > 0),
    "every fail has evidence"
  );

  const again = await runAll(requirements, transcript, "Use SAI20 at checkout", {
    brandNames: ["acme"],
  });
  assert.deepEqual(
    outcomes.map((o) => o.status),
    again.map((o) => o.status),
    "deterministic across runs"
  );
});
