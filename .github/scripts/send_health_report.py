"""
CLPeasy Daily Service Health Check — Email Report Sender
Reads /tmp/health_results.json and sends a formatted HTML email via Brevo.
"""

import os, json, sys
import urllib.request, urllib.error

BREVO_API_KEY = os.environ.get('BREVO_API_KEY', '')
REPORT_TO     = os.environ.get('REPORT_TO', 'support@clpeasy.com')

if not BREVO_API_KEY:
    print("❌ BREVO_API_KEY not set — skipping email")
    sys.exit(0)

with open('/tmp/health_results.json') as f:
    d = json.load(f)

checks         = d['checks']
scan_date      = d['scan_date']
ok_count       = d['ok_count']
warn_count     = d['warn_count']
error_count    = d['error_count']
critical_errors= d['critical_errors']
overall        = d['overall']
scan_mode      = d['scan_mode']

# ── Status colours ────────────────────────────────────────────────────────────
if overall == 'OK':
    banner_bg, banner_border, banner_text = '#DCFCE7', '#22C55E', '#15803D'
    banner_icon, banner_msg = '✅', 'All systems operational'
elif overall == 'WARN':
    banner_bg, banner_border, banner_text = '#FEF3C7', '#F59E0B', '#92400E'
    banner_icon, banner_msg = '⚠️', f'{warn_count} warning{"s" if warn_count!=1 else ""} — review recommended'
else:
    banner_bg, banner_border, banner_text = '#FEE2E2', '#EF4444', '#B91C1C'
    banner_icon, banner_msg = '❌', f'{critical_errors} critical error{"s" if critical_errors!=1 else ""} — action required'

# ── Build check rows by category ──────────────────────────────────────────────
categories = ['Supabase', 'Stripe', 'Brevo', 'Netlify', 'Live Site']

def status_badge(status):
    if status == 'OK':    return '<span style="background:#DCFCE7;color:#15803D;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">✅ OK</span>'
    if status == 'WARN':  return '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">⚠️ WARN</span>'
    return '<span style="background:#FEE2E2;color:#B91C1C;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">❌ ERROR</span>'

sections_html = ''
for cat in categories:
    cat_checks = [c for c in checks if c['category'] == cat]
    if not cat_checks:
        continue
    rows = ''
    for c in cat_checks:
        row_bg = '#FFF5F5' if c['status'] == 'ERROR' else ('#FFFBEB' if c['status'] == 'WARN' else '#fff')
        crit = ' <span style="font-size:10px;color:#EF4444">(critical)</span>' if c['critical'] and c['status'] == 'ERROR' else ''
        rows += f'''<tr style="background:{row_bg}">
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1E3A5F;border-bottom:1px solid #E2E8F0">{c["name"]}{crit}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0">{status_badge(c["status"])}</td>
          <td style="padding:8px 12px;font-size:12px;color:#64748B;border-bottom:1px solid #E2E8F0;word-break:break-word">{c["detail"]}</td>
        </tr>'''

    cat_ok    = all(c['status'] == 'OK'   for c in cat_checks)
    cat_error = any(c['status'] == 'ERROR' for c in cat_checks)
    header_bg = '#DCFCE7' if cat_ok else ('#FEE2E2' if cat_error else '#FEF3C7')
    header_colour = '#15803D' if cat_ok else ('#B91C1C' if cat_error else '#92400E')
    cat_icons = {'Supabase': '🗄️', 'Stripe': '💳', 'Brevo': '📧', 'Netlify': '🚀', 'Live Site': '🌐'}
    icon = cat_icons.get(cat, '🔧')

    sections_html += f'''
    <div style="margin-bottom:16px">
      <div style="background:{header_bg};border-radius:8px 8px 0 0;padding:10px 14px">
        <span style="font-size:13px;font-weight:700;color:{header_colour}">{icon} {cat}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <thead><tr style="background:#F8FAFC">
          <th style="padding:7px 12px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;border-bottom:1px solid #E2E8F0;width:35%">Check</th>
          <th style="padding:7px 12px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;border-bottom:1px solid #E2E8F0;width:15%">Status</th>
          <th style="padding:7px 12px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase;border-bottom:1px solid #E2E8F0">Detail</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>'''

