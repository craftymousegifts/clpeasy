// Builder label audit harness -- renders synthetic labels through the REAL
// label-render.js in headless Chromium with real fonts, then measures the
// rendered SVG geometry. Audit-only: reads the app, never modifies it.
// Run from repo root:  node "Claude outputs/Builder Label Technical Audit/harness/run-audit.js"
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { CASES, GEOMS } = require('./fixtures');

const OUT = path.resolve(__dirname, '..');
const SHOTS = path.join(OUT, 'screenshots');
const HARNESS = 'file://' + path.join(__dirname, 'harness.html');

// Cases/geoms to screenshot (preview + export PNG)
const SHOOT = new Set([
  '01-short-simple|circle-52-default', '02-long-product-name|circle-63', '02-long-product-name|rect-80x100',
  '03-long-supplier-address|rect-80x100', '04-max-H|circle-63', '05-max-P|rect-80x100', '07-multi-sensitisers|circle-63',
  '08-long-sensitiser-names|circle-63', '11-three-plus-pictograms|circle-63', '11-three-plus-pictograms|rect-63x44',
  '12-heavy-combined|rect-80x100', '12-heavy-combined|circle-100', '13-special-chars|square-63', '14-missing-optional|circle-52-default',
  '15-long-candle|circle-63', '15-long-candle|rect-80x100', '16-long-wax-melt|circle-63', '17-long-diffuser|rect-80x100',
  '18-long-room-spray|square-63', '09-one-pictogram|rect-52x36-default', '09-one-pictogram|rect-150x40', '06-several-EUH|circle-63',
]);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto(HARNESS);
  await page.evaluate(() => document.fonts.ready);

  // Inject the analyser
  await page.addScriptTag({ content: `(${analyserSource.toString()})()` });

  const env = await page.evaluate(() => window.__envProbe());
  const results = [];
  for (const [caseId, content] of CASES) {
    for (const [geomId, geom] of GEOMS) {
      const data = Object.assign({}, content, geom);
      const res = await page.evaluate(([d, id]) => window.__analyse(d, id), [data, 'c' + (caseId + '_' + geomId).replace(/[^a-z0-9]/gi, '-')]);
      res.caseId = caseId; res.geomId = geomId;
      const key = caseId + '|' + geomId;
      if (SHOOT.has(key)) {
        const el = await page.$('#stage svg');
        const f = `${caseId}__${geomId}__preview.png`;
        await el.screenshot({ path: path.join(SHOTS, f) });
        res.previewShot = f;
        const png = await page.evaluate(([d, id]) => window.__exportPng(d, id), [data, 'exp-' + caseId]);
        const f2 = `${caseId}__${geomId}__export-png.png`;
        fs.writeFileSync(path.join(SHOTS, f2), Buffer.from(png.split(',')[1], 'base64'));
        res.exportShot = f2;
      }
      results.push(res);
      process.stdout.write('.');
    }
  }
  // Export-font fidelity experiment
  const fontExp = await page.evaluate(() => window.__fontExperiment());
  // Extra targeted probes
  const probes = await page.evaluate(() => window.__probes());
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ env, fontExp, probes, results }, null, 1));
  console.log('\nwrote', results.length, 'results');
  await browser.close();
}

