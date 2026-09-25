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

async function open({ signedIn, pending }){
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
      w.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_x' }) }; };
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
  console.log('PAYG pricing checkout checks passed');
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
