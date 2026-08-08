# Prototype Pixel Measurements — QA Gate Reference

Source: `docs/design/prototype-canvas.png` (755×459). All values are programmatic
(ffmpeg raw-RGB extraction + Node sampling). Fractions are of the 755×459 canvas,
x right / y from top. No OCR used (copy lives in `docs/design/copy.md`).

## 1. Measurements table

| Region | Hex (measured) | Interpretation |
|---|---|---|
| Canvas (hero + sections bg) | `#0B0C0C` | near-black, slightly warm vs spec `#08080D` (same family, ΔE small). Ban pure black. |
| Nav band surface (y 0–40) | `#1D1E20` (modal of 20.8k px) | raised surface, matches spec "raised `#101018`" family but lighter. Boundary to hero bg at y≈40–44. |
| Footer band surface (y ≈447–459) | `#1D1E20` | same raised surface at bottom. |
| Nav "Get started" button | bbox x600–741 (79.5–98.2% width), y32–60 (7.0–13.1% height); fill `#6458E8` top band, modal `#665AEF` (hue ≈245–247, chroma ≈130) | violet CTA in-wave-family. In the 2× screenshot it reads as dark-glass pill (`#101114` interior) with bright violet top band + violet outline + diagonal highlight streak. If solid pill is desired, wave gradient `#453398→#6C88C3` is consistent. |
| Nav links text | `#BABDBE` (lum 188) | light gray; vs `#1D1E20` → 8.8:1. |
| Nav dot / wordmark accent | `#6251BF` (hue ≈250) | violet wordmark accent, wave-dark family. |
| H1 headline (y119–184, x174–574) | solid near-white: median `#E7E6E9`, mode `#EAEAEA`; 3795/3867 bright px have chroma ≤15 | **NOT gradient text.** Hue "spread" (215–255) is entirely wave show-through in glyph gaps, not text tint. |
| Sub-copy (y200–240) | `#A5A3AA` (lum 164) | ≈ spec text-secondary `#A1A1AA`. |
| Wave deep (violet) | `#5B40CF`, `#6751CA`, `#5E40DA`, `#453398` family | hue ≈250–257, chroma 110–150. |
| Wave light (periwinkle) | `#87A0E3`, `#7D92DA`, `#7A89DC`, `#6C88C3` family | hue ≈220–228. |
| Sections bg | `#0B0C0C` (top colors `#0B0C0C`, `#0B0C0D`, `#191919`, `#0C0C0C`) | same as canvas — sections are NOT raised in prototype. |
| Section title row (y≈326, 71%) | `#6A6483` (muted purple-gray) | sits on the wave's dark layer band; low-brightness heading. |
| Step numbers 01/02/03 (y≈357+) | `#9D9B9F` / `#9A989C` / `#9A9A9A` | **light gray — NOT accent-colored** (contradicts spec §4 "mono step numbers in accent"). |
| Hairline dividers | none found (0 rows dominated by a non-bg single color) | prototype has no hairline dividers in y275–436. |
| Off-family accents | none (0 px with chroma>60 outside hue 200–280) | single indigo-violet family confirmed; `#665AEF` (hue 247) is in-family. |

## 2. Wave band geometry

- Saturated core (chroma>40): x≈260–570; columns x<250 have chroma <10 in the hero band.
- Vertical extent of core at x374: y161–277 (**35.1%–60.3%** of height).
- **Crest row: y164–169 (35.7%–36.8%)**, satPx peak 284 at y164; at x570 crest sags to y185.
- Crest passes exactly behind the H1 band (y119–184 = 26–40%): glyph gaps expose violet at x314 (`#604DB5`) and periwinkle at x474/494 (`#7D92DA`, `#859CDB`).
- Full-width low-intensity bleed at y≈32 (nav bottom edge) and y≈445 (footer) — the spec's "wave glow tint in nav" (`#303070`-ish family).
- Layer-stacking evidence (2+ layers): below the crest, two distinct full-width bands — bright periwinkle band y≈270–284 (`#9093EE`, hue ≈233) and darker violet band y≈325–326 (`#332555`/`#6D5E94`, hue ≈248). Different hues at different depths → stacked layers, not one blob.

## 3. Gradient endpoints (crest)

