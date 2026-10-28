'use strict';
const assert=require('assert'),fs=require('fs'),cp=require('child_process'),{JSDOM}=require('jsdom');
const src=fs.readFileSync('release-notes.html','utf8'),doc=new JSDOM(src).window.document;
const releases=[...doc.querySelectorAll('details.release-block')];
assert.equal(releases.filter(e=>e.open).length,1);assert(releases[0].open);assert.equal(releases[0].dataset.releaseDate,'2026-10-28');
const dates=releases.map(e=>e.querySelector('.release-date').textContent.match(/\d+ \w+ 2026/)[0]);assert.equal(new Set(dates).size,dates.length);
for(const [i,e] of releases.entries()){
 assert.equal(e.querySelector('.new-badge').textContent,i?'Historical':'Current');
 assert.equal(e.firstElementChild.tagName,'SUMMARY');
 if(i){assert(!e.open);e.querySelector('summary').click();assert(e.open);assert(releases[0].open);e.querySelector('summary').click();assert(!e.open);}
}
const base=new JSDOM(cp.execFileSync('git',['show','5871ed2794f8cb0f7f5001e32cd7deb8e193c807:release-notes.html'],{encoding:'utf8'})).window.document;
for(const item of base.querySelectorAll('.release-list li'))assert([...doc.querySelectorAll('.release-list li')].some(e=>e.innerHTML===item.innerHTML),'preserve '+item.textContent);
assert(!src.includes('current-release-version'));
assert(!src.includes('latest-numbered-version'));
assert(!src.includes('The latest numbered version'));
assert(!doc.querySelector('script[src="version.js"]'),'version metadata must not overwrite dated release history');
console.log('PASS unique release dates, only latest expanded, current/historical badges, independent native toggles, every historical list item preserved');
