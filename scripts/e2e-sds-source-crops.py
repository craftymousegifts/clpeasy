#!/usr/bin/env python3
"""QA ONLY - render the supplier's own Section 2.2 from each original PDF.

Crops each genuine supplier SDS from the "2.2" heading to the "2.3" heading
(continuing across a page break when the section wraps) and writes
<e2eDir>/<id>/source-section-2-2.png. Pure rendering of the original PDF.

    python3 -I scripts/e2e-sds-source-crops.py <corpusDir> <e2eDir>
"""
import json, os, re, sys
import pymupdf
from PIL import Image

CORPUS, E2E = sys.argv[1:3]
man = json.load(open(os.path.join(CORPUS, 'manifest.json'), encoding='utf-8'))
for d in man['documents']:
    pdf = pymupdf.open(os.path.join(CORPUS, d['pdf_file']))
    parts, started = [], False
    for pno in range(min(pdf.page_count, 4)):
        page = pdf[pno]
        blocks = page.get_text('blocks')
        y0 = None
        if not started:
            for b in blocks:
                if re.match(r'\s*2\.2\b', b[4]): y0 = b[1] - 4; started = True; break
            if y0 is None: continue
        else:
            # continuation page: skip the repeated header block
            hdr = [b for b in blocks if re.search(r'^\s*Version:\s*\d', b[4], re.M)]
            y0 = (max(b[3] for b in hdr) + 2) if hdr else 0
        y1 = page.rect.height
        end = [b for b in blocks if b[1] > y0 + 2 and re.match(r'\s*(2\.3\b|SECTION\s*3\b|3\.1\b)', b[4])]
        foot = [b for b in blocks if b[1] > y0 + 2 and re.search(r'Nikura Ltd, Unit 6', b[4])]
        if end: y1 = min(b[1] for b in end) - 2
        elif foot: y1 = min(b[1] for b in foot) - 2
        clip = pymupdf.Rect(0, max(0, y0), page.rect.width, y1)
        pix = page.get_pixmap(dpi=150, clip=clip)
        parts.append(Image.frombytes('RGB', (pix.width, pix.height), pix.samples))
        if end: break
    out = os.path.join(E2E, d['id']); os.makedirs(out, exist_ok=True)
    if not parts:
        print(d['id'], 'Section 2.2 heading not found in PDF'); continue
    W = max(p.width for p in parts); H = sum(p.height for p in parts) + 6 * (len(parts) - 1)
    img = Image.new('RGB', (W, H), 'white'); y = 0
    for p in parts: img.paste(p, (0, y)); y += p.height + 6
    img.save(os.path.join(out, 'source-section-2-2.png'))
print('done', len(man['documents']))
