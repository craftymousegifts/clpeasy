'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),cp=require('child_process');
const {JSDOM}=require('jsdom');
(async()=>{
for(const file of ['builder.html','dashboard.html','my-labels.html','print.html','account.html']){
 const src=fs.readFileSync(file,'utf8'),base=cp.execFileSync('git',['show','origin/main:'+file],{encoding:'utf8',maxBuffer:8*1024*1024});
 const doc=new JSDOM(src).window.document,card=doc.querySelector('#sidebar-user'),out=doc.querySelector('.sidebar-signout');
 assert.equal(card.tagName,'DIV');assert(!card.hasAttribute('aria-haspopup'));assert(!doc.querySelector('.sidebar-user-menu'));
 for(const id of ['su-avatar','su-name','su-plan'])assert.equal(doc.querySelector('#'+id).outerHTML,new JSDOM(base).window.document.querySelector('#'+id).outerHTML);
 assert(out.closest('.sidebar-profile')===card.parentElement);assert(card.nextElementSibling.contains(out));
 assert.equal(out.getAttribute('onclick'),'signOut()');assert(!out.hasAttribute('role'));assert(src.includes('min-height:44px'));
 const extract=s=>{const a=s.indexOf('async function signOut(');let i=s.indexOf('{',a),depth=1;for(i++;depth;i++){if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return s.slice(a,i);};
 assert.equal(extract(src),extract(base),'existing auth and redirect must be identical');
 let calls=0;const context={_sb:{auth:{signOut:async()=>{calls++}}},window:{location:{href:''}},location:{href:''},localStorage:{removeItem(){}},sessionStorage:{removeItem(){}}};
 context.sb=context.sbClient=context._sb;vm.createContext(context);vm.runInContext(extract(src),context);await context.signOut();assert.equal(calls,1);
 assert(/(auth|index)\.html/.test(context.window.location.href||context.location.href));
 console.log('PASS',file,'permanent account action, preserved details and single sign-out call');
}
})().catch(e=>{console.error(e);process.exitCode=1});
