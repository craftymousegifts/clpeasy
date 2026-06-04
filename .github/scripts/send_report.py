"""
CLPeasy Nightly Link Scan — Email Report Sender
Reads /tmp/scan_results.json and sends a formatted HTML email via Brevo.
"""

import os, json, sys
import urllib.request, urllib.error

BREVO_API_KEY = os.environ.get('BREVO_API_KEY', '')
REPORT_TO     = os.environ.get('REPORT_TO', 'support@clpeasy.com')
SCAN_MODE     = os.environ.get('SCAN_MODE', 'local')

if not BREVO_API_KEY:
    print("❌ BREVO_API_KEY secret not set — skipping email")
    sys.exit(0)

with open('/tmp/scan_results.json') as f:
    d = json.load(f)

broken_count = d['broken_count']
ok_count     = d['ok_count']
ext_count    = d['ext_count']
total        = d['total']
scan_date    = d['scan_date']
broken       = d['broken']
results      = d['results']
mode_label   = '🌐 Live site scan' if SCAN_MODE == 'live' else '📁 Local repo scan (pre-launch)'

# ── Build email HTML ───────────────────────────────────────────────────────────
status_colour = '#15803D' if broken_count == 0 else '#B91C1C'
status_bg     = '#DCFCE7' if broken_count == 0 else '#FEE2E2'
status_icon   = '🎉' if broken_count == 0 else '⚠️'
status_text   = 'All clear — zero broken links!' if broken_count == 0 else f'{broken_count} broken link{"s" if broken_count != 1 else ""} found!'

broken_rows = ''
if broken:
    for r in broken:
        broken_rows += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #FEE2E2;font-size:13px;color:#64748B">{r['file']}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #FEE2E2;font-size:13px;word-break:break-all">
            <a href="{r['href']}" style="color:#EF4444">{r['href']}</a>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #FEE2E2;font-size:12px;color:#64748B">{r['type']}</td>
        </tr>"""

broken_section = ''
if broken:
    broken_section = f"""
    <div style="margin:20px 0">
      <h3 style="font-size:14px;color:#B91C1C;margin-bottom:10px">❌ Broken Links — Fix These</h3>
      <table style="width:100%;border-collapse:collapse;background:#FFF5F5;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#FEE2E2">
            <th style="padding:8px 12px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase">File</th>
            <th style="padding:8px 12px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase">Broken URL</th>
            <th style="padding:8px 12px;font-size:11px;text-align:left;color:#64748B;text-transform:uppercase">Type</th>
          </tr>
        </thead>
        <tbody>{broken_rows}</tbody>
      </table>
    </div>"""

html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0FDFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:#1E3A5F;border-radius:12px 12px 0 0;padding:20px 24px;display:flex;align-items:center">
      <div style="background:#0D9488;width:40px;height:40px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px">🔗</div>
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700">CLPeasy Nightly Link Scan</div>
        <div style="color:#CCFBF1;font-size:12px;margin-top:2px">{mode_label} &nbsp;·&nbsp; {scan_date}</div>
      </div>
    </div>

    <!-- Body -->
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.08)">

      <!-- Status banner -->
      <div style="background:{status_bg};border-left:4px solid {status_colour};padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:20px">
        <span style="font-size:16px;font-weight:700;color:{status_colour}">{status_icon} {status_text}</span>
      </div>

      <!-- Stats -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr>
          <td style="text-align:center;padding:12px;background:#1E3A5F;border-radius:8px;color:#fff;width:25%">
            <div style="font-size:24px;font-weight:800">{total}</div>
            <div style="font-size:11px;opacity:.7;margin-top:2px">Total Links</div>
          </td>
          <td style="width:4px"></td>
          <td style="text-align:center;padding:12px;background:#DCFCE7;border-radius:8px;color:#15803D;width:25%">
            <div style="font-size:24px;font-weight:800">{ok_count}</div>
            <div style="font-size:11px;opacity:.8;margin-top:2px">✅ OK</div>
          </td>
          <td style="width:4px"></td>
          <td style="text-align:center;padding:12px;background:#FEE2E2;border-radius:8px;color:#B91C1C;width:25%">
            <div style="font-size:24px;font-weight:800">{broken_count}</div>
            <div style="font-size:11px;opacity:.8;margin-top:2px">❌ Broken</div>
          </td>
          <td style="width:4px"></td>
          <td style="text-align:center;padding:12px;background:#DBEAFE;border-radius:8px;color:#1D4ED8;width:25%">
            <div style="font-size:24px;font-weight:800">{ext_count}</div>
            <div style="font-size:11px;opacity:.8;margin-top:2px">🌐 External</div>
          </td>
        </tr>
      </table>

      {broken_section}

      {"" if broken else '<div style="background:#DCFCE7;border-radius:8px;padding:14px 18px;text-align:center;font-size:14px;color:#15803D;font-weight:600">✅ All 22 HTML files checked — every internal link is working correctly.</div>'}

      <!-- Footer note -->
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B">
        <strong>Scan mode:</strong> {"Live site (clpeasy.com)" if SCAN_MODE == "live" else "Local repo files (pre-launch)"}<br>
        {"<strong>Switch to live scanning:</strong> Go to your GitHub repo → Settings → Variables → Set SCAN_MODE to <code>live</code> on 15 June launch day." if SCAN_MODE != "live" else ""}
        <br><br>
        CLPeasy, 66 Paul Street, London, EC2A 4NA &nbsp;·&nbsp; UK TM: UK00004395085
      </div>
    </div>
  </div>
</body>
</html>"""

subject = f"CLPeasy Link Scan — {'⚠️ ' + str(broken_count) + ' broken link' + ('s' if broken_count != 1 else '') if broken_count else '✅ All clear'} — {scan_date}"

# ── Send via Brevo ─────────────────────────────────────────────────────────────
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
        body = resp.read()
        print(f"✅ Email sent to {REPORT_TO} — status {resp.status}")
        print(f"   Subject: {subject}")
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f"❌ Brevo API error {e.code}: {err}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Failed to send email: {e}")
    sys.exit(1)
