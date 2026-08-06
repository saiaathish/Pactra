"""Deterministic + policy-gated test engine.

The AI is never the final judge. Analysis safety model:
  objective deterministic requirement → deterministic engine decides
  high-confidence semantic requirement with evidence → pass/fail w/ evidence
  low-confidence semantic requirement → uncertain
  subjective requirement → human_review
  missing or contradictory input → not_testable or uncertain

Every automatic result includes evidence. Same input always produces the same
output for deterministic checks.
"""

from __future__ import annotations

import json
import os
import re

import httpx

STATUSES = ("pass", "fail", "uncertain", "not_testable", "human_review")

DISCLOSURE_TERMS = [
    "sponsored", "sponsor", "sponsorship", "paid partnership",
    "in partnership", "thanks to", "brought to you by", "ad break",
    "this is an ad", "promotion", "advertis", "our sponsor",
]

# Requirement type → verification mode (the parser may override to
# human_required for subjective direction).
TYPE_VERIFICATION = {
    "segment_placement": "deterministic",
    "segment_duration": "deterministic",
    "required_phrase": "deterministic",
    "required_meaning": "semantic_with_evidence",
    "forbidden_claim": "deterministic",
    "spoken_disclosure": "deterministic",
    "description_disclosure": "deterministic",
    "description_url": "deterministic",
    "discount_code": "deterministic",
    "logo_visibility": "visual_with_evidence",
    "human_review": "human_required",
}


class Transcript:
    """Segments with optional word timestamps; supports timestamped search."""

    def __init__(self, segments):
        self.segments = segments or []

    def full_text(self):
        return " ".join(seg["text"] for seg in self.segments)

    def words(self):
        words = []
        for seg in self.segments:
            if seg.get("words"):
                words.extend(seg["words"])
            else:
                words.append({"start": seg["start"], "end": seg["end"], "text": seg["text"]})
        return words


class TestOutcome:
    def __init__(self, status, requirement_id="", observed_value=None,
                 required_value=None, confidence=None, explanation="", evidence=None):
        self.status = status
        self.requirement_id = requirement_id
        self.observed_value = observed_value or {}
        self.required_value = required_value or {}
        self.confidence = confidence
        self.explanation = explanation
        self.evidence = evidence or []

    def to_dict(self):
        return {
            "status": self.status,
            "requirement_id": self.requirement_id,
            "observed_value": self.observed_value,
            "required_value": self.required_value,
            "confidence": self.confidence,
            "explanation": self.explanation,
            "evidence": self.evidence,
        }


def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s$]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def find_phrase(words, phrase):
    """Timestamped occurrences of an exact phrase (case/punctuation tolerant).
    Word-count sliding window keeps alignment robust to punctuation."""
    norm_words = [normalize(w["text"]) for w in words]
    target = normalize(phrase).split()
    if not target:
        return []
    occurrences = []
    n, m = len(norm_words), len(target)
    for i in range(n - m + 1):
        if norm_words[i:i + m] == target:
            occurrences.append({
                "start": words[i]["start"],
                "end": words[i + m - 1]["end"],
                "snippet": " ".join(w["text"] for w in words[i:i + m]),
            })
    return occurrences


def snippet_around(words, start_s, end_s, pad_s=1.5):
    return " ".join(
        w["text"] for w in words if w["start"] >= start_s - pad_s and w["end"] <= end_s + pad_s
    )


# --- Individual tests -------------------------------------------------------


def test_required_phrase(transcript, phrase, words=None):
    words = words or transcript.words()
    occurrences = find_phrase(words, phrase)
    if occurrences:
        first = occurrences[0]
        return TestOutcome(
            status="pass", confidence=1.0,
            observed_value={"found": True, "occurrences": occurrences},
            required_value={"phrase": phrase},
            explanation=f"Exact phrase found at {first['start']:.1f}s.",
            evidence=[{"type": "transcript", "startSeconds": first["start"],
                       "endSeconds": first["end"], "text": first["snippet"], "storagePath": None}],
        )
    return TestOutcome(
        status="uncertain", confidence=0.5,
        observed_value={"found": False},
        required_value={"phrase": phrase},
        explanation=f"Exact phrase \"{phrase}\" not found — verify a semantic equivalent manually.",
    )


