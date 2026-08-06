"""Smoke tests for the deterministic test engine (wrapper test: no LLM).

Covers the analysis safety model:
  deterministic → engine decides; semantic low-confidence → uncertain;
  subjective → human_review; unimplemented visual → not_testable.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))

from requirement_tests import (  # noqa: E402
    Transcript,
    detect_sponsor_segment,
    run_all,
    test_description_disclosure,
    test_description_url,
    test_discount_code,
    test_forbidden_claim,
    test_human_review,
    test_logo_visibility,
    test_required_meaning,
    test_required_phrase,
    test_segment_duration,
    test_segment_placement,
    test_spoken_disclosure,
)

FAILURES = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {name} {detail}")
    if not condition:
        FAILURES.append(name)


def make_transcript():
    words = [
        {"start": 0.0, "end": 0.8, "text": "hey everyone"},
        {"start": 0.8, "end": 1.6, "text": "today's"},
        {"start": 1.6, "end": 2.4, "text": "video"},
        {"start": 2.4, "end": 3.2, "text": "is"},
        {"start": 3.2, "end": 4.0, "text": "sponsored"},
        {"start": 4.0, "end": 4.8, "text": "by"},
        {"start": 4.8, "end": 5.6, "text": "acme"},
        {"start": 5.6, "end": 6.4, "text": "use"},
        {"start": 6.4, "end": 7.2, "text": "code"},
        {"start": 7.2, "end": 8.0, "text": "SAI20"},
        {"start": 8.0, "end": 8.8, "text": "for"},
        {"start": 8.8, "end": 9.6, "text": "a"},
        {"start": 9.6, "end": 10.4, "text": "free"},
        {"start": 10.4, "end": 11.2, "text": "trial"},
        {"start": 11.2, "end": 12.0, "text": "guaranteed"},
        {"start": 12.0, "end": 12.8, "text": "growth"},
    ]
    return Transcript(
        [{"start": w["start"], "end": w["end"], "text": w["text"], "words": [w]} for w in words]
    )


def main():
    transcript = make_transcript()

    print("required_phrase (deterministic):")
    r = test_required_phrase(transcript, "free trial")
    check("exact phrase found -> pass", r.status == "pass", f"(got {r.status})")
    check("timestamped evidence", bool(r.evidence) and r.evidence[0]["startSeconds"] == 9.6)
    r = test_required_phrase(transcript, "30 day free trial")
    check("absent phrase -> uncertain, never pass", r.status == "uncertain", f"(got {r.status})")

    print("forbidden_claim (deterministic):")
    r = test_forbidden_claim(transcript, "guaranteed growth")
    check("forbidden phrase -> fail with timestamp", r.status == "fail" and r.evidence[0]["startSeconds"] == 11.2)

    print("segment tests (deterministic):")
    segment = detect_sponsor_segment(transcript)
    check("segment detected", segment is not None)
    if segment:
        check("segment starts at disclosure", abs(segment["start"] - 3.2) < 0.01)
    r = test_segment_placement(segment, 2.0, 4.0)
    check("placement in window -> pass", r.status == "pass")
    r = test_segment_placement(segment, 0.0, 2.0)
    check("placement outside window -> fail", r.status == "fail")
    r = test_segment_duration(segment, 45, 60)
    check("duration too short -> fail", r.status == "fail", f"(got {r.status})")
    r = test_segment_duration(None, 45, 60)
    check("missing segment -> not_testable", r.status == "not_testable")

    print("disclosure (deterministic):")
    r = test_spoken_disclosure(transcript, segment, True)
    check("spoken disclosure before segment -> pass", r.status == "pass")
    r = test_description_disclosure("Great video! link in bio")
    check("description without disclosure -> fail", r.status == "fail")
    r = test_description_disclosure("Sponsored by Acme — link below")
    check("description with disclosure -> pass", r.status == "pass")

    print("description deliverables (deterministic):")
    r = test_description_url("Get 20% off at https://acme.com/sai20", "https://acme.com/sai20")
    check("URL present -> pass", r.status == "pass")
    r = test_description_url("Great video!", "https://acme.com/sai20")
    check("URL missing -> fail", r.status == "fail")
    r = test_discount_code("Use SAI20 at checkout", "SAI20")
    check("code present -> pass", r.status == "pass")
    r = test_discount_code("Great video!", "SAI20")
    check("code missing -> fail", r.status == "fail")

    print("safety model:")
    check("human_review requirement -> human_review", test_human_review().status == "human_review")
    check("logo_visibility -> not_testable (no fake pass)", test_logo_visibility().status == "not_testable")
    r = test_required_meaning(transcript, "mentions a discount", None, "gpt-4o-mini")
    check("semantic without AI key -> uncertain, never pass", r.status == "uncertain", f"(got {r.status})")

    print("run_all orchestration:")
    requirements = [
        {"id": "r1", "type": "required_phrase", "parameters": {"phrase": "free trial"}},
        {"id": "r2", "type": "forbidden_claim", "parameters": {"phrase": "guaranteed growth"}},
        {"id": "r3", "type": "human_review", "parameters": {}},
        {"id": "r4", "type": "logo_visibility", "parameters": {}},
        {"id": "r5", "type": "discount_code", "parameters": {"code": "SAI20"}},
    ]
    outcomes = run_all(requirements, transcript, "Use SAI20 at checkout", brand_names=["acme"])
    by_id = {o["requirement_id"]: o for o in outcomes}
    check("r1 pass", by_id["r1"]["status"] == "pass")
    check("r2 fail", by_id["r2"]["status"] == "fail")
    check("r3 human_review", by_id["r3"]["status"] == "human_review")
    check("r4 not_testable", by_id["r4"]["status"] == "not_testable")
    check("r5 pass (description code)", by_id["r5"]["status"] == "pass")
    check("every fail has evidence", all(
        o["status"] != "fail" or len(o["evidence"]) > 0 for o in outcomes))

    again = run_all(requirements, transcript, "Use SAI20 at checkout", brand_names=["acme"])
    check(
        "deterministic across runs",
        [o["status"] for o in outcomes] == [o["status"] for o in again],
    )

    print()
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} checks — {FAILURES}")
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
