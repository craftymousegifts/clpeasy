// Stage 1: SDS scope integrity. Run: node tests/sds-faithful-section22-stage1.js
'use strict';
const assert = require('node:assert/strict');
const { scope } = require('../sds-section-scope.js');

const section = 'SDS SECTION 2.2 LABEL ELEMENTS\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP333+P313 If skin irritation or rash occurs: Get medical advice/attention.\nP501 Dispose of contents/container according to local regulations.';
const full = 'SECTION 1 Identification\nOther text\nSECTION 2 Hazards identification\n2.1 Classification\nH314 ingredient context\n' + section + '\n2.3 Other hazards\nH410 outside label elements\nSECTION 3 Composition\nP310 outside label elements';
const a = scope(full);
assert.equal(a.status, 'scoped');
assert.equal(a.text, section, 'Section 2.2 text must be retained verbatim');
assert(!a.text.includes('H314'));
assert(!a.text.includes('H410'));
assert(!a.text.includes('P310'));
assert(a.text.includes('Get medical advice/attention.'), 'Supplier wording must remain unchanged');

const b = scope(section);
assert.equal(b.status, 'scoped');
assert.equal(b.text, section);

const bare = 'Signal word: Warning\nP333+P313 Get medical advice/attention.';
const c = scope(bare);
assert.equal(c.status, 'whole');
assert.equal(c.text, bare);

const missing = scope('SECTION 1 Identification\nH314\nSECTION 3 Composition\nP310');
assert.equal(missing.status, 'unsafe', 'Never silently read a structured SDS without Section 2.2');

const combined = scope(section + '\n' + section);
assert.equal(combined.status, 'unsafe', 'Do not combine two separate Section 2.2 blocks');
console.log('Stage 1 SDS Section 2.2 boundary and verbatim-preservation checks PASS');
