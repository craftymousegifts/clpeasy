// ── COMPOSER COMPACTION — regression coverage for the correction batch's
// 8 "missing composer compaction" items:
//   1. Advanced Custom Sheet settings (margin/gaps) collapsed by default,
//      essential dims/cols/rows/total-slots stay visible.
//   2. The duplicate visible "Sheet summary" card is gone from the
//      controls column (kept only as a visually-hidden live-status region
//      so updateSummary()'s existing writes -- and other tests reading
//      sum-slots -- keep working).
//   3. The lengthy printing-help explanation collapses by default; the
//      export buttons stay immediately visible either way.
//   4. Desktop: controls and preview panes scroll independently, ordinary
//      page/body scrolling doesn't move both together.
//   5. The preview header/zoom/summary stay pinned (sticky) while the A4
//      preview scrolls underneath, on desktop.
//   6. Reserved/Filled/Remaining are three separate, complete fields --
//      never one ellipsis-truncated combined string.
//   7. Mobile media rules undo all of the above and restore normal
//      single-page flow.
//
// Uses the same two techniques already established in this test suite:
// jsdom for DOM/structural checks (tests/checkpoint-c-composer-identity.js
// et al.) and jsdom's parsed CSSOM (document.styleSheets[].cssRules) for
// CSS-only assertions. CSSOM, not raw regex/text matching, is required
// here specifically because several selectors below (.two-col, .left-panel,
// .right-panel, .preview-header, .preview-dims-summary, .preview-scroll)
// legitimately have MULTIPLE rules in print.html -- one top-level desktop
// declaration plus one or more re-declarations nested inside
// @media(max-width:900px) and @media(max-width:860px) blocks. A "first
// regex match in the whole stylesheet text" approach cannot tell those
// apart and will silently grab the wrong (media-scoped) declaration --
// this file previously did exactly that and had to be corrected. CSSOM
// (CSSStyleRule vs CSSMediaRule, each with its own precise selectorText/
// cssRules) resolves the ambiguity structurally instead.
// Layout engines (real viewport sizing, computed sticky behaviour, actual
// media-query evaluation) are still outside jsdom's scope -- see the
// equivalent scope note in tests/print-sheet-export-fidelity.js -- so
// these tests verify the DECLARED rules structurally, not rendered pixels.
// Run from the repo root: node tests/print-sheet-composer-compaction.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const printSourceRaw = fs.readFileSync('print.html', 'utf8');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
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
    shape:'circle', size:'custom', customW:52, customH:52,
    bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
    signal:'Warning', hStatements:'H315, H319', pStatements:'P302+P352, P305+P351+P338',
    sensitisers:['Linalool','Limonene'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
    hideEN15494:false, labelLang:'en',
  }, overrides);
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

// ── CSSOM helpers ───────────────────────────────────────────────────────
// A separate, lightweight jsdom document (no script execution needed) used
// purely to get print.html's <style> block parsed into a real CSSOM --
// document.styleSheets[0].cssRules -- so top-level rules and rules nested
// inside a specific @media block can be told apart precisely, instead of
// scanning the raw CSS text for the first matching selector (ambiguous
// when a selector legitimately has multiple rules, as several here do).
const cssDom = new JSDOM(printSource, { pretendToBeVisual:true });
const styleSheet = cssDom.window.document.styleSheets[0];
assert(styleSheet && styleSheet.cssRules && styleSheet.cssRules.length>0, 'could not parse a CSSOM stylesheet from print.html');

