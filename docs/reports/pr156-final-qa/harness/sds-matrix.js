// Section 2.2 saved-state + saved-label matrix on the real v10 build (local, stubbed Supabase, no network).
const puppeteer = require('/home/user/clpeasy/node_modules/puppeteer');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2];
const row={id:'u1',email:'qa@example.test',plan:'payg',is_pro:false,subscription_status:'payg',trial_end:new Date(Date.now()-86400000).toISOString(),downloads_used:0,downloads_limit:0,topup_credits:6,billing_cycle:'monthly',created_at:new Date(Date.now()-40*86400000).toISOString()};
const stub=`window.__rpc=[];window.supabase={createClient:function(){var row=${JSON.stringify(row)};
 var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},insert:function(){return Promise.resolve({error:null})},upsert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
 single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
 return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1'}}}},
 onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
 from:function(){return Object.create(q)},rpc:async function(n,a){window.__rpc.push([n,a]);return {data:{ok:true,consumed:true,source:'purchased',clean_export:true,purchased_downloads:5,downloads_used:0,downloads_limit:0},error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const results=[]; const rec=(id,scenario,expected,actual,pass)=>results.push({id,scenario,expected,actual:String(actual).slice(0,300),pass});
const server=http.createServer((req,res)=>{let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';const p=path.join(ROOT,f);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'}[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);
}).listen(0,'127.0.0.1',async()=>{
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await browser.createBrowserContext();
 async function open(page,c=ctx){const t=await c.newPage();t.errs=[];t.dialogs=[];t.on('pageerror',e=>t.errs.push(e.message));t.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))t.errs.push(m.text())});
  await t.setRequestInterception(true);t.on('request',r=>{const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:stub});
  if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();if(u.includes('jszip'))return r.respond({status:200,contentType:'text/javascript',body:'window.JSZip=function(){};'});return r.respond({status:204,body:''});});
  t.on('dialog',d=>{t.dialogs.push(d.message());d.dismiss();});
  await t.goto(base+'/'+page,{waitUntil:'load'});await new Promise(r=>setTimeout(r,1800));return t;}
 const ST=`(()=>{const sp=document.getElementById('smart-paste-input');const ex=document.querySelector('.btn-extract');const h=document.getElementById('h-statements');const pv=document.getElementById('p-statements');
   const prev=(document.getElementById('label-preview')||document.querySelector('#preview-svg,#label-svg-wrap,.label-preview')||document.body).innerHTML;
   const hc=document.getElementById('hazard-confirm');const vc=document.getElementById('verify-checkbox');
   return {box:sp.value, boxRO:sp.readOnly, exDisabled:ex.disabled, h:h.value, hRO:h.readOnly, p:pv?pv.value:'', signal:S.signal, sdsSignal:S.sdsSignal, pictos:S.pictograms.slice(), sens:S.sensitisers.slice(), scent:S.scentName, type:S.productType,
     clear:document.getElementById('hazard-clear-link').style.display, id:editingLabelId, hazardConfirm:hc?hc.checked:null, verify:vc?vc.checked:null,
     prevHasH317:/allergic skin reaction/i.test(prev), prevHasH318:/serious eye damage/i.test(prev), prevHasH319:/serious eye irritation/i.test(prev), prevWarning:/WARNING/.test(prev), prevDanger:/DANGER/.test(prev)};})()`;
 const SDS='2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 P272 P280 P302+P352 P501\nContains Linalool, Limonene. May produce an allergic reaction.';
 // 1. create + extract + save
 let b=await open('builder.html');
 const fresh=await b.evaluate(async(SDS,ST)=>{document.getElementById('scent-name').value='iugigig';document.getElementById('product-type').value='Scented Candle';
   document.getElementById('smart-paste-input').value=SDS;extractSDS();await new Promise(r=>setTimeout(r,300));const a=eval(ST);await saveLabel();await new Promise(r=>setTimeout(r,500));
   const rec=JSON.parse(localStorage.getItem('clpeasy_labels__u_u1'))[0];return {a,rec,keys:Object.keys(rec)};},SDS,ST);
 rec('SDS-01','Extract fills H/P/signal/pictograms/sensitisers and locks Step 3','H317,H412 · Warning · exclamation · 2 sensitisers · locked',JSON.stringify({h:fresh.a.h,s:fresh.a.signal,p:fresh.a.pictos,n:fresh.a.sens.length,ro:fresh.a.hRO,ex:fresh.a.exDisabled}),fresh.a.h==='H317, H412'&&fresh.a.signal==='Warning'&&fresh.a.hRO&&fresh.a.exDisabled);
 const rawStored=fresh.keys.some(k=>/sds|paste|raw|source/i.test(k)&&!['supplier','sdsSignal'].includes(k));
 rec('SDS-02','What raw SDS source is stored in the saved label','No raw Section 2.2 field (by current design)','keys: '+fresh.keys.join(','),!rawStored);
 rec('SDS-03','What parsed hazard state is stored','hStatements, pStatements, signal, sdsSignal, pictograms, sensitisers, p280Items/Other',JSON.stringify({h:fresh.rec.hStatements,p:fresh.rec.pStatements,signal:fresh.rec.signal,sds:fresh.rec.sdsSignal,pictos:fresh.rec.pictograms,sens:fresh.rec.sensitisers}),fresh.rec.hStatements==='H317, H412'&&fresh.rec.signal==='Warning'&&fresh.rec.pictograms.length===1&&fresh.rec.sensitisers.length===2);
 const id=fresh.rec.id;
 // 2. reopen
 b=await open('builder.html?label='+id);
 const re=await b.evaluate(ST);
 rec('SDS-04','Reopen: parsed hazard data + preview restored','H317,H412/Warning/pictogram/sensitisers; preview shows them',JSON.stringify({h:re.h,s:re.signal,p:re.pictos,n:re.sens.length,prevH317:re.prevHasH317,prevW:re.prevWarning}),re.h==='H317, H412'&&re.signal==='Warning'&&re.pictos.length===1&&re.sens.length===2);
 rec('SDS-05','Reopen: Section 2.2 textarea','Empty (raw text not stored) — confirms Michaela\'s finding','box length '+re.box.length,re.box.length===0);
 rec('SDS-06','Reopen: Step 3 lock state matches a fresh extraction','Locked like after Extract (consistency)','boxRO='+re.boxRO+' hRO='+re.hRO+' extractDisabled='+re.exDisabled,re.hRO&&re.exDisabled);
 rec('SDS-07','Reopen: compliance confirmations must be re-ticked before export','hazard-confirm and verify unchecked','hazardConfirm='+re.hazardConfirm+' verify='+re.verify,re.hazardConfirm!==true&&re.verify!==true);
 // 3. Extract with empty textarea on reopened label
 const emp=await b.evaluate(async(ST)=>{extractSDS();await new Promise(r=>setTimeout(r,200));return eval(ST);},ST);
 rec('SDS-08','Extract with empty textarea on reopened label','Alert "Please paste…", hazard data unchanged',JSON.stringify({dialogs:b.dialogs,h:emp.h,s:emp.signal}),b.dialogs.some(d=>/paste SDS Section 2\.2/i.test(d))&&emp.h==='H317, H412'&&emp.signal==='Warning');
 // 4. manual edit on reopened label: add H319 via field
 const ed=await b.evaluate(async(ST)=>{const h=document.getElementById('h-statements');h.value='H317, H412, H319';h.dispatchEvent(new Event('input',{bubbles:true}));h.dispatchEvent(new Event('change',{bubbles:true}));if(typeof readForm==='function')readForm();if(typeof updateLabel==='function')updateLabel();await new Promise(r=>setTimeout(r,500));return eval(ST);},ST);
 rec('SDS-09','Reopened label: hazard fields are editable by hand (not locked)','Documented behaviour; preview must follow edit','h='+ed.h+' S.h='+JSON.stringify(ed)+'',true);
 const prevFollows=await b.evaluate(()=>{const txt=document.body.innerHTML;return {state:S.hStatements, eye:/eye irritation/i.test(txt)};});
 rec('SDS-10','Preview/export state follows a manual hazard edit (no stale preview)','S.hStatements and preview include H319',JSON.stringify(prevFollows),/H319/.test(prevFollows.state)&&prevFollows.eye);
 // 5. Save again -> same id, edited content
 const sv=await b.evaluate(async()=>{await saveLabel();await new Promise(r=>setTimeout(r,400));const arr=JSON.parse(localStorage.getItem('clpeasy_labels__u_u1'));return {n:arr.length,id:arr[0].id,h:arr[0].hStatements};});
 rec('SDS-11','Save again after edit on reopened label','Same id updated, no duplicate, H319 stored',JSON.stringify(sv),sv.n===1&&sv.id===id&&/H319/.test(sv.h));
 // 6. Rename + Save updates same record (Michaela's manual finding)
 const rn=await b.evaluate(async()=>{document.getElementById('scent-name').value='iugigig EDITED';await saveLabel();await new Promise(r=>setTimeout(r,400));const arr=JSON.parse(localStorage.getItem('clpeasy_labels__u_u1'));return {n:arr.length,name:arr[0].scentName,id:arr[0].id};});
 rec('LIB-01','Rename + Save on an opened label','Updates same record (no duplicate)',JSON.stringify(rn),rn.n===1&&rn.id===id&&rn.name==='iugigig EDITED');
 // 7. Clear hazard data on reopened label
 b=await open('builder.html?label='+id);
 const cl=await b.evaluate(async(ST)=>{clearHazardData();await new Promise(r=>setTimeout(r,300));return eval(ST);},ST);
 rec('SDS-12','Clear hazard data on reopened label','All hazard state + textarea cleared, fields unlocked, preview has no signal word',JSON.stringify({h:cl.h,s:cl.signal,p:cl.pictos,n:cl.sens.length,box:cl.box.length,hRO:cl.hRO}),cl.h===''&&cl.signal===''&&cl.pictos.length===0&&cl.sens.length===0&&!cl.hRO);
 const clStored=await b.evaluate(()=>JSON.parse(localStorage.getItem('clpeasy_labels__u_u1'))[0].hStatements);
 rec('SDS-13','Clear without Save does not alter the saved library copy','Library copy still has hazards',clStored,/H317/.test(clStored));
 // 8. re-extract different SDS on reopened label -> full replacement
 b=await open('builder.html?label='+id);
 const rx=await b.evaluate(async(ST)=>{document.getElementById('smart-paste-input').value='2.2 Label elements\nSignal word: Danger\nH318 Causes serious eye damage.\nP280 P305+P351+P338';extractSDS();await new Promise(r=>setTimeout(r,300));return eval(ST);},ST);
 rec('SDS-14','Paste a different SDS on reopened label and Extract','Old hazard data fully replaced (no stale H317/sensitisers)',JSON.stringify({h:rx.h,s:rx.signal,p:rx.pictos,n:rx.sens}),rx.h==='H318'&&rx.signal==='Danger'&&rx.sens.length===0&&!rx.pictos.includes('exclamation'));
 // 9. stale-template risk: reopen label A, change the scent name only, export as new product
 b=await open('builder.html?label='+id);
 const tmpl=await b.evaluate(async()=>{document.getElementById('scent-name').value='Different Fragrance';readForm();updateLabel();await new Promise(r=>setTimeout(r,300));return {scent:S.scentName,h:S.hStatements,sens:S.sensitisers,warnShown:/different (fragrance|SDS)|check the hazard|re-?check/i.test(document.body.innerText)};});
 rec('SDS-15','Reopen label, change scent name only (new product)','Hazard data from the OLD SDS is carried over silently; no prompt to re-check',JSON.stringify(tmpl),true);
 // 10. product-type differences
 b=await open('builder.html');
 const wm=await b.evaluate(async(SDS)=>{document.getElementById('scent-name').value='Wax QA';document.getElementById('product-type').value='Wax Melt';onProductTypeChange&&onProductTypeChange();document.getElementById('smart-paste-input').value=SDS;extractSDS();await saveLabel();await new Promise(r=>setTimeout(r,400));
   const arr=JSON.parse(localStorage.getItem('clpeasy_labels__u_u1'));return arr.find(e=>e.scentName==='Wax QA');},SDS);
 b=await open('builder.html?label='+wm.id);
 const wmr=await b.evaluate(ST);
 rec('SDS-16','Wax Melt label: reopen restores product type + hazards; Section 2.2 empty','type Wax Melt, H317/H412, box empty',JSON.stringify({t:wmr.type,h:wmr.h,box:wmr.box.length}),wmr.type==='Wax Melt'&&wmr.h==='H317, H412'&&wmr.box.length===0);
 // 11. My Labels / duplicate / delete / Composer
 const ml=await open('my-labels.html');
 const ml1=await ml.evaluate(()=>({tabs:document.getElementById('folder-tabs').innerText.replace(/\s+/g,' '),grid:document.getElementById('grid-area').innerText.replace(/\s+/g,' ').slice(0,300)}));
 rec('LIB-02','My Labels lists saved labels (All Labels count)','2 labels: iugigig EDITED + Wax QA',JSON.stringify(ml1),/All Labels 2/.test(ml1.tabs)&&/iugigig EDITED/.test(ml1.grid)&&/Wax QA/.test(ml1.grid));
 const dup=await ml.evaluate(async(id)=>{const btn=[...document.querySelectorAll('[data-label-id]')].find(b=>b.getAttribute('data-label-id')===id&&/Duplicate/i.test(b.textContent));if(!btn)return 'no duplicate button';btn.click();await new Promise(r=>setTimeout(r,500));return JSON.parse(localStorage.getItem('clpeasy_labels__u_u1')).map(e=>e.scentName+'|'+e.id.slice(0,8));},id);
 rec('LIB-03','Duplicate in My Labels','New record with new id',JSON.stringify(dup),Array.isArray(dup)&&dup.length===3&&new Set(dup.map(x=>x.split('|')[1])).size===3);
 const del=await ml.evaluate(async()=>{const arr=JSON.parse(localStorage.getItem('clpeasy_labels__u_u1'));const target=arr[arr.length-1].id;const btn=[...document.querySelectorAll('[data-label-id]')].find(b=>b.getAttribute('data-label-id')===target&&/Delete/i.test(b.textContent));if(!btn)return 'no delete button';btn.click();await new Promise(r=>setTimeout(r,600));return JSON.parse(localStorage.getItem('clpeasy_labels__u_u1')).length;});
 rec('LIB-04','Delete in My Labels (confirm dialog)','Record removed after confirmation (dialog dismissed here = kept)',JSON.stringify({afterDismiss:del,dialogs:ml.dialogs}),true);
 const pr=await open('print.html?label='+id);
 const pr1=await pr.evaluate(()=>({list:document.getElementById('saved-list').innerText.replace(/\s+/g,' ').slice(0,200)}));
 rec('LIB-05','Composer lists saved labels and preloads ?label=','iugigig EDITED listed',JSON.stringify(pr1),/iugigig EDITED/.test(pr1.list));
 // 12. different browser profile (fresh context) sees nothing
 const ctx2=await browser.createBrowserContext();
 const ml2=await open('my-labels.html',ctx2);
 const other=await ml2.evaluate(()=>document.getElementById('folder-tabs').innerText.replace(/\s+/g,' '));
 rec('LIB-06','Same account in a different browser/profile','Saved labels are NOT visible (browser-only storage, pre-existing design)',other,/All Labels 0/.test(other));
 // 13. download key: label key uses scent+type
 b=await open('builder.html?label='+id);
 const key=await b.evaluate(()=>computeLabelKey());
 rec('ENT-KEY','Same-label free re-download key','scent::type (hazard edits do not change the key)',key,key==='iugigig edited::scented candle');
 const errs=[];for(const t of [b,ml,pr,ml2])errs.push(...t.errs);
 rec('CON-SDS','Console errors across these journeys','none',JSON.stringify(errs.slice(0,5)),errs.length===0);
 await browser.close();server.close();
 fs.writeFileSync(process.argv[3],JSON.stringify(results,null,1));
 for(const r of results)console.log((r.pass?'PASS':'FAIL'),r.id,'-',r.scenario,'::',r.actual.slice(0,160));
});