// ─────────────────────────── in-page code ───────────────────────────
function analyserSource() {
  const LR = window.LabelRenderer;
  const cvs = document.createElement('canvas'); const ctx = cvs.getContext('2d');
  function rendererMeasure(t, px, bold, serif) { ctx.font = `${bold ? '700' : '400'} ${px}px ${serif ? 'serif' : 'sans-serif'}`; return ctx.measureText(t).width; }
  function xRatio(fam, w) { ctx.font = `${w} 1000px ${fam}`; const m = ctx.measureText('x'); return (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 1000; }

  window.__envProbe = () => {
    const probe = 'Contains: Linalool, Limonene, Hexyl Cinnamal. May produce an allergic reaction.';
    const w = f => { ctx.font = f; return ctx.measureText(probe).width; };
    return {
      ua: navigator.userAgent,
      dmSansLoaded400: document.fonts.check('400 12px "DM Sans"'),
      dmSansLoaded700: document.fonts.check('700 12px "DM Sans"'),
      widths: {
        'sans-serif 400': w('400 100px sans-serif'), '"DM Sans" 400': w('400 100px "DM Sans"'),
        'sans-serif 700': w('700 100px sans-serif'), '"DM Sans" 700': w('700 100px "DM Sans"'),
        'serif 700': w('700 100px serif'), 'Georgia 700': w('700 100px Georgia'), 'Georgia,serif 700': w('700 100px Georgia, serif'),
      },
      xHeightRatioDMSans400: xRatio('"DM Sans"', 400), xHeightRatioSans400: xRatio('sans-serif', 400),
    };
  };

  function shapeOf(data, pw, ph) {
    const cx = pw / 2, cy = ph / 2;
    if (data.shape === 'circle') { const r = Math.min(pw, ph) / 2 - 1.5; return { kind: 'circle', cx, cy, r, inside: (x, y) => Math.hypot(x - cx, y - cy) <= r, edgeDist: (x, y) => r - Math.hypot(x - cx, y - cy) }; }
    let x0, y0, w, h;
    if (data.shape === 'square') { const s = Math.min(pw, ph) - 4; x0 = cx - s / 2; y0 = cy - s / 2; w = s; h = s; } else { x0 = 2; y0 = 2; w = pw - 4; h = ph - 4; }
    return { kind: 'box', x0, y0, w, h, inside: (x, y) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h, edgeDist: (x, y) => Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y) };
  }
  const norm = s => String(s || '').replace(/\s+/g, '');

  window.__analyse = async (data, id) => {
    const r = LR.renderLabel(data, { instanceId: id });
    const stage = document.getElementById('stage');
    stage.innerHTML = r.svg;
    const svg = stage.querySelector('svg');
    await document.fonts.ready;
    const { mmW, mmH, pw, ph } = r.metrics.labelDims;
    const pxmm = pw / mmW;
    const shp = shapeOf(data, pw, ph);
    const lines = []; const issues = [];
    const texts = [...svg.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block'));
    let arc = null;
    texts.forEach((t, ti) => {
      const fsz = parseFloat(t.getAttribute('font-size'));
      const tp = t.querySelector('textPath');
      if (tp) {
        const p = svg.getElementById(tp.getAttribute('href').slice(1));
        const len = t.getComputedTextLength(), plen = p.getTotalLength();
        arc = { text: tp.textContent, fontMm: fsz / pxmm, textLen: +len.toFixed(1), pathLen: +plen.toFixed(1), overruns: len > plen, ratio: +(len / plen).toFixed(3) };
        if (len > plen) issues.push(`ARC-OVERRUN product name on arc: text ${len.toFixed(0)} > path ${plen.toFixed(0)} units (glyphs beyond path end are not drawn)`);
        return;
      }
      const n = t.getNumberOfChars(); if (!n) return;
      const content = t.textContent; const byLine = new Map();
      for (let i = 0; i < n; i++) {
        let e; try { e = t.getExtentOfChar(i); } catch (err) { continue; }
        const k = Math.round(e.y * 4);
        if (!byLine.has(k)) byLine.set(k, { x0: e.x, x1: e.x + e.width, y0: e.y, y1: e.y + e.height, chars: '' });
        const L = byLine.get(k); L.x0 = Math.min(L.x0, e.x); L.x1 = Math.max(L.x1, e.x + e.width); L.y0 = Math.min(L.y0, e.y); L.y1 = Math.max(L.y1, e.y + e.height); L.chars += content[i] || '';
      }
      const bold = +t.getAttribute('font-weight') >= 600; const serif = /Georgia/.test(t.getAttribute('font-family'));
      byLine.forEach(L => {
        const text = L.chars.trim(); if (!text) return;
        const actualW = L.x1 - L.x0; const assumedW = rendererMeasure(text, fsz, bold, serif);
        const corners = [[L.x0, L.y0], [L.x1, L.y0], [L.x0, L.y1], [L.x1, L.y1]];
        // Use the glyph ink band (middle 60% of line box) for the shape test so ascender/descender padding doesn't false-flag
        const my0 = L.y0 + (L.y1 - L.y0) * 0.2, my1 = L.y1 - (L.y1 - L.y0) * 0.2;
        const inkCorners = [[L.x0, my0], [L.x1, my0], [L.x0, my1], [L.x1, my1]];
        const outside = inkCorners.some(([x, y]) => !shp.inside(x, y));
        const minEdgeMm = Math.min(...inkCorners.map(([x, y]) => shp.edgeDist(x, y))) / pxmm;
        lines.push({ el: ti, text, fontMm: +(fsz / pxmm).toFixed(3), bold, serif, x0: L.x0, x1: L.x1, y0: L.y0, y1: L.y1, my0, my1, actualW: +actualW.toFixed(2), assumedW: +assumedW.toFixed(2), widthRatio: +(actualW / assumedW).toFixed(3), outside, minEdgeMm: +minEdgeMm.toFixed(2) });
      });
    });
    lines.forEach(l => { if (l.outside) issues.push(`OUTSIDE-SHAPE: "${l.text.slice(0, 40)}" (edge ${l.minEdgeMm}mm)`); });
    // images
    const imgs = [...svg.querySelectorAll('image, use')].filter(im => !im.closest('symbol')).map(im => {
      const x = +im.getAttribute('x'), y = +im.getAttribute('y'), w = +im.getAttribute('width'), h = +im.getAttribute('height');
      return { x, y, w, h };
    });
    const ghsSz = r.metrics.pictoOuterBoundingBoxMm * pxmm;
    const ghs = imgs.filter(i => Math.abs(i.w - Math.ceil(r.metrics.pictoOuterBoundingBoxMm * pxmm)) < 1.5);
    const bcf = imgs.filter(i => !ghs.includes(i));
    ghs.forEach((g, i) => {
      const tips = [[g.x + g.w / 2, g.y], [g.x + g.w, g.y + g.h / 2], [g.x + g.w / 2, g.y + g.h], [g.x, g.y + g.h / 2]];
      if (tips.some(([x, y]) => !shp.inside(x, y))) issues.push(`PICTO-OUTSIDE-SHAPE: GHS pictogram ${i + 1} diamond tip outside label`);
    });
    bcf.forEach((g, i) => { const c = [[g.x, g.y], [g.x + g.w, g.y], [g.x, g.y + g.h], [g.x + g.w, g.y + g.h]]; if (c.some(([x, y]) => !shp.inside(x, y))) issues.push(`BCF-ICON-OUTSIDE-SHAPE: candle icon ${i + 1} corner outside label`); });
    // overlaps (ink band of lines vs lines of other elements, vs images)
    const ov = (a, b, tol = 0.3) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.y0 < b.y1 - tol && b.y0 < a.y1 - tol;
    const inkBox = l => ({ x0: l.x0, x1: l.x1, y0: l.my0, y1: l.my1 });
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      if (ov(inkBox(lines[i]), inkBox(lines[j]))) issues.push(`TEXT-OVERLAP: "${lines[i].text.slice(0, 30)}" x "${lines[j].text.slice(0, 30)}"`);
    }
    const imgBox = g => ({ x0: g.x + g.w * 0.15, x1: g.x + g.w * 0.85, y0: g.y + g.h * 0.15, y1: g.y + g.h * 0.85 }); // diamond core
    lines.forEach(l => imgs.forEach((g, gi) => { if (ov(inkBox(l), imgBox(g))) issues.push(`TEXT-IMAGE-OVERLAP: "${l.text.slice(0, 30)}" x ${ghs.includes(g) ? 'GHS' : 'candle icon'}`); }));
    if (arc) {
      // arc text vs header lines: approximate arc band as top 12% of circle
    }
    // content presence
    const all = norm([...texts].map(t => t.textContent).join(' '));
    const expect = [];
    const d = LR.normalizeLabel(data);
    expect.push(['product name', d.scentName], ['business name', d.bizName]);
    if (d.productType) expect.push(['product type', d.productType.toUpperCase()]);
    if (d.bizAddress) expect.push(['address', d.bizAddress]);
    if (d.bizPhone) expect.push(['phone', d.bizPhone]);
    if (d.netWeight) expect.push(['net quantity', d.netWeight]);
    if (d.bizWebsite) expect.push(['website', d.bizWebsite]);
    if (d.batchNum) expect.push(['batch', d.batchNum]);
    if (d.burnTime) expect.push(['burn time', d.burnTime]);
    if (d.signal) expect.push(['signal', d.signal.toUpperCase()]);
    d.sensitisers.forEach(s => expect.push(['sensitiser', s]));
    const hs = d.hStatements.split(',').map(s => s.trim()).filter(Boolean);
    hs.filter(c => c !== 'EUH208').forEach(c => { const e = LR.H_LIB.find(x => x.code === c); if (e) expect.push([c, e.desc]); });
    if (hs.includes('EUH208')) expect.push(['EUH208', 'May produce an allergic reaction']);
    d.pStatements.split(',').map(s => s.trim()).filter(Boolean).forEach(c => { const e = LR.P_LIB.find(x => x.code === c); if (e && c !== 'P280') expect.push([c, e.desc]); });
    const allWithArc = all; // arc textContent included in texts
    const missing = expect.filter(([k, v]) => !allWithArc.includes(norm(v))).map(([k, v]) => k + ': ' + v);
    const blocked = !r.fits;
    if (missing.length && !blocked) issues.push('MISSING-CONTENT (not blocked): ' + missing.join(' | '));
    const minFont = lines.length ? Math.min(...lines.map(l => l.fontMm)) : null;
    const maxWidthRatio = lines.length ? Math.max(...lines.map(l => l.widthRatio)) : null;
    const sep = { fits: r.fits, blockReason: r.blockReason, warnings: [...r.warnings], pictoSquareSideMm: +r.metrics.pictoSquareSideMm.toFixed(2), pictoBBoxMm: +r.metrics.pictoOuterBoundingBoxMm.toFixed(2), bcfSizeMm: r.metrics.bcfSizeMm && +r.metrics.bcfSizeMm.toFixed(2), bcfTooSmall: r.metrics.bcfTooSmall, fontSizesMm: Object.fromEntries(Object.entries(r.metrics.fontSizes).map(([k, v]) => [k, v == null ? null : +(v / pxmm).toFixed(2)])), minFontMm: minFont, maxWidthRatio, arc, nGhs: ghs.length, nBcf: bcf.length, issues, missing, mm: [mmW, mmH], lineCount: lines.length, lines: lines.map(l => ({ t: l.text, f: l.fontMm, wr: l.widthRatio, e: l.minEdgeMm, b: l.bold, s: l.serif })) };
    return sep;
  };

  window.__exportPng = (data, id) => new Promise(res => {
    // Mirrors builder.html downloadPNG(): forExport render -> Blob -> <img> -> canvas (600dpi)
    const r = LR.renderLabel(data, { instanceId: id, forExport: true });
    const { mmW, mmH } = r.metrics.labelDims;
    const eW = Math.round(mmW / 25.4 * 300), eH = Math.round(mmH / 25.4 * 300); // 300dpi here to keep files small; same pipeline
    const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml').documentElement;
    doc.setAttribute('width', eW); doc.setAttribute('height', eH);
    const blob = new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml;charset=utf-8' });
    const u = URL.createObjectURL(blob); const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = eW; c.height = eH; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, eW, eH); x.drawImage(img, 0, 0, eW, eH); res(c.toDataURL('image/png')); };
    img.onerror = () => res('data:,');
    img.src = u;
  });

  window.__fontExperiment = () => new Promise(res => {
    // Same <style>@import</style> the renderer embeds; one long line of text.
    const txt = 'Contains: Linalool, Limonene, Hexyl Cinnamal, Benzyl Salicylate';
    const mk = (fam) => `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="200" viewBox="0 0 3000 200"><defs><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;900&amp;display=swap');</style></defs><rect width="3000" height="200" fill="#fff"/><text id="t" x="10" y="120" font-family="${fam}" font-size="60" font-weight="700" fill="#000">${txt}</text></svg>`;
    const out = {};
    const fams = ['DM Sans,sans-serif', 'Georgia,serif'];
    let pending = fams.length;
    fams.forEach(fam => {
      const holder = document.createElement('div'); holder.innerHTML = mk(fam); document.body.appendChild(holder);
      const inlineW = holder.querySelector('#t').getBBox().width; holder.remove();
      ctx.font = `700 60px ${fam.includes('Georgia') ? 'serif' : 'sans-serif'}`; const rendererAssumed = ctx.measureText(txt).width;
      const img = new Image(); const u = URL.createObjectURL(new Blob([mk(fam)], { type: 'image/svg+xml' }));
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 3000; c.height = 200; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, 3000, 200).data; let right = 0, left = 3000;
        for (let yy = 0; yy < 200; yy++) for (let xx = 0; xx < 3000; xx++) { const i = (yy * 3000 + xx) * 4; if (d[i] < 128 && d[i + 3] > 0) { if (xx > right) right = xx; if (xx < left) left = xx; } }
        out[fam] = { inlinePreviewWidth: +inlineW.toFixed(1), exportImgInkWidth: right - left, rendererAssumedWidth: +rendererAssumed.toFixed(1) };
        if (--pending === 0) res(out);
      };
      img.src = u;
    });
  });

  window.__probes = () => {
    const P = {};
    const baseD = { shape: 'circle', size: 'custom', customW: 63, customH: 63, scentName: 'Lavender', productType: 'Scented Candle', bizName: 'Crafty Test Studio', bizAddress: '12 Mill Lane, Testville', bizPhone: '01234 567890', signal: 'Warning', hStatements: 'H317', pStatements: 'P102, P501', sensitisers: ['Linalool'], pictograms: ['exclamation'] };
    const R = (o, opt) => LR.renderLabel(Object.assign({}, baseD, o), Object.assign({ instanceId: 'p' + Math.random().toString(36).slice(2) }, opt || {}));
    const txt = r => { const d = document.createElement('div'); d.innerHTML = r.svg; return [...d.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block')).map(t => t.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean); };
    // 1. Empty business name / address -> placeholder
    let r = R({ bizName: '', bizAddress: '', bizPhone: '' });
    P.emptyBusiness = { fits: r.fits, texts: txt(r) };
    // 2. EUH208 without sensitiser names
    r = R({ hStatements: 'EUH208', sensitisers: [], pictograms: [], signal: '' });
    P.euh208NoNames = { fits: r.fits, texts: txt(r) };
    // 3. H317 + EUH208 together
    r = R({ hStatements: 'H317, EUH208', sensitisers: ['Linalool', 'Citral'] });
    P.h317PlusEuh208 = { fits: r.fits, texts: txt(r) };
    // 4. duplicate codes
    r = R({ hStatements: 'H317, H317', pStatements: 'P102, P102' });
    P.duplicateCodes = { fits: r.fits, texts: txt(r) };
    // 5. P280 with and without items
    r = R({ pStatements: 'P280', p280Items: [] }); P.p280NoItems = { fits: r.fits, blockReason: r.blockReason, codes: r.unrecognizedCodesGeneric };
    r = R({ pStatements: 'P280', p280Items: ['gloves', 'eye'] }); P.p280Items = { fits: r.fits, texts: txt(r) };
    // 6. Unknown / unsupported codes
    r = R({ hStatements: 'H316, H999' }); P.unknownCodes = { fits: r.fits, blockReason: r.blockReason, unsupported: r.unsupportedCodes, generic: r.unrecognizedCodesGeneric };
    // 7. Separated P codes are auto-combined
    r = R({ pStatements: 'P403, P233' }); P.pAutoCombine = { texts: txt(r) };
    // 8. Pictogram precedence: skull + exclamation both rendered?
    r = R({ hStatements: 'H301, H317', pictograms: ['skull', 'exclamation'], signal: 'Danger' }); P.skullPlusExcl = { fits: r.fits, nImages: (r.svg.match(/<image /g) || []).length };
    // 9. Unknown pictogram key
    r = R({ pictograms: ['nonsense'] }); P.unknownPictoKey = { fits: r.fits, rendersAs: r.svg.includes('ghs-') ? 'pooled' : 'image', nImages: (r.svg.match(/<image /g) || []).length };
    // 10. Scent name wrap -> font collapse (rect/square only)
    const scentFont = (name, shape, mm) => { const rr = R({ scentName: name, shape, customW: mm, customH: mm }); return { fits: rr.fits, scentFontMm: +(rr.metrics.fontSizes.scent / (rr.metrics.labelDims.pw / rr.metrics.labelDims.mmW)).toFixed(2) }; };
    P.scentCollapse = {};
    ['Rose', 'Midnight Blackberry', 'Midnight Blackberry & Bay Leaf', 'Midnight Blackberry, Bay Leaf & Smoked Vanilla', 'Midnight Blackberry, Bay Leaf & Smoked Vanilla Winter Solstice Edition'].forEach(n => {
      P.scentCollapse[n] = { square63: scentFont(n, 'square', 63), square100: scentFont(n, 'square', 100), circle63: scentFont(n, 'circle', 63) };
    });
    // 11. Legacy saved label with preset size 35 (below custom minimum) -- renderer has no size floor for presets
    r = R({ size: 35, shape: 'circle' }); P.legacyPreset35 = { fits: r.fits, mm: [r.metrics.labelDims.mmW, r.metrics.labelDims.mmH], picto: +r.metrics.pictoSquareSideMm.toFixed(2) };
    // 12. BCF too-small reachability sweep (candle, rectangles/circles 40..60)
    P.bcfSweep = [];
    for (const [shape, w, h] of [['circle', 40, 40], ['circle', 45, 45], ['circle', 52, 52], ['square', 45, 45], ['rectangle', 150, 40], ['rectangle', 100, 40], ['rectangle', 60, 40], ['rectangle', 63, 44], ['rectangle', 52, 40]]) {
      const rr = R({ shape, size: 'custom', customW: w, customH: h, bizAddress: '', bizPhone: '01234 567890' });
      P.bcfSweep.push({ shape, w, h, fits: rr.fits, bcfTooSmall: rr.metrics.bcfTooSmall, bcfMm: rr.metrics.bcfSizeMm && +rr.metrics.bcfSizeMm.toFixed(2), warnings: [...rr.warnings] });
    }
    // 13. Candle 52x36 default rectangle: EN15494 icons silently absent?
    r = R({ shape: 'rectangle', size: 52 }); P.candleRect52x36 = { fits: r.fits, bcfSizeMm: r.metrics.bcfSizeMm, warnings: [...r.warnings] };
    // 14. Overrides ignored by Composer: compare builder-style (with override) vs composer-style (no override)
    const withOv = R({}, { hazardFSOverride: 12, scentFSOverride: 20 }); const noOv = R({});
    P.overrideDivergence = { builderHazardMm: +(withOv.metrics.fontSizes.hazard / (260 / 63)).toFixed(2), composerHazardMm: +(noOv.metrics.fontSizes.hazard / (260 / 63)).toFixed(2), sameSvg: withOv.svg.replace(/p[a-z0-9]+-/g, '') === noOv.svg.replace(/p[a-z0-9]+-/g, '') };
    // 15. Resolution invariance: same label, different outer pw
    const a = R({}, { pw: 200, ph: 200 }), b = R({}, { pw: 900, ph: 900 }), c = R({}, { forExport: true });
    const strip = s => s.replace(/width="\d+(\.\d+)?" height="\d+(\.\d+)?" viewBox/, 'viewBox').replace(/p[a-z0-9]+-/g, '');
    P.resolutionInvariance = { fitsAll: [a.fits, b.fits, c.fits], identicalInnerSvg: strip(a.svg) === strip(b.svg) && strip(b.svg) === strip(c.svg) };
    // 16. xe() escaping + apostrophe; attribute-context injection via bgColour
    r = R({ scentName: '"><script>alert(1)</script>', bizName: "O'Brien & <b>Co</b>", sensitisers: ['<img src=x onerror=alert(1)>'] }, { bgColour: '#fff" onload="alert(1)' });
    const parsed = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
    P.escaping = { parseError: !!parsed.querySelector('parsererror'), scriptEls: parsed.querySelectorAll('script').length, onloadAttr: /onload="alert/.test(r.svg), imgEls: parsed.querySelectorAll('img').length };
    r = R({ bizName: 'A\u0000B\u0008C' }); P.controlChars = { parseError: !!new DOMParser().parseFromString(r.svg, 'image/svg+xml').querySelector('parsererror') };
    r = R({ scentName: 'Line1\nLine2' }); P.newlineInName = { texts: txt(r).slice(0, 3) };
    // 17. multiline address in footer: newline handling
    r = R({ bizAddress: '12 Mill Lane\nTestville\nTE1 2ST' }); P.newlineAddress = { fits: r.fits, footer: txt(r).filter(t => /Mill|Testville/.test(t)) };
    // 18. website on circle 52 is not floored -- font size
    r = R({ shape: 'circle', size: 52, bizWebsite: 'www.a-very-long-website-address-for-testing.co.uk' }); P.websiteFont = { webMm: +(r.metrics.fontSizes.web / (260 / 52)).toFixed(2), fits: r.fits };
    return P;
  };
}

main().catch(e => { console.error(e); process.exit(1); });
