# CLP-015 homepage mobile performance and accessibility — 30 October 2026

Status: **released to production.** #344 and #345 were merged with founder approval and verified against Netlify production deploys.

## Baseline (founder, PageSpeed Insights mobile, 30 Oct 2026)

Performance 83, Accessibility 91, Best Practices 100, SEO 100; LCP 4.0 s.

## Causes found

- `index.html` was 691 KB. 573 KB of that was one inline SVG sprite holding 10 demo-label pictogram JPEGs as base64. The page could not display until it had downloaded.
- The render-blocking Google Fonts stylesheet delayed first paint by about 0.85 s on simulated slow 4G.
- **A pre-existing layout shift.** `public-nav.js` fixes the launch-offer banner and adds body padding after first paint. Before that script runs, the banner's top margin collapses through `<body>`.
  - On phones, the pre-script banner style (13 px text, 10 px/18 px padding) also differs from the script's final style (11 px text, 8 px/12 px padding).
  - Result: CLS 0.238 in a real 412 px browser on `main`.
- Remaining accessibility failure: colour contrast of the brand teal `#4C9BB0` (3.17:1). This is a deliberate brand decision and is out of scope.

## Releases

| PR | Change | Merge commit | Netlify production deploy |
|---|---|---|---|
| #344 | Homepage `<main>` landmark; underlined Cookie Policy link; Google Fonts preconnect | `fa73fbd` | `6ae50d3666b9c5ad782bcfdc`, published 21:33:57 UTC |
| #345 | Pictograms moved to `assets/homepage-demo/*.jpg` (lossless, pixel-identical); non-blocking Google Fonts with `<noscript>` fallback; homepage-only `body{display:flow-root}` and phone banner size to remove the shift | `f6c93fe` | `6ae5105373fe3d939dde9b1a`, published 21:47:08 UTC |

Both production deploys report the merge commit as `commit_ref`. The source trees are byte-identical to the locally tested heads: `56919d7` for #344, and `2bee459` (rebased as `0e3dc31`) for #345.

## Evidence (local Lighthouse 13.6 mobile, median of 3; not PageSpeed Insights)

| | `main` 944095e | after #344 | after #345 |
|---|---|---|---|
| Performance | 64–78 | 77 | 91–94 |
| LCP | 4.4 s | 4.4 s | 2.9 s |
| FCP | 2.8 s | 2.8 s | 1.0 s |
| CLS | 0–0.238 | 0 | 0.001 |
| Accessibility | 91 | 96 | 96 |

Desktop performance went from 94 to 100. Loaded pages are pixel-identical to #344 at 360, 390, 768 and 1366 px. `npm test` passes 34/35 on the branch and on `main`; the exception is `guide-me-content-sync`, which fails on both. The CI `browser-checks` passed on both PRs. The founder checked the #345 preview on iPhone.

## Limits of this evidence

- The agent session could not reach clpeasy.com or the Netlify previews, which were blocked by the session network policy. Live verification was by deploy commit plus source identity; there was no live page fetch.
- The PageSpeed Insights API returned 429 without a key. It uses a shared anonymous quota.

## Open items

1. **Re-run PageSpeed Insights mobile on clpeasy.com** to record the real post-release figures against the baseline above.
2. **PageSpeed API key (optional, needs approval).** Create a separate Google Cloud project with no billing, enable only the PageSpeed Insights API, and restrict the key to it. Store the key only as a GitHub Actions secret.
3. **Deferred by founder:** reducing first-visit image weight. Total weight rose by about 158 KiB because the JPEGs no longer compress with the HTML. Options are one compressed SVG sprite, or downscaling the oversized originals (`ghs-aquatic` is 3000×3000 px).
4. **Deferred, brand decision:** contrast of `#4C9BB0`.
5. **Pre-existing, unrelated:** `tests/guide-me-content-sync.js` fails on `main` ("guide-me-content.js is out of date").
6. **From 1 Jan 2027:** `public-nav.js` stops styling the offer banner. Remove the static homepage banner when the offer ends; phones would otherwise show it at the 11 px size.
