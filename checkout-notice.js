// ── Checkout-in-progress notice (shared by pricing.html and checkout.html) ──
// create-checkout-session refuses a second SUBSCRIPTION checkout for the
// same account for up to 5 minutes after one was started (409
// CHECKOUT_IN_PROGRESS; the checkout_locks duplicate-subscription guard).
// This replaces the browser alert for that refusal with an accessible CLPeasy
// dialog. It only explains the wait: the lock stores just the user and the
// time, so the previous plan, price or Stripe session cannot be shown or
// resumed here, and nothing in this file touches the lock itself.
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

  // opts.returnFocus: element to focus again on close (defaults to the
  // element that had focus when the notice opened). opts.onClose: callback.
  function showInProgress(opts) {
    opts = opts || {};
    var doc = global.document;
    close();
    ensureStyle(doc);

    var backdrop = doc.createElement('div');
    backdrop.className = 'clp-cn-backdrop';
    backdrop.innerHTML =
      '<div class="clp-cn-dialog" role="dialog" aria-modal="true" aria-labelledby="clp-cn-title" aria-describedby="clp-cn-body" data-code="CHECKOUT_IN_PROGRESS">' +
        '<div class="clp-cn-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>' +
        '<h2 class="clp-cn-title" id="clp-cn-title">Checkout already in progress</h2>' +
        '<div class="clp-cn-body" id="clp-cn-body">' +
          '<p>You recently started a subscription checkout.</p>' +
          '<p>For your protection, CLPeasy prevents another subscription checkout from being started for a few minutes (no more than 5).</p>' +
          '<p>You can return to your previous checkout if it is still open, or wait a few minutes before choosing another plan.</p>' +
        '</div>' +
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

  global.CLPCheckoutNotice = { showInProgress: showInProgress, close: close };
})(window);
