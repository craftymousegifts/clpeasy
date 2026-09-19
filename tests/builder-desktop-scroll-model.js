// Focused structural/behaviour regression checks for the desktop Builder.
// JSDOM does not perform real layout, so visual sizing still requires a
// Deploy Preview. These checks cover the source rules and DOM behaviour.
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

// Static CSS/source checks: restore the full named sidebar and ordinary
// document scrolling, while keeping the compact right-hand preview.
assert(/--shell-sidebar-w:260px/.test(rawSource), 'desktop sidebar must remain the full 260px shared-shell width');
[
  '--shell-sidebar-collapsed-w',
  '.sidebar.collapsed',
  'sidebar-collapse-toggle',
  'toggleSidebarCollapsed',
  'clpeasy-builder-sidebar-collapsed',
  'snav-label'
].forEach(token => assert(!rawSource.includes(token), `reversed sidebar-collapse feature is still present: ${token}`));
assert(/\.sidebar\{[\s\S]{0,260}transition:transform \.25s ease;/.test(rawSource), 'sidebar transition should be restored to the shared-shell transform-only rule');
assert(/@media\(max-width:900px\)\{\s*\.sidebar\{transform:translateX\(-100%\)/.test(rawSource), 'shared-shell mobile drawer breakpoint should be restored to 900px');

assert(/\.builder-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) clamp\(320px,24vw,380px\);gap:20px;padding:20px 32px 40px;max-width:1850px;/.test(rawSource), 'expected a form-dominant two-column grid with a 320-380px preview column');
assert(!/height:calc\(100vh - 230px\)/.test(rawSource), 'the removed viewport-bounded workspace height must not return');
assert(!/\.wizard-panel\{grid-row:1\/3/.test(rawSource), 'the form must not span artificial bounded-workspace rows');
assert(!/\.builder-accordion\{flex:1;min-height:0/.test(rawSource), 'the removed internal-scroll flex chain must not return');
assert(!/\.builder-accordion-section\.active\{display:flex;flex-direction:column;flex:1;min-height:0/.test(rawSource), 'the active step must not be forced into the removed internal-scroll flex chain');
assert(/\.builder-accordion-body\{padding:2px 6px 12px 0;max-height:none;overflow-y:visible;\}/.test(rawSource), 'step bodies must use ordinary page flow, not their own scrollbar');
assert(!/\.builder-accordion-body\{[^}]*overflow-y:auto/.test(rawSource), 'no builder step body may retain overflow-y:auto');
assert(!/\.builder-accordion-body\{[^}]*scrollbar-gutter/.test(rawSource), 'no builder step body may retain nested-scroll gutter sizing');

const desktopBlockMatch = rawSource.match(/@media\(min-width:861px\)\{\r?\n  \.wizard-panel\{grid-column:1;align-self:start;\}[\s\S]*?\r?\n\}\r?\n<\/style>/);
assert(desktopBlockMatch, 'could not isolate the final desktop layout override');
const desktopBlock = desktopBlockMatch[0];
assert(/\.right-column\{grid-column:2;grid-row:1;align-self:start;height:auto;overflow:visible;position:static;/.test(desktopBlock), 'preview must remain explicitly beside the form in desktop column 2');
assert(/\.builder-accordion-section:not\(\.active\)\{display:none;\}/.test(desktopBlock), 'duplicate inactive accordion headers should stay hidden on desktop');
assert(/\.preview-canvas-area\{min-height:0;\}/.test(desktopBlock), 'preview canvas must hug its content rather than retain the old 460px floor');
assert(/\.compliance-card\.builder-rail-card\{grid-row:2;padding:12px 16px;/.test(desktopBlock), 'compact compliance card should remain beneath the preview');
assert(/\.builder-accordion-body\.step1-active\{display:grid;grid-template-columns:1fr 1fr;/.test(desktopBlock), 'Step 1 two-column reflow must remain intact');

// Step 1 size controls are deliberately direct-entry only: the visible
// preset cards duplicated the dimensions fields and consumed the vertical
// space this redesign is meant to recover. Internal selectSize()/applySize()
// remain for saved-label compatibility and programmatic callers.
const step1Source = rawSource.match(/<div class="step-panel active" id="step-1">[\s\S]*?<!-- STEP 2 -->/)?.[0] || '';
assert(step1Source, 'could not isolate Step 1 source markup');
assert(!/>Preset sizes</.test(step1Source), 'visible Preset sizes heading must be removed from Step 1');
assert(!/class="size-grid"/.test(step1Source), 'visible preset-size cards must be removed from Step 1');
assert(!/Choose a preset or enter your own dimensions/.test(step1Source), 'obsolete preset-size helper text must be removed');
const appearanceSource = step1Source.match(/<div id="label-appearance-section">[\s\S]*?<\/div><!-- \/#label-appearance-section -->/)?.[0] || '';
assert(appearanceSource, 'could not isolate #label-appearance-section');
assert(appearanceSource.includes('id="custom-w-group"') && appearanceSource.includes('id="custom-h-group"'), 'Dimensions must live inside #label-appearance-section');
assert(/id="custom-w-label">Diameter \(mm\)<\/label>/.test(appearanceSource), 'Circle must initially present one Diameter field');
assert(/id="custom-h-group" style="display:none;"/.test(appearanceSource), 'Height field must initially be hidden for Circle');
assert(/function selectSize\(sz\)\{applySize\(sz\);\}/.test(rawSource), 'internal selectSize compatibility function must remain');

assert(/\.preview-panel\{background:white/.test(rawSource), 'outer preview panel should remain white');
assert(/#preview-stage\{[^}]*padding:12px[^}]*background:var\(--off\)/.test(rawSource), 'close-fitting grey preview stage with 12px padding is missing');
assert(/const MAX_DISPLAY_PX=290;/.test(rawSource), 'preview display cap must be 290px');
assert(/const capZoom=Math\.min\(MAX_DISPLAY_PX\/vbW,MAX_DISPLAY_PX\/vbH\);/.test(rawSource), 'preview cap must preserve aspect ratio');
assert(/const fitZoom=Math\.min\(widthZoom,heightZoom,capZoom\);/.test(rawSource), 'fit-to-view must apply width, height and display-cap constraints');
assert(!/area\.clientHeight/.test(rawSource.replace(/\/\/[^\n]*area\.clientHeight[^\n]*/g,'')), 'fit calculation must not functionally read the preview area\'s circular clientHeight');
assert(/getComputedStyle\(el\)/.test(rawSource) && /const BREATHING=8;/.test(rawSource), 'dynamic preview inset calculation must remain intact');

assert(/@media\(max-width:860px\)\{\.builder-layout\{display:block/.test(rawSource), 'mobile Builder stacking rule is missing');
assert(/\.approved-stage-nav\{position:fixed;left:0;right:0;bottom:0;/.test(rawSource), 'mobile fixed Back/Continue bar is missing');
const styleSource = rawSource.slice(rawSource.indexOf('<style>'), rawSource.indexOf('</style>'));
assert.strictEqual((styleSource.match(/\/\*/g)||[]).length, (styleSource.match(/\*\//g)||[]).length, 'CSS block comments are unbalanced');

console.log('static desktop workspace checks passed');

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

    // ── (27 Sep 2026) Preview grey-space / #preview-stage structure ───────
    // Checked here (still on Step 5) before the navigation re-check below
    // moves back to Step 1 and parks fine-tune in staging again.
    const svgContainer = document.getElementById('label-svg-container');
    assert(svgContainer, '#label-svg-container is missing');
    const stage = document.getElementById('preview-stage');
    assert(stage, '#preview-stage wrapper is missing');
    assert.strictEqual(svgContainer.parentElement, stage, '#label-svg-container must be nested inside #preview-stage');
    assert.strictEqual(stage.parentElement.id, 'preview-canvas-area', '#preview-stage must be a direct child of #preview-canvas-area');
    assert.strictEqual(finetune.parentElement.id, 'preview-canvas-area', 'Step 5 fine-tune must remain a direct sibling of #preview-stage inside #preview-canvas-area (not nested inside the stage itself)');
    // Zoom/fit wiring must still target the same elements by the same ids
    // (functions themselves, and their own numeric correctness, are
    // covered end-to-end by tests/preview-zoom-fit.js -- this just proves
    // this correction didn't disconnect that wiring).
    assert(typeof window.recomputePreviewFit === 'function', 'recomputePreviewFit() is missing');
    assert(typeof window.applyZoomToSVG === 'function', 'applyZoomToSVG() is missing');
    assert(typeof window.fitPreviewToView === 'function', 'fitPreviewToView() is missing');

    // Existing stepper navigation/validation/data-retention behaviour
    // (already covered in tests/builder-step-navigation-layout.js) must
    // still work unchanged after this third correction -- re-exercised
    // briefly here since this correction touches the accordion sections
    // those clicks operate on.
    window.setApprovedBuilderStep(1);
    const stepperItems = [...document.querySelectorAll('.stepper-item')];
    stepperItems[2].click(); // step 3 from step 1 -- must still be blocked
    assert.strictEqual(window.eval('approvedBuilderStep'), 1, 'forward-skip validation via the stepper regressed');
    document.getElementById('scent-name').value = 'Regression Check';
    stepperItems[1].click(); // -> step 2 (step 1 already valid from earlier in this test)
    assert.strictEqual(window.eval('approvedBuilderStep'), 2, 'stepper-driven navigation (setApprovedBuilderStep reuse) regressed');
    stepperItems[0].click(); // back to completed step 1
    assert.strictEqual(document.getElementById('scent-name').value, 'Regression Check', 'data retention when returning to a completed step regressed');

    // ── Step 1 body carries the step1-active marker (sixth correction) ────
    window.setApprovedBuilderStep(1);
    const step1Body = document.querySelector('.builder-accordion-body');
    assert(step1Body.classList.contains('step1-active'), 'Step 1 accordion body must carry the step1-active class for the desktop 2-column reflow');
    assert(document.getElementById('step-1'), '#step-1 missing from the DOM');
    assert(document.getElementById('label-appearance-section'), '#label-appearance-section missing from the DOM');
    const appearance = document.getElementById('label-appearance-section');
    const widthGroup = document.getElementById('custom-w-group');
    const widthLabel = document.getElementById('custom-w-label');
    const widthInput = document.getElementById('custom-w');
    const heightGroup = document.getElementById('custom-h-group');
    const heightInput = document.getElementById('custom-h');
    assert(appearance.contains(widthGroup) && appearance.contains(heightGroup), 'Dimensions must render inside Label appearance');
    assert([...step1Body.children].indexOf(document.getElementById('step-1')) < [...step1Body.children].indexOf(appearance), 'mobile/source reading order must keep load/shape before appearance/dimensions');

    // Circle: a single Diameter field, with equal internal dimensions.
    window.selectShape('circle');
    window.selectSize(63);
    assert.strictEqual(widthLabel.textContent, 'Diameter (mm)', 'Circle must label its one visible field Diameter');
    assert.strictEqual(heightGroup.style.display, 'none', 'Circle must hide Height');
    assert.strictEqual(widthGroup.style.gridColumn, '1 / -1', 'Circle Diameter field must span the dimensions row');
    assert.strictEqual(widthInput.value, '63', 'internal 63mm preset compatibility regressed for Circle');
    assert.deepStrictEqual({...window.getDims()}, {mmW:63,mmH:63,pw:260,ph:260}, 'Circle dimensions must remain equal');
    widthInput.value='58';heightInput.value='99';window.onDimInput();
    assert.strictEqual(window.eval('S.customH'), 58, 'Circle direct entry must mirror Diameter internally instead of retaining hidden Height');

    // Square: a single Size field, also equal on both axes.
    window.selectShape('square');
    window.selectSize(75);
    assert.strictEqual(widthLabel.textContent, 'Size (mm)', 'Square must label its one visible field Size');
    assert.strictEqual(heightGroup.style.display, 'none', 'Square must hide Height');
    assert.deepStrictEqual({...window.getDims()}, {mmW:75,mmH:75,pw:260,ph:260}, 'Square dimensions must remain equal');

    // Rectangle: Width and Height are both visible and independently used.
    window.selectShape('rectangle');
    widthInput.value='63';heightInput.value='44';window.onDimInput();
    assert.strictEqual(widthLabel.textContent, 'Width (mm)', 'Rectangle must label its first field Width');
    assert.strictEqual(heightGroup.style.display, 'block', 'Rectangle must show Height');
    assert.strictEqual(widthGroup.style.gridColumn, 'auto', 'Rectangle Width must share the row with Height');
    assert.deepStrictEqual({...window.getDims()}, {mmW:63,mmH:44,pw:260,ph:182}, 'Rectangle must preserve independent Width and Height');

    // Restore the ordinary starting fixture before the remaining navigation
    // and preservation checks run.
    window.selectShape('circle');
    window.selectSize(52);
    window.setApprovedBuilderStep(2);
    const step2Body = document.querySelector('.builder-accordion-body');
    assert(!step2Body.classList.contains('step1-active'), 'step1-active must not leak onto other steps\' accordion bodies');

    // ── DOM-rescue fix stress test (sixth correction, requirement #4) ────
    // #label-appearance-section/#label-warn-stage4 must survive MANY
    // navigation hops with exactly one instance each -- not deleted (the
    // original bug), and not duplicated (a plausible failure mode of a
    // naive fix that rescues without checking for an existing copy).
    const navSequence = [2,1,3,1,4,1,5,1,2,3,4,5,1,1,1,2,1];
    navSequence.forEach(n => window.setApprovedBuilderStep(n));
    assert.strictEqual(document.querySelectorAll('#label-appearance-section').length, 1, `expected exactly one #label-appearance-section after ${navSequence.length} navigation hops, found ${document.querySelectorAll('#label-appearance-section').length}`);
    assert.strictEqual(document.querySelectorAll('#label-warn-stage4').length, 1, `expected exactly one #label-warn-stage4 after ${navSequence.length} navigation hops, found ${document.querySelectorAll('#label-warn-stage4').length}`);
    const survivingAppearance = document.getElementById('label-appearance-section');
    assert(survivingAppearance.textContent.includes('Label appearance'), 'surviving #label-appearance-section lost its content');
    assert(document.getElementById('label-bg-colour'), 'surviving #label-appearance-section is missing its background-colour control');
    assert(document.getElementById('text-dark'), 'surviving #label-appearance-section is missing its text-colour control');
    assert.strictEqual(survivingAppearance.parentElement, document.querySelector('.builder-accordion-body'), '#label-appearance-section must be a direct child of the (Step 1) accordion body, not stranded elsewhere');

    const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
    assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);
    // Structural presence of the inactive accordion section triggers --
    // the CSS hides them at desktop widths (can't be verified visually
    // here), but the underlying elements/behaviour must still exist for
    // mobile, where the desktop media query doesn't apply.
    const allSections = document.querySelectorAll('.builder-accordion-section');
    assert.strictEqual(allSections.length, 5, 'expected all 5 accordion sections (1 active + 4 inactive) to still exist in the DOM -- desktop hides them via CSS only, they must not be removed from markup (which would also break mobile)');
    const inactiveTriggers = [...allSections].filter(s=>!s.classList.contains('active'));
    assert.strictEqual(inactiveTriggers.length, 4, 'expected exactly 4 inactive accordion sections to remain clickable/present for mobile');

    // ── (27 Sep 2026) Step 1 warning relocation / Step 3 contextual note ──
    const step1 = document.getElementById('step-1');
    assert(!/solely responsible for ensuring your labels/i.test(step1.textContent), 'Step 1 must no longer contain the general responsibility disclaimer text');
    assert(!/CLPeasy generates labels based on the data you enter/i.test(step1.textContent), 'Step 1 must no longer contain the old general disclaimer wording');
    // The UNRELATED custom-size-too-small warning (also .field-alert-warn,
    // shown dynamically for an invalid custom size) is a different,
    // legitimate message and must NOT have been removed.
    assert(document.getElementById('custom-size-warn'), 'the unrelated custom-size-too-small warning was incorrectly removed along with the disclaimer');
    const step3 = document.getElementById('step-3');
    const contextualNotes = [...step3.querySelectorAll('.field-alert-info')];
    assert.strictEqual(contextualNotes.length, 1, `expected exactly one contextual info message in Step 3, found ${contextualNotes.length}`);
    const expectedWording = "Use safety information that matches your finished product and actual fragrance percentage. For candles and wax melts, use the supplier's CLP information for that percentage rather than information for the 100% concentrated oil.";
    assert(contextualNotes[0].textContent.includes(expectedWording), `Step 3 contextual note must use the exact specified wording, got: ${JSON.stringify(contextualNotes[0].textContent.trim())}`);
    // Must sit above/immediately beside Smart Paste, not buried elsewhere.
    const smartPasteBox = step3.querySelector('.smart-paste-box');
    assert(smartPasteBox, 'Smart Paste box is missing from Step 3');
    const noteAndBoxSiblings = [...smartPasteBox.parentElement.children];
    assert(noteAndBoxSiblings.indexOf(contextualNotes[0]) < noteAndBoxSiblings.indexOf(smartPasteBox), 'the contextual note must appear above/before the Smart Paste box, not after it');
    // The existing mandatory confirmation checkbox (a distinct, binding
    // "I confirm..." gate) must be completely unchanged by this correction.
    const confirmLabel = document.getElementById('hazard-confirm-block');
    assert(confirmLabel && /I confirm the hazard data shown in the Smart Paste section above is correct/.test(confirmLabel.textContent), 'existing Step 3 hazard-confirm checkbox text was altered');

    console.log('DOM structure / Smart Paste / fine-tune regression checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    window.close();
  }
}, 500);
