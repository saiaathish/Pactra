/**
 * Deterministic + policy-gated test engine (faithful TS port of the Python
 * worker's requirement_tests.py — same inputs, same outputs).
 *
 * The AI is never the final judge. Analysis safety model:
 *   objective deterministic requirement → deterministic engine decides
 *   high-confidence semantic requirement with evidence → pass/fail w/ evidence
 *   low-confidence semantic requirement → uncertain
 *   subjective requirement → human_review
 *   missing or contradictory input → not_testable or uncertain
 *
 * Every automatic result includes evidence. Same input always produces the
 * same output for deterministic checks.
 */

export type TestStatus = "pass" | "fail" | "uncertain" | "not_testable" | "human_review";

export const DISCLOSURE_TERMS = [
  "sponsored", "sponsor", "sponsorship", "paid partnership",
  "in partnership", "thanks to", "brought to you by", "ad break",
  "this is an ad", "promotion", "advertis", "our sponsor",
];

export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: Word[];
}

export class Transcript {
  segments: TranscriptSegment[];

  constructor(segments: TranscriptSegment[] | null | undefined) {
    this.segments = segments ?? [];
  }

  fullText(): string {
    return this.segments.map((s) => s.text).join(" ");
  }

  words(): Word[] {
    const out: Word[] = [];
    for (const seg of this.segments) {
      if (seg.words && seg.words.length > 0) {
        out.push(...seg.words);
      } else {
        out.push({ start: seg.start, end: seg.end, text: seg.text });
      }
    }
    return out;
  }
}

export interface EvidenceItem {
  type: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  text?: string | null;
  storagePath?: string | null;
}

export interface TestOutcomeData {
  status: TestStatus;
  requirement_id: string;
  observed_value: Record<string, unknown>;
  required_value: Record<string, unknown>;
  confidence: number | null;
  explanation: string;
  evidence: EvidenceItem[];
}

export class TestOutcome {
  status: TestStatus;
  requirement_id: string;
  observed_value: Record<string, unknown>;
  required_value: Record<string, unknown>;
  confidence: number | null;
  explanation: string;
  evidence: EvidenceItem[];

  constructor(opts: {
    status: TestStatus;
    requirement_id?: string;
    observed_value?: Record<string, unknown>;
    required_value?: Record<string, unknown>;
    confidence?: number | null;
    explanation?: string;
    evidence?: EvidenceItem[];
  }) {
    this.status = opts.status;
    this.requirement_id = opts.requirement_id ?? "";
    this.observed_value = opts.observed_value ?? {};
    this.required_value = opts.required_value ?? {};
    this.confidence = opts.confidence ?? null;
    this.explanation = opts.explanation ?? "";
    this.evidence = opts.evidence ?? [];
  }

  toData(): TestOutcomeData {
    return {
      status: this.status,
      requirement_id: this.requirement_id,
      observed_value: this.observed_value,
      required_value: this.required_value,
      confidence: this.confidence,
      explanation: this.explanation,
      evidence: this.evidence,
    };
  }
}

/** Lowercases and strips punctuation (keeps $ for codes), collapses spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact match, or containment for code-like targets (ASR sometimes glues a
 * promo code to its neighbor: "codepactra20" vs target "pactra20"). */
function tokenMatches(tok: string, target: string): boolean {
  if (tok === target) return true;
  if (target.length >= 4 && tok.length > target.length && tok.length <= target.length + 12) {
    return tok.includes(target);
  }
  return false;
}

/** Timestamped occurrences of an exact phrase (case/punctuation tolerant). */
export function findPhrase(words: Word[], phrase: string): Array<{
  start: number;
  end: number;
  snippet: string;
}> {
  const target = normalize(phrase).split(" ").filter(Boolean);
  if (target.length === 0 || words.length === 0) return [];
  // Flatten normalized word elements into tokens: an ASR token like "30-day"
  // normalizes to "30 day", so element boundaries must not block a phrase match.
  const tokens: Array<{ text: string; wordIndex: number }> = [];
  words.forEach((w, i) => {
    for (const tok of normalize(w.text).split(" ")) {
      if (tok) tokens.push({ text: tok, wordIndex: i });
    }
  });
  const n = tokens.length;
  const m = target.length;
  const occurrences: Array<{ start: number; end: number; snippet: string }> = [];
  for (let i = 0; i <= n - m; i++) {
    let match = true;
    for (let j = 0; j < m; j++) {
      if (!tokenMatches(tokens[i + j].text, target[j])) {
        match = false;
        break;
      }
    }
    if (match) {
      const first = tokens[i].wordIndex;
      const last = tokens[i + m - 1].wordIndex;
      occurrences.push({
        start: words[first].start,
        end: words[last].end,
        snippet: words.slice(first, last + 1).map((w) => w.text).join(" "),
      });
    }
  }
  return occurrences;
}

