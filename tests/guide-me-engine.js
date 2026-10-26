// Guide Me / Knowledge Base search engine (guide-me.js) — offline unit checks.
//   - "what I want to make" requests are understood (shape, size, quantity,
//     scents, product type, print route) and clarified with at most 2 questions;
//   - everyday questions find the right reviewed answer card;
//   - nothing ever suggests a signal word, hazard/precautionary statement,
//     pictogram or classification, and auto-fill never touches hazard fields;
//   - the engine makes no network requests.
//   node tests/guide-me-engine.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'guide-me.js'));
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }
const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// ── Parser ─────────────────────────────────────────────────────
const PARSE = [
  ['I need an A4 sheet of 75mm circle labels, 6 labels, all with different scents', { shape: 'circle', size: 75, count: 6, distinct: 6, route: 'sheet' }],
  ['I want 4 of Sea Breeze and 4 of Coconut on one page', { count: 8, distinct: 2, route: 'sheet', scents: [{ name: 'Sea Breeze', qty: 4 }, { name: 'Coconut', qty: 4 }] }],
  ['Just one label for a 50mm circle wax melt', { shape: 'circle', size: 50, count: 1, productType: 'Wax Melt', route: 'single' }],
  ['70 x 50mm rectangle labels for reed diffusers', { shape: 'rectangle', width: 70, height: 50, productType: 'Reed Diffuser' }],
  ['70mm by 40mm labels', { shape: 'rectangle', width: 70, height: 40 }],
  ['60 × 60 mm labels', { shape: 'square', width: 60, height: 60 }],
  ['round labels 6cm', { shape: 'circle', size: 60 }],
  ['labels with a 30mm radius', { size: 30, radius: true }],
  ['a 63mm circular label for a soy candle', { shape: 'circle', size: 63, productType: 'Soy Candle' }],
  ['square 52mm labels for my clamshells', { shape: 'square', size: 52, productType: 'Wax Melt Clamshell' }],
  ['12 labels for room spray, all the same scent', { count: 12, productType: 'Room Spray', distinct: 1 }],
  ['I want to cut them on my Cricut', { route: 'cut' }],
  ['Print then cut with my Silhouette Cameo', { route: 'cut' }],
  ['I will send them to a print company', { route: 'shop' }],
  ['I want to add my logo in Canva', { route: 'canva' }],
  ['24 stickers on Avery sheets', { count: 24, route: 'sheet' }],
  ['one 52mm circle label called Winter Spice for a soy candle', { shape: 'circle', size: 52, count: 1, name: 'Winter Spice', productType: 'Soy Candle', route: 'single' }],
  ['six labels for tea lights', { count: 6, productType: 'Tea Light Candle' }],
  ['a dozen labels for snap bars', { count: 12, productType: 'Snap Bar' }],
  ['3 different scents for my pillar candles', { distinct: 3, productType: 'Pillar Candle' }],
  ['labels for linen spray', { productType: 'Linen Spray' }],
  ['labels for car diffusers', { productType: 'Car Diffuser' }],
  ['wax tart labels', { productType: 'Wax Tart' }],
  ['advent calendar wax melts', { productType: 'Advent Calendar Wax Melt' }],
  ['a single label', { count: 1 }],
  ['rectangular labels 90mm x 60mm', { shape: 'rectangle', width: 90, height: 60 }],
  ['I need oblong stickers', { shape: 'rectangle' }],
  ['2 of Lavender, 2 of Rose', { scents: [{ name: 'Lavender', qty: 2 }, { name: 'Rose', qty: 2 }], count: 4, distinct: 2 }],
  ['print individually as PDFs', { route: 'single' }],
  ['labels for potpourri sachets', { productType: 'Scented Sachet' }]
];
for (const [text, want] of PARSE) {
  const got = G.parseRequest(text);
  for (const k of Object.keys(want)) assert.deepStrictEqual(got[k], want[k], `parse "${text}" → ${k}: got ${JSON.stringify(got[k])}`);
}
ok(`parser: ${PARSE.length} phrasings (shape, size incl. cm/radius/W×H, quantities, named scents, product type, print route)`);

