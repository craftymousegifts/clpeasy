// ── Checkout-in-progress notice (shared by pricing.html and checkout.html) ──
// create-checkout-session refuses a second SUBSCRIPTION checkout for the
// same account for up to 5 minutes after one was started (409
// CHECKOUT_IN_PROGRESS; the checkout_locks duplicate-subscription guard).
// This replaces the browser alert for that refusal with an accessible CLPeasy
// dialog. It only explains the wait: the lock stores just the user and the
// time, so the previous plan, price or Stripe session cannot be shown or
// resumed here, and nothing in this file touches the lock itself.
//
// Header "Checkout in progress" indicator: the browser cannot read the lock,
// so the indicator shows only what THIS browser genuinely knows -- that it
// started a subscription checkout for the signed-in account (or was told one
// is in progress) -- and hides itself once 5 minutes have passed from that
// moment, the latest the server lock can still exist. It never shows a plan,
// price, Stripe session or countdown.
(function (global) {
  'use strict';
  var STYLE_ID = 'clp-checkout-notice-style';
  var CSS =
    '.clp-cn-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;}' +
    '.clp-cn-dialog{background:#fff;color:var(--text,#111318);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.25);width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow-y:auto;padding:28px 26px 24px;font-family:\'DM Sans\',sans-serif;text-align:left;}' +
    '.clp-cn-icon{width:44px;height:44px;border-radius:50%;background:var(--teal-light,#d6eef4);color:var(--teal-dark,#3a7d8f);display:flex;align-items:center;justify-content:center;margin-bottom:14px;}' +
    '.clp-cn-title{font-family:\'DM Serif Display\',serif;font-size:24px;line-height:1.2;margin:0 0 12px;color:var(--text,#111318);font-weight:400;}' +
    '.clp-cn-body p{font-size:15px;line-height:1.6;color:#374151;margin:0 0 10px;}' +
    '.clp-cn-actions{display:flex;justify-content:flex-end;margin-top:18px;}' +
    '.clp-cn-btn{background:var(--teal,#4C9BB0);color:#fff;border:none;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:700;cursor:pointer;font-family:\'DM Sans\',sans-serif;}' +
    '.clp-cn-btn:hover{background:var(--teal-dark,#3a7d8f);}' +
    '.clp-cn-btn:focus-visible{outline:3px solid var(--teal-dark,#3a7d8f);outline-offset:2px;}' +
    '@media(max-width:480px){.clp-cn-dialog{padding:24px 20px 20px;}.clp-cn-title{font-size:22px;}.clp-cn-actions{display:block;}.clp-cn-btn{width:100%;}}';

  var open = null;

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    doc.head.appendChild(s);
  }

  function close() {
    if (!open) return;
    var o = open; open = null;
    o.doc.removeEventListener('keydown', o.onKey, true);
    if (o.backdrop.parentNode) o.backdrop.parentNode.removeChild(o.backdrop);
    o.doc.body.style.overflow = o.prevOverflow;
    if (o.returnFocus && typeof o.returnFocus.focus === 'function' && o.doc.contains(o.returnFocus)) o.returnFocus.focus();
    if (typeof o.onClose === 'function') o.onClose();
  }

  var CLOCK_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // opts.returnFocus: element to focus again on close (defaults to the
  // element that had focus when the notice opened). opts.onClose: callback.
  function showInProgress(opts) {
    return showDialog(Object.assign({
      code: 'CHECKOUT_IN_PROGRESS',
      title: 'Checkout already in progress',
      paragraphs: [
        'You recently started a subscription checkout.',
        'For your protection, CLPeasy prevents another subscription checkout from being started for a few minutes (no more than 5).',
        'You can return to your previous checkout if it is still open, or wait a few minutes before choosing another plan.',
      ],
    }, opts || {}));
  }

  // Opened from the header indicator.
  function showIndicatorInfo(opts) {
    return showDialog(Object.assign({
      code: 'CHECKOUT_INDICATOR',
      title: 'Checkout in progress',
      paragraphs: ["You've recently started a secure checkout. CLPeasy allows one subscription checkout at a time for up to 5 minutes."],
    }, opts || {}));
  }

  function showDialog(opts) {
    var doc = global.document;
    close();
    ensureStyle(doc);

    var backdrop = doc.createElement('div');
    backdrop.className = 'clp-cn-backdrop';
    backdrop.innerHTML =
      '<div class="clp-cn-dialog" role="dialog" aria-modal="true" aria-labelledby="clp-cn-title" aria-describedby="clp-cn-body" data-code="' + esc(opts.code) + '">' +
        '<div class="clp-cn-icon" aria-hidden="true">' + CLOCK_ICON + '</div>' +
        '<h2 class="clp-cn-title" id="clp-cn-title">' + esc(opts.title) + '</h2>' +
        '<div class="clp-cn-body" id="clp-cn-body">' + opts.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
        '<div class="clp-cn-actions"><button type="button" class="clp-cn-btn">Back to plans</button></div>' +
      '</div>';

    var dialog = backdrop.firstChild;
    var btn = backdrop.querySelector('.clp-cn-btn');

    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        // One focusable control: keep focus inside the dialog.
        e.preventDefault();
        btn.focus();
      }
    }

    open = {
      doc: doc, backdrop: backdrop, onKey: onKey, onClose: opts.onClose,
      returnFocus: opts.returnFocus || doc.activeElement,
      prevOverflow: doc.body.style.overflow,
    };
    btn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.style.overflow = 'hidden';
    doc.body.appendChild(backdrop);
    btn.focus();
    return dialog;
  }

  // ── What this browser knows about a subscription checkout ──
  var KEY = 'clpeasy_checkout_in_progress';
  var LOCK_MS = 5 * 60 * 1000; // create-checkout-session's lock window
  function read() {
    try { var v = JSON.parse(global.localStorage.getItem(KEY) || 'null'); return v && typeof v.until === 'number' ? v : null; }
    catch (e) { return null; }
  }
  // Called when the server has just created a subscription Checkout Session
  // (or refused with CHECKOUT_IN_PROGRESS) for this user. The server lock was
  // created no later than now, so it cannot outlive now + 5 minutes.
  function markStarted(userId) {
    if (!userId) return;
    try { global.localStorage.setItem(KEY, JSON.stringify({ userId: String(userId), until: Date.now() + LOCK_MS })); } catch (e) { /* storage unavailable: no indicator */ }
    refreshIndicator();
  }
  function isActive(userId) {
    var v = read();
    return !!(v && userId && v.userId === String(userId) && Date.now() < v.until);
  }

  var IND_STYLE_ID = 'clp-checkout-indicator-style';
  var IND_CSS =
    '.clp-co-ind{display:inline-flex;align-items:center;gap:7px;position:relative;background:#FFFBEB;color:#92400E;border:1.5px solid #F59E0B;border-radius:10px;padding:6px 12px;min-height:36px;font-size:13px;font-weight:700;font-family:\'DM Sans\',sans-serif;cursor:pointer;line-height:1;white-space:nowrap;}' +
    '.clp-co-ind[hidden]{display:none;}' +
    '.clp-co-ind:hover{background:#FEF3C7;}' +
    '.clp-co-ind:focus-visible{outline:3px solid var(--teal-dark,#3a7d8f);outline-offset:2px;}' +
    '.clp-co-ind svg{flex-shrink:0;}' +
    '.clp-co-dot{position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:#F59E0B;border:2px solid #fff;}' +
    '@media(max-width:600px){.clp-co-ind{padding:0;width:36px;justify-content:center;}.clp-co-ind-text{display:none;}}';
  var LOCK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="10.5" width="16" height="10.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';

  var ind = null; // { el, getUserId, timer }
  function refreshIndicator() {
    if (!ind) return;
    var uid = ind.getUserId();
    var active = isActive(uid);
    ind.el.hidden = !active;
    clearTimeout(ind.timer);
    if (active) ind.timer = setTimeout(refreshIndicator, Math.max(0, read().until - Date.now()) + 50);
  }
  // host: element to put the indicator in (first child). getUserId: returns
  // the signed-in user's id (or null). Hidden unless a checkout is known.
  function mountIndicator(host, getUserId) {
    var doc = global.document;
    if (!host) return null;
    if (!doc.getElementById(IND_STYLE_ID)) {
      var s = doc.createElement('style'); s.id = IND_STYLE_ID; s.textContent = IND_CSS; doc.head.appendChild(s);
    }
    var el = doc.createElement('button');
    el.type = 'button';
    el.className = 'clp-co-ind';
    el.id = 'clp-checkout-indicator';
    el.hidden = true;
    el.setAttribute('aria-label', 'Checkout in progress. Show details');
    el.setAttribute('aria-haspopup', 'dialog');
    el.innerHTML = LOCK_ICON + '<span class="clp-co-ind-text">Checkout</span><span class="clp-co-dot" aria-hidden="true"></span>';
    el.addEventListener('click', function () { showIndicatorInfo({ returnFocus: el }); });
    host.insertBefore(el, host.firstChild);
    ind = { el: el, getUserId: getUserId, timer: null };
    refreshIndicator();
    return el;
  }

  global.CLPCheckoutNotice = {
    showInProgress: showInProgress, showIndicatorInfo: showIndicatorInfo, close: close,
    markStarted: markStarted, isActive: isActive, mountIndicator: mountIndicator, refreshIndicator: refreshIndicator,
  };
})(window);
