import json, sys, os, re, glob, html, pymupdf
F, OLD = sys.argv[1], sys.argv[2]
pdfn = json.load(open(os.path.join(F, 'pdf-names.json')))
TABLE_CASE = {'Geranyl Acetate'}  # builder's existing SENSITISERS spelling (pre-existing normalisation)
out = {'state_exact': 0, 'state_table_case_only': [], 'state_wrong': [], 'other_extraction_changed': [], 'files_checked': 0, 'file_missing_name': [], 'layout_text_in_file': [], 'console_errors': []}
def flat(t): return [re.sub(r'\s+', ' ', t), re.sub(r'\s+', '', t)]
def has(t, n): a, b = flat(t); return n in a or n.replace(' ', '') in b
for cdir in sorted(glob.glob(os.path.join(F, 'e2e-after', '[0-9]*'))):
    cid = os.path.basename(cdir); exp = pdfn[cid]['names']
    j = json.load(open(os.path.join(cdir, 'journey.json')))
    jo = json.load(open(os.path.join(OLD, cid, 'journey.json')))
    for size, v in j['sizes'].items():
        if v.get('console_errors'): out['console_errors'].append((cid, size, v['console_errors'][:1]))
        e, eo = v.get('extraction') or {}, (jo['sizes'][size].get('extraction') or {})
        for f in ['h_codes', 'p_codes', 'signal', 'pictograms_state']:
            if e.get(f) != eo.get(f): out['other_extraction_changed'].append((cid, size, f, eo.get(f), e.get(f)))
        got = e.get('sensitisers')
        if got == exp: out['state_exact'] += 1
        elif len(got) == len(exp) and all(g == x or (g.lower() == x.lower() and g in TABLE_CASE) for g, x in zip(got, exp)): out['state_table_case_only'].append((cid, size, [g for g, x in zip(got, exp) if g != x]))
        else: out['state_wrong'].append((cid, size, exp, got))
        for fpath in glob.glob(os.path.join(cdir, size, 'export-*.svg')) + glob.glob(os.path.join(cdir, size, 'preview-*.svg')) + glob.glob(os.path.join(cdir, size, 'export-*.pdf')):
            if fpath.endswith('.pdf'): t = ''.join(p.get_text() for p in pymupdf.open(fpath))
            else: t = html.unescape(re.sub(r'<[^>]+>', ' ', open(fpath, encoding='utf-8').read()))
            # preview/export of a blocked size still carries full content beneath the overlay
            out['files_checked'] += 1
            for n in got:
                if not has(t, n): out['file_missing_name'].append((cid, os.path.basename(fpath), n))
            if re.search(r'Information:|Supplemental', t): out['layout_text_in_file'].append((cid, os.path.basename(fpath)))
print(json.dumps({k: (v if not isinstance(v, list) else (len(v), v[:6])) for k, v in out.items()}, ensure_ascii=False, indent=0))
