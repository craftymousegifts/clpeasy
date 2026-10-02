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
  pausedNoPurchases:{ plan:'easy_start', is_pro:false, subscription_status:'paused', downloads_used:1, downloads_limit:20, topup_credits:0 },
  cancelPeriodOver: { plan:'easy_pro', is_pro:true, subscription_status:'cancelled', deletion_date:iso(-DAY), downloads_used:5, downloads_limit:30, topup_credits:0 },
  activeProLimit:   { plan:'easy_pro', is_pro:true, subscription_status:'active', downloads_used:30, downloads_limit:30, topup_credits:0 },
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
  assert.strictEqual(n('activeStart'), 'Easy Start Unlimited', 'an active Easy Start subscriber is Easy Start Unlimited, not "Easy Pro"');
  assert.strictEqual(n('activeProPlusPayg'), 'Easy Pro');
  assert.strictEqual(n('cancelScheduled'), 'Easy Pro (Cancelled)');
  assert.strictEqual(n('endedWithPayg'), 'Pay As You Go');
  assert.strictEqual(n('pausedWithPayg'), 'Easy Start Unlimited (Paused)');
  const t = k => E.summarise(P[k]).totalLeft;
  assert.deepStrictEqual(['paygExpiredTrial','expiredTrial','liveTrial','endedWithPayg','pausedWithPayg'].map(t), [8,0,7,3,2],
    'finite totals count only usable plan allowance plus purchased downloads');
  const u = k => E.summarise(P[k]).unlimited;
  assert.deepStrictEqual(['activeStart','activeProPlusPayg','cancelScheduled','activeProLimit','activeStartAnnualDue'].map(u), [true,true,true,true,true], 'current Easy Start (and legacy Easy Pro) subscriptions are unlimited');
  assert.deepStrictEqual(['paygExpiredTrial','expiredTrial','liveTrial','endedWithPayg','pausedWithPayg','paygConverted','pausedNoPurchases','cancelPeriodOver'].map(u), [false,false,false,false,false,false,false,false], 'trial, PAYG, paused and ended accounts are never unlimited');
  assert.strictEqual(E.summarise(P.liveTrial).cleanAvailable, false, 'a live trial has no clean download');
  assert.strictEqual(E.summarise(P.liveTrial).cleanPreview, false, 'a live trial keeps a watermarked preview');
  assert.strictEqual(E.summarise(P.activeProPlusPayg).cleanAvailable, true);
  assert.strictEqual(E.summarise(Object.assign({}, P.activeStart, { downloads_used:20 })).cleanPreview, true, 'an active subscriber at their limit keeps a clean preview');
  assert.strictEqual(E.summarise(Object.assign({}, P.activeStart, { downloads_used:20 })).cleanAvailable, true, '...and, being unlimited, a clean download is always available');
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
    assert.strictEqual(text(doc,'su-count'), 'Unlimited');
    assert.strictEqual(text(doc,'dl-count'), 'Unlimited');
    assert(/until your subscription ends/.test(text(doc,'dl-note')));
    ok('account.html: scheduled cancellation stays unlimited until the period ends');
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
    assert.strictEqual(text(doc,'plan-name'), 'Easy Start Unlimited');
    assert.strictEqual(text(doc,'su-count'), 'Unlimited', 'an unlimited subscriber never sees an "X of 20" allowance');
    assert.strictEqual(text(doc,'dl-count'), 'Unlimited');
    assert(!/of 20|of 30|monthly limit/.test(doc.getElementById('dl-section').textContent), 'no finite allowance wording');
    assert.strictEqual(doc.querySelector('.su-topup').style.display, 'none', 'no "buy downloads" link for an unlimited subscriber');
    ok('account.html: active Easy Start Unlimited shows unlimited downloads');
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
    assert.strictEqual(text(b2.doc,'su-plan'), 'Easy Start Unlimited', 'Builder must not label an Easy Start subscriber "Easy Pro"');
    assert.strictEqual(text(b2.doc,'su-count'), 'Unlimited');
    assert.strictEqual(text(b2.doc,'dl-counter'), 'Unlimited downloads with Easy Start Unlimited');
    ok('builder.html: sidebar plan name and balance use the shared rules');
  }
  // ── 2d. my-labels.html sidebar ────────────────────────────────────
  {
    const ls = fs.readFileSync('label-library.js','utf8'), rs = fs.readFileSync('label-render.js','utf8');
    const m = await open('my-labels.html', P.pausedWithPayg, w => { w.eval(ls); w.eval(rs); });
    assert.strictEqual(text(m.doc,'su-plan'), 'Easy Start Unlimited (Paused)');
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
    // Subscriber top-ups are retired (2 Oct 2026): current subscribers are
    // unlimited and see no purchase link; everyone else is routed to PAYG.
    const cases = [
      ['activeStart', 'none'], ['cancelScheduled', 'none'],
      ['liveTrial', 'payg'], ['expiredTrial', 'payg'], ['paygConverted', 'payg'],
      ['endedWithPayg', 'payg'], ['pausedWithPayg', 'payg'],
      ['pausedNoPurchases', 'payg'], ['cancelPeriodOver', 'payg'], ['activeProLimit', 'none'],
    ];
    const rs = fs.readFileSync('label-render.js','utf8'), ls = fs.readFileSync('label-library.js','utf8');
    for (const [key, route] of cases) {
      for (const page of ['account.html', 'dashboard.html', 'my-labels.html', 'builder.html']) {
        const extra = page === 'my-labels.html' || page === 'builder.html' ? (w => { w.eval(rs); w.eval(ls); }) : null;
        const { doc } = await open(page, P[key], extra);
        const link = doc.querySelector('.su-topup');
        assert(link, `${page}: sidebar purchase link exists`);
        if (route === 'none') assert.strictEqual(link.style.display, 'none', `${page} ${key}: no purchase link for an unlimited subscriber`);
        else assert.strictEqual(link.getAttribute('href'), 'pricing.html#payg', `${page} ${key}: sidebar link -> PAYG`);
      }
      const d = await open('dashboard.html', P[key]);
      const hasTopup = /top-up/i.test(d.doc.getElementById('db-action-row').textContent);
      assert.strictEqual(hasTopup, false, `dashboard ${key}: no subscriber top-up action (retired)`);
    }
    // account.html ?topup=1 / buyTopup(): ineligible accounts go to PAYG, never the top-up modal.
    for (const [key, route] of cases) {
      const { window: w, doc } = await open('account.html', P[key]);
      let went = null;
      w.eval('window.__go = null');
      try { w.buyTopup(); } catch (e) { went = String(e); }
      assert.strictEqual(doc.getElementById('modal-topup'), null, `account ${key}: the retired top-up modal no longer exists`);
      assert.strictEqual(typeof w.confirmTopup, 'undefined', `account ${key}: no top-up checkout code remains`);
    }
    ok('Account, Dashboard, My Labels and Builder: no subscriber top-ups; unlimited subscribers see no purchase link, everyone else is routed to Pay As You Go');
  }
  // ── Complete entitlement matrix (approved decisions 1-3 + D4) ─────
  {
    const M = [
      // key, PAYG available, subscriber top-ups available, plan name
      ['liveTrial', true, false, 'Easy Trial'], ['expiredTrial', true, false, 'Easy Trial (Expired)'],
      ['paygConverted', true, false, 'Pay As You Go'], ['paygConvertedZero', true, false, 'Pay As You Go'],
      ['activeStart', false, false, 'Easy Start Unlimited'], ['activeProLimit', false, false, 'Easy Pro'],
      ['cancelScheduled', false, false, 'Easy Pro (Cancelled)'],
      ['pausedNoPurchases', true, false, 'Easy Start Unlimited (Paused)'], ['pausedWithPayg', true, false, 'Easy Start Unlimited (Paused)'],
      ['cancelPeriodOver', true, false, 'Easy Pro (Cancelled)'], ['cancelledEnded', true, false, 'Easy Start Unlimited (Cancelled)'],
    ];
    for (const [key, payg, topup, name] of M) {
      const e = E.summarise(P[key] || { plan:'free', subscription_status:'cancelled', downloads_limit:0 });
      assert.deepStrictEqual([e.paygAvailable, e.topupEligible, e.planName], [payg, topup, name], `${key}: PAYG/top-up/plan name`);
      assert.strictEqual(E.outOfDownloadsMessage(e).includes('subscriber top-up'), topup, `${key}: out-of-downloads message route`);
    }
    // After a successful PAYG purchase an ended subscription is Pay As You Go
    // (decision 3) and stays so at zero.
    const ended = E.summarise({ plan:'payg', subscription_status:'payg', deletion_date:iso(-30*DAY), downloads_limit:0, topup_credits:0, is_pro:false });
    assert.strictEqual(ended.planName, 'Pay As You Go');
    const d = await open('dashboard.html', { plan:'payg', subscription_status:'payg', deletion_date:iso(-30*DAY), downloads_limit:0, topup_credits:0 });
    assert.strictEqual(text(d.doc,'db-plan-name'), 'Pay As You Go', 'converted former subscriber never shows (Cancelled)');
    ok('complete entitlement matrix: PAYG vs subscriber top-ups vs plan name for every account state');
  }
  // ── Annual Easy Start Unlimited (the old monthly refill no longer matters) ──
  {
    const { doc } = await open('account.html', P.activeStartAnnualDue);
    assert.strictEqual(text(doc,'su-count'), 'Unlimited', 'annual Easy Start is unlimited');
    assert.strictEqual(text(doc,'dl-count'), 'Unlimited');
    const d = await open('dashboard.html', P.activeStartAnnualDue);
    assert(/^Unlimited/.test(text(d.doc,'db-dl-count')), 'dashboard shows unlimited for an annual subscriber');
    ok('annual Easy Start Unlimited shows unlimited downloads everywhere');
  }
  console.log(`PAYG account display checks passed (${passed} groups)`);
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
