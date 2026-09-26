const puppeteer = require('/home/user/clpeasy/node_modules/puppeteer');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2], OUT=process.argv[3], SHOTS=OUT.replace(/\.json$/,'-shots'); fs.mkdirSync(SHOTS,{recursive:true});
const DAY=86400000, iso=ms=>new Date(Date.now()+ms).toISOString();
const ST={
 trial:{plan:'trial',subscription_status:'trialing',trial_end:iso(5*DAY),downloads_used:3,downloads_limit:10,topup_credits:0},
 expired:{plan:'trial',subscription_status:'trialing',trial_end:iso(-2*DAY),downloads_used:0,downloads_limit:10,topup_credits:0},
 payg5:{plan:'payg',subscription_status:'payg',trial_end:iso(-2*DAY),downloads_used:0,downloads_limit:0,topup_credits:5},
 payg0:{plan:'payg',subscription_status:'payg',trial_end:iso(-9*DAY),downloads_used:0,downloads_limit:0,topup_credits:0},
 start:{plan:'easy_start',subscription_status:'active',downloads_used:4,downloads_limit:20,topup_credits:0,billing_cycle:'monthly'},
 proLimit:{plan:'easy_pro',is_pro:true,subscription_status:'active',downloads_used:30,downloads_limit:30,topup_credits:0,billing_cycle:'monthly'},
 cancelSched:{plan:'easy_pro',is_pro:true,subscription_status:'cancelled',deletion_date:iso(10*DAY),downloads_used:5,downloads_limit:30,topup_credits:0},
 paused:{plan:'easy_start',subscription_status:'paused',downloads_used:1,downloads_limit:20,topup_credits:0},
 ended:{plan:'free',subscription_status:'cancelled',deletion_date:iso(-5*DAY),downloads_used:0,downloads_limit:0,topup_credits:0},
 annual:{plan:'easy_start',subscription_status:'active',billing_cycle:'annual',downloads_used:20,downloads_limit:20,downloads_reset_date:iso(-2*DAY).slice(0,10),topup_credits:0},
};
const BILLING={start:{available:true,amount_due:899,currency:'gbp',next_payment_at:Math.floor(Date.now()/1000)+20*86400,interval:'month',discounted:true,promo_2026:true},
 proLimit:{available:false,reason:'lookup_failed'}, annual:{available:true,amount_due:9900,currency:'gbp',next_payment_at:Math.floor(Date.now()/1000)+200*86400,interval:'year',discounted:false,promo_2026:false}};
function stub(row,signedIn){return `window.__rpc=[];window.supabase={createClient:function(){var row=${JSON.stringify(Object.assign({id:'u1',email:'qa@example.test',full_name:'QA Maker',created_at:iso(-40*DAY),billing_cycle:'monthly'},row))};
 var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
 single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
 return {auth:{getSession:async function(){return {data:{session:${signedIn}?{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{full_name:'QA Maker'}}}:null}}},getUser:async function(){return {data:{user:${signedIn}?{id:'u1'}:null}}},
 onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
 from:function(){return Object.create(q)},rpc:async function(n,a){window.__rpc.push([n,a]);return {data:false,error:null}},functions:{invoke:async function(){return {data:null,error:null}}}};}};`;}
