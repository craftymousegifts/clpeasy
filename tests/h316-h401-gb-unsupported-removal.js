// Regression tests for the H316/H401 GB-CLP-unsupported-code safety fix:
// H316 ("Causes mild skin irritation", UN GHS Skin Irritation Category 3)
// and H401 ("Toxic to
// aquatic life", UN GHS Acute Aquatic Toxicity Category 2) have been
// removed from H_LIB in both builder.html and label-render.js, because
// neither is an adopted GB/EU CLP hazard statement (confirmed against the
// GB-retained Regulation (EC) 1272/2008, Annex I -- skin
// corrosion/irritation has only Category 1/corrosion and Category
// 2/H315; acute aquatic toxicity has only Category 1/H400). Before this
// fix, both codes were silently RECOGNISED (present in H_LIB), selectable
// via the manual H-chip picker, and able to reach the printed label
// undetected. This file proves the removal is complete across every code
// path: Smart Paste, manual selection, fail-closed rendering (including a
// simulated pre-existing saved label bypassing Step 3 entirely), and that
// no unrelated, still-valid H-code was disturbed.
//
// This is a SEPARATE, independent change from the slash-form P-code
// canonicalisation fix (tests/slash-p-code-normalisation.js) -- kept in
// its own test file since the two changes are unrelated, though both now
// coexist in the same working tree and tests/slash-p-code-normalisation.js's own
// Nag Champa fixture has been updated to reflect the combined behaviour.
//
// Run individually from the repo root: node tests/h316-h401-gb-unsupported-removal.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

const dom = new JSDOM(source, {
  url: 'https://local.clpeasy.test/builder.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(labelRendererSource);
    window.eval(labelLibrarySource);
    window.alert = message => { window.__lastAlert = String(message); };
    window.confirm = () => true;
    window.scrollTo = () => {};
    window.fetch = async () => ({ ok:true, json:async()=>({}) });
    window.open = () => ({ location:{ href:'' }, close(){}, opener:null });
    window.URL.createObjectURL = () => 'blob:test';
    window.URL.revokeObjectURL = () => {};
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data:{ session:null } }),
        onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
        signOut: async () => ({})
      },
      from: () => Object.create(emptyQuery),
      rpc: async () => ({ data:false, error:null })
    }) };
  }
});

const { window } = dom;
const document = window.document;

function pasteAndExtract(text){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = '80';
  document.getElementById('custom-h').value = '100';
  window.onDimInput();
  window.setApprovedBuilderStep(3);
  document.getElementById('smart-paste-input').value = text;
  window.extractSDS();
  return {
    pStatements: window.eval('S.pStatements'),
    pSelected: [...window.eval('S.pSelected')],
    hStatements: window.eval('S.hStatements'),
    hSelected: [...window.eval('S.hSelected')]
  };
}

function runStep3Gate(){
  document.getElementById('scent-name').value = 'Test Scent';
  document.getElementById('product-type').value = 'Candle';
  document.getElementById('biz-name').value = 'Test Business';
  document.getElementById('biz-phone').value = '01234 567890';
  document.getElementById('hazard-confirm').checked = true;
  window.__lastAlert = undefined;
  const ok = window.canLeaveApprovedBuilderStep(3);
  return { ok, alert: window.__lastAlert };
}

// Directly sets Builder state and renders, bypassing extractSDS()/Step 3
// entirely -- proves the fail-closed protection lives in the renderer
// itself, not only in the Step-3 gate.
function renderDirect(hCode){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = '80';
  document.getElementById('custom-h').value = '100';
  window.onDimInput();
  window.eval(`
    S.scentName='Test Scent'; S.productType='Candle'; S.bizName='Test Business';
    S.bizPhone='01234 567890'; S.signal='Warning';
    S.hSelected=['${hCode}']; S.hStatements='${hCode}';
    S.pSelected=['P501']; S.pStatements='P501';
    S.sensitisers=[]; S.pictograms=[];
  `);
  const svg = window.buildSVG(true);
  return { svg, unrecognizedCodes: [...window.eval('window._unrecognizedCodes')] };
}

