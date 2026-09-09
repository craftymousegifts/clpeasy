// Permanent regression test for the targeted GB text-sizing/line-spacing
// revert (2026-09-08, Michaela's explicit decision): PR #105 briefly moved
// the ACTIVE GB mandatory-text floor onto the genuine, ratio-corrected
// MANDATORY_MIN_FS_MM_EQUIV figure (~2.33mm nominal font-size, delivering a
// true 1.2mm physical x-height) and raised P-statement line spacing (pLH)
// from 1.15x to 1.2 5x to match the EU/NI Reg (EU) 2024/2865 >=120% rule.
// Both figures are accurate for that EU/NI regulation, but GB CLP has no
// such statutory requirement, and the change shrank the fitting envelope
// for existing GB labels. This test proves:
//   1. The active GB formula is restored to the pre-PR-105 figure
//      (GB_ACTIVE_MIN_FS_MM * pxPerMm, i.e. a plain 1.2 multiplier, not the
//      ratio-corrected one) -- both call sites (_mandatoryMinFS,
//      _minLegibleFS).
//   2. pLH (P-statement line height) is restored to 1.15x; hLH/sLH remain
//      unchanged at 1.25x (an unrelated PR #105 change, not reverted).
//   3. The EU/NI constants (MANDATORY_XHEIGHT_MM, DM_SANS_XHEIGHT_RATIO,
//      MANDATORY_MIN_FS_MM_EQUIV) are still defined (documentation for a
//      possible future EU/NI mode) but are demonstrably NOT referenced by
//      the active mandatory-text floor formulas.
//   4. Real Lavendar-equivalent content (dense candle label: 3 hazard
//      statements incl. EUH208, 5 sensitisers, 5 P-statements, 1 GHS
//      pictogram) fits again at 75mm circle without hazard/footer overflow
//      -- a genuine improvement over the pre-revert 112mm requirement.
//   5. GHS pictogram floor (10mm red-square side) and candle-safety floor
//      (5mm) are UNCHANGED by this revert -- explicitly protected, not
//      touched.
//   6. A blocked label (content that still doesn't fit even after this
//      revert) still reports fits:false and a specific warning -- the
//      fail-closed contract itself is untouched by this revert.
//
// NOT proven here (see delivery report): that this same real Lavendar
// content fits at 63mm, its former saved/supported size. Direct
// measurement shows it does not, even after both reverts above, because of
// a SEPARATE, explicitly protected PR #105 change: the GHS pictogram slot
// reservation was corrected to use the rotated pictogram's true OUTER
// BOUNDING BOX (pictoOuterBoundingBoxMm(10mm square side) = 10*sqrt(2) =
// 14.142mm) rather than the old renderer's undersized flat 10mm
// reservation -- a real, and likely correct, compliance fix, not a
// regression, and explicitly on the "keep unchanged" list for this task.
// That interaction, not mandatory-text sizing/line-spacing, is what still
// blocks 63mm for labels carrying a pictogram, and is flagged for Michaela's
// decision rather than resolved here.
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
const LR = window.LabelRenderer;

