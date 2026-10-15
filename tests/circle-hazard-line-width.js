// Regression: on circle labels, hazard / sensitiser / precautionary lines must
// never run past the circle edge on a label that reports fits:true.
//
// Defect (main 64bd3ee, Oct 2026): each statement block was wrapped once at the
// circle's width at the block's FIRST line, so its later, lower lines could be
// wider than the circle allows there. They were cut off by the label clip in
// PNG, SVG and PDF exports while the Builder allowed the download (e.g. a 90 mm
// wax melt with H317/H412, EUH208 and five P statements lost the "D" of
// "Dispose" and the final full stop). Each line is now wrapped to the circle's
// width at its own height, and any line still too wide blocks the label.
//
// Real Chromium. For every circle label in the matrix that reports fits:true:
//   1. PNG path: the SVG is rasterised as an image (exactly as the PNG export
//      does) with the circle clip removed; no text ink may lie outside the clip
//      circle (antialiasing allowance 0.25 label units).
//   2. Text preserved: the label's words, in order, equal the same label drawn
//      as a square of the same size (wrapping may move line breaks, never drop
//      or change a word).
//   3. Minimum sizes unchanged: hazard text is never below the existing GB
//      floor (1.2 mm declared, or 3.2 units, whichever is larger).
// The manual hazard-size override is also exercised at its maximum.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP circle-hazard-line-width: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP circle-hazard-line-width: no Chromium available'); process.exit(0); }

