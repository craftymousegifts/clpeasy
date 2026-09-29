const fs = require('fs');
const assert = require('assert');

const read = name => fs.readFileSync(name, 'utf8');
const pricing = read('pricing.html');
const knowledge = read('knowledge.html');
const auth = read('auth.html');
const faq = read('faq.html');
const compliance = read('compliance.html');

// Pricing: native FAQ buttons expose state and compensate only for layout shift.
assert(/class="faq-trigger" aria-expanded="false"/.test(pricing));
assert(/selectedTop = btn\.getBoundingClientRect\(\)\.top/.test(pricing));
assert(/window\.scrollBy\(0, delta\)/.test(pricing));
assert(!/function toggleFAQ[\s\S]{0,1400}scrollIntoView/.test(pricing));

// Knowledge Base: retain one-open-at-a-time, remove accordion smooth scrolling,
// preserve the chosen trigger, and respect reduced motion for section navigation.
assert(/class="accordion-trigger" aria-expanded="false"/.test(knowledge));
assert(/selectedTop = btn\.getBoundingClientRect\(\)\.top/.test(knowledge));
assert(/window\.scrollBy\(0, delta\)/.test(knowledge));
assert(!/btn\.scrollIntoView\(\{ behavior: 'smooth'/.test(knowledge));
assert(/prefers-reduced-motion: reduce/.test(knowledge));
assert(/behavior: window\.matchMedia/.test(knowledge));
assert(!/section\.scrollIntoView\(/.test(knowledge), 'Knowledge topic navigation must not force the selected section to the document edge');
assert(/const targetTop = Math\.max\(0, window\.scrollY \+ rect\.top - topOffset\)/.test(knowledge), 'Knowledge topic navigation must calculate a visible landing position below fixed UI');
assert(/window\.scrollTo\(\{[\s\S]{0,160}top: targetTop/.test(knowledge), 'Knowledge topic navigation must scroll to its calculated landing position');
assert(/id="back-to-top"/.test(knowledge), 'Knowledge Base missing Back to top control');
assert(/window\.scrollY > 600/.test(knowledge), 'Back to top visibility threshold missing');
assert(/window\.scrollTo\(\{ top: 0, behavior: window\.matchMedia/.test(knowledge), 'Back to top reduced-motion-aware scroll missing');
assert(/product-safety\/candles-diffusers-oil-heaters-etc/.test(knowledge), 'Current Business Companion candles/diffusers link missing');
assert(!/good-practice\/candles-diffusers-oil-heaters-and-incense/.test(knowledge), 'Obsolete Business Companion URL still present');

// Sign-in: Forgot password is an action, not meaningless hash navigation.
assert(!/<a href="#" onclick="resetPassword\(\)">Forgot password\?<\/a>/.test(auth));
assert(/<button type="button" onclick="resetPassword\(\)">Forgot password\?<\/button>/.test(auth));

// FAQ: native buttons are keyboard-operable and expose expanded state.
assert(!/<div class="faq-q" onclick=/.test(faq));
assert(/<button type="button" class="faq-q" aria-expanded="false" onclick="toggle\(this\)">/.test(faq));
assert(/setAttribute\('aria-expanded', String\(opening\)\)/.test(faq));
assert(/\.faq-q:focus-visible/.test(faq));

// Relevant marketing pages provide a reduced-motion override.
for (const [name, source] of Object.entries({pricing, knowledge, auth, faq, compliance})) {
  assert(/@media \(prefers-reduced-motion: reduce\)/.test(source), name + ' missing reduced-motion CSS');
  assert(/scroll-behavior: auto !important/.test(source), name + ' missing reduced-motion scroll override');
}


const backToTop = read('back-to-top.js');
const backToTopPages = [
  'index.html', 'pricing.html', 'faq.html', 'compliance.html', 'privacy.html',
  'terms.html', 'refund.html', 'cookie-policy.html', 'support.html', 'showcase.html'
];

for (const name of backToTopPages) {
  assert(/<script src="back-to-top\.js"><\/script>/.test(read(name)), name + ' missing shared Back to top control');
}
assert(/window\.scrollY > 600/.test(backToTop), 'shared Back to top visibility threshold missing');
assert(/prefers-reduced-motion: reduce/.test(backToTop), 'shared Back to top must respect reduced motion');
assert(/window\.scrollTo\(\{/.test(backToTop) && /top: 0/.test(backToTop), 'shared Back to top action missing');
assert(/html\{scroll-behavior:auto!important\}/.test(backToTop), 'shared Back to top reduced-motion CSS override missing');
assert(/cookieBanner\.getBoundingClientRect\(\)\.height \+ 16/.test(backToTop), 'shared Back to top must clear a visible cookie banner');

const cookiePolicy = read('cookie-policy.html');
assert(/table-layout:fixed/.test(cookiePolicy), 'Cookie Policy table must stay within the mobile content width');
assert(/overflow-wrap:anywhere/.test(cookiePolicy), 'Cookie Policy table cells must wrap long values');

// Workflow pages deliberately remain untouched by the site-wide informational-page control.
for (const name of ['builder.html', 'print.html', 'checkout.html', 'plan-picker.html']) {
  assert(!/back-to-top\.js/.test(read(name)), name + ' should not gain the generic Back to top control');
}

for (const name of backToTopPages) {
  assert(!read(name).includes('\\n</body>'), name + ' contains a literal \\n before </body>');
}

console.log('site scroll/accessibility regression checks: PASS');
