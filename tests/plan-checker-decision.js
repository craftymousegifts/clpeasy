// Plan Checker (Sep 2026 audit, approved 3-question model).
//  1. All 36 answer combinations → exact recommended plan and rule.
//  2. Invariants: explicit PAYG preference never overridden; "not sure" and
//     occasional use never give Easy Pro; promotions and account state never
//     change the recommendation.
//  3. Account-state calls-to-action from the shared CLPEntitlement summary.
//  4. The real plan-picker.html page, driven in jsdom with a mocked Supabase.
// Run from repo root: node tests/plan-checker-decision.js
'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const PC = require('../plan-checker.js');
const ENT = require('../entitlement.js');

const DAY = 86400000;
const future = new Date(Date.now() + 10 * DAY).toISOString();
const past = new Date(Date.now() - 2 * DAY).toISOString();

// ── 1. Exact 36-combination table (final proof pass) ────────────────────
// key: volume|frequency|payment → [plan, rule]
const EXPECTED = {
  'upto5|occasional|payg': ['payg', 'R1'], 'upto5|occasional|subscription': ['start', 'R2-occasional'], 'upto5|occasional|none': ['payg', 'R3-occasional'],
  'upto5|ongoing|payg': ['payg', 'R1'], 'upto5|ongoing|subscription': ['start', 'R2-ongoing'], 'upto5|ongoing|none': ['payg', 'R3-ongoing'],
  '6to10|occasional|payg': ['payg', 'R1'], '6to10|occasional|subscription': ['start', 'R2-occasional'], '6to10|occasional|none': ['payg', 'R3-occasional'],
  '6to10|ongoing|payg': ['payg', 'R1'], '6to10|ongoing|subscription': ['start', 'R2-ongoing'], '6to10|ongoing|none': ['payg', 'R3-ongoing'],
  '11to20|occasional|payg': ['payg', 'R1'], '11to20|occasional|subscription': ['start', 'R2-occasional'], '11to20|occasional|none': ['payg', 'R3-occasional'],
  '11to20|ongoing|payg': ['payg', 'R1'], '11to20|ongoing|subscription': ['start', 'R2-ongoing'], '11to20|ongoing|none': ['start', 'R3-ongoing'],
  '21to30|occasional|payg': ['payg', 'R1'], '21to30|occasional|subscription': ['start', 'R2-occasional'], '21to30|occasional|none': ['payg', 'R3-occasional'],
  '21to30|ongoing|payg': ['payg', 'R1'], '21to30|ongoing|subscription': ['pro', 'R2-ongoing'], '21to30|ongoing|none': ['pro', 'R3-ongoing'],
  'over30|occasional|payg': ['payg', 'R1'], 'over30|occasional|subscription': ['start', 'R2-occasional'], 'over30|occasional|none': ['payg', 'R3-occasional'],
  'over30|ongoing|payg': ['payg', 'R1'], 'over30|ongoing|subscription': ['pro', 'R2-ongoing'], 'over30|ongoing|none': ['pro', 'R3-ongoing'],
  'notsure|occasional|payg': ['payg', 'R1'], 'notsure|occasional|subscription': ['start', 'R2-notsure'], 'notsure|occasional|none': ['payg', 'R3-notsure'],
  'notsure|ongoing|payg': ['payg', 'R1'], 'notsure|ongoing|subscription': ['start', 'R2-notsure'], 'notsure|ongoing|none': ['payg', 'R3-notsure'],
};
const combos = [];
for (const volume of PC.VOLUMES) for (const frequency of PC.FREQUENCIES) for (const payment of PC.PAYMENTS) combos.push({ volume, frequency, payment });
assert.strictEqual(combos.length, 36, '6 × 2 × 3 = 36 combinations');
assert.strictEqual(Object.keys(EXPECTED).length, 36);
const counts = { payg: 0, start: 0, pro: 0 };
for (const a of combos) {
  const key = a.volume + '|' + a.frequency + '|' + a.payment;
  const r = PC.decide(a);
  assert.deepStrictEqual([r.plan, r.rule], EXPECTED[key], 'combination ' + key);
  assert(r.reasons.length >= 1, 'every result has a reason: ' + key);
  counts[r.plan]++;
}
assert.deepStrictEqual(counts, { payg: 21, start: 11, pro: 4 }, 'approved distribution');
assert.throws(() => PC.decide({ volume: 'upto5', frequency: 'ongoing' }), /incomplete/);

