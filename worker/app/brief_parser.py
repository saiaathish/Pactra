"""Sponsor brief → typed requirement candidates.

pypdf extracts the text; an LLM converts prose into Pactra's requirement
schema. The creator reviews candidates before they become an immutable brief
version — the LLM never issues final verdicts.
"""

from __future__ import annotations

import hashlib
import json
import os
import re

import httpx
from pypdf import PdfReader

REQUIREMENT_TYPES = [
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
]

VERIFICATION_MODES = [
    "deterministic",
    "semantic_with_evidence",
    "visual_with_evidence",
    "human_required",
]

SYSTEM_PROMPT = (
    "You convert sponsor briefs into structured requirements for a video compliance checker.\n"
    'Return ONLY JSON: {"requirements": [ ... ]}.\n\n'
    "Each requirement:\n"
    '- "key": short snake_case slug\n'
    '- "type": one of: ' + ", ".join(REQUIREMENT_TYPES) + "\n"
    '- "description": one sentence, human-readable\n'
    '- "parameters": typed values:\n'
    '  * segment_placement: {"start_min_s": number|null, "start_max_s": number|null}\n'
    '  * segment_duration: {"minimum_seconds": number, "maximum_seconds": number}\n'
    '  * required_phrase / forbidden_claim: {"phrase": "exact phrase to find"}\n'
    '  * required_meaning: {"meaning": "semantic requirement sentence"}\n'
    '  * spoken_disclosure: {"before_segment": bool}\n'
    '  * description_url: {"url": "exact url string"}\n'
    '  * discount_code: {"code": "exact code, e.g. SAI20"}\n'
    '  * description_disclosure, logo_visibility, human_review: {}\n'
    '- "verificationMode": one of: ' + ", ".join(VERIFICATION_MODES) + "\n"
    '  Use "human_required" + type "human_review" for subjective direction '
    '("feel natural", "be excited", "don\'t sound scripted").\n'
    '- "sourcePage": 1-based page number when known, else null\n'
    '- "sourceQuote": the exact brief sentence this came from, when available\n\n'
    "Extract every objective deliverable (talking points, exact offers, discount\n"
    "codes, timing windows, durations, forbidden claims, disclosure requirements,\n"
    "links, CTAs, product name spellings). Do not invent requirements."
)

TYPE_DEFAULT_VERIFICATION = {
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


def extract_text(path: str) -> list:
    """Returns [{page, text}] per page."""
    reader = PdfReader(path)
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"page": i, "text": text})
    return pages


def _validate(requirements: list) -> list:
    valid = []
    for req in requirements:
        if not isinstance(req, dict):
            continue
        rtype = req.get("type")
        if rtype not in REQUIREMENT_TYPES:
            continue
        if not (req.get("description") or "").strip():
            continue
        params = req.get("parameters") or {}
        if not isinstance(params, dict):
            params = {}
        if rtype == "human_review":
            params = {}
        req["parameters"] = params
        verification = req.get("verificationMode") or req.get("verification")
        if verification not in VERIFICATION_MODES:
            verification = TYPE_DEFAULT_VERIFICATION.get(rtype, "deterministic")
        req["verificationMode"] = verification
        req["sourceEvidence"] = {
            "page": req.get("sourcePage") if isinstance(req.get("sourcePage"), int) else None,
            "quote": req.get("sourceQuote") or None,
        }
        valid.append(req)
    return valid


def extract_requirements(text_by_page: list, ai_key: str | None, model: str) -> list:
    combined = "\n\n".join(f"[Page {p['page']}]\n{p['text']}" for p in text_by_page)
    if not combined.strip() or not ai_key:
        return []

    base = os.environ.get("AI_BASE_URL", "https://api.openai.com/v1")
    resp = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {ai_key}"},
        json={
            "model": model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": combined},
            ],
            "temperature": 0.1,
        },
        timeout=120,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        payload = json.loads(match.group(0)) if match else {}
    return _validate(payload.get("requirements", []))


def parse_brief(path: str) -> dict:
    """Full parse: pages, raw text, SHA-256, candidate requirements."""
    pages = extract_text(path)
    ai_key = os.environ.get("AI_API_KEY")
    model = os.environ.get("AI_MODEL", "gpt-4o-mini")
    requirements = extract_requirements(pages, ai_key, model)
    with open(path, "rb") as f:
        sha256 = hashlib.sha256(f.read()).hexdigest()
    return {
        "pages": pages,
        "text": "\n\n".join(p["text"] for p in pages),
        "sha256": sha256,
        "requirements": requirements,
    }
