# Phase 2 live preview checks — 3 Oct 2026

Code reviewed: PR #204, branch `fix/builder-phase2-codex`, source `31f9d773d29f3f9cf3aae11ba90409623d14188c`. Production main was re-fetched and remains `6bd9a00`.

## Automatically deployed PR preview

GitHub's Netlify status confirms success at https://deploy-preview-204--clpeasy.netlify.app . The rendered Netlify drawer identifies preview deploy `6ac15edce4291c000892a59c`.

This PR preview retains production connection settings. All browser checks below were **signed out**, with one synthetic QA design stored only in this browser. No account signup, customer data write, Live payment or production deployment was performed.

- The served `label-render.js`, `sds-doc-check.js`, `public-nav.css` and approved hero image are byte-identical to the review branch.
- Every original inline script in served Builder (three) and Composer (two) is unchanged. The HTML itself differs because Netlify rewrites links and adds its preview drawer.
- Real form journey: choose a 90 mm circle, enter a Reed Diffuser at 10%, select a matching finished-product document, and extract H361f/P102.
- The complete suffixed H361f code is retained; the saved/Composer label shows “Suspected of damaging fertility.”, Warning and GHS08.
- Step 4 with a business name and phone but no address refuses Next with “Add your supplier address before continuing.” Adding a sample address restores progression to Step 5.
- Checking the final review box and saving produces “Label saved”. Its stable-id Composer link loads the same label into a 2×2 A4 sheet at 90 mm.
- The Composer correctly requires sign-in for export; neither PDF nor cutting-machine export was attempted through an account. The screenshot is `composer.jpg`.
- The Composer console contained no app-source error in this journey; the only captured error was from the browser's own extension.

These are deployed desktop guest checks. Automated desktop/mobile and simulated-account export checks remain recorded in the Phase 2 handover; they are not equivalent to a real signed-in Test journey.

## Dedicated isolated Test build prepared

`build-phase2-test-preview.py` recreates the isolated static build using the Test project's public anon key supplied in a local file. It never commits that key and does not deploy anything.

Build v30 is prepared from `31f9d77`: 57 files, includes `public-nav.css` and `sds-doc-check.js`, uses Test Supabase `wwjhvpphlbgtywxskqnf`, substitutes recorded Sandbox price IDs, removes the production auth reverse proxy and adds [TEST]/noindex markers. It contains no production project reference or production public key and includes no functions. Renderer, shared document check, navigation stylesheet and approved hero remain byte-identical to the source. Checksums are in `test-build-manifest.json`.

Example:

```sh
python docs/reports/build-phase2-test-preview.py --repo . --output /path/to/new-test-build --test-public-key-file /path/to/test-public-key
```

The Test Auth health endpoint now returns HTTP 200 with the Test public key: the earlier network-access blocker no longer applies in this workspace. No real Test account was authenticated.

## Deployment access blocker

Secure Netlify sign-in completed, but the selected account exposed only the personal `michaela-feeley` team and an unrelated project. The intended Test project's dashboard returned “Page not found” / “Log in with a different user”. It was not available in the account's team list.

**Nothing was uploaded** and the existing dedicated Test preview was not replaced. Do not deploy this build to the unrelated personal project, create a substitute project, grant new access or change production.

Continuation: sign in to the Netlify account/team that owns `clpeasy-pr156-payg-test-v10`, publish the prepared static Test build to that project, verify served files and [TEST]/Test connection settings, then complete a real signed-in Test Builder → save → reopen → Composer → export journey using an authorized existing Test account. Production release remains subject to explicit owner approval.
