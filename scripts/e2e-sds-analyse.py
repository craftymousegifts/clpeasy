#!/usr/bin/env python3
"""QA ONLY - independent assessment of the 100-SDS customer-journey evidence.

Reads the corpus (manifest + exact Section 2.2 texts), the per-case
journey.json + files written by e2e-sds-customer-journey.js, and the
historical extraction-only CSV. Derives the supplier's label elements
independently from the Section 2.2 text (never from the builder), compares
them with the populated builder, the rendered preview SVG and the actually
downloaded PNG / SVG / PDF files, and writes 100_SDS_E2E_RESULTS.csv/.json.

    python3 -I scripts/e2e-sds-analyse.py <corpusDir> <e2eDir> <historicalCsv> <labelRenderJs> <outDir>
"""
import csv, hashlib, io, json, os, re, sys

import numpy as np
import pymupdf
from PIL import Image

CORPUS, E2E, HIST, RENDER_JS, OUT = sys.argv[1:6]
Image.MAX_IMAGE_PIXELS = None

# GHS-only codes that are not part of GB/EU CLP (supplier-document issue).
NON_CLP_H = {'H303', 'H305', 'H313', 'H316', 'H320', 'H333', 'H401', 'H402', 'H403'}
# Valid CLP precautionary statements that CLPeasy's policy deliberately does
# not add to consumer labels automatically (from the builder's own notice).
POLICY_WITHHELD_P = {'P272', 'P264', 'P270', 'P280', 'P303+P361+P353', 'P362', 'P362+P364', 'P363', 'P405'}
# Codes the builder reported "not recognised" that are genuine CLP Annex IV
# precautionary statements (verified against Regulation (EC) 1272/2008 Annex IV,
# retained in GB CLP).
VALID_CLP_P = {'P201', 'P202', 'P308+P313', 'P391', 'P273', 'P261', 'P501', 'P302+P352', 'P333+P313', 'P305+P351+P338',
               'P337+P313', 'P310', 'P301+P310', 'P331', 'P203', 'P318', 'P317', 'P319'}
# Pictograms required for the supplier's H codes (CLP Annex V; Article 26
# precedence: GHS05/GHS06 remove GHS07 for the same effects).
H_PICTO = {}
for h in ['H317', 'H315', 'H319', 'H302', 'H312', 'H332', 'H335', 'H336']: H_PICTO[h] = 'exclamation'
for h in ['H304', 'H334', 'H340', 'H341', 'H350', 'H351', 'H360', 'H361', 'H362', 'H370', 'H371', 'H372', 'H373']: H_PICTO[h] = 'health'
for h in ['H400', 'H410', 'H411']: H_PICTO[h] = 'aquatic'
for h in ['H314', 'H318']: H_PICTO[h] = 'corrosive'
for h in ['H224', 'H225', 'H226', 'H228']: H_PICTO[h] = 'flame'
for h in ['H300', 'H301', 'H310', 'H311', 'H330', 'H331']: H_PICTO[h] = 'skull'
H_PICTO.pop('H362', None)  # H362 has no pictogram


def expected_pictos(hcodes):
    s = {H_PICTO[h] for h in hcodes if h in H_PICTO}
    if 'skull' in s: s.discard('exclamation')
    if 'corrosive' in s and not ({'H317', 'H302', 'H312', 'H332', 'H335', 'H336'} & set(hcodes)): s.discard('exclamation')
    if 'health' in s and 'H334' in hcodes and not ({'H302', 'H312', 'H332', 'H335', 'H336', 'H319', 'H315'} & set(hcodes)): s.discard('exclamation')
    return sorted(s)


# Repeated page header/footer lines of the supplier PDF (case-sensitive so a
# genuine "EUH210, Safety data sheet available on request." line is kept).
JUNK = re.compile(r'(Nikura Ltd, Unit|^\s*Page\s+\d+|Issue date:|^\s*Version:|^\s*SAFETY DATA SHEET\s*$|In accordance with REACH|^\s*Product:|Classification under Regulation)')


def label_section(text):
    lines = text.replace('\f', '\n').split('\n')
    start = next((i for i, l in enumerate(lines) if re.match(r'\s*2\.2\b', l)), 0)
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if re.match(r'\s*(2\.3\b|SECTION\s*3\b|3\.1\b)', lines[i], re.I): end = i; break
    return [l for l in lines[start:end] if not JUNK.search(l)]


