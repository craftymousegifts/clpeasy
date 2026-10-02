// PAYG immediate-supply consent (2 Oct 2026): refund policy wording matches
// the checkout implementation, statutory rights are preserved, and the PAYG
// consent is confined to the PAYG purchase (never the trial or subscriptions).
// Run from repo root: node tests/payg-immediate-supply-consent.js
'use strict';
const fs = require('fs');
const assert = require('assert');

const text = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const refund = text(fs.readFileSync('refund.html', 'utf8'));

// G. The PAYG section describes the real checkout step and confirmation.
assert(/Pay As You Go Downloads/.test(refund), 'PAYG section heading');
assert(/digital download credits that are added to your CLPeasy account after successful payment/.test(refund), 'what PAYG is');
assert(/expressly request immediate supply/.test(refund) && /lose your statutory 14-day right to cancel/.test(refund), 'both consent elements');
assert(/You cannot continue to payment without ticking it/.test(refund), 'consent is required, as enforced at checkout');
assert(/confirmation of this request and acknowledgement is included in the invoice we email to you/.test(refund), 'durable confirmation described');
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

console.log('PAYG immediate-supply consent checks passed');
