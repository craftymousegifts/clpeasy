// Regression tests for the structured failure-reason / misleading-error-
// message fix. Before this fix, EVERY reason a label could fail to
// render/download -- a confirmed code unsupported under the active
// regulatory profile (H316/H401/H402), any other unrecognised code, or
// genuine content that doesn't fit -- showed the SAME "FULL CONTENT DOES
// NOT FIT / Select a larger size in Step 1" message. That is actively
// wrong advice for the first two cases: no label size fixes a
// regulatory/code problem. This file proves:
//   1. renderLabel() now returns a structured blockReason (one of
//      'unsupported-gb-clp-code' | 'unrecognised-code' |
//      'content-does-not-fit' | null), never inferred merely from
//      fits:false, plus the exact affected code list (blockReasonCodes).
//   2. A confirmed-unsupported code (LabelRenderer.GB_UNSUPPORTED_CODES --
//      H316, H401, H402) blocks Smart Paste/Step 3 with the "not supported
//      supplier-confirmation message for a Great Britain CLP label, and fails closed
//      in the renderer with "LABEL DATA NEEDS REVIEW / Unsupported GB CLP
//      code: ..." -- never the sizing message.
//   3. Any other unrecognised code (e.g. a typo/malformed code, H999) gets
//      the SEPARATE, generic "CLP code not recognised" message instead,
//      and is never described as confirmed unsupported.
//   4. Genuine size overflow with every code recognised and GB-supported
//      still shows the ORIGINAL, byte-identical "FULL CONTENT DOES NOT
//      FIT / Select a larger size in Step 1" message -- completely
//      unaffected by this change.
//   5. Every bypass path (direct renderer feed, a simulated pre-existing
//      saved label, SVG/PNG export's own buildSVG(true) call, and the
//      Print Sheet Composer's thin LabelRenderer.renderLabel() wrapper)
//      fails closed the same way and can never print the blocked
//      statement's actual wording.
//   6. Builder preview (buildSVG(false)) and export (buildSVG(true))
//      report the same blockReason/blockReasonCodes for identical content.
//   7. Every valid, GB-supported neighbouring code (H315/H317/H400/H410-
//      H413), Snow Pixie, the manual H-chip picker, and H402's continued
//      absence from H_LIB are all completely undisturbed.
//
// This is a SEPARATE, independent test file from
// tests/h316-h401-gb-unsupported-removal.js (which proves H316/H401/H402
// are correctly EXCLUDED from H_LIB and treated as unrecognised) and
// tests/slash-p-code-normalisation.js (the unrelated P-code parsing fix)
// -- this file is specifically about the MESSAGE/REASON shown once a code
// is already known to be blocked -- kept as its own separate change and
// its own separate test file since the two concerns are independent.
//
// Run individually from the repo root: node tests/renderer-block-reason-messaging.js
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
    pSelected: [...window.eval('S.pSelected')],
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
// entirely -- proves the fail-closed protection and its message live in
// the renderer itself, not only in the Step-3 gate.
function renderDirect(hStatementsCsv, forExport){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = '80';
  document.getElementById('custom-h').value = '100';
  window.onDimInput();
  window.eval(`
    S.scentName='Test Scent'; S.productType='Candle'; S.bizName='Test Business';
    S.bizPhone='01234 567890'; S.signal='Warning';
    S.hSelected=${JSON.stringify(hStatementsCsv.split(',').map(s=>s.trim()))}; S.hStatements=${JSON.stringify(hStatementsCsv)};
    S.pSelected=['P501']; S.pStatements='P501';
    S.sensitisers=[]; S.pictograms=[];
  `);
  const svg = window.buildSVG(!!forExport);
  return {
    svg,
    unrecognizedCodes: [...window.eval('window._unrecognizedCodes')],
    blockReason: window.eval('window._blockReason'),
    blockReasonCodes: window.eval('window._blockReasonCodes') ? [...window.eval('window._blockReasonCodes')] : [],
  };
}

