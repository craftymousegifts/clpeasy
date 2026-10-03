# Phase 2 signed-in Test QA — 2026-10-03

Test URL: https://clpeasy-pr156-payg-test-v10.netlify.app

Prepared v30 build uploaded manually by Michaela. Served label-render.js and sds-doc-check.js are byte-identical to the prepared build. Builder, Composer and My Labels inline scripts match; checked HTML pages contain the Test project reference and no production project reference.

Authenticated through the secure browser-auth form using the existing payg-browser-qa@example.com Test account. The initial balance was 32.

## PASS — observed through the live UI

- Created a synthetic 90 mm circle Reed Diffuser label, 10% finished-product document answers, H361f and P102.
- H361f was retained and rendered as 'Suspected of damaging fertility.', Warning and GHS08.
- Blank supplier address was blocked with 'Add your supplier address before continuing.' Completing it allowed Step 5.
- Saved the completed label as 'Phase 2 Signed-in QA' (id bffa4bd0-6efb-4859-a1c5-6cbf611e4964).
- My Labels showed one saved record without a draft marker.
- Reopening restored the same record at Step 5 with 90 mm geometry and the expected content.
- Signed-in Composer loaded the saved record on a 2 × 2 A4 sheet; export controls were available.
- Cutting ZIP action displayed 'ZIP downloaded — 1 PNG'; the balance changed to 31.
- Print action opened a tab titled 'CLPeasy Print Sheet'. After refreshing Composer the balance was 30 and the saved label was reloaded.

## Limits

- Browser download-event waiting timed out even though the application reported ZIP success. Download bytes were not retrieved or inspected; no claim of file-level verification.
- The generated print tab could not be inspected because browser control returned 'Another locale override is already in effect'. A PDF was not saved or inspected.
- Fine-tune controls displayed 100% in this manual journey; non-default fine-tune parity remains covered by the previously passing automated M03 checks rather than a new manual claim.
- Existing blocked/incomplete and unknown-pictogram cases retain the previously reported automated coverage.

Two Test credits consumed by the two export actions; no checkout, Live payment or production mutation. Production/main remains unchanged; PR #204 remains unmerged. Test-only saved QA label retained for review.
