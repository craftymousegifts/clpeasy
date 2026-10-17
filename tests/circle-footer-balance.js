// Regression: circle-label footer balance and edge clearance (Oct 2026,
// Michaela's approved option P6b; circles only).
//
// Before: the address, phone and weight/burn/batch lines were each sized on
// their own (the details line, usually longest and in the lowest, narrowest
// row, came out far smaller), the phone was measured as regular weight but
// drawn semi-bold, and nothing kept the lines a minimum distance from the
// circular cut edge (a 63 mm candle's weight/burn line sat 0.07 mm from it).
//
// Real Chromium. For every circle label in the matrix that reports fits:true:
//   1. every footer line's ink is at least 1 mm (0.05 mm tolerance) inside the
//      circle clip, measured from a raster of that line alone (PNG path);
//   2. all footer lines share one font size, at or above the existing floor
//      (1.2 mm declared, or 3.2 units);
//   3. the phone is drawn in regular weight;
//   4. every footer line is present exactly (no text dropped or shortened);
//   5. the longest line sits in the top (widest) row.
// Also: the 52 mm preset with ordinary content (address + phone) still fits;
// the two labels that newly block under this rule (58 mm candles that
// previously exported with a footer line 0.08-0.29 mm from the edge) are
// blocked through the footer flag and get a size recommendation that fits
// with the same 1 mm clearance; and square labels keep their existing footer
// (phone semi-bold).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP circle-footer-balance: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP circle-footer-balance: no Chromium available'); process.exit(0); }

