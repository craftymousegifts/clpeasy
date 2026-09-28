#!/usr/bin/env node
'use strict';

/**
 * M55 — saved bgColour validation.
 *
 * Security contract:
 * label-render.js must accept only six-digit #rrggbb/#RRGGBB values at the
 * shared renderer boundary. Any other stored value must become #ffffff before
 * interpolation into SVG markup.
 *
 * This test deliberately includes attribute/element injection payloads that
 * reproduced M55 before the fix.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rendererPath = path.join(__dirname, '..', 'label-render.js');
const src = fs.readFileSync(rendererPath, 'utf8');

const contract =
  "const bgCol=(typeof opts.bgColour==='string' && /^#[0-9a-fA-F]{6}$/.test(opts.bgColour))";
assert(
  src.includes(contract),
  'shared renderer must validate bgColour as a six-digit hex string'
);
assert(
  src.includes("? opts.bgColour : '#ffffff';"),
  'invalid bgColour must fall back to #ffffff'
);
assert(
  !src.includes("const bgCol=opts.bgColour||'#ffffff';"),
  'old unvalidated bgColour interpolation must not remain'
);

function validatedBgColour(value) {
  return (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value))
    ? value
    : '#ffffff';
}

const valid = [
  '#ffffff',
  '#ffe4e1',
  '#FFE4E1',
  '#000000',
  '#123456',
  '#a1b2c3'
];

for (const value of valid) {
  assert.strictEqual(
    validatedBgColour(value),
    value,
    'valid colour must remain byte-for-byte unchanged: ' + value
  );
}

const invalid = [
  undefined,
  null,
  '',
  '#fff',
  'red',
  'rgb(10,20,30)',
  123,
  '#fff" data-m55="attr',
  '#fff"/><image href="data:," onerror="globalThis.__m55=1"/><circle fill="#fff',
  '#fff&x<',
  ' #ffffff',
  '#ffffff ',
  '#gggggg',
  {},
  true,
  NaN,
  Infinity,
  -Infinity
];

for (const value of invalid) {
  assert.strictEqual(
    validatedBgColour(value),
    '#ffffff',
    'invalid/tampered colour must fall back to white: ' + String(value)
  );
}

const attackValues = invalid.filter(v =>
  typeof v === 'string' && /["<>&]|onerror|data-m55/.test(v)
);
for (const value of attackValues) {
  const bg = validatedBgColour(value);
  const svg = '<rect fill="' + bg + '"/>';
  assert.strictEqual(svg, '<rect fill="#ffffff"/>');
  assert(!svg.includes('onerror'));
  assert(!svg.includes('data-m55'));
  assert(!svg.includes('<image'));
}

console.log('M55 bgColour validation: PASS');
console.log('  valid six-digit colours preserved:', valid.length);
console.log('  invalid/tampered values rejected:', invalid.length);
console.log('  injection payloads neutralised:', attackValues.length);
