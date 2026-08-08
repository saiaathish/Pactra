# Performance Acceptance — Landing Redesign "Elegant Dark"

**Owner:** agent 7 (performance acceptance, read-only)
**Branch:** `feature/landing-elegant-dark`
**Status:** pre-integration checklist. Wave, fonts, and landing components were
not yet on disk when this was written (parallel build in flight); run all
checks after `app/page.tsx` integration. Every item is PASS/FAIL and
machine-checkable. One FAIL on a hard gate (marked **[GATE]**) → orchestration
must not merge.

Reference: `docs/design/landing-spec.md` §6 (wave) and §7 (tech constraints).
Baseline facts: pre-redesign `/` route is a single self-contained server
component (`app/page.tsx`) with no client JS beyond Next's shared runtime, no
fonts, no wave. `package.json` deps: next 15.3.1, react 19.1.0, tailwind 4
(dev), firebase/mongodb/etc. (app deps, not landing deps).

---

## A. Wave Animation (`components/wave-background.tsx`)

- **[GATE] WAVE-1 — Transform/opacity only.** The `@keyframes` block(s) must
  animate ONLY `transform: translateX(...)` and `opacity`. No `left`, `top`,
  `right`, `bottom`, `width`, `height`, `margin`, `padding`, or
  `transform: translate(...)` (2D, non-X) inside any keyframe.
  ```
  grep -nE '^\s*(left|top|right|bottom|width|height|margin|padding|translate)' components/wave-background.tsx
  ```
  Any hit inside `@keyframes` = FAIL. `translateX` inside `transform:` only.

- **WAVE-2 — Compositor drift, not repaint.** Seamless drift must be
  implemented as duplicated wave groups (`<g>` or `<use>` x2) animated
  `translateX(0 → -50%)` with `linear infinite` (spec durations ~22s/34s/48s,
  staggered delays). Verify `-50%` appears in the keyframes and the layer
  markup duplicates the path group. No `transform: translate3d(...)` with
  non-100% widths, no per-frame JS stepping.

- **[GATE] WAVE-3 — CSS-only, server component.** File MUST NOT contain
  `"use client"`, and must contain no `useEffect`, `useState`,
  `requestAnimationFrame`, `addEventListener`, `onScroll`, `onPointer*`,
  `useLayoutEffect`, or `new MutationObserver`. Ideal: zero JS execution.
  ```
  grep -nE 'use client|useEffect|useState|requestAnimationFrame|addEventListener|onScroll|onPointer|useLayoutEffect|MutationObserver' components/wave-background.tsx
  ```
  Any hit = FAIL (spec §6: CSS-only, zero hydration cost). If a hit is
  unavoidable, the whole animation must still be CSS — JS may only toggle a
  class/attribute, never drive frames.

- **WAVE-4 — `will-change: transform` on animated layers ONLY.** Every
  animated layer carries `will-change: transform`; static layers (the wave
  container, the section wrapper, the duplicated-but-static copy if any) do
  NOT carry `will-change`. Apply on the animated `<g>`/layer elements, not on
  the hero or body. (Tailwind: `will-change-transform` on layer elements only.)
  `will-change` on static elements = FAIL (pins memory).

- **WAVE-5 — Layer budget.** Opacity/gradient layers ≤ 4 total (spec: 3–4).
  Count layer elements / `<path>` fills:
  ```
  grep -c '<path' components/wave-background.tsx
  ```
  > 4 fill layers = FAIL. Gradients + large SVGs are paint-heavy even when
  static; 4 layers is the ceiling. (See LCP-3 for paint-cost recommendation.)

- **WAVE-6 — Reduced motion.** `prefers-reduced-motion: reduce` media query
  present and sets `animation: none` (or `animation-play-state: paused` +
  static state) on all wave layers. Verify the media query targets the same
  classes as the animation:
  ```
  grep -n 'prefers-reduced-motion' components/wave-background.tsx
  ```

- **WAVE-7 — Containment & hit-testing.** Wave container: `overflow-hidden`,
  `pointer-events-none`, `absolute inset-0`, `z-0` (content `z-10`), inside
  the hero only. `contain: paint` on the wave container is REQUIRED
  (recommendation, see LCP-3). Static-layer rule: `contain: paint` on static
  layers is fine; `will-change` is not.

- **WAVE-8 — No layout thrash.** Grep shows no reads of `getBoundingClientRect`
  / `offsetHeight` / `scrollTop` anywhere in the landing component tree —
  trivially true if WAVE-3 passes; re-check if any client child exists.

## B. Fonts (`lib/fonts.ts`, `public/fonts/`, `app/layout.tsx`)

