// Regression coverage for the print.html cutting-machine guidance, updated
// 2026-09-10 for the "visual revision" follow-up to the 2026-09-09
// cutting-machine tip card fix.
//
// History: the tip card originally shipped with a wording/contrast/layout
// bug (see git history for the full original writeup). That fix corrected
// the wording, contrast and a bare CSS selector, but the resulting card was
// then judged visually too large -- it took valuable vertical space away
// from the sheet preview. This revision removes the card from the preview
// area entirely and moves the same guidance into the existing
// cutting-machine download modal (#cricutModal) instead, where it doesn't
// compete with the preview for space at all. The real "Download for
// cutting machine" button (#btn-png-all) and its modal are otherwise
// completely unchanged -- no new large card or panel was added anywhere
// near the preview.
//
// Run from the repo root: node tests/cutting-machine-tip-layout.js
const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('print.html', 'utf8');

try {
  // ── 1: the tip card is completely gone from the sheet-preview area --
  //    no element, no CSS, no obsolete wording of either generation ──
  assert(!/id="cricut-tip"/.test(source),
    'the #cricut-tip card must be completely removed from the sheet-preview area (visual revision 2026-09-10) -- it took too much vertical space from the sheet preview');
  assert(!/class="cricut-tip"/.test(source),
    'no element should carry the old .cricut-tip card class any more');
  assert(!/\.cricut-tip\b/.test(source),
    'the .cricut-tip / .cricut-tip-heading / .cricut-tip-link CSS rules must be removed entirely -- the card no longer exists, so its CSS must not linger as dead weight');
  // Note: an unrelated, pre-existing "Printing help" panel elsewhere on the
  // page (in the left-hand controls column, not the sheet-preview area)
  // separately uses the phrase "Download individual PNGs" to describe the
  // same underlying export mechanism -- that block predates the tip card
  // entirely, is out of scope for this revision, and must be left alone,
  // so it is deliberately not asserted against here.
  assert(!/Cutting machine tip/.test(source),
    'the removed card\'s heading text ("Cutting machine tip") must not remain anywhere -- the card is gone, not just hidden');

  // ── 2: no replacement large card/panel was added in its place --
  //    the space directly between the sheet preview and the preview
  //    footer must be reclaimed, not refilled with something similar ──
  const scrollCloseIdx = source.indexOf('id="sheet-canvas-wrap"');
  const previewFooterIdx = source.indexOf('class="preview-footer"');
  assert(scrollCloseIdx > -1 && previewFooterIdx > scrollCloseIdx, 'expected #sheet-canvas-wrap to appear before .preview-footer');
  const betweenPreviewAndFooter = source.slice(scrollCloseIdx, previewFooterIdx);
  assert(!/background:rgba\(255,255,255,0\.04\)/.test(betweenPreviewAndFooter),
    'no new bordered/background "card" style should reappear between the sheet preview and the preview footer');

  // ── 3: the real button and its modal wiring are completely unchanged ──
  ['downloadPDF', 'openCricutModal', 'cricutDownloadZip', 'cricutDownloadSequential',
   'buildLabelPNGBlob', 'renderSheetCanvas'].forEach(fn => {
    assert(source.includes(`function ${fn}(`),
      `${fn}() must still exist, completely untouched by this visual revision`);
  });
  assert(/<button class="btn-secondary" id="btn-png-all" onclick="openCricutModal\(\)">✂️ Download for cutting machine<\/button>/.test(source),
    'the real "Download for cutting machine" button must be byte-for-byte unchanged -- same id, same onclick, same wording');

  // ── 4: the useful guidance now lives inside the existing cutting-
  //    machine modal instead, using the exact required wording ──────
  const cricutModalIdx = source.indexOf('id="cricutModal"');
  assert(cricutModalIdx > -1, 'could not locate the #cricutModal modal element');
  const modalSubMatch = source.match(/<div class="modal-sub" id="modal-sub">([\s\S]*?)<\/div>/);
  assert(modalSubMatch, 'could not locate #modal-sub');
  assert(modalSubMatch.index > cricutModalIdx,
    '#modal-sub must be located inside #cricutModal, not some other modal');
  const modalSubHtml = modalSubMatch[1];
  function normalizeText(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const modalSubText = normalizeText(modalSubHtml);
  const REQUIRED_SENTENCE = 'Each label is downloaded as an individual PNG for Cricut and other Print Then Cut software. Maximum Print Then Cut size: 171 × 235 mm.';
  assert(modalSubText.includes(REQUIRED_SENTENCE),
    `the exact required guidance wording was not found verbatim inside the cutting-machine modal -- got: "${modalSubText}"`);
  // The modal's own existing dynamic count sentence ("Choose how to save
  // your N label PNGs.") must still be present and untouched -- the new
  // guidance is appended alongside it, not a replacement.
  assert(/Choose how to save your <span id="modal-count">0<\/span> label PNG<span id="modal-plural">s<\/span>\./.test(modalSubHtml),
    'the modal\'s existing dynamic "Choose how to save your N label PNGs." sentence (with its live count/plural spans) must be preserved unchanged');

  // ── 5: no new large card/panel appeared anywhere else on the page --
  //    only the tip card's own CSS block was removed; nothing else was
  //    touched (checked broadly via a byte-count sanity range so an
  //    accidental large insertion elsewhere would also be caught) ────
  assert(source.length < 148815, // strictly smaller than the pre-revision file: something was removed, nothing large was added back
    'print.html should be smaller than the pre-revision version -- the tip card and its CSS were removed and nothing large was added back in their place');

  console.log('cutting-machine tip visual-revision checks passed (the #cricut-tip card and all its CSS are completely removed from the sheet-preview area; no replacement card/panel was added; the real "Download for cutting machine" button and its modal wiring are byte-for-byte unchanged; the required guidance sentence now lives inside the existing #cricutModal\'s #modal-sub, alongside its unchanged dynamic count sentence)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
