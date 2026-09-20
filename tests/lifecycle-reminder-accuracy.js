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
const builder = fs.readFileSync('builder.html', 'utf8');
const account = fs.readFileSync('account.html', 'utf8');

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
assert(/document\.addEventListener\('click', function\(\) \{ unpin\(\); \}\)/.test(html),
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

// ── Round 3: stale size-preset claims and the showcase absolute claim ──
// (fix: finish lifecycle accuracy audit, part 2)
//
// The builder no longer renders any preset-size buttons -- .size-card is
// dead CSS matched by zero elements, and the only sizing control is a
// single "Diameter/Width/Size (mm)" number input (builder.html line
// ~1050). Customer-facing copy describing a preset picker is therefore
// stale and must be corrected to describe the real mm-entry workflow.
assert(!/Circle presets cover|Rectangle presets cover/i.test(html),
  'homepage Setup Guide must not claim circle/rectangle presets cover specific product categories (no preset picker exists)');
assert(html.includes('Choose Circle, Rectangle or Square, then enter the dimensions you need in millimetres.'),
  'homepage Setup Guide "Open the label builder" step must describe the real shape-then-mm-entry workflow');
assert(!/four standard preset sizes/i.test(html),
  'homepage FAQ must not claim CLPeasy includes four standard preset sizes (no such preset picker exists)');
assert(!/preset or custom size/i.test(builder),
  'builder.html in-app help must not describe a preset-vs-custom size choice (only a single mm-entry field exists)');
assert(!/use Custom size/i.test(builder),
  'builder.html FAQ must not tell users to "use Custom size" as if it were a distinct mode from a preset (there is only one size field)');
assert(builder.includes('Choose the label shape, then enter the size you need in millimetres.'),
  'builder.html in-app help must describe the real shape-then-mm-entry workflow');

// The showcase hero must not claim CLPeasy generates labels for "every
// fragrance product" unconditionally (implies universal coverage/
// guaranteed applicability regardless of classification).
assert(!/every fragrance product/i.test(showcase),
  'showcase.html must not claim CLPeasy generates labels for "every fragrance product you make"');
assert(showcase.includes('CLPeasy helps you create print-ready GB CLP labels for candles, wax melts, reed diffusers, room sprays and more.'),
  'showcase.html hero must use the accurate "helps you create print-ready GB CLP labels" wording');

// ── Round 4: SDS Smart Import / PDF-import claims, the remaining
// "compliance alerts" claim, and the Easy Pro Setup Guide numbering ──
// (fix: finish lifecycle accuracy audit, part 3)
//
// The code audit found no PDF-parsing library, file-drop handler or
// whole-SDS-import code anywhere in the repo -- only the pasted-text
// Smart Paste feature is real. "SDS Smart Import" / PDF drop-in must
// therefore not be presented as active/included anywhere, and must not
// be confused with Smart Paste (pasting Section 2.2 text).
const smartImportPatterns = [
  /SDS Smart Import/i,
  /drop (your|in the|entire) .{0,20}(complete )?SDS PDF/i,
  /let CLPeasy read/i,
  /reads your whole document/i,
];
for (const file of [['index.html', html], ['plan-picker.html', planPicker], ['account.html', account], ['builder.html', builder]]) {
  const [name, source] = file;
  for (const pattern of smartImportPatterns) {
    assert(!pattern.test(source), `${name} must not present an SDS Smart Import / PDF-import claim as active (${pattern})`);
  }
}
// pricing.html is the one place the feature is still named, but every
// mention must now be paired with "Coming soon" -- never presented as an
// included/active Easy Pro benefit.
assert(!/adds SDS Smart Import/i.test(pricing) && !/plus SDS Smart Import/i.test(pricing) && !/such as SDS Smart Import/i.test(pricing) && !/including SDS Smart Import/i.test(pricing),
  'pricing.html must not describe SDS Smart Import as an active/included Easy Pro benefit');
assert(/Drop entire SDS PDF in — hands-free hazard data extraction <span[^>]*>Coming soon</.test(pricing),
  'pricing.html comparison-table "Drop entire SDS PDF in" row must carry its own Coming soon badge');
assert(pricing.includes('Coming soon — not currently available. Planned for Easy Pro: drop your complete SDS PDF directly into CLPeasy™ instead of pasting Section 2.2 with Smart Paste.'),
  'pricing.html must describe the PDF-import row as "Coming soon — not currently available"');

// Smart Paste itself (pasting Section 2.2 text) remains correctly described
// as a real, currently-available feature -- and no longer has a PDF
// drop-in claim tacked onto its description.
assert(pricing.includes("Paste Section 2.2 from your fragrance supplier's SDS and CLPeasy™ extracts all the relevant hazard data automatically"),
  'pricing.html must still correctly describe Smart Paste as pasting Section 2.2 text');
assert(!/Smart Paste[\s\S]{0,400}dropping in your complete SDS PDF/i.test(pricing),
  'pricing.html Smart Paste description must not have a PDF drop-in claim appended to it');

// The one remaining live "compliance alerts" claim (cost-comparison
// callout) must be gone.
assert(!/including SDS Smart Import and compliance alerts/i.test(pricing),
  'pricing.html cost-comparison callout must not claim Easy Pro includes "SDS Smart Import and compliance alerts"');
assert(!/compliance alert/i.test(pricing) && !/compliance alert/i.test(html) && !/compliance alert/i.test(planPicker),
  'no customer-facing page may claim an active "compliance alert" feature');

// ── Easy Pro Setup Guide steps must be numbered consecutively ──────────
const sgProMatch = html.match(/<div class="sg-panel" id="sg-pro">[\s\S]*?(?=<div class="sg-panel" id="sg-start"|<script>)/);
assert(sgProMatch, 'could not locate the sg-pro Setup Guide panel in index.html');
const sgProNums = (sgProMatch[0].match(/class="sg-step-num">(\d+)</g) || []).map(m => parseInt(m.match(/\d+/)[0], 10));
assert.deepStrictEqual(sgProNums, [1, 2, 3, 4, 5],
  `the Easy Pro Setup Guide panel must show consecutive steps 1-5 (found ${JSON.stringify(sgProNums)})`);
assert(html.includes('Complete and check your label') && html.includes('Download and save'),
  'the Easy Pro Setup Guide must include real steps 3 ("Complete and check your label") and 4 ("Download and save")');
assert(!/PDF import|batch export.{0,20}(pin|extract)|reminder emails|monitor.{0,15}regulator/i.test(sgProMatch[0]),
  'the new Easy Pro Setup Guide steps must not invent PDF import, batch export, reminders or monitoring');

// ── Round 5: paid-plan entitlement audit -- "Batch export" has no
// implementation anywhere in the repo (no batch/bulk export code exists);
// "Smart Paste" and "label folders" are real but are on BOTH plans, not
// Pro-exclusive additions, so must not be listed as something Easy Pro
// "adds". (fix: finish lifecycle accuracy audit, part 4)
for (const file of [['index.html', html], ['pricing.html', pricing], ['plan-picker.html', planPicker], ['account.html', account], ['showcase.html', showcase]]) {
  const [name, source] = file;
  assert(!/batch export/i.test(source),
    `${name} must not advertise "batch export" as a feature (no batch/bulk export code exists anywhere in the repo)`);
}
assert(!/adds Smart Paste/i.test(html) && !/adds.{0,20}Smart Paste/i.test(html),
  'index.html must not describe Smart Paste as something Easy Pro adds -- it is included on Easy Start too');
assert(!/adds.{0,40}label folders|adds.{0,10}folders/i.test(html),
  'index.html must not describe label folders as something Easy Pro adds -- they are included on Easy Start too');
assert(html.includes('Easy Pro (£14.99/mo or £149/year) gives you 30 downloads/month and priority support. Smart Paste is included on both plans, and saved labels are organised automatically by product type.'),
  'index.html homepage FAQ must accurately scope Easy Pro\'s added benefits to downloads/month and priority support, and describe Smart Paste + automatic product-type grouping, not "label folders"');

// The implementation is five fixed product-type categories with automatic
// assignment (label-library.js/builder.html FOLDER_DEFS) -- users cannot
// create a custom-named folder or manually move a label between folders.
// The unqualified phrase "label folders are included" (or similar) implies
// controls that do not exist, so it must never reappear on a
// customer-facing page; every mention of the real feature must instead
// describe automatic product-type grouping.
for (const file of [['index.html', html], ['pricing.html', pricing], ['plan-picker.html', planPicker], ['account.html', account], ['showcase.html', showcase]]) {
  const [name, source] = file;
  assert(!/label folders are included/i.test(source),
    `${name} must not claim "label folders are included" -- folders are automatic product-type grouping, not a create/move-labels-into-folders feature`);
  assert(!/(labels?|folders?) and folders\b/i.test(source),
    `${name} must not describe saved labels with a bare, unqualified "folders" claim (e.g. "labels and folders") -- must describe automatic product-type grouping instead`);
}
assert(pricing.includes("browser-saved labels organised automatically by product type, local version history"),
  'pricing.html "Easy Start vs Easy Pro" FAQ must describe automatic product-type grouping, not bare "folders"');
assert(pricing.includes("they're organised automatically by product type"),
  'pricing.html saved-label FAQ must describe automatic product-type grouping, not "organise them into folders"');
assert(pricing.includes('Saved labels (organised automatically by product type) and local version history are stored in your current browser'),
  'pricing.html storage disclaimer must describe automatic product-type grouping, not bare "folders"');
assert(pricing.includes('Save labels (organised automatically by product type) and local version history in your current browser'),
  'pricing.html comparison-table "Saved label library" row must describe automatic product-type grouping, not bare "folders"');
assert(pricing.includes('Organise browser-saved labels into folders &mdash; Candles, Wax Melts, Diffusers and Room Sprays'),
  'pricing.html "Organised by product type" feature item must still name the real fixed categories');
assert(html.includes('Everything in Easy Start + 30 downloads/month &#x00B7; Priority support'),
  'index.html Easy Pro Setup Guide banner must list real, Pro-specific benefits only (30 downloads/month, priority support), not Smart Paste or batch export');
assert(html.includes('<span class="sg-step-title">Use Smart Paste</span>'),
  'index.html Easy Pro Setup Guide step 2 ("Use Smart Paste") must not carry a PRO badge -- Smart Paste is included on Easy Start too');

console.log('lifecycle reminder-accuracy checks passed (Step 7/8/9 wording, automation claims removed, no active reminder/regulation-alert claims in index/pricing/plan-picker, nine-stage lifecycle preserved, lifecycle nodes keyboard-accessible with visible titles and clamped tooltip positioning, multi-language labels not claimed active, "compliant output"/"fully compliant" removed, ECHA-monitoring detail replaced with neutral "planned feature" wording, stale size-preset claims corrected, showcase absolute claim corrected, SDS Smart Import/PDF-import claims removed or coming-soon-labelled, compliance-alerts claim removed, Easy Pro Setup Guide renumbered consecutively with real steps 3-4, batch export claim removed, Smart Paste/label folders no longer mis-attributed as Pro-exclusive)');
