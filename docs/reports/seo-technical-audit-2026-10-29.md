# SEO technical audit — 29 October 2026

Status: READ-ONLY findings; no production changes proposed without founder approval.

## Task 1 — Showcase canonical and route investigation
- Direct GitHub file read misleadingly returned zero characters for showcase.html. Git blob SHA d2a0650f079786e67497851bb98abf5a2f527ee8 returned 1,062,291 characters of valid HTML. The file is not empty.
- Showcase HTML has a title and meta description but no canonical link.
- Live /showcase shows updated content in public crawler. Public crawler could not retrieve /showcase.html, but this does not establish its HTTP status.
- sitemap.xml uses /showcase.html; Search Console indexing request was submitted for that URL on 29 October.
- Next: verify real response status, redirects, canonical and Netlify publish path before deciding preferred URL. Do not force a redirect based only on crawler failures.

## Task 2 — Sitemap and crawler directives
- sitemap.xml lists home, pricing.html, /faq, knowledge.html, showcase.html, support.html, legal pages, printing-and-cutting guide, making-guides.html and design-ideas.html.
- robots.txt allows public paths and declares sitemap.xml; excludes internal monitoring tools.
- _redirects has no Showcase-specific rule. Knowledge article aliases use 200 rewrites.
- Next: verify HTTP 200/301 status of sitemap entries with a network-enabled browser and check canonical agreement. No sitemap deletion indicated.

## Task 3 — Public metadata and internal linking
- Verified homepage, pricing, FAQ, knowledge base, Making Guides and Design Ideas have titles, meta descriptions and canonical links.
- support.html was missing canonical; PR #336 squash-merged as 07919ed9c9342bb2e15a82ad7fe2d71ce5fec93c after founder approval.
- Making Guides has contextual links to Builder and printing help for four product types.
- SEO PRs #315, #317, #318, #326 and #328 are already merged. Do not repeat them.

## Task 4 — Legacy indexed claims and indexing
- A public search index still shows an older /showcase snapshot claiming 'Every size. Fully compliant.' and incorrect universal 52 mm minimum.
- Current live /showcase displays 'Every supported size. CLP ready.' and explicitly explains 52 mm as a CLPeasy software limit, not a universal legal minimum.
- Search Console live URL test for /showcase.html reported indexable on 29 October and indexing was requested. No further request needed now.
- Recheck Search Console after recrawl. Ranking/indexing is Google's decision and not guaranteed.

## Release safety
- PR #333 (GA4) remains on hold.
- Do not alter Builder, auth, billing, labels, or create duplicate product guides.
- No merge/deployment without explicit founder approval.

## Consolidated release candidates
- Added missing self-canonical links to the three sitemap-listed legal pages: terms.html, privacy.html and refund.html. These are metadata-only changes; legal text unchanged.
- Showcase title and page body unchanged; updated meta description and added sitemap-aligned canonical in draft PR #337.
- Support self-canonical was already released separately in PR #336.
- Final release gate: verify both Showcase URL responses and review preview/automated checks before founder approves one consolidated merge.
