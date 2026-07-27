# Project History — CLPeasy and Related Context

## 2025–2026 background
Michaela has been developing CLPeasy as a SaaS product for UK makers while also having an existing handmade craft business, Crafty Mouse Gifts.

## CLPeasy development
The project has involved:
- Building a label generator.
- Connecting or planning Supabase authentication.
- Connecting or planning Stripe billing.
- Hosting/deployment through Netlify.
- Source control through GitHub.
- Building pricing and subscription plans.
- Creating print-ready label output.
- Adding PDF, PNG and SVG output.
- Developing AI-assisted "Guide Me".
- Developing "Smart Paste SDS".
- Adding or planning Candle Care Cards.
- Adding or planning Room Spray Safety Cards.
- Adding or planning Wax Melt Inserts.

## Pricing history
Historical pricing discussed:
- Easy Start: $9.99/month
- Easy Start: $99/year
- Easy Pro: $14.99/month
- Easy Pro: $149/year
- 5 downloads: $3.99
- 10 downloads: $7.99
- 14-day free trial

Historical Easy Start allowance:
- 10 downloads/month

Verify all pricing in the current application before relying on these figures.

## Launch history
A V1.0 launch was planned for Monday 15 June 2026.
The launch was described as:
"LIVE TODAY!!! V1.0"

## Important technical issue
A PDF output defect occurred in a 63×44 mm label rectangle where:
- "SCENTED CANDLE"
- "WARNING"

overlapped.

A patch was applied in builder.html.

Future changes to label rendering should regression-test this area.

## Compliance and layout concerns
Michaela has been concerned about minimum dimensions for GHS pictograms and CLP label elements.

Future work should:
- Verify current requirements.
- Avoid shrinking compliance-critical elements merely to make them fit.
- Test both visual layout and physical dimensions.

## Historical files
Files previously referenced:
- builder(1).html
- pricing.html
- home(3).html

These are historical references only. The current repository may have different names.

## Current development philosophy
The project should evolve incrementally.
Do not rewrite working systems unnecessarily.
Before modifying:
1. Inspect.
2. Understand.
3. Change narrowly.
4. Test.
5. Report.

## Other business context
Michaela also operates Crafty Mouse Gifts, a handmade product business.

The practical maker perspective is useful when evaluating CLPeasy UX, pricing, onboarding, and product features.
