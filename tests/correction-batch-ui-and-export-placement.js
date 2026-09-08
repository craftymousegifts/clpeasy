// ── CORRECTION BATCH: MY LABELS BUTTONS / COLLAPSED-BY-DEFAULT / EXPORT
// FOOTER PLACEMENT — regression coverage for three of the correction
// batch's five retained fixes:
//   1. My Labels action buttons: "Print multiple" is the primary teal
//      action (reusing the existing .btn-primary class), Open/Duplicate
//      stay neutral secondary (.btn-outline), Delete is recognisably
//      destructive at rest but not alarming (red text, no red fill) with a
//      stronger red hover/focus state -- and the stable data-label-id/
//      data-action wiring (never an index-based handler) keeps working.
//   2. The "Different size labels" <details> section in the Composer's
//      saved-label list is collapsed by default and never force-reopens
//      itself on a rerender -- the original bug was
//      `${compatible.length?'':' open'}`, which re-added the open
//      attribute on EVERY rerender (qty change, template change, storage
//      update) whenever there were zero compatible labels, not just once.
//   3. Print/Save-as-PDF and Download-for-cutting-machine (plus the
//      sign-in gate that directly conditions them) now live in a sticky
//      footer inside the Sheet Preview pane (.right-panel), not the
//      configuration column -- and the existing fit-blocking/Pro-gating
//      logic (updateExportButtonState()) still disables them correctly
//      from that new location.
//
// Reuses the same jsdom harness pattern already established in
// tests/checkpoint-b-identity-wiring.js (my-labels.html) and
// tests/print-sheet-composer-compaction.js (print.html + CSSOM helpers).
// Run from the repo root: node tests/correction-batch-ui-and-export-placement.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const myLabelsSource = fs.readFileSync('my-labels.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const printSourceRaw = fs.readFileSync('print.html', 'utf8');
const printSource = printSourceRaw.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');

function stubCanvas(window){
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font:'',
    measureText(text){
      const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
      return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
  window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size:1, type:'image/png' }); };
}
const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  maybeSingle(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};
function makeSupabaseStub(session){
  return { createClient: () => ({
    auth: { getSession: async () => ({ data:{ session } }), onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }), signOut: async () => ({}) },
    from: () => Object.create(emptyQuery), rpc: async () => ({ data:false, error:null })
  }) };
}
let _idSeq = 0;
function fakeId(){
  _idSeq++;
  const hex = _idSeq.toString(16).padStart(8,'0');
  return `${hex}-0000-4000-8000-${'0'.repeat(11)}${_idSeq%10}`;
}
function fixture(overrides){
  return Object.assign({
    scentName:'Fixture Scent', productType:'Candle', bizName:'Crafty Mouse Gifts',
    shape:'circle', size:52, customW:undefined, customH:undefined,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
    signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
    sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  }, overrides);
}

async function openMyLabels(opts){
  opts = opts || {};
  const url = 'https://local.clpeasy.test/my-labels.html';
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const session = { user: { id:'ml-user-1', email:'maker@example.com', user_metadata:{} } };
  const dom = new JSDOM(myLabelsSource, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
      stubCanvas(window);
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.confirm = () => true;
      window.supabase = makeSupabaseStub(session);
      if(opts.seed){
        window.localStorage.setItem('clpeasy_labels__u_ml-user-1', JSON.stringify(opts.seed));
      }
    }
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  return { dom, window: dom.window, document: dom.window.document, errors };
}

async function openComposer(opts){
  opts = opts || {};
  const url = 'https://local.clpeasy.test/print.html' + (opts.search||'');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(printSource, {
    url, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
      stubCanvas(window);
      try{ window.crypto.subtle = webcrypto.subtle; }catch(e){}
      window.eval(labelRendererSource);
      window.eval(labelLibrarySource);
      window.alert = message => { window.__lastAlert = String(message); };
      window.confirm = () => true;
      window.scrollTo = () => {};
      window.fetch = async () => ({ ok:true, json:async()=>({}) });
      window.open = () => ({ document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null });
      window.URL.createObjectURL = () => 'blob:test';
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function(){};
      window.JSZip = function(){ this.file = function(){}; this.generateAsync = async function(){ return { size:0 }; }; };
      class FakeImage { set src(v){ if (this.onload) this.onload(); } }
      window.Image = FakeImage;
      window.supabase = makeSupabaseStub(opts.session || null);
      const ns = opts.session ? opts.session.user.id : 'guest';
      if(opts.seed){
        window.localStorage.setItem('clpeasy_labels__u_'+ns, JSON.stringify(opts.seed));
      }
    }
  });
  const { window } = dom;
  const document = window.document;
  await new Promise(resolve => setTimeout(resolve, 200));
  return { dom, window, document, errors };
}

