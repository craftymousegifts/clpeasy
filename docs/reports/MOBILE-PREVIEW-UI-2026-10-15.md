# Mobile preview follow-up — 15 October 2026

Michaela approved implementing the two reported mobile-preview corrections and an edit-details route. Based on #243 at 39633cf8424bfd571fc3ec9a377acfe500e3e0bb; implementation at 9244bf4c617f0b9f1e5cd85d2de8cfeb3fefbd05.

- Reuse the five existing fine-tune controls inside the open mobile sheet on Step 5, with 44px buttons. Preserve their settings and unique IDs; return the panel on close/navigation/desktop resize.
- Add Edit label details links to the existing Product, Hazards and Business steps. Do not change locked extraction fields or their policy.
- Prevent flex shrinking of sheet children and the SVG wrapper when opening the size editor. Scroll the editor into view, retaining a scrollable sheet.

PASS: builder-step-navigation-layout (including mobile panel relocation, repeated opens, redraw, size editor, all edit routes, resize and retained values); finetune-control-limits; builder-regression; site-scroll-accessibility; app-static-audit. Tests used jsdom/mock browser state; they do not prove pixel geometry or Safari behaviour.

label-render.js and index.html unchanged. No label content, font-size rules, fit floors, export protection, payment/auth/backend or customer-data changes.

Draft #244 contains the five earlier fixes plus this mobile UI follow-up. Actual responsive visual verification and a real-iPhone retest remain pending. The reported overlap is not marked visually resolved until that evidence is obtained. Actual-size paper check and explicit founder release/window approval remain required. No main merge or production deployment authorised.
