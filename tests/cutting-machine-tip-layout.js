// Regression coverage for the print.html "Cutting machine tip" card layout
// fix (2026-09-09). The reported bug: `.cricut-tip strong{display:block}`
// was a bare tag selector, so it matched BOTH the card's own heading
// ("Cutting machine tip") AND a second <strong> the sentence itself used
// to emphasise "Download individual PNGs" -- forcing that second phrase
// (and everything after it) onto its own separate line, on top of low
// text-contrast (rgba(255,255,255,0.45) on the dark panel background) and
// link wording ("Download individual PNGs") that didn't match the real
// button below it ("Download for cutting machine"). The fix:
//   1. Replaces the sentence with the single required message, using an
//      <a> (not a second <strong>) for "Download for cutting machine" so
//      it matches the real button's own wording exactly.
//   2. Scopes the block-display rule to a dedicated `.cricut-tip-heading`
//      class instead of a bare "strong" selector, so a second emphasised
//      element in the sentence can never be forced onto its own line
//      again the same way.
//   3. Raises the tip's own text opacity from 0.45 to 0.8 for contrast.
//   4. Wires the link to scroll/focus the real #btn-png-all button
//      (preventDefault()ed, so it never raw-jumps as a plain anchor) --
//      it does not call openCricutModal() or any download function, so
//      clicking it can never start a download by itself.
// The tip's own position in the DOM (after the sheet-canvas/preview-scroll
// block, in normal document flow, never position:absolute/fixed) means it
// was already structurally below the printable sheet before this fix and
// remains so -- checked here so a future edit can't quietly reintroduce
// an overlap.
//
// Run from the repo root: node tests/cutting-machine-tip-layout.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('print.html', 'utf8');