// ── Conversation flow ─────────────────────────────────────────
{
  const s = G.createSession();
  let r = G.respond(s, 'I want 4 of Sea Breeze and 4 of Coconut on one page');
  assert(/shape/i.test(plain(r.html)) && /size/i.test(plain(r.html)), 'asks shape and size');
  assert((plain(r.html).match(/\?/g) || []).length <= 2, 'never more than 2 questions at once');
  r = G.respond(s, 'Circle');
  assert(/size/i.test(plain(r.html)) && !/shape/i.test(plain(r.html)), 'only asks what is still missing');
  r = G.respond(s, '63 mm');
  assert(/So you want: 63 mm circle labels, 8 labels in total, 4 × Sea Breeze, 4 × Coconut, arranged on an A4 sheet — is that right\?/.test(plain(r.html)), 'confirmation summary: ' + plain(r.html));
  r = G.respond(s, "Yes, that's right");
  assert(r.styleChoice === true, 'confirmation leads to the guide-style choice');
  const q = G.styleReply(s, 'quicklist');
  const t = plain(q.html);
  assert(/Repeat Steps 2–5 for each scent \(2 in total\)/.test(t) && /Print Sheet Composer/.test(t) && /Actual Size \/ 100%/.test(t), 'quick list covers saving each scent and the Composer');
  assert(/Section 2\.2/.test(t) && /check every extracted code, pictogram and sensitiser against the SDS/.test(t), 'steps send hazards to Smart Paste + SDS check');
  ok('conversation: ≤2 questions, asks only what is missing, confirms, then offers the guide styles');
}
{
  const s = G.createSession();
  let r = G.respond(s, 'labels with a 30mm radius');
  assert(/across/.test(plain(r.html)) && r.chips.some(c => c.send === '60mm'), 'radius is checked against the diameter');
  r = G.respond(s, '60mm');
  assert(/shape|print/i.test(plain(r.html)), 'carries on collecting after the radius check');
  ok('conversation: "radius" is checked (diameter vs radius) before continuing');
}
{
  const s = G.createSession();
  G.respond(s, 'I need an A4 sheet of 75mm circle labels, 6 labels, all with different scents');
  let r = G.respond(s, 'No, change something');
  assert(/what to change/i.test(plain(r.html)), 'offers to change');
  r = G.respond(s, 'rectangle 70 x 50mm');
  assert(/70 × 50 mm rectangle/.test(plain(r.html)), 'change applied in a new summary');
  ok('conversation: "change something" updates the plan and re-confirms');
}
{
  const s = G.createSession();
  const r = G.respond(s, 'Just one label for a 50mm circle wax melt');
  assert(/below the recommended 52 mm/.test(plain(r.html)), 'small size mentions the Builder size warning');
  ok('conversation: a size below 52 mm points to the Builder\'s own size warning (no new rule)');
}
{
  // A question part-way through a plan is answered, and the plan is kept.
  const s = G.createSession();
  G.respond(s, 'I need circle labels for wax melts');
  const r = G.respond(s, 'What is EUH208?');
  assert(r.cardId === 'help-what-is-euh208' && /answer the question above/.test(plain(r.html)), 'answers and reminds');
  const r2 = G.respond(s, '52 mm');
  assert(/print/i.test(plain(r2.html)), 'plan continues');
  ok('conversation: a question asked mid-plan is answered without losing the plan');
}