- **[GATE] FONT-1 — Self-hosted, zero external font requests.** All fonts via
  `next/font/local` (src in `public/fonts/`). No `fonts.googleapis.com`,
  `fonts.gstatic.com`, `@fontsource`, or `<link rel="stylesheet">` font links
  anywhere in the landing tree or `app/layout.tsx`:
  ```
  grep -rn 'googleapis\|gstatic\|fontsource' app/ components/ lib/ --include='*.tsx' --include='*.ts' --include='*.css'
  ```
  Runtime verification: network trace of `/` shows ZERO requests to external
  hosts (see E). Any external font request = FAIL.

- **FONT-2 — Variable fonts, subset axes.** Font files in `public/fonts/` are
  `.woff2` variable fonts (one file per family, e.g. `*-variable.woff2`).
  No static per-weight files unless the family is not variable (then max 2–3
  weights: 400/500/600/700 as actually used). No unused axes shipped
  (grep `fvar`/axes only if tooling available — otherwise file count is the
  proxy). Font family count: display + body + mono ≤ 3.

- **FONT-3 — `font-display`.** next/font default (`swap` for local fonts) is
  acceptable — do not override to `block`. Verify the emitted `@font-face`
  in the built CSS has `font-display: swap` (or `auto`):
  ```
  grep -o 'font-display:[a-z]*' .next/static/css/*.css | sort -u
  ```

- **FONT-4 — Payload budget: < 200KB total (display + body + mono).**
  ```
  ls -l public/fonts/ && du -ck public/fonts/*.woff2
  ```
  Sum of all `public/fonts/*.woff2` sizes. < 150KB = PASS (target); 150–200KB
  = PASS with warning; > 200KB = FAIL (flag to orchestrator — trim axes or
  drop a family). Transfer size on the wire may be less (woff2 already
  compressed); use file size on disk, it is the conservative number.

- **FONT-5 — Preload only what LCP needs.** next/font/local emits
  `<link rel="preload" as="font" type="font/woff2">` for fonts with
  `preload: true` (default). Verify built HTML preloads the DISPLAY font
  (drives the H1 = LCP). Body/mono may be preloaded or deferred — if all
  three are preloaded, that is acceptable but counts toward the budget; if
  the display font is NOT preloaded = FAIL.
  ```
  grep -o 'rel="preload"[^>]*font/woff2[^>]*' .next/server/app/index.html
  ```

- **FONT-6 — Loaded once.** Font instances defined in `lib/fonts.ts` only;
  imported into `app/layout.tsx` (CSS vars `--font-display/--font-body/
  --font-mono` wired to Tailwind `font-display/font-body/font-mono`
  utilities). No component re-instantiates a font (next/font docs: new
  instance = new @font-face + duplicate load). `grep -rn 'localFont(' components/` must
  return nothing.

## C. Load / Bundle

- **[GATE] LOAD-1 — Zero new npm dependencies.** Landing work adds no entries
  to `package.json` `dependencies` or `devDependencies`:
  ```
  git diff HEAD -- package.json bun.lock
  ```
  Lockfile drift for existing deps only (e.g., hoisting) = PASS; any new
  package = FAIL. `lucide-react` is pre-existing; named imports only if used.

- **LOAD-2 — `/` first-load JS = shared runtime only.** Server components
  throughout the landing tree. `bun run build` per-route output for `/` must
  show a small first-load figure (page-specific chunk absent or tiny; expect
  roughly the framework-shared runtime ~70–90KB, no page-specific client
  JS). Record the number; compare to the pre-redesign baseline build if
  available (`git stash` a clean tree build, or use the last known green CI
  build output). Page-specific client JS > ~10KB (or any `chunk` attributable
  to landing components) = FAIL.
  ```
  bun run build   # then read the per-route table; note First Load JS for /
  ```

- **LOAD-3 — Landing tree contains no client components.** After integration,
  `"use client"` must not appear in `app/page.tsx`,
  `components/landing-{nav,hero,sections}.tsx`, `components/wave-background.tsx`.
  ```
  grep -rn 'use client' app/page.tsx components/landing-*.tsx components/wave-background.tsx
  ```
  (Auth header links use `next/link` — static links need no JS.)

- **LOAD-4 — No render-blocking extras.** No `next/script`, no inline
  `<script>`, no `@import url(...)` in CSS, no `<img>` without `next/image`
  (no images expected on the landing page at all — if one exists it must use
  `next/image` with `priority` only if LCP). Fonts + CSS are the only
  render-blocking resources.

- **LOAD-5 — HTML size sane.** Built `/` HTML (`.next/server/app/index.html`)
  < ~60KB uncompressed (copy-heavy page; large inline SVG in the wave is
  expected — flag if the wave inline SVG alone exceeds ~25KB; consider a
  single `<use>` sprite or `currentColor` gradient defs shared across layers).