function selectorMatches(rule, selector){
  return rule.selectorText.split(',').map(s=>s.trim()).includes(selector);
}
// The exact-one top-level (outside any @media) CSSStyleRule for `selector`.
// Fails loudly (never silently picks the wrong one) if there isn't exactly
// one -- a selector styled twice at the top level, or not at all, is
// itself a bug worth surfacing.
function findTopLevelRule(selector){
  const matches=[...styleSheet.cssRules].filter(r=>r.constructor.name==='CSSStyleRule' && selectorMatches(r, selector));
  assert.strictEqual(matches.length, 1, `expected exactly one top-level (desktop, non-media) rule for "${selector}", found ${matches.length}`);
  return matches[0].style;
}
// The CSSStyleRule for `selector` nested inside @media(max-width:NNpx){...}.
// Returns null if that selector isn't re-declared inside that specific
// media block (distinct from "doesn't exist anywhere").
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
// CSSStyleDeclaration.getPropertyValue() normalises absent properties to
// '' -- these small wrappers make "was this ever set" assertions read
// clearly against that.
function has(style, prop, expected){
  return style.getPropertyValue(prop).trim()===expected;
}
function unset(style, prop){
  return style.getPropertyValue(prop).trim()==='';
}

(async () => {
  let passed = 0;
  function ok(label){ passed++; console.log('PASS:', label); }

  // ── 1. Advanced layout settings collapses by default; essential Custom
  //       Sheet info (dims, cols/rows, total slots) stays outside it ────
  {
    const { document } = await openComposer({});
    const details = document.getElementById('advanced-layout-settings');
    assert(details, 'an "Advanced layout settings" collapsible section must exist');
    assert.strictEqual(details.tagName, 'DETAILS', 'Advanced layout settings must be a native <details> element (collapsed by default without extra JS)');
    assert.strictEqual(details.hasAttribute('open'), false, 'Advanced layout settings must be collapsed (no "open" attribute) by default');
    assert(/Advanced layout settings/.test(details.querySelector('summary').textContent), 'the section must be labelled "Advanced layout settings"');
    // The margin/gap controls (the detailed/expert controls) live inside it.
    assert(details.querySelector('#cust-margin'), 'Margin mm control must be inside Advanced layout settings');
    assert(details.querySelector('#cust-gapH'), 'H gap mm control must be inside Advanced layout settings');
    assert(details.querySelector('#cust-gapV'), 'V gap mm control must be inside Advanced layout settings');
    // Essential info is OUTSIDE the collapsed section, i.e. not gated by it.
    const panel = document.getElementById('custom-dims-panel');
    assert(panel.querySelector('#cust-label-mm') && !details.contains(panel.querySelector('#cust-label-mm')), 'Label mm must stay visible outside Advanced layout settings');
    assert(panel.querySelector('#cust-cols') && !details.contains(panel.querySelector('#cust-cols')), 'Cols must stay visible outside Advanced layout settings');
    assert(panel.querySelector('#cust-rows') && !details.contains(panel.querySelector('#cust-rows')), 'Rows must stay visible outside Advanced layout settings');
    assert(panel.querySelector('#cust-rect-dims-row') && !details.contains(panel.querySelector('#cust-rect-dims-row')), 'the locked width/height read-out must stay visible outside Advanced layout settings');
    const totalSlotsRow = document.getElementById('custom-total-slots-row');
    assert(totalSlotsRow && !details.contains(totalSlotsRow), 'a total-slots read-out must stay visible outside Advanced layout settings');
    assert(/Total slots/.test(totalSlotsRow.textContent), 'the total-slots read-out must be labelled');
    ok('Advanced layout settings (margin/gaps) is collapsed by default; label dims, cols/rows and total slots stay visible outside it');
  }

  // ── 1b. The total-slots read-out actually reflects the real computed
  //        Custom Sheet grid, live ────────────────────────────────────
  {
    const idA = fakeId();
    const seed = [fixture({ id:idA })];
    const { window, document } = await openComposer({ seed });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    const slots = window.eval('getTplConfig().cols * getTplConfig().rows');
    assert.strictEqual(document.getElementById('custom-total-slots').textContent, String(slots), 'the total-slots read-out must match the real computed cols x rows');
    ok('the total-slots read-out reflects the real, live Custom Sheet grid');
  }

  // ── 2. The duplicate visible Sheet Summary card is gone; kept only as
  //       a visually-hidden live-status region (sum-* ids still work) ──
  {
    const { document } = await openComposer({});
    const summaryCard = document.querySelector('.sheet-summary');
    assert(summaryCard, 'the sheet-summary element must still exist in the DOM (JS/other tests still update it)');
    let hiddenAncestor = summaryCard;
    let foundHiddenClass = false;
    while(hiddenAncestor){
      if(hiddenAncestor.classList && hiddenAncestor.classList.contains('visually-hidden')){ foundHiddenClass = true; break; }
      hiddenAncestor = hiddenAncestor.parentElement;
    }
    assert(foundHiddenClass, 'the Sheet Summary card must be wrapped in a .visually-hidden container, not shown as a second visible card');
    const vh = findTopLevelRule('.visually-hidden');
    assert(has(vh,'position','absolute'), '.visually-hidden must remove the element from the normal visual flow (position:absolute)');
    assert(has(vh,'width','1px') && has(vh,'height','1px'), '.visually-hidden must use the standard 1px x 1px accessible-hiding technique');
    assert(has(vh,'padding','0px') || has(vh,'padding','0'), '.visually-hidden must zero out padding');
    assert(has(vh,'margin','-1px'), '.visually-hidden must use the standard -1px margin technique');
    assert(has(vh,'overflow','hidden'), '.visually-hidden must clip overflow');
    assert(vh.getPropertyValue('clip').replace(/\s+/g,'')==='rect(0px,0px,0px,0px)' || vh.getPropertyValue('clip').replace(/\s+/g,'')==='rect(0,0,0,0)', `.visually-hidden must use the standard clip:rect(0,0,0,0) technique, got: ${vh.getPropertyValue('clip')}`);
    assert(has(vh,'white-space','nowrap'), '.visually-hidden must prevent reflow with white-space:nowrap');
    assert(has(vh,'border','0px') || has(vh,'border','0px none') || vh.getPropertyValue('border').trim().startsWith('0'), '.visually-hidden must zero out border');
    assert(!/display:\s*none/.test(vh.cssText), '.visually-hidden must never use display:none (that would break aria-live announcements), got: ' + vh.cssText);
    // Still present and readable for JS/other tests.
    assert(document.getElementById('sum-tpl'), 'sum-tpl must still exist');
    assert(document.getElementById('sum-slots'), 'sum-slots must still exist (tests/custom-rect-grid-geometry.js reads it directly)');
    assert(document.getElementById('sum-added'), 'sum-added must still exist');
    assert(document.getElementById('sum-remain'), 'sum-remain must still exist');
    ok('the duplicate visible Sheet Summary card is gone -- kept only as a visually-hidden, still-functional live-status region using the standard accessible-hiding technique');
  }

  // ── 3. Printing help collapses by default; the export buttons remain
  //       immediately visible either way ─────────────────────────────
  {
    const { document } = await openComposer({});
    const details = document.getElementById('printing-help');
    assert(details, 'a "Printing help" collapsible section must exist');
    assert.strictEqual(details.tagName, 'DETAILS', 'Printing help must be a native <details> element');
    assert.strictEqual(details.hasAttribute('open'), false, 'Printing help must be collapsed by default');
    assert(/Printing help/.test(details.querySelector('summary').textContent), 'the section must be labelled "Printing help"');
    assert(/Home printing|Cutting machine/.test(details.textContent), 'the home-printing/cutting-machine explanation must live inside the collapsed section');
    const pdfBtn = document.getElementById('btn-pdf');
    const pngBtn = document.getElementById('btn-png-all');
    assert(pdfBtn && !details.contains(pdfBtn), 'Print / Save as PDF must remain immediately visible, not inside the collapsed Printing help section');
    assert(pngBtn && !details.contains(pngBtn), 'Download for cutting machine must remain immediately visible, not inside the collapsed Printing help section');
    ok('Printing help collapses by default; Print/Save as PDF and Download for cutting machine stay immediately visible');
  }

  // ── 4. Desktop: independent pane scrolling, not shared page scroll ──
  // (each selector below has 2-3 rules across print.html -- top-level
  // desktop plus mobile media overrides -- so the TOP-LEVEL rule must be
  // resolved via CSSOM, never "whichever occurrence a regex finds first".)
  {
    const twoCol = findTopLevelRule('.two-col');
    assert(has(twoCol,'height','100vh'), `desktop .two-col must be capped to exactly one viewport height (height:100vh), got height="${twoCol.getPropertyValue('height')}"`);
    assert(unset(twoCol,'min-height'), 'desktop .two-col must use height (not min-height) -- min-height would let both columns grow past the viewport and force page-level scrolling instead of independent pane scrolling');
    const leftPanel = findTopLevelRule('.left-panel');
    assert(has(leftPanel,'overflow-y','auto'), 'desktop .left-panel must scroll independently (overflow-y:auto)');
    const rightPanel = findTopLevelRule('.right-panel');
    assert(has(rightPanel,'display','flex') && has(rightPanel,'flex-direction','column') && has(rightPanel,'overflow','hidden'), 'desktop .right-panel must be a flex column that clips to its own bounds, delegating scrolling to .preview-scroll inside it');
    const previewScroll = findTopLevelRule('.preview-scroll');
    assert(previewScroll.getPropertyValue('flex-grow')==='1', 'desktop .preview-scroll must be the flexible (flex:1) part of the preview pane');
    assert(has(previewScroll,'overflow','auto'), 'desktop .preview-scroll must be the part of the preview pane that actually scrolls (overflow:auto)');
    ok('desktop controls (.left-panel) and preview (.preview-scroll inside .right-panel) have independent overflow behaviour, capped by a fixed-height .two-col -- verified via CSSOM against the top-level (non-media) rule for each selector');
  }

  // ── 5. Preview header/zoom/summary are sticky on desktop ───────────
  {
    const header = findTopLevelRule('.preview-header');
    assert(has(header,'position','sticky'), 'desktop .preview-header (heading + zoom controls) must be sticky at the top of the preview pane');
    assert(header.getPropertyValue('top').replace(/\s+/g,'')==='0px' || header.getPropertyValue('top').replace(/\s+/g,'')==='0', `desktop .preview-header must stick at top:0, got top="${header.getPropertyValue('top')}"`);
    const dims = findTopLevelRule('.preview-dims-summary');
    assert(has(dims,'position','sticky'), 'desktop .preview-dims-summary (the complete summary) must be sticky at the top of the preview pane');
    assert(dims.getPropertyValue('top').replace(/\s+/g,'')==='0px' || dims.getPropertyValue('top').replace(/\s+/g,'')==='0', `desktop .preview-dims-summary must stick at top:0, got top="${dims.getPropertyValue('top')}"`);
    ok('the preview header, zoom controls and complete summary are declared sticky at the top of the preview pane on desktop (top-level rules, verified via CSSOM)');
  }

  // ── 6. No summary value uses text-overflow:ellipsis; Reserved/Filled/
  //       Remaining are separate, complete fields ─────────────────────
  {
    const pdsVal = findTopLevelRule('.pds-val'); // only one rule for this selector anywhere in the file
    assert(unset(pdsVal,'text-overflow') || !has(pdsVal,'text-overflow','ellipsis'), '.pds-val must never truncate with text-overflow:ellipsis -- Template/Label/Layout/Reserved/Filled/Remaining must all stay fully readable');
    assert(!has(pdsVal,'white-space','nowrap'), '.pds-val must be allowed to wrap (no white-space:nowrap) rather than being forced onto one clipped line');

    const idA = fakeId();
    const seed = [fixture({ id:idA })];
    const { window, document } = await openComposer({ seed });
    window.eval(`selectTemplate('custom', document.querySelector('.tpl-card[data-tpl="custom"]'))`);
    window.eval(`addToSheet('${idA}')`);
    assert(!document.getElementById('pds-positions'), 'the old single combined pds-positions field must no longer exist');
    const reservedEl = document.getElementById('pds-reserved');
    const filledEl = document.getElementById('pds-filled');
    const remainingEl = document.getElementById('pds-remaining');
    assert(reservedEl && filledEl && remainingEl, 'Reserved, Filled and Remaining must each be their own separate element');
    assert(reservedEl!==filledEl && filledEl!==remainingEl && reservedEl!==remainingEl, 'Reserved, Filled and Remaining must be three genuinely distinct elements, not aliases of one');
    assert(/^\d+$/.test(reservedEl.textContent), `Reserved must show a complete plain number, got: ${reservedEl.textContent}`);
    assert(/^\d+$/.test(filledEl.textContent), `Filled must show a complete plain number, got: ${filledEl.textContent}`);
    assert(/^\d+$/.test(remainingEl.textContent), `Remaining must show a complete plain number, got: ${remainingEl.textContent}`);
    ok('Reserved/Filled/Remaining are three separate, complete, un-truncated fields; no .pds-val uses ellipsis');
  }

  // ── 7. Mobile media rules restore normal flow and remove the desktop
  //       independent-pane / sticky behaviour ─────────────────────────
  {
    const twoColMobile = findMediaRule(860, '.two-col');
    assert(twoColMobile, '.two-col must be re-declared inside @media(max-width:860px)');
    assert(has(twoColMobile,'height','auto'), 'mobile .two-col must revert to height:auto (undoing the desktop height:100vh cap) so the page can flow normally');
    assert(has(twoColMobile,'grid-template-columns','1fr'), 'mobile .two-col must restore the single-column stacked layout (grid-template-columns:1fr)');

    const leftPanelMobile = findMediaRule(860, '.left-panel');
    assert(leftPanelMobile, '.left-panel must be re-declared inside @media(max-width:860px)');
    assert(has(leftPanelMobile,'overflow-y','visible'), 'mobile .left-panel must drop its independent scrollbar (overflow-y:visible)');
    assert(has(leftPanelMobile,'height','auto'), 'mobile .left-panel must revert to height:auto');

    const rightPanelMobile = findMediaRule(860, '.right-panel');
    assert(rightPanelMobile, '.right-panel must be re-declared inside @media(max-width:860px)');
    assert(has(rightPanelMobile,'overflow','visible'), 'mobile .right-panel must drop overflow:hidden clipping (overflow:visible)');
    assert(has(rightPanelMobile,'height','auto'), 'mobile .right-panel must revert to height:auto');

    // Sticky preview header/summary must be switched off on mobile so they
    // can never obscure content in the normal-flow stacked layout.
    const headerMobile = findMediaRule(860, '.preview-header');
    const dimsMobile = findMediaRule(860, '.preview-dims-summary');
    assert(headerMobile, '.preview-header must be re-declared (directly or via a grouped selector) inside @media(max-width:860px)');
    assert(dimsMobile, '.preview-dims-summary must be re-declared (directly or via a grouped selector) inside @media(max-width:860px)');
    assert(has(headerMobile,'position','static'), 'mobile rules must set .preview-header back to position:static, removing the desktop sticky behaviour');
    assert(has(dimsMobile,'position','static'), 'mobile rules must set .preview-dims-summary back to position:static, removing the desktop sticky behaviour');

    const previewScrollMobile = findMediaRule(860, '.preview-scroll');
    assert(previewScrollMobile, '.preview-scroll must be re-declared inside @media(max-width:860px)');
    assert(has(previewScrollMobile,'overflow','visible'), 'mobile .preview-scroll must drop its own inner scrollbar (overflow:visible) now that the whole pane is back in normal flow');

    ok('mobile media rules (max-width:860px) restore normal single-page stacked flow and remove the desktop independent-pane/sticky behaviour -- verified via CSSOM against the rules actually nested inside that specific @media block');
  }

  console.log(`\nAll ${passed} print-sheet-composer-compaction.js checks passed.`);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
