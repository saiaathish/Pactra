import type { TranscriptSegment } from "./transcription";
import failingFixture from "./transcript-fixtures/8de0969661342fdbf29252e63e34ac0ee8669130253ed3074182464093271cbb.json";
import passingFixture from "./transcript-fixtures/27052a3899003ca95d68d04a67d99ff4901b243979fdbc00a343c2e49a9720de.json";

/**
 * Precomputed transcript fixtures, keyed by the EXACT video SHA-256.
 *
 * Each fixture is the genuine transcript of the frozen demo file: word
 * timestamps from the deterministic TTS script (measured section durations),
 * producing the same verdicts as the production runs (golden-demo/
 * production-run-ids.txt). The fallback in transcription.ts uses a fixture
 * ONLY when the live provider is unavailable (429 / quota / 5xx / network
 * error) — never on the normal path. Because the key is the video's SHA-256,
 * a fixture can never be applied to a different file.
 */
export const TRANSCRIPT_FIXTURES: Record<string, TranscriptSegment[]> = {
  [failingFixture.videoSha256]: failingFixture.segments as TranscriptSegment[],
  [passingFixture.videoSha256]: passingFixture.segments as TranscriptSegment[],
};
