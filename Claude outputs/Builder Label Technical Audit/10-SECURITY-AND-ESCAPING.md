# 10 — Security and Text Safety (defensive rendering audit)

| # | Vector | Where | Behaviour | Status |
|---|---|---|---|---|
| S1 | Text content (`& < > "`) | label-render.js `xe()` used for every text node incl. product name on arc, footer, website, blocked-overlay codes | escaped; probe with `"><script>…`, `<img onerror>`, `O'Brien & <b>Co</b>` produced valid XML, no elements injected | PASS |
| S2 | Apostrophes | `xe()` does not escape `'` | all interpolated attributes are double-quoted, so safe | PASS |
| S3 | **`bgColour` attribute** | `fill="${bgCol}"` unescaped. Builder: value from `<input type=color>`/hex regex (safe). Composer: taken from the **saved record** (`e.bgColour`). | a crafted saved record can inject attributes/elements into the label SVG that Composer inserts into the DOM (probe 16: `onload=` attribute present) | ISSUE MEDIUM (requires tampered stored data; the user's own records) |
| S4 | Control characters U+0000–U+001F | not stripped | SVG becomes invalid XML → DOMParser `parsererror` in PNG/PDF paths → broken or failed export; SDS PDF copy/paste can carry such characters | ISSUE LOW |
| S5 | `printToPDF` `<title>` | `'CLPeasy Label — '+S.scentName` concatenated raw into a Blob HTML page | a product name containing `</title><script>` executes in the user's own blob window | ISSUE LOW (self-XSS) |
| S6 | Legacy sheet/print-ready popups | `slug` is sanitised to `[a-z0-9-]` | safe | PASS |
| S7 | Builder UI echoes | `escapeBuilderText` for tags and block messages | escaped | PASS |
| S8 | Chip titles | `title="${h.desc}"` from static library | static, safe | PASS |
| S9 | Unicode | é, ü, ø, ’, « » render; no normalisation (NFC/NFD not applied) | PASS |
| S10 | Line breaks | collapsed to spaces by SVG whitespace handling; address never shows intended line breaks | PASS (safe) / design note |
| S11 | Malformed entities (`&amp;amp;`, `&#`) | escaped literally | PASS |
| S12 | instanceId | caller-generated, never user text | PASS |
