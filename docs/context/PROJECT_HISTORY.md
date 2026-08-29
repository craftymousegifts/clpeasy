# Project History — CLPeasy and Related Context

## 2025–2026 background
Michaela has been developing CLPeasy as a SaaS product for UK makers while also having an existing handmade craft business, Crafty Mouse Gifts.

## CLPeasy development
The project has involved:
- Building a label generator.
- Connecting or planning Supabase authentication.
- Connecting or planning Stripe billing.
- Hosting/deployment through Netlify.
- Source control through GitHub.
- Building pricing and subscription plans.
- Creating print-ready label output.
- Adding PDF, PNG and SVG output.
- Developing AI-assisted "Guide Me".
- Developing "Smart Paste SDS".
- Adding or planning Candle Care Cards.
- Adding or planning Room Spray Safety Cards.
- Adding or planning Wax Melt Inserts.

## Pricing history
Historical pricing discussed:
- Easy Start: $9.99/month
- Easy Start: $99/year
- Easy Pro: $14.99/month
- Easy Pro: $149/year
- 5 downloads: $3.99
- 10 downloads: $7.99
- 14-day free trial

Historical Easy Start allowance:
- 10 downloads/month

Verify all pricing in the current application before relying on these figures.

## Launch history
A V1.0 launch was planned for Monday 15 June 2026.
The launch was described as:
"LIVE TODAY!!! V1.0"

## Important technical issue
A PDF output defect occurred in a 63×44 mm label rectangle where:
- "SCENTED CANDLE"
- "WARNING"

overlapped.

A patch was applied in builder.html.

Future changes to label rendering should regression-test this area.

## Compliance and layout concerns
Michaela has been concerned about minimum dimensions for GHS pictograms and CLP label elements.

Future work should:
- Verify current requirements.
- Avoid shrinking compliance-critical elements merely to make them fit.
- Test both visual layout and physical dimensions.

## Historical files
Files previously referenced:
- builder(1).html
- pricing.html
- home(3).html

These are historical references only. The current repository may have different names.

## Current development philosophy
The project should evolve incrementally.
Do not rewrite working systems unnecessarily.
Before modifying:
1. Inspect.
2. Understand.
3. Change narrowly.
4. Test.
5. Report.

## Builder recovery contract — August 2026

The approved five-step Builder behaviour is:

1. Label — choose shape, size and appearance first.
2. Product — enter product details; there is no Intended Use field.
3. Hazards — Smart Paste extracts H/EUH/P codes and sensitisers, automatically selects the required GHS pictograms, and candle products display their EN 15494 safety pictograms.
4. Business — enter responsible-person and contact details.
5. Download — review the complete label and export PNG, PDF or SVG.

The live preview stays in its preview column throughout the wizard. Every step has consistent Back/Next navigation. Mandatory hazard, precautionary and sensitiser text must never be shortened or replaced with ellipses. Export is blocked when the complete content cannot fit at the required legibility. A representative long-content 63 mm candle label must remain usable, while genuinely undersized content such as the same case at 52 mm must be blocked. Custom rectangle width and height are independent physical dimensions; the 63×44 mm candle layout must keep product type, signal word and pictograms separated.

## Other business context
Michaela also operates Crafty Mouse Gifts, a handmade product business.

The practical maker perspective is useful when evaluating CLPeasy UX, pricing, onboarding, and product features.

## Known issues (resolved 29 Aug 2026) — logged 28 Aug 2026

**Print Sheet Composer (print.html) does not replicate the actual label.**
Reported by Michaela at end of a session. Screenshots showed: a saved label
("hjfhjfh", Scented Candle, custom rectangle) whose real Label Preview (in
the builder) shows the full compliant label — product name, CLPEasy
branding, "SCENTED CANDLE WARNING", hazard diamond pictogram, H/P
statement text, GHS pictogram row, and business-details footer. But the
Print Sheet Composer's own Sheet Preview (right-hand pane, 35mm-circle
template selected) rendered each position on the sheet as an empty dashed
outline circle with no label content inside — the sheet grid did not
reflect what the actual label contains.

Root-caused and fixed 29 Aug 2026 — see session log below for details.

## Session log — 29 Aug 2026 (part 3)

