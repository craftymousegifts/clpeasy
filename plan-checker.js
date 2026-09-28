// ── CLPPlanChecker — Plan Checker decision rules + result CTAs ─────────
// (Sep 2026, Plan Checker audit — approved 3-question model.)
//
// Two separate, pure functions:
//  - decide(answers)       → the recommended plan from the three answers only.
//                            No scores, no ties. Permanent prices drive every
//                            rule; promotional offers and account state never
//                            change the recommendation.
//  - ctas(result, account) → what the result card offers THIS visitor, from the
//                            shared CLPEntitlement.summarise() output. It only
//                            changes the call-to-action, never the plan.
//
// Permanent prices behind the rules (pricing.html):
//   Pay As You Go £4.99 for 5 downloads (about £1 each, never expire)
//   Easy Start £9.99/month for 20 · Easy Pro £14.99/month for 30
//   Subscriber top-ups 5 for £3.99 / 10 for £7.99
// "Occasional or seasonal" (Q2) means labels are needed in only a few months
// of the year (internally: about 4 or fewer). At that level Pay As You Go
// costs less than a year-round subscription at every download band.
(function(root){
  'use strict';

  const VOLUMES = ['upto5','6to10','11to20','21to30','over30','notsure'];
  const FREQUENCIES = ['occasional','ongoing'];
  const PAYMENTS = ['payg','subscription','none'];

  // Same boundary as the server (create-checkout-session / stripe-webhook
  // PROMO_2026_END_MS): the 2026 offers end at the end of 31 Dec 2026 UK time.
  const PROMO_END_MS = Date.UTC(2027, 0, 1);

  const TOPUPS = 'top-ups (5 for £3.99 or 10 for £7.99)';

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
      name: 'Easy Start',
      tagline: '20 downloads every month for regular label-making.',
      price: '£9.99/month or £99/year',
      features: ['20 downloads a month', 'Top-ups if you need more (5 for £3.99 or 10 for £7.99)'],
      offer: '£8.99/month until 31 December 2026, then £9.99/month.'
    },
    pro: {
      name: 'Easy Pro',
      tagline: '30 downloads every month, plus priority support.',
      price: '£14.99/month or £149/year',
      features: ['30 downloads a month', 'Priority support — we aim to reply within 1 working day.', 'Top-ups if you need more (5 for £3.99 or 10 for £7.99)'],
      offer: '£13.49/month until 31 December 2026, then £14.99/month.'
    }
  };

  const PRO_COMPARISON = 'If you reliably need 25 or fewer a month, Easy Start plus a 5-download top-up (£9.99 + £3.99 = £13.98) costs slightly less than Easy Pro (£14.99).';

  function result(plan, rule, reasons, extra){
    return Object.assign({ plan, rule, reasons, warning: null, note: null, trialEmphasis: false }, extra || {});
  }

  function decide(answers){
    const a = answers || {};
    const v = a.volume, f = a.frequency, p = a.payment;
    if (!VOLUMES.includes(v) || !FREQUENCIES.includes(f) || !PAYMENTS.includes(p)) {
      throw new Error('Plan Checker: incomplete or unknown answers');
    }
    const occasional = f === 'occasional';
    const notSure = v === 'notsure';

    // R1 — an explicit "only when I need downloads" answer is never overridden.
    if (p === 'payg') {
      const r = result('payg', 'R1', ["You told us you'd rather pay only when you need downloads."]);
      if (!occasional && !notSure) {
        if (v === '6to10') r.note = 'If you regularly use close to 10 downloads a month, Easy Start gives you 20 a month for £9.99.';
        if (v === '11to20') r.warning = 'At about 11–20 downloads a month, Pay As You Go costs about £11–£20 a month. Easy Start (£9.99/month for 20 downloads) would usually cost less.';
        if (v === '21to30') r.warning = 'At about 21–30 downloads a month, Pay As You Go costs about £21–£30 a month. Easy Pro (£14.99/month for 30 downloads) would usually cost less.';
        if (v === 'over30') r.warning = 'At more than 30 downloads a month, Pay As You Go costs over £30 a month. Easy Pro (£14.99/month for 30 downloads, plus ' + TOPUPS + ') would usually cost less.';
      }
      return r;
    }

    // R2 — a stated subscription preference is respected, with honest notes.
    if (p === 'subscription') {
      const pref = "You told us you'd prefer a subscription.";
      if (notSure) {
        return result('start', 'R2-notsure', [pref, 'Easy Start is the entry subscription, with 20 downloads a month.'],
          { note: "Not sure how many you'll need yet? Pay As You Go (£4.99 for 5 downloads) is the lower-commitment option." });
      }
      if (occasional) {
        const r = result('start', 'R2-occasional', [pref, 'Easy Start is the entry subscription, with 20 downloads a month.'],
          { warning: 'Because you only make labels in some months, Pay As You Go would usually cost less than a year-round subscription.' });
        if (v === '21to30' || v === 'over30') r.note = 'In busier months, ' + TOPUPS + ' cover downloads beyond your 20.';
        return r;
      }
      if (v === 'upto5') return result('start', 'R2-ongoing', [pref, 'Easy Start includes 20 downloads a month.'],
        { warning: 'At up to 5 downloads a month, Pay As You Go (about £5) would normally cost less than Easy Start (£9.99).' });
      if (v === '6to10') return result('start', 'R2-ongoing', [pref, 'Easy Start includes 20 downloads a month.'],
        { note: 'At the lower end of this range, Pay As You Go would cost less.' });
      if (v === '11to20') return result('start', 'R2-ongoing', [pref, "Easy Start's 20 downloads a month covers your usage."]);
      if (v === '21to30') return result('pro', 'R2-ongoing', ['You regularly need more than 20 downloads a month — Easy Pro includes 30.'], { note: PRO_COMPARISON });
      return result('pro', 'R2-ongoing', ['You regularly need more than 30 downloads a month — Easy Pro includes 30, and ' + TOPUPS + ' cover the rest.']);
    }

    // R3 — no payment preference: recommend what fits the usage.
    if (notSure) {
      return result('payg', 'R3-notsure', ["You're not sure yet how many downloads you'll need, so the lowest-commitment option makes sense."], { trialEmphasis: true });
    }
    if (occasional) {
      const r = result('payg', 'R3-occasional', ['You only make labels in some months, so paying when you need downloads avoids a year-round subscription.']);
      if (v !== 'upto5' && v !== '6to10') r.note = 'If your label-making becomes regular, a subscription can be better value.';
      return r;
    }
    if (v === 'upto5') return result('payg', 'R3-ongoing', ['At up to 5 downloads a month, Pay As You Go (about £5) costs less than a subscription.']);
    if (v === '6to10') return result('payg', 'R3-ongoing', ['At 6–10 downloads a month, Pay As You Go costs about £6–£10 — no more than Easy Start.'],
      { note: "If you're consistently near 10 a month, Easy Start (£9.99/month for 20 downloads) is worth considering." });
    if (v === '11to20') return result('start', 'R3-ongoing', ["Easy Start's 20 downloads a month covers your usage for less than Pay As You Go."]);
    if (v === '21to30') return result('pro', 'R3-ongoing', ['You regularly need more than 20 downloads a month — Easy Pro includes 30.'], { note: PRO_COMPARISON });
    return result('pro', 'R3-ongoing', ['You regularly need more than 30 downloads a month — Easy Pro includes 30, and ' + TOPUPS + ' cover the rest.']);
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
    start: { href: 'pricing.html#easy-start', text: 'Choose Easy Start →' },
    pro: { href: 'pricing.html#easy-pro', text: 'Choose Easy Pro →' },
    trial: { href: 'auth.html?mode=signup', text: 'Start your free 14-day trial →' },
    topup: { href: 'account.html?topup=1', text: 'Buy a top-up →' },
    account: { href: 'account.html', text: 'Manage your subscription →' },
    support: { href: SUPPORT_URL, text: 'Contact CLPeasy Support →' }
  };
  const PURCHASED_KEPT = "Your unused purchased downloads stay on your account. They're used once your monthly allowance runs out, and they never expire.";
  const TRIAL_ENDS = "Buying Pay As You Go ends your free trial now. Any unused trial downloads won't carry over.";

  // Returns { state, messages:[], primary, secondary } — links only; the
  // server remains the authority for every purchase.
  function ctas(res, ent){
    const plan = res.plan;
    const state = accountState(ent);
    const out = { state, messages: [], primary: null, secondary: null };
    const subName = state === 'activePro' ? 'Easy Pro' : 'Easy Start';

    if (state === 'signedOut') {
      out.primary = LINKS[plan];
      out.secondary = LINKS.trial;
      if (res.trialEmphasis) out.messages.push("Not sure yet? Try CLPeasy free for 14 days first — 10 watermarked downloads, no card needed.");
      return out;
    }

    if (plan === 'payg') {
      if (state === 'activeStart' || state === 'activePro' || state === 'cancelScheduled') {
        out.messages.push("Pay As You Go isn't available while you have an Easy Start or Easy Pro subscription. Subscriber top-ups cover extra downloads.");
        out.primary = LINKS.topup;
        out.secondary = LINKS.account;
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

    // Easy Start / Easy Pro recommendation
    const recName = plan === 'pro' ? 'Easy Pro' : 'Easy Start';
    if (state === 'activeStart' || state === 'activePro') {
      const current = state === 'activePro' ? 'pro' : 'start';
      if (current === plan) {
        out.messages.push("You're already on " + recName + '.');
        out.primary = { href: 'account.html', text: 'View your account →' };
      } else {
        out.messages.push(plan === 'pro'
          ? 'Easy Pro would better match your current usage. To change your plan, contact CLPeasy Support.'
          : 'Easy Start would cover your current usage. To change your plan, contact CLPeasy Support.');
        out.primary = LINKS.support;
      }
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

  const api = { decide, ctas, accountState, offerVisible, PLANS, VOLUMES, FREQUENCIES, PAYMENTS, PROMO_END_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CLPPlanChecker = api;
})(typeof window !== 'undefined' ? window : null);
