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
const planPickerHtml = fs.readFileSync('plan-picker.html', 'utf8');

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

// ── showcase.html: "What's on every CLPeasy label" section overclaims ───
// (found in a follow-up review of the deployed preview -- missed in the
// first pass because the earlier audit only inspected the closing
// compliance-law-note, not the four c-desc/section-sub items above it)
assert(!/you never have to look anything up manually/i.test(showcaseHtml),
  'showcase.html must not claim the user never has to check anything (CLPeasy assists extraction, it does not remove the need to verify)');
assert(showcaseHtml.includes('CLPeasy helps you extract and format them from your SDS Section 2.2 data — always check the result against your current SDS before printing'),
  'showcase.html intro must describe CLPeasy as helping extract/format data, with an explicit check-before-printing instruction');
assert(!/The correct hazard diamond symbols auto-selected/i.test(showcaseHtml),
  'showcase.html must not claim pictogram selection is unconditionally "correct" (implies infallibility)');
assert(showcaseHtml.includes('Hazard diamond symbols selected to match your SDS Section 2.2 data'),
  'showcase.html must describe pictograms as matching the SDS data provided, not as guaranteed "correct"');
assert(!/CLPeasy will never apply the wrong signal word/i.test(showcaseHtml),
  'showcase.html must not claim CLPeasy will "never" get the signal word wrong (an infallibility guarantee)');
assert(showcaseHtml.includes('WARNING or DANGER — determined from your SDS data using the GB CLP signal-word rules. Always verify against your current SDS'),
  'showcase.html must describe the signal word as rule-derived, with a verify instruction, not an infallibility claim');
assert(!/EUH208 "Contains \[allergen\]" added automatically when your SDS requires it/i.test(showcaseHtml),
  'showcase.html must not claim CLPeasy infallibly knows when your SDS "requires" EUH208');
assert(showcaseHtml.includes('EUH208 "Contains [allergen]" added based on the sensitiser data you provide'),
  'showcase.html must describe EUH208 as driven by the sensitiser data the user provides');

// ── plan-picker.html: "always correct" quiz-result overclaim ────────────
assert(!/give you confidence your labels are always correct/i.test(planPickerHtml),
  'plan-picker.html Easy Pro result must not claim labels are "always correct" (CLPeasy does not guarantee accuracy)');
assert(planPickerHtml.includes('Based on how you work, Easy Pro will save you time, reduce risk and help you review your labels with confidence.'),
  'plan-picker.html Easy Pro result must use the corrected "help you review your labels with confidence" wording');

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
  /never have to (?:look anything up|check|verify)/i,
  /will never (?:apply|select|choose|generate|produce) the wrong/i,
  /always (?:correct|accurate|right)\b/i,
  /100% (?:accurate|compliant|correct)/i,
  /error[- ]free/i,
  /no need to (?:check|verify|double-check)/i,
];
for (const file of customerFacingFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(content),
      `${file} must not contain an absolute compliance-guarantee claim matching ${pattern} (CLPeasy assists with label creation; the user remains the responsible person under GB CLP)`);
  }
}

console.log('footer and compliance-wording checks passed (homepage footer tagline, showcase.html CLP Regulation note, builder.html page-sub, and sitewide absolute-claim guard across ' + customerFacingFiles.length + ' customer-facing pages)');