def norm_p(m):
    nums = re.findall(r'\d{3}', m)
    return '+'.join('P' + n for n in nums)


def supplier_elements(text):
    lines = label_section(text)
    sec = '\n'.join(lines)
    sig = re.search(r'Signal\s+word:\s*([A-Za-z]+)', sec)
    signal = sig.group(1).capitalize() if sig else ''
    if signal.lower() in ('none', 'not'): signal = ''
    h = sorted({c for c in re.findall(r'(?<![A-Z])H\d{3}', sec)})
    euh = sorted(set(re.findall(r'EUH\d{3}', sec)))
    p = []
    for m in re.finditer(r'\bP\d{3}(?:\s*[/+]\s*P?\d{3})*', sec):
        c = norm_p(m.group(0))
        if c not in p: p.append(c)
    # EUH208 sensitiser names exactly as the supplier lists them, re-joining the
    # PDF's two-column wrapping (left column words "Supplemental"/"Information:"
    # are labels, not part of the chemical names).
    names = None
    joined = ''
    for l in lines:
        l2 = re.sub(r'^\s*(Supplemental|Information:)\s*', ' ', l)
        l2 = re.sub(r'^\s*(Precautionary|statements:)\s*', ' ', l2)
        if joined.endswith('-') or re.search(r',\d*$', joined.rstrip()) and re.match(r'\s*\d', l2):
            joined = joined.rstrip() + l2.strip()
        else:
            joined += ' ' + l2.strip()
    m = re.search(r'EUH208\s*[,;:]?\s*Contains\s+(.+?)\.\s*May\s+(?:produce|cause)', joined, re.I)
    if m:
        names = [n.strip() for n in re.split(r',\s+(?=\S)|\s+and\s+', re.sub(r'\s+', ' ', m.group(1))) if n.strip()]
    # H statement wording as printed by the supplier
    hwords = {}
    for m in re.finditer(r'(?<![A-Z])(H\d{3})\s*[,:]?\s*([^\n]+)', sec):
        hwords.setdefault(m.group(1), m.group(2).strip())
    return dict(signal=signal, h=h, euh=euh, p=p, euh208_names=names, h_wording=hwords, pictograms=expected_pictos(h))


def ghs_hashes(js):
    src = open(js, encoding='utf-8').read()
    block = src[src.index('const GHS_IMG={'):]
    block = block[:block.index('};')]
    out = {}
    for k, v in re.findall(r'(\w+)\s*:\s*"(data:image/[^"]+)"', block):
        out[hashlib.sha1(v.encode()).hexdigest()] = k
    return out


GHS = ghs_hashes(RENDER_JS)


