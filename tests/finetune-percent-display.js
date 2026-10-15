// Fine-tune display (Oct 2026, Michaela's approved correction): each
// "Fine-tune your label" size is shown as a percentage of its AUTOMATIC size.
//
// Before: the figure was the size's position between the allowed minimum and
// maximum, so a 60 mm candle's hazard text showed 99% when automatic and 3%
// after twelve decreases (1.23 mm, really 59% of its 2.08 mm automatic size).
//
// Real Chromium, builder.html signed out. For each of the five controls
// (hazard, product name, business name, product type, signal word):
//   - automatic and after Reset show exactly "100%" and no "minimum";
//   - after decreases / increases the figure equals the size actually drawn
//     in the label SVG divided by the automatic size drawn before adjusting;
//   - the automatic reference stays the same while adjusting;
//   - at the lower limit the control shows "minimum", the drawn size equals
//     the renderer's own minimum, and a further decrease changes nothing;
//   - at the upper limit "minimum" is not shown.
// Also: the reference is re-measured when the label size changes while a
// control is adjusted, and the fine-tune display never changes label output
// (the SVG is identical whether or not the panel has been refreshed).
// Cross-control (#242 review): after adjusting one control, moving any other
// control to its minimum, maximum or Reset leaves the first control showing
// its drawn size against its automatic size for the CURRENT layout; the
// confirmed case is a 90x63 mm rectangle whose hazard showed 95% when it was
// 83% after the business name went to its minimum.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = process.env.CLPEASY_ROOT || path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP finetune-percent-display: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP finetune-percent-display: no Chromium'); process.exit(0); }

