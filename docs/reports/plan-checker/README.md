# Plan Checker: branching model (Sep 2026)

Replaces the old 5-question points system in `plan-picker.html`. That system
recommended Easy Pro in 86 of its 108 answer combinations, including very light
use, and could never recommend Pay As You Go.

A new customer is never asked to understand CLPeasy downloads. The checker asks
about their label-making and works out an approximate usage level from that.

## Questions

Customers see 2 to 4 questions, depending on their answers. They are labelled
"Question N", with no total shown.

1. **How often do you make or update labels?** Always asked.
   - I'm just getting started / not sure yet
   - Now and then, or seasonally (for example, a Christmas range)
   - Most or all months
2. **About how many different CLP labels do you usually need in a month?**
   Only asked for "Most or all months".
   - Helper text: count each fragrance and product type separately.
   - Answers: Up to 10 · 11–20 · More than 20
3. **How do you usually print them?** Only asked for 11–20 or More than 20.
   - Several different labels together on one sheet or file
   - A separate sheet or file for each label
   - Not sure yet
4. **How would you like to pay?** Always asked, last.
   - Only when I need downloads
   - Monthly or annual subscription
   - No preference

Interaction:
- There is no Next button. The chosen answer shows as selected for 250ms, then
  the next applicable question fades in. Repeated clicks are ignored during the
  transition.
- **Back** follows the customer's own path and keeps their earlier answer.
- Changing an earlier answer clears any later answers that no longer apply.
- The result appears only when every question on the path has an answer.
- Answers are buttons, so the keyboard works, and focus moves to each new
  question.
- `prefers-reduced-motion` turns off the fade.

## Usage level (for regular makers)

| Labels a month | Printing | Usage level |
|---|---|---|
| Up to 10 | (not asked) | Low |
| 11–20 or more than 20 | Several labels on one sheet or file | Low (one sheet is one download) |
| 11–20 | Separate, or not sure | Medium |
| More than 20 | Separate | High |
| More than 20 | Not sure | Medium, with a note that Easy Pro may suit |

## Decision rules (evaluated in order)

1. **Pay only when needed** → Pay As You Go, always. Medium or high usage shows
   what a subscription would cost instead.
2. **Prefers a subscription:**
   - Just starting → Easy Start
   - Occasional → Easy Start (Pay As You Go usually costs less)
   - Low usage → Easy Start (Pay As You Go usually costs the same or less)
   - Medium usage → Easy Start
   - High usage → Easy Pro, with the Easy Start + top-up comparison
3. **No preference:**
   - Just starting → Pay As You Go, with the trial highlighted
   - Occasional → Pay As You Go
   - Low usage → Pay As You Go
   - Medium usage → Easy Start
   - High usage → Easy Pro

27 valid paths: Pay As You Go 14, Easy Start 11, Easy Pro 2.

Every result says: "You only use a download when you export a label file.
Printing more copies of a file you've already downloaded is free." Results worked
out from a label count also say this is an estimate, and that reprinting files
already downloaded uses fewer downloads.

Account state (`CLPEntitlement`) changes only the call-to-action, never the
recommendation. Current subscribers whose result is the other subscription plan
are sent to `support.html`. This is a temporary fallback: self-service Stripe
plan switching is unverified and tracked separately in #166.

## Evidence

The screenshots in this folder come from a local server with a mocked Supabase
session.

- Google Fonts were blocked in the test environment, so the headings use fallback
  fonts in the screenshots.
- No checkout, payment or Edge Function request was made during QA.
