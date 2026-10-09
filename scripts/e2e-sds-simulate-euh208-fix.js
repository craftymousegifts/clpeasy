'use strict';
// QA ONLY - offline simulation of a PROPOSED (not implemented) EUH208 fix.
// Uses builder.html's own EUH208_CLAUSE_RE / parseBoundedSubstanceList logic,
// copied verbatim from the production source at run time, and compares the
// current result and the proposed result with the supplier's names recorded
// in 100_SDS_E2E_RESULTS.json for every case.
//   node scripts/e2e-sds-simulate-euh208-fix.js <corpusDir> <resultsJson>
const fs = require('fs'), path = require('path');
const [CORPUS, RES] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');
const grab = name => { const i = src.indexOf(name); return src.slice(i, src.indexOf('\n}', i) + 2); };
const RE = eval(src.match(/const EUH208_CLAUSE_RE = (\/.*\/i);/)[1]);
const parse = eval('(' + grab('function parseBoundedSubstanceList') + ')');
// Proposed pre-normalisation, applied ONLY to the text used for the EUH208
// clause: drop the SDS two-column row label that a PDF copy wraps into the
// sentence, then re-join a name broken at a hyphen across lines.
const proposed = t => t
  .replace(/(^|\n)[ \t]*(?:Supplemental[ \t]+)?Information:[ \t]*/gi, '$1')
  .replace(/-[ \t]*\r?\n[ \t]*/g, '-');
const canon = a => a.join(', ').replace(/\s+/g, ' ').trim().toLowerCase();
const rows = JSON.parse(fs.readFileSync(RES, 'utf8'));
const tally = { cases: 0, current_ok: 0, proposed_ok: 0, regressions: [], still_wrong: [] }, examples = [];
for (const r of rows) {
  const exp = r._detail && r._detail.supplier && r._detail.supplier.euh208_names; if (!exp) continue;
  tally.cases++;

  const t = fs.readFileSync(path.join(CORPUS, r.case_id + '-section-2-2.txt'), 'utf8');
  const cur = r._detail.builder.sensitisers;
  const m = proposed(t).match(RE); const pro = m ? parse(m[1]) : null;
  const curOk = canon(cur) === canon(exp), proOk = !!pro && canon(pro) === canon(exp);
  if (curOk) tally.current_ok++; if (proOk) tally.proposed_ok++;
  if (curOk && !proOk) tally.regressions.push(r.case_id);
  if (!proOk) tally.still_wrong.push({ id: r.case_id, expected: exp, proposed: pro });
  if (['011', '015', '039', '061'].includes(r.case_id)) examples.push({ id: r.case_id, supplier: exp, current: cur, proposed: pro });
}
console.log(JSON.stringify({ tally, examples }, null, 1));
