# 11 — Current Test Coverage

## Suite status on `main` (run locally, `npm ci` then every file in `tests/`)

- 53 test files: **48 pass, 5 fail**.
- The 5 failures are pre-existing and unrelated to the label: `builder-desktop-scroll-model.js` and `builder-step-navigation-layout.js` ("Compliance card content changed"), `footer-and-compliance-wording.js` (showcase.html wording), `lifecycle-reminder-accuracy.js` (pricing.html "Regulation change alerts"), `smart-paste-user-guidance-wording.js` (index.html wording). They assert marketing/UI copy that has since changed. Not investigated further (out of scope).
- `npm test` runs only 2 of the 53 files.

## Critical methodology gap

**No test renders a label in a real browser with real fonts.** Every rendering test uses jsdom with a fake `measureText` (character-class width table) or static source inspection. So no existing test can detect: text outside the circle, overlaps, font-substitution width differences, arc overlap, or real export output. The CRITICAL circle-clipping bug passes the entire suite.

## Coverage by rule

| Rule | Coverage | Notes |
|---|---|---|
| fits contract (overflow / footer / unrecognised code) | TESTED | fake metrics |
| Block-reason messaging, GB-unsupported codes | TESTED | |
| Legibility floor (1.2 mm nominal) | TESTED | fake metrics |
| Hazard text inside label horizontally on circles | **NOT TESTED** | defect exists |
| Arc product name vs header | **NOT TESTED** | defect exists (`circle-header-band-layout-fix.js` checks band arithmetic only) |
| Product-name wrap font size | **NOT TESTED** | defect exists |
| Pictogram sizing 10 / 11.31 mm, parity Builder/Composer | TESTED | |
| Pictogram precedence | NOT TESTED | not implemented |
| Unknown pictogram key | NOT TESTED | |
| Candle icon sizing / floor | TESTED | |
| Candle icons inside circle | NOT TESTED | minor defect |
| EUH208 bounded extraction, long names wrap | TESTED | |
| EUH208 without names | NOT TESTED | defect exists |
| Placeholder "Your Brand" / missing address | NOT TESTED | |
| Smart Paste suffixed H codes (H361f) | NOT TESTED | defect exists |
| P-code normalisation (+, /) | TESTED | |
| P280 | TESTED | |
| Statutory wording of H/P library | PARTIALLY TESTED | P280 only |
| Signal-word resolution | TESTED | |
| Resolution invariance | TESTED | |
| Custom-size minimum | TESTED | |
| Composer export fidelity / fit blocking | TESTED | |
| Composer honours saved overrides | NOT TESTED | defect exists |
| Escaping of text | PARTIALLY TESTED | code values in overlay only |
| bgColour attribute / control chars | NOT TESTED | |
| Real PNG/PDF output | NOT TESTED | |
| Product-type differences | PARTIALLY TESTED | candle icons only |
| Geometry matrix with realistic content | PARTIALLY TESTED | fake metrics |

A passing test above shows the code does what the test expects; it does not prove the expected behaviour is correct.
