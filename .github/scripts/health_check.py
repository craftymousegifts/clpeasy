"""
CLPeasy Daily Service Health Check
Checks: Supabase, Stripe, Brevo, Netlify, Live site (post-launch)
Writes results to /tmp/health_results.json for the email step.
"""

import os, json, requests
from datetime import datetime

SUPABASE_URL      = os.environ.get('SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
BREVO_API_KEY     = os.environ.get('BREVO_API_KEY', '')
NETLIFY_SITE_ID   = os.environ.get('NETLIFY_SITE_ID', '')
NETLIFY_TOKEN     = os.environ.get('NETLIFY_TOKEN', '')
SCAN_MODE         = os.environ.get('SCAN_MODE', 'local')

checks = []  # {name, status, detail, category, critical}

def check(name, category, critical=True):
    """Decorator-style helper — appends result to checks list."""
    def run(fn):
        print(f"  Checking {name}...")
        try:
            status, detail = fn()
        except Exception as e:
            status, detail = 'ERROR', str(e)[:200]
        icon = '✅' if status == 'OK' else ('⚠️' if status == 'WARN' else '❌')
        print(f"  {icon} {name}: {status} — {detail}")
        checks.append({
            'name': name, 'status': status, 'detail': detail,
            'category': category, 'critical': critical
        })
    return run

# ── Supabase ──────────────────────────────────────────────────────────────────
print("\n🔷 Supabase")

@check('Supabase REST API', 'Supabase', critical=True)
def _():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return 'WARN', 'Secrets not configured in GitHub — add SUPABASE_URL and SUPABASE_ANON_KEY'
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/",
        headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'},
        timeout=10
    )
    if r.status_code in (200, 400, 401):  # 400/401 = API is up, just needs auth
        return 'OK', f'REST API responding (HTTP {r.status_code})'
    return 'ERROR', f'Unexpected status {r.status_code}'

@check('Supabase Auth endpoint', 'Supabase', critical=True)
def _():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return 'WARN', 'Secrets not configured'
    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/settings",
        headers={'apikey': SUPABASE_ANON_KEY},
        timeout=10
    )
    if r.status_code == 200:
        return 'OK', 'Auth service responding'
    return 'ERROR', f'Auth returned HTTP {r.status_code}'

