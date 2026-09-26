// Real-browser regression test for the curved product-name / business-name
// collision fix on circular labels (Builder Label Technical Audit, Sept 2026,
// finding M45). On a circle, a label reported as FIT must have its curved
// product name's visible ink at least ARC_BIZ_CLEARANCE_MM (0.5mm -- a
// CLPeasy rendering safety clearance, not a statutory GB CLP figure) away from
// the business name's visible ink, with the complete product name drawn.
// When the complete name cannot achieve that even at the existing mandatory
// minimum size, the label must be NOT FIT and blocked, with nothing removed.
//
// Method (pixels, not SVG boxes -- the text boxes overlap on many labels whose
// letters do not): the product-name arc and the business name are each
// rasterised ALONE through the same SVG -> <img> -> canvas path the signed-out
// preview, PNG export and Composer use (label clip-path kept, so only visible
// ink counts), at 20 px/mm. Any pixel inked by both is an overlap; the gap is
// the smallest Euclidean distance between the two inks (exact distance
// transform). Tolerance: pixel-centre distances can exceed the true ink
// distance by at most one pixel diagonal (sqrt(2)/20 = 0.071mm), so a gap of
// at least 0.5 - 0.071mm is required. Any coverage counts as ink, so this
// errs towards measuring the gap smaller, not larger.
//
// Fonts: three scenarios, each in a fresh page (tests/fixtures/fonts):
//   S0  no Georgia, no DM Sans: generic serif / sans-serif fallback
//   S1  Georgia installed (Georgia-metric Gelasio registered as "Georgia"),
//       DM Sans unavailable: signed-out preview, PNG export, Composer on
//       Windows/macOS/iOS
//   S2  S1 + the DM Sans web font: Pro preview and PDF
// Fonts are registered both in the page (what the renderer measures with) and
// inside each rasterised SVG (what is drawn), exactly as a device with them
// installed would behave. Google Fonts requests are blocked (deterministic).
//
// Also verified:
//   - every other part of every circle SVG is byte-identical to the renderer
//     before this fix (jsdom baseline tests/fixtures/circle-non-arc-render-
//     baseline.json), except the block flags/overlay on newly blocked labels;
//   - squares/rectangles are byte-identical to main
//     (tests/fixtures/square-rect-render-baseline.json);
//   - the manual product-name "+" (pushed past its maximum) still clears the
//     business name, and stepping it up never makes the drawn name smaller
//     (no exemption since the M43 fix);
//   - Builder's download gate and Composer's message read the flag used.
// Issue #1 (per-line hazard text containment) has its own test:
// tests/circle-per-line-text-containment.js.
//
// Run from the repo root: node tests/circle-product-name-business-name-clearance.js
//   --renderer <path>  test another label-render.js (e.g. the pre-fix one)
//   --report           print counts only, no assertions (before/after evidence)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer');
const { circleArcCases } = require('./fixtures/circle-arc-fixtures');
const { renderCircleNonArcFingerprints } = require('./fixtures/circle-non-arc-fingerprints');
const { renderSquareRectFingerprints } = require('./fixtures/square-rect-fingerprints');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const REPORT = argv.includes('--report');
const rendererPath = argv.includes('--renderer') ? argv[argv.indexOf('--renderer') + 1] : path.join(ROOT, 'label-render.js');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');
const CLEARANCE_MM = 0.5;
const PX_PER_MM = 20;
const TOL_MM = Math.SQRT2 / PX_PER_MM;
const FONT_DIR = path.join(__dirname, 'fixtures', 'fonts');
const FONTS = {
  Georgia: fs.readFileSync(path.join(FONT_DIR, 'gelasio-700-latin.woff2')).toString('base64'),
  'DM Sans': fs.readFileSync(path.join(FONT_DIR, 'dm-sans-700-latin.woff2')).toString('base64'),
};
const SCENARIOS = { S0: [], S1: ['Georgia'], S2: ['Georgia', 'DM Sans'] };

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pw)) return pw;
  throw new Error('No Chromium found: set PUPPETEER_EXECUTABLE_PATH');
}

