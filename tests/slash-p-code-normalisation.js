// Focused regression tests for the slash-form combined P-code
// extraction/canonicalisation fix in extractSDS() (builder.html).
//
// Background: some GB-CLP
// suppliers (confirmed here: Nikura Ltd) print combined precautionary
// statements using "/" between the code numbers (e.g. "P302/352",
// "P333/313"), not the official internal "+" form ("P302+P352"). The
// original extractSDS() P-code regex only matched "+"-joined codes, so a
// "/"-joined code's trailing segment (printed without its own "P" prefix)
// was dropped entirely, leaving an orphan leading code ("P302") that could
// never match P_LIB's combined "P302+P352" entry -- wrongly flagged as
// unrecognised, incorrectly blocking Step 3 / Download.
//
// Scope of this fix: ONLY
// the P-code extraction/normalisation line inside extractSDS(). H_LIB,
// EUH handling, P_LIB, _pExclude, P280 behaviour, warning/error messages,
// rendering, label-fitting and any database code are all unchanged and
// unrelated to this test file.
//
// Run individually from the repo root: node tests/slash-p-code-normalisation.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

function buildDom(builderSourcePath){
  const source = fs.readFileSync(builderSourcePath, 'utf8')
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
      window.eval(labelLibrarySource); window.eval(require("fs").readFileSync(require("path").join(__dirname,"..","entitlement.js"),"utf8"));
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
  return { dom, errors };
}

