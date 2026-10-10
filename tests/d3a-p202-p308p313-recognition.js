// Focused regression tests for D3a: recognition of P202 and P308+P313.
//
// Before D3a, neither code was in P_LIB (builder.html or label-render.js),
// so a supplier SDS carrying either one was flagged as an unrecognised code
// and blocked at Step 3 / download. D3a adds one P_LIB entry for each code
// to BOTH libraries. Nothing else changes: extraction, _pExclude, P280,
// unknown-code blocking and every existing P_LIB entry are untouched.
//
// Wording is PROVISIONAL (GB CLP Annex IV text as previously identified,
// pending final verification against the current GB source) -- see
// docs/reports/D3A-P202-P308P313-2026-10-10.md. If the wording changes,
// update EXPECTED below and both P_LIB copies together.
//
// Proves:
//   1. Both codes are in both P_LIBs with byte-identical wording, and the
//      two P_LIB copies are identical in full (no drift, nothing dropped).
//   2. Smart Paste extracts both codes (plain, "+", spaced "+" and "/"
//      forms) and the real Step 3 gate no longer blocks them.
//   3. The shared renderer prints the expected wording, reports no
//      unrecognised codes, and still joins adjacent "P308","P313" into
//      the combined statement.
//   4. Existing safety checks still hold: unknown P-codes and an orphan
//      "P308" are still blocked; P280/_pExclude behaviour is unchanged.
//
// Run from the repo root: node tests/d3a-p202-p308p313-recognition.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom'); const __sdsAns = require('./helpers/sds-doc-answer').installed;

const EXPECTED = {
  'P202': 'Do not handle until all safety precautions have been read and understood',
  'P308+P313': 'IF exposed or concerned: Get medical advice/attention'
};

const builderSource = fs.readFileSync('builder.html', 'utf8');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');

