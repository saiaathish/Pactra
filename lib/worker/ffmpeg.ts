/**
 * SERVER-ONLY FFmpeg/ffprobe helpers (replaces the Python worker's
 * video_analysis module). Static binaries come from ffmpeg-static /
 * ffprobe-static; on Vercel they resolve to linux-x64 builds.
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const execFileAsync = promisify(execFile);

const FFMPEG = ffmpegPath ?? "ffmpeg";
const FFPROBE = ffprobeStatic.path;

export interface ProbeResult {
  durationSeconds: number;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

/** Streaming SHA-256 of a file (the exact bytes tested). */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Returns duration/stream metadata via ffprobe. */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath,
  ]);
  const payload = JSON.parse(stdout);
  let duration: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  for (const stream of payload.streams ?? []) {
    if (stream.codec_type === "video") {
      width = stream.width ?? null;
      height = stream.height ?? null;
      if (duration === null) duration = Number(stream.duration) || 0;
    }
  }
  if (duration === null) duration = Number(payload.format?.duration) || 0;
  return {
    durationSeconds: duration,
    width,
    height,
    sizeBytes: Number(payload.format?.size) || 0,
  };
}

/** Extracts mono 16 kHz WAV for transcription. */
export async function extractAudio(videoPath: string, outPath: string): Promise<string> {
  await execFileAsync(FFMPEG, ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", outPath]);
  return outPath;
}

/** Cuts an evidence clip (re-encoded, capped at 20s). */
export async function extractSegment(
  videoPath: string,
  startS: number,
  endS: number,
  outPath: string
): Promise<string> {
  const duration = Math.min(endS - startS, 20.0);
  await execFileAsync(FFMPEG, [
    "-y", "-ss", String(Math.max(startS, 0)), "-i", videoPath,
    "-t", String(duration), "-vf", "scale=640:-2", "-c:v", "libx264",
    "-preset", "veryfast", "-c:a", "aac", "-movflags", "+faststart", outPath,
  ]);
  return outPath;
}

/** Samples 1 fps frames (used by the stretch logo-visibility test). */
export async function sampleFrames(
  videoPath: string,
  outDir: string,
  intervalS = 1.0
): Promise<string[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const pattern = path.join(outDir, "frame-%04d.jpg");
  await execFileAsync(FFMPEG, [
    "-y", "-i", videoPath, "-vf", `fps=1/${intervalS}`, "-q:v", "3", pattern,
  ]);
  return fs.readdirSync(outDir).sort();
}
