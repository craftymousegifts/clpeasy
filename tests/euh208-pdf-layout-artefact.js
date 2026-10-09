// Regression tests for the D1/D2 EUH208 correction in extractSDS()
// (builder.html, 100-SDS QA, 9 Oct 2026). A PDF copy of a two-column SDS
// wraps the left-column row label "Information:" (of "Supplemental
// Information:") into the EUH208 sentence, and can break a substance name at
// its own hyphen across lines. Before the fix, 46 of 86 genuine supplier
// EUH208 statements were extracted wrongly (names dropped, collapsed to the
// table spelling, or "Information:" glued into a name).
//
// Uses the exact Section 2.2 text pasted for 100 genuine Nikura 10% candle
// SDSs (tests/fixtures/euh208-nikura-10pct-corpus.json). Expected names were
// read independently from each supplier PDF's own text, not from builder
// output. Also proves the other Smart Paste results (signal word, H and P
// codes, pictograms) are unchanged from main 85af515 for all 100 SDSs, and
// that legitimate line breaks / "Information:" text are not altered.
// Run from the repo root: node tests/euh208-pdf-layout-artefact.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom'); const __sdsAns = require('./helpers/sds-doc-answer').installed;

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const corpus = JSON.parse(fs.readFileSync('tests/fixtures/euh208-nikura-10pct-corpus.json', 'utf8')).cases;
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
    window.HTMLElement.prototype.scrollIntoView=()=>{};
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(fs.readFileSync('label-render.js', 'utf8')); window.eval(fs.readFileSync('sds-doc-check.js', 'utf8'));
    window.eval(fs.readFileSync('label-library.js', 'utf8')); window.eval(fs.readFileSync('entitlement.js', 'utf8'));
    window.alert = () => {};
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

const { window } = dom;
const document = window.document;

function pasteAndExtract(text){
  // Start each SDS clean, as a customer does with "Clear hazard data".
  window.clearHazardData();
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = '76';
  document.getElementById('custom-h').value = '51';
  window.onDimInput();
  window.setApprovedBuilderStep(3);
  document.getElementById('product-type').value = 'Scented Candle';
  document.getElementById('smart-paste-input').value = text;
  window.extractSDS();
  return JSON.parse(window.eval('JSON.stringify({signal:S.signal,hSelected:S.hSelected,pSelected:S.pSelected,pictograms:S.pictograms,sensitisers:S.sensitisers})'));
}
const tableNames = () => JSON.parse(window.eval('JSON.stringify(SENSITISERS.map(s=>s.name))'));
const svgText = () => window.buildSVG(true).replace(/<\/?[^>]+>/g, '');

