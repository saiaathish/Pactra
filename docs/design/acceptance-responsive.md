# Landing Redesign — Responsive + Accessibility Acceptance Checklist

Applies to the "Elegant Dark Mode" landing (branch `feature/landing-elegant-dark`).
Components under test: `components/landing-nav.tsx`, `landing-hero.tsx`,
`landing-sections.tsx`, `wave-background.tsx`, `app/page.tsx` (integration),
`app/globals.css`, `app/layout.tsx`.

Run order: static scans (grep/typecheck/lint/build) → Playwright viewport sweep
(320 / 375 / 768 / 1024 / 1440) → a11y audit (tab order, axe or manual,
forced-colors + reduced-motion emulation) → console/network pass.

---

## A. RESPONSIVE

### A1. No horizontal scroll at any width (320 / 375 / 768 / 1024 / 1440)

- [ ] CHECK — `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 320, 375, 768, 1024, 1440 (allow ≤ 1px rounding). How to verify — Playwright: resize to each width, then `page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))`; fail if `sw > cw + 1`.
- [ ] CHECK — No element's bounding box exceeds the viewport (overflowing children are clipped, not laid out wide). How to verify — `page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(el => el.tagName + '.' + el.className))` at 320 and 375; expect `[]`.
- [ ] CHECK — No horizontal scrollbar appears transiently during the wave drift animation. How to verify — at 320 and 375, sample `scrollWidth` at t=0, 1s, 5s, 10s while wave animates (or with `animation-play-state: paused` overridden via evaluate for a static read).
- [ ] CHECK — No `overflow-x-auto`/`w-screen`/`min-w-*` utilities used in landing components that could create or mask horizontal overflow. How to verify — `grep -n "overflow-x\|w-screen\|min-w-\|max-w-none" components/landing-*.tsx components/wave-background.tsx`; every hit must be justified and clipped by an ancestor with `overflow-hidden`.
- [ ] CHECK — Hero text (H1 + sub + CTA row) never wraps to a 4th+ line of sub-copy or pushes the CTA out of the fold at 320. How to verify — screenshot at 320×640; sub-copy ≤ 4 lines, both CTAs visible without scroll.
- [ ] CHECK — Long words/copy don't overflow at 320: H1 "software specification." and sub-copy wrap word-wise (`overflow-wrap` default), no glyph clipping. How to verify — screenshot at 320; `getBoundingClientRect` of H1/sub never exceeds hero width.

### A2. Single-column collapse below 768px (steps grid + footer)

- [ ] CHECK — Steps grid is 1 column at 320/375/768-window-just-below (≤ 767) and 3 columns at ≥ 768. How to verify — `getComputedStyle(gridEl).gridTemplateColumns` — expect one track < 768px, three tracks ≥ 768px; must use `grid grid-cols-1 md:grid-cols-3` (no flex-percentage math).
- [ ] CHECK — Footer collapses to a vertical stack < 768px (copyright above links, or links stacked) with no horizontal crowding/overlap. How to verify — at 375, footer children are `flex-col` (computed `flex-direction: column`) or wrap cleanly; screenshot shows no side-by-side squeeze.
- [ ] CHECK — Step cards at 320 are full-width with comfortable padding (min `p-4`/`p-5` equivalent) and no text touching card edges. How to verify — screenshot + `getBoundingClientRect` inset check at 320.

### A3. Hero headline scales via clamp/breakpoints

- [ ] CHECK — H1 font-size follows `text-4xl sm:text-5xl lg:text-6xl` exactly (spec §4.2/landing-spec): 30px at < 640, 48px at 640–1023, 60px at ≥ 1024. How to verify — Playwright: at 375, 768, 1024 read `getComputedStyle(document.querySelector('h1')).fontSize`; expect ≈30px / 48px / 60px (allow ±2px rounding). Reject `text-4xl sm:text-6xl` (skips a step, per design-taste 4.7 scale discipline).
- [ ] CHECK — H1 is max 2 lines at ≥ 1024 and max 3 lines at 320/375. How to verify — measure `h1.getClientRects().length` at each width.
- [ ] CHECK — If a CSS `clamp()` is used instead of breakpoints, min/max match the same scale (30px → 60px) and reflow at every width in the sweep. How to verify — computed font-size sampled at 320/480/640/768/1024/1440 must be monotonically non-decreasing and within the 30–60px band.
- [ ] CHECK — Emphasized gradient span "software specification." does not clip descenders (no `leading-none` with italic/lowercase descenders; `leading-[1.1]` min or `pb-1` reserve). How to verify — screenshot at 1024 and 320; the "g"/"p" in "specification." fully visible.

### A4. Touch targets ≥ 44px (full inventory)

Every interactive element and its required hit area (height × width; height is the binding constraint for single-line controls):

| Element | Location | Expected min hit area |
|---|---|---|
| Nav "How it works" link | landing-nav | 44 × ≥ 44 (text link needs vertical padding/`min-h-11`) |
| Nav "Log in" link | landing-nav | 44 × ≥ 44 |
| Nav "Get started" button | landing-nav | 44 × ≥ 44 (current page's `px-4 py-2` ≈ 32px — FAIL; new must add `min-h-11` or `py-2.5+`) |
| Nav "Pactra" wordmark | landing-nav | 44 × ≥ 44 only if clickable; if a non-interactive `<span>`, exempt but must not be focusable |
| Hero "Create account" CTA | landing-hero | 44 × ≥ 44 (`px-6 py-3` at 16px text ≈ 46px — keep; add `min-h-11`) |
| Hero "How it works" ghost CTA (anchor `#how-it-works`) | landing-hero | 44 × ≥ 44 (same min-h) |
| Footer "Privacy" link | landing-sections | 44 × ≥ 44 hit height (`py-2`/`py-3` on the link or `inline-block` padding) |
| Footer "Terms" link | landing-sections | 44 × ≥ 44 |
| Footer "Support" link | landing-sections | 44 × ≥ 44 |

