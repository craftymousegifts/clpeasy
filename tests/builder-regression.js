const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
// builder.html loads the shared renderer via <script src="label-render.js">
// -- a same-origin/local file, not a CDN fetch this offline test harness
// should skip. The generic src-stripping above (aimed at CDN scripts like
// Supabase/JSZip that would otherwise try a real network fetch) can't tell
// the two apart, so load label-render.js explicitly before the page's own
// inline script runs, giving the exact same window.LabelRenderer the real
// browser would have by the time buildSVG() calls it.
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
// Checkpoint B: builder.html now also loads label-library.js via
// <script src="...">, stripped by the same generic regex above for the
// same reason label-render.js already was -- injected explicitly here,
// before the page's own inline script runs, so LabelLibrary exists
// synchronously by the time init()/initAuth() reference it.
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
    // Stub the canvas 2D context BEFORE evaluating label-render.js -- its
    // module-level `_cvs.getContext('2d')` call runs immediately on load,
    // and jsdom has no real canvas backend (returns null without this stub),
    // which would otherwise leave `_ctx` null and crash the first
    // measureText() call.
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        return { width:[...String(text)].reduce((width,char)=>width+size*(/[MW@%]/.test(char)?.82:/[ilI1.,' ]/.test(char)?.28:.54),0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(labelRendererSource);
    window.eval(labelLibrarySource);
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
const LR = window.LabelRenderer;

setTimeout(async () => {
  try {
    assert(document.querySelector('.builder-utility-actions [onclick="openHelp()"]'), 'visible Help Guide control missing');
    assert(document.querySelector('.mobile-preview-btn[onclick="openPreviewSheet()"]'), 'mobile preview control missing');
    assert.strictEqual(window.eval('approvedBuilderStep'), 1, 'Builder did not initialise at Step 1');
    assert(document.querySelector('.builder-accordion-section.active #step-1'), 'size panel is not in Step 1');
    assert(!document.getElementById('intended-use'), 'removed Intended Use control is still present');
    assert.deepStrictEqual([...document.querySelectorAll('[data-rail-step]>span:nth-child(2)')].map(node=>node.textContent), ['Label','Product','Hazards','Business','Download'], 'approved step names changed');

    for (const shape of ['circle','square']) {
      window.selectShape(shape);
      for (const size of [52,63]) {
        window.selectSize(size);
        const dims=window.getDims();
        assert.deepStrictEqual({mmW:dims.mmW,mmH:dims.mmH,pw:dims.pw,ph:dims.ph},{mmW:size,mmH:size,pw:260,ph:260},`${shape} ${size}mm geometry is incorrect`);
        const svg=window.buildSVG(false);
        assert(svg.includes('viewBox="0 0 260 260"'),`${shape} ${size}mm SVG viewBox is incorrect`);
      }
    }
    window.selectShape('rectangle');
    for (const size of [52,63]) {
      window.selectSize(size);
      const dims=window.getDims();
      const expectedHeight=Math.round(size*0.7);
      assert.strictEqual(dims.mmW,size,`rectangle ${size}mm width is incorrect`);
      assert.strictEqual(dims.mmH,expectedHeight,`rectangle ${size}mm preset height is incorrect`);
      assert.strictEqual(dims.pw,260,`rectangle ${size}mm preview width is incorrect`);
      assert.strictEqual(dims.ph,Math.round(expectedHeight*(260/size)),`rectangle ${size}mm preview height is incorrect`);
    }
    window.selectSize('custom');
    document.getElementById('custom-w').value = '63';
    document.getElementById('custom-h').value = '44';
    window.onDimInput();
    assert.strictEqual(window.getDims().mmH, 44, 'rectangle height changed after setting width');
    document.getElementById('custom-w').value = '99';
    window.onDimInput();
    assert.strictEqual(window.getDims().mmH, 44, 'increasing rectangle width changed its physical height');
    const rectangleSvg = window.buildSVG(false);
    assert(rectangleSvg.includes('width="260" height="116"'), 'rectangle preview geometry does not preserve the 99×44 ratio');
    window.selectShape('circle');
    window.selectSize(63);
    window.setApprovedBuilderStep(2);
    assert(document.querySelector('.builder-accordion-section.active #step-2'), 'product panel is not in Step 2');
    document.getElementById('scent-name').value = 'Regression Candle';
    document.getElementById('product-type').value = 'Scented Candle';
    document.getElementById('frag-load').value = '10%';
    window.onProductTypeChange();
    window.updateLabel();
    assert((window.buildSVG(false).match(/<image href="data:image\/jpeg/g)||[]).length >= 5, 'scented candle safety pictograms are missing');

    // The historically sensitive 63×44mm candle rectangle must retain its
    // physical dimensions and keep the product type clear of the signal word.
    //
    // Built via the APPROVED PRESET path (Rectangle shape + the existing
    // 63mm size-card), not by typing 63/44 into the custom-w/custom-h
    // fields. This matters: selectSize(63) sets S.size='63' (a preset
    // identity, not 'custom'), and for a rectangle shape builder.html's
    // own applySize() derives the height as Math.round(63*0.7)=44mm --
    // CLPeasy's existing, already-approved rectangle-aspect-ratio formula.
    // So 63×44mm was ALREADY reachable as a genuine preset combination
    // with zero code changes -- confirmed directly below by asserting
    // isCustomSizeBelowSupportedMinimum()===false for it, exactly as
    // presets are documented to behave (see that function's own comment
    // in builder.html). No new size-card or registry entry was needed.
    window.selectShape('rectangle');
    window.selectSize(63);
    assert.notStrictEqual(window.eval('S.size'), 'custom', 'the approved 63×44mm preset must set S.size to the preset key, not \'custom\'');
    assert.deepStrictEqual({w:window.eval('S.customW'),h:window.eval('S.customH')}, {w:63,h:44}, 'the 63mm rectangle preset must derive exactly 63×44mm via the existing 0.7 aspect-ratio formula');
    assert.strictEqual(window.eval('isCustomSizeBelowSupportedMinimum()'), false, 'the approved 63×44mm preset must be exempt from the 52mm custom-size floor, the same way any other preset size is');
    document.getElementById('h-statements').value='H317, H411';
    document.getElementById('p-statements').value='P102, P273';
    document.getElementById('biz-name').value='Crafty Mouse Gifts';
    document.getElementById('biz-address').value='Scottish Borders';
    document.getElementById('biz-phone').value='01234 567890';
    window.eval("S.hSelected=['H317','H411'];S.pSelected=['P102','P273'];S.sensitisers=['Geraniol','Linalool']");
    window.syncPictogramsFromH();
    // updateLabel() (not onDimInput()) -- onDimInput() is specifically the
    // custom-dimension-field handler and always forces S.size='custom' as
    // part of its own contract (typing a dimension always means "custom",
    // correctly); since we're only changing hazard/business content here,
    // not the dimensions, updateLabel() alone refreshes state without
    // disturbing the preset identity just set above.
    window.updateLabel();
    const knownRectangleSvg=window.buildSVG(false);

    // Helper: renders the CURRENT builder S state directly through
    // LabelRenderer.renderLabel() (the same `data` field list buildSVG()
    // itself builds), returning the FULL result object (fits/warnings/
    // metrics) -- buildSVG()/updateLabel() only expose a handful of these
    // fields onto window.* globals (see label-warn-step5 wiring below),
    // not metrics.bcfTooSmall/bcfSizeMm/pictoSquareSideMm or the
    // warnings array itself, which the checks below need directly.
    function renderCurrentState(instanceId){
      return window.eval(`(function(){
        var data={
          shape:S.shape, size:S.size, customW:S.customW, customH:S.customH,
          scentName:S.scentName, productType:S.productType, bizName:S.bizName,
          bizAddress:S.bizAddress, bizPhone:S.bizPhone, bizWebsite:S.bizWebsite,
          netWeight:S.netWeight, batchNum:S.batchNum, burnTime:S.burnTime,
          signal:S.signal, hStatements:S.hStatements, pStatements:S.pStatements,
          sensitisers:S.sensitisers, pictograms:S.pictograms,
          textColour:S.textColour, showBorder:S.showBorder,
          hideEN15494:S.hideEN15494, labelLang:S.labelLang,
          p280Items:S.p280Items, p280Other:S.p280Other,
        };
        return LabelRenderer.renderLabel(data, {instanceId:${JSON.stringify(instanceId)}});
      })()`);
    }

    // ── The 63×44mm dense scented-candle fixture: content-dependent
    //    resolution (per Michaela's explicit instruction) ───────────────
    //
    // This fixture used to assert window._labelLegibilityWarn===false,
    // i.e. that this exact dense scented-candle content genuinely fits at
    // 63×44mm. That expectation was written against the PRE-CORRECTION,
    // oversized GHS pictogram bounding box (~22.627mm outer bbox, before
    // the Sept 2026 second-pass fix corrected the 16mm "if possible"
    // figure back to being an OUTER BOUNDING BOX target rather than a
    // second red-square side) -- but re-measuring this exact fixture
    // against the ORIGINAL, pre-correction renderer produces the
    // identical failure, proving the GHS correction did not cause this
    // and does not "fix" it either.
    //
    // THIRD PASS: originally this fixture failed for TWO independent
    // reasons -- candle-safety-symbols-too-small (the BS EN 15494 icon
    // row genuinely could not reach its 5mm floor in the available footer
    // band at 44mm label height, regardless of content) AND
    // hazard-text-overflow (the H317/H411 + two-sensitiser hazard text
    // independently overflowed the body-text area). The first was a real
    // FOOTER-LAYOUT DEFECT, not a content problem -- proven by a genuinely
    // simple/minimal 63×44mm candle fixture failing the identical way
    // (see tests/correction-batch-symbol-sizing.js B1's new 63x44mm case
    // and the diagnostic in this task). BCF_FOOTER_SHARE_CAP was raised
    // (0.66 -> 0.85, label-render.js) to correct that defect, WITHOUT
    // touching BCF_FLOOR_MM (still exactly 5mm) or any hazard-text
    // legibility floor. As a direct result, this exact dense fixture's
    // candle-safety row NOW fits (bcfTooSmall:false, bcfSizeMm pinned at
    // the 5mm floor -- the fix doesn't grow it further here, only lets it
    // reach the floor at all) -- but the fixture still correctly fails
    // overall, for its one remaining genuine reason: hazard-text-overflow,
    // unaffected by a footer-band-only change. GHS pictogram sizing stays
    // pinned at its own 10mm legal floor too, since the mid-band hazard
    // text still doesn't fit at any pictogram size. This is exactly the
    // intended, narrowly-scoped outcome: the footer-layout defect is
    // fixed; dense/regulated content is still never forced to pass.
    const denseResult = renderCurrentState('dense-63x44');
    assert.strictEqual(denseResult.fits, false, 'the dense 63×44mm scented-candle fixture is expected to genuinely fail to fit -- it must never be forced to pass by shrinking regulated content');
    assert(denseResult.warnings.includes('hazard-text-overflow'), `dense 63×44mm fixture must report hazard-text-overflow -- the required hazard/precautionary text independently overflows at its existing minimum legibility size -- got warnings ${JSON.stringify(denseResult.warnings)}`);
    assert.strictEqual(denseResult.metrics.bcfTooSmall, false, `dense 63×44mm fixture: after the footer-budget fix, metrics.bcfTooSmall must be false -- the candle-safety row genuinely fits now, this fixture is blocked only for hazard-text-overflow -- got warnings ${JSON.stringify(denseResult.warnings)}`);
    assert(denseResult.metrics.bcfSizeMm !== null && denseResult.metrics.bcfSizeMm >= LR.BCF_FLOOR_MM - 0.01, `dense 63×44mm fixture: candle-safety icon must render at >= the ${LR.BCF_FLOOR_MM}mm floor -- got ${denseResult.metrics.bcfSizeMm}mm`);
    assert.strictEqual(denseResult.metrics.pictoSquareSideMm, LR.PICTO_FLOOR_SQUARE_MM, `dense 63×44mm fixture: GHS pictogram must be pinned at the ${LR.PICTO_FLOOR_SQUARE_MM}mm legal floor, never shrunk further or grown -- got ${denseResult.metrics.pictoSquareSideMm}mm`);
    window.updateLabel();
    assert.strictEqual(window.eval('window._labelLegibilityWarn'), true, 'dense 63×44mm fixture: window._labelLegibilityWarn must be true (hazard-text-overflow is real and independently asserted above)');
    assert.strictEqual(window.eval('window._labelBlockDownload'), true, 'dense 63×44mm fixture: export must stay blocked (window._labelBlockDownload must be true)');

    const textMetrics=label=>{
      const match=knownRectangleSvg.match(new RegExp(`<text[^>]*y="([\\d.]+)"[^>]*font-size="([\\d.]+)"[^>]*>[^<]*${label}[^<]*<\\/text>`));
      return match?{y:Number(match[1]),size:Number(match[2])}:null;
    };
    const typeMetrics=textMetrics('SCENTED CANDLE');
    const signalMetrics=textMetrics('WARNING');
    assert(typeMetrics&&signalMetrics,'63×44mm rectangle is missing product type or signal word');
    assert(typeMetrics.y+typeMetrics.size/2 < signalMetrics.y-signalMetrics.size/2,'63×44mm rectangle product type overlaps the signal word');

    // ── Content-dependence (a): adding optional/cosmetic-only fields
    //    (net weight, batch number, burn time, website) must not change
    //    the fit outcome or the warning set -- they are not part of the
    //    legally required content driving this fixture's overflow. ─────
    document.getElementById('net-weight').value='220g';
    document.getElementById('batch-num').value='B001';
    document.getElementById('burn-time').value='20 hrs';
    document.getElementById('biz-website').value='craftymousegifts.com';
    // updateLabel(), not onDimInput() -- these fields don't touch the
    // dimensions, and onDimInput() would force S.size back to 'custom',
    // losing the preset identity just established above.
    window.updateLabel();
    const denseWithCosmetics = renderCurrentState('dense-63x44-cosmetics');
    assert.strictEqual(denseWithCosmetics.fits, false, "adding cosmetic-only fields must not change the dense 63×44mm fixture's fits:false outcome");
    assert.strictEqual(denseWithCosmetics.warnings.length, denseResult.warnings.length, `adding cosmetic-only fields must not change the number of warnings on the dense 63×44mm fixture (was ${denseResult.warnings.length}, now ${denseWithCosmetics.warnings.length})`);
    for(const w of denseResult.warnings) assert(denseWithCosmetics.warnings.includes(w), `adding cosmetic-only fields dropped the ${w} warning`);
    document.getElementById('net-weight').value='';
    document.getElementById('batch-num').value='';
    document.getElementById('burn-time').value='';
    document.getElementById('biz-website').value='';
    window.updateLabel();

    // ── Content-dependence (b): the SAME dense hazard/precautionary
    //    content at the SAME 63×44mm, but on a non-candle product type
    //    (Wax Melt), genuinely fits -- since _showBCF only applies to
    //    CLPeasy's defined candle product types (_candleTypes in
    //    label-render.js), the mandatory candle-safety icon row (and its
    //    5mm floor) does not apply at all here, so this outcome required
    //    lowering no regulatory minimum. This is the "minimal/ordinary
    //    63×44mm label that genuinely fits" proof, built by removing what
    //    doesn't legally apply to this product, never by shrinking
    //    anything that does. ─────────────────────────────────────────
    document.getElementById('product-type').value='Wax Melt';
    window.onProductTypeChange();
    window.updateLabel();
    const nonCandleResult = renderCurrentState('nonCandle-63x44');
    assert.strictEqual(nonCandleResult.fits, true, `a Wax Melt (non-candle) at 63×44mm carrying the identical dense hazard content must genuinely fit once the (inapplicable) candle-safety requirement no longer applies -- got warnings ${JSON.stringify(nonCandleResult.warnings)}`);
    assert.strictEqual(nonCandleResult.warnings.length, 0, `a fitting Wax Melt label must report no warnings, got ${JSON.stringify(nonCandleResult.warnings)}`);
    assert.strictEqual(nonCandleResult.metrics.bcfSizeMm, null, 'Wax Melt (non-candle): candle-safety row must not apply at all -- metrics.bcfSizeMm must be null');
    assert.strictEqual(nonCandleResult.metrics.bcfTooSmall, false, 'Wax Melt (non-candle): bcfTooSmall must be false -- the requirement is inapplicable to this product type, not failed');
    document.getElementById('product-type').value='Scented Candle';
    window.onProductTypeChange();
    window.updateLabel();

    // ── Content-dependence (c): at least one larger, already-supported
    //    rectangle fits the SAME unreduced dense candle content, without
    //    lowering any regulatory minimum -- proving 63×44mm is not
    //    "universally unsupported," just physically too small for this
    //    specific content/product combination. ─────────────────────────
    document.getElementById('custom-w').value='80';
    document.getElementById('custom-h').value='56';
    window.onDimInput();
    const largerResult = renderCurrentState('larger-80x56');
    assert.strictEqual(largerResult.fits, true, `an 80×56mm rectangle carrying the identical dense scented-candle content must fit -- got warnings ${JSON.stringify(largerResult.warnings)}`);
    assert.strictEqual(largerResult.warnings.length, 0, `a fitting 80×56mm label must report no warnings, got ${JSON.stringify(largerResult.warnings)}`);
    assert.strictEqual(largerResult.metrics.pictoSquareSideMm, LR.PICTO_TARGET_SQUARE_MM, `80×56mm: GHS pictogram should reach the full ${LR.PICTO_TARGET_SQUARE_MM.toFixed(4)}mm target with room to spare -- got ${largerResult.metrics.pictoSquareSideMm}mm`);
    assert(largerResult.metrics.bcfSizeMm >= LR.BCF_FLOOR_MM - 0.01, `80×56mm: candle-safety icon must reach at least the ${LR.BCF_FLOOR_MM}mm floor -- got ${largerResult.metrics.bcfSizeMm}mm`);

    // ── Export-blocking UX: the user-facing message for the dense
    //    63×44mm fixture must give a useful "go bigger" recommendation,
    //    never describe 63×44mm as universally unsupported.
    //
    // Reselected via the approved PRESET path (selectSize(63), shape is
    // already 'rectangle') rather than typing 63/44 back into the custom
    // fields -- the whole point of this fix. Because this is the genuine
    // preset (S.size='63', not 'custom'), CLPeasy's separate, pre-existing
    // product-level 52mm custom-size-minimum policy --
    // isCustomSizeBelowSupportedMinimum(), unrelated to GB-CLP/BS-EN-15494
    // and not a legal claim per its own code comment -- correctly does
    // NOT fire for this preset (confirmed above); only the genuine
    // hazard-text-overflow branch's message shows, so this now asserts
    // that SPECIFIC message only, not an "either wording" fallback.
    window.selectSize(63);
    window.updateLabel();
    assert.strictEqual(window.eval('isCustomSizeBelowSupportedMinimum()'), false, 'the approved 63×44mm preset must still be exempt from the 52mm custom-size floor at export-blocking time');
    const warnStep5 = document.getElementById('label-warn-step5').innerHTML;
    assert(/select a larger label size/i.test(warnStep5), `dense 63×44mm fixture (approved preset): export-blocked message must recommend a larger label size, got: ${warnStep5}`);
    assert(!/52mm or larger|supported minimum/i.test(warnStep5), `dense 63×44mm fixture (approved preset): must NOT show the generic custom-size-minimum message -- that gate must not apply to an approved preset, got: ${warnStep5}`);
    assert(!/not supported|unsupported/i.test(warnStep5), `dense 63×44mm fixture: export-blocked message must not describe 63×44mm as universally unsupported, got: ${warnStep5}`);

    window.selectShape('circle');
    window.selectSize(63);
    window.clearHazardData();
    window.setApprovedBuilderStep(3);
    assert.strictEqual(window.eval('approvedBuilderStep'), 3, 'Product did not advance to Hazards');
    assert(document.querySelector('.builder-accordion-section.active #step-3'), 'hazard panel is not in Step 3');

    document.getElementById('smart-paste-input').value = 'Warning H317 H410 P102 P261 P273 P302+P352 P333+P313 P391 P501 Contains Limonene, Linalool, Benzyl salicylate, 2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene';
    window.extractSDS();
    assert(window.eval('S.hSelected').includes('H410'), 'Smart Paste did not extract H410');
    assert(window.eval('S.pictograms').includes('aquatic'), 'Smart Paste H410 did not add aquatic pictogram');
    assert(window.eval('S.sensitisers').includes('Limonene'), 'Smart Paste did not extract sensitiser');

    const pictogramCases={H225:'flame',H315:'exclamation',H304:'health',H410:'aquatic',H314:'corrosive',H300:'skull',H270:'oxidiser',H280:'gas',H200:'explosion'};
    for(const [code,pictogram] of Object.entries(pictogramCases)){
      window.eval(`S.hSelected=['${code}'];S.hStatements='${code}'`);
      document.getElementById('h-statements').value=code;
      window.syncPictogramsFromH();
      assert.deepStrictEqual([...window.eval('S.pictograms')],[pictogram],`${code} did not produce the ${pictogram} pictogram`);
      assert(document.querySelector(`.picto-btn[data-picto="${pictogram}"].selected`),`${code} pictogram was not visibly selected`);
    }
    window.eval("S.hSelected=['H410'];S.hStatements='H410'");
    document.getElementById('h-statements').value='H410';
    window.syncPictogramsFromH();

    const h315 = document.querySelector('.h-chip[data-code="H315"]');
    assert(h315, 'H315 hazard chip missing');
    window.toggleHChip(h315, 'H315');
    assert(window.eval('S.hSelected').includes('H315'), 'H315 not retained in state');
    assert(window.eval('S.pictograms').includes('exclamation'), 'H315 did not add exclamation pictogram');
    assert(document.querySelector('.picto-btn[data-picto="exclamation"].selected'), 'pictogram control did not render selected state');

    document.getElementById('hazard-confirm').checked = true;
    window.setApprovedBuilderStep(4);
    assert(document.querySelector('.builder-accordion-section.active #step-4'), 'business details are not in Step 4');
    document.getElementById('biz-phone').value = '01234 567890';
    window.setApprovedBuilderStep(5);
    assert.strictEqual(window.eval('approvedBuilderStep'), 5, 'Business did not advance to Download');
    assert(document.querySelector('.builder-layout').classList.contains('reviewing'), 'review layout was not activated');
    assert(document.querySelector('.right-column > #preview-panel-el'), 'Download moved the live preview out of the right-hand preview column');
    assert(document.querySelector('.builder-accordion-section.active #finetune-panel-el'), 'fine-tune controls are missing from Download');
    // The "Label summary" panel (#label-summary) was removed from Step 5 --
    // its two checks here (H315 present, long sensitiser name not truncated)
    // are retained via still-existing coverage instead: H315 retention is
    // already asserted above (line 170, S.hSelected), and the long-sensitiser
    // check is re-proven below against the real label output (buildSVG(false)).
    assert.strictEqual(document.querySelectorAll('#btn-png,#btn-pdf,#btn-svg').length, 3, 'approved exports are incomplete');
    assert.strictEqual(window.eval('window._labelBlockDownload'), false, 'representative 63mm candle was falsely blocked');
    assert(window.buildSVG(false).includes('2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'), 'label output shortened a long sensitiser');
    document.getElementById('verify-checkbox').checked = true;
    window.toggleDownload();
    assert.strictEqual(window.eval('_downloadAllowed()'), true, 'valid 63mm label did not enable the shared PNG/PDF/SVG gate');
    window.selectSize(52);
    window.updateLabel();
    assert.strictEqual(window.eval('window._labelBlockDownload'), true, 'undersized long-content label was not blocked');
    assert.strictEqual(window.eval('_downloadAllowed()'), false, 'undersized label bypassed the shared export gate');
    window.selectSize(63);
    window.updateLabel();
    assert.strictEqual(window.eval('window._labelBlockDownload'), false, 'returning to 63mm did not clear the false fit state');
    // Checkpoint B: saveLabel()/loadLabel(i)/deleteLabel(i) are now
    // async and id-based (LabelLibrary-backed) rather than synchronous and
    // array-index-based -- these calls, and only these calls, are updated
    // to the new API; the assertions/coverage are unchanged.
    await window.saveLabel();
    assert.strictEqual(window.eval('getSaved()').length, 1, 'label was not saved');
    const savedId = window.eval('getSaved()')[0].id;
    document.getElementById('scent-name').value = 'Changed value';
    window.loadLabelRecord(window.eval('getSaved()').find(e => e.id === savedId));
    assert.strictEqual(document.getElementById('scent-name').value, 'Regression Candle', 'saved product name was not restored');
    assert(window.eval('S.pictograms').includes('exclamation'), 'saved pictogram was not restored');
    assert(window.eval('S.hSelected').includes('H315'), 'saved H-code state was not restored');
    assert(window.eval('S.pSelected').includes('P273'), 'saved P-code state was not restored');
    assert.strictEqual(document.getElementById('frag-load').value, '10%', 'saved fragrance load was not restored');
    assert.strictEqual(window.eval('editingLabelId'), savedId, 'loading a saved label did not set editingLabelId');
    window.toggleHChip(document.querySelector('.h-chip[data-code="H315"]'), 'H315');
    assert(!window.eval('S.pictograms').includes('exclamation'), 'editing a reopened label retained a stale pictogram');
    window.toggleHChip(document.querySelector('.h-chip[data-code="H315"]'), 'H315');
    assert(window.eval('S.pictograms').includes('exclamation'), 'editing a reopened label did not restore its required pictogram');
    window.loadLabelAndGotoStep5(savedId);
    assert.strictEqual(window.eval('approvedBuilderStep'), 5, 'reopening a saved label did not return to Download');
    assert(document.querySelector('.right-column > #preview-panel-el'), 'reopening a saved label displaced the live preview');

    await window.deleteLabelById(savedId);
    assert.strictEqual(window.eval('getSaved()').length,0,'saved label delete did not remove the label');

    window.openHelp();
    assert(document.getElementById('help-panel').classList.contains('open'), 'Help Guide did not open');
    window.closeHelp();
    assert(!document.getElementById('help-panel').classList.contains('open'), 'Help Guide did not close');

    const structuralErrors = errors.filter(message => !/not implemented|navigation/i.test(message));
    assert.deepStrictEqual(structuralErrors, [], `runtime errors: ${structuralErrors.join('; ')}`);
    console.log('builder regression checks passed');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    window.close();
  }
}, 500);
