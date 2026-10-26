// Signal word from two-column SDS PDFs: the value is copied on the line
// before an empty "Signal word:" label. A hazard label must never lose its
// signal word because the supplier value could not be read.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');
const grab = name => html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}'))[0];
const extractSdsSignalWord = new Function(grab('normaliseSdsSignalWord') + '\n' + grab('extractSdsSignalWord') + '\nreturn extractSdsSignalWord;')();

assert.strictEqual(extractSdsSignalWord('Signal word: Warning\nHazard statements: H317'), 'Warning');
assert.strictEqual(extractSdsSignalWord('Signal Word: \nWarning \nHazard Statements'), 'Warning');
assert.strictEqual(extractSdsSignalWord('Hazard pictograms\nWarning\nSignal word:\nHazard statements:'), 'Warning');
assert.strictEqual(extractSdsSignalWord('GHS02 GHS07 GHS08\nDanger\nSignal word:\nHazard statements:'), 'Danger');
assert.strictEqual(extractSdsSignalWord('Signal word: None'), '');
// A stray "Warning" elsewhere must not be read as the signal word.
assert.strictEqual(extractSdsSignalWord('Warning\nKeep away from heat\nSignal word: Danger'), 'Danger');
assert.strictEqual(extractSdsSignalWord('Warning: do not ingest\nSignal word:\nH412'), '');

// Supplier-faithful labels fall back to the code-based resolver when no
// supplier signal word was read.
assert(/const _sig=_supplierSignal \? S\.sdsSignal : resolveGbClpSignalWord\(_autoH,S\.sdsSignal\);/.test(html)
  && /_supplierSignal=[\s\S]{0,200}Signal\\s\+words\?\\s\*:\?\\s\*\(\?:None\|No\\s\+signal\\s\+word\)/.test(html),
  'updateLabel must keep an explicit supplier None and otherwise fall back to resolveGbClpSignalWord');
console.log('PASS signal-word-two-column-sds: value-before-label layout read; empty supplier value falls back to code-based signal word');
