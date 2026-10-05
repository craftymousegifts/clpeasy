# CLPeasy final production + policy QA (5 Oct 2026)

**Production audited:**
- `main` `bb84b61` (#219);
- Netlify deploy `6ac3022ace66790008fa6095` (ready, `context: production`, commit `bb84b61`).

The served pages match `main` (differences are only Netlify's pretty-URL rewriting).

**Branch with proposed corrections:** `audit/release-signoff-2026-10-05`. **Not merged, not deployed.**

## Environment limits (BLOCKED here, not CLPeasy defects)
The build environment's network policy blocks:
- `clpeasy.com` (production was tested through its Netlify deploy address);
- production and Test Supabase;
- the jsDelivr/cdnjs CDNs, Plausible, Stripe and Google.

As a result, live sign-up, login, Google sign-in, password reset, real balances, Guide Me answers and
checkout could not be exercised live. They are covered by the automated tests (simulated Supabase
and Stripe). No payment was made.

## Release sign-off table
| # | Area / page | Finding | Severity | Evidence | Action | Commit/PR | Retest |
|---|---|---|---|---|---|---|---|
| 1 | Whole site | All 41 internal URLs return 200; retired/internal pages return 404 | — | crawl of production deploy; nightly link scan and daily health check green on `bb84b61` | none | — | PASS |
| 2 | Public pages at 375 / 390 / 1366 px | No horizontal scroll on any of 17 public pages | — | production browser run | none | — | PASS |
| 3 | Builder exports (guest) | PNG 2362×1654, SVG 100×70 mm and a one-page PDF were delivered at 1366/390/375 px; byte-identical to 4 Oct | — | real files saved from production | none | — | PASS |
| 4 | Automated suite | 82/83 pass on `bb84b61` | — | full run | see #5 | — | PASS (1 known) |
| 5 | Pricing page: "checkout in progress" header indicator | Still not shown on `pricing.html`. #215 mounts it into the header links, but `public-nav.js` (deferred) rebuilds those links afterwards and removes it. Server-side duplicate-checkout protection and its dialog still work; `checkout.html` shows the indicator | Low | `pricing-checkout-ux` | A fix that remounts it was tested. It works on desktop, but on iPhone the indicator sits inside the collapsed menu and overlaps "Our story". Placement needs an owner decision, so the fix was **reverted** | — | OWNER DECISION |
| 6 | Pricing header for signed-in visitors | Fixed by #215 | — | `pricing-signed-in-cta` PASS | none | #215 | PASS |
| 7 | Repo / PRs | Production = `main`. Every 4–5 Oct branch matches its squash merge (patch-id). `fix/sitewide-ios-horizontal-overflow` (no PR) is an earlier draft superseded by #219. No unresolved comments on #213–#219. The 10 older open PRs are as dispositioned in `FINAL-PR-SIGNOFF-2026-10-04.md` | — | git / GitHub | none | — | PASS |
| 8 | Pricing model | The site, FAQ, checkout and **server** agree on the **released** model: Easy Start Unlimited £9.99/month (£8.99 until 31 Dec 2026), £89/year, Easy Pro and top-ups retired, PAYG £4.99 = 8 downloads (5 + 3 bonus) **on every pack** until 31 Dec 2026, 14-day trial (10 watermarked downloads, no card). The QA brief lists a different model (Easy Pro £14.99, annual £99/£149, one-off bonus); that matches the June history, not the release approved on 2–3 Oct (`1895a92`, `4df62cc`) | High if the brief is the intended model | `create-checkout-session` stamps 8 downloads on every pack until 2027-01-01 | **None.** Changing it would be a commercial and server change | — | OWNER DECISION |
| 9 | Release notes | 15 June entry mentions Easy Pro and top-ups | Info | dated history entry | none (accurate history) | — | PASS |
| 10 | Builder / dashboard sidebar logo | Showed CLPeasy™; 60+ other places use ® | Low | grep | ™ → ® (the "Easy Trial™" plan name keeps ™) | branch | PASS (rendered) |
| 11 | Trade mark ® | Terms say UK00004395085 was **filed** 31 May 2026. Using ® on a mark that is not yet **registered** is an offence under s.95 Trade Marks Act 1994 | Legal | terms.html clause 8 | Confirm the mark is entered on the register; if so, update clause 8 to "registered" | — | OWNER/LEGAL |
| 12 | Cookie Policy | Listed `sb-access-token`/`sb-refresh-token` **cookies**. CLPeasy sets no cookies (0 cookies before or after consent); sign-in uses local storage `sb-qvkosdqcryrcfbjtaxic-auth-token`. Labels, business details, folders and history are local storage; checkout choices are session storage. Plausible not mentioned. "Pro subscription" stale. Footer lacked ® | Medium (inaccurate policy) | production browser measurement + code | Table and text corrected to the measured storage; Plausible named; purchase wording updated; date 5 Oct 2026 | branch | PASS (rendered 375/1366) |
| 13 | Cookie banner | "Accept" and "Essential only" change nothing (no optional cookies or storage exist). Plausible loads for everyone | Low | code + measurement | none | — | OWNER/LEGAL |
| 14 | Cookie table on phones | Duration column partly cut off at 375 px; **pre-existing** (481 px wide on production) | Low | measurement | New name cells wrap (now 389 px). Layout itself unchanged | branch | Pre-existing, improved |
| 15 | Privacy Policy: processors | Missing: **Anthropic** (Guide Me and Knowledge Base questions are sent to the Anthropic API), **Plausible**, Google Fonts / jsDelivr / cdnjs (receive IP). Brevo purposes incomplete (support/feedback forms, pause/cancel/win-back emails via `clp-account-events`, `send-support-email`) | Medium | deployed edge functions `clp-wizard`, `clp-search`, `clp-account-events` | Added to the third-party list and purposes | branch | PASS (rendered) |
| 16 | Privacy Policy: data table | Labels and business details are stored in the browser, not the account. The server records product name/type/shape/size per download. The PAYG consent timestamp is stored with the Stripe payment. IP is used for daily AI-question limits (`api_rate_limits`) | Medium | code | Rows corrected factually; date 5 Oct 2026 | branch | PASS |
| 17 | Privacy: transfers, legal bases, retention | Anthropic (US) and other non-UK processors have no transfer wording; no legal basis given for AI questions; `api_rate_limits` retention unknown; "Zoho Mail" not found in code (may be Supabase Auth SMTP); "renewal reminders before your annual plan renews" has no CLPeasy code (only Stripe's own emails, if enabled); Brevo win-back emails are marketing | Legal | code | **not changed** | — | OWNER/LEGAL |
| 18 | Terms | "Last updated 19 June" although clauses 6 and 9 changed 2–3 Oct; clause 2 said fragrance % is always entered (optional since `75c7311`) | Low | git history | Date 5 Oct 2026; "where relevant (optional)" | branch | PASS |
| 19 | Terms: gaps | Clause 7 liability cap counts "subscription fees" only (PAYG); no clause for trial limits, credits not expiring, bonus credits, immediate supply, Stripe, browser-stored labels; clause 6 says registration is required, but guests can use the Builder (watermarked); the HSE wording differs (Terms "has not identified" vs FAQ "confirmed") | Legal | text | **not changed** | — | OWNER/LEGAL |
| 20 | Refund Policy | Matches checkout: PAYG consent tick required (server refuses without it), invoice memo, unused-credit refund maths correct (£3.12 / £0.63), all "Buy downloads" links route via the consent. Date said "May 2026" | Low | code + tests | Date → 3 October 2026 | branch | PASS |
| 21 | Refund: subscriptions | No express immediate-supply request at **subscription** checkout, so the 14-day cancellation right for monthly/annual subscriptions may be wider than the wording implies | Legal | checkout code | **not changed** | — | OWNER/LEGAL |
| 22 | Marketing claims | No "fully/automatically/legally compliant" or "guarantee" claims. Pricing explicitly says no guarantee and no monitoring/alerts. "Will my labels be legally compliant?" answers with user responsibility. `lifecycle-reminder-accuracy` PASS | — | site-wide search | none | — | PASS |
| 23 | Live-only flows | Sign-up, login, Google, reset, real balances, Guide Me answers, signed-in Composer on production | — | network policy | covered by automated tests only | — | BLOCKED (environment) |
| 24 | Real iPhone/Safari | Outstanding owner check (`IPHONE-OWNER-CHECK-2026-10-04.md`); #216–#218 changed iPhone preview fit since | — | — | — | — | OWNER CHECK |

## Data-flow inventory (from code and deployed functions)
| Service | What it receives | Where in code | In policy before this audit? |
|---|---|---|---|
| Supabase (eu-west-2 London) | account email, hashed password, profile (name, plan, credits), download log (product name/type/shape/size), IP-keyed rate-limit counters | pages, `consume_download`, `clp-wizard`/`clp-search` | Yes (partly) |
| Stripe | payment, billing email, PAYG consent metadata and timestamp | `create-checkout-session`, `stripe-webhook`, portal | Yes |
| Anthropic API | Guide Me chat text; Knowledge Base questions | `clp-wizard`, `clp-search` | **No** |
| Brevo | email for signup lists, lifecycle and cancellation/win-back emails, support/feedback messages | `notify-signup`, `clp-account-events`, `send-*-email`, `stripe-webhook` | Partly |
| Plausible | page views (script on every page, not consent-gated) | `<script>` tags, `plausible-proxy` | **No** |
| Google | OAuth sign-in (optional); Google Fonts (IP on every page) | auth, `<link>` | OAuth yes, Fonts **no** |
| jsDelivr, cdnjs | IP (supabase-js, JSZip) | `<script>` | **No** |
| Netlify | hosting, request logs | — | Yes |
| Zoho Mail | not found in code | — | Listed; owner to confirm |
| Browser storage | auth token, labels, business details, folders, history, consent, checkout choices | listed in the Cookie Policy now | Inaccurate before |
| SDS / Smart Paste text | processed in the browser only; no network call found | `extractSDS` | — |

---

# Round 2: owner decisions applied (5 Oct 2026)

## Pricing: the current October model is intentional
**Model:**
- Easy Start Unlimited £9.99/month (£8.99 until 31 Dec 2026), £89/year;
- Easy Pro and top-ups retired;
- PAYG £4.99 = 5 + 3 bonus = 8 downloads on every pack until 31 Dec 2026.

**Re-audit result:** every customer-visible page and policy is consistent with it. That covers home, pricing, FAQ, checkout, plan picker, account/dashboard, Builder FAQ, Terms and Refund. The plan checker shows the standard £4.99/5 with a separate "Current offer: 8 downloads" line, as designed. The old £14.99, £99 and £149 figures appear only in code comments and in the disabled save-offer code (`SAVE_OFFER_ENABLED = false`). The 15 June release note is dated history. **PASS.** No Stripe or server change was made.

## Trade mark UK00004395085: NOT VERIFIED (BLOCKED)
**Sources tried:**
- UKIPO register (`trademarks.ipo.gov.uk`): blocked by the network policy;
- `ipo.gov.uk`, EUIPO TMview and WIPO Global Brand Database: blocked;
- Gmail (UKIPO correspondence): connector needs re-authorising;
- Google Drive: only an unofficial history document.

The only web result is the owner's own LinkedIn post saying it is registered. That is not authoritative.

**Action:** no trade mark symbol was changed. The round-1 sidebar ™→® change was **reverted**. Terms clause 8 carries a review placeholder.

## Plausible and consent: proposed change (NOT implemented)
**Evidence:**
- The Plausible tracker (`@plausible-analytics/tracker` 0.4.6) sets no cookies.
- It does **read** `localStorage.plausible_ignore`, which is access to information stored on the device, so PECR regulation 6 is engaged.
- According to the ICO's storage and access technologies guidance (search extract from ico.org.uk), the DUAA 2025 "statistical purposes" exception (in force 5 Feb 2026) removes the need for consent. In return it requires **clear and comprehensive information** and an **easy, free way to object**, including for JavaScript tags.

**Current state:**
- Information: now provided in the corrected policies.
- Way to object: **missing**. The banner's "Essential only" does nothing.
- The banner also says "We use essential cookies to keep you logged in", but sign-in uses local storage, not cookies.

**Proposed minimal change (awaiting approval):**
1. Banner "Essential only" (on `index.html` and `checkout.html`) also sets `localStorage.plausible_ignore = 'true'`; "Accept" removes it. This is Plausible's own documented opt-out flag.
2. Add a one-click "Turn analytics off/on" link in the Cookie Policy, using the same flag.
3. Banner text → "We use essential browser storage to keep you signed in, and privacy-friendly analytics with no cookies. No advertising or tracking cookies."

No redesign is involved. The policy placeholder will then be replaced.

## Subscription cancellation (A–E)
- **A. What the site does:**
  - Subscription checkout (`checkout.html` → Stripe) shows "By subscribing you agree to our terms and refund policy. Your subscription auto-renews. Cancel any time".
  - There is **no** express request to start within 14 days and no acknowledgement.
  - Unlimited downloads start straight after payment.
  - Self-service cancel sets `cancel_at_period_end` (no automatic refund); refunds are manual by email.
- **B. Refund Policy:**
  - 14-day rights "can apply… depending on whether you asked for the service to begin during the cancellation period and how much of the service has already been supplied".
  - Monthly: no pro-rata refunds *outside* statutory rights.
  - Annual: requests within 14 days handled per statutory rights, otherwise case by case.
- **C. Terms clause 9:** cancel any time, effective at period end, no partial-period refunds "except where required by UK consumer law".
- **D. Change that appears necessary:** the policies never promise *less* than the law, but they don't tell a subscriber what they get if they cancel within 14 days. Because no express request is captured, the business should decide one of:
  1. honour a **full refund** for a subscription cancelled within 14 days of purchase, and say so; or
  2. add an express request and acknowledgement at subscription checkout (like PAYG), then apply whatever the law allows for service already supplied.

  Option 1 needs no code. Option 2 is a checkout change.
- **E. OWNER/LEGAL REVIEW:**
  - whether CLPeasy is a "service" or "digital content" (the same open question as PAYG);
  - the 14-day refund position for subscriptions;
  - the wording.

  Rights were **not** weakened; placeholders are in Terms clause 9 and the Refund Policy.

## Round-2 changes in #220
| File | Change |
|---|---|
| `terms.html` | Clause 6 rewritten to the current product: guest Builder (watermarked), trial (14 days, no card, 10 watermarked downloads), Easy Start Unlimited, PAYG credits (one per download, 7-day same-label re-download, no expiry, bonus credits part of the pack), PAYG immediate-access confirmation, Stripe. Clause 4: "CLPeasy does not guarantee that any label is legally compliant." Clause 7: liability cap counts subscription **and PAYG** fees. Placeholders for clause 8 (trade mark) and clause 9 (subscriptions) |
| `faq.html` | "HSE confirmed that no specific regulatory obligations apply" → "HSE did not identify any…" (matches Terms and the compliance page; less strong) |
| `privacy.html` | Guide Me / Knowledge Base row (Anthropic), Plausible detail, support-form row, browser-storage and Smart Paste statement, Brevo cancellation emails. Placeholders: AI legal basis, renewal reminders, Brevo cancellation/win-back basis, international transfers, retention of download/rate-limit/log records and Anthropic data, Zoho |
| `cookie-policy.html` | Plausible reads `plausible_ignore` (evidenced); opt-out placeholder; mobile table fits from 360 px (8 px internal scroll at 320 px) |
| `refund.html` | Subscription placeholder |
| `tests/payg-immediate-supply-consent.js` | Terms assertion updated to the new clause 6 wording (still requires subscription, PAYG credits, trial and no-expiry) |
| `builder.html`, `dashboard.html` | Round-1 ™→® **reverted** (trade mark unverified) |

**Before merge:** every `[OWNER/LEGAL REVIEW: …]` placeholder (privacy 7, terms 2, cookie 1, refund 1) must be replaced or removed.

## Trade mark: RESOLVED, PASS (owner evidence, 5 Oct 2026)
**Evidence:** the owner holds the official UKIPO Registration Certificate:
- UK00004395085;
- Class 42, Software as a Service (SaaS) services;
- registered with effect from 31/05/2026;
- entered on the register 21/08/2026.

The register itself could not be reached from the build environment; the certificate is the owner's.

**Changes:**
- Terms clause 8 now says "registered trade mark… registered with effect from 31 May 2026 and entered on the register on 21 August 2026". The "filed" wording and its placeholder are removed.
- Builder and dashboard sidebar logos restored to CLPeasy®.
- `compliance.html` already says "registered UK trade mark".
- "Easy Trial™" is unchanged.
- Retired, unpublished `clpeasy-flow.html` (404 on production) still says "filed"; it is not public, so it was left alone.

**Remaining placeholders:** privacy 7, terms 1 (clause 9 subscriptions), cookie 1, refund 1.
