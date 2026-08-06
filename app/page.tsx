import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="text-lg font-semibold tracking-tight">Pactra</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-zinc-400 hover:text-zinc-100">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-24 pt-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          A sponsor brief should behave like a{" "}
          <span className="text-indigo-400">software specification</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
          Upload the sponsor brief, rough cut, and description. Pactra compiles
          the brief into executable tests, checks the actual video, and
          produces a timestamped proof-of-compliance packet — so the final
          video passes or fails before the brand ever sees it.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
          >
            Create account
          </Link>
          <a
            href="#how-it-works"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-zinc-300 hover:border-zinc-500"
          >
            How it works
          </a>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
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
          ].map((card) => (
            <div
              key={card.step}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
            >
              <div className="text-sm font-semibold text-indigo-400">{card.step}</div>
              <h3 className="mt-2 text-lg font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{card.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="text-lg font-semibold">The wrapper test</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Remove the LLM and Pactra still does: FFmpeg media processing,
            timestamped transcript indexing, segment timing, exact-phrase and
            forbidden-claim checking, description URL/code validation,
            disclosure position checks, evidence clipping, video hashing, and
            approval-report generation. The LLM only converts messy briefs into
            structured candidate requirements — it never issues a verdict.
          </p>
        </div>
      </section>

      <footer className="border-t border-zinc-800 px-6 py-8 text-sm text-zinc-500">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span>© {new Date().getFullYear()} Pactra</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-zinc-300">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300">Terms</Link>
            <Link href="/support" className="hover:text-zinc-300">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
