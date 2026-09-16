// Focused tests for the desktop/tablet-landscape scroll-model correction
// on ux/builder-step-navigation-layout. IMPORTANT: JSDOM has no real
// layout/rendering engine, so it cannot measure actual pixel positions,
// scroll behaviour, or whether something visually "sticks" -- none of
// that is claimed here. These checks are deliberately limited to what
// JSDOM *can* verify honestly:
//   (a) CSS source-order, since the root cause of the defect this
//       corrects was a same-specificity cascade-order bug (a later base
//       rule silently overriding an earlier desktop media-query rule);
//   (b) that the specific broken pattern (position:sticky relied on for
//       viewport-relative stickiness against an ancestor that has
//       overflow-x:hidden) is gone from the relevant selectors;
//   (c) DOM structure/attributes the fix depends on;
//   (d) that unrelated, already-verified behaviour (Smart Paste/EUH208
//       ordering, Step 5 fine-tune relocation, mobile rules) is intact.
// Genuine visual confirmation still requires the real Deploy Preview per
// Michaela's own QA process -- this file does not substitute for that.
// Run from the repo root: node tests/builder-desktop-scroll-model.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const rawSource = fs.readFileSync('builder.html', 'utf8');
const source = rawSource.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

// ── (a)/(b): static CSS-source checks (no real layout available) ────────
function lastIndexOfRule(css, selectorPattern){
  const re = new RegExp(selectorPattern, 'g');
  let m, last = -1;
  while((m = re.exec(css))) last = m.index;
  return last;
}
const desktopBlockIdx = rawSource.indexOf('@media(min-width:861px){');
assert(desktopBlockIdx > -1, 'the desktop scroll-model media query is missing entirely');

['\\.wizard-panel\\{background:white', '\\.builder-accordion\\{display:flex', '\\.builder-accordion-body\\{padding:2px 6px 12px 0'].forEach(pattern=>{
  const idx = lastIndexOfRule(rawSource, pattern);
  assert(idx > -1, `base rule matching /${pattern}/ not found`);
  assert(idx < desktopBlockIdx, `base rule matching /${pattern}/ (at ${idx}) must come BEFORE the desktop scroll-model media query (at ${desktopBlockIdx}), or same-specificity cascade order will silently override the fix -- this exact bug is what broke the first version of this fix`);
});

