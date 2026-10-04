# PNG generation reliability — 4 October 2026

Confirmed Builder fault: the download wrapper consumed credit before the asynchronous image/canvas PNG generation completed. Image onerror silently revoked its URL, toBlob did not check for null, and the async function returned before its callbacks finished. This left some generation failures without a file or a useful error.

PNG preparation now finishes before accounting. For a signed-in user it prepares clean and watermarked versions of the same design; the existing atomic RPC remains the authority deciding which version is delivered. Both completed versions remain local until authorization. Failure or a changed design stops before accounting and tells the customer no credit was used. Guest exports remain watermarked. Dimensions stay 600 DPI; renderer content, geometry and wording are unchanged. Image loads and encoding have bounded failure handling with source-URL cleanup.

Download messages now say Download started, ZIP download started, or Print view ready. Initiating a browser download is not proof of a successful disk write. The UI directs customers to their browser Downloads list.

Validation passed: png-generation-before-credit (failed preparation, zero accounting calls, clean/trial selection, accounting refusal, edited input, real error callbacks/null canvas blob and cleanup, expected 600 DPI dimensions, honest status text), live-builder-export-hotfix, builder-regression, hazard-source-integrity, preview-watermark-and-export-authorization (23 groups), app-static-audit (29 HTML files), and diff check.

Tests are JSDOM/account-stub tests. Cloud Browser preview and production smoke checks follow before release/sign-off. The browser download listener previously returned no files even when the site reported handover; this patch does not claim to resolve that browser limitation or prove actual downloaded PNG dimensions. Real iPhone and funded production output tests remain outstanding. No Stripe/Supabase schema, profile, subscription, webhook, pricing or payment changes.