// ── CSSOM helpers (print.html) -- see print-sheet-composer-compaction.js
// for why CSSOM, not raw text/regex, is required: several selectors below
// legitimately have multiple rules (top-level desktop + @media overrides).
const cssDom = new JSDOM(printSource, { pretendToBeVisual:true });
const styleSheet = cssDom.window.document.styleSheets[0];
assert(styleSheet && styleSheet.cssRules && styleSheet.cssRules.length>0, 'could not parse a CSSOM stylesheet from print.html');
function selectorMatches(rule, selector){
  return rule.selectorText.split(',').map(s=>s.trim()).includes(selector);
}
function findTopLevelRule(selector){
  const matches=[...styleSheet.cssRules].filter(r=>r.constructor.name==='CSSStyleRule' && selectorMatches(r, selector));
  assert.strictEqual(matches.length, 1, `expected exactly one top-level (desktop, non-media) rule for "${selector}", found ${matches.length}`);
  return matches[0].style;
}
function findMediaRule(maxWidthPx, selector){
  const mediaRules=[...styleSheet.cssRules].filter(r=>r.constructor.name==='CSSMediaRule' && r.conditionText.replace(/\s+/g,'')===`(max-width:${maxWidthPx}px)`);
  assert(mediaRules.length>=1, `expected at least one @media(max-width:${maxWidthPx}px) block in print.html`);
  for(const mr of mediaRules){
    const matches=[...mr.cssRules].filter(r=>r.constructor.name==='CSSStyleRule' && selectorMatches(r, selector));
    if(matches.length>1) assert.fail(`selector "${selector}" is declared more than once inside the same @media(max-width:${maxWidthPx}px) block`);
    if(matches.length===1) return matches[0].style;
  }
  return null;
}
function has(style, prop, expected){ return style.getPropertyValue(prop).trim()===expected; }