export function snippetAround(words: Word[], startS: number, endS: number, padS = 1.5): string {
  return words
    .filter((w) => w.start >= startS - padS && w.end <= endS + padS)
    .map((w) => w.text)
    .join(" ");
}

// --- Individual tests -------------------------------------------------------

export function testRequiredPhrase(
  transcript: Transcript,
  phrase: string,
  words?: Word[]
): TestOutcome {
  words = words ?? transcript.words();
  const occurrences = findPhrase(words, phrase);
  if (occurrences.length > 0) {
    const first = occurrences[0];
    return new TestOutcome({
      status: "pass",
      confidence: 1.0,
      observed_value: { found: true, occurrences },
      required_value: { phrase },
      explanation: `Exact phrase found at ${first.start.toFixed(1)}s.`,
      evidence: [{ type: "transcript", startSeconds: first.start, endSeconds: first.end, text: first.snippet, storagePath: null }],
    });
  }
  return new TestOutcome({
    status: "uncertain",
    confidence: 0.5,
    observed_value: { found: false },
    required_value: { phrase },
    explanation: `Exact phrase "${phrase}" not found — verify a semantic equivalent manually.`,
  });
}

export function testForbiddenClaim(
  transcript: Transcript,
  phrase: string,
  words?: Word[]
): TestOutcome {
  words = words ?? transcript.words();
  const occurrences = findPhrase(words, phrase);
  if (occurrences.length > 0) {
    const first = occurrences[0];
    return new TestOutcome({
      status: "fail",
      confidence: 1.0,
      observed_value: { found: true, occurrences },
      required_value: { phrase },
      explanation: `Forbidden phrase "${phrase}" spoken at ${first.start.toFixed(1)}s.`,
      evidence: [{ type: "transcript", startSeconds: first.start, endSeconds: first.end, text: first.snippet, storagePath: null }],
    });
  }
  return new TestOutcome({
    status: "pass",
    confidence: 1.0,
    observed_value: { found: false },
    required_value: { phrase },
    explanation: `Forbidden phrase "${phrase}" not spoken.`,
  });
}

export function testSegmentPlacement(
  segment: { start: number; end: number; snippet?: string } | null,
  startMinS: number | null,
  startMaxS: number | null
): TestOutcome {
  if (segment === null) {
    return new TestOutcome({
      status: "not_testable",
      required_value: { start_min_s: startMinS, start_max_s: startMaxS },
      explanation: "No sponsor segment detected — placement cannot be checked.",
    });
  }
  const start = segment.start;
  let inWindow = true;
  if (startMinS !== null && startMinS !== undefined && start < startMinS) inWindow = false;
  if (startMaxS !== null && startMaxS !== undefined && start > startMaxS) inWindow = false;
  return new TestOutcome({
    status: inWindow ? "pass" : "fail",
    confidence: 1.0,
    observed_value: { segment_start_s: start },
    required_value: { start_min_s: startMinS, start_max_s: startMaxS },
    explanation: inWindow
      ? `Detected sponsor segment starts at ${start.toFixed(1)}s within the allowed window.`
      : `Detected sponsor segment starts at ${start.toFixed(1)}s — outside the allowed window.`,
    evidence: [{
      type: "transcript",
      startSeconds: start,
      endSeconds: segment.end ?? start,
      text: segment.snippet ?? "",
      storagePath: null,
    }],
  });
}

