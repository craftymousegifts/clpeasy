'use strict';
const assert=require('assert'),fs=require('fs'),cp=require('child_process'),{JSDOM}=require('jsdom');
const src=fs.readFileSync('release-notes.html','utf8'),doc=new JSDOM(src).window.document;
const releases=[...doc.querySelectorAll('details.release-block')];
assert.equal(releases.filter(e=>e.open).length,1);assert(releases[0].open);assert.equal(releases[0].dataset.releaseDate,'2026-10-27');
const dates=releases.map(e=>e.querySelector('.release-date').textContent.match(/\d+ \w+ 2026/)[0]);assert.equal(new Set(dates).size,dates.length);
for(const [i,e] of releases.entries()){
 assert.equal(e.querySelector('.new-badge').textContent,i?'Historical':'Current');
 assert.equal(e.firstElementChild.tagName,'SUMMARY');
 if(i){assert(!e.open);e.querySelector('summary').click();assert(e.open);assert(releases[0].open);e.querySelector('summary').click();assert(!e.open);}
}
const base=new JSDOM(cp.execFileSync('git',['show','5871ed2794f8cb0f7f5001e32cd7deb8e193c807:release-notes.html'],{encoding:'utf8'})).window.document;
for(const item of base.querySelectorAll('.release-list li'))assert([...doc.querySelectorAll('.release-list li')].some(e=>e.innerHTML===item.innerHTML),'preserve '+item.textContent);
assert(!src.includes('current-release-version'));assert(src.includes('latest-numbered-version'));
// Future metadata must update only the intro, preserving every historical heading.
const runtime=new JSDOM(src,{runScripts:'outside-only'});
const headings=[...runtime.window.document.querySelectorAll('.release-version')].map(e=>e.textContent);
runtime.window.CLPEASY_VERSION={number:'9.9.9',released:'2030-01-02'};
for(const script of runtime.window.document.querySelectorAll('script:not([src])'))runtime.window.eval(script.textContent);
assert.equal(runtime.window.document.querySelector('#latest-numbered-version').textContent,'v9.9.9');
assert.equal(runtime.window.document.querySelector('#latest-numbered-date').textContent,'2 January 2030');
assert.deepEqual([...runtime.window.document.querySelectorAll('.release-version')].map(e=>e.textContent),headings);
console.log('PASS unique release dates, only latest expanded, current/historical badges, independent native toggles, every historical list item preserved');
