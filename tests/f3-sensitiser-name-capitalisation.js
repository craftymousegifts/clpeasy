// F3 regression (10 Oct 2026): EUH208 sensitiser names taken from a bounded
// supplier "EUH208 ... Contains ... May produce an allergic reaction" clause
// must keep the supplier's exact spelling AND capitalisation. Previously a
// name that matched the SENSITISERS reference table was re-cased to the
// table spelling (e.g. supplier "Geranyl acetate" -> "Geranyl Acetate",
// "citral" -> "Citral"). Also proves order, case-insensitive de-duplication
// and the whole-text fallback (no bounded clause) are unchanged.
// Run from the repo root: node tests/f3-sensitiser-name-capitalisation.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom'); const __sdsAns = require('./helpers/sds-doc-answer').installed;

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
    window.HTMLElement.prototype.scrollIntoView=()=>{};
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(labelRendererSource); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
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
__sdsAns(dom);

const { window } = dom;
const document = window.document;

function pasteAndExtract(text, customW, customH){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = String(customW || 80);
  document.getElementById('custom-h').value = String(customH || 100);
  window.onDimInput();
  window.setApprovedBuilderStep(3);
  document.getElementById('product-type').value = 'Scented Candle'; // a real Step 2 product type (supplier-document check)
  document.getElementById('smart-paste-input').value = text;
  window.extractSDS();
  return window.eval('S.sensitisers');
}

const WITCHY_WOO_TEXT = 'EUH208 - Contains: ACETATE PTBCH, Cedramber, Limonene, Linalyl acetate, 2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene. May produce an allergic reaction.';

