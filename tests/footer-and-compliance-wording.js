// Regression coverage for the Sep 2026 marketing-copy/compliance-wording
// review: the homepage footer tagline switched from "CLP label compliance"
// to "CLP label creation" (CLPeasy does not guarantee legal compliance, so
// the footer must describe what the tool does -- create labels -- not
// promise a compliance outcome), and two absolute/overclaiming statements
// found sitewide were corrected to match the careful disclaimer language
// already used on terms.html/compliance.html/faq.html.
// Run from repo root: node tests/footer-and-compliance-wording.js

const fs = require('fs');
const assert = require('assert');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const showcaseHtml = fs.readFileSync('showcase.html', 'utf8');
const builderHtml = fs.readFileSync('builder.html', 'utf8');

// ── Homepage footer tagline ────────────────────────────────────────────
assert(indexHtml.includes('CLP label creation for any maker whose products contain fragrances — candles, wax melts, reed diffusers and more.<br>Built by a maker, for makers.'),
  'homepage footer must use the approved "CLP label creation" tagline with the "Built by a maker, for makers." line break');
assert(!indexHtml.includes('CLP label compliance for any maker whose products contain fragrances'),
  'the old "CLP label compliance for any maker..." footer wording must not return (CLPeasy does not guarantee compliance)');

// ── showcase.html: absolute "labels comply" / "cannot be omitted" claim ──
assert(!/All CLPeasy labels comply with/i.test(showcaseHtml),
  'showcase.html must not claim CLPeasy labels unconditionally "comply" with UK CLP Regulation');
assert(!/cannot be omitted/i.test(showcaseHtml),
  'showcase.html must not claim required elements "cannot be omitted" (an absolute guarantee CLPeasy does not make)');
assert(showcaseHtml.includes('Every CLPeasy label template includes the elements required under UK CLP Regulation (EC) No 1272/2008'),
  'showcase.html must describe the template (not the finished, unverified label) as including the required elements');
assert(showcaseHtml.includes('You remain responsible for verifying hazard data against your actual SDS at your specific fragrance load before printing'),
  'showcase.html must retain the user-responsibility disclaimer alongside the CLP Regulation note');

// ── builder.html: "let CLPeasy handle the compliance" overclaim ─────────
assert(!/let CLPeasy handle the compliance/i.test(builderHtml),
  'builder.html page-sub must not imply CLPeasy takes over legal compliance responsibility');
assert(builderHtml.includes('Build your CLP label step by step. Add your product details and let CLPeasy handle the formatting.'),
  'builder.html page-sub must use the corrected "let CLPeasy handle the formatting" wording');

// ── Sitewide guard: no absolute/misleading compliance-guarantee phrases ──
// Customer-facing pages must never claim CLPeasy guarantees, ensures or
// automatically produces compliant output -- only that it helps the user
// create/review a label they remain responsible for.
const customerFacingFiles = [
  'index.html', 'pricing.html', 'faq.html', 'compliance.html', 'knowledge.html',
  'plan-picker.html', 'terms.html', 'privacy.html', 'builder.html', 'my-labels.html',
  'dashboard.html', 'account.html', 'checkout.html', 'support.html',
  'cookie-policy.html', 'refund.html', 'auth.html', 'coming-soon.html', 'showcase.html',
];
const forbiddenPatterns = [
  /guarantees? compliance/i,
  /ensures? (?:full |100% )?compliance/i,
  /automatically compliant/i,
  /fully compliant(?: labels)? every time/i,
  /labels? (?:is|are) guaranteed (?:to be )?compliant/i,
  /cannot be omitted/i,
];
for (const file of customerFacingFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(content),
      `${file} must not contain an absolute compliance-guarantee claim matching ${pattern} (CLPeasy assists with label creation; the user remains the responsible person under GB CLP)`);
  }
}

console.log('footer and compliance-wording checks passed (homepage footer tagline, showcase.html CLP Regulation note, builder.html page-sub, and sitewide absolute-claim guard across ' + customerFacingFiles.length + ' customer-facing pages)');
