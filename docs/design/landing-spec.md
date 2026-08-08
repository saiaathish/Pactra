# Landing Redesign Spec — "Elegant Dark Mode" (Stitch prototype replication)

Source prototype: Google Stitch project **"Pactra Hero Section - Elegant Dark Mode"**
(projects/17898142955856654515). Reference images committed at:
- `docs/design/prototype-canvas.png` — 755×459 canvas screenshot (hero + sections)
- `docs/design/prototype-thumb.png` — 512×286 Stitch thumbnail (hero)

All measurements below come from programmatic pixel analysis (no vision needed):
ffmpeg color sampling + macOS Vision OCR. Coordinates are fractions of the
755×459 canvas (x right, y from top).

## 1. Atmosphere

Elegant dark, ambient, flowing. A near-black canvas with a slowly drifting,
multi-layered **indigo-violet gradient wave** behind the hero. The wave crest
passes exactly behind the headline ("very dynamic" per the user). Density 3,
variance 5, motion 6. Nothing screams; everything breathes. The wave is the
single kinetic signature; all other motion is subtle.

## 2. Color Palette (measured from pixels)

| Token | Hex | Source |
|---|---|---|
| Canvas | `#08080D` (near-black, whisper of blue; sampled `#000010`/`#101020`) | dominant bg |
| Raised surface | `#101018` | nav/section tones |
| Wave deep | `#453398` (violet-indigo, hue ≈ 250–252) | sampled `#4b38a7`, `#453398`, `#503ca8` |
| Wave light | `#6C88C3` (periwinkle, hue ≈ 220–232) | sampled `#6c88c3`, `#7792cb`, `#647db6` |
| Text primary | `#F4F4F5` | light glyphs on dark |
| Text secondary | `#A1A1AA` | sub-copy |
| Hairline border | `#1F1F2B` (blue-tinted) | dividers |
| Wave glow tint in nav | `#303070`-ish | nav region |

Rules: ONE accent family (indigo-violet gradient). No purple button glow beyond
the wave's own gradient. No pure black (`#000000` banned — use `#08080D`).
No neon. The wave gradient may be used for the primary CTA fill.

## 3. Typography

- Contract (non-negotiable): utility classes **`font-display`**, **`font-body`**,
  **`font-mono`** will exist (Tailwind 4 `@theme` wired to CSS vars set by
  `next/font/local` in `app/layout.tsx`). Components MUST use these utilities —
  never hardcode font stacks.
- The display font must feel **ambient** (soft/rounded grotesk or elegant
  serif). Exact font TBD by the font-identifier agent (agent 1) via
  render-comparison against the prototype crop.
- Display: track-tight (`tracking-tight`/`-0.02em`), weight-driven hierarchy.
- Body: relaxed leading, max 65ch.
- Numbers/steps (01/02/03): `font-mono` for the engineering-precise feel.

## 4. Layout Map (from OCR + pixel geometry)

Canvas screenshot (755×459) ≈ 1.6 viewport-heights of the 1376×768 prototype.

1. **Nav** (top, y≈0.06–0.12): left — indigo dot + "Pactra" wordmark; right —
   "How it works" link, "Log in" link, **"Get started"** button (accent).
2. **Hero** (y≈0.26–0.55): left-aligned asymmetric. H1 (2 lines, ~y 0.33–0.40):
   "A sponsor brief should behave / like a software specification." Sub-copy
   (3 lines, ~y 0.45–0.51): "Upload the sponsor brief, rough cut, and
   description. Pactra compiles the brief into executable tests, checks the
   actual video, and produces a timestamped proof-of-compliance packet — so
   the final video passes or fails before the brand ever sees it."
   CTA row: primary "Create account" (accent gradient) + ghost "How it works".
3. **Wave** (y≈0.27–0.45): crest passes BEHIND the H1; gradient
   `#453398 → #6C88C3`; animated drift; fades out toward the sections.
4. **How it works eyebrow** (y≈0.58–0.61): small label above the steps.
5. **Steps** 01 Compile / 02 Test / 03 Prove (y≈0.76–0.93): three columns,
   mono step numbers in accent, titles, body copy.
6. **Wrapper test** + **footer**: keep existing content, same dark language.

## 5. Verbatim Copy (OCR-confirmed; do not paraphrase)

