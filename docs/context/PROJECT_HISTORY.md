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