// SVG text-wrapping can legitimately split a long name across two <tspan>
// lines at a space (no bug -- see label-render.js's wrapText()/fitFont()),
// which breaks a naive contiguous-substring search for a name containing a
// space. Flattening tag boundaries to whitespace before searching checks
// for the name's actual rendered TEXT CONTENT, independent of exactly
// where the renderer chose to wrap it.
function flattenSvgText(svg){
  return svg.replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
// Word-boundary wraps discard the joining space (wrapText splits on
// whitespace and starts a new line with the next word, without
// re-inserting the space), so a tag-boundary-as-space reconstruction can
// itself be wrong the other way. And a long, space-free word that itself
// had to be split (see the horizontal-overflow fix in wrapText()) is
// split WITHOUT any space at all, mid-word. A name is genuinely present
// if either reconstruction contains it as a contiguous substring.
function flattenSvgTextNoGaps(svg){
  return svg.replace(/<\/?[^>]+>/g, '');
}
function svgContainsName(svg, name){
  return flattenSvgText(svg).includes(name) || flattenSvgTextNoGaps(svg).includes(name);
}

const NI_LIBRARY = 'EUH208, Contains Citronellol, Geranyl acetate, Hexyl Cinnamal, Linalool, Linalyl acetate. May\nproduce an allergic reaction.';
const DCS_COTTON_CLEAN = 'EUH208, Contains 1-(1,2,3,4,5,6,7,8-octahydro-2,3,5,5-tetramethyl-2-naphthalenyl) ethanone,\n3,7-DIMETHYLOCTA-1,6-DIEN-3-YL ACETATE, citral, citronellol, eugenol, linalool. May\nproduce an allergic reaction.';
const UPPER_CASE = 'EUH208, Contains ALPHA-ISOMETHYL IONONE, CITRONELLOL, COUMARIN, LIMONENE, LINALYL ACETATE. May produce an allergic reaction.';

setTimeout(async () => {
  try {
    // 1. Geranyl acetate keeps its lower-case "a"; every name, order unchanged.
    let sens = [...pasteAndExtract(NI_LIBRARY)];
    assert.deepStrictEqual(sens, ['Citronellol','Geranyl acetate','Hexyl Cinnamal','Linalool','Linalyl acetate'], 'NI Library names: '+JSON.stringify(sens));
    let svg = window.buildSVG(true);
    for (const n of sens) assert(svgContainsName(svg, n), 'label SVG lacks supplier spelling '+n);
    assert(!svgContainsName(svg, 'Geranyl Acetate'), 'label still re-cases Geranyl acetate to the table spelling');
    assert.strictEqual(window.eval('document.getElementById("allergen-tags").textContent').includes('Geranyl acetate'), true, 'Step 3 tag must show supplier spelling');
    // EUH208 sentence wording unchanged around the names.
    assert(/Contains:?\s*Citronellol, Geranyl acetate, Hexyl Cinnamal, Linalool, Linalyl acetate\s*May produce an allergic reaction\./.test(flattenSvgText(svg)), 'EUH208 sentence changed: '+flattenSvgText(svg).slice(0,400));
    // Reference chips (display-only) still list the table spellings, one per table entry.
    const chips = [...document.querySelectorAll('#sensitiser-chips .s-chip')].map(c=>c.dataset.name);
    assert.strictEqual(chips.length, window.eval('SENSITISERS.length'), 'reference chip count changed');
    assert(chips.includes('Geranyl Acetate') && chips.includes('Citral'), 'reference chips changed');

    // 2. Lower-case supplier names (citral, citronellol, eugenol, linalool) are not capitalised.
    sens = [...pasteAndExtract(DCS_COTTON_CLEAN)];
    assert.deepStrictEqual(sens, ['1-(1,2,3,4,5,6,7,8-octahydro-2,3,5,5-tetramethyl-2-naphthalenyl) ethanone','3,7-DIMETHYLOCTA-1,6-DIEN-3-YL ACETATE','citral','citronellol','eugenol','linalool'], 'Cotton Clean names: '+JSON.stringify(sens));
    svg = window.buildSVG(true);
    for (const n of sens) assert(svgContainsName(svg, n), 'label SVG lacks supplier spelling '+n);
    assert(!svgContainsName(svg, 'Citral'), 'citral was re-cased to Citral');

    // 3. An all-capitals supplier list stays in capitals (table names included).
    sens = [...pasteAndExtract(UPPER_CASE)];
    assert.deepStrictEqual(sens, ['ALPHA-ISOMETHYL IONONE','CITRONELLOL','COUMARIN','LIMONENE','LINALYL ACETATE'], 'upper-case names: '+JSON.stringify(sens));

    // 4. Case-insensitive de-duplication unchanged: first supplier wording kept, no duplicates.
    sens = [...pasteAndExtract('EUH208, Contains citral, Geranyl acetate, CITRAL, Citral, geranyl ACETATE, Limonene. May produce an allergic reaction.')];
    assert.deepStrictEqual(sens, ['citral','Geranyl acetate','Limonene'], 'de-duplication: '+JSON.stringify(sens));

    // 5. Fallback (no bounded EUH208 clause) unchanged: table recognition, table spelling, table order.
    sens = [...pasteAndExtract('2.2 Label elements\nSignal word: Warning\nHazard statements: H317 May cause an allergic skin reaction.\nIngredients of note: geranyl acetate, citral.')];
    assert.deepStrictEqual(sens, ['Citral','Geranyl Acetate'], 'fallback path changed: '+JSON.stringify(sens));

    // 6. Required-content check still recognises the EUH208 names (export not blocked for missing names).
    pasteAndExtract(NI_LIBRARY);
    const rc = window.eval('LabelRenderer.checkRequiredContent({scentName:"Library",bizName:"B",bizAddress:"A",bizPhone:"1",hStatements:"H412, EUH208",sensitisers:S.sensitisers})');
    assert(!(rc.missing||[]).includes('euh208-substance'), 'required-content check reports missing EUH208 names: '+JSON.stringify(rc));

    assert.deepStrictEqual(errors, [], 'page errors: '+errors.join(' | '));
    console.log('F3 sensitiser-name capitalisation tests passed (supplier spelling kept; order, de-duplication and fallback unchanged).');
    process.exit(0);
  } catch (e) { console.error(e && e.stack || e); process.exit(1); }
}, 50);
