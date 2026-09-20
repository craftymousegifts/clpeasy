// Regression coverage for the homepage CLP lifecycle accuracy correction
// (fix/lifecycle-reminder-accuracy): Steps 7-9 no longer claim CLPeasy
// automatically monitors supplier SDS revisions or GB CLP regulatory
// changes, the lifecycle intro/closing no longer claim full automation, the
// lifecycle nodes are keyboard-accessible with visible titles, and the
// unavailable "SDS review reminders" / "regulation change alerts" features
// are no longer advertised as active plan benefits anywhere on the site.
// Run from repo root: node tests/lifecycle-reminder-accuracy.js

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const pricing = fs.readFileSync('pricing.html', 'utf8');
const planPicker = fs.readFileSync('plan-picker.html', 'utf8');
const showcase = fs.readFileSync('showcase.html', 'utf8');

// ── Step 7, 8, 9 wording (exact, per approved spec) ────────────────────
assert(html.includes('7:{t:"Review when something changes",d:"If your supplier issues a revised SDS, you change the formulation or fragrance concentration, or applicable GB CLP requirements change, reassess the finished product and update the label where needed."'),
  'lifecycle Step 7 must use the approved "Review when something changes" title/description');

assert(html.includes('8:{t:"Check the current information",d:"Before reprinting or continuing to use a label, compare it with the latest supplier SDS and applicable official GB CLP guidance. CLPeasy™ does not currently monitor supplier SDS revisions or regulatory changes for you."'),
  'lifecycle Step 8 must use the approved "Check the current information" title/description and must state CLPeasy does not currently monitor SDS/regulatory changes');

assert(html.includes('9:{t:"Update and reprint",d:"Open your saved label, update the information where needed and generate a new version. Always verify the finished label against the current supplier SDS and applicable official GB CLP guidance before sale."'),
  'lifecycle Step 9 must use the approved "Update and reprint" title/description');

// ── Lifecycle no longer claims automatic monitoring / guaranteed currency ──
assert(!/CLPeasy.{0,5}(™)?\s*handles every stage automatically/i.test(html),
  'lifecycle intro must not claim CLPeasy handles every stage automatically');
assert(!/CLPeasy.{0,5}(™)?\s*supports every stage of this lifecycle\s*—?\s*automatically/i.test(html),
  'lifecycle closing statement must not claim CLPeasy supports every stage automatically');
assert(html.includes('CLPeasy™ helps you build, update and reprint your label using the information you provide.'),
  'lifecycle must use the accurate "helps you build, update and reprint" wording in place of the automation claims');

// ── No duplicated reminder/regulation-alert claims presented as active ────
const bannedActiveClaims = [
  /SDS review reminders?,?\s*(never sell stale data)?/i,
  /11\s*months? after saving a label/i,
  /automatic SDS review reminder at 11 months/i,
  /regulation (update )?alerts? and (SDS )?review reminders? (will|make sure)/i,
  /CLPeasy.{0,5}(™)?\s*Easy Pro includes regulation update alerts/i,
];
for (const file of [['index.html', html], ['pricing.html', pricing], ['plan-picker.html', planPicker]]) {
  const [name, source] = file;
  // These phrases are allowed ONLY when clearly paired with a "coming
  // soon"/"Coming soon" marker nearby (future-feature framing); anywhere
  // else they would misrepresent an unavailable feature as active.
  const activeReminderMention = /SDS review remind/i.test(source) && !/does not currently (send|monitor)/i.test(source.slice(Math.max(0, source.search(/SDS review remind/i) - 50), source.search(/SDS review remind/i) + 50));
  assert(!activeReminderMention || /Coming soon|COMING SOON/.test(source),
    `${name}: "SDS review reminders" must not be presented as an active, currently-included feature`);
}

assert(!/regulation update alerts and SDS review reminder emails/i.test(pricing),
  'pricing.html FAQ must not list regulation alerts/SDS review reminders as active Easy Pro benefits');
assert(!/Everything above plus SDS Smart Import and regulation update alerts/i.test(pricing),
  'pricing.html plan summary must not describe regulation alerts as an active Easy Pro benefit');
assert(!/Everything in Easy Start plus SDS Smart Import and regulation alerts/i.test(pricing),
  'pricing.html plan summary must not describe regulation alerts as an active Easy Pro benefit');
