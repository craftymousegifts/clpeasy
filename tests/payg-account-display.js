// Pay As You Go account/plan display regression coverage (PR #156 follow-up).
//
// 1. entitlement.js unit checks (pure function; its agreement with the real
//    consume_download() SQL is proven in tests/download-entitlement-sql.js).
// 2. The real account.html, dashboard.html, builder.html and my-labels.html
//    render pipelines, driven by mocked profiles rows, for PAYG, expired
//    trial, scheduled cancellation, paused and active subscription states.
// Run from repo root: node tests/payg-account-display.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const E = require('../entitlement.js');

const DAY = 86400000;
const iso = ms => new Date(Date.now() + ms).toISOString();
const strip = f => fs.readFileSync(f, 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const entitlementSource = fs.readFileSync('entitlement.js', 'utf8');

const P = {
  paygExpiredTrial: { plan:'free', is_pro:false, subscription_status:'trialing', trial_end:iso(-3*DAY), downloads_used:0, downloads_limit:10, topup_credits:8 },
  expiredTrial:     { plan:'free', is_pro:false, subscription_status:'trialing', trial_end:iso(-3*DAY), downloads_used:0, downloads_limit:10, topup_credits:0 },
  liveTrial:        { plan:'free', is_pro:false, subscription_status:'trialing', trial_end:iso(4*DAY),  downloads_used:3, downloads_limit:10, topup_credits:0 },
  activeStart:      { plan:'easy_start', is_pro:false, subscription_status:'active', downloads_used:3, downloads_limit:20, topup_credits:0 },
  activeProPlusPayg:{ plan:'easy_pro', is_pro:true, subscription_status:'active', downloads_used:30, downloads_limit:30, topup_credits:2 },
  cancelScheduled:  { plan:'easy_pro', is_pro:true, subscription_status:'cancelled', deletion_date:iso(12*DAY), downloads_used:5, downloads_limit:30, topup_credits:0 },
  endedWithPayg:    { plan:'free', is_pro:false, subscription_status:'cancelled', deletion_date:iso(-2*DAY), downloads_used:5, downloads_limit:0, topup_credits:3 },
  pausedWithPayg:   { plan:'easy_start', is_pro:false, subscription_status:'paused', downloads_used:1, downloads_limit:20, topup_credits:2 },
  // D5: former trial customer after a PAYG purchase (credit_payg_purchase).
  paygConverted:    { plan:'payg', is_pro:false, subscription_status:'payg', trial_end:iso(-1000), downloads_used:2, downloads_limit:0, topup_credits:8 },
  paygConvertedZero:{ plan:'payg', is_pro:false, subscription_status:'payg', trial_end:iso(-9*DAY), downloads_used:2, downloads_limit:0, topup_credits:0 },
  activeStartAnnualDue: { plan:'easy_start', is_pro:false, subscription_status:'active', billing_cycle:'annual', downloads_reset_date:iso(-2*DAY), downloads_used:20, downloads_limit:20, topup_credits:0 },
};

let passed = 0;
function ok(label){ passed++; console.log('PASS:', label); }

// ── 1. entitlement.js ────────────────────────────────────────────────
{
  const n = k => E.summarise(P[k]).planName;
  assert.strictEqual(n('paygExpiredTrial'), 'Pay As You Go');
  assert.strictEqual(n('expiredTrial'), 'Easy Trial (Expired)');
  assert.strictEqual(n('liveTrial'), 'Easy Trial');
  assert.strictEqual(n('activeStart'), 'Easy Start', 'an active Easy Start subscriber is not "Easy Pro"');
  assert.strictEqual(n('activeProPlusPayg'), 'Easy Pro');
  assert.strictEqual(n('cancelScheduled'), 'Easy Pro (Cancelled)');
  assert.strictEqual(n('endedWithPayg'), 'Pay As You Go');
  assert.strictEqual(n('pausedWithPayg'), 'Easy Start (Paused)');
  const t = k => E.summarise(P[k]).totalLeft;
  assert.deepStrictEqual(['paygExpiredTrial','expiredTrial','liveTrial','activeStart','activeProPlusPayg','cancelScheduled','endedWithPayg','pausedWithPayg'].map(t), [8,0,7,17,2,25,3,2],
    'totals count only usable plan allowance plus purchased downloads');
  assert.strictEqual(E.summarise(P.liveTrial).cleanAvailable, false, 'a live trial has no clean download');
  assert.strictEqual(E.summarise(P.liveTrial).cleanPreview, false, 'a live trial keeps a watermarked preview');
  assert.strictEqual(E.summarise(P.activeProPlusPayg).cleanAvailable, true);
  assert.strictEqual(E.summarise(Object.assign({}, P.activeStart, { downloads_used:20 })).cleanPreview, true, 'an active subscriber at their limit keeps a clean preview');
  assert.strictEqual(E.summarise(Object.assign({}, P.activeStart, { downloads_used:20 })).cleanAvailable, false, '...but has no clean download left');
  assert.strictEqual(E.summarise(Object.assign({}, P.cancelScheduled, { deletion_date:iso(-DAY) })).planUsable, false, 'a scheduled cancellation ends at its deletion date');
  assert.strictEqual(E.summarise(null).totalLeft, 0, 'a missing profile has nothing available');
  ok('entitlement.js plan names, totals and clean-export rules');
}

async function open(file, profile, extraBeforeParse){
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const session = { user:{ id:'user-1', email:'maker@example.com', created_at:iso(-40*DAY), user_metadata:{} } };
  const row = Object.assign({ email:'maker@example.com', full_name:'Test Maker', created_at:iso(-40*DAY), billing_cycle:'monthly' }, profile);
  const q = { select(){return this;}, eq(){return this;}, update(){return this;},
    single(){ return Promise.resolve({ data:row, error:null }); },
    maybeSingle(){ return Promise.resolve({ data:row, error:null }); },
    then(r){ return Promise.resolve({ data:[], error:null }).then(r); } };
  const dom = new JSDOM(strip(file), {
    url:'https://local.clpeasy.test/'+file, runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window){
      window.alert = () => {}; window.confirm = () => true; window.scrollTo = () => {};
      window.HTMLCanvasElement.prototype.getContext = () => ({ measureText:t=>({width:String(t).length*6}), fillRect(){}, drawImage(){} });
      window.eval(entitlementSource);
      if (extraBeforeParse) extraBeforeParse(window);
      window.supabase = { createClient: () => ({
        auth:{ getSession: async () => ({ data:{ session } }), onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }), signOut: async () => ({}) },
        from: () => Object.create(q),
        rpc: async () => ({ data:false, error:null })
      }) };
    }
  });
  await new Promise(r => setTimeout(r, 300));
  return { window: dom.window, doc: dom.window.document, errors };
}
const text = (doc, id) => (doc.getElementById(id) || { textContent:'' }).textContent.replace(/\s+/g,' ').trim();