// Specific approved wording/caveats
const d = (volume, frequency, payment) => PC.decide({ volume, frequency, payment });
assert(/Easy Start \(£9\.99\/month for 20 downloads\) would usually cost less/.test(d('11to20', 'ongoing', 'payg').warning), 'PAYG 11–20 ongoing cost warning');
assert(/Easy Pro \(£14\.99\/month for 30 downloads\) would usually cost less/.test(d('21to30', 'ongoing', 'payg').warning), 'PAYG 21–30 ongoing cost warning');
assert(/£13\.98/.test(d('21to30', 'ongoing', 'none').note), 'Start + top-up comparison is shown for 21–30');
assert(/Pay As You Go \(about £5\) would normally cost less/.test(d('upto5', 'ongoing', 'subscription').warning), 'G2 warning');
assert(/Easy Start \(£9\.99\/month for 20 downloads\) is worth considering/.test(d('6to10', 'ongoing', 'none').note), 'G3 alternative');
assert.strictEqual(d('notsure', 'ongoing', 'none').trialEmphasis, true, 'not sure → trial emphasised');
assert(!/cancel/i.test(JSON.stringify(combos.map(a => PC.decide(a)))), 'never suggests subscribing and cancelling (G1)');

// ── 2. Invariants ────────────────────────────────────────────────────────
for (const a of combos) {
  const r = PC.decide(a);
  if (a.payment === 'payg') assert.strictEqual(r.plan, 'payg', 'explicit PAYG preference never overridden');
  if (a.volume === 'notsure') assert.notStrictEqual(r.plan, 'pro', '"not sure" never gives Easy Pro');
  if (a.frequency === 'occasional') assert.notStrictEqual(r.plan, 'pro', 'occasional use never gives Easy Pro');
  assert(!/reduce risk|trading standards|anxi|confiden|SDS update/i.test(JSON.stringify(r)), 'no anxiety/compliance-worry reasoning');
}
// Promotions never drive the rules: decide() takes no clock and its output is
// identical either side of the offer end date.
const realNow = Date.now;
const before = combos.map(a => PC.decide(a));
Date.now = () => PC.PROMO_END_MS + 30 * DAY;
const afterPromo = combos.map(a => PC.decide(a));
Date.now = realNow;
assert.deepStrictEqual(afterPromo, before, 'promotion dates never change the recommendation');
assert(!/£8\.99|£13\.49|8 downloads|offer/i.test(PC.decide.toString()), 'decide() never reads promotional prices');
// Offer visibility ends with the server's PROMO_2026_END_MS (1 Jan 2027 UTC).
assert.strictEqual(PC.offerVisible(Date.UTC(2026, 11, 31, 23, 59)), true);
assert.strictEqual(PC.offerVisible(Date.UTC(2027, 0, 1)), false);
const serverPromo = fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8');
assert(/PROMO_2026_END_MS = Date\.UTC\(2027, 0, 1\)/.test(serverPromo), 'client offer end matches the server boundary');

// ── 3. Account-state calls-to-action ─────────────────────────────────────
const PROFILES = {
  trialActive: { subscription_status: 'trialing', plan: 'trial', trial_end: future, downloads_limit: 10, downloads_used: 2, topup_credits: 0 },
  trialExpired: { subscription_status: 'trialing', plan: 'trial', trial_end: past, downloads_limit: 10, downloads_used: 10, topup_credits: 0 },
  payg: { subscription_status: 'payg', plan: 'payg', downloads_limit: 0, topup_credits: 3 },
  activeStart: { subscription_status: 'active', plan: 'easy_start', downloads_limit: 20, downloads_used: 4 },
  activePro: { subscription_status: 'active', plan: 'easy_pro', is_pro: true, downloads_limit: 30, downloads_used: 4 },
  cancelScheduled: { subscription_status: 'cancelled', plan: 'easy_pro', is_pro: true, downloads_limit: 30, deletion_date: future },
  paused: { subscription_status: 'paused', plan: 'easy_start', downloads_limit: 20 },
};
const entFor = s => s === 'signedOut' ? null : ENT.summarise(PROFILES[s]);
for (const s of ['signedOut', ...Object.keys(PROFILES)]) assert.strictEqual(PC.accountState(entFor(s)), s, 'account state ' + s);

