# M15 — product-type quantity / burn-time fields — investigation

Status: INVESTIGATED — PRODUCT/UX CLEANUP, NOT A GB CLP EXPORT DEFECT

## What the audit found

M15 grouped three product-type inconsistencies:

1. The Step 2 field is labelled "Net weight" even though users may enter a volume such as ml.
2. Burn time is enabled for wax-melt types as well as candles.
3. The burn-time allow-list contains "Wax Melt Bag", but "Wax Melt Bag" is not a selectable product type; "Wax Melt Bouquet" is selectable but is not in the burn-time list.

## GB CLP relevance

Article 17(1)(b) uses the neutral concept **nominal quantity**. M13 separately established that this quantity is required for products made available to the general public unless it is specified elsewhere on the package.

GB CLP does not require CLPeasy to call this field "Net weight", and M15 does not justify making burn time a mandatory CLP element.

## Current-code finding

The field accepts free text, so values such as "100ml" can already be entered, but the visible label "Net weight" is misleading for liquid products.

The burn-time list currently includes:
- candle types;
- Wax Melt;
- Wax Tart;
- Snap Bar;
- Wax Melt Clamshell;
- Advent Calendar Wax Melt;
- Wax Melt Bag.

"Wax Melt Bag" is stale/unreachable because it is not in the current product selector.

## Recommended product decision

1. Rename the Step 2 UI field from **Net weight** to **Nominal quantity** (or simply **Quantity**) so both g and ml make sense.
2. Keep the saved data key `netWeight` for backward compatibility; this is a UI wording change, not a schema migration.
3. Do not change or auto-convert a maker's entered unit.
4. Treat burn time as optional product information, not CLP content.
5. Restrict burn-time enablement to product types for which CLPeasy intentionally wants to offer that optional field. The current inclusion of wax melts is a product choice, not a GB CLP requirement.
6. Remove stale "Wax Melt Bag" from the allow-list unless that product type is deliberately reintroduced.

## Why no application change yet

The quantity wording correction is straightforward. The wax-melt burn-time behaviour requires a product decision: some makers may choose to advertise a total melt-use duration, while others would regard "burn time" as candle terminology. The audit should not silently decide that commercial UX question.

## Classification

Product/UX consistency issue. No hard GB CLP export defect beyond the already-separated M13 quantity guidance.

## Application code changed

NO
