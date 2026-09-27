const puppeteer=require('/home/user/clpeasy/node_modules/puppeteer');const http=require('http');const fs=require('fs');const path=require('path');
const ROOT='/home/user/clpeasy';
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'builder.html');if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(r);});
srv.listen(0,'127.0.0.1',async()=>{const port=srv.address().port;const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});await p.setRequestInterception(true);p.on('request',r=>r.url().includes('127.0.0.1:'+port)?r.continue():r.abort());const alerts=[];p.on('dialog',d=>{alerts.push(d.message());d.accept();});const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/builder.html`,{waitUntil:'load'});await new Promise(o=>setTimeout(o,700));
const r=await p.evaluate(async()=>{
 const v1={schemaVersion:1,scentName:'Old Label',productType:'Room Spray',shape:'rectangle',size:'custom',customW:150,customH:100,signal:'Warning',hStatements:'H317, H319',pStatements:'P102, P261, P305+P351+P338, P370+P378, P501',sensitisers:['Linalool'],pictograms:['exclamation'],bizName:'Crafty Mouse Gifts',bizAddress:'12 Mill Lane',bizPhone:'01234 567890'};
 localStorage.setItem('clpeasy_labels__u_guest',JSON.stringify([v1]));currentUser=null;await initSavedLabelLibrary();
 const stored0=JSON.stringify(getSaved()[0]);
 const snap=JSON.stringify(v1);const savedId=getSaved()[0].id;window.__sid=savedId;loadLabelAndGotoStep5(savedId);window.__stored0=stored0;const c=document.getElementById('verify-checkbox');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));
  const storedAfterOpen=JSON.stringify(getSaved()[0]);const before={storedRecordUnchangedByOpening:storedAfterOpen===window.__stored0,step:approvedBuilderStep,allowed:_downloadAllowed(),incomplete:LabelRenderer.incompletePStatements({pStatements:S.pStatements,pChoices:S.pChoices})};
 // maker completes in Step 3 through the real cards
 setApprovedBuilderStep(3);
 const fill=(code,v)=>{const i=document.querySelector('.p-choice-card[data-code="'+code+'"] input[data-role=text]');i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));};
 fill('P261','vapour or dust');fill('P370+P378','foam');const s=document.querySelector('.p-choice-card[data-code="P501"] input[value="both"]');s.checked=true;s.dispatchEvent(new Event('change',{bubbles:true}));fill('P501','an approved waste site');
 const hc=document.getElementById('hazard-confirm');hc.checked=true;hc.dispatchEvent(new Event('change',{bubbles:true}));
 setApprovedBuilderStep(4);const step4=approvedBuilderStep;setApprovedBuilderStep(5);const c2=document.getElementById('verify-checkbox');c2.checked=true;c2.dispatchEvent(new Event('change',{bubbles:true}));
 const t=buildSVG(false).replace(/<tspan[^>]*>/g,' ').replace(/<[^>]+>/g,'').replace(/\s+/g,' ');
 await saveLabel();await new Promise(o=>setTimeout(o,500));const all=getSaved();const saved=all.find(x=>x.id===window.__sid);window.__n=all.length;
 return {originalRecordUntouched:JSON.stringify(v1)===snap,before,step4,stepNow:approvedBuilderStep,after:{allowed:_downloadAllowed()},printed:['Avoid breathing vapour or dust.','In case of fire: Use foam to extinguish.','Dispose of contents/container to an approved waste site.','IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses, if present and easy to do. Continue rinsing.'].map(x=>t.includes(x)),resaved:{count:window.__n,id:saved&&saved.id,schemaVersion:saved&&saved.schemaVersion,pChoiceCodes:saved&&Object.keys(saved.pChoices||{})}};});
console.log(JSON.stringify(r,null,1),'alerts',JSON.stringify(alerts),'errors',JSON.stringify(errs));await b.close();srv.close();});
