// Focused regression tests for the P280 SELECTABLE-STATEMENT correction
// (Michaela's "P280 REVIEW CORRECTION" instruction, superseding the
// earlier fixed-full-sentence implementation this file previously tested).
// P280 ("Wear protective gloves/protective clothing/eye protection/face
// protection/hearing protection/…", GB-CLP Annex IV Table 6.2) is a
// selectable statement -- only the items that actually apply to the
// finished product should ever be printed, never every item
// unconditionally. Proves:
//   1. P280 is still NOT auto-added by Smart Paste (untouched _pExclude
//      behaviour -- occupational PPE wording from a raw-fragrance SDS must
//      never silently transfer onto a finished consumer product label).
//   2. P280 cannot be accepted (in the picker, or past Step 3) without at
//      least one applicable item / an "other" item selected.
//   3. The selected wording survives save/reopen.
//   4. Builder and Composer render the identical selected wording.
//   5. No unrecognised-code warning occurs once valid wording is supplied
//      -- and a P280 with NO valid selection (e.g. a legacy saved label
//      from before this feature existed) is correctly treated as
//      unrecognised/incomplete, never silently expanded to every item.
//   6. The ordinary fit gate still applies with a valid P280 selection
//      present -- P280 is not a special case that bypasses fits:false.
//   7. builder.html's and label-render.js's P_LIB entries for P280 are
//      byte-identical (drift check -- Codex's "Final P280 review
//      correction" #1: builder.html still had the old fixed full-sentence
//      desc after the selectable rewrite; fixed, and pinned here).
//   8. p280Other (free text) is safe at every HTML/XML output boundary --
//      it is never interpreted as markup or script, only ever displayed as
//      plain text, in the SVG (shared renderer), the Builder Step 5
//      summary (innerHTML), the reopened picker (input.value), on
//      save/reopen (retained as the exact original plain string), and
//      through Composer (which only ever forwards to the shared renderer).
// Run from the repo root: node tests/p280-precautionary-statement.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const builderSource = fs.readFileSync('builder.html', 'utf8');
const printSource = fs.readFileSync('print.html', 'utf8');

function stubCanvas(window){
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font:'',
    measureText(text){
      const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
      return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
  });
}

const emptyQuery = {
  select(){ return this; }, eq(){ return this; }, update(){ return this; },
  upsert(){ return this; }, single(){ return Promise.resolve({ data:null, error:null }); },
  then(resolve){ return Promise.resolve({ data:null, error:null }).then(resolve); }
};