// A name must be exactly the supplier's, except where the builder's existing
// SENSITISERS table deliberately normalises a known name's capitalisation
// (e.g. "Geranyl acetate" -> "Geranyl Acetate"); that is pre-existing
// behaviour, not part of this fix, and is only accepted when the result is
// the table's own spelling of the same name.
function assertSupplierNames(id, got, expected){
  const known = tableNames();
  assert.strictEqual(got.length, expected.length, `${id}: expected ${expected.length} names ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  expected.forEach((name, i) => {
    if (got[i] === name) return;
    assert(got[i].toLowerCase() === name.toLowerCase() && known.includes(got[i]),
      `${id}: name ${i + 1} should be "${name}" (supplier), got "${got[i]}"`);
  });
  got.forEach(n => assert(!/Information:|Supplemental|\s-\S|\S-\s/.test(n), `${id}: PDF layout text left in name "${n}"`));
}

setTimeout(() => {
  try {
    const counts = { affected_d1_d2:0, already_correct:0, no_euh208:0 };
    for (const c of corpus) {
      counts[c.group]++;
      const got = pasteAndExtract(c.section_2_2);
      // Other extraction steps keep using the original pasted text.
      for (const f of ['signal', 'hSelected', 'pSelected', 'pictograms'])
        assert.deepStrictEqual(got[f], c.baseline_before_fix[f], `${c.id}: ${f} changed from main 85af515`);
      if (c.group === 'no_euh208') {
        assert.deepStrictEqual(got.sensitisers, c.baseline_before_fix.sensitisers, `${c.id}: sensitisers changed for an SDS with no EUH208 statement`);
        continue;
      }
      assertSupplierNames(c.id, got.sensitisers, c.supplier_euh208_names);
    }
    assert.deepStrictEqual(counts, { affected_d1_d2:46, already_correct:40, no_euh208:14 }, `corpus groups changed: ${JSON.stringify(counts)}`);

    // Named before/after examples from the QA report.
    let r = pasteAndExtract(corpus.find(c => c.id === '011').section_2_2);
    assert.deepStrictEqual(r.sensitisers, ['Terpinolene', 'd-Limonene', 'dl-Limonene', 'p-Mentha-1,3-diene'], '011: was collapsed to "Limonene" before the fix');
    r = pasteAndExtract(corpus.find(c => c.id === '015').section_2_2);
    assert.strictEqual(r.sensitisers[5], 'l-.β.-Bisabolene', '015: "Information:" and the hyphen line break must not enter the name');
    // The corrected names reach the rendered label (shared by preview and exports).
    assert(svgText().includes('l-.β.-Bisabolene') && !svgText().includes('Information:'), '015: rendered label text');

    // Case 068: the supplier's own unusual EUH208 text (a product name listed
    // as a substance) is kept exactly as written -- not filtered or rewritten.
    r = pasteAndExtract(corpus.find(c => c.id === '068').section_2_2);
    assert.deepStrictEqual(r.sensitisers, ['Nikura | Niaouli Essential Oil - 100% Pure', 'Terpinolene', 'alpha-Pinene', 'beta-Pinene'], '068: supplier text must be kept verbatim');

    // ── Legitimate content is not altered ──────────────────────────────────
    // A line break after a comma is ordinary wrapping between two names.
    r = pasteAndExtract('EUH208 Contains Linalool,\nGeraniol. May produce an allergic reaction.');
    assert.deepStrictEqual(r.sensitisers, ['Linalool', 'Geraniol'], 'line break between names');
    // A spaced dash at a line end is not a hyphenated name and is not glued.
    r = pasteAndExtract('EUH208 Contains Test Substance A -\nTest Substance B. May produce an allergic reaction.');
    assert.deepStrictEqual(r.sensitisers, ['Test Substance A - Test Substance B'], 'spaced dash at a line end must keep its spacing');
    // "Information:" that is not a wrapped row label (mid-line) is kept.
    r = pasteAndExtract('EUH208 Contains Test Information: Substance X. May produce an allergic reaction.');
    assert.deepStrictEqual(r.sensitisers, ['Test Information: Substance X'], 'mid-line "Information:" is supplier text');
    // "Information:" outside the EUH208 clause does not affect the names, and
    // codes on an "Information:" line are still extracted from the original text.
    r = pasteAndExtract('Warning\nH317 May cause an allergic skin reaction.\nEUH208 Contains Linalool. May produce an allergic reaction.\nInformation: P261 Avoid breathing vapour.\nFurther information: see Section 11.');
    assert.deepStrictEqual(r.sensitisers, ['Linalool'], '"Information:" outside the clause');
    assert(r.hSelected.includes('H317') && r.pSelected.includes('P261'), 'H/P codes on/near an "Information:" line still extracted');
    // Windows line endings behave the same as \n.
    r = pasteAndExtract('Supplemental              EUH208, Contains Terpinolene, alpha-Pinene, beta-\r\nInformation:              Pinene. May produce an allergic reaction.');
    assert.deepStrictEqual(r.sensitisers, ['Terpinolene', 'alpha-Pinene', 'beta-Pinene'], 'CRLF line endings');
    // "Supplemental Information:" on one line ahead of the clause.
    r = pasteAndExtract('Supplemental Information: EUH208 Contains Citral. May produce\nan allergic reaction.');
    assert.deepStrictEqual(r.sensitisers, ['Citral'], 'single-line row label');

    assert.deepStrictEqual(errors, [], `jsdom errors: ${errors.join(' | ')}`);
    console.log('EUH208 PDF layout artefact tests passed (46 affected, 40 already correct, 14 without EUH208, 068, legitimate-content cases).');
    process.exit(0);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}, 50);
