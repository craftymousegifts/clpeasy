// 4 Oct 2026 owner decision: supplier questionnaire removed; ordinary hazard review and export checks remain.
// Recovery journey for labels saved before the supplier-document check
// (owner request, 3 Oct 2026). Real Chromium, signed-out guest, no network.
//   1. A fine-tuned label is made and saved in the Builder; its document
//      confirmation is then removed, exactly like a label saved before this
//      release.
//   2. Reopened from My Labels: Step 5 shows "not ready to download", exports
//      are blocked, Save (as a draft) still works.
//   3. The maker follows "Go to Step 3", answers the document check through
//      the real form, continues to Step 5 and saves.
//   4. Reopened again: ready to download, with design and fine-tune settings
//      unchanged.
//   5. Print Sheet Composer: the label shows no draft marker, adds to a sheet,
//      and the sheet's export gate is clear, with the fine-tune settings intact.
// No product type is substituted; the label is a real "Scented Candle".
//   node tests/sds-document-recovery-journey.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP sds-document-recovery-journey: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP sds-document-recovery-journey: no Chromium'); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){var q={select:function(){return q},eq:function(){return q},update:function(){return q},upsert:function(){return q},single:async function(){return {data:null,error:null}},maybeSingle:async function(){return {data:null,error:null}},then:function(r){return Promise.resolve({data:null,error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return q},rpc:async function(){return {data:null,error:null}}}}};';
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 Avoid breathing vapours.\nP501 Dispose of contents in accordance with local regulations.\nContains Linalool. May produce an allergic reaction.';
const SIGNED_IN = "window.supabase={createClient:function(){var row={id:'u1',email:'qa@example.test',plan:'easy_start',status:'active',subscription_status:'active',trial_end:null,downloads_used:0,downloads_limit:0,topup_credits:0,created_at:'2026-09-01T00:00:00Z'};var q={select:function(){return q},eq:function(){return q},neq:function(){return q},order:function(){return q},limit:function(){return q},update:function(){return q},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},single:async function(){return {data:row,error:null}},maybeSingle:async function(){return {data:row,error:null}},then:function(r){return Promise.resolve({data:[row],error:null}).then(r)}};return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){return q},rpc:async function(){return {data:null,error:null}}}}};";
const DESIGN_KEYS = ['scentName', 'productType', 'shape', 'size', 'customW', 'customH', 'bizName', 'bizAddress', 'bizPhone', 'fragLoad',
  'hStatements', 'pStatements', 'pictograms', 'sensitisers', 'signal', 'sdsSignal', 'bgColour', 'textColour', 'showBorder',
  'hazardFSOverride', 'scentFSOverride', 'bizNameFSOverride', 'typeFSOverride', 'sigFSOverride', 'hazardYOffset'];
const pick = r => Object.fromEntries(DESIGN_KEYS.map(k => [k, r[k] === undefined ? null : r[k]]));
let passed = 0;
const ok = l => { passed++; console.log('PASS:', l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failed = false;
  async function open(page, vp, supa) {
    const t = await browser.newPage();
    await t.setViewport(vp || { width: 1366, height: 900 });
    t.errs = []; t.on('pageerror', e => t.errs.push(e.message)); t.on('dialog', d => d.dismiss());
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: supa || SIGNED_OUT });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await sleep(1500);
    return t;
  }
  try {
    for(const width of [360,390,1366]){
      const b=await open('builder.html',{width,height:900});
      const made=await b.evaluate(async SDS=>{
        document.getElementById('scent-name').value='Simple SDS Candle';
        document.getElementById('product-type').value='Scented Candle';onProductTypeChange();
        document.getElementById('frag-load').value='';
        document.getElementById('biz-name').value='QA Candles';
        document.getElementById('biz-address').value='1 Test Street, Testtown, TE1 1ST';
        document.getElementById('biz-phone').value='01234 567890';
        selectShape('circle');document.getElementById('custom-w').value=100;onDimInput();readForm();updateLabel();
        setApprovedBuilderStep(2);checkStep2Next();
        if(approvedBuilderStep!==3)throw new Error("Blank fragrance percentage blocked Step 2 Next");
        document.getElementById('smart-paste-input').value=SDS;extractSDS();
        const unchecked=canLeaveApprovedBuilderStep(3);
        document.getElementById('hazard-confirm').checked=true;toggleHazardNext();
        setApprovedBuilderStep(4);setApprovedBuilderStep(5);
        nudgeScentFS(-1);nudgeHazardFS(1);readForm();updateLabel();
        const beforeVerify=_downloadAllowed();document.getElementById('verify-checkbox').checked=true;toggleDownload();
        const allowed=_downloadAllowed();await saveLabel();
        const id=editingLabelId;const rec=JSON.parse(JSON.stringify(LabelLibrary.findById(getSaved(),id)));
        return {id,rec,unchecked,beforeVerify,allowed,step:approvedBuilderStep,questionnaire:!!document.getElementById('sds-doc-check'),overflow:document.documentElement.scrollWidth>innerWidth};
      },SDS);
      assert.strictEqual(made.questionnaire,false);assert.strictEqual(made.unchecked,false);
      assert.strictEqual(made.beforeVerify,false);assert.strictEqual(made.allowed,true);assert.strictEqual(made.step,5);assert.strictEqual(made.overflow,false);
      assert(!made.rec.sdsDoc||!made.rec.sdsDoc.confirmed,'no invented supplier confirmation');
      const savedText=await b.evaluate(()=>document.getElementById('btn-save').textContent);assert(/Label saved/.test(savedText));
      await b.close();
      const reopened=await open('builder.html?label='+made.id,{width,height:900});
      const restored=await reopened.evaluate(()=>({h:S.hStatements,s:S.scentFSOverride,hf:S.hazardFSOverride,notice:document.getElementById('sds-doc-export-note').style.display}));
      assert.strictEqual(restored.h,made.rec.hStatements);assert.strictEqual(restored.s,made.rec.scentFSOverride);assert.strictEqual(restored.hf,made.rec.hazardFSOverride);assert.strictEqual(restored.notice,'none');await reopened.close();
      const c=await open('print.html');
      const sheet=await c.evaluate(id=>{addToSheet(id);updateExportButtonState();return{gate:getSheetFitBlockMessage(),draft:/Draft: document check/.test(document.getElementById('sli-'+id).textContent)};},made.id);
      assert.strictEqual(sheet.gate,null);assert.strictEqual(sheet.draft,false);await c.close();
      ok(width+'px: paste → hazard review → Step 5 → verification → save/reopen → Composer, no questionnaire');
    }
  }catch(e){failed=true;console.error('FAIL:',e.stack||e);}finally{
    await browser.close();server.close();if(failed)process.exit(1);
    console.log('SDS simple-flow journey passed ('+passed+' groups)');
  }
});
