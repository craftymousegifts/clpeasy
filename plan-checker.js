// ── CLPPlanChecker — Plan Checker decision rules + result CTAs ─────────
// (Sep 2026, Plan Checker audit — approved branching model.)
//
// A new customer is never asked to understand CLPeasy downloads. The checker
// asks about their label-making and derives an approximate usage level:
//
//   frequency  always   notsure | occasional | ongoing
//   labels     ongoing  upto10 | 11to20 | over20     (different CLP labels a month)
//   printing   ongoing and labels > 10: combined | separate | notsure
//   payment    always, last: payg | subscription | none
//
// Why printing matters: one Print Sheet Composer A4 sheet (or cutting-machine
// ZIP) is ONE download however many different labels it holds, while a
// separate file per label costs one download each. Printing more copies of a
// downloaded file is never charged.
//
// Pure functions:
//  - path(answers)         → the questions this customer must answer, in order.
//  - usage(answers)        → derived usage level (low | medium | high) or null.
//  - decide(answers)       → the recommended plan. No scores, no ties. Permanent
//                            prices drive every rule; promotional offers and
//                            account state never change the recommendation.
//  - ctas(result, account) → the call-to-action for THIS visitor, from the shared
//                            CLPEntitlement.summarise() output. CTA only.
//
// Permanent prices behind the rules (pricing.html, 2 Oct 2026):
//   Pay As You Go £4.99 for 5 downloads (about £1 each, never expire)
//   Easy Start Unlimited £9.99/month or £89/year, unlimited downloads
// Easy Pro and subscriber top-ups are retired from new sales, so the
// checker only ever recommends Pay As You Go or Easy Start Unlimited. The
// break-even is about 10 downloads a month. When the usage estimate is
// uncertain the rules lean to the lower commitment: Pay As You Go downloads
// never expire and are kept on the account if the customer later subscribes.
(function(root){
  'use strict';

  const FREQUENCIES = ['notsure','occasional','ongoing'];
  const LABELS = ['upto10','11to20','over20'];
  const PRINTING = ['combined','separate','notsure'];
  const PAYMENTS = ['payg','subscription','none'];
  const QUESTION_VALUES = { frequency: FREQUENCIES, labels: LABELS, printing: PRINTING, payment: PAYMENTS };

  // Same boundary as the server (create-checkout-session / stripe-webhook
  // PROMO_2026_END_MS): the 2026 offers end at the end of 31 Dec 2026 UK time.
  const PROMO_END_MS = Date.UTC(2027, 0, 1);

  const EXPORT_NOTE = "You only use a download when you export a label file. Printing more copies of a file you've already downloaded is free.";
  const REPRINT_NOTE = "This is an estimate. If you mostly reprint label files you've already downloaded, you'll use fewer downloads.";

  const PLANS = {
    payg: {
      name: 'Pay As You Go',
      tagline: 'Buy downloads only when you need them — no subscription.',
      price: '£4.99 for 5 downloads · one-off payment · downloads never expire',
      features: ['Same label builder, Smart Paste and print tools as the subscriptions.'],
      // Shown under a separate "Current offer" label, never as a reason.
      offer: 'Get 8 downloads for £4.99 until 31 December 2026.'
    },
    start: {
      name: 'Easy Start Unlimited',
      tagline: 'Unlimited downloads while you’re subscribed.',
      price: '£9.99/month or £89/year (save £30.88)',
      features: ['Unlimited downloads while your subscription is active', 'Pay monthly, or £89/year (about £7.42 a month)'],
      offer: '£8.99/month until 31 December 2026, then £9.99/month.'
    }
  };

  const UNLIMITED = 'Easy Start Unlimited (£9.99/month for unlimited downloads)';
  const OCCASIONAL_SUB_WARNING = 'Because you only make labels some of the time, Pay As You Go would usually cost less than a year-round subscription.';
  const OCCASIONAL_NOTE = 'If your label-making becomes regular, a subscription can be better value.';

  // The questions this customer must answer, in order, given the answers so far.
  function path(answers){
    const a = answers || {};
    const p = ['frequency'];
    if (a.frequency === 'ongoing') {
      p.push('labels');
      if (a.labels === '11to20' || a.labels === 'over20') p.push('printing');
    }
    p.push('payment');
    return p;
  }

  // Answers that no longer apply once an earlier answer changes are dropped.
  function prune(answers){
    const keep = path(answers), out = {};
    keep.forEach(q => { if (answers && answers[q] !== undefined) out[q] = answers[q]; });
    return out;
  }

  function complete(answers){
    return path(answers).every(q => QUESTION_VALUES[q].includes((answers || {})[q]));
  }

  // Derived usage level for regular makers only (null otherwise).
  //   up to 10 labels                         → low
  //   more than 10, combined on shared sheets → low   (one sheet = one download)
  //   11–20, separate or not sure             → medium
  //   more than 20, separate                  → high
  //   more than 20, not sure                  → medium
  function usage(answers){
    const a = answers || {};
    if (a.frequency !== 'ongoing') return null;
    if (a.labels === 'upto10') return { level: 'low', source: 'count' };
    if (a.printing === 'combined') return { level: 'low', source: 'combined' };
    if (a.labels === '11to20') return { level: 'medium', source: 'count' };
    if (a.printing === 'separate') return { level: 'high', source: 'count' };
    return { level: 'medium', source: 'count' };
  }

  function result(plan, rule, reasons, extra){
    return Object.assign({ plan, rule, reasons, warning: null, note: null, trialEmphasis: false, exportNote: EXPORT_NOTE, estimateNote: null }, extra || {});
  }

  const LOW_REASON = {
    count: 'At up to about 10 downloads a month, Pay As You Go usually costs no more than Easy Start Unlimited.',
    combined: 'You combine several different labels on one sheet or file, so you should only need a few downloads a month.'
  };

  function decide(answers){
    const a = answers || {};
    if (!complete(a)) throw new Error('Plan Checker: incomplete or unknown answers');
    const notSure = a.frequency === 'notsure';
    const occasional = a.frequency === 'occasional';
    const u = usage(a);
    const est = u ? { estimateNote: REPRINT_NOTE } : {};

    // R1 — an explicit "only when I need downloads" answer is never overridden.
    if (a.payment === 'payg') {
      const r = result('payg', 'R1', ["You told us you'd rather pay only when you need downloads."], est);
      if (u && u.level === 'low' && u.source === 'count') r.note = 'If you regularly need close to 10 downloads a month, ' + UNLIMITED + ' costs about the same.';
      if (u && u.level === 'medium') r.warning = 'At about 11–20 downloads a month, Pay As You Go costs about £11–£20 a month. ' + UNLIMITED + ' would usually cost less.';
      if (u && u.level === 'high') r.warning = 'At more than 20 downloads a month, Pay As You Go costs over £20 a month. ' + UNLIMITED + ' would usually cost less.';
      return r;
    }

    // R2 — a stated subscription preference is respected, with honest notes.
    if (a.payment === 'subscription') {
      const pref = "You told us you'd prefer a subscription.";
      const what = 'Easy Start Unlimited gives you unlimited downloads while you’re subscribed.';
      if (notSure) return result('start', 'R2-notsure', [pref, what],
        { note: "Not sure how many you'll need yet? Pay As You Go (£4.99 for 5 downloads) is the lower-commitment option." });
      if (occasional) return result('start', 'R2-occasional', [pref, what], { warning: OCCASIONAL_SUB_WARNING });
      if (u.level === 'low') return result('start', 'R2-low', [pref, what],
        Object.assign({ warning: 'At up to about 10 downloads a month, Pay As You Go would usually cost the same as or less than Easy Start Unlimited (£9.99/month).' }, est));
      if (u.level === 'medium') return result('start', 'R2-medium', [pref, 'Unlimited downloads cover your labels without counting downloads.'], est);
      return result('start', 'R2-high', [pref, 'You need more than 20 downloads a month — Easy Start Unlimited has no download limit.'], est);
    }

    // R3 — no payment preference: recommend what fits the usage, leaning to
    // the lower commitment when uncertain.
    if (notSure) return result('payg', 'R3-notsure', ["You're not sure yet how much you'll use CLPeasy, so the lowest-commitment option makes sense."], { trialEmphasis: true });
    if (occasional) return result('payg', 'R3-occasional', ['You only make labels some of the time, so paying when you need downloads avoids a year-round subscription.'], { note: OCCASIONAL_NOTE });
    if (u.level === 'low') return result('payg', 'R3-low', [LOW_REASON[u.source]],
      Object.assign({ note: u.source === 'count' ? 'If you regularly need close to 10 a month, ' + UNLIMITED + ' is worth considering.' : null }, est));
    if (u.level === 'medium') return result('start', 'R3-medium', ['Easy Start Unlimited covers your labels for less than Pay As You Go, with no download limit.'], est);
    return result('start', 'R3-high', ['You need more than 20 downloads a month — Easy Start Unlimited has no download limit.'], est);
  }

  // Every valid answer path (27), for tests and QA.
  function allPaths(){
    const out = [];
    (function walk(a){
      const next = path(a).find(q => a[q] === undefined);
      if (!next) { out.push(Object.assign({}, a)); return; }
      QUESTION_VALUES[next].forEach(v => walk(Object.assign({}, a, { [next]: v })));
    })({});
    return out;
  }

  function offerVisible(nowArg){
    const now = nowArg == null ? Date.now() : (nowArg instanceof Date ? nowArg.getTime() : Number(nowArg));
    return now < PROMO_END_MS;
  }

  // Account state for the CTA only, from CLPEntitlement.summarise() output.
  // null / undefined (signed out, or the lookup failed) → 'signedOut'.
  function accountState(ent){
    if (!ent) return 'signedOut';
    const sub = /^Easy Pro/.test(ent.planName || '') ? 'pro' : 'start';
    if (ent.active) return sub === 'pro' ? 'activePro' : 'activeStart';
    if (ent.cancelScheduled) return 'cancelScheduled';
    if (ent.paused) return 'paused';
    if (ent.trialActive) return 'trialActive';
    if (ent.payg) return 'payg';
    if (ent.trialExpired) return 'trialExpired';
    return 'ended';
  }

  const SUPPORT_URL = 'support.html';
  const LINKS = {
    payg: { href: 'pricing.html#payg', text: 'Buy downloads →' },
    start: { href: 'pricing.html#easy-start', text: 'Choose Easy Start Unlimited →' },
    trial: { href: 'auth.html?mode=signup', text: 'Start your free 14-day trial →' },
    account: { href: 'account.html', text: 'Manage your subscription →' },
    support: { href: SUPPORT_URL, text: 'Contact CLPeasy Support →' }
  };
  const PURCHASED_KEPT = "Your unused purchased downloads stay on your account and never expire. You won't need them while Easy Start Unlimited is active.";
  const TRIAL_ENDS = "Buying Pay As You Go ends your free trial now. Any unused trial downloads won't carry over.";

  // Returns { state, messages:[], primary, secondary } — links only; the
  // server remains the authority for every purchase.
  function ctas(res, ent){
    const plan = res.plan;
    const state = accountState(ent);
    const out = { state, messages: [], primary: null, secondary: null };

    if (state === 'signedOut') {
      out.primary = LINKS[plan];
      out.secondary = LINKS.trial;
      if (res.trialEmphasis) out.messages.push("Not sure yet? Try CLPeasy free for 14 days first — 10 watermarked downloads, no card needed.");
      return out;
    }

    if (plan === 'payg') {
      if (state === 'activeStart' || state === 'activePro' || state === 'cancelScheduled') {
        out.messages.push("Your subscription already includes unlimited downloads, so you don't need Pay As You Go.");
        out.primary = LINKS.account;
        return out;
      }
      if (state === 'trialActive') out.messages.push(TRIAL_ENDS);
      if (state === 'payg') {
        const n = ent && Number.isFinite(ent.purchased) ? ent.purchased : null;
        if (n !== null) out.messages.push('You have ' + n + ' purchased download' + (n === 1 ? '' : 's') + ' remaining.');
        out.primary = { href: LINKS.payg.href, text: 'Buy more downloads →' };
        return out;
      }
      out.primary = LINKS.payg;
      if (state === 'paused') out.secondary = LINKS.account;
      return out;
    }

    // Easy Start Unlimited recommendation (legacy Easy Pro subscriptions are
    // unlimited too).
    if (state === 'activeStart' || state === 'activePro') {
      out.messages.push(state === 'activePro'
        ? 'Your Easy Pro subscription already includes unlimited downloads.'
        : "You're already on Easy Start Unlimited.");
      out.primary = { href: 'account.html', text: 'View your account →' };
      return out;
    }
    if (state === 'cancelScheduled' || state === 'paused') {
      out.messages.push(state === 'paused'
        ? 'Your subscription is currently paused. You can manage it from your account.'
        : 'Your subscription is set to end. You can manage it from your account.');
      out.primary = LINKS.account;
      out.secondary = LINKS.support;
      return out;
    }
    if (state === 'payg') out.messages.push(PURCHASED_KEPT);
    out.primary = LINKS[plan];
    return out;
  }

  const api = { decide, path, prune, complete, usage, allPaths, ctas, accountState, offerVisible, PLANS, FREQUENCIES, LABELS, PRINTING, PAYMENTS, QUESTION_VALUES, PROMO_END_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CLPPlanChecker = api;
})(typeof window !== 'undefined' ? window : null);