// Simulates re-opening a label that was saved BEFORE this fix existed --
// a fabricated record, not routed through extractSDS() or Step 3 at all.
function renderFromSimulatedSavedLabel(hCode){
  const record = {
    id: 'legacy-test-id', scentName: 'Legacy Scent', productType: 'Candle',
    shape: 'rectangle', size: 'custom', customW: 80, customH: 100,
    signal: 'Warning', hStatements: hCode, pStatements: 'P501',
    sensitisers: [], bizName: 'Test Business', bizPhone: '01234 567890'
  };
  window.loadLabelRecord(record);
  const svg = window.buildSVG(true);
  return { svg, unrecognizedCodes: [...window.eval('window._unrecognizedCodes')] };
}

// SVG text-wrapping can legitimately split a hazard statement across two
// <tspan> lines at a space (no bug -- see label-render.js's wrapText()),
// which breaks a naive contiguous-substring search. Flattening tag
// boundaries to whitespace checks the actual rendered TEXT CONTENT,
// independent of exactly where the renderer chose to wrap it (same
// technique used in tests/euh208-bounded-substance-extraction.js).
function flattenSvgText(svg){
  return svg.replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
function svgContainsWording(svg, wording){
  return flattenSvgText(svg).includes(wording);
}

const H316_WORDING = 'Causes mild skin irritation';
const H401_WORDING = 'Toxic to aquatic life';
// Note: H401's exact wording ("Toxic to aquatic life") is a substring of
// H400/H410/H411's wording ("...toxic to aquatic life...") -- every check
// against H401_WORDING below renders H401 ALONE (nothing else present that
// could coincidentally contain this substring), so a match is unambiguous.

async function run(){
  await new Promise(resolve => setTimeout(resolve, 300));
  const results = { smartPaste:{}, manualInterface:{}, failClosedRendering:{}, unchangedValidCodes:{}, unchangedFixtures:{} };

  // ─────────────────────────────────────────────────────────────────────
  // A. Smart Paste
  // ─────────────────────────────────────────────────────────────────────
  const NAG_CHAMPA_TEXT = `2.2 Label elements
Classification under Regulation (EC) No 1272/2008
Signal word: Warning
Hazard statements: H317, May cause an allergic skin reaction.
H412, Harmful to aquatic life with long lasting effects.
H316, Causes mild skin irritation.
Nikura Ltd, Unit 6, Tariff Road, London, N17 0EB
EUH208, Contains Amyl cinnamic aldehyde, Citronellol, Coumarin, Linalyl acetate, d-Limonene.
May produce an allergic reaction.
Supplemental
Information:
Precautionary
statements:
P261, Avoid breathing vapour or dust.
P272, Contaminated work clothing should not be allowed out of the workplace.
P273, Avoid release to the environment.
P280, Wear protective gloves/eye protection/face protection.
P302/352, IF ON SKIN: Wash with plenty of soap and water.
P333/313, If skin irritation or rash occurs: Get medical advice/attention.
P363, Wash contaminated clothing before reuse.
P501, Dispose of contents/container to approved disposal site, in accordance with local
regulations.`;

  {
    const r = pasteAndExtract(NAG_CHAMPA_TEXT);
    const gate = runStep3Gate();
    results.smartPaste.nagChampa = { extracted: r, gate };
    assert(r.pSelected.includes('P302+P352'), `Nag Champa: P302/352 must still canonicalise to P302+P352, got: ${JSON.stringify(r.pSelected)}`);
    assert(r.pSelected.includes('P333+P313'), `Nag Champa: P333/313 must still canonicalise to P333+P313, got: ${JSON.stringify(r.pSelected)}`);
    assert(!r.pSelected.includes('P302') && !r.pSelected.includes('P333'), 'Nag Champa: P-codes must not be orphaned');
    assert(r.hSelected.includes('H316'), 'Nag Champa: H316 must still be MATCHED by extraction (regex is independent of H_LIB)');
    assert.strictEqual(gate.ok, false, 'Nag Champa: must be BLOCKED, now specifically by H316');
    assert(gate.alert && /H316/.test(gate.alert), `Nag Champa: blocking alert must name H316, got: ${JSON.stringify(gate.alert)}`);
    assert(!(gate.alert||'').includes('P302') && !(gate.alert||'').includes('P333'), `Nag Champa: blocking alert must NOT contain orphaned P302/P333, got: ${JSON.stringify(gate.alert)}`);
  }

  const H401_FIXTURE_TEXT = `2.2 Label elements
Signal word: Warning
Hazard statements: H401, Toxic to aquatic life.
Precautionary statements:
P273, Avoid release to the environment.
P501, Dispose of contents and container in accordance with local regulations.`;

  {
    const r = pasteAndExtract(H401_FIXTURE_TEXT);
    const gate = runStep3Gate();
    results.smartPaste.h401Fixture = { extracted: r, gate };
    assert(r.hSelected.includes('H401'), 'H401 fixture: H401 must still be MATCHED by extraction');
    assert.strictEqual(gate.ok, false, 'H401 fixture: must be BLOCKED specifically by H401');
    assert(gate.alert && /H401/.test(gate.alert), `H401 fixture: blocking alert must name H401, got: ${JSON.stringify(gate.alert)}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // B. Manual interface -- chip availability
  // ─────────────────────────────────────────────────────────────────────
  {
    const chipCodes = [...document.querySelectorAll('#h-chips .h-chip')].map(el => el.dataset.code);
    results.manualInterface.chipCodes = chipCodes;
    assert(!chipCodes.includes('H316'), 'H316 must NOT appear as a selectable H-code chip');
    assert(!chipCodes.includes('H401'), 'H401 must NOT appear as a selectable H-code chip');
    ['H315','H317','H400','H410','H411','H412','H413'].forEach(code => {
      assert(chipCodes.includes(code), `${code} must remain available as a selectable H-code chip, got chip list: ${JSON.stringify(chipCodes)}`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // C. Fail-closed rendering -- direct renderer feed, bypassing Step 3
  // ─────────────────────────────────────────────────────────────────────
  // Invariant: a confirmed GB-unsupported code like H316/H401 must NOT show
  // the generic "FULL CONTENT DOES NOT FIT / Select a larger size" overlay --
  // no size fixes a regulatory code problem. It must show the specific
  // "LABEL DATA NEEDS REVIEW / Unsupported GB CLP code: <code>" overlay
  // instead, so the user isn't misdirected into resizing a label that a
  // resize can never fix. See tests/renderer-block-reason-messaging.js for
  // the dedicated regression suite covering this distinction in full.
  {
    const r = renderDirect('H316');
    results.failClosedRendering.h316Direct = { unrecognizedCodes: r.unrecognizedCodes, containsBlockOverlay: r.svg.includes('LABEL DATA NEEDS REVIEW'), containsWording: svgContainsWording(r.svg, H316_WORDING) };
    assert(r.unrecognizedCodes.includes('H316'), `H316 fed directly to the renderer must appear in unrecognizedCodes, got: ${JSON.stringify(r.unrecognizedCodes)}`);
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW') && r.svg.includes('Unsupported GB CLP code') && r.svg.includes('H316'), 'H316 fed directly to the renderer must produce the specific "LABEL DATA NEEDS REVIEW / Unsupported GB CLP code" overlay');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT') && !r.svg.includes('Select a larger size'), 'H316 must NOT show the misleading sizing overlay -- no size fixes a regulatory code problem');
    assert(!svgContainsWording(r.svg, H316_WORDING), `H316's statement wording ("${H316_WORDING}") must never appear in the rendered SVG`);
  }
  {
    const r = renderDirect('H401');
    results.failClosedRendering.h401Direct = { unrecognizedCodes: r.unrecognizedCodes, containsBlockOverlay: r.svg.includes('LABEL DATA NEEDS REVIEW'), containsWording: svgContainsWording(r.svg, H401_WORDING) };
    assert(r.unrecognizedCodes.includes('H401'), `H401 fed directly to the renderer must appear in unrecognizedCodes, got: ${JSON.stringify(r.unrecognizedCodes)}`);
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW') && r.svg.includes('Unsupported GB CLP code') && r.svg.includes('H401'), 'H401 fed directly to the renderer must produce the specific "LABEL DATA NEEDS REVIEW / Unsupported GB CLP code" overlay');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT') && !r.svg.includes('Select a larger size'), 'H401 must NOT show the misleading sizing overlay -- no size fixes a regulatory code problem');
    assert(!svgContainsWording(r.svg, H401_WORDING), `H401's statement wording ("${H401_WORDING}") must never appear in the rendered SVG`);
  }

  // Simulated pre-existing saved label (fabricated record, never routed
  // through extractSDS() or the Step-3 gate at all).
  {
    const r = renderFromSimulatedSavedLabel('H316');
    results.failClosedRendering.h316SimulatedSavedLabel = { unrecognizedCodes: r.unrecognizedCodes, containsBlockOverlay: r.svg.includes('LABEL DATA NEEDS REVIEW') };
    assert(r.unrecognizedCodes.includes('H316'), 'a simulated saved label containing H316 must be caught by the renderer\'s unrecognised-code check');
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW') && r.svg.includes('Unsupported GB CLP code') && r.svg.includes('H316'), 'a simulated saved label containing H316 must fail closed on reopen with the specific unsupported-code overlay');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT') && !r.svg.includes('Select a larger size'), 'a simulated saved label containing H316 must NOT show the misleading sizing overlay on reopen');
    assert(!svgContainsWording(r.svg, H316_WORDING), 'a simulated saved label containing H316 must never print its wording');
  }
  {
    const r = renderFromSimulatedSavedLabel('H401');
    results.failClosedRendering.h401SimulatedSavedLabel = { unrecognizedCodes: r.unrecognizedCodes, containsBlockOverlay: r.svg.includes('LABEL DATA NEEDS REVIEW') };
    assert(r.unrecognizedCodes.includes('H401'), 'a simulated saved label containing H401 must be caught by the renderer\'s unrecognised-code check');
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW') && r.svg.includes('Unsupported GB CLP code') && r.svg.includes('H401'), 'a simulated saved label containing H401 must fail closed on reopen with the specific unsupported-code overlay');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT') && !r.svg.includes('Select a larger size'), 'a simulated saved label containing H401 must NOT show the misleading sizing overlay on reopen');
    assert(!svgContainsWording(r.svg, H401_WORDING), 'a simulated saved label containing H401 must never print its wording');
  }

  // ─────────────────────────────────────────────────────────────────────
  // D. Unchanged valid behaviour -- neighbouring codes must still resolve
  // and render normally, completely undisturbed by the removal.
  // ─────────────────────────────────────────────────────────────────────
  const STILL_VALID = {
    H315: 'Causes skin irritation',
    H317: 'May cause an allergic skin reaction',
    H400: 'Very toxic to aquatic life',
    H410: 'Very toxic to aquatic life with long lasting effects',
    H411: 'Toxic to aquatic life with long lasting effects',
    H412: 'Harmful to aquatic life with long lasting effects',
    H413: 'May cause long lasting harmful effects to aquatic life'
  };
  for(const [code, wording] of Object.entries(STILL_VALID)){
    const r = renderDirect(code);
    results.unchangedValidCodes[code] = { unrecognizedCodes: r.unrecognizedCodes, containsWording: svgContainsWording(r.svg, wording) };
    assert(!r.unrecognizedCodes.includes(code), `${code} must NOT be flagged as unrecognised -- it remains a valid, untouched H_LIB entry`);
    assert(svgContainsWording(r.svg, wording), `${code}'s statement wording ("${wording}") must render normally, got SVG without it`);
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT'), `${code} alone must not trigger the fail-closed overlay`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // E. Snow Pixie and the valid portions of Positivity must be unchanged.
  // ─────────────────────────────────────────────────────────────────────
  const SNOW_PIXIE_TEXT = `2.2 Label elements
Classification under Regulation (EC) No 1272/2008
Signal word: None
Hazard statements: H412, Harmful to aquatic life with long lasting effects.
Supplemental
Information:
EUH208, Contains Dorysil, Heliotropex, d-Limonene. May produce an allergic reaction.
Precautionary
statements:
P273, Avoid release to the environment.
P501, Dispose of contents/container to approved disposal site, in accordance with local
regulations.
Nikura Ltd, Unit 6, Tariff Road, London, N17 0EB
Page 2 (8)
Issue date: 08/08/2025
Version: 1 (08/08/2025)
Pictograms: None`;
  {
    const r = pasteAndExtract(SNOW_PIXIE_TEXT);
    const gate = runStep3Gate();
    results.unchangedFixtures.snowPixie = { extracted: r, gate };
    assert.deepStrictEqual([...r.pSelected].sort(), ['P273','P501'], `Snow Pixie extraction must be unchanged, got: ${JSON.stringify(r.pSelected)}`);
    assert.deepStrictEqual([...r.hSelected].sort(), ['EUH208','H412'], `Snow Pixie extraction must be unchanged, got: ${JSON.stringify(r.hSelected)}`);
    assert.strictEqual(gate.ok, true, 'Snow Pixie must remain unblocked -- H412 is untouched and valid');
  }

  const POSITIVITY_TEXT = `2.2 Label elements
Classification under Regulation (EC) No 1272/2008
Signal word: Warning
Hazard statements: H317, May cause an allergic skin reaction.
H402, Harmful to aquatic life.
Supplemental
Information:
EUH208, Contains Caryophyllene, Citral, beta-Pinene. May produce an allergic reaction.
Precautionary
statements:
P261, Avoid breathing vapour or dust.
P272, Contaminated work clothing should not be allowed out of the workplace.
Nikura Ltd, Unit 6, Tariff Road, London, N17 0EB
Page 2 (9)
Issue date: 15/09/2025
Version: 1 (15/09/2025)
P280, Wear protective gloves/eye protection/face protection.
P302/352, IF ON SKIN: Wash with plenty of soap and water.
P333/313, If skin irritation or rash occurs: Get medical advice/attention.
P363, Wash contaminated clothing before reuse.
P501, Dispose of contents/container to approved disposal site, in accordance with local
regulations.`;
  {
    const r = pasteAndExtract(POSITIVITY_TEXT);
    const gate = runStep3Gate();
    results.unchangedFixtures.positivity = { extracted: r, gate };
    assert(r.pSelected.includes('P302+P352') && r.pSelected.includes('P333+P313'), 'Positivity: P-code canonicalisation must remain unchanged');
    assert(r.hSelected.includes('H317'), 'Positivity: H317 (unrelated, valid code) must remain unaffected');
    assert(r.hSelected.includes('H402'), 'Positivity: H402 must still be extracted as-is -- not this change\'s concern');
    assert.strictEqual(gate.ok, false, 'Positivity: must still be blocked, by H402 (pre-existing, unrelated to H316/H401)');
    assert(gate.alert && /H402/.test(gate.alert) && !/H316/.test(gate.alert) && !/H401\b/.test(gate.alert), `Positivity: blocking alert must cite only H402, got: ${JSON.stringify(gate.alert)}`);
  }

  const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
  assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);

  window.close();
  return results;
}

run().then(results => {
  console.log('h316-h401-gb-unsupported-removal checks passed');
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
