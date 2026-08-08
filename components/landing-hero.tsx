import { WaveBackground } from "@/components/wave-background";

/**
 * Hero for the "Elegant Dark Mode" landing redesign.
 * Left-aligned asymmetric hero on the near-black canvas (#08080D via bg-canvas),
 * with the animated indigo-violet wave (WaveBackground) drifting behind the
 * headline. Server component: zero hydration cost.
 */
export function LandingHero() {
  return (
    <section className="relative min-h-[100dvh] overflow-hidden bg-canvas">
      {/* Agent 3 (wave): absolute inset-0 fill, pointer-events-none, behind content */}
      <WaveBackground />

      {/* Soft canvas scrim: the wave "emerges from darkness" — the headline
          zone (top ~45%) stays near-black for contrast, the wave shows
          through below and at the edges. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas/80 via-canvas/45 to-transparent"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-28 md:pb-32 md:pt-40">
        {/* Solid near-white headline (prototype measurement #EAEAEA); bold for
            legibility over the wave crest (worst-case contrast ~2.5:1). */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          A sponsor brief should behave
          <br />
          like a software specification.
        </h1>

        <p className="font-body mt-6 max-w-2xl text-lg leading-relaxed text-muted-2">
          Upload the sponsor brief, rough cut, and description. Pactra compiles
          the brief into executable tests, checks the actual video, and produces
          a timestamped proof-of-compliance packet — so the final video passes
          or fails before the brand ever sees it.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="/signup"
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-lg bg-[#665AEF] px-7 font-medium text-white transition-[filter,transform] duration-200 ease-out hover:bg-[#7A6FF5] active:translate-y-px"
          >
            Create account
          </a>
          <a
            href="#how-it-works"
            className="inline-flex h-11 min-h-11 items-center justify-center rounded-lg border border-zinc-400/25 px-7 font-medium text-zinc-300 transition-[filter,transform] duration-200 ease-out hover:border-zinc-500 active:translate-y-px"
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}
