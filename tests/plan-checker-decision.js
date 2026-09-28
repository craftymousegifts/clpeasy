// Plan Checker (Sep 2026 audit, approved branching model).
//  1. Branching: path(), prune(), complete(), usage() and all 27 valid paths
//     → exact recommended plan and rule.
//  2. Invariants: explicit PAYG preference never overridden; "just getting
//     started" and occasional use never give Easy Pro; promotions and account
//     state never change the recommendation.
//  3. Account-state calls-to-action from the shared CLPEntitlement summary.
//  4. The real plan-picker.html page in jsdom with a mocked Supabase:
//     auto-advance, no Next buttons, Back along the real branch, cleared
//     downstream answers, no premature result, CTAs per account state.
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
const key = a => [a.frequency, a.labels || '-', a.printing || '-', a.payment].join('|');

// ── 1. Branching ─────────────────────────────────────────────────────────
assert.deepStrictEqual(PC.path({}), ['frequency', 'payment']);
assert.deepStrictEqual(PC.path({ frequency: 'notsure' }), ['frequency', 'payment'], 'just starting: no usage questions');
assert.deepStrictEqual(PC.path({ frequency: 'occasional' }), ['frequency', 'payment'], 'occasional: no usage questions');
assert.deepStrictEqual(PC.path({ frequency: 'ongoing' }), ['frequency', 'labels', 'payment']);
assert.deepStrictEqual(PC.path({ frequency: 'ongoing', labels: 'upto10' }), ['frequency', 'labels', 'payment'], 'up to 10: no printing question');
assert.deepStrictEqual(PC.path({ frequency: 'ongoing', labels: '11to20' }), ['frequency', 'labels', 'printing', 'payment']);
assert.deepStrictEqual(PC.path({ frequency: 'ongoing', labels: 'over20' }), ['frequency', 'labels', 'printing', 'payment']);
assert.deepStrictEqual(PC.prune({ frequency: 'occasional', labels: 'over20', printing: 'separate', payment: 'none' }), { frequency: 'occasional', payment: 'none' },
  'changing to occasional clears the usage answers');
assert.deepStrictEqual(PC.prune({ frequency: 'ongoing', labels: 'upto10', printing: 'separate', payment: 'none' }), { frequency: 'ongoing', labels: 'upto10', payment: 'none' },
  'changing to up to 10 clears the printing answer');
assert.strictEqual(PC.complete({ frequency: 'ongoing', payment: 'none' }), false);
assert.strictEqual(PC.complete({ frequency: 'ongoing', labels: 'over20', payment: 'none' }), false, 'printing required for more than 10');
assert.strictEqual(PC.complete({ frequency: 'ongoing', labels: 'over20', printing: 'separate', payment: 'none' }), true);
assert.throws(() => PC.decide({ frequency: 'ongoing', labels: '11to20', payment: 'none' }), /incomplete/, 'no result before every required answer');
assert.throws(() => PC.decide({ frequency: 'weekly', payment: 'none' }), /incomplete/);

// Derived usage levels (approved mapping).
const u = (labels, printing) => PC.usage({ frequency: 'ongoing', labels, printing });
assert.strictEqual(u('upto10').level, 'low');
assert.strictEqual(u('11to20', 'combined').level, 'low');
assert.strictEqual(u('over20', 'combined').level, 'low');
assert.strictEqual(u('11to20', 'separate').level, 'medium');
assert.strictEqual(u('11to20', 'notsure').level, 'medium');
assert.strictEqual(u('over20', 'separate').level, 'high');
assert.strictEqual(u('over20', 'notsure').level, 'medium');
assert.strictEqual(u('over20', 'notsure').maybePro, true);
assert.strictEqual(PC.usage({ frequency: 'occasional' }), null);
assert.strictEqual(PC.usage({ frequency: 'notsure' }), null);

