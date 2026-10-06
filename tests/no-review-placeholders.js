// Release guard: temporary "[OWNER/LEGAL REVIEW: ...]" markers used while
// policy wording is reviewed in a PR must never reach a deployable page.
// This test fails while any served HTML/JS file still contains one.
//   node tests/no-review-placeholders.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const found = [];
for (const f of fs.readdirSync(ROOT)) {
  if (!/\.(html|js|css)$/.test(f)) continue;
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const n = (s.match(/\[OWNER\/LEGAL REVIEW/g) || []).length;
  if (n) found.push(`${f}: ${n}`);
}
if (found.length) {
  console.log('FAIL: review placeholders still present (resolve before merge):\n  ' + found.join('\n  '));
  process.exit(1);
}
console.log('PASS: no review placeholders in deployable files');