// ── Guide styles and auto-fill ────────────────────────────────
{
  const s = G.createSession();
  G.respond(s, 'one 52mm circle label called Winter Spice for a soy candle');
  G.respond(s, 'yes');
  const wt = G.styleReply(s, 'walkthrough');
  assert(/step-card/.test(wt.html) && /step-diagram/.test(wt.html) && /▣ PDF/.test(wt.html), 'walkthrough uses step cards with hints');
  assert(wt.chips.some(c => c.action === 'step1'), 'walkthrough offers "Take me to Step 1"');
  const s2 = G.createSession();
  G.respond(s2, 'one 52mm circle label called Winter Spice for a soy candle');
  G.respond(s2, 'yes');
  const af = G.styleReply(s2, 'autofill');
  assert.deepStrictEqual(af.autofill, { shape: 'circle', size: 52, productType: 'Soy Candle', scentName: 'Winter Spice' });
  assert(/all hazard information from Smart Paste — stays with you/.test(plain(af.html)), 'auto-fill says hazards stay with Smart Paste');
  const s3 = G.createSession();
  G.respond(s3, 'I need 70 x 50mm rectangle labels for reed diffusers on an A4 sheet, 2 of Fig, 2 of Oud');
  G.respond(s3, 'yes');
  const af3 = G.styleReply(s3, 'autofill').autofill;
  assert.deepStrictEqual(af3, { shape: 'rectangle', size: 70, customW: 70, customH: 50, productType: 'Reed Diffuser' }, 'several scents: no single product name filled');
  ok('styles: walkthrough (step cards + hints), quick list, auto-fill (layout/product fields only)');
}
{
  // Whatever is typed, auto-fill can only contain the permitted fields.
  const tries = ['Signal word: Danger 52mm circle', 'H317 H411 P280 75mm square labels', 'danger pictogram GHS07 rectangle 70x50mm', 'warning wax melt 50mm round'];
  for (const t of tries) {
    const s = G.createSession();
    G.respond(s, t); G.respond(s, 'One label (PDF)'); G.respond(s, 'yes');
    const d = G.styleReply(s, 'autofill').autofill || {};
    Object.keys(d).forEach(k => assert(G.AUTOFILL_FIELDS.includes(k), `auto-fill field "${k}" not permitted`));
    assert(!/signal|picto|hazard|h\d{3}|p\d{3}/i.test(JSON.stringify(d)), 'no hazard data in auto-fill: ' + JSON.stringify(d));
  }
  assert.deepStrictEqual(G.AUTOFILL_FIELDS, ['shape', 'size', 'customW', 'customH', 'productType', 'scentName']);
  ok('auto-fill allow-list: shape, size, width/height, product type, product name — never signal word or hazard data');
}