- [ ] CHECK — Each of the 9 elements above has hit area ≥ 44×44 CSS px at 375 and 1440. How to verify — Playwright: for each selector, `getBoundingClientRect()` width AND height ≥ 44 (spacing-based hit area outside the box, e.g. `::before` padding hack, also passes if the clickable region measured by hit-test ≥ 44).
- [ ] CHECK — No element has `pointer-events: none` on an interactive element or `disabled`-style styling on links. How to verify — grep `pointer-events-none` in landing components; occurrences allowed only on the wave and decorative layers.
- [ ] CHECK — CTAs don't wrap to 2 lines at 1024+ (button label single line). How to verify — CTA `getClientRects().length === 1` at 1024/1440; labels are short ("Create account", "Get started", "How it works").

### A5. Wave must not push content or create scrollbars

- [ ] CHECK — Wave is `absolute inset-0` inside the hero section only; it contributes 0 height to layout. How to verify — hero `getBoundingClientRect().height` is unchanged with wave present vs. `display: none` on the wave element (evaluate toggle); document `scrollHeight` identical both ways at 375 and 1440.
- [ ] CHECK — Wave clipped by an `overflow-hidden` ancestor (hero), no scrollbar from the drifting layers at any width. How to verify — `scrollWidth` sweep (A1) plus: wave element's `overflow` chain — walk `el.parentElement` chain at 375 and confirm an `overflow: hidden/clip` ancestor exists.
- [ ] CHECK — Wave is `pointer-events-none` and `z-0` (content `z-10`); it never intercepts clicks on CTAs. How to verify — `getComputedStyle(waveEl).pointerEvents === 'none'`; click test: Playwright clicks hero CTA center at 375 — navigation fires, not swallowed.
- [ ] CHECK — Wave height reduced on mobile (spec §6: "Mobile: reduce wave height") — no giant gradient swallowing the H1 at 320/375. How to verify — screenshot at 375: H1 readable against wave; wave crest passes behind headline but text contrast maintained (see B6).

### A6. Nav collapse behavior