export function testSegmentDuration(
  segment: { start: number; end: number; snippet?: string } | null,
  minimumS: number | null,
  maximumS: number | null
): TestOutcome {
  if (segment === null) {
    return new TestOutcome({
      status: "not_testable",
      required_value: { minimum_s: minimumS, maximum_s: maximumS },
      explanation: "No sponsor segment detected — duration cannot be checked.",
    });
  }
  const duration = Math.max(0.0, segment.end - segment.start);
  let ok = true;
  if (minimumS !== null && minimumS !== undefined && duration < minimumS) ok = false;
  if (maximumS !== null && maximumS !== undefined && duration > maximumS) ok = false;
  return new TestOutcome({
    status: ok ? "pass" : "fail",
    confidence: 1.0,
    observed_value: {
      segment_start_s: segment.start,
      segment_end_s: segment.end,
      duration_s: duration,
    },
    required_value: { minimum_s: minimumS, maximum_s: maximumS },
    explanation: ok
      ? `Segment duration ${duration.toFixed(1)}s is within ${minimumS}–${maximumS}s.`
      : `Segment duration ${duration.toFixed(1)}s is outside ${minimumS}–${maximumS}s.`,
    evidence: [{
      type: "transcript",
      startSeconds: segment.start,
      endSeconds: segment.end,
      text: segment.snippet ?? "",
      storagePath: null,
    }],
  });
}

export function testSpokenDisclosure(
  transcript: Transcript,
  segment: { start: number; end: number; snippet?: string } | null,
  requireBeforeSegment: boolean,
  words?: Word[]
): TestOutcome {
  words = words ?? transcript.words();
  let findings: Array<{ term: string; start: number; end: number; snippet: string }> = [];
  for (const term of DISCLOSURE_TERMS) {
    for (const occ of findPhrase(words, term)) {
      findings.push({ term, ...occ });
    }
  }

  if (requireBeforeSegment && segment !== null) {
    findings = findings.filter((f) => f.start <= segment.start);
  }

  if (findings.length === 0) {
    return new TestOutcome({
      status: "fail",
      confidence: 0.8,
      observed_value: { found: false },
      required_value: { disclosure_terms: DISCLOSURE_TERMS, before_segment: !!requireBeforeSegment },
      explanation: "No spoken disclosure detected. Manual legal review recommended.",
    });
  }
  const first = findings[0];
  return new TestOutcome({
    status: "pass",
    confidence: 0.9,
    observed_value: { found: true, terms: findings.map((f) => f.term) },
    required_value: { disclosure_terms: DISCLOSURE_TERMS, before_segment: !!requireBeforeSegment },
    explanation: `Spoken disclosure detected ("${first.term}") at ${first.start.toFixed(1)}s.`,
    evidence: [{ type: "transcript", startSeconds: first.start, endSeconds: first.end, text: first.snippet, storagePath: null }],
  });
}

function descriptionSpan(description: string): EvidenceItem {
  return {
    type: "description_span",
    text: (description ?? "").slice(0, 500),
    startSeconds: null,
    endSeconds: null,
    storagePath: null,
  };
}

export function testDescriptionDisclosure(description: string): TestOutcome {
  const lowered = (description ?? "").toLowerCase();
  const found = DISCLOSURE_TERMS.filter((term) => lowered.includes(term));
  if (found.length === 0) {
    return new TestOutcome({
      status: "fail",
      confidence: 0.9,
      observed_value: { found: false },
      required_value: { disclosure_terms: DISCLOSURE_TERMS },
      explanation: "No disclosure text found in the description.",
      evidence: [descriptionSpan(description)],
    });
  }
  return new TestOutcome({
    status: "pass",
    confidence: 0.9,
    observed_value: { found: true, terms: found },
    required_value: { disclosure_terms: DISCLOSURE_TERMS },
    explanation: `Disclosure text present in description ("${found[0]}").`,
    evidence: [descriptionSpan(description)],
  });
}

