#!/usr/bin/env python3
"""Read-only CLPeasy AI handover metadata report; no model API calls."""
import json
import os
import re
import urllib.request
from datetime import datetime, timezone

REPO = "craftymousegifts/clpeasy"
ISSUE = 230
API = f"https://api.github.com/repos/{REPO}/issues/{ISSUE}/comments?per_page=100"

def fetch_json(url):
    if not url.startswith(f"https://api.github.com/repos/{REPO}/issues/{ISSUE}/comments?"):
        raise ValueError("Unexpected API URL")
    request = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "clpeasy-handover-readonly/1.0",
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response), response.headers.get("Link", "")

def last_page_url(link):
    match = re.search(r'<([^>]+)>;\\s*rel="last"', link)
    return match.group(1) if match else None

def main():
    comments, link = fetch_json(API)
    last_url = last_page_url(link)
    if last_url:
        comments, _ = fetch_json(last_url)
    last = comments[-1] if comments else None
    report = "\\n".join([
        "## CLPeasy AI handover — read-only",
        f"- Checked: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"- Coordination: https://github.com/{REPO}/issues/{ISSUE}",
        f"- Latest comment: {last['html_url'] if last else 'none'}",
        "- Decision needed: review issue #230 for unresolved approvals",
        "- Production / cost: no deployments or paid AI calls from this workflow",
    ]) + "\\n"
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write(report)

if __name__ == "__main__":
    main()