// ── in-page analysis (runs in Chromium) ───────────────────────────────
async function analyseInPage(c, pxPerMm, families) {
  const LR = window.LabelRenderer;
  const r = LR.renderLabel(c.data, Object.assign({ instanceId: 'c' + (window._n = (window._n || 0) + 1) }, c.opts || {}));
  const { mmW, pw, ph } = r.metrics.labelDims;
  const k = pw / mmW;
  const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
  const texts = [...doc.querySelectorAll('text')];
  const arc = texts.find(t => t.querySelector('textPath'));
  const bizText = c.data.bizName || 'Your Brand';
  const biz = texts.find(t => /Georgia/.test(t.getAttribute('font-family') || '') && t.textContent === bizText);
  const out = {
    fits: r.fits, blocked: r.blocked, blockReason: r.blockReason, warnings: [...r.warnings],
    overlay: r.svg.includes('clp-fit-block'), arcCollision: !!r.metrics.scentArcCollision,
    scentTooSmall: !!r.metrics.scentTooSmall, scentMm: r.metrics.fontSizes.scent / k,
    scentMaxMm: r.metrics.fsBounds.scent.max / k, floorMm: null,
    arcText: arc ? arc.textContent : null, bizFound: !!biz,
  };
  // Manual product-name "+" (scentFSOverride), stepped from the fine-tune
  // minimum to its maximum: the drawn size must never go DOWN as "+" goes up
  // (only bisection rounding, <1e-4 layout units, is tolerated). The former
  // exemption for the M43 collapse to the minimum was removed with the M43 fix.
  if (c.opts && c.opts.scentFSOverride === 999) {
    const b = r.metrics.fsBounds.scent; let prev = -Infinity; out.plusMonotone = true;
    for (let i = 0; i <= 24; i++) {
      const v = b.min + (b.max - b.min) * i / 24;
      const rr = LR.renderLabel(c.data, { instanceId: 'm' + i, scentFSOverride: v });
      const fs = rr.metrics.fontSizes.scent;
      if (fs < prev - 1e-4) out.plusMonotone = false;
      prev = fs;
    }
  }
  if (!arc || !biz) return out;
  // Complete name drawn: its advance must fit on the arc path (textPath drops
  // glyphs that run past the path's end).
  const stage = document.getElementById('stage');
  stage.innerHTML = r.svg;
  const liveArc = [...stage.querySelectorAll('text')].find(t => t.querySelector('textPath'));
  out.arcAdvance = liveArc.getComputedTextLength();
  out.arcPathLen = stage.querySelector('defs path').getTotalLength();
  stage.innerHTML = '';

  // Rasterise one element alone (label clip kept), upper half of the label.
  const fontCss = families.map(f => `@font-face{font-family:'${f}';font-weight:700;src:url(data:font/woff2;base64,${window._FONTS[f]}) format('woff2');}`).join('');
  const W = Math.round(mmW * pxPerMm), H = Math.round(W * (ph / 2) / pw);
  async function mask(keep) {
    const d = doc.cloneNode(true);
    const all = [...d.querySelectorAll('text')];
    all.forEach((t, i) => { if (i !== texts.indexOf(keep)) t.remove(); });
    d.querySelectorAll('image,use,line,g.clp-fit-block').forEach(e => e.remove());
    d.querySelectorAll('circle,rect').forEach(e => { if (!e.closest('clipPath')) e.remove(); });
    d.querySelectorAll('style').forEach(e => e.remove());
    const svg = d.documentElement;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${pw} ${ph / 2}`);
    let s = new XMLSerializer().serializeToString(d);
    if (fontCss) s = s.replace('<defs>', `<defs><style>${fontCss}</style>`);
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' })); });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const D = x.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = D[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  }
  const A = await mask(arc), B = await mask(biz);
  // Exact squared Euclidean distance transform of B (Felzenszwalb & Huttenlocher).
  const INF = 1e20, dt = new Float64Array(W * H);
  function dt1(f, n) {
    const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1); let kk = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[kk]] + v[kk] * v[kk])) / (2 * q - 2 * v[kk]);
      while (s <= z[kk]) { kk--; s = ((f[q] + q * q) - (f[v[kk]] + v[kk] * v[kk])) / (2 * q - 2 * v[kk]); }
      kk++; v[kk] = q; z[kk] = s; z[kk + 1] = INF;
    }
    kk = 0; for (let q = 0; q < n; q++) { while (z[kk + 1] < q) kk++; d[q] = (q - v[kk]) * (q - v[kk]) + f[v[kk]]; }
    return d;
  }
  const col = new Float64Array(H);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) col[y] = B[y * W + x] ? 0 : INF; const d = dt1(col, H); for (let y = 0; y < H; y++) dt[y * W + x] = d[y]; }
  const row = new Float64Array(W);
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) row[x] = dt[y * W + x]; const d = dt1(row, W); for (let x = 0; x < W; x++) dt[y * W + x] = d[x]; }
  let overlap = 0, min2 = Infinity, arcInk = 0, bizInk = 0;
  for (let i = 0; i < W * H; i++) {
    if (B[i]) bizInk++;
    if (!A[i]) continue; arcInk++;
    if (B[i]) overlap++;
    if (dt[i] < min2) min2 = dt[i];
  }
  out.arcInk = arcInk; out.bizInk = bizInk; out.overlapPx = overlap;
  out.gapMm = Math.sqrt(min2) / pxPerMm;
  return out;
}

(async () => {
  let squareRectOk = null, nonArc = null;
  if (!REPORT) {
    // ── 1. Squares/rectangles byte-identical to main (jsdom baseline) ─────
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'square-rect-render-baseline.json'), 'utf8'));
    const current = renderSquareRectFingerprints(rendererSource);
    assert.strictEqual(Object.keys(current).length, Object.keys(baseline).length, 'square/rectangle fixture set changed size');
    for (const key of Object.keys(baseline)) assert.deepStrictEqual(current[key], baseline[key], `square/rectangle output changed for ${key}`);
    squareRectOk = Object.keys(baseline).length;

    // ── 2. Circles: everything except the curved product name unchanged ───
    const cb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'circle-non-arc-render-baseline.json'), 'utf8'));
    const cc = renderCircleNonArcFingerprints(rendererSource);
    assert.strictEqual(Object.keys(cc).length, Object.keys(cb).length, 'circle fixture set changed size');
    nonArc = { identical: 0, fullIdentical: 0, blocked: 0 };
    for (const key of Object.keys(cb)) {
      if (cc[key].full === cb[key].full) nonArc.fullIdentical++;
      if (cc[key].arcCollision) {
        nonArc.blocked++;
        assert.strictEqual(cc[key].fits, false, `${key}: arc collision must be NOT FIT`);
        assert(cc[key].warnings.includes('scent-name-too-small'), `${key}: arc collision must carry scent-name-too-small`);
        continue;
      }
      assert.strictEqual(cc[key].nonArc, cb[key].nonArc, `${key}: circle output other than the curved product name changed`);
      assert.strictEqual(cc[key].fits, cb[key].fits, `${key}: FIT result changed without an arc collision`);
      assert.deepStrictEqual(cc[key].warnings, cb[key].warnings, `${key}: warnings changed without an arc collision`);
      nonArc.identical++;
    }

    // ── 3. The flag used blocks every export path ─────────────────────────
    const builder = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
    assert(/window\._labelBlockDownload\s*=\s*!!\([^;]*_hasMandatoryTextTooSmall/.test(builder)
      && /_hasMandatoryTextTooSmall\s*=\s*!!\(window\._scentTooSmall/.test(builder)
      && /window\._scentTooSmall=result\.metrics\.scentTooSmall/.test(builder),
      "Builder's download gate must read the renderer's scentTooSmall flag");
    const composer = fs.readFileSync(path.join(ROOT, 'print.html'), 'utf8');
    assert(composer.includes("warnings.includes('scent-name-too-small')"), 'Composer must explain scent-name-too-small');
  }

  // ── 4. Real-browser pixel checks ─────────────────────────────────────
  const cases = circleArcCases();
  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const stats = { renders: 0, fit: 0, notFit: 0, fitWithOverlap: 0, fitBelowClearance: 0, arcBlocked: 0, minGapMm: Infinity, overlapRenders: 0, plusSweeps: 0 };
  const failures = [];
  try {
    for (const [scen, families] of Object.entries(SCENARIOS)) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', req => (/^(data|blob):/.test(req.url()) ? req.continue() : req.abort()));
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="stage"></div></body></html>');
      await page.evaluate(async (FONTS, families) => {
        window._FONTS = FONTS;
        for (const f of families) { const ff = new FontFace(f, `url(data:font/woff2;base64,${FONTS[f]})`, { weight: '700' }); await ff.load(); document.fonts.add(ff); }
      }, FONTS, families);
      await page.addScriptTag({ content: rendererSource });
      for (const c of cases) {
        const name = `${scen} ${c.key}`;
        const res = await page.evaluate(analyseInPage, c, PX_PER_MM, families);
        stats.renders++;
        if (res.overlapPx) stats.overlapRenders++;
        const check = (cond, msg) => { if (!cond) failures.push(`${name}: ${msg}`); };
        // Complete product name present and fully drawn, on every render.
        check(res.bizFound, 'business name element not found');
        check(res.arcText === c.data.scentName, `curved product name is not the complete name (got ${JSON.stringify(res.arcText)})`);
        if (res.plusMonotone !== undefined) { stats.plusSweeps++; check(res.plusMonotone, 'pressing "+" (larger scentFSOverride) made the drawn product name smaller'); }
        check(res.arcAdvance <= res.arcPathLen + 0.01, `curved product name runs past the end of its arc (glyphs dropped): ${res.arcAdvance} > ${res.arcPathLen}`);
        if (res.fits) {
          stats.fit++;
          stats.minGapMm = Math.min(stats.minGapMm, res.gapMm);
          if (res.overlapPx) stats.fitWithOverlap++;
          if (res.gapMm < CLEARANCE_MM - TOL_MM) stats.fitBelowClearance++;
          check(res.arcInk > 0 && res.bizInk > 0, 'no ink rasterised');
          check(res.overlapPx === 0, `FIT label with ${res.overlapPx} px of product-name/business-name overlap`);
          check(res.gapMm >= CLEARANCE_MM - TOL_MM, `FIT label with only ${res.gapMm.toFixed(3)}mm between product name and business name`);
          check(!res.overlay && !res.blocked, 'FIT label is blocked');
          // "+" pushed past its maximum is covered by the clearance checks above
          // (the case with scentFSOverride 999); the drawn size never exceeds
          // the fine-tune maximum either.
          check(res.scentMm <= res.scentMaxMm + 1e-9, `product-name size ${res.scentMm} exceeds its fine-tune maximum ${res.scentMaxMm}`);
        } else {
          stats.notFit++;
          check(res.blocked && res.overlay, 'NOT FIT label is not blocked with the overlay');
          if (res.arcCollision) {
            stats.arcBlocked++;
            check(res.scentTooSmall && res.warnings.includes('scent-name-too-small'), 'arc collision must block through scentTooSmall / scent-name-too-small');
            check(res.blockReason === 'content-does-not-fit', `unexpected block reason ${res.blockReason}`);
          }
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const summary = `${stats.renders} circle renders (${cases.length} cases x ${Object.keys(SCENARIOS).length} font scenarios): ${stats.fit} FIT, ${stats.notFit} NOT FIT (${stats.arcBlocked} blocked because the complete name cannot clear the business name at the minimum size); renders with any overlap: ${stats.overlapRenders}; FIT with overlap: ${stats.fitWithOverlap}; FIT below ${CLEARANCE_MM}mm clearance (tolerance ${TOL_MM.toFixed(3)}mm): ${stats.fitBelowClearance}; smallest FIT clearance ${stats.minGapMm.toFixed(3)}mm; "+" sweeps never shrinking the name: ${stats.plusSweeps}`;
  if (REPORT) { console.log('REPORT', rendererPath, '\n' + summary); return; }
  if (failures.length) { console.error(failures.slice(0, 40).join('\n')); throw new Error(`${failures.length} failures\n${summary}`); }
  assert(stats.fit >= 300 && stats.arcBlocked > 0, `expected a meaningful mix of FIT and arc-blocked renders: ${summary}`);
  console.log(`circle product-name / business-name clearance checks passed: ${summary}; ${nonArc.identical} circle cases byte-identical to the pre-fix renderer apart from the curved name (${nonArc.fullIdentical} fully identical, ${nonArc.blocked} newly blocked in the jsdom stub), ${squareRectOk} square/rectangle renders byte-identical to main`);
})().catch(err => { console.error(err); process.exit(1); });
