// Regression guard for the standard, regex-based Smart Paste text box's
// user-facing guidance copy across production files.
//
// Historically this copy told users they could paste a complete/full/whole
// SDS document and that CLPeasy would find Section 2.2 automatically. That
// instruction is unsafe: later SDS sections (composition tables, glossaries,
// other products in a multi-product spec sheet) can contain codes or
// terminology that do not belong on the product label, and the standard
// Smart Paste box has no logic to detect or exclude them -- it is a plain
// regex scan over whatever text is pasted.
//
// This file is a static content check (no JSDOM/DOM rendering needed) over
// the 20 approved locations of that guidance, across index.html, builder.html,
// knowledge.html and support.html. For each location it asserts:
//   (a) the retired phrasing is genuinely gone (exact old text, not present);
//   (b) the approved replacement text is genuinely present (exact new text).
// Text, not line numbers, is the anchor -- these locations move around as
// the pages are edited, and matching by unique surrounding wording (per the
// approach used for the edits themselves) survives that drift.
//
// On top of the 20 per-location checks, this file also runs a broader
// forbidden-phrase sweep across all four files it reads, to catch a
// regression at any OTHER spot in those same files, not just the 20 known
// ones. To do that safely without false-firing on the 20 locations' own
// approved wording (several of which legitimately contain words like
// "full document" or "entire SDS" inside a *negated* instruction, e.g.
// "not the full document", "Do not paste the entire SDS"), the sweep first
// masks out the 20 approved replacement texts before scanning -- so a
// forbidden-looking phrase that is only present as part of already-reviewed,
// approved copy is invisible to the sweep, while a genuine new or
// reintroduced instance anywhere else in these four files is still caught.
//
// Easy Pro exclusion (narrow, not a blanket exemption): four specific
// locations describe a different, AI-based "drop a whole SDS PDF" feature
// that is explicitly out of scope pending its own audit:
//   - pricing.html:360-361      ("Drop entire SDS PDF in...")
//   - plan-picker.html:125      ("Drop in the full SDS PDF and let CLPeasy read it")
//   - plan-picker.html:270      ("drop in the PDF and CLPeasy fills everything in automatically")
//   - scrum.html:342/347        ("PDF drop zone for Easy Pro users, AI extracts all hazard data...")
// This test does not read pricing.html, plan-picker.html or scrum.html at
// all -- those four locations are excluded simply by this file's scan list
// never including those files, not by a regex carve-out inside a shared
// scan. If a fifth Easy Pro reference is ever added to index.html,
// builder.html, knowledge.html or support.html, this test WILL flag it,
// exactly as it should until that feature has its own approved wording.
//
// Run individually from the repo root: node tests/smart-paste-user-guidance-wording.js
const fs = require('fs');
const assert = require('assert');

const indexSource = fs.readFileSync('index.html', 'utf8');
const builderSource = fs.readFileSync('builder.html', 'utf8');
const knowledgeSource = fs.readFileSync('knowledge.html', 'utf8');
const supportSource = fs.readFileSync('support.html', 'utf8');