## D. LCP

- **LCP-1 — H1 is the LCP element and unblocked.** In a trace of the `/`
  route, `largest-contentful-paint` entry must be the H1
  ("A sponsor brief should behave like a software specification."). The wave
  must render behind it (`z-0`/`z-10`, WAVE-7) without delaying first paint:
  the wave is plain HTML/SVG in the server payload, so it cannot delay LCP;
  FAIL only if the H1 is missing from initial HTML or the wave is JS-mounted.

- **LCP-2 — Animation does not touch the LCP subtree.** Because WAVE-1 is
  transform-only and the H1 is a sibling layer above the wave, no frame
  should invalidate the H1's layer. Verify in the CDP trace: during the
  first 10s, no `Layout`/`UpdateLayerTree` (paint) work attributable to the
  hero on the main thread per frame; compositor `Commit` frames only
  (see E, trace checkpoints).

- **LCP-3 — Wave paint-cost containment [RECOMMENDATION, soft gate].**
  A full-bleed animated gradient SVG behind text is paint-heavy on mobile
  even when composited (layer size ≈ viewport; gradient rasterization).
  Required mitigations in the wave component:
  1. `contain: paint` on the wave container (also `overflow-hidden`).
  2. Opacity layers ≤ 4 (WAVE-5) — 3 preferred on mobile.
  3. Wave height scales down on mobile via a media query
     (`@media (max-width: 768px)` — reduced height/amplitude, e.g.
     `max-height` fraction of the hero, not a full-bleed 100vh layer).
  4. No `filter`/`backdrop-filter`/`blur` on or above the wave (blur on a
     large animated layer is a repaint disaster).
  Verify: media query present in the component; `contain: paint` class
  present. Missing = FAIL (soft — orchestrator may accept with written
  justification from agent 3).

- **LCP-4 — LCP budget.** Throttled (Slow 4G / 4x CPU, 375×667 viewport) LCP
  for `/` ≤ 2.5s. Record the number; report PASS/FAIL. If no trace tooling is
  available, the structural gates (WAVE-1/3, FONT-1/5, LOAD-2) stand in.

- **LCP-5 — No layout shift from fonts.** next/font + `font-display: swap`
  keeps CLS ~0 for text using `font-display` utilities; `prefers-reduced-
  motion` users see static wave (no motion CLS). Verify no `layout-shift`
  entries in the trace beyond a minimal first-paint adjustment (CLS < 0.05).

## E. Measurement Protocol (how the orchestrator runs this)

1. **Static greps** (no tooling needed): WAVE-1/2/3/4/6/8, FONT-1/2/3/6,
   LOAD-1/3/4 — exact commands inlined in each section above. All run from
   repo root on the integrated branch.
2. **`bun run build`**: LOAD-2, LOAD-5 (per-route First Load JS table; grep
   `.next/server/app/index.html` size). Also re-run `bun run typecheck`,
   `bun run lint`, `bun test tests/` — build gates stay green (spec §7).
3. **Playwright CDP trace** (preferred runtime check; playwright is NOT in
   devDependencies — use the chrome-devtools-mcp Performance trace
   (`performance_start_trace`) or `npx playwright` ad hoc if network
   available; otherwise fall back to step 4):
   - Throttle: Slow 4G, 4x CPU, viewport 375×667.
   - Navigate to `/` (dev server `bun run dev` or `bun run start` after
     build). Record: LCP (H1), CLS, FCP, LCP-2 frame analysis.
   - Network: `performance.getEntriesByType('resource')` filtered to
     `font` — assert zero external hosts (FONT-1) and sum transfer sizes
     (FONT-4). Assert no font request starts after `load` (FONT-5
     preload check).
   - `performance.getEntriesByType('paint')` → `first-paint` and
     `first-contentful-paint` must both fire ≤ 1s under throttle (informational
     alongside LCP-4).
4. **Fallback runtime check** (no playwright): chrome-devtools-mcp
   `browser_evaluate` on the running app:
   ```js
   () => ({
     paint: performance.getEntriesByType('paint').map(e => [e.name, Math.round(e.startTime)]),
     fonts: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'css' || r.name.endsWith('.woff2')).map(r => r.name),
   })
   ```
   plus `browser_network_requests` to confirm no external hosts.
5. **Budget reconciliation:** LOAD-2 (route JS) and FONT-4 (font KB) are the
   only numeric gates; report both numbers in the acceptance summary along
   with PASS/FAIL per item. Any **[GATE]** FAIL blocks the merge.

## Summary Format

Return a table: `ID | PASS/FAIL | measured value | note`. Include the two
numbers (route First Load JS KB, font payload KB) and the LCP ms.
