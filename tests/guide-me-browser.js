// Guide Me (Builder) and Knowledge Base search — real-browser journeys.
//
// Serves the working tree on 127.0.0.1 with Supabase stubbed in-page, as a
// signed-out guest and as a signed-in user, at desktop and 390 px. Proves:
//   - Guide Me opens with its greeting, suggested topics, microphone and
//     the three guide styles; a "what I want to make" request is clarified,
//     confirmed and turned into steps; questions get answer cards; a
//     nonsense question gets the helpful fallback;
//   - auto-fill sets only shape/size/product type/name — never the signal
//     word or any hazard field;
//   - the Knowledge Base search answers locally, opens topics and falls back;
//   - neither page makes ANY request to Supabase functions, Anthropic or any
//     other outside service while being used (every request is recorded);
//   - layouts fit at 390 px without horizontal scrolling.
// Screenshots go to $GUIDE_ME_SHOTS when set.
//   node tests/guide-me-browser.js
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { console.log('SKIP guide-me-browser: puppeteer not installed'); process.exit(0); }
function chromium() {
  const c = [process.env.PUPPETEER_EXECUTABLE_PATH, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  try { const p = puppeteer.executablePath(); if (p) c.push(p); } catch (e) { /* none */ }
  return c.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
const EXE = chromium();
if (!EXE) { console.log('SKIP guide-me-browser: no Chromium available'); process.exit(0); }
const SHOTS = process.env.GUIDE_ME_SHOTS;
let passed = 0;
function ok(label) { passed++; console.log('PASS:', label); }

const DAY = 86400000, iso = ms => new Date(Date.now() + ms).toISOString();
const PROFILE = { id: 'u1', email: 'qa@example.test', full_name: 'QA', created_at: iso(-40 * DAY), plan: 'payg', subscription_status: 'payg', trial_end: iso(-2 * DAY), downloads_used: 0, downloads_limit: 0, topup_credits: 50, billing_cycle: 'monthly' };
const stub = signedIn => `window.supabase={createClient:function(){var row=${JSON.stringify(PROFILE)};var signed=${signedIn};
  var q={select:function(){return this},eq:function(){return this},neq:function(){return this},update:function(){return this},upsert:function(){return Promise.resolve({error:null})},insert:function(){return Promise.resolve({error:null})},order:function(){return this},limit:function(){return this},gte:function(){return this},
  single:function(){return Promise.resolve({data:row,error:null})},maybeSingle:function(){return Promise.resolve({data:row,error:null})},then:function(r){return Promise.resolve({data:[],error:null}).then(r)}};
  return {auth:{getSession:async function(){return {data:{session:signed?{access_token:'x',user:{id:'u1',email:row.email,created_at:row.created_at,user_metadata:{}}}:null}}},getUser:async function(){return {data:{user:signed?{id:'u1'}:null}}},
  onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}}},signOut:async function(){return {}}},
  from:function(){return Object.create(q)},
  rpc:async function(){return {data:null,error:null};},
  functions:{invoke:async function(n){window.__fnInvokes=(window.__fnInvokes||[]).concat([n]);return {data:null,error:null}}}};}};`;

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]); if (f === '/') f = '/index.html';
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let failed = false;
  async function open(page, vp, signedIn) {
    const t = await browser.newPage();
    await t.setViewport(vp);
    t.errs = []; t.outside = []; t.recording = false;
    t.on('pageerror', e => t.errs.push(e.message));
    t.on('dialog', d => d.dismiss());
    await t.setRequestInterception(true);
    t.on('request', r => {
      const u = r.url();
      if (t.recording && !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) t.outside.push(u);
      if (u.includes('supabase-js')) return r.respond({ status: 200, contentType: 'text/javascript', body: stub(signedIn) });
      if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      if (u.includes('jszip')) return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.JSZip=function(){};' });
      return r.respond({ status: 204, body: '' });
    });
    await t.evaluateOnNewDocument(() => {
      const of = window.fetch; window.__fetches = [];
      window.fetch = function (u) { window.__fetches.push(String(u && u.url || u)); return of.apply(this, arguments); };
    });
    await t.goto(`${base}/${page}`, { waitUntil: 'load' });
    await sleep(1200);
    return t;
  }
  const bubbleText = t => t.evaluate(() => [...document.querySelectorAll('#wiz-messages .wiz-msg.ai .wiz-bubble')].map(b => b.innerText).pop() || '');
  async function say(t, text) {
    await t.evaluate(x => { document.getElementById('wiz-input').value = x; wizSend(); }, text);
    await sleep(450);
    return bubbleText(t);
  }
  async function clickChip(t, label) {
    const okd = await t.evaluate(l => { const b = [...document.querySelectorAll('#wiz-messages .wiz-chip-row button')].reverse().find(x => x.textContent === l); if (b) b.click(); return !!b; }, label);
    assert(okd, 'chip not found: ' + label);
    await sleep(450);
    return bubbleText(t);
  }
  const noOverflow = t => t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const panelFits = t => t.evaluate(() => { const p = document.getElementById('wiz-panel').getBoundingClientRect(); const m = document.getElementById('wiz-messages'); return p.left >= -1 && p.right <= window.innerWidth + 1 && m.scrollWidth <= m.clientWidth + 1; });

  try {
    for (const [who, signedIn] of [['guest', false], ['signed-in', true]]) {
      for (const [vpName, vp] of [['desktop', { width: 1366, height: 900 }], ['390px', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
        const t = await open('builder.html', vp, signedIn);
        const before = await t.evaluate(() => ({ signal: S.signal, sdsSignal: S.sdsSignal, picto: JSON.stringify(S.pictograms), h: JSON.stringify(S.hSelected), p: JSON.stringify(S.pSelected), sens: JSON.stringify(S.sensitisers) }));
        t.recording = true;
        // Open from the Builder's own Guide Me button.
        await t.evaluate(() => [...document.querySelectorAll('button')].find(b => /Guide Me/.test(b.getAttribute('title') || '')).click());
        await sleep(700);
        const greet = await t.evaluate(() => ({
          open: document.getElementById('wiz-panel').classList.contains('open'),
          text: document.getElementById('wiz-messages').innerText,
          chips: [...document.querySelectorAll('#wiz-messages .wiz-chip-row button')].map(b => b.textContent),
          mic: !!document.getElementById('wiz-mic'), placeholder: document.getElementById('wiz-input').placeholder,
          live: document.getElementById('wiz-messages').getAttribute('aria-live')
        }));
        assert(greet.open && /Hi! I'm your Label Wizard/.test(greet.text) && /4 of Sea Breeze and 4 of Coconut/.test(greet.text), 'greeting');
        assert(greet.chips.includes('What size label should I use?') && greet.chips.length === 3, 'Step 1 suggested topics: ' + greet.chips);
        assert(greet.mic && greet.live === 'polite' && !/Connecting/.test(greet.placeholder), 'mic, aria-live, no "Connecting…"');
        if (SHOTS) await t.screenshot({ path: path.join(SHOTS, `builder-${who}-${vpName}-1-greeting.png`) });

        // A make request → clarify → confirm → style → steps.
        let txt = await say(t, 'I want 4 of Sea Breeze and 4 of Coconut on one page');
        assert(/Which label shape/.test(txt) && /What size/.test(txt), 'clarifying questions: ' + txt);
        txt = await clickChip(t, 'Circle');
        txt = await clickChip(t, '63 mm');
        assert(/So you want: 63 mm circle labels, 8 labels in total, 4 × Sea Breeze, 4 × Coconut, arranged on an A4 sheet/.test(txt), 'summary: ' + txt);
        await clickChip(t, "Yes, that's right");
        const styles = await t.evaluate(() => [...document.querySelectorAll('.wiz-style-card .style-name')].map(e => e.textContent));
        assert.deepStrictEqual(styles.slice(-3), ['Walkthrough', 'Quick list', 'Auto-fill']);
        if (SHOTS) await t.screenshot({ path: path.join(SHOTS, `builder-${who}-${vpName}-2-styles.png`) });
        await t.evaluate(() => [...document.querySelectorAll('.wiz-style-card')].slice(-3)[0].click());
        await sleep(500);
        txt = await t.evaluate(() => [...document.querySelectorAll('#wiz-messages .wiz-msg.ai .wiz-bubble')].map(b => b.innerText).pop());
        assert(/Here's your walkthrough/.test(txt) && /Repeat Steps 2–5 for each scent/.test(txt) && /Print Sheet Composer/.test(txt), 'walkthrough steps');
        assert(await panelFits(t), 'Guide Me panel content fits (' + vpName + ')');
        if (SHOTS) await t.screenshot({ path: path.join(SHOTS, `builder-${who}-${vpName}-3-walkthrough.png`) });

        // Questions, guardrail and fallback.
        txt = await say(t, 'How do I print with my Cricut?');
        assert(/Cricut/.test(txt) && /Printing and cutting guide|step-by-step guide/i.test(txt), 'Cricut answer: ' + txt);
        txt = await say(t, 'What signal word should my candle have?');
        assert(/CLPeasy doesn't choose a signal word for you/.test(txt), 'signal word guardrail');
        txt = await say(t, 'asdfgh');
        assert(/couldn't find an answer/.test(txt), 'fallback');
        if (SHOTS) await t.screenshot({ path: path.join(SHOTS, `builder-${who}-${vpName}-4-answers.png`) });
        // "Search the Help Guide" hands over to the Help panel.
        await clickChip(t, 'Search the Help Guide');
        const help = await t.evaluate(() => ({ open: document.getElementById('help-panel').classList.contains('open'), q: document.getElementById('help-search').value }));
        assert(help.open && help.q === 'asdfgh', 'fallback opens the Help Guide with the question');
        await t.evaluate(() => closeHelp());

        // Auto-fill: layout/product fields only.
        await t.evaluate(() => { openWizard(); wizClearChat(); });
        await sleep(300);
        await say(t, 'one 52mm circle label called Winter Spice for a soy candle');
        await clickChip(t, "Yes, that's right");
        await t.evaluate(() => [...document.querySelectorAll('.wiz-style-card')].slice(-1)[0].click());
        await sleep(900);
        const after = await t.evaluate(() => ({ shape: S.shape, w: S.customW, type: document.getElementById('product-type').value, name: document.getElementById('scent-name').value,
          signal: S.signal, sdsSignal: S.sdsSignal, picto: JSON.stringify(S.pictograms), h: JSON.stringify(S.hSelected), p: JSON.stringify(S.pSelected), sens: JSON.stringify(S.sensitisers),
          done: /Done! I've filled in the builder/.test(document.getElementById('wiz-messages').innerText) }));
        assert(after.shape === 'circle' && after.w === 52 && after.type === 'Soy Candle' && after.name === 'Winter Spice' && after.done, 'auto-fill applied: ' + JSON.stringify(after));
        for (const k of ['signal', 'sdsSignal', 'picto', 'h', 'p', 'sens']) assert.strictEqual(after[k], before[k], 'auto-fill must not change hazard field ' + k);

        // Contextual help reads the Builder's own blocked-download message.
        const ctx = await t.evaluate(() => { const s = S.step; S.step = 5; const c = wizContext(); S.step = s; return c; });
        assert(typeof ctx.blockedMessage === 'string' && ctx.blockedMessage.length > 10, 'context: blocked message at Step 5');

        assert(await noOverflow(t), 'no horizontal page scroll (' + vpName + ')');
        const fetches = await t.evaluate(() => (window.__fetches || []).filter(u => !u.startsWith(location.origin)));
        const fn = await t.evaluate(() => window.__fnInvokes || []);
        assert(!t.outside.length && !fetches.length && !fn.length, `Guide Me made outside requests: ${t.outside.concat(fetches, fn).join(', ')}`);
        assert(!t.errs.length, 'page errors: ' + t.errs.join(' | '));
        ok(`Builder Guide Me (${who}, ${vpName}): greeting/topics/mic, clarify → confirm → styles → steps, answers, guardrail, fallback → Help, safe auto-fill, context; zero outside requests`);
        await t.close();
      }
    }

    for (const [vpName, vp] of [['desktop', { width: 1366, height: 900 }], ['390px', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
      const t = await open('knowledge.html', vp, false);
      t.recording = true;
      await t.type('#clp-search', 'Do I need a CLP label for wax melts?');
      await t.click('#search-btn');
      await sleep(300);
      let res = await t.evaluate(() => ({ shown: getComputedStyle(document.getElementById('search-result')).display !== 'none', text: document.getElementById('search-answer').innerText, disc: document.querySelector('#search-result .disclaimer').innerText }));
      assert(res.shown && /CLP label/i.test(res.text) && !/AI-generated/.test(res.disc), 'answer shown: ' + res.text.slice(0, 120));
      if (SHOTS) await t.screenshot({ path: path.join(SHOTS, `knowledge-${vpName}-1-answer.png`) });
      await t.evaluate(() => { const i = document.getElementById('clp-search'); i.value = 'What is EUH208?'; });
      await t.keyboard.press('Enter');
      await t.focus('#clp-search'); await t.keyboard.press('Enter');
      await sleep(300);
      res = await t.evaluate(() => document.getElementById('search-answer').innerText);
      assert(/EUH208/.test(res), 'EUH208 answer');
      // Related question and topic link.
      await t.evaluate(() => { askCLP('What are EUH208 and sensitisers?'); });
      await sleep(200);
      const topic = await t.evaluate(() => { const a = document.querySelector('#search-answer [data-kb-topic]'); if (!a) return null; a.click(); return a.dataset.kbTopic; });
      await sleep(400);
      if (topic) assert(await t.evaluate(id => getComputedStyle(document.getElementById(id)).display === 'block', topic), 'topic opens: ' + topic);
      await t.evaluate(() => askCLP('qwerty zxcv'));
      await sleep(200);
      res = await t.evaluate(() => document.getElementById('search-answer').innerText);
      assert(/No direct answer found/.test(res) && /support@clpeasy.com/.test(res), 'fallback');
      await t.evaluate(() => askCLP('Which pictograms should go on my candle?'));
      await sleep(200);
      res = await t.evaluate(() => document.getElementById('search-answer').innerText);
      assert(/never suggests hazard statements/.test(res), 'guardrail on Knowledge Base');
      if (SHOTS) await t.screenshot({ path: path.join(SHOTS, `knowledge-${vpName}-2-guardrail.png`) });
      assert(await noOverflow(t), 'no horizontal page scroll (' + vpName + ')');
      const fetches = await t.evaluate(() => (window.__fetches || []).filter(u => !u.startsWith(location.origin)));
      assert(!t.outside.length && !fetches.length, 'Knowledge Base made outside requests: ' + t.outside.concat(fetches).join(', '));
      assert(!t.errs.length, 'page errors: ' + t.errs.join(' | '));
      ok(`Knowledge Base search (${vpName}): local answer, Enter key, topic link opens topic, fallback, guardrail; zero outside requests`);
      await t.close();
    }
    // Deep link from Guide Me answers opens the topic.
    const t = await open('knowledge.html#euh208', { width: 1366, height: 900 }, false);
    assert(await t.evaluate(() => getComputedStyle(document.getElementById('euh208')).display === 'block'), 'knowledge.html#euh208 opens the topic');
    ok('Knowledge Base deep link (knowledge.html#euh208) opens that topic');
    await t.close();
  } catch (e) {
    failed = true;
    console.error('FAIL:', e.message);
  }
  await browser.close();
  server.close();
  console.log(failed ? '\nguide-me-browser: FAILED' : `\nguide-me-browser: ${passed} journeys passed`);
  process.exit(failed ? 1 : 0);
});
