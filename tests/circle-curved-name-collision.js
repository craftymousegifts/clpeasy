// Circle labels: the curved product name must never touch the business
// name, website, product type or signal word (Oct 2026, approved option A).
// Collisions are measured on real rendered pixels in Chromium: each label is
// rasterised twice (curved name only / the other header text only) and the
// smallest distance between the two ink layers is taken, in label units
// (the label canvas is 260 units wide). Covers: previously clear labels
// (unchanged), long names, descenders, website text, a DANGER reed
// diffuser, the blocked-export path with its suggested size, the 63x44mm
// rectangle reference case, and identical output at 1x and 3x pixel ratio.
// Run from the repo root: node tests/circle-curved-name-collision.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP circle-curved-name-collision: puppeteer not installed'); process.exit(0); }
const EXE = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!EXE) { console.log('SKIP circle-curved-name-collision: no Chromium'); process.exit(0); }

const BASE_LABEL = { shape: 'circle', size: 'custom', productType: 'Scented Candle', bizAddress: '1 Test Lane, EX1 2AB', bizPhone: '01632 960000',
  signal: 'Warning', hStatements: 'H317', pStatements: 'P102,P501', pictograms: ['exclamation'], sensitisers: [] };
const label = (mm, scentName, bizName, extra) => Object.assign({}, BASE_LABEL, { customW: mm, customH: mm, scentName, bizName }, extra || {});
const WEB = { bizWebsite: 'www.example-candles.test' };
const REED = { productType: 'Reed Diffuser', hStatements: 'H304,H317,H411', pictograms: ['health', 'exclamation', 'aquatic'], signal: 'Danger' };
const MIN_GAP = 1.0;   // label units; touching is <= 0.25

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'text/javascript' }); fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const failures = [];
  const check = (cond, msg) => { if (!cond) failures.push(msg); };
  try {
    const page = await browser.newPage();
    await page.setContent(`<body></body><script src="http://127.0.0.1:${server.address().port}/label-render.js"></script>`);
    await page.waitForFunction('window.LabelRenderer');
    // Render + measure the smallest ink gap between the curved name and the
    // named texts (all other elements hidden; clip paths kept).
    const measure = d => page.evaluate(async d => {
      const r = LabelRenderer.renderLabel(d, { instanceId: 'cc' + Math.random().toString(36).slice(2) });
      const S = 1040, doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml'), svg = doc.documentElement;
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      svg.setAttribute('width', S); svg.setAttribute('height', Math.round(S * vb[3] / vb[2]));
      const H = Math.round(S * vb[3] / vb[2]);
      [...svg.querySelectorAll('image,line,rect,circle,path,polygon')].filter(e => !e.closest('defs') && !e.closest('clipPath')).forEach(e => e.setAttribute('visibility', 'hidden'));
      const all = [...svg.querySelectorAll('text')]; all.forEach(t => t.setAttribute('visibility', 'hidden'));
      const arc = all.find(t => t.querySelector('textPath'));
      const want = new Set([d.bizName, d.bizWebsite || '\u0000', (d.productType || '').toUpperCase(), 'WARNING', 'DANGER']);
      const others = all.filter(t => t !== arc && !t.closest('.clp-fit-block') && want.has(t.textContent.trim()));
      const raster = async () => { const img = new Image(); const u = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })); img.src = u; await img.decode();
        const c = document.createElement('canvas'); c.width = S; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0, S, H); URL.revokeObjectURL(u); return x.getImageData(0, 0, S, H).data; };
      // A = the "upper" layer, B = the layer it must not touch
      let A, B;
      if (arc) { arc.setAttribute('visibility', 'visible'); A = await raster(); arc.setAttribute('visibility', 'hidden'); others.forEach(t => t.setAttribute('visibility', 'visible')); B = await raster(); }
      else { // rectangle: product type vs signal word
        const type = others.find(t => t.textContent.trim() === (d.productType || '').toUpperCase()), sig = others.find(t => /^(WARNING|DANGER)$/.test(t.textContent.trim()));
        type.setAttribute('visibility', 'visible'); A = await raster(); type.setAttribute('visibility', 'hidden'); sig.setAttribute('visibility', 'visible'); B = await raster(); }
      const rows = new Map(); for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) if (B[(y * S + x) * 4 + 3] > 40) { let a = rows.get(y); if (!a) rows.set(y, a = []); a.push(x); }
      let best = Infinity;
      for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) { if (A[(y * S + x) * 4 + 3] <= 40) continue;
        for (let dy = -96; dy <= 96; dy++) { if (Math.abs(dy) >= best) continue; const row = rows.get(y + dy); if (!row) continue; for (const bx of row) { const dd = Math.hypot(bx - x, dy); if (dd < best) best = dd; } } }
      const unit = vb[2] / S;
      const pxPerMm = vb[2] / d.customW, floor = Math.max(1.2 * pxPerMm, 3.2);
      return { fits: r.fits, warnings: r.warnings, blockReason: r.blockReason, adjusted: r.metrics.curvedNameAdjusted, fs: r.metrics.curvedNameFS, floor,
        gap: best === Infinity ? null : best * unit - 0.25 };
    }, d);

    // 1. Previously clear labels: unchanged layout, still clear.
    for (const mm of [52, 63, 97]) for (const name of ['Mint', 'Lavender']) {
      const m = await measure(label(mm, name, 'Crafty Mouse Gifts'));
      check(m.fits, `${name} ${mm}mm should fit`);
      check(m.adjusted === false, `${name} ${mm}mm was already clear and must not be adjusted`);
      check(m.gap > 0.25, `${name} ${mm}mm curved name touches the text below (gap ${m.gap})`);
    }
    // 2-4, 6. Long names, descenders, website, DANGER reed diffuser: adjusted, clear, never below the minimum.
    const adjustedCases = [];
    // 15 Oct integration QA: Fig & Cassis is NOT a clear baseline fixture
    // with Chromium 153's available Linux fonts. Independently rasterising
    // main 64bd3ee gives only 0.25 units of ink clearance at 52/63/97 mm
    // (Mint: 8.75; Lavender: 3.75). Both standalone #236 and the combined
    // candidate correctly adjust it. Exercise it as a near-collision case,
    // requiring >= MIN_GAP after adjustment instead of incorrectly pinning
    // it to an unsafe baseline layout. Renderer logic is unchanged.
    for (const mm of [52, 63, 97]) for (const name of ['Fig & Cassis', 'Black Pomegranate', 'Synthetic Test Candle', 'Lemongrass & Lime Candle', 'Winter Spice and Orange Blossom'])
      adjustedCases.push([label(mm, name, 'Fernhill QA Candles'), `${name} ${mm}mm`]);
    adjustedCases.push([label(63, 'Gingerbread Spice', 'Crafty Mouse Gifts'), 'descenders: Gingerbread Spice 63mm']);
    adjustedCases.push([label(63, 'Juniper Berry', 'Fernhill QA Candles and Home Fragrance'), 'descenders: Juniper Berry 63mm']);
    adjustedCases.push([label(97, 'Synthetic Test Candle', 'Fernhill QA Candles and Home Fragrance', WEB), 'website: Synthetic Test Candle 97mm']);
    adjustedCases.push([label(63, 'Black Pomegranate', 'Crafty Mouse Gifts', WEB), 'website: Black Pomegranate 63mm']);
    adjustedCases.push([label(63, 'Lemongrass & Lime Candle', 'Crafty Mouse Gifts', REED), 'DANGER reed diffuser 63mm']);
    for (const [d, what] of adjustedCases) {
      const m = await measure(d);
      if (!m.fits) { check(m.warnings.includes('scent-name-too-small'), `${what}: blocked, but not through the product-name flag (${m.warnings})`); continue; }
      check(m.gap !== null && m.gap >= MIN_GAP, `${what}: curved name too close to the text below (gap ${m.gap})`);
      check(m.fs >= m.floor - 1e-6, `${what}: curved name ${m.fs} below the renderer minimum ${m.floor}`);
    }
    // 5. Blocked export: cannot fit safely at 52mm with a website -> product-name flag; the suggested size fits and is clear.
    const blocked = label(52, 'Winter Spice and Orange Blossom', 'Crafty Mouse Gifts', WEB);
    const mb = await measure(blocked);
    check(mb.fits === false, '52mm Winter Spice and Orange Blossom + website must be blocked');
    check(mb.warnings.includes('scent-name-too-small') && mb.blockReason === 'content-does-not-fit', `blocked label should use the product-name flag (${mb.warnings}, ${mb.blockReason})`);
    const rec = await page.evaluate(d => LabelRenderer.findSmallestFittingSize(d, { instanceId: 'rec' }), blocked);
    check(rec && rec.mmW > 52, 'a larger suggested size must exist');
    if (rec) { const ms = await measure(label(rec.mmW, blocked.scentName, blocked.bizName, WEB)); check(ms.fits && ms.gap >= MIN_GAP, `suggested ${rec.mmW}mm should fit and be clear (gap ${ms.gap})`); }
    // 7. 63x44mm rectangle reference: not affected by the circle rule, heading and signal word clear.
    const rect = Object.assign({}, BASE_LABEL, { shape: 'rectangle', customW: 63, customH: 44, scentName: 'Vanilla', bizName: 'Crafty Mouse Gifts', bizAddress: 'Duns TD11', bizPhone: '01234 567890' });
    // (this candle content overflows its footer at 63x44 on main too, so only
    // the heading/signal-word spacing and the circle rule are asserted here)
    const mr = await measure(rect);
    check(mr.adjusted === false && mr.fs === null, '63x44mm rectangle must not use the curved-name rule');
    check(mr.gap > 0.25, `63x44mm: SCENTED CANDLE and WARNING touch (gap ${mr.gap})`);
    const mw = await measure(Object.assign({}, rect, { productType: 'Wax Melt', scentName: 'Lemon Zest' }));
    check(mw.fits && mw.adjusted === false && mw.gap > 0.25, `63x44mm wax melt reference should fit with WAX MELT/WARNING clear (fits ${mw.fits}, gap ${mw.gap})`);
    // 8. Device pixel ratio must not change the layout (customers' screens
    //    range from 1x to 3x; small-size canvas ink metrics are pixel-rounded).
    const renderAll = async dpr => {
      const pg = await browser.newPage();
      await pg.setViewport({ width: 800, height: 600, deviceScaleFactor: dpr });
      await pg.setContent(`<body></body><script src="http://127.0.0.1:${server.address().port}/label-render.js"></script>`);
      await pg.waitForFunction('window.LabelRenderer');
      const out = await pg.evaluate((names, base) => {
        const o = []; let n = 0;
        for (const mm of [52, 63, 97]) for (const s of names) for (const v of [{}, { bizWebsite: 'www.example-candles.test' }])
          o.push(LabelRenderer.renderLabel(Object.assign({}, base, { customW: mm, customH: mm, scentName: s, bizName: 'Crafty Mouse Gifts' }, v), { instanceId: 'dpr' + (n++) }).svg);
        return o;
      }, ['Fig & Cassis', 'Black Pomegranate', 'Gingerbread Spice', 'Winter Spice and Orange Blossom', 'Amber Woods'], BASE_LABEL);
      await pg.close(); return out;
    };
    const r1 = await renderAll(1), r3 = await renderAll(3);
    const differ = r1.filter((svg, i) => svg !== r3[i]).length;
    check(differ === 0, `${differ} of ${r1.length} circle labels render differently at 1x and 3x device pixel ratio`);
  } catch (e) {
    failures.push('error: ' + e.message);
  } finally {
    await browser.close(); server.close();
  }
  if (failures.length) { console.error('FAIL:\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('PASS: curved product name clear on circle labels (clear labels unchanged, long names/descenders/website/DANGER adjusted, blocked path, 63x44 reference)');
});
