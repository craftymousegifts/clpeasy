#!/usr/bin/env python3
"""Read-only CLPeasy AI handover status; writes to GitHub job summary only."""
import json
import os
import urllib.request
from datetime import datetime, timezone

REPO = "craftymousegifts/clpeasy"
ISSUE = 230
URL = f"https://api.github.com/repos/{REPO}/issues/{ISSUE}/comments?per_page=30"
req = urllib.request.Request(URL, headers={
    "Accept": "application/vnd.github+json",
    "User-Agent": "clpeasy-handover-readonly/1.0",
})
with urllib.request.urlopen(req, timeout=15) as response:
    comments = json.load(response)
# Display minimal metadata only; do not reprint untrusted comment bodies.
last = comments[-1] if comments else None
lines = [
    "## CLPeasy AI handover — read-only",
    f"- Checked: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
    f"- Coordination: https://github.com/{REPO}/issues/{ISSUE}",
    f"- Latest comment: {last['html_url'] if last else 'none'}",
    "- Decision needed: check issue #230 for any unresolved founder approvals",
    "- Production / cost: this workflow performs no deploys or paid AI calls",
]
report = "\n".join(lines) + "\n"
print(report)
summary = os.environ.get("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a", encoding="utf-8") as output:
        output.write(report)
