// Regression coverage for Builder Label Technical Audit findings M19/M20
// (Issue #5): precautionary-statement wording.
//
//   Part 1 (jsdom, shared renderer): the ONE library (P_DEFS) holds all 29
//     supported codes with their GB Annex IV classification and verified
//     wording; every code is rendered individually; fixed statements print
//     their complete wording; selection/completion statements print ONLY
//     from a valid structured supplier choice and are otherwise omitted and
//     reported incomplete (no CLPeasy default); none of the old invented
//     wording can appear; P280 is unchanged; old schema-v1 records render
//     corrected fixed wording, are incomplete where supplier wording is
//     needed, and are never modified.
//   Part 2 (pure function, Smart Paste): LabelRenderer.extractPChoicesFromText
//     on the real Nikura Section 2.2 fixtures and on contaminated/ambiguous
//     layouts -- only clean template matches become choices; page headers,
//     addresses, column layouts, hyphenated wraps, codes-only and
//     non-matching wording are rejected with a reason.
//   Part 3 (jsdom, print.html Composer): saved records missing supplier P
//     wording are blocked with the statement named; complete records print;
//     records are never altered.
//   Part 4 (real Chromium, builder.html served locally, network blocked):
//     Smart Paste populates choices from clean supplier wording; codes-only
//     and contaminated pastes leave the Step 3 cards incomplete (nothing
//     pre-filled) and Step 3 blocks; completing the cards unblocks; manual
//     chips; go-back-after-confirmation disables every export route
//     (including the mobile preview sheet); saving stores pChoices (schema
//     v2); opening a v1 saved label lands blocked at Step 5; mobile layout.
// Run from the repo root: node tests/precautionary-statement-wording.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');
const puppeteer = require('puppeteer');
const { stubRenderer } = require('./fixtures/required-content-fixtures');
const { FIXTURE_P_CHOICES } = require('./fixtures/p-statement-choices');

const ROOT = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');

// ── The Issue #5 evidence table: GB Annex IV wording + classification, as
//    supplied by Michaela from legislation.gov.uk (Sept 2026). ──────────────
const FIXED = {
  'P101': 'If medical advice is needed, have product container or label at hand.',
  'P102': 'Keep out of reach of children.',
  'P103': 'Read label before use.',
  'P210': 'Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking.',
  'P211': 'Do not spray on an open flame or other ignition source.',
  'P233': 'Keep container tightly closed.',
  'P271': 'Use only outdoors or in a well-ventilated area.',
  'P273': 'Avoid release to the environment.',
  'P304+P340': 'IF INHALED: Remove person to fresh air and keep comfortable for breathing.',
  'P305+P351+P338': 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.',
  'P313': 'Get medical advice/attention.',
  'P314': 'Get medical advice/attention if you feel unwell.',
  'P330': 'Rinse mouth.',
  'P331': 'Do NOT induce vomiting.',
  'P332+P313': 'If skin irritation occurs: Get medical advice/attention.',
  'P333+P313': 'If skin irritation or rash occurs: Get medical advice/attention.',
  'P337+P313': 'If eye irritation persists: Get medical advice/attention.',
  'P391': 'Collect spillage.',
  'P403+P233': 'Store in a well-ventilated place. Keep container tightly closed.',
};
const SELECTION = ['P260', 'P261', 'P280'];
const COMPLETION = ['P301+P310', 'P301+P312', 'P302+P352', 'P312', 'P321', 'P370+P378', 'P501'];
// What each supplier choice must print as (FIXTURE_P_CHOICES).
const COMPLETED = {
  'P260': 'Do not breathe dusts or mists.',
  'P261': 'Avoid breathing vapour or dust.',
  'P301+P310': 'IF SWALLOWED: Immediately call a POISON CENTRE/doctor.',
  'P301+P312': 'IF SWALLOWED: Call a POISON CENTRE/doctor if you feel unwell.',
  'P302+P352': 'IF ON SKIN: Wash with plenty of soap and water.',
  'P312': 'Call a POISON CENTRE/doctor if you feel unwell.',
  'P321': 'Specific treatment (see the first aid instructions on this label).',
  'P370+P378': 'In case of fire: Use foam, carbon dioxide or dry powder to extinguish.',
  'P501': 'Dispose of contents/container to approved disposal site, in accordance with local regulations.',
};
// CLPeasy's old invented/abbreviated wording -- must never be printed again.
const OLD_INVENTED = [
  'rinse cautiously with water for several minutes.', 'Keep away from heat and ignition sources',
  'Do not breathe vapours or dust', 'Avoid breathing vapours and dust', 'POISON CENTRE or doctor',
  'wash with plenty of water', 'remove to fresh air', 'Specific treatment: see label',
  'use appropriate media for extinction', 'Dispose of contents and container in accordance with local regulations',
  'Get medical advice if you feel unwell', 'rash occurs: get medical advice.', 'persists: get medical advice.',
];
const flatText = svg => svg.replace(/<g class="clp-fit-block"[\s\S]*?<\/g>/g, '').replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const baseLabel = { scentName: 'Test Scent', productType: 'Room Spray', bizName: 'Crafty Mouse Gifts', bizAddress: '12 Mill Lane', bizPhone: '01234 567890',
  signal: 'Warning', hStatements: 'H315', pictograms: ['exclamation'], sensitisers: [], shape: 'rectangle', size: 'custom', customW: 150, customH: 100, textColour: 'dark', showBorder: true };

