/**
 * Sponsor brief → typed requirement candidates (replaces the Python worker's
 * brief_parser). PDFs are parsed with pdfjs-dist; the LLM converts prose into
 * Pactra's requirement schema. The creator reviews candidates before they
 * become an immutable brief version — the LLM never issues final verdicts.
 */

import { createHash } from "node:crypto";
import { loadPdfText } from "./pdf";

export const REQUIREMENT_TYPES = [
  "segment_placement",
  "segment_duration",
  "required_phrase",
  "required_meaning",
  "forbidden_claim",
  "spoken_disclosure",
  "description_disclosure",
  "description_url",
  "discount_code",
  "logo_visibility",
  "human_review",
] as const;

export const VERIFICATION_MODES = [
  "deterministic",
  "semantic_with_evidence",
  "visual_with_evidence",
  "human_required",
] as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];
export type VerificationMode = (typeof VERIFICATION_MODES)[number];

const TYPE_DEFAULT_VERIFICATION: Record<string, VerificationMode> = {
  segment_placement: "deterministic",
  segment_duration: "deterministic",
  required_phrase: "deterministic",
  required_meaning: "semantic_with_evidence",
  forbidden_claim: "deterministic",
  spoken_disclosure: "deterministic",
  description_disclosure: "deterministic",
  description_url: "deterministic",
  discount_code: "deterministic",
  logo_visibility: "visual_with_evidence",
  human_review: "human_required",
};

const SYSTEM_PROMPT = [
  "You convert sponsor briefs into structured requirements for a video compliance checker.",
  'Return ONLY JSON: {"requirements": [ ... ]}.',
  "",
  "Each requirement:",
  '- "key": short snake_case slug',
  '- "type": one of: ' + REQUIREMENT_TYPES.join(", "),
  '- "description": one sentence, human-readable',
  '- "parameters": typed values:',
  '  * segment_placement: {"start_min_s": number|null, "start_max_s": number|null}',
  '  * segment_duration: {"minimum_seconds": number, "maximum_seconds": number}',
  '  * required_phrase / forbidden_claim: {"phrase": "exact phrase to find"}',
  '  * required_meaning: {"meaning": "semantic requirement sentence"}',
  '  * spoken_disclosure: {"before_segment": bool}',
  '  * description_url: {"url": "exact url string"}',
  '  * discount_code: {"code": "exact code, e.g. SAI20"}',
  "  * description_disclosure, logo_visibility, human_review: {}",
  '- "verificationMode": one of: ' + VERIFICATION_MODES.join(", "),
  '  Use "human_required" + type "human_review" for subjective direction ' +
    '("feel natural", "be excited", "don\'t sound scripted").',
  '- "sourcePage": 1-based page number when known, else null',
  '- "sourceQuote": the exact brief sentence this came from, when available',
  "",
  "Extract every objective deliverable (talking points, exact offers, discount",
  "codes, timing windows, durations, forbidden claims, disclosure requirements,",
  "links, CTAs, product name spellings). Do not invent requirements.",
].join("\n");

export interface BriefPage {
  page: number;
  text: string;
}

export interface ParsedRequirement {
  key: string | null;
  type: RequirementType;
  description: string;
  parameters: Record<string, unknown>;
  verificationMode: VerificationMode;
  sourceEvidence: { page: number | null; quote: string | null };
}

export interface ParsedBrief {
  pages: BriefPage[];
  text: string;
  sha256: string;
  requirements: ParsedRequirement[];
}

function validateRequirements(requirements: unknown[]): ParsedRequirement[] {
  const valid: ParsedRequirement[] = [];
  for (const raw of requirements) {
    if (typeof raw !== "object" || raw === null) continue;
    const req = raw as Record<string, unknown>;
    const type = req.type as RequirementType;
    if (!REQUIREMENT_TYPES.includes(type)) continue;
    const description = String(req.description ?? "").trim();
    if (!description) continue;
    let params = req.parameters;
    if (typeof params !== "object" || params === null) params = {};
    if (type === "human_review") params = {};
    let verification = (req.verificationMode ?? req.verification) as VerificationMode;
    if (!VERIFICATION_MODES.includes(verification)) {
      verification = TYPE_DEFAULT_VERIFICATION[type] ?? "deterministic";
    }
    valid.push({
      key: typeof req.key === "string" ? req.key : null,
      type,
      description,
      parameters: params as Record<string, unknown>,
      verificationMode: verification,
      sourceEvidence: {
        page: typeof req.sourcePage === "number" ? req.sourcePage : null,
        quote: typeof req.sourceQuote === "string" ? req.sourceQuote : null,
      },
    });
  }
  return valid;
}

async function extractRequirements(
  textByPage: BriefPage[],
  aiKey: string | null,
  model: string
): Promise<ParsedRequirement[]> {
  const combined = textByPage
    .map((p) => `[Page ${p.page}]\n${p.text}`)
    .join("\n\n");
  // LLM candidates are optional: without a key, or when the provider is
  // unavailable (429/5xx), the version degrades to zero candidates and the
  // creator enters requirements manually. The brief parse must never hard-fail
  // on LLM availability.
  if (!combined.trim() || !aiKey) return [];

  const base = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: combined },
      ],
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    console.error(
      `[briefParser] LLM unavailable (${resp.status}) — degrading to zero candidates (manual requirements)`
    );
    return [];
  }
  const payload = await resp.json();
  const content = String(payload.choices?.[0]?.message?.content ?? "{}");
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }
  return validateRequirements(
    (parsed as { requirements?: unknown[] })?.requirements ?? []
  );
}

/** Full parse: pages, raw text, SHA-256, candidate requirements. */
export async function parseBrief(
  buffer: Buffer,
  filename: string
): Promise<ParsedBrief> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const pages = await loadPdfText(buffer, ext);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const aiKey = process.env.AI_API_KEY ?? null;
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const requirements = await extractRequirements(pages, aiKey, model);
  return {
    pages,
    text: pages.map((p) => p.text).join("\n\n"),
    sha256,
    requirements,
  };
}