try {
  // ── 1 & 3: active-formula wiring, by source ─────────────────────
  assert.strictEqual(typeof labelRendererSource.match(/const GB_ACTIVE_MIN_FS_MM\s*=\s*1\.2;/), 'object', 'GB_ACTIVE_MIN_FS_MM must be defined as 1.2 (the restored pre-PR-105 GB active floor)');
  const mandatoryMinFSLine = labelRendererSource.split('\n').find(l => l.trim().startsWith('const _mandatoryMinFS ='));
  assert(mandatoryMinFSLine, 'could not locate `const _mandatoryMinFS =` line');
  assert(/GB_ACTIVE_MIN_FS_MM \* _pxPerMm/.test(mandatoryMinFSLine), `_mandatoryMinFS must derive from GB_ACTIVE_MIN_FS_MM, not MANDATORY_MIN_FS_MM_EQUIV -- got: ${mandatoryMinFSLine.trim()}`);
  assert(!/MANDATORY_MIN_FS_MM_EQUIV/.test(mandatoryMinFSLine), '_mandatoryMinFS must NOT reference the EU/NI-mode MANDATORY_MIN_FS_MM_EQUIV constant');

  const minLegibleFSLine = labelRendererSource.split('\n').find(l => l.trim().startsWith('const _minLegibleFS ='));
  assert(minLegibleFSLine, 'could not locate `const _minLegibleFS =` line');
  assert(/GB_ACTIVE_MIN_FS_MM \* _pxPerMm/.test(minLegibleFSLine), `_minLegibleFS must derive from GB_ACTIVE_MIN_FS_MM, not MANDATORY_MIN_FS_MM_EQUIV -- got: ${minLegibleFSLine.trim()}`);
  assert(!/MANDATORY_MIN_FS_MM_EQUIV/.test(minLegibleFSLine), '_minLegibleFS must NOT reference the EU/NI-mode MANDATORY_MIN_FS_MM_EQUIV constant');

  // EU/NI constants still present (documentation / future mode) but unused elsewhere
  assert(/const MANDATORY_XHEIGHT_MM\s*=\s*1\.2;/.test(labelRendererSource), 'MANDATORY_XHEIGHT_MM must remain defined for a future EU/NI mode');
  assert(/const DM_SANS_XHEIGHT_RATIO\s*=\s*0\.515625;/.test(labelRendererSource), 'DM_SANS_XHEIGHT_RATIO must remain defined for a future EU/NI mode');
  assert(/const MANDATORY_MIN_FS_MM_EQUIV\s*=\s*MANDATORY_XHEIGHT_MM\s*\/\s*DM_SANS_XHEIGHT_RATIO;/.test(labelRendererSource), 'MANDATORY_MIN_FS_MM_EQUIV must remain defined for a future EU/NI mode');

  // ── 2: pLH reverted, hLH/sLH untouched ───────────────────────────
  const layoutLine = labelRendererSource.split('\n').find(l => l.includes('const hLH=fs*1.25, sLH=fs*1.25'));
  assert(layoutLine, 'could not locate the hLH/sLH/pLH line-height line');
  assert(/pLH=fs\*1\.15/.test(layoutLine), `pLH must be restored to fs*1.15 -- got: ${layoutLine.trim()}`);
  assert(/hLH=fs\*1\.25/.test(layoutLine) && /sLH=fs\*1\.25/.test(layoutLine), 'hLH and sLH must remain unchanged at fs*1.25 -- this revert must not touch them');

  // ── 5: protected GHS / candle-safety floors unchanged ────────────
  assert.strictEqual(LR.PICTO_FLOOR_SQUARE_MM, 10, 'PICTO_FLOOR_SQUARE_MM (GHS 10mm red-square floor) must be unchanged by this revert');
  assert.strictEqual(LR.PICTO_TARGET_OUTER_BBOX_MM, 16, 'PICTO_TARGET_OUTER_BBOX_MM (16mm preferred outer target) must be unchanged by this revert');
  assert.strictEqual(LR.BCF_FLOOR_MM, 5, 'BCF_FLOOR_MM (candle-safety 5mm floor) must be unchanged by this revert');

  // ── 4: real Lavendar-equivalent content fits at 75mm circle ──────
  const lavendarEquivalent = {
    shape: 'circle', size: 'custom', customW: 75, customH: 75,
    scentName: 'Lavendar', productType: 'Scented Candle',
    bizName: 'CLPeasy', bizAddress: 'CLPeasy', bizPhone: '01234567890', bizWebsite: 'www.clpeasy.com',
    netWeight: '200g', burnTime: '35hrs',
    signal: 'Warning',
    hStatements: 'H317, H412, EUH208',
    pStatements: 'P261, P273, P302+P352, P333+P313, P501',
    sensitisers: ['Benzyl Salicylate','Hydroxycitronellal','Linalool','Limonene','2-acetoxy-2,3,8,8-tetramethyloctahydronaphthalene'],
    pictograms: ['exclamation'], textColour: 'dark', showBorder: true,
  };
  const r75 = LR.renderLabel(lavendarEquivalent, { instanceId: 'lav75' });
  assert.strictEqual(r75.fits, true, `real Lavendar-equivalent content must fit at 75mm circle after the targeted revert -- got warnings ${JSON.stringify(r75.warnings)}`);
  assert.strictEqual(r75.warnings.length, 0, `a fitting 75mm Lavendar-equivalent label must carry no warnings -- got ${JSON.stringify(r75.warnings)}`);
  assert.strictEqual(r75.metrics.overflow, false, 'metrics.overflow must be false for the fitting 75mm case');
  assert.strictEqual(r75.metrics.footerClipped, false, 'metrics.footerClipped must be false for the fitting 75mm case');

  // ── 6: fail-closed contract intact -- still-too-small content blocks ──
  const r52 = LR.renderLabel(Object.assign({}, lavendarEquivalent, { size: 'custom', customW: 52, customH: 52 }), { instanceId: 'lav52' });
  assert.strictEqual(r52.fits, false, 'the same content at 52mm must still be correctly blocked (fail-closed contract unaffected by this revert)');
  assert(r52.warnings.length > 0, '52mm blocked case must carry at least one warning');

  console.log('gb-legibility-floor-targeted-revert checks passed (active GB formula restored to pre-PR-105 figures; EU/NI constants retained as inactive documentation; protected GHS/candle floors unchanged; real Lavendar-equivalent content fits at 75mm; fail-closed contract intact at 52mm). NOTE: 63mm fit is NOT proven here -- see file header and delivery report for the separate, protected GHS-pictogram-geometry interaction that still blocks it.');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
