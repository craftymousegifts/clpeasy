#!/usr/bin/env node
'use strict';
const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync(require.resolve('../label-render.js'),'utf8');

assert(src.includes("const raw=[...new Set(String(pStatements||'').split(',').map(p=>p.trim()).filter(Boolean))]"),
  'P-code normaliser must de-duplicate before combination');
assert(src.includes("const _allCodes=[...new Set((data.hStatements||'').split(',').map(h=>h.trim()).filter(Boolean))]"),
  'H/EUH codes must be de-duplicated preserving first order');

// Structural guard: duplicate removal must happen before EUH208 split.
const dedupe=src.indexOf("const _allCodes=[...new Set(");
const euh=src.indexOf("const hasEUH208=",dedupe);
assert(dedupe>=0 && euh>dedupe,'H dedupe must precede EUH208 handling');

console.log('M24 duplicate-code regression checks: passed');
