const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
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
      font:'', measureText:text => ({ width:String(text).length * 7 }),
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
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
    assert(document.querySelector('[onclick="openHelp()"]'), 'visible Help Guide control missing');
    assert.strictEqual(window.eval('approvedBuilderStep'), 1, 'Builder did not initialise at Stage 1');
    assert(document.querySelector('.builder-accordion-section.active #step-1'), 'size panel is not in Stage 1');
    assert(document.querySelector('.builder-accordion-section.active #step-2'), 'product panel is not in Stage 1');
    assert(document.querySelector('.approved-stage-nav .btn-next'), 'Stage 1 Next control missing');

    document.getElementById('scent-name').value = 'Regression Candle';
    document.getElementById('product-type').value = 'Scented Candle';
    window.setApprovedBuilderStep(2);
    assert.strictEqual(window.eval('approvedBuilderStep'), 2, 'Next did not enter Ingredients');
    assert(document.querySelector('.builder-accordion-section.active #step-3'), 'hazard panel is not in Ingredients');

    document.getElementById('smart-paste-input').value = 'Danger H410 P273 Contains Limonene';
    window.extractSDS();
    assert(window.eval('S.hSelected').includes('H410'), 'Smart Paste did not extract H410');
    assert(window.eval('S.pictograms').includes('aquatic'), 'Smart Paste H410 did not add aquatic pictogram');
    assert(window.eval('S.sensitisers').includes('Limonene'), 'Smart Paste did not extract sensitiser');

    const h315 = document.querySelector('.h-chip[data-code="H315"]');
    assert(h315, 'H315 hazard chip missing');
    window.toggleHChip(h315, 'H315');
    assert(window.eval('S.hSelected').includes('H315'), 'H315 not retained in state');
    assert(window.eval('S.pictograms').includes('exclamation'), 'H315 did not add exclamation pictogram');
    assert(document.querySelector('.picto-btn[data-picto="exclamation"].selected'), 'pictogram control did not render selected state');

    document.getElementById('hazard-confirm').checked = true;
    window.setApprovedBuilderStep(3);
    assert.strictEqual(window.eval('approvedBuilderStep'), 3, 'Ingredients did not advance to classification review');
    assert(document.querySelector('.classification-review').textContent.includes('H315'), 'classification review omitted H315');
    assert(document.querySelector('.classification-review').textContent.includes('exclamation'), 'classification review omitted pictogram');
    window.setApprovedBuilderStep(4);
    assert(document.querySelector('.builder-accordion-section.active #step-4'), 'business details are not in Label Content');
    assert(document.querySelector('.builder-accordion-section.active #label-appearance-section'), 'appearance controls are not in Label Content');
    document.getElementById('biz-phone').value = '01234 567890';
    window.setApprovedBuilderStep(5);
    assert.strictEqual(window.eval('approvedBuilderStep'), 5, 'Label Content did not advance to Review & Finalise');
    assert(document.querySelector('.builder-layout').classList.contains('reviewing'), 'review layout was not activated');
    assert(document.getElementById('label-summary').textContent.includes('H315'), 'final summary omitted H315');
    assert.strictEqual(document.querySelectorAll('#btn-png,#btn-pdf,#btn-svg').length, 3, 'approved exports are incomplete');
    window.saveLabel();
    assert.strictEqual(window.eval('getSaved()').length, 1, 'label was not saved');
    document.getElementById('scent-name').value = 'Changed value';
    window.loadLabel(0);
    assert.strictEqual(document.getElementById('scent-name').value, 'Regression Candle', 'saved product name was not restored');
    assert(window.eval('S.pictograms').includes('exclamation'), 'saved pictogram was not restored');
    assert.strictEqual(document.getElementById('intended-use').value, 'For burning', 'intended use was not restored');

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