// The old broken pattern (position:sticky relied on to keep an element
// visible against page-level scroll, on this page specifically, where
// html/body's overflow-x:hidden breaks viewport-relative stickiness for
// any descendant) must not still be present for .right-column.
assert(!/\.right-column\{position:sticky;top:92px/.test(rawSource), 'the old broken position:sticky rule for .right-column (which measurably did not stick in real-browser QA) is still present');
assert(/\.right-column\{height:100%;max-height:none;overflow-y:auto;position:static;\}/.test(rawSource), 'expected .right-column desktop override to use position:static with a real bounded height, not position:sticky');

// .builder-layout must be height-bounded on desktop (the core fix: the
// outer page no longer needs to scroll for ordinary wizard use, so the
// stepper above it -- in normal flow -- is simply always on-screen).
assert(/\.builder-layout\{height:calc\(100vh - 230px\);min-height:520px;align-items:stretch;\}/.test(rawSource), 'expected .builder-layout to be height-bounded on desktop');

// .builder-accordion-body must be able to actually shrink/scroll on
// desktop: flex:1 + min-height:0 (the standard flexbox pattern that
// allows a flex child to be smaller than its content, enabling
// overflow-y:auto to actually engage) plus max-height:none there instead
// of a fixed vh-calc, since a real flex ancestor chain bounds it instead.
assert(/\.builder-accordion-body\{padding:2px 6px 12px 0;flex:1;min-height:0;/.test(rawSource), 'expected .builder-accordion-body to be flex:1;min-height:0 so it can shrink/scroll within the bounded workspace');
assert(/@media\(min-width:861px\)\{[\s\S]{0,400}\.builder-accordion-body\{max-height:none;\}/.test(rawSource), 'expected the desktop override to set .builder-accordion-body max-height:none (bounded instead by the flex chain, not a fixed vh-calc)');

// Sticky Back/Continue: this element's OWN nearest scrolling ancestor is
// now genuinely .builder-accordion-body itself (a real overflow-y:auto
// container, not something relying on the broken html/body quirk), so
// position:sticky here is expected to actually work -- confirm the rule
// is still present and unchanged.
assert(/\.approved-stage-nav\{[^}]*position:sticky;bottom:0/.test(rawSource), 'sticky Back/Continue bar rule is missing or changed');

// Compliance card: relocated into the SAME grid column as the preview
// (a compact panel "beneath/within the preview"), not a large separate
// full-width page section, without changing where it sits in the DOM
// (still visible on mobile, since .right-column{display:none} doesn't
// apply to it there -- it's a grid-column placement trick, not a DOM move).
assert(/\.compliance-card\{grid-column:2;/.test(rawSource), 'expected .compliance-card to sit in the preview\'s grid column (compact, beneath the preview) rather than spanning a full-width row');
assert(!/\.compliance-card\{grid-column:1\/-1/.test(rawSource), 'the old full-width .compliance-card row (contributing extra document height) should have been replaced');

// Mobile/tablet rules must remain intact and untouched by this correction.
assert(/@media\(max-width:860px\)\{[\s\S]{0,60}\.builder-layout\{display:block/.test(rawSource), 'mobile .builder-layout block-stacking rule is missing or moved');
assert(/\.builder-accordion-body\{max-height:none;overflow:visible;padding-right:0;padding-bottom:76px;\}/.test(rawSource), 'mobile .builder-accordion-body override (full-page scroll, fixed bottom nav bar) is missing or changed');
assert(/\.approved-stage-nav\{position:fixed;left:0;right:0;bottom:0;/.test(rawSource), 'mobile fixed bottom Back/Continue bar rule is missing or changed');

console.log('static CSS-source scroll-model checks passed');

// ── (c)/(d): DOM structure + already-covered behaviour stays intact ─────
function buildDom(){
  return new JSDOM(source, {
    url: 'https://local.clpeasy.test/builder.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => ({
        font:'',
        measureText(text){
          const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
          return { width:[...String(text)].reduce((w,c)=>w+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0) };
        },
        drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
      });
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ location:{href:''}, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => ({ data:{session:null} }),
          onAuthStateChange: () => ({ data:{subscription:{unsubscribe(){}}} }),
          signOut: async () => ({})
        },
        from: () => ({ select(){return this;}, eq(){return this;}, then(r){return Promise.resolve({data:null,error:null}).then(r);} }),
        rpc: async () => ({ data:false, error:null })
      }) };
    }
  });
}

const dom = buildDom();
const { window } = dom;
const document = window.document;

setTimeout(() => {
  try {
    // Stepper still exists and is visible in the DOM (structural presence
    // -- NOT a claim about whether it visually stays on-screen while
    // scrolling, which needs a real browser).
    assert(document.getElementById('builder-stepper'), 'sticky horizontal stepper element is missing');
    assert(document.querySelector('.compliance-card'), 'Compliance card was removed rather than made compact');
    assert(/GB CLP aligned/.test(document.querySelector('.compliance-card').textContent), 'Compliance card content changed');

    // Step 5 fine-tune relocation (explicitly protected -- "preserve the
    // successful Step 5 Fine-tune arrangement") still functions exactly
    // as before this correction.
    window.selectShape('circle');
    window.selectSize(52);
    document.getElementById('scent-name').value = 'Test Scent';
    document.getElementById('product-type').value = 'Scented Candle';
    window.setApprovedBuilderStep(2);
    document.getElementById('smart-paste-input').value = 'EUH208 - Contains: ACETATE PTBCH, Cedramber, Limonene, Linalyl acetate, 2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene. May produce an allergic reaction.';
    window.setApprovedBuilderStep(3);
    window.extractSDS();
    const sens = window.eval('S.sensitisers');
    assert.deepStrictEqual([...sens], ['ACETATE PTBCH','Cedramber','Limonene','Linalyl acetate','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'], 'Smart Paste EUH208 extraction/order regressed');
    document.getElementById('hazard-confirm').checked = true;
    window.setApprovedBuilderStep(4);
    document.getElementById('biz-phone').value = '01234 567890';
    window.setApprovedBuilderStep(5);
    const finetune = document.getElementById('finetune-panel-el');
    assert.strictEqual(finetune.closest('#preview-canvas-area')?.id, 'preview-canvas-area', 'Step 5 fine-tune relocation beside the preview regressed');

    const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
    assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);
    console.log('DOM structure / Smart Paste / fine-tune regression checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    window.close();
  }
}, 500);