const SIGNED_OUT = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}}},from:function(){return {select:function(){return this},eq:function(){return this},maybeSingle:async function(){return {data:null}},single:async function(){return {data:null}}}},rpc:async function(){return {data:null,error:null}}}}};';
const SDS = '2.2 Label elements\nSignal word: Warning\nH317 May cause an allergic skin reaction.\nP102 Keep out of reach of children.\nP501 Dispose of contents/container in accordance with local regulations.';

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  let failed = false;
  try {
    const t = await browser.newPage();
    await t.setViewport({ width: 1366, height: 900 });
    const errs = []; t.on('pageerror', e => errs.push(e.message)); t.on('dialog', d => d.dismiss());
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: SIGNED_OUT });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      return r.respond({ status: 204, body: '' });
    });
    await t.goto(`${base}/builder.html`, { waitUntil: 'load' });
    await t.evaluate(require('./helpers/sds-doc-answer').SCRIPT).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    const out = await t.evaluate(async (SDS) => {
      currentUser = null;
      document.getElementById('scent-name').value = 'Mint';
      document.getElementById('product-type').value = 'Scented Candle';
      if (typeof onProductTypeChange === 'function') onProductTypeChange();
      document.getElementById('net-weight').value = '180g';
      document.getElementById('burn-time').value = '40 hrs';
      document.getElementById('smart-paste-input').value = SDS; extractSDS();
      document.getElementById('biz-name').value = 'Crafty Mouse Gifts';
      document.getElementById('biz-address').value = '1 Test Lane, EX1 2AB';
      document.getElementById('biz-phone').value = '01632 960000';
      selectShape('circle'); selectSize('custom');
      document.getElementById('custom-w').value = 60; document.getElementById('custom-h').value = 60; onDimInput(); readForm(); updateLabel();
      for (let n = 2; n <= 5; n++) {
        if (n === 4) { const hc = document.getElementById('hazard-confirm'); if (hc) { hc.checked = true; if (typeof toggleHazardNext === 'function') toggleHazardNext(); } }
        setApprovedBuilderStep(n); await new Promise(r => setTimeout(r, 120));
      }
      const v = document.getElementById('verify-checkbox'); if (!v.checked) { v.checked = true; toggleDownload(); }

      const C = [
        { name: 'hazard', fn: nudgeHazardFS, reset: resetHazardFS, el: 'hazard-fs-pct', ov: 'hazardFSOverride', b: '_hazardFSBounds', fs: 'hazard', find: t => /allergic skin/.test(t.textContent) },
        { name: 'product name', fn: nudgeScentFS, reset: resetScentFS, el: 'scent-fs-pct', ov: 'scentFSOverride', b: '_scentFSBounds', fs: 'scent', find: t => t.textContent.trim() === 'Mint' },
        { name: 'business name', fn: nudgeBizNameFS, reset: resetBizNameFS, el: 'bizname-fs-pct', ov: 'bizNameFSOverride', b: '_bizNameFSBounds', fs: 'biz', find: t => t.textContent.trim() === 'Crafty Mouse Gifts' },
        { name: 'product type', fn: nudgeTypeFS, reset: resetTypeFS, el: 'type-fs-pct', ov: 'typeFSOverride', b: '_typeFSBounds', fs: 'type', find: t => t.textContent.trim() === 'SCENTED CANDLE' },
        { name: 'signal word', fn: nudgeSigFS, reset: resetSigFS, el: 'sig-fs-pct', ov: 'sigFSOverride', b: '_sigFSBounds', fs: 'signal', find: t => t.textContent.trim() === 'WARNING' },
      ];
      // Size actually drawn in the label SVG for one control's text.
      const drawn = c => {
        const doc = new DOMParser().parseFromString(buildSVG(false), 'image/svg+xml');
        const el = [...doc.querySelectorAll('text')].find(c.find);
        return el ? +el.getAttribute('font-size') : null;
      };
      const show = c => { const e = document.getElementById(c.el); return { text: e.textContent, min: !!e.querySelector('.ft-min') }; };
      const pctOf = s => parseInt(s, 10);
      const rows = [];
      for (const c of C) {
        const r = { name: c.name, steps: [] };
        const auto = drawn(c);
        r.auto = { size: auto, ...show(c) };
        // Decrease three times, one at a time.
        for (let i = 1; i <= 3; i++) { c.fn(-1); const d = drawn(c); r.steps.push({ step: '-' + i, size: d, expected: Math.round(d / auto * 100), ...show(c) }); }
        // Decrease to the limit.
        for (let i = 0; i < 40; i++) c.fn(-1);
        const atMin = drawn(c); const b = window[c.b];
        r.minimum = { size: atMin, boundMin: b.min, expected: Math.round(atMin / auto * 100), ...show(c) };
        c.fn(-1); r.minimum.afterOneMore = drawn(c);
        c.reset(); r.reset1 = { size: drawn(c), ...show(c) };
        // Increase to the limit.
        for (let i = 0; i < 40; i++) c.fn(1);
        const atMax = drawn(c);
        r.maximum = { size: atMax, expected: Math.round(atMax / auto * 100), ...show(c) };
        c.reset(); r.reset2 = { size: drawn(c), ...show(c) };
        rows.push(r);
      }
      // Display never changes label output.
      nudgeHazardFS(-1); nudgeHazardFS(-1);
      const svgA = buildSVG(false), svgExpA = buildSVG(true);
      syncAdjustPanel(); syncAdjustPanel();
      const same = svgA === buildSVG(false) && svgExpA === buildSVG(true);
      // Reference refresh: change the label size while hazard is adjusted.
      const hz = C[0];
      document.getElementById('custom-w').value = 70; document.getElementById('custom-h').value = 70; onDimInput(); readForm(); updateLabel();
      const o = Object.assign({}, window._ftLastOpts, { instanceId: 'test-auto' }); o.hazardFSOverride = null;
      const auto70 = LabelRenderer.renderLabel(window._ftLastData, o).metrics.fontSizes.hazard;
      const d70 = drawn(hz);
      const refresh = { size: d70, auto70, expected: Math.round(d70 / auto70 * 100), ...show(hz) };
      hz.reset();
      const reset70 = show(hz);

      // Cross-control: an adjusted control's figure must use its automatic
      // size for the CURRENT layout after another control changes (#242
      // review: hazard on a 90x63 mm rectangle showed 95% when it was 83%).
      const truth = c => {   // drawn size / this control's automatic size with everything else as it is now
        const o = Object.assign({}, window._ftLastOpts, { instanceId: 'test-truth' }); o[c.ov] = null;
        const auto = LabelRenderer.renderLabel(window._ftLastData, o).metrics.fontSizes[c.fs];
        return Math.round(window._ftRenderedFS[c.fs] / auto * 100);
      };
      const shown = c => parseInt(document.getElementById(c.el).textContent, 10);
      const resetAll = () => C.forEach(c => c.reset());
      const setSize = (shape, w, h) => { selectShape(shape); selectSize('custom'); document.getElementById('custom-w').value = w; document.getElementById('custom-h').value = h; onDimInput(); readForm(); updateLabel(); };
      document.getElementById('burn-time').value = ''; readForm();
      const cross = [];
      // The confirmed case, step by step.
      setSize('rectangle', 90, 63); resetAll();
      const bz = C[2];
      hz.fn(-1); const r1 = { shown: shown(hz), truth: truth(hz) };
      for (let i = 0; i < 40; i++) bz.fn(-1);
      const r2 = { shown: shown(hz), truth: truth(hz), staleBefore: r1.shown };
      hz.fn(-1); const r3 = { shown: shown(hz), truth: truth(hz) };
      bz.reset(); const r4 = { shown: shown(hz), truth: truth(hz) };
      const rect = { r1, r2, r3, r4 };
      resetAll();
      // Every pair: adjust X, then move Y to its minimum, maximum and Reset.
      for (const [shape, w, h] of [['rectangle', 90, 63], ['circle', 60, 60]]) {
        setSize(shape, w, h);
        for (const x of C) for (const y of C) {
          if (x === y) continue;
          resetAll(); x.fn(-1);
          const own = shown(x);
          for (let i = 0; i < 40; i++) y.fn(-1); cross.push({ id: `${shape} ${x.name} after ${y.name} minimum`, shown: shown(x), truth: truth(x) });
          for (let i = 0; i < 60; i++) y.fn(1); cross.push({ id: `${shape} ${x.name} after ${y.name} maximum`, shown: shown(x), truth: truth(x) });
          y.reset(); cross.push({ id: `${shape} ${x.name} after ${y.name} Reset`, shown: shown(x), truth: truth(x), own });
          // Stable during its own adjustments: one more step of X itself.
          x.fn(-1); cross.push({ id: `${shape} ${x.name} own step after ${y.name}`, shown: shown(x), truth: truth(x) });
        }
      }
      resetAll();
      return { rows, same, refresh, reset70, rect, cross };
    }, SDS);

    const fail = [];
    for (const r of out.rows) {
      const id = r.name;
      if (r.auto.text !== '100%' || r.auto.min) fail.push(`${id}: automatic shows "${r.auto.text}"`);
      for (const s of r.steps) if (parseInt(s.text, 10) !== s.expected) fail.push(`${id} ${s.step}: shows ${s.text}, drawn size is ${s.expected}% of automatic`);
      if (!(r.steps[0].size < r.auto.size)) fail.push(`${id}: one decrease did not reduce the drawn size`);
      if (parseInt(r.minimum.text, 10) !== r.minimum.expected) fail.push(`${id} minimum: shows ${r.minimum.text}, expected ${r.minimum.expected}%`);
      if (!r.minimum.min) fail.push(`${id}: "minimum" not shown at the lower limit`);
      if (Math.abs(r.minimum.size - r.minimum.boundMin) > 0.01) fail.push(`${id}: lower limit drawn at ${r.minimum.size}, renderer minimum ${r.minimum.boundMin}`);
      if (r.minimum.afterOneMore !== r.minimum.size) fail.push(`${id}: decreasing past the minimum changed the size`);
      if (parseInt(r.maximum.text, 10) !== r.maximum.expected) fail.push(`${id} maximum: shows ${r.maximum.text}, expected ${r.maximum.expected}%`);
      if (r.maximum.min) fail.push(`${id}: "minimum" shown at the upper limit`);
      for (const k of ['reset1', 'reset2']) {
        if (r[k].text !== '100%' || r[k].min) fail.push(`${id} ${k}: shows "${r[k].text}"`);
        if (r[k].size !== r.auto.size) fail.push(`${id} ${k}: drawn size ${r[k].size} differs from automatic ${r.auto.size}`);
      }
    }
    if (!out.same) fail.push('refreshing the fine-tune display changed the label SVG');
    if (parseInt(out.refresh.text, 10) !== out.refresh.expected) fail.push(`after resizing to 70 mm: shows ${out.refresh.text}, expected ${out.refresh.expected}% of the new automatic size`);
    if (out.reset70.text !== '100%') fail.push(`after resizing and Reset: shows "${out.reset70.text}"`);
    const R = out.rect;
    for (const [k, v] of Object.entries(R)) if (v.shown !== v.truth) fail.push(`rectangle 90x63 ${k}: hazard shows ${v.shown}%, actual ${v.truth}% of its automatic size`);
    if (!(R.r2.staleBefore - R.r2.truth >= 5)) fail.push(`rectangle 90x63: case no longer exercises a changed automatic size (${R.r2.staleBefore}% -> ${R.r2.truth}%)`);
    for (const c of out.cross) if (c.shown !== c.truth) fail.push(`${c.id}: shows ${c.shown}%, actual ${c.truth}%`);
    if (errs.length) fail.push('page errors: ' + errs.join(' | '));
    assert.strictEqual(fail.length, 0, 'fine-tune display:\n  ' + fail.join('\n  '));
    console.log('PASS: five fine-tune controls show size as % of automatic (100% automatic/Reset; ' +
      out.rows.map(r => `${r.name} ${r.steps[2].text}/${r.minimum.text.replace('minimum', ' minimum')}/${r.maximum.text}`).join('; ') +
      `); stable reference; refreshed after resize (${out.refresh.text}); 90x63 rectangle hazard after business name minimum ${out.rect.r2.shown}% (${out.rect.r2.staleBefore}% before the business name changed); ` +
      `${out.cross.length} cross-control checks; output unchanged`);
  } catch (e) { failed = true; console.error(e.message || e); }
  finally { await browser.close(); server.close(); process.exit(failed ? 1 : 0); }
});
