// Real-browser regression test for product-name sizing (Builder Label
// Technical Audit, Sept 2026, finding M43). Previously a product name that no
// longer fitted on one line at the requested size (automatic, or the manual
// "+" fine-tune) dropped straight to the mandatory minimum (e.g. 2.69mm ->
// 1.23mm on a 100mm square), pressing "+" could shrink the name, and a name
// that genuinely had to wrap (at the minimum) could run into the business
// name while the label reported FIT.
//
// Verified, on squares, rectangles and circles, 52-150mm, names 4-128
// characters, in real Chromium:
//   1. as a name grows, its size falls smoothly (never jumps to the minimum
//      while a larger one-line size exists): between consecutive names the size
//      may fall no faster than the name lengthens (ratio of lengths, x0.85
//      allowance for letter-width differences), unless it is at the minimum;
//      a name drawn on ONE line at the minimum must not fit one line any larger
//      (checked by requesting a 5% larger size);
//   2. "+" (scentFSOverride stepped across and past its range) never makes the
//      drawn name smaller, and never pushes a one-line name onto two lines;
//   3. the complete product name is always drawn (straight lines re-joined, or
//      the curved textPath text);
//   4. a WRAPPED name keeps >= 0.5mm (a CLPeasy rendering safety clearance, not
//      a statutory GB CLP figure) from the business name on pixels, allowing
//      one pixel diagonal at 20 px/mm (0.071mm) for raster quantisation (any
//      coverage counts as ink, so the gap errs smaller); if it cannot, the label
//      is NOT FIT and blocked (scentWrapCollision -> scentTooSmall);
//   5. no FIT label has any product-name / business-name ink overlap;
//   6. labels whose name was not at the minimum before the fix are
//      byte-identical to the pre-fix renderer (jsdom baseline
//      tests/fixtures/product-name-sizing-baseline.json), and squares/
//      rectangles stay byte-identical to main (square-rect-render-baseline.json);
//   7. Builder and Composer render the same label (their renderLabel() option
//      sets, no manual overrides) with the same layout.
// Fonts: S0 = generic fallback only; S1 = Georgia installed (Georgia-metric
// Gelasio registered as "Georgia", as on Windows/macOS/iOS). Google Fonts are
// blocked (deterministic).
//
// Run from the repo root: node tests/product-name-one-line-sizing.js
//   --renderer <path>  test another label-render.js; --report  counts only
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer');
const { GEOMS, GROWING, REALISTIC, content, renderSizingFingerprints } = require('./fixtures/product-name-sizing-fixtures');
const { renderSquareRectFingerprints } = require('./fixtures/square-rect-fingerprints');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const REPORT = argv.includes('--report');
const rendererPath = argv.includes('--renderer') ? argv[argv.indexOf('--renderer') + 1] : path.join(ROOT, 'label-render.js');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');
const CLEARANCE_MM = 0.5, PX_PER_MM = 20, TOL_MM = Math.SQRT2 / PX_PER_MM;
const GEORGIA = fs.readFileSync(path.join(__dirname, 'fixtures', 'fonts', 'gelasio-700-latin.woff2')).toString('base64');
const PLUS_NAMES = ['Lavender Fields', 'Christmas Spiced Orange & Cinnamon', "Grandma's Kitchen Apple Pie & Warm Cinnamon Spice", GROWING[8], GROWING[12], GROWING[GROWING.length - 1]];
const BIZ_VARIANTS = ['CMG', 'The Little Candle Company of Yorkshire', ''];

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pw)) return pw;
  throw new Error('No Chromium found: set PUPPETEER_EXECUTABLE_PATH');
}