**Fixed and verified live on clpeasy.com (commit `6f76360` on `main`):**
Smart Paste (Step 3 — Hazards) blocked users with "Please resolve the
unrecognised hazard or precautionary codes before continuing:
P302, P352, P333" for a valid, correctly-formatted supplier SDS.
Reported by Michaela with a screenshot of the blocking dialog plus the
actual SDS PDF (Supplies for Candles / The Soap Kitchen) showing the
precautionary statements as combined codes: "P302 + P352" and
"P333 + P313".

Root cause: `extractSDS()`'s P-code regex
(`/\bP\d{3}(?:\+P\d{3})*\b/g`) only matched combined codes written with
no space around the "+" (e.g. "P302+P352"). Many real supplier SDS PDFs
print them with spaces ("P302 + P352"), which the old regex split into
two standalone codes ("P302", "P352"). Neither exists as its own entry
in `P_LIB` — only the combined form does — so Step 3's validation
correctly rejected them as unrecognised, blocking progress on a label
that was otherwise entirely valid.

Fix: widened the regex to also match the space-padded form, then
normalises the match by stripping the spaces so it becomes the same
canonical "P302+P352" string `P_LIB`/`_pExclude` already use — one
regex + one `.replace()`, ~7 lines. Nothing about which P-codes are
valid, excluded, or how hazards/pictograms/signal word are derived
changed; this only fixes text extraction from pasted SDS content.

Verified by reproducing the exact reported error against the live
site's real `P_LIB` (same three codes: P302, P352, P333) before the fix,
then confirming zero unrecognised codes after, using Michaela's own SDS
text. After deploying, re-ran the actual live `extractSDS()` function
end-to-end with the same text (via the Smart Paste textarea, restored
afterwards) and confirmed Step 3's real validation check now passes
(`wouldBlock:false`). No saved/customer data was touched — this test
only set in-memory form state via the real function, never called Save,
and the page was reloaded afterwards to clear it.

## Session log — 29 Aug 2026 (part 2)

**Fixed and verified live on clpeasy.com (commit `68e2bae` on `main`):**
four further Print Sheet Composer issues, reported by Michaela with
screenshots of a real saved label ("hjfhjfh", Scented Candle, 70×68mm
rectangle) after the fix above went live:

1. **Sub-52mm sheet templates removed.** The 35mm/40mm/51mm circle presets
   were removed from Sheet Template; "Custom sheet" is now the only
   option and is selected by default. The custom label-size field now
   defaults to 52mm and has `min="52"`; the underlying JS (`getTplConfig`)
   also now hard-clamps to a 52mm floor (`Math.max(52, ...)`) so a
   manually typed or blank value can't produce a smaller sheet — the
   `min` attribute alone doesn't stop that on `oninput`. (Per Michaela's
   explicit instruction; the exact regulatory citation for "52mm
   minimum" was not independently verified against GB-CLP — implemented
   as stated rather than self-adjudicated, consistent with the CLPeasy
   skill's rule not to assert regulatory requirements.)
2. **Header order fixed.** `buildLabelSVGFromData()` was rendering the
   business name above the fragrance/scent name. Reordered to match
   builder.html's own documented order (scent → biz → website), with the
   scent name now largest/topmost and the business name/website smaller
   and secondary.
3. **Real GHS pictograms.** The composer was drawing a diamond outline
   with the GHS code as text (e.g. "GHS0?") instead of real artwork.
   Ported `GHS_IMG` (the base64 pictogram images) verbatim from
   builder.html — verified byte-identical via SHA256 hash — and switched
   the pictogram row to the same `<image href="...">` approach
   builder.html uses, so the composer now shows the real pictogram icons.
4. **H/P statements and sensitisers** were already reading the real
   saved fields correctly; re-verified they render properly (not
   truncated to "GH"/"H") once the pictogram/header fixes were in.

Root cause for #2/#3 was the same as the earlier bug in this file:
print.html's `buildLabelSVGFromData()` is a separate reimplementation of
builder.html's real `buildSVG()`, not shared code, so the two renderers
had drifted apart on header order and pictogram rendering.

Tested in two stages before committing: (1) live function-injection on
the production site with the exact `buildLabelSVGFromData` code extracted
verbatim from the file (not retyped) plus a small real subset of
`GHS_IMG`, checking DOM/attribute structure (pictogram `<image>` count,
x/y/width/height, no overlaps) and a scaled visual render; (2) after
push, re-verified end-to-end on the live site using Michaela's own real
saved "hjfhjfh" label (read-only — the real saved-label data under
`clpeasy_labels__u_guest` was not modified) added to the sheet via the
real `addToSheet()`, confirming the actual rendered sheet cell shows
correct header order, real pictogram icons, and correct H/P/sensitiser
text. A stray synthetic test key (`undefined__u_guest`) created during
step 1 was removed afterwards; it was never the key the app actually
reads from, so it had no effect on real data.

