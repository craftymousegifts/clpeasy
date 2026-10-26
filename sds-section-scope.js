// Smart Paste extraction scope (Oct 2026 safety fix).
//
// Defect fixed: Smart Paste used to read hazard codes, precautionary codes and
// the signal word from ALL pasted text. A complete SDS therefore added Section 3
// ingredient hazards (and Section 11/12/16 text) to the finished-product label,
// e.g. "Warning" becoming "Danger" with extra pictograms. This decides which part
// of the pasted text extraction may read. It never classifies anything.
//
//   scoped  one Section 2.2 (Label elements) block was found -> read only that
//           block. "(continued)" headings after a page break stay part of it.
//   whole   no SDS section headings at all (a bare Section 2.2 extract or a
//           list of codes) -> read the text as pasted, exactly as before.
//   unsafe  SDS headings are present but there is not exactly one usable 2.2
//           block, or the label text holds more than one signal-word line
//           (two SDSs, or GB and US/EU classification blocks) -> extract
//           nothing. Never guess between blocks.
(function (root) {
  'use strict';
  // A Section 2.2 heading at the start of a line: "2.2 Label elements",
  // "SECTION 2.2: Labelling", "2.2. Label Elements", or "2.2" with the title
  // on the next line (two-column PDF copies).
  const H22 = /(?:^|\n)[ \t]*(?:sds[ \t]+)?(?:section[ \t]*)?2\.2\.?[ \t]*:?[ \t]*\n?[ \t]*label(?:l?ing)?(?:[ \t]+elements?)?\b/gi;
  // Section titles that end Section 2.2, numbered or not. Unnumbered titles
  // only count as a heading when they are (almost) the whole line.
  const LATER_TITLES = 'other[ \\t]+hazards|composition|mixtures?|substances?|information[ \\t]+on[ \\t]+ingredients|first[- \\t]*aid|fire|fire-?fighting|accidental|handling|exposure|physical|stability|toxicolog|ecolog|disposal|transport|regulatory|other[ \\t]+information';
  const END = new RegExp('(?:^|\\n)[ \\t]*(?:' + [
    '(?:section[ \\t]*)?2\\.3\\b',
    'section[ \\t]*(?:[3-9]|1[0-6])\\b',
    // "3. Composition", "3: Composition", "3 - Composition", "3.2 Mixtures"
    '(?:[3-9]|1[0-6])(?:\\.\\d+)?[.:)]?[ \\t]*[-–:]?[ \\t]*(?:' + LATER_TITLES + ')',
    // Unnumbered "Other hazards", "Composition/information on ingredients", "First aid measures"
    '(?:other[ \\t]+hazards|composition[ \\t]*\\/?[ \\t]*information[ \\t]+on[ \\t]+ingredients|information[ \\t]+on[ \\t]+ingredients|first[- \\t]*aid[ \\t]+measures)[^\\n]{0,40}(?=\\n|$)',
  ].join('|') + ')', 'i');
  // Signs that the text is (part of) a structured SDS rather than a bare
  // extract, including unnumbered section titles.
  const STRUCTURE = /(?:^|\n)[ \t]*(?:section[ \t]*(?:[1-9]|1[0-6])\b|(?:[1-9]|1[0-6])\.\d?\.?[ \t]+(?:identification|hazards?[ \t]+identification|classification|label|other[ \t]+hazards|composition|first[ \t]+aid)|(?:hazards?[ \t]+identification|composition[ \t]*\/?[ \t]*information[ \t]+on[ \t]+ingredients|first[- \t]*aid[ \t]+measures|identification[ \t]+of[ \t]+the[ \t]+(?:substance|mixture))[^\n]{0,40}(?=\n|$))/i;
  const LABEL_CONTENT = /signal[ \t]*word|\bH\d{3}|\bP\d{3}|\bEUH\d{3}/i;
  const CONTINUED = /^[\s:.\-–—]*\(?\s*(?:continued|cont(?:'d|\.|d))\b/i;
  const SIGNAL_LINE = /(?:^|\n)[ \t]*signal[ \t]*words?\b/gi;
  // Any section or numbered sub-section heading (e.g. "SECTION 1", "1.1", "2.1").
  const INTERVENING = /(?:^|\n)[ \t]*(?:section[ \t]*\d|\d{1,2}\.\d{1,2}\b)/i;
  // Content that starts a new label: a signal word, H code or EUH code.
  const NEW_LABEL = /signal[ \t]*words?|\bH\d{3}|\bEUH\d{3}/i;
  const SIGNAL_VALUE = /signal[ \t]*words?[ \t]*[:\-|]?[ \t]*(?:warning|danger)\b/gi;

  function scope(raw) {
    const text = String(raw || '');
    const heads = [...text.matchAll(H22)].map(m => ({ at: m.index, len: m[0].length }));
    let out;
    if (!heads.length) {
      out = STRUCTURE.test(text) ? { status: 'unsafe', reason: 'no-section-2-2' } : { status: 'whole', text };
    } else {
      const blocks = [];
      let prevOpen = false, prevBody = '';   // previous 2.2 block ran straight into this heading
      heads.forEach((h, i) => {
        let seg = text.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : undefined);
        const end = seg.slice(h.len).search(END);
        if (end >= 0) seg = seg.slice(0, h.len + end);
        const body = seg.slice(h.len);
        const wasOpen = prevOpen, before = prevBody;
        prevOpen = end < 0; prevBody = body;
        if (CONTINUED.test(body)) { if (blocks.length) blocks[blocks.length - 1] += '\n' + seg; return; }
        if (!LABEL_CONTENT.test(body)) return;
        // Unmarked repeat of the heading at the top of a new page (owner-approved,
        // Oct 2026): a continuation only when the previous 2.2 block runs straight
        // into it with no other section heading in between, and this part adds no
        // signal word, H code or EUH code (P statements only). Anything else is
        // treated as a separate block, so two SDSs are never combined.
        if (wasOpen && blocks.length && !INTERVENING.test(before) && !NEW_LABEL.test(body)) {
          blocks[blocks.length - 1] += '\n' + seg; return;
        }
        blocks.push(seg);
      });
      out = blocks.length === 1 ? { status: 'scoped', text: blocks[0] }
        : { status: 'unsafe', reason: blocks.length ? 'several-section-2-2' : 'empty-section-2-2' };
    }
    // One label has one signal word. Two signal-word lines mean two SDSs or
    // two classification regimes (e.g. GB and US) -- never pick one.
    if (out.status !== 'unsafe' && ((out.text.match(SIGNAL_LINE) || []).length > 1 || (out.text.match(SIGNAL_VALUE) || []).length > 1)) {
      out = { status: 'unsafe', reason: 'several-signal-words' };
    }
    return out;
  }

  const MESSAGE = 'We couldn’t reliably identify one Section 2.2 (Label elements) section. Please copy Section 2.2 from the safety data sheet covering your finished product and try again.';
  const api = Object.freeze({ scope, MESSAGE });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SdsSectionScope = api;
})(typeof window !== 'undefined' ? window : globalThis);
