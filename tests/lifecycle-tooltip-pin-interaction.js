// Regression coverage for the lifecycle tooltip pointer bug (fix: finish
// lifecycle accuracy audit, round 3): on desktop, mouseenter opened the
// tooltip, so the click event that followed immediately afterward saw it
// already open and toggled it straight back shut -- clicking a node never
// left its tooltip visibly pinned open. Hover must stay a temporary
// preview; only click/tap/Enter/Space may pin a tooltip open, and a pinned
// tooltip must survive mouseleave, close on Escape or an outside click, and
// switch cleanly when a different node is clicked.
//
// Run from repo root: node tests/lifecycle-tooltip-pin-interaction.js

const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const indexSource = fs.readFileSync('index.html', 'utf8');

// Extract just the lifecycle section (markup + its own inline script) so
// this test is fast and isn't coupled to unrelated homepage scripts (auth,
// seasonal particles, etc.) that error out harmlessly in a DOM-only
// environment -- exactly as tests/print-sheet-workflow.js and
// tests/autumn-homepage-ui.js already do for their own focused sections.
const lifecycleMatch = indexSource.match(/<!-- CLP LABEL LIFECYCLE -->[\s\S]*?\}\)\(\);\s*<\/script>/);
assert(lifecycleMatch, 'could not locate the CLP lifecycle section + its inline script in index.html');

function buildDom() {
  const dom = new JSDOM(`<!doctype html><html><body>${lifecycleMatch[0]}</body></html>`, {
    url: 'https://example.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const document = window.document;
  const tip = document.getElementById('lc-tip');
  const node = function (step) { return document.querySelector('.lc-node[data-step="' + step + '"]'); };
  const isOpen = function () { return tip.style.display === 'block'; };
  return { dom, window, document, tip, node, isOpen };
}

// ── The reported bug: mouseenter -> click -> mouseleave must leave the
// tooltip PINNED OPEN, not hidden. ──────────────────────────────────────
(function () {
  const { window, tip, node, isOpen } = buildDom();
  const n3 = node(3);

  n3.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'hover (mouseenter) must show the tooltip');

  n3.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'clicking the hovered node must PIN the tooltip open, not toggle it shut');

  n3.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'mouseleave must not close a pinned tooltip');

  // Still open with the correct step's content after all of the above.
  assert.strictEqual(document_lc_tip_step(tip), 'Step 3 of 9', 'the pinned tooltip must still show step 3 after mouseenter -> click -> mouseleave');

  // Escape closes a pinned tooltip.
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.strictEqual(isOpen(), false, 'Escape must close a pinned tooltip');
})();

function document_lc_tip_step(tip) {
  const el = tip.querySelector('#lc-tip-step') || tip.ownerDocument.getElementById('lc-tip-step');
  return el ? el.textContent : null;
}

// ── Outside click closes a pinned tooltip ───────────────────────────────
(function () {
  const { window, document, isOpen, node } = buildDom();
  node(1).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'click must pin the tooltip open');
  document.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(isOpen(), false, 'a click outside any node must close the pinned tooltip');
})();

// ── Clicking a different node switches the pin ──────────────────────────
(function () {
  const { window, tip, node, isOpen } = buildDom();
  node(2).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(document_lc_tip_step(tip), 'Step 2 of 9', 'clicking node 2 must pin its tooltip');
  node(5).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'the tooltip must still be open after switching nodes');
  assert.strictEqual(document_lc_tip_step(tip), 'Step 5 of 9', 'clicking a different node must switch the pinned tooltip to it, not just leave node 2\'s content showing');
})();

// ── Clicking the already-pinned node again unpins it ────────────────────
(function () {
  const { window, node, isOpen } = buildDom();
  node(4).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'click must pin the tooltip open');
  node(4).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(isOpen(), false, 'clicking the already-pinned node again must unpin/close it');
})();

// ── Enter and Space activate (pin) the focused node, same as click ──────
(function () {
  const { window, tip, node, isOpen } = buildDom();
  const n6 = node(6);
  n6.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.strictEqual(isOpen(), true, 'Enter must open/pin the focused node\'s tooltip');
  assert.strictEqual(document_lc_tip_step(tip), 'Step 6 of 9', 'Enter must pin the correct node\'s content');
  n6.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.strictEqual(isOpen(), false, 'Enter on the already-pinned node must unpin/close it');

  const n7 = node(7);
  n7.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  assert.strictEqual(isOpen(), true, 'Space must open/pin the focused node\'s tooltip');
  assert.strictEqual(document_lc_tip_step(tip), 'Step 7 of 9', 'Space must pin the correct node\'s content');
})();

// ── Plain hover with no click still previews and clears on mouseleave
// (unpinned hover must keep working exactly as before) ──────────────────
(function () {
  const { window, node, isOpen } = buildDom();
  const n8 = node(8);
  n8.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'hover must still preview the tooltip when nothing is pinned');
  n8.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
  assert.strictEqual(isOpen(), false, 'mouseleave must close an unpinned hover-preview tooltip');
})();

// ── Hovering a different node while one is pinned previews, then reverts
// to the pinned node's tooltip on mouseleave (never hides it) ───────────
(function () {
  const { window, tip, node, isOpen } = buildDom();
  node(1).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.strictEqual(document_lc_tip_step(tip), 'Step 1 of 9', 'node 1 must be pinned');

  node(9).dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
  assert.strictEqual(document_lc_tip_step(tip), 'Step 9 of 9', 'hovering a different node while one is pinned must preview the hovered node');

  node(9).dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
  assert.strictEqual(isOpen(), true, 'leaving the hover-previewed node must not hide the tooltip while a pin exists');
  assert.strictEqual(document_lc_tip_step(tip), 'Step 1 of 9', 'leaving the hover-previewed node must revert the tooltip back to the pinned node (step 1), not stay on step 9 or hide');
})();

console.log('lifecycle tooltip pin-interaction checks passed (mouseenter->click->mouseleave keeps a pinned tooltip open; Escape/outside-click/re-click/Enter/Space and hover-preview-while-pinned all behave correctly)');
