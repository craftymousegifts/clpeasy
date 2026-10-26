// Guide Me content (guide-me-content.js) stays in step with CLPeasy's own
// pages, and every link in it goes somewhere real.
//   - re-running scripts/build-guide-content.js gives the committed file
//     (so a changed FAQ/Help/Knowledge Base answer can't be left stale);
//   - every local link points to an existing page (and anchor, if given);
//   - the Builder and Knowledge Base load the local guide and no longer call
//     the paid clp-wizard / clp-search endpoints.
//   node tests/guide-me-content-sync.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-guide-content.js'), '--check'], { encoding: 'utf8' });
assert.strictEqual(r.status, 0, (r.stderr || r.stdout).trim());
ok('guide-me-content.js matches the current Help Guide, FAQ, Knowledge Base and guide pages');

const { cards } = require(path.join(ROOT, 'guide-me-content.js'));
assert(cards.length >= 60, 'expected at least 60 answer cards, got ' + cards.length);
const bad = [];
for (const c of cards) {
  assert(c.id && c.title && c.html, 'card fields: ' + c.id);
  assert(!/<script|on\w+\s*=|javascript:/i.test(c.html), 'unsafe HTML in card ' + c.id);
  const hrefs = (c.links || []).map(l => l.href).concat([...c.html.matchAll(/href="([^"]+)"/g)].map(m => m[1]));
  for (const h of hrefs) {
    if (/^(https?:|mailto:)/.test(h)) continue;
    const [file, anchor] = h.split('#');
    const p = path.join(ROOT, file || 'index.html');
    if (!fs.existsSync(p)) { bad.push(`${c.id}: ${h} (missing page)`); continue; }
    if (anchor && !new RegExp(`id="${anchor}"`).test(fs.readFileSync(p, 'utf8'))) bad.push(`${c.id}: ${h} (missing anchor)`);
  }
}
assert(!bad.length, 'broken links:\n  ' + bad.join('\n  '));
ok(`${cards.length} answer cards: required fields, no unsafe HTML, every local link and anchor exists`);

const builder = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
const kb = fs.readFileSync(path.join(ROOT, 'knowledge.html'), 'utf8');
for (const [name, src] of [['builder.html', builder], ['knowledge.html', kb]]) {
  assert(src.includes('<script src="guide-me-content.js"></script>\n<script src="guide-me.js"></script>'), name + ' loads the local guide');
  assert(!/functions\/v1\/clp-(wizard|search)/.test(src), name + ' must not call the paid AI endpoints');
  assert(!/claude-|anthropic/i.test(src.replace(/<!--[\s\S]*?-->/g, '')), name + ' must not reference an AI model');
}
assert(!/selectSignal\(data/.test(builder), 'Guide Me auto-fill must never set the signal word');
ok('Builder and Knowledge Base load the local guide; no clp-wizard / clp-search calls; auto-fill cannot set the signal word');

const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
assert(!/Anthropic/.test(privacy) && /not sent to CLPeasy or to any other company/.test(privacy), 'privacy policy matches the local guide');
ok('Privacy Policy no longer lists Anthropic and says typed questions are not sent anywhere');

console.log(`\nguide-me-content-sync: ${passed} checks passed`);
