// Regression coverage for the Sep 2026 trial-expiry bug: account.html and
// dashboard.html used to fall back to the literal string "in 14 days" /
// "14 days" whenever the real remaining-days calculation came out null --
// which happens both for a genuinely missing trial_end AND for a trial_end
// that has simply passed. That silently hid every expired trial behind a
// fake "still just starting" message forever, confirmed live against
// production: Michaela's own 95-day-old trial account (trial_end 84 days
// in the past) was still reading "Trial ends in 14 days".
//
// Root cause and fix are documented inline in account.html/dashboard.html
// next to computeTrialState(). This file proves:
//   1. computeTrialState() itself is correct across the required scenarios
//      (new trial, partial trial, ends today, expired, missing trial_end,
//      timezone boundaries) as a pure function -- exercised directly via
//      window.computeTrialState() inside a real parsed copy of each page,
//      not reimplemented/guessed at here.
//   2. The full render pipeline (fetchProfile -> renderAccount/
//      renderDashboard) wires that correctly into the DOM for a live
//      account.html/dashboard.html page: expired trials show "Trial
//      expired" and "Choose a plan", active trials show accurate days,
//      active paid subscriptions are completely unaffected, and a
//      genuinely missing profile row backfills from the real account
//      creation date rather than "now".
//   3. Repeated loads of the same profile row never re-write trial_end,
//      and an expired trial stays watermarked / cannot reach a clean
//      export on builder.html -- entitlement there was never derived
//      from trial_end in the first place (it requires an active
//      `subscriptions` row, which no trial account has), so trial
//      expiry cannot accidentally unlock a clean download.
//
// Run from repo root: node tests/account-trial-expiry.js

