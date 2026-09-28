# Pricing page: signed-in CTAs — evidence

Screenshots from `node tests/pricing-signed-in-cta.js`: real pricing.html in Chromium, with supabase-js stubbed. Desktop is 1366×900; iPhone is 390×844.

| File | Shows |
|---|---|
| `signed-out-desktop.png`, `signed-out-mobile.png` | Signed out: unchanged "Start free trial" CTAs |
| `signed-in-desktop.png`, `signed-in-mobile.png` | Signed in: header CTA "My account" (account.html) |
| `signed-in-mobile-trial-card.png` | Signed in: Easy Trial card button "Go to builder →" (builder.html) |

**The rule.** This is the rule index.html already applies, and knowledge.html applies in its header. For every signed-in account state, the header CTA becomes "My account" and the other trial CTAs become "Go to builder →". Signed-out visitors keep the acquisition CTAs.

**No flash.** While a stored session (`sb-qvkosdqcryrcfbjtaxic-auth-token`) is being confirmed, the trial CTAs stay hidden.
