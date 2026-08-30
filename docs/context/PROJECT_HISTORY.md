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

## Session log — 29 Aug 2026 (part 6)

**Fixed and verified live on clpeasy.com (commit `794ce24` on `main`):**
Print Sheet Composer clipping hazard/precautionary text (and the footer)
off the edge of the label. Reported by Michaela immediately after part 5
above shipped, by comparing the real Label Preview against the Sheet
Preview for the same "eryryrty" label again. Root cause: full statement
TEXT (part 5's fix) takes far more vertical room than the bare codes it
replaced; at the label's real size (63mm circle) the fixed font sizes
used for the H/sensitiser/P block, plus the interim footer-push fix from
part 4, together pushed content past the label's own edge, where the
circular clip-path silently cut it off mid-sentence — the P-statement
text and the whole footer were being clipped away invisibly.

Fix: ported builder.html's own `_layoutHazard()` binary-search
auto-sizing engine (the real, approved Label Preview's actual mechanism)
into print.html, replacing the fixed H/sensitiser/P font sizes with one
shared font size that's searched for — shrinking from a ceiling down to
a ~1.2mm legibility floor — until the whole block fits between the
pictograms and the footer. The footer no longer needs to move at all
(part 4's footer-push is superseded by this and was removed — the footer
is back at its original fixed position, exactly like builder.html, since
the hazard block itself now guarantees it fits above that line). If
content still can't fit even at the floor size, only the P-statement
text is hard-clipped at the footer boundary as a last resort — H and
sensitiser text are never clipped — matching builder.html's own
defensive fallback exactly.

Tested via live function-injection against the actual deployed function,
at the label's real px size (63mm; also checked 52mm, the sheet
template's minimum): the real reconstructed "eryryrty" data — 3
H-codes+EUH208, 1 sensitiser, 5 P-statements — now renders with zero
overflow past the label edge and zero overlap at 63mm (previously the
P-statement text and the entire footer were being clipped off); a normal
single-hazard label is unaffected at both sizes; a deliberately extreme
stress case (7 H-codes, 6 sensitisers, 14 P-statements — far beyond
anything realistic) shows no overlaps at 52/63/100mm, with only a
marginal (~2%) bounding-box measurement past the circle on one
sensitiser line at 100mm — not visible text clipping, not investigated
further. Re-verified against the live site after push (a first check hit
Netlify's usual deploy-propagation delay and correctly still showed the
pre-fix function; a second check after the deploy settled showed the fix
live).

**Discussed, not changed this session:** Michaela asked whether the
composer could instead reuse a snapshot of the label builder.html has
already rendered, rather than re-deriving the content itself — this
would remove the drift-between-two-renderers root cause behind parts
2/4/5/6 for good. Checked the real saved-label data: it only stores raw
fields (scentName, hStatements, pStatements, sensitisers, etc.) — no
rendered SVG/image is saved anywhere today, so there is nothing for
print.html to reuse yet. Doing this properly would mean builder.html
saving real SVG markup (not a bitmap, to keep 300 DPI export quality)
alongside every saved/updated label, plus handling labels saved before
that existed. Flagging as a real candidate for a dedicated follow-up
task, not attempted here.

## Session log — 29 Aug 2026 (part 5)

**Fixed and verified live on clpeasy.com (commit `d766564` on `main`):**
Print Sheet Composer showing bare hazard/precautionary CODES instead of
the actual required GB-CLP statement text. Reported by Michaela by
comparing two screenshots of the same real label ("eryryrty"): the real
Label Preview (builder.html) showed full compliant wording ("May cause
an allergic skin reaction. Harmful to aquatic life with long lasting
effects." / "Avoid breathing vapours and dust. Avoid release to the
environment. IF ON SKIN: wash with plenty of water. ..."), while the
Print Sheet Composer's own Sheet Preview showed only the bare codes
("H317 · H412 · EUH208" / "P261 · P273 · P302+P352 · P333+P313 · P501")
for the same saved label.

Root cause: `buildLabelSVGFromData()` never looked codes up against any
text table — it just joined the raw H/P codes with " · " for display.
builder.html's real, approved `buildSVG()` has always looked codes up in
its own `H_LIB`/`P_LIB` tables to print the actual statement wording;
print.html's separate reimplementation never had this step, so the two
renderers showed different content for the same saved label.

Fix: ported `H_LIB`/`P_LIB` (the code->text lookup tables) verbatim from
builder.html into print.html, and rebuilt the H/sensitiser/P text
construction in `buildLabelSVGFromData()` to match builder.html's
`buildSVG()` logic exactly — including EUH208 being pulled out of the
H-code list and folded into the sensitiser line ("...May produce an
allergic reaction."), and adjacent split P-codes (e.g. saved as "P302",
"P352" rather than "P302+P352") being re-paired into their combined form
before lookup, the same safety net builder.html's real preview uses.
Also removed this composer's old placeholder sensitiser fallback
(`['Linalool']`) and its `slice(0,8)`/`slice(0,5)` code-list truncation
caps — a label with more sensitisers/codes than the cap would have
silently had legally required content cut off; builder.html's own code
comments document removing equivalent caps previously for the same
reason ("U8"/"U9" fixes, never silently drop legally required text).
Did **not** port builder.html's much larger `_layoutHazard()` dynamic
font-sizing/hard-clip engine — out of scope for a content-parity fix;
the existing (already-fixed-last-session) footer-push layout was
retested instead, see below.

Tested via live function-injection against the exact deployed function:
(1) the real "eryryrty" case (3 H-codes+EUH208, 1 sensitiser, 5
P-statements incl. two combined codes) — output text matched the real
Label Preview's wording exactly, zero overlaps at 150-600px; (2) a
normal single-hazard case (regression check) — unchanged from before;
(3) EUH208 with no sensitisers/undefined sensitisers array — correct
"Contains: sensitising substance..." fallback, no crash; (4) an
unrecognised code mixed with known codes — silently dropped, no crash,
matches builder.html's own behaviour; (5) a deliberately extreme stress
case (7 H-codes, 6 sensitisers, 14 P-statements) down to 150px — zero
overlaps, no clipping. Re-verified all of this against the actual live
site after push (cache-busted reload). No changes to builder.html or any
saved customer data.

## Session log — 29 Aug 2026 (part 4)

**Fixed and verified live on clpeasy.com (commit `c4ef922` on `main`):**
Print Sheet Composer footer text overlapping mandatory hazard/
precautionary text on dense labels. Reported by Michaela with a
screenshot of a real 63mm circle label ("eryryrty") whose sheet-cell
preview showed the P-statement line and the business phone number
overlapping in a garbled, illegible block, plus the supplier's CLP
Hazard Labelling Contribution Advice document showing the label's real
data: 3 H-codes, 6 sensitisers, 5 P-statements (including two combined
codes, P302+P352 and P333+P313).

Root cause: `buildLabelSVGFromData()` draws the footer (divider line,
background band, phone/weight/burn-time text) at a Y position that's a
fixed fraction of the label height, regardless of how tall the
H-statement/sensitiser/P-statement block above it actually turns out to
be. That block already grows correctly with real line-wrap count, but
nothing checked whether it grew past the footer's fixed start — so a
label with enough hazard/precautionary text on a small label could have
the footer start before that text ended.

Fix: after computing the H/sensitiser/P block's real bottom edge, the
footer now starts at whichever is lower — the original fixed position,
or that block's actual bottom — so it only moves when it needs to, and
otherwise renders exactly where it always has. Nothing above the footer
(header, product type, signal word, pictograms, the hazard text itself)
changed. Reproduced the exact reported overlap via live function-
injection using the real hazard data from the supplier's compliance
document (both with and without the pre-fix "split" P-code format, in
case the label had been saved before the Smart Paste fix above), at
sizes from 80px to 265px; confirmed zero overlaps after the fix at every
size, and confirmed an unrelated normal-content label renders identically
to before (no regression). Michaela's real saved label data was not
read or touched — testing used data reconstructed from the compliance
document she supplied.

**Separate finding, flagged but not fixed (out of scope for this
task):** while probing sizes for the fix above, a distinct, unrelated
~1px bounding-box overlap between "SCENTED CANDLE" and "WARNING"
appeared at one specific small circle size (~120px), independent of
hazard-text length. This is the same category of bug already documented
above under "Important technical issue" (a 63×44mm SCENTED CANDLE/
WARNING overlap, patched in builder.html) — worth a regression check in
print.html specifically, but wasn't part of what was reported here.

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
