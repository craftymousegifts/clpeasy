// PAYG immediate-supply consent (2 Oct 2026): refund policy wording matches
// the checkout implementation, statutory rights are preserved, and the PAYG
// consent is confined to the PAYG purchase (never the trial or subscriptions).
// Run from repo root: node tests/payg-immediate-supply-consent.js
'use strict';
const fs = require('fs');
const assert = require('assert');

const text = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const refundHtml = fs.readFileSync('refund.html', 'utf8');
const refund = text(refundHtml);

// G. The PAYG section describes the real checkout step and confirmation.
assert(/Pay As You Go Downloads/.test(refund), 'PAYG section heading');
assert(/digital download credits that are added to your CLPeasy account after successful payment/.test(refund), 'what PAYG is');
// Conservative policy (3 Oct 2026): the box is a request for the credits to be
// added straight away; it never removes the right to cancel for unused credits.
assert(/ask for the credits to be added to your account straight after payment/.test(refund), 'request for immediate access');
assert(!/lose your statutory 14-day right to cancel/.test(refund) && !/lose your 14-day right/.test(refund), 'no wording that the right to cancel is lost');
assert(/cancel a Pay As You Go purchase within 14 days of the date you paid/.test(refund), '14-day cancellation for PAYG');
assert(/If you have not used any of the credits from that purchase, we will refund the full amount you paid/.test(refund), 'full refund when unused');
assert(/refund the unused credits from that purchase/.test(refund), 'pro-rata refund of unused credits');
assert(/Downloads you have already made are not refunded, unless they were faulty or not delivered/.test(refund), 'used downloads excluded, except faulty or undelivered ones');
// Faulty / undelivered downloads keep their statutory remedy at any time.
assert(/Faulty or undelivered downloads/.test(refund) && /restore the credit or replace the file/.test(refund) && /entitled to a refund for that download, whenever you bought the credits/.test(refund), 'faulty/undelivered remedy independent of the 14 days');
// Pack attribution: oldest pack first; non-credit downloads not counted.
assert(/oldest pack first/.test(refund) && /most recent pack is treated as used last/.test(refund), 'usage attributed to packs oldest first');
assert(/free trial or an Easy Start Unlimited subscription, and free re-downloads of the same label within 7 days/.test(refund), 'downloads that used no credit are not counted');
// Rounding: amount paid x unused / pack size, rounded UP to the penny, capped at the amount paid.
assert(/rounded up to the nearest penny/.test(refund) && /never more than the amount you paid/.test(refund) && /bonus credits included/.test(refund), 'rounding rule stated');
const refundPence = (paid, unused, pack) => Math.min(paid, Math.ceil(paid * unused / pack));
for (const [unused, shown] of [[8, '£4.99'], [5, '£3.12'], [1, '£0.63']]) {
  const p = refundPence(499, unused, 8);
  assert.strictEqual('£' + (p / 100).toFixed(2), shown, `worked example for ${unused} unused credits matches the rule`);
  const html = refundHtml.replace(/&rarr;/g, '→').replace(/&pound;/g, '£');
  assert(new RegExp(`${unused} unused( credits)? → ${shown.replace('.', '\\.')}`).test(html), `example "${unused} unused → ${shown}" shown in the policy`);
}
for (let u = 0; u <= 8; u++) { const p = refundPence(499, u, 8); assert(p >= 499 * u / 8 && p <= 499, `rounding never short-changes and never exceeds the price (${u})`); }
assert(/within 14 days of receiving your cancellation/.test(refund), 'refund timing');
assert(/You cannot continue to payment without ticking it/.test(refund), 'consent is required, as enforced at checkout');
assert(/confirmation of this request, and of your right to cancel described below, is included in the invoice we email to you/.test(refund), 'durable confirmation described');
assert(/charged twice/.test(refund) && /credits were not added correctly/.test(refund) && /technical problem/.test(refund), 'duplicate/technical exceptions kept');

// H. Statutory rights preserved.
assert(refund.includes('Nothing in this policy limits your statutory rights.'), 'statutory-rights sentence preserved');