// [file label, source key, old (retired) text, new (approved) text]
const LOCATIONS = [
  ['index.html:664 (hero Step 2)', 'index', 'Paste your complete SDS document into Smart Paste — or just Section 2.2 if you prefer. CLPeasy automatically finds the hazard classification section',
    'Copy Section 2.2 (Label elements) from your current SDS into Smart Paste. CLPeasy extracts the available signal word, hazard pictograms, H statements, P statements and sensitiser information to help build your label. Review the extracted information against your SDS before continuing.'],
  ['index.html:704 ("any supplier" statement)', 'index', "use Smart Paste with any supplier's SDS PDF from anywhere in the world",
    'Use Section 2.2 from your current supplier SDS. Supplier formats can vary, so always review the extracted information against the source document.', '7778094 Remove unreleased supplier library homepage card'],
  ['index.html:709 (feature card)', 'index', 'Paste your complete SDS document — CLPeasy automatically finds Section 2.2 and extracts all hazard data instantly',
    'Copy Section 2.2 (Label elements) from your current supplier SDS and Smart Paste extracts the available hazard information. CLPeasy works from the document you provide rather than a stored fragrance database, so you can review the result against your current SDS.'],
  ['index.html:892 (How it works, Step 3)', 'index', 'Paste your complete SDS document into Smart Paste. CLPeasy™ automatically finds Section 2.2 and extracts signal word',
    'Copy Section 2.2 (Label elements) from your current SDS into Smart Paste. CLPeasy™ extracts the available signal word, H statements, P statements, pictograms and supplemental information to help build your label. Review the result against your SDS before continuing.'],
  ['index.html:1012 (UK/international supplier claim)', 'index', 'paste any SDS from any UK or international supplier and CLPeasy extracts the data automatically',
    'use Section 2.2 from the current supplier SDS applicable to the product, concentration and target market. CLPeasy extracts the information it can identify for you to review against the source document.'],
  ['index.html:1057 (FAQ: What is an SDS?)', 'index', 'You can paste the complete SDS document into Smart Paste and CLPeasy will find Section 2.2 automatically',
    'Copy the complete Section 2.2—from its heading through the final hazard, precautionary and supplemental information—and paste it into Smart Paste. Do not paste the entire SDS, as codes and terminology from later sections may not belong on the product label.'],
  ['index.html:1065 (FAQ: Any supplier?)', 'index', 'Paste your complete SDS document into Smart Paste and CLPeasy extracts all hazard data automatically',
    'Copy Section 2.2 (Label elements) from your current supplier SDS into Smart Paste. CLPeasy extracts the available hazard information for you to review against the source document. Supplier formats vary, and the SDS must be applicable to your product, concentration and target market.'],
  ['index.html:1300 (onboarding/signup guide)', 'index', 'copy your complete SDS PDF text, paste it into the box and click',
    'Copy the complete Section 2.2 (Label elements) from your SDS PDF, paste it into the box and select <strong>Extract hazard data</strong>. CLPeasy fills in the information it can identify; review the result against your SDS before continuing.', '27c976d Polish homepage feature journey and remove remaining future promises'],
  ['index.html:1302 (onboarding/signup guide tip)', 'index', "paste the whole document and CLPeasy does the rest. Works with any supplier worldwide",
    'Copy Section 2.2 only&#x2014;not the entire SDS. Include the complete Label elements section and review the extracted information against your current supplier document.', '27c976d Polish homepage feature journey and remove remaining future promises'],
  ['index.html:1363 (second signup-guide variant)', 'index', 'select all text (Ctrl+A / Cmd+A), copy and paste into the box. CLPeasy extracts everything automatically',
    'Open your current supplier SDS PDF and copy the complete Section 2.2 (Label elements), from its heading through the final hazard, precautionary and supplemental information. Paste that section into <strong>Smart Paste</strong> and review the extracted result against the SDS.'],
  ['index.html:1365 (second signup-guide tip)', 'index', 'Works with any supplier, any fragrance, worldwide. CLPeasy finds Section 2.2 automatically from the full document',
    'Supplier SDS formats can vary. Use the current Section 2.2 applicable to your product, concentration and target market, and check the extracted information before continuing.'],
  ['knowledge.html:436', 'knowledge', 'paste the full document into CLPeasy and it extracts them automatically',
    'Hazard statements are found in Section 2.2 (Label elements) of your SDS. Copy that complete section into Smart Paste and review the extracted information against the source document.'],
  ['knowledge.html:463', 'knowledge', 'Paste your complete SDS document into Smart Paste and CLPeasy finds this section automatically',
    'Copy the complete Section 2.2 (Label elements) into Smart Paste. Do not paste the rest of the document, as later sections can contain codes or terminology that do not belong on the product label. Always use the current SDS applicable to the exact fragrance load, finished-product concentration and target market.'],
  ['knowledge.html:475', 'knowledge', 'CLPeasy accepts the complete SDS document — you don’t need to find Section 2.2 yourself. Paste the whole file and CLPeasy locates the right section',
    'CLPeasy reads Section 2.2 (Label elements) of your SDS. Copy that complete section—from its heading through the final hazard, precautionary and supplemental information—and paste it into Smart Paste. Do not paste the entire SDS, as unrelated information from later sections could be extracted by mistake.'],
  ['knowledge.html:498', 'knowledge', 'Paste your complete SDS into Smart Paste and CLPeasy extracts the sensitiser information automatically alongside the H and P statements',
    'Copy Section 2.2 (Label elements) into Smart Paste and CLPeasy extracts the available sensitiser information for you to review against your SDS.'],
  ['support.html:238 (dropdown option)', 'support', 'Using Smart Paste — full SDS or Section 2.2 paste',
    'Using Smart Paste — Section 2.2 paste'],
  // Added in this pass -- the two leftover standard-Smart-Paste claims found
  // after the first 17, plus the "Works with any supplier" heading.
  ['index.html:~1061 (FAQ: How does Smart Paste work?)', 'index', "Paste the complete document into the Smart Paste box in CLPeasy. The tool automatically locates Section 2.2",
    'Open your current supplier SDS PDF and copy the complete Section 2.2 (Label elements), from its heading through the final hazard, precautionary and supplemental information. Paste only that section into Smart Paste. CLPeasy extracts the information it can identify; review the result against your SDS before continuing.'],
  ['support.html:~162 (Smart Paste troubleshooting panel)', 'support', 'Smart Paste accepts your complete SDS document — paste the full text and CLPeasy finds Section 2.2 automatically',
    'Smart Paste reads Section 2.2 (Label elements) from your SDS. Copy and paste that complete section—not the full document—and review the extracted information against your current supplier SDS.'],
  ['index.html:~1012 ("Works with any supplier" heading)', 'index', '<strong style="font-size:14px;">Works with any supplier</strong>',
    '<strong style="font-size:14px;">Works from your current SDS</strong>'],
];

