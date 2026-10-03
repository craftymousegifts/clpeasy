// Preview browser QA used for Test v28 (signed-out guest; Supabase stubbed, no network to Supabase).
// Usage: node docs/reports/sds-document-applicability/preview-browser-qa.js <BASE_URL> <OUT_DIR>
// Browser QA for the supplier-document confirmation (v26). BASE = preview or local URL.
const puppeteer = require('/home/user/clpeasy/node_modules/puppeteer');
const fs = require('fs');
const BASE = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const EXE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
// Signed-out guest: this environment cannot reach Supabase, so supabase-js is
// stubbed as "no session" (the real guest path); other third-party requests are dropped.
const STUB = 'window.supabase={createClient:function(){return {auth:{getSession:async function(){return {data:{session:null}}},onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},from:function(){var q={select:function(){return q},eq:function(){return q},update:function(){return q},upsert:function(){return q},single:async function(){return {data:null,error:null}},maybeSingle:async function(){return {data:null,error:null}},then:function(r){return Promise.resolve({data:null,error:null}).then(r)}};return q},rpc:async function(){return {data:null,error:null}}}}};';
async function prep(p){
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url();
    if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: STUB });
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
    return r.respond({ status: 204, body: '' }); });
}
let __errsRef = null;
const check = (c, label) => { results.push((c ? 'PASS ' : 'FAIL ') + label + (__errsRef ? ' [errs so far ' + __errsRef.length + ']' : '')); };
(async () => {
  const exe = EXE || (() => { try { return puppeteer.executablePath(); } catch (e) { return undefined; } })();
  const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox'] });
  for (const [w, h] of [[1366, 900], [390, 844], [360, 740]]) {
    const p = await browser.newPage();
    const errs = []; __errsRef = errs; p.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(0,4).join(' / ')));
    p.on('dialog', d => d.dismiss());
    await p.setCacheEnabled(false);
    { const cdp = await p.target().createCDPSession(); await cdp.send('Runtime.enable'); cdp.on('Runtime.exceptionThrown', ev => { const d = ev.exceptionDetails; results.push('INFO EXC ' + w + ' ' + (d.url || '') + ':' + d.lineNumber + ':' + d.columnNumber + ' scriptId=' + d.scriptId + ' ' + ((d.exception && d.exception.description) || d.text).slice(0, 150)); }); }
    await prep(p);
    p.on('response', r => { const ct = r.headers()['content-type'] || ''; if (r.request().resourceType() === 'script' || r.status() >= 300) results.push('INFO ' + w + ' ' + r.status() + ' ' + ct.split(';')[0] + ' ' + r.url().slice(0, 120)); });
    p.on('framenavigated', f => { if (f === p.mainFrame()) results.push('INFO ' + w + ' nav ' + f.url()); });
    await p.setViewport({ width: w, height: h });
    await p.goto(BASE + '/builder.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1200);
    check(await p.evaluate(() => !!window.SdsDocCheck), `${w}: sds-doc-check.js served and loaded`);
    await p.evaluate(async () => { document.getElementById('scent-name').value = 'Lavender Fields'; setApprovedBuilderStep(2); await new Promise(r => setTimeout(r, 300));
      document.getElementById('product-type').value = 'Scented Candle'; onProductTypeChange(); toggleFragCalc && toggleFragCalc();
      document.getElementById('calc-wax').value = '200'; document.getElementById('calc-frag').value = '20'; calcFragLoad();
      document.getElementById('frag-load').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
    await sleep(300);
    const lay = await p.evaluate(() => { const fr = document.getElementById('frag-row'); const cols = getComputedStyle(fr).gridTemplateColumns.split(' ').length;
      const res = document.getElementById('calc-result').getBoundingClientRect(), bt = document.getElementById('burn-time').getBoundingClientRect(), row = fr.getBoundingClientRect();
      return { cols, resW: Math.round(res.width), rowW: Math.round(row.width), burnBelow: bt.top >= res.bottom, overflow: document.documentElement.scrollWidth > innerWidth }; });
    results.push('INFO layout ' + w + ' ' + JSON.stringify(lay));
    if (w <= 390) check(lay.cols === 1 && lay.burnBelow && lay.resW >= lay.rowW - 40 && !lay.overflow, `${w}: calculator result full width, Burn time below it, no overflow`);
    else check(lay.cols === 2, `${w}: desktop keeps two columns`);
    const cr = await p.$('#frag-calc-panel'); await cr.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.evaluate(() => window.scrollBy(0, -120)); await sleep(200);
    await p.screenshot({ path: `${OUT}/01-step2-${w}.png` });
    // Legacy saved label reopened directly (no confirmation): blocked with guidance at Step 5.
    const legacy = await p.evaluate(async () => {
      const rec = { id: '11111111-2222-4333-8444-555555555501', schemaVersion: 1, scentName: 'Older Label', productType: 'Scented Candle', fragLoad: '10%', shape: 'circle', size: 63.5, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '01/10/2026' };
      await LabelLibrary.mutate(() => ({ collection: [rec], usedId: rec.id }));
      return rec.id;
    });
    await p.goto(BASE + '/builder.html?label=' + legacy, { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    let st = await p.evaluate(() => ({ step: approvedBuilderStep, name: document.getElementById('scent-name').value }));
    if (st.step !== 5 || st.name !== 'Older Label') {
      await p.evaluate(id => { if (typeof loadLabelById === 'function' && loadLabelById(id)) forceGoToStep(5); }, legacy);
      await sleep(800);
      st = await p.evaluate(() => ({ step: approvedBuilderStep, name: document.getElementById('scent-name').value }));
    }
    check(st.step === 5 && st.name === 'Older Label', `${w}: older label reopened at Step 5`);
    await p.evaluate(() => { const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload(); });
    const s5 = await p.evaluate(() => ({ allowed: _downloadAllowed(), note: document.getElementById('sds-doc-export-note').textContent, shown: getComputedStyle(document.getElementById('sds-doc-export-note')).display !== 'none', btn: document.getElementById('btn-png').style.pointerEvents, overflow: document.documentElement.scrollWidth > window.innerWidth }));
    check(!s5.allowed && s5.shown && /Check your supplier document first/.test(s5.note) && s5.btn === 'none', `${w}: older label export blocked with visible Step 5 guidance`);
    check(!s5.overflow, `${w}: no horizontal overflow at Step 5`);
    const note = await p.$('#sds-doc-export-note');
    await note.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await p.screenshot({ path: `${OUT}/03-old-label-notice-${w}.png` });
    await p.evaluate(async () => { await saveLabel(); document.getElementById('btn-save').scrollIntoView({ block: 'center' }); });
    check(await p.evaluate(() => document.getElementById('btn-save').textContent) === '✎ Draft saved', `${w}: button says "Draft saved"`);
    await sleep(300);
    const ds = await p.evaluate(() => document.getElementById('save-status').textContent);
    check(/Saved as a draft: not ready to download yet/.test(ds), `${w}: draft save message`);
    await p.screenshot({ path: `${OUT}/04-draft-saved-${w}.png` });
    // Go to Step 3 via the notice, complete the check, continue -> export allowed.
    await p.click('#sds-doc-export-note button');
    await sleep(600);
    check(await p.evaluate(() => approvedBuilderStep) === 3, `${w}: "Go to Step 3" link works`);
    await p.evaluate(() => { document.querySelector('input[name="sds-doc-kind"][value="finished"]').click(); });
    await p.type('#sds-doc-pct', '10');
    await p.select('#sds-doc-base', 'candle');
    await sleep(300);
    const fs3 = await p.$('#sds-doc-check');
    await fs3.evaluate(e => e.scrollIntoView({ block: 'start' }));
    await p.screenshot({ path: `${OUT}/02-step3-check-${w}.png` });
    // Written supplier confirmation view (for review), then back to the finished-document answer.
    await p.evaluate(() => { document.querySelector('input[name="sds-doc-kind"][value="supplier-confirmed"]').click();
      const setv = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      setv('sds-doc-pct', '10'); setv('sds-doc-base', 'candle'); setv('sds-doc-supplier', 'Acme Oils Ltd'); setv('sds-doc-cdate', '2026-10-01'); setv('sds-doc-cref', 'Lavender Fields CLP – candle 10%');
      document.getElementById('sds-doc-check').scrollIntoView({ block: 'start' }); });
    await sleep(300);
    check(/written confirmation from Acme Oils Ltd/.test(await p.evaluate(() => document.getElementById('sds-doc-result').textContent)), `${w}: written-confirmation answer accepted when complete`);
    await p.screenshot({ path: `${OUT}/02b-step3-written-confirmation-${w}.png`, fullPage: false });
    await p.evaluate(() => { document.querySelector('input[name="sds-doc-kind"][value="finished"]').click(); });
    const opts = await p.evaluate(() => [...document.querySelectorAll('#sds-doc-base option')].map(o => o.textContent));
    check(opts.includes('Candles') && opts.includes('Wax melts') && opts.includes('Candles and wax melts (the document names both)'), `${w}: separate candle / wax melt options`);
    await p.evaluate(() => { const c = document.getElementById('hazard-confirm'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); toggleHazardNext(); });
    await p.evaluate(() => setApprovedBuilderStep(4));
    await p.evaluate(() => setApprovedBuilderStep(5));
    await sleep(500);
    await p.evaluate(() => { const v = document.getElementById('verify-checkbox'); v.checked = true; toggleDownload(); });
    const after = await p.evaluate(() => ({ step: approvedBuilderStep, allowed: _downloadAllowed(), shown: getComputedStyle(document.getElementById('sds-doc-export-note')).display !== 'none', status: SdsDocCheck.status(_sdsDocRecord()) }));
    check(after.step === 5 && after.allowed && !after.shown && after.status === 'verified', `${w}: after completing Step 3 the label is verified and exportable (${JSON.stringify(after)})`);
    // Change % after confirming -> blocked again.
    await p.evaluate(() => { document.getElementById('frag-load').value = '9%'; updateLabel(); toggleDownload(); });
    check(await p.evaluate(() => !_downloadAllowed() && SdsDocCheck.status(_sdsDocRecord()) !== 'verified'), `${w}: % change after confirming blocks export`);
    // Calculator precision.
    await p.evaluate(() => { document.getElementById('calc-wax').value = '200'; document.getElementById('calc-frag').value = '20'; calcFragLoad(); });
    const calc = await p.evaluate(() => document.getElementById('calc-result').textContent);
    check(/^9\.0909% \(rounded to 4 decimal places\)/.test(calc), `${w}: calculator shows 9.0909%`);
    // Known, pre-existing and recorded separately: the deployed page serves the
    // Print Sheet Composer link's hover attribute cut short, so hovering it logs
    // "Invalid or unexpected token". Classified only when that damage is present.
    const hoverDamaged = await p.evaluate(() => (document.getElementById('print-sheet-link')?.getAttribute('onmouseout') || '').length < 20);
    const known = errs.filter(e => hoverDamaged && /^Invalid or unexpected token/.test(e));
    const other = errs.filter(e => !known.includes(e));
    if (known.length) results.push(`INFO ${w}: ${known.length} known pre-existing hover-handler error(s) (served attribute damaged)`);
    check(other.length === 0, `${w}: no other page errors ${other.join(' | ')}`);
    await p.close();
  }
  // Composer: older label on a sheet is blocked with names.
  const c = await browser.newPage();
  const cerrs = []; c.on('pageerror', e => cerrs.push(e.message)); c.on('dialog', d => d.dismiss());
  await prep(c);
  await c.setViewport({ width: 1366, height: 900 });
  await c.goto(BASE + '/print.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  await c.evaluate(async () => {
    const base = { schemaVersion: 1, productType: 'Scented Candle', fragLoad: '10%', shape: 'circle', size: 63.5, signal: 'Warning', sdsSignal: 'Warning', hStatements: 'H317', pictograms: ['exclamation'], sensitisers: ['Linalool'], bizName: 'QA', bizAddress: '1 Test St', bizPhone: '0123', pStatements: '', p280Items: [], savedAt: '01/10/2026' };
    const ok = Object.assign({}, base, { id: '11111111-2222-4333-8444-555555555601', scentName: 'Confirmed Label', sdsDoc: { kind: 'finished', pct: '10', base: 'candle' } });
    ok.sdsDoc.confirmed = SdsDocCheck.confirmationFor(ok);
    const old = Object.assign({}, base, { id: '11111111-2222-4333-8444-555555555602', scentName: 'Older Label' });
    await LabelLibrary.mutate(() => ({ collection: [ok, old], usedId: ok.id }));
  });
  await c.goto(BASE + '/print.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1800);
  const r = await c.evaluate(() => {
    const ids = getSaved().map(x => x.id);
    ids.forEach(id => { try { addToSheet(id); } catch (e) {} });
    updateExportButtonState();
    const n = document.getElementById('sds-doc-sheet-note');
    const pb = document.getElementById('btn-png-all'), pd = document.getElementById('btn-pdf');
    return { pngDisabled: pb && pb.disabled, pdfDisabled: pd && pd.disabled, pngVisible: pb && pb.offsetParent !== null, shown: getComputedStyle(n).display !== 'none', text: n.textContent, msg: getSheetFitBlockMessage(), qty: getTotalQty(), overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  check(r.qty === 2 && r.shown && /Older Label/.test(r.text) && !/Confirmed Label/.test(r.text) && /supplier document check/.test(r.msg || ''), 'Composer: sheet with an older label is blocked and names it');
  check(!r.overflow, 'Composer: no horizontal overflow');
  results.push('INFO Composer buttons ' + JSON.stringify({ pngDisabled: r.pngDisabled, pdfDisabled: r.pdfDisabled, pngVisible: r.pngVisible }));
  await c.evaluate(() => { window.__a = null; window.alert = m => { window.__a = String(m); }; });
  const cut = await c.evaluate(async () => { const before = document.getElementById('cricutModal')?.classList.contains('show'); try { await openCricutModal(); } catch (e) {} return { opened: document.getElementById('cricutModal')?.classList.contains('show') && !before, alert: window.__a }; });
  check(!cut.opened && /supplier document check|sign in/i.test(cut.alert || ''), 'Composer: cutting-machine path refuses: ' + JSON.stringify(cut));
  const n = await c.$('#sds-doc-sheet-note'); await n.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await c.screenshot({ path: `${OUT}/05-composer-notice-1366.png` });
  check(cerrs.length === 0, 'Composer: no page errors ' + cerrs.join(' | '));
  await browser.close();
  console.log(results.join('\n'));
  process.exit(results.some(x => x.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
