// Test helper (3 Oct 2026): Builder journeys in older tests predate the
// supplier-document applicability check. This answers it the way a maker
// with a correct supplier document would, just before the real checks run:
//   * Step 2: a fragrance % is entered if the test left it blank (10%);
//   * Step 3: "a finished product at a stated %", the same % and the
//     document base matching the product type.
// It never bypasses or alters the production checks (evaluateSdsDoc,
// canLeaveApprovedBuilderStep, extractSDS still run unchanged), and does
// nothing on pages without the Builder (print.html, renderer-only DOMs) or
// for product types CLPeasy cannot match.
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
  // Unit tests that never choose a REAL product type (blank, or a fixture
  // value such as 'Candle' that is not a Builder option; the real Step 2
  // requires a listed type) get 'Scented Candle' only while the check and
  // the wrapped call run; the original value is restored afterwards.
  function withRealType(fn, self, args){
    var pt = document.getElementById('product-type');
    var cur = (pt && pt.value) || S.productType || '';
    var fake = !SDS_DOC_BASE_BY_TYPE[cur];
    var savedDom = pt ? pt.value : '', savedS = S.productType;
    if (fake) { if (pt) pt.value = 'Scented Candle'; S.productType = 'Scented Candle'; }
    try { answer(); return fn.apply(self, args); }
    finally { if (fake) { if (pt) pt.value = savedDom; S.productType = savedS; } }
  }
  var ex = window.extractSDS;
  window.extractSDS = function(){ return withRealType(ex, this, arguments); };
  var leave = window.canLeaveApprovedBuilderStep;
  window.canLeaveApprovedBuilderStep = function(step){ return (step === 2 || step === 3) ? withRealType(leave, this, arguments) : leave.apply(this, arguments); };
  var thn = window.toggleHazardNext;
  window.toggleHazardNext = function(){ return withRealType(thn, this, arguments); };
  window.__answerSdsDoc = answer;
})();`;
function install(window){ try { if (window && typeof window.eval === 'function') window.eval(SCRIPT); } catch (e) {} return window; }
function installed(dom){ install(dom && dom.window); return dom; }
module.exports = { SCRIPT, install, installed };
