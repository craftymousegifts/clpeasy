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
assert(/\.right-column\{grid-row:1;align-self:start;height:auto;overflow:visible;position:static;display:flex;flex-direction:column;\}/.test(rawSource), 'expected .right-column desktop override to use position:static (no self-scrolling), height:auto and align-self:start (content-hugging, not stretched to the row), not position:sticky or height:100%');

// .builder-layout must be height-bounded on desktop (the core fix: the
// outer page no longer needs to scroll for ordinary wizard use, so the
// stepper above it -- in normal flow -- is simply always on-screen).
assert(/\.builder-layout\{height:calc\(100vh - 230px\);min-height:520px;align-items:stretch;grid-template-rows:minmax\(0,1fr\) auto;\}/.test(rawSource), 'expected .builder-layout to be height-bounded on desktop with explicit grid-template-rows');

// .builder-accordion-body must be able to actually shrink/scroll on
// desktop: flex:1 + min-height:0 (the standard flexbox pattern that
// allows a flex child to be smaller than its content, enabling
// overflow-y:auto to actually engage) plus max-height:none there instead
// of a fixed vh-calc, since a real flex ancestor chain bounds it instead.
assert(/\.builder-accordion-body\{padding:2px 6px 12px 0;flex:1;min-height:0;/.test(rawSource), 'expected .builder-accordion-body to be flex:1;min-height:0 so it can shrink/scroll within the bounded workspace');
assert(/@media\(min-width:861px\)\{[\s\S]{0,2000}\.builder-accordion-body\{max-height:none;\}/.test(rawSource), 'expected the desktop override to set .builder-accordion-body max-height:none (bounded instead by the flex chain, not a fixed vh-calc)');

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

// ── (27 Sep 2026, preview grey-space correction -- REVISED per review) ──
// Colour direction: the OUTER unused area (.preview-panel, which the
// canvas area's background is inherited from) must be white/neutral, not
// the old --off grey, so it blends into the panel instead of reading as
// one giant grey field. The close-fitting #preview-stage is the ONE
// element that carries the grey background, tightly hugging the label.
assert(/\.preview-panel\{background:white/.test(rawSource), 'expected .preview-panel to be white (was the grey --off) so the outer unused area blends into the panel, not a big grey field');
assert(!/\.preview-panel\{background:var\(--off\)/.test(rawSource), 'the old grey .preview-panel background should have been replaced with white');
assert(/#preview-stage\{[^}]*background:var\(--off\)/.test(rawSource), 'expected #preview-stage to carry the grey (--off) background -- it is the one element that should read as grey, not the whole panel');
assert(!/#preview-stage\{[^}]*background:white/.test(rawSource), 'the first (rejected) version put a white stage inside the grey field -- #preview-stage must not be white');
// Padding: close-fitting (12-20px range), not the first version's 26px.
const stagePaddingMatch = rawSource.match(/#preview-stage\{[^}]*padding:(\d+)px/);
assert(stagePaddingMatch, '#preview-stage padding not found');
const stagePaddingPx = Number(stagePaddingMatch[1]);
assert(stagePaddingPx >= 12 && stagePaddingPx <= 20, `expected #preview-stage padding in the requested 12-20px range, got ${stagePaddingPx}px`);

// Fit-to-view must DERIVE its reserved space from the live elements'
// actual CSS (getComputedStyle), not a hard-coded number that silently
// duplicates whatever #preview-stage's padding happens to be in CSS --
// the first version's flat "-92" was exactly this problem: it would
// silently go stale the moment either element's padding changed in CSS.
assert(!/area\.clientWidth-92/.test(rawSource), 'the old hard-coded -92px magic number must not still be used');
assert(/getComputedStyle\(el\)/.test(rawSource) && /function boxInsets/.test(rawSource), 'expected recomputePreviewFit() to derive insets via getComputedStyle (boxInsets helper), not a hard-coded constant');
assert(/const BREATHING=8;/.test(rawSource), 'expected only a small explicit breathing-space constant to remain, not a large hard-coded total');


// The desktop override block was relocated (26 Sep 2026, third
// correction) to the very END of the stylesheet, so it always wins the
// cascade over ANY same-specificity base rule anywhere above it --
// this recurring bug (a later same-file base rule silently re-
// overriding an earlier desktop override) had already broken this fix
// twice by selector-specific patching; placing the whole block last
// removes the need to reason about it selector-by-selector. Confirm it
// sits after every relevant base rule, including ones a naive earlier
// placement missed (.preview-panel, .preview-canvas-area, the full
// .right-column base rule).
const styleCloseIdx = rawSource.indexOf('</style>');
assert(styleCloseIdx > -1, '</style> not found');
['\\.wizard-panel\\{background:white', '\\.builder-accordion\\{display:flex', '\\.builder-accordion-body\\{padding:2px 6px 12px 0', '\\.right-column\\{display:flex;flex-direction:column;gap:16px;\\}', '\\.preview-panel\\{background:white', '\\.preview-canvas-area\\{display:flex'].forEach(pattern=>{
  const idx = lastIndexOfRule(rawSource, pattern);
  assert(idx > -1, `base rule matching /${pattern}/ not found`);
  assert(idx < desktopBlockIdx, `base rule matching /${pattern}/ (at ${idx}) must come BEFORE the desktop scroll-model media query (at ${desktopBlockIdx})`);
});
// The desktop block itself must be the LAST thing before </style> (give
// or take the mobile-only media queries, which don't share selectors/
// specificity conflicts with it since their ranges are mutually
// exclusive) -- i.e. reasonably close to styleCloseIdx, not buried
// earlier where some future edit could reintroduce a same-specificity
// override after it again.
assert(styleCloseIdx - desktopBlockIdx < 10000, `desktop override block (at ${desktopBlockIdx}) is not close to the end of the stylesheet (</style> at ${styleCloseIdx}) -- the "always place last" strategy this comment relies on requires it to stay there`);

// ── THIRD desktop correction (26 Sep 2026, real QA at ~1884x672) ────────
// (1) inactive accordion sections duplicate the horizontal stepper and
// must be hidden entirely on desktop, but kept on mobile.
assert(/\.builder-accordion-section:not\(\.active\)\{display:none;\}/.test(rawSource), 'expected inactive .builder-accordion-section elements to be hidden on desktop (duplicate the horizontal stepper, and eat scarce height at short viewports)');
assert(!/@media\(max-width:860px\)\{[^}]*\.builder-accordion-section:not\(\.active\)\{display:none/.test(rawSource), 'inactive accordion sections must NOT be hidden on mobile -- only the desktop rule should do this');
// (2) preview panel/canvas must be allowed to shrink (not flex-shrink:0)
// and the right column must not scroll itself -- both inside the desktop
// block specifically (not as a global change that would also affect mobile).
assert(/\.preview-panel\{flex-shrink:0;\}/.test(rawSource), 'expected .preview-panel desktop override to be flex-shrink:0 (content-hugging, no longer flex:1/min-height:0 stretching to fill the row)');
assert(/\.preview-canvas-area\{min-height:0;\}/.test(rawSource), 'expected .preview-canvas-area desktop override to drop its 460px base min-height (content-hugging, no longer flex:1 stretching)');
// The base (unconditional) rule still has flex-shrink:0 -- proves the
// override is real (a property is actually being changed), not a no-op.
assert(/\.preview-panel\{background:white[^}]*flex-shrink:0;\}/.test(rawSource), 'expected the base .preview-panel rule to still have flex-shrink:0 (the desktop override must be changing something real)');


assert(/@media\(max-width:860px\)\{[\s\S]{0,60}\.builder-layout\{display:block/.test(rawSource), 'mobile .builder-layout block-stacking rule is missing or moved');
assert(/\.builder-accordion-body\{max-height:none;overflow:visible;padding-right:0;padding-bottom:76px;\}/.test(rawSource), 'mobile .builder-accordion-body override (full-page scroll, fixed bottom nav bar) is missing or changed');
assert(/\.approved-stage-nav\{position:fixed;left:0;right:0;bottom:0;/.test(rawSource), 'mobile fixed bottom Back/Continue bar rule is missing or changed');

// ── SECOND desktop correction (25 Sep 2026): .compliance-card's
// grid-column:2 placement created an implicit second grid row that
// .builder-layout never explicitly sized, so the default "auto" row-
// sizing algorithm shrank row 1 (containing .wizard-panel's flex chain,
// deliberately min-height:0 so it CAN shrink) down to near its min-content
// size instead of "the rest of the bounded workspace" -- real QA measured
// the active .builder-accordion-body collapsed to ~15.7px as a result.
// Fix: explicit grid-template-rows + .wizard-panel spanning both rows so
// the form column keeps the full bounded height regardless of how the
// right-hand stack (preview + compact compliance) splits across rows.
const desktopBlockMatch = rawSource.match(/@media\(min-width:861px\)\{\r?\n  \.builder-layout\{[\s\S]*?\r?\n\}\r?\n/);
assert(desktopBlockMatch, 'could not isolate the desktop scroll-model media query block for row-placement checks');
const desktopBlock = desktopBlockMatch[0];
assert(/\.builder-layout\{height:calc\(100vh - 230px\);min-height:520px;align-items:stretch;grid-template-rows:minmax\(0,1fr\) auto;\}/.test(desktopBlock), 'expected .builder-layout to declare explicit grid-template-rows (minmax(0,1fr) auto) so the implicit compliance-card row cannot silently starve row 1');
assert(/\.wizard-panel\{grid-row:1\/3;/.test(desktopBlock), 'expected .wizard-panel to span both grid rows (grid-row:1/3) so the form column keeps the full bounded workspace height');
assert(/\.right-column\{grid-row:1;/.test(desktopBlock), 'expected .right-column to be explicitly placed in row 1 (beside the top of the form)');
assert(/\.compliance-card\.builder-rail-card\{grid-row:2;/.test(desktopBlock), 'expected .compliance-card to be explicitly placed in row 2 (compact, below the preview)');

// Specificity check (the exact class of bug fixed twice already in this
// branch): .builder-rail-card{padding:20px} and .builder-rail-card
// h3{font-size:16px} are pre-existing, same-file rules with the SAME
// selector shape (one/two plain classes) as a naive ".compliance-card{...}"
// override would have -- equal specificity means whichever is LATER in
// the file wins, regardless of intent. The compact override must use a
// compound selector with MORE classes than what it needs to beat, so it
// wins on specificity and is immune to future reordering, not source
// position. (Simple heuristic: count ".className" segments in the
// selector text before "{" -- a real cascade engine agrees with this for
// selectors built only from class matches, which is all that's used here.)
function classCount(selectorText){ return (selectorText.match(/\.[\w-]+/g)||[]).length; }
const compliancePaddingSelector = desktopBlock.match(/([^\n{]+)\{grid-row:2;padding:12px 16px/);
assert(compliancePaddingSelector, 'compact .compliance-card padding override not found in the desktop block');
assert(classCount(compliancePaddingSelector[1]) > classCount('.builder-rail-card'), `.compliance-card's compact padding override must out-specify .builder-rail-card{padding:20px} (a same-file, same-specificity rule that appears LATER in the file and would otherwise silently win); selector was: ${compliancePaddingSelector[1]}`);
const complianceH3Selector = desktopBlock.match(/([^\n{]+)\{font-size:13px;margin:0;white-space:nowrap;\}/);
assert(complianceH3Selector, 'compact .compliance-card h3 override not found in the desktop block');
assert(classCount(complianceH3Selector[1]) > classCount('.builder-rail-card h3'), `.compliance-card h3's compact override must out-specify .builder-rail-card h3{font-size:16px} (same reasoning); selector was: ${complianceH3Selector[1]}`);

// ── SIXTH desktop correction (28 Sep 2026, real QA: preview took ~half
// the workspace, form was cramped, Step 1 scrolled internally) ──────────
// A. Form-dominant columns, bounded preview width (not a fraction of the
// row that can grow toward half the workspace).
assert(/\.builder-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) clamp\(360px,32vw,500px\);/.test(rawSource), 'expected .builder-layout columns to be minmax(0,1fr) [form] / clamp(360px,32vw,500px) [bounded preview], favouring the form');
assert(!/@media\(max-width:1280px\)\{\.builder-layout\{grid-template-columns/.test(rawSource), 'the old separate <=1280px column override (which gave the preview even MORE relative width at exactly the widths the form needed it most) should be gone -- the clamp() above covers all desktop widths');

// B. Preview panel content-hugging, not stretched to workspace height.
assert(/\.builder-layout\{align-items:start;\}/.test(desktopBlock), 'expected .builder-layout to override align-items to start on desktop so grid items no longer stretch to fill their row');
assert(/\.wizard-panel\{align-self:stretch;\}/.test(desktopBlock), 'expected .wizard-panel to keep an explicit align-self:stretch (its own full-height/internal-scroll behaviour must be unaffected by the align-items:start change above)');
assert(/\.right-column\{grid-row:1;align-self:start;height:auto;/.test(desktopBlock), 'expected .right-column to be align-self:start/height:auto (content-hugging) on desktop, not stretched');
assert(/\.preview-panel\{flex-shrink:0;\}/.test(desktopBlock), 'expected .preview-panel to no longer flex-grow (flex:1) to fill the row on desktop');
assert(!/\.preview-panel\{flex:1/.test(desktopBlock), 'the old flex:1 (stretch-to-fill) .preview-panel override must be gone');

// C. Step 1 compact two-column desktop arrangement.
assert(/n===1\?' step1-active':''/.test(rawSource), 'expected renderBuilderAccordion() to mark the Step 1 accordion body with a step1-active class');
assert(/\.builder-accordion-body\.step1-active\{display:grid;grid-template-columns:1fr 1fr;/.test(desktopBlock), 'expected a 2-column desktop grid for the Step 1 body');
assert(/\.builder-accordion-body\.step1-active #step-1\{order:1;/.test(desktopBlock), 'expected #step-1 (shape/size/dimensions) to be column 1');
assert(/\.builder-accordion-body\.step1-active #label-appearance-section\{order:2;/.test(desktopBlock), 'expected #label-appearance-section (appearance controls) to be column 2');

// D. Mobile (<=860px) rules must remain byte-for-byte the ones already
// verified above (no new assertions needed here -- the existing mobile
// checks earlier in this file already cover .builder-layout block-
// stacking, .builder-accordion-body's fixed-bottom-nav override, etc.,
// and none of those selectors/rules were touched by this correction).

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
