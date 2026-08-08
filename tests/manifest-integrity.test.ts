import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson, sha256Hex } from "@/lib/api-helpers";

function manifestHash(manifest: unknown): string {
  return sha256Hex(canonicalJson(manifest));
}

test("canonicalJson sorts object keys recursively", () => {
  const first = {
    z: { beta: 2, alpha: 1 },
    a: [{ y: 2, x: 1 }],
  };
  const reordered = {
    a: [{ x: 1, y: 2 }],
    z: { alpha: 1, beta: 2 },
  };

  const canonical = '{"a":[{"x":1,"y":2}],"z":{"alpha":1,"beta":2}}';
  assert.equal(canonicalJson(first), canonical);
  assert.equal(canonicalJson(reordered), canonical);
  assert.equal(manifestHash(first), manifestHash(reordered));
  assert.equal(
    manifestHash(first),
    "4431e212c320fdd43d54704d22a5ed0bf64b3a2c6baeba00437423d35976470b"
  );
});

test("canonicalJson preserves array order", () => {
  const first = canonicalJson({ results: [{ id: "r1" }, { id: "r2" }] });
  const reversed = canonicalJson({ results: [{ id: "r2" }, { id: "r1" }] });

  assert.notEqual(first, reversed);
});

test("nested result status tampering changes the manifest SHA-256", () => {
  const manifest = {
    engineVersion: "test-v1",
    results: [{ requirementId: "r1", status: "pass", confidence: 1 }],
    evidence: [{ type: "transcript", startSeconds: 12.4, endSeconds: 14.1 }],
  };
  const tampered = {
    ...manifest,
    results: [{ ...manifest.results[0], status: "fail" }],
  };

  assert.notEqual(manifestHash(manifest), manifestHash(tampered));
});

test("nested evidence timestamp tampering changes the manifest SHA-256", () => {
  const manifest = {
    engineVersion: "test-v1",
    results: [{ requirementId: "r1", status: "pass", confidence: 1 }],
    evidence: [{ type: "transcript", startSeconds: 12.4, endSeconds: 14.1 }],
  };
  const tampered = {
    ...manifest,
    evidence: [{ ...manifest.evidence[0], startSeconds: 99.9 }],
  };

  assert.notEqual(manifestHash(manifest), manifestHash(tampered));
});

test("canonicalJson rejects values JSON cannot represent without loss", () => {
  assert.throws(() => canonicalJson({ value: undefined }), /cannot serialize undefined/);
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalJson({ value: Number.POSITIVE_INFINITY }), /non-finite/);
  assert.throws(() => canonicalJson({ value: Symbol("unsupported") }), /cannot serialize symbol/);
  assert.throws(() => canonicalJson({ value: () => null }), /cannot serialize function/);
  assert.throws(() => canonicalJson({ value: new Date(0) }), /plain JSON objects/);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cyclic/);
});
