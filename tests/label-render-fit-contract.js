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
  // Correction (2026-09-08, layout-regression audit): an earlier version of
  // this comment claimed _footerLegibilityClipped could never become true,
  // reasoning about the OLD `minFooterFS`/fitFont-floor mechanism (lines
  // near `const minFooterFS = clamp(BASE*0.022, 2, 4.5);`, explicitly
  // commented in label-render.js itself as "retained for the historical
  // record only" and no longer live). That claim was wrong: real production
  // data (the saved "Lavendar" label, dense candle content) was directly
  // observed reporting `footer-clipped` at multiple sizes in this same
  // session. The ACTUAL live mechanism is different -- _footerClipped is
  // set from the mandatory-text floor (_mandatoryMinFS, itself
  // GB_ACTIVE_MIN_FS_MM-derived -- see the 2026-09-08 targeted GB revert)
  // via `measureText(slot.text, _mandatoryMinFS, ...) > availW` and
  // `fs / 0.82 > slotLH`, and is very much reachable. This class is
  // therefore verified here the same way Class 1/2 are: with a real,
  // deliberately narrow fixture (long address/phone/net-qty text at a small
  // custom size) that is independently confirmed to trigger
  // footer-clipped alone, not as an unreachable-by-design footnote.
  // Updated (2026-09-08 UI-hotfix refactor): the per-flag wiring this test
  // guards used to live directly in the `const fits =` line's own text.
  // That line now just reads the shared `_contentBlocked` boolean -- the
  // SAME boolean the blocked-preview overlay uses, precisely so the two
  // consumers of "does this content fit" can never drift apart again. The
  // guard below is updated, not weakened: it now checks (a) every blocking
  // flag is still wired into `_contentBlocked`, (b) `fits` is exactly its
  // negation (never a second, independently-maintained copy), and (c) the
  // overlay expression is driven by that same shared boolean too.
  // Live proof (not just source-wiring): a real, deliberately narrow
  // footer-only fixture (long address/phone/net-qty on a small non-candle
  // custom size, no hazard overflow, no pictogram) isolates footer-clipped
  // exactly the way the overflow and unrecognised-code classes above do.
  const footerOnlyLabel = {
    shape: 'circle', size: 'custom', customW: 60, customH: 40,
    scentName: 'X', productType: 'Candle', bizName: 'Biz',
    bizAddress: '1 Very Long Street Name Address Line, Some Town, County, Postcode ABC 123',
    bizPhone: '01234 567 890 123456', bizWebsite: '', netWeight: '500g extra long text here', burnTime: '',
    signal: 'Warning', hStatements: 'H315', pStatements: '', sensitisers: [], pictograms: [],
  };
  const rFooter = window.LabelRenderer.renderLabel(footerOnlyLabel, { instanceId: 'footer-only', pw: 147, ph: 98 });
  assert.strictEqual(rFooter.fits, false, 'the footer-only fixture must return fits:false');
  assert.deepStrictEqual([...rFooter.warnings], ['footer-clipped'], `footer-only fixture should carry ONLY footer-clipped, proving this class is independently reachable and isolated -- got ${JSON.stringify(rFooter.warnings)}`);
  assert.strictEqual(rFooter.metrics.overflow, false, 'footer-only fixture must not also be flagged as hazard overflow');

  const contentBlockedLine = labelRendererSource.split('\n').find(l => l.includes('const _contentBlocked ='));
  assert(contentBlockedLine, 'could not locate the `const _contentBlocked =` line in label-render.js');
  const contentBlockedBlock = labelRendererSource.slice(labelRendererSource.indexOf(contentBlockedLine)).split(';')[0];
  assert(/_footerLegibilityClipped/.test(contentBlockedBlock), '_contentBlocked does not reference _footerLegibilityClipped');
  assert(/_labelLegibilityWarn/.test(contentBlockedBlock), '_contentBlocked does not reference _labelLegibilityWarn');
  assert(/_unrecognizedCodes\.length\s*>\s*0/.test(contentBlockedBlock), '_contentBlocked does not require zero unrecognised codes');
  assert(/_bcfTooSmall/.test(contentBlockedBlock), '_contentBlocked does not reference _bcfTooSmall');
  assert(/_scentTooSmall/.test(contentBlockedBlock), '_contentBlocked does not reference _scentTooSmall');
  assert(/_bizNameTooSmall/.test(contentBlockedBlock), '_contentBlocked does not reference _bizNameTooSmall');
  assert(/_typeTooSmall/.test(contentBlockedBlock), '_contentBlocked does not reference _typeTooSmall');
  assert(/_signalTooSmall/.test(contentBlockedBlock), '_contentBlocked does not reference _signalTooSmall');

  const fitsLine = labelRendererSource.split('\n').find(l => l.trim().startsWith('const fits ='));
  assert(fitsLine, 'could not locate the `const fits =` line in label-render.js');
  assert(/const fits\s*=\s*!_contentBlocked\s*;/.test(fitsLine), 'fits must be exactly !_contentBlocked -- a second, independent formula here is exactly the drift this refactor exists to prevent');

  const overlayLine = labelRendererSource.split('\n').find(l => l.includes('const overflowOverlay='));
  assert(overlayLine, 'could not locate the `const overflowOverlay=` line in label-render.js');
  assert(/_contentBlocked\?/.test(overlayLine), 'overflowOverlay must be gated on the same shared _contentBlocked boolean as fits');

  console.log('label-render fit-contract checks passed (overflow, unrecognised-code, and footer-clip classes all proven LIVE with real fixtures; fits and the blocked overlay proven to share one boolean)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
