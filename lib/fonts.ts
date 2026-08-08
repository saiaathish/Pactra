import localFont from "next/font/local";

/**
 * Self-hosted font pairing for the "Elegant Dark Mode" landing:
 *  - Instrument Serif (display) — identified by pixel render-comparison
 *    against the Stitch prototype headline (only font matching BOTH lines).
 *  - Outfit (body) — ambient geometric sans, the pairing's quiet counterpoint.
 *  - JetBrains Mono (mono) — step numbers and metadata.
 * All files live in public/fonts (zero external font requests at runtime).
 */
export const displayFont = localFont({
  src: "../public/fonts/instrument-serif-400.ttf",
  variable: "--font-display",
  weight: "400",
  display: "swap",
});

export const bodyFont = localFont({
  src: "../public/fonts/outfit-var.ttf",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

export const monoFont = localFont({
  src: "../public/fonts/jetbrains-mono-var.ttf",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
});
