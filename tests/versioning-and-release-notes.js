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
  ['New and improved', 'Label-building improvements', 'Printing and downloads',
   'Usability and accessibility', 'Reliability and security'].forEach((heading) => {
    assert(releaseNotesHtml.includes(heading), `release-notes.html must include the "${heading}" category heading`);
  });

  // Reuses the existing site design system (same CSS variables/classes as
  // faq.html), rather than inventing a new visual language.
  ['--teal:', '--text-mid:', 'nav-badge', 'nav-easy', 'class="hero"'].forEach((token) => {
    assert(releaseNotesHtml.includes(token), `release-notes.html must reuse the existing design token/class "${token}"`);
  });
  assert(releaseNotesHtml.includes('66 Paul Street, London, EC2A 4NA'),
    'release-notes.html must reuse the existing standard site footer content');

  // High-level security language only -- no bypass details, internal
  // function/table names, or vulnerability specifics.
  const forbiddenSecurityDetail = [
    /LabelRenderer\.renderLabel/i, /watermark:\s*false/i, /S\.isPro/,
    /Supabase/i, /localStorage/i, /devtools/i, /console/i, /RLS\b/,
    /SECURITY DEFINER/i, /supabase\.co|subscriptions table/i,
  ];
  forbiddenSecurityDetail.forEach((pattern) => {
    assert(!pattern.test(releaseNotesHtml),
      `release-notes.html must not expose internal/bypass detail matching ${pattern}`);
  });

  // ── 6. No absolute compliance claims on the new page ───────────────────
  const forbiddenCompliancePatterns = [
    /guarantees? compliance/i, /ensures? (?:full |100% )?compliance/i,
    /automatically compliant/i, /always (?:correct|accurate|right)\b/i,
    /100% (?:accurate|compliant|correct)/i, /error[- ]free/i,
    /never have to (?:look anything up|check|verify)/i,
  ];
  forbiddenCompliancePatterns.forEach((pattern) => {
    assert(!pattern.test(releaseNotesHtml),
      `release-notes.html must not contain an absolute compliance-guarantee claim matching ${pattern}`);
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