// Real Nikura Section 2.2 text, read from the existing real-sample test.
function nikuraSamples() {
  const src = fs.readFileSync(path.join(__dirname, 'slash-p-code-normalisation.js'), 'utf8');
  const out = {};
  for (const n of ['POSITIVITY_TEXT', 'NAG_CHAMPA_TEXT', 'SNOW_PIXIE_TEXT']) out[n] = src.match(new RegExp(`const ${n} = \`([\\s\\S]*?)\`;`))[1];
  return out;
}

// ── PART 1: shared renderer ─────────────────────────────────────────────
function partOne() {
  const LR = stubRenderer(rendererSource);
  const byCode = Object.fromEntries(LR.P_DEFS.map(d => [d.code, d]));
  const all = [...Object.keys(FIXED), ...SELECTION, ...COMPLETION];
  assert.strictEqual(LR.P_DEFS.length, 29, 'all 29 supported P-codes are kept');
  assert.deepStrictEqual(Array.from(LR.P_DEFS, d => d.code).sort(), all.slice().sort(), 'the library holds exactly the 29 supported codes');
  assert.deepStrictEqual(Array.from(LR.P_LIB, p => p.code), Array.from(LR.P_DEFS, d => d.code), 'P_LIB is derived from P_DEFS (same codes, same order)');
  for (const [code, text] of Object.entries(FIXED)) {
    assert.strictEqual(byCode[code].kind, 'fixed', `${code} is fixed`);
    assert.strictEqual(byCode[code].text, text, `${code} verified wording`);
  }
  for (const code of SELECTION) assert.strictEqual(byCode[code].kind, 'selection', `${code} is a supplier selection`);
  for (const code of COMPLETION) assert.strictEqual(byCode[code].kind, 'completion', `${code} is a supplier completion`);
  const builder = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
  assert(/const P_LIB=LabelRenderer\.P_LIB;/.test(builder) && !/const P_LIB=\[/.test(builder), 'builder.html uses the single library (no second copy)');

  let rendered = 0;
  // every supported code individually
  for (const code of all) {
    if (code === 'P280') continue; // P280: its own picker, checked below
    const r0 = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: code }), { instanceId: 'a' + rendered++ });
    const t0 = flatText(r0.svg);
    if (FIXED[code]) {
      assert(t0.includes(FIXED[code]), `${code}: complete fixed wording must print -- got "${t0}"`);
      assert.strictEqual(r0.requiredContent.complete, true, `${code}: a fixed statement needs no supplier input`);
      continue;
    }
    // no choice: nothing printed, label incomplete (no default)
    assert.deepStrictEqual([...r0.requiredContent.incompletePStatements], [code], `${code}: without supplier wording the label is incomplete`);
    assert(r0.requiredContent.missing.includes('p-statement'), `${code}: 'p-statement' missing`);
    assert(!t0.includes(byCode[code].lead || byCode[code].before), `${code}: nothing may print without the supplier's choice -- got "${t0}"`);
    // with the supplier's choice: exactly the completed statement
    const r1 = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: code, pChoices: { [code]: FIXTURE_P_CHOICES[code] } }), { instanceId: 'b' + rendered++ });
    assert(flatText(r1.svg).includes(COMPLETED[code]), `${code}: must print "${COMPLETED[code]}" -- got "${flatText(r1.svg)}"`);
    assert.strictEqual(r1.requiredContent.complete, true, `${code}: complete with the supplier's choice`);
  }
  // explicit checks requested for Issue #5
  const P = (code, choice) => LR.resolvePChoice(code, choice);
  assert.strictEqual(P('P312', { text: 'NHS 111 or a doctor' }), 'Call NHS 111 or a doctor if you feel unwell.', 'P312 uses the supplier-selected source');
  // P260/P261: the supplier's validated wording is printed as given -- never
  // re-ordered, re-pluralised or re-joined with "/" (Michaela's decision)
  for (const [code, t, out] of [
    ['P261', 'vapour or dust', 'Avoid breathing vapour or dust.'], ['P261', 'vapours', 'Avoid breathing vapours.'], ['P261', 'spray', 'Avoid breathing spray.'],
    ['P261', 'mist/vapours/spray', 'Avoid breathing mist/vapours/spray.'], ['P261', 'dust, fume, or mist', 'Avoid breathing dust, fume, or mist.'],
    ['P260', 'dusts or mists', 'Do not breathe dusts or mists.'], ['P260', 'vapours and spray', 'Do not breathe vapours and spray.'],
  ]) assert.strictEqual(P(code, { text: t }), out, `${code} "${t}" must print exactly as the supplier wrote it`);
  assert.strictEqual(P('P501', { scope: 'container', text: 'a licensed waste contractor' }), 'Dispose of container to a licensed waste contractor.');
  assert.strictEqual(P('P501', { scope: 'contents', text: 'to an approved site' }), 'Dispose of contents to an approved site.', 'a repeated leading "to" is not doubled');
  // invalid / generic choices are rejected -- never a default
  for (const [code, bad] of [
    ['P501', { text: 'approved site' }], ['P501', { scope: 'all', text: 'approved site' }], ['P501', { scope: 'both', text: '' }],
    ['P370+P378', {}], ['P370+P378', { text: '   ' }], ['P370+P378', { text: '…' }], ['P370+P378', { text: '...' }],
    ['P321', { text: 'label. Rinse skin' }], ['P312', { text: 'x'.repeat(151) }], ['P302+P352', { text: 'water/…' }],
    ['P260', { text: '' }], ['P261', { text: 'smoke' }], ['P261', { text: 'vapour & dust' }], ['P261', { text: 'vapour or or dust' }], ['P261', { text: 'vapours dust' }],
    ['P261', { text: 'dust/fume/…' }], ['P261', { forms: ['vapours'] }], ['P261', null], ['P102', { text: 'anything' }], ['P280', { text: 'gloves' }],
  ]) assert.strictEqual(P(code, bad), null, `${code} ${JSON.stringify(bad)} must be rejected`);
  // P370+P378 and P501 can never print a CLPeasy completion
  for (const code of ['P370+P378', 'P501']) {
    const r = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: code, pChoices: { [code]: { source: 'maker' } } }), { instanceId: 'g' + rendered++ });
    assert(!/extinguish|extinction|Dispose/.test(flatText(r.svg)), `${code}: nothing may print without the supplier's completion`);
    assert.strictEqual(r.requiredContent.complete, false);
  }
  // a maker's completion is escaped in the SVG output
  const esc = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: 'P370+P378', pChoices: { 'P370+P378': { text: '<script>x</script> & "foam"' } } }), { instanceId: 'esc' });
  assert(!esc.svg.includes('<script>') && esc.svg.includes('&lt;script&gt;'), 'supplier completion text must be escaped in the SVG');
  // adjacent codes still combine; split P305/P351/P338 still blocks as unrecognised
  assert.deepStrictEqual([...LR.normalisePCodes('P370, P378, P102')], ['P370+P378', 'P102']);
  const split = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: 'P305, P351, P338' }), { instanceId: 'split' });
  assert.strictEqual(split.fits, false, 'separately typed P305/P351/P338 still block as unrecognised');
  // P280 unchanged
  assert.strictEqual(LR.buildP280Wording({ p280Items: ['gloves', 'eye'] }), 'Wear protective gloves/eye protection');
  const p280 = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: 'P102, P280', p280Items: ['gloves', 'eye'] }), { instanceId: 'p280' });
  assert(flatText(p280.svg).includes('Keep out of reach of children. Wear protective gloves/eye protection.'), 'P280 prints its selected wording as before');
  assert.strictEqual(LR.renderLabel(Object.assign({}, baseLabel, { pStatements: 'P280' }), { instanceId: 'p280n' }).fits, false, 'P280 without a selection still blocks as before');
  // none of the old invented wording can appear, whatever the choices
  const everything = LR.renderLabel(Object.assign({}, baseLabel, { customW: 200, customH: 200, pStatements: all.filter(c => c !== 'P280').join(', '), pChoices: FIXTURE_P_CHOICES }), { instanceId: 'all' });
  const tAll = flatText(everything.svg);
  for (const s of OLD_INVENTED) assert(!tAll.includes(s), `old CLPeasy wording "${s}" must never print`);
  for (const s of Object.values(FIXED).concat(Object.values(COMPLETED))) assert(tAll.includes(s), `"${s}" must print in the all-codes label`);
  // schema-v1 saved record: corrected fixed wording, supplier wording incomplete, record untouched
  const v1 = { schemaVersion: 1, rendererVersion: '1.0.0', scentName: 'Old Label', productType: 'Scented Candle', bizName: 'Crafty Mouse Gifts', bizPhone: '01234 567890',
    signal: 'Warning', hStatements: 'H317, H319', pStatements: 'P102, P261, P305+P351+P338, P501', sensitisers: ['Linalool'], pictograms: ['exclamation'],
    shape: 'rectangle', size: 'custom', customW: 150, customH: 100 };
  const snap = JSON.stringify(v1);
  const rv1 = LR.renderLabel(v1, { instanceId: 'v1' });
  assert(flatText(rv1.svg).includes(FIXED['P305+P351+P338']), 'v1 label re-renders the corrected P305+P351+P338 wording');
  assert.deepStrictEqual([...rv1.requiredContent.incompletePStatements], ['P261', 'P501'], 'v1 label: supplier-specific statements are incomplete');
  assert(!/Avoid breathing|Dispose of/.test(flatText(rv1.svg)), 'v1 label: no old generic wording is kept as a fallback');
  LR.checkRequiredContent(v1); LR.normalizeLabel(v1);
  assert.strictEqual(JSON.stringify(v1), snap, 'the saved record itself is never modified');
  return rendered;
}

