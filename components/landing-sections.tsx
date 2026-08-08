import Link from "next/link";

const steps = [
  {
    step: "01",
    title: "Compile",
    body: "Upload the sponsor PDF. Pactra extracts typed, reviewable requirements — talking points, discount codes, timing windows, forbidden claims, disclosure rules, links.",
  },
  {
    step: "02",
    title: "Test",
    body: "Upload the rough cut and paste the description. Deterministic checks verify each requirement against the actual video and transcript.",
  },
  {
    step: "03",
    title: "Prove",
    body: "Every verdict carries exact timestamps, evidence clips, and the SHA-256 of the exact file tested. Pass → a cryptographically bound approval manifest.",
  },
] as const;

export function LandingSections() {
  return (
    <>
      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-24">
        {/* The prototype shows no "How it works" eyebrow — screen-reader-only
            heading keeps the h1 → h2 → h3 hierarchy intact. */}
        <h2 className="sr-only">How it works</h2>

        <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.step} className="border-t border-zinc-800 pt-8">
              {/* Step numbers are light gray in the prototype (#9A9A9A), not accent. */}
              <p className="font-mono text-sm text-[#9A9A9A]">{step.step}</p>
              <h3 className="mt-4 font-display text-xl text-zinc-100">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-20 rounded-xl border border-hairline bg-raised/60 p-8">
          <h3 className="font-display text-lg text-zinc-100">The wrapper test</h3>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400">
            Remove the LLM and Pactra still does: FFmpeg media processing,
            timestamped transcript indexing, segment timing, exact-phrase and
            forbidden-claim checking, description URL/code validation,
            disclosure position checks, evidence clipping, video hashing, and
            approval-report generation. The LLM only converts messy briefs into
            structured candidate requirements — it never issues a verdict.
          </p>
        </div>
      </section>

      <footer className="mt-20 border-t border-hairline px-6 py-8 text-sm text-zinc-400">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Pactra</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-1">
            <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-zinc-200">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-zinc-200">
              Terms
            </Link>
            <Link href="/support" className="inline-flex min-h-11 items-center hover:text-zinc-200">
              Support
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
