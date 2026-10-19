const fs=require('fs'),assert=require('assert'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('builder.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,d=w.document;
let updates=0,saves=0;w.updateLabel=()=>updates++;w.saveProdDetails=()=>saves++;
const code=html.slice(html.indexOf('function restoreNetWeight('),html.indexOf('// ── PRODUCT TYPE GUIDANCE'));
w.eval(code);
const select=d.getElementById('net-weight-choice'),input=d.getElementById('net-weight'),custom=d.getElementById('net-weight-custom');
assert.equal(select.options.length,202);
for(const value of ['', '5g','180g','1000g','212.5g','100ml','1 kg']){
 w.restoreNetWeight(value);assert.equal(input.value,value,'restore preserves exact value');
 assert.equal(select.value,['','5g','180g','1000g'].includes(value)?value:'custom');
 assert.equal(custom.hidden,select.value!=='custom');
}
w.chooseNetWeight('200g');assert.equal(input.value,'200g');assert(custom.hidden);
w.chooseNetWeight('custom');assert.equal(input.value,'200g');assert(!custom.hidden,'custom does not clear data');
input.value='212.5g';w.restoreNetWeight(input.value);assert.equal(select.value,'custom');
w.chooseNetWeight('');assert.equal(input.value,'');assert(custom.hidden);
assert.equal(updates,3);assert.equal(saves,3);
assert(html.includes("restoreNetWeight(e.netWeight||'')"),'saved-label restore uses compatible setter');
assert(html.includes('restoreNetWeight(data.netWeight)'),'Guide Me uses compatible setter');
console.log('PASS net-weight dropdown: preset selection, optional blank, custom units/decimals and legacy restore');
