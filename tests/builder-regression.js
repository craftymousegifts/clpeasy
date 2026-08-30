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

setTimeout(() => {
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
    window.selectShape('rectangle');
    window.selectSize('custom');
    document.getElementById('custom-w').value='63';
    document.getElementById('custom-h').value='44';
    document.getElementById('h-statements').value='H317, H411';
    document.getElementById('p-statements').value='P102, P273';
    document.getElementById('biz-name').value='Crafty Mouse Gifts';
    document.getElementById('biz-address').value='Scottish Borders';
    document.getElementById('biz-phone').value='01234 567890';
    window.eval("S.hSelected=['H317','H411'];S.pSelected=['P102','P273'];S.sensitisers=['Geraniol','Linalool']");
    window.syncPictogramsFromH();
    window.onDimInput();
    const knownRectangleSvg=window.buildSVG(false);
    assert.strictEqual(window.eval('window._labelLegibilityWarn'),false,'representative 63×44mm candle rectangle was falsely blocked');
    const textMetrics=label=>{
      const match=knownRectangleSvg.match(new RegExp(`<text[^>]*y="([\\d.]+)"[^>]*font-size="([\\d.]+)"[^>]*>[^<]*${label}[^<]*<\\/text>`));
      return match?{y:Number(match[1]),size:Number(match[2])}:null;
    };
    const typeMetrics=textMetrics('SCENTED CANDLE');
    const signalMetrics=textMetrics('WARNING');
    assert(typeMetrics&&signalMetrics,'63×44mm rectangle is missing product type or signal word');
    assert(typeMetrics.y+typeMetrics.size/2 < signalMetrics.y-signalMetrics.size/2,'63×44mm rectangle product type overlaps the signal word');

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
    window.saveLabel();
    assert.strictEqual(window.eval('getSaved()').length, 1, 'label was not saved');
    document.getElementById('scent-name').value = 'Changed value';
    window.loadLabel(0);
    assert.strictEqual(document.getElementById('scent-name').value, 'Regression Candle', 'saved product name was not restored');
    assert(window.eval('S.pictograms').includes('exclamation'), 'saved pictogram was not restored');
    assert(window.eval('S.hSelected').includes('H315'), 'saved H-code state was not restored');
    assert(window.eval('S.pSelected').includes('P273'), 'saved P-code state was not restored');
    assert.strictEqual(document.getElementById('frag-load').value, '10%', 'saved fragrance load was not restored');
    window.toggleHChip(document.querySelector('.h-chip[data-code="H315"]'), 'H315');
    assert(!window.eval('S.pictograms').includes('exclamation'), 'editing a reopened label retained a stale pictogram');
    window.toggleHChip(document.querySelector('.h-chip[data-code="H315"]'), 'H315');
    assert(window.eval('S.pictograms').includes('exclamation'), 'editing a reopened label did not restore its required pictogram');
    window.loadLabelAndGotoStep5(0);
    assert.strictEqual(window.eval('approvedBuilderStep'), 5, 'reopening a saved label did not return to Download');
    assert(document.querySelector('.right-column > #preview-panel-el'), 'reopening a saved label displaced the live preview');

    window.deleteLabel(0);
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