// I. No absolute no-refund wording anywhere in the policy, and the retired
// top-up section is gone.
assert(!/all sales are final/i.test(refund), 'no "all sales are final"');
assert(!/no refunds under any circumstances/i.test(refund), 'no "no refunds under any circumstances"');
assert(!/non-refundable/i.test(refund), 'no blanket "non-refundable"');
assert(!/Top-Up Download Packs/.test(refund), 'retired top-up section removed');

// Subscriptions keep their own cancellation wording (period end, statutory rights).
assert(/Monthly Subscriptions/.test(refund) && /remain active until the end of your current billing period/.test(refund), 'monthly subscription wording kept');
assert(/Annual Subscriptions/.test(refund), 'annual subscription wording kept');
assert(/14-day free trial/.test(refund), 'free trial wording kept');

// E/F. The consent belongs to the PAYG purchase only: not on the subscription
// checkout page, the sign-up page or the account page.
for (const f of ['checkout.html', 'auth.html', 'account.html']) {
  const src = fs.readFileSync(f, 'utf8');
  assert(!/payg-consent|immediateSupplyConsent/.test(src), `${f} carries no PAYG consent gate`);
}
const pricing = fs.readFileSync('pricing.html', 'utf8');
assert.strictEqual((pricing.match(/id="payg-consent"/g) || []).length, 1, 'one consent box, on the PAYG card');
const paygCard = pricing.slice(pricing.indexOf('id="payg"'), pricing.indexOf('id="easy-start"'));
assert(paygCard.includes('id="payg-consent"'), 'consent box sits on the PAYG card');
assert(!/<input[^>]*id="payg-consent"[^>]*\bchecked\b/.test(pricing), 'consent box is not pre-ticked');
const startCheckoutFn = pricing.slice(pricing.indexOf('async function startCheckout('), pricing.indexOf('async function startCheckout(') + 1500);
assert(!/paygConsentGiven|immediateSupplyConsent/.test(startCheckoutFn), 'subscription checkout is not gated by the PAYG consent');

// D. The server requires the consent and records it on Stripe objects.
const fn = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
assert(/immediateSupplyConsent !== true/.test(fn) && /PAYG_CONSENT_REQUIRED/.test(fn), 'server refuses PAYG without consent');
assert(/payg_immediate_supply_consent/.test(fn) && /invoice_creation\[enabled\]/.test(fn), 'server records consent and enables the confirming invoice');

// PAYG launch bonus wording (owner decision 2 Oct 2026): 3 bonus downloads come
// with EVERY £4.99 pack until 31 Dec 2026 — never "one-off" or "3 FREE" alone.
for (const f of ['pricing.html', 'faq.html']) {
  const t = text(fs.readFileSync(f, 'utf8'));
  assert(!/one-off launch bonus/i.test(t), `${f}: no "one-off launch bonus"`);
  assert(!/3 FREE/.test(t) && !/3 extra downloads FREE/i.test(t), `${f}: no "3 FREE" wording`);
  assert(/3 bonus downloads with every pack until 31 December 2026/.test(t), `${f}: bonus with every pack`);
}
const pricingText = text(pricing);
assert(/8 downloads · includes 3 bonus/.test(pricingText) && /\+3 bonus with every pack · Ends 31 Dec 2026/.test(pricingText), 'PAYG card offer wording');
// Terms clause 6 recognises PAYG credits as a way to access CLPeasy.
const terms = text(fs.readFileSync('terms.html', 'utf8'));
assert(/either an active Easy Start Unlimited subscription or purchased Pay As You Go download credits/.test(terms) && /14-day free trial with no payment card required/.test(terms) && /Purchased credits do not expire/.test(terms), 'Terms recognise PAYG');
assert(/cancel a Pay As You Go purchase within 14 days of payment for a refund of any credits from that purchase you have not used/.test(terms), 'Terms state the PAYG 14-day refund of unused credits');
// The checkbox, server, invoice memo and Stripe note must never claim the
// right to cancel is lost (classification not established).
for (const src of [pricing, fn]) assert(!/lose (my|your) 14-day right to cancel/.test(src), 'no lost-right wording in checkout code');
assert(/payg-immediate-access-unused-refund-2026-10-03/.test(fn), 'new wording version recorded in Stripe metadata');

console.log('PAYG immediate-supply consent checks passed');
