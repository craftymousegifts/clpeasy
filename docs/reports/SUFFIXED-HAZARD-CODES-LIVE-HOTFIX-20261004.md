# Suffixed hazard-code QA hotfix — 4 October 2026

Live Smart Paste dropped H350i because extraction matched only bare three-digit H codes. Restore the focused, previously owner-approved M21 change from draft #204 without merging the larger draft.

Builder and the shared renderer now support H350i, H360F, H360D, H360FD, H360Fd, H360Df, H361f, H361d and H361fd. Complete codes and case are retained; clearly spaced suffixes join only to a verified code. Unknown/wrong-case suffixes stay visible and block progression/export. Existing long code/prose concatenation handling is unchanged.

Both libraries use the same approved wording. Builder assigns GHS08 and the existing Danger/Warning precedence. The resolver now normalises the code prefix only, preserving meaningful suffix case.

Primary wording checked against the retrieved current GB CLP Annex VI table, 1.1.2.1.2: https://www.legislation.gov.uk/eur/2008/1272/annex/VI . All nine approved strings match that table. This is a code-library fix, not a product classification or approval for sale.

Targeted JSDOM hazard-source tests cover all nine code strings, visible extraction fields, wording in both libraries, signal word, GHS08, SVG output text, saving/reopening, token boundaries, and unknown/wrong-case suffix export refusal. Existing signal-word tests need the standard scrollIntoView JSDOM shim; browser production code is unchanged by that shim. No Puppeteer tests are run in this session.

Renderer geometry, size floors, business validation, PNG preparation, authentication, database and payment settings are preserved. Longer statements continue to use existing fit guards and may require a larger label.
