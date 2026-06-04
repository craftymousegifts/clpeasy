"""
CLPeasy Nightly Link Scanner
- SCAN_MODE=local  → scans HTML files in the repo (pre-launch)
- SCAN_MODE=live   → fetches pages from the live site (post-launch)
Writes results to /tmp/scan_results.json for the email step to pick up.
"""

import os, json, re
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime

SCAN_MODE = os.environ.get('SCAN_MODE', 'local')
SITE_URL  = os.environ.get('SITE_URL', 'https://clpeasy.com').rstrip('/')

# ── HTML parser ────────────────────────────────────────────────────────────────
class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        src = None
        if tag == 'a'      and 'href' in attrs: src = attrs['href']
        elif tag == 'link'   and 'href' in attrs: src = attrs['href']
        elif tag == 'script' and 'src'  in attrs: src = attrs['src']
        elif tag == 'img'    and 'src'  in attrs: src = attrs['src']
        if src:
            self.links.append((tag, src))

# ── Helpers ────────────────────────────────────────────────────────────────────
def classify(fname, tag, href, file_set, base_dir):
    if not href or href.startswith('#') or href.startswith('javascript:') or href.startswith('data:'):
        return None
    if href.startswith('mailto:'):
        return {'file': fname, 'tag': tag, 'href': href, 'type': 'mailto', 'status': 'OK'}
    if href.startswith('tel:'):
        return {'file': fname, 'tag': tag, 'href': href, 'type': 'tel', 'status': 'OK'}
    if href.startswith('http://') or href.startswith('https://'):
        parsed = urlparse(href)
        if parsed.netloc in ('clpeasy.com', 'www.clpeasy.com'):
            path = parsed.path.strip('/')
            if not path:
                return {'file': fname, 'tag': tag, 'href': href, 'type': 'internal-abs', 'status': 'OK', 'target': 'index.html'}
            exists = path in file_set or path + '.html' in file_set or path.split('/')[-1] in file_set
            return {'file': fname, 'tag': tag, 'href': href, 'type': 'internal-abs',
                    'status': 'OK' if exists else 'BROKEN', 'target': path}
        else:
            return {'file': fname, 'tag': tag, 'href': href, 'type': 'external', 'status': 'EXTERNAL'}
    else:
        target = href.split('?')[0].split('#')[0].strip('/')
        if not target:
            return None
        exists = target in file_set or os.path.exists(os.path.join(base_dir, target))
        return {'file': fname, 'tag': tag, 'href': href, 'type': 'internal-rel',
                'status': 'OK' if exists else 'BROKEN', 'target': target}

# ── Local scan (pre-launch) ────────────────────────────────────────────────────
def scan_local():
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    files = sorted([f for f in os.listdir(base) if f.endswith('.html')])
    file_set = set(files)
    results = []
    for fname in files:
        with open(os.path.join(base, fname), encoding='utf-8', errors='ignore') as f:
            html = f.read()
        parser = LinkParser()
        parser.feed(html)
        for tag, href in parser.links:
            r = classify(fname, tag, href, file_set, base)
            if r:
                results.append(r)
    return results, files

# ── Live scan (post-launch) ────────────────────────────────────────────────────
def scan_live():
    import requests
    from urllib.parse import urljoin

    KNOWN_PAGES = [
        '', 'home.html', 'builder.html', 'pricing.html', 'auth.html',
        'beta.html', 'privacy.html', 'terms.html', 'refund.html',
        'support.html', 'knowledge.html', 'cookie-policy.html',
        'account.html', 'dashboard.html', 'plan-picker.html', 'print.html'
    ]

    crawled   = set()
    all_links = []
    results   = []

    def get_links_from_url(page_url):
        try:
            r = requests.get(page_url, timeout=15, allow_redirects=True,
                             headers={'User-Agent': 'CLPeasy-LinkBot/1.0'})
            if not r.ok:
                return [], r.status_code
            parser = LinkParser()
            parser.feed(r.text)
            return parser.links, r.status_code
        except Exception as e:
            return [], 0

    # Seed with known pages
    queue = [f"{SITE_URL}/{p}".rstrip('/') or SITE_URL for p in KNOWN_PAGES]
    queue = list(dict.fromkeys(queue))  # dedup

    tested_hrefs = set()

    for page_url in queue:
        if page_url in crawled:
            continue
        crawled.add(page_url)
        links, page_status = get_links_from_url(page_url)
        page_name = page_url.replace(SITE_URL, '').lstrip('/') or 'index'

        for tag, href in links:
            if not href or href.startswith('#') or href.startswith('javascript:') or href.startswith('data:'):
                continue
            if href.startswith('mailto:'):
                if href not in tested_hrefs:
                    tested_hrefs.add(href)
                    results.append({'file': page_name, 'tag': tag, 'href': href, 'type': 'mailto', 'status': 'OK'})
                continue
            if href.startswith('tel:'):
                if href not in tested_hrefs:
                    tested_hrefs.add(href)
                    results.append({'file': page_name, 'tag': tag, 'href': href, 'type': 'tel', 'status': 'OK'})
                continue

            # Resolve relative
            abs_href = urljoin(page_url, href).split('#')[0].split('?')[0]
            if abs_href in tested_hrefs:
                continue
            tested_hrefs.add(abs_href)

            parsed = urlparse(abs_href)
            is_internal = parsed.netloc in ('clpeasy.com', 'www.clpeasy.com')

            try:
                resp = requests.head(abs_href, timeout=10, allow_redirects=True,
                                     headers={'User-Agent': 'CLPeasy-LinkBot/1.0'})
                status_code = resp.status_code
            except:
                status_code = 0

            link_type = 'internal' if is_internal else 'external'
            if status_code == 0:
                link_status = 'BROKEN'
            elif status_code >= 400:
                link_status = 'BROKEN'
            elif status_code >= 300:
                link_status = 'REDIRECT'
            else:
                link_status = 'OK'

            results.append({'file': page_name, 'tag': tag, 'href': abs_href,
                            'type': link_type, 'status': link_status, 'code': status_code})

    files = list(crawled)
    return results, files

# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f"🔍 Scan mode: {SCAN_MODE}")
    if SCAN_MODE == 'live':
        print(f"   Target: {SITE_URL}")
        results, files = scan_live()
    else:
        results, files = scan_local()

    broken   = [r for r in results if r['status'] == 'BROKEN']
    external = [r for r in results if r['status'] == 'EXTERNAL' or r['status'] == 'REDIRECT']
    ok       = [r for r in results if r['status'] == 'OK']

    print(f"✅ OK: {len(ok)}  ❌ BROKEN: {len(broken)}  🌐 External/Redirect: {len(external)}  📄 Total: {len(results)}")
    if broken:
        print("BROKEN LINKS:")
        for r in broken:
            print(f"  [{r['file']}] {r['href']}")
    else:
        print("🎉 Zero broken links!")

    output = {
        'scan_mode':    SCAN_MODE,
        'scan_date':    datetime.utcnow().strftime('%d %b %Y at %H:%M UTC'),
        'files':        files if isinstance(files, list) else list(files),
        'results':      results,
        'broken_count': len(broken),
        'ok_count':     len(ok),
        'ext_count':    len(external),
        'total':        len(results),
        'broken':       broken,
    }
    with open('/tmp/scan_results.json', 'w') as f:
        json.dump(output, f)
    print("✅ Saved /tmp/scan_results.json")
