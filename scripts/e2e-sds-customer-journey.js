'use strict';
// QA ONLY — 100 genuine 10%-in-candle-wax supplier SDS customer-journey E2E.
//
// Drives the real builder.html in Chromium the way a customer does: chooses a
// rectangle label size in Step 1, enters product details in Step 2, PASTES the
// supplier's exact Section 2.2 text into Smart Paste (CDP Input.insertText, the
// same path as a clipboard paste) and presses "Extract hazard data", confirms
// the hazard review, enters business details, opens the real Step 5 preview,
// ticks the confirmation and presses the real PNG / SVG / PDF buttons.
//
// Nothing here changes the product. The only stand-in is the Supabase client:
// an OFFLINE fixture representing a signed-in Pay As You Go customer with
// purchased downloads, so the real export code runs without contacting the
// production database, Stripe or any customer account. No production request
// is made: every non-local request is answered 204 locally.
//
//   node scripts/e2e-sds-customer-journey.js <corpusDir> <outDir> [ids...]
//   env SIZES="63x44,76x51" (if the last size is blocked, the builder's own
//   recommended "Use W×Hmm" button is pressed and that size is exported too)
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const [CORPUS, OUT] = [path.resolve(process.argv[2] || 'qa-artifacts/sds-corpus'), path.resolve(process.argv[3] || 'qa-artifacts/sds-e2e')];
const ONLY = process.argv.slice(4);
const SIZES = (process.env.SIZES || '63x44,76x51').split(',').map(s => s.trim()).filter(Boolean);
const EXE = process.env.PUPPETEER_EXECUTABLE_PATH || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p));

// Realistic, clearly-fictional business fixture (outside Section 2.2; the
// supplier's SDS does not supply the candle maker's own details).
const BIZ = { name: 'Fernhill QA Candles', address: '1 Test Lane, Exampleton, EX1 2AB', phone: '01632 960000' };

