# Copy Contract — Landing "Elegant Dark Mode"

Canonical copy for the landing page. Source of truth: macOS Vision OCR (accurate
level) of `docs/design/prototype-canvas.png` (755×459) and `prototype-thumb.png`
(512×286), run at 1x, 3x upscale, with normalized positions and targeted band
crops, cross-checked against the current `app/page.tsx` and `landing-spec.md` §5.
**Result: zero copy changes vs the current page.** Every string on the current
page is corroborated by the prototype. Two claims in spec §4's layout map are
*not* corroborated by OCR (see Adjudications) — layout, not copy.

Punctuation bytes verified in current source: em dash `—` = U+2014 (`e2 80 94`);
arrow `→` = U+2192 (`e2 86 92`). The copy contains no apostrophes.

## 1. OCR-vs-source reconciliation

| # | String (canonical) | OCR (prototype) | Current page | Verdict |
|---|---|---|---|---|
| 1 | Nav: `Log in` / `Get started` | "Log in" (x0.87,y0.11) + "Get started" (x0.93,y0.11); nav band crop confirms only these two | identical | MATCH — high |
| 2 | H1: `A sponsor brief should behave like a software specification.` | 2 lines y0.30/0.37, identical words incl. period | identical (span on "software specification") | MATCH — high |
| 3 | Sub: `Upload the sponsor brief, rough cut, and description. Pactra compiles the brief into executable tests, checks the actual video, and produces a timestamped proof-of-compliance packet — so the final video passes or fails before the brand ever sees it.` | 3 lines y0.44–0.50; em dash read as `-` ("packet - so") | identical with `—` | MATCH — high (OCR `-` = artifact; canonical `—`) |
| 4 | Hero CTA: `Create account` + `How it works` | SAME row y0.58: "Create account" (x0.44) + "How it works" (x0.56) | identical (Create account primary / How it works ghost → #how-it-works) | MATCH — high |
| 5 | Step 01 `Compile`: `Upload the sponsor PDF. Pactra extracts typed, reviewable requirements — talking points, discount codes, timing windows, forbidden claims, disclosure rules, links.` | "Upload the sponsor PDF. Pactra / extracts typed, reviewable requirements / - talking points, discount codes, timing / windows, forbidden claims, disclosure" | identical with `—` | MATCH — high (`PDF` read as `POF` at 1x; `-` = em dash artifact) |
| 6 | Step 02 `Test`: `Upload the rough cut and paste the description. Deterministic checks verify each requirement against the actual video and transcript.` | "Upload the rough cut and paste the / description. Deterministic checks verily / each requirement against the actual / video and transcript." | identical | MATCH — high ("verily" = OCR noise for "verify") |
| 7 | Step 03 `Prove`: `Every verdict carries exact timestamps, evidence clips, and the SHA-256 of the exact file tested. Pass → a cryptographically bound approval manifest.` | "Every verdict carries exact timestamps, / evidence clips, and the SHA-256 of the / exact file tested. Pass + a / cryptographically bound approval" | identical with `→` | MATCH — high (OCR `+` = artifact; canonical `→`) |
| 8 | Wrapper test (heading `The wrapper test` + body) | NOT visible in either screenshot (canvas ends at step bodies y≈0.93) | present | KEEP VERBATIM from current page — high (spec §5 agrees) |
| 9 | Footer `© {year} Pactra` + Privacy/Terms/Support | NOT visible in screenshots | present | KEEP VERBATIM from current page — high |

## 2. Adjudications

1. **H1 emphasis ("software specification")** — OCR cannot detect color. The
   current page wraps `software specification` in a span; the spec §5 prints the
   H1 without a span. This is a STYLING decision for the hero agent (accent
   color on the span is consistent with the prototype's single-accent-family
   rule). **Copy is unchanged either way**: `A sponsor brief should behave like a software specification.`
2. **Nav CTA** — prototype shows `Get started` in the nav (button), plus `Log in`
   link, and **no other nav item**. Confirmed at 1x, 3x, and nav-band crop.
3. **"How it works" placement** — the prototype shows it EXACTLY ONCE, on the
   same row as `Create account` (y≈0.58 of canvas) = the hero **ghost CTA**, not
   a nav link and not a section eyebrow. Spec §4's nav "How it works" link (§4.1)
   and "How it works eyebrow" (§4.4) are **not corroborated by OCR at any
   resolution**; the current page already matches the prototype. Build must use:
   nav = `Log in` + `Get started`; hero CTA row = `Create account` + `How it
   works` (→ `#how-it-works`, the steps section id). If the orchestrator keeps
   the spec's eyebrow/nav-link, the STRING `How it works` is the same — but the
   prototype evidence says hero-CTA only.
4. **Wrapper test** — absent from both prototype screenshots; keep the current
   page's section verbatim (`The wrapper test` heading + body, same dark
   language, em dash `—`).

## 3. Known OCR noise (NOT copy)

`& 0Ф`, `csf`-class glyph jumbles, `wugh`, `POF` (PDF), `verily` (verify),
`Chet searted` (Get started), `BHA-256` (SHA-256), `sporoar`/`Prectre` (sponsor
PDF/Pactra), `tough caf` (rough cut), `enact timestarps` (exact timestamps),
`claires` (claims), `lining` (timing), `descrigion` (description), `Deteministie`
(Deterministic), `vaily` (verify), `cryptagraphicaly` (cryptographically),
`enore the brand ever secket.` (hallucinated tail of the sub-copy), `+` for `→`,
`-` for `—`. All are Vision artifacts; ignore.

## 4. FINAL VERBATIM BLOCK — integrator must match character-for-character

```
Nav:            Log in · Get started
H1:             A sponsor brief should behave like a software specification.
Sub:            Upload the sponsor brief, rough cut, and description. Pactra compiles the brief into executable tests, checks the actual video, and produces a timestamped proof-of-compliance packet — so the final video passes or fails before the brand ever sees it.
Hero CTA:       Create account · How it works
Step 01         Compile — Upload the sponsor PDF. Pactra extracts typed, reviewable requirements — talking points, discount codes, timing windows, forbidden claims, disclosure rules, links.
Step 02         Test — Upload the rough cut and paste the description. Deterministic checks verify each requirement against the actual video and transcript.
Step 03         Prove — Every verdict carries exact timestamps, evidence clips, and the SHA-256 of the exact file tested. Pass → a cryptographically bound approval manifest.
Wrapper test:   The wrapper test — Remove the LLM and Pactra still does: FFmpeg media processing, timestamped transcript indexing, segment timing, exact-phrase and forbidden-claim checking, description URL/code validation, disclosure position checks, evidence clipping, video hashing, and approval-report generation. The LLM only converts messy briefs into structured candidate requirements — it never issues a verdict.
Footer:         © {year} Pactra · Privacy · Terms · Support
Links:          /login, /signup (nav + hero CTA), #how-it-works (hero ghost CTA; section id), /privacy, /terms, /support
```

Em dash = `—` (U+2014, `e2 80 94`); arrow = `→` (U+2192, `e2 86 92`). No
apostrophes, no smart quotes, no other special glyphs in the copy.

## 5. Changes vs current page

**None.** All nine strings match the current `app/page.tsx` byte-for-byte in
content (punctuation re-verified: `—` at sub/step-01/wrapper, `→` at step-03).
The build may reuse the current strings verbatim. The only spec corrections are
layout-level (§4.1 nav "How it works" link, §4.4 eyebrow — drop or demote to
designer choice; evidence says hero-CTA only).
