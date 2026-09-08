// Isolated tests for label-render.js's own fit contract (Codex correction
// #1): fits must be false if ANY of hazard/content overflow, footer
// clipping, or an unrecognised H/P code applies -- not just the first of
// the three, as it was before this fix. Each class is tested independently
// so a regression in one can't hide behind another still passing.
// Run from the repo root: node tests/label-render-fit-contract.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText(text) {
        const size = Number((String(this.font).match(/([\d.]+)px/) || [])[1]) || 12;
        return { width: [...String(text)].reduce((w, c) => w + size * (/[MW@%]/.test(c) ? .82 : /[ilI1.,' ]/.test(c) ? .28 : .54), 0) };
      },
      drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; }
    });
    window.eval(labelRendererSource);
  }
});
const { window } = dom;

try {
  // ── Baseline: ordinary, real content fits ───────────────────────
  const baseline = {
    shape: 'circle', size: 63.5,
    scentName: 'Test Scent', productType: 'Candle', bizName: 'Test Biz',
    signal: 'Warning', hStatements: 'H315', pStatements: '',
    sensitisers: [], pictograms: ['exclamation'],
  };
  const rBase = window.LabelRenderer.renderLabel(baseline, { instanceId: 'baseline', pw: 200, ph: 200 });
  assert.strictEqual(rBase.fits, true, 'baseline label with ordinary real content should fit');
  // rBase.warnings is a jsdom-window-realm Array -- compare by length/content
  // rather than assert.deepStrictEqual against a Node-realm [] literal,
  // which can spuriously fail across realms on prototype identity.
  assert.strictEqual(rBase.warnings.length, 0, 'baseline label should carry no warnings');

  // ── Class 1: mandatory hazard/content overflow alone ────────────
  // A real extreme-stress fixture (7 H-codes, 6 sensitisers, 14 P-statements)
  // at a small size -- proven in this session's own manual testing to
  // reliably overflow regardless of render pixel size.
  const overflowLabel = {
    shape: 'circle', size: 'custom', customW: 52, customH: 52,
    scentName: 'Extreme Stress Test Scent Name That Is Quite Long Indeed',
    productType: 'Candle', bizName: 'Extreme Stress Business Name Ltd',
    bizAddress: '1 Long Address Road, Some Town, County, Postcode', bizPhone: '01234 567890',
    bizWebsite: 'www.extremestresstestbusiness.co.uk',
    netWeight: '220g', batchNum: 'B009-EXTREME', burnTime: '45 hrs approx',
    signal: 'Danger', hStatements: 'H319, H317, H411, H412, H315, H336',
    pStatements: 'P101, P102, P103, P210, P233, P260, P261, P271, P273, P302+P352, P305+P351+P338, P312, P501, P211',
    sensitisers: ['Linalool','Limonene','Citral','Geraniol','Citronellol','Coumarin'],
    pictograms: ['exclamation','flame','aquatic'], textColour: 'dark', showBorder: true,
  };
  const rOverflow = window.LabelRenderer.renderLabel(overflowLabel, { instanceId: 'overflow', pw: 147, ph: 147 });
  assert.strictEqual(rOverflow.fits, false, 'a label whose mandatory content overflows must return fits:false');
  assert(rOverflow.warnings.includes('hazard-text-overflow'), 'overflow case should carry the hazard-text-overflow warning');
  assert.strictEqual(rOverflow.metrics.overflow, true, 'metrics.overflow should reflect the same overflow condition');

  // ── Class 2: unrecognised H/P code alone (content otherwise fits) ──
  // A single made-up code appended to an otherwise perfectly ordinary,
  // comfortably-fitting label -- proves fits:false is driven by the
  // unrecognised code specifically, independent of legibility/overflow.
  const unrecognisedLabel = { ...baseline, hStatements: 'H315,ZZZ999' };
  const rUnrecognised = window.LabelRenderer.renderLabel(unrecognisedLabel, { instanceId: 'unrecognised', pw: 200, ph: 200 });
  assert.strictEqual(rUnrecognised.fits, false, 'a label with an unrecognised H/P code must return fits:false even though it otherwise fits comfortably');
  assert(rUnrecognised.warnings.some(w => w === 'unrecognized-code:ZZZ999'), 'unrecognised-code warning should name the specific code');
  assert.strictEqual(rUnrecognised.metrics.overflow, false, 'the unrecognised-code case should NOT also be flagged as a content-overflow -- proves this class is independent, not a side effect of overflow');
  assert.strictEqual(rUnrecognised.metrics.footerClipped, false, 'the unrecognised-code case should not be flagged as footer-clipped either');

  // ── Class 3: footer clipping ─────────────────────────────────────
  // Verified (both algebraically and by exhaustive empirical probing across
  // label sizes 10px-200px with maximally long address/phone/batch/burn-time
  // text) that _footerLegibilityClipped can never become true under the
  // current minFooterFS/fitFont floor constants: fitFont's own floor
  // (max(minFooterFS*0.5, 1.5)) is mathematically always greater than the
  // clip threshold (minFooterFS*0.4) for every minFooterFS in its valid
  // clamp range [2, 4.5] -- so fitFont can never return a value low enough
  // to trigger the pop-and-flag branch. This is a pre-existing
  // characteristic of the verbatim-extracted, signed-off renderer (not
  // introduced by this session's work, and not altered here -- the
  // legibility-floor constants are CLP-legibility-adjacent and protected;
  // a change to make this class reachable needs Michaela's explicit
  // decision, not a unilateral fix here). Flagged in the delivery report.
  // What IS verified here, directly and unconditionally, is that the fits
  // formula's SOURCE correctly wires footer-clipping in as a disqualifying
  // condition -- so the day footer-clipping becomes reachable (e.g. if
  // those constants are ever revisited), fits:false will already follow
  // automatically without any further renderer change.
  const fitsLine = labelRendererSource.split('\n').find(l => l.includes('const fits ='));
  assert(fitsLine, 'could not locate the `const fits =` line in label-render.js');
  assert(/_footerLegibilityClipped/.test(fitsLine), 'fits formula does not reference _footerLegibilityClipped');
  assert(/_labelLegibilityWarn/.test(fitsLine), 'fits formula does not reference _labelLegibilityWarn');
  assert(/_unrecognizedCodes\.length\s*===\s*0/.test(fitsLine), 'fits formula does not require zero unrecognised codes');

  console.log('label-render fit-contract checks passed (overflow and unrecognised-code classes proven live; footer-clip wiring proven by source, documented as currently unreachable by design)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