const RENDERER = fs.readFileSync(process.env.LABEL_RENDERER_PATH || path.join(__dirname, '..', 'label-render.js'), 'utf8');

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'], protocolTimeout: 0 });
  try {
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    await page.addScriptTag({ content: RENDERER });
    const results = await page.evaluate(async () => {
      const SIZES = [52, 63, 70, 76, 80, 90, 97, 105, 120, 150];
      const SETS = {
        light: { hStatements: 'H317', pStatements: 'P102,P501', sensitisers: [], pictograms: ['exclamation'] },
        medium: { hStatements: 'H317,H412', pStatements: 'P102,P261,P273,P302+P352,P501', sensitisers: ['Linalool', 'Citral'], pictograms: ['exclamation'] },
        pOnly: { hStatements: 'H317', pStatements: 'P102,P261,P272,P280,P302+P352,P333+P313,P362+P364,P501', sensitisers: [], pictograms: ['exclamation'], p280Items: ['gloves'] },
        sensOnly: { hStatements: 'H412', pStatements: 'P273,P501', sensitisers: ['Linalool', 'Limonene', 'Citral', 'Geraniol', 'Citronellol', 'Eugenol', 'Hydroxycitronellal'], pictograms: [] },
      };
      const TYPES = ['Scented Candle', 'Wax Melt'];
      const S = 4, W = 260 * S;
      const raster = async svgStr => {
        const img = new Image();
        const u = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
        img.src = u; await img.decode();
        const c = document.createElement('canvas'); c.width = W; c.height = W;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, W); URL.revokeObjectURL(u);
        return x.getImageData(0, 0, W, W).data;
      };
      // Text ink outside the clip circle, with the clip removed (curved name,
      // fit-block overlay and rotated watermark excluded: they are not
      // statement text and are positioned by other rules).
      const inkOutside = async (svgText) => {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const svg = doc.documentElement;
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        svg.setAttribute('width', W); svg.setAttribute('height', W);
        svg.querySelectorAll('[clip-path]').forEach(e => e.removeAttribute('clip-path'));
        [...svg.querySelectorAll('image,line,rect,circle,path,polygon,ellipse')].filter(e => !e.closest('defs') && !e.closest('clipPath')).forEach(e => e.setAttribute('visibility', 'hidden'));
        [...svg.querySelectorAll('text')].forEach(t => { if (t.closest('.clp-fit-block') || t.closest('[transform]') || t.querySelector('textPath')) t.setAttribute('visibility', 'hidden'); });
        const D = await raster(new XMLSerializer().serializeToString(svg));
        const R = (Math.min(vb[2], vb[3]) / 2 - 1.5) * S * 260 / vb[2];
        let n = 0, worst = 0;
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          if (D[(y * W + x) * 4 + 3] < 60) continue;
          const d = Math.hypot(x + 0.5 - W / 2, y + 0.5 - W / 2) - R;
          if (d > 0.25 * S) { n++; worst = Math.max(worst, d / S); }
        }
        return { n, worstUnits: +worst.toFixed(2) };
      };
      // Each drawn line (a <text>'s own text and each of its <tspan>s) is a
      // separate run of words; textContent alone would join two lines with no
      // space between them.
      const words = svgText => {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        return [...doc.querySelectorAll('text')].filter(t => !t.closest('.clp-fit-block') && !t.closest('[transform]'))
          .map(t => [...t.childNodes].map(n => n.textContent).join(' ')).join(' ').split(/\s+/).filter(Boolean).join(' ');
      };
      const out = [];
      for (const mm of SIZES) for (const [set, content] of Object.entries(SETS)) for (const productType of TYPES) {
        const base = Object.assign({ size: 'custom', customW: mm, customH: mm, scentName: 'Mint', productType, bizName: 'Crafty Mouse Gifts', bizAddress: '1 Test Lane, EX1 2AB', bizPhone: '01632 960000', signal: 'Warning', textColour: 'dark', showBorder: true }, content);
        for (const variant of ['auto', 'manual-max']) {
          let opts = { instanceId: 'hl' + out.length };
          let r = LabelRenderer.renderLabel(Object.assign({ shape: 'circle' }, base), opts);
          if (variant === 'manual-max') {
            if (!r.fits) continue;
            opts = { instanceId: 'hm' + out.length, hazardFSOverride: r.metrics.fsBounds.hazard.max };
            r = LabelRenderer.renderLabel(Object.assign({ shape: 'circle' }, base), opts);
          }
          const row = { mm, set, productType, variant, fits: r.fits };
          if (r.fits) {
            row.ink = await inkOutside(r.svg);
            const sq = LabelRenderer.renderLabel(Object.assign({ shape: 'square' }, base), { instanceId: 'sq' + out.length });
            row.wordsMatch = words(r.svg) === words(sq.svg);
            row.hazardMm = r.metrics.fontSizes.hazard * mm / 260;
            row.hazardFloorMm = Math.max(1.2, 3.2 * mm / 260);
          }
          out.push(row);
        }
      }
      return out;
    });

    const fitting = results.filter(r => r.fits);
    assert(fitting.length >= 40, `expected a substantial set of fitting circle labels, got ${fitting.length}`);
    const clipped = fitting.filter(r => r.ink.n > 0);
    assert.strictEqual(clipped.length, 0, 'statement text crosses the circle edge on labels that report fits:true:\n' +
      clipped.map(r => `  ${r.mm} mm ${r.set} ${r.productType} (${r.variant}): ${r.ink.n} px, up to ${r.ink.worstUnits} units`).join('\n'));
    const lost = fitting.filter(r => !r.wordsMatch);
    assert.strictEqual(lost.length, 0, 'circle label text differs from the same content on a square (a word was dropped or changed):\n' +
      lost.map(r => `  ${r.mm} mm ${r.set} ${r.productType} (${r.variant})`).join('\n'));
    const small = fitting.filter(r => r.hazardMm < r.hazardFloorMm - 1e-6);
    assert.strictEqual(small.length, 0, 'hazard text below the existing minimum size:\n' +
      small.map(r => `  ${r.mm} mm ${r.set} ${r.productType}: ${r.hazardMm.toFixed(3)} mm`).join('\n'));

    // The labels reproduced through the real Builder on main (Smart Paste,
    // signed out) must now either fit with every letter inside the circle, or
    // be blocked -- never exported clipped.
    for (const [mm, set, productType] of [[90, 'medium', 'Wax Melt'], [120, 'medium', 'Scented Candle'], [150, 'light', 'Wax Melt'], [97, 'medium', 'Scented Candle']]) {
      const r = results.find(x => x.mm === mm && x.set === set && x.productType === productType && x.variant === 'auto');
      assert(r, `fixture ${mm} mm ${set} ${productType} missing`);
      assert(!r.fits || r.ink.n === 0, `fixture ${mm} mm ${set} ${productType} still clipped`);
    }
    console.log(`PASS: ${fitting.length} fitting circle labels (auto and manual-max hazard size) keep every statement letter inside the circle, keep all words, and keep the hazard-text minimum`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