**Separate finding, not fixed (flagging only, out of scope for this
task):** `libKey()` in print.html returned `"undefined__u_guest"` for
the guest session used during testing — the real saved-labels key the
app actually reads/writes is `clpeasy_labels__u_guest`. There may be a
user-id variable that's unset in some guest-mode code path in
print.html, producing a second, effectively dead localStorage key. Not
investigated further or changed since it wasn't part of what was
reported and didn't affect real data.

Not fixed / out of scope this session (unchanged from the note below):
EN15494/BCF candle safety icons were not ported into print.html: same
scope decision as the first Print Sheet Composer fix. The saved-label-
list preview icon (`buildMiniSVG`) still renders as a plain square.

## Session log — 29 Aug 2026

**Fixed and verified live on clpeasy.com (commit `d32da6a` on `main`):**
the Print Sheet Composer bug logged above. Root cause: `print.html`'s
`buildLabelSVGFromData()` always rendered a label into a square sized to
match the chosen sheet-template cell (e.g. 35mm), and `getLockedSizeMM()`/
`addToSheet()` used `parseInt(e.size)`, which is `NaN` (silently falling
back to 35) for a custom-sized label — so a real custom-rectangle label
(e.g. 63×44mm) got squashed into the wrong shape/size and became
illegibly small, reading as "empty". Reproduced first with synthetic
label data matching the reported case (guest-namespace localStorage, no
real customer data touched), confirmed via live DOM/geometry inspection
in the browser, then fixed by adding a `getLabelDimsMM(e)` helper (mirrors
builder.html's own rectangle 0.7 aspect-ratio convention) and updating all
four places that build label output — the on-screen sheet preview, the
PDF export, and the cutting-machine PNG export (all three shared the same
bug, so all three now render/export each label at its true physical shape
and size, contained and centred within its sheet slot) — plus the
size-lock check and the saved-label-list size text (was showing the typo
"custommm" for custom sizes; now shows e.g. "63×44mm"). The common case —
a standard circle label on a matching circle template — is unaffected;
verified this explicitly (cw/ch still resolve to an exact square in that
case, byte-for-byte same as the pre-fix code path). Tested via live
function-injection against the production site before committing, then
re-tested against the actual deployed fix after push. No changes to
builder.html, CLP/hazard logic, or any saved customer data.

Left behind: `print_test.html` in the repo root (a copy of the fixed file
used for local git-diff testing before the real `print.html` was
overwritten) — untracked, not committed, safe to delete whenever
convenient.

Not fixed / out of scope this session: the small saved-label-list preview
icon (`buildMiniSVG`, the 36×36 thumbnail next to each label name) still
renders as a plain square regardless of the label's real shape — left
alone since it's just a tiny identifying icon, not the print output itself.

## Session log — 28 Aug 2026

Fixed and verified live on clpeasy.com this session (see git history on
`main` for exact commits): sidebar logo size mismatch between
Dashboard/Account and Create Label/My Labels; Sign-in nav link not
updating to show signed-in state on knowledge.html and index.html (root
cause: Netlify strips `.html` from served link hrefs, so exact-href-match
selectors silently never matched — the same root cause also broke the
homepage's signed-in "Start free trial" -> "Go to builder" CTA swap, fixed
the same way); account.html Billing card showing a misleading plan/cycle
during free trial; three SECURITY DEFINER trigger functions
(`handle_new_user`, `notify_beta_tester_email`,
`protect_profile_billing_columns`) were callable directly via the
PostgREST RPC endpoint by anon/authenticated -- revoked (first attempt
only revoked from the two roles directly and did nothing, because Postgres
had granted EXECUTE to PUBLIC by default; the working fix revokes from
PUBLIC and re-grants to the function owner). Confirmed the new-user
signup trigger still fires correctly after the revoke (tested via a
rolled-back transaction). Leaked password protection remains disabled --
confirmed it requires a Supabase Pro-plan upgrade, not actionable on the
current Free plan.
