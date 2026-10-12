// Exact no-pictogram screenshot fixture, footer geometry and progression.
// Offline harness: font widths are stubbed; preview/export pixel QA is separate.
// Run: node tests/no-pictogram-layout-and-progression.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom'); const __sdsAns = require('./helpers/sds-doc-answer').installed;

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
    window.HTMLElement.prototype.scrollIntoView=()=>{};
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font:'',
      measureText(text){
        const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
        // Width stub isolates geometry; real browser fonts require preview QA.
        return { width:String(text).length * size * .45 };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
    });
    window.eval(labelRendererSource); window.eval(require('fs').readFileSync(require('path').join(__dirname,'..','sds-doc-check.js'),'utf8'));
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
__sdsAns(dom);

const { window } = dom;
const document = window.document;


const exact = {
  shape:'circle', size:'custom', customW:52, customH:52,
  scentName:'Test', productType:'Scented Candle',
  hStatements:'EUH208, EUH210', pStatements:'',
  sensitisers:['Limonene','alpha-Methylcinnamaldehyde'], pictograms:[], signal:'',
  bizName:'CLPeasy', bizAddress:'Scottish Borders, Scotland',
  bizPhone:'07700 900000', bizWebsite:'www.clpeasy.com',
  netWeight:'200g', burnTime:'20 hrs'
};
function fillExact(){
  window.selectShape('circle');window.applySize(52);
  const fields={'scent-name':exact.scentName,'product-type':exact.productType,
    'biz-name':exact.bizName,'biz-address':exact.bizAddress,'biz-phone':exact.bizPhone,
    'biz-website':exact.bizWebsite,'net-weight':exact.netWeight,'burn-time':exact.burnTime};
  for(const [id,value] of Object.entries(fields))document.getElementById(id).value=value;
  window.eval("S.hSelected=['EUH208','EUH210'];S.sensitisers=['Limonene','alpha-Methylcinnamaldehyde'];S.pSelected=[];S.pictograms=[];S.signal='';S.hazardFromExtraction=true;");
  document.getElementById('h-statements').value=exact.hStatements;
  document.getElementById('p-statements').value='';
  window.updateLabel();
  window.eval('approvedBuilderStep=3;S.step=APPROVED_TO_LEGACY[3]');
  document.getElementById('hazard-confirm').checked=true;
}
setTimeout(()=>{
  try {
    const LR=window.LabelRenderer;
    const r=LR.renderLabel(exact,{instanceId:'exact'});
    assert(r.fits, 'Complete screenshot fixture must fit at 52mm: '+r.warnings);
    assert.strictEqual(r.metrics.pictogramBounds,null);
    assert(r.metrics.bcfSizeMm >= LR.BCF_FLOOR_MM, 'Candle-care icon floor preserved');
    const pxPerMm=r.metrics.labelDims.pw/52;
    // Existing product floor: declared font size, not a legal x-height claim.
    assert(r.metrics.fontSizes.footer/pxPerMm >= 1.2-1e-9);
    assert(r.metrics.fontSizes.hazard/pxPerMm >= 1.2-1e-9);
    ['Limonene','alpha-Methylcinnamaldehyde','Safety data sheet available on request','200g','20 hrs'].forEach(t=>assert(r.svg.includes(t),'Missing text: '+t));
    const withPicto=LR.renderLabel({...exact,pictograms:['exclamation']},{instanceId:'with-picto'});
    assert(withPicto.metrics.pictogramBounds,'Real pictogram retains its space');
    assert(withPicto.metrics.pictoSquareSideMm >= LR.PICTO_FLOOR_SQUARE_MM);
    assert(withPicto.metrics.hazardBounds.y0 > r.metrics.hazardBounds.y0+10,'Absent pictogram must release its row');
    fillExact();
    assert.strictEqual(window.canLeaveApprovedBuilderStep(3),true,'Fitting 52mm label may proceed after confirmation');
    // An overlong supplier address blocks the real renderer; confirmation
    // cannot bypass it, including edits made without an input event.
    document.getElementById('biz-address').value='Overlong test address '.repeat(40);
    assert.strictEqual(window.canLeaveApprovedBuilderStep(3),false,'Step 3 must refresh and refuse genuine overflow');
    assert(window.__lastAlert.includes('does not fit'));
    assert.strictEqual(document.getElementById('hazard-confirm').checked,true,'Resizing does not discard SDS confirmation');
    window.eval('approvedBuilderStep=4;S.step=APPROVED_TO_LEGACY[4]');
    assert.strictEqual(window.canLeaveApprovedBuilderStep(4),false,'Step 4 must refuse genuine overflow');
    document.getElementById('biz-address').value=exact.bizAddress;
    assert.strictEqual(window.canLeaveApprovedBuilderStep(4),true,'Corrected details release progression');
    const editor=document.createElement('div');
    editor.innerHTML=window.inlineSizeEditor();document.body.appendChild(editor);
    const width=editor.querySelector('[data-size-width]'),apply=editor.querySelector('button');
    assert(apply.disabled,'Applying the unchanged size must not look actionable');
    width.value='56';window.updateInlineSizeApply(width);
    assert(!apply.disabled,'A changed size makes Apply available');
    window.applyInlineSize(apply);
    assert.strictEqual(window.getDims().mmW,56,'Apply changes the actual print size');
    assert.strictEqual(document.getElementById('hazard-confirm').checked,true);
    document.getElementById('biz-phone').value='';
    assert.strictEqual(window.canLeaveApprovedBuilderStep(4),false,'Missing phone remains blocked');
    assert(window.__lastAlert.toLowerCase().includes('phone'),'Missing details get their own message');
    assert.deepStrictEqual(errors,[]);
    console.log('No-pictogram layout and progression tests passed (offline geometry; browser font QA required).');
    process.exit(0);
  }catch(e){console.error(e.stack||e);process.exit(1);}
},50);