- H1: `A sponsor brief should behave like a software specification.`
- Sub: `Upload the sponsor brief, rough cut, and description. Pactra compiles the brief into executable tests, checks the actual video, and produces a timestamped proof-of-compliance packet — so the final video passes or fails before the brand ever sees it.`
- Steps:
  - 01 Compile — `Upload the sponsor PDF. Pactra extracts typed, reviewable requirements — talking points, discount codes, timing windows, forbidden claims, disclosure rules, links.`
  - 02 Test — `Upload the rough cut and paste the description. Deterministic checks verify each requirement against the actual video and transcript.`
  - 03 Prove — `Every verdict carries exact timestamps, evidence clips, and the SHA-256 of the exact file tested. Pass → a cryptographically bound approval manifest.`
- Wrapper test — `Remove the LLM and Pactra still does: FFmpeg media processing, timestamped transcript indexing, segment timing, exact-phrase and forbidden-claim checking, description URL/code validation, disclosure position checks, evidence clipping, video hashing, and approval-report generation. The LLM only converts messy briefs into structured candidate requirements — it never issues a verdict.`
- Footer — `© {year} Pactra` · Privacy · Terms · Support
- Links: /login, /signup, #how-it-works, /privacy, /terms, /support.

## 6. Wave Motion Spec

- 3–4 layered waves (SVG `<path>` fills of the gradient at varying opacities
  and vertical offsets), duplicated horizontally for seamless drift.
- Animate ONLY `transform: translateX` (GPU) at different durations
  (e.g., 22s / 34s / 48s), linear infinite, staggered phases.
- **CSS-only — no client JS** (keep the page a server component; zero hydration
  cost). If JS is unavoidable for a detail, isolate it in the smallest client
  child.
- `prefers-reduced-motion: reduce` → waves become static (no animation).
- `overflow-hidden`, `pointer-events-none`, behind content (`z-0` content `z-10`),
  `absolute inset-0` inside the hero section only.
- Mobile: reduce wave height; no horizontal overflow ever.

## 7. Tech Constraints (repo facts)

- Next.js 15.5 App Router, Tailwind 4 (**CSS-first config — `@theme` in
  `app/globals.css`**, no tailwind.config file), TypeScript strict.
- Landing page: `app/page.tsx` (currently one self-contained file — will be
  split into components). `app/layout.tsx` sets `<html lang="en" className="dark">`.
- Gates: `bun run typecheck`, `bun run lint`, `bun test tests/` (17 tests),
  `bun run build`. All must stay green.
- No new runtime dependencies. Fonts are self-hosted via `next/font/local`
  (files in `public/fonts/`).
- Components are server components unless a real client need exists.

## 8. File Ownership (STRICT — never edit another agent's file)

| File | Owner |
|---|---|
| `public/fonts/*`, `lib/fonts.ts`, `app/layout.tsx` | agent 1 (fonts) |
| `app/globals.css` | agent 2 (tokens) |
| `components/wave-background.tsx` | agent 3 (wave) |
| `components/landing-hero.tsx` | agent 4 (hero) |
| `components/landing-sections.tsx` | agent 5 (sections) |
| `components/landing-nav.tsx` | agent 6 (nav) |
| `docs/design/acceptance-*.md`, `docs/design/prototype-pixels.md`, `docs/design/copy.md` | agents 7–10 |
| `app/page.tsx` (integration) | orchestrator ONLY |

`app/page.tsx` will be assembled by the orchestrator from the components
(imports: `LandingNav`, `LandingHero`, `LandingSections`). Component exports
must be named exactly: `LandingNav`, `LandingHero`, `LandingSections`,
`WaveBackground`.

## 9. Design Skills to Follow (read before writing)

- `/Users/saiaathishkarthik/.zcode/skills/design-taste-frontend/SKILL.md`
- `/Users/saiaathishkarthik/.zcode/skills/high-end-visual-design/SKILL.md`
- `/Users/saiaathishkarthik/.zcode/cli/plugins/cache/claude-plugins-official/modern-web-guidance/0.0.179/skills/modern-web-guidance/SKILL.md` (motion/perf)

## 10. Return Contract

Each builder agent returns: FILES_WRITTEN, DECISIONS (with one-line reasons),
GATE_RESULTS (typecheck/lint for their file), RISKS. Auditors return
FINDINGS as a numbered checklist with file:line or class-level references.