mode_note = '📁 Pre-launch mode — live site checks skipped until 15 June' if scan_mode != 'live' else '🌐 Live site mode — all checks active'

html_body = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0FDFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">

  <div style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:20px 24px;display:flex;align-items:center">
    <div style="background:#0D9488;width:40px;height:40px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px">🔧</div>
    <div>
      <div style="color:#fff;font-size:18px;font-weight:700">CLPeasy Service Health Check</div>
      <div style="color:#CCFBF1;font-size:12px;margin-top:2px">{mode_note} &nbsp;·&nbsp; {scan_date}</div>
    </div>
  </div>

  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <div style="background:{banner_bg};border-left:4px solid {banner_border};padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:20px">
      <span style="font-size:16px;font-weight:700;color:{banner_text}">{banner_icon} {banner_msg}</span>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="text-align:center;padding:12px;background:#1E3A5F;border-radius:8px;color:#fff;width:25%">
          <div style="font-size:24px;font-weight:800">{ok_count + warn_count + error_count}</div>
          <div style="font-size:11px;opacity:.7;margin-top:2px">Checks Run</div>
        </td>
        <td style="width:4px"></td>
        <td style="text-align:center;padding:12px;background:#DCFCE7;border-radius:8px;color:#15803D;width:25%">
          <div style="font-size:24px;font-weight:800">{ok_count}</div>
          <div style="font-size:11px;opacity:.8;margin-top:2px">✅ OK</div>
        </td>
        <td style="width:4px"></td>
        <td style="text-align:center;padding:12px;background:#FEF3C7;border-radius:8px;color:#92400E;width:25%">
          <div style="font-size:24px;font-weight:800">{warn_count}</div>
          <div style="font-size:11px;opacity:.8;margin-top:2px">⚠️ Warnings</div>
        </td>
        <td style="width:4px"></td>
        <td style="text-align:center;padding:12px;background:#FEE2E2;border-radius:8px;color:#B91C1C;width:25%">
          <div style="font-size:24px;font-weight:800">{error_count}</div>
          <div style="font-size:11px;opacity:.8;margin-top:2px">❌ Errors</div>
        </td>
      </tr>
    </table>

    {sections_html}

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B">
      {'<b>⚠️ Switch to live mode on 15 June:</b> GitHub repo → Settings → Variables → SCAN_MODE → set to <code>live</code><br><br>' if scan_mode != 'live' else ''}
      <b>To investigate errors:</b> Supabase → supabase.com &nbsp;·&nbsp; Stripe → dashboard.stripe.com &nbsp;·&nbsp; Brevo → brevo.com &nbsp;·&nbsp; Netlify → app.netlify.com<br><br>
      CLPeasy, 66 Paul Street, London, EC2A 4NA &nbsp;·&nbsp; UK TM: UK00004395085
    </div>
  </div>
</div>
</body></html>'''

subject_icon = '✅' if overall == 'OK' else ('⚠️' if overall == 'WARN' else '❌')
subject = f"CLPeasy Health Check — {subject_icon} {banner_msg} — {scan_date}"

payload = json.dumps({
    "sender":      {"name": "CLPeasy Monitor", "email": "support@clpeasy.com"},
    "to":          [{"email": REPORT_TO, "name": "Michaela"}],
    "subject":     subject,
    "htmlContent": html_body
}).encode('utf-8')

req = urllib.request.Request(
    'https://api.brevo.com/v3/smtp/email',
    data=payload,
    headers={
        'accept':       'application/json',
        'api-key':      BREVO_API_KEY,
        'content-type': 'application/json'
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        print(f"✅ Health report emailed to {REPORT_TO} — HTTP {resp.status}")
        print(f"   Subject: {subject}")
except urllib.error.HTTPError as e:
    print(f"❌ Brevo error {e.code}: {e.read().decode()}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Failed: {e}")
    sys.exit(1)
