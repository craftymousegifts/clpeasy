const fs=require('fs');
const pages=['index.html','pricing.html','faq.html','compliance.html','privacy.html','terms.html','refund.html','cookie-policy.html','support.html','showcase.html','knowledge.html','auth.html'];
const expected=['Home','Pricing','How it works','Knowledge Base','FAQ','Support','Sign in','Start free trial'];
for(const page of pages){
 const html=fs.readFileSync(page,'utf8');
 if(!html.includes('public-nav.css')||!html.includes('public-nav.js')) throw new Error(page+': shared nav assets missing');
 const m=html.match(/<nav class="public-site-nav"[\s\S]*?<\/nav>/);
 if(!m) throw new Error(page+': canonical nav missing');
 const nav=m[0];
 for(const label of expected) if(!nav.includes('>'+label+'</a>')) throw new Error(page+': missing '+label);
 if(nav.includes('target="_blank"')) throw new Error(page+': public nav must stay in same tab');
 if(!nav.includes('<sup class="nav-mark">®</sup>')) throw new Error(page+': registered mark missing');
}
const js=fs.readFileSync('public-nav.js','utf8');
if(!js.includes("file==='index.html'")||!js.includes('home.hidden=true')) throw new Error('Homepage must suppress redundant Home menu item');
if(!js.includes("setAttribute('aria-current','page')")) throw new Error('Current public section must remain visibly identified');
if(!js.includes("mode==='signup'")) throw new Error('Auth menu must be mode-aware');
const css=fs.readFileSync('public-nav.css','utf8');
if(css.includes('border-radius:15px!important')||css.includes('background:linear-gradient(180deg,#FBFDFD')) throw new Error('Desktop nav links must not be enclosed in a decorative pill/container');
if(!css.includes('a:not(.public-nav-cta)::after')) throw new Error('Subtle active/hover navigation indicator missing');
if(!css.includes('--nav-coral:#EF4444')||!css.includes('--nav-teal:#4C9BB0')) throw new Error('CLPeasy brand accents missing from shared nav');
for(const page of ['checkout.html','plan-picker.html','builder.html','print.html','dashboard.html','account.html','my-labels.html']){
 const html=fs.readFileSync(page,'utf8');
 if(html.includes('public-site-nav')) throw new Error(page+': protected/transactional navigation changed');
}
console.log('Public navigation consistency: PASS ('+pages.length+' pages, clean contextual display rules verified)');
