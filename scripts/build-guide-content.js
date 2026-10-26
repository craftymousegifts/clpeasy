// Builds guide-me-content.js — the reviewed answer cards used by Guide Me
// (Builder) and the Knowledge Base search. Answers are taken word for word
// from CLPeasy's own published pages, so the guidance stays in step with
// them; tests/guide-me-content-sync.js fails if a page changes and this
// file has not been re-run. Hand-written cards live in CURATED below.
//   node scripts/build-guide-content.js           (writes the file)
//   node scripts/build-guide-content.js --check   (exit 1 if out of date)
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'guide-me-content.js');
const read = f => new JSDOM(fs.readFileSync(path.join(ROOT, f), 'utf8')).window.document;

// Only simple formatting and links survive; everything else keeps its text.
const KEEP = new Set(['STRONG', 'B', 'EM', 'I', 'BR', 'P', 'UL', 'OL', 'LI', 'A']);
function localHref(href) {
  if (!href) return '';
  if (/^(https?:|mailto:)/i.test(href)) return href;
  let h = href.replace(/^\//, '');
  h = h.replace(/^knowledge\/(printing-and-cutting|combining-fragrance-oils|print-and-cut-by-hand)/, '$1.html');
  h = h.replace(/^([a-z0-9-]+)(?=($|[#?]))/, (m, p) => p.endsWith('.html') ? p : p + '.html');
  return h;
}
function clean(node) {
  let out = '';
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, ' ').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (['SVG', 'FIGURE', 'IMG', 'BUTTON', 'SCRIPT', 'STYLE', 'TABLE'].includes(tag)) return;
    const inner = clean(n);
    if (!KEEP.has(tag)) { out += ['DIV', 'SECTION'].includes(tag) ? ' ' + inner + ' ' : inner; return; }
    if (tag === 'BR') { out += '<br>'; return; }
    if (tag === 'A') {
      const href = localHref(n.getAttribute('href'));
      out += href ? `<a href="${href.replace(/"/g, '&quot;')}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : inner;
      return;
    }
    const t = tag === 'B' ? 'strong' : tag === 'I' ? 'em' : tag.toLowerCase();
    out += `<${t}>${inner.trim()}</${t}>`;
  });
  return out.replace(/\s*\[C\d+(?:,\s*C?\d+)*\]/g, '').replace(/ {2,}/g, ' ');
}
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const cards = [];
function add(card) {
  card.html = card.html.trim();
  if (!text(card.html)) return;
  cards.push(card);
}

// 1. Builder Help Guide (step sections and FAQs).
{
  const d = read('builder.html');
  d.querySelectorAll('#help-panel .help-body > .help-section').forEach(sec => {
    const h3 = sec.querySelector('h3');
    const faqs = sec.querySelectorAll('.help-faq');
    if (faqs.length) {
      faqs.forEach(f => {
        const q = f.querySelector('summary').textContent.trim();
        // faq.html carries the current wording for this question.
        if (/^Do I legally need a CLP label\?$/.test(q)) return;
        add({ id: 'help-' + slug(q), title: q, html: clean(f.querySelector('p')), source: 'builder-help', links: [] });
      });
    } else if (h3) {
      const body = [...sec.children].filter(c => c !== h3);
      const html = body.map(c => c.classList.contains('help-step') ? '<li>' + clean(c.querySelector('.help-step-text')).trim() + '</li>' : '<p>' + clean(c).trim() + '</p>').join('')
        .replace(/((?:<li>.*?<\/li>)+)/g, '<ol>$1</ol>');
      add({ id: 'help-' + slug(h3.textContent), title: h3.textContent.trim(), html, source: 'builder-help', links: [] });
    }
  });
}

// 2. FAQ page.
{
  const d = read('faq.html');
  d.querySelectorAll('.faq-item').forEach(i => {
    const q = i.querySelector('.faq-q').textContent.replace('▼', '').trim();
    add({ id: 'faq-' + slug(q), title: q, html: clean(i.querySelector('.faq-a')), source: 'faq', links: [{ href: 'faq.html', label: 'FAQ' }] });
  });
}

// 3. Printing and cutting guide: its Q&A plus a summary of each route.
{
  const d = read('printing-and-cutting.html');
  d.querySelectorAll('details.faq-item').forEach(i => {
    const q = i.querySelector('summary').textContent.trim();
    const body = i.querySelector('summary').nextElementSibling;
    add({ id: 'print-' + slug(q), title: q, html: clean(body), source: 'printing', links: [{ href: 'printing-and-cutting.html#faq', label: 'Printing and cutting guide' }] });
  });
  ['one', 'sheets', 'pdf', 'png', 'cricut', 'svg', 'mobile', 'checks', 'company', 'files'].forEach(id => {
    const sec = d.getElementById(id);
    if (!sec) return;
    const h = sec.querySelector('h1,h2');
    const lead = sec.querySelector('p.lead');
    if (!h || !lead) return;
    add({ id: 'print-route-' + id, title: h.textContent.trim(), html: '<p>' + clean(lead).trim() + '</p>', source: 'printing', links: [{ href: 'printing-and-cutting.html#' + id, label: 'Open the step-by-step guide' }] });
  });
}

// 4. Knowledge Base topics (heading + summary; full text stays on the page).
{
  const d = read('knowledge.html');
  d.querySelectorAll('.section-card[id]').forEach(sec => {
    const h2 = sec.querySelector('h2');
    if (!h2) return;
    const summary = sec.querySelector('.section-summary');
    const paras = summary ? [summary] : [...sec.querySelectorAll(':scope > p')].slice(0, 1);
    const more = [...sec.querySelectorAll('.acc-label')].map(a => a.textContent.replace(/^\W+/u, '').trim());
    const html = paras.map(p => '<p>' + clean(p).trim() + '</p>').join('') + (more.length ? '<p>Covered on the Knowledge Base page: ' + more.map(m => m.replace(/[&<>]/g, '')).join('; ') + '.</p>' : '');
    add({ id: 'kb-' + sec.id, title: h2.textContent.replace(/\s+/g, ' ').trim(), html, source: 'knowledge', topic: sec.id, links: [{ href: 'knowledge.html#' + sec.id, label: 'Read this topic in the Knowledge Base' }] });
  });
}

// 5. Support, compliance and combining-oils pages: named sections only.
function sections(file, wanted, prefix, linkLabel) {
  const d = read(file);
  d.querySelectorAll('h2').forEach(h => {
    const title = h.textContent.replace(/\s+/g, ' ').trim();
    if (!wanted.includes(title)) return;
    const parts = [];
    for (let n = h.nextElementSibling; n && !/^H[12]$/.test(n.tagName); n = n.nextElementSibling) {
      if (n.tagName === 'P' || n.tagName === 'UL' || n.tagName === 'OL') parts.push(n.tagName === 'P' ? '<p>' + clean(n).trim() + '</p>' : clean({ childNodes: [n] }));
    }
    add({ id: prefix + slug(title), title, html: parts.join(''), source: file.replace('.html', ''), links: [{ href: file, label: linkLabel }] });
  });
}
sections('support.html', ['Before you contact us', 'Something missing after Smart Paste?'], 'support-', 'Support page');
sections('compliance.html', ['Clear about what CLPeasy does', 'Classification comes before label creation', 'Software checks have limits', 'Candle safety is a separate task'], 'compliance-', 'Compliance & Transparency');
sections('combining-fragrance-oils.html', ['Can I combine the labels from the individual oils?', 'Where does CLPeasy fit in?'], 'oils-', 'Combining fragrance oils guide');

// 6. Hand-written cards: printing routes (the wording previously given to
// Guide Me, already reviewed in Stage 2) and the CLPeasy-does-not-choose
// guardrail. Kept short and factual about what the software does.
const CURATED = [
  {
    id: 'guide-printing-route', title: 'Choosing a printing route', source: 'guide',
    html: `<p><strong>Neither is the default for everyone</strong> — choose the route that matches what you are printing:</p>
<ul><li>one individual label → ▣ PDF: an individual label file at its exact size (opens for printing or saving as PDF)</li>
<li>several labels arranged on A4 → Print Sheet Composer: save each label, choose how many of each, and print the A4 sheet</li>
<li>design or cutting-machine workflow → ⬡ SVG, or the Composer's "Download for cutting machine" PNGs</li></ul>
<p>⬇ PNG is a high-resolution image (for example for Canva). A PNG does not store a print size, so the app used to print it may choose its own size.</p>
<p>Print at <strong>Actual Size / 100%</strong> and turn off Fit to page, Shrink or Scale to fit. The first time, test on ordinary paper and measure a label with a ruler.</p>`,
    links: [{ href: 'printing-and-cutting.html', label: 'Printing and cutting guide' }]
  },
  {
    id: 'guide-print-shop', title: 'Sending labels to a print company', source: 'guide',
    html: `<p>CLPeasy has no dedicated print-shop file with bleed or crop marks. The ▣ PDF is the exact label size without bleed, so ask the print company what file they need.</p>`,
    links: [{ href: 'printing-and-cutting.html#company', label: 'No printer at home?' }]
  },
  {
    id: 'guide-signal-word', title: 'Which signal word should my label use?', source: 'guide', guard: 'signal',
    html: `<p>CLPeasy doesn't choose a signal word for you. The Builder uses the signal word stated in <strong>Section 2.2</strong> of the SDS you paste into Smart Paste (for example "Signal word: Warning").</p>
<p>If the signal word could not be read, the Builder stops and asks you to check that the pasted Section 2.2 includes the supplier's "Signal word" line. If the result differs from the applicable SDS, contact support before using the label.</p>`,
    links: [{ href: 'faq.html', label: 'FAQ: Which SDS should I use?' }, { href: 'support.html', label: 'Contact support' }]
  },
  {
    id: 'guide-no-classification', title: 'Can CLPeasy tell me my hazards or classification?', source: 'guide', guard: 'classify',
    html: `<p>No. CLPeasy's guidance only explains how to use CLPeasy. It never suggests hazard statements, precautionary statements, pictograms, signal words or classifications.</p>
<p>CLPeasy extracts and formats label information from suitable SDS documentation. It does not independently classify finished mixtures or recalculate hazards. Paste <strong>Section 2.2 — Label elements</strong> of the SDS for your product into Smart Paste in Step 3, then check every extracted code, pictogram and sensitiser against the SDS.</p>`,
    links: [{ href: 'compliance.html', label: 'Compliance & Transparency' }, { href: 'faq.html', label: 'FAQ' }]
  },
  {
    id: 'guide-why-blocked', title: "Why can't I download my label?", source: 'guide',
    html: `<p>Downloads unlock in Step 5 once the label is complete: required product, hazard and business details are filled in, the complete label fits at a readable size, and you have ticked the verification checkbox to confirm you have checked all data against your SDS.</p>
<p>The message under the download buttons says what is still needed.</p>`,
    links: []
  }
];
CURATED.forEach(add);

// Extra search words per card (synonyms customers use). Title and answer
// text are searched too; these only help everyday wording find the card.
const KEYWORDS = {
  'guide-printing-route': 'print printing route which file format pdf png svg a4 sheet single one label how do i print',
  'guide-print-shop': 'print shop printing company professional printer bleed crop marks vistaprint send away',
  'guide-signal-word': 'signal word warning danger which word',
  'guide-no-classification': 'classify classification hazard statements precautionary pictograms tell me hazards which h statements',
  'guide-why-blocked': 'download blocked cannot download greyed disabled locked why won\'t download',
  'help-what-size-label-should-i-use': 'size small wax melt clamshell 52mm 63mm minimum diameter',
  'help-where-do-i-find-my-sds-sheet': 'sds safety data sheet find supplier download',
  'help-what-is-euh208': 'euh208 allergen allergy sensitiser contains',
  'help-smart-paste-didn-t-extract-everything-correctly': 'smart paste missing extract wrong',
  'help-can-i-use-this-on-my-phone': 'phone mobile iphone android tablet',
  'help-printing-a-sheet-of-labels': 'a4 sheet several many labels composer',
  'help-my-label-printed-too-large-or-too-small': 'wrong size too big too small scale shrunk',
  'print-route-cricut': 'cricut cutting machine print then cut silhouette design space',
  'print-route-svg': 'svg vector cutting software',
  'print-route-company': 'print shop printing company no printer',
  'print-route-mobile': 'phone tablet iphone ipad android',
  'kb-euh208': 'euh208 allergen sensitiser',
  'kb-what-is-clp': 'what is clp do i need a label',
  'kb-blended': 'blend blended mix mixing combine fragrance oils',
  'faq-what-is-a-clp-label-and-do-i-need-one': 'do i need a clp label wax melts candles diffusers sprays need one',
  'kb-label-elements': 'what goes on a label required elements must include',
  'print-which-printer-should-i-use': 'printer buy best inkjet laser',
  'print-can-i-print-just-one-label-on-a4': 'single label a4',
  'compliance-clear-about-what-clpeasy-does': 'what does clpeasy do about',
  'oils-can-i-combine-the-labels-from-the-individual-oils': 'combine two fragrance oils blend mix sds',
};
cards.forEach(c => { c.keywords = KEYWORDS[c.id] || ''; });

const ids = new Set();
cards.forEach(c => { if (ids.has(c.id)) throw new Error('duplicate card id ' + c.id); ids.add(c.id); });

const body = '// Generated by scripts/build-guide-content.js from CLPeasy\'s own pages — do not edit by hand.\n' +
  '// Re-run `node scripts/build-guide-content.js` after changing the Help Guide, FAQ, Knowledge Base,\n' +
  '// printing guide, support, compliance or combining-oils pages.\n' +
  '(function (root) {\n  var content = { cards: [\n' + cards.map(c => '    ' + JSON.stringify(c)).join(',\n') + '\n  ] };\n' +
  '  if (typeof module !== \'undefined\' && module.exports) module.exports = content;\n' +
  '  else root.CLPEASY_GUIDE_CONTENT = content;\n})(this);\n';

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== body) { console.error('guide-me-content.js is out of date — run: node scripts/build-guide-content.js'); process.exit(1); }
  console.log('guide-me-content.js is up to date (' + cards.length + ' cards)');
} else {
  fs.writeFileSync(OUT, body);
  console.log('Wrote guide-me-content.js (' + cards.length + ' cards)');
}
