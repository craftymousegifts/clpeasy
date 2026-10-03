# PR #202 reconciliation findings — for the ChatGPT #202 workstream (3 Oct 2026)

- **Analysed:** PR #202 head `f0e83e9`, inside release candidate `rc/payg-unlimited` (local, not pushed).
- **Not changed:** #202 itself (owner instruction).
- **Changed:** only the owner-approved test updates on the PAYG/release branch.

## A. Owner-approved test updates (PAYG/release branch only)
| Test | Change |
|---|---|
| `app-static-audit` | Local `src`/`href` targets are percent-decoded before the file-exists check (`CLPeasy%20Home%20page.png` → `CLPeasy Home page.png`). A genuinely missing file is still reported. |
| `seasonal-particle-resize` | Steps 1–7 (resize behaviour) are unchanged. Step 8 now uses the real 12-second auto-stop instead of the removed banner close button: particles are running before 12s, removed after it, and not resurrected by a resize. Step 9 checks there is one seasonal strip, directly under `.homepage-image-hero`, with a sign-up link. |
| `autumn-homepage-ui` | Particle-artwork checks kept. Checks the current #202 behaviour: no hero pill; one inline strip directly under the image hero, a labelled region, not fixed; accessible "Start your 14-day free trial" link that **must stay on CLPeasy's own site**; leaves visible, stopping at 12s and never returning; works without a Supabase client. **Fails only on finding E1 below.** With that one URL made relative in a scratch copy, every other check passes. |
| `clp-hero-explanation` | Rewritten for the image hero: tooltip can never return; exactly one `<h1>` with the exact text, inside the hero, hidden only by the clip technique (never `display:none`, `visibility:hidden` or `aria-hidden`); nothing interactive in the heading; meaningful artwork alt text; accessible sign-up hotspot. A scratch copy with `aria-hidden` on the `<h1>` fails as intended. |
| `homepage-hero-rewrite` | 12 still-valid checks kept. Heading, workflow and product-type checks now use the real `<h1>` and the artwork alt text. The founder section must be after the heading inside the hero `<section>`. Stacking check: the hotspot is at z-index 3 and the particle canvas has `pointer-events:none`. The decorative-label count is left to `decorative-labels-renderer-derived`. |
| `smart-paste-user-guidance-wording` | Hero Step 2 approved text is now the owner-accepted #202 sentence: "Copy Section 2.2 (Label elements) from your current supplier SDS into Smart Paste. Review the extracted hazard information against your current SDS." Three locations are recorded as removed by #202 commits, with the retired wording still required absent: feature card (`4dc8f31`), and the two Easy Pro signup-guide steps (`1295d66`). The retired "Paste your complete SDS document" instruction is absent everywhere. |

## B. `lifecycle-label-branding` — what the label shows is correct; the test's assumptions are out of date
**The centre label renders correctly.** Same `<use href="#lc-centre-label" x="176.6" y="176.6" width="206.8"
height="206.8">` as main, the same 7 pictograms (2 GHS + 5 candle-safety), 9 stage nodes, 9 arrows,
and the tooltip present. Its content is **exactly** the `clp-tmpl-circle-candle` template with only
the business-name `<text>` line removed (checked with the test's own normalisation; the one other
difference is a leftover blank line).

**Why the test fails (three test assumptions no longer hold):**
1. **Isolation pattern.** The test isolates the diagram with `/<svg id="lc-svg"[\s\S]*?<\/svg>/`.
   - #202 now places the hidden pictogram/template sprite `<svg width="0" height="0" aria-hidden="true">` **inside** `#lc-svg`, as its first child.
   - The lazy pattern therefore stops at the sprite's `</svg>`, and the test never sees `<symbol id="lc-centre-label">`. Hence: "must define a local lc-centre-label symbol".
2. **Business name.** The test requires `Your Business Name` in the centre label (main: "Your Business Name"). #202 deliberately removed the business-name line (`f0e83e9`).
3. **No "Crafty Mouse Gifts" in the diagram.** The test requires none inside the lifecycle diagram. Because the sprite is now nested in `#lc-svg`, the hidden templates' "Crafty Mouse Gifts" text is inside it, though not visible (0×0, aria-hidden).

| | main | #202 |
|---|---|---|
| centre texts | "Vanilla", "Your Business Name", "SCENTED CANDLE", "WARNING", H/P text, "200g · Burn: 35hrs" | "Musk & Sandalwood", (no business name), "SCENTED CANDLE", "WARNING", same H/P text, "200g · Burn: 35hrs" |
| sprite position | outside `#lc-svg` | first child of `#lc-svg` |

**To reconcile (ChatGPT/owner):** either move the hidden sprite `<svg>` back outside `#lc-svg`, or have
the test parse the DOM instead of using the lazy pattern. Then agree the business-name expectation
(none vs "Your Business Name").

## C. `decorative-labels-renderer-derived` — the content is genuine renderer output; the test fixture is out of date, and the decorative wall was removed
1. **`clp-tmpl-circle-candle` differs from the test's fresh render in exactly one line (the scent arc):**
   - expected (fixture `scentName: 'Vanilla'`): `<textPath href="#circle-candle-scentArc" startOffset="50%">Vanilla</textPath>`
   - #202: `<textPath href="#circle-candle-scentArc" startOffset="50%">Musk &amp; Sandalwood</textPath>`
     (same `font-size="13.88"`)
   - **A fresh `renderLabel()` of the same fixture with `scentName: 'Musk & Sandalwood'` is byte-identical to #202's
     template** (fits: true, 0 warnings). So the template **is** genuine renderer output for the new scent; it was
     not hand-edited.
   - The other 4 templates match a fresh render exactly.
2. **The decorative wall is gone.**
   - #202 has **0** `<use href="#clp-tmpl-…"/>` positions; main has 52 (32 circle / 6 square / 14 rectangle).
   - The five `<symbol id="clp-tmpl-*">` templates remain only inside the nested hidden sprite, and nothing displays them.
   - The test's section 6 (52 positions, `pointer-events:none` wrappers, wall container) and section 9 (old typed-hero mobile `<br>`/CLP-ring CSS) also assume the pre-#202 page.
- **Location:** `index.html`, the hidden sprite `<svg width="0" height="0" …>` that is the first child of `<svg id="lc-svg">`.
- **To reconcile (owner decision):** confirm the wall removal is intended. If it is, update the test's circle
  fixture to `scentName: 'Musk & Sandalwood'` (keeping the byte-for-byte render check) and retire the wall/old-hero
  sections. If not, restore the wall in #202.

## D. Minor #202 corrections
- **Hero image dimensions:** `<img src="assets/CLPeasy%20Home%20page.png" … width="1536" height="1024">`, but the
  asset is **1672 × 941**. The declared 3:2 ratio should be 1672:941 (≈16:9). `height:auto` keeps the display
  correct, but the browser reserves the wrong space before the image loads (layout shift).
- **Full form of "CLP":** the homepage no longer contains "CLP means Classification, Labelling and Packaging"
  anywhere. This is noted, not enforced by any test.

## E. #202 defects found during this work (release blockers for #202)
1. **Hard-coded deploy-preview link in `seasons.js`:**
   `<a id="clpeasy-banner-cta" href="https://deploy-preview-202--clpeasy.netlify.app/auth?mode=signup" …>`.
   - In production this would send customers to the PR preview site.
   - It should be `/auth?mode=signup`, or `auth.html?mode=signup` like the hero hotspot.
2. **Behaviour change (owner to confirm intended):** the seasonal strip now always says "Start your 14-day free
   trial", including to signed-in customers. The previous version linked signed-in customers to the Builder.