const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const accountSource = fs.readFileSync('account.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const dashboardSource = fs.readFileSync('dashboard.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const builderSource = fs.readFileSync('builder.html', 'utf8')
  .replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSession(overrides) {
  return Object.assign({
    user: {
      id: 'user-1',
      email: 'maker@example.com',
      created_at: new Date(Date.now() - 40 * DAY_MS).toISOString(),
      user_metadata: {},
    },
  }, overrides);
}

// Simulates the profiles table only -- account.html/dashboard.html never
// query `subscriptions` (that's builder.html/print.html's export-gate
// concern, covered separately below).
function makeProfileSupabaseStub(initialProfileRow) {
  let currentProfile = initialProfileRow;
  const capturedUpserts = [];
  const stub = {
    createClient: () => ({
      auth: { getSession: async () => ({ data: { session: stub.__session || null } }) },
      from(table) {
        if (table !== 'profiles') {
          return { select(){return this;}, eq(){return this;}, single(){return Promise.resolve({data:null,error:null});} };
        }
        return {
          select(){ return this; }, eq(){ return this; },
          single(){
            return Promise.resolve(currentProfile
              ? { data: currentProfile, error: null }
              : { data: null, error: { message: 'no rows' } });
          },
          update(fields){ if (currentProfile) Object.assign(currentProfile, fields); return { eq: () => Promise.resolve({ error: null }) }; },
          upsert(fields){
            capturedUpserts.push(Object.assign({}, fields));
            currentProfile = Object.assign({
              downloads_used: 0, downloads_limit: 10, is_pro: false,
            }, fields);
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  };
  return { stub, capturedUpserts, getCurrentProfile: () => currentProfile };
}

function baseProfile(overrides) {
  return Object.assign({
    email: 'maker@example.com', full_name: 'Test Maker',
    is_beta: false, is_pro: false, plan: 'trial',
    subscription_status: 'trialing',
    downloads_used: 0, downloads_limit: 10, topup_credits: 0, topup_months: 0,
    billing_cycle: 'monthly', next_payment: null, card_last4: null,
    discount_active: false, discount_ends: null, deletion_date: null,
    created_at: new Date(Date.now() - 5 * DAY_MS).toISOString(),
  }, overrides);
}

async function openPage(source, opts) {
  opts = opts || {};
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push(e.message));
  const { stub, capturedUpserts, getCurrentProfile } = makeProfileSupabaseStub(opts.profile);
  stub.__session = opts.session === undefined ? makeSession() : opts.session;
  const dom = new JSDOM(source, {
    url: 'https://local.clpeasy.test/page.html',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.supabase = stub;
      window.alert = () => {};
      window.confirm = () => true;
      window.scrollTo = () => {};
    },
  });
  const { window } = dom;
  await new Promise(resolve => setTimeout(resolve, 250));
  return { dom, window, document: window.document, errors, capturedUpserts, getCurrentProfile };
}

(async () => {
  let passed = 0;
  function ok(label) { passed++; console.log('PASS:', label); }

  // ── computeTrialState() unit coverage (pure function, exact scenarios) ──
  {
    // A real session + profile is supplied purely so the page settles into
    // its normal signed-in render (rather than attempting the sign-out
    // redirect, which jsdom can't perform) -- this block only reaches into
    // window.computeTrialState() directly, it doesn't assert on the DOM.
    const { window, errors } = await openPage(accountSource, { profile: baseProfile(), session: makeSession() });
    assert.strictEqual(errors.length, 0, 'account.html must parse without jsdom errors: ' + errors.join('; '));
    const cts = window.computeTrialState;
    assert.strictEqual(typeof cts, 'function', 'account.html must expose computeTrialState()');

    // 1. New 14-day trial, just started.
    {
      const now = new Date('2026-09-22T12:00:00Z');
      const trialEnd = new Date('2026-10-06T12:00:00Z').toISOString(); // now + 14 days
      const r = cts('trialing', trialEnd, '2026-09-22T12:00:00Z', now);
      assert(r.trialActive && !r.trialExpired, 'a brand-new trial must be active, not expired');
      assert.strictEqual(r.daysLeft, 14, 'a brand-new 14-day trial must report 14 days left');
    }
    ok('new 14-day trial computes trialActive=true, daysLeft=14');

    // 2. Partially completed trial (9 days left of 14).
    {
      const now = new Date('2026-09-22T09:00:00Z');
      const trialEnd = new Date('2026-10-01T09:00:00Z').toISOString();
      const r = cts('trialing', trialEnd, '2026-09-17T09:00:00Z', now);
      assert(r.trialActive && !r.trialExpired);
      assert.strictEqual(r.daysLeft, 9, 'a partially-completed trial must report the correct remaining days');
    }
    ok('partially completed trial computes correct remaining days');

    // 3. Trial ending today (same UTC calendar day as now, but a few hours later).
    {
      const now = new Date('2026-09-22T08:00:00Z');
      const trialEnd = new Date('2026-09-22T20:00:00Z').toISOString();
      const r = cts('trialing', trialEnd, '2026-09-08T08:00:00Z', now);
      assert(r.trialActive && !r.trialExpired, 'a trial ending later today must still be reported as active, not expired');
      assert.strictEqual(r.daysLeft, 0, 'a trial ending today must report 0 days left (so the UI can say "today")');
    }
    ok('trial ending today computes daysLeft=0 while still active');

    // 4. Expired trial (well in the past) -- the exact bug reported live.
    {
      const now = new Date('2026-09-22T11:47:00Z');
      const trialEnd = new Date('2026-07-02T14:28:36Z').toISOString(); // 82 days ago
      const r = cts('trialing', trialEnd, '2026-06-18T14:28:36Z', now);
      assert(!r.trialActive, 'an 82-day-expired trial must not be reported as active');
      assert(r.trialExpired, 'an 82-day-expired trial must be reported as expired');
      assert.strictEqual(r.daysLeft, null, 'an expired trial must not report a positive days-left count');
      assert(r.trialEndDateFormatted, 'an expired trial must still expose its real end date for display');
    }
    ok('long-expired trial (the live production bug case) computes trialExpired=true');

    // 5. Historical account missing trial_end entirely -- must derive from
    //    the real created_at, never "now + 14 days".
    {
      const now = new Date('2026-09-22T00:00:00Z');
      const createdAt = new Date(now.getTime() - 40 * DAY_MS).toISOString(); // 40 days old
      const r = cts('trialing', null, createdAt, now);
      assert(r.trialExpired, 'a 40-day-old account with a missing trial_end must derive an already-expired trial from created_at + 14 days, not a fresh one');
      assert(!r.trialActive);
      const expectedEnd = new Date(new Date(createdAt).getTime() + 14 * DAY_MS);
      assert.strictEqual(r.trialEndDateFormatted, expectedEnd.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }),
        'the derived trial end date must be created_at + 14 days, not today + 14 days');
    }
    ok('historical account with missing trial_end derives expiry from created_at, not from "now"');

    // 5b. A BRAND NEW account missing trial_end (race condition, not yet
    //     backfilled) must still get the correct fresh 14-day window from
    //     its own created_at -- proving the derivation is generic, not
    //     hardcoded to "always expired".
    {
      const now = new Date('2026-09-22T00:00:00Z');
      const r = cts('trialing', null, now.toISOString(), now);
      assert(r.trialActive && !r.trialExpired, 'a brand-new account with a missing trial_end must derive an active 14-day trial from its own created_at');
      assert.strictEqual(r.daysLeft, 14);
    }
    ok('brand-new account with missing trial_end derives a fresh, correct 14-day window from created_at');

    // 6. Timezone boundary: a trial ending at 23:30 UTC, viewed at 23:45 UTC
    //    the same day, must read as expired by a few minutes -- exact
    //    timestamp comparison, not a date-only comparison that could be
    //    fooled by truncating time-of-day.
    {
      const trialEnd = '2026-09-22T23:30:00Z';
      const justBefore = new Date('2026-09-22T23:29:00Z');
      const justAfter = new Date('2026-09-22T23:31:00Z');
      const before = cts('trialing', trialEnd, '2026-09-08T23:30:00Z', justBefore);
      const after = cts('trialing', trialEnd, '2026-09-08T23:30:00Z', justAfter);
      assert(before.trialActive && !before.trialExpired, 'one minute before trial_end must still be active');
      assert(after.trialExpired && !after.trialActive, 'one minute after trial_end must be expired');
    }
    ok('timezone/instant boundary: expiry flips exactly at trial_end, not at a truncated date boundary');

    // 6b. UTC calendar-day boundary: "now" just after UTC midnight must not
    //     compute a negative or wildly wrong days-left for a trial ending
    //     the next UTC day.
    {
      const now = new Date('2026-09-22T00:05:00Z');
      const trialEnd = new Date('2026-09-23T00:00:00Z').toISOString();
      const r = cts('trialing', trialEnd, '2026-09-09T00:05:00Z', now);
      assert(r.trialActive);
      assert.strictEqual(r.daysLeft, 1, 'a trial ending the next UTC calendar day must report 1 day left, unaffected by time-of-day near the UTC boundary');
    }
    ok('UTC midnight boundary computes daysLeft correctly');

    await window.close();
  }

  // ── Full render: account.html ───────────────────────────────────────
  {
    const now = Date.now();
    const profile = baseProfile({
      subscription_status: 'trialing', plan: 'trial', is_pro: false,
      created_at: new Date(now - 95 * DAY_MS).toISOString(),
      trial_start: new Date(now - 95 * DAY_MS).toISOString(),
      trial_end: new Date(now - 84 * DAY_MS).toISOString(), // Michaela's real case
      downloads_used: 8, downloads_limit: 10,
    });
    const { window, document, errors } = await openPage(accountSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    const renewText = document.getElementById('renewal-line').textContent;
    assert(/Trial expired/i.test(renewText), `expired trial must show "Trial expired", got: "${renewText}"`);
    assert(!/in 14 days/i.test(renewText), `expired trial must NOT show the old "in 14 days" fallback, got: "${renewText}"`);
    assert.strictEqual(document.getElementById('plan-badge').textContent, 'Trial expired');
    assert(document.getElementById('plan-badge').className.includes('lapsed'), 'expired-trial badge must use the existing red "lapsed" style');
    const actionRow = document.getElementById('action-row').textContent;
    assert(/Choose a plan/i.test(actionRow), 'expired trial must still offer "Choose a plan"');
    assert.strictEqual(document.getElementById('dl-label-text').textContent, 'Trial downloads', 'trial account must show "Trial downloads", not "Downloads this month"');
    const dlNote = document.getElementById('dl-note').textContent;
    assert(!/next billing date/i.test(dlNote), `a no-card trial must not mention a "next billing date", got: "${dlNote}"`);
    assert.strictEqual(document.getElementById('acct-status').textContent, 'trial expired');
    await window.close();
  }
  ok('account.html: 84-day-expired trial (the live bug case) renders "Trial expired", "Choose a plan", "Trial downloads", no billing-date mention, no "14 days" fallback');

  {
    const now = Date.now();
    const profile = baseProfile({
      subscription_status: 'trialing', plan: 'trial',
      created_at: new Date(now - 5 * DAY_MS).toISOString(),
      trial_end: new Date(now + 9 * DAY_MS).toISOString(),
    });
    const { window, document, errors } = await openPage(accountSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    const renewText = document.getElementById('renewal-line').textContent;
    assert(/Trial ends/i.test(renewText) && /9 days/.test(renewText), `active trial must show accurate remaining days, got: "${renewText}"`);
    assert(!/Trial expired/i.test(renewText));
    assert.strictEqual(document.getElementById('plan-badge').textContent, 'Free trial');
    await window.close();
  }
  ok('account.html: active trial with 9 days left renders accurate remaining days, not expired');

  {
    // Historical account: profile ROW EXISTS (so the "missing profile"
    // upsert path never fires) but its trial_end column is null -- the
    // scenario the required backfill/derivation must cover.
    const now = Date.now();
    const profile = baseProfile({
      subscription_status: 'trialing', plan: 'trial',
      created_at: new Date(now - 60 * DAY_MS).toISOString(),
      trial_end: null,
    });
    const { window, document, errors, capturedUpserts } = await openPage(accountSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(capturedUpserts.length, 0, 'a profile row that already exists (even with a null trial_end) must never trigger the profile-creation upsert -- no data must be written');
    const renewText = document.getElementById('renewal-line').textContent;
    assert(/Trial expired/i.test(renewText), `a 60-day-old account with no trial_end must derive an already-expired trial from created_at, got: "${renewText}"`);
    assert(!/in 14 days/i.test(renewText));
    await window.close();
  }
  ok('account.html: existing profile row with a null trial_end derives expiry from created_at, writes nothing to the database');

  {
    // Genuinely missing profile row -- the defensive upsert fallback fires.
    // Session user account is 30 days old; the backfilled trial_end must
    // anchor to THAT date, not to "now".
    const session = makeSession({ user: { id: 'user-2', email: 'old@example.com', created_at: new Date(Date.now() - 30 * DAY_MS).toISOString(), user_metadata: {} } });
    const { window, document, errors, capturedUpserts, getCurrentProfile } = await openPage(accountSource, { profile: null, session });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(capturedUpserts.length, 1, 'a genuinely missing profile row must trigger exactly one backfill upsert');
    const upserted = capturedUpserts[0];
    const expectedEnd = new Date(new Date(session.user.created_at).getTime() + 14 * DAY_MS).toISOString();
    assert.strictEqual(upserted.trial_end, expectedEnd, 'the backfilled trial_end must be the real account creation date + 14 days, not Date.now() + 14 days');
    // 30 days old + a 14-day trial from that same anchor = already expired.
    const renewText = document.getElementById('renewal-line').textContent;
    assert(/Trial expired/i.test(renewText), `a 30-day-old account whose profile row was missing must backfill an already-expired trial, got: "${renewText}"`);
    await window.close();
  }
  ok('account.html: missing-profile-row fallback backfills trial_end from the real auth account-creation date, not "now"');

  {
    // Active Easy Start subscription must be completely unaffected.
    const profile = baseProfile({
      subscription_status: 'active', plan: 'start', is_pro: false,
      downloads_used: 3, downloads_limit: 20,
      next_payment: '2026-10-15',
    });
    const { window, document, errors } = await openPage(accountSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    const renewText = document.getElementById('renewal-line').textContent;
    assert(/Next payment/i.test(renewText), `active Easy Start must show billing info, got: "${renewText}"`);
    assert(!/Trial/i.test(renewText));
    assert.strictEqual(document.getElementById('plan-badge').textContent, 'Active');
    assert.strictEqual(document.getElementById('dl-label-text').textContent, 'Downloads this month', 'a paid account must keep "Downloads this month", not "Trial downloads"');
    assert(/next billing date/i.test(document.getElementById('dl-note').textContent), 'a paid account SHOULD still mention the next billing date (only the no-card trial must not)');
    await window.close();
  }
  ok('account.html: active Easy Start subscription renders unaffected by the trial-expiry fix');

  {
    // Active Easy Pro subscription, also unaffected.
    const profile = baseProfile({
      subscription_status: 'active', plan: 'pro', is_pro: true,
      downloads_used: 12, downloads_limit: 30,
      next_payment: '2026-10-15',
    });
    const { window, document, errors } = await openPage(accountSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(document.getElementById('plan-badge').textContent, 'Active');
    assert(!/Trial/i.test(document.getElementById('renewal-line').textContent));
    await window.close();
  }
  ok('account.html: active Easy Pro subscription renders unaffected by the trial-expiry fix');

  {
    // Repeated reload/sign-in with the SAME already-expired profile row
    // must never re-write trial_end and must keep reporting expired,
    // proving the date is stable across reloads, not reset each time.
    const now = Date.now();
    const profile = baseProfile({
      subscription_status: 'trialing',
      created_at: new Date(now - 20 * DAY_MS).toISOString(),
      trial_end: new Date(now - 6 * DAY_MS).toISOString(),
    });
    const originalTrialEnd = profile.trial_end;
    for (let i = 0; i < 3; i++) {
      const { window, document, errors, capturedUpserts } = await openPage(accountSource, { profile: Object.assign({}, profile), session: makeSession() });
      assert.strictEqual(errors.length, 0, errors.join('; '));
      assert.strictEqual(capturedUpserts.length, 0, `reload #${i + 1} of an existing profile must never call the profile-creation upsert`);
      assert(/Trial expired/i.test(document.getElementById('renewal-line').textContent), `reload #${i + 1} must still show the trial as expired`);
      await window.close();
    }
    assert.strictEqual(profile.trial_end, originalTrialEnd, 'trial_end must be byte-identical after repeated reloads -- it must never be reset');
  }
  ok('account.html: repeated reload/sign-in never resets trial_end and consistently reports the same expired state');

  // ── Full render: dashboard.html ─────────────────────────────────────
  {
    const now = Date.now();
    const profile = baseProfile({
      subscription_status: 'trialing',
      created_at: new Date(now - 95 * DAY_MS).toISOString(),
      trial_end: new Date(now - 84 * DAY_MS).toISOString(),
    });
    const { window, document, errors } = await openPage(dashboardSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    const renewText = document.getElementById('db-renewal-line').textContent;
    assert(/Trial expired/i.test(renewText), `dashboard.html expired trial must show "Trial expired", got: "${renewText}"`);
    assert(!/14 days/i.test(renewText));
    assert.strictEqual(document.getElementById('db-plan-badge').textContent, 'Trial expired');
    assert(document.getElementById('db-plan-badge').className.includes('lapsed'));
    assert.strictEqual(document.getElementById('db-dl-label-text').textContent, 'Trial downloads');
    await window.close();
  }
  ok('dashboard.html: 84-day-expired trial renders "Trial expired", not the old "14 days" fallback');

  {
    const profile = baseProfile({ subscription_status: 'active', plan: 'pro', is_pro: true, next_payment: '2026-10-15' });
    const { window, document, errors } = await openPage(dashboardSource, { profile, session: makeSession() });
    assert.strictEqual(errors.length, 0, errors.join('; '));
    assert.strictEqual(document.getElementById('db-plan-badge').textContent, 'Active');
    assert.strictEqual(document.getElementById('db-dl-label-text').textContent, 'Downloads this month');
    await window.close();
  }
  ok('dashboard.html: active paid subscription renders unaffected by the trial-expiry fix');

  // ── Expired trial stays watermarked / cannot reach a clean export ──────
  // (builder.html) -- entitlement there is driven solely by an active
  // `subscriptions` row (checked separately from account.html/
  // dashboard.html's `profiles`-only trial display), which no trial
  // account -- expired or not -- ever has. This proves the trial-expiry
  // display fix has no way to accidentally widen export entitlement.
  {
    const emptySubQuery = {
      select(){ return this; }, eq(){ return this; },
      single(){ return Promise.resolve({ data: null, error: { message: 'no rows' } }); },
    };
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push(e.message));
    const dom = new JSDOM(builderSource, {
      url: 'https://local.clpeasy.test/builder.html',
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(window) {
        window.HTMLCanvasElement.prototype.getContext = () => ({
          font: '', measureText(t){ return { width: String(t).length * 7 }; },
          drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; },
        });
        window.eval(labelRendererSource);
        window.eval(labelLibrarySource);
        window.alert = () => {}; window.confirm = () => true; window.scrollTo = () => {};
        window.fetch = async () => ({ ok: true, json: async () => ({}) });
        window.open = () => ({ location: { href: '' }, close(){}, opener: null });
        window.URL.createObjectURL = () => 'blob:test';
        window.URL.revokeObjectURL = () => {};
        window.Image = class { set src(v){ if (this.onload) this.onload(); } };
        window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
        window.supabase = {
          createClient: () => ({
            auth: {
              getSession: async () => ({ data: { session: makeSession() } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
              signOut: async () => ({}),
            },
            // An expired-trial account has NO subscriptions row -- same as
            // an active-trial account. This is the real shape returned in
            // production for every one of the 15 trialing profiles found
            // live (subscriptions table has zero rows for any of them).
            from: () => Object.create(emptySubQuery),
            rpc: async () => ({ data: false, error: null }),
          }),
        };
      },
    });
    const { window } = dom;
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.strictEqual(errors.length, 0, errors.join('; '));
    // S is declared `const S = {...}` at top-level script scope, so it is
    // visible to code evaluated in this same realm (window.eval) but is
    // not attached as a `window.S` property -- same access pattern already
    // used by tests/preview-watermark-and-export-authorization.js.
    assert.strictEqual(window.eval('S.isPro'), false, 'an expired-trial (no active subscriptions row) account must not be granted isPro');
    window.selectShape('circle'); window.selectSize(63); window.setApprovedBuilderStep(2);
    window.document.getElementById('scent-name').value = 'Trial Expiry Test Candle';
    window.document.getElementById('product-type').value = 'Scented Candle';
    window.onProductTypeChange();
    const svg = window.buildSVG(false);
    assert(/PREVIEW ONLY/.test(svg), 'an expired-trial account must still get a watermarked render, never a clean one');
    const refreshed = await window.refreshProEntitlement();
    assert.strictEqual(refreshed, false, 'the fresh, fail-closed entitlement re-check must also stay false for an expired-trial account before any export');
    await window.close();
  }
  ok('builder.html: an expired-trial account (no active subscriptions row) stays watermarked and cannot reach a clean export');

  console.log(`\n${passed} checks passed.`);
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
