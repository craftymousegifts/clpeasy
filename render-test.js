// Render harness for builder.html hazard-label auto-sizing tests.
const puppeteer = require('puppeteer');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'builder.html').replace(/\\/g, '/');

const CASES = [
  { name: 'circle',    shape: 'circle',    size: '63' },
  { name: 'square',    shape: 'square',    size: '63' },
  { name: 'rectangle', shape: 'rectangle', size: 'custom', customW: 63, customH: 44 },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 2 });
  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  for (const c of CASES) {
    const result = await page.evaluate((c) => {
      // Drive state directly, bypassing the multi-step form.
      S.shape = c.shape;
      S.size = c.size;
      if (c.customW) S.customW = c.customW;
      if (c.customH) S.customH = c.customH;
      S.scentName = 'Vanilla';
      S.productType = 'Scented Candle';
      S.netWeight = '200g';
      S.burnTime = '35hrs';
      S.batchNum = '';
      S.signal = 'Warning';
      S.hStatements = 'H317, H411, EUH208';
      S.pStatements = 'P102, P261, P273, P302+P352, P333+P313, P391, P501';
      S.sensitisers = ['Geraniol', 'Linalool'];
      S.pictograms = ['exclamation', 'aquatic'];
      S.bizName = 'Crafty Mouse Gifts';
      S.bizAddress = '12 Willow Lane, Bristol, BS1 4QR, United Kingdom';
      S.bizPhone = '01234 567890';
      S.bizWebsite = 'craftymousegifts.co.uk';
      S.isPro = true; // suppress watermark for clean inspection
      S.hideEN15494 = false;

      const svg = buildSVG(false);
      const warn = window._labelLegibilityWarn;
      return { svg, warn };
    }, c);

    // Put SVG on a clean white page and screenshot just the svg element.
    await page.setContent(
      `<!doctype html><html><head><style>body{margin:0;background:#888;display:flex;align-items:center;justify-content:center;height:100vh}svg{background:#fff}</style></head><body>${result.svg}</body></html>`,
      { waitUntil: 'domcontentloaded' }
    );
    await new Promise(r => setTimeout(r, 600));
    // scale up for visibility
    await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const scale = 5;
      svg.setAttribute('width', vb[2] * scale);
      svg.setAttribute('height', vb[3] * scale);
    });
    const el = await page.$('svg');
    const out = path.resolve(__dirname, `test-${c.name}.png`);
    await el.screenshot({ path: out });

    // Measure the vertical gap between the website URL (header) and the
    // product type ("SCENTED CANDLE") line beneath it.
    const svg = result.svg;
    const textBox = (frag) => {
      const i = svg.indexOf('>' + frag + '<');
      if (i < 0) return null;
      const tagStart = svg.lastIndexOf('<text', i);
      const tag = svg.slice(tagStart, i);
      const y = parseFloat((tag.match(/y="([\d.]+)"/) || [])[1]);
      const fs = parseFloat((tag.match(/font-size="([\d.]+)"/) || [])[1]);
      return { top: y - fs / 2, bottom: y + fs / 2, y, fs };
    };
    const web = textBox('craftymousegifts.co.uk');
    const type = textBox('SCENTED CANDLE');
    const gap = web && type ? (type.top - web.bottom).toFixed(1) : '?';
    console.log(`${c.name}: legibilityWarn=${result.warn}  urlBottom=${web?web.bottom.toFixed(1):'?'}  typeTop=${type?type.top.toFixed(1):'?'}  gap=${gap}px  -> ${out}`);
  }

  await browser.close();
})();