@check('Supabase Edge Functions', 'Supabase', critical=True)
def _():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return 'WARN', 'Secrets not configured'
    # Ping the clp-wizard function — it will return 401 without a valid JWT but that proves it's deployed
    r = requests.post(
        f"{SUPABASE_URL}/functions/v1/clp-wizard",
        headers={'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
        json={'test': True},
        timeout=15
    )
    if r.status_code in (200, 401, 400):
        return 'OK', f'Edge functions reachable (HTTP {r.status_code})'
    return 'ERROR', f'Edge functions returned HTTP {r.status_code}'

# ── Stripe ────────────────────────────────────────────────────────────────────
print("\n💳 Stripe")

@check('Stripe API', 'Stripe', critical=True)
def _():
    if not STRIPE_SECRET_KEY:
        return 'WARN', 'STRIPE_SECRET_KEY secret not configured in GitHub'
    r = requests.get(
        'https://api.stripe.com/v1/balance',
        auth=(STRIPE_SECRET_KEY, ''),
        timeout=10
    )
    if r.status_code == 200:
        mode = 'LIVE mode ✅' if not STRIPE_SECRET_KEY.startswith('sk_test') else 'Sandbox/test mode'
        return 'OK', f'Stripe API responding — {mode}'
    if r.status_code == 401:
        return 'ERROR', 'Stripe API key invalid or expired'
    return 'ERROR', f'Stripe returned HTTP {r.status_code}'

@check('Stripe webhook endpoint', 'Stripe', critical=False)
def _():
    if not STRIPE_SECRET_KEY:
        return 'WARN', 'STRIPE_SECRET_KEY not configured'
    r = requests.get(
        'https://api.stripe.com/v1/webhook_endpoints',
        auth=(STRIPE_SECRET_KEY, ''),
        timeout=10
    )
    if r.status_code == 200:
        data = r.json()
        endpoints = data.get('data', [])
        if not endpoints:
            return 'WARN', 'No webhook endpoints registered yet — add before go-live'
        enabled = [e for e in endpoints if e.get('status') == 'enabled']
        return 'OK', f'{len(enabled)} active webhook endpoint(s) registered'
    return 'ERROR', f'Could not retrieve webhooks — HTTP {r.status_code}'

# ── Brevo ─────────────────────────────────────────────────────────────────────
print("\n📧 Brevo")

@check('Brevo API', 'Brevo', critical=True)
def _():
    if not BREVO_API_KEY:
        return 'WARN', 'BREVO_API_KEY secret not configured in GitHub'
    r = requests.get(
        'https://api.brevo.com/v3/account',
        headers={'api-key': BREVO_API_KEY, 'accept': 'application/json'},
        timeout=10
    )
    if r.status_code == 200:
        data = r.json()
        email = data.get('email', 'unknown')
        plan  = data.get('plan', [{}])
        plan_name = plan[0].get('type', 'unknown') if plan else 'unknown'
        return 'OK', f'Account active — {email} — Plan: {plan_name}'
    if r.status_code == 401:
        return 'ERROR', 'Brevo API key invalid or expired'
    return 'ERROR', f'Brevo returned HTTP {r.status_code}'

@check('Brevo sender domain', 'Brevo', critical=False)
def _():
    if not BREVO_API_KEY:
        return 'WARN', 'BREVO_API_KEY not configured'
    r = requests.get(
        'https://api.brevo.com/v3/senders',
        headers={'api-key': BREVO_API_KEY, 'accept': 'application/json'},
        timeout=10
    )
    if r.status_code == 200:
        senders = r.json().get('senders', [])
        verified = [s for s in senders if s.get('active')]
        if verified:
            names = ', '.join(s.get('email','?') for s in verified[:3])
            return 'OK', f'{len(verified)} active sender(s): {names}'
        return 'WARN', 'No active/verified senders found — check Brevo sender settings'
    return 'ERROR', f'Could not retrieve senders — HTTP {r.status_code}'

# ── Netlify ───────────────────────────────────────────────────────────────────
print("\n🚀 Netlify")

@check('Netlify last deploy', 'Netlify', critical=True)
def _():
    if not NETLIFY_SITE_ID or not NETLIFY_TOKEN:
        return 'WARN', 'NETLIFY_SITE_ID and NETLIFY_TOKEN secrets not configured in GitHub'
    r = requests.get(
        f'https://api.netlify.com/api/v1/sites/{NETLIFY_SITE_ID}/deploys?per_page=1',
        headers={'Authorization': f'Bearer {NETLIFY_TOKEN}'},
        timeout=10
    )
    if r.status_code == 200:
        deploys = r.json()
        if not deploys:
            return 'WARN', 'No deploys found'
        latest = deploys[0]
        state   = latest.get('state', 'unknown')
        branch  = latest.get('branch', 'unknown')
        created = latest.get('created_at', '')[:10]
        if state == 'ready':
            return 'OK', f'Last deploy: {state} — branch: {branch} — {created}'
        return 'ERROR', f'Last deploy state: {state} — branch: {branch} — {created}'
    return 'ERROR', f'Netlify API returned HTTP {r.status_code}'

# ── Live site (post-launch only) ──────────────────────────────────────────────
print("\n🌐 Live Site")

@check('clpeasy.com reachable', 'Live Site', critical=False)
def _():
    if SCAN_MODE != 'live':
        return 'WARN', 'Pre-launch — site is in Coming Soon mode. Switch SCAN_MODE=live on 15 June.'
    r = requests.get('https://clpeasy.com', timeout=15, allow_redirects=True)
    if r.status_code == 200:
        return 'OK', f'Site responding — HTTP {r.status_code}'
    return 'ERROR', f'Site returned HTTP {r.status_code}'

@check('clpeasy.com/builder.html', 'Live Site', critical=False)
def _():
    if SCAN_MODE != 'live':
        return 'WARN', 'Pre-launch — skipping live page checks'
    r = requests.get('https://clpeasy.com/builder.html', timeout=15)
    if r.status_code == 200:
        return 'OK', 'Builder page responding'
    return 'ERROR', f'Builder returned HTTP {r.status_code}'

@check('clpeasy.com/pricing.html', 'Live Site', critical=False)
def _():
    if SCAN_MODE != 'live':
        return 'WARN', 'Pre-launch — skipping live page checks'
    r = requests.get('https://clpeasy.com/pricing.html', timeout=15)
    if r.status_code == 200:
        return 'OK', 'Pricing page responding'
    return 'ERROR', f'Pricing returned HTTP {r.status_code}'

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n── Summary ──")
errors   = [c for c in checks if c['status'] == 'ERROR']
warnings = [c for c in checks if c['status'] == 'WARN']
ok_list  = [c for c in checks if c['status'] == 'OK']
critical_errors = [c for c in errors if c['critical']]

print(f"✅ OK: {len(ok_list)}  ⚠️ Warnings: {len(warnings)}  ❌ Errors: {len(errors)}")
if critical_errors:
    print("🚨 CRITICAL ERRORS:")
    for c in critical_errors:
        print(f"   [{c['name']}] {c['detail']}")

output = {
    'scan_date':       datetime.utcnow().strftime('%d %b %Y at %H:%M UTC'),
    'scan_mode':       SCAN_MODE,
    'checks':          checks,
    'ok_count':        len(ok_list),
    'warn_count':      len(warnings),
    'error_count':     len(errors),
    'critical_errors': len(critical_errors),
    'overall':         'ERROR' if critical_errors else ('WARN' if warnings else 'OK'),
}

with open('/tmp/health_results.json', 'w') as f:
    json.dump(output, f)
print("✅ Saved /tmp/health_results.json")