// Every valid path → [plan, rule]
const EXPECTED = {
  'notsure|-|-|payg': ['payg', 'R1'], 'notsure|-|-|subscription': ['start', 'R2-notsure'], 'notsure|-|-|none': ['payg', 'R3-notsure'],
  'occasional|-|-|payg': ['payg', 'R1'], 'occasional|-|-|subscription': ['start', 'R2-occasional'], 'occasional|-|-|none': ['payg', 'R3-occasional'],
  'ongoing|upto10|-|payg': ['payg', 'R1'], 'ongoing|upto10|-|subscription': ['start', 'R2-low'], 'ongoing|upto10|-|none': ['payg', 'R3-low'],
  'ongoing|11to20|combined|payg': ['payg', 'R1'], 'ongoing|11to20|combined|subscription': ['start', 'R2-low'], 'ongoing|11to20|combined|none': ['payg', 'R3-low'],
  'ongoing|11to20|separate|payg': ['payg', 'R1'], 'ongoing|11to20|separate|subscription': ['start', 'R2-medium'], 'ongoing|11to20|separate|none': ['start', 'R3-medium'],
  'ongoing|11to20|notsure|payg': ['payg', 'R1'], 'ongoing|11to20|notsure|subscription': ['start', 'R2-medium'], 'ongoing|11to20|notsure|none': ['start', 'R3-medium'],
  'ongoing|over20|combined|payg': ['payg', 'R1'], 'ongoing|over20|combined|subscription': ['start', 'R2-low'], 'ongoing|over20|combined|none': ['payg', 'R3-low'],
  'ongoing|over20|separate|payg': ['payg', 'R1'], 'ongoing|over20|separate|subscription': ['pro', 'R2-high'], 'ongoing|over20|separate|none': ['pro', 'R3-high'],
  'ongoing|over20|notsure|payg': ['payg', 'R1'], 'ongoing|over20|notsure|subscription': ['start', 'R2-medium'], 'ongoing|over20|notsure|none': ['start', 'R3-medium'],
};
const paths = PC.allPaths();
assert.strictEqual(paths.length, 27, '27 valid answer paths');
assert.strictEqual(Object.keys(EXPECTED).length, 27);
assert.deepStrictEqual(paths.map(key).sort(), Object.keys(EXPECTED).sort(), 'allPaths() covers exactly the expected paths');
const counts = { payg: 0, start: 0, pro: 0 };
for (const a of paths) {
  const r = PC.decide(a);
  assert.deepStrictEqual([r.plan, r.rule], EXPECTED[key(a)], 'path ' + key(a));
  assert(r.reasons.length >= 1, 'every result has a reason: ' + key(a));
  assert.strictEqual(r.exportNote, "You only use a download when you export a label file. Printing more copies of a file you've already downloaded is free.");
  assert.strictEqual(!!r.estimateNote, a.frequency === 'ongoing', 'reprint/estimate note only when usage is estimated from label volume: ' + key(a));
  counts[r.plan]++;
}
assert.deepStrictEqual(counts, { payg: 14, start: 11, pro: 2 });