// Simulates re-opening a label saved before this fix existed -- a
// fabricated record, never routed through extractSDS() or Step 3.
function renderFromSimulatedSavedLabel(hStatementsCsv){
  const record = {
    id: 'legacy-test-id', scentName: 'Legacy Scent', productType: 'Candle',
    shape: 'rectangle', size: 'custom', customW: 80, customH: 100,
    signal: 'Warning', hStatements: hStatementsCsv, pStatements: 'P501',
    sensitisers: [], bizName: 'Test Business', bizPhone: '01234 567890'
  };
  window.loadLabelRecord(record);
  const svg = window.buildSVG(true);
  return { svg, unrecognizedCodes: [...window.eval('window._unrecognizedCodes')], blockReason: window.eval('window._blockReason') };
}

function flattenSvgText(svg){
  return svg.replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
function svgContainsWording(svg, wording){
  return flattenSvgText(svg).includes(wording);
}

async function run(){
  await new Promise(resolve => setTimeout(resolve, 300));
  const results = {};

  // ─────────────────────────────────────────────────────────────────────
  // 1. Structured blockReason -- never inferred merely from fits:false
  // ─────────────────────────────────────────────────────────────────────
  {
    const rFits = window.LabelRenderer.renderLabel(
      { shape:'circle', size:63.5, scentName:'Test Scent', productType:'Candle', bizName:'Test Biz', signal:'Warning', hStatements:'H315', pStatements:'', sensitisers:[], pictograms:['exclamation'] },
      { instanceId:'reason-baseline', pw:200, ph:200 }
    );
    assert.strictEqual(rFits.fits, true, 'baseline label should fit');
    assert.strictEqual(rFits.blockReason, null, 'a label that fits must report blockReason:null');
    assert.deepStrictEqual([...rFits.blockReasonCodes], [], 'a label that fits must report an empty blockReasonCodes list');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2a. Known unsupported codes -- H316, H401, H402 each individually
  // ─────────────────────────────────────────────────────────────────────
  results.unsupported = {};
  for(const code of ['H316','H401','H402']){
    const r = renderDirect(code, true);
    results.unsupported[code] = { blockReason:r.blockReason, blockReasonCodes:r.blockReasonCodes, svgHasNewOverlay: r.svg.includes('LABEL DATA NEEDS REVIEW') };
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', `${code} alone must report blockReason:'unsupported-gb-clp-code', got: ${r.blockReason}`);
    assert.deepStrictEqual(r.blockReasonCodes, [code], `${code} alone: blockReasonCodes must be exactly [${code}], got: ${JSON.stringify(r.blockReasonCodes)}`);
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW'), `${code}: renderer overlay must show "LABEL DATA NEEDS REVIEW"`);
    assert(flattenSvgText(r.svg).includes(code) && flattenSvgText(r.svg).includes('needs supplier confirmation for a Great Britain CLP label'), `${code}: renderer overlay must request supplier confirmation without presenting CLPeasy as the regulator`);
    const block=(r.svg.match(/<g class="clp-fit-block">[\s\S]*?<\/g>/)||[])[0]||'';
    const heading=block.match(/<text[^>]*y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*font-weight="800"[^>]*>LABEL DATA NEEDS REVIEW<\/text>/);
    const body=block.match(/<text[^>]*font-size="([\d.]+)"[^>]*><tspan[^>]*y="([\d.]+)"/);
    assert(heading&&body,`${code}: must expose measurable heading/body geometry`);
    const visibleGap=Number(body[2])-Number(body[1])-(Number(heading[2])*.2)-(Number(body[1])*.8);
    assert(visibleGap>=2,`${code}: heading and first explanation line need a visible gap; got ${visibleGap.toFixed(2)}px`);
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT') && !r.svg.includes('Select a larger size'), `${code}: must NOT show the misleading sizing overlay`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2b. Multiple unsupported codes together -- listed, no duplicates
  // ─────────────────────────────────────────────────────────────────────
  {
    const r = renderDirect('H316,H401', true);
    results.multiUnsupported = { blockReason:r.blockReason, blockReasonCodes:r.blockReasonCodes };
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', 'H316+H401 together must report blockReason:unsupported-gb-clp-code');
    assert.deepStrictEqual([...r.blockReasonCodes].sort(), ['H316','H401'], `H316+H401 together: blockReasonCodes must name both codes exactly once each, got: ${JSON.stringify(r.blockReasonCodes)}`);
    assert(r.svg.includes('H316') && r.svg.includes('H401'), 'overlay must name both codes');
    const h316Count = (r.svg.match(/H316/g)||[]).length, h401Count = (r.svg.match(/H401/g)||[]).length;
    assert(h316Count<=2 && h401Count<=2, `overlay must not repeat a code more than once in its own text (heading+body could each show it at most once) -- got H316 x${h316Count}, H401 x${h401Count}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2c. Nag Champa (Smart Paste, slash-form P-codes) still blocks for H316
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
    results.nagChampa = { extracted:r, gate };
    assert(r.pSelected.includes('P302+P352') && r.pSelected.includes('P333+P313'), 'Nag Champa: P-codes must still canonicalise correctly before the block is evaluated');
    assert.strictEqual(gate.ok, false, 'Nag Champa: must be blocked');
    assert(gate.alert.startsWith('This code needs supplier confirmation for a Great Britain CLP label'), `Nag Champa: alert must use the neutral supplier-confirmation heading, got: ${JSON.stringify(gate.alert)}`);
    assert(/\bH316\b/.test(gate.alert), 'Nag Champa: alert must name H316');
    assert(!gate.alert.includes('P302') && !gate.alert.includes('P333'), 'Nag Champa: alert must not mention the (now-canonicalised, valid) P302/P333');
    assert(!/select a larger|full content|does not fit/i.test(gate.alert), 'Nag Champa: alert must never imply a size problem');
    assert(!/certifi|compliant|complies/i.test(gate.alert), 'Nag Champa: alert must never claim CLPeasy certifies compliance');
    assert(gate.alert.includes('Great Britain'), 'Nag Champa: alert must explicitly name Great Britain as the target market, not just "GB" or "UK"');
    assert(!/non-uk|not uk/i.test(gate.alert), 'Nag Champa: alert must never describe the SDS/fragrance as "non-UK"');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2d. Positivity blocks for H402 only -- P302/P333 must not reappear
  // ─────────────────────────────────────────────────────────────────────
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
P280, Wear protective gloves/eye protection/face protection.
P302/352, IF ON SKIN: Wash with plenty of soap and water.
P333/313, If skin irritation or rash occurs: Get medical advice/attention.
P363, Wash contaminated clothing before reuse.
P501, Dispose of contents/container to approved disposal site, in accordance with local
regulations.`;
  {
    const r = pasteAndExtract(POSITIVITY_TEXT);
    const gate = runStep3Gate();
    results.positivity = { extracted:r, gate };
    assert(r.pSelected.includes('P302+P352') && r.pSelected.includes('P333+P313'), 'Positivity: P-code canonicalisation unaffected');
    assert.strictEqual(gate.ok, false, 'Positivity: must be blocked, by H402');
    assert(/\bH402\b/.test(gate.alert) && !/\bH316\b/.test(gate.alert) && !/\bH401\b/.test(gate.alert), `Positivity: alert must cite only H402, got: ${JSON.stringify(gate.alert)}`);
    assert(!gate.alert.includes('P302') && !gate.alert.includes('P333'), 'Positivity: alert must not mention P302/P333');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2e. None of H316/H401/H402 ever reaches printable label wording
  // ─────────────────────────────────────────────────────────────────────
  {
    const wordings = { H316:'Causes mild skin irritation', H401:'Toxic to aquatic life', H402:'Harmful to aquatic life' };
    for(const [code, wording] of Object.entries(wordings)){
      const r = renderDirect(code, true);
      assert(!svgContainsWording(r.svg, wording), `${code}'s statement wording must never reach the rendered SVG, got a match for "${wording}"`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Generic unknown code -- H999 -- separate generic message
  // ─────────────────────────────────────────────────────────────────────
  {
    const H999_TEXT = `2.2 Label elements
Signal word: Warning
Hazard statements: H315, Causes skin irritation.
H999, Not a real code.
Precautionary statements:
P273, Avoid release to the environment.
P501, Dispose of contents and container in accordance with local regulations.`;
    const r = pasteAndExtract(H999_TEXT);
    const gate = runStep3Gate();
    results.h999 = { extracted:r, gate };
    assert(r.hSelected.includes('H999'), 'H999 fixture: H999 must be matched by extraction (regex is independent of H_LIB)');
    assert.strictEqual(gate.ok, false, 'H999 fixture: must be blocked');
    assert(gate.alert.startsWith('CLP code not recognised'), `H999 fixture: alert must use the generic heading, got: ${JSON.stringify(gate.alert)}`);
    assert(/\bH999\b/.test(gate.alert), 'H999 fixture: alert must name H999');
    assert(!gate.alert.includes('needs supplier confirmation for a Great Britain CLP label') && !gate.alert.includes('another national or international classification system'), 'H999 fixture: must NOT use the confirmed-unsupported wording -- H999 is not a verified unsupported code');
    assert(!/select a larger|full content|does not fit/i.test(gate.alert), 'H999 fixture: alert must never imply a size problem');

    // Renderer-level (bypassing Step 3): same generic distinction.
    const rDirect = renderDirect('H999', true);
    assert.strictEqual(rDirect.blockReason, 'unrecognised-code', `H999 fed directly to the renderer must report blockReason:'unrecognised-code', got: ${rDirect.blockReason}`);
    assert(rDirect.svg.includes('LABEL DATA NEEDS REVIEW') && flattenSvgText(rDirect.svg).includes('H999') && flattenSvgText(rDirect.svg).includes('not recognised by CLPeasy'), 'H999: renderer overlay must show "LABEL DATA NEEDS REVIEW" and say H999 was not recognised by CLPeasy');
    assert(!flattenSvgText(rDirect.svg).includes('needs supplier confirmation for a Great Britain CLP label'), 'H999: renderer overlay must NOT use the confirmed-unsupported supplier-confirmation message');
    assert(!rDirect.svg.includes('FULL CONTENT DOES NOT FIT') && !rDirect.svg.includes('Select a larger size'), 'H999: must not show the misleading sizing overlay');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Genuine size overflow -- byte-identical to the pre-existing message
  // ─────────────────────────────────────────────────────────────────────
  // Reuses the proven "Extreme Stress Test" fixture from
  // tests/label-render-fit-contract.js (7 H-codes/6 sensitisers/14
  // P-statements at 52x52mm custom, pw:147,ph:147) -- every code in it is
  // a valid, GB-supported H_LIB entry, so this isolates genuine content
  // overflow with zero unrecognised/unsupported codes involved.
  {
    const overflowLabel = {
      shape: 'circle', size: 'custom', customW: 52, customH: 52,
      scentName: 'Extreme Stress Test Scent Name That Is Quite Long Indeed',
      productType: 'Candle', bizName: 'Extreme Stress Business Name Ltd',
      bizAddress: '1 Long Address Road, Some Town, County, Postcode', bizPhone: '01234 567890',
      bizWebsite: 'www.extremestresstestbusiness.co.uk',
      netWeight: '220g', batchNum: 'B009-EXTREME', burnTime: '45 hrs approx',
      signal: 'Danger', hStatements: 'H319, H317, H411, H412, H315, H336',
      pStatements: 'P101, P102, P103, P210, P233, P260, P261, P271, P273, P302+P352, P305+P351+P338, P312, P501, P211',
      sensitisers: ['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
      pictograms: ['exclamation','flame','aquatic'], textColour: 'dark', showBorder: true,
    };
    const r = window.LabelRenderer.renderLabel(overflowLabel, { instanceId:'reason-overflow', pw:147, ph:147 });
    results.genuineOverflow = { fits:r.fits, blockReason:r.blockReason, blockReasonCodes:[...r.blockReasonCodes] };
    assert.strictEqual(r.fits, false, 'the extreme-stress fixture must still overflow (unchanged from the pre-existing fit contract)');
    assert.strictEqual(r.blockReason, 'content-does-not-fit', `a genuine overflow with zero unrecognised codes must report blockReason:'content-does-not-fit', got: ${r.blockReason}`);
    assert.deepStrictEqual([...r.blockReasonCodes], [], 'content-does-not-fit must carry an empty blockReasonCodes list');
    assert(r.svg.includes('FULL CONTENT DOES NOT FIT'), 'genuine overflow must still show the ORIGINAL "FULL CONTENT DOES NOT FIT" message, byte-identical to before this fix');
    assert(r.svg.includes('Select a larger size in Step 1'), 'genuine overflow must still show the ORIGINAL "Select a larger size in Step 1" message');
    assert(!r.svg.includes('LABEL DATA NEEDS REVIEW') && !r.svg.includes('GB market') && !r.svg.includes('GB CLP code'), 'genuine overflow must NOT show the SDS/jurisdiction-code message');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Bypass protection
  // ─────────────────────────────────────────────────────────────────────
  results.bypass = {};
  // 5a. Direct renderer input (already exercised above for 2a/3, repeated
  // here explicitly against the bypass requirement).
  {
    const r = renderDirect('H316', true);
    results.bypass.directRenderer = { blockReason:r.blockReason };
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', 'direct renderer input containing H316 must fail closed with reason unsupported-gb-clp-code');
  }
  // 5b. Simulated loaded/saved label.
  {
    const r = renderFromSimulatedSavedLabel('H401');
    results.bypass.simulatedSavedLabel = { blockReason:r.blockReason };
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', 'a simulated saved label containing H401 must fail closed with reason unsupported-gb-clp-code on reopen');
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW'), 'simulated saved label: renderer overlay must show the new message on reopen');
  }
  // 5c. SVG/PNG/PDF export path -- downloadSVG()/downloadPNG() both build
  // their output via buildSVG(true), already proven blocked/clean above
  // (renderDirect's second argument is forExport=true); confirm explicitly
  // that export mode produces the identical reason/overlay as preview mode.
  {
    const rPreview = renderDirect('H316', false);
    const rExport = renderDirect('H316', true);
    results.bypass.previewVsExport = { previewReason:rPreview.blockReason, exportReason:rExport.blockReason };
    assert.strictEqual(rPreview.blockReason, rExport.blockReason, 'Builder preview and export must report the same blockReason for identical content');
    assert.deepStrictEqual(rPreview.blockReasonCodes, rExport.blockReasonCodes, 'Builder preview and export must report the same blockReasonCodes for identical content');
    assert(rExport.svg.includes('LABEL DATA NEEDS REVIEW'), 'export-mode SVG must carry the same fail-closed overlay as preview');
    assert(!svgContainsWording(rExport.svg, 'Causes mild skin irritation'), 'export-mode SVG must never print H316\'s wording');
  }
  // 5d. Print Sheet Composer's own renderSheetPosition() is a thin
  // pass-through to LabelRenderer.renderLabel() (see print.html) -- proven
  // directly against the shared renderer with the exact same call shape
  // (pw/ph explicit pixel sizing, watermark:false) that function uses.
  {
    const composerLabel = {
      shape:'rectangle', size:'custom', customW:80, customH:100,
      scentName:'Composer Test', productType:'Candle', bizName:'Test Business',
      bizPhone:'01234 567890', signal:'Warning', hStatements:'H402', pStatements:'P501',
      sensitisers:[], pictograms:[],
    };
    const r = window.LabelRenderer.renderLabel(composerLabel, { instanceId:'composer-sim', pw:150, ph:190, watermark:false });
    results.bypass.printSheetComposerSim = { blockReason:r.blockReason, svgHasNewOverlay:r.svg.includes('LABEL DATA NEEDS REVIEW') };
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', 'Print Sheet Composer\'s renderLabel() call must also fail closed with reason unsupported-gb-clp-code for H402');
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW') && r.svg.includes('H402'), 'Print Sheet Composer sheet cell must show the new fail-closed overlay, not the old sizing message');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT'), 'Print Sheet Composer sheet cell must not show the misleading sizing overlay for H402');
    assert(!svgContainsWording(r.svg, 'Harmful to aquatic life'), 'Print Sheet Composer sheet cell must never print H402\'s statement wording');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. Valid controls -- everything else completely undisturbed
  // ─────────────────────────────────────────────────────────────────────
  results.validControls = {};
  const STILL_VALID = {
    H315: 'Causes skin irritation', H317: 'May cause an allergic skin reaction',
    H400: 'Very toxic to aquatic life', H410: 'Very toxic to aquatic life with long lasting effects',
    H411: 'Toxic to aquatic life with long lasting effects', H412: 'Harmful to aquatic life with long lasting effects',
    H413: 'May cause long lasting harmful effects to aquatic life',
  };
  for(const [code, wording] of Object.entries(STILL_VALID)){
    const r = renderDirect(code, true);
    results.validControls[code] = { blockReason:r.blockReason };
    assert.strictEqual(r.blockReason, null, `${code} alone must report blockReason:null (it is valid and GB-supported)`);
    assert(svgContainsWording(r.svg, wording), `${code}'s statement wording must render normally`);
    assert(!r.svg.includes('LABEL DATA NEEDS REVIEW') && !r.svg.includes('FULL CONTENT DOES NOT FIT'), `${code} alone must not trigger any fail-closed overlay`);
  }
  // Snow Pixie unchanged.
  {
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
Nikura Ltd, Unit 6, Tariff Road, London, N17 0EB`;
    const r = pasteAndExtract(SNOW_PIXIE_TEXT);
    const gate = runStep3Gate();
    results.validControls.snowPixie = { extracted:r, gate };
    assert.strictEqual(gate.ok, true, 'Snow Pixie must remain unblocked');
    assert.strictEqual(gate.alert, undefined, 'Snow Pixie must not trigger any blocking alert');
  }
  // Manual H-chip picker: H316/H401/H402 still excluded.
  {
    const chipCodes = [...document.querySelectorAll('#h-chips .h-chip')].map(el => el.dataset.code);
    results.validControls.chipCodes_excludes = chipCodes.filter(c=>['H316','H401','H402'].includes(c));
    assert(!chipCodes.includes('H316') && !chipCodes.includes('H401'), 'H316/H401 must remain absent from the manual H-chip picker');
  }
  // H402 remains absent from H_LIB itself.
  {
    const hasH402 = window.eval("H_LIB.some(x=>x.code==='H402')");
    results.validControls.h402InHLib = hasH402;
    assert.strictEqual(hasH402, false, 'H402 must remain absent from H_LIB (it was never added, and this change must not add it)');
  }
  // GB_UNSUPPORTED_CODES itself: exactly H316/H401/H402, H282/H283/H284 excluded.
  {
    const codes = [...window.eval('LabelRenderer.GB_UNSUPPORTED_CODES')];
    results.validControls.gbUnsupportedCodes = codes;
    assert.deepStrictEqual([...codes].sort(), ['H316','H401','H402'], `GB_UNSUPPORTED_CODES must be exactly H316/H401/H402, got: ${JSON.stringify(codes)}`);
    assert(!codes.includes('H282') && !codes.includes('H283') && !codes.includes('H284'), 'GB_UNSUPPORTED_CODES must NOT include H282/H283/H284 (still an open, unconfirmed investigation)');
  }

  const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
  assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);

  window.close();
  return results;
}

run().then(results => {
  console.log('renderer-block-reason-messaging checks passed');
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
