# DRAFT customer notice: supplier document check (not sent, not published)

**Status:** draft for owner review. Use it only when the supplier-document check is approved for
release. Before sending:
- choose **version A or B** of the written-confirmation section (it depends on the
  `SUPPLIER_CONFIRMATION_ACCEPTED` decision);
- have the "What the law requires" section confirmed against the primary sources (see
  `PRIMARY-SOURCE-CHECKLIST.md`).
  - Official HSE and Business Companion guidance now partially supports it: mixture
    classification, formulation-specific assessment, and variable thresholds.
  - The legislation text has not been checked, so treat the section as supported by guidance, not
    fully verified.

Suggested channels:
- an email to existing customers (the full text below);
- a short in-app banner on the Builder, My Labels and the Composer (the "Banner" text below).

---

## Email

**Subject:** One quick check before your next label download

Hi [first name],

We've added a new step to CLPeasy to help make sure the hazard information on your labels comes
from supplier information that fits your actual product.

### What's changing
When you make a label, Step 3 (Hazards) now asks a short question about your supplier document:
- **what it describes** (your finished product, or just the fragrance oil);
- **the fragrance percentage it states;**
- **which type of product it is for.**

This takes about a minute.

### What this means for labels you've already saved
- **Your saved designs are safe.** Nothing about them has been changed or deleted, and all your
  fine-tune settings are kept.
- **They're marked as drafts** until you've done the new check once. You'll see "Draft: document
  check needed" in My Labels.
- **Drafts can still be opened, edited and saved.** They can't be downloaded or printed (including
  from the Print Sheet Composer) until the check is complete.

**To get a saved label ready again:**
1. Open the label from My Labels.
2. Click **Go to Step 3 (Hazards)** and answer **Check your supplier document first**.
3. Continue to Step 5 and save.

That's it. The label is ready to download, and you can add it to your print sheets as before.

### What the law requires (and what it doesn't say)
- In Great Britain, the business placing a candle, wax melt, diffuser or similar product on the
  market is responsible for classifying it and labelling it correctly under GB CLP. That's you, as
  the maker.
- These products count as "mixtures". Their hazards depend on how much of each ingredient is in the
  finished product.
- Hazards don't scale in simple proportion. Some warnings appear or change when an ingredient goes
  above or below a set level. For example, an allergy warning can change from "May cause an
  allergic skin reaction" to "Contains [substance]. May produce an allergic reaction".
- That's why the fragrance percentage you use matters, and why an SDS for the fragrance oil on its
  own (100%) doesn't describe your finished product.

### CLPeasy's own rule (stricter than a simple calculation)
These are CLPeasy's rules for what we'll use to build a label. We set them to be careful; they are
not a quote from the law.
- **The supplier information must be for your type of product at the exact percentage you use.**
  For example, a candle document at 10% for a candle at 10%.
- **A document for a different percentage isn't used,** even a higher one. We don't assume a 10%
  document covers your 8% candle, because the warnings can change at different levels.
- **We don't round.** If you use 9.0909% (for example 20 g of fragrance in 220 g total) and the
  document says 9.1%, CLPeasy treats those as different. Whether the document applies is for your
  supplier to say, not CLPeasy.
- **Candles and wax melts are separate.** A candle document is only used for a wax melt if the
  supplier document names both.
- **A range or "up to" figure isn't used on its own.** CLPeasy doesn't decide whether "8–10%" or
  "up to 10%" covers your product.

**What to do if your document doesn't match:** ask your fragrance supplier for GB CLP information
for your product at the exact percentage you use. Most suppliers can provide this.

### Written confirmation from your supplier

> **Use version A if written confirmations are accepted at release
> (`SUPPLIER_CONFIRMATION_ACCEPTED = true`). Use version B if not.**

**Version A (accepted):**

If your supplier confirms in writing (for example by email) that their GB CLP information applies
to your product at your exact percentage, you can record that in Step 3. Choose **"My supplier has
confirmed in writing…"** and enter:
- the percentage they confirmed;
- the product;
- who confirmed it and the date;
- which supplier document it refers to.

Keep that email or letter with your records. CLPeasy can't see or check it, so it's your evidence,
not ours.

The confirmation needs to name your exact percentage and your type of product. A general "up to"
statement isn't enough.

**Version B (not accepted yet):**

At the moment CLPeasy can only use supplier information that states your exact percentage for your
type of product. If your supplier sends a written confirmation instead, please ask them for GB CLP
information that states your percentage. We're reviewing whether we can accept written
confirmations in future.

### Important
CLPeasy helps you organise and format your supplier's information. It can't read your documents,
and it doesn't provide legal advice or classify your product for you. You remain responsible for
checking your finished label against your supplier's current information before you sell your
products.

If you have any questions, just reply to this email or contact us via [support link].

Thanks,
Michaela
CLPeasy

---

## Banner (in-app, short)

> **New: a one-minute supplier document check.** Labels saved before [date] are kept as drafts
> until you complete "Check your supplier document first" in Step 3. Your designs and settings are
> unchanged. [How it works]

---

## Notes for the owner (not for customers)
- **Not legally verified.** The "What the law requires" section is based on secondary sources;
  this environment could not open the primary texts. Confirm it against the checklist before
  sending, or have it reviewed.
- **The 8% / 10% example** in "CLPeasy's own rule" reflects owner decision 1 (keep the block). It
  is CLPeasy policy, not a statement that the law forbids using a higher-% document.
- **Range coverage is still undecided.** The email says CLPeasy doesn't decide range coverage
  itself. It does not promise a future change.
- **Avoid claims the evidence doesn't support.** Don't add wording such as "this makes your label
  compliant" or "this verifies your supplier document"; the check only records consistent answers.
- **Before sending:** fill in [first name], [date], [support link] and [How it works].
