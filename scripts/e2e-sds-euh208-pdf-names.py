# Independent supplier EUH208 names straight from the supplier PDF's own text
# blocks (PyMuPDF keeps the right-hand column separate from the row label).
import sys, json, re, os, pymupdf
corpus = sys.argv[1]; out = {}
for i in range(1, 101):
    cid = f'{i:03d}'; d = pymupdf.open(os.path.join(corpus, cid + '.pdf'))
    blocks = [b[4] for pg in d for b in pg.get_text('blocks') if re.search(r'EUH\s*208', b[4])]
    if not blocks: out[cid] = None; continue
    b = blocks[0]
    b = re.split(r'\n(?:Supplemental|Information:)\s*\n', b)[0]
    b = re.sub(r'(\S)-\n', r'\1-', b).replace('\n', ' ')
    m = re.search(r'EUH\s*208\s*[,;:]?\s*Contains\s*:?\s*(.+?)\.?\s+May\s+(?:produce|cause)\s+an\s+allergic', b, re.S)
    out[cid] = {'block': blocks[0], 'clause': m.group(1) if m else None,
                'names': [n.strip() for n in re.split(r';\s*|,\s+', m.group(1))] if m else None}
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print(sum(1 for v in out.values() if v), 'with EUH208;', sum(1 for v in out.values() if v and not v['names']), 'unparsed')