function flattenSvgText(svg){
  return svg.replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function buildDom(){
  const source = builderSource.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
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
      window.eval(labelRendererSource); window.eval(fs.readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
      window.eval(labelLibrarySource); window.eval(fs.readFileSync(require('path').join(__dirname,'..','entitlement.js'),'utf8'));
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
  __sdsAns(dom);
  return { dom, errors };
}

function pasteAndExtract(window, document, text){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = '80';
  document.getElementById('custom-h').value = '100';
  window.onDimInput();
  window.setApprovedBuilderStep(3);
  document.getElementById('product-type').value = 'Scented Candle';
  document.getElementById('smart-paste-input').value = text;
  window.extractSDS();
  return { pSelected: [...window.eval('S.pSelected')], hSelected: [...window.eval('S.hSelected')] };
}

function runStep3Gate(window, document){
  document.getElementById('scent-name').value = 'Test Scent';
  document.getElementById('product-type').value = 'Scented Candle';
  document.getElementById('biz-name').value = 'Test Business';
  document.getElementById('biz-phone').value = '01234 567890';
  document.getElementById('hazard-confirm').checked = true;
  window.__lastAlert = undefined;
  const ok = window.canLeaveApprovedBuilderStep(3);
  return { ok, alert: window.__lastAlert };
}

function render(window, pStatements){
  return window.LabelRenderer.renderLabel(
    { shape:'rectangle', size:'custom', customW:80, customH:100, scentName:'Test', productType:'Candle', bizName:'Biz', bizPhone:'01234567890', signal:'Warning', hStatements:'H317', pStatements, sensitisers:[], pictograms:['exclamation'] },
    { instanceId:'d3a-'+pStatements.replace(/\W/g,''), pw:200, ph:250 }
  );
}

// All unrecognised codes the renderer reports (generic + GB-unsupported).
function unrecognised(r){
  return [...(r.unsupportedCodes || []), ...(r.unrecognizedCodesGeneric || [])];
}

async function run(){
  const results = {};

  // ── 1. Library entries + drift check ───────────────────────────────
  const builderPLibSrc = (builderSource.match(/const P_LIB=\[.*?\];/s) || [])[0];
  assert(builderPLibSrc, 'could not locate builder.html\'s inline P_LIB declaration');
  const builderPLib = [...builderPLibSrc.matchAll(/\{code:'([^']+)',desc:'([^']*)'\}/g)].map(m => ({ code:m[1], desc:m[2] }));

  const { dom, errors } = buildDom();
  const { window } = dom;
  const document = window.document;
  await new Promise(resolve => setTimeout(resolve, 300));
  const rendererPLib = [...window.LabelRenderer.P_LIB].map(p => ({ code:p.code, desc:p.desc }));

  for(const [code, desc] of Object.entries(EXPECTED)){
    const b = builderPLib.filter(p => p.code === code);
    const r = rendererPLib.filter(p => p.code === code);
    assert.strictEqual(b.length, 1, `builder.html P_LIB must contain exactly one ${code} entry`);
    assert.strictEqual(r.length, 1, `label-render.js P_LIB must contain exactly one ${code} entry`);
    assert.strictEqual(b[0].desc, desc, `builder.html ${code} wording mismatch`);
    assert.strictEqual(r[0].desc, desc, `label-render.js ${code} wording mismatch`);
  }
  assert.deepStrictEqual(builderPLib, rendererPLib, 'builder.html and label-render.js P_LIB copies must be identical (code, wording and order)');
  const codes = rendererPLib.map(p => p.code);
  assert.strictEqual(new Set(codes).size, codes.length, 'P_LIB must not contain duplicate codes');
  // Pre-existing entries this change must not alter (sample incl. neighbours).
  for(const [code, desc] of [
    ['P103','Read label before use'], ['P210','Keep away from heat and ignition sources. No smoking'],
    ['P305+P351+P338','IF IN EYES: rinse cautiously with water for several minutes'], ['P312','Call a POISON CENTRE or doctor if you feel unwell'],
    ['P313','Get medical advice/attention'], ['P332+P313','If skin irritation occurs: get medical advice/attention'],
    ['P501','Dispose of contents and container in accordance with local regulations']
  ]){
    assert.strictEqual((rendererPLib.find(p => p.code === code) || {}).desc, desc, `pre-existing ${code} entry must be unchanged`);
  }
  results.pLibCount = rendererPLib.length;

  // Builder P chip grid shows the new codes.
  const chipCodes = [...document.querySelectorAll('#p-chips .h-chip')].map(c => c.dataset.code);
  assert(chipCodes.includes('P202') && chipCodes.includes('P308+P313'), 'P chip grid must show P202 and P308+P313');

  // ── 2. Smart Paste extraction + Step 3 gate ────────────────────────
  const base = 'Signal word: Warning\nHazard statements: H317 May cause an allergic skin reaction.\nPrecautionary statements: ';
  const pasteCases = [
    { label:'P202 plain', p:'P202 Do not handle until all safety precautions have been read and understood. P501 Dispose of contents.', expect:['P202','P501'] },
    { label:'P308+P313', p:'P308+P313 IF exposed or concerned: Get medical advice/attention. P501 Dispose of contents.', expect:['P308+P313','P501'] },
    { label:'P308 + P313 (spaced)', p:'P308 + P313 IF exposed or concerned: Get medical advice/attention. P501 Dispose of contents.', expect:['P308+P313','P501'] },
    { label:'P308/313 (slash)', p:'P308/313 IF exposed or concerned: Get medical advice/attention. P501 Dispose of contents.', expect:['P308+P313','P501'] },
    { label:'both together', p:'P202, P261, P308+P313, P501.', expect:['P202','P261','P308+P313','P501'] }
  ];
  results.paste = [];
  for(const c of pasteCases){
    const r = pasteAndExtract(window, document, base + c.p);
    assert.deepStrictEqual([...r.pSelected].sort(), [...c.expect].sort(), `${c.label}: extraction`);
    const gate = runStep3Gate(window, document);
    assert.strictEqual(gate.ok, true, `${c.label}: Step 3 must not block, alert: ${JSON.stringify(gate.alert)}`);
    results.paste.push({ label:c.label, pSelected:r.pSelected, step3Ok:gate.ok });
  }

  // ── 3. Shared renderer wording ─────────────────────────────────────
  {
    const r = render(window, 'P202,P308+P313,P501');
    const flat = flattenSvgText(r.svg);
    assert.deepStrictEqual(unrecognised(r), [], 'renderer must report no unrecognised codes');
    for(const desc of Object.values(EXPECTED)) assert(flat.includes(desc), `rendered label must contain "${desc}"`);
    assert(!/\bP202\b|\bP308\b/.test(flat), 'raw codes must not be printed on the label');
    assert.strictEqual(r.fits, true, `label with P202 + P308+P313 must render without a block, got ${r.blockReason}`);
    results.render = { fits:r.fits, blockReason:r.blockReason, unrecognizedCodes:unrecognised(r) };
  }
  {
    // Adjacent separate codes still combine via the existing normaliser.
    const r = render(window, 'P308,P313');
    assert.deepStrictEqual(unrecognised(r), [], 'adjacent P308,P313 must combine to P308+P313');
    assert(flattenSvgText(r.svg).includes(EXPECTED['P308+P313']), 'combined P308+P313 wording must render');
  }

  // ── 4. Existing safety checks unchanged ────────────────────────────
  {
    const r = pasteAndExtract(window, document, base + 'P202, P999, P501.');
    const gate = runStep3Gate(window, document);
    assert.strictEqual(gate.ok, false, 'unknown P999 must still block Step 3');
    assert(/P999/.test(gate.alert || ''), 'block alert must name P999');
    assert(!/P202/.test(gate.alert || ''), 'block alert must not name the now-recognised P202');
  }
  {
    // An orphan P308 (no partner) is not a recognised statement on its own.
    const rr = render(window, 'P308,P501');
    assert.deepStrictEqual(unrecognised(rr), ['P308'], 'orphan P308 must still be unrecognised');
    assert.strictEqual(rr.fits, false, 'orphan P308 must still block the render');
    assert.strictEqual(rr.blockReason, 'unrecognised-code', `orphan P308 block reason, got ${rr.blockReason}`);
  }
  {
    const r = pasteAndExtract(window, document, base + 'P202, P280 Wear protective gloves. P308+P313, P362+P364, P501.');
    assert.deepStrictEqual([...r.pSelected].sort(), ['P202','P308+P313','P501'], '_pExclude (P280, P362+P364) must be unchanged');
  }

  const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
  assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);
  window.close();
  return results;
}

run().then(results => {
  console.log('d3a-p202-p308p313-recognition checks passed');
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
