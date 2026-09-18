// Regression tests for the Great-Britain-wording correction and the
// mixed-code-handling bug fix (both approved as a single follow-up to the
// earlier structured-failure-reason change covered by
// tests/renderer-block-reason-messaging.js). This file proves:
//
//   1. The public unsupported-code message now reads "This code is not
//      supported under the selected Great Britain rules" (was: "This SDS
//      may not be intended for the GB market"), and its body: names every
//      affected code; states the code is not part of the current Great
//      Britain CLP hazard-statement system; says it may be recognised
//      under another national/international system; explains CLPeasy
//      currently supports products placed on the Great Britain market
//      (England, Scotland, Wales); advises obtaining the current Great
//      Britain-market SDS/classification information for the final
//      formulation and concentration; states CLPeasy has not added,
//      removed, translated or substituted the code. It never describes a
//      fragrance/SDS as "non-UK" and never claims CLPeasy certifies
//      compliance.
//   2. The generic "CLP code not recognised" message is unchanged in kind
//      and still never claims confirmed-non-GB status for an arbitrary
//      unknown code.
//   3. FIXED BUG: when the same input carries BOTH a confirmed
//      GB-unsupported code and a separate, otherwise-unrecognised code,
//      the visible message (Step-3 alert, download-blocking banner, and
//      the renderer's own fail-closed SVG overlay) reports BOTH groups --
//      the unsupported-code priority must never hide the generic-unknown
//      codes, or vice versa.
//   4. When a regulatory code issue coincides with genuine physical
//      overflow, both states are retained structurally (blockReason,
//      contentOverflow), but the visible message leads with the
//      regulatory issue and never advises picking a larger label while it
//      is unresolved.
//   5. Genuine overflow alone (every code recognised and GB-supported) is
//      completely unaffected -- the original message is byte-identical.
//   6. renderLabel() exposes structured fields sufficient to distinguish
//      the active regulatory profile, unsupported-under-profile codes,
//      otherwise-unrecognised codes, physical content overflow, and
//      overall blocked/fits status -- independently of each other, never
//      inferred from fits:false alone.
//   7. Production files (builder.html, label-render.js) carry no
//      customer names, support-case identifiers, or speculative
//      H282/H283/H284 discussion, and H282/H283/H284 themselves are
//      unchanged by this task.
//   8. GB_UNSUPPORTED_CODES/ACTIVE_REGULATORY_PROFILE remain scoped
//      explicitly to Great Britain -- never presented as a universal
//      "invalid code" list.
//
// Run individually from the repo root: node tests/gb-wording-and-mixed-code-correction.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const rawBuilderSource = fs.readFileSync('builder.html', 'utf8');
const rawLabelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const source = rawBuilderSource.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
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
    window.eval(rawLabelRendererSource);
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