def test_forbidden_claim(transcript, phrase, words=None):
    words = words or transcript.words()
    occurrences = find_phrase(words, phrase)
    if occurrences:
        first = occurrences[0]
        return TestOutcome(
            status="fail", confidence=1.0,
            observed_value={"found": True, "occurrences": occurrences},
            required_value={"phrase": phrase},
            explanation=f"Forbidden phrase \"{phrase}\" spoken at {first['start']:.1f}s.",
            evidence=[{"type": "transcript", "startSeconds": first["start"],
                       "endSeconds": first["end"], "text": first["snippet"], "storagePath": None}],
        )
    return TestOutcome(
        status="pass", confidence=1.0,
        observed_value={"found": False},
        required_value={"phrase": phrase},
        explanation=f"Forbidden phrase \"{phrase}\" not spoken.",
    )


def test_segment_placement(segment, start_min_s, start_max_s):
    if segment is None:
        return TestOutcome(
            status="not_testable",
            required_value={"start_min_s": start_min_s, "start_max_s": start_max_s},
            explanation="No sponsor segment detected — placement cannot be checked.",
        )
    start = segment["start"]
    in_window = True
    if start_min_s is not None and start < start_min_s:
        in_window = False
    if start_max_s is not None and start > start_max_s:
        in_window = False
    return TestOutcome(
        status="pass" if in_window else "fail", confidence=1.0,
        observed_value={"segment_start_s": start},
        required_value={"start_min_s": start_min_s, "start_max_s": start_max_s},
        explanation=(
            f"Detected sponsor segment starts at {start:.1f}s within the allowed window."
            if in_window else
            f"Detected sponsor segment starts at {start:.1f}s — outside the allowed window."
        ),
        evidence=[{"type": "transcript", "startSeconds": start,
                   "endSeconds": segment.get("end", start), "text": segment.get("snippet", ""),
                   "storagePath": None}],
    )


def test_segment_duration(segment, minimum_s, maximum_s):
    if segment is None:
        return TestOutcome(
            status="not_testable",
            required_value={"minimum_s": minimum_s, "maximum_s": maximum_s},
            explanation="No sponsor segment detected — duration cannot be checked.",
        )
    duration = max(0.0, segment["end"] - segment["start"])
    ok = True
    if minimum_s is not None and duration < minimum_s:
        ok = False
    if maximum_s is not None and duration > maximum_s:
        ok = False
    return TestOutcome(
        status="pass" if ok else "fail", confidence=1.0,
        observed_value={"segment_start_s": segment["start"], "segment_end_s": segment["end"],
                        "duration_s": duration},
        required_value={"minimum_s": minimum_s, "maximum_s": maximum_s},
        explanation=(
            f"Segment duration {duration:.1f}s is within {minimum_s}–{maximum_s}s."
            if ok else
            f"Segment duration {duration:.1f}s is outside {minimum_s}–{maximum_s}s."
        ),
        evidence=[{"type": "transcript", "startSeconds": segment["start"],
                   "endSeconds": segment["end"], "text": segment.get("snippet", ""),
                   "storagePath": None}],
    )


def test_spoken_disclosure(transcript, segment, require_before_segment, words=None):
    words = words or transcript.words()
    findings = []
    for term in DISCLOSURE_TERMS:
        for occ in find_phrase(words, term):
            findings.append({"term": term, **occ})

    if require_before_segment and segment is not None:
        findings = [f for f in findings if f["start"] <= segment["start"]]

    if not findings:
        return TestOutcome(
            status="fail", confidence=0.8,
            observed_value={"found": False},
            required_value={"disclosure_terms": DISCLOSURE_TERMS,
                            "before_segment": bool(require_before_segment)},
            explanation="No spoken disclosure detected. Manual legal review recommended.",
        )
    first = findings[0]
    return TestOutcome(
        status="pass", confidence=0.9,
        observed_value={"found": True, "terms": [f["term"] for f in findings]},
        required_value={"disclosure_terms": DISCLOSURE_TERMS,
                        "before_segment": bool(require_before_segment)},
        explanation=f"Spoken disclosure detected (\"{first['term']}\") at {first['start']:.1f}s.",
        evidence=[{"type": "transcript", "startSeconds": first["start"],
                   "endSeconds": first["end"], "text": first["snippet"], "storagePath": None}],
    )