// ── Search accuracy ───────────────────────────────────────────
const SEARCH = [
  ['How do I print with my Cricut?', ['print-route-cricut', 'print-do-i-need-a-cricut', 'print-can-i-upload-my-svg-to-design-space']],
  ['What is EUH208?', ['help-what-is-euh208', 'kb-euh208']],
  ['where do i find my safety data sheet', ['help-where-do-i-find-my-sds-sheet']],
  ['my label printed too small', ['help-my-label-printed-too-large-or-too-small']],
  ['labels come out the wrong size', ['help-my-label-printed-too-large-or-too-small', 'print-what-settings-keep-the-label-the-correct-size']],
  ['how much does it cost', ['help-what-s-the-difference-between-pay-as-you-go-and-easy-start-u', 'faq-what-is-the-difference-between-pay-as-you-go-and-easy-start-']],
  ['can i use my iphone', ['help-can-i-use-this-on-my-phone', 'print-can-i-print-from-my-phone', 'print-route-mobile']],
  ['do i need a label for bath bombs', ['faq-i-make-bath-bombs-and-soaps-do-i-need-a-clp-label']],
  ['does the dashed line print', ['print-does-the-dashed-cut-border-print', 'help-step-5-download']],
  ['Can I save my labels?', ['faq-can-i-save-and-reuse-my-labels']],
  ['send to a print shop', ['guide-print-shop', 'print-route-company']],
  ['is a thermal printer ok', ['print-can-i-use-a-thermal-label-printer']],
  ['Do I need a CLP label for wax melts?', ['faq-what-is-a-clp-label-and-do-i-need-one', 'kb-what-is-clp']],
  ['Do I need a CLP label for my candles?', ['faq-what-is-a-clp-label-and-do-i-need-one', 'kb-what-is-clp']],
  ['what is clp', ['kb-what-is-clp', 'faq-what-is-a-clp-label-and-do-i-need-one']],
  ['northern ireland rules', ['kb-northern-ireland']],
  ['does the pictogram border have to be red', ['print-does-the-whole-pictogram-have-to-be-red']],
  ['Can I combine two fragrance oil SDSs?', ['oils-can-i-combine-the-labels-from-the-individual-oils', 'kb-blended', 'faq-can-i-use-more-than-one-fragrance-oil-or-essential-oil']],
  ['what file format should I download', ['help-choosing-a-file-format', 'guide-printing-route', 'print-route-files']],
  ['what size label should I use', ['help-what-size-label-should-i-use']],
  ['smart paste missed some hazards', ['help-smart-paste-didn-t-extract-everything-correctly', 'support-something-missing-after-smart-paste']],
  ['which SDS should I use', ['faq-which-sds-should-i-use']],
  ['can I use a 10% SDS', ['faq-can-i-use-a-10-sds-for-a-lower-fragrance-load']],
  ['is CLPeasy approved by HSE', ['faq-is-clpeasy-recognised-or-approved-by-hse']],
  ['what is in the free trial', ['faq-what-is-included-in-the-free-trial']],
  ['where have my downloads gone', ['print-where-have-my-downloads-gone']],
  ['will my saved labels show on my laptop', ['print-will-labels-i-save-appear-on-my-other-device', 'faq-can-i-save-and-reuse-my-labels']],
  ['my sheet does not line up', ['help-my-sheet-doesn-t-line-up-with-my-label-sheet']],
  ['can I use a laser printer for stickers', ['print-can-i-use-a-laser-printer-for-stickers']],
  ['do I need waterproof vinyl labels', ['print-do-i-have-to-buy-vinyl-or-waterproof-labels']],
  ['PDF opened in a new tab', ['print-why-has-pdf-opened-a-tab-instead-of-downloading']],
  ['is 52mm the legal minimum', ['print-is-a-52-mm-circle-always-the-legal-minimum', 'help-what-size-label-should-i-use']],
  ['can different fragrances go on one sheet', ['print-can-different-fragrances-share-one-sheet']],
  ['who is responsible for the label', ['faq-who-is-responsible-for-a-gb-clp-label']],
  ['what is REACH', ['kb-reach']],
  ['IFRA certificate', ['kb-ifra']],
  ['GPSR product safety', ['kb-gpsr']],
  ['what goes on a CLP label', ['kb-label-elements']],
  ['how do I contact support', ['faq-when-should-i-contact-support', 'print-when-should-i-contact-support', 'support-before-you-contact-us']],
  ['does a label mean my candle passed safety testing', ['faq-does-a-clpeasy-label-mean-my-candle-has-passed-safety-testin', 'compliance-candle-safety-is-a-separate-task']],
  ['can I reuse a half used sticker sheet', ['print-can-i-reuse-a-partly-used-sticker-sheet']],
  ['my print is blurry', ['print-what-if-my-print-is-blurry-missing-a-symbol-or-the-wrong-siz']],
  ['which printer should I buy', ['print-which-printer-should-i-use']],
  ['how do I print one label on A4', ['print-can-i-print-just-one-label-on-a4', 'print-route-one', 'help-printing-a-single-label']],
  ['upload SVG to design space', ['print-can-i-upload-my-svg-to-design-space']],
  ['what does CLPeasy do', ['compliance-clear-about-what-clpeasy-does', 'faq-what-products-does-clpeasy-support']],
  ['what products are supported', ['faq-what-products-does-clpeasy-support']]
];
const misses = [];
for (const [q, want] of SEARCH) {
  const top = G.search(q)[0];
  if (!top || !want.includes(top.card.id)) misses.push(`"${q}" → ${top ? top.card.id : 'no match'} (want ${want[0]})`);
}
assert(!misses.length, 'search misses:\n  ' + misses.join('\n  '));
ok(`search: ${SEARCH.length} customer-style questions find the right reviewed answer first`);