- Horizontal (crest row y169, left→right): `#6751CA` (x340, h252) → `#574C9C` (x374) → `#3F3F7C` (x410) → `#7A89DC` (x450, h228) → `#87A0E3` (x490, h220) → fade `#2C355C` (x530). Violet (h250) left-of-center → periwinkle (h220–228) center-right → dark fade.
- Vertical (through crest at x270): top `#392A74` → crest `#5B40CF` → bottom `#4F3F97`. At x374: top `#302966` → crest `#675ACF` → bottom `#434775`.
- These bracket the spec tokens: deep ≈ `#453398` (h250–256), light ≈ `#6C88C3` (h220–228). Spec values confirmed valid endpoints.

## 4. Contrast (WCAG 2.1, relative luminance)

| Pair | Ratio | Verdict |
|---|---|---|
| Headline `#EAEAEA` vs canvas `#0B0C0C` | 16.3:1 | pass |
| Headline vs wave deep `#453398` | 8.0:1 | pass |
| Headline vs crest violet `#5B40CF` / `#665AEF` | 5.4:1 / 4.1:1 | pass (large text) |
| Headline vs crest periwinkle `#7D92DA`/`#87A0E3` | **2.5–2.7:1** | **WORST CASE — fails 3:1.** The bright periwinkle segment (x450–490) sits under the second half of the H1. |
| Sub-copy vs canvas | 7.9:1 | pass |
| Step numbers vs canvas | 7.4:1 | pass |
| Nav links vs nav surface | 8.8:1 | pass |

Mitigation in build: keep the crest's periwinkle segment luminance ≤ `#6C88C3` (2.94:1) where it crosses under the headline, or dim the wave layer behind text; never render crest fill brighter than ~`#87A0E3`.

## 5. QA checklist (verify against the built page)

1. Canvas bg `#0B0C0C` ± ΔE 3 (never `#000000`); sections area same color as hero canvas (not a lighter card).
2. Nav surface `#1D1E20`-family band at top; boundary into canvas between 8–11% of hero height; same raised tone at footer.
3. CTA ("Get started") fill within ΔE 15 of `#6458E8`/`#665AEF` (hue 240–250), or wave gradient `#453398→#6C88C3` per spec; button right-aligned at ~18–19% of viewport width from right edge, vertically centered in nav.
4. Headline is SOLID `#EAEAEA`-family (chroma ≤15), NOT gradient text; any perceived gradient must come from the wave behind only.
5. Wave crest must sit at **35–38% of canvas height** (28–40% band), passing behind the H1; saturated core centered x 34–76% of width; periwinkle segment hue 220–228 appears center-right of crest.
6. Wave vertical gradient: top ≈ hue 248 (`#302966`-`#392A74`) → crest hue 250–257 (`#5B40CF`) → bottom hue 247 (`#434775`); horizontal crest drift violet→periwinkle as in §3.
7. Two stacked layer bands below the crest: one at ~59–62% height (periwinkle `#9093EE`-family), one at ~70–71% (dark violet `#332555`-family) — evidence of ≥2 stacked wave layers.
8. Step numbers light gray `#9A9A9A`–`#9D9B9F` (NOT accent) unless orchestrator overrides spec §4 intentionally; step titles/body use text-secondary family.
9. No hairline dividers in the sections area.
10. No color outside hue 200–280 with chroma >60 anywhere on the page (single-family rule; watch logos/favicons in viewport).
11. Contrast: headline ≥ 4.5:1 everywhere, ≥ 3:1 even over the brightest crest pixel; if crest periwinkle would render at `#87A0E3` luminance under text, add scrim/dim.
12. Wave bleed: faint wave tint at nav bottom edge (~7% height) and footer top (~97% height) is expected.

## 6. Measurement notes / surprises

- Spec §4 claims step numbers "in accent" — prototype shows light gray. Flagged for orchestrator decision (spec text vs measured pixels; default: follow prototype pixels).
- Spec §2 canvas `#08080D` vs measured `#0B0C0C` — both near-black; treat as one token (e.g. `#0A0B0C`).
- No hero CTA buttons ("Create account") are visible in the canvas — the canvas ends at the sub-copy + wave; the "Get started" button is the only CTA in frame. Hero CTA styling must be inferred from nav button + spec, not measured.
- The nav button's bright fill is a ~4px top band; the pill body is dark glass with violet outline. If the built page uses a full solid/gradient pill, it will still pass checklist item 3 (fill family) but note the prototype's darker treatment.
