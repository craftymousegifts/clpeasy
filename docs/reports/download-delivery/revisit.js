// Real-file download harness used for DOWNLOAD-DELIVERY-SIGNOFF-2026-10-04.md. Simulated accounts only; no real credentials.
// composer-dl.js / revisit.js expect JSZip 3.10.1 at ./package/dist/jszip.min.js (npm pack jszip@3.10.1) because the CDN is blocked here.
const puppeteer=require('/home/user/clpeasy/node_modules/puppeteer');
const fs=require('fs'),path=require('path');
const H=fs.readFileSync(path.join(__dirname,'builder-dl.js'),'utf8');const ACCOUNT=eval(H.match(/const ACCOUNT=(`[\s\S]*?`);/)[1]);
const JSZIP=fs.readFileSync(path.join(__dirname,'package/dist/jszip.min.js'),'utf8');
const BASE=process.argv[2];
(async()=>{const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const p=await b.newPage();await p.setRequestInterception(true);
p.on('request',r=>{const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:ACCOUNT});if(u.includes('jszip'))return r.respond({status:200,contentType:'text/javascript',body:JSZIP});if(u.startsWith(BASE)||/^(data|blob):/.test(u))return r.continue();return r.respond({status:204,body:''});});
await p.goto(BASE+'/builder.html',{waitUntil:'load'});await new Promise(r=>setTimeout(r,2000));
const id=await p.evaluate(async()=>{const rec={id:'11111111-2222-4333-8444-555555555901',schemaVersion:1,scentName:'Revisit',productType:'Scented Candle',shape:'circle',size:63.5,signal:'Warning',sdsSignal:'Warning',hStatements:'H317',pictograms:['exclamation'],sensitisers:['Linalool'],bizName:'QA',bizAddress:'1 Test St',bizPhone:'0123',pStatements:'',p280Items:[],savedAt:'04/10/2026'};await LabelLibrary.mutate(()=>({collection:[rec],usedId:rec.id}));return rec.id;});
const counts=[];
for(const u of ['/builder.html?label='+id,'/builder.html?label='+id,'/print.html?label='+id,'/print.html','/my-labels.html']){await p.goto(BASE+u,{waitUntil:'load'});await new Promise(r=>setTimeout(r,2500));counts.push([u,await p.evaluate(()=>(window.__rpc||[]).filter(x=>x==='consume_download').length)]);}
console.log(JSON.stringify(counts));await b.close();})();
