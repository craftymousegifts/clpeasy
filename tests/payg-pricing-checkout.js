// Regression: the pricing-page Pay As You Go button (PR #156) threw
// "sb is not defined" / SUPABASE_ANON_KEY on every click, and its sign-up
// redirect used ?return= which auth.html ignores (it only honours ?next=).
// Drives the real pricing.html script with a mocked Supabase and fetch.
// Run from repo root: node tests/payg-pricing-checkout.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync('pricing.html', 'utf8').replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');

async function open({ signedIn, pending, response }){
  const calls = [], alerts = [], errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) errors.push(e.message); });
  vc.on('error', m => errors.push(String(m)));
  const dom = new JSDOM(source, {
    url: 'https://clpeasy.com/pricing.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      if (pending) w.sessionStorage.setItem('checkout_payg', '1');
      w.alert = m => alerts.push(String(m));
      w.scrollTo = () => {};
      w.fetch = async (url, init) => { calls.push({ url, init }); return response || { ok: true, status: 200, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_x' }) }; };
      w.supabase = { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: signedIn ? { access_token: 'user-jwt', user: { id: 'u1', email: 'q@example.com' } } : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      } }) };
    }
  });
  await new Promise(r => setTimeout(r, 200));
  return { w: dom.window, calls, alerts, errors };
}

(async () => {
  // Signed-in click creates a PAYG session with the page's real key and user JWT.
  {
    const { w, calls, alerts, errors } = await open({ signedIn: true });
    await w.startPaygCheckout();
    assert.deepStrictEqual(alerts, [], 'no "Something went wrong" alert');
    assert.deepStrictEqual(errors, [], errors.join('; '));
    assert.strictEqual(calls.length, 1, 'one checkout request');
    assert(/\/functions\/v1\/create-checkout-session$/.test(calls[0].url));
    const body = JSON.parse(calls[0].init.body);
    assert.strictEqual(body.productKey, 'payg_5');
    assert.strictEqual(body.mode, 'payment');
    assert.strictEqual(body.priceId, undefined, 'the browser never chooses the PAYG price');
    assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer user-jwt');
    assert(calls[0].init.headers.apikey && calls[0].init.headers.apikey.startsWith('eyJ'), 'the page anon key is sent');
  }
  // Signed-out click remembers the purchase and sends the maker to sign up
  // with ?next=pricing.html (auth.html ignores ?return=).
  {
    const { w, calls, alerts } = await open({ signedIn: false });
    await w.startPaygCheckout();
    assert.strictEqual(calls.length, 0, 'no checkout for a guest');
    assert.deepStrictEqual(alerts, []);
    assert.strictEqual(w.sessionStorage.getItem('checkout_payg'), '1', 'pending PAYG purchase remembered');
    const script = fs.readFileSync('pricing.html', 'utf8');
    assert(script.includes("auth.html?mode=signup&next=pricing.html"), 'PAYG sign-up redirect uses ?next=');
    assert(!script.includes('&return=pricing.html'), 'the ignored ?return= parameter is gone');
  }
  // After signing in, returning to pricing.html resumes the PAYG checkout once.
  {
    const { w, calls } = await open({ signedIn: true, pending: true });
    w.dispatchEvent(new w.Event('load'));
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(calls.length, 1, 'resumed PAYG checkout started once');
    assert.strictEqual(JSON.parse(calls[0].init.body).productKey, 'payg_5');
    assert.strictEqual(w.sessionStorage.getItem('checkout_payg'), null, 'pending flag cleared so a refresh cannot start a second checkout');
  }
  // v9 billing selector: Annual shows yearly prices and hides the monthly 2026
  // promotion; switching back to Monthly restores the promotional prices
  // exactly (the pre-v9 code reset them to £9.99/£14.99).
  {
    const { w } = await open({ signedIn: false });
    const d = w.document, t = id => d.getElementById(id).textContent.trim();
    const monthly = ['maker-price','maker-period','maker-sub','pro-price','pro-period','pro-sub'].map(t);
    assert.deepStrictEqual([t('maker-price'), t('pro-price')], ['£8.99', '£13.49'], 'monthly shows 2026 promotional prices');
    const [mBtn, aBtn] = d.querySelectorAll('.toggle-btn');
    w.setBilling('annual', aBtn);
    assert.deepStrictEqual([t('maker-price'), t('maker-period'), t('pro-price'), t('pro-period')], ['£99', '/year', '£149', '/year']);
    assert(/Save £20\.88\/year vs standard monthly \(£119\.88\/year\)/.test(t('maker-sub')), 'Easy Start annual saving vs standard monthly');
    assert(/Save £30\.88\/year vs standard monthly \(£179\.88\/year\)/.test(t('pro-sub')), 'Easy Pro annual saving vs standard monthly');
    assert.strictEqual(d.getElementById('maker-promo').style.display, 'none', 'annual view hides the monthly promotion');
    assert.strictEqual(d.getElementById('pro-promo').style.display, 'none');
    w.setBilling('monthly', mBtn);
    assert.deepStrictEqual(['maker-price','maker-period','maker-sub','pro-price','pro-period','pro-sub'].map(t), monthly, 'switching back to Monthly restores the promotional prices exactly');
    assert.strictEqual(d.getElementById('maker-promo').style.display, '', 'monthly promotion visible again');
    assert.strictEqual(d.getElementById('maker-annual-eq').style.display, 'none', 'annual equivalent hidden on monthly');
  }
  // Approved decision 2: the server refuses PAYG for current subscribers; the
  // page explains it and sends them to their subscriber top-ups.
  {
    const refusal = { ok: false, status: 403, json: async () => ({ code: 'PAYG_NOT_FOR_SUBSCRIBERS', error: "Pay As You Go isn't available while you have an Easy Start or Easy Pro subscription. Please use subscriber top-ups from your account page instead." }) };
    const { w, calls, alerts } = await open({ signedIn: true, response: refusal });
    await w.startPaygCheckout();
    assert.strictEqual(calls.length, 1, 'the server was asked (and refused)');
    assert.strictEqual(alerts.length, 1);
    assert(/subscriber top-ups/.test(alerts[0]), 'explains subscriber top-ups');
    assert(!/Something went wrong/.test(alerts[0]), 'not a generic error');
    assert.strictEqual(w.document.getElementById('btn-payg').disabled, false, 'button restored');
  }
  console.log('PAYG pricing checkout checks passed');
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
