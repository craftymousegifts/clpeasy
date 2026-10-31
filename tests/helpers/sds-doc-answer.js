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
  // Issue #349: a maker with suitable supplier information also confirms the
  // product-identifier substance names (GB CLP Art 18(3)(b)) through the real
  // Builder action: the supplier's names when found, otherwise names typed
  // from the supplier's documents. Never bypasses ProductIdentifierCheck.
  function answerProductIdentifier(){
    try {
      if (!window.ProductIdentifierCheck || typeof window.confirmProductIdentifier !== 'function') return;
      var rec = { hStatements: S.hStatements, productIdentifier: S.productIdentifier };
      if (!ProductIdentifierCheck.required(rec) || ProductIdentifierCheck.confirmed(rec)) return;
      if (S.pidSuggestion && S.pidSuggestion.status === 'found' && S.pidSuggestion.names.length) { window.confirmProductIdentifier('sds'); return; }
      if (typeof window.renderProductIdentifierPanel === 'function') window.renderProductIdentifierPanel(true);
      var input = document.getElementById('pid-names');
      if (input) { input.value = 'Test supplier substance'; window.confirmProductIdentifier('maker'); }
    } catch (e) {}
  }
  window.__answerProductIdentifier = answerProductIdentifier;
  function answer(){
    answerProductIdentifier();
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
  // Existing extraction regression journeys model a maker who has supplied
  // suitable source information. Tick the real source acknowledgement; do
  // not bypass the extraction guard. Its negative/reset cases are tested
  // separately in sds-source-confirmation.js without this helper.
  var extract = window.extractSDS;
  window.extractSDS = function(){
    answer();
    var source = document.getElementById('sds-source-confirm');
    if (source && typeof window.confirmSdsSource === 'function') {
      source.checked = true; window.confirmSdsSource();
    }
    return extract.apply(this, arguments);
  };
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

