# Remaining audit classification (29 Sep 2026)

Classification only; no application code changed. Branch `fix/circle-per-line-text-fit`. Every "reproduces" entry was re-checked on the current branch in real Chromium (probe: pictogram, signal-word, Smart Paste, sizing and address cases).

**Classes:**
- A: necessary GB CLP correctness/safety
- B: demonstrated Builder/Composer/export defect
- C: security/output integrity
- D: product/design decision
- E: minor/cosmetic/architectural
- F: fixed, overtaken or not reproducible

**Group 1: must address before production**
- **M37 + M64:** Article 26 pictogram precedence, with the legacy saved-pictogram decision.
- **M04:** the Composer prints the saved signal word instead of the resolved one.
- **M63:** Smart Paste silently drops codes joined to their text.

**Group 2: review / product decision**
- **Regulatory evidence first:** M36 and M34 are potential production blockers. Also M32, M33, M26, M18 (part of the GB checkpoint) and M22.
- **Product decisions:** M46, M47 (including the 63×44 candle), M13, M15, M23, M52, M62, M66.
- **Evidence:** M05 needs real-device checks.

**Group 3: no further Builder change recommended**
- M01, M02, M08, M11, M12, M14, M16, M17, M27, M28, M29, M30, M35, M39, M40, M42, M48, M49, M53, M54, M60 (original PASS).
- Signed off: M03, M09/M31, M10, M19/M20, M21, M38, M43, M44, M45, M55.
- M24, M51, M56, M57: implemented, tests pass, awaiting sign-off only.
- M06, M07, M25, M41, M50, M58, M59, M61, M65, and the unstyled Smart Paste toast.

**Recommended next review:** M36, a GB interpretation review only.

The full table is in the chat report of 29 Sep 2026.