const PAYG = d('upto5', 'ongoing', 'none'), START = d('11to20', 'ongoing', 'none'), PRO = d('21to30', 'ongoing', 'none'), NOTSURE = d('notsure', 'ongoing', 'none');
const cta = (res, s) => PC.ctas(res, entFor(s));
const msgs = c => c.messages.join(' ');

// Signed out: plan link + trial as the secondary route.
for (const [res, href] of [[PAYG, 'pricing.html#payg'], [START, 'pricing.html#easy-start'], [PRO, 'pricing.html#easy-pro']]) {
  const c = cta(res, 'signedOut');
  assert.strictEqual(c.primary.href, href);
  assert.strictEqual(c.secondary.href, 'auth.html?mode=signup', 'trial is the secondary CTA when signed out');
}
assert(/Try CLPeasy free for 14 days/.test(msgs(cta(NOTSURE, 'signedOut'))), 'not sure → trial prominently offered');
// Signed-in visitors never get a trial CTA.
for (const s of Object.keys(PROFILES)) for (const res of [PAYG, START, PRO]) {
  const c = cta(res, s);
  for (const l of [c.primary, c.secondary]) if (l) assert(!/auth\.html\?mode=signup/.test(l.href), 'no trial CTA for signed-in ' + s);
}
// Active trial + PAYG: the confirmed trial-ending disclosure.
{
  const c = cta(PAYG, 'trialActive');
  assert(msgs(c).includes("Buying Pay As You Go ends your free trial now. Any unused trial downloads won't carry over."));
  assert.strictEqual(c.primary.href, 'pricing.html#payg');
}
assert(!/ends your free trial/.test(msgs(cta(PAYG, 'trialExpired'))), 'no trial disclosure once the trial has ended');
assert.strictEqual(cta(PAYG, 'trialExpired').primary.href, 'pricing.html#payg');
// PAYG customer: buy more, with balance; subscribing keeps purchased downloads.
{
  const c = cta(PAYG, 'payg');
  assert.strictEqual(c.primary.text, 'Buy more downloads →');
  assert(/You have 3 purchased downloads remaining/.test(msgs(c)));
  for (const res of [START, PRO]) {
    const s = cta(res, 'payg');
    assert(msgs(s).includes("Your unused purchased downloads stay on your account. They're used once your monthly allowance runs out, and they never expire."));
    assert.strictEqual(s.primary.href, res === START ? 'pricing.html#easy-start' : 'pricing.html#easy-pro');
  }
}
// Current subscribers: never a working PAYG purchase CTA (server refuses it).
for (const s of ['activeStart', 'activePro', 'cancelScheduled']) {
  const c = cta(PAYG, s);
  for (const l of [c.primary, c.secondary]) if (l) assert(!/#payg/.test(l.href), 'no PAYG purchase for ' + s);
  assert.strictEqual(c.primary.href, 'account.html?topup=1');
}
// Already on the suitable plan.
assert(/You're already on Easy Start\./.test(msgs(cta(START, 'activeStart'))));
assert(/You're already on Easy Pro\./.test(msgs(cta(PRO, 'activePro'))));
// Subscriber plan change: temporary support fallback, never pricing.html or Stripe.
{
  const up = cta(PRO, 'activeStart'), down = cta(START, 'activePro');
  assert(msgs(up).includes('Easy Pro would better match your current usage. To change your plan, contact CLPeasy Support.'));
  assert(msgs(down).includes('Easy Start would cover your current usage. To change your plan, contact CLPeasy Support.'));
  for (const c of [up, down]) {
    assert.strictEqual(c.primary.href, 'support.html');
    assert.strictEqual(c.secondary, null);
  }
}
// Cancellation in paid period / paused: manage in account; paused may buy PAYG.
assert.strictEqual(cta(START, 'cancelScheduled').primary.href, 'account.html');
assert.strictEqual(cta(PRO, 'paused').primary.href, 'account.html');
assert.strictEqual(cta(PAYG, 'paused').primary.href, 'pricing.html#payg');
// No CTA anywhere offers a self-service Stripe plan change.
for (const s of ['signedOut', ...Object.keys(PROFILES)]) for (const res of [PAYG, START, PRO, NOTSURE]) {
  const c = cta(res, s);
  assert(!/stripe|change plan in/i.test(JSON.stringify(c)), 'no Stripe plan-change CTA (' + s + ')');
}
// Account state never changes the recommendation object.
for (const a of combos) {
  const r = PC.decide(a), snapshot = JSON.stringify(r);
  for (const s of ['signedOut', ...Object.keys(PROFILES)]) PC.ctas(r, entFor(s));
  assert.strictEqual(JSON.stringify(r), snapshot, 'ctas() never mutates the recommendation');
}

// ── 4. The real page ─────────────────────────────────────────────────────
const html = fs.readFileSync('plan-picker.html', 'utf8');
assert(!/5 quick questions|of 5\b/.test(html), 'no "5 questions" copy left on the page');
assert(/Question 1 of 3/.test(html));
assert(!/q4|q5/.test(html.replace(/<style[\s\S]*?<\/style>/g, '')), 'only three questions');
assert(!/4 or fewer|4 months/i.test(html), 'no "4 months or fewer" in customer copy');
// .btn-cta sets display:block, so hidden CTAs need an explicit rule or an
// empty outlined button is still drawn.
assert(/\.btn-cta\[hidden\][^{]*\{display:none;\}/.test(html), 'hidden result CTAs are not rendered');
const pageSource = html
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/, '')
  .replace('<script src="entitlement.js"></script>', '<script>' + fs.readFileSync('entitlement.js', 'utf8') + '</script>')
  .replace('<script src="plan-checker.js"></script>', '<script>' + fs.readFileSync('plan-checker.js', 'utf8') + '</script>');

async function openPage(state, opts = {}){
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(pageSource, {
    url: 'https://clpeasy.com/plan-picker.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      w.scrollTo = () => {};
      if (opts.now) { const N = opts.now; w.Date.now = () => N; }
      w.fetch = async () => { throw new Error('no network in tests'); };
      if (opts.noSupabase) return;
      w.supabase = { createClient: () => ({
        auth: { getSession: async () => {
          if (opts.throwSession) throw new Error('offline');
          return { data: { session: state === 'signedOut' ? null : { user: { id: 'u1' } } } };
        } },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: PROFILES[state] || null, error: null }) }) }) }),
      }) };
    }
  });
  return { w: dom.window, errors };
}
async function answer(w, q1, q2, q3){
  const click = (q, v) => w.document.querySelector('#' + q + ' .option[data-value="' + v + '"]').click();
  click('q1', q1); w.nextQuestion(2); click('q2', q2); w.nextQuestion(3); click('q3', q3);
  await w.showResult();
  const $ = id => w.document.getElementById(id);
  return {
    plan: $('result-card').dataset.plan, account: $('result-card').dataset.account,
    name: $('result-plan').textContent, primary: $('result-primary').getAttribute('href'), primaryText: $('result-primary').textContent,
    secondary: $('result-secondary').hidden ? null : $('result-secondary').getAttribute('href'),
    account_msgs: $('result-account').textContent, boxes: $('result-boxes').textContent,
    offerHidden: $('result-offer').hidden, offer: $('result-offer-text').textContent,
    features: $('result-features').textContent, text: $('result-card').textContent,
  };
}

