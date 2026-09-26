// Real-browser regression test for the circular-label containment fix
// (Builder Label Technical Audit, Sept 2026, finding M44): on a circle, a
// label reported as FIT must have every rendered hazard / sensitiser /
// EUH208 / precautionary line genuinely inside the circle's safe width at
// that line's own vertical position -- never merely hidden by the circle
// clip-path. Unlike the jsdom tests, this renders the real label-render.js
// in headless Chromium and measures the actual rendered glyph positions.
//
// Boundary used (the renderer's OWN existing geometry, no new rule):
//   - hazard/sensitiser/P lines: circle radius r = min(pw,ph)/2 - 1.5, the
//     existing fixed 2mm edge margin each side, evaluated at whichever edge
//     of the line's band (centre +/- half its line spacing) lies farther
//     from the circle centre. Each ACTUALLY RENDERED line (its real text,
//     real Y and real line spacing, read back from the SVG) is measured the
//     way the renderer measures (canvas measureText at the renderer's
//     hazard font size) -- proving the fit calculation and the rendered
//     layout agree. Chromium draws small SVG text up to ~0.35% wider than
//     that canvas measurement (a pre-existing measure-vs-draw difference
//     affecting every shape; audit finding M05), so the DRAWN advance can
//     reach up to ~0.1mm into the 2mm margin; it is reported, and the
//     pixel ink check below guarantees nothing is drawn outside the circle.
//   - every other straight text line (business name, website, product
//     type, signal word, footer): coverage only -- no rendered ink may lie
//     outside the circle outline r. Measured on real pixels: the label's
//     straight text is rasterised with the clip-path removed (so nothing is
//     hidden) and any dark pixel beyond r fails. A glyph-box/em-box test is
//     deliberately NOT used for these lines: it counts empty font padding
//     as ink and falsely flagged the 52mm phone line, which pixel
//     measurement shows is genuinely inside (0 pixels outside).
//     The curved product-name arc is out of scope and not checked here.
// Google Fonts requests are blocked so the browser draws the same generic
// fallback font the renderer measures with (deterministic; no network).
//
// Also verifies NOT FIT results are blocked (fits:false, overflow state,
// red overlay) with no statement or sensitiser removed, and that square/
// rectangle output is byte-identical to main (tests/fixtures/square-rect-
// render-baseline.json, generated from main before this fix).
//
// Run from the repo root: node tests/circle-per-line-text-containment.js
// Chromium: PUPPETEER_EXECUTABLE_PATH, else Puppeteer's own browser, else
// the Playwright Chromium at /opt/pw-browsers (Claude Code cloud sessions).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer');
const { FIXTURES, BOUNDARY_SWEEPS, CIRCLE_SIZES } = require('./fixtures/circle-containment-fixtures');
const { renderSquareRectFingerprints } = require('./fixtures/square-rect-fingerprints');

const ROOT = path.join(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'label-render.js'), 'utf8');

function chromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pw)) return pw;
  throw new Error('No Chromium found: set PUPPETEER_EXECUTABLE_PATH');
}

