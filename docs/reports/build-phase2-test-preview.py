#!/usr/bin/env python3
"""Build an isolated static Phase 2 preview; never deploy or include functions.
The public Test anon key is supplied in a local file, never committed here.
"""
import argparse, hashlib, json, pathlib, re, shutil, subprocess, zipfile
p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--output',required=True);p.add_argument('--test-public-key-file',required=True);p.add_argument('--site',default='https://clpeasy-pr156-payg-test-v10.netlify.app');a=p.parse_args()
repo=pathlib.Path(a.repo).resolve();out=pathlib.Path(a.output).resolve();key=pathlib.Path(a.test_public_key_file).read_text().strip()
if out.exists(): raise SystemExit('Choose a new output directory; existing files are not overwritten.')
if not re.fullmatch(r'eyJ[A-Za-z0-9_.-]+',key):raise SystemExit('Expected the existing Test legacy public anon key.')
prod='qvkosdqcryrcfbjtaxic';test='wwjhvpphlbgtywxskqnf'
prodkey=re.search(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',(repo/'builder.html').read_text()).group(0)
prices={'price_1TdoEYGZLILz5vqUIqlEsf4X':'price_1Tdd5SKF3jvQfgEaclfSUxn5','price_1TdoEXGZLILz5vqUQj5n6Zri':'price_1Tdd7pKF3jvQfgEa8DxgQHEW','price_1UMSlpGZLILz5vqUKA7dE3JS':'price_1UM5UwKF3jvQfgEa5A5F3ac5','price_1TdoEXGZLILz5vqUvZKB1RQw':'price_1Tdd9OKF3jvQfgEaYsCmOwOa','price_1TdoEXGZLILz5vqUFgTznTUT':'price_1TddAyKF3jvQfgEaE7Vwbxl6','price_1Tdpd7GZLILz5vqUAiSw9udI':'price_1TeBHjKF3jvQfgEaX2aPZX6E','price_1TdpdzGZLILz5vqUYEjn6TZ2':'price_1TeBIKKF3jvQfgEaxU4TjPHu'}
out.mkdir(parents=True); checks={}
for f in repo.iterdir():
    if not f.is_file() or f.suffix.lower() not in {'.html','.js','.css','.png','.jpg','.jpeg','.svg','.ico','.webp','.xml'}:continue
    data=f.read_bytes()
    if f.suffix.lower() in {'.html','.js','.css','.xml'}:
        s=data.decode('utf8').replace(prodkey,key).replace(prod,test)
        for x,y in prices.items():s=s.replace(x,y)
        s=re.sub(r'https://clpeasy\.com/(account|pricing)\.html\?payg=',lambda m:a.site+'/'+m.group(1)+'.html?payg=',s)
        if f.suffix.lower()=='.html':
            s=re.sub(r'[ \t]*<script[^>]*plausible\.io[^>]*></script>\n?','',s)
            s=s.replace('<title>','<title>[TEST] ',1)
            s=re.sub(r'(<meta charset="UTF-8">)',r'\1\n<meta name="robots" content="noindex,nofollow">',s,count=1,flags=re.I)
        data=s.encode()
    (out/f.name).write_bytes(data)
shutil.copytree(repo/'assets',out/'assets')
(out/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
(out/'_headers').write_text('/*\n  X-Robots-Tag: noindex, nofollow\n')
s=(repo/'_redirects').read_text();s=re.sub(r'(?m)^https://auth\.clpeasy\.com/\*.*\n','',s);(out/'_redirects').write_text(s)
head=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
(out/'TEST-ENVIRONMENT.txt').write_text(f'CLPeasy Phase 2 review build from {head}\nTest Supabase: {test}. Stripe Sandbox. No functions included. Not production.\n')
for f in out.rglob('*'):
    if f.is_file():
        data=f.read_bytes()
        if prod.encode() in data or prodkey.encode() in data:raise SystemExit('Production connection found in '+str(f.relative_to(out)))
        checks[str(f.relative_to(out))]=hashlib.sha256(data).hexdigest()
for n in ['label-render.js','sds-doc-check.js','public-nav.css','assets/CLPeasy Home page.png']:
    if (out/n).read_bytes()!=(repo/n).read_bytes():raise SystemExit('Unexpected change to '+n)
manifest={'commit':head,'site':a.site,'supabase':test,'functions_included':False,'files':checks}
(out.parent/(out.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(out.parent/(out.name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
    for f in out.rglob('*'):
        if f.is_file():z.write(f,f.relative_to(out))
print(json.dumps({'commit':head,'files':len(checks),'production_connection_found':False,'renderer_and_approved_hero_unchanged':True,'output':str(out)}))
