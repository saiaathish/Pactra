import type { Metadata } from "next";
import "./globals.css";
import { bodyFont, displayFont, monoFont } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Pactra — CI/CD for Sponsored YouTube Videos",
  description:
    "Upload the sponsor brief, rough cut, and description. Pactra converts the brief into executable tests, checks the actual video, and produces a timestamped proof-of-compliance packet for approval.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