const RENDERER = fs.readFileSync(process.env.LABEL_RENDERER_PATH || path.join(__dirname, '..', 'label-render.js'), 'utf8');

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'], protocolTimeout: 0 });
  try {
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    await page.addScriptTag({ content: RENDERER });
    const out = await page.evaluate(async () => {
      const S = 6, W = 260 * S;
      const raster = async svgStr => {
        const img = new Image();
        const u = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
        img.src = u; await img.decode();
        const c = document.createElement('canvas'); c.width = W; c.height = W;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, W); URL.revokeObjectURL(u);
        return x.getImageData(0, 0, W, W).data;
      };
      const label = (shape, mm, type, extra) => Object.assign({
        shape, size: 'custom', customW: mm, customH: mm, scentName: 'Mint', productType: type,
        bizName: 'Crafty Mouse Gifts', bizAddress: '1 Test Lane, Exeter, EX1 2AB', bizPhone: '01632 960000',
        signal: 'Warning', hStatements: 'H317', pStatements: 'P102,P501', pictograms: ['exclamation'], sensitisers: [],
      }, extra);
      const detailsOf = d => [d.netWeight, d.burnTime ? 'Burn: ' + d.burnTime : '', d.batchNum ? 'Batch: ' + d.batchNum : ''].filter(Boolean).join(' · ');
      // Per-line footer facts for one rendered label.
      const footer = async (d, svgText) => {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const svg = doc.documentElement;
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        svg.setAttribute('width', W); svg.setAttribute('height', W);
        svg.querySelectorAll('[clip-path]').forEach(e => e.removeAttribute('clip-path'));
        [...svg.querySelectorAll('image,line,rect,circle,path,polygon,ellipse,use')].filter(e => !e.closest('defs') && !e.closest('clipPath')).forEach(e => e.setAttribute('visibility', 'hidden'));
        const texts = [...svg.querySelectorAll('text')];
        const R = (Math.min(vb[2], vb[3]) / 2 - 1.5) * S;
        const mmPerPx = d.customW / (260 * S);
        const lines = [];
        for (const [role, want] of [['address', d.bizAddress], ['phone', d.bizPhone], ['details', detailsOf(d)]]) {
          if (!want) continue;
          const el = texts.find(t => t.textContent.trim() === want);
          if (!el) { lines.push({ role, missing: true }); continue; }
          texts.forEach(t => t.setAttribute('visibility', 'hidden')); el.setAttribute('visibility', 'visible');
          const D = await raster(new XMLSerializer().serializeToString(svg));
          let clear = Infinity;
          for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
            if (D[(y * W + x) * 4 + 3] < 60) continue;
            const dd = R - Math.hypot(x + 0.5 - W / 2, y + 0.5 - W / 2);
            if (dd < clear) clear = dd;
          }
          const c = document.createElement('canvas').getContext('2d'); c.font = '400 100px sans-serif';
          lines.push({ role, text: want, fsMm: +el.getAttribute('font-size') * d.customW / 260, weight: el.getAttribute('font-weight'), y: +el.getAttribute('y'), clearMm: clear * mmPerPx, w: c.measureText(want).width });
        }
        return lines;
      };
      const VARIANTS = [{}, { netWeight: '180g' }, { netWeight: '180g', burnTime: '40 hours' }, { netWeight: '180g', burnTime: '40 hours', batchNum: 'B2310' }];
      const rows = [];
      for (const mm of [52, 58, 63, 70, 80, 90, 97, 105, 120]) for (const type of ['Scented Candle', 'Wax Melt']) for (const v of VARIANTS) {
        const d = label('circle', mm, type, v);
        const r = LabelRenderer.renderLabel(d, { instanceId: 'fb' + rows.length });
        const row = { mm, type, v: Object.keys(v).join('+') || 'address+phone', fits: r.fits, footerClipped: !!r.metrics.footerClipped };
        if (r.fits) row.lines = await footer(d, r.svg);
        rows.push(row);
      }
      // The 52 mm preset with ordinary content: the footer rule must not block
      // it. (Since 17 Oct 2026 a 52 mm candle is blocked only by the separate
      // care-icon edge rule; a 52 mm wax melt, without icons, must still fit.)
      const _p52 = LabelRenderer.renderLabel(label('circle', 52, 'Scented Candle', {}), { instanceId: 'p52' });
      const preset = !_p52.metrics.footerClipped && (_p52.fits || (_p52.warnings.length === 1 && _p52.warnings[0] === 'candle-safety-edge-clearance'))
        && LabelRenderer.renderLabel(label('circle', 52, 'Wax Melt', {}), { instanceId: 'p52w' }).fits;
      // The labels that newly block under the 1 mm rule, and the Builder's
      // own size recommendation for each.
      const blocked = [];
      for (const [mm, v] of [[58, { netWeight: '180g' }], [58, { netWeight: '180g', burnTime: '40 hours' }]]) {
        const d = label('circle', mm, 'Scented Candle', v);
        const r = LabelRenderer.renderLabel(d, { instanceId: 'bl' + blocked.length });
        const rec = LabelRenderer.findSmallestFittingSize(d, { instanceId: 'rec' + blocked.length });
        const b = { mm, v: Object.keys(v).join('+') || 'address+phone', fits: r.fits, footerClipped: !!r.metrics.footerClipped, rec };
        if (rec) {
          const d2 = Object.assign({}, d, { customW: rec.mmW, customH: rec.mmH });
          const r2 = LabelRenderer.renderLabel(d2, { instanceId: 'rf' + blocked.length });
          b.recFits = r2.fits;
          if (r2.fits) b.recLines = await footer(d2, r2.svg);
        }
        blocked.push(b);
      }
      // Squares keep their existing footer (scope guard).
      const sqD = label('square', 63, 'Scented Candle', { netWeight: '180g', burnTime: '40 hours' });
      const sq = LabelRenderer.renderLabel(sqD, { instanceId: 'sq' });
      const sqPhone = new DOMParser().parseFromString(sq.svg, 'image/svg+xml').querySelectorAll('text');
      const sqPhoneWeight = [...sqPhone].find(t => t.textContent.trim() === '01632 960000')?.getAttribute('font-weight');
      return { rows, blocked, sqPhoneWeight, preset };
    });

    const fitting = out.rows.filter(r => r.fits);
    assert(fitting.length >= 50, `expected most circle fixtures to fit, got ${fitting.length}`);
    const fail = [];
    for (const r of fitting) {
      const id = `${r.mm} mm ${r.type} ${r.v}`;
      const lines = r.lines;
      if (lines.some(l => l.missing)) { fail.push(`${id}: a footer line is missing or altered`); continue; }
      const sizes = [...new Set(lines.map(l => l.fsMm.toFixed(3)))];
      if (sizes.length !== 1) fail.push(`${id}: footer sizes differ (${sizes.join(', ')} mm)`);
      const floor = Math.max(1.2, 3.2 * r.mm / 260);
      if (lines.some(l => l.fsMm < floor - 1e-6)) fail.push(`${id}: footer below the ${floor.toFixed(2)} mm floor`);
      for (const l of lines) if (l.clearMm < 0.95) fail.push(`${id}: ${l.role} only ${l.clearMm.toFixed(2)} mm from the cut edge`);
      const phone = lines.find(l => l.role === 'phone');
      if (phone && phone.weight !== '400') fail.push(`${id}: phone drawn at weight ${phone.weight}`);
      const top = lines.slice().sort((a, b) => a.y - b.y)[0];
      const longest = lines.slice().sort((a, b) => b.w - a.w)[0];
      if (top.role !== longest.role) fail.push(`${id}: top row is ${top.role}, longest line is ${longest.role}`);
    }
    assert.strictEqual(fail.length, 0, 'circle footer rules broken:\n  ' + fail.join('\n  '));

    for (const b of out.blocked) {
      const id = `${b.mm} mm candle ${b.v}`;
      assert.strictEqual(b.fits, false, `${id}: expected to be blocked (footer cannot keep 1 mm clearance at this size)`);
      assert.strictEqual(b.footerClipped, true, `${id}: expected the footer block flag`);
      assert(b.rec && b.rec.mmW > b.mm, `${id}: expected a larger recommended size, got ${JSON.stringify(b.rec)}`);
      assert.strictEqual(b.recFits, true, `${id}: recommended ${b.rec.mmW} mm does not fit`);
      assert(b.recLines.every(l => !l.missing && l.clearMm >= 0.95), `${id}: recommended size does not keep 1 mm footer clearance`);
    }
    assert.strictEqual(out.preset, true, '52 mm circle with ordinary content (address + phone): footer must fit (candle blocked only by the care-icon edge rule; wax melt fits)');
    assert.strictEqual(out.sqPhoneWeight, '600', 'square labels must keep their existing footer (phone semi-bold)');

    console.log(`PASS: ${fitting.length} fitting circle labels keep every footer line >= 1 mm from the cut edge, at one shared size >= the floor, regular-weight phone, longest line on top, all text present; ` +
      '52 mm preset footer fits; ' + out.blocked.map(b => `${b.mm} mm ${b.v} blocked -> ${b.rec.mmW} mm`).join(', ') + '; squares unchanged');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
