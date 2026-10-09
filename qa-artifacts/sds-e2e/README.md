# 100-SDS end-to-end customer-journey evidence (QA only)

Report: `docs/reports/SDS-100-E2E-QA-2026-10-09.md`. Results: `100_SDS_E2E_RESULTS.csv` / `.json` (one verdict per case; 100 rows).

Per case `NNN/`: `journey.json` (every step, field, warning, dialog, download, RPC call), `section-2-2-pasted.txt` (exact text pasted), `source-section-2-2.png` (Section 2.2 rendered from the supplier's PDF), and per size folder (`63x44/`, `76x51/`) the Smart Paste input and populated-builder screenshots, the real preview element (`preview-*.png`), any warning screen, and the files actually downloaded through the builder buttons (`export-*.png|svg|pdf`, plus `export-*.pdf-render.png`). `*-recommended-WxH*` files are the size the builder itself recommended after a block.

Source PDFs are not duplicated here: each case's `journey.json` records the supplier URL and SHA-256 (all verified against the corpus manifest of workflow run 37906750853).

Reproduce: `node scripts/e2e-sds-customer-journey.js <corpusDir> qa-artifacts/sds-e2e [ids...]`, then `python3 -I scripts/e2e-sds-source-crops.py <corpusDir> qa-artifacts/sds-e2e`, `python3 -I scripts/e2e-sds-analyse.py <corpusDir> qa-artifacts/sds-e2e <historical.csv> label-render.js <outDir>` and `python3 -I scripts/e2e-sds-report.py <outDir>/100_SDS_E2E_RESULTS.json <report.md> [narrative.md]`. Needs Chromium, puppeteer, Python with pymupdf, Pillow and numpy.