// Specific approved wording/caveats
const d = a => PC.decide(a);
assert(/Easy Start \(£9\.99\/month for 20 downloads\) would usually cost less/.test(d({ frequency: 'ongoing', labels: '11to20', printing: 'separate', payment: 'payg' }).warning));
assert(/Easy Pro \(£14\.99\/month for 30 downloads/.test(d({ frequency: 'ongoing', labels: 'over20', printing: 'separate', payment: 'payg' }).warning));
assert(!d({ frequency: 'ongoing', labels: 'over20', printing: 'combined', payment: 'payg' }).warning, 'combined sheets: no high-usage cost warning');
assert(/£13\.98/.test(d({ frequency: 'ongoing', labels: 'over20', printing: 'separate', payment: 'none' }).note), 'Start + top-up comparison for high usage');
assert(/Easy Pro includes 30/.test(d({ frequency: 'ongoing', labels: 'over20', printing: 'notsure', payment: 'none' }).note), 'more than 20 + not sure → maybe-Pro note');
assert(!d({ frequency: 'ongoing', labels: '11to20', printing: 'notsure', payment: 'none' }).note, '11–20 + not sure has no maybe-Pro note');
assert(/Pay As You Go would usually cost the same as or less/.test(d({ frequency: 'ongoing', labels: 'upto10', payment: 'subscription' }).warning), 'low usage + subscription preference warning');
assert(/Pay As You Go would usually cost less than a year-round subscription/.test(d({ frequency: 'occasional', payment: 'subscription' }).warning));
assert(/combine several different labels/.test(d({ frequency: 'ongoing', labels: '11to20', printing: 'combined', payment: 'none' }).reasons[0]));
assert.strictEqual(d({ frequency: 'notsure', payment: 'none' }).trialEmphasis, true);
assert(!/cancel/i.test(JSON.stringify(paths.map(d))), 'never suggests subscribing and cancelling');

// ── 2. Invariants ────────────────────────────────────────────────────────
for (const a of paths) {
  const r = d(a);
  if (a.payment === 'payg') assert.strictEqual(r.plan, 'payg', 'explicit PAYG preference never overridden');
  if (a.frequency === 'notsure') assert.notStrictEqual(r.plan, 'pro', 'just starting never gives Easy Pro');
  if (a.frequency === 'occasional') assert.notStrictEqual(r.plan, 'pro', 'occasional never gives Easy Pro');
  if (a.printing === 'combined' || a.printing === 'notsure') assert.notStrictEqual(r.plan, 'pro', 'uncertain or combined printing never gives Easy Pro');
  assert(!/reduce risk|trading standards|anxi|confiden|SDS update/i.test(JSON.stringify(r)), 'no anxiety/compliance-worry reasoning');
}
const realNow = Date.now;
const before = paths.map(d);
Date.now = () => PC.PROMO_END_MS + 30 * DAY;
const afterPromo = paths.map(d);
Date.now = realNow;
assert.deepStrictEqual(afterPromo, before, 'promotion dates never change the recommendation');
assert(!/£8\.99|£13\.49|8 downloads|offer/i.test(PC.decide.toString()), 'decide() never reads promotional prices');
assert.strictEqual(PC.offerVisible(Date.UTC(2026, 11, 31, 23, 59)), true);
assert.strictEqual(PC.offerVisible(Date.UTC(2027, 0, 1)), false);
assert(/PROMO_2026_END_MS = Date\.UTC\(2027, 0, 1\)/.test(fs.readFileSync('supabase/functions/create-checkout-session/index.ts', 'utf8')),
  'client offer end matches the server boundary');

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
const STATES = ['signedOut', ...Object.keys(PROFILES)];
const entFor = s => s === 'signedOut' ? null : ENT.summarise(PROFILES[s]);
for (const s of STATES) assert.strictEqual(PC.accountState(entFor(s)), s, 'account state ' + s);

const A_PAYG = { frequency: 'ongoing', labels: 'upto10', payment: 'none' };
const A_START = { frequency: 'ongoing', labels: '11to20', printing: 'separate', payment: 'none' };
const A_PRO = { frequency: 'ongoing', labels: 'over20', printing: 'separate', payment: 'none' };
const A_NOTSURE = { frequency: 'notsure', payment: 'none' };
const PAYG = d(A_PAYG), START = d(A_START), PRO = d(A_PRO), NOTSURE = d(A_NOTSURE);
const cta = (res, s) => PC.ctas(res, entFor(s));
const msgs = c => c.messages.join(' ');

for (const [res, href] of [[PAYG, 'pricing.html#payg'], [START, 'pricing.html#easy-start'], [PRO, 'pricing.html#easy-pro']]) {
  const c = cta(res, 'signedOut');
  assert.strictEqual(c.primary.href, href);
  assert.strictEqual(c.secondary.href, 'auth.html?mode=signup', 'trial is the secondary CTA when signed out');
}
assert(/Try CLPeasy free for 14 days/.test(msgs(cta(NOTSURE, 'signedOut'))), 'just starting → trial prominently offered');
for (const s of Object.keys(PROFILES)) for (const res of [PAYG, START, PRO]) {
  const c = cta(res, s);
  for (const l of [c.primary, c.secondary]) if (l) assert(!/auth\.html\?mode=signup/.test(l.href), 'no trial CTA for signed-in ' + s);
}
{
  const c = cta(PAYG, 'trialActive');
  assert(msgs(c).includes("Buying Pay As You Go ends your free trial now. Any unused trial downloads won't carry over."));
  assert.strictEqual(c.primary.href, 'pricing.html#payg');
}
assert(!/ends your free trial/.test(msgs(cta(PAYG, 'trialExpired'))));
{
  const c = cta(PAYG, 'payg');
  assert.strictEqual(c.primary.text, 'Buy more downloads →');
  assert(/You have 3 purchased downloads remaining/.test(msgs(c)));
  for (const res of [START, PRO]) assert(msgs(cta(res, 'payg')).includes("Your unused purchased downloads stay on your account. They're used once your monthly allowance runs out, and they never expire."));
}
for (const s of ['activeStart', 'activePro', 'cancelScheduled']) {
  const c = cta(PAYG, s);
  for (const l of [c.primary, c.secondary]) if (l) assert(!/#payg/.test(l.href), 'no PAYG purchase for ' + s);
  assert.strictEqual(c.primary.href, 'account.html?topup=1');
}
assert(/You're already on Easy Start\./.test(msgs(cta(START, 'activeStart'))));
assert(/You're already on Easy Pro\./.test(msgs(cta(PRO, 'activePro'))));
{
  const up = cta(PRO, 'activeStart'), down = cta(START, 'activePro');
  assert(msgs(up).includes('Easy Pro would better match your current usage. To change your plan, contact CLPeasy Support.'));
  assert(msgs(down).includes('Easy Start would cover your current usage. To change your plan, contact CLPeasy Support.'));
  for (const c of [up, down]) { assert.strictEqual(c.primary.href, 'support.html'); assert.strictEqual(c.secondary, null); }
}
assert.strictEqual(cta(START, 'cancelScheduled').primary.href, 'account.html');
assert.strictEqual(cta(PRO, 'paused').primary.href, 'account.html');
assert.strictEqual(cta(PAYG, 'paused').primary.href, 'pricing.html#payg');
for (const s of STATES) for (const res of [PAYG, START, PRO, NOTSURE]) assert(!/stripe|change plan in/i.test(JSON.stringify(cta(res, s))), 'no Stripe plan-change CTA');
for (const a of paths) {
  const r = d(a), snapshot = JSON.stringify(r);
  for (const s of STATES) PC.ctas(r, entFor(s));
  assert.strictEqual(JSON.stringify(r), snapshot, 'ctas() never mutates the recommendation');
}

// ── 4. The real page ─────────────────────────────────────────────────────
const html = fs.readFileSync('plan-picker.html', 'utf8');
assert(!/btn-next|Next →|See my recommendation/.test(html), 'no Next buttons');
assert(!/quick questions and CLPeasy will recommend|3 quick questions|of [2-5]\b/.test(html.replace('Answer a few quick questions and CLPeasy will recommend', '')), 'no fixed question totals');
assert(/A few quick questions/.test(html));
assert(/\.btn-cta\[hidden\][^{]*\{display:none;\}/.test(html), 'hidden result CTAs are not rendered');
assert(/@media \(prefers-reduced-motion: reduce\)\{[^}]*\.question-card,\.result-card\{animation:none;\}/.test(html), 'reduced motion disables the transitions');
assert(!/4 or fewer|4 months/i.test(html), 'no "4 months or fewer" in customer copy');
for (const m of html.match(/<button[^>]*class="option"[^>]*>/g)) assert(/type="button"/.test(m) && /aria-pressed="false"/.test(m), 'options are keyboard-operable buttons with pressed state');
const pageSource = html
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/, '')
  .replace('<script src="entitlement.js"></script>', '<script>' + fs.readFileSync('entitlement.js', 'utf8') + '</script>')
  .replace('<script src="plan-checker.js"></script>', '<script>' + fs.readFileSync('plan-checker.js', 'utf8') + '</script>');

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function openPage(state, opts = {}){
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(pageSource, {
    url: 'https://clpeasy.com/plan-picker.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      w.__scrolls = [];
      w.scrollTo = o => w.__scrolls.push(o);
      if (opts.reducedMotion !== undefined) w.matchMedia = q => ({ matches: /prefers-reduced-motion: reduce/.test(q) && opts.reducedMotion, addListener(){}, removeListener(){} });
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
const $ = (w, id) => w.document.getElementById(id);
const activeQ = w => { const c = w.document.querySelector('.question-card.active'); return c ? c.dataset.q : null; };
const pressed = (w, q) => [...w.document.querySelectorAll('#q-' + q + ' .option[aria-pressed="true"]')].map(o => o.dataset.value);
function click(w, q, v){ w.document.querySelector('#q-' + q + ' .option[data-value="' + v + '"]').click(); }
async function pick(w, q, v){ click(w, q, v); await sleep(300); }
async function run(w, a){
  const seen = [];
  for (;;) {
    const q = activeQ(w);
    if (!q) break;
    seen.push(q);
    await pick(w, q, a[q]);
  }
  await sleep(30);
  return seen;
}
function readResult(w){
  return {
    shown: $(w, 'result-card').classList.contains('show'),
    plan: $(w, 'result-card').dataset.plan, account: $(w, 'result-card').dataset.account,
    name: $(w, 'result-plan').textContent, primary: $(w, 'result-primary').getAttribute('href'),
    secondary: $(w, 'result-secondary').hidden ? null : $(w, 'result-secondary').getAttribute('href'),
    account_msgs: $(w, 'result-account').textContent, boxes: $(w, 'result-boxes').textContent,
    offerHidden: $(w, 'result-offer').hidden, offer: $(w, 'result-offer-text').textContent,
    footnotes: $(w, 'result-footnotes').textContent, features: $(w, 'result-features').textContent, text: $(w, 'result-card').textContent,
  };
}

(async () => {
  // Every valid path through real clicks, signed out: only the questions on
  // that customer's path are shown, and the progress label never shows a total.
  for (const a of paths) {
    const { w, errors } = await openPage('signedOut');
    const labels = [];
    const seen = [];
    for (;;) {
      const q = activeQ(w);
      if (!q) break;
      seen.push(q);
      labels.push($(w, 'progress-label').textContent);
      assert.strictEqual(w.document.querySelector('#q-' + q + ' .q-number').textContent, 'Question ' + seen.length);
      await pick(w, q, a[q]);
    }
    await sleep(30);
    assert.deepStrictEqual(seen, PC.path(a), 'questions shown for ' + key(a));
    assert.deepStrictEqual(labels, seen.map((_, i) => 'Question ' + (i + 1)));
    const r = readResult(w);
    assert.strictEqual(r.shown, true);
    assert.strictEqual(r.plan, EXPECTED[key(a)][0], 'page result ' + key(a));
    assert.strictEqual(r.name, PC.PLANS[r.plan].name);
    assert.strictEqual(r.secondary, 'auth.html?mode=signup');
    assert(r.footnotes.includes("You only use a download when you export a label file."));
    assert.deepStrictEqual(errors, [], errors.join('; '));
  }

  // Auto-advance: selection shows first, the next question follows ~250ms
  // later, repeated clicks during the transition are ignored, focus moves.
  {
    const { w } = await openPage('signedOut');
    click(w, 'frequency', 'ongoing');
    assert.deepStrictEqual(pressed(w, 'frequency'), ['ongoing'], 'answer visibly selected immediately');
    assert.strictEqual(activeQ(w), 'frequency', 'no instant jump');
    click(w, 'frequency', 'occasional');
    await sleep(120);
    assert.strictEqual(activeQ(w), 'frequency');
    await sleep(200);
    assert.strictEqual(activeQ(w), 'labels', 'advanced automatically to the volume question');
    assert.deepStrictEqual(pressed(w, 'frequency'), ['ongoing'], 'repeated click during the transition ignored');
    assert.strictEqual(w.document.activeElement, w.document.querySelector('#q-labels .q-text'), 'focus moves to the new question');
    assert.strictEqual(w.document.querySelectorAll('.btn-next').length, 0);
    assert(![...w.document.querySelectorAll('button')].some(b => /^\s*Next/.test(b.textContent)), 'no Next button anywhere');
  }

  // Back follows the actual branch and keeps the previous selection; a
  // changed answer advances again; answers that no longer apply are cleared.
  {
    const { w } = await openPage('signedOut');
    await pick(w, 'frequency', 'ongoing');
    await pick(w, 'labels', 'over20');
    await pick(w, 'printing', 'separate');
    assert.strictEqual(activeQ(w), 'payment');
    assert.strictEqual($(w, 'progress-label').textContent, 'Question 4');
    w.document.querySelector('#q-payment .btn-back').click();
    assert.strictEqual(activeQ(w), 'printing');
    assert.deepStrictEqual(pressed(w, 'printing'), ['separate'], 'previous selection shown on Back');
    w.document.querySelector('#q-printing .btn-back').click();
    assert.strictEqual(activeQ(w), 'labels');
    await pick(w, 'labels', 'upto10');
    assert.strictEqual(activeQ(w), 'payment', 'up to 10 skips the printing question');
    assert.strictEqual($(w, 'progress-label').textContent, 'Question 3');
    w.document.querySelector('#q-payment .btn-back').click();
    assert.strictEqual(activeQ(w), 'labels', 'Back from payment returns to the volume question on this branch');
    w.document.querySelector('#q-labels .btn-back').click();
    assert.strictEqual(activeQ(w), 'frequency');
    assert.deepStrictEqual(pressed(w, 'frequency'), ['ongoing']);
    await pick(w, 'frequency', 'occasional');
    assert.strictEqual(activeQ(w), 'payment', 'occasional goes straight to payment');
    assert.strictEqual($(w, 'progress-label').textContent, 'Question 2');
    w.document.querySelector('#q-payment .btn-back').click();
    assert.strictEqual(activeQ(w), 'frequency', 'Back from payment returns to Q1 on the occasional branch');
    await pick(w, 'frequency', 'ongoing');
    assert.deepStrictEqual(pressed(w, 'labels'), [], 'usage answer cleared after switching to occasional and back');
    await pick(w, 'labels', '11to20');
    assert.deepStrictEqual(pressed(w, 'printing'), [], 'printing answer cleared');
    // Result cannot appear before every required answer.
    await w.showResult();
    assert.strictEqual($(w, 'result-card').classList.contains('show'), false, 'no premature result');
    await pick(w, 'printing', 'combined');
    await pick(w, 'payment', 'none');
    await sleep(30);
    const r = readResult(w);
    assert.strictEqual(r.plan, 'payg', '11–20 combined on sheets → low usage → Pay As You Go');
    assert(r.footnotes.includes("If you mostly reprint label files you've already downloaded"));
    assert.strictEqual(w.document.activeElement, $(w, 'result-plan'), 'focus moves to the result');
    w.retake();
    assert.strictEqual(activeQ(w), 'frequency');
    assert.strictEqual(w.document.querySelectorAll('.option.selected').length, 0);
    assert.strictEqual($(w, 'progress-label').textContent, 'Question 1');
  }

  // Reduced motion: scrolling is instant (CSS removes the fade, asserted above).
  {
    const { w } = await openPage('signedOut', { reducedMotion: true });
    await pick(w, 'frequency', 'notsure');
    assert.strictEqual(w.__scrolls.pop().behavior, 'auto');
    const { w: w2 } = await openPage('signedOut', { reducedMotion: false });
    await pick(w2, 'frequency', 'notsure');
    assert.strictEqual(w2.__scrolls.pop().behavior, 'smooth');
  }

  // Easy Pro card: factual proposition only.
  {
    const { w } = await openPage('signedOut');
    await run(w, A_PRO);
    const r = readResult(w);
    assert.strictEqual(r.plan, 'pro');
    assert(/30 downloads a month/.test(r.features) && /Priority support — we aim to reply within 1 working day\./.test(r.features) && /Top-ups/.test(r.features));
    assert(!/reduce risk|confidence|Trading Standards|SDS/i.test(r.text));
    assert(/£13\.98/.test(r.boxes));
  }
  // Offer box: shown before the end date, hidden after; recommendation unchanged.
  {
    const w1 = (await openPage('signedOut', { now: Date.UTC(2026, 9, 1) })).w; await run(w1, A_START);
    const w2 = (await openPage('signedOut', { now: Date.UTC(2027, 0, 2) })).w; await run(w2, A_START);
    const a = readResult(w1), b = readResult(w2);
    assert.strictEqual(a.offerHidden, false);
    assert.strictEqual(a.offer, '£8.99/month until 31 December 2026, then £9.99/month.');
    assert.strictEqual(b.offerHidden, true, 'expired offer copy is not shown');
    assert.strictEqual(a.plan, b.plan);
    const w3 = (await openPage('signedOut', { now: Date.UTC(2026, 9, 1) })).w; await run(w3, A_PAYG);
    const p = readResult(w3);
    assert.strictEqual(p.offer, 'Get 8 downloads for £4.99 until 31 December 2026.');
    assert(!/8 downloads/.test(p.text.replace(p.offer, '')), 'PAYG offer only in the separate offer box');
  }
  // Account states through the page: CTA changes, recommendation never does.
  const pageCases = [
    ['trialActive', A_PAYG, 'pricing.html#payg', /ends your free trial now/],
    ['trialExpired', A_PAYG, 'pricing.html#payg', null],
    ['payg', A_START, 'pricing.html#easy-start', /purchased downloads stay on your account/],
    ['activeStart', A_PRO, 'support.html', /Easy Pro would better match your current usage/],
    ['activePro', A_START, 'support.html', /Easy Start would cover your current usage/],
    ['activeStart', A_PAYG, 'account.html?topup=1', /isn't available while you have an Easy Start or Easy Pro subscription/],
    ['cancelScheduled', A_PAYG, 'account.html?topup=1', /isn't available/],
    ['paused', A_PRO, 'account.html', /currently paused/],
  ];
  for (const [state, a, href, re] of pageCases) {
    const { w, errors } = await openPage(state);
    await run(w, a);
    const r = readResult(w);
    assert.strictEqual(r.account, state, 'page account state ' + state);
    assert.strictEqual(r.plan, EXPECTED[key(a)][0], 'account state never changes the plan (' + state + ')');
    assert.strictEqual(r.primary, href, 'primary CTA for ' + state);
    assert.notStrictEqual(r.secondary, 'auth.html?mode=signup', 'no trial CTA when signed in');
    if (re) assert(re.test(r.account_msgs), state + ' message');
    assert.deepStrictEqual(errors, [], errors.join('; '));
  }
  // Lookup failure / missing Supabase → signed-out CTAs, same plan.
  for (const opts of [{ throwSession: true }, { noSupabase: true }]) {
    const { w, errors } = await openPage('activePro', opts);
    await run(w, A_PRO);
    const r = readResult(w);
    assert.strictEqual(r.account, 'signedOut');
    assert.strictEqual(r.plan, 'pro');
    assert.strictEqual(r.primary, 'pricing.html#easy-pro');
    assert.deepStrictEqual(errors, [], errors.join('; '));
  }
  console.log('plan checker checks passed (27 branching paths, invariants, auto-advance, Back/branch clearing, ' + pageCases.length + ' account-state page cases, CTA matrix, offer expiry)');
})().catch(e => { console.error(e); process.exit(1); });