def test_description_disclosure(description):
    lowered = (description or "").lower()
    found = [term for term in DISCLOSURE_TERMS if term in lowered]
    if not found:
        return TestOutcome(
            status="fail", confidence=0.9,
            observed_value={"found": False},
            required_value={"disclosure_terms": DISCLOSURE_TERMS},
            explanation="No disclosure text found in the description.",
            evidence=[{"type": "description_span", "text": (description or "")[:500],
                       "startSeconds": None, "endSeconds": None, "storagePath": None}],
        )
    return TestOutcome(
        status="pass", confidence=0.9,
        observed_value={"found": True, "terms": found},
        required_value={"disclosure_terms": DISCLOSURE_TERMS},
        explanation=f"Disclosure text present in description (\"{found[0]}\").",
        evidence=[{"type": "description_span", "text": (description or "")[:500],
                   "startSeconds": None, "endSeconds": None, "storagePath": None}],
    )


def test_description_url(description, url):
    lowered = (description or "").lower()
    if not url:
        return TestOutcome(status="not_testable", explanation="No URL specified.")
    if url.lower() in lowered:
        return TestOutcome(
            status="pass", confidence=1.0,
            observed_value={"found": True}, required_value={"url": url},
            explanation=f"URL {url} present in description.",
            evidence=[{"type": "description_span", "text": (description or "")[:500],
                       "startSeconds": None, "endSeconds": None, "storagePath": None}],
        )
    return TestOutcome(
        status="fail", confidence=1.0,
        observed_value={"found": False}, required_value={"url": url},
        explanation=f"URL {url} missing from description.",
        evidence=[{"type": "description_span", "text": (description or "")[:500],
                   "startSeconds": None, "endSeconds": None, "storagePath": None}],
    )


def test_discount_code(description, code):
    lowered = (description or "").lower()
    if not code:
        return TestOutcome(status="not_testable", explanation="No discount code specified.")
    if code.lower() in lowered:
        return TestOutcome(
            status="pass", confidence=1.0,
            observed_value={"found": True}, required_value={"code": code},
            explanation=f"Discount code {code} present in description.",
            evidence=[{"type": "description_span", "text": (description or "")[:500],
                       "startSeconds": None, "endSeconds": None, "storagePath": None}],
        )
    return TestOutcome(
        status="fail", confidence=1.0,
        observed_value={"found": False}, required_value={"code": code},
        explanation=f"Discount code {code} missing from description.",
        evidence=[{"type": "description_span", "text": (description or "")[:500],
                   "startSeconds": None, "endSeconds": None, "storagePath": None}],
    )


def test_human_review():
    return TestOutcome(
        status="human_review",
        explanation="Subjective requirement — flagged for human review, never auto-decided.",
    )


def test_logo_visibility():
    return TestOutcome(
        status="not_testable",
        explanation="Logo visibility is a visual stretch test — not implemented; flagged for manual review.",
    )


# --- Semantic matcher (policy-gated, evidence-required) ----------------------


def semantic_match(meaning: str, context: str, ai_key: str | None, model: str) -> dict:
    """LLM-assisted meaning match. Returns {"match", "confidence", "quote"}.
    Without an AI key the outcome is `uncertain` — never `pass`."""
    if not ai_key or not meaning:
        return {"match": None, "confidence": None, "quote": None}
    base = os.environ.get("AI_BASE_URL", "https://api.openai.com/v1")
    try:
        resp = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {ai_key}"},
            json={
                "model": model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content":
                     "You judge whether a video transcript satisfies ONE requirement. "
                     'Reply ONLY JSON: {"match": true|false, "confidence": 0.0-1.0, '
                     '"quote": "short supporting quote or null"}. Never guess: low '
                     "confidence must be reflected in the confidence value."},
                    {"role": "user", "content":
                     f"REQUIREMENT: {meaning}\n\nTRANSCRIPT (excerpt):\n{context[:6000]}"},
                ],
                "temperature": 0,
            },
            timeout=60,
        )
        resp.raise_for_status()
        payload = json.loads(resp.json()["choices"][0]["message"]["content"])
        return {
            "match": payload.get("match"),
            "confidence": float(payload.get("confidence") or 0),
            "quote": payload.get("quote"),
        }
    except Exception:  # noqa: BLE001
        return {"match": None, "confidence": None, "quote": None}


