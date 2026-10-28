# CLP-055 customer release notes — 28 October 2026

Draft only; founder approval required before merge or production deployment.

## Evidence and reconciliation

Base main `5871ed2794f8cb0f7f5001e32cd7deb8e193c807`. Git history and GitHub merged PR records establish:

| Production update date (UTC/GMT) | Merged PRs | Customer entry |
| --- | --- | --- |
| 27 October | #314, #315–319, #322, #321 | Sign-in before Builder, supplier review path, Composer availability, public-page descriptions and guides |
| 26 October | #270, #306–309, #311, #313 | Supplier wording preservation, two-column reading, local help, signup reliability and cookie links |
| 25 October | #301–305 | Homepage artwork and seasonal presentation |
| 23 October | #295, #296, #299 | Existing documentation, v1.4.1 and v1.5.0 information grouped without deleting any bullet |

Production fetched directly on 28 October: `builder.html` and `print.html` inline scripts and styles exactly match main; `release-notes.html` scripts/styles match main; `version.js` matches main byte-for-byte. HTML bytes differ because Netlify rewrites links. This is live artifact evidence, not an assertion that GitHub merges alone prove deployments. Tracker CLP-054 separately records Netlify production deploy `6ae12403ac840c765113c0d6` for #322. Latest main #321 follows it, and its sign-in script is present in the live Builder. Netlify deployment ID for #321 was not independently obtained.

Why v1.5.0 was CURRENT: version.js remains 1.5.0 / 2026-10-23, and the notes hard-coded the Current badge on that entry. Later merged and deployed changes did not update these records. There were also four literal `open` attributes. No evidence authorises assigning a new version number. Therefore retain version.js unchanged, explicitly distinguish latest numbered version from latest production update, and mark the dated 27 October update Current. Remove dynamic overwriting of the historical v1.5.0 heading.

All previous release list items and links are preserved verbatim. One native details element per date; only the latest open, all others Historical and individually toggleable. No JS accordion dependency. Private Project Tracker Release Versions untouched.

## Verification

- `node tests/versioning-and-release-notes.js`: PASS.
- `node tests/release-notes-grouping.js`: PASS, including unique dates, one open entry, independent summary toggle behaviour, badges, and every original history list item preserved.
- `git diff --check`: PASS.
- Existing application regression results and baseline comparison are recorded in PR #323; this PR changes no application, auth, billing, label, download or data code.
- Hosted preview visual and interaction verification: pending below; actual iPhone Safari not available to this environment.

## Release gate

Remain draft until hosted preview checked and founder reviews date grouping and customer wording. Actual iPhone check and explicit merge/deploy approval required. After approved release, verify current production date, one expanded entry, history toggles and unchanged sign-in/Builder/Composer links. No production action performed.