// ── in-page analysis (runs in Chromium) ───────────────────────────────
async function analyseInPage(data, instanceId, extraOpts) {
  const LR = window.LabelRenderer;
  const r = LR.renderLabel(data, Object.assign({ instanceId }, extraOpts || {}));
  // Tag each renderer section with a role by wrapping it in an untransformed
  // <g data-role> (geometry unchanged). Section comments come from renderLabel().
  const SECTIONS = [
    ['header', '<!-- HEADER: scent at top, then biz, then web -->'],
    ['type', '<!-- PRODUCT TYPE -->'], ['signal', '<!-- SIGNAL WORD -->'], ['picto', '<!-- PICTOGRAMS -->'],
    ['h', '<!-- H STATEMENTS -->'], ['sens', '<!-- SENSITISERS -->'], ['p', '<!-- P STATEMENTS -->'],
    ['footer', '<!-- FOOTER -->'], ['bcf', '<!-- EN 15494 CANDLE SAFETY PICTOGRAMS -->'], ['end', '<!-- WATERMARK -->'],
  ];
  let svg = r.svg;
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    const [role, marker] = SECTIONS[i]; const next = SECTIONS[i + 1][1];
    const a = svg.indexOf(marker), b = svg.indexOf(next);
    if (a < 0 || b < 0) throw new Error('section marker missing: ' + marker);
    svg = svg.slice(0, a + marker.length) + `<g data-role="${role}">` + svg.slice(a + marker.length, b) + '</g>' + svg.slice(b);
  }
  const stage = document.getElementById('stage');
  stage.innerHTML = svg;
  const root = stage.querySelector('svg');
  const { mmW, pw, ph } = r.metrics.labelDims;
  const k = pw / mmW, cx = pw / 2, cy = ph / 2, R = Math.min(pw, ph) / 2 - 1.5;
  const EDGE = 2 * k; // renderer's existing 2mm hazard-text edge margin
  const EPS = 0.05;   // layout units (~0.01mm at 63mm): float/rounding only
  const hazardFS = r.metrics.fontSizes.hazard;
  const violations = []; let hazardLines = 0, otherLines = 0, drawnIntoMarginMm = 0;

  // Split a <text> into rendered lines: its leading text node, then each <tspan>.
  function linesOf(t) {
    const out = []; let ci = 0;
    const y0 = parseFloat(t.getAttribute('y'));
    const parts = []; let dy = null;
    for (const n of t.childNodes) {
      if (n.nodeType === 3) parts.push({ len: n.textContent.length, i: 0 });
      else if (n.tagName === 'tspan') { dy = parseFloat(n.getAttribute('dy')); parts.push({ len: n.textContent.length, i: parts.length }); }
      else if (n.tagName === 'textPath') return null;
    }
    parts.forEach((p, idx) => {
      if (p.len) {
        const a = t.getExtentOfChar(ci), z = t.getExtentOfChar(ci + p.len - 1);
        out.push({ left: a.x, right: z.x + z.width, cyLine: y0 + idx * (dy || 0), text: t.textContent.substr(ci, p.len) });
      }
      ci += p.len;
    });
    return { lines: out, dy };
  }

  for (const t of root.querySelectorAll('text')) {
    if (t.closest('.clp-fit-block')) continue;
    const g = t.closest('[data-role]'); const role = g ? g.dataset.role : 'unknown';
    const L = linesOf(t); if (!L) continue; // curved product-name arc: out of scope
    const fsz = parseFloat(t.getAttribute('font-size'));
    for (const ln of L.lines) {
      if (role === 'h' || role === 'sens' || role === 'p') {
        hazardLines++;
        const cvs = analyseInPage._c || (analyseInPage._c = document.createElement('canvas').getContext('2d'));
        cvs.font = `400 ${hazardFS}px sans-serif`; // label-render.js measureText(), hazard text is never bold/serif
        const measuredW = cvs.measureText(ln.text).width;
        const lh = L.dy || hazardFS * (role === 'p' ? 1.15 : 1.25);
        const dyEdge = Math.max(Math.abs(ln.cyLine - lh / 2 - cy), Math.abs(ln.cyLine + lh / 2 - cy));
        const safeHalf = dyEdge >= R ? -Infinity : Math.sqrt(R * R - dyEdge * dyEdge) - EDGE;
        if (measuredW / 2 > safeHalf + EPS) {
          violations.push({ role, text: ln.text.slice(0, 50), overMm: +((measuredW / 2 - safeHalf) / k).toFixed(3) });
        }
        // Drawn advance vs the 2mm margin: informational (see header).
        drawnIntoMarginMm = Math.max(drawnIntoMarginMm, (Math.max(cx - safeHalf - ln.left, ln.right - cx - safeHalf)) / k);
      } else {
        otherLines++;
      }
    }
  }
  // Pixel ink check for ALL straight text (hazard lines included, as an
  // extra layer): clip-path, shape fills/border, images and the arc removed;
  // rasterised at 4x; any dark pixel whose centre is > 0.5px beyond r fails.
  let inkPixelsOutside = 0, inkMaxOverMm = 0;
  if (r.fits) {
    const S = 4;
    let raw = r.svg.replace(/clip-path="url\([^)]*\)"/, '').replace(/<circle[^>]*\/>/g, '').replace(/<image[^>]*\/>/g, '')
      .replace(/<textPath/, '<textPath opacity="0"')
      .replace(/width="[\d.]+" height="[\d.]+" viewBox/, `width="${pw * S}" height="${ph * S}" viewBox`);
    const img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = URL.createObjectURL(new Blob([raw], { type: 'image/svg+xml' })); });
    const c = document.createElement('canvas'); c.width = pw * S; c.height = ph * S;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
    const D = x.getImageData(0, 0, c.width, c.height).data;
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      const i = (yy * c.width + xx) * 4;
      if (D[i] < 120) { const over = Math.hypot(xx + 0.5 - cx * S, yy + 0.5 - cy * S) - R * S; if (over > 0.5) { inkPixelsOutside++; inkMaxOverMm = Math.max(inkMaxOverMm, over / S / k); } }
    }
    if (inkPixelsOutside) violations.push({ role: 'ink', text: `${inkPixelsOutside} dark text pixels outside the circle`, overMm: +inkMaxOverMm.toFixed(2) });
  }
  const allText = [...root.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block')).map(t => t.textContent).join(' ').replace(/\s+/g, '');
  return { fits: r.fits, blocked: r.blocked, blockReason: r.blockReason, warnings: [...r.warnings], overflow: r.metrics.overflow,
    overlay: r.svg.includes('clp-fit-block'), violations, hazardLines, otherLines, allText, drawnIntoMarginMm };
}