- [ ] CHECK — Nav renders on ONE line at every width in the sweep (320/375/768/1024/1440) — no wrap, no two-line nav at desktop (design-taste 4.7 hard rule). How to verify — at 320, nav `getClientRects().length === 1` and `nav.scrollWidth <= nav.clientWidth`; screenshot each width.
- [ ] CHECK — Nav defines an explicit < 640/768 behavior for secondary items if they don't fit at 320 (e.g., hide or condense "How it works" below `sm`, tighten `gap-4` → `gap-2`, `text-sm` → `text-xs`). How to verify — at 320 the nav still fits with wordmark + at least "Get started" visible; nothing overflows (A1 measure).
- [ ] CHECK — Nav height ≤ 80px at desktop, ≤ 64px at mobile (design-taste nav cap). How to verify — `getComputedStyle(header).height` at 1440 ≤ 80, at 375 ≤ 64.
- [ ] CHECK — If a hamburger/mobile menu is added, it must be a real disclosure (`aria-expanded`, `aria-controls`, Escape to close, focus managed) — not just hidden links. How to verify — axe run + keyboard walk. (Default spec has no hamburger; if none exists, this passes vacuously.)

---

## B. ACCESSIBILITY

### B1. Semantic landmarks

- [ ] CHECK — Exactly one each of `<header>`, `<nav>`, `<main>`, `<footer>` on the landing (main wraps hero + sections; nav inside header). How to verify — `page.locator('header, nav, main, footer').count()` per tag; also axe `landmark-one-main` and `region` rules.
- [ ] CHECK — `<main>` exists so the skip link (B8) has a target; page content is NOT rendered outside landmarks. How to verify — grep the assembled `app/page.tsx`; DOM walk for text nodes directly under `<body>` (all content inside landmarks).
- [ ] CHECK — Nav has an accessible name (e.g., `<nav aria-label="Primary">` or implicit via landmark) and the two nav links + wordmark are the only items. How to verify — axe `landmark` rules; `nav.getAttribute('aria-label')` non-empty if more than one nav exists.

### B2. Heading order

