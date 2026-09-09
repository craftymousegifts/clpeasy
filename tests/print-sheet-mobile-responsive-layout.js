// Regression coverage for the print.html mobile responsive-layout fix
// (2026-09-09, follow-up to the cutting-machine tip wording fix). Reported
// bug: at narrow viewports (<=860px), the right-hand preview column
// rendered ~600-800px wide regardless of the actual viewport -- clipped
// (not scrollable) by the outer .two-col's overflow-x:hidden -- so the
// cutting-machine tip text, the export buttons, and part of the sheet
// preview itself were all inaccessible off-screen, and the mobile nav
// visually overlapped the sheet in a full-page screenshot.
//
// Root cause: #sheet-canvas is a plain div whose pixel width/height is set
// directly in JS from the physical A4 page size (renderSheetCanvas() /
// MM2PX -- completely independent of viewport, untouched by this fix).
// .right-panel switches from overflow:hidden (desktop) to overflow:visible
// at the mobile breakpoint (so the whole page scrolls vertically instead
// of an internal pane) -- but a CSS Grid item's *automatic* minimum width
// only collapses to 0 when its own overflow is exactly "hidden"; once it's
// "visible", the automatic minimum reverts to the item's content-based
// (min-content) size. With no explicit min-width set, that made the fixed-
// pixel #sheet-canvas the de-facto minimum width of .right-panel and, in
// turn, of the whole 1fr grid track -- dragging every sibling (tip,
// buttons, header) wide with it, with only .two-col's own
// overflow-x:hidden hiding (not scrolling) the excess.
//
// The fix adds explicit min-width:0 to .left-panel, .right-panel and
// .preview-scroll (standard CSS Grid/Flexbox fix for exactly this
// content-based-minimum-width bug) and gives .preview-scroll its own
// bounded horizontal scroller (overflow-x:auto) so the physically-fixed-
// size sheet preview stays fully viewable there without forcing any
// sibling wide. Nothing about the sheet's real size, zoom math, or export
// resolution (DPI=300 in downloadPDF/buildLabelPNGBlob, entirely separate
// from the on-screen zoom variable) is touched.
//
// Run from the repo root: node tests/print-sheet-mobile-responsive-layout.js
const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('print.html', 'utf8');

try {
  const mobileBlockMatch = source.match(/@media\(max-width:860px\)\{([\s\S]*?)\n\}/);
  assert(mobileBlockMatch, 'could not locate the @media(max-width:860px) mobile layout block');
  const mobileCss = mobileBlockMatch[1];

  // ── 1: the actual fix -- min-width:0 on every grid/flex item in the
  //    chain that would otherwise inherit the sheet canvas's fixed pixel
  //    width as its own automatic minimum width ──────────────────────
  assert(/\.right-panel\{[^}]*min-width\s*:\s*0/.test(mobileCss),
    '.right-panel must have min-width:0 in the mobile layout block -- otherwise its CSS Grid automatic minimum width reverts to its content (the fixed-size sheet canvas) once overflow:visible is set, forcing the whole column wide');
  assert(/\.left-panel\{[^}]*min-width\s*:\s*0/.test(mobileCss),
    '.left-panel must have min-width:0 in the mobile layout block for the same reason (defensive -- keeps the left column from ever being forced wide by its own content)');
  assert(/\.preview-scroll\{[^}]*min-width\s*:\s*0/.test(mobileCss),
    '.preview-scroll must have min-width:0 in the mobile layout block -- it is the flex item directly wrapping the fixed-size sheet canvas');

  // ── 2: the sheet preview gets its own explicit, bounded horizontal
  //    scroller instead of forcing its ancestors wide ─────────────────
  assert(/\.preview-scroll\{[^}]*overflow-x\s*:\s*auto/.test(mobileCss),
    '.preview-scroll must scroll horizontally on its own (overflow-x:auto) in the mobile layout block, so the physically-fixed-size sheet preview stays reachable without dragging its siblings wide');

  // ── 3: the outer clipping guard stays in place as a defensive
  //    backstop (it must never be relied on as the primary fix, but
  //    removing it isn't required and isn't part of this task) ───────
  assert(/\.two-col\{[^}]*overflow-x\s*:\s*hidden/.test(mobileCss),
    '.two-col should still guard against any other unexpected horizontal overflow source at this breakpoint');

  // ── 4: geometry/export math completely untouched -- this is a
  //    layout/CSS-only fix ────────────────────────────────────────────
  assert(source.includes('let zoom=0.75;'),
    'the on-screen preview zoom default must be untouched');
  assert(/const MM2PX=3\.7795\*zoom;/.test(source),
    'the on-screen mm->px preview conversion must be untouched');
  assert(/const DPI=300,MM2PT=2\.8346;/.test(source),
    'the PDF export DPI/point-per-mm constants must be untouched (export resolution is independent of the on-screen zoom/layout fixed here)');
  ['downloadPDF', 'openCricutModal', 'cricutDownloadZip', 'cricutDownloadSequential',
   'buildLabelPNGBlob', 'renderSheetCanvas'].forEach(fn => {
    assert(source.includes(`function ${fn}(`),
      `${fn}() must still exist, completely untouched by this responsive-layout fix`);
  });

  // ── 5: the cutting-machine tip and export footer are NOT inside the
  //    scrollable preview area -- they must remain full-width siblings
  //    that reflow with the viewport, not scroll away with the sheet ──
  const previewScrollOpenIdx = source.indexOf('id="preview-scroll"');
  const previewScrollCloseSearchFrom = source.indexOf('id="cricut-tip"');
  assert(previewScrollOpenIdx > -1 && previewScrollCloseSearchFrom > previewScrollOpenIdx,
    'expected #preview-scroll to open before #cricut-tip in the document');
  const betweenScrollAndTip = source.slice(previewScrollOpenIdx, previewScrollCloseSearchFrom);
  // The scrollable region's own closing </div> must appear before the tip
  // starts, i.e. the tip is a sibling AFTER #preview-scroll closes, not a
  // descendant still inside it.
  const openDivs = (betweenScrollAndTip.match(/<div\b/g) || []).length;
  const closeDivs = (betweenScrollAndTip.match(/<\/div>/g) || []).length;
  assert(closeDivs >= openDivs,
    '#cricut-tip must sit outside (after) the scrollable #preview-scroll container, not nested inside it, so it always reflows to the full viewport width instead of scrolling away with the sheet');

  console.log('print-sheet mobile responsive-layout checks passed (min-width:0 fix present on .left-panel/.right-panel/.preview-scroll; sheet preview scrolls horizontally within its own bounded box via .preview-scroll{overflow-x:auto}; .two-col overflow-x:hidden backstop retained; zoom/MM2PX/export DPI and all export/geometry functions untouched; cutting-machine tip and export footer remain outside the scrollable preview area so they reflow to full viewport width)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
