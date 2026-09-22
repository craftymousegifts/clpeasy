// Regression coverage for the Sep 2026 versioning + customer release-notes
// work (Issue #129): a single authoritative version source (version.js),
// the Builder sidebar "What's new" link replacing the old stale
// "Version 1.0 — released 15/06/2026" text, and the new release-notes.html
// page. Run from repo root: node tests/versioning-and-release-notes.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(repoRoot, f), 'utf8');

const versionJs = read('version.js');
const builderHtml = read('builder.html');
const releaseNotesHtml = read('release-notes.html');
const changelogMd = read('CHANGELOG.md');
const versioningMd = read('VERSIONING.md');

try {
  // ── 1. Single authoritative version source ───────────────────────────
  assert(/window\.CLPEASY_VERSION\s*=\s*\{\s*number:\s*'1\.1\.0'/.test(versionJs),
    'version.js must define window.CLPEASY_VERSION with number "1.1.0"');

  // ── 2. builder.html loads version.js and derives its display from it ──
  assert(/<script src="version\.js"><\/script>/.test(builderHtml),
    'builder.html must load version.js as the single authoritative version source');
  assert(/window\.CLPEASY_VERSION/.test(builderHtml),
    'builder.html must read the version from window.CLPEASY_VERSION rather than a separate hard-coded literal');
  // No second, independently hard-coded product-version number should
  // exist in builder.html now that version.js is authoritative.
  assert(!/APP_VERSION=\{number:'1\.0'/.test(builderHtml),
    'the old hard-coded APP_VERSION={number:\'1.0\',...} literal must be gone from builder.html');

  // ── 3. Stale "Version 1.0 — released 15/06/2026" text is gone ─────────
  assert(!/Version 1\.0/.test(builderHtml),
    'the stale "Version 1.0" mobile-menu text must not remain anywhere in builder.html');
  assert(!/released 15\/06\/2026/.test(builderHtml),
    'the release date must no longer be shown in the navigation/sidebar (it now lives on release-notes.html/CHANGELOG.md as history)');
  assert(!/toggleVersionInfo/.test(builderHtml),
    'the old click-to-reveal-date behaviour must be removed, replaced by a direct release-notes link');

  // ── 4. The sidebar entry links to release-notes.html and is accessible ─
  const dom = new JSDOM(builderHtml);
  const link = dom.window.document.getElementById('app-version-link');
  assert(link, 'builder.html must contain an #app-version-link element in the sidebar');
  assert.strictEqual(link.tagName, 'A', 'the "What\'s new" entry must be a real <a> element so it is natively keyboard-focusable and tappable');
  assert.strictEqual(link.getAttribute('href'), 'release-notes.html',
    'the "What\'s new" link must point at release-notes.html');
  assert(link.closest('.sidebar-nav'), 'the link must live inside the sidebar navigation (the mobile menu is the same markup, toggled by CSS/JS)');

  // The link's accessible text is populated by JS at runtime (from
  // CLPEASY_VERSION), not baked into the static HTML -- verify the exact
  // population logic is present and correct, since jsdom does not run the
  // page's own inline <script> blocks needed for full app bootstrap here.
  assert(/link\.textContent=.*What's new.*APP_VERSION\.number/.test(builderHtml),
    'the sidebar link text must be set to "What\'s new · v" + the version number at runtime');
  assert(/link\.setAttribute\('aria-label'/.test(builderHtml),
    'the sidebar link must be given an explicit aria-label for accessibility');

  // Focus-visible styling exists for the link (keyboard focus state).
  assert(/\.app-version-link:hover,\.app-version-link:focus-visible\{color:var\(--teal\);\}/.test(builderHtml),
    'the "What\'s new" link must have a visible :focus-visible state, not just :hover');

  // ── 5. release-notes.html exists and covers both releases ─────────────
  assert(/<title>What's new in CLPeasy<\/title>/.test(releaseNotesHtml),
    'release-notes.html must be titled "What\'s new in CLPeasy"');
  assert(/v1\.1\.0/.test(releaseNotesHtml), 'release-notes.html must document v1.1.0');
  assert(/v1\.0\.0/.test(releaseNotesHtml), 'release-notes.html must document v1.0.0');
  assert(/15 June 2026/.test(releaseNotesHtml),
    'release-notes.html must record the real v1.0.0 launch date as historical information');
  // Sep 2026 public-communications correction: the original 5-category
  // structure merged "Usability and accessibility" + "Reliability and
  // security" into a single "Usability and reliability" section, and
  // dropped the standalone "security" framing (see the disclosure audit
  // below) in favour of customer-benefit language throughout.
  ['New and improved', 'Label-building improvements', 'Printing and downloads',
   'Usability and reliability'].forEach((heading) => {
    assert(releaseNotesHtml.includes(heading), `release-notes.html must include the "${heading}" category heading`);
  });
  assert(!releaseNotesHtml.includes('Usability and accessibility'),
    'the old "Usability and accessibility" heading must have been merged into "Usability and reliability"');
  assert(!releaseNotesHtml.includes('Reliability and security'),
    'the old standalone "Reliability and security" heading must be gone -- merged into "Usability and reliability" with customer-benefit wording');

  // Reuses the existing site design system (same CSS variables/classes as
  // faq.html), rather than inventing a new visual language.
  ['--teal:', '--text-mid:', 'nav-badge', 'nav-easy', 'class="hero"'].forEach((token) => {
    assert(releaseNotesHtml.includes(token), `release-notes.html must reuse the existing design token/class "${token}"`);
  });
  assert(releaseNotesHtml.includes('66 Paul Street, London, EC2A 4NA'),
    'release-notes.html must reuse the existing standard site footer content');

  // High-level language only -- no bypass details, internal function/table
  // names, DOM/console mechanics, or vulnerability specifics. Extended Sep
  // 2026 (public-communications correction, Issue #127 disclosure audit)
  // to also forbid rasterisation-as-a-security-defence explanations,
  // watermark-removal-method descriptions, and framing prior behaviour as
  // a "bug"/"defect"/codes being "silently accepted".
  const forbiddenSecurityDetail = [
    /LabelRenderer\.renderLabel/i, /watermark:\s*false/i, /S\.isPro/,
    /Supabase/i, /localStorage/i, /devtools/i, /console/i, /RLS\b/,
    /SECURITY DEFINER/i, /supabase\.co|subscriptions table/i,
    /rasteris|rasteriz/i, /watermark[- ]removal/i, /\.remove\(\)/,
    /getElementById/i, /\bDOM\b/, /<g>|<\/g>/,
    /silently accepted/i,
    /signal[- ]?word (?:bug|defect|issue|flaw|vulnerability)/i,
    /(?:bug|defect|flaw|vulnerability) in (?:the )?signal[- ]?word/i,
    /expired (?:trial|account)[^.]{0,60}clean (?:export|download)/i,
    /cancelled (?:account|subscription)[^.]{0,60}clean (?:export|download)/i,
  ];
  forbiddenSecurityDetail.forEach((pattern) => {
    assert(!pattern.test(releaseNotesHtml),
      `release-notes.html must not expose internal/bypass detail or defect-framing matching ${pattern}`);
  });

  // ── 6. No absolute compliance claims on the new page ───────────────────
  const forbiddenCompliancePatterns = [
    /guarantees? compliance/i, /ensures? (?:full |100% )?compliance/i,
    /automatically compliant/i, /always (?:correct|accurate|right)\b/i,
    /100% (?:accurate|compliant|correct)/i, /error[- ]free/i,
    /never have to (?:look anything up|check|verify)/i,
    // Sep 2026 correction: these specific absolute-security/entitlement
    // claims overstated protection while Issue #127 (the residual
    // client-side rendering gap) remains open -- must never return.
    /can no longer be tampered with/i,
    /can never produce/i,
    /always matches your SDS/i,
    /tamper-?proof/i,
    /\bimpossible to (?:bypass|tamper|reconstruct)/i,
  ];
  forbiddenCompliancePatterns.forEach((pattern) => {
    assert(!pattern.test(releaseNotesHtml),
      `release-notes.html must not contain an absolute compliance/security-guarantee claim matching ${pattern}`);
  });

  // While Issue #127 (the server-side rendering boundary) remains open,
  // the release notes must not claim the preview/export security work is
  // complete -- only that it was strengthened/made harder to bypass.
  assert(!/complete(?:ly)? (?:secure|protected|prevented)/i.test(releaseNotesHtml),
    'release-notes.html must not claim complete/total security while Issue #127 is still open');

  // ── 6b. Positively assert the approved, customer-benefit wording ──────
  // Sep 2026 public-communications correction: the previous round's
  // technical-but-accurate sentences (naming the preview watermark, the
  // account-status check, the signal-word selection logic) were still
  // more implementation detail than a customer release note needs, and
  // one read as narrating a defect history. Replaced with plain
  // customer-benefit language; the underlying code change is unchanged
  // and still documented in full in CHANGELOG.md and git history.
  [
    'Added the', 'Print Sheet Composer', 'for arranging multiple labels on a printable sheet.',
    'Added ready-made UK sheet layouts and custom-grid options.',
    'Refreshed the homepage and product information to explain CLPeasy more clearly.',
    'Improved Smart Paste extraction and review guidance.',
    'Added further checks around hazard codes and signal-word selection.',
    'Improved text fitting across different label shapes and sizes.',
    'Improved the handling of long chemical and substance names.',
    'Added clearer reminders to verify label information against the current supplier SDS before printing.',
    'Expanded printable-sheet and cutting-machine options.',
    'Added clearer guidance for Cricut and other cutting machines.',
    'Refined the download experience and account checks.',
    'Improved mobile and desktop layouts.',
    'Simplified label-builder navigation and hazard confirmation.',
    'Improved preview handling and general platform reliability.',
    'Added the customer-facing',
  ].forEach((phrase) => {
    assert(releaseNotesHtml.includes(phrase), `release-notes.html must include the approved customer-benefit wording "${phrase}"`);
  });
  assert(/verify label information against the current supplier SDS/i.test(releaseNotesHtml),
    'release-notes.html must retain a verify-against-current-SDS reminder');

  // The prior round's more technical sentences must not have survived
  // this pass (they described real behaviour accurately, but in more
  // implementation detail than a public release note needs).
  [
    'Strengthened unpaid and trial previews by flattening the displayed label',
    'Added a fresh account-status check immediately before downloads to prevent expired trials or cancelled subscriptions',
    'Corrected the signal-word selection logic and added further checks to help it reflect the hazard information entered from the current supplier SDS.',
    'Fixed a signal word issue',
  ].forEach((phrase) => {
    assert(!releaseNotesHtml.includes(phrase),
      `release-notes.html must not retain the more technical/defect-framed wording "${phrase}" from the previous round`);
  });

  // ── 7. Version consistency across records ──────────────────────────────
  assert(/\[1\.1\.0\]/.test(changelogMd), 'CHANGELOG.md must record a [1.1.0] entry');
  assert(/\[1\.0\.0\]/.test(changelogMd), 'CHANGELOG.md must record a [1.0.0] entry');
  assert(/2026-06-15/.test(changelogMd), 'CHANGELOG.md must record the real v1.0.0 launch date (2026-06-15)');
  assert(/2026-09-22/.test(changelogMd), 'CHANGELOG.md must record the v1.1.0 release date (2026-09-22)');
  assert(/Semantic Versioning/i.test(versioningMd), 'VERSIONING.md must document the semantic-versioning scheme');
  assert(/version\.js/.test(versioningMd), 'VERSIONING.md must point at version.js as the single source of truth');
  assert(/Squash/i.test(versioningMd), 'VERSIONING.md must document the squash-and-merge preference');
  assert(/[Rr]ollback/.test(versioningMd), 'VERSIONING.md must document the rollback procedure');
  assert(/tag/i.test(versioningMd) && /[Rr]elease/i.test(versioningMd),
    'VERSIONING.md must document Git tags and GitHub Releases');

  // No other customer-facing page should carry a conflicting hard-coded
  // product-version string (e.g. a stray "Version 1.0" or "v1.1.0" baked
  // into a different page than the single source of truth).
  const otherCustomerPages = [
    'index.html', 'dashboard.html', 'my-labels.html', 'account.html', 'print.html',
    'pricing.html', 'faq.html', 'showcase.html', 'plan-picker.html',
  ];
  otherCustomerPages.forEach((f) => {
    const html = read(f);
    assert(!/Version \d+\.\d+(\.\d+)?/.test(html),
      `${f} must not carry its own independent hard-coded product-version string -- version.js is the single source of truth`);
  });

  console.log('versioning-and-release-notes checks passed (version.js is the single authoritative source at 1.1.0; builder.html\'s sidebar "What\'s new · v1.1.0" link replaces the stale "Version 1.0 — released 15/06/2026" text, is a real accessible/focusable <a> pointing at release-notes.html; release-notes.html documents both v1.1.0 and v1.0.0 across all required categories with no bypass detail or absolute compliance claims; CHANGELOG.md/VERSIONING.md are consistent; no other page carries a conflicting version string)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