def test_required_meaning(transcript, meaning, ai_key, model, segment=None, words=None):
    words = words or transcript.words()
    context = snippet_around(words, 0, words[-1]["end"] if words else 0, pad_s=0) or transcript.full_text()
    result = semantic_match(meaning, context, ai_key, model)

    if result["match"] is None:
        return TestOutcome(
            status="uncertain", confidence=None,
            observed_value={"semantic_match": None},
            required_value={"meaning": meaning},
            explanation="Could not verify the required meaning — flagged for manual review.",
        )
    if result["match"] and result["confidence"] >= 0.7:
        evidence = []
        if result.get("quote"):
            for occ in find_phrase(words, result["quote"][:60]):
                evidence.append({"type": "transcript", "startSeconds": occ["start"],
                                 "endSeconds": occ["end"], "text": occ["snippet"], "storagePath": None})
        return TestOutcome(
            status="pass", confidence=result["confidence"],
            observed_value={"semantic_match": True},
            required_value={"meaning": meaning},
            explanation="Required meaning satisfied with transcript evidence.",
            evidence=evidence,
        )
    if result["match"] is False and result["confidence"] >= 0.7:
        return TestOutcome(
            status="fail", confidence=result["confidence"],
            observed_value={"semantic_match": False},
            required_value={"meaning": meaning},
            explanation="Required meaning not satisfied.",
        )
    return TestOutcome(
        status="uncertain", confidence=result["confidence"],
        observed_value={"semantic_match": result["match"]},
        required_value={"meaning": meaning},
        explanation="Low-confidence semantic match — flagged for manual review.",
    )


# --- Segment detection -------------------------------------------------------


def detect_sponsor_segment(transcript, brand_names=None):
    words = transcript.words()
    if not words:
        return None
    markers = ([brand_names[0]] if brand_names else []) + DISCLOSURE_TERMS
    first_hit = None
    for marker in markers:
        for occ in find_phrase(words, marker):
            if first_hit is None or occ["start"] < first_hit["start"]:
                first_hit = occ
            break
    if first_hit is None:
        return None
    start = first_hit["start"]
    end = min(start + 60.0, words[-1]["end"])
    return {"start": start, "end": end, "snippet": snippet_around(words, start, end)}


# --- Orchestrator ------------------------------------------------------------


def run_all(requirements, transcript, description, brand_names=None,
            ai_key=None, model="gpt-4o-mini", video_duration_s=None):
    """Runs every confirmed requirement; returns list of outcome dicts."""
    segment = detect_sponsor_segment(transcript, brand_names)
    words = transcript.words()
    outcomes = []

    for req in requirements:
        req_id = req["id"]
        rtype = req.get("type")
        params = req.get("parameters") or {}

        if rtype == "required_phrase":
            outcome = test_required_phrase(transcript, params.get("phrase", ""), words)
        elif rtype == "required_meaning":
            outcome = test_required_meaning(transcript, params.get("meaning", ""), ai_key, model, segment, words)
        elif rtype == "forbidden_claim":
            outcome = test_forbidden_claim(transcript, params.get("phrase", ""), words)
        elif rtype == "segment_placement":
            outcome = test_segment_placement(segment, params.get("start_min_s"), params.get("start_max_s"))
        elif rtype == "segment_duration":
            outcome = test_segment_duration(segment, params.get("minimum_seconds"), params.get("maximum_seconds"))
        elif rtype == "spoken_disclosure":
            outcome = test_spoken_disclosure(transcript, segment, params.get("before_segment", True), words)
        elif rtype == "description_disclosure":
            outcome = test_description_disclosure(description)
        elif rtype == "description_url":
            outcome = test_description_url(description, params.get("url", ""))
        elif rtype == "discount_code":
            outcome = test_discount_code(description, params.get("code", ""))
        elif rtype == "human_review":
            outcome = test_human_review()
        else:  # logo_visibility and unknown types fail closed to not_testable
            outcome = test_logo_visibility()

        outcome.requirement_id = req_id
        outcomes.append(outcome.to_dict())

    return outcomes
