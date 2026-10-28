# PR #323 account actions — 28 October 2026

Medium-tier functional UI; draft, no production release authorised.

## Scope

Extend existing `fix/mobile-sidebar-scroll`, preserving c52d5be and its tested scrolling rule. Builder, Dashboard, My Labels, Composer and Account now have a non-interactive account card and a normal Log out button immediately below. Customer/avatar/plan markup and population code retained. Remove obsolete chevron, menu CSS, menu roles and pop-up listeners. Button has a 44px minimum touch target and visible keyboard focus. Existing signOut functions and destinations are byte-identical to main. Desktop shell styling remains; the requested visible action adds height beneath the card.

## Executed evidence

- `tests/sidebar-account-actions.js`: five pages PASS. Preserved account-detail markup, normal permanent button, popup absent, existing signOut code unchanged, exactly one mocked signOut call and existing destination.
- `tests/app-static-audit.js`: PASS across 36 HTML files after correcting a leftover unary `+` beside the removed IIFE in Account/My Labels. The first candidate had parse failures; corrected before final handoff.
- Existing regression modules run individually with 25-second bounds so one failure cannot hide later checks: SDS confirmation, two-column signal words, Section 2.2 scope, PNG before credit, live export hotfix, scrolling accessibility, Builder regressions, PAYG accounting/pricing/consent, pause wording, SQL entitlement/signup contracts, post-download/stage2 print help, hazard-source integrity, P241 messages, Smart Paste lockdown and local Guide Me modules passed. Deno runner exits successfully but explicitly skips unavailable Deno tests.
- PAYG account display assertions PASS for expired trial/PAYG, active/cancelled/paused plans, balances and trial conversion; runner stays alive after assertions. Same baseline timeout. Next-payment test rerun separately after parse correction.
- `tests/versioning-and-release-notes.js`: PASS.
- Direct production comparison: Builder and Composer inline scripts/styles match main 5871ed2; live version.js byte-identical. Netlify rewrites HTML links.

## Existing/environment limitations, separate from candidate defects

- Plan-checker and preview-watermark runners time out at 25 seconds on both main and candidate. PAYG display runner also stays alive after its assertions on both.
- Builder sign-in, sign-in entitlement, Composer browser and new mobile-sidebar browser tests cannot launch Chromium: environment denies socket creation (`Operation not permitted`). These are not passing visual tests.
- Cloud desktop preview redirects Dashboard to sign-in. No authenticated preview session/credentials supplied. No real customer account, balance, payment, subscription or saved label was modified.
- Physical iPhone Safari and short-screen tests remain outstanding on the updated candidate. Previous founder scroll approval remains valid for unchanged scrolling rule, not the new account-action layout.

## Release gate and verification

Remain draft. Preview login and real iPhone checks across all five pages at short screen heights, desktop visual review, then explicit founder merge/deploy approval. Test direct button tap after scrolling (without tapping name), name/plan preservation, no clipped action, back/navigation and sign-in again. After approved release verify these live plus safe account/download/saved-label smoke checks using a designated test account. No production merge/deploy performed.