assert(!/CLPeasy.{0,5}(™)?\s*Easy Pro includes regulation update alerts/i.test(pricing),
  'pricing.html FAQ must not claim Easy Pro currently includes regulation update alerts');

// The still-unimplemented "Regulation change alerts" feature must remain
// explicitly labelled as a future feature wherever it is mentioned in the
// pricing comparison table (it must not read as an active, checked-off
// Easy Pro benefit).
const regAlertsRowMatch = pricing.match(/Regulation change alerts[\s\S]{0,800}?<\/tr>/);
assert(regAlertsRowMatch, 'pricing.html comparison table must still list "Regulation change alerts"');
assert(/Coming soon|Soon/.test(regAlertsRowMatch[0]),
  'pricing.html comparison table "Regulation change alerts" row must be labelled coming soon/not yet active, consistently with its checkmark cell');

// ── Plan picker must not recommend a plan based on unavailable features ───
assert(!/regulation alerts and (SDS )?review reminders will make sure it never happens again/i.test(planPicker),
  'plan-picker.html must not justify a Pro recommendation with unavailable regulation alerts/review reminders');
assert(!/regulation alerts and review reminders will keep you automatically informed/i.test(planPicker),
  'plan-picker.html must not justify a Pro recommendation with unavailable regulation alerts/review reminders');
assert(!/\bregulation alerts\b/i.test(planPicker),
  'plan-picker.html recommendation reasons must not cite "regulation alerts" as a reason to choose Easy Pro');
assert(!/SDS review reminders/i.test(planPicker),
  'plan-picker.html recommendation reasons must not cite "SDS review reminders" as a reason to choose Easy Pro');

// ── Nine-stage lifecycle preserved ─────────────────────────────────────
for (let step = 1; step <= 9; step++) {
  assert(new RegExp(`data-step="${step}"`).test(html), `lifecycle SVG must still have a node for step ${step}`);
  assert(new RegExp(`\\n\\s*${step}:\\{t:`).test(html), `lifecycle steps data object must still have an entry for step ${step}`);
}
assert(!/data-step="10"/.test(html), 'lifecycle must remain a nine-stage sequence (no step 10 added)');

