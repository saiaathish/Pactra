"""Timestamped transcription via an OpenAI-compatible audio API.

Returns segments with best-effort word-level timestamps. When a provider
rejects `timestamp_granularities`, retries without it (segment-level only).
"""

import os

import httpx

from .video_analysis import extract_audio


def transcribe_audio_file(audio_path: str) -> list:
    """Returns [{start, end, text, words:[{start,end,text}]}]."""
    api_key = os.environ["AI_API_KEY"]
    model = os.environ.get("AI_MODEL", "whisper-1")
    base = os.environ.get("AI_BASE_URL", "https://api.openai.com/v1")
    headers = {"Authorization": f"Bearer {api_key}"}

    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f, "audio/wav")}
        data = {
            "model": model,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "word",
        }
        resp = httpx.post(
            f"{base}/audio/transcriptions",
            headers=headers, files=files, data=data, timeout=600,
        )
        if resp.status_code == 400:
            # Provider without word-granularity support — retry segment-level.
            data.pop("timestamp_granularities[]")
            resp = httpx.post(
                f"{base}/audio/transcriptions",
                headers=headers, files=files, data=data, timeout=600,
            )
        resp.raise_for_status()

    payload = resp.json()
    segments = []
    for seg in payload.get("segments", []):
        words = [
            {"start": w.get("start", 0), "end": w.get("end", w.get("start", 0)), "text": w.get("text", "")}
            for w in seg.get("words", [])
        ]
        segments.append({
            "start": seg.get("start", 0),
            "end": seg.get("end", seg.get("start", 0)),
            "text": seg.get("text", ""),
            "words": words,
        })
    if not segments and payload.get("text"):
        segments.append({
            "start": 0, "end": payload.get("duration", 0),
            "text": payload["text"], "words": [],
        })
    return segments


def transcribe_video(video_path: str) -> list:
    """Extracts audio and returns word-timestamped transcript segments."""
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name
    try:
        extract_audio(video_path, audio_path)
        return transcribe_audio_file(audio_path)
    finally:
        try:
            os.remove(audio_path)
        except OSError:
            pass