function setupBuilderState(shape, customW, customH){
  window.selectShape(shape||'rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = String(customW||80);
  document.getElementById('custom-h').value = String(customH||100);
  window.onDimInput();
}

function pasteAndExtract(text){
  setupBuilderState();
  window.setApprovedBuilderStep(3);
  document.getElementById('smart-paste-input').value = text;
  window.extractSDS();
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

// Directly sets Builder state and renders/refreshes the download-blocking
// banner, bypassing extractSDS()/Step 3 entirely.
//
// IMPORTANT: updateLabel() calls readForm() first, which unconditionally
// re-reads S.hStatements, S.scentName, S.productType, S.bizName, S.bizPhone,
// S.bizAddress, S.bizWebsite, S.netWeight, S.burnTime, S.batchNum and
// S.fragLoad straight from their DOM <input> elements (see readForm() in
// builder.html) -- it does NOT trust whatever those S.* fields were set to
// beforehand. Setting S.* directly via eval for those fields is therefore a
// no-op the moment updateLabel() runs: readForm() immediately overwrites
// them from the (possibly stale, leftover-from-a-previous-test) DOM input
// values. To genuinely exercise a specific hazard-statement/business-detail
// combination through updateLabel(), those DOM inputs must be set directly,
// exactly as the real Builder UI does when a maker types into a field or
// Smart Paste populates the readonly h-statements/p-statements inputs.
// S.signal/S.sensitisers/S.pictograms are NOT read back from the DOM by
// readForm(), so those remain safe to set directly via eval.
function renderDirectAndUpdate(hStatementsCsv, opts, shapeOverride){
  opts = opts || {};
  if(shapeOverride) setupBuilderState(shapeOverride.shape, shapeOverride.customW, shapeOverride.customH);
  else setupBuilderState();
  const domFields = Object.assign({
    'scent-name': 'Test Scent', 'product-type': 'Candle',
    'biz-name': 'Test Business', 'biz-phone': '01234 567890',
    'h-statements': hStatementsCsv, 'p-statements': 'P501',
    'biz-address': '', 'biz-website': '', 'net-weight': '',
    'burn-time': '', 'batch-num': '', 'frag-load': '',
  }, opts.domFields || {});
  Object.entries(domFields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if(el) el.value = val;
  });
  window.eval(`
    S.signal='Warning';
    S.sensitisers=${JSON.stringify(opts.sensitisers || [])};
    S.pictograms=${JSON.stringify(opts.pictograms || [])};
  `);
  window.updateLabel();
  const stage4 = document.getElementById('label-warn-stage4');
  return {
    svg: window.buildSVG(true),
    bannerVisible: stage4.style.display === 'block',
    bannerHTML: stage4.innerHTML,
    blockReason: window.eval('window._blockReason'),
    unsupportedCodes: window.eval('window._unsupportedCodes') ? [...window.eval('window._unsupportedCodes')] : [],
    unrecognizedCodesGeneric: window.eval('window._unrecognizedCodesGeneric') ? [...window.eval('window._unrecognizedCodesGeneric')] : [],
    contentOverflow: window.eval('window._contentOverflow'),
  };
}

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

async function run(){
  await new Promise(resolve => setTimeout(resolve, 300));
  const results = {};

  // ─────────────────────────────────────────────────────────────────────
  // 1. Wording correction -- singular
  // ─────────────────────────────────────────────────────────────────────
  {
    const msg = window.eval("clpUnsupportedCodesMessage(['H316'])");
    results.unsupportedSingular = msg;
    assert.strictEqual(msg.heading, 'This code is not supported under the selected Great Britain rules', `singular heading wrong: ${JSON.stringify(msg.heading)}`);
    assert(msg.body.includes('H316'), 'singular body must identify the affected code');
    assert(/not part of the current Great Britain CLP hazard-statement system/.test(msg.body), 'singular body must state the code is not part of the current GB CLP system');
    assert(/may be recognised under another national or international classification system/.test(msg.body), 'singular body must say it may be recognised under another system');
    assert(/CLPeasy currently supports products placed on the market in Great Britain \(England, Scotland and Wales\)/.test(msg.body), 'singular body must explain CLPeasy\'s GB market scope');
    assert(msg.body.includes('Please ask your supplier for the current Great Britain-market SDS or classification information applicable to your final formulation and concentration.'), 'singular body must explicitly tell the user to ask their supplier for the current GB-market SDS/classification info for the final formulation and concentration');
    assert(/CLPeasy has not added, removed, translated or substituted this code/.test(msg.body), 'singular body must state CLPeasy has not added/removed/translated/substituted the code');
    assert(!/non-uk|not uk|not-uk/i.test(msg.heading+msg.body), 'must never describe the code/SDS as "non-UK"');
    assert(!/certifi|guarantee.*complian|complian.*guarantee/i.test(msg.heading+msg.body), 'must never claim CLPeasy certifies/guarantees compliance');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Wording correction -- plural
  // ─────────────────────────────────────────────────────────────────────
  {
    const msg = window.eval("clpUnsupportedCodesMessage(['H316','H401'])");
    results.unsupportedPlural = msg;
    assert.strictEqual(msg.heading, 'These codes are not supported under the selected Great Britain rules', `plural heading wrong: ${JSON.stringify(msg.heading)}`);
    assert(msg.body.includes('H316') && msg.body.includes('H401'), 'plural body must identify every affected code');
    assert(/are not part of the current Great Britain CLP hazard-statement system/.test(msg.body), 'plural body must use plural "are"');
    assert(/They may be recognised under another national or international classification system/.test(msg.body), 'plural body must use plural "They"');
    assert(/CLPeasy has not added, removed, translated or substituted these codes/.test(msg.body), 'plural body must use plural "these codes"');
    assert(msg.body.includes('Please ask your supplier for the current Great Britain-market SDS or classification information applicable to your final formulation and concentration.'), 'plural body must also explicitly tell the user to ask their supplier for the current GB-market SDS/classification info');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Generic unrecognised-code message unchanged in kind
  // ─────────────────────────────────────────────────────────────────────
  {
    const singular = window.eval("clpUnrecognisedCodesMessage(['H999'])");
    const plural = window.eval("clpUnrecognisedCodesMessage(['H999','H998'])");
    results.genericMessages = { singular, plural };
    assert.strictEqual(singular.heading, 'CLP code not recognised');
    assert(/did not recognise the following code: H999/.test(singular.body));
    assert(/check that the sds text was copied correctly/i.test(singular.body));
    assert(/current great britain-market sds or classification documentation/i.test(singular.body));
    assert.strictEqual(plural.heading, 'CLP code not recognised');
    assert(/did not recognise the following codes: H999, H998/.test(plural.body));
    assert(!/not supported under the selected great britain rules/i.test(singular.body+plural.body), 'generic message must never claim confirmed-unsupported status');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Mixed unsupported + generic -- Step 3 gate alert shows BOTH groups
  // ─────────────────────────────────────────────────────────────────────
  {
    const MIXED_TEXT = `2.2 Label elements
Signal word: Warning
Hazard statements: H315, Causes skin irritation.
H316, Causes mild skin irritation.
H999, Not a real code.
Precautionary statements:
P273, Avoid release to the environment.
P501, Dispose of contents and container in accordance with local regulations.`;
    pasteAndExtract(MIXED_TEXT);
    const gate = runStep3Gate();
    results.mixedGate = gate;
    assert.strictEqual(gate.ok, false, 'mixed input must be blocked');
    assert(/\bH316\b/.test(gate.alert), 'mixed alert must name H316 (unsupported group)');
    assert(/\bH999\b/.test(gate.alert), 'mixed alert must ALSO name H999 (generic-unrecognised group) -- must not be hidden by the unsupported-code priority');
    assert(gate.alert.includes('not supported under the selected Great Britain rules'), 'mixed alert must include the unsupported-code message');
    assert(gate.alert.includes('CLP code not recognised'), 'mixed alert must ALSO include the generic-unrecognised-code message');
    // Regulatory issue shown first.
    assert(gate.alert.indexOf('not supported under the selected Great Britain rules') < gate.alert.indexOf('CLP code not recognised'), 'the regulatory (unsupported-code) message must appear before the generic-unrecognised message');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Mixed unsupported + generic -- download-blocking banner shows BOTH
  // ─────────────────────────────────────────────────────────────────────
  {
    const r = renderDirectAndUpdate('H316,H999');
    results.mixedBanner = { bannerVisible:r.bannerVisible, bannerHTML:r.bannerHTML, unsupportedCodes:r.unsupportedCodes, unrecognizedCodesGeneric:r.unrecognizedCodesGeneric };
    assert.strictEqual(r.bannerVisible, true, 'mixed input must show the download-blocking banner');
    assert(r.bannerHTML.includes('H316') && r.bannerHTML.includes('H999'), 'download banner must name BOTH H316 and H999');
    assert(r.bannerHTML.includes('not supported under the selected Great Britain rules'), 'download banner must include the unsupported-code message');
    assert(r.bannerHTML.includes('CLP code not recognised'), 'download banner must ALSO include the generic-unrecognised message');
    assert.deepStrictEqual(r.unsupportedCodes, ['H316'], 'structured field unsupportedCodes must be exactly [H316]');
    assert.deepStrictEqual(r.unrecognizedCodesGeneric, ['H999'], 'structured field unrecognizedCodesGeneric must be exactly [H999]');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. Mixed unsupported + generic -- renderer SVG overlay shows BOTH
  // ─────────────────────────────────────────────────────────────────────
  {
    const r = renderDirectAndUpdate('H316,H999');
    results.mixedOverlay = { svgHasBoth: r.svg.includes('H316') && r.svg.includes('H999') };
    assert(r.svg.includes('LABEL DATA NEEDS REVIEW'), 'mixed overlay must show the review heading');
    assert(r.svg.includes('Unsupported GB CLP code: H316'), 'mixed overlay must name the unsupported group');
    assert(r.svg.includes('Unrecognised CLP code: H999'), 'mixed overlay must ALSO name the generic group');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT'), 'mixed overlay must not show the sizing message');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. Structured fields -- independent, never collapsed to one reason
  // ─────────────────────────────────────────────────────────────────────
  {
    const r = window.LabelRenderer.renderLabel(
      { shape:'rectangle', size:'custom', customW:80, customH:100, scentName:'Test', productType:'Candle', bizName:'Biz', bizPhone:'01234567890', signal:'Warning', hStatements:'H316,H999', pStatements:'P501', sensitisers:[], pictograms:[] },
      { instanceId:'structured-mixed', pw:200, ph:250 }
    );
    results.structuredMixed = { blockReason:r.blockReason, unsupportedCodes:r.unsupportedCodes, unrecognizedCodesGeneric:r.unrecognizedCodesGeneric, contentOverflow:r.contentOverflow, regulatoryProfile:r.regulatoryProfile, blocked:r.blocked, fits:r.fits };
    assert.strictEqual(r.regulatoryProfile, 'GB', 'regulatoryProfile must be GB');
    assert.deepStrictEqual([...r.unsupportedCodes], ['H316'], 'unsupportedCodes must list H316 in full regardless of blockReason priority');
    assert.deepStrictEqual([...r.unrecognizedCodesGeneric], ['H999'], 'unrecognizedCodesGeneric must list H999 in full regardless of blockReason priority');
    assert.strictEqual(r.contentOverflow, false, 'contentOverflow must be false -- this fixture has no genuine physical overflow');
    assert.strictEqual(r.blocked, true, 'blocked must be true (same as !fits)');
    assert.strictEqual(r.fits, false, 'fits must be false');
    // Same fields must also be present on metrics.
    assert.deepStrictEqual([...r.metrics.unsupportedCodes], ['H316'], 'metrics.unsupportedCodes must match the top-level field');
    assert.deepStrictEqual([...r.metrics.unrecognizedCodesGeneric], ['H999'], 'metrics.unrecognizedCodesGeneric must match the top-level field');
    assert.strictEqual(r.metrics.regulatoryProfile, 'GB', 'metrics.regulatoryProfile must be GB');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. Regulatory issue + genuine physical overflow together
  // ─────────────────────────────────────────────────────────────────────
  {
    // Dense, real content (7 H-codes incl. H316, 6 sensitisers, 14
    // P-statements) at a small custom size -- proven elsewhere
    // (tests/label-render-fit-contract.js's "Extreme Stress Test") to
    // reliably overflow on its own; H316 is swapped in for one of the
    // valid H-codes so a genuine overflow condition and a confirmed
    // regulatory-code issue occur on the SAME render.
    const overflowPlusUnsupported = {
      shape: 'circle', size: 'custom', customW: 52, customH: 52,
      scentName: 'Extreme Stress Test Scent Name That Is Quite Long Indeed',
      productType: 'Candle', bizName: 'Extreme Stress Business Name Ltd',
      bizAddress: '1 Long Address Road, Some Town, County, Postcode', bizPhone: '01234 567890',
      bizWebsite: 'www.extremestresstestbusiness.co.uk',
      netWeight: '220g', batchNum: 'B009-EXTREME', burnTime: '45 hrs approx',
      signal: 'Danger', hStatements: 'H319, H317, H411, H412, H316, H336',
      pStatements: 'P101, P102, P103, P210, P233, P260, P261, P271, P273, P302+P352, P305+P351+P338, P312, P501, P211',
      sensitisers: ['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
      pictograms: ['exclamation','flame','aquatic'], textColour: 'dark', showBorder: true,
    };
    const r = window.LabelRenderer.renderLabel(overflowPlusUnsupported, { instanceId:'regulatory-plus-overflow', pw:147, ph:147 });
    results.regulatoryPlusOverflow = { blockReason:r.blockReason, contentOverflow:r.contentOverflow, unsupportedCodes:r.unsupportedCodes, fits:r.fits };
    assert.strictEqual(r.fits, false, 'this fixture must be blocked');
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', 'blockReason must lead with the regulatory issue even though genuine overflow ALSO applies');
    assert.deepStrictEqual([...r.unsupportedCodes], ['H316'], 'unsupportedCodes must still report H316');
    assert.strictEqual(r.contentOverflow, true, 'contentOverflow must independently report true -- both states are retained structurally, not just the leading one');
    assert(r.svg.includes('Unsupported GB CLP code: H316'), 'overlay must show the regulatory-issue message');
    assert(!r.svg.includes('FULL CONTENT DOES NOT FIT') && !r.svg.includes('Select a larger size'), 'overlay must NOT advise a larger size while the regulatory-code issue is unresolved, even though the content also genuinely overflows');

    // Builder-side download-blocking banner for the same combined case --
    // matches the LabelRenderer fixture above exactly (52x52mm circle
    // custom, same dense content) so it genuinely overflows here too.
    const rb = renderDirectAndUpdate('H319,H317,H411,H412,H316,H336', {
      domFields: {
        'scent-name': 'Extreme Stress Test Scent Name That Is Quite Long Indeed',
        'biz-name': 'Extreme Stress Business Name Ltd',
        'biz-address': '1 Long Address Road, Some Town, County, Postcode',
        'biz-website': 'www.extremestresstestbusiness.co.uk',
        'net-weight': '220g', 'batch-num': 'B009-EXTREME', 'burn-time': '45 hrs approx',
        'p-statements': 'P101, P102, P103, P210, P233, P260, P261, P271, P273, P302+P352, P305+P351+P338, P312, P501, P211',
      },
      sensitisers: ['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
      pictograms: ['exclamation','flame','aquatic'],
    }, { shape:'circle', customW:52, customH:52 });
    results.regulatoryPlusOverflowBanner = { bannerHTML: rb.bannerHTML, contentOverflow: rb.contentOverflow, blockReason: rb.blockReason };
    assert.strictEqual(rb.blockReason, 'unsupported-gb-clp-code', 'Builder-side blockReason must also lead with the regulatory issue');
    assert.strictEqual(rb.contentOverflow, true, 'Builder-side contentOverflow must also independently report true');
    assert(rb.bannerHTML.includes('not supported under the selected Great Britain rules'), 'download banner must show the regulatory-issue message');
    assert(!/select a larger label|select a larger size/i.test(rb.bannerHTML), 'download banner must NOT advise a larger label while the regulatory-code issue is unresolved');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 9. Genuine overflow alone -- completely unaffected
  // ─────────────────────────────────────────────────────────────────────
  {
    const overflowOnly = {
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
    const r = window.LabelRenderer.renderLabel(overflowOnly, { instanceId:'overflow-only-recheck', pw:147, ph:147 });
    results.overflowOnly = { blockReason:r.blockReason, fits:r.fits };
    assert.strictEqual(r.fits, false);
    assert.strictEqual(r.blockReason, 'content-does-not-fit', 'genuine overflow alone must still report content-does-not-fit');
    assert(r.svg.includes('FULL CONTENT DOES NOT FIT'), 'genuine overflow alone must still show the original, byte-identical message');
    assert(r.svg.includes('Select a larger size in Step 1'));
    assert(!r.svg.includes('Great Britain') && !r.svg.includes('GB CLP code'), 'genuine overflow alone must never show the SDS/jurisdiction-code wording');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 10. H316/H401/H402 individually still report the corrected wording
  // ─────────────────────────────────────────────────────────────────────
  results.individualCodes = {};
  for(const code of ['H316','H401','H402']){
    const r = renderDirectAndUpdate(code);
    results.individualCodes[code] = { blockReason:r.blockReason, bannerHTML:r.bannerHTML };
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', `${code} alone must report blockReason:unsupported-gb-clp-code`);
    assert(r.bannerHTML.includes('not supported under the selected Great Britain rules'), `${code}: download banner must use the corrected wording`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 15. A malformed/adversarial code value must not inject markup at any
  // HTML/SVG insertion boundary, and an ordinary code (H316, H999) must
  // not be altered by the escaping (no double-escaping, no visible
  // "&amp;"-style artifacts for characters that were never special).
  //
  // A code reaching clpUnsupportedCodesMessage()/clpUnrecognisedCodesMessage()
  // is, by definition, not a verified H_LIB/P_LIB string -- it could be a
  // typo, or (via a hand-edited saved-label record, bypassing Smart
  // Paste's extraction regex entirely, exactly as
  // renderFromSimulatedSavedLabel() above simulates) a deliberately
  // crafted value. This is untrusted text at every point it is inserted
  // as markup: builder.html's download-blocking banner (innerHTML) and
  // label-render.js's fail-closed SVG overlay (buildBlockedOverlaySVG).
  // ─────────────────────────────────────────────────────────────────────
  {
    const XSS_PAYLOAD = '<img src=x onerror=window.__xssFired=1>';

    // 15a. Unit level: the message-building functions themselves. No
    // escapeFn (the alert()-consumer contract) must return the payload
    // untouched -- alert() is plain text, so "escaping" it would corrupt
    // what the maker actually sees. WITH escapeBuilderText (the
    // innerHTML-consumer contract), the payload must come back neutralised.
    const rawMsg = window.eval(`clpUnrecognisedCodesMessage([${JSON.stringify(XSS_PAYLOAD)}])`);
    assert(rawMsg.body.includes(XSS_PAYLOAD), 'no-escapeFn call (alert() contract) must preserve the payload verbatim, not silently escape it');

    const escapedMsg = window.eval(`clpUnrecognisedCodesMessage([${JSON.stringify(XSS_PAYLOAD)}], escapeBuilderText)`);
    assert(!escapedMsg.body.includes('<img'), 'escapeBuilderText-escaped call must not carry a literal "<img" tag');
    assert(escapedMsg.body.includes('&lt;img'), 'escapeBuilderText-escaped call must carry the neutralised "&lt;img" form');

    // Ordinary codes must be byte-identical whether escaped or not --
    // proves this is not blanket-mangling every code, only ever the
    // characters that are actually special.
    const rawOrdinary = window.eval("clpUnsupportedCodesMessage(['H316'])");
    const escapedOrdinary = window.eval("clpUnsupportedCodesMessage(['H316'], escapeBuilderText)");
    assert.strictEqual(rawOrdinary.body, escapedOrdinary.body, 'an ordinary code (H316) must render identically escaped or not -- no double-escaping / stray "&amp;" artifacts');
    assert(escapedOrdinary.body.includes('H316') && !escapedOrdinary.body.includes('&amp;'), 'H316 must appear as plain "H316", not "&amp;"-mangled');

    // 15b. End-to-end: the real banner (innerHTML) and the real renderer
    // SVG overlay, fed the payload as a genuinely "unrecognised" code
    // alongside one confirmed-unsupported code (mixed scenario). Placed
    // before test 11 (saved-label reopen) deliberately: loadLabelRecord()
    // navigates this jsdom harness in a way it cannot come back from (see
    // test 11's own comment), so #label-warn-stage4 is only reliably
    // present up to this point in the run.
    const r = renderDirectAndUpdate('H316,' + XSS_PAYLOAD);
    results.xssRegression = {
      bannerContainsRawTag: r.bannerHTML.includes('<img'),
      bannerContainsEscapedForm: r.bannerHTML.includes('&lt;img'),
      svgContainsRawTag: r.svg.includes('<img'),
      svgContainsEscapedForm: r.svg.includes('&lt;img'),
    };
    assert(!r.bannerHTML.includes('<img'), 'download-blocking banner innerHTML must not contain a literal "<img" tag from an unrecognised code value');
    assert(r.bannerHTML.includes('&lt;img'), 'download-blocking banner innerHTML must contain the neutralised "&lt;img" form');
    assert(r.bannerHTML.includes('H316'), 'banner must still name the genuinely confirmed-unsupported H316 alongside the neutralised generic code');
    assert(!r.svg.includes('<img'), 'renderer SVG overlay must not contain a literal "<img" tag from an unrecognised code value');
    assert(r.svg.includes('&lt;img'), 'renderer SVG overlay must contain the neutralised "&lt;img" form');

    // Confirm the payload never actually executed inside the jsdom window
    // (belt-and-braces on top of the string-level checks above).
    assert.strictEqual(window.eval('window.__xssFired'), undefined, 'the injected onerror handler must never have run');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 16. Regression-guard: the same check, if it were run against the
  // PRE-FIX (unescaped) code path, must actually fail -- proving test 15
  // is a real guard and not a tautology. Reconstructs the old,
  // pre-Part-F-2 call pattern (no escapeFn at all) inline, the same way
  // the real call sites used to call these functions before this fix.
  // ─────────────────────────────────────────────────────────────────────
  {
    const XSS_PAYLOAD = '<img src=x onerror=window.__xssFired=1>';
    const preFixMsg = window.eval(`clpUnrecognisedCodesMessage([${JSON.stringify(XSS_PAYLOAD)}])`); // no escapeFn == old behaviour
    const preFixWouldHaveFailed = preFixMsg.body.includes('<img');
    results.regressionGuard = { preFixWouldHaveFailed };
    assert.strictEqual(preFixWouldHaveFailed, true, 'sanity check: the pre-fix call pattern (no escapeFn) must reproduce the raw, unescaped payload -- if this assertion itself fails, test 15 is not actually exercising the vulnerable path');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 11. Saved-label reopen and direct renderer calls with mixed codes
  // (runs after every renderDirectAndUpdate()-based test above --
  // loadLabelRecord() navigates the Builder back to Step 1 via goToStep(),
  // which is a one-way trip for this harness's DOM state)
  // ─────────────────────────────────────────────────────────────────────
  {
    const r = renderFromSimulatedSavedLabel('H401,H998');
    results.savedLabelMixed = { blockReason:r.blockReason, unrecognizedCodes:r.unrecognizedCodes };
    assert(r.unrecognizedCodes.includes('H401') && r.unrecognizedCodes.includes('H998'), 'a simulated saved label with mixed codes must surface both in unrecognizedCodes');
    assert.strictEqual(r.blockReason, 'unsupported-gb-clp-code', 'mixed saved label must lead with the regulatory reason');
    assert(r.svg.includes('Unsupported GB CLP code: H401') && r.svg.includes('Unrecognised CLP code: H998'), 'mixed saved label overlay must show both groups on reopen');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 12. H282/H283/H284 unchanged by this task
  // ─────────────────────────────────────────────────────────────────────
  {
    const inHLib = window.eval("['H282','H283','H284'].every(c=>H_LIB.some(x=>x.code===c))");
    const inUnsupported = window.eval("LabelRenderer.GB_UNSUPPORTED_CODES.some(c=>['H282','H283','H284'].includes(c))");
    results.h282to284 = { inHLib, inUnsupported };
    assert.strictEqual(inHLib, true, 'H282/H283/H284 must remain present in H_LIB (unchanged by this task)');
    assert.strictEqual(inUnsupported, false, 'H282/H283/H284 must remain absent from GB_UNSUPPORTED_CODES (unchanged by this task)');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 13. GB_UNSUPPORTED_CODES/ACTIVE_REGULATORY_PROFILE scoped to GB only
  // ─────────────────────────────────────────────────────────────────────
  {
    const profile = window.eval('LabelRenderer.ACTIVE_REGULATORY_PROFILE');
    const codes = [...window.eval('LabelRenderer.GB_UNSUPPORTED_CODES')];
    results.profileScope = { profile, codes };
    assert.strictEqual(profile, 'GB', 'ACTIVE_REGULATORY_PROFILE must be GB');
    assert.deepStrictEqual([...codes].sort(), ['H316','H401','H402']);
    // The list/profile names themselves must not appear anywhere in the
    // production source rebranded as a universal "invalid code" concept.
    assert(!/INVALID_CODES|UNIVERSAL_.*CODES/.test(rawLabelRendererSource+rawBuilderSource), 'GB_UNSUPPORTED_CODES must not be presented as a universal invalid-code list anywhere in production source');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 14. No customer names / support-case identifiers / speculative
  // H282-H284 discussion in production files
  // ─────────────────────────────────────────────────────────────────────
  {
    const forbidden = ['Sophie', 'Papakonstantinou', 'Nikura', 'support case', 'support-case'];
    const hits = [];
    for(const term of forbidden){
      if(rawBuilderSource.includes(term)) hits.push('builder.html: '+term);
      if(rawLabelRendererSource.includes(term)) hits.push('label-render.js: '+term);
    }
    results.customerNameScan = { hits };
    assert.deepStrictEqual(hits, [], `production files must carry no customer names or support-case identifiers, found: ${JSON.stringify(hits)}`);

    // Speculative H282/H283/H284 GB-status discussion (confidence-level
    // language tied to those codes) must not appear in production files;
    // H282/H283/H284 may still appear as plain H_LIB/pictogram-map entries
    // (checked in test 12 above), just not with speculative commentary.
    const speculativePattern = /(moderate.confidence|not.yet.confirmed|unconfirmed|open investigation)[^.]{0,120}H28[234]|H28[234][^.]{0,120}(moderate.confidence|not.yet.confirmed|unconfirmed|open investigation)/i;
    assert(!speculativePattern.test(rawBuilderSource), 'builder.html must not carry speculative H282/H283/H284 GB-status discussion');
    assert(!speculativePattern.test(rawLabelRendererSource), 'label-render.js must not carry speculative H282/H283/H284 GB-status discussion');
  }

  const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
  assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);

  window.close();
  return results;
}

run().then(results => {
  console.log('gb-wording-and-mixed-code-correction checks passed');
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
