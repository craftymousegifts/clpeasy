#!/usr/bin/env python3
"""QA ONLY - check the 100-SDS report agrees with the results CSV.

    python3 -I scripts/e2e-sds-consistency.py <results.csv> <report.md>
Exits non-zero on any disagreement.
"""
import csv, re, sys
from collections import Counter

rows = list(csv.DictReader(open(sys.argv[1], encoding='utf-8')))
rep = open(sys.argv[2], encoding='utf-8').read()
errs = []
if len(rows) != 100 or len({r['case_id'] for r in rows}) != 100: errs.append(f'CSV has {len(rows)} rows')
csv_v = {r['case_id']: r['overall_result'] for r in rows}
# per-case table
table = dict(re.findall(r'^\| (\d{3}) \|.*\| \*\*([A-Z ]+)\*\* \|', rep, re.M))
if len(table) != 100: errs.append(f'report per-case table has {len(table)} rows')
for k, v in csv_v.items():
    if table.get(k) != v: errs.append(f'{k}: report {table.get(k)} vs CSV {v}')
# summary counts
c = Counter(csv_v.values())
for k in ['PASS', 'FAIL', 'REVIEW', 'SUPPLIER REVIEW', 'BLOCKED', 'NOT TESTED']:
    m = re.search(r'^\| ' + k + r' \| (\d+) \|', rep, re.M)
    if not m or int(m.group(1)) != c.get(k, 0): errs.append(f'summary {k}: report {m and m.group(1)} vs CSV {c.get(k, 0)}')
# register lists vs CSV issue text
reg = {m[0]: (m[1], int(m[2])) for m in re.findall(r'^\| ([DSR]\d) \|.*?\| ([0-9, —]+) \| (\d+) \|$', rep, re.M)}
probe = {'D3': 'rejects valid CLP P statement', 'R2': 'states no classification', 'R4': 'P wording on label materially shorter', 'D6': 'export/preview mismatch'}
for code, needle in probe.items():
    ids = sorted(r['case_id'] for r in rows if needle in r['issue_details'])
    got = sorted(x.strip() for x in reg.get(code, ('', 0))[0].split(',') if x.strip() not in ('', '—'))
    if ids != got or reg.get(code, ('', -1))[1] != len(ids): errs.append(f'register {code}: report {got} vs CSV {ids}')
# stage reconciliation
stopped = [r for r in rows if r['preview_63x44'].startswith('BLOCKED')]
if len(stopped) != 38: errs.append(f'stopped at Step 3: {len(stopped)} (expected 38)')
exported = [r for r in rows if r['exported_formats']]
if len(exported) != 61: errs.append(f'cases with downloads: {len(exported)} (expected 61)')
for bad in ['D6 | Export, size-safety or preview mismatch | CLPeasy (product defect) | 046']:
    if bad in rep: errs.append('stale D6 entry still in report')
print('\n'.join(errs) if errs else f'CONSISTENT: 100 cases, verdicts {dict(c)}, 38 stopped at Step 3, 61 with downloads, register D3/R2/R4/D6 match CSV')
sys.exit(1 if errs else 0)
