import Link from "next/link";

const pulseStyle = `
  .pactra-nav-dot {
    animation: pactra-nav-pulse 3.2s ease-in-out infinite;
  }
  @keyframes pactra-nav-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.55; transform: scale(0.82); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pactra-nav-dot {
      animation: none;
    }
  }
`;

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/70 backdrop-blur-md">
      <style>{pulseStyle}</style>
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-zinc-100"
        >
          <span
            aria-hidden="true"
            className="pactra-nav-dot h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#6C88C3] to-[#453398]"
          />
          Pactra
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-3 py-2.5 text-sm text-zinc-400 transition-colors duration-200 hover:text-zinc-100"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-gradient-to-b from-[#7A6FF5] via-[#665AEF] to-[#453398]/80 px-5 py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-[filter,transform] duration-200 ease-out hover:brightness-110 active:translate-y-px"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