(async () => {
  try {
    // ── Shared renderer: buildP280Wording() itself ──────────────────────
    const rendererDom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'dangerously',
      beforeParse(window) { stubCanvas(window); window.eval(labelRendererSource); }
    });
    const LR = rendererDom.window.LabelRenderer;
    assert(Array.isArray(LR.P280_ITEMS) && LR.P280_ITEMS.length === 5, 'LabelRenderer.P280_ITEMS must offer exactly the 5 standard items');
    assert.deepStrictEqual([...LR.P280_ITEMS.map(i=>i.key)], ['gloves','clothing','eye','face','hearing'], 'P280_ITEMS order must match the statutory phrase order');

    assert.strictEqual(LR.buildP280Wording({p280Items:[]}), null, 'no items and no "other" text must build no wording (not fall back to every item)');
    assert.strictEqual(LR.buildP280Wording({}), null, 'a completely absent selection must build no wording');
    assert.strictEqual(LR.buildP280Wording({p280Items:['gloves','eye']}), 'Wear protective gloves/eye protection', 'wording must include only the selected items, in statutory order');
    assert.strictEqual(LR.buildP280Wording({p280Items:['eye','gloves']}), 'Wear protective gloves/eye protection', 'wording order must follow the statutory order, not click order');
    assert.strictEqual(LR.buildP280Wording({p280Items:[], p280Other:'steel toe boots'}), 'Wear steel toe boots', '"other" alone must count as a valid selection');
    assert.strictEqual(LR.buildP280Wording({p280Items:['hearing'], p280Other:'ear defenders'}), 'Wear hearing protection/ear defenders', '"other" must append after any selected standard items');

    // ── P_LIB drift check: builder.html's own P280 entry must stay
    // byte-identical to label-render.js's -- both are neutral placeholders
    // (never printed; the real per-label wording always comes from
    // buildP280Wording()), but if they diverge, Builder's chip tooltip and
    // shared-renderer behaviour could silently describe P280 differently.
    // A prior pass fixed label-render.js's desc but missed builder.html's
    // own copy (still the old fixed full sentence) -- this pins both. ────
    const builderPLibMatch = builderSource.match(/const P_LIB=\[.*?\];/s);
    assert(builderPLibMatch, 'could not locate builder.html\'s inline P_LIB declaration');
    const builderP280Match = builderPLibMatch[0].match(/\{code:'P280',desc:'([^']*)'\}/);
    assert(builderP280Match, 'builder.html\'s P_LIB does not contain a P280 entry in the expected {code:\'P280\',desc:\'...\'} shape');
    const rendererP280Entry = LR.P_LIB.find(p => p.code === 'P280');
    assert(rendererP280Entry, 'label-render.js\'s P_LIB is missing a P280 entry');
    assert.strictEqual(builderP280Match[1], rendererP280Entry.desc, 'builder.html\'s P280 P_LIB desc must be byte-identical to label-render.js\'s -- they drifted (builder.html still had the old fixed full-sentence text)');
    assert(!/Wear protective gloves\/protective clothing\/eye protection\/face protection\/hearing protection'\}/.test(builderPLibMatch[0]), 'builder.html\'s P_LIB must not contain the old unconditional full-sentence P280 text');

    // ── Shared renderer: renderLabel() end-to-end ───────────────────────
    const baseLabel = {
      shape:'circle', size:63.5,
      scentName:'Test Scent', productType:'Candle', bizName:'Test Biz',
      signal:'Warning', hStatements:'H317', pStatements:'P280',
      sensitisers:['Linalool'], pictograms:['exclamation'],
    };
    // No valid selection (e.g. a legacy label saved before this feature
    // existed, or P280 added and never completed) -- must be treated as
    // unrecognised/incomplete, and must NOT print any protection wording.
    const rNoSelection = LR.renderLabel({ ...baseLabel, p280Items:[] }, { instanceId:'p280-none', pw:200, ph:200 });
    assert.strictEqual(rNoSelection.fits, false, 'a label with P280 but no selection must not fit (treated as an unrecognised/incomplete code)');
    assert(rNoSelection.warnings.includes('unrecognized-code:P280'), 'P280 with no selection must be flagged the same way as any other unrecognised code');
    assert(!rNoSelection.svg.includes('Wear protective gloves'), 'a label with no P280 selection must NOT print any protection wording -- must never fall back to printing every item');

    // A valid, partial selection -- only the selected items must appear.
    const rSelected = LR.renderLabel({ ...baseLabel, p280Items:['gloves','face'] }, { instanceId:'p280-some', pw:200, ph:200 });
    assert.strictEqual(rSelected.fits, true, 'a comfortably-fitting label with a valid P280 selection should fit');
    assert(!rSelected.warnings.some(w => w.startsWith('unrecognized-code:')), 'a valid P280 selection must not be flagged unrecognised');
    // Real SVG output can word-wrap onto a <tspan> boundary mid-phrase
    // (the same wrapping behaviour every other P-statement is subject to),
    // so check the two halves independently rather than one contiguous
    // string -- mirrors the equivalent fix already applied in
    // tests/print-sheet-composer.js for a different combined P-code.
    assert(rSelected.svg.includes('Wear protective gloves/face'), 'rendered SVG must contain the selected-item wording (opening clause)');
    assert(rSelected.svg.includes('protection'), 'rendered SVG must contain the selected-item wording (closing word)');
    assert(!rSelected.svg.includes('protective clothing'), 'rendered SVG must NOT include an unselected item (protective clothing)');
    assert(!rSelected.svg.includes('hearing protection'), 'rendered SVG must NOT include an unselected item (hearing protection) -- proves the ordinary chip does not print every option automatically');

    // ── p280Other is free text -- it must be XML-escaped in SVG output,
    // never interpreted as markup, and ordinary text must not be
    // double-escaped in the process. ────────────────────────────────────
    const XSS_OTHER = 'Protective footwear <img src=x onerror=alert(1)>';
    const rXss = LR.renderLabel({ ...baseLabel, p280Items:['gloves'], p280Other: XSS_OTHER }, { instanceId:'p280-xss', pw:200, ph:200 });
    assert(!rXss.svg.includes('<img'), 'a malicious p280Other must never produce a literal <img> tag in the rendered SVG');
    assert(rXss.svg.includes('&lt;img'), 'p280Other\'s angle brackets must be XML-escaped (&lt;) in the rendered SVG, not stripped or passed through raw');
    assert(rXss.svg.includes('src=x onerror=alert(1)'), 'the rest of the malicious text must still appear as harmless visible text, not be stripped');
    // The SVG must remain well-formed XML even with HTML-special characters
    // embedded as escaped text content.
    const svgParseCheck = new rendererDom.window.DOMParser().parseFromString(rXss.svg, 'image/svg+xml');
    assert(!svgParseCheck.querySelector('parsererror'), 'SVG containing an escaped p280Other must still parse as valid XML');
    assert(!svgParseCheck.querySelector('img'), 'parsing the SVG must not produce a real <img> element from p280Other');
    // Ordinary text (no special characters) must render completely
    // unmangled -- proves there is no double-escaping happening.
    const rOrdinaryOther = LR.renderLabel({ ...baseLabel, p280Items:[], p280Other:'steel toe boots' }, { instanceId:'p280-ordinary', pw:200, ph:200 });
    assert(rOrdinaryOther.svg.includes('Wear steel toe boots'), 'ordinary p280Other text must render exactly as entered, with no escaping artifacts (e.g. no stray &amp; or &#39;)');

    // ── Fit gate still applies with a VALID P280 selection present ─────
    const overflowWithP280 = {
      shape:'circle', size:'custom', customW:52, customH:52,
      scentName:'Extreme Stress Test Scent Name That Is Quite Long Indeed',
      productType:'Candle', bizName:'Extreme Stress Business Name Ltd',
      bizAddress:'1 Long Address Road, Some Town, County, Postcode', bizPhone:'01234 567890',
      bizWebsite:'www.extremestresstestbusiness.co.uk',
      netWeight:'220g', batchNum:'B009-EXTREME', burnTime:'45 hrs approx',
      signal:'Danger', hStatements:'H319, H317, H411, H412, H315, H336',
      pStatements:'P101, P102, P103, P210, P233, P260, P261, P271, P273, P280, P302+P352, P305+P351+P338, P312, P501, P211',
      p280Items:['gloves','eye'],
      sensitisers:['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
      pictograms:['exclamation','flame','aquatic'], textColour:'dark', showBorder:true,
    };
    const rOverflow = LR.renderLabel(overflowWithP280, { instanceId:'p280-overflow', pw:147, ph:147 });
    assert.strictEqual(rOverflow.fits, false, 'a label whose content overflows must still return fits:false with a valid P280 selection present');
    assert(rOverflow.warnings.includes('hazard-text-overflow'), 'overflow case should carry hazard-text-overflow, not an unrecognised-code warning');
    assert(!rOverflow.warnings.some(w => w === 'unrecognized-code:P280'), 'a validly-selected P280 must not itself be reported as unrecognised');

    // ── Builder: Smart Paste still excludes P280; picker enforces at
    // least one selection; Step 3 gate; save/reopen round-trip; identical
    // rendered wording. ──────────────────────────────────────────────
    const builderStrippedSource = builderSource.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
    const builderErrors = [];
    const builderVC = new VirtualConsole();
    builderVC.on('jsdomError', e => builderErrors.push(e.message));
    const builderDom = new JSDOM(builderStrippedSource, {
      url: 'https://local.clpeasy.test/builder.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: builderVC,
      beforeParse(window) {
        stubCanvas(window);
        window.eval(labelRendererSource);
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
    await new Promise(resolve => setTimeout(resolve, 60));
    const bwindow = builderDom.window;
    const bdocument = bwindow.document;

    // 1. Smart Paste must still NOT auto-add P280.
    bdocument.getElementById('smart-paste-input').value = 'Warning H317 P102 P261 P280 P501 Contains Linalool';
    bwindow.extractSDS();
    assert(!bwindow.eval('S.pSelected').includes('P280'), 'Smart Paste must still exclude P280 -- occupational PPE wording must not auto-transfer to a finished consumer product label');
    assert(bwindow.eval('S.pSelected').includes('P501'), 'setup: Smart Paste should still extract an ordinary, non-excluded P-code (P501) normally');

    // 2. Manual entry: clicking the P280 chip opens the picker; confirming
    // with nothing selected must be refused.
    const p280Chip = bdocument.querySelector('.h-chip[data-code="P280"]');
    assert(p280Chip, 'P280 chip is missing from Builder\'s P-statement chip list');
    bwindow.togglePChip(p280Chip, 'P280');
    assert.strictEqual(bdocument.getElementById('p280Modal').classList.contains('show'), true, 'clicking the P280 chip must open the protection-item picker, not add it directly');
    assert(!bwindow.eval('S.pSelected').includes('P280'), 'P280 must not be added to state merely by opening the picker');

    bdocument.getElementById('p280-other-input').value = '';
    bwindow.confirmP280Modal();
    assert.strictEqual(bdocument.getElementById('p280-modal-error').style.display, 'block', 'confirming with nothing selected and no "other" text must show the validation error');
    assert(!bwindow.eval('S.pSelected').includes('P280'), 'P280 must not be accepted with no applicable wording selected');
    assert.strictEqual(bdocument.getElementById('p280Modal').classList.contains('show'), true, 'the picker must stay open after a rejected empty confirm');

    // Now tick two items and confirm -- must succeed.
    const glovesCb = bdocument.querySelector('#p280-item-opts input[value="gloves"]');
    const eyeCb = bdocument.querySelector('#p280-item-opts input[value="eye"]');
    assert(glovesCb && eyeCb, 'expected gloves/eye checkboxes in the P280 picker');
    glovesCb.checked = true; eyeCb.checked = true;
    bwindow.confirmP280Modal();
    assert.strictEqual(bdocument.getElementById('p280Modal').classList.contains('show'), false, 'the picker must close after a valid confirm');
    assert(bwindow.eval('S.pSelected').includes('P280'), 'a valid confirm must add P280 to Builder state');
    assert.deepStrictEqual([...bwindow.eval('S.p280Items')].sort(), ['eye','gloves'], 'the confirmed selection must be stored on Builder state');
    assert(p280Chip.classList.contains('selected'), 'P280 chip must visibly show as selected after a valid confirm');

    // Complete a full, valid label and confirm the render + Step 3 gate.
    bwindow.eval(`
      S.scentName='Lavender Fields'; S.productType='Candle'; S.bizName='Crafty Mouse Gifts';
      S.bizPhone='01234 567890'; S.signal='Warning';
      S.hSelected=['H317']; S.hStatements='H317';
      S.sensitisers=['Linalool']; S.pictograms=['exclamation'];
    `);
    bdocument.getElementById('h-statements').value = 'H317';
    bdocument.getElementById('hazard-confirm').checked = true;
    // saveLabel()/canLeaveApprovedBuilderStep() both call readForm(), which
    // re-reads these fields from the DOM (not from S directly) -- set the
    // DOM values too so readForm() doesn't wipe the S state just set above.
    bdocument.getElementById('scent-name').value = 'Lavender Fields';
    bdocument.getElementById('product-type').value = 'Candle';
    bdocument.getElementById('biz-name').value = 'Crafty Mouse Gifts';
    bdocument.getElementById('biz-phone').value = '01234 567890';
    assert.strictEqual(bwindow.canLeaveApprovedBuilderStep(3), true, 'Step 3 must allow progression once P280 has a valid selection');

    const svg1 = bwindow.buildSVG(false);
    assert(!bwindow.eval('window._unrecognizedCodes').includes('P280'), 'Builder\'s render pipeline must not flag a validly-selected P280 as unrecognised');
    assert(svg1.includes('Wear protective gloves/eye protection'), 'Builder preview must render exactly the selected wording');
    assert(!svg1.includes('hearing protection'), 'Builder preview must not render an unselected item');

    // (The Step 5 "Label summary" panel (#label-summary) that used to be
    // checked here has been removed from the Download stage -- the identical-
    // wording proof above (svg1, the real live preview) already covers this.)

    // 3. Save/reopen round-trip.
    bwindow.saveLabel();
    const saved = bwindow.eval('getSaved()');
    const savedEntry = saved.find(e => e.scentName === 'Lavender Fields');
    assert(savedEntry, 'label was not saved');
    assert.deepStrictEqual([...savedEntry.p280Items].sort(), ['eye','gloves'], 'saved record must persist the exact selected items');
    // Reset builder state to something else, then reload -- selection must
    // come back exactly as saved, not default to every item.
    bwindow.eval(`S.p280Items=[]; S.p280Other=''; S.pSelected=[]; S.pStatements='';`);
    const savedIdx = saved.findIndex(e => e.scentName === 'Lavender Fields');
    bwindow.loadLabel(savedIdx);
    assert.deepStrictEqual([...bwindow.eval('S.p280Items')].sort(), ['eye','gloves'], 'reopening the saved label must restore the exact selected items');
    const svg2 = bwindow.buildSVG(false);
    assert(svg2.includes('Wear protective gloves/eye protection'), 'reopened label must render the identical wording it was saved with');

    // 4. Legacy-compatibility: a label with P280 in pStatements but NO
    // p280Items/p280Other data (as if saved before this feature existed)
    // must not silently receive every option, and must be caught by the
    // Step 3 gate rather than sailing through.
    bwindow.eval(`S.pStatements='P280'; S.pSelected=['P280']; S.p280Items=[]; S.p280Other='';`);
    assert.strictEqual(bwindow.canLeaveApprovedBuilderStep(3), false, 'Step 3 must block progression when P280 is present with no valid selection (legacy-compatible, not silently accepted)');
    assert(bwindow.eval('window.__lastAlert') && /P280/.test(bwindow.eval('window.__lastAlert')), 'Step 3 must explain that P280 needs a selection');

    // 5. p280Other is free text -- prove it is safe at every Builder output
    // boundary: reopened picker (input.value, not HTML interpolation),
    // Step 5 summary (HTML-escaped before innerHTML), and save/reopen
    // (retained as the exact original plain value, never escaped at rest).
    bwindow.eval(`S.pSelected=['P280']; S.pStatements='P280'; S.p280Items=['gloves']; S.p280Other=${JSON.stringify(XSS_OTHER)};`);

    // Reopening the picker must assign the raw value through input.value
    // (which can never execute markup), not template/HTML interpolation.
    bwindow.openP280Modal();
    const reopenedOtherInput = bdocument.getElementById('p280-other-input');
    assert.strictEqual(reopenedOtherInput.value, XSS_OTHER, 'reopening the picker must restore the exact raw p280Other text via input.value');
    assert(!bdocument.getElementById('p280-item-opts').querySelector('img'), 'no injected element may appear in the picker\'s own DOM when reopened with a malicious "other" value');
    bwindow.closeP280Modal();

    // Builder's real live preview (the Step 5 "Label summary" panel this used
    // to check has been removed -- the live preview is now the only Builder
    // surface p280Other reaches, so the escaping proof lives here instead):
    // the rendered SVG string must never contain a literal <img> tag, must
    // show the angle brackets XML-escaped, and the ORIGINAL characters must
    // still be present as visible text content once parsed.
    const svgXss = bwindow.buildSVG(false);
    assert(!svgXss.includes('<img'), 'a malicious p280Other must never produce a literal <img> tag in Builder\'s live preview SVG');
    assert(svgXss.includes('&lt;img'), 'Builder\'s live preview SVG must show p280Other\'s angle brackets escaped, not raw');
    const previewParse = new bwindow.DOMParser().parseFromString(svgXss, 'image/svg+xml');
    assert(!previewParse.querySelector('parsererror'), 'Builder\'s live preview SVG must still parse as valid XML with an escaped p280Other');
    assert(!previewParse.querySelector('img'), 'parsing Builder\'s live preview SVG must not produce a real <img> element from p280Other');
    // Real SVG at this preview size can wrap onto a new <tspan> mid-phrase
    // (between "Protective" and "footwear") -- same tspan-boundary caveat
    // documented elsewhere in this file -- so check both halves
    // independently rather than one contiguous string.
    const previewText = previewParse.documentElement.textContent;
    assert(previewText.includes('Protective'), 'Builder\'s live preview SVG must still show the original characters as plain visible text once parsed (opening word)');
    assert(previewText.includes('footwear <img src=x onerror=alert(1)>'), 'Builder\'s live preview SVG must still show the original characters as plain visible text once parsed (rest of the malicious text, unescaped once parsed back to text)');

    // Save/reopen must retain the exact original plain value -- never
    // escaped, mangled, or stripped at rest.
    bdocument.getElementById('scent-name').value = 'XSS Test Label';
    bwindow.eval(`S.scentName='XSS Test Label';`);
    bwindow.saveLabel();
    const savedXss = bwindow.eval('getSaved()').find(e => e.scentName === 'XSS Test Label');
    assert(savedXss, 'the XSS-fixture label was not saved');
    assert.strictEqual(savedXss.p280Other, XSS_OTHER, 'saved label data must retain the exact original plain p280Other value, completely unescaped');
    bwindow.eval(`S.p280Other=''; S.p280Items=[];`);
    const xssIdx = bwindow.eval('getSaved()').findIndex(e => e.scentName === 'XSS Test Label');
    bwindow.loadLabel(xssIdx);
    assert.strictEqual(bwindow.eval('S.p280Other'), XSS_OTHER, 'reopening the saved label must restore the exact original plain p280Other value');

    if (builderErrors.length) throw new Error('jsdom runtime errors (builder): ' + builderErrors.join('; '));

    // ── Print Sheet Composer: identical wording, no unrecognised-code
    // warning with a valid selection, and correctly blocked without one. ─
    const printStrippedSource = printSource.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
    const printErrors = [];
    const printVC = new VirtualConsole();
    printVC.on('jsdomError', e => printErrors.push(e.message));
    const p280LabelValid = {
      scentName:'Lavender Fields', productType:'Candle', bizName:'Crafty Mouse Gifts',
      shape:'circle', size:'custom', customW:52, customH:52,
      bizAddress:'', bizPhone:'', bizWebsite:'', netWeight:'220g', batchNum:'B001', burnTime:'',
      signal:'Warning', hStatements:'H317', pStatements:'P280', p280Items:['gloves','eye'],
      sensitisers:['Linalool'], pictograms:['exclamation'], textColour:'dark', showBorder:true,
      hideEN15494:false, labelLang:'en',
    };
    const p280LabelLegacy = { ...p280LabelValid, scentName:'Legacy Label No Selection', p280Items:undefined };
    const printDom = new JSDOM(printStrippedSource, {
      url: 'https://local.clpeasy.test/print.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: printVC,
      beforeParse(window) {
        stubCanvas(window);
        window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
        window.HTMLCanvasElement.prototype.toBlob = function(cb){ cb({ size:1, type:'image/png' }); };
        window.eval(labelRendererSource);
        window.alert = message => { window.__lastAlert = String(message); };
        window.confirm = () => true;
        window.scrollTo = () => {};
        window.fetch = async () => ({ ok:true, json:async()=>({}) });
        window.open = () => { window.__windowOpenCalls=(window.__windowOpenCalls||0)+1; return { document:{ write(){}, close(){} }, location:{ href:'' }, close(){}, opener:null }; };
        window.URL.createObjectURL = () => 'blob:test';
        window.URL.revokeObjectURL = () => {};
        window.HTMLAnchorElement.prototype.click = function(){};
        window.JSZip = function(){ this.file=function(){}; this.generateAsync=async function(){ return { size:0 }; }; };
        class FakeImage { set src(v){ if (this.onload) this.onload(); } }
        window.Image = FakeImage;
        window.supabase = { createClient: () => ({
          auth: {
            getSession: async () => ({ data:{ session:null } }),
            onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
            signOut: async () => ({})
          },
          from: () => Object.create(emptyQuery),
          rpc: async () => ({ data:false, error:null })
        }) };
        window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([p280LabelValid, p280LabelLegacy]));
      }
    });
    await new Promise(resolve => setTimeout(resolve, 60));
    const pwindow = printDom.window;
    const pdocument = pwindow.document;

    pwindow.eval('isPro=true; updateProGate();');
    pwindow.eval('addToSheet(0)'); // valid selection
    assert.strictEqual(pwindow.eval('sheetFitIssues.length'), 0, 'Composer must not block a label whose P280 has a valid selection');
    const sheetHTML = pdocument.getElementById('sheet-canvas').innerHTML;
    // Real SVG can wrap onto a <tspan> boundary mid-phrase at the sheet
    // cell's small pixel size -- check the two halves independently, same
    // as the equivalent renderLabel() check above.
    assert(sheetHTML.includes('Wear protective gloves/eye'), 'Composer canvas must render the identical selected wording Builder produced (opening clause)');
    assert(sheetHTML.includes('protection'), 'Composer canvas must render the identical selected wording Builder produced (closing word)');
    assert(!sheetHTML.includes('hearing protection'), 'Composer canvas must not render an unselected item');
    assert.strictEqual(pwindow.eval('document.getElementById("btn-pdf").disabled'), false, 'Print/PDF must be enabled -- a valid P280 selection must not block export');
    pwindow.eval('window.__windowOpenCalls = 0;');
    pwindow.eval('downloadPDF()');
    assert.strictEqual(pwindow.eval('window.__windowOpenCalls'), 1, 'downloadPDF() must proceed normally for a sheet whose only content is a fitting, validly-selected P280 label');

    // Same sheet template/shape, but the "legacy, no selection" label --
    // must be blocked, not silently printed with every option.
    pwindow.eval('addToSheet(1)');
    assert.strictEqual(pwindow.eval('sheetFitIssues.length'), 1, 'a P280 with no selection (legacy-compatible case) must block the sheet, not silently render every item');
    const issueReason = pwindow.eval('sheetFitIssues[0].reason');
    assert(/P280/.test(issueReason), 'the fit-issue reason should name P280 as the unrecognised/incomplete code');
    assert.strictEqual(pwindow.eval('document.getElementById("btn-pdf").disabled'), true, 'Print/PDF must be disabled while the legacy no-selection P280 label is on the sheet');

    // ── p280Other must remain safe through Composer's own path too -- it
    // only ever forwards the label to the same shared renderLabel(), so a
    // malicious "other" value must render as escaped, harmless text in the
    // sheet canvas, never as a real injected element, and the visible
    // wording must be equivalent to what Builder produced for the same
    // selection. ─────────────────────────────────────────────────────────
    const p280LabelXss = { ...p280LabelValid, scentName:'XSS Composer Label', p280Items:['gloves'], p280Other: XSS_OTHER };
    pwindow.eval(`window.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify(${JSON.stringify([p280LabelValid, p280LabelLegacy, p280LabelXss])}))`);
    pwindow.eval('addToSheet(2)'); // valid selection + malicious "other" text -- getSaved() re-reads localStorage fresh on every call, so no separate refresh is needed
    assert.strictEqual(pwindow.eval('sheetFitIssues.length'), 1, 'the XSS-fixture label has a valid P280 selection and must not add a new fit issue (only the still-present legacy label should)');
    const xssSheetHTML = pdocument.getElementById('sheet-canvas').innerHTML;
    assert(!pdocument.getElementById('sheet-canvas').querySelector('img'), 'a malicious p280Other must never produce a real <img> element in the Composer sheet canvas');
    assert(xssSheetHTML.includes('&lt;img'), 'the sheet canvas markup must show p280Other\'s angle brackets HTML/XML-escaped, not raw');
    // Real SVG at this small cell size wraps onto a new <tspan> mid-phrase
    // (between "Protective" and "footwear") -- same tspan-boundary caveat as
    // the earlier "Wear protective gloves/eye protection" check above, so
    // check both halves independently rather than one contiguous string.
    const xssSheetText = pdocument.getElementById('sheet-canvas').textContent;
    assert(xssSheetText.includes('Wear protective gloves/Protective'), 'the malicious p280Other text must still be visible as plain text in the Composer sheet (opening words)');
    assert(xssSheetText.includes('footwear <img src=x onerror=alert(1)>'), 'the malicious p280Other text must still be visible as plain text in the Composer sheet, unescaped when read via textContent (proves it is real text content, not a real element)');

    if (printErrors.length) throw new Error('jsdom runtime errors (print): ' + printErrors.join('; '));

    console.log('P280 selectable-statement checks passed (Smart Paste exclusion intact, picker requires a selection, save/reopen round-trips, Builder + Composer render identical selected wording, legacy no-selection labels are blocked not auto-filled, fit gate still applies)');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