export function testDescriptionUrl(description: string, url: string): TestOutcome {
  const lowered = (description ?? "").toLowerCase();
  if (!url) {
    return new TestOutcome({ status: "not_testable", explanation: "No URL specified." });
  }
  if (lowered.includes(url.toLowerCase())) {
    return new TestOutcome({
      status: "pass",
      confidence: 1.0,
      observed_value: { found: true },
      required_value: { url },
      explanation: `URL ${url} present in description.`,
      evidence: [descriptionSpan(description)],
    });
  }
  return new TestOutcome({
    status: "fail",
    confidence: 1.0,
    observed_value: { found: false },
    required_value: { url },
    explanation: `URL ${url} missing from description.`,
    evidence: [descriptionSpan(description)],
  });
}

export function testDiscountCode(description: string, code: string): TestOutcome {
  const lowered = (description ?? "").toLowerCase();
  if (!code) {
    return new TestOutcome({ status: "not_testable", explanation: "No discount code specified." });
  }
  if (lowered.includes(code.toLowerCase())) {
    return new TestOutcome({
      status: "pass",
      confidence: 1.0,
      observed_value: { found: true },
      required_value: { code },
      explanation: `Discount code ${code} present in description.`,
      evidence: [descriptionSpan(description)],
    });
  }
  return new TestOutcome({
    status: "fail",
    confidence: 1.0,
    observed_value: { found: false },
    required_value: { code },
    explanation: `Discount code ${code} missing from description.`,
    evidence: [descriptionSpan(description)],
  });
}

export function testHumanReview(): TestOutcome {
  return new TestOutcome({
    status: "human_review",
    explanation: "Subjective requirement — flagged for human review, never auto-decided.",
  });
}

export function testLogoVisibility(): TestOutcome {
  return new TestOutcome({
    status: "not_testable",
    explanation: "Logo visibility is a visual stretch test — not implemented; flagged for manual review.",
  });
}

// --- Semantic matcher (policy-gated, evidence-required) ----------------------

export interface SemanticResult {
  match: boolean | null;
  confidence: number | null;
  quote: string | null;
}

export async function semanticMatch(
  meaning: string,
  context: string,
  aiKey: string | null,
  model: string
): Promise<SemanticResult> {
  // Without an AI key the outcome is `uncertain` — never `pass`.
  if (!aiKey || !meaning) {
    return { match: null, confidence: null, quote: null };
  }
  const base = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You judge whether a video transcript satisfies ONE requirement. " +
              'Reply ONLY JSON: {"match": true|false, "confidence": 0.0-1.0, ' +
              '"quote": "short supporting quote or null"}. Never guess: low ' +
              "confidence must be reflected in the confidence value.",
          },
          {
            role: "user",
            content: `REQUIREMENT: ${meaning}\n\nTRANSCRIPT (excerpt):\n${context.slice(0, 6000)}`,
          },
        ],
        temperature: 0,
      }),
    });
    if (!resp.ok) return { match: null, confidence: null, quote: null };
    const payload = await resp.json();
    const content = String(payload.choices?.[0]?.message?.content ?? "{}");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }
    return {
      match: typeof parsed.match === "boolean" ? parsed.match : null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      quote: typeof parsed.quote === "string" ? parsed.quote : null,
    };
  } catch {
    return { match: null, confidence: null, quote: null };
  }
}

export async function testRequiredMeaning(
  transcript: Transcript,
  meaning: string,
  aiKey: string | null,
  model: string,
  segment?: { start: number; end: number; snippet?: string } | null,
  words?: Word[]
): Promise<TestOutcome> {
  words = words ?? transcript.words();
  const lastEnd = words.length > 0 ? words[words.length - 1].end : 0;
  const context = snippetAround(words, 0, lastEnd, 0) || transcript.fullText();
  const result = await semanticMatch(meaning, context, aiKey, model);

  if (result.match === null) {
    return new TestOutcome({
      status: "uncertain",
      confidence: null,
      observed_value: { semantic_match: null },
      required_value: { meaning },
      explanation: "Could not verify the required meaning — flagged for manual review.",
    });
  }
  if (result.match && (result.confidence ?? 0) >= 0.7) {
    const evidence: EvidenceItem[] = [];
    if (result.quote) {
      for (const occ of findPhrase(words, result.quote.slice(0, 60))) {
        evidence.push({
          type: "transcript",
          startSeconds: occ.start,
          endSeconds: occ.end,
          text: occ.snippet,
          storagePath: null,
        });
      }
    }
    return new TestOutcome({
      status: "pass",
      confidence: result.confidence,
      observed_value: { semantic_match: true },
      required_value: { meaning },
      explanation: "Required meaning satisfied with transcript evidence.",
      evidence,
    });
  }
  if (result.match === false && (result.confidence ?? 0) >= 0.7) {
    return new TestOutcome({
      status: "fail",
      confidence: result.confidence,
      observed_value: { semantic_match: false },
      required_value: { meaning },
      explanation: "Required meaning not satisfied.",
    });
  }
  return new TestOutcome({
    status: "uncertain",
    confidence: result.confidence,
    observed_value: { semantic_match: result.match },
    required_value: { meaning },
    explanation: "Low-confidence semantic match — flagged for manual review.",
  });
}

