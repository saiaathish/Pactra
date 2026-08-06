import path from "node:path";
import type { NextConfig } from "next";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

// Static binary paths are computed dynamically by ffmpeg-static /
// ffprobe-static, so include them explicitly in the serverless bundle.
// Entries must be RELATIVE to the project root — absolute paths get joined
// with the tracing root again on Vercel (doubled /vercel/path0 prefix).
const ffmpegRel = ffmpegPath ? path.relative(process.cwd(), ffmpegPath) : null;
const ffprobeRel = path.relative(process.cwd(), ffprobeStatic.path);

const nextConfig: NextConfig = {
  // Videos never route through Next.js — they go browser -> Firebase Storage
  // and the in-app pipeline -> Firebase Storage.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/campaigns/[id]/analyze": [ffmpegRel ?? "ffmpeg", ffprobeRel],
    // pdfjs loads its worker via a dynamic import — include it explicitly.
    "/api/briefs/[id]/versions": ["node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
