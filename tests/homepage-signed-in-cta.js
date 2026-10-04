const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const authScript=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function updateHomepageAccountCtas'));
const nav=fs.readFileSync('public-nav.js','utf8'),seasons=fs.readFileSync('seasons.js','utf8');
const bannerFn=seasons.slice(seasons.indexOf('  function injectFooterBanner('),seasons.indexOf('  // ── INIT',seasons.indexOf('  function injectFooterBanner(')));
async function run(signedIn,authFirst){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://clpeasy.test/',runScripts:'outside-only'}),w=dom.window;
 let resolveSession;
 const session=new Promise(r=>resolveSession=r);
 w.supabase={createClient:()=>({auth:{getSession:()=>session},from:()=>({select(){return this},eq(){return this},single:async()=>({data:null})})})};
 w.matchMedia=()=>({matches:false});w.eval(authScript);
 if(authFirst){resolveSession({data:{session:signedIn?{user:{email:'qa@example.test'}}:null}});await new Promise(r=>setTimeout(r,10));}
 w.eval(nav);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 w.eval(bannerFn);w.injectFooterBanner({name:'October',bannerBg:'#fff',bannerBorder:'#ddd',bannerEmoji:'',accentDark:'#333',iconLabel:'Halloween scents',bannerText:'Seasonal reminder'},()=>{});
 if(!authFirst){resolveSession({data:{session:signedIn?{user:{email:'qa@example.test'}}:null}});await new Promise(r=>setTimeout(r,10));}
 const hero=w.document.querySelector('.homepage-image-hero a'),banner=w.document.getElementById('clpeasy-banner-cta'),account=w.document.querySelector('.public-nav-links a[href*="'+(signedIn?'account':'mode=signin')+'"]');
 for(const a of [hero,banner,w.document.querySelector('.public-nav-cta')])assert(a.getAttribute('href').includes(signedIn?'builder.html':'mode=signup'));
 assert(account);assert.strictEqual(hero.textContent,'','approved image overlay must remain text-free');
 if(signedIn){assert.strictEqual(hero.getAttribute('aria-label'),'Go to label builder');assert.strictEqual(banner.getAttribute('aria-label'),'Go to label builder');assert.strictEqual(w.document.querySelector('button.btn-cta').textContent,'Go to builder →');}
 else assert(w.document.querySelector('button.btn-cta').textContent.includes('free trial'));
 dom.window.close();
}
(async()=>{for(const signed of [false,true])for(const first of [false,true])await run(signed,first);console.log('PASS homepage signed-in CTAs: both auth/render orderings, signed-out signup, hero artwork retained, account/builder routes');})().catch(e=>{console.error(e);process.exit(1)});
