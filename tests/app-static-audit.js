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

const customerPages=['index.html','pricing.html','builder.html','dashboard.html','my-labels.html','account.html','knowledge.html','support.html','faq.html','compliance.html','terms.html','privacy.html','refund.html','auth.html','checkout.html','print.html'];
const rejectedVisibleCopy=[/\bUFI\b/i,/QR (?:code|safety)/i,/safety sheet/i,/fully compliant/i,/CLP-compliant/i,/Intended Use/i,/AI Review & Classification/i,/Review & Finalise/i];
for(const file of customerPages){
  const document=new JSDOM(fs.readFileSync(file,'utf8')).window.document;
  document.querySelectorAll('script,style').forEach(node=>node.remove());
  const visibleText=(document.body?.textContent||'').replace(/\s+/g,' ');
  for(const pattern of rejectedVisibleCopy){
    if(pattern.test(visibleText))failures.push(`${file}: obsolete or unapproved customer-facing wording remains (${pattern})`);
  }
}

for (const file of ['builder.html','dashboard.html','my-labels.html','account.html']) {
  const document = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    const destination = href.split(/[?#]/)[0];
    const builderOnlyDestinations = file === 'builder.html' && (destination === 'print.html' || href === 'index.html#pricing');
    if (!['knowledge.html','account.html','support.html','pricing.html'].includes(destination) && !builderOnlyDestinations) continue;
    if (link.getAttribute('target') !== '_blank' || !link.relList.contains('noopener')) {
      failures.push(`${file}: ${link.textContent.trim() || destination} does not preserve the current page`);
    }
  }
}

const authSource = fs.readFileSync('auth.html', 'utf8');
const checkoutSource = fs.readFileSync('checkout.html', 'utf8');
const builderSource = fs.readFileSync('builder.html', 'utf8');
const redirectsSource = fs.readFileSync('_redirects', 'utf8');
const accountSource = fs.readFileSync('account.html', 'utf8');
if (!authSource.includes("'checkout.html'")) failures.push('auth.html: checkout is missing from the safe return allow-list');
if (/redirect=checkout\.html/.test(checkoutSource)) failures.push('checkout.html: obsolete auth redirect parameter remains');
if (!/next=checkout\.html/.test(checkoutSource)) failures.push('checkout.html: safe authenticated checkout return is missing');
if (/intended-use|intendedUse|Intended Use/.test(builderSource)) failures.push('builder.html: removed Intended Use feature remains');
if (/legacyToApproved|step5-preview-slot/.test(builderSource)) failures.push('builder.html: conflicting legacy step/preview mapping remains');
if (/downloadJPEG|btn-jpeg|format:'JPEG'/.test(builderSource)) failures.push('builder.html: unapproved JPEG export path remains');
for (const rejectedName of ['Ingredients','AI Review & Classification','Label Content','Review & Finalise']) {
  if (builderSource.includes(rejectedName)) failures.push(`builder.html: unapproved step name remains: ${rejectedName}`);
}
if (!/Choose a plan<\/a>/.test(accountSource) || !/href="pricing\.html" target="_blank" rel="noopener" class="btn btn-teal">Choose a plan/.test(accountSource)) {
  failures.push('account.html: Choose a plan does not preserve the Account page in a new tab');
}
for (const privatePath of ['/monitor.html','/scrum.html','/link-checker.html','/packagemonitor.html','/clpeasy-flow.html','/tests/*','/supabase/*','/*.sql','/*.ts']) {
  const escaped=privatePath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if (!new RegExp(`^${escaped}\\s+/\\s+404!$`,'m').test(redirectsSource)) failures.push(`_redirects: public access is not blocked for ${privatePath}`);
}

assert.deepStrictEqual(failures, [], failures.join('\n'));
console.log(`static application audit passed across ${htmlFiles.length} HTML files`);
