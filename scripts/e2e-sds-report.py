#!/usr/bin/env python3
"""QA ONLY - write the 100-SDS E2E markdown report from 100_SDS_E2E_RESULTS.json.

    python3 -I scripts/e2e-sds-report.py <resultsJson> <out.md> [narrative.md]
"""
import json, re, sys
from collections import Counter, defaultdict

rows = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
P = out.append
c = Counter(r['overall_result'] for r in rows)
assert sum(c.values()) == 100, c
P('# CLPeasy® — 100 genuine 10%-in-candle-wax SDS: end-to-end customer-journey QA\n')
P('**Scope:** for each of 100 genuine Nikura 10%-in-candle-wax supplier SDSs, the exact Section 2.2 text was pasted into the real Smart Paste box of the current production `builder.html` in Chromium. The QA then:\n')
P('- pressed **Extract hazard data**;\n- completed the hazard confirmation and the business details;\n- opened the real Step 5 preview at **63 × 44 mm** and **76 × 51 mm**;\n- ticked the confirmation and pressed the real **PNG / SVG / PDF** buttons;\n- where a size was blocked, followed the builder\'s own **"Use W×Hmm"** recommendation and exported at that size.\n')
P('Downloaded files were then checked independently: the file exists, has the correct physical size and content, and matches the preview.\n')
P('**This is a QA of CLPeasy\'s existing behaviour, not a regulatory certification.** No production code, settings or data were changed.\n')
P('## Summary (all 100 cases individually assessed)\n')
P('| Overall result | Cases |\n|---|---|')
for k in ['PASS', 'FAIL', 'REVIEW', 'SUPPLIER REVIEW', 'BLOCKED', 'NOT TESTED']:
    P(f'| {k} | {c.get(k, 0)} |')
P(f'| **Total** | **{sum(c.values())}** |\n')
for col, title in [('extraction_result', 'Smart Paste extraction'), ('label_result', 'Rendered label + exports')]:
    cc = Counter(r.get(col) or 'n/a' for r in rows)
    P(f'**{title}:** ' + ', '.join(f'{k} {v}' for k, v in sorted(cc.items())) + '\n')

# per-size outcomes
if len(sys.argv) > 3: P(open(sys.argv[3], encoding='utf-8').read())
P('## Size safety at the two common sizes\n')
for k in ['63x44', '76x51']:
    cc = Counter((r.get(f'preview_{k}') or 'n/a') for r in rows)
    P(f'- **{k.replace("x", " × ")} mm:** ' + ', '.join(f'{v} {n}' for n, v in sorted(cc.items(), key=lambda x: -x[1])))
rec = Counter(re.sub(r':.*', '', r.get('recommended_size_result') or '') for r in rows if r.get('recommended_size_result'))
P(f'- **Builder-recommended size used after a block:** ' + (', '.join(f'{k} mm: {v}' for k, v in rec.most_common()) or 'none'))
P('\nA label that does not fit at a size is shown with the existing "Your label needs more space" warning and a "FULL CONTENT DOES NOT FIT" preview. The PNG, PDF and SVG buttons are disabled, a forced click is refused, and no download is charged. This counts as a **PASS for size safety**, not a defect.\n')

# defect register
groups = defaultdict(list)
rules = [
    ('D1', 'Smart Paste drops, changes or merges EUH208 sensitiser names', r'EUH208 names:'),
    ('D2', 'PDF layout text ("Information:") inserted into a sensitiser name', r'PDF layout text inside sensitiser name'),
    ('D3', 'Valid CLP precautionary statements rejected as "CLP code not recognised" — the journey cannot continue', r'rejects valid CLP P statement'),
    ('D4', 'Wrong sensitiser names carried onto the rendered label and the exported files', r'rendered "Contains"'),
    ('D5', 'Other extraction mismatch (H/EUH/P codes, signal word, pictograms) — e.g. GHS07 added alongside GHS05 contrary to CLP Art. 26(1)(c)', r'(H codes missing|unexpected H|EUH missing|unexpected EUH|signal word:|pictograms:|unexpected P codes|dropped without policy)'),
    ('D6', 'Export, size-safety or preview mismatch', r'(export failed|export/preview mismatch|not cleanly blocked|still blocked|does-not-fit overlay|not rendered)'),
    ('S1', 'Supplier Section 2.2 uses GHS-only hazard codes not adopted in GB CLP (e.g. H401, H402, H316); builder correctly stops and asks for supplier clarification', r'GHS-only code'),
    ('R1', 'Supplier P statements (P272/P280/P363/P405) withheld by CLPeasy consumer-label policy with no notice to the customer', r'withheld by CLPeasy consumer-label policy'),
    ('R2', 'Unclassified mixture (supplier: no hazards) — builder cannot continue past Step 3, so no label can be produced', r'states no classification'),
    ('R3', 'Supplier H-statement wording differs from the rendered GB CLP wording', r'wording .* not found verbatim'),
]
for r in rows:
    det = r.get('issue_details') or ''
    for code, _, rx in rules:
        if re.search(rx, det): groups[code].append(r['case_id'])
P('## Defect and finding register\n')
P('| Ref | Finding | Owner | Cases | Count |\n|---|---|---|---|---|')
owner = {'D': 'CLPeasy (product defect)', 'S': 'Supplier SDS', 'R': 'Owner review / policy'}
for code, title, _ in rules:
    ids = groups.get(code, [])
    P(f'| {code} | {title} | {owner[code[0]]} | {", ".join(ids) if ids else "—"} | {len(ids)} |')
P('')

P('## Per-case results\n')
P('| Case | Fragrance | Extraction | 63×44 | 76×51 | Recommended | Exports | Overall | Key reason |\n|---|---|---|---|---|---|---|---|---|')
for r in rows:
    det = (r.get('issue_details') or '').split(' || ')
    key = det[0][:170].replace('|', '/') if det and det[0] else 'All checks passed'
    P(f'| {r["case_id"]} | {r.get("fragrance", "")} | {r.get("extraction_result", "")} | {r.get("preview_63x44", "")} | {r.get("preview_76x51", "")} | {r.get("recommended_size_result", "")} | {r.get("exported_formats", "")} | **{r["overall_result"]}** | {key} |')
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('written', sys.argv[2], dict(c))
