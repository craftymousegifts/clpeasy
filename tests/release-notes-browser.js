'use strict';
// Real Chromium layout/touch/keyboard checks against an isolated local page.
// All external requests are blocked; no account or production calls.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const puppeteer=require('puppeteer');
const ROOT=path.resolve(__dirname,'..'),ARTIFACTS=path.join(ROOT,'qa-artifacts','customer-experience');
fs.mkdirSync(ARTIFACTS,{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url.split('?')[0]!=='/release-notes.html'){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(ROOT,'release-notes.html')));
});
(async()=>{
 let browser;
 try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await puppeteer.launch({args:['--no-sandbox']});
 for(const vp of [{width:320,height:420,isMobile:true,hasTouch:true},{width:375,height:548,isMobile:true,hasTouch:true},{width:390,height:664,isMobile:true,hasTouch:true},{width:1280,height:900}]){
  const p=await browser.newPage();await p.setViewport(vp);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.setRequestInterception(true);p.on('request',r=>r.url().startsWith(base+'/')?r.continue():r.respond({status:204,body:''}));
  await p.goto(base+'/release-notes.html',{waitUntil:'load'});
  const read=()=>p.evaluate(()=>({open:[...document.querySelectorAll('details.release-block')].map(e=>e.open),overflow:document.documentElement.scrollWidth>innerWidth,dates:[...document.querySelectorAll('.release-date')].map(e=>e.textContent)}));
  const before=await read();assert.equal(before.open.filter(Boolean).length,1);assert(before.open[0]);assert.equal(new Set(before.dates).size,before.dates.length);assert(!before.overflow);
  await p.screenshot({path:path.join(ARTIFACTS,`release-notes-${vp.width}x${vp.height}.png`),fullPage:true});
  const summary=await p.$('details.release-block:nth-of-type(2) > summary');assert(summary);
  // A normal tap/click opens this historical entry while retaining current.
  if(vp.hasTouch){await summary.scrollIntoView();const box=await summary.boundingBox();await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}else await summary.click();
  const opened=await read();assert(opened.open[0]&&opened.open[1]);assert.equal(opened.open.filter(Boolean).length,2);assert(!opened.overflow);
  // Native summary is also keyboard-operable, and independent of other dates.
  await summary.focus();await p.keyboard.press('Enter');assert.deepEqual((await read()).open,before.open);
  const current=await p.$('details.release-block > summary');await current.focus();await p.keyboard.press('Enter');assert.equal((await read()).open.filter(Boolean).length,0);
  await p.keyboard.press('Enter');assert.deepEqual((await read()).open,before.open);assert.deepEqual(errors,[]);
  console.log(`PASS release notes ${vp.width}x${vp.height}: one current/open, historical native tap/keyboard toggle, no horizontal overflow or page errors`);
  await p.close();
 }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
