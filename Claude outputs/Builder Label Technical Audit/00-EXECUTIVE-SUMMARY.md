# CLPeasy Builder Label — Technical Audit: Executive Summary

**Scope:** `main` @ `e8c1f25`. This was an audit only. No application code, PRs, deployments, Supabase, Stripe, Netlify or Brevo settings were changed, and PR #156 / `feature/pay-as-you-go-downloads` were not touched. All output is in this folder, and nothing has been committed.

**Method:** I read the whole label pipeline: `label-render.js`, the Builder adapter and exports, the Composer and My Labels adapters. I ran the existing 53 tests. I then rendered **144 synthetic stress labels** (18 fixtures × 8 geometries) through the real renderer in headless Chromium with real fonts, measured every rendered text line and pictogram, and captured previews and export PNGs.

**Limits:** I could not reach legislation.gov.uk or hse.gov.uk (blocked by the network policy). None of the regulatory points below has been confirmed against the primary GB text; they are marked "verify". Georgia is not installed in the test container, and I did not test on real Windows, macOS or iOS devices.

## Overall result

The architecture is sound. There is one shared renderer. The layout is resolution-independent, so preview and exports compute identical layouts. Legibility floors are enforced. No content was ever truncated or dropped from the markup, and labels that genuinely don't fit are blocked visibly.

However, the audit found **one CRITICAL defect**: on **circular labels**, mandatory hazard and precautionary text can run past the label edge. The circle clip then hides that text **while the label reports "fits" and can be downloaded.** It happened in 12 of 26 fitting circle renders, including a realistic 63 mm wax melt label. The existing test suite cannot catch this because no test renders with real fonts.

## Counts (master matrix, 61 rules)

| PASS | ISSUE | UNCERTAIN | DESIGN DECISION REQUIRED |
|---|---|---|---|
| 21 | 22 | 8 | 10 |

## Findings by category

### A. Definite implementation bugs
- **M44 (CRITICAL)** — circle H/P text clipped at the edge while `fits:true`. The wrap width is computed once per block at its first line. Evidence: `screenshots/EVIDENCE__16-long-wax-melt__circle-63__clipped-vs-unclipped.png` and `EVIDENCE__18-long-room-spray__circle-100__…`.
- **M45 (HIGH)** — on every circle, a curved product name of about 15 characters or more overlaps the business name (`EVIDENCE__arc-product-name-vs-business-name__circle-63.png`).
- **M43 (MEDIUM)** — as soon as a product name needs two lines, it drops straight to the 1.2 mm floor (`slot.scent` is 0). Example: 3.39 mm → 1.23 mm on a 100 mm square.
- **M21 (MEDIUM)** — Smart Paste silently misses suffixed H codes such as H361f and H360FD, without blocking.
- **M38 (MEDIUM)** — an unknown pictogram key is silently drawn as the exclamation mark.
- **M09 / M31 (HIGH)** — the placeholder text "Your Brand" and "Contains: sensitising substance" can be printed and exported.
- LOW: M24 duplicate codes printed twice; M41 candle icons and footer at the 52 mm circle edge; M50 size advice mentions preset buttons that no longer exist; M51 height input max 200 vs clamp 150; M06 Builder gate omits `bcfTooSmall` (latent); M07 dead legacy export functions have rectangle bugs.

### B. Likely regulatory/technical issues (verify)
- **M19 (HIGH)** — P305+P351+P338 omits "Remove contact lenses, if present and easy to do. Continue rinsing."
- **M10 (HIGH)** — a label can be exported with no supplier address.
- **M37 (HIGH)** — pictogram precedence rules are not applied (for example, skull and exclamation mark both drawn).
- **M36 (HIGH)** — no rule relating pictogram size to label area.
- M20 other P wordings abbreviated; M34 no way to name non-sensitiser substances in the product identifier; M33 EUH208 punctuation; M26 placement of EUH statements; M13 nominal quantity optional; M23 no P-count warning.

### C. Layout/legibility problems
- M44, M45, M43 above.
- **M47** — the default 52 × 36 rectangle and the historic 63 × 44 mm size block even a simple candle label. They fail visibly, not silently.
- **M46** — the address never wraps, so a long address blocks at every size.
- **M05** — the fit engine measures text in generic `sans-serif`/`serif` but draws DM Sans / Georgia. The drawn font also differs between Pro preview, PNG and PDF. This is lower risk for DM Sans (narrower than Arial), but the product and business names are drawn in Georgia while measured as Times on Windows/macOS/iOS. Needs a real-device check.

### D. Missing automated tests
- **M58 (HIGH)** — there are no real-browser or real-font tests. All 53 tests use jsdom with a fake text-measurer.
- Not tested: circle horizontal fit, arc overlap, product-name wrapping, placeholders, suffixed H codes, pictogram precedence or unknown keys, Composer overrides, the bgColour attribute, control characters, and real PNG/PDF output.
- 5 existing tests fail on `main`. All 5 check marketing/UI wording on other pages; this is pre-existing and unrelated.

### E. Duplicated/inconsistent rendering logic
- M03: the Composer ignores saved fine-tune overrides.
- M04: the signal word is recomputed in Builder but taken from the saved record in the Composer.
- M06: Builder has its own download-gate list instead of using `fits`.
- Two hand-synced H_LIB/P_LIB copies (identical today).
- Legacy `getDims` duplicate.

### F. Decisions required from Michaela
See `13-DECISIONS-REQUIRED.md` (19 questions).

### G. Already implemented correctly
- Single shared renderer.
- Resolution invariance.
- Fail-closed blocking with reason-specific messages.
- Unknown and GB-unsupported codes are blocked.
- EUH208 bounded extraction keeps the supplier's order, and names are never truncated (verified in real Chromium).
- P280 picker.
- Combined and slash P-code normalisation.
- Pictograms never below the 10 mm square, de-duplicated, never overlapping text or outside the label.
- Candle icon 5 mm floor.
- Mandatory text never below the 1.2 mm nominal floor (minimum measured 1.199 mm).
- Text escaping of all label text.
- The 80 × 100 mm custom rectangle behaves correctly.

## Folder contents
`00`–`13` markdown reports · `screenshots/` (22 preview/export pairs + 7 evidence images) · `harness/` (fixtures, runner, font probes, `results.json`, `matrix.md`).