// ── PART 2: Smart Paste extraction ─────────────────────────────────────
function partTwo() {
  const LR = stubRenderer(rendererSource);
  const x = (text, codes) => JSON.parse(JSON.stringify(LR.extractPChoicesFromText(text, codes)));
  const N = nikuraSamples();
  const NIKURA_P501 = { scope: 'both', text: 'approved disposal site, in accordance with local regulations', source: 'sds' };
  let cases = 0;
  const expect = (label, got, choices, unresolved) => {
    assert.deepStrictEqual(got.choices, choices, `${label}: choices`);
    assert.deepStrictEqual(got.unresolved, unresolved, `${label}: unresolved`);
    cases++;
  };
  // real Nikura fixtures (codes as Smart Paste's existing extraction leaves them)
  expect('Nikura Nag Champa', x(N.NAG_CHAMPA_TEXT, ['P261', 'P273', 'P302+P352', 'P333+P313', 'P501']),
    { 'P261': { text: 'vapour or dust', source: 'sds' }, 'P302+P352': { text: 'soap and water', source: 'sds' }, 'P501': NIKURA_P501 }, {});
  expect('Nikura Positivity', x(N.POSITIVITY_TEXT, ['P261', 'P302+P352', 'P333+P313', 'P501']),
    { 'P261': { text: 'vapour or dust', source: 'sds' }, 'P302+P352': { text: 'soap and water', source: 'sds' }, 'P501': NIKURA_P501 }, {});
  // Snow Pixie: the page footer (company address, page number, issue date,
  // version) follows P501 on separate lines -- it is recognised and never used
  expect('Nikura Snow Pixie', x(N.SNOW_PIXIE_TEXT, ['P273', 'P501']), { 'P501': NIKURA_P501 }, {});
  // contaminated / ambiguous / incomplete input
  expect('page header inside the statement', x('P501 Dispose of contents/container to\nAcme Oils Ltd  Page 2 of 7  Revision 3\nlicensed waste contractor.', ['P501']), {}, { 'P501': 'contaminated' });
  expect('company address inside the statement', x('P370+P378 In case of fire: Use foam, Unit 6, Tariff Road, London, N17 0EB to extinguish.', ['P370+P378']), {}, { 'P370+P378': 'contaminated' });
  expect('unrecognised text after the statement', x('P501 Dispose of contents/container to an approved site.\nDo not reuse the container.', ['P501']), {}, { 'P501': 'ambiguous' });
  expect('column layout (codes then wording)', x('Precautionary statements\nP261\nP302+P352\nP501\nAvoid breathing mist/vapours.\nIF ON SKIN: Wash with plenty of water.\nDispose of contents/container to an approved waste disposal plant.', ['P261', 'P302+P352', 'P501']),
    {}, { 'P261': 'not-found', 'P302+P352': 'not-found', 'P501': 'ambiguous' });
  expect('codes only', x('Precautionary statements: P261, P302+P352, P370+P378, P501', ['P261', 'P302+P352', 'P370+P378', 'P501']),
    {}, { 'P261': 'not-found', 'P302+P352': 'not-found', 'P370+P378': 'not-found', 'P501': 'not-found' });
  expect('wording only, no codes', x('Avoid breathing vapours. Dispose of contents/container to an approved site.', ['P261', 'P501']), {}, { 'P261': 'not-found', 'P501': 'not-found' });
  expect('hyphenated line wrap', x('P501 Dispose of contents/container to an approved dis-\nposal site.', ['P501']), {}, { 'P501': 'ambiguous' });
  expect('wrapped (unhyphenated) statement', x('P501 Dispose of contents/container to an approved\ndisposal site.', ['P501']), { 'P501': { scope: 'both', text: 'an approved disposal site', source: 'sds' } }, {});
  expect('same code, conflicting wording', x('P501 Dispose of contents to site A.\nP501 Dispose of container to site B.', ['P501']), {}, { 'P501': 'ambiguous' });
  expect('wording not matching the GB template', x('P501 Dispose of contents/container in accordance with local regulations.\nP302+P352 Wash with plenty of water.', ['P501', 'P302+P352']),
    {}, { 'P501': 'not-matching', 'P302+P352': 'not-matching' });
  expect('template copied with its "…"', x('P302+P352 IF ON SKIN: Wash with plenty of water/…', ['P302+P352']), {}, { 'P302+P352': 'not-matching' });
  expect('unknown exposure form', x('P261 Avoid breathing smoke.', ['P261']), {}, { 'P261': 'not-matching' });
  expect('supplier completions', x('P370+P378 In case of fire: Use CO2, dry chemical or foam to extinguish.\nP301+P310 IF SWALLOWED: Immediately call a POISON CENTER/doctor.\nP321 Specific treatment (see first aid measures on this label).\nP260 Do not breathe dusts or mists.',
    ['P370+P378', 'P301+P310', 'P321', 'P260']),
    { 'P370+P378': { text: 'CO2, dry chemical or foam', source: 'sds' }, 'P301+P310': { text: 'a POISON CENTER/doctor', source: 'sds' },
      'P321': { text: 'first aid measures', source: 'sds' }, 'P260': { text: 'dusts or mists', source: 'sds' } }, {});
  expect('spaced combined code', x('P370 + P378 In case of fire: Use foam to extinguish.', ['P370+P378']), { 'P370+P378': { text: 'foam', source: 'sds' } }, {});
  expect('fixed codes are never extracted', x('P102 Keep out of reach. P210 Keep away from heat.', ['P102', 'P210']), {}, {});
  // raw SDS text never reaches the label: the Snow Pixie footer is absent
  const r = LR.renderLabel(Object.assign({}, baseLabel, { pStatements: 'P273, P501', pChoices: x(N.SNOW_PIXIE_TEXT, ['P273', 'P501']).choices }), { instanceId: 'snow' });
  const t = flatText(r.svg);
  assert(t.includes(COMPLETED['P501']) && !/Nikura|Page 2|Issue date|N17/.test(t), `raw SDS text must never print: ${t}`);
  return cases;
}