- [ ] CHECK — Exactly ONE `<h1>` (hero headline, verbatim spec copy). How to verify — `document.querySelectorAll('h1').length === 1`; text matches "A sponsor brief should behave like a software specification." (verbatim, spec §5).
- [ ] CHECK — No skipped levels: h1 → h2 → h3 chain intact. Steps section must introduce an `<h2>` (e.g., "How it works" as a real heading, not just an eyebrow `<p>`); step titles are `<h3>`; wrapper test section has its own `<h2>` or is an `<h3>` under a valid parent — no h1 → h3 jump (current page's h3-only steps FAIL this; must be fixed). How to verify — extract heading sequence `[...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.tagName + ': ' + h.textContent)` at 375 and 1440; fail if any level skipped or duplicated h1.
- [ ] CHECK — Eyebrow labels (e.g., "How it works" eyebrow) are `<p>`/`<span>` styled text, NOT headings, and don't compete with real headings. How to verify — grep for `uppercase tracking` labels; confirm they're not `h*` elements.

### B3. Link/button text clarity

- [ ] CHECK — Every interactive element has a non-empty accessible name that matches its visible text (no "Read more", no icon-only links without `aria-label`). How to verify — axe `link-name`/`button-name`; `[...document.querySelectorAll('a,button')].map(el => el.textContent.trim() || el.getAttribute('aria-label'))` — all non-empty.
- [ ] CHECK — Anchor `#how-it-works` targets a real element with that id, so the ghost CTA scrolls somewhere meaningful. How to verify — `document.getElementById('how-it-works') !== null`.
- [ ] CHECK — Links are real `<a>`/`next/link` (no `<button>` styled as navigation, no div-with-onClick). How to verify — grep landing components for `onClick`; must be absent (server components anyway).
- [ ] CHECK — Visible link text alone is sufficient to convey destination (Log in / Get started / Create account / How it works / Privacy / Terms / Support). How to verify — visual pass + screen-reader pass (VoiceOver or `aria-label` audit); no same-text-different-destination links except intentional nav+hero CTA duplication (both signup-intent labels differ: "Get started" vs "Create account" — allowed per spec's verbatim prototype, noted as accepted deviation).

### B4. Focus-visible

- [ ] CHECK — Every interactive element (9 from A4) shows a visible focus ring on `:focus-visible` (keyboard), at every viewport width. How to verify — Playwright `page.keyboard.press('Tab')` through the full page at 375 and 1440; for each stop assert `getComputedStyle(el).outlineStyle !== 'none'` (or box-shadow ring) with ≥ 2px and contrast vs. adjacent background; screenshot one stop per element.
- [ ] CHECK — No `outline-none`/`outline: 0` without a `:focus-visible` replacement in landing components or globals. How to verify — `grep -n "outline-none\|outline: *0\|outline: *none" components/landing-*.tsx components/wave-background.tsx app/globals.css`; every hit must be paired with a visible `focus-visible:` style.
- [ ] CHECK — Focus ring visible on dark canvas (#08080D): ring color must be ≥ 3:1 against the surface it appears on (e.g., indigo-400/white-ish, not `#453398`-dark). How to verify — sample the focused outline color at 2px; compute contrast vs. element background.

### B5. Contrast (WCAG AA)

Measured against canvas `#08080D` (sampled values; spec §2):

| Pair | Ratio | Verdict |
|---|---|---|
| `#F4F4F5` (text primary) on `#08080D` | ≈ 18.2:1 | PASS ≥ 4.5 |
| `#A1A1AA` (text secondary) on `#08080D` | ≈ 7.8:1 | PASS ≥ 4.5 |
| `#71717a` (zinc-500, current footer/nav-muted) on `#08080D` | ≈ 4.1:1 | FAIL < 4.5 — do NOT use zinc-500 for small text; use zinc-400 or lighter |
| `#6C88C3` (wave light) on `#08080D` | ≈ 5.6:1 | PASS ≥ 3 (large) |
| `#453398` (wave deep) on `#08080D` | ≈ 2.1:1 | FAIL < 3 even for large text — see B6 |

- [ ] CHECK — Body/sub-copy ≥ 4.5:1 against its actual background (canvas or raised surface `#101018`). How to verify — for `p, li, footer` text: get computed color + computed background, compute ratio (script or axe `color-contrast`); fail on any zinc-500-or-darker secondary text.
- [ ] CHECK — Large display text (H1 ≥ 24px/30px, step titles, nav wordmark ≥ 24px? nav is small → treat nav links as 4.5:1) ≥ 3:1. How to verify — same computed check; H1 `#F4F4F5` passes; step titles must not be dimmed below 3:1.
- [ ] CHECK — CTA button labels ≥ 4.5:1 against the button fill (primary accent-gradient button: label `#F4F4F5`-ish on the lightest gradient stop `#6C88C3` ≈ 2.1:1 → FAIL! Verify the primary CTA's fill is dark enough or the label light enough: `#F4F4F5` on `#453398` ≈ 7.5:1 PASS, on `#6C88C3` ≈ 2.1:1 FAIL — so the gradient must not pass its lightest stop under the label, OR the label gets a dark scrim). How to verify — screenshot + computed color at the label's pixel; compute ratio; fix in hero, not in this doc.
- [ ] CHECK — Ghost CTA ("How it works" bordered) text ≥ 4.5:1 on canvas and its 1px border ≥ 3:1 visible. How to verify — computed colors vs `#08080D`.

### B6. Gradient text on "software specification." — RISK (flagged)

- [ ] CHECK — RISK: The gradient span uses `bg-clip-text text-transparent` (or `-webkit-background-clip: text` + `-webkit-text-fill-color: transparent`). In `forced-colors` mode (Windows High Contrast) and some color-override setups, `text-transparent`/`-webkit-text-fill-color: transparent` is NOT remapped and the word can become invisible. How to verify — Playwright emulation: `page.emulateMedia({ forcedColors: 'active' })`; screenshot H1; the emphasized word must remain readable (solid `CanvasText` fallback). Fix pattern: `@media (forced-colors: active) { .gradient-text { -webkit-text-fill-color: CanvasText; background: none; } }` — REQUIRED, not optional.
- [ ] CHECK — Contrast risk: gradient stops `#453398 → #6C88C3` — the dark stop ≈ 2.1:1 vs canvas FAILS the 3:1 large-text requirement across much of the glyph area (only the light end ≈ 5.6:1 passes). The gradient must be lightened (dark stop lifted to ≥ ~`#5B48C0`-ish family so the worst pixel ≥ 3:1) OR the span must be treated as decorative with a solid accessible fallback color that passes ≥ 3:1. How to verify — compute ratio of the darkest gradient pixel under the text (sample via canvas in evaluate or accept the stated math); axe `color-contrast` on the h1 with gradient = inconclusive, so verify manually with the numbers above.
- [ ] CHECK — Non-gradient fallback: if `background-clip: text` is unsupported (very old browsers), the span shows `text-transparent` (invisible) — provide a solid `color` fallback on the same element before the clip rule. How to verify — grep the span's CSS: `color` set to a light value (e.g., `#C4B5FD`-family) AND `background-clip: text` + `-webkit-text-fill-color: transparent` applied; order must guarantee solid color when clip fails.

### B7. Decorative wave a11y

- [ ] CHECK — Wave element(s) have `aria-hidden="true"` (or the whole wave wrapper) and `role="presentation"` not required on plain divs. How to verify — `waveEl.getAttribute('aria-hidden') === 'true'`; axe `aria-hidden-focus` (wave contains no focusable content).
- [ ] CHECK — Wave SVG/divs contain no text nodes that screen readers would announce. How to verify — wave subtree `textContent` empty or whitespace-only; if `<title>` present in an inline SVG it must be absent/empty (decorative).

### B8. prefers-reduced-motion

- [ ] CHECK — `@media (prefers-reduced-motion: reduce)` (or `no-preference` gating) disables ALL wave animations: `animation-name: none` on every wave layer (spec §6). How to verify — Playwright `page.emulateMedia({ reducedMotion: 'reduce' })`, then `getComputedStyle(waveLayer).animationName` === 'none' for each layer, and `transform` computed value is static across two samples 1s apart (no drift).
- [ ] CHECK — No other CSS/JS motion on the landing (no scroll reveals, no hover transforms that move layout, no infinite transitions) that ignores reduced motion. How to verify — grep landing components + globals for `animation|transition|@keyframes`; with `reducedMotion: 'reduce'` emulated, sample computed `transition-duration`/`animation-duration` — all `0s`/`none` on non-interactive elements.
- [ ] CHECK — With reduced motion active the layout is pixel-identical to the static end-state (no layout shift when animations are killed). How to verify — screenshot compare with motion on vs. off at 375: `scrollHeight` and element rects equal.

### B9. lang + skip link

- [ ] CHECK — `<html lang="en">` still present (layout.tsx, unchanged) and the document has no language mismatch. How to verify — `document.documentElement.lang === 'en'`.
- [ ] CHECK — RECOMMENDED (optional but cheap): skip-to-content link as first focusable element: `<a href="#main" class="sr-only focus:not-sr-only ...">Skip to content</a>`, `<main id="main">`. How to verify — first Tab stop at 375 activates it; Enter jumps focus into main; link invisible until focused. Not blocking; note as enhancement.

---

## C. BROWSER / TECH

### C1. Server components only

- [ ] CHECK — No `"use client"` directive in `landing-nav.tsx`, `landing-hero.tsx`, `landing-sections.tsx`, `wave-background.tsx` unless a real client need exists (none expected — wave is CSS-only per spec §6). How to verify — `grep -n '"use client"' components/landing-*.tsx components/wave-background.tsx`; every hit requires a written justification in the component header comment.
- [ ] CHECK — No `useState`/`useEffect`/event handlers (`onClick`, `onMouseMove`) in the landing components. How to verify — grep; wave must be pure CSS (no rAF/scroll listeners — `window.addEventListener('scroll'` banned per design-taste 5.D).
- [ ] CHECK — Component exports named exactly `LandingNav`, `LandingHero`, `LandingSections`, `WaveBackground` and `app/page.tsx` imports only those (no new page-level state). How to verify — grep exports + imports in `app/page.tsx`.

### C2. No console errors / build gates green

- [ ] CHECK — Zero console errors and zero hydration mismatches on load (dev + prod build) at 320 and 1440. How to verify — Playwright `page.on('console')`/`page.on('pageerror')` filter level error; also check `bun run build` output for hydration warnings; console messages tool: expect `[]` for level=error.
- [ ] CHECK — `bun run typecheck`, `bun run lint`, `bun run build` all green with the landing integrated. How to verify — run the three gates from repo root; typecheck/lint failures in landing components are blockers (spec §7).
- [ ] CHECK — No new runtime dependencies added (spec §7) — landing uses only next/react/tailwind + existing `lucide-react` if icons needed. How to verify — `git diff package.json`; diff must be empty or lockfile-only for existing deps.
- [ ] CHECK — No broken links: `/login`, `/signup`, `#how-it-works`, `/privacy`, `/terms`, `/support` all resolve (200 or in-page anchor). How to verify — Playwright click-through of each link; anchor resolves to an element (B3).

### C3. Fonts — no FOUT > 100ms

- [ ] CHECK — Fonts load via `next/font/local` from `public/fonts/` wired through `lib/fonts.ts`; `font-display: swap` (next/font/local default) so text is visible during load. How to verify — grep `next/font/local` in `lib/fonts.ts`; inspect emitted CSS for `@font-face` with `font-display: swap`.
- [ ] CHECK — No fallback-font flash longer than ~100ms for the display/body faces on a cold load (throttled). How to verify — Playwright with Slow 4G emulation, `performance.getEntriesByType('resource')` filter font files; screenshot at 100ms after navigation start and at `document.fonts.ready`; the H1 must not visibly swap fonts after the 100ms screenshot. Also verify `document.fonts.check('600 60px <DisplayFace>') === true` after load.
- [ ] CHECK — Landing components use the `font-display`/`font-body`/`font-mono` utilities (spec §3 contract) — no hardcoded `font-family` stacks in landing components (current `app/globals.css` body stack is a system-ui fallback that agent 1/2 will replace; landing code must not reintroduce stacks). How to verify — `grep -n "font-family" components/landing-*.tsx` must be empty; grep `font-display|font-body|font-mono` present in nav/hero/sections.

### C4. Dark color-scheme consistency

- [ ] CHECK — `<html class="dark">` (already in layout.tsx) preserved; color-scheme declared so form controls/scrollbars render dark: `color-scheme: dark` on `:root` in globals.css AND/OR `<meta name="color-scheme" content="dark">` in layout head (currently MISSING — must be added by agent 1/2; verify after integration). How to verify — `getComputedStyle(document.documentElement).colorScheme` includes `dark`; grep layout.tsx/globals.css.
- [ ] CHECK — No light-mode islands: every section background is from the dark family (`#08080D` canvas, `#101018` raised, hairline `#1F1F2B`) — no `bg-white`/`bg-zinc-50`/`text-zinc-900` inversions anywhere on the landing. How to verify — `grep -n "bg-white\|bg-zinc-50\|bg-gray-50\|text-zinc-900\|text-black" components/landing-*.tsx app/page.tsx` must be empty.
- [ ] CHECK — No pure `#000000` backgrounds (spec: banned — use `#08080D`). How to verify — grep `bg-black`/`#000` in landing components + globals.
- [ ] CHECK — Viewport meta is Next.js default `width=device-width, initial-scale=1` with no `user-scalable=no`/`maximum-scale` (zoom must not be disabled). How to verify — `document.querySelector('meta[name=viewport]').content`; grep layout.tsx for viewport export.

---

## Minimum Shippable (run these 10 first; all must pass)

1. No horizontal scroll at 320/375/768/1024/1440 (`scrollWidth <= clientWidth`, A1).
2. Steps grid 1-col < 768, 3-col ≥ 768; footer stacks < 768 (A2).
3. H1 scale `text-4xl sm:text-5xl lg:text-6xl` verified by computed font-size (A3).
4. All 9 interactive elements ≥ 44×44 hit area (A4 table).
5. Wave: absolute + overflow-hidden + pointer-events-none + z-0, adds 0 height, no scrollbars (A5).
6. Nav single-line at all widths, ≤ 80px desktop / ≤ 64px mobile (A6).
7. Landmarks (one header/nav/main/footer) + single h1 + no skipped heading levels (B1, B2).
8. Focus-visible ring on every interactive element; no naked `outline-none` (B4).
9. Contrast: body ≥ 4.5:1; gradient-text span has forced-colors + solid fallback and dark gradient stop ≥ 3:1 (B5, B6); no zinc-500 secondary text.
10. Wave `aria-hidden` + reduced-motion kills all animation; server components only; console error-free; gates (`typecheck`/`lint`/`build`) green (B7, B8, C1, C2).