// --- Segment detection -------------------------------------------------------

export function detectSponsorSegment(
  transcript: Transcript,
  brandNames?: string[] | null
): { start: number; end: number; snippet: string } | null {
  const words = transcript.words();
  if (words.length === 0) return null;
  const markers = (brandNames && brandNames[0] ? [brandNames[0]] : []).concat(DISCLOSURE_TERMS);
  let firstHit: { start: number; end: number; snippet: string } | null = null;
  for (const marker of markers) {
    for (const occ of findPhrase(words, marker)) {
      if (firstHit === null || occ.start < firstHit.start) {
        firstHit = occ;
      }
      break;
    }
  }
  if (firstHit === null) return null;
  const start = firstHit.start;
  const end = Math.min(start + 60.0, words[words.length - 1].end);
  return { start, end, snippet: snippetAround(words, start, end) };
}

// --- Orchestrator ------------------------------------------------------------

export interface EngineRequirement {
  id: string;
  type: string;
  parameters: Record<string, unknown>;
}

export async function runAll(
  requirements: EngineRequirement[],
  transcript: Transcript,
  description: string,
  opts?: {
    brandNames?: string[] | null;
    aiKey?: string | null;
    model?: string;
    videoDurationS?: number | null;
  }
): Promise<TestOutcomeData[]> {
  const brandNames = opts?.brandNames ?? null;
  const aiKey = opts?.aiKey ?? null;
  const model = opts?.model ?? "gpt-4o-mini";
  const segment = detectSponsorSegment(transcript, brandNames);
  const words = transcript.words();
  const outcomes: TestOutcomeData[] = [];

  for (const req of requirements) {
    const rtype = req.type;
    const params = req.parameters ?? {};
    let outcome: TestOutcome;

    if (rtype === "required_phrase") {
      outcome = testRequiredPhrase(transcript, String(params.phrase ?? ""), words);
    } else if (rtype === "required_meaning") {
      outcome = await testRequiredMeaning(
        transcript,
        String(params.meaning ?? ""),
        aiKey,
        model,
        segment,
        words
      );
    } else if (rtype === "forbidden_claim") {
      outcome = testForbiddenClaim(transcript, String(params.phrase ?? ""), words);
    } else if (rtype === "segment_placement") {
      outcome = testSegmentPlacement(
        segment,
        params.start_min_s as number | null,
        params.start_max_s as number | null
      );
    } else if (rtype === "segment_duration") {
      outcome = testSegmentDuration(
        segment,
        params.minimum_seconds as number | null,
        params.maximum_seconds as number | null
      );
    } else if (rtype === "spoken_disclosure") {
      outcome = testSpokenDisclosure(
        transcript,
        segment,
        (params.before_segment as boolean | undefined) ?? true,
        words
      );
    } else if (rtype === "description_disclosure") {
      outcome = testDescriptionDisclosure(description);
    } else if (rtype === "description_url") {
      outcome = testDescriptionUrl(description, String(params.url ?? ""));
    } else if (rtype === "discount_code") {
      outcome = testDiscountCode(description, String(params.code ?? ""));
    } else if (rtype === "human_review") {
      outcome = testHumanReview();
    } else {
      // logo_visibility and unknown types fail closed to not_testable
      outcome = testLogoVisibility();
    }

    outcome.requirement_id = req.id;
    outcomes.push(outcome.toData());
  }

  return outcomes;
}
