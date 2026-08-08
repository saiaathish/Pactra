import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { requireApiUser } from "@/lib/firebase/session";

export function apiError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function parseObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Validates ObjectId shape — invalid ids return 400, never 500. */
export function requireObjectId(id: string): ObjectId | NextResponse {
  const oid = parseObjectId(id);
  if (!oid) return apiError(400, "Invalid id");
  return oid;
}

/**
 * Shared protected-route gate: verifies the Firebase token/cookie and returns
 * the verified firebaseUid, or a 401 NextResponse.
 */
export async function requireVerifiedUid(
  request: Request
): Promise<string | NextResponse> {
  const uid = await requireApiUser(request);
  if (!uid) return apiError(401, "unauthorized");
  return uid;
}

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Deterministic JSON serialization for hashing.
 *
 * Object keys are sorted recursively while array order is preserved. Values
 * that JSON cannot represent without loss are rejected instead of being
 * omitted or coerced, which prevents distinct manifests from sharing a hash.
 */
export function canonicalJson(value: unknown): string {
  const ancestors = new WeakSet<object>();

  function serialize(input: unknown): string {
    if (input === null) return "null";

    switch (typeof input) {
      case "boolean":
      case "string":
        return JSON.stringify(input);
      case "number":
        if (!Number.isFinite(input)) {
          throw new TypeError("canonicalJson cannot serialize non-finite numbers");
        }
        return JSON.stringify(input);
      case "object": {
        if (ancestors.has(input)) {
          throw new TypeError("canonicalJson cannot serialize cyclic values");
        }
        ancestors.add(input);

        try {
          if (Array.isArray(input)) {
            const keys = Object.keys(input);
            if (
              keys.length !== input.length ||
              keys.some((key, index) => key !== String(index))
            ) {
              throw new TypeError("canonicalJson cannot serialize sparse or augmented arrays");
            }
            if (Object.getOwnPropertySymbols(input).length > 0) {
              throw new TypeError("canonicalJson cannot serialize symbol-keyed properties");
            }
            return `[${input.map(serialize).join(",")}]`;
          }

          const prototype = Object.getPrototypeOf(input);
          if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError("canonicalJson only supports plain JSON objects");
          }
          if (Object.getOwnPropertySymbols(input).length > 0) {
            throw new TypeError("canonicalJson cannot serialize symbol-keyed properties");
          }

          const record = input as Record<string, unknown>;
          return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`)
            .join(",")}}`;
        } finally {
          ancestors.delete(input);
        }
      }
      default:
        throw new TypeError(`canonicalJson cannot serialize ${typeof input}`);
    }
  }

  return serialize(value);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
