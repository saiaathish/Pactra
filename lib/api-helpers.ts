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

/** Canonical JSON serialization for hashing (sorted keys). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
