export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-400">
          <p>
            Pactra provides automated pre-publication compliance checks for
            sponsored content. Results are informational: a passing report does
            not constitute legal certification, and you remain responsible for
            meeting all applicable advertising and disclosure laws.
          </p>
          <p>
            Pactra connects to YouTube through official APIs under your
            authorization. Unauthorized use of another party&apos;s content or
            accounts is prohibited.
          </p>
          <p>
            Contact: support@pactra.app for any questions.
          </p>
        </div>
      </div>
    </main>
  );
}
