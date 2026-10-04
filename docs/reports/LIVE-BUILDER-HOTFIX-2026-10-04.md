# Live Builder QA hotfix — 4 October 2026

Production QA found two regressions: the approved fresh-label navigation did not reveal the preview export controls at Step 5, and Business progression/export accepted a phone number with no name or address.

The focused patch reveals the existing desktop/mobile export rows at Step 5 and hides them on return to earlier steps. One raw-data business-details validator is shared by Builder and Composer. Step 4 requires name, address and phone; all Builder export entry points check current form values before accounting, while Composer checks occupied saved labels at its common export guard. Missing fields are explained in the UI. Draft saving and stored designs are retained. Renderer geometry, hazard wording, extraction, supplier checks, billing/auth/database configuration are unchanged.

This does not merge PR #204 or change its broader unfinished scope. That draft must be reconciled with this hotfix before future release.

Validation passed:
- tests/live-builder-export-hotfix.js: fresh navigation, return navigation, whitespace/missing business fields, export controls, no credit consumption on refused Builder export, Composer saved-label and blank-slot checks.
- tests/builder-step-navigation-layout.js
- tests/hazard-source-integrity.js
- tests/preview-watermark-and-export-authorization.js (23 assertion groups)
- tests/builder-regression.js
- tests/app-static-audit.js (29 HTML files)
- git diff --check

Three existing test fixtures were completed with required QA business fields. No assertions were weakened. Tests use JSDOM and account stubs; real file delivery, current funded production exports and iPhone Safari remain separately unverified.

Preview and production browser verification will be recorded after deployment. User requested immediate fixes because the site is live; deployment of this focused patch is authorized in this conversation.