const SOURCES = { index: indexSource, knowledge: knowledgeSource, support: supportSource };

// Every source file this test reads, keyed the same way, for the broad
// mask-and-sweep pass below (builder.html included; it has its own dedicated
// pin further down too).
const ALL_FILES = { index: indexSource, builder: builderSource, knowledge: knowledgeSource, support: supportSource };

function run(){
  const results = { locations:{}, builderPin:{}, sweep:{} };

  assert.strictEqual(LOCATIONS.length, 19, `expected 19 entries in LOCATIONS (the 20th approved change is the dedicated builder.html pin below), got ${LOCATIONS.length}`);

  // A fifth element records a later, deliberate commit on main that removed the
  // whole section containing the approved wording. The retired wording must
  // still be absent; only the "replacement must be present" check is waived.
  for(const [label, fileKey, oldText, newText, removedBy] of LOCATIONS){
    const source = SOURCES[fileKey];
    const hasOld = source.includes(oldText);
    const hasNew = source.includes(newText);
    results.locations[label] = { hasOld, hasNew };
    assert(!hasOld, `${label}: retired wording must be gone, but the exact old phrase was still found`);
    if(!removedBy) assert(hasNew, `${label}: approved replacement wording was not found verbatim`);
  }

  // ── Dedicated pin on the live builder.html Smart Paste instruction ────────
  // (Approved change #12 of the 20 -- the instruction next to the real
  // Smart Paste input box customers actually use.)
  const oldBuilderText = "Copy Section 2.2 from your fragrance supplier's SDS PDF and paste it here. CLPeasy extracts all hazard data automatically.";
  const newBuilderText = 'Copy the complete Section 2.2 (Label elements) from your current supplier SDS PDF and paste it here. CLPeasy extracts the information it can identify; review the result against your SDS before continuing.';
  results.builderPin = {
    hasOld: builderSource.includes(oldBuilderText),
    hasNew: builderSource.includes(newBuilderText),
    inSmartPasteBox: /class="smart-paste-box">[\s\S]{0,400}Copy the complete Section 2\.2 \(Label elements\) from your current supplier SDS PDF/.test(builderSource)
  };
  assert(!results.builderPin.hasOld, 'builder.html: retired Smart Paste instruction text must be gone');
  assert(results.builderPin.hasNew, 'builder.html: approved Smart Paste instruction text was not found verbatim');
  assert(results.builderPin.inSmartPasteBox, 'builder.html: approved instruction text must sit inside the live .smart-paste-box element, next to the real Smart Paste input');

  // 19 LOCATIONS entries + 1 dedicated builder.html pin = the 20 approved changes.
  const totalPinned = LOCATIONS.length + 1;
  assert.strictEqual(totalPinned, 20, `expected exactly 20 pinned approved changes, counted ${totalPinned}`);

  // ── Broad mask-and-sweep: catches a regression ANYWHERE in these four
  // files, not just at the 20 known locations. ────────────────────────────
  const ALL_NEW_TEXTS = [
    ...LOCATIONS.map(([, , , newText]) => newText),
    newBuilderText
  ];
  const masked = {};
  for(const key of Object.keys(ALL_FILES)){
    let m = ALL_FILES[key];
    for(const t of ALL_NEW_TEXTS){
      if(m.includes(t)) m = m.split(t).join(' '.repeat(t.length));
    }
    masked[key] = m;
  }

  const FORBIDDEN_PATTERNS = [
    ['complete SDS', /complete SDS\b/i],
    ['full SDS', /\bfull SDS\b/i],
    ['full document', /\bfull document\b/i],
    // Narrowed to require SDS/paste context -- "full text" alone also
    // matches unrelated copy, e.g. builder.html's help-search-filter code
    // comment ("Matches against each section's full text (heading + steps
    // + tips)"), which has nothing to do with Smart Paste/SDS claims.
    ['full text (SDS/paste claim)', /paste[\s\S]{0,40}\bfull text\b|\bfull text\b[\s\S]{0,40}(CLPeasy|SDS|Smart Paste)/i],
    ['whole SDS', /\bwhole SDS\b/i],
    ['whole document', /\bwhole document\b/i],
    ['whole file', /\bwhole file\b/i],
    ['select all text', /select all text/i],
    ['Ctrl+A', /Ctrl\+A/i],
    ['automatically finds/locates Section 2.2', /(automatically (finds|locates) Section 2\.2|(finds|locates) Section 2\.2 automatically)/i],
    ['works with any supplier', /works with any supplier/i],
    ['any supplier worldwide', /any supplier worldwide/i],
    ['extracts all hazard data', /extracts all hazard data/i],
    ['extracts everything automatically', /extracts everything automatically/i],
  ];

  for(const key of Object.keys(masked)){
    for(const [label, re] of FORBIDDEN_PATTERNS){
      const hit = re.test(masked[key]);
      results.sweep[`${key}:${label}`] = hit;
      assert(!hit, `${key}.html: forbidden pattern "${label}" found outside the 20 approved locations' own text -- looks like a new or reintroduced standard-Smart-Paste over-claim`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Correction 1 (2026-09): the Step 1 yellow "Important" disclaimer card
  // has been removed outright, with no replacement card/panel/alert/
  // accordion anywhere in Steps 1-4. The Help Guide's own separate
  // SDS-verification instruction and the Step 5 verification checkbox
  // (an unrelated, pre-existing control) must both remain untouched.
  // ─────────────────────────────────────────────────────────────────────
  {
    const removedDisclaimer = "CLPeasy generates labels based on the data you enter. You must always verify all hazard information against your fragrance supplier's SDS sheet at your actual fragrance load before printing and selling. You are solely responsible for ensuring your labels are accurate and legally compliant.";
    results.correction1 = {
      disclaimerGone: !builderSource.includes(removedDisclaimer),
      noFieldAlertWarnInSteps1to4: null,
      helpGuidePreserved: null,
      step5CheckboxPreserved: null,
    };
    assert(!builderSource.includes(removedDisclaimer), 'Step 1: the exact yellow "Important" disclaimer text must be gone');

    // Scope Steps 1-4 (step-1 through step-4 panels; step-5 -- the download
    // step -- is intentionally excluded, since its own pre-existing
    // verification checkbox/copy is a separate, unrelated control that
    // must be left alone, not swept for "no replacement card").
    const step1Start = builderSource.indexOf('id="step-1"');
    const step5Start = builderSource.indexOf('id="step-5"');
    assert(step1Start > -1 && step5Start > step1Start, 'could not locate the Step 1-5 panel boundaries in builder.html');
    const steps1to4Html = builderSource.slice(step1Start, step5Start);
    // Narrow, distinctive fragments of the removed disclaimer's own wording
    // -- not a sweep for the generic .field-alert-warn class, which two
    // other, pre-existing and unrelated warnings (custom-size-warn,
    // en15494-warn) legitimately use elsewhere in Steps 1-4 and must not be
    // flagged as if they were a reintroduced disclaimer.
    const noReplacementCard = !/solely responsible for ensuring|you must always verify|verify all hazard information against your (fragrance )?supplier/i.test(steps1to4Html);
    results.correction1.noFieldAlertWarnInSteps1to4 = noReplacementCard;
    assert(noReplacementCard, 'Steps 1-4 must carry no replacement disclaimer card/panel/alert/accordion using the retired wording anywhere');
    // The specific card element itself (an "Important" warning right below
    // the Step 1 heading, above "Load from your library") must be gone,
    // not just relocated -- pin the exact surrounding structure.
    const noHeadingAdjacentWarnCard = !/step-heading">Label size &amp; shape<\/h2>\s*<div class="field-alert/i.test(steps1to4Html);
    assert(noHeadingAdjacentWarnCard, 'no field-alert card of any kind must sit directly below the Step 1 heading where the removed disclaimer used to be');

    // Help Guide's own SDS-verification instruction (a separate, pre-existing
    // element, unaffected by removing the Step 1 disclaimer).
    const helpGuideInstruction = 'Tick the verification checkbox</strong> to confirm you have checked all data against your SDS.';
    results.correction1.helpGuidePreserved = builderSource.includes(helpGuideInstruction);
    assert(results.correction1.helpGuidePreserved, 'Help Guide must still carry its own SDS-verification instruction');

    // Step 5 verification checkbox and its label text (enforcement itself
    // -- toggleDownload()/_downloadAllowed() -- is covered by the existing
    // tests/builder-regression.js and tests/blocked-overlay-and-download-
    // guard-parity.js download-gate suites, which continue to run against
    // this file unchanged).
    // Label text deliberately reworded in c5c1d57 / PR #136 ("Improve builder responsibility and CLP Ready wording").
    const step5CheckboxLabel = 'I confirm I have reviewed the finished label and checked the hazard information against my fragrance supplier\'s current SDS/CLP information for the fragrance load used. CLPeasy has helped extract, organise, check and format the information provided; I understand I remain responsible for the product I place on the market and for reviewing the finished label before printing and selling.';
    results.correction1.step5CheckboxPreserved = builderSource.includes('id="verify-checkbox"') && builderSource.includes(step5CheckboxLabel);
    assert(results.correction1.step5CheckboxPreserved, 'Step 5 verification checkbox and its label text must remain exactly as before');
  }

  console.log('smart-paste-user-guidance-wording checks passed (20 approved locations)');
  console.log(JSON.stringify(results, null, 2));
}

try{
  run();
}catch(error){
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
