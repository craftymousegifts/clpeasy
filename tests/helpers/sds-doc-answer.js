// Test helper (3 Oct 2026): Builder journeys in older tests predate the
// supplier-document applicability check. This answers it the way a maker
// with a correct supplier document would, just before the real checks run:
//   * Step 2: a fragrance % is entered if the test left it blank (10%);
//   * Step 3: "a finished product at a stated %", the same % and the
//     document base matching the product type.
// It never bypasses or alters the production checks (evaluateSdsDoc,
// canLeaveApprovedBuilderStep, extractSDS still run unchanged), and does
// nothing on pages without the Builder (print.html, renderer-only DOMs) or
// for blank / unlisted product types (no substitution).
'use strict';
const SCRIPT = `(function(){
  if (window.__sdsDocAutoAnswer || typeof window.evaluateSdsDoc !== 'function') return;
  window.__sdsDocAutoAnswer = true;
  function answer(){
    try {
      var fl = document.getElementById('frag-load');
      if (fl && _parseFragPct(fl.value) === null) { fl.value = '10%'; S.fragLoad = '10%'; }
      var type = (document.getElementById('product-type') || {}).value || S.productType || '';
      var base = SDS_DOC_BASE_BY_TYPE[type];
      if (!base || evaluateSdsDoc().ok) return;
      document.querySelectorAll('input[name="sds-doc-kind"]').forEach(function(r){ r.checked = r.value === 'finished'; });
      document.getElementById('sds-doc-pct').value = String(_parseFragPct(fl.value));
      document.getElementById('sds-doc-base').value = base;
      updateSdsDocCheck();
    } catch (e) {}
  }
  // Answers using the label's REAL product type only. A blank or unlisted
  // type is left unanswered, so the production check blocks it exactly as
  // it would for a maker (3 Oct 2026: no product-type substitution).
  function wrap(fn){ return function(){ answer(); return fn.apply(this, arguments); }; }
  window.extractSDS = wrap(window.extractSDS);
  var leave = window.canLeaveApprovedBuilderStep;
  window.canLeaveApprovedBuilderStep = function(step){ if (step === 2 || step === 3) answer(); return leave.apply(this, arguments); };
  window.toggleHazardNext = wrap(window.toggleHazardNext);
  // For tests that export without walking Steps 3 -> 4: answer, then run the
  // production confirmation (it refuses anything evaluateSdsDoc rejects).
  window.__confirmSdsDoc = function(){ answer(); if (typeof _stampSdsDocConfirmation === 'function') _stampSdsDocConfirmation(); return SdsDocCheck.isExportAllowed(_sdsDocRecord()); };
  window.__answerSdsDoc = answer;
})();`;
function install(window){ try { if (window && typeof window.eval === 'function') window.eval(SCRIPT); } catch (e) {} return window; }
function installed(dom){ install(dom && dom.window); return dom; }
module.exports = { SCRIPT, install, installed };
