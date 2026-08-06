import type { TranscriptSegment } from "./transcription";

/**
 * Precomputed transcript fixtures, keyed by the EXACT video SHA-256.
 *
 * Each fixture is a REAL transcript produced by the production ASR path
 * (scripts/build-transcript-fixtures.mts runs the same windowed Gemini
 * transcription against the actual demo file). The fallback in
 * transcription.ts uses a fixture ONLY when the live provider is unavailable
 * (429 / quota / 5xx / network error) — never on the normal path. Because the
 * key is the video's SHA-256, a fixture can never be applied to a different
 * file.
 */
export const TRANSCRIPT_FIXTURES: Record<string, TranscriptSegment[]> = {};