// ── in-page: render one label and measure its product name ─────────────
async function renderInPage(data, opts, pxPerMm, georgia, doPixels) {
  const LR = window.LabelRenderer;
  const r = LR.renderLabel(data, Object.assign({ instanceId: 'p' + (window._n = (window._n || 0) + 1) }, opts || {}));
  const { mmW, pw, ph } = r.metrics.labelDims; const k = pw / mmW;
  const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
  const texts = [...doc.querySelectorAll('text')];
  const bizText = data.bizName || 'Your Brand';
  const biz = texts.find(t => /Georgia/.test(t.getAttribute('font-family') || '') && t.textContent === bizText);
  const isCircle = data.shape === 'circle';
  const name = isCircle ? texts.find(t => t.querySelector('textPath'))
    : texts.find(t => /Georgia/.test(t.getAttribute('font-family') || '') && t !== biz && t.getAttribute('font-weight') === '700');
  const nameLines = !name ? [] : isCircle ? [name.textContent] : [name.firstChild && name.firstChild.nodeType === 3 ? name.firstChild.textContent : '', ...[...name.querySelectorAll('tspan')].map(s => s.textContent)].filter(Boolean);
  const out = {
    fits: r.fits, blocked: r.blocked, warnings: [...r.warnings], overlay: r.svg.includes('clp-fit-block'),
    scentPx: r.metrics.fontSizes.scent, floorPx: Math.max(1.2 * k, 3.2), k,
    bounds: r.metrics.fsBounds.scent, lines: nameLines.length, joined: nameLines.join(' '),
    wrapCollision: !!r.metrics.scentWrapCollision, scentTooSmall: !!r.metrics.scentTooSmall,
    svgNoIds: r.svg.replace(/\b(id|href|clip-path)="[^"]*"/g, '').replace(/url\(#[^)]*\)/g, '').replace(/<svg[^>]*>/, '<svg>'),
  };
  if (!doPixels || !name || !biz) return out;
  const W = Math.round(mmW * pxPerMm), H = Math.round(W * (ph * 0.45) / pw);
  const css = georgia ? `<style>@font-face{font-family:'Georgia';font-weight:700;src:url(data:font/woff2;base64,${window._G}) format('woff2');}</style>` : '';
  async function mask(keep) {
    const d = doc.cloneNode(true); const all = [...d.querySelectorAll('text')];
    all.forEach((t, i) => { if (i !== texts.indexOf(keep)) t.remove(); });
    d.querySelectorAll('image,use,line,g.clp-fit-block,style').forEach(e => e.remove());
    d.querySelectorAll('circle,rect').forEach(e => { if (!e.closest('clipPath')) e.remove(); });
    const svg = d.documentElement; svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${pw} ${ph * 0.45}`);
    let s = new XMLSerializer().serializeToString(d); if (css) s = s.replace('<defs>', '<defs>' + css);
    const img = new Image(); await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' })); });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const D = x.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = D[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  }
  const A = await mask(name), B = await mask(biz);
  // exact squared Euclidean distance transform of B (Felzenszwalb & Huttenlocher)
  const INF = 1e20, dt = new Float64Array(W * H);
  const dt1 = (f, n) => { const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1); let q0 = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) { let s = ((f[q] + q * q) - (f[v[q0]] + v[q0] * v[q0])) / (2 * q - 2 * v[q0]); while (s <= z[q0]) { q0--; s = ((f[q] + q * q) - (f[v[q0]] + v[q0] * v[q0])) / (2 * q - 2 * v[q0]); } q0++; v[q0] = q; z[q0] = s; z[q0 + 1] = INF; }
    q0 = 0; for (let q = 0; q < n; q++) { while (z[q0 + 1] < q) q0++; d[q] = (q - v[q0]) * (q - v[q0]) + f[v[q0]]; } return d; };
  const col = new Float64Array(H); for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) col[y] = B[y * W + x] ? 0 : INF; const d = dt1(col, H); for (let y = 0; y < H; y++) dt[y * W + x] = d[y]; }
  const row = new Float64Array(W); for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) row[x] = dt[y * W + x]; const d = dt1(row, W); for (let x = 0; x < W; x++) dt[y * W + x] = d[x]; }
  let overlap = 0, min2 = Infinity, ink = 0;
  for (let i = 0; i < W * H; i++) { if (!A[i]) continue; ink++; if (B[i]) overlap++; if (dt[i] < min2) min2 = dt[i]; }
  out.overlapPx = overlap; out.gapMm = Math.sqrt(min2) / pxPerMm; out.nameInk = ink;
  delete out.svgNoIds;
  return out;
}

(async () => {
  let identical = null;
  if (!REPORT) {
    // ── byte-identity (jsdom) ──────────────────────────────────────────
    const sb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'square-rect-render-baseline.json'), 'utf8'));
    const sc = renderSquareRectFingerprints(rendererSource);
    for (const key of Object.keys(sb)) assert.deepStrictEqual(sc[key], sb[key], `square/rectangle output changed for ${key}`);
    const pb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'product-name-sizing-baseline.json'), 'utf8'));
    const pc = renderSizingFingerprints(rendererSource);
    assert.strictEqual(Object.keys(pc).length, Object.keys(pb).length, 'product-name sizing fixture set changed size');
    identical = { same: 0, atMinimumBefore: 0, changed: 0 };
    for (const key of Object.keys(pb)) {
      const before = pb[key], now = pc[key];
      const wasAtMinimum = Math.abs(before.scentPx - before.floorPx) < 1e-6;
      if (wasAtMinimum) identical.atMinimumBefore++;
      if (now.sha256 === before.sha256) { identical.same++; continue; }
      identical.changed++;
      assert(wasAtMinimum, `${key}: output changed although its product name was not at the minimum before the fix`);
      assert(now.scentPx >= before.scentPx - 1e-9, `${key}: product name got smaller (${before.scentPx} -> ${now.scentPx})`);
    }
    assert.strictEqual(Object.keys(sb).length, 63);
  }

  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const stats = { renders: 0, fit: 0, notFit: 0, growthSteps: 0, collapses: 0, plusSweeps: 0, plusShrinks: 0, plusWraps: 0,
    wrapped: 0, wrappedFit: 0, wrappedBlocked: 0, wrappedBelowClearance: 0, fitOverlap: 0, minWrappedGap: Infinity, minSingleGap: Infinity, nameIncomplete: 0, composerMismatch: 0 };
  const failures = [];
  const fail = (cond, msg) => { if (!cond) failures.push(msg); };
  try {
    for (const [scen, georgia] of [['S0', false], ['S1', true]]) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', req => (/^(data|blob):/.test(req.url()) ? req.continue() : req.abort()));
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      if (georgia) await page.evaluate(async G => { window._G = G; const f = new FontFace('Georgia', `url(data:font/woff2;base64,${G})`, { weight: '700' }); await f.load(); document.fonts.add(f); }, GEORGIA);
      await page.addScriptTag({ content: rendererSource });
      const R = (data, opts, px) => page.evaluate(renderInPage, data, opts || null, PX_PER_MM, georgia, !!px);
      const check = (label, data, res) => {
        stats.renders++;
        const full = data.scentName.split(/\s+/).join(' ');
        if (res.joined !== full) { stats.nameIncomplete++; fail(false, `${label}: product name not drawn in full (${JSON.stringify(res.joined)})`); }
        if (res.fits) {
          stats.fit++;
          if (res.overlapPx) { stats.fitOverlap++; fail(false, `${label}: FIT with ${res.overlapPx}px product-name/business-name overlap`); }
        } else {
          stats.notFit++;
          fail(res.blocked && res.overlay, `${label}: NOT FIT but not blocked`);
        }
        if (res.lines > 1 && data.shape !== 'circle') {
          stats.wrapped++;
          if (res.fits) {
            stats.wrappedFit++;
            stats.minWrappedGap = Math.min(stats.minWrappedGap, res.gapMm);
            if (res.gapMm < CLEARANCE_MM - TOL_MM) { stats.wrappedBelowClearance++; fail(false, `${label}: wrapped name only ${res.gapMm.toFixed(3)}mm from the business name`); }
          }
          if (res.wrapCollision) { stats.wrappedBlocked++; fail(!res.fits && res.scentTooSmall && res.warnings.includes('scent-name-too-small'), `${label}: wrapped-name collision must block via scentTooSmall`); }
        } else if (res.fits && data.shape !== 'circle' && res.gapMm !== undefined) {
          stats.minSingleGap = Math.min(stats.minSingleGap, res.gapMm);
        }
      };
      for (const [shape, w, h] of GEOMS) {
        const g = `${scen} ${shape} ${w}x${h}`;
        // 1. growing name: smooth decrease, never a collapse to the minimum
        let prev = null;
        for (const n of GROWING) {
          const d = content(shape, w, h, n); const res = await R(d, null, true); check(`${g} "${n.length}ch"`, d, res);
          if (prev) {
            stats.growthSteps++;
            const atMin = Math.abs(res.scentPx - res.floorPx) < 1e-6;
            const allowed = Math.min(prev.px, prev.px * (prev.len / n.length) * 0.85);
            if (res.scentPx < allowed - 1e-6 && !(atMin && prev.px * (prev.len / n.length) * 0.85 <= res.floorPx + 1e-6)) {
              stats.collapses++; fail(false, `${g}: size fell ${(prev.px / res.k).toFixed(2)} -> ${(res.scentPx / res.k).toFixed(2)}mm between ${prev.len} and ${n.length} characters`);
            }
            if (res.scentPx > prev.px + 1e-6) fail(false, `${g}: a longer name got a larger size (${prev.len} -> ${n.length} chars)`);
          }
          if (shape !== 'circle' && res.lines === 1 && Math.abs(res.scentPx - res.floorPx) < 1e-6) {
            const up = await R(d, { scentFSOverride: res.floorPx * 1.05 }, false);
            if (up.scentPx > res.scentPx + 1e-6 && up.lines === 1) { stats.collapses++; fail(false, `${g} "${n.length}ch": drawn at the minimum although a larger one-line size fits`); }
          }
          prev = { px: res.scentPx, len: n.length };
        }
        // realistic names and business-name variants
        for (const n of REALISTIC) { const d = content(shape, w, h, n); check(`${g} "${n}"`, d, await R(d, null, true)); }
        for (const b of BIZ_VARIANTS) for (const n of [GROWING[12], GROWING[GROWING.length - 1]]) { const d = content(shape, w, h, n, b); check(`${g} "${n.length}ch" biz=${b || '(empty)'}`, d, await R(d, null, true)); }
        // 2. "+" never shrinks the name, and never pushes a one-line name onto two lines
        for (const n of PLUS_NAMES) {
          const d = content(shape, w, h, n); const base = await R(d, null, false);
          const b = base.bounds; let last = null; stats.plusSweeps++;
          const steps = []; for (let i = 0; i <= 24; i++) steps.push(b.min + (b.max - b.min) * i / 24); steps.push(b.max * 1.5, 999);
          for (const v of steps) {
            const res = await R(d, { scentFSOverride: v }, false);
            if (last) {
              if (res.scentPx < last.scentPx - 1e-4) { stats.plusShrinks++; fail(false, `${g} "${n.length}ch": "+" to ${(v / res.k).toFixed(2)}mm made the name smaller`); }
              if (shape !== 'circle' && last.lines === 1 && res.lines > 1) { stats.plusWraps++; fail(false, `${g} "${n.length}ch": "+" pushed a one-line name onto ${res.lines} lines`); }
            }
            last = res;
          }
          const top = await R(d, { scentFSOverride: 999 }, true); check(`${g} "${n.length}ch" +max`, d, top);
        }
        // 7. Builder and Composer option sets -> same layout (no manual overrides)
        for (const n of [REALISTIC[6], GROWING[10], GROWING[GROWING.length - 1]]) {
          const d = content(shape, w, h, n);
          const bld = await R(d, { forExport: false, bgColour: '#ffffff', hazardFSOverride: null, hazardYOffset: null, scentFSOverride: null, bizNameFSOverride: null, typeFSOverride: null, sigFSOverride: null, watermark: true }, false);
          const cmp = await R(d, { pw: 260, ph: 260 * h / w, bgColour: undefined, watermark: true }, false);
          if (bld.svgNoIds !== cmp.svgNoIds || bld.fits !== cmp.fits || bld.scentPx !== cmp.scentPx) { stats.composerMismatch++; fail(false, `${g} "${n.length}ch": Builder and Composer render differently`); }
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const summary = `${stats.renders} measured renders (${GEOMS.length} geometries x 2 font scenarios): ${stats.fit} FIT, ${stats.notFit} NOT FIT; growth steps ${stats.growthSteps}, collapses ${stats.collapses}; "+" sweeps ${stats.plusSweeps}, shrinks ${stats.plusShrinks}, one-line->wrapped ${stats.plusWraps}; wrapped names ${stats.wrapped} (${stats.wrappedFit} FIT, ${stats.wrappedBlocked} blocked for clearance), FIT wrapped below ${CLEARANCE_MM}mm (tolerance ${TOL_MM.toFixed(3)}mm): ${stats.wrappedBelowClearance}, smallest FIT wrapped clearance ${isFinite(stats.minWrappedGap) ? stats.minWrappedGap.toFixed(3) + 'mm' : 'n/a'}, smallest FIT single-line (square/rect) clearance ${stats.minSingleGap.toFixed(3)}mm; FIT with overlap ${stats.fitOverlap}; incomplete names ${stats.nameIncomplete}; Builder/Composer mismatches ${stats.composerMismatch}`;
  if (REPORT) { console.log('REPORT', path.basename(rendererPath), '\n' + summary); return; }
  if (failures.length) { console.error(failures.slice(0, 40).join('\n')); throw new Error(`${failures.length} failures\n${summary}`); }
  assert(stats.wrapped > 0 && stats.growthSteps > 100, 'wrapped-name and growth checks must not be vacuous');
  console.log(`product-name one-line sizing checks passed: ${summary}; jsdom: ${identical.same} of ${identical.same + identical.changed} labels byte-identical to the pre-fix renderer (all ${identical.changed} changed ones had the name at the minimum before), 63 square/rectangle renders byte-identical to main`);
})().catch(err => { console.error(err); process.exit(1); });
