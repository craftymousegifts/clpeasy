const puppeteer = require('/home/user/clpeasy/node_modules/puppeteer');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2];
const row={id:'u1',email:'payg-browser-qa@example.com',full_name:'QA',plan:'payg',is_pro:false,subscription_status:'payg',trial_end:new Date(Date.now()-86400000).toISOString(),downloads_used:0,downloads_limit:0,topup_credits:6,billing_cycle:'monthly',created_at:new Date(Date.now()-40*86400000).toISOString()};
const stub=`window.supabase={createClient:function(){var row=${JSON.stringify(row)};
 var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},insert:function(){return Promise.resolve({error:null})},upsert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
 single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
 return {auth:{getSession:async function(){return {data:{session:{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'u1',email:row.email}}}},
 onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
 from:function(){return Object.create(q)},rpc:async function(){return {data:null,error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;
const server=http.createServer((req,res)=>{let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';const p=path.join(ROOT,f);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();}
 const ext=path.extname(p);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.css':'text/css','.jpg':'image/jpeg'}[ext]||'application/octet-stream'});fs.createReadStream(p).pipe(res);
}).listen(0,'127.0.0.1',async()=>{
 const port=server.address().port, base=`http://127.0.0.1:${port}`;
 const browser=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 async function open(page){const t=await browser.newPage();const errs=[];t.on('pageerror',e=>errs.push(e.message));t.on('console',m=>{if(['error','log'].includes(m.type())&&/fail|error|Library/i.test(m.text()))errs.push(m.type()+': '+m.text())});
  await t.setRequestInterception(true);t.on('request',r=>{const u=r.url();if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:stub});
  if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();return r.respond({status:204,body:''});});
  t.on('dialog',d=>{errs.push('dialog: '+d.message());d.dismiss();});
  await t.goto(base+'/'+page,{waitUntil:'load'});await new Promise(r=>setTimeout(r,2000));return {t,errs};}
 const b=await open('builder.html');
 const st=()=>{const sp=document.getElementById('smart-paste-input');const ex=document.querySelector('.btn-extract');const h=document.getElementById('h-statements');const cl=document.getElementById('hazard-clear-link');
   return {box:sp.value.length, boxReadOnly:sp.readOnly, extractDisabled:ex.disabled, hField:h.value, hReadOnly:h.readOnly, signal:S.signal, pictos:S.pictograms, sens:S.sensitisers, clearLinkShown:cl.style.display, id:editingLabelId};};
 const r1=await b.t.evaluate(async(stSrc)=>{const st=eval(stSrc);document.getElementById('scent-name').value='iugigig';document.getElementById('product-type').value='Scented Candle';
   document.getElementById('smart-paste-input').value='2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nH412 Harmful to aquatic life with long lasting effects.\nP261 P272 P280 P302+P352 P501\nContains Linalool, Limonene. May produce an allergic reaction.';
   extractSDS(); const a=st(); await saveLabel(); await new Promise(r=>setTimeout(r,400)); return {afterExtract:a, afterSave:st()};}, st.toString());
 console.log('FRESH', JSON.stringify(r1), b.errs);
 const id=r1.afterSave.id;
 const b2=await open('builder.html?label='+id);
 await new Promise(r=>setTimeout(r,800));
 const re=await b2.t.evaluate((stSrc)=>{document.getElementById('smart-paste-input').value='2.2 Label elements\nSignal word: Danger\nH318 Causes serious eye damage.\nP280 P305+P351+P338';extractSDS();return eval(stSrc)();}, st.toString());
 console.log('REEXTRACT', JSON.stringify(re));
 console.log('REOPENED', JSON.stringify(await b2.t.evaluate((stSrc)=>eval(stSrc)(), st.toString())), b2.errs);
 await browser.close();server.close();});