for (const q of ['asdfgh', 'qwerty zxcv', 'banana bread recipe', 'football scores tonight', '']) {
  const s = G.createSession();
  const r = G.respond(s, q);
  if (q) assert(r.noMatch && /couldn't find an answer/.test(plain(r.html)) && /contact support/.test(plain(r.html)) && /Knowledge Base/.test(plain(r.html)), 'fallback for ' + q);
}
ok('no match: helpful fallback (try other words, Help Guide, Knowledge Base, contact support)');

// Each suggested topic chip finds its own card.
for (let step = 1; step <= 5; step++) {
  for (const chip of G.topicsForStep(step)) {
    const r = G.respond(G.createSession(), chip.send);
    assert(r.cardId && G.card(r.cardId).title === chip.label, `step ${step} topic "${chip.label}" → ${r.cardId}`);
  }
}
ok('suggested topics for Steps 1–5 each open their own answer');

// ── Guardrails ────────────────────────────────────────────────
{
  const GUARD = [
    ['What signal word should my candle have?', 'guide-signal-word'],
    ['Should my wax melt say warning or danger?', 'guide-signal-word'],
    ['which signal word do I need', 'guide-signal-word'],
    ['which hazard statements do I need for my candle', 'guide-no-classification'],
    ['what pictograms should go on my wax melt', 'guide-no-classification'],
    ['what P statements should I put on my label', 'guide-no-classification'],
    ['can you classify my fragrance for me', 'guide-no-classification'],
    ['tell me the hazards for my reed diffuser', 'guide-no-classification'],
    ['What H codes go on a lavender candle', 'guide-no-classification']
  ];
  for (const [q, id] of GUARD) {
    const r = G.respond(G.createSession(), q);
    assert.strictEqual(r.cardId, id, `guardrail for "${q}" → ${r.cardId}`);
    assert(/doesn't choose|never suggests/.test(plain(r.html)), 'guardrail wording');
  }
  // Questions about using the tool are not blocked by the guardrail.
  for (const q of ['where do I find hazard statements in my SDS', 'does the whole pictogram have to be red', 'smart paste missed a pictogram']) {
    assert(!G.guard(q), 'guardrail must not catch: ' + q);
  }
  // Across every answer and step template, no signal word or H/P code is recommended.
  const all = [];
  for (const [q] of SEARCH.concat(GUARD)) all.push(G.respond(G.createSession(), q).html);
  const s = G.createSession(); G.respond(s, 'a 52mm circle label for a candle, just one'); G.respond(s, 'yes');
  for (const st of ['walkthrough', 'quicklist', 'autofill']) { const ss = G.createSession(); G.respond(ss, 'a 52mm circle label for a candle, just one'); G.respond(ss, 'yes'); all.push(G.styleReply(ss, st).html); }
  for (const h of all) {
    const t = plain(h);
    assert(!/\b(use|choose|add|select|should (say|use|show)|needs?)\b[^.]{0,30}\b(Warning|Danger)\b(?! or)/.test(t.replace(/"Signal word: Warning"/g, '')), 'signal word suggested: ' + t.slice(0, 160));
    assert(!/\b(H[2-4]\d{2}|EUH0\d\d|P[1-5]\d{2})\b/.test(t), 'hazard/precautionary code in a Guide Me answer: ' + t.slice(0, 160));
  }
  ok(`guardrails: ${GUARD.length} classification/signal-word questions get the fixed "CLPeasy doesn't choose" answer; no answer or step recommends a signal word or H/P code`);
}

// ── Contextual help ───────────────────────────────────────────
{
  const r = G.respond(G.createSession(), "Why can't I download?", { step: 5, blockedMessage: 'Add your product name in Step 2 before downloading.' });
  assert(r.cardId === 'guide-why-blocked' && /What CLPeasy says is still needed: Add your product name in Step 2/.test(plain(r.html)), 'blocked reason shown');
  const r2 = G.respond(G.createSession(), 'smart paste stopped my label', { step: 3, issuesMessage: 'The signal word (for example Warning or Danger) could not be read.' });
  assert(r2.cardId === 'support-something-missing-after-smart-paste' && /What CLPeasy says about this label: The signal word/.test(plain(r2.html)), 'supplier wording issue shown');
  const r3 = G.respond(G.createSession(), 'download button is greyed out', { step: 5, blockedMessage: '<img src=x onerror=alert(1)>' });
  assert(!/<img/.test(r3.html), 'Builder message is escaped');
  ok("contextual help: shows the Builder's own blocked-download / Smart Paste message (escaped)");
}

// ── Safety of output and no network ───────────────────────────
{
  const r = G.respond(G.createSession(), '<img src=x onerror=alert(1)> 4 of <b>Rose</b> and 4 of Fig circle 52mm on a sheet');
  assert(!/<img|<b>Rose/.test(r.html), 'user text is escaped in replies');
  const src = fs.readFileSync(path.join(ROOT, 'guide-me.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'guide-me-content.js'), 'utf8');
  assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|anthropic|supabase\.co\/functions/i.test(src), 'guide engine/content must not make network requests');
  ok('output escapes typed text; guide-me.js and its content contain no network calls');
}

console.log(`\nguide-me-engine: ${passed} checks passed`);