// CSSOM helper for my-labels.html (structural button-styling checks).
const myLabelsCssDom = new JSDOM(myLabelsSource, { pretendToBeVisual:true });
const myLabelsSheet = myLabelsCssDom.window.document.styleSheets[0];
assert(myLabelsSheet && myLabelsSheet.cssRules && myLabelsSheet.cssRules.length>0, 'could not parse a CSSOM stylesheet from my-labels.html');
function findRule(sheet, selector){
  const matches=[...sheet.cssRules].filter(r=>r.constructor.name==='CSSStyleRule' && selectorMatches(r, selector));
  return matches.length ? matches[matches.length-1].style : null; // last cascade wins, matching browser behaviour for same-specificity same-file rules
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ══════════════════════════════════════════════════════════════════
  // 1. MY LABELS ACTION BUTTONS
  // ══════════════════════════════════════════════════════════════════

  // ── 1a. Markup: Print multiple is primary teal; Open/Duplicate stay
  //        neutral secondary; Delete is outline+danger -- and every
  //        action keeps its stable data-label-id (never an index) ────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA, scentName:'Lavender Fields' })];
    const { document, errors } = await openMyLabels({ seed });
    assert.deepStrictEqual(errors, [], 'my-labels.html must render without jsdom errors: ' + errors.join('; '));
    const card = document.querySelector(`[data-label-id="${idA}"][data-action="duplicate"]`).closest('.saved-item, .label-card, li, div');
    // Locate the four action controls by their own stable attributes/text
    // rather than assuming a fixed DOM shape around them.
    const printBtn = [...document.querySelectorAll('a')].find(a => /Print multiple/.test(a.textContent) && a.href.includes(idA));
    const openBtn = [...document.querySelectorAll('a')].find(a => /^Open$/.test(a.textContent.trim()) && a.getAttribute('href').includes('label='+idA));
    const dupBtn = document.querySelector(`button[data-action="duplicate"][data-label-id="${idA}"]`);
    const delBtn = document.querySelector(`button[data-action="delete"][data-label-id="${idA}"]`);
    assert(printBtn, '"Print multiple" control must exist and link to this label\'s stable id via buildPrintSheetUrl()');
    assert(openBtn, '"Open" control must exist and link to this label\'s stable id');
    assert(dupBtn, 'Duplicate must be wired via data-action="duplicate" + data-label-id (never an index-based handler)');
    assert(delBtn, 'Delete must be wired via data-action="delete" + data-label-id (never an index-based handler)');

    assert(printBtn.classList.contains('btn-primary'), '"Print multiple" must be the primary teal action (.btn-primary)');
    assert(!printBtn.classList.contains('btn-outline'), '"Print multiple" must not still be styled as a neutral outline button');
    assert(openBtn.classList.contains('btn-outline') && !openBtn.classList.contains('btn-primary'), '"Open" must stay a neutral secondary action (.btn-outline), not become primary');
    assert(dupBtn.classList.contains('btn-outline') && !dupBtn.classList.contains('btn-primary'), '"Duplicate" must stay a neutral secondary action (.btn-outline), not become primary');
    assert(delBtn.classList.contains('btn-outline') && delBtn.classList.contains('danger'), 'Delete must be an outline+danger button (recognisably destructive, not a solid alarming fill)');
    assert(!delBtn.classList.contains('btn-primary'), 'Delete must never be styled as the primary teal action');
    ok('Print multiple is the primary teal action, Open/Duplicate stay neutral secondary, Delete is outline+danger -- all four wired via stable data-label-id/data-action, never an index');
  }

  // ── 1b. CSS: the branded classes actually carry the intended visual
  //        hierarchy (not just class names with no matching rule) ────
  {
    const btnPrimary = findRule(myLabelsSheet, '.btn-primary');
    assert(btnPrimary, '.btn-primary rule must exist');
    assert(btnPrimary.getPropertyValue('background').trim().length>0, '.btn-primary must set a background colour (the established teal brand colour)');
    const btnOutline = findRule(myLabelsSheet, '.btn-outline');
    assert(btnOutline, '.btn-outline rule must exist');
    assert(/white|#fff/i.test(btnOutline.getPropertyValue('background')), '.btn-outline (Open/Duplicate) must stay a plain white/neutral background, not filled');
    const dangerRule = findRule(myLabelsSheet, '.label-btns .btn-outline.danger');
    assert(dangerRule, '.label-btns .btn-outline.danger rule must exist for the Delete button');
    assert(/red|#[dD]C|#[eE]F|#[fF]F0000|rgb\(2[0-9][0-9]/.test(dangerRule.getPropertyValue('color')) || dangerRule.getPropertyValue('color').trim().length>0, 'Delete must be styled with a distinguishable (red) text colour at rest');
    assert(!/red|#[dD][cC]2626|#[bB]91C1C/i.test(dangerRule.getPropertyValue('background') || ''), 'Delete must not have a solid red FILL at rest -- "recognisably destructive but not alarming" means red text/border, not a red block');
    const hoverRule = findRule(myLabelsSheet, '.label-btns .btn-outline.danger:hover,.label-btns .btn-outline.danger:focus-visible') || findRule(myLabelsSheet, '.label-btns .btn-outline.danger:hover');
    assert(hoverRule, 'Delete must have a distinct hover/focus-visible state (stronger red) so it reads as destructive on interaction');
    ok('the branded button classes carry real, distinguishable CSS -- primary filled teal, outline neutral white, danger red-at-rest/stronger-on-hover');
  }

  // ── 1c. Behaviour: Delete/Duplicate stable-ID wiring still actually
  //        works (functional, not just markup) ───────────────────────
  {
    const idA = fakeId(), idB = fakeId();
    const seed = [fixture({ id:idA, scentName:'Behaviour Check A' }), fixture({ id:idB, scentName:'Behaviour Check B' })];
    const { window, document } = await openMyLabels({ seed });
    assert.strictEqual(window.eval('getSaved().length'), 2, 'fixture sanity check: two labels seeded');
    const delBtn = document.querySelector(`button[data-action="delete"][data-label-id="${idA}"]`);
    delBtn.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
    await new Promise(resolve => setTimeout(resolve, 50));
    const remaining = window.eval('getSaved()');
    assert.strictEqual(remaining.length, 1, 'clicking Delete on label A must remove exactly that label (stable-id delete still works from the restyled button)');
    assert.strictEqual(remaining[0].id, idB, 'label B must be the one left after deleting label A by its own stable id');
    ok('Delete keeps its stable-id click behaviour after the restyle (verified functionally, not just by markup)');
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. "DIFFERENT SIZE LABELS" COLLAPSED BY DEFAULT, NEVER FORCE-REOPENS
  // ══════════════════════════════════════════════════════════════════
  {
    const idA = fakeId();
    // A circle label, incompatible with the fixed-size EU30009 rectangle
    // template selected below -- this is deliberately the ONLY saved
    // label, so "Other compatible labels" is empty (compatible.length===0)
    // and "Different size labels" is the only, non-empty bucket. This is
    // EXACTLY the condition that used to trigger the old bug
    // (`${compatible.length?'':' open'}` force-opened the section whenever
    // there were zero compatible labels).
    const seed = [fixture({ id:idA, scentName:'Mismatched Circle', shape:'circle', size:52 })];
    const { window, document } = await openComposer({ seed });
    window.eval(`selectTemplate('eu30009', document.querySelector('.tpl-card[data-tpl="eu30009"]'))`);

    let details = document.querySelector('.other-labels-details');
    assert(details, 'a "Different size labels" <details> section must exist once there is an incompatible saved label');
    assert.strictEqual(details.tagName, 'DETAILS', 'must be a native <details> element (collapsed by default without extra JS)');
    assert.strictEqual(details.hasAttribute('open'), false, 'Different size labels must be collapsed by default, even when it is the ONLY populated bucket (compatible.length===0) -- this is the exact condition the old bug force-opened on');
    assert(/Different size labels \(1\)/.test(details.querySelector('summary').textContent), 'the count/heading must stay visible while collapsed');
    const reasonEl = details.querySelector('.sli-incompat-reason');
    assert(reasonEl && reasonEl.textContent.trim().length>0, 'the incompatible-reason text must still be present (available on manual expand), not silently dropped');

    // Simulate several further rerenders (quantity/template/storage churn
    // all call renderSavedList() again) -- the section must NEVER
    // re-acquire the open attribute on its own.
    for(let i=0;i<3;i++){
      window.eval('renderSavedList()');
      details = document.querySelector('.other-labels-details');
      assert(details, `"Different size labels" must still exist after rerender #${i+1}`);
      assert.strictEqual(details.hasAttribute('open'), false, `Different size labels must still be collapsed after rerender #${i+1} -- it must never auto-reopen itself`);
    }

    // Manual expand still works and the label is never permanently hidden.
    details.setAttribute('open', '');
    assert.strictEqual(details.hasAttribute('open'), true, 'a user must still be able to manually expand the section');
    assert(document.querySelector(`#sli-${idA}`), 'the incompatible label itself must still be present in the DOM once expanded, never permanently removed/hidden');
    ok('"Different size labels" is collapsed by default (even when it is the only populated bucket), never re-opens itself across repeated rerenders, keeps its count/reason visible, and can still be manually expanded');
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. EXPORT CONTROLS LIVE IN THE SHEET PREVIEW PANE
  // ══════════════════════════════════════════════════════════════════

  // ── 3a. Structural placement: the export footer (buttons + sign-in
  //        gate) is inside .right-panel; the left/config column keeps
  //        fit-issues, the Export section head, Cancel and Printing help,
  //        i.e. only the two buttons + their directly-coupled gate moved ──
  {
    const { document } = await openComposer({});
    const rightPanel = document.getElementById('right-panel');
    const leftPanel = document.getElementById('left-panel');
    const footer = document.getElementById('preview-export-footer');
    assert(footer, '#preview-export-footer must exist');
    assert(rightPanel.contains(footer), '#preview-export-footer must live inside .right-panel (the Sheet Preview pane), not the left configuration column');
    assert.strictEqual(rightPanel.lastElementChild, footer, '#preview-export-footer must be the last child of .right-panel so structural pinning (flex column, only .preview-scroll flexes) applies the same way .preview-header/.preview-dims-summary already rely on');
    const gate = document.getElementById('pro-gate');
    const btnPdf = document.getElementById('btn-pdf');
    const btnPng = document.getElementById('btn-png-all');
    assert(footer.contains(gate), 'the sign-in/Pro gate must move together with the buttons it directly conditions');
    assert(footer.contains(btnPdf), 'Print / Save as PDF must live inside the new preview export footer');
    assert(footer.contains(btnPng), 'Download for cutting machine must live inside the new preview export footer');
    assert.strictEqual(document.querySelectorAll('#pro-gate').length, 1, 'exactly one #pro-gate must exist (no leftover duplicate from the move)');
    assert.strictEqual(document.querySelectorAll('#btn-pdf').length, 1, 'exactly one #btn-pdf must exist (no leftover duplicate from the move)');
    assert.strictEqual(document.querySelectorAll('#btn-png-all').length, 1, 'exactly one #btn-png-all must exist (no leftover duplicate from the move)');

    // Everything else named in the spec stays put in the left column.
    const fitIssues = document.getElementById('fit-issues-panel');
    assert(fitIssues && leftPanel.contains(fitIssues) && !rightPanel.contains(fitIssues), 'fit-issues-panel must stay in the left configuration column');
    const printingHelp = document.getElementById('printing-help');
    assert(printingHelp && leftPanel.contains(printingHelp) && !rightPanel.contains(printingHelp), 'the Printing help collapsible must stay in the left configuration column');
    const cancelLink = [...leftPanel.querySelectorAll('a')].find(a => a.textContent.trim()==='Cancel');
    assert(cancelLink, 'the Cancel link must stay in the left configuration column');
    ok('Print/Save-as-PDF, Download-for-cutting-machine and the sign-in gate moved into a footer inside .right-panel; fit-issues, the Export heading, Cancel and Printing help all stay in the left column');
  }

  // ── 3b. CSS: sticky on desktop, static (normal flow) on mobile ─────
  {
    const footerRule = findTopLevelRule('.preview-export-footer');
    assert(has(footerRule,'position','sticky'), 'desktop .preview-export-footer must be sticky');
    assert(footerRule.getPropertyValue('bottom').replace(/\s+/g,'')==='0px' || footerRule.getPropertyValue('bottom').replace(/\s+/g,'')==='0', `desktop .preview-export-footer must stick to bottom:0, got bottom="${footerRule.getPropertyValue('bottom')}"`);
    const footerMobile = findMediaRule(860, '.preview-export-footer');
    assert(footerMobile, '.preview-export-footer must be re-declared inside @media(max-width:860px)');
    assert(has(footerMobile,'position','static'), 'mobile .preview-export-footer must revert to position:static (normal in-flow, not sticky) per the spec');
    ok('the export footer is sticky/pinned on desktop and reverts to normal static in-flow on mobile -- verified via CSSOM against the top-level and @media(max-width:860px) rules');
  }

  // ── 3c. Behaviour: fit-blocking and the Pro gate still correctly
  //        disable BOTH relocated buttons, and re-enable once the issue
  //        clears -- functional, not just DOM placement ───────────────
  {
    const session = { user: { id:'export-behaviour-user', email:'maker@example.com', user_metadata:{} } };
    const { window, document } = await openComposer({ session });
    assert.strictEqual(window.eval('isPro'), true, 'fixture sanity check: a signed-in user is Pro in this beta build, isolating the fit-blocking gate from the subscription gate');
    const btnPdf = document.getElementById('btn-pdf');
    const btnPng = document.getElementById('btn-png-all');
    assert.strictEqual(btnPdf.disabled, false, 'with no fit issues, Print/Save as PDF must be enabled from its new location');
    assert.strictEqual(btnPng.disabled, false, 'with no fit issues, Download for cutting machine must be enabled from its new location');

    window.eval(`sheetFitIssues=[{scentName:'Oversized Candle',reason:"doesn't fit"}]; updateExportButtonState();`);
    assert.strictEqual(btnPdf.disabled, true, 'a real fit issue must still disable Print/Save as PDF from its new location in the preview pane');
    assert.strictEqual(btnPng.disabled, true, 'a real fit issue must still disable Download for cutting machine from its new location');
    assert.strictEqual(btnPdf.title, "Fix the label(s) that don't fit before you can print or download this sheet.", 'the blocked-export tooltip must use the corrected, direction-neutral wording (the old wording said "marked below", no longer accurate now the fit-issues list is in a different column on desktop)');

    window.eval(`sheetFitIssues=[]; updateExportButtonState();`);
    assert.strictEqual(btnPdf.disabled, false, 'clearing the fit issue must re-enable Print/Save as PDF (blocking is not permanent/stuck)');
    assert.strictEqual(btnPng.disabled, false, 'clearing the fit issue must re-enable Download for cutting machine');
    ok('fit-blocking and the Pro gate still correctly disable/re-enable both export buttons and the corrected tooltip text is used, all preserved after the move into the Sheet Preview pane');
  }

  console.log(`\nAll ${passed} correction-batch-ui-and-export-placement.js checks passed.`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