const server=http.createServer((req,res)=>{let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';const p=path.join(ROOT,f);
 if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'}[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);
}).listen(0,'127.0.0.1',async()=>{
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const out=[];
 async function visit(page,key,vp,opts={}){
  const t=await browser.newPage(); await t.setViewport(vp.size); if(vp.mobile) await t.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  const errs=[], dialogs=[], nav=[], fnCalls=[];
  t.on('pageerror',e=>errs.push(e.message)); t.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text())});
  t.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
  t.on('framenavigated',f=>{if(f===t.mainFrame())nav.push(f.url().replace(base,''));});
  await t.setRequestInterception(true);
  t.on('request',r=>{const u=r.url();
   if(u.includes('supabase-js'))return r.respond({status:200,contentType:'text/javascript',body:stub(ST[key]||{},opts.signedOut?false:true)});
   if(u.includes('/functions/v1/')){fnCalls.push(u.split('/functions/v1/')[1]);const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
     if(r.method()==='OPTIONS')return r.respond({status:200,headers:cors,body:'ok'});
     if(u.includes('billing-status'))return r.respond({status:200,headers:cors,contentType:'application/json',body:JSON.stringify(BILLING[key]||{available:false,reason:'no_subscription'})});
     if(u.includes('create-checkout-session')){const sub=['start','proLimit','cancelSched','annual'].includes(key);
       return r.respond({status:sub?403:200,headers:cors,contentType:'application/json',body:JSON.stringify(sub?{error:"Pay As You Go isn't available while you have an Easy Start or Easy Pro subscription.",code:'PAYG_NOT_FOR_SUBSCRIBERS'}:{url:'https://checkout.stripe.com/c/pay/cs_test_fake'})});}
     return r.respond({status:200,headers:cors,contentType:'application/json',body:'{}'});}
   if(u.startsWith('https://checkout.stripe.com'))return r.respond({status:200,contentType:'text/html',body:'<html><body>stripe</body></html>'});
   if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return r.continue();
   if(u.includes('jszip'))return r.respond({status:200,contentType:'text/javascript',body:'window.JSZip=function(){};'});
   return r.respond({status:204,body:''});});
  try{await t.goto(base+'/'+page,{waitUntil:'load',timeout:20000});}catch(e){errs.push('goto '+e.message);}
  await new Promise(r=>setTimeout(r,1500));
  let info={};
  try{ info=await t.evaluate(()=>{const tx=id=>{const e=document.getElementById(id);return e?e.innerText.replace(/\s+/g,' ').trim().slice(0,160):null;};
   const vis=sel=>{const e=document.querySelector(sel);return !!(e&&e.offsetParent!==null);};
   const topup=document.querySelector('.su-topup');
   return {path:location.pathname+location.search, hScroll:document.documentElement.scrollWidth>window.innerWidth+1, suPlan:tx('su-plan'), suCount:tx('su-count'), suLink:topup?topup.getAttribute('href'):null,
    planName:tx('plan-name')||tx('db-plan-name'), actions:tx('action-row')||tx('db-action-row'), renewal:tx('renewal-line')||tx('db-renewal-line')||tx('next-payment-line'), nextPay:(document.body.innerText.match(/Next payment[^\n]{0,60}/)||[''])[0],
    paygBtn:tx('btn-payg'), proGate:tx('pro-gate'), title:document.title, noindex:!!document.querySelector('meta[name="robots"][content*="noindex"]'), plausibleLoader:!!document.querySelector('script[src*="plausible"]'),
    testBadge:/\[TEST\]/.test(document.title)};});}catch(e){errs.push('eval '+e.message);}
  if(opts.click){try{await t.evaluate(opts.click);await new Promise(r=>setTimeout(r,1500));}catch(e){errs.push('click '+e.message);} }
  const rec={page,key,vp:vp.name,signedOut:!!opts.signedOut,errs,dialogs,nav:nav.slice(-3),fnCalls,...info};
  if(opts.shot) await t.screenshot({path:`${SHOTS}/${page.replace(/[^a-z0-9]/gi,'_')}-${key}-${vp.name}.png`}).catch(()=>{});
  out.push(rec); await t.close(); return rec;
 }
 const VPS=[{name:'desktop',size:{width:1366,height:900}},{name:'mobile',size:{width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2},mobile:true}];
 const pages=['account.html','dashboard.html','pricing.html','builder.html','my-labels.html','print.html'];
 for(const key of Object.keys(ST)) for(const pg of pages) for(const vp of VPS) await visit(pg,key,vp,{shot:vp.name==='mobile'&&['account.html','pricing.html'].includes(pg)&&['payg5','start','expired'].includes(key)});
 // signed-out redirects
 for(const pg of ['account.html','dashboard.html','my-labels.html','builder.html','print.html','pricing.html','index.html']) await visit(pg,'trial',VPS[0],{signedOut:true});
 // pricing PAYG buy routing
 for(const key of ['expired','payg0','paused','ended','start','cancelSched']) await visit('pricing.html',key,VPS[0],{click:()=>startPaygCheckout()});
 // return URL handling
 await visit('account.html?payg=success','payg5',VPS[0]); await visit('pricing.html?payg=cancelled','expired',VPS[0]);
 await visit('builder.html?topup=success','start',VPS[0]); await visit('account.html?topup=1','start',VPS[0]);
 await browser.close(); server.close();
 fs.writeFileSync(OUT,JSON.stringify(out,null,1)); console.log('visits',out.length);
});
