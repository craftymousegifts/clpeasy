# Required-content / pictogram production hotfix — 4 October 2026

Owner instruction: complete remaining tasks, check every outstanding PR and perform final live checks. Focused reconciliation of PR #204 onto c7e4294; the draft branch itself is not merged.

Builder and Composer refuse exports with blank product names or EUH208 without a named substance, preserving the three required business fields from #208. The shared renderer blocks unrecognised saved pictogram keys instead of substituting exclamation. Valid-key SVG geometry, physical fit, hazard wording, supplier questionnaire removal, draft records and entitlement/accounting remain unchanged.

EUH208 named-substance requirement verified against primary GB CLP Annex II section 2.8: https://www.legislation.gov.uk/eur/2008/1272/annex/II . Completeness is a software guard; it does not identify substances or certify classification.

Tests exercise missing raw/whitespace product names, EUH208 names, direct PNG/SVG/PDF pre-credit refusal, saved-sheet guards and malformed pictogram keys (including prototype names). Existing fixtures updated to supply required business details, existing JSDOM scroll shim and current approved page text. Dense sheet fixtures now correctly assert refusal with complete supplier details; sparse fixtures still exercise successful true-A4 output. Plan-checker tests await actual navigation before the fade interval rather than assuming selection timers always fire immediately under load.

No payment, profile credit grant, backend schema, Stripe settings or PR #203 change. Physical print, actual iPhone and browser download artifact receipt remain separately unverified.