function expectedStrings(LR, data) {
  const out = [];
  const codes = String(data.hStatements || '').split(',').map(s => s.trim()).filter(Boolean);
  codes.filter(c => c !== 'EUH208').forEach(c => out.push(LR.H_LIB.find(x => x.code === c).desc));
  if (codes.includes('EUH208')) out.push('May produce an allergic reaction.');
  String(data.pStatements || '').split(',').map(s => s.trim()).filter(Boolean)
    .forEach(c => out.push(LR.P_LIB.find(x => x.code === c).desc));
  (data.sensitisers || []).forEach(s => out.push(s));
  return out.map(s => s.replace(/\s+/g, ''));
}

(async () => {
  // ── 1. Square/rectangle output unchanged vs main (deterministic jsdom) ──
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'square-rect-render-baseline.json'), 'utf8'));
  const current = renderSquareRectFingerprints(rendererSource);
  assert.strictEqual(Object.keys(current).length, Object.keys(baseline).length, 'square/rectangle fixture set changed size');
  for (const key of Object.keys(baseline)) {
    assert.deepStrictEqual(current[key], baseline[key], `square/rectangle output changed for ${key} -- this fix must not alter square/rectangle rendering`);
  }

  // ── 2-4. Real-browser circle containment ────────────────────────────
  const browser = await puppeteer.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', req => (/fonts\.(googleapis|gstatic)\.com/.test(req.url()) ? req.abort() : req.continue()));
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="stage"></div></body></html>');
    await page.addScriptTag({ content: rendererSource });
    const LR_H = await page.evaluate(() => ({ H_LIB: LabelRenderer.H_LIB, P_LIB: LabelRenderer.P_LIB }));

    let fitCount = 0, notFitCount = 0, hazardLinesChecked = 0, otherLinesChecked = 0, n = 0, maxDrawnIntoMargin = 0;
    async function check(name, data, extraOpts) {
      const res = await page.evaluate(analyseInPage, data, 'c' + (n++), extraOpts || null);
      for (const s of expectedStrings(LR_H, data)) {
        assert(res.allText.includes(s), `${name}: "${s}" is missing from the rendered label -- content must never be removed to obtain a fit`);
      }
      if (res.fits) {
        fitCount++;
        hazardLinesChecked += res.hazardLines; otherLinesChecked += res.otherLines;
        maxDrawnIntoMargin = Math.max(maxDrawnIntoMargin, res.drawnIntoMarginMm);
        assert.deepStrictEqual(res.violations, [], `${name}: reported FIT but text lies outside its permitted circular boundary: ${JSON.stringify(res.violations)}`);
        assert.strictEqual(res.overlay, false, `${name}: a FIT label must not carry the blocked overlay`);
      } else {
        notFitCount++;
        assert.strictEqual(res.blocked, true, `${name}: NOT FIT must be reported as blocked`);
        assert.strictEqual(res.overlay, true, `${name}: NOT FIT must render the blocked overlay`);
        assert.strictEqual(res.blockReason, 'content-does-not-fit', `${name}: unexpected block reason ${res.blockReason}`);
        assert(res.warnings.length > 0, `${name}: NOT FIT must carry an overflow warning`);
        if (res.warnings.includes('hazard-text-overflow')) {
          assert.strictEqual(res.overflow, true, `${name}: metrics.overflow (read by Builder's download gate) must be true`);
        }
      }
      return res;
    }

    // 2. Every fixture on 52 / 63 / 75 mm circles and the 100 mm stress case.
    const results = {};
    for (const [fx, content] of Object.entries(FIXTURES)) {
      for (const mm of CIRCLE_SIZES) {
        results[fx + '@' + mm] = await check(`${fx} @ ${mm}mm circle`, Object.assign({}, content, { shape: 'circle', size: 'custom', customW: mm, customH: mm }));
      }
    }
    // The default (preset) 52mm circle too.
    await check('light @ 52mm default circle', Object.assign({}, FIXTURES.light, { shape: 'circle', size: 52 }));

    // Sanity: the containment checks above must not be vacuous.
    assert(results['light@52'].fits && results['light@63'].fits, 'light payload must fit on 52mm and 63mm circles');
    assert(!results['multiP@52'].fits, 'the full P-statement payload cannot fit a 52mm circle and must be NOT FIT');

    // 3. FIT / NOT FIT boundary sweeps: both states must occur in each range,
    //    and every size in it must satisfy the same rules.
    for (const [fx, from, to] of BOUNDARY_SWEEPS) {
      const states = [];
      for (let mm = from; mm <= to; mm++) {
        const res = await check(`${fx} @ ${mm}mm circle (boundary)`, Object.assign({}, FIXTURES[fx], { shape: 'circle', size: 'custom', customW: mm, customH: mm }));
        states.push(res.fits);
      }
      assert(states.includes(true) && states.includes(false), `${fx}: boundary sweep ${from}-${to}mm must include both FIT and NOT FIT results (got ${states})`);
    }

    // 4. Manual fine-tune overrides (hazard font size forced to its maximum,
    //    hazard block pushed fully down) can never reintroduce overflow --
    //    the same geometric checks apply to whatever they produce.
    for (const [fx, mm] of [['medium', 63], ['heavy', 75], ['multiP', 100], ['euh208Sensitisers', 75]]) {
      const d = Object.assign({}, FIXTURES[fx], { shape: 'circle', size: 'custom', customW: mm, customH: mm });
      for (const opt of [{ hazardFSOverride: 60 }, { hazardYOffset: 1 }]) {
        await check(`${fx} @ ${mm}mm circle with ${JSON.stringify(opt)}`, d, opt);
      }
    }

    assert(fitCount >= 15 && notFitCount >= 5, `expected a meaningful mix of FIT (${fitCount}) and NOT FIT (${notFitCount}) circle renders`);
    console.log(`circle per-line text containment checks passed: ${fitCount} FIT circle renders geometrically verified (${hazardLinesChecked} hazard/sensitiser/P lines against the 2mm-margin per-line safe width, ${otherLinesChecked} other straight-text lines inside the circle), ${notFitCount} NOT FIT renders verified blocked with all content present, ${Object.keys(baseline).length} square/rectangle renders byte-identical to main; no text ink outside any FIT circle; drawn text reached at most ${maxDrawnIntoMargin.toFixed(2)}mm into the 2mm hazard margin (pre-existing measure-vs-draw difference, see header)`);
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
