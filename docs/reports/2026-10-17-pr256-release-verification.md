# PR #256 (Correction A) — production verification record

Release: commit `a42d1f1`, deployed to https://clpeasy.com on 17 October 2026.
Change: complete GB wording for P305+P351+P338, P210 and P304+P340.

## Claude-tested (production, signed out, synthetic data)

- Builder preview, export SVG, SVG file, PNG and PDF images contain the
  complete wording (desktop 1366 px and iPhone-width 390 px emulation).
- Undersized labels are blocked (`hazard-text-overflow`) without shortening;
  all recommended sizes are supported and fit.
- Post-release visual regression audit against `bdf3355`: labels without the
  three statements byte-identical (240/240); Builder screens pixel-identical
  apart from the label preview; homepage pixel-identical.
- Note: on labels that only just fit, the existing renderer reduces GHS
  pictograms within its 10 mm floor to make room for the longer text.

## Owner-tested (Michaela, signed in, real iPhone) — not Claude-tested

- Saved labels: PASS.
- Print Sheet Composer preview: PASS.
- The specific corrected-statement print-sheet PDF download: not tested.

Claude could not sign in from its test environment, so the signed-in checks
above rest on the owner's testing only.