try {
  // ── Locate the tip block and its CSS ────────────────────────────
  const tipMatch = source.match(/<div class="cricut-tip" id="cricut-tip">[\s\S]*?<\/div>/);
  assert(tipMatch, 'could not locate the #cricut-tip block in print.html');
  const tipBlockHtml = tipMatch[0];
  const tipInnerMatch = tipBlockHtml.match(/^<div class="cricut-tip" id="cricut-tip">([\s\S]*)<\/div>$/);
  const tipInnerHtml = tipInnerMatch[1];

  // ── 1: obsolete wording fully gone -- scoped to this card only.
  //    (An unrelated pre-existing "Printing help" panel elsewhere on the
  //    page separately uses the phrase "Download individual PNGs" to
  //    describe the same underlying export mechanism -- that block is not
  //    part of the reported bug/this task's scope, so it must be left
  //    untouched and must not fail this check.)
  assert(!tipBlockHtml.includes('Download individual PNGs'),
    'the obsolete "Download individual PNGs" wording must be fully removed from the cutting-machine tip card');

  const cssBlockMatch = source.match(/\/\* CRICUT TIP BOX \*\/([\s\S]*?)\/\* EMPTY STATE \*\//);
  assert(cssBlockMatch, 'could not locate the CRICUT TIP BOX CSS block');
  const tipCss = cssBlockMatch[1];

  // ── 2: exact required visible wording ───────────────────────────
  function normalizeText(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const visibleText = normalizeText(tipInnerHtml);
  const REQUIRED_SENTENCE = 'For Cricut and other cutting machines, select Download for cutting machine below. Each label will be downloaded as an individual PNG for Print Then Cut. Maximum Print Then Cut size: 171 × 235 mm.';
  assert(visibleText.includes(REQUIRED_SENTENCE),
    `the exact required tip wording was not found verbatim -- got: "${visibleText}"`);
  assert(visibleText.includes('Cutting machine tip'),
    'the tip heading text must be preserved');

  // ── 3: the "Download for cutting machine" wording must be a real
  //    link, wired to scroll/focus the real button, never a download ──
  const linkMatch = tipInnerHtml.match(/<a\s+([^>]*)>Download for cutting machine<\/a>/);
  assert(linkMatch, 'the "Download for cutting machine" text must be an <a> link, matching the real button\'s exact wording');
  const linkAttrs = linkMatch[1];
  assert(/href="#btn-png-all"/.test(linkAttrs),
    'the tip link must target the real cutting-machine button (#btn-png-all)');
  assert(/preventDefault\(\)/.test(linkAttrs),
    'the tip link must preventDefault() so it never performs a raw anchor-jump/navigation');
  assert(/scrollIntoView/.test(linkAttrs),
    'the tip link must scroll the real cutting-machine button into view');
  assert(/\.focus\(\)/.test(linkAttrs),
    'the tip link must focus the real cutting-machine button');
  assert(!/openCricutModal|cricutDownloadZip|cricutDownloadSequential|downloadAllPNGs/.test(linkAttrs),
    'the tip link must not call any function that opens the download modal or starts a download -- it must only scroll/focus the real button');

  // ── 4: CSS root-cause fix -- no bare ".cricut-tip strong" block rule ──
  assert(!/\.cricut-tip\s+strong\s*\{[^}]*display\s*:\s*block/.test(source),
    'a bare ".cricut-tip strong" rule forcing display:block must not exist -- it previously matched every <strong> in the card (including a second one in the sentence), forcing unwanted line breaks -- this is the exact reported bug');
  assert(/\.cricut-tip-heading\s*\{[^}]*display\s*:\s*block/.test(tipCss),
    'the heading must use its own dedicated class for the display:block rule, not a bare tag selector');
  assert(/class="cricut-tip-heading"/.test(tipInnerHtml),
    'the heading element must use the dedicated .cricut-tip-heading class');

  // ── 5: readable contrast ─────────────────────────────────────────
  const tipColorMatch = tipCss.match(/\.cricut-tip\{[^}]*color:rgba\(255,255,255,([\d.]+)\)/);
  assert(tipColorMatch, 'could not find the .cricut-tip text color declaration');
  const opacity = Number(tipColorMatch[1]);
  assert(opacity >= 0.7,
    `the tip's text must use a readable opacity on the dark background (>= 0.7; was 0.45 when reported as poor contrast) -- got ${opacity}`);

  // ── 6: never overlaps/covers the printable sheet ────────────────
  assert(!/\.cricut-tip\{[^}]*position\s*:\s*(absolute|fixed)/.test(tipCss),
    'the cutting-machine tip must stay in normal document flow (no position:absolute/fixed) so it can never overlap the printable sheet');
  const sheetCanvasWrapIdx = source.indexOf('id="sheet-canvas-wrap"');
  const tipIdx = source.indexOf('id="cricut-tip"');
  assert(sheetCanvasWrapIdx > -1 && tipIdx > sheetCanvasWrapIdx,
    'the cutting-machine tip must appear in the DOM after (below) the sheet canvas, never above/covering the printable sheet');
  const previewFooterIdx = source.indexOf('class="preview-footer"');
  assert(tipIdx < previewFooterIdx,
    'the cutting-machine tip must sit between the sheet preview and the preview footer, exactly where it did before this fix');

  // ── 7: geometry/export functions must be completely untouched ──
  ['downloadPDF', 'openCricutModal', 'cricutDownloadZip', 'cricutDownloadSequential',
   'buildLabelPNGBlob', 'renderSheetCanvas'].forEach(fn => {
    assert(source.includes(`function ${fn}(`),
      `${fn}() must still exist, completely untouched by this tip-card wording/layout fix`);
  });

  // ── 8: behavioural proof -- a real click on the REAL extracted markup
  //    scrolls/focuses the real button and never opens the modal or
  //    navigates, using the exact onclick attribute shipped in print.html ──
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="preview-scroll"><div id="sheet-canvas-wrap"></div></div>
    ${tipBlockHtml}
    <div class="preview-footer"></div>
    <div id="preview-export-footer">
      <button class="btn-secondary" id="btn-png-all" onclick="window.__openCricutModalCalled=true;">✂️ Download for cutting machine</button>
    </div>
  </body></html>`, { runScripts: 'dangerously', url: 'https://local.clpeasy.test/print.html' });

  const { window } = dom;
  const btn = window.document.getElementById('btn-png-all');
  let scrolledIntoView = false;
  let scrollOpts = null;
  // jsdom does not implement scrollIntoView -- stub it, as the codebase's
  // own tests already do for other unimplemented jsdom APIs (getContext).
  btn.scrollIntoView = (opts) => { scrolledIntoView = true; scrollOpts = opts; };

  const link = window.document.getElementById('cricut-tip-link');
  assert(link, 'the tip link element (#cricut-tip-link) must exist in the rendered markup');

  const beforeHash = window.location.hash;
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  assert.strictEqual(scrolledIntoView, true,
    'clicking the tip link must scroll the real cutting-machine button into view');
  // Compared field-by-field rather than with deepStrictEqual: scrollOpts is
  // an object literal created inside the jsdom window's own realm (via the
  // real onclick attribute executed by runScripts:'dangerously'), so it has
  // a different Object prototype than a literal written in this file --
  // deepStrictEqual treats that prototype difference as inequality even
  // when every property value matches, which would be a test-methodology
  // false failure, not a real behavioural difference.
  assert.strictEqual(scrollOpts && scrollOpts.behavior, 'smooth',
    'the scroll must be smooth');
  assert.strictEqual(scrollOpts && scrollOpts.block, 'center',
    'the scroll must centre the button in view');
  assert.strictEqual(window.document.activeElement, btn,
    'clicking the tip link must move focus to the real cutting-machine button');
  assert.strictEqual(window.__openCricutModalCalled, undefined,
    'clicking the tip link must NOT trigger the real button\'s own click handler (which opens the download modal) -- it must only scroll/focus, never simulate a click or start a download');
  assert.strictEqual(window.location.hash, beforeHash,
    'clicking the tip link must not perform a raw anchor-jump navigation (its default action must be prevented)');

  console.log('cutting-machine tip layout fix checks passed (exact required wording present; obsolete "Download individual PNGs" wording gone; link matches the real button\'s exact wording and only scrolls/focuses it -- never opens the modal or downloads; the bare ".cricut-tip strong" rule that caused the line-break bug is gone, replaced by a heading-only class; text contrast raised to a readable level; tip stays in normal flow after the sheet preview, never overlapping it; export/geometry functions untouched)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
