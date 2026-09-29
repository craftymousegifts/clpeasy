# CLPeasy Project Context

## Overview
CLPeasy is a UK-focused SaaS tool designed to help makers create CLP-compliant product labels and related safety materials.

Primary domain:
- CLPeasy.com

Brand direction:
- Teal brand colours.
- The product is intended to feel approachable and easy to use for small makers and businesses.

## Core purpose
The product helps users enter product information and generate label content and print-ready files for products that require CLP-related labelling.

The workflow has included:
1. Enter product details.
2. Use SDS Section 2.2 information to identify/enter hazard classification.
3. Generate label content.
4. Include relevant hazard statements.
5. Include GHS pictograms.
6. Include signal word.
7. Include UFI field where applicable.
8. Produce print-ready output.

## Key features
Known features/product ideas include:

### Label Builder
A label-building workflow for creating CLP-related labels.

### Guide Me
An AI-assisted feature intended to guide users through the information they need to provide.

### Smart Paste SDS
A feature intended to help users paste SDS information and extract/reuse relevant information.

### Output formats
Known print-ready formats:
- PNG
- PDF
- SVG

### Additional safety documents
Known products/features include:
- Candle Care Card
- Room Spray Safety Cards
- Wax Melt Inserts

## Compliance-sensitive areas
The product has dealt with:
- Hazard statements
- Precautionary statements
- GHS pictograms
- Signal words
- UFI fields
- CLP label sizing and layout

The implementation must be careful around UK GB CLP requirements. Current regulatory requirements should be verified when making compliance-sensitive changes.

## Regulatory scope (owner instruction, 27 Sep 2026 — permanent)
CLPeasy is a **Great Britain CLP** label builder. All regulatory decisions (wording, classifications, pictograms, signal words, H/P statements and other legal label requirements) must be based on the **current GB CLP position** applicable in Great Britain.

Source priority:
1. GB CLP legislation applicable in Great Britain (current legislation.gov.uk version).
2. HSE / GB CLP Agency authoritative guidance and information.
3. Business Companion / Trading Standards guidance: "Candles, diffusers, oil heaters, etc." (https://www.businesscompanion.info/en/quick-guides/product-safety/candles-diffusers-oil-heaters-etc). A strong secondary, practical GB reference for candles, wax/fragrance products, diffusers and room sprays in England, Scotland and Wales (added 29 Sep 2026). It helps interpret and check the practical application; it never overrides legislation or HSE.
4. The maker's current supplier SDS (especially Section 2) where it supplies the finished mixture's classification/label information.

Legislation and HSE remain controlling for implementation decisions. General product-safety content in the Business Companion guide is not a reason to change the Builder. Only items within CLPeasy's CLP-label scope and supported by the applicable GB requirements may be flagged for implementation.

Current EU CLP, ECHA material, Northern Ireland/EU rules, UN GHS and other jurisdictions may be used for research/context only. They must never override or silently expand CLPeasy's GB requirements. If such material differs from, goes beyond, or cannot be confirmed against the current GB position: **stop and report it** — do not implement it as a CLPeasy requirement.

Product scope stays GB home fragrance: candles, wax melts, reed diffusers, room sprays, car fragrance/car fresheners and closely related home-fragrance products using fragrance oils and essential oils. Not a general/global chemical-labelling system.

## Label/pictogram sizing
Michaela has specifically raised concern that GHS pictograms must not fall below applicable minimum dimensions. The exact legal requirement should be verified against current official guidance before coding or changing compliance logic.

Do not solve layout problems by simply shrinking compliance-critical elements.

## PDF rendering issue
A previous PDF rendering defect affected a 63×44 mm rectangle:
- "SCENTED CANDLE"
- "WARNING"

The text overlapped in the generated PDF.

A patch was applied in builder.html.

When changing PDF generation or label layout:
- Check text bounding boxes.
- Check line wrapping.
- Check vertical spacing.
- Check signal word positioning.
- Check that text does not overlap.
- Check physical dimensions.
- Check generated output, not just browser preview.

## Technical stack
Known/previously used:
- Front-end HTML/CSS/JavaScript
- GitHub
- Netlify
- Supabase authentication
- Supabase database
- Stripe integration

Known historical files:
- builder(1).html
- pricing.html
- home(3).html

These names may be historical. Always inspect the current repository.

## Authentication
Supabase authentication has been used or planned for user accounts.

Before changing auth:
- Inspect current Supabase client setup.
- Check redirect URLs.
- Check session handling.
- Check protected pages.
- Avoid breaking existing users.

## Database
Supabase has been used for application data. At one stage, Supabase tables were initially empty.

Do not assume the current database schema is empty or unchanged. Inspect the live/current project configuration and migrations before modifying database logic.

## Billing
Stripe integration has been used/planned for subscriptions and billing.

Known historical pricing:
- Easy Start: $9.99/month
- Easy Start: $99/year
- Easy Pro: $14.99/month
- Easy Pro: $149/year
- 5-download top-up: $3.99
- 10-download top-up: $7.99
- Free trial: 14 days

These are historical values. Always inspect current pricing pages, Stripe configuration, and application code before changing billing.

## Download limits
Historical pricing discussions included:
- Easy Start: 10 downloads/month
- Top-up purchases for additional downloads

Inspect current implementation before assuming these limits remain unchanged.

## Launch history
CLPeasy V1.0 was planned/launched around Monday 15 June 2026.
A launch status was described as:
"LIVE TODAY!!! V1.0"

## Development history
Known development work has included:
- Label generation
- PDF output
- GHS pictogram sizing/layout
- 63×44 mm label rectangle layout
- Pricing page
- Stripe integration
- Supabase authentication
- Netlify hosting
- GitHub repository
- AI-assisted Guide Me
- Smart Paste SDS
- Safety card/inserts

## Development rules
- Preserve existing functionality.
- Avoid unnecessary rewrites.
- Inspect the current repository.
- Test production-sensitive flows.
- Pay particular attention to billing, authentication, label generation, and PDF output.
- Treat compliance logic as sensitive.
- Verify current regulatory requirements when making changes.

## Product positioning
CLPeasy is intended to simplify a difficult compliance workflow for small UK makers.

The user experience should be:
- Simple
- Friendly
- Clear
- Practical
- Accessible to non-technical makers

Avoid unnecessarily complex enterprise-style UX unless specifically requested.