const FIXTURE = `window.__rpc=[];window.supabase={createClient:function(){
 var row={id:'qa-fixture',email:'qa-fixture@example.test',plan:'payg',subscription_status:'payg',trial_end:new Date(Date.now()-2*864e5).toISOString(),downloads_used:0,downloads_limit:0,topup_credits:500,billing_cycle:'monthly',created_at:new Date(Date.now()-40*864e5).toISOString()};
 var q={select:function(){return this},eq:function(){return this},neq:function(){return this},order:function(){return this},limit:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
 return {auth:{getSession:async function(){return {data:{session:{access_token:'offline',user:{id:'qa-fixture',email:row.email,created_at:row.created_at,user_metadata:{}}}}}},getUser:async function(){return {data:{user:{id:'qa-fixture'}}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},
  rpc:async function(n,a){window.__rpc.push([n,a]);if(n!=='consume_download')return {data:null,error:null};row.topup_credits--;return {data:{ok:true,consumed:true,free_redownload:false,source:'purchased',clean_export:true,purchased_downloads:row.topup_credits,downloads_used:0,downloads_limit:0},error:null};},
  functions:{invoke:async function(){return {data:null,error:null}}}};}};`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      let f; try { f = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { r.writeHead(400); return r.end(); }
      if (f === '/') f = '/builder.html';
      const p = path.resolve(ROOT, '.' + f);
      if (!p.startsWith(ROOT + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' })[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

async function newCasePage(browser, base, dlDir) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  const log = { dialogs: [], console: [], external: [], popups: [] };
  page.on('dialog', d => { log.dialogs.push(d.message()); d.accept().catch(() => {}); });
  page.on('console', m => { if (m.type() === 'error') log.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => log.console.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('response', r => { if (r.status() >= 400) log.console.push('HTTP ' + r.status() + ' ' + r.url().split('?')[0]); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: FIXTURE });
    if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    // Web fonts are public and are what a real customer's browser loads for
    // the label typeface; allow them so the preview/export fidelity is real.
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return r.continue();
    log.external.push(u.split('?')[0]);
    return r.respond({ status: 204, body: '' });
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true, browserContextId: ctx.id });
  const downloads = [];
  cdp.on('Browser.downloadWillBegin', e => downloads.push({ guid: e.guid, name: e.suggestedFilename, state: 'started' }));
  cdp.on('Browser.downloadProgress', e => { const d = downloads.find(x => x.guid === e.guid); if (d) d.state = e.state; });
  ctx.on('targetcreated', async t => { if (t.type() === 'page') log.popups.push(t); });
  await page.goto(base + '/builder.html', { waitUntil: 'load', timeout: 60000 });
  // Wait for the real guest/customer library initialisation (handover step 2).
  for (let i = 0; i < 80; i++) {
    const ready = await page.evaluate(() => { try { return !!(window.LabelLibrary && LabelLibrary.getSaved && (LabelLibrary.getSaved(), true)); } catch (e) { return false; } });
    if (ready) break; await sleep(250);
  }
  return { ctx, page, log, downloads, cdp };
}

const panel = page => page.evaluate(() => 'step-' + (typeof approvedBuilderStep !== 'undefined' ? approvedBuilderStep : (S && S.step)));
async function clickNext(page) {
  // The approved builder layout renders its own visible step buttons; press
  // whichever visible forward button the customer sees (Next… / Preview & download).
  const handles = await page.$$('button');
  for (const h of handles) {
    const ok = await h.evaluate(b => { const t = b.textContent.trim(); if (!/^(Next\b|Preview\s*&|Preview and)/.test(t)) return false; if (!b.checkVisibility({ checkVisibilityCSS: true })) return false; b.scrollIntoView({ block: 'center' }); return true; });
    if (ok) { await sleep(150); const t = await h.evaluate(b => b.textContent.trim()); await h.click(); await sleep(700); return t; }
  }
  throw Error('no visible forward button');
}

async function snapshotHazards(page) {
  return page.evaluate(() => {
    const vis = el => !!(el && el.checkVisibility && el.checkVisibility({ checkVisibilityCSS: true }));
    const txt = id => { const e = document.getElementById(id); return e ? (e.value !== undefined && e.tagName !== 'DIV' ? e.value : e.textContent).trim() : null; };
    const pics = [...document.querySelectorAll('#step-3 .picto-card.selected, #step-3 [data-picto].selected, #step-3 .ghs-card.selected')].map(e => e.dataset.picto || e.dataset.key || e.title || e.textContent.trim());
    const notices = [...document.querySelectorAll('#step-3 .field-alert, #step-3 [role=alert], #step-3 [role=status]')].filter(vis).map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return {
      h_field: txt('h-statements'), p_field: txt('p-statements'),
      signal: document.getElementById('signal-danger')?.classList.contains('sel-danger') ? 'Danger' : document.getElementById('signal-warning')?.classList.contains('sel-warn') ? 'Warning' : '',
      h_codes: [...(S.hSelected || [])], p_codes: [...(S.pSelected || [])], sensitisers: [...(S.sensitisers || [])],
      pictograms_state: Array.isArray(S.pictograms) ? [...S.pictograms] : (S.pictograms ? [S.pictograms] : []), pictograms_ui: pics,
      allergen_tags: (document.getElementById('allergen-tags')?.textContent || '').replace(/\s+/g, ' ').trim(),
      visible_notices: notices,
      next_enabled: (() => { const b = document.getElementById('btn-next-step3'); return !!b && vis(b) && getComputedStyle(b).pointerEvents !== 'none'; })(),
      blocked_cta: vis(document.getElementById('hazard-blocked-cta')) ? document.getElementById('hazard-blocked-cta').textContent.replace(/\s+/g, ' ').trim() : '',
    };
  });
}

async function previewState(page) {
  return page.evaluate(() => {
    const vis = el => !!(el && el.checkVisibility && el.checkVisibility({ checkVisibilityCSS: true }));
    const warn = ['label-warn-step5', 'label-warn-stage4', 'business-details-export-note', 'sds-doc-export-note', 'custom-size-warn', 'en15494-warn']
      .map(id => { const e = document.getElementById(id); return e && vis(e) ? { id, text: e.textContent.replace(/\s+/g, ' ').trim() } : null; }).filter(Boolean);
    const btn = id => { const b = document.getElementById(id); if (!b) return null; const cs = getComputedStyle(b); return { visible: vis(b), enabled: cs.pointerEvents !== 'none' && Number(cs.opacity) > 0.5 && !b.disabled }; };
    const c = document.getElementById('label-svg-container');
    return {
      warnings: warn,
      download_allowed: typeof _downloadAllowed === 'function' ? _downloadAllowed() : null,
      blocked_message: typeof _downloadAllowed === 'function' && !_downloadAllowed() ? _downloadBlockedMessage() : '',
      label_block_download: !!window._labelBlockDownload, block_reason: window._blockReason || null, content_overflow: window._contentOverflow || null,
      legibility_warn: window._labelLegibilityWarn || null, footer_clipped: !!window._footerLegibilityClipped,
      too_small: { scent: !!window._scentTooSmall, business: !!window._businessNameTooSmall, type: !!window._productTypeTooSmall, signal: !!window._signalWordTooSmall },
      buttons: { png: btn('btn-png-preview'), pdf: btn('btn-pdf-preview'), svg: btn('btn-svg-preview') },
      preview_markup_kind: c ? (c.querySelector('image') && !c.querySelector('text') ? 'raster' : 'vector') : 'none',
      dims: typeof getDims === 'function' ? getDims() : null,
    };
  });
}

async function exportFormats(page, sess, sizeDir, tag) {
  const out = {};
  const dlDir = path.join(sizeDir, 'downloads');
  const before = new Set(fs.readdirSync(dlDir));
  for (const [fmt, id] of [['png', 'btn-png-preview'], ['svg', 'btn-svg-preview'], ['pdf', 'btn-pdf-preview']]) {
    const dialogsBefore = sess.log.dialogs.length, popupsBefore = sess.log.popups.length, rpcBefore = await page.evaluate(() => window.__rpc.length);
    const clickable = await page.evaluate(id => { const b = document.getElementById(id); if (!b) return false; b.scrollIntoView({ block: 'center' }); const cs = getComputedStyle(b); return cs.pointerEvents !== 'none'; }, id);
    if (clickable) await page.click('#' + id); else await page.evaluate(id => document.getElementById(id).click(), id); // forced click proves the click-time guard too
    let file = null;
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      if (fmt === 'pdf' && sess.log.popups.length > popupsBefore) break;
      const now = fs.readdirSync(dlDir).filter(f => !before.has(f) && !f.endsWith('.crdownload'));
      if (now.length) { file = now[0]; break; }
      if (sess.log.dialogs.length > dialogsBefore) break;
    }
    const dialog = sess.log.dialogs.slice(dialogsBefore).join(' | ');
    const rpcCalls = (await page.evaluate(() => window.__rpc.length)) - rpcBefore;
    if (fmt === 'pdf' && sess.log.popups.length > popupsBefore) {
      const target = sess.log.popups[sess.log.popups.length - 1];
      const pp = await target.page();
      await pp.waitForFunction(() => document.readyState === 'complete' && document.querySelector('svg'), { timeout: 20000 }).catch(() => {});
      await sleep(500);
      const pdfPath = path.join(sizeDir, `export-${tag}.pdf`);
      await pp.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
      await pp.close().catch(() => {});
      out.pdf = { status: 'exported', file: path.basename(pdfPath), via: 'print view → Chromium Save as PDF', rpc_calls: rpcCalls, clickable, dialog };
      before.add(path.basename(pdfPath));
      continue;
    }
    if (file) {
      const dest = path.join(sizeDir, `export-${tag}.${fmt}`);
      fs.renameSync(path.join(dlDir, file), dest); before.add(file);
      out[fmt] = { status: 'exported', file: path.basename(dest), original_name: file, rpc_calls: rpcCalls, clickable, dialog };
    } else out[fmt] = { status: dialog ? 'blocked' : 'no-file', clickable, dialog, rpc_calls: rpcCalls };
  }
  return out;
}

async function runSize(browser, base, doc, text, caseDir, size) {
  const [W, H] = size.split('x').map(Number);
  const sizeDir = path.join(caseDir, size); fs.mkdirSync(path.join(sizeDir, 'downloads'), { recursive: true });
  const sess = await newCasePage(browser, base, path.join(sizeDir, 'downloads'));
  const { page } = sess; const r = { size, steps: [] };
  try {
    // Step 1 — rectangle, W × H mm
    await page.click('.shape-card[data-shape="rectangle"]');
    for (const [id, v] of [['custom-w', W], ['custom-h', H]]) {
      await page.$eval('#' + id, e => { e.focus(); e.select && e.select(); });
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('#' + id, String(v));
    }
    await sleep(400);
    r.step1 = await previewState(page);
    await page.screenshot({ path: path.join(sizeDir, 'step1-size.png') });
    await clickNext(page); r.steps.push(await panel(page));
    // Step 2 — product
    await page.type('#scent-name', doc.product_name);
    await page.select('#product-type', 'Scented Candle');
    await page.type('#frag-load', '10%');
    await clickNext(page); r.steps.push(await panel(page));
    // Step 3 — Smart Paste: paste exact supplier text, press the button
    await page.evaluate(() => document.getElementById('smart-paste-input').scrollIntoView({ block: 'center' }));
    await page.click('#smart-paste-input');
    await page.keyboard.sendCharacter(text);
    r.pasted_equals_source = (await page.$eval('#smart-paste-input', e => e.value)) === text;
    await page.screenshot({ path: path.join(sizeDir, 'smart-paste-input.png') });
    await page.click('.btn-extract');
    await sleep(800);
    r.extraction = await snapshotHazards(page);
    await page.screenshot({ path: path.join(sizeDir, 'builder-after-extraction.png'), fullPage: true });
    const confirmVisible = await page.evaluate(() => { const c = document.getElementById('hazard-confirm'); return !!(c && c.checkVisibility({ checkVisibilityCSS: true })); });
    if (confirmVisible) { await page.evaluate(() => document.getElementById('hazard-confirm').scrollIntoView({ block: 'center' })); await page.click('#hazard-confirm'); await sleep(300); }
    r.after_confirm = await snapshotHazards(page);
    r.hazard_confirm_visible = confirmVisible;
    try { r.step3_button = await clickNext(page); } catch (e) { r.step3_button = String(e.message); }
    r.steps.push(await panel(page));
    if ((await panel(page)) !== 'step-4') { r.stopped_at = 'step-3'; await page.screenshot({ path: path.join(sizeDir, 'step3-blocked.png'), fullPage: true }); return r; }
    // Step 4 — business
    await page.type('#biz-name', BIZ.name); await page.type('#biz-address', BIZ.address); await page.type('#biz-phone', BIZ.phone);
    await clickNext(page); r.steps.push(await panel(page));
    if ((await panel(page)) !== 'step-5') { r.stopped_at = 'step-4'; r.dialogs = sess.log.dialogs; return r; }
    // Step 5 — preview before confirming, then confirm
    await sleep(1200);
    r.preview_before_confirm = await previewState(page);
    await page.evaluate(() => { const c = document.getElementById('verify-checkbox'); c.scrollIntoView({ block: 'center' }); });
    await page.click('#verify-checkbox'); await sleep(800);
    r.preview = await previewState(page);
    const cont = await page.$('#label-svg-container');
    await page.evaluate(() => document.getElementById('label-svg-container').scrollIntoView({ block: 'center' }));
    await sleep(300);
    await cont.screenshot({ path: path.join(sizeDir, `preview-${size}.png`) });
    await page.screenshot({ path: path.join(sizeDir, `step5-${size}.png`) });
    if (r.preview.warnings.length || !r.preview.download_allowed) await page.screenshot({ path: path.join(sizeDir, `warning-${size}.png`), fullPage: true });
    fs.writeFileSync(path.join(sizeDir, `preview-${size}.svg`), await page.evaluate(() => buildSVG(true)));
    r.verify_checked = await page.$eval('#verify-checkbox', e => e.checked);
    r.exports = await exportFormats(page, sess, sizeDir, size);
    // If this size is blocked, follow the builder's own recommendation the way
    // a customer would: press its "Use W×Hmm" button, then re-check and export.
    if (!r.preview.download_allowed && size === SIZES[SIZES.length - 1]) {
      const rec = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Use\s*\d+\s*[×x]\s*\d+\s*mm$/.test(x.textContent.trim()) && x.checkVisibility({ checkVisibilityCSS: true })); if (!b) return null; b.scrollIntoView({ block: 'center' }); b.setAttribute('data-qa-rec', '1'); return b.textContent.trim(); });
      if (rec) {
        const m = rec.match(/(\d+)\s*[×x]\s*(\d+)/); const tag = m[1] + 'x' + m[2];
        await page.click('[data-qa-rec="1"]'); await sleep(1500);
        const vc = await page.$eval('#verify-checkbox', e => e.checked);
        if (!vc) { await page.evaluate(() => document.getElementById('verify-checkbox').scrollIntoView({ block: 'center' })); await page.click('#verify-checkbox'); await sleep(800); }
        r.recommended = { button: rec, size: tag, preview: await previewState(page) };
        await page.evaluate(() => document.getElementById('label-svg-container').scrollIntoView({ block: 'center' })); await sleep(300);
        await (await page.$('#label-svg-container')).screenshot({ path: path.join(sizeDir, `preview-recommended-${tag}.png`) });
        await page.screenshot({ path: path.join(sizeDir, `step5-recommended-${tag}.png`) });
        fs.writeFileSync(path.join(sizeDir, `preview-recommended-${tag}.svg`), await page.evaluate(() => buildSVG(true)));
        r.recommended.exports = await exportFormats(page, sess, sizeDir, 'recommended-' + tag);
      }
    }
    // Reset: Start a new label path a customer would use -> clear hazards, verify state is empty
    r.reset = await page.evaluate(() => { if (typeof clearHazardData === 'function') clearHazardData(); return { input: !!document.getElementById('smart-paste-input').value.trim(), h: (S.hSelected || []).length, p: (S.pSelected || []).length, sens: (S.sensitisers || []).length }; });
  } catch (e) {
    r.error = String(e && e.stack || e).slice(0, 600);
    try { await page.screenshot({ path: path.join(sizeDir, 'error.png'), fullPage: true }); } catch {}
  } finally {
    r.dialogs = sess.log.dialogs; r.console_errors = sess.log.console.slice(0, 20); r.external_requests_blocked = [...new Set(sess.log.external)];
    r.rpc = await sess.page.evaluate(() => window.__rpc).catch(() => null);
    r.downloads_seen = sess.downloads;
    await sess.ctx.close().catch(() => {});
  }
  return r;
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8'));
  const server = await serve(); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
  try {
    for (const doc of manifest.documents) {
      if (ONLY.length && !ONLY.includes(doc.id)) continue;
      const caseDir = path.join(OUT, doc.id); fs.mkdirSync(caseDir, { recursive: true });
      const pdf = fs.readFileSync(path.join(CORPUS, doc.pdf_file)); const text = fs.readFileSync(path.join(CORPUS, doc.section_2_2_text_file), 'utf8');
      const input = { id: doc.id, supplier: doc.supplier, name: doc.name, url: doc.url, pdf_sha256: sha(pdf), manifest_sha256: doc.sha256, text_sha256: sha(Buffer.from(text, 'utf8')), manifest_text_sha256: doc.label_text_sha256 };
      input.input_verified = input.pdf_sha256 === doc.sha256 && input.text_sha256 === doc.label_text_sha256 && doc.is_10_percent === true && /Full 10% candle-wax SDS/.test(doc.document_format || '');
      fs.copyFileSync(path.join(CORPUS, doc.section_2_2_text_file), path.join(caseDir, 'section-2-2-pasted.txt'));
      const product_name = doc.name.replace(/\s*10% full SDS\s*$/i, '').trim() + ' Candle';
      const result = { input, product_name, sizes: {} };
      let all = SIZES.slice();
      for (const size of all) {
        const t0 = Date.now();
        result.sizes[size] = await runSize(browser, base, { ...doc, product_name }, text, caseDir, size);
        result.sizes[size].ms = Date.now() - t0;
      }
      fs.writeFileSync(path.join(caseDir, 'journey.json'), JSON.stringify(result, null, 1));
      const s = Object.entries(result.sizes).map(([k, v]) => `${k}:${v.error ? 'ERR' : v.stopped_at ? 'stop@' + v.stopped_at : (v.preview && v.preview.download_allowed ? 'allowed' : 'blocked')}/${v.exports ? Object.entries(v.exports).map(([f, e]) => f + '=' + e.status).join(',') : '-'}${v.recommended ? ' rec ' + v.recommended.size + ':' + (v.recommended.preview.download_allowed ? 'allowed' : 'blocked') + '/' + Object.entries(v.recommended.exports || {}).map(([f, e]) => f + '=' + e.status).join(',') : ''}`).join(' ');
      console.log(doc.id, s);
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
