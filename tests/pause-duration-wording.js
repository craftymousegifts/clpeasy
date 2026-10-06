// Regression coverage for the pause wording (6 Oct 2026, Brevo remediation).
// manage-subscription pauses with Stripe pause_collection
// { behavior: 'mark_uncollectible' } and no resumes_at, so a pause has no
// fixed length: it continues until the customer reactivates from the Account
// page. account.html and pricing.html used to say pauses last "up to 3
// months", which the code does not support. The same statement is in the
// approved Brevo pause confirmation (template 7).
// Run from repo root: node tests/pause-duration-wording.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Customer-facing pages that describe pausing.
const pages = ['account.html', 'pricing.html', 'faq.html', 'knowledge.html', 'terms.html', 'refund.html', 'index.html', 'dashboard.html'];
const unsupported = [
  /pauses? (?:can )?last up to/i,
  /pause for up to/i,
  /up to (?:3|three) months? (?:at a time|of pause|pause)/i,
  /pause[^.<]{0,80}(?:remind|heads-up|resumes? automatically|automatically (?:resume|restart))/i,
];
for (const page of pages) {
  if (!fs.existsSync(page)) continue;
  const html = fs.readFileSync(page, 'utf8');
  for (const re of unsupported) {
    assert(!re.test(html), `${page} must not state a fixed pause length or an unsupported pause reminder/auto-restart (${re})`);
  }
}

// The current approved wording.
const account = fs.readFileSync('account.html', 'utf8');
assert(account.includes('Downloads are paused · You can reactivate any time · Your pause continues until you reactivate'),
  'account.html pause modal must say the pause continues until the customer reactivates');
const pricing = fs.readFileSync('pricing.html', 'utf8');
assert(pricing.includes('Your pause continues until you reactivate, which you can do any time from your account page.'),
  'pricing.html pause FAQ must say the pause continues until the customer reactivates');

// The implementation the wording describes: no fixed resume date.
const manage = fs.readFileSync(path.join('supabase', 'functions', 'manage-subscription', 'index.ts'), 'utf8');
assert(manage.includes("pause_collection: { behavior: 'mark_uncollectible' }") || /pause_collection:\s*\{\s*behavior:\s*'mark_uncollectible'\s*,?\s*\}/.test(manage),
  'manage-subscription must pause with mark_uncollectible');
assert(!/resumes_at/.test(manage), 'manage-subscription sets no resumes_at; if a fixed pause length is added, update the customer wording and template 7');

// Saved Brevo pause confirmation (template 7) matches.
const t7 = fs.readFileSync(path.join('docs', 'brevo', 'templates', '07-pause-confirmation.html'), 'utf8');
assert(t7.includes('Your pause continues until you reactivate. You can reactivate any time from your account page'),
  'template 7 copy must say the pause continues until reactivation');
assert(!/3 months|three months|remind/i.test(t7), 'template 7 copy must not promise a pause length or a reminder');

console.log('pause-duration-wording checks passed');