// ── PART 3: Composer (print.html) ───────────────────────────────────────
function partThree() {
  const source = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
  const librarySource = fs.readFileSync(path.join(ROOT, 'label-library.js'), 'utf8');
  const base = { productType: 'Candle', shape: 'circle', size: 'custom', customW: 63, customH: 63, bizName: 'Crafty Mouse Gifts', bizAddress: '', bizPhone: '01234 567890', bizWebsite: '',
    netWeight: '220g', burnTime: '', signal: 'Warning', hStatements: 'H315', pictograms: ['exclamation'], sensitisers: [], textColour: 'dark', showBorder: true, hideEN15494: false, labelLang: 'en' };
  const saved = [
    ['OK', { scentName: 'Fixed Only', pStatements: 'P102, P305+P351+P338' }, null],
    ['DONE', { scentName: 'Completed P501', pStatements: 'P102, P501', pChoices: { 'P501': FIXTURE_P_CHOICES['P501'] }, schemaVersion: 2 }, null],
    ['V1', { scentName: 'Old v1 P501', pStatements: 'P102, P501', schemaVersion: 1 }, 'P501 needs its supplier-specific wording'],
    ['FIRE', { scentName: 'No Media', pStatements: 'P370, P378', schemaVersion: 1 }, 'P370+P378 needs its supplier-specific wording'],
    ['TWO', { scentName: 'Two Missing', pStatements: 'P261, P302+P352' }, 'P261, P302+P352 need their supplier-specific wording'],
  ].map(([tag, o, reason]) => ({ tag, reason, rec: Object.assign({}, base, o, { batchNum: tag }) }));
  const counts = { open: 0, anchor: 0, zip: 0 };
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const emptyQuery = { select() { return this; }, eq() { return this; }, update() { return this; }, upsert() { return this; },
    single() { return Promise.resolve({ data: null, error: null }); }, then(r) { return Promise.resolve({ data: null, error: null }).then(r); } };
  const dom = new JSDOM(source, {
    url: 'https://local.clpeasy.test/print.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText(t) { const s = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12; return { width: [...String(t)].reduce((w, c) => w + s * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) }; }, drawImage() {}, fillRect() {}, clearRect() {}, getImageData() { return { data: [] }; } });
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
      window.HTMLCanvasElement.prototype.toBlob = function (cb) { cb({ size: 1, type: 'image/png' }); };
      try { window.crypto.subtle = webcrypto.subtle; } catch (e) { /* already present */ }
      window.eval(rendererSource); window.eval(librarySource);
      window.alert = m => { window.__lastAlert = String(m); }; window.confirm = () => true; window.scrollTo = () => {};
      window.fetch = async () => ({ ok: true, json: async () => ({}) });
      window.open = () => { counts.open++; return { document: { write() {}, close() {} }, location: { href: '' }, close() {}, opener: null }; };
      window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () { counts.anchor++; };
      window.JSZip = function () { this.file = function () { counts.zip++; }; this.generateAsync = async function () { return { size: 0 }; }; };
      class FakeImage { set src(v) { if (this.onload) this.onload(); } } window.Image = FakeImage;
      window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => Object.create(emptyQuery), rpc: async () => ({ data: false, error: null }) }) };
      window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(saved.map(s => s.rec)));
    },
  });
  const { window } = dom;
  return new Promise((resolve, reject) => setTimeout(async () => {
    try {
      window.eval("sbClient={from:()=>({select(){return this;},eq(){return this;},single(){return Promise.resolve({data:{plan:'pro',status:'active'},error:null});}})}; currentUser=currentUser||{id:'test-user'}; isPro=true; if(typeof updateProGate==='function')updateProGate();");
      const before = JSON.stringify(window.eval('getSaved()'));
      const ids = window.eval('getSaved()').map(r => ({ id: r.id, tag: r.batchNum }));
      let checked = 0;
      for (const s of saved) {
        const id = ids.find(x => x.tag === s.tag).id;
        window.eval(`addToSheet('${id}')`);
        assert.strictEqual(window.eval('sheetFitIssues.length'), 0, `${s.tag}: 63mm fixture must fit physically`);
        const content = JSON.parse(JSON.stringify(window.eval('sheetContentIssues')));
        counts.open = 0; counts.anchor = 0; counts.zip = 0; window.__lastAlert = '';
        if (s.reason) {
          assert.strictEqual(content.length, 1, `${s.tag}: expected one content issue`);
          assert(content[0].reason.includes(s.reason) && content[0].reason.includes('Open this label in the Builder'), `${s.tag}: reason "${content[0].reason}"`);
          assert(window.document.getElementById('fit-issues-panel').innerHTML.includes(s.reason.split(' need')[0]), `${s.tag}: the panel must name the statement`);
          await window.eval('downloadPDF()'); await window.eval('cricutDownloadZip()'); await window.eval('cricutDownloadSequential()');
          assert.strictEqual(counts.open + counts.anchor + counts.zip, 0, `${s.tag}: every sheet export must refuse`);
          assert(window.__lastAlert.includes(s.reason.split(' need')[0]), `${s.tag}: refusal must name the statement`);
        } else {
          assert.strictEqual(content.length, 0, `${s.tag}: a complete record must not be blocked`);
          await window.eval('downloadPDF()');
          assert.strictEqual(counts.open, 1, `${s.tag}: a complete record prints`);
        }
        window.eval(`removeSheetItem('${id}')`);
        checked++;
      }
      assert.strictEqual(JSON.stringify(window.eval('getSaved()')), before, 'saved records are never altered or repaired');
      assert.deepStrictEqual(errors.filter(e => !/Not implemented/.test(e)), [], 'no jsdom errors');
      resolve(checked);
    } catch (e) { reject(e); }
  }, 300));
}

