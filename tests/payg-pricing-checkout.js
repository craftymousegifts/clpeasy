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

async function open({ signedIn, pending, response, notice }){
  const calls = [], alerts = [], errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/navigation/i.test(e.message)) errors.push(e.message); });
  vc.on('error', m => errors.push(String(m)));
  const dom = new JSDOM(source, {
    url: 'https://clpeasy.com/pricing.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      if (pending) w.sessionStorage.setItem('checkout_payg', '1');
      if (notice) w.eval(fs.readFileSync('checkout-notice.js', 'utf8')); // <script src> tags are stripped above
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
  // V13 manual E2E regression (26 Sep 2026): an ACTIVE subscriber clicking
  // a plan's "Get started" (e.g. Easy Start monthly -> Easy Pro annual) is
  // refused by the server's existing duplicate-subscription guard (409
  // ALREADY_SUBSCRIBED). The page used to replace that explanation with a
  // generic "Something went wrong starting checkout". It must show the
  // server's message (as account.html already does) and restore the button.
  for (const [code, pattern] of [['ALREADY_SUBSCRIBED', /billing portal/], ['CHECKOUT_IN_PROGRESS', /already in progress/]]) {
    const refusal = { ok: false, status: 409, json: async () => ({ code, error: code === 'ALREADY_SUBSCRIBED'
      ? "You already have an active subscription. Manage or change your plan from your account's billing portal instead of starting a new checkout."
      : 'A checkout is already in progress for this account. Please wait a moment and try again.' }) };
    const { w, calls, alerts, errors } = await open({ signedIn: true, response: refusal, notice: true });
    w.eval("setBilling('annual', document.querySelector('[onclick*=\"annual\"]'))");
    await w.startCheckout('easy_pro');
    assert.strictEqual(calls.length, 1, code + ': the server was asked (and refused)');
    assert(/create-checkout-session/.test(calls[0].url));
    assert.strictEqual(JSON.parse(calls[0].init.body).priceId, 'price_1TdoEXGZLILz5vqUFgTznTUT', code + ': Easy Pro ANNUAL price was requested');
    if (code === 'CHECKOUT_IN_PROGRESS') {
      // Shown in the shared CLPeasy dialog (checkout-notice.js), not an alert;
      // tests/checkout-in-progress-notice.js covers it in Chromium.
      assert.deepStrictEqual(alerts, [], code + ': no browser alert');
      const d = w.document.querySelector('.clp-cn-dialog[role="dialog"]');
      assert(d && /Checkout already in progress/.test(d.textContent), code + ': in-progress dialog shown');
    } else {
      assert.strictEqual(alerts.length, 1, code + ': one message');
      assert(pattern.test(alerts[0]), code + ': shows the server explanation, got: ' + alerts[0]);
      assert(!/Something went wrong/.test(alerts[0]), code + ': not the generic error');
    }
    const btn = w.document.getElementById('btn-easy_pro');
    if (btn) { assert.strictEqual(btn.disabled, false, code + ': button restored'); assert(/Get started/.test(btn.textContent), code + ': button label restored'); }
    assert.deepStrictEqual(errors, []);
  }
  // If checkout-notice.js failed to load, the refusal still shows the
  // server's explanation (never the generic failure).
  {
    const refusal = { ok: false, status: 409, json: async () => ({ code: 'CHECKOUT_IN_PROGRESS', error: 'A checkout is already in progress for this account. Please wait a moment and try again.' }) };
    const { w, alerts } = await open({ signedIn: true, response: refusal });
    await w.startCheckout('easy_start');
    assert.deepStrictEqual(alerts, ['A checkout is already in progress for this account. Please wait a moment and try again.'], 'fallback message');
  }
  // A genuine failure (network/unknown) still shows the generic message.
  {
    const broken = { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
    const { w, alerts } = await open({ signedIn: true, response: broken });
    await w.startCheckout('easy_start');
    assert.strictEqual(alerts.length, 1);
    assert(/Something went wrong starting checkout/.test(alerts[0]), 'unknown failures keep the generic message');
  }
  console.log('PAYG pricing checkout checks passed');
})().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