// ── Step titles visible without relying solely on hover ────────────────
const expectedTitles = [
  'New scent idea', 'Get your SDS', 'Import hazard data', 'Build your label',
  'Download &amp; print', 'Sell your product', 'Review when something changes',
  'Check the current information', 'Update and reprint',
];
const listSectionMatch = html.match(/<ol style="list-style:none[\s\S]{0,2200}?<\/ol>/);
assert(listSectionMatch, 'a compact numbered list of lifecycle step titles must exist below the diagram');
for (const title of expectedTitles) {
  assert(listSectionMatch[0].includes(title), `numbered step list must include the title "${title}"`);
}

// ── Lifecycle nodes are keyboard accessible ─────────────────────────────
const nodeButtonCount = (html.match(/<g class="lc-node" data-step="\d" role="button" tabindex="0" aria-label="[^"]+"/g) || []).length;
assert.strictEqual(nodeButtonCount, 9, `expected all 9 lifecycle nodes to have role="button" tabindex="0" and an aria-label (found ${nodeButtonCount})`);

assert(/e\.key === 'Enter' \|\| e\.key === ' '/.test(html),
  'lifecycle node keydown handler must support Enter and Space activation');
assert(/e\.key === 'Escape'/.test(html),
  'lifecycle script must close the open tooltip on Escape');
assert(/document\.addEventListener\('click', function\(\) \{ hideTip\(\); \}\)/.test(html),
  'lifecycle script must still close the open tooltip when clicking outside a node');
assert(/:focus-visible/.test(html), 'lifecycle nodes must define a visible keyboard focus style');

// ── Tooltip clipping guard: measured height + clamped position ─────────
assert(/var tipH = tip\.offsetHeight;/.test(html),
  'tooltip height must be measured from the rendered tooltip, not a fixed guess, so long descriptions are not clipped');
assert(/top = Math\.max\(0, Math\.min\(top, svgRect\.height - tipH\)\);/.test(html),
  'tooltip vertical position must be clamped within the diagram bounds to avoid clipping/viewport overflow');

// ── Follow-up audit: multi-language labels, "compliant output", ECHA ──
// (fix: finish lifecycle accuracy audit)

// Multi-language labels must not be listed as an active Easy Pro benefit
// anywhere it is not also marked "coming soon" (it is a genuine future
// feature, already correctly badged "COMING SOON" in the feature list,
// the "What's coming" panel and on the homepage EU-market notice).
assert(!/adds SDS Smart Import and multi-language labels/i.test(pricing),
  'pricing.html FAQ must not list multi-language labels as an active Easy Pro benefit');
assert(!/multi-language labels/i.test(planPicker) && !/multilingual/i.test(planPicker),
  'plan-picker.html must not reference multi-language labels (not implemented, must not influence a plan recommendation)');
// The two remaining pricing.html multi-language mentions must each be
// unambiguously presented as a future feature: the feature-list item
// carries its own "COMING SOON" badge, and the "What's coming to
// CLPeasy™" panel entry sits under that panel's own coming-soon heading.
assert(/Sell to Europe — multilingual labels<span[^>]*>COMING SOON</.test(pricing),
  'pricing.html feature list "multilingual labels" item must carry its own COMING SOON badge');
const whatsComingIdx = pricing.indexOf("What's coming to CLPeasy");
const multilingualPanelIdx = pricing.indexOf('>Multilingual labels<');
assert(whatsComingIdx !== -1 && multilingualPanelIdx > whatsComingIdx && multilingualPanelIdx < whatsComingIdx + 2000,
  'pricing.html "Multilingual labels" panel card must sit under the "What\'s coming to CLPeasy™" heading, not read as an active benefit');

// "compliant output" / "fully compliant" must not appear on customer-facing
// pages (index.html, pricing.html, plan-picker.html, showcase.html) -- they
// imply a guarantee of legal compliance, which CLPeasy does not make.
for (const file of [['index.html', html], ['pricing.html', pricing], ['plan-picker.html', planPicker], ['showcase.html', showcase]]) {
  const [name, source] = file;
  assert(!/compliant output|fully compliant|guaranteed compliant|correctly labelled and compliant/i.test(source),
    `${name} must not claim "compliant output"/"fully compliant"/"guaranteed compliant" (implies a compliance guarantee)`);
}
assert(pricing.includes('CLPeasy™ gives you the same print-ready GB CLP label output for £9.99–£14.99/month'),
  'pricing.html cost-comparison FAQ must use the accurate "print-ready GB CLP label output" wording');
assert(showcase.includes('Every shape.<br><em>Every size.</em> CLP ready.'),
  'showcase.html hero must use the approved "CLP ready" status wording instead of "Fully compliant"');

// Regulation-change alerts: detailed ECHA-monitoring claims must be gone
// from pricing.html (no confirmed implementation exists), while the
// feature must still be clearly presented as a future ("Coming soon")
// feature, not removed outright.
assert(!/\bECHA\b/.test(pricing), 'pricing.html must not make detailed claims about monitoring ECHA (no such system is implemented)');
assert(/Automatic regulation change alerts<span[^>]*>COMING SOON</.test(pricing),
  'pricing.html feature list "Regulation change alerts" item must carry its own COMING SOON badge');
assert(/Regulation change alerts <span[^>]*>Coming soon</.test(pricing),
  'pricing.html comparison-table "Regulation change alerts" row must carry its own Coming soon badge');
const regAlertsPanelIdx = pricing.indexOf('>Regulation change alerts<');
assert(whatsComingIdx !== -1 && regAlertsPanelIdx > whatsComingIdx && regAlertsPanelIdx < whatsComingIdx + 2000,
  'pricing.html "Regulation change alerts" panel card must sit under the "What\'s coming to CLPeasy™" heading, not read as an active benefit');
assert(pricing.includes('Planned feature. Regulation-change monitoring and notifications are not currently available.'),
  'pricing.html must describe regulation-change alerts with neutral "planned feature, not currently available" wording (not a confirmed ECHA-monitoring implementation)');

console.log('lifecycle reminder-accuracy checks passed (Step 7/8/9 wording, automation claims removed, no active reminder/regulation-alert claims in index/pricing/plan-picker, nine-stage lifecycle preserved, lifecycle nodes keyboard-accessible with visible titles and clamped tooltip positioning, multi-language labels not claimed active, "compliant output"/"fully compliant" removed, ECHA-monitoring detail replaced with neutral "planned feature" wording)');