(async () => {
  // Every combination through the real page, signed out.
  for (const a of combos) {
    const { w, errors } = await openPage('signedOut');
    const r = await answer(w, a.volume, a.frequency, a.payment);
    assert.strictEqual(r.plan, EXPECTED[a.volume + '|' + a.frequency + '|' + a.payment][0], 'page result ' + JSON.stringify(a));
    assert.strictEqual(r.name, PC.PLANS[r.plan].name);
    assert.strictEqual(r.secondary, 'auth.html?mode=signup');
    assert.deepStrictEqual(errors, [], errors.join('; '));
  }
  // The original light-use mobile test now gives Pay As You Go.
  {
    const { w } = await openPage('signedOut');
    const r = await answer(w, '6to10', 'occasional', 'none');
    assert.strictEqual(r.plan, 'payg');
  }
  // Easy Pro card: factual proposition only.
  {
    const { w } = await openPage('signedOut');
    const r = await answer(w, '21to30', 'ongoing', 'none');
    assert(/30 downloads a month/.test(r.features) && /Priority support — we aim to reply within 1 working day\./.test(r.features) && /Top-ups/.test(r.features));
    assert(!/reduce risk|confidence|Trading Standards|SDS/i.test(r.text));
    assert(/£13\.98/.test(r.boxes));
  }
  // Offer box: shown before the end date, hidden after; recommendation unchanged.
  {
    const a = await answer((await openPage('signedOut', { now: Date.UTC(2026, 9, 1) })).w, '11to20', 'ongoing', 'none');
    const b = await answer((await openPage('signedOut', { now: Date.UTC(2027, 0, 2) })).w, '11to20', 'ongoing', 'none');
    assert.strictEqual(a.offerHidden, false);
    assert.strictEqual(a.offer, '£8.99/month until 31 December 2026, then £9.99/month.');
    assert.strictEqual(b.offerHidden, true, 'expired offer copy is not shown');
    assert.strictEqual(a.plan, b.plan);
    const p = await answer((await openPage('signedOut', { now: Date.UTC(2026, 9, 1) })).w, 'upto5', 'ongoing', 'none');
    assert.strictEqual(p.offer, 'Get 8 downloads for £4.99 until 31 December 2026.');
    assert(!/8 downloads/.test(p.text.replace(p.offer, '')), 'PAYG offer appears only in the separate offer box');
  }
  // Account states through the page: CTA changes, recommendation never does.
  const pageCases = [
    ['trialActive', 'upto5', 'pricing.html#payg', /ends your free trial now/],
    ['trialExpired', 'upto5', 'pricing.html#payg', null],
    ['payg', '11to20', 'pricing.html#easy-start', /purchased downloads stay on your account/],
    ['activeStart', '21to30', 'support.html', /Easy Pro would better match your current usage/],
    ['activePro', '11to20', 'support.html', /Easy Start would cover your current usage/],
    ['activeStart', 'upto5', 'account.html?topup=1', /isn't available while you have an Easy Start or Easy Pro subscription/],
    ['cancelScheduled', 'upto5', 'account.html?topup=1', /isn't available/],
    ['paused', '21to30', 'account.html', /currently paused/],
  ];
  for (const [state, vol, href, re] of pageCases) {
    const { w, errors } = await openPage(state);
    const r = await answer(w, vol, 'ongoing', 'none');
    assert.strictEqual(r.account, state, 'page account state ' + state);
    assert.strictEqual(r.plan, EXPECTED[vol + '|ongoing|none'][0], 'account state never changes the plan (' + state + ')');
    assert.strictEqual(r.primary, href, 'primary CTA for ' + state);
    assert.notStrictEqual(r.secondary, 'auth.html?mode=signup', 'no trial CTA when signed in');
    if (re) assert(re.test(r.account_msgs), state + ' message');
    assert.deepStrictEqual(errors, [], errors.join('; '));
  }
  // Lookup failure / missing Supabase → signed-out CTAs, same plan.
  for (const opts of [{ throwSession: true }, { noSupabase: true }]) {
    const { w, errors } = await openPage('activePro', opts);
    const r = await answer(w, '21to30', 'ongoing', 'none');
    assert.strictEqual(r.account, 'signedOut');
    assert.strictEqual(r.plan, 'pro');
    assert.strictEqual(r.primary, 'pricing.html#easy-pro');
    assert.deepStrictEqual(errors, [], errors.join('; '));
  }
  // Back and Retake.
  {
    const { w } = await openPage('signedOut');
    const $ = id => w.document.getElementById(id);
    w.document.querySelector('#q1 .option[data-value="upto5"]').click(); w.nextQuestion(2);
    assert.strictEqual($('progress-label').textContent, 'Question 2 of 3');
    w.prevQuestion(1);
    assert($('q1').classList.contains('active'));
    assert.strictEqual($('progress-label').textContent, 'Question 1 of 3');
    await answer(w, 'upto5', 'ongoing', 'none');
    w.retake();
    assert(!$('result-card').classList.contains('show'));
    assert($('q1').classList.contains('active'));
    assert.strictEqual(w.document.querySelectorAll('.option.selected').length, 0);
    assert.strictEqual($('progress-label').textContent, 'Question 1 of 3');
  }
  console.log('plan checker checks passed (36 combinations, invariants, ' + pageCases.length + ' account-state page cases, CTA matrix, offer expiry, Back/Retake)');
})().catch(e => { console.error(e); process.exit(1); });
