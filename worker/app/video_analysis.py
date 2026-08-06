"""FFmpeg/ffprobe helpers: probing, hashing, audio extraction, clipping."""

import hashlib
import json
import subprocess

FFMPEG = "/usr/bin/ffmpeg"
FFPROBE = "/usr/bin/ffprobe"


def sha256_file(path: str) -> str:
    """Streaming SHA-256 of a video file (the exact bytes tested)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def probe_video(path: str, ffprobe: str = FFPROBE) -> dict:
    """Returns duration/stream metadata via ffprobe."""
    out = subprocess.run(
        [
            ffprobe, "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", path,
        ],
        check=True, capture_output=True, text=True,
    )
    payload = json.loads(out.stdout)
    duration = None
    width = height = None
    for stream in payload.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width")
            height = stream.get("height")
            if duration is None:
                duration = float(stream.get("duration") or 0)
    if duration is None:
        duration = float(payload.get("format", {}).get("duration") or 0)
    return {
        "duration_seconds": duration,
        "width": width,
        "height": height,
        "size_bytes": int(payload.get("format", {}).get("size") or 0),
    }


def extract_audio(video_path: str, out_path: str, ffmpeg: str = FFMPEG) -> str:
    """Extracts mono 16 kHz WAV for transcription."""
    subprocess.run(
        [ffmpeg, "-y", "-i", video_path, "-vn", "-ac", "1", "-ar", "16000", out_path],
        check=True, capture_output=True,
    )
    return out_path


def extract_segment(video_path: str, start_s: float, end_s: float,
                    out_path: str, ffmpeg: str = FFMPEG) -> str:
    """Cuts an evidence clip (re-encoded, capped at 20s)."""
    duration = min(end_s - start_s, 20.0)
    subprocess.run(
        [
            ffmpeg, "-y", "-ss", str(max(start_s, 0)), "-i", video_path,
            "-t", str(duration), "-vf", "scale=640:-2", "-c:v", "libx264",
            "-preset", "veryfast", "-c:a", "aac", "-movflags", "+faststart",
            out_path,
        ],
        check=True, capture_output=True,
    )
    return out_path


def sample_frames(video_path: str, out_dir: str, interval_s: float = 1.0,
                  ffmpeg: str = FFMPEG) -> list:
    """Samples 1 fps frames (used by the stretch logo-visibility test)."""
    import os
    os.makedirs(out_dir, exist_ok=True)
    pattern = os.path.join(out_dir, "frame-%04d.jpg")
    subprocess.run(
        [ffmpeg, "-y", "-i", video_path, "-vf", f"fps=1/{interval_s}", "-q:v", "3", pattern],
        check=True, capture_output=True,
    )
    return sorted(os.listdir(out_dir))
