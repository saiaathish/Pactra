import { LandingNav } from "@/components/landing-nav";
import { LandingHero } from "@/components/landing-hero";
import { LandingSections } from "@/components/landing-sections";

/**
 * Landing page — "Elegant Dark Mode" replication of the Stitch prototype
 * (docs/design/prototype-canvas.png). Near-black canvas, ambient animated
 * indigo-violet wave behind the hero, solid near-white headline.
 */
export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas text-ink">
      <LandingNav />
      <LandingHero />
      <LandingSections />
    </main>
  );
}
