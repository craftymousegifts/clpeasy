# Test-only fonts

Used only by `tests/circle-product-name-business-name-clearance.js`. They are never loaded by the app.

| File | Font | Why |
|---|---|---|
| `gelasio-700-latin.woff2` | Gelasio Bold (Latin subset), metric-compatible with Georgia | Registered as the family `Georgia`. It stands in for a Windows/macOS/iOS device where Georgia (the business name's font) is installed. The test container has no Georgia. |
| `dm-sans-700-latin.woff2` | DM Sans Bold (Latin subset) | Registered as `DM Sans`. It stands in for the Pro preview and PDF paths, where the web font loads. |

Both fonts are licensed under the SIL Open Font License 1.1; the licence texts are in `OFL-Gelasio.txt` and `OFL-DM-Sans.txt`. Both files were downloaded from Google Fonts.
