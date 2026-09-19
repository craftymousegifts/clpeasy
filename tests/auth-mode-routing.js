// Regression coverage for the Sep 2026 auth-page mode-routing fix: loading
// auth.html?mode=signup must show the "Create account" state (heading,
// subheading, selected tab) on the INITIAL page load, not only when
// switchTab() is called manually afterwards.
//
// Root cause this guards against: the script used to read ?mode and call
// switchTab(defaultTab) as its very LAST statement, after
// `const { createClient } = supabase`. If the Supabase CDN script failed to
// load (blocked, slow, ad-blocker, flaky network) that line threw, which
// aborted the rest of the script -- including the tab selection -- and the
// page silently stayed on the hard-coded "Welcome back" / sign-in markup
// regardless of ?mode=signup. This test proves the fix holds even when
// Supabase never loads at all (jsdom does not fetch external <script src>
// without `resources: "usable"`, so `supabase` is genuinely undefined here --
// the same failure condition, not a simulation of it), and separately proves
// nothing regressed when Supabase IS available.
//
// Run from the repo root: node tests/auth-mode-routing.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const SIGNUP_SUB = 'Start creating print-ready GB CLP labels';
const OLD_SIGNUP_SUB = 'Start generating compliant CLP labels';

try {
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'auth.html'), 'utf8');

  // ── Source-level checks ──────────────────────────────────────────
  assert(authSource.includes(SIGNUP_SUB), `auth.html must contain the exact registration subtitle "${SIGNUP_SUB}"`);
  assert(!authSource.includes(OLD_SIGNUP_SUB), `auth.html must not contain the old registration subtitle "${OLD_SIGNUP_SUB}"`);
  assert(!/compliant CLP labels|fully compliant|guaranteed compliant|compliance assured/i.test(authSource),
    'auth.html must not introduce a "compliant labels" style claim as an alternative');

  // The mode-detecting switchTab(defaultTab) call must run BEFORE the
  // Supabase client is constructed, not after -- that ordering is the fix
  // itself, so a future edit that puts it back at the end must fail here.
  const switchTabCallIdx = authSource.indexOf('switchTab(defaultTab)');
  // Matches only the real statement (trailing `;`, no surrounding backtick) --
  // not this file's own explanatory comment, which mentions the same phrase
  // wrapped in backticks with no trailing semicolon right after `supabase`.
  const createClientIdx = authSource.indexOf('const { createClient } = supabase;');
  assert(switchTabCallIdx !== -1, 'auth.html must call switchTab(defaultTab) to select the initial tab from the URL');
  assert(createClientIdx !== -1, 'auth.html must construct the Supabase client via createClient(...)');
  assert(switchTabCallIdx < createClientIdx,
    'switchTab(defaultTab) must run BEFORE `const { createClient } = supabase` so the initial tab/heading/subheading do not depend on the Supabase CDN script loading successfully');
  // Guard against a stray duplicate of the old bottom-of-script call/consts.
  const switchTabCallCount = (authSource.match(/switchTab\(defaultTab\)/g) || []).length;
  assert.strictEqual(switchTabCallCount, 1, `expected exactly one switchTab(defaultTab) call, found ${switchTabCallCount}`);

  // ── Runtime checks (real page load, real DOM, no manual switchTab() calls) ──
  const { VirtualConsole } = require('jsdom');
  function loadAuthPage(url) {
    // Expect (and quietly swallow) exactly the "supabase is not defined"
    // ReferenceError this test is designed to provoke: jsdom does not fetch
    // the external Supabase <script src="...jsdelivr..."> without
    // resources:"usable", so `const { createClient } = supabase;` throws --
    // the same real-world failure condition as a blocked/slow/ad-blocked
    // CDN. A silent virtual console keeps that expected, already-asserted-
    // against error out of the test's own output.
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(authSource, {
      url,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
    });
    return dom.window.document;
  }

  function readState(doc) {
    return {
      heading: doc.getElementById('auth-title').textContent,
      sub: doc.getElementById('auth-sub').textContent,
      signinActive: doc.getElementById('tab-signin').classList.contains('active'),
      signupActive: doc.getElementById('tab-signup').classList.contains('active'),
      submitText: doc.getElementById('submit-btn').textContent,
    };
  }

  // 1. ?mode=signup with Supabase UNAVAILABLE (the real failure condition).
  {
    const doc = loadAuthPage('http://localhost/auth.html?mode=signup');
    const s = readState(doc);
    assert.strictEqual(s.heading, 'Create your account', `mode=signup: expected heading "Create your account", got "${s.heading}"`);
    assert.strictEqual(s.sub, SIGNUP_SUB, `mode=signup: expected subheading "${SIGNUP_SUB}", got "${s.sub}"`);
    assert.strictEqual(s.signupActive, true, 'mode=signup: Create account tab must be selected');
    assert.strictEqual(s.signinActive, false, 'mode=signup: Sign in tab must not be selected');
    assert.strictEqual(s.submitText, 'Create account', 'mode=signup: submit button must read "Create account"');
  }

  // 2. ?mode=signin with Supabase unavailable.
  {
    const doc = loadAuthPage('http://localhost/auth.html?mode=signin');
    const s = readState(doc);
    assert.strictEqual(s.heading, 'Welcome back', `mode=signin: expected heading "Welcome back", got "${s.heading}"`);
    assert.strictEqual(s.sub, 'Sign in to your CLPeasy account', `mode=signin: unexpected subheading "${s.sub}"`);
    assert.strictEqual(s.signinActive, true, 'mode=signin: Sign in tab must be selected');
    assert.strictEqual(s.signupActive, false, 'mode=signin: Create account tab must not be selected');
  }

  // 3. No mode param at all -- must default to Sign in, never signup.
  {
    const doc = loadAuthPage('http://localhost/auth.html');
    const s = readState(doc);
    assert.strictEqual(s.heading, 'Welcome back', `no mode: expected heading "Welcome back", got "${s.heading}"`);
    assert.strictEqual(s.signinActive, true, 'no mode: Sign in tab must be selected by default');
    assert.strictEqual(s.signupActive, false, 'no mode: Create account tab must not default to selected');
  }

  console.log('auth-mode-routing checks passed (mode=signup / mode=signin / no-mode all resolve correctly on initial load, independent of Supabase CDN availability)');
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
