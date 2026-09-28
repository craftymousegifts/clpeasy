# M10 — supplier address — GB CLP investigation

Status: INVESTIGATED — AWAITING IMPLEMENTATION APPROVAL

## Original audit question

Should CLPeasy block a hazardous-label export when the supplier/responsible-person address is missing?

## GB-only regulatory finding

YES: the current GB CLP label requirement includes the supplier's **name, address and telephone number**.

Primary source reviewed: GB/UK version of Regulation (EC) No 1272/2008, Article 17(1)(a), on legislation.gov.uk. Article 17 lists as a label element: the name, address and telephone number of the supplier(s).

HSE material independently describes the CLP supplier label element as name, address and telephone number.

This is a GB CLP requirement, not a CLPeasy design preference.

## Important limit on this finding

Article 17 says "address". This investigation does NOT invent a more specific GB rule about postcode syntax, number of address lines, or automated postal-address validation.

CLPeasy should require a non-blank address, but should not attempt to certify that a string is a legally sufficient postal address unless a separate authoritative GB basis is established.

## Current CLPeasy behaviour on the audit branch

Step 4 currently says:

- Business / Brand name — required
- Address — "(town, county or full address)"
- Phone number — required for CLP compliance

`checkStep4AndNext()` blocks a blank business name and a blank phone number, but does not check `biz-address`.

Therefore a maker can continue to Step 5 and export a hazardous label with no supplier address.

The shared renderer also treats a missing address as an empty optional footer field.

## Classification

GB CLP regulatory/content defect + export-gating defect.

## Smallest safe implementation

Recommended:

1. Make Address visibly required in Step 4.
2. Change the current misleading "(town, county or full address)" helper so CLPeasy does not imply that town/county alone is necessarily enough.
3. In `checkStep4AndNext()`, trim and require a non-blank address, using the same interaction pattern as business name/phone.
4. Extend the shared required-content/export guard so an old/tampered saved label with a missing address is also blocked at export/Composer level. Step 4 alone is not a sufficient safety boundary.
5. Do not mutate old saved records. Opening an old label with no address should require the maker to enter one before export.
6. Do not add postcode-format validation or country-specific address parsing.
7. Do not alter renderer layout formulas except for the natural consequence that a real address now has to be present and fit.

## Fit consequence

Some labels that currently fit only because the address is blank may become NOT FIT once the maker enters the required address. That is correct: CLPeasy must not gain space by omitting a required GB CLP label element.

## Existing saved labels

No migration. Existing labels with an address continue unchanged. Existing labels without an address remain readable but must be completed before export.

## Regulatory scope

GB only. No EU/NI/GHS-only requirement has been used to expand this finding.