// ── PART 4: Builder in real Chromium ───────────────────────────────────
function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pw)) return pw;
  throw new Error('No Chromium found: set PUPPETEER_EXECUTABLE_PATH');
}
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'builder.html');
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}
async function partFour() {
  const N = nikuraSamples();
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/builder.html`;
  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const stats = { flows: 0, refusals: 0 };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(`http://127.0.0.1:${srv.address().port}/`) || /^(data|blob):/.test(r.url()) ? r.continue() : r.abort()));
    const alerts = []; page.on('dialog', d => { alerts.push(d.message()); d.accept(); });
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(String(e)));
    const reload = async () => {
      await page.goto(url, { waitUntil: 'load' }); await new Promise(o => setTimeout(o, 600));
      await page.evaluate(() => {
        window.__dl = { anchor: 0, open: 0 };
        HTMLAnchorElement.prototype.click = function () { window.__dl.anchor++; };
        window.open = () => { window.__dl.open++; return { document: { write() {}, close() {} }, close() {}, focus() {}, print() {} }; };
      });
    };
    const H = {
      set: (id, v, ev) => page.evaluate((id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); }, id, v, ev || null),
      step: n => page.evaluate(n => { setApprovedBuilderStep(n); return approvedBuilderStep; }, n),
      at: () => page.evaluate(() => approvedBuilderStep),
      paste: t => page.evaluate(t => { document.getElementById('smart-paste-input').value = t; extractSDS(); }, t),
      confirmHazards: () => page.evaluate(() => { const c = document.getElementById('hazard-confirm'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }),
      tick: () => page.evaluate(() => { const c = document.getElementById('verify-checkbox'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }),
      // maker completes a card through its real inputs
      fill: (code, v) => page.evaluate((code, v) => { const card = document.querySelector(`.p-choice-card[data-code="${code}"]`); const i = card.querySelector('input[data-role="text"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, code, v),
      scope: (code, s) => page.evaluate((code, s) => { const card = document.querySelector(`.p-choice-card[data-code="${code}"]`); const i = card.querySelector(`input[data-role="scope"][value="${s}"]`); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }, code, s),
      cards: () => page.evaluate(() => [...document.querySelectorAll('.p-choice-card')].map(c => ({ code: c.dataset.code, incomplete: c.classList.contains('incomplete'), status: c.querySelector('.p-choice-status').textContent,
        reason: (c.querySelector('.p-choice-reason') || {}).textContent || '', values: [...c.querySelectorAll('input[type="text"]')].map(i => i.value), checked: c.querySelectorAll('input:checked').length }))),
      labelText: () => page.evaluate(() => buildSVG(false).replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ')),
    };
    const HEAD = '2.2 Label elements\nSignal word: Warning\nHazard statements: H317, May cause an allergic skin reaction.\nH412, Harmful to aquatic life with long lasting effects.\nSupplemental Information:\nEUH208, Contains Linalool, Citral. May produce an allergic reaction.\nPrecautionary statements:\n';
    const NIKURA_P = N.POSITIVITY_TEXT.slice(N.POSITIVITY_TEXT.indexOf('P261, Avoid'));
    const toStep3 = async () => { await page.evaluate(() => { selectShape('rectangle'); }); await H.set('custom-w', '150'); await H.set('custom-h', '100'); await page.evaluate(() => onDimInput()); await H.step(2); await H.set('scent-name', 'Lavender Fields'); await H.set('product-type', 'Room Spray', 'change'); await H.step(3); };
    const toStep5 = async () => { await H.confirmHazards(); await H.step(4); await H.set('biz-name', 'Crafty Mouse Gifts'); await H.set('biz-address', '12 Mill Lane'); await H.set('biz-phone', '01234 567890'); await H.step(5); await H.tick(); };
    const gate = () => page.evaluate(() => { const on = id => getComputedStyle(document.getElementById(id)).pointerEvents !== 'none';
      return { allowed: _downloadAllowed(), png: on('btn-png'), svg: on('btn-svg'), pdf: on('btn-pdf'), pngPrev: on('btn-png-preview'), svgPrev: on('btn-svg-preview'), pdfPrev: on('btn-pdf-preview'), save: on('btn-save'), physical: !!window._labelBlockDownload,
        warn: document.getElementById('content-warn-step5').style.display !== 'none' ? document.getElementById('content-warn-step5').innerText : '' }; });
    const tryAllExports = async (label, code) => {
      await page.evaluate(() => { window.__dl.anchor = 0; window.__dl.open = 0; });
      const before = alerts.length;
      await page.evaluate(async () => {
        await downloadPNG(); await downloadSVG(); printToPDF(); await downloadPDFSheet(); await downloadPrintReadyPDF(); await downloadCricutPNGs();
        openPreviewSheet(); for (const b of document.querySelectorAll('#preview-sheet .preview-sheet-actions button')) b.click();
        await new Promise(o => setTimeout(o, 50)); closeSheet();
      });
      const msgs = alerts.slice(before); const dl = await page.evaluate(() => window.__dl);
      assert.strictEqual(msgs.length, 8, `${label}: expected 8 refusals, got ${msgs.length}`);
      for (const m of msgs) assert(m.includes(`Complete the supplier wording for ${code}`), `${label}: refusal must name ${code}: ${m}`);
      assert.strictEqual(dl.anchor + dl.open, 0, `${label}: nothing may be downloaded or opened`);
      stats.refusals += msgs.length;
    };

    // 1. clean supplier wording (real Nikura P lines): choices populated, Step 3 continues, supplier wording prints
    await reload(); await toStep3(); await H.paste(HEAD + NIKURA_P);
    let cards = await H.cards();
    assert.deepStrictEqual(cards.map(c => [c.code, c.incomplete]), [['P261', false], ['P302+P352', false], ['P501', false]], `Nikura paste: cards ${JSON.stringify(cards)}`);
    assert(cards.every(c => c.status.includes('From your pasted SDS')), 'SDS-sourced choices are labelled for the maker to check');
    let text = await H.labelText();
    for (const s of ['Avoid breathing vapour or dust.', 'IF ON SKIN: Wash with plenty of soap and water.', 'If skin irritation or rash occurs: Get medical advice/attention.', COMPLETED['P501']]) assert(text.includes(s), `Nikura paste must print "${s}": ${text}`);
    assert(!/Nikura|Page 2|Issue date/.test(text), 'page furniture must never print');
    await H.confirmHazards(); await H.step(4);
    assert.strictEqual(await H.at(), 4, 'Step 3 continues when every supplier statement is complete');
    stats.flows++;

    // 2. codes only: cards incomplete, nothing pre-filled, Step 3 blocks naming the codes; completing the cards unblocks
    await reload(); await toStep3(); await H.paste(HEAD + 'P102, P261, P370+P378, P501');
    cards = await H.cards();
    assert.deepStrictEqual(cards.map(c => c.code), ['P261', 'P370+P378', 'P501']);
    assert(cards.every(c => c.incomplete && c.values.every(v => v === '') && c.checked === 0), `no CLPeasy answer may be pre-filled: ${JSON.stringify(cards)}`);
    assert(cards.every(c => c.reason.includes("couldn't find")), 'the maker is told the wording was not found');
    text = await H.labelText();
    assert(!/Avoid breathing|extinguish|extinction|Dispose/.test(text), `incomplete statements must not print: ${text}`);
    await H.confirmHazards(); let n = alerts.length; await H.step(4);
    assert.strictEqual(await H.at(), 3, 'Step 3 must block while supplier wording is missing');
    assert(alerts[n].includes('Complete the supplier wording for P261, P370+P378, P501'), `Step 3 message: ${alerts[n]}`);
    await H.fill('P261', 'vapours'); await H.fill('P370+P378', 'alcohol-resistant foam'); await H.fill('P501', 'a licensed waste contractor');
    n = alerts.length; await H.step(4);
    assert.strictEqual(await H.at(), 3, 'P501 still needs contents/container/both');
    assert(alerts[n].includes('P501') && !alerts[n].includes('P261'), `only P501 remains: ${alerts[n]}`);
    await H.scope('P501', 'container'); await H.step(4);
    assert.strictEqual(await H.at(), 4, 'Step 3 continues once the maker completes every card');
    text = await H.labelText();
    for (const s of ['Avoid breathing vapours.', 'In case of fire: Use alcohol-resistant foam to extinguish.', 'Dispose of container to a licensed waste contractor.']) assert(text.includes(s), `maker completion must print "${s}"`);
    stats.flows++;

    // 3. contaminated paste (page header inside P501): rejected with the reason shown
    await reload(); await toStep3(); await H.paste(HEAD + 'P273, Avoid release to the environment.\nP501, Dispose of contents/container to\nAcme Oils Ltd Page 2 of 7\nlicensed waste contractor.');
    cards = await H.cards();
    assert(cards.length === 1 && cards[0].incomplete && cards[0].reason.includes('page, document or company details'), `contaminated P501: ${JSON.stringify(cards)}`);
    assert(!/Acme|Page 2/.test(await H.labelText()), 'contamination never prints');
    stats.flows++;

    // 4. manual chip: P370+P378 added by hand -> card appears, Step 3 blocks until the media is entered
    await reload(); await toStep3(); await H.paste(HEAD + 'P273, Avoid release to the environment.');
    await page.evaluate(() => { for (const c of ['P370+P378']) document.querySelector(`#p-chips .h-chip[data-code="${c}"]`).click(); updateLabel(); });
    cards = await H.cards();
    assert(cards.length === 1 && cards[0].code === 'P370+P378' && cards[0].incomplete && cards[0].values[0] === '', 'manual chip shows an empty card');
    await H.confirmHazards(); await H.step(4);
    assert.strictEqual(await H.at(), 3, 'manual P370+P378 blocks Step 3 without media');
    await H.fill('P370+P378', 'water spray, foam or dry powder'); await H.step(4);
    assert.strictEqual(await H.at(), 4); stats.flows++;

    // 5. go back after confirming at Step 5 and clear the P501 completion: every export route refuses
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewport(vp);
      await reload(); await toStep3(); await H.paste(HEAD + NIKURA_P); await toStep5();
      let g = await gate();
      assert(g.allowed && g.png && g.svg && g.pdf && !g.warn, `complete label exportable at ${vp.width}px: ${JSON.stringify(g)}`);
      await H.step(3); await H.fill('P501', '');
      g = await gate();
      assert(!g.allowed && !g.png && !g.svg && !g.pdf && !g.pngPrev && !g.svgPrev && !g.pdfPrev && g.save && !g.physical, `cleared P501 must disable every export at ${vp.width}px: ${JSON.stringify(g)}`);
      assert(g.warn.includes('Complete the supplier wording for P501'), `Step 5 note must name P501: ${g.warn}`);
      await tryAllExports(`go-back ${vp.width}px`, 'P501');
      await H.fill('P501', 'an approved waste site');
      g = await gate();
      assert(g.allowed && g.png, 'completing P501 again restores export');
      if (vp.width < 500) {
        await H.step(3);
        const overflow = await page.evaluate(() => { const p = document.getElementById('p-choices-panel'); p.scrollIntoView(); return { doc: document.documentElement.scrollWidth - window.innerWidth, cards: [...p.querySelectorAll('.p-choice-card')].map(c => c.getBoundingClientRect().right - window.innerWidth) }; });
        assert(overflow.doc <= 0 && overflow.cards.every(o => o <= 0), `mobile: the cards must fit the screen: ${JSON.stringify(overflow)}`);
      }
      stats.flows++;
    }
    await page.setViewport({ width: 1440, height: 900 });

    // 6. save stores pChoices (schema v2); a v1 saved label opens blocked at Step 5 and is not rewritten
    await reload(); await toStep3(); await H.paste(HEAD + NIKURA_P); await toStep5();
    // (the Supabase CDN is blocked here, so auth never resolves on its own: start the saved-label library the way a signed-out guest does)
    const saved = await page.evaluate(async () => { currentUser = null; await initSavedLabelLibrary(); await saveLabel(); await new Promise(o => setTimeout(o, 300)); const all = getSaved(); return all[all.length - 1]; });
    assert.strictEqual(saved.schemaVersion, 2, 'new saves are schema v2');
    assert.deepStrictEqual(saved.pChoices['P501'], { scope: 'both', text: 'approved disposal site, in accordance with local regulations', source: 'sds' }, 'pChoices are stored with the label');
    const v1 = { id: 'lbl_v1_issue5_test', schemaVersion: 1, scentName: 'Old Label', productType: 'Scented Candle', shape: 'rectangle', size: 'custom', customW: 150, customH: 100,
      signal: 'Warning', hStatements: 'H317, H319', pStatements: 'P102, P261, P305+P351+P338, P501', sensitisers: ['Linalool'], pictograms: ['exclamation'], bizName: 'Crafty Mouse Gifts', bizPhone: '01234 567890' };
    const v1r = await page.evaluate(v1 => { const snap = JSON.stringify(v1); loadLabelRecord(v1); forceGoToStep(5); const c = document.getElementById('verify-checkbox'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      return { untouched: JSON.stringify(v1) === snap, step: approvedBuilderStep, text: buildSVG(false).replace(/<tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') }; }, v1);
    assert(v1r.untouched, 'opening a v1 label must not modify the record');
    assert(v1r.text.includes(FIXED['P305+P351+P338']) && !/Avoid breathing|Dispose of/.test(v1r.text), 'v1 label: corrected fixed wording, no generic fallback');
    const g6 = await gate();
    assert(!g6.allowed && !g6.png && g6.warn.includes('Complete the supplier wording for P261, P501'), `v1 label must be blocked at Step 5: ${JSON.stringify(g6)}`);
    await tryAllExports('v1 saved label', 'P261, P501');
    cards = await H.cards();
    assert.deepStrictEqual(cards.map(c => [c.code, c.incomplete]), [['P261', true], ['P501', true]], 'v1 label shows its incomplete statements in Step 3');
    stats.flows++;
    assert.deepStrictEqual(pageErrors, [], 'no page errors');
  } finally {
    await browser.close(); srv.close();
  }
  return stats;
}

(async () => {
  const n1 = partOne();
  const n2 = partTwo();
  const n3 = await partThree();
  const s4 = await partFour();
  console.log(`precautionary-statement wording checks passed: renderer -- 29 codes classified (19 fixed, 3 selection, 7 completion) with verified wording, ${n1} individual renders, no default/old wording, P280 unchanged, v1 records untouched; Smart Paste -- ${n2} extraction cases (3 real Nikura fixtures, contamination/ambiguity rejected); Composer -- ${n3} saved records (3 blocked naming the statement, 2 complete printed, records unaltered); Builder (real Chromium) -- ${s4.flows} flows, ${s4.refusals} export attempts refused with nothing downloaded`);
})().catch(err => { console.error(err); process.exit(1); });
