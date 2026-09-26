// ── CLPEntitlement — shared plan / download-allowance summary ───────────
// (Sep 2026, PAYG follow-up to PR #156.)
//
// One browser-side mirror of the server rules in public.consume_download()
// (supabase/migrations/20260926000000_download_entitlement_lifecycle.sql).
// The database function is ALWAYS the authority for consuming a download
// and for whether an export is clean; this helper only lets every page
// (Builder, Print Sheet Composer, Account, Dashboard, My Labels) describe
// the same account state the same way instead of five diverging copies.
//
// Rules mirrored from existing CLPeasy behaviour:
//  - An active subscription's monthly allowance is usable and clean.
//  - A scheduled cancellation keeps its paid allowance until the paid
//    period ends ("Your access continues until the end of your current
//    billing period" -- account.html; stripe-webhook downgradeToFree()).
//  - A paused subscription's allowance is not usable ("Downloads are
//    paused" -- account.html pause modal).
//  - A live trial's allowance is usable but watermarked ("10 watermarked
//    trial downloads" -- pricing.html). An expired trial has no allowance.
//  - Purchased downloads (Pay As You Go / top-ups; stored in the legacy
//    topup_credits column) never expire and are always clean.
//  - When the only plan allowance would be watermarked (trial) and the
//    customer has purchased downloads, the purchased download is used so a
//    paying customer receives the clean file they paid for.
(function(root){
  'use strict';

  function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
  function time(v){ if(!v) return null; const t=new Date(v).getTime(); return Number.isFinite(t)?t:null; }

  function summarise(p, nowArg){
    const now = nowArg==null ? Date.now() : (nowArg instanceof Date ? nowArg.getTime() : Number(nowArg));
    p = p || {};
    const status = p.subscription_status || null;
    const plan = p.plan || null;
    const rawUsed = Math.max(0, num(p.downloads_used));
    const limit = Math.max(0, num(p.downloads_limit));
    const purchased = Math.max(0, Math.floor(num(p.topup_credits)));
    const trialEnd = time(p.trial_end);
    const deletionDate = time(p.deletion_date);
    const paidPlan = !!plan && !['free','trial','cancelled','paused','payg'].includes(plan) && limit > 0;

    const active = status === 'active';
    const cancelScheduled = status === 'cancelled' && paidPlan && (deletionDate === null || deletionDate > now);
    const paused = status === 'paused';
    const trialing = status === 'trialing';
    const trialActive = trialing && trialEnd !== null && trialEnd > now;
    const trialExpired = trialing && !trialActive;

    // Pay As You Go account: a trial customer who bought PAYG (D5). The trial
    // allowance is forfeited; only purchased downloads are usable.
    const payg = !active && !paused && !cancelScheduled && (status === 'payg' || plan === 'payg');

    const planUsable = active || cancelScheduled || trialActive;
    const planClean = planUsable && !trialActive;
    // Annual plans refill monthly; consume_download() applies the reset at the
    // first download after downloads_reset_date. Show the refilled allowance.
    const resetDate = time(p.downloads_reset_date);
    const annualRefillDue = p.billing_cycle === 'annual' && planClean && resetDate !== null && resetDate <= now;
    const used = annualRefillDue ? 0 : rawUsed;
    const planLeft = planUsable ? Math.max(0, limit - used) : 0;

    let nextSource = null, nextClean = false;
    if (planUsable && planLeft > 0 && (planClean || purchased === 0)) { nextSource = 'plan'; nextClean = planClean; }
    else if (purchased > 0) { nextSource = 'purchased'; nextClean = true; }

    return {
      status, plan, used, limit, purchased,
      active, cancelScheduled, paused, trialActive, trialExpired, payg,
      planUsable, planClean, planLeft,
      totalLeft: planLeft + purchased,
      nextSource, nextClean,
      // A clean export (Builder clean preview, any Composer export) is
      // available when the next download would be clean.
      cleanAvailable: nextClean,
      // Builder shows a clean live preview to paying customers: a paid plan
      // (even once this month's allowance is used) or purchased downloads.
      cleanPreview: planClean || purchased > 0,
      // D4: subscriber top-up packs are only for active Easy Start/Pro, or a
      // scheduled cancellation still inside its paid period. Everyone else
      // (trial, expired trial, PAYG, paused, ended) buys Pay As You Go.
      topupEligible: active || cancelScheduled,
      planName: planName({ status, plan, is_pro: p.is_pro, purchased, trialActive, trialExpired, cancelScheduled, paidPlan, payg })
    };
  }

  function subscriptionName(s){
    return (s.plan === 'easy_pro' || (s.plan !== 'easy_start' && s.is_pro)) ? 'Easy Pro' : 'Easy Start';
  }

  function planName(s){
    if (s.status === 'active') return subscriptionName(s);
    if (s.status === 'paused') return subscriptionName(s) + ' (Paused)';
    if (s.cancelScheduled) return subscriptionName(s) + ' (Cancelled)';
    if (s.trialActive) return 'Easy Trial';
    if (s.payg || s.purchased > 0) return 'Pay As You Go';
    if (s.trialExpired) return 'Easy Trial (Expired)';
    if (s.status === 'cancelled') return subscriptionName(s) + ' (Cancelled)';
    if (s.status) return subscriptionName(s);
    return 'Easy Trial';
  }

  // Shared signed-in sidebar card (#sidebar-usage/#su-count/#su-fill/
  // #su-plan, identical IDs on every signed-in page). Keeps the existing
  // "X of Y" wording for a plan-only balance; any balance that includes
  // purchased downloads, or has no usable plan, is shown as a plain total.
  function renderSidebar(doc, ent){
    if (!doc || !ent) return;
    const plan = doc.getElementById('su-plan');
    if (plan) plan.textContent = ent.planName;
    const usage = doc.getElementById('sidebar-usage');
    if (!usage) return;
    usage.style.display = 'block';
    const count = doc.getElementById('su-count');
    if (count) count.textContent = (ent.planUsable && ent.purchased === 0 && ent.limit > 0)
      ? ent.planLeft + ' of ' + ent.limit
      : ent.totalLeft + ' download' + (ent.totalLeft === 1 ? '' : 's');
    const fill = doc.getElementById('su-fill');
    if (fill) fill.style.width = (ent.planUsable && ent.limit > 0)
      ? Math.min(100, Math.round((ent.planLeft / ent.limit) * 100)) + '%'
      : (ent.purchased > 0 ? '100%' : '0%');
    applyPurchaseLinks(doc, ent);
  }

  // Where "buy more downloads" goes for this account (D4).
  function purchaseLink(ent){
    return ent && ent.topupEligible
      ? { href: 'account.html?topup=1', text: 'Buy Top-Up →', route: 'topup' }
      : { href: 'pricing.html#payg', text: 'Buy downloads →', route: 'payg' };
  }
  // Points every sidebar "Buy Top-Up" link at the correct purchase route.
  function applyPurchaseLinks(doc, ent){
    if (!doc || !ent) return;
    const link = purchaseLink(ent);
    doc.querySelectorAll('.su-topup').forEach(a => { a.setAttribute('href', link.href); a.textContent = link.text; a.dataset.route = link.route; });
  }

  const api = { summarise, renderSidebar, purchaseLink, applyPurchaseLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CLPEntitlement = api;
})(typeof window !== 'undefined' ? window : null);