(async () => {
  // ── 2a. account.html ──────────────────────────────────────────────
  {
    const { doc, errors } = await open('account.html', P.paygExpiredTrial);
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(text(doc,'plan-name'), 'Pay As You Go');
    assert.strictEqual(text(doc,'su-plan'), 'Pay As You Go');
    assert.strictEqual(text(doc,'su-count'), '8 downloads');
    assert(!/Choose a plan/.test(text(doc,'renewal-line')), 'an expired trial with purchased downloads must not be told to choose a plan to continue');
    assert(/purchased downloads are ready to use/.test(text(doc,'renewal-line')));
    assert(!/Choose a plan/.test(text(doc,'dl-note')), 'download note must not say choose a plan while purchased downloads remain');
    assert.strictEqual(text(doc,'topup-credits-count'), '8');
    ok('account.html: expired trial + PAYG shows Pay As You Go, 8 downloads, and no "choose a plan to continue"');
  }
  {
    const { doc } = await open('account.html', P.expiredTrial);
    assert.strictEqual(text(doc,'plan-name'), 'Easy Trial (Expired)');
    assert.strictEqual(text(doc,'su-count'), '0 downloads', 'an expired trial\'s unused trial downloads are not available');
    assert(/Choose a plan to continue creating labels/.test(text(doc,'renewal-line')), 'expired trial with nothing purchased keeps its existing message');
    ok('account.html: expired trial with no purchases is unchanged except its sidebar no longer counts unusable trial downloads');
  }
  {
    const { doc } = await open('account.html', P.cancelScheduled);
    assert.strictEqual(text(doc,'plan-name'), 'Easy Pro (Cancelled)');
    assert.notStrictEqual(doc.getElementById('dl-section').style.display, 'none', 'a scheduled cancellation still shows its remaining paid allowance');
    assert.strictEqual(text(doc,'su-count'), '25 of 30');
    ok('account.html: scheduled cancellation keeps showing its paid allowance until the period ends');
  }
  {
    // Pre-existing crash (also on main): any cancelled account threw
    // "fmtDate is not defined" part-way through renderAccount(), so its
    // purchased-download balance and Reactivate button never rendered.
    const { doc, errors } = await open('account.html', P.endedWithPayg);
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert(/Subscription cancelled/.test(text(doc,'renewal-line')));
    assert.strictEqual(text(doc,'topup-credits-count'), '3', 'purchased balance renders for an ended subscription');
    assert(/Reactivate my account/.test(doc.getElementById('action-row').textContent), 'action row renders');
    assert.strictEqual(text(doc,'plan-name'), 'Pay As You Go');
    const cs = await open('account.html', P.cancelScheduled);
    assert(/Access continues until \d/.test(text(cs.doc,'renewal-line')), 'scheduled cancellation shows its real access end date');
    ok('account.html: cancelled accounts render completely (fmtDate crash fixed)');
  }
  {
    const { doc } = await open('account.html', P.activeStart);
    assert.strictEqual(text(doc,'plan-name'), 'Easy Start');
    assert.strictEqual(text(doc,'su-count'), '17 of 20', 'plan-only balances keep the existing "X of Y" sidebar wording');
    ok('account.html: active Easy Start display unchanged');
  }
  // ── 2b. dashboard.html ────────────────────────────────────────────
  {
    const { doc, errors } = await open('dashboard.html', P.paygExpiredTrial);
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(text(doc,'db-plan-name'), 'Pay As You Go');
    assert.strictEqual(text(doc,'db-dl-count'), '0 of 10 remaining · 8 purchased', 'main dashboard card shows purchased downloads');
    assert(!/Choose a plan to continue/.test(text(doc,'db-renewal-line')));
    assert.strictEqual(text(doc,'su-count'), '8 downloads');
    ok('dashboard.html: main card and sidebar show PAYG balance');
  }
  {
    const { doc } = await open('dashboard.html', P.endedWithPayg);
    assert.notStrictEqual(doc.getElementById('db-dl-section').style.display, 'none');
    assert.strictEqual(text(doc,'db-dl-label-text'), 'Purchased downloads');
    assert.strictEqual(text(doc,'db-dl-count'), '3 remaining');
    assert.strictEqual(text(doc,'db-plan-name'), 'Pay As You Go');
    ok('dashboard.html: ended subscription with purchased downloads shows them');
  }
  {
    const { doc } = await open('dashboard.html', P.expiredTrial);
    assert.strictEqual(text(doc,'db-dl-count'), '0 of 10 remaining', 'expired trial no longer claims its unused trial downloads remain');
    assert.strictEqual(text(doc,'db-plan-name'), 'Easy Trial™ (Expired)');
    ok('dashboard.html: expired trial shows 0 remaining');
  }
  // ── 2c. builder.html sidebar ──────────────────────────────────────
  {
    const rs = fs.readFileSync('label-render.js','utf8'), ls = fs.readFileSync('label-library.js','utf8');
    const extra = w => { w.eval(rs); w.eval(ls); };
    const b1 = await open('builder.html', P.paygExpiredTrial, extra);
    assert.strictEqual(text(b1.doc,'su-plan'), 'Pay As You Go', 'Builder must not label a PAYG customer "Easy Pro"');
    assert.strictEqual(text(b1.doc,'su-count'), '8 downloads');
    assert.strictEqual(b1.window.eval('DL.summary.planUsable'), false);
    const b2 = await open('builder.html', P.activeStart, extra);
    assert.strictEqual(text(b2.doc,'su-plan'), 'Easy Start', 'Builder must not label an Easy Start subscriber "Easy Pro"');
    assert.strictEqual(text(b2.doc,'su-count'), '17 downloads');
    ok('builder.html: sidebar plan name and balance use the shared rules');
  }
  // ── 2d. my-labels.html sidebar ────────────────────────────────────
  {
    const ls = fs.readFileSync('label-library.js','utf8'), rs = fs.readFileSync('label-render.js','utf8');
    const m = await open('my-labels.html', P.pausedWithPayg, w => { w.eval(ls); w.eval(rs); });
    assert.strictEqual(text(m.doc,'su-plan'), 'Easy Start (Paused)');
    assert.strictEqual(text(m.doc,'su-count'), '2 downloads');
    ok('my-labels.html: sidebar shows paused plan with purchased balance');
  }
  // ── D5: trial -> Pay As You Go account display ────────────────────
  {
    const { doc, errors } = await open('account.html', P.paygConverted);
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(text(doc,'plan-name'), 'Pay As You Go');
    assert.strictEqual(text(doc,'plan-badge'), 'Active');
    assert.strictEqual(text(doc,'acct-status'), 'pay as you go');
    assert.strictEqual(text(doc,'renewal-line'), 'No subscription · purchased downloads do not expire');
    assert.strictEqual(text(doc,'topup-credits-count'), '8');
    assert(!/Trial/i.test(text(doc,'renewal-line')), 'the old trial never reappears');
    assert.strictEqual(text(doc,'su-count'), '8 downloads');
    assert.strictEqual(text(doc,'billing-plan'), '—');
    assert(/Buy more downloads/.test(doc.getElementById('action-row').textContent));
    const z = await open('account.html', P.paygConvertedZero);
    assert.strictEqual(text(z.doc,'plan-name'), 'Pay As You Go', 'at zero the account stays Pay As You Go');
    assert.strictEqual(text(z.doc,'su-count'), '0 downloads');
    assert(!/Trial/i.test(text(z.doc,'renewal-line')), 'the trial does not return at zero');
    ok('account.html: trial -> Pay As You Go conversion, including at zero balance');
  }
  {
    const { doc } = await open('dashboard.html', P.paygConverted);
    assert.strictEqual(text(doc,'db-plan-name'), 'Pay As You Go');
    assert.strictEqual(text(doc,'db-plan-badge'), 'Active');
    assert.strictEqual(text(doc,'db-dl-count'), '8 remaining');
    assert(/Buy more downloads/.test(doc.getElementById('db-action-row').textContent));
    const z = await open('dashboard.html', P.paygConvertedZero);
    assert.strictEqual(text(z.doc,'db-plan-name'), 'Pay As You Go');
    assert.strictEqual(text(z.doc,'db-dl-count'), '0 remaining', 'shows 0 downloads rather than hiding the card');
    ok('dashboard.html: trial -> Pay As You Go conversion, including at zero balance');
  }
  // ── D4: one purchase route rule everywhere ────────────────────────
  {
    const cases = [
      ['activeStart', 'topup'], ['cancelScheduled', 'topup'],
      ['liveTrial', 'payg'], ['expiredTrial', 'payg'], ['paygConverted', 'payg'],
      ['endedWithPayg', 'payg'], ['pausedWithPayg', 'payg'],
    ];
    const rs = fs.readFileSync('label-render.js','utf8'), ls = fs.readFileSync('label-library.js','utf8');
    for (const [key, route] of cases) {
      for (const page of ['account.html', 'dashboard.html', 'my-labels.html', 'builder.html']) {
        const extra = page === 'my-labels.html' || page === 'builder.html' ? (w => { w.eval(rs); w.eval(ls); }) : null;
        const { doc } = await open(page, P[key], extra);
        const link = doc.querySelector('.su-topup');
        assert(link, `${page}: sidebar purchase link exists`);
        assert.strictEqual(link.getAttribute('href'), route === 'topup' ? 'account.html?topup=1' : 'pricing.html#payg', `${page} ${key}: sidebar link -> ${route}`);
      }
      const d = await open('dashboard.html', P[key]);
      const hasTopup = /Buy top-up downloads/.test(d.doc.getElementById('db-action-row').textContent);
      assert.strictEqual(hasTopup, route === 'topup', `dashboard ${key}: top-up action only for subscribers`);
    }
    // account.html ?topup=1 / buyTopup(): ineligible accounts go to PAYG, never the top-up modal.
    for (const [key, route] of cases) {
      const { window: w, doc } = await open('account.html', P[key]);
      let went = null;
      w.eval('window.__go = null');
      try { w.buyTopup(); } catch (e) { went = String(e); }
      const modalOpen = doc.getElementById('modal-topup').classList.contains('open');
      assert.strictEqual(modalOpen, route === 'topup', `account ${key}: top-up modal only for subscribers`);
    }
    ok('D4: Account, Dashboard, My Labels and Builder all route subscriber top-ups vs Pay As You Go the same way');
  }
  // ── Annual monthly refill shown before the next download ──────────
  {
    const { doc } = await open('account.html', P.activeStartAnnualDue);
    assert.strictEqual(text(doc,'su-count'), '20 of 20', 'annual plan past its monthly reset date shows the refilled allowance');
    assert.strictEqual(text(doc,'dl-count'), '0 / 20', 'account main card shows the refilled allowance too');
    const d = await open('dashboard.html', P.activeStartAnnualDue);
    assert.strictEqual(text(d.doc,'db-dl-count'), '20 of 20 remaining', 'dashboard shows the refilled allowance');
    ok('annual plan monthly refill is reflected in the sidebar');
  }
  console.log(`PAYG account display checks passed (${passed} groups)`);
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