function pasteAndExtract(window, document, text){
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

// Runs the real Step 3 gate (canLeaveApprovedBuilderStep(3)) after filling
// in the minimum other required Step-3 fields, so the "unrecognised codes"
// alert/block behaves exactly as it would for a real user.
function runStep3Gate(window, document){
  document.getElementById('scent-name').value = 'Test Scent';
  document.getElementById('product-type').value = 'Candle';
  document.getElementById('biz-name').value = 'Test Business';
  document.getElementById('biz-phone').value = '01234 567890';
  document.getElementById('hazard-confirm').checked = true;
  window.__lastAlert = undefined;
  const ok = window.canLeaveApprovedBuilderStep(3);
  return { ok, alert: window.__lastAlert };
}

async function run(){
  const { dom, errors } = buildDom('builder.html');
  const { window } = dom;
  const document = window.document;
  await new Promise(resolve => setTimeout(resolve, 300));

  const results = { fixtures: {}, unitCases: [], negativeCases: [] };

  // ─────────────────────────────────────────────────────────────────────
  // A. Required canonicalisation examples (unit-level, via minimal pastes)
  // ─────────────────────────────────────────────────────────────────────
  const unitCases = [
    { label: 'P302/352 -> P302+P352', text: 'Precautionary statements: P302/352, IF ON SKIN: Wash with plenty of soap and water. P501, Dispose of contents.', expect: ['P302+P352','P501'] },
    { label: 'P302/P352 -> P302+P352', text: 'Precautionary statements: P302/P352, IF ON SKIN: Wash with plenty of soap and water. P501, Dispose of contents.', expect: ['P302+P352','P501'] },
    { label: 'P333/313 -> P333+P313', text: 'Precautionary statements: P333/313, If skin irritation or rash occurs: Get medical advice/attention. P501, Dispose of contents.', expect: ['P333+P313','P501'] },
    { label: 'P303/361/353 -> P303+P361+P353 (then excluded, unchanged behaviour)', text: 'Precautionary statements: P303/361/353, IF ON SKIN (or hair): Remove contaminated clothing. P501, Dispose of contents.', expect: ['P501'] },
    { label: 'optional spaces around / : "P302 / 352"', text: 'Precautionary statements: P302 / 352, IF ON SKIN: Wash. P501, Dispose of contents.', expect: ['P302+P352','P501'] },
    { label: 'optional spaces around + : "P403 + P233"', text: 'Precautionary statements: P403 + P233, Store in a well-ventilated place. P501, Dispose of contents.', expect: ['P403+P233','P501'] },
    { label: 'existing "+" notation unchanged: "P302+P352"', text: 'Precautionary statements: P302+P352, IF ON SKIN: Wash. P501, Dispose of contents.', expect: ['P302+P352','P501'] },
    { label: 'existing "+" notation unchanged: "P403+P233"', text: 'Precautionary statements: P403+P233, Store in a well-ventilated place. P501, Dispose of contents.', expect: ['P403+P233','P501'] },
    { label: 'single P-code unchanged: "P261"', text: 'Precautionary statements: P261, Avoid breathing vapour or dust. P501, Dispose of contents.', expect: ['P261','P501'] },
    { label: 'single P-code unchanged: "P501"', text: 'Precautionary statements: P501, Dispose of contents and container in accordance with local regulations.', expect: ['P501'] },
    { label: 'duplicates deduplicated: same combo, two notations', text: 'Precautionary statements: P302/352, IF ON SKIN: Wash. Later in the document: P302+P352 is repeated. P501, Dispose of contents.', expect: ['P302+P352','P501'] },
    { label: 'duplicates deduplicated: identical slash form twice', text: 'P333/313 appears once. P333/313, If skin irritation or rash occurs: Get medical advice/attention. P501, Dispose of contents.', expect: ['P333+P313','P501'] }
  ];

  for(const c of unitCases){
    const r = pasteAndExtract(window, document, c.text);
    const got = [...r.pSelected].sort();
    const expected = [...c.expect].sort();
    const pass = JSON.stringify(got) === JSON.stringify(expected);
    results.unitCases.push({ label: c.label, expected, got, pass });
    assert.deepStrictEqual(got, expected, `${c.label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // B. Negative tests -- ordinary prose, phone numbers, dimensions and
  // unrelated numbers must never be misidentified as P-codes.
  // ─────────────────────────────────────────────────────────────────────
  const negativeCases = [
    { label: 'telephone number', text: 'Company phone: 0203 6370946. Emergency phone: 0203 6370946.' },
    { label: 'dimensions', text: 'Print size: 80 x 100mm. Custom rectangle 63 x 44 mm also supported.' },
    { label: 'issue date / version numbers', text: 'Issue date: 15/09/2025. Version: 1 (15/09/2025). Page 2 (9).' },
    { label: 'percentage / concentration figures', text: 'Nikura | Positivity Essential Oil Blend (10% in Candle Wax). Hydrocarbon Concentration %: 1.7522%.' },
    { label: 'ordinary prose with no codes at all', text: 'Nikura Ltd, Unit 6, Tariff Road, London, N17 0EB. Regulatory Affairs. support@nikura.com.' },
    { label: 'CAS/EC registry numbers', text: 'Linalool 78-70-6 201-134-4 1-<5%. d-Limonene 5989-27-5 227-813-5 0.1-<1%.' },
    { label: 'section/paragraph numbering', text: '2.2 Label elements. 3.2 Mixtures. Section 15.2 Chemical Safety Assessment.' }
  ];

  for(const c of negativeCases){
    const r = pasteAndExtract(window, document, c.text);
    const pass = r.pSelected.length === 0;
    results.negativeCases.push({ label: c.label, got: r.pSelected, pass });
    assert.strictEqual(r.pSelected.length, 0, `${c.label} must not be misidentified as a P-code, got: ${JSON.stringify(r.pSelected)}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // C. Full fixture regressions -- raw Section 2.2 text, Positivity /
  // Nag Champa / Snow Pixie, exactly as pasted across a real PDF page
  // break (footer/header noise included, matching how a user actually
  // copies text out of these supplier PDFs).
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
Page 2 (9)
Issue date: 15/09/2025
Version: 1 (15/09/2025)
P280, Wear protective gloves/eye protection/face protection.
P302/352, IF ON SKIN: Wash with plenty of soap and water.
P333/313, If skin irritation or rash occurs: Get medical advice/attention.
P363, Wash contaminated clothing before reuse.
P501, Dispose of contents/container to approved disposal site, in accordance with local
regulations.`;

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

  // -- Positivity: P302/352 and P333/313 must canonicalise correctly, but
  // the paste must STILL be blocked -- by H402 alone, which this change
  // does not add, translate, or otherwise touch.
  {
    const r = pasteAndExtract(window, document, POSITIVITY_TEXT);
    const gate = runStep3Gate(window, document);
    results.fixtures.positivity = { extracted: r, gate };
    assert(r.pSelected.includes('P302+P352'), `Positivity: P302/352 must canonicalise to P302+P352, got pSelected: ${JSON.stringify(r.pSelected)}`);
    assert(r.pSelected.includes('P333+P313'), `Positivity: P333/313 must canonicalise to P333+P313, got pSelected: ${JSON.stringify(r.pSelected)}`);
    assert(!r.pSelected.includes('P302'), 'Positivity: orphaned bare "P302" must no longer appear');
    assert(!r.pSelected.includes('P333'), 'Positivity: orphaned bare "P333" must no longer appear');
    assert(r.hSelected.includes('H402'), 'Positivity: H402 must still be extracted as-is (not added, not translated, not removed)');
    assert.strictEqual(gate.ok, false, 'Positivity: Step 3 must still be BLOCKED (by H402, an unsupported non-GB code -- unrelated to this fix)');
    assert(gate.alert && /H402/.test(gate.alert), `Positivity: the blocking alert must name H402, got: ${JSON.stringify(gate.alert)}`);
    assert(!(gate.alert||'').includes('P302') && !(gate.alert||'').includes('P333'), `Positivity: the blocking alert must no longer also cite orphaned P302/P333, got: ${JSON.stringify(gate.alert)}`);
  }

  // -- Nag Champa: P302/352 and P333/313 must canonicalise -- this change
  // is scoped to P-code parsing only and does not itself touch H_LIB/EUH
  // handling. H316 is still MATCHED by extractSDS()'s H-code regex exactly
  // as before (extraction is pattern-based, independent of H_LIB), but
  // the separate H316/H401 safety change
  // (see tests/h316-h401-gb-unsupported-removal.js) removes
  // H316 from H_LIB, so it is caught by the pre-existing "unrecognised
  // code" Step-3 gate. Net effect once both changes are combined: the
  // paste is still blocked, but now specifically and only because of H316
  // -- the orphaned-P-code symptom this file's fix targets is gone, and
  // the H316 release-blocker flagged during review is independently closed
  // by the other change. This file does not re-test H316 blocking in
  // depth (chip removal, rendering fail-closed, etc.) -- that is the other
  // test file's job; this assertion only confirms the two changes compose
  // correctly together.
  {
    const r = pasteAndExtract(window, document, NAG_CHAMPA_TEXT);
    const gate = runStep3Gate(window, document);
    results.fixtures.nagChampa = { extracted: r, gate };
    assert(r.pSelected.includes('P302+P352'), `Nag Champa: P302/352 must canonicalise to P302+P352, got pSelected: ${JSON.stringify(r.pSelected)}`);
    assert(r.pSelected.includes('P333+P313'), `Nag Champa: P333/313 must canonicalise to P333+P313, got pSelected: ${JSON.stringify(r.pSelected)}`);
    assert(!r.pSelected.includes('P302'), 'Nag Champa: orphaned bare "P302" must no longer appear');
    assert(!r.pSelected.includes('P333'), 'Nag Champa: orphaned bare "P333" must no longer appear');
    assert(r.hSelected.includes('H316'), 'Nag Champa: H316 must still be MATCHED by extraction -- this file\'s fix does not touch H_LIB/EUH handling');
    assert.strictEqual(gate.ok, false, 'Nag Champa: must now be BLOCKED -- specifically and only by H316 (the H316/H401 safety change removed it from H_LIB), not by the previously-orphaned P302/P333');
    assert(gate.alert && /H316/.test(gate.alert), `Nag Champa: the blocking alert must name H316, got: ${JSON.stringify(gate.alert)}`);
    assert(!(gate.alert||'').includes('P302') && !(gate.alert||'').includes('P333'), `Nag Champa: the blocking alert must not also cite orphaned P302/P333, got: ${JSON.stringify(gate.alert)}`);
  }

  // -- Snow Pixie: no combined P-codes in this SDS at all -- extraction
  // must be completely unchanged by this fix.
  {
    const r = pasteAndExtract(window, document, SNOW_PIXIE_TEXT);
    const gate = runStep3Gate(window, document);
    results.fixtures.snowPixie = { extracted: r, gate };
    assert.deepStrictEqual([...r.pSelected].sort(), ['P273','P501'], `Snow Pixie: extraction must be unchanged, got: ${JSON.stringify(r.pSelected)}`);
    assert.deepStrictEqual([...r.hSelected].sort(), ['EUH208','H412'], `Snow Pixie: extraction must be unchanged, got: ${JSON.stringify(r.hSelected)}`);
    assert.strictEqual(gate.ok, true, 'Snow Pixie: must remain unblocked, exactly as before this fix');
  }

  const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
  assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);

  window.close();
  return results;
}

run().then(results => {
  console.log('slash-p-code-normalisation checks passed');
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
