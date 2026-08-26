const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const htmlFiles = fs.readdirSync('.').filter(file => file.endsWith('.html'));
const failures = [];

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(source);
  const document = dom.window.document;
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) failures.push(`${file}: duplicate markup IDs: ${duplicates.join(', ')}`);

  for (const element of document.querySelectorAll('[href],[src]')) {
    const ref = element.getAttribute('href') || element.getAttribute('src');
    if (!ref || ref.includes('{{') || /^(?:https?:|mailto:|tel:|data:|javascript:|#|\/)/.test(ref)) continue;
    const local = ref.split(/[?#]/)[0];
    if (local && !fs.existsSync(path.resolve(path.dirname(file), local))) {
      failures.push(`${file}: missing local target ${local}`);
    }
  }

  let scriptNumber = 0;
  for (const script of document.querySelectorAll('script:not([src])')) {
    scriptNumber += 1;
    if (!script.textContent.trim()) continue;
    try { new vm.Script(script.textContent, { filename:`${file}#script-${scriptNumber}` }); }
    catch (error) { failures.push(`${file}: ${error.message}`); }
  }
  dom.window.close();
}

for (const file of ['builder.html','dashboard.html','my-labels.html','account.html']) {
  const document = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  for (const link of document.querySelectorAll('a[href]')) {
    const destination = link.getAttribute('href').split(/[?#]/)[0];
    if (!['knowledge.html','account.html','support.html','pricing.html'].includes(destination)) continue;
    if (link.getAttribute('target') !== '_blank' || !link.relList.contains('noopener')) {
      failures.push(`${file}: ${link.textContent.trim() || destination} does not preserve the current page`);
    }
  }
}

assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log(`static application audit passed across ${htmlFiles.length} HTML files`);
