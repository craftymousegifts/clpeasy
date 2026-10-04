# CLPeasy final PR reconciliation — 4 October 2026

## Decision

Completed PR audit and focused software fixes. **Not an unconditional marketing/chemical-compliance sign-off.** Download artifact receipt, actual iPhone/physical print and the separate review items below cannot be marked PASS from this environment. Old tests and old PR descriptions are historical evidence only.

Released fixes: #208 fresh Step 5 exports / complete business details; #209 PNG preparation before credit consumption / honest status; #210 nine exact suffixed H codes; #211 missing product / EUH208 named-substance export guards and unknown-pictogram refusal. The next focused homepage fix addresses signed-in header/hero/seasonal/footer CTA ordering and preserves approved artwork.

Validation: all 69 existing offline Node test files PASS on #211. JSDOM tests exercise real current page scripts and shared renderer with mocked authentication/accounting; they do not replace browser or physical-output verification. Homepage auth/render ordering has separate coverage for signed-in and signed-out visitors. Deno is unavailable (explicit SKIP); 12 Puppeteer/browser test files were not run through a separate browser framework. Public live browser flows are tested through the authorised cloud browser.

## All ten pre-existing open PRs

| PR | Sign-off / disposition | Evidence / outstanding scope |
|---|---|---|
| #204 Phase 2 content/pictogram/suffix guards | App scope reconciled by #208, #210, #211; old draft retained, not merged | Raw product/business/address/phone and EUH208-name guards apply before credits in Builder/Composer. Unknown saved keys fail closed. Nine suffix codes retained. Old questionnaire/geometry/history code is excluded. |
| #203 SDS fragrance percentage | HOLD — explicit owner freeze | Do not merge. The rejected supplier questionnaire was removed on current main; old percentage matching direction is not restored. |
| #201 homepage product hero | Superseded by later approved hero | Current image hero, founder bio, artwork and image hashes preserved; hero regression and static tests PASS. Old branch would replace later work. |
| #184 PAYG launch/FAQ pricing | Superseded by current pricing | Current £4.99 pack includes 3 bonus with every pack until 31 December 2026; one-off-bonus wording in this branch is stale. Current pricing/accounting tests PASS. |
| #174 Back to top / Knowledge / mobile overflow | Current implementation verified; old branch superseded | Site-scroll accessibility, public navigation and responsive Composer checks PASS; Knowledge query returns an answer. Actual iPhone remains unverified. |
| #171 sitewide Back to top | Superseded by current implementation | site-scroll-accessibility PASS. Do not regress later public navigation. |
| #162 release #157/#158 documentation | Historical documentation only | Its signed-in environment block is outdated: Google sign-in and isolated funded Test Composer flows have since been exercised. Its old 65/65 count is not current evidence. Preserve as history, not a fresh release approval. |
| #161 download/save/printing guidance | Superseded by merged guidance and #209 status fix | Current step help, actual-size guidance and successful-generation feedback tested. Browser does not attest disk receipt; wording is Download started / Print view ready. |
| #155 compact SDS guidance | Old draft proposal superseded by current compact guidance | Current Step 3 uses native collapsed About supplier information and GB CLP details; rejected questionnaire stays absent. No old draft merge. |
| #148 candle/wax-melt SEO | Superseded by later wider-product homepage direction | Current hero metadata includes candles, wax melts, diffusers and room sprays. Do not reinstate old narrowed title/old assets. |

Superseded PRs are signed off as **no code left to merge from that branch**, not as a reason to merge stale commits. Existing PRs/branches are retained; no forced update, branch deletion or automatic archival of owner-held drafts.

## Open issues

| Issue | Current result |
|---|---|
| #166 legacy subscription plan switches | Still OPEN. New sales offer PAYG / Easy Start Unlimited; monthly↔annual contact route exists. Current webhook still resets usage on a price-change event. Legacy upgrade/downgrade/proration and live portal configuration require isolated backend testing before closure. No backend or Stripe setting was changed during this frontend fix. |
| #127 server-side clean-label rendering / authorisation | Still OPEN, architectural security work. Client preview hardening and atomic download RPC tests do not establish server-owned rendering or prevent all client-side bypass. |
| #128 competitor research | Still OPEN, research task, not a broken customer workflow. No competitor claims added. |

## Sign-off evidence

- Google sign-in and saved-label reload exercised on live; wrong-environment example.com QA login is not proof of a general auth defect.
- Fresh five-step Builder, exact dimensions, full sensitiser extraction, fitting and blocked labels, saved identity, and required business fields checked.
- #211 deployment preview: EUH208 with no name reaches Step 5 with explicit warning and downloads opacity .4 / pointer-events none; adding Linalool clears it and enables exports. Unknown/prototype saved pictogram keys covered automatically.
- Isolated current-build Test PAYG: new PNG 27→26, same-identity SVG remains 26, Composer ZIP 26→25; database matches. Prior PNG regeneration remains free within the same-label grace period. No manual balance grant.
- Historical 2 October test-card purchase: £4.99, livemode=false, +8 credits and one successful webhook. Preserved, not represented as a new live payment test.
- All 15 previously checked public routes responded 200; final deployed assets are compared with the release.

## Items that remain genuinely outstanding

| Item | Why it cannot be signed off yet |
|---|---|
| Actual downloaded PNG/SVG/ZIP receipt and PDF print view | Application clicks and accounting are verified, but this browser returns no download file and blocks Blob print tabs. Do not bypass that policy or mark the artifacts visually inspected. |
| iPhone Safari, physical actual-size print, Cricut import/cut | No physical device/printer/Cricut available. Responsive/static tests are not actual hardware tests. |
| First genuine live customer payment / invoice email / duplicate-delivery verification | Historical sandbox success exists. No owner payment is requested; no new live financial transaction is performed. |
| M19/M20 precautionary-statement wording/completeness; M24 deduplication | Approved but still stranded outside these PRs. Required-content prerequisite is now present, but porting changes rendered text and the previous assessment found 36 FIT→NOT FIT cases; needs isolated reconciliation, primary-source check and visual impact review. Not silently marked complete by #211. |
| M44/M45/M43 circle/name containment | Pending owner visual review of regenerated homepage templates; existing approved image/renderer geometry is preserved. |
| M04 Composer resolved signal, M63 joined-code policy, M37/M64 pictogram precedence | Pending named product decisions; M37/M64 requires independent review. #210 preserves unknown-code refusal and does not claim to implement these changes. |
| Terms clause 7 / PAYG policy / future subscription-law review | Current clause still says subscription fees, which does not expressly include PAYG fees. Requires policy/legal review; no contract wording silently rewritten. |
| Height >150 mm explanatory feedback | Existing maximum remains; inline explanatory UX remains a separate enhancement. |

The October 3 outstanding/reconciliation documents remain historical. This register supersedes their old deployed/test-status descriptions; it does not erase their unresolved review requirements.
