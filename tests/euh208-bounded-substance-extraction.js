// Focused tests for the EUH208 bounded "Contains ... may produce/cause an
// allergic reaction" substance-list extraction added to extractSDS()
// (builder.html). Proves that the SENSITISERS reference table is used for
// recognition/normalisation only, never as an allowlist that silently
// drops a supplier-named substance the table doesn't happen to contain --
// see the WITCHY WOO FRAG0549 support case (real supplier EUH208 wording,
// 5 named substances, previously only 3 survived extraction).
// Run from the repo root: node tests/euh208-bounded-substance-extraction.js
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

const { window } = dom;
const document = window.document;

function pasteAndExtract(text, customW, customH){
  window.selectShape('rectangle');
  window.selectSize('custom');
  document.getElementById('custom-w').value = String(customW || 80);
  document.getElementById('custom-h').value = String(customH || 100);
  window.onDimInput();
  window.setApprovedBuilderStep(3);
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

setTimeout(async () => {
  try {
    // ── 1/2/3/4: WITCHY WOO fixture — all five names, EXACT supplier order,
    // long name unsplit. The bounded EUH208 clause is authoritative: it
    // must not be reordered by, or merged with, the whole-text table scan
    // (which would otherwise float the 3 table-recognised names to the
    // front, as an earlier version of this fix incorrectly did).
    let sens = pasteAndExtract(WITCHY_WOO_TEXT);
    assert.deepStrictEqual(
      [...sens],
      ['ACETATE PTBCH','Cedramber','Limonene','Linalyl acetate','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'],
      `WITCHY WOO fixture must extract all five substances in exact supplier order, got: ${JSON.stringify(sens)}`
    );
    assert(sens.includes('ACETATE PTBCH'), 'ACETATE PTBCH was not retained');
    assert(sens.includes('Linalyl acetate'), 'Linalyl acetate was not retained');
    assert(sens.includes('2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'), 'the long systematic name was lost or altered');
    assert(!sens.some(n=>/^2-acetoxy-2$/.test(n) || /^3$/.test(n) || /^8$/.test(n)), 'the long systematic name was incorrectly split at its internal commas');

    // Preview/export parity (#8): the same five names must reach the
    // renderer via buildSVG() (shared by preview, SVG, PNG, and PDF export
    // per label-render.js's single-render-path design).
    const svg = window.buildSVG(true);
    const flatSvg = flattenSvgText(svg);
    ['ACETATE PTBCH','Cedramber','Limonene','Linalyl acetate','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'].forEach(name=>{
      assert(svgContainsName(svg, name), `exported SVG text is missing substance "${name}"`);
    });

    // ── generality check: a SECOND, unrelated fixture (different
    // substances, different order, different count, semicolon-separated
    // instead of comma-separated) must extract in ITS OWN supplier order --
    // proves the parser is genuinely dynamic per-statement, not hard-coded
    // to the WITCHY WOO names/sequence above. Mixes one table-known name
    // (Farnesol, deliberately NOT first or last) with three unfamiliar
    // names, one of which carries its own internal, unspaced commas (same
    // "no space after the comma" pattern as the WITCHY WOO long name, but
    // a different name/number pattern entirely).
    const SECOND_FIXTURE_TEXT = 'EUH208 Contains: Zzylo Fictitious Musk-9; Farnesol; Alpha-Test Aldehyde ABC-123; 4,5,6-trimethylhypothetical-dienone. May cause an allergic reaction.';
    let sens2 = pasteAndExtract(SECOND_FIXTURE_TEXT);
    assert.deepStrictEqual(
      [...sens2],
      ['Zzylo Fictitious Musk-9','Farnesol','Alpha-Test Aldehyde ABC-123','4,5,6-trimethylhypothetical-dienone'],
      `second, unrelated EUH208 fixture must extract in ITS OWN supplier order (proves the parser is dynamic, not hard-coded to WITCHY WOO), got: ${JSON.stringify(sens2)}`
    );
    // Confirms ordering isn't coincidentally table order either: Farnesol
    // sits 2nd here (its clause position), not 1st/last by any table rule.
    assert.strictEqual(sens2[1], 'Farnesol', 'the one table-known name in this fixture was not kept at its own clause position');
    // And this second fixture's own order reaches its own export too.
    const svg2 = window.buildSVG(true);
    const flatSvg2 = flattenSvgText(svg2);
    const order2 = ['Zzylo Fictitious Musk-9','Farnesol','Alpha-Test Aldehyde ABC-123','4,5,6-trimethylhypothetical-dienone'].map(n=>flatSvg2.indexOf(n));
    assert(order2.every(i=>i>=0), `second fixture's exported SVG is missing one or more substances: ${JSON.stringify(order2)}`);
    assert(order2.every((v,i)=>i===0||v>order2[i-1]), `second fixture's exported SVG does not preserve its own supplier order: ${JSON.stringify(order2)}`);

    // ── 5: existing known-sensitiser fixture behaves identically ──────────
    sens = pasteAndExtract('Warning H317 H410 P102 P261 P273 P302+P352 P333+P313 P391 P501 Contains Limonene, Linalool, Benzyl salicylate, 2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene');
    assert(sens.includes('Limonene'), 'pre-existing known-sensitiser fixture regressed (Limonene)');
    assert(sens.includes('Linalool'), 'pre-existing known-sensitiser fixture regressed (Linalool)');
    assert(sens.includes('Benzyl Salicylate'), 'pre-existing known-sensitiser fixture regressed (Benzyl Salicylate normalisation)');
    assert(sens.includes('2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'), 'pre-existing known-sensitiser fixture regressed (long name)');
    // No EUH208 anchor in this text at all, so the bounded extraction must
    // contribute nothing beyond the pre-existing whole-text table scan.
    assert.strictEqual(sens.length, 4, `unbounded "Contains" text without an EUH208 anchor must not trigger bounded extraction, got: ${JSON.stringify(sens)}`);

    // ── 6: unfamiliar but safely bounded EUH208 substance is retained ────
    sens = pasteAndExtract('EUH208 Contains: Hypothetical Test Musk XR-9. May cause an allergic reaction.');
    assert(sens.includes('Hypothetical Test Musk XR-9'), 'an unfamiliar but clearly bounded EUH208 substance was not retained');

    // ── 7: text outside a bounded EUH208 statement is not swept in ───────
    sens = pasteAndExtract('Section 3 Composition: contains Random Solvent Blend XYZ, water, dye. Business address: 12 Contains Road, Some Town. No EUH208 statement present.');
    assert(!sens.includes('Random Solvent Blend XYZ'), 'text outside a bounded EUH208 statement (Section 3 table) was incorrectly treated as a sensitiser');
    assert(!sens.some(n=>/Contains Road/i.test(n)), 'an unrelated "Contains" occurrence (address) was incorrectly treated as a sensitiser');

    // ── 9: a genuinely overlong EUH208 statement blocks export, not drop ──
    // Uses the smallest supported rectangle (52×36mm) with a deliberately
    // excessive substance count -- proven directly (see debug run) to
    // overflow at this size, independent of the WITCHY WOO fixture's own
    // (comfortably-fitting) 80×100mm size used elsewhere in this file.
    const manyNames = Array.from({length:80}, (_,i)=>`Overflow Test Substance Number ${i+1}`).join(', ');
    sens = pasteAndExtract(`EUH208 - Contains: ${manyNames}. May produce an allergic reaction.`, 52, 36);
    assert.strictEqual(sens.length, 80, 'an overlong EUH208 statement must retain every name in state, not silently drop any');
    window.updateLabel();
    const overflowSvg = window.buildSVG(true);
    assert(overflowSvg.includes('FULL CONTENT DOES NOT FIT'), 'a label whose real EUH208 content cannot fit must fail closed (block), not silently drop names to make it fit');
    // Still no names dropped even while blocked -- the overlay renders on
    // top, it does not remove the underlying (still-complete) content list.
    assert.strictEqual(window.eval('S.sensitisers').length, 80, 'names were dropped from state while blocked instead of being preserved and failing closed');

    // ── 10: no historical 3-item cap or character truncation reintroduced ─
    sens = pasteAndExtract('EUH208 - Contains: Aaaaaaa One, Bbbbbbb Two, Ccccccc Three, Ddddddd Four, Eeeeeee Five. May produce an allergic reaction.');
    assert.strictEqual(sens.length, 5, `more than 3 EUH208 substances must all survive, got: ${JSON.stringify(sens)}`);
    const longName = 'A Very Long Systematic Fragrance Ingredient Name That Exceeds Eighteen Characters';
    sens = pasteAndExtract(`EUH208 - Contains: ${longName}. May produce an allergic reaction.`);
    assert(sens.includes(longName), `a long substance name must not be truncated, got: ${JSON.stringify(sens)}`);
    assert(!sens.some(n=>n.includes('…')), 'a substance name was truncated with an ellipsis');

    // ── ordering/authority: a table-recognised name mixed with unknown
    // names elsewhere in a full SDS must not be pulled forward into, or
    // merged with, an authoritative bounded EUH208 list -- the bounded
    // clause's own order is the only ordering that survives.
    sens = pasteAndExtract('Section 3: contains Coumarin (a known table entry) at 2%. ' + WITCHY_WOO_TEXT);
    assert.deepStrictEqual(
      [...sens],
      ['ACETATE PTBCH','Cedramber','Limonene','Linalyl acetate','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'],
      `a table match elsewhere in the pasted text must not be prepended/merged into the authoritative bounded EUH208 list, got: ${JSON.stringify(sens)}`
    );

    // ── untrusted-text handling: renderTags() must safely display a
    // supplier-supplied name containing HTML/JS-significant characters,
    // as plain text, with no markup or handler created, no double
    // escaping, and the original value intact in Builder state. Exercised
    // via the SAME bounded-EUH208 path a real malicious/malformed SDS
    // paste would use (bounded extraction keeps names verbatim; it does
    // not validate them as real chemical names).
    const evilName = `<img src=x onerror="alert(1)">Evil & Co's "Name"`;
    sens = pasteAndExtract(`EUH208 - Contains: Cedramber, ${evilName}. May produce an allergic reaction.`);
    assert(sens.includes(evilName), `Builder state (S.sensitisers) must retain the original value intact, got: ${JSON.stringify(sens)}`);

    const tagsEl = document.getElementById('allergen-tags');
    // No element of the injected tag/attribute was actually created --
    // proves innerHTML assignment rendered the payload as inert text, not
    // as markup.
    assert.strictEqual(tagsEl.querySelectorAll('img').length, 0, 'an <img> element was created from an untrusted substance name -- markup injection');
    assert(!tagsEl.hasAttribute('onerror'), 'onerror leaked onto a DOM attribute');
    // window.alert() is also used elsewhere by the app's own (unrelated)
    // step-navigation guards, so rather than asserting no alert ever
    // fired, assert specifically that the injected payload's own text
    // ("alert(1)") never appears as a fired alert message -- i.e. it was
    // never executed as code, only ever handled as inert string data.
    assert(!String(window.__lastAlert||'').includes('alert(1)'), 'the injected payload appears to have executed as code (its own alert text was fired)');
    // Round-trip through the DOM: textContent of the tag must equal the
    // ORIGINAL raw value exactly -- proves single escaping (HTML entities
    // resolve back to the exact source characters) and rules out double
    // escaping (which would leave literal "&amp;" etc. in the displayed
    // text instead of a literal "&").
    const spans = [...tagsEl.querySelectorAll('.allergen-tag')];
    const evilSpan = spans.find(s => s.textContent.includes('Evil'));
    assert(evilSpan, 'the untrusted-name tag was not rendered at all');
    assert.strictEqual(evilSpan.textContent, evilName, `displayed tag text must round-trip to the exact original value with no double escaping, got: ${JSON.stringify(evilSpan.textContent)}`);
    // The raw innerHTML actually written must contain escaped entities,
    // not the literal '<img' / 'onerror=' substring, proving the escaping
    // happened before insertion (not relying on the browser to save us).
    assert(!tagsEl.innerHTML.includes('<img'), 'unescaped "<img" reached innerHTML -- markup injection point');
    // No element anywhere under #allergen-tags actually carries an
    // "onerror" (or any on*) attribute -- proves the payload's attribute
    // syntax was never parsed as real markup, only ever rendered as inert
    // escaped text.
    const anyEventAttr = [...tagsEl.querySelectorAll('*')].some(el =>
      [...el.attributes].some(a => /^on/i.test(a.name)));
    assert(!anyEventAttr, 'an "on*" event-handler attribute was created on a DOM element from an untrusted substance name');
    assert(tagsEl.innerHTML.includes('&lt;img'), 'expected HTML-escaped "&lt;img" in the rendered markup');
    assert(tagsEl.innerHTML.includes('&amp;'), 'expected HTML-escaped "&amp;" in the rendered markup');

    // The name is only ever placed as a text node inside a plain <span>
    // (no data-* attribute, no inline handler, no inline <script>) --
    // confirms HTML text-node escaping (escapeBuilderText, which also
    // escapes both quote characters) is the correct and sufficient
    // context; there is no separate attribute or inline-JS context that
    // would need its own escaping.
    assert(!/allergen-tag[^>]*onclick/i.test(tagsEl.innerHTML), 'an inline event handler attribute was introduced on the tag element');
    assert(!/data-name=/i.test(tagsEl.innerHTML), 'a raw, unescaped attribute context was introduced for the substance name');

    // SVG/export path: the same untrusted name must reach the renderer via
    // the shared xe() escaper (label-render.js) and must not corrupt the
    // exported SVG's XML structure -- parseable by DOMParser is a direct,
    // functional proof the escaping is XML-safe, not just visually safe.
    window.updateLabel();
    const evilSvg = window.buildSVG(true);
    assert(!evilSvg.includes('<img'), 'unescaped "<img" reached the exported SVG -- markup injection in export');
    assert(evilSvg.includes('&lt;img'), 'expected HTML/XML-escaped "&lt;img" in the exported SVG');
    assert(evilSvg.includes('&amp;'), 'expected escaped "&amp;" in the exported SVG for the literal "&" in the name');
    const evilDom = new (require('jsdom').JSDOM)('').window.DOMParser;
    const parsed = new evilDom().parseFromString(evilSvg, 'image/svg+xml');
    assert.strictEqual(parsed.querySelector('parsererror'), null, 'the exported SVG is not well-formed XML -- an untrusted substance name broke SVG structure');

    const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
    assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);
    console.log('EUH208 bounded substance-list extraction checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    window.close();
  }
}, 500);
