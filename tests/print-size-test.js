const fs=require('fs'),assert=require('assert'),vm=require('vm');
const {JSDOM}=require('jsdom');
const api=require('../print-size-test.js');
const builder=fs.readFileSync('builder.html','utf8');
const composer=fs.readFileSync('print.html','utf8');
// Read dimensions through the real Builder function, including custom rectangles.
const getDims=builder.slice(builder.indexOf('function getDims(){'),builder.indexOf('\nfunction buildSVG(',builder.indexOf('function getDims(){')));
for(const shape of ['circle','square','rectangle'])for(const size of [52,63,75,90,'custom']){
 const context={S:{shape,size,customW:80,customH:100}};vm.createContext(context);vm.runInContext(getDims+';result=getDims();',context);
 const {mmW,mmH}=context.result;const test=api.single(shape,mmW,mmH);const svg=new JSDOM(api.svg(test),{contentType:'image/svg+xml'}).window.document;
 assert.equal(svg.documentElement.getAttribute('width'),'210mm');
 if(shape==='circle')assert.equal(Number(svg.querySelector('circle').getAttribute('r'))*2,mmW);
 else{assert.equal(Number(svg.querySelector('rect').getAttribute('width')),mmW);assert.equal(Number(svg.querySelector('rect').getAttribute('height')),mmH);}
}
// Composer adapter uses its real export placements without resizing or artwork.
const adapter=composer.match(/function openComposerSizeTest\(\)\{[\s\S]*?\n\}/)[0];
let result;const context={getTplConfig:()=>({shape:'rectangle'}),getSheetPlacementsMM:()=>[{labelData:{shape:'rectangle',scentName:'PRIVATE'},x:7,y:13,w:99.1,h:57.3}],CLPSizeTest:{open:d=>result=d}};
vm.createContext(context);vm.runInContext(adapter+';openComposerSizeTest();',context);
assert.deepEqual(JSON.parse(JSON.stringify(result.boxes)),[{shape:'rectangle',x:7,y:13,w:99.1,h:57.3}]);assert(!JSON.stringify(result).includes('PRIVATE'));
// Empty sheets omit positions already used, with the same margins and gaps.
Object.assign(context,{getTplConfig:()=>({shape:'circle',rows:2,cols:2,marginL:10,marginT:12,gapH:5,gapV:6}),getSheetPlacementsMM:()=>[],getCellSizeMM:()=>({w:52,h:52}),reservedUsed:1});
vm.runInContext('openComposerSizeTest();',context);assert.equal(result.boxes.length,3);assert.deepEqual(JSON.parse(JSON.stringify(result.boxes[0])),{shape:'circle',x:67,y:12,w:52,h:52});
for(const bad of [{boxes:[]},{boxes:[{shape:'circle',x:0,y:0,w:52,h:40}]},{boxes:[{shape:'rectangle',x:200,y:0,w:52,h:40}]},{boxes:[{shape:'circle',x:0,y:0,w:NaN,h:52}]}])assert.throws(()=>api.validate(bad));
const dom=new JSDOM(fs.readFileSync('print-size-test.html','utf8'),{url:'https://clpeasy.com/print-size-test.html#'+encodeURIComponent(JSON.stringify(api.single('circle',63,63))),runScripts:'outside-only'});
let prints=0;dom.window.print=()=>prints++;dom.window.eval(fs.readFileSync('print-size-test.js','utf8'));dom.window.document.getElementById('print-test').click();assert.equal(prints,1);assert(dom.window.document.getElementById('test-status').textContent.includes('63 × 63'));
assert(!/consumeComposerDownload|refreshProEntitlement|_downloadAllowed|fetch\(/.test(fs.readFileSync('print-size-test.js','utf8')));
dom.window.close();console.log('Size test geometry, Builder sizes, Composer placements, input rejection and free print journey: PASS');
