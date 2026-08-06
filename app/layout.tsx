import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pactra — CI/CD for Sponsored YouTube Videos",
  description:
    "Upload the sponsor brief, rough cut, and description. Pactra converts the brief into executable tests, checks the actual video, and produces a timestamped proof-of-compliance packet for approval.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
