# Builds the v10 isolated PR #156 QA site from the committed PR head.
import os, re, shutil, subprocess, json
REPO='/home/user/clpeasy'
S='/tmp/claude-0/-home-user-clpeasy/ccb0b4b7-b39b-5d68-a470-7b6208d726d2/scratchpad'
OUT=S+'/v10'
SITE='https://clpeasy-pr156-payg-test-v10.netlify.app'
PROD_REF, TEST_REF = 'qvkosdqcryrcfbjtaxic', 'wwjhvpphlbgtywxskqnf'
TEST_ANON=open(S+'/testanon').read().strip()
head=subprocess.check_output(['git','-C',REPO,'rev-parse','--short','HEAD']).decode().strip()
PAGES="account auth builder checkout compliance cookie-policy dashboard faq index knowledge my-labels plan-picker pricing print privacy refund release-notes showcase support terms".split()
FILES=['label-library.js','label-render.js','entitlement.js','seasons.js','version.js','crafty-mouse-gifts-maker.jpg','og-image.png','sitemap.xml']
PRICE_MAP={
 # live subscription prices -> CLPeasy sandbox (verified 26 Sep 2026)
 'price_1TdoEYGZLILz5vqUIqlEsf4X':'price_1Tdd5SKF3jvQfgEaclfSUxn5', # Easy Start monthly
 'price_1TdoEXGZLILz5vqUQj5n6Zri':'price_1Tdd7pKF3jvQfgEa8DxgQHEW', # Easy Start annual
 'price_1TdoEXGZLILz5vqUvZKB1RQw':'price_1Tdd9OKF3jvQfgEaYsCmOwOa', # Easy Pro monthly
 'price_1TdoEXGZLILz5vqUFgTznTUT':'price_1TddAyKF3jvQfgEaE7Vwbxl6', # Easy Pro annual
 # live top-ups -> sandbox top-ups
 'price_1Tdpd7GZLILz5vqUAiSw9udI':'price_1TeBHjKF3jvQfgEaX2aPZX6E', # 5 downloads £3.99
 'price_1TdpdzGZLILz5vqUYEjn6TZ2':'price_1TeBIKKF3jvQfgEaxU4TjPHu', # 10 downloads £7.99
}
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT+'/assets')
prod_key=re.search(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", open(REPO+'/builder.html').read()).group(0)
report={}
for p in PAGES:
    s=open(f'{REPO}/{p}.html').read(); n={}
    s,n['key']=re.subn(re.escape(prod_key), TEST_ANON, s)
    s,n['ref']=re.subn(PROD_REF, TEST_REF, s)
    s,n['prices']=re.subn('|'.join(PRICE_MAP), lambda m: PRICE_MAP[m.group(0)], s)
    s,n['return']=re.subn(r"https://clpeasy\.com/(account|pricing)\.html\?payg=", lambda m: f"{SITE}/{m.group(1)}.html?payg=", s)
    s,n['plausible']=re.subn(r'[ \t]*<script[^>]*plausible\.io[^>]*></script>\n?', '', s)
    s,n['title']=re.subn(r'<title>', '<title>[TEST] ', s, count=1)
    s,n['noindex']=re.subn(r'(<meta charset="UTF-8">)', r'\1\n<meta name="robots" content="noindex,nofollow">', s, count=1, flags=re.I)
    open(f'{OUT}/{p}.html','w').write(s); report[p]=n
for f in FILES: shutil.copy(f'{REPO}/{f}', f'{OUT}/{f}')
for f in os.listdir(REPO+'/assets'): shutil.copy(f'{REPO}/assets/{f}', f'{OUT}/assets/{f}')
open(OUT+'/robots.txt','w').write("User-agent: *\nDisallow: /\n")
open(OUT+'/_headers','w').write("/*\n  X-Robots-Tag: noindex, nofollow\n")
redir=open(REPO+'/_redirects').read()
redir=re.sub(r'(?m)^https://auth\.clpeasy\.com/\*.*\n','',redir)
redir=redir.replace('# Reverse proxy: auth.clpeasy.com → Supabase auth endpoint\n# Makes Google OAuth show "auth.clpeasy.com" instead of Supabase project URL\n','# Test-only site: production auth.clpeasy.com proxy intentionally omitted.\n')
open(OUT+'/_redirects','w').write(redir)
open(OUT+'/TEST-ENVIRONMENT.txt','w').write(f"CLPeasy PR #156 isolated test copy v10 (commit {head}).\nSupabase: CLPeasy Test ({TEST_REF}). Stripe: Sandbox (acct_1TdczqKF3jvQfgEa). Not production.\n")
json.dump(report, open(S+'/v10-report.json','w'), indent=1)
print(head); print(json.dumps(report))