def svg_info(path):
    s = open(path, encoding='utf-8').read()
    texts = []
    for m in re.finditer(r'<text\b[^>]*>(.*?)</text>', s, re.S):
        inner = re.sub(r'<tspan[^>]*>', ' ', m.group(1))
        inner = re.sub(r'<[^>]+>', ' ', inner)
        texts.append(re.sub(r'\s+', ' ', inner.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&#39;', "'").replace('&quot;', '"')).strip())
    imgs = re.findall(r'<image\b[^>]*?href="(data:image/[^"]+)"', s)
    ghs = sorted({GHS[hashlib.sha1(i.encode()).hexdigest()] for i in imgs if hashlib.sha1(i.encode()).hexdigest() in GHS})
    wh = re.search(r'<svg[^>]*\swidth="([\d.]+)mm"[^>]*\sheight="([\d.]+)mm"', s)
    return dict(text=' '.join(texts), lines=texts, ghs=ghs, images=len(imgs), width_mm=float(wh.group(1)) if wh else None, height_mm=float(wh.group(2)) if wh else None,
                does_not_fit='DOES NOT FIT' in s.upper(), raw=s)


def canon(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()


def gray(img, size=None):
    # Flatten transparency (rounded label corners) onto white paper first.
    if img.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGBA', img.size, (255, 255, 255, 255)); bg.alpha_composite(img.convert('RGBA')); img = bg
    im = img.convert('L')
    if size: im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, dtype=np.float32)


def check_exports(dirp, tag, mm, prev):
    """Verify actually downloaded files for one size."""
    W, H = mm
    r = {'formats': [], 'issues': []}
    png, svgp, pdfp = [os.path.join(dirp, f'export-{tag}.{e}') for e in ('png', 'svg', 'pdf')]
    png_img = None
    if os.path.exists(png):
        r['formats'].append('PNG')
        png_img = Image.open(png); png_img.load()
        exp_w, exp_h = round(W / 25.4 * 600), round(H / 25.4 * 600)
        r['png_px'] = list(png_img.size)
        if abs(png_img.size[0] - exp_w) > 2 or abs(png_img.size[1] - exp_h) > 2: r['issues'].append(f'PNG {png_img.size} != {exp_w}x{exp_h}px (600 dpi)')
        dpi = png_img.info.get('dpi'); r['png_dpi'] = [round(x) for x in dpi] if dpi else None
        if gray(png_img).std() < 5: r['issues'].append('PNG appears blank')
    if os.path.exists(svgp):
        r['formats'].append('SVG')
        si = svg_info(svgp)
        r['svg_mm'] = [si['width_mm'], si['height_mm']]
        if si['width_mm'] != W or si['height_mm'] != H: r['issues'].append(f'SVG size {si["width_mm"]}x{si["height_mm"]}mm != {W}x{H}mm')
        if prev and canon(si['text']) != canon(prev['text']): r['issues'].append('SVG text differs from preview')
        if prev and si['ghs'] != prev['ghs']: r['issues'].append(f'SVG pictograms {si["ghs"]} != preview {prev["ghs"]}')
        if si['does_not_fit']: r['issues'].append('SVG contains does-not-fit overlay')
    if os.path.exists(pdfp):
        r['formats'].append('PDF')
        doc = pymupdf.open(pdfp)
        r['pdf_pages'] = doc.page_count
        page = doc[0]
        wmm, hmm = page.rect.width / 72 * 25.4, page.rect.height / 72 * 25.4
        r['pdf_mm'] = [round(wmm, 2), round(hmm, 2)]
        if abs(wmm - W) > 0.6 or abs(hmm - H) > 0.6: r['issues'].append(f'PDF page {wmm:.1f}x{hmm:.1f}mm != {W}x{H}mm')
        if doc.page_count != 1: r['issues'].append(f'PDF has {doc.page_count} pages')
        ptxt = page.get_text()
        if prev:
            missing = [w for w in set(canon(prev['text']).split()) if len(w) > 3 and w not in canon(ptxt)]
            r['pdf_text_missing_words'] = missing[:20]
            if len(missing) > 2: r['issues'].append(f'PDF text lacks {len(missing)} preview words, e.g. {missing[:5]}')
        pix = page.get_pixmap(dpi=300)
        pdf_img = Image.open(io.BytesIO(pix.tobytes('png')))
        pdf_img.save(os.path.join(dirp, f'export-{tag}.pdf-render.png'))
        if png_img is not None:
            a = gray(png_img, (800, round(800 * H / W))); b = gray(pdf_img, (800, round(800 * H / W)))
            d = float(np.abs(a - b).mean()); r['png_vs_pdf_mean_abs_diff'] = round(d, 2)
            if d > 12: r['issues'].append(f'PDF render differs visually from PNG (mean abs diff {d:.1f})')
        doc.close()
    return r


def rendered_checks(prev, sup, built, scent, biz):
    """What the rendered preview actually shows vs supplier and builder."""
    issues, reviews = [], []
    t = canon(prev['text'])
    if built['signal'] and canon(built['signal']) not in t: issues.append(f'signal word {built["signal"]} not rendered')
    m = re.search(r'Contains:?\s*(.+?)(?:\s+May produce| May cause|$)', prev['text'])
    shown = [x.strip() for x in re.split(r',\s+', m.group(1).strip().rstrip('.'))] if m else []
    if built['sensitisers'] and canon(', '.join(shown)) != canon(', '.join(built['sensitisers'])): issues.append(f'rendered "Contains" {shown} != builder {built["sensitisers"]}')
    if sup['euh208_names'] and canon(', '.join(shown)) != canon(', '.join(sup['euh208_names'])): issues.append(f'rendered "Contains" {shown} != supplier {sup["euh208_names"]}')
    for h in sup['h']:
        w = sup['h_wording'].get(h, '')
        if w and canon(w) not in t:
            ww = [x for x in canon(w).split() if len(x) > 3]
            if sum(1 for x in ww if x in t) < max(1, int(len(ww) * 0.8)): reviews.append(f'{h} wording "{w}" not found verbatim in rendered label')
    if sorted(prev['ghs']) != sorted(built['pictograms']): issues.append(f'rendered pictograms {prev["ghs"]} != builder {built["pictograms"]}')
    for label, val in [('product name', scent), ('business name', biz['name']), ('address', biz['address']), ('phone', biz['phone'])]:
        if canon(val) not in t: issues.append(f'{label} not rendered')
    if prev['does_not_fit']: issues.append('does-not-fit overlay present in an allowed preview')
    return dict(shown_sensitisers=shown, issues=issues, reviews=reviews)


def main():
    manifest = json.load(open(os.path.join(CORPUS, 'manifest.json'), encoding='utf-8'))
    hist = {r['test_id']: r for r in csv.DictReader(open(HIST, encoding='utf-8-sig'))}
    BIZ = dict(name='Fernhill QA Candles', address='1 Test Lane, Exampleton, EX1 2AB', phone='01632 960000')
    rows = []
    for doc in manifest['documents']:
        cid = doc['id']; cdir = os.path.join(E2E, cid)
        text = open(os.path.join(CORPUS, doc['section_2_2_text_file']), encoding='utf-8').read()
        sup = supplier_elements(text)
        row = dict(case_id=cid, supplier=doc['supplier'], fragrance=doc['name'].replace(' 10% full SDS', ''), pdf_url=doc['url'], pdf_sha256=doc['sha256'])
        vm = re.search(r'Version:\s*(\d+)\s*\((\d\d/\d\d/\d{4})\)', text)
        row['sds_version'] = f'{vm.group(1)} ({vm.group(2)})' if vm else ''
        row['historical_extraction_status'] = hist.get(cid, {}).get('status', '')
        jpath = os.path.join(cdir, 'journey.json')
        if not os.path.exists(jpath):
            row.update(overall_result='NOT TESTED', issue_details='no journey evidence'); rows.append(row); continue
        j = json.load(open(jpath, encoding='utf-8'))
        row['input_verified'] = j['input']['input_verified']
        row['section_2_2_exact'] = all(v.get('pasted_equals_source') for v in j['sizes'].values() if 'pasted_equals_source' in v)
        fails, reviews, supplier, blocked, notes = [], [], [], [], []
        if not row['input_verified']: blocked.append('input identity/hash not verified')
        sizes = j['sizes']
        errs = {k: v['error'] for k, v in sizes.items() if v.get('error')}
        if errs: blocked.append('harness error: ' + '; '.join(f'{k}: {v[:120]}' for k, v in errs.items()))
        ex = next((v['extraction'] for v in sizes.values() if v.get('extraction')), None)
        if ex is None:
            row.update(overall_result='BLOCKED', issue_details='; '.join(blocked) or 'no extraction captured'); rows.append(row); continue
        built = dict(h=[x for x in ex['h_codes'] if x.startswith('H')], euh=[x for x in ex['h_codes'] if x.startswith('EUH')], p=ex['p_codes'], sensitisers=ex['sensitisers'], signal=ex['signal'], pictograms=sorted(ex['pictograms_state']))
        # determinism: second size run extracted the same?
        exs = [v['extraction'] for v in sizes.values() if v.get('extraction')]
        if any(json.dumps(e['h_codes']) != json.dumps(exs[0]['h_codes']) or e['sensitisers'] != exs[0]['sensitisers'] for e in exs[1:]): fails.append('extraction not repeatable between runs')
        row.update(expected_h=' '.join(sup['h'] + sup['euh']), extracted_h=' '.join(built['h'] + built['euh']), expected_p=' '.join(sup['p']), extracted_p=' '.join(built['p']),
                   expected_euh208_names=' | '.join(sup['euh208_names'] or []), extracted_euh208_names=' | '.join(built['sensitisers']),
                   expected_signal=sup['signal'], extracted_signal=built['signal'], expected_pictograms=' '.join(sup['pictograms']), extracted_pictograms=' '.join(built['pictograms']))
        # ---- extraction comparison
        missing_h = [h for h in sup['h'] if h not in built['h']]; extra_h = [h for h in built['h'] if h not in sup['h']]
        nonclp = [h for h in sup['h'] if h in NON_CLP_H]
        if nonclp: supplier.append(f'supplier Section 2.2 uses GHS-only code(s) not in GB CLP: {", ".join(nonclp)}')
        if [h for h in missing_h if h not in NON_CLP_H]: fails.append(f'H codes missing: {missing_h}')
        if extra_h: fails.append(f'unexpected H codes: {extra_h}')
        if set(sup['euh']) - set(built['euh']): fails.append(f'EUH missing: {sorted(set(sup["euh"]) - set(built["euh"]))}')
        if set(built['euh']) - set(sup['euh']): fails.append(f'unexpected EUH: {sorted(set(built["euh"]) - set(sup["euh"]))}')
        if sup['euh208_names'] is not None and canon(', '.join(sup['euh208_names'])) != canon(', '.join(built['sensitisers'])):
            fails.append(f'EUH208 names: supplier {sup["euh208_names"]} vs builder {built["sensitisers"]}')
        contaminated = [s for s in built['sensitisers'] if re.search(r'Information:|statements:|Page\s+\d+', s)]
        if contaminated: fails.append(f'PDF layout text inside sensitiser name: {contaminated}')
        sig_ok = canon(sup['signal']) == canon(built['signal'])
        if not sig_ok:
            if not sup['signal'] and set(sup['h']) <= NON_CLP_H | {'H412', 'H413'}: notes.append('no signal word (consistent with supplier)')
            else: fails.append(f'signal word: supplier "{sup["signal"]}" vs builder "{built["signal"]}"')
        if sorted(sup['pictograms']) != built['pictograms']: fails.append(f'pictograms: required for supplier H codes {sup["pictograms"]} vs builder {built["pictograms"]}')
        withheld = [p for p in sup['p'] if p not in built['p']]
        unexpected_p = [p for p in built['p'] if p not in sup['p']]
        if unexpected_p: fails.append(f'unexpected P codes: {unexpected_p}')
        pol = [p for p in withheld if p in POLICY_WITHHELD_P]; other_w = [p for p in withheld if p not in POLICY_WITHHELD_P]
        if other_w: fails.append(f'supplier P codes dropped without policy reason: {other_w}')
        notices = ' '.join(ex['visible_notices'])
        if pol:
            vis = 'not added automatically' in notices and all(p in notices for p in pol)
            reviews.append(f'supplier P codes withheld by CLPeasy consumer-label policy: {pol}; {"notice shown" if vis else "no notice shown to the customer (the builder has no exclusion-notice element)"}')
        row['signal_match'] = sig_ok
        row['pictograms_match'] = sorted(sup['pictograms']) == built['pictograms']
        # ---- Step 3 progression
        stop3 = [v for v in sizes.values() if v.get('stopped_at') == 'step-3']
        if stop3:
            d = ' '.join(stop3[0].get('dialogs') or [])
            unrec = re.search(r'did not recognise the following codes:\s*([^.]+)\.', d)
            if re.search(r'does not recognise (it|them) as hazard statement', d): supplier.append('builder correctly stops the journey on the non-GB code and asks for supplier clarification')
            if unrec:
                codes = [c.strip() for c in unrec.group(1).split(',')]
                valid = [c for c in codes if c in VALID_CLP_P]
                if valid: fails.append(f'builder rejects valid CLP P statement(s) {valid} and blocks the journey ("CLP code not recognised")')
                else: supplier.append(f'unrecognised codes {codes}')
            if not sup['h'] and not sup['euh'] and 'extract hazard data' in d.lower():
                reviews.append('supplier SDS states no classification (Signal word/Hazard statements: None); builder cannot continue past Step 3 ("Please extract hazard data…") — no label can be produced for an unclassified mixture')
            if not (unrec or re.search(r'does not recognise (it|them)', d) or not sup['h']): blocked.append(f'stopped at Step 3: {d[:200]}')
        # ---- per size: preview, warnings, export blocking, files
        size_res = {}
        export_ok_any = False
        for key in ['63x44', '76x51']:
            v = sizes.get(key)
            res = {'preview': 'NOT TESTED', 'warning': '', 'export_block': ''}
            if not v or v.get('stopped_at') or not v.get('preview'):
                res['preview'] = 'BLOCKED (journey stopped before preview)' if v and v.get('stopped_at') else 'NOT TESTED'
                size_res[key] = res; continue
            pv = v['preview']
            W, H = map(int, key.split('x'))
            prev = svg_info(os.path.join(cdir, key, f'preview-{key}.svg'))
            res['warning'] = ' / '.join(w['text'][:160] for w in pv['warnings']) or 'none'
            if pv['download_allowed']:
                rc = rendered_checks(prev, sup, built, j['product_name'], BIZ)
                exp = check_exports(os.path.join(cdir, key), key, (W, H), prev)
                res.update(preview='fits', export_block='not blocked', exports=exp, rendered=rc)
                st = {f: v['exports'][f]['status'] for f in v['exports']}
                if any(s != 'exported' for s in st.values()): fails.append(f'{key}: allowed but export failed {st}')
                if exp['issues']: fails.append(f'{key}: export/preview mismatch: {exp["issues"]}')
                if rc['issues']: fails.extend(f'{key} rendered: {i}' for i in rc['issues'])
                reviews.extend(f'{key} rendered: {i}' for i in rc['reviews'])
                export_ok_any = export_ok_any or not exp['issues']
            elif not pv['label_block_download']:
                # fits, but an existing (non-size) safety check blocks export
                ok = all(e['status'] == 'blocked' and e['rpc_calls'] == 0 for e in v['exports'].values())
                why = pv.get('blocked_message') or ''
                res.update(preview='fits; export blocked by existing check', export_block=('blocked, no download charged: ' if ok else 'NOT cleanly blocked: ') + why[:140])
                if not ok: fails.append(f'{key}: export not cleanly blocked: {why[:120]}')
                else: notes.append(f'{key}: label fits but export correctly blocked by existing check: "{why[:160]}"')
            else:
                blocked_ok = all(e['status'] == 'blocked' and e['rpc_calls'] == 0 for e in v['exports'].values()) and pv['label_block_download'] and pv['warnings']
                res.update(preview='warning + blocked' if blocked_ok else 'blocked (check)', export_block='blocked, no download charged' if blocked_ok else str({f: e['status'] for f, e in v['exports'].items()}))
                if not blocked_ok: fails.append(f'{key}: overfull label not cleanly blocked: {res["export_block"]}')
                if pv['block_reason'] != 'content-does-not-fit': notes.append(f'{key} block reason {pv["block_reason"]}')
            size_res[key] = res
            rec = v.get('recommended')
            if rec:
                tag = 'recommended-' + rec['size']; rW, rH = map(int, rec['size'].split('x'))
                rprev = svg_info(os.path.join(cdir, key, f'preview-{tag}.svg'))
                if rec['preview']['download_allowed']:
                    rc = rendered_checks(rprev, sup, built, j['product_name'], BIZ)
                    exp = check_exports(os.path.join(cdir, key), tag, (rW, rH), rprev)
                    size_res['recommended'] = {'size': rec['size'], 'preview': 'fits', 'exports': exp, 'rendered': rc}
                    if any(e['status'] != 'exported' for e in rec['exports'].values()): fails.append(f'recommended {rec["size"]}: export failed')
                    if exp['issues']: fails.append(f'recommended {rec["size"]}: export/preview mismatch: {exp["issues"]}')
                    if rc['issues']: fails.extend(f'recommended {rec["size"]} rendered: {i}' for i in rc['issues'])
                    reviews.extend(f'recommended {rec["size"]} rendered: {i}' for i in rc['reviews'])
                    export_ok_any = export_ok_any or not exp['issues']
                else:
                    rp = rec['preview']
                    if rp['label_block_download']:
                        fails.append(f'builder-recommended size {rec["size"]} still does not fit')
                        size_res['recommended'] = {'size': rec['size'], 'preview': 'still blocked (does not fit)'}
                    else:
                        why = rp.get('blocked_message') or ''
                        notes.append(f'recommended {rec["size"]} fits, but export correctly blocked by an existing safety check: "{why[:160]}"')
                        size_res['recommended'] = {'size': rec['size'], 'preview': 'fits; export blocked by existing check: ' + why[:120]}
        for k in ['63x44', '76x51']:
            r = size_res.get(k, {})
            row[f'preview_{k}'] = r.get('preview', ''); row[f'warning_{k}'] = r.get('warning', ''); row[f'export_block_{k}'] = r.get('export_block', '')
        recd = size_res.get('recommended')
        row['recommended_size_result'] = f'{recd["size"]}: {recd["preview"]}' if recd else ''
        fmts = []
        for k, r in size_res.items():
            if r.get('exports'): fmts.append(f'{r.get("size", k)}: ' + '+'.join(r['exports']['formats']))
        row['exported_formats'] = '; '.join(fmts)
        row['export_preview_match'] = ('yes' if export_ok_any else 'no') if fmts else 'n/a'
        # reset / contamination
        for k, v in sizes.items():
            rs = v.get('reset')
            if rs and (rs['input'] or rs['h'] or rs['p'] or rs['sens']): fails.append(f'{k}: hazard reset left stale data {rs}')
        ext_fail = [f for f in fails if not re.match(r'(\d+x\d+|recommended)', f)]
        lab_fail = [f for f in fails if re.match(r'(\d+x\d+|recommended)', f)]
        row['extraction_result'] = 'FAIL' if ext_fail else ('REVIEW' if reviews or supplier else 'PASS')
        reached = any(r.get('preview') not in ('NOT TESTED',) and not str(r.get('preview')).startswith('BLOCKED') for r in size_res.values())
        row['label_result'] = 'FAIL' if lab_fail else ('PASS' if reached and fmts else 'BLOCKED')
        if blocked and not fails: overall = 'BLOCKED'
        elif fails: overall = 'FAIL'
        elif supplier: overall = 'SUPPLIER REVIEW'
        elif reviews: overall = 'REVIEW'
        elif reached and export_ok_any: overall = 'PASS'
        else: overall = 'BLOCKED'
        row['overall_result'] = overall
        owners = []
        if ext_fail: owners.append('CLPeasy Smart Paste / code library')
        if lab_fail: owners.append('CLPeasy rendering/export')
        if supplier: owners.append('Supplier SDS')
        if blocked: owners.append('QA environment/harness')
        if reviews and not owners: owners.append('Owner decision (policy/review)')
        row['defect_owner'] = '; '.join(owners)
        row['issue_details'] = ' || '.join([*('FAIL: ' + f for f in fails), *('SUPPLIER: ' + s for s in supplier), *('REVIEW: ' + r for r in reviews), *('BLOCKED: ' + b for b in blocked), *('NOTE: ' + n for n in notes)])
        row['other_label_elements'] = 'EN 15494 candle pictograms, product type, business name/address/phone checked in rendered label'
        row['evidence_paths'] = f'qa-artifacts/sds-e2e/{cid}/'
        row['_detail'] = dict(supplier=sup, builder=built, sizes=size_res)
        rows.append(row)
    cols = ['case_id', 'supplier', 'fragrance', 'pdf_url', 'pdf_sha256', 'sds_version', 'input_verified', 'section_2_2_exact', 'extracted_h', 'expected_h', 'extracted_p', 'expected_p',
            'extracted_euh208_names', 'expected_euh208_names', 'extracted_signal', 'expected_signal', 'signal_match', 'extracted_pictograms', 'expected_pictograms', 'pictograms_match', 'other_label_elements',
            'preview_63x44', 'warning_63x44', 'export_block_63x44', 'preview_76x51', 'warning_76x51', 'export_block_76x51', 'recommended_size_result', 'exported_formats', 'export_preview_match',
            'extraction_result', 'label_result', 'overall_result', 'historical_extraction_status', 'defect_owner', 'issue_details', 'evidence_paths']
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, '100_SDS_E2E_RESULTS.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore'); w.writeheader(); w.writerows(rows)
    json.dump(rows, open(os.path.join(OUT, '100_SDS_E2E_RESULTS.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    from collections import Counter
    print(json.dumps(dict(overall=Counter(r['overall_result'] for r in rows), extraction=Counter(r.get('extraction_result') for r in rows), label=Counter(r.get('label_result') for r in rows), n=len(rows))))


main()
