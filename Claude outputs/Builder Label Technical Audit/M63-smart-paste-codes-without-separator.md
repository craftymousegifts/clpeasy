# M63: Smart Paste silently drops codes with no separator before the following text

| | |
|---|---|
| ID | **M63** (new; continues the audit matrix after M62) |
| Area | Builder: Smart Paste code extraction (`extractSDS()` in `builder.html`; H/EUH via `LabelRenderer.extractHazardCodesFromText()`, P via the P-code pattern) |
| Status | **OPEN**. Found during the Issue #6 (M21) investigation; recording approved by Michaela. **Not fixed as part of Issue #6.** |
| Origin | Pre-existing (same behaviour on `main` `e8c1f25`). |
| Severity | Not yet assessed; to be decided in its own audit item. |

## Finding

When a hazard or precautionary code is followed **directly** by its text, with no space or punctuation, Smart Paste captures nothing for that code, and nothing tells the maker. Examples:

| Pasted text | Captured |
|---|---|
| `H317May cause an allergic skin reaction.` | nothing (H317 dropped) |
| `H412Harmful to aquatic life…` | nothing |
| `EUH208Contains …` | nothing |
| `P102Keep out of reach of children.` | nothing |
| `H317: May cause…`, `H317 - May cause…`, `(H317)`, `H317 May cause…` | captured correctly |

**Cause:** the code patterns require a word boundary after the digits, and a letter straight after the digits prevents it.

## Relationship to M21 (Issue #6)

M21 changed H-code extraction to keep verified suffixed codes (H361f, H360FD, H350i …) and short unknown suffixes (e.g. `H317s`, which is then blocked). Deliberately, it does **not** treat longer runs of letters as part of a code. `H412Harmful` and `H317May` therefore behave exactly as before, and M63 is left for its own decision. For all non-suffixed input, the Issue #6 extraction was verified identical to the previous extraction (175 test-suite texts, 8,928 boundary combinations).

## Open questions

- **Frequency:** how often do real supplier SDS PDF text layers join a code to its text? Not yet verified with real samples.
- **The fix, if any, must not invent codes from prose.** Options include blocking with a "check the pasted text" message, or splitting code from text where the code is unambiguous.

**Do not fix without approval.**
