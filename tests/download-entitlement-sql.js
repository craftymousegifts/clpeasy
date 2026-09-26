// Executes the real download-accounting migrations against a throwaway LOCAL
// PostgreSQL database (never Supabase) and checks consume_download() for
// every subscription lifecycle state, trial, and Pay As You Go combination.
//
// Needs a local PostgreSQL + psql. If none is available the test prints SKIP
// and exits 0, so it never blocks machines without PostgreSQL.
//   node tests/download-entitlement-sql.js
// Optional: CLP_PSQL="runuser -u postgres -- psql" (default auto-detected).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const E = require('../entitlement.js');

const ROOT = path.join(__dirname, '..');
const DB = 'clpeasy_entitlement_test';

function detectPsql(){
  const candidates = [process.env.CLP_PSQL, 'psql', 'runuser -u postgres -- psql'].filter(Boolean);
  for (const c of candidates){
    try { execSync(`${c} -X -At -d postgres -c "select 1"`, { stdio:['ignore','pipe','ignore'] }); return c; } catch(e){}
  }
  return null;
}
const PSQL = detectPsql();
if (!PSQL){ console.log('SKIP download-entitlement-sql: no local PostgreSQL available'); process.exit(0); }

function run(sql, db){
  const r = spawnSync('sh', ['-c', `${PSQL} -X -At -q -v ON_ERROR_STOP=1 -d ${db||DB}`], { input: sql, encoding:'utf8' });
  if (r.status !== 0) throw new Error((r.stderr||'').trim() || 'psql failed');
  return r.stdout.trim();
}

function freshDb(migrations){
  run(`drop database if exists ${DB};`, 'postgres');
  run(`create database ${DB};`, 'postgres');
  run(fs.readFileSync(path.join(__dirname,'sql','supabase-shim.sql'),'utf8'));
  for (const m of migrations) run(fs.readFileSync(path.join(ROOT,'supabase','migrations',m),'utf8'));
}

let n = 0;
function uid(){ n++; return `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`; }
const DAY = 86400000;
const iso = ms => new Date(Date.now()+ms).toISOString();
const q = v => v===null||v===undefined ? 'null' : typeof v==='number' ? String(v) : `'${String(v).replace(/'/g,"''")}'`;

function makeUser(p){
  const id = uid();
  run(`insert into auth.users(id) values(${q(id)});
       insert into public.profiles(id,plan,is_pro,subscription_status,trial_end,deletion_date,downloads_used,downloads_limit,topup_credits,billing_cycle,downloads_reset_date)
       values(${q(id)},${q(p.plan)},${p.is_pro?'true':'false'},${q(p.subscription_status)},${q(p.trial_end)},${q(p.deletion_date)},${q(p.downloads_used||0)},${q(p.downloads_limit)},${q(p.topup_credits||0)},${q(p.billing_cycle)},${q(p.downloads_reset_date)});`);
  return id;
}
function consumeAs(id, key, role){
  const out = run(`begin;
    set local role ${role||'authenticated'};
    select set_config('request.jwt.claim.sub', ${q(id)}, true);
    select set_config('request.jwt.claim.role', ${q(role||'authenticated')}, true);
    select public.consume_download(${key==null?'null':q(key)})::text;
    commit;`);
  return JSON.parse(out.split('\n').filter(Boolean).pop());
}
function profile(id){
  return JSON.parse(run(`select row_to_json(p)::text from public.profiles p where id=${q(id)};`));
}

// Profiles for every lifecycle state the webhook can produce.
const STATES = {
  active:               { plan:'easy_start', subscription_status:'active', downloads_limit:20, downloads_used:3 },
  activeAtLimit:        { plan:'easy_start', subscription_status:'active', downloads_limit:20, downloads_used:20 },
  cancelScheduled:      { plan:'easy_pro', is_pro:true, subscription_status:'cancelled', deletion_date:iso(10*DAY), downloads_limit:30, downloads_used:4 },
  cancelScheduledNoDate:{ plan:'easy_pro', is_pro:true, subscription_status:'cancelled', deletion_date:null, downloads_limit:30, downloads_used:4 },
  cancelPeriodPassed:   { plan:'easy_pro', is_pro:true, subscription_status:'cancelled', deletion_date:iso(-1*DAY), downloads_limit:30, downloads_used:4 },
  cancelledEnded:       { plan:'free', subscription_status:'cancelled', downloads_limit:0, downloads_used:4 },
  paused:               { plan:'easy_start', subscription_status:'paused', downloads_limit:20, downloads_used:1 },
  pastDue:              { plan:'easy_start', subscription_status:'past_due', downloads_limit:20, downloads_used:1 },
  trialLive:            { plan:'free', subscription_status:'trialing', trial_end:iso(5*DAY), downloads_limit:10, downloads_used:2 },
  trialExpired:         { plan:'free', subscription_status:'trialing', trial_end:iso(-1*DAY), downloads_limit:10, downloads_used:2 },
  paygAccount:          { plan:'payg', subscription_status:'payg', trial_end:iso(-1*DAY), downloads_limit:0, downloads_used:2 },
};

// Expected result of ONE new-label export, with and without PAYG downloads.
// [source, clean] or null for blocked.
const EXPECT = {
  active:                [['plan',true],      ['plan',true]],
  activeAtLimit:         [null,               ['purchased',true]],
  cancelScheduled:       [['plan',true],      ['plan',true]],
  cancelScheduledNoDate: [['plan',true],      ['plan',true]],
  cancelPeriodPassed:    [null,               ['purchased',true]],
  cancelledEnded:        [null,               ['purchased',true]],
  paused:                [null,               ['purchased',true]],
  pastDue:               [null,               ['purchased',true]],
  trialLive:             [['plan',false],     ['purchased',true]],
  trialExpired:          [null,               ['purchased',true]],
  paygAccount:           [null,               ['purchased',true]],
};

const MIGRATIONS = ['20260729000000_create_label_downloads.sql','20260925000000_atomic_download_accounting.sql','20260926000000_download_entitlement_lifecycle.sql','20260927000000_payg_trial_conversion_and_annual_refill.sql','20260928000000_protect_download_counters.sql','20260929000000_redownload_upgrade_and_fixed_window.sql'];
freshDb(MIGRATIONS);

let checks = 0;
for (const [name, base] of Object.entries(STATES)){
  for (const [i, credits] of [0, 3].entries()){
    const p = Object.assign({}, base, { topup_credits: credits });
    const id = makeUser(p);
    const before = profile(id);
    const r = consumeAs(id, null);
    const after = profile(id);
    const exp = EXPECT[name][i];
    const label = `${name} + ${credits} purchased`;
    if (!exp){
      assert.strictEqual(r.ok, false, `${label}: must be blocked`);
      assert.strictEqual(r.reason, 'no_downloads_remaining', `${label}: block reason`);
      assert.deepStrictEqual([after.downloads_used, after.topup_credits], [before.downloads_used, before.topup_credits], `${label}: blocked export must not change balances`);
    } else {
      assert.strictEqual(r.ok, true, `${label}: must be allowed`);
      assert.strictEqual(r.source, exp[0], `${label}: source`);
      assert.strictEqual(r.clean_export, exp[1], `${label}: clean_export`);
      if (exp[0]==='plan'){
        assert.strictEqual(after.downloads_used, before.downloads_used+1, `${label}: plan download counted once`);
        assert.strictEqual(after.topup_credits, before.topup_credits, `${label}: purchased untouched`);
      } else {
        assert.strictEqual(after.topup_credits, before.topup_credits-1, `${label}: purchased decremented once`);
        assert.strictEqual(after.downloads_used, before.downloads_used, `${label}: plan untouched`);
      }
    }
    // The browser mirror must agree with the database for the same profile.
    const s = E.summarise(p);
    assert.strictEqual(s.nextSource, exp ? exp[0] : null, `${label}: entitlement.js nextSource must match consume_download`);
    assert.strictEqual(s.nextClean, exp ? exp[1] : false, `${label}: entitlement.js nextClean must match consume_download`);
    checks += 2;
  }
}

// Same-label 7-day grace keeps the ORIGINAL export's entitlement, including
// after the final PAYG download (balance 1 -> 0).
{
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(-2*DAY), downloads_limit:10, downloads_used:10, topup_credits:1 });
  const first = consumeAs(id, 'lavender::scented candle');
  assert.deepStrictEqual([first.ok, first.source, first.clean_export, first.purchased_downloads], [true,'purchased',true,0], 'final PAYG download consumes and is clean');
  const again = consumeAs(id, 'lavender::scented candle');
  assert.deepStrictEqual([again.ok, again.consumed, again.free_redownload, again.clean_export], [true,false,true,true], 'same-label re-download at zero is free and stays clean');
  const other = consumeAs(id, 'vanilla::wax melt');
  assert.strictEqual(other.ok, false, 'a new label at zero is blocked');
  const sheet = consumeAs(id, null);
  assert.strictEqual(sheet.ok, false, 'a Composer sheet (no label key) at zero is blocked');
  checks += 4;
}
function creditPayg(id, n){
  const out = run(`begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); select public.credit_payg_purchase(${q(id)}, ${n})::text; commit;`);
  return JSON.parse(out.split('\n').filter(l=>l.startsWith('{')).pop());
}
// ── Owner decision C1 (20260929000000): same-label re-download rules ─────
function ageLabel(id, key, days){
  run(`update public.label_downloads set last_downloaded_at = now() - interval '${days} days' where user_id=${q(id)} and label_key=${q(key)};`);
}
function labelRow(id, key){
  return JSON.parse(run(`select row_to_json(l)::text from public.label_downloads l where user_id=${q(id)} and label_key=${q(key)};`));
}
// 1. Watermarked (trial) download, then the customer buys downloads: the
//    re-download is charged once and clean; later re-downloads are free+clean.
{
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(3*DAY), downloads_limit:10, downloads_used:0, topup_credits:0 });
  const key = 'rose::scented candle::circle::52x52mm';
  const first = consumeAs(id, key);
  assert.deepStrictEqual([first.source, first.clean_export], ['plan', false], 'C1: trial download is watermarked');
  // Still on the trial with no clean option: the re-download stays free and watermarked.
  const trialAgain = consumeAs(id, key);
  assert.deepStrictEqual([trialAgain.free_redownload, trialAgain.clean_export, profile(id).downloads_used], [true, false, 1], 'C1: without a clean option the watermarked re-download stays free and never spends another trial download');
  creditPayg(id, 8);
  const upgraded = consumeAs(id, key);
  assert.deepStrictEqual([upgraded.consumed, upgraded.free_redownload, upgraded.source, upgraded.clean_export, upgraded.purchased_downloads], [true, false, 'purchased', true, 7], 'C1: after buying PAYG the watermarked label is charged once and delivered clean');
  const cleanAgain = consumeAs(id, key);
  assert.deepStrictEqual([cleanAgain.free_redownload, cleanAgain.clean_export, cleanAgain.purchased_downloads], [true, true, 7], 'C1: the resulting clean download then re-downloads free and clean');
  checks += 4;
}
// 1b. Same, but the upgrade is a subscription (active Easy Start with allowance).
{
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(3*DAY), downloads_limit:10, downloads_used:0, topup_credits:0 });
  const key = 'fig::soy candle::circle::52x52mm';
  consumeAs(id, key);
  run(`select set_config('request.jwt.claim.role','service_role',false); update public.profiles set plan='easy_start', subscription_status='active', downloads_limit=20, downloads_used=0 where id=${q(id)};`);
  const up = consumeAs(id, key);
  assert.deepStrictEqual([up.consumed, up.source, up.clean_export, up.downloads_used], [true, 'plan', true, 1], 'C1: after subscribing the watermarked label is charged once from the plan and delivered clean');
  checks += 1;
}
// 2. The 7 days are FIXED from the charged download.
{
  const id = makeUser({ plan:'payg', subscription_status:'payg', trial_end:iso(-1*DAY), downloads_limit:0, downloads_used:0, topup_credits:5 });
  const key = 'amber::wax melt::square::40x40mm';
  const first = consumeAs(id, key);
  assert.strictEqual(first.purchased_downloads, 4, 'C1 fixed window: first download charged 5 -> 4');
  const chargedAt = labelRow(id, key).last_downloaded_at;
  ageLabel(id, key, 6);
  const day6 = consumeAs(id, key);
  assert.deepStrictEqual([day6.free_redownload, day6.purchased_downloads], [true, 4], 'C1 fixed window: day 6 re-download is free');
  const row6 = labelRow(id, key);
  assert(new Date(row6.last_downloaded_at).getTime() < new Date(chargedAt).getTime() - 5*DAY, 'C1 fixed window: a free re-download does not move the charged-download time');
  ageLabel(id, key, 8);
  const day8 = consumeAs(id, key);
  assert.deepStrictEqual([day8.consumed, day8.purchased_downloads], [true, 3], 'C1 fixed window: after 7 days from the CHARGED download it is charged again, even though it was re-downloaded on day 6');
  const again = consumeAs(id, key);
  assert.deepStrictEqual([again.free_redownload, again.purchased_downloads], [true, 3], 'C1 fixed window: the new charged download starts a new 7 days');
  checks += 5;
}
// 3. A clean download stays free and clean within its 7 days even at zero
//    (ended/zero balance), but no longer indefinitely.
{
  const id = makeUser({ plan:'payg', subscription_status:'payg', trial_end:iso(-1*DAY), downloads_limit:0, downloads_used:0, topup_credits:1 });
  const key = 'cedar::reed diffuser::rectangle::63x44mm';
  consumeAs(id, key);
  ageLabel(id, key, 5);
  const z = consumeAs(id, key);
  assert.deepStrictEqual([z.ok, z.free_redownload, z.clean_export], [true, true, true], 'C1: clean re-download at zero inside the 7 days is free and clean');
  ageLabel(id, key, 8);
  const late = consumeAs(id, key);
  assert.deepStrictEqual([late.ok, late.reason], [false, 'no_downloads_remaining'], 'C1: at zero, after 7 days from the charged download, it is no longer free (no indefinite extension)');
  checks += 2;
}
// 4. Label size is part of the Builder key: another size is a new download.
{
  const id = makeUser({ plan:'payg', subscription_status:'payg', trial_end:iso(-1*DAY), downloads_limit:0, downloads_used:0, topup_credits:5 });
  consumeAs(id, 'lime::scented candle::circle::52x52mm');
  const other = consumeAs(id, 'lime::scented candle::circle::70x70mm');
  assert.deepStrictEqual([other.consumed, other.purchased_downloads], [true, 3], 'C1: the same label at a different physical size is charged as a new download');
  checks += 1;
}
// 5. Annual corner case (the recovered B1 proposal got this wrong): an annual
//    plan at its limit whose monthly refill is due CAN download clean, so a
//    watermarked earlier download is charged once from the refilled plan.
{
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(3*DAY), downloads_limit:10, downloads_used:0, topup_credits:0 });
  const key = 'oud::pillar candle::circle::70x70mm';
  consumeAs(id, key);
  run(`select set_config('request.jwt.claim.role','service_role',false); update public.profiles set plan='easy_pro', is_pro=true, subscription_status='active', billing_cycle='annual', downloads_limit=30, downloads_used=30, downloads_reset_date=(now() - interval '2 days')::date where id=${q(id)};`);
  const r = consumeAs(id, key);
  const p = profile(id);
  assert.deepStrictEqual([r.consumed, r.source, r.clean_export, p.downloads_used], [true, 'plan', true, 1], 'C1 annual: refill due -> refilled first, then the watermarked label is charged once and clean (1 of 30 used)');
  assert(new Date(p.downloads_reset_date).getTime() > Date.now(), 'C1 annual: next reset moved into the future');
  // Annual plan at its limit with NO refill due and nothing purchased: no clean
  // option, so the watermarked copy is re-issued free (never charged, never clean).
  const id2 = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(3*DAY), downloads_limit:10, downloads_used:0, topup_credits:0 });
  consumeAs(id2, key);
  run(`select set_config('request.jwt.claim.role','service_role',false); update public.profiles set plan='easy_pro', is_pro=true, subscription_status='active', billing_cycle='annual', downloads_limit=30, downloads_used=30, downloads_reset_date=(now() + interval '10 days')::date where id=${q(id2)};`);
  const r2 = consumeAs(id2, key);
  assert.deepStrictEqual([r2.free_redownload, r2.clean_export, profile(id2).downloads_used], [true, false, 30], 'C1 annual: no allowance left and no refill due -> free watermarked copy, nothing spent');
  // A free re-download that coincides with a due refill applies the refill once.
  const id3 = makeUser({ plan:'easy_start', subscription_status:'active', billing_cycle:'annual', downloads_limit:20, downloads_used:5, downloads_reset_date:iso(10*DAY), topup_credits:0 });
  const k3 = 'sage::wax melt::square::40x40mm';
  consumeAs(id3, k3);
  run(`select set_config('request.jwt.claim.role','service_role',false); update public.profiles set downloads_used=20, downloads_reset_date=(now() - interval '1 day')::date where id=${q(id3)};`);
  const r3 = consumeAs(id3, k3);
  assert.deepStrictEqual([r3.free_redownload, r3.clean_export, profile(id3).downloads_used], [true, true, 0], 'C1 annual: a clean re-download is free; the due refill is applied (0 used) and not double-counted');
  checks += 4;
}
// ── D5: a trial customer's successful PAYG purchase ends the trial ────────
{
  // Live trial with unused trial downloads buys PAYG.
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(5*DAY), downloads_limit:10, downloads_used:2, topup_credits:0 });
  const r = creditPayg(id, 8);
  assert.deepStrictEqual([r.balance, r.trial_converted, r.subscription_status, r.plan], [8, true, 'payg', 'payg'], 'live trial converts to Pay As You Go with 8 downloads');
  const p = profile(id);
  assert.strictEqual(p.downloads_limit, 0, 'remaining trial allowance forfeited');
  assert(new Date(p.trial_end).getTime() <= Date.now() + 1000, 'trial_end moved to the purchase time');
  // Every next download is a clean PURCHASED download, never a trial one.
  const d1 = consumeAs(id, 'lavender::scented candle');
  assert.deepStrictEqual([d1.source, d1.clean_export, d1.purchased_downloads], ['purchased', true, 7], 'first export after conversion: clean, 8 -> 7');
  const again = consumeAs(id, 'lavender::scented candle');
  assert.deepStrictEqual([again.free_redownload, again.clean_export, again.purchased_downloads], [true, true, 7], 'eligible 7-day re-download is free and clean');
  const sheet = consumeAs(id, null);
  assert.deepStrictEqual([sheet.source, sheet.clean_export, sheet.purchased_downloads], ['purchased', true, 6], 'Composer A4 sheet consumes one purchased download');
  // Spend to zero: the trial never returns.
  for (let i = 0; i < 6; i++) consumeAs(id, null);
  const zero = consumeAs(id, 'vanilla::wax melt');
  assert.deepStrictEqual([zero.ok, zero.reason], [false, 'no_downloads_remaining'], 'at zero a new label is blocked (no trial downloads reappear)');
  const zp = profile(id);
  assert.deepStrictEqual([zp.subscription_status, zp.plan, zp.topup_credits], ['payg', 'payg', 0], 'account stays Pay As You Go with 0 downloads');
  const graceAtZero = consumeAs(id, 'lavender::scented candle');
  assert.deepStrictEqual([graceAtZero.ok, graceAtZero.free_redownload, graceAtZero.clean_export], [true, true, true], 'eligible re-download at zero stays free and clean');
  // Buying again: stays PAYG, only the balance changes.
  const r2 = creditPayg(id, 8);
  assert.deepStrictEqual([r2.balance, r2.trial_converted, r2.subscription_status], [8, false, 'payg'], 'existing PAYG buys again: +8, no further state change');
  checks += 11;
}
{
  // Expired trial buys PAYG.
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(-9*DAY), downloads_limit:10, downloads_used:10, topup_credits:0 });
  const r = creditPayg(id, 8);
  assert.deepStrictEqual([r.trial_converted, r.subscription_status, r.balance], [true, 'payg', 8], 'expired trial converts to Pay As You Go');
  // Subscribers and ended subscriptions are credited only; status untouched.
  for (const st of ['active', 'paused', 'cancelScheduled']) {
    const u = makeUser(STATES[st]);
    const before = profile(u);
    const rr = creditPayg(u, 8);
    const after = profile(u);
    assert.strictEqual(rr.trial_converted, false, `${st}: never converted`);
    assert.deepStrictEqual([after.subscription_status, after.plan, after.downloads_limit, after.downloads_used], [before.subscription_status, before.plan, before.downloads_limit, before.downloads_used], `${st}: subscription state untouched`);
    assert.strictEqual(after.topup_credits, before.topup_credits + 8, `${st}: credited`);
  }
  // Decision 3: a FULLY ENDED subscription converts to Pay As You Go on a
  // successful PAYG purchase (downgraded account, or paid period over).
  for (const st of ['cancelledEnded', 'cancelPeriodPassed']) {
    const u = makeUser(STATES[st]);
    const rr = creditPayg(u, 8);
    const after = profile(u);
    assert.deepStrictEqual([rr.trial_converted, after.subscription_status, after.plan, after.downloads_limit, after.is_pro, after.topup_credits],
      [true, 'payg', 'payg', 0, false, 8], `${st}: ended subscription converts to Pay As You Go`);
    const d = consumeAs(u, 'rose::scented candle');
    assert.deepStrictEqual([d.source, d.clean_export, d.purchased_downloads], ['purchased', true, 7], `${st}: clean purchased download`);
    for (let i = 0; i < 7; i++) consumeAs(u, null);
    assert.strictEqual(consumeAs(u, null).ok, false, `${st}: blocked at zero`);
    assert.deepStrictEqual([profile(u).subscription_status, profile(u).plan], ['payg', 'payg'], `${st}: stays Pay As You Go at zero`);
    assert.strictEqual(E.summarise(profile(u)).planName, 'Pay As You Go', `${st}: never reverts to Easy Start/Pro (Cancelled)`);
    const g = consumeAs(u, 'rose::scented candle');
    assert.deepStrictEqual([g.free_redownload, g.clean_export], [true, true], `${st}: free re-download at zero stays clean`);
  }
  // Only the webhook's service role may call it.
  const u = makeUser(STATES.trialLive);
  assert.throws(() => run(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(u)}, true); select public.credit_payg_purchase(${q(u)}, 8); commit;`), /permission denied/, 'authenticated users cannot credit/convert');
  assert.throws(() => run(`begin; set local role anon; select public.credit_payg_purchase(${q(u)}, 8); commit;`), /permission denied/, 'anon cannot credit/convert');
  assert.strictEqual(profile(u).subscription_status, 'trialing', 'a rejected call changes nothing');
  checks += 14;
}
// ── Annual plans refill monthly (pricing: "£99/year · 20 downloads/month") ──
{
  const id = makeUser({ plan:'easy_start', subscription_status:'active', billing_cycle:'annual', downloads_limit:20, downloads_used:20, downloads_reset_date:iso(-2*DAY), topup_credits:0 });
  const r = consumeAs(id, null);
  assert.deepStrictEqual([r.ok, r.source, r.clean_export, r.downloads_used], [true, 'plan', true, 1], 'annual plan past its monthly reset date is refilled, then counts this download');
  const p = profile(id);
  const next = new Date(p.downloads_reset_date).getTime();
  assert(next > Date.now() && next < Date.now() + 32*DAY, 'next reset date moves one month ahead');
  const r2 = consumeAs(id, null);
  assert.strictEqual(r2.downloads_used, 2, 'no second refill before the next reset date');
  // Several missed months: advances to the first future reset date, one refill.
  const late = makeUser({ plan:'easy_pro', subscription_status:'active', billing_cycle:'annual', downloads_limit:30, downloads_used:30, downloads_reset_date:iso(-75*DAY), topup_credits:0 });
  consumeAs(late, null);
  const lp = profile(late);
  assert(new Date(lp.downloads_reset_date).getTime() > Date.now(), 'reset date catches up to the future');
  assert.strictEqual(lp.downloads_used, 1, 'one refill only');
  // Monthly plans are left to invoice.paid (no early double refill).
  const monthly = makeUser({ plan:'easy_start', subscription_status:'active', billing_cycle:'monthly', downloads_limit:20, downloads_used:20, downloads_reset_date:iso(-1*DAY), topup_credits:0 });
  assert.strictEqual(consumeAs(monthly, null).ok, false, 'monthly plan is not refilled here (invoice.paid refills it)');
  // Paused annual plan is not refilled or usable.
  const paused = makeUser({ plan:'easy_start', subscription_status:'paused', billing_cycle:'annual', downloads_limit:20, downloads_used:20, downloads_reset_date:iso(-2*DAY), topup_credits:0 });
  assert.strictEqual(consumeAs(paused, null).ok, false, 'paused annual plan is not refilled');
  const E2 = require('../entitlement.js');
  assert.strictEqual(E2.summarise({ plan:'easy_start', subscription_status:'active', billing_cycle:'annual', downloads_limit:20, downloads_used:20, downloads_reset_date:iso(-2*DAY) }).planLeft, 20, 'entitlement.js shows the refilled allowance');
  checks += 8;
}
// Permissions (unchanged from 20260925000000; re-checked after the replace).
{
  const id = makeUser(STATES.active);
  assert.throws(() => consumeAs(id, null, 'anon'), /permission denied/, 'anon must not execute consume_download');
  assert.throws(() => run(`begin; set local role authenticated; select public.credit_purchased_downloads(${q(id)}, 8); commit;`), /permission denied/, 'authenticated must not credit downloads');
  const bal = run(`begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); select public.credit_purchased_downloads(${q(id)}, 8); commit;`);
  assert.strictEqual(bal.split('\n').pop(), '8', 'service_role credits purchased downloads');
  run(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(id)}, true); select set_config('request.jwt.claim.role','authenticated',true); update public.profiles set topup_credits=99 where id=${q(id)}; commit;`);
  assert.strictEqual(profile(id).topup_credits, 8, 'direct client update must not change the purchased balance');
  // 20260928000000: the plan counters are protected too (production's trigger
  // left downloads_used / downloads_reset_date writable by the customer).
  const before = profile(id);
  run(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(id)}, true); select set_config('request.jwt.claim.role','authenticated',true); update public.profiles set downloads_used=0, downloads_reset_date='2000-01-01' where id=${q(id)}; commit;`);
  assert.deepStrictEqual([profile(id).downloads_used, profile(id).downloads_reset_date], [before.downloads_used, before.downloads_reset_date], 'a customer cannot reset their own download counter or reset date');
  checks += 5;
}
// Concurrency: two sessions racing for the final purchased download.
{
  const id = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(-2*DAY), downloads_limit:10, downloads_used:10, topup_credits:1 });
  const script = `begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(id)}, true); select public.consume_download(null)::text; select pg_sleep(0.3); commit;`;
  const { spawn } = require('child_process');
  const runAsync = () => new Promise(res => { const c = spawn('sh',['-c',`${PSQL} -X -At -q -d ${DB}`]); let o=''; c.stdout.on('data',d=>o+=d); c.on('close',()=>res(o)); c.stdin.end(script); });
  Promise.all([runAsync(), runAsync()]).then(outs => {
    const results = outs.map(o => JSON.parse(o.split('\n').filter(l=>l.startsWith('{')).pop()));
    assert.strictEqual(results.filter(r=>r.ok).length, 1, 'only one of two concurrent exports may spend the final purchased download');
    assert.strictEqual(profile(id).topup_credits, 0, 'balance never goes negative under concurrency');
    checks += 2;

    // Show what the pre-C1 function (up to 20260928000000) did.
    freshDb(MIGRATIONS.slice(0,5));
    const wm = makeUser({ plan:'free', subscription_status:'trialing', trial_end:iso(3*DAY), downloads_limit:10, downloads_used:0, topup_credits:0 });
    consumeAs(wm, 'rose::scented candle');
    run(`select set_config('request.jwt.claim.role','service_role',false); update public.profiles set topup_credits=5 where id=${q(wm)};`);
    const wmAgain = consumeAs(wm, 'rose::scented candle');
    assert.deepStrictEqual([wmAgain.free_redownload, wmAgain.clean_export], [true, false], 'baseline check: before C1 a paying customer got the old watermarked copy free (fixed by 20260929000000)');
    ageLabel(wm, 'rose::scented candle', 6); consumeAs(wm, 'rose::scented candle');
    assert(Date.now() - new Date(labelRow(wm, 'rose::scented candle').last_downloaded_at).getTime() < DAY, 'baseline check: before C1 a free re-download restarted the 7 days (fixed by 20260929000000)');
    // Show what the ORIGINAL PR #156 function does for the corrected states.
    freshDb(MIGRATIONS.slice(0,2));
    const annual = makeUser({ plan:'easy_start', subscription_status:'active', billing_cycle:'annual', downloads_limit:20, downloads_used:20, downloads_reset_date:iso(-2*DAY), topup_credits:0 });
    assert.strictEqual(consumeAs(annual, null).ok, false, 'baseline check: original PR function never refills an annual plan monthly (the bug fixed by 20260927000000)');
    const exploit = makeUser({ plan:'easy_start', subscription_status:'active', downloads_limit:20, downloads_used:20, topup_credits:0 });
    run(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(exploit)}, true); select set_config('request.jwt.claim.role','authenticated',true); update public.profiles set downloads_used=0 where id=${q(exploit)}; commit;`);
    assert.strictEqual(profile(exploit).downloads_used, 0, 'baseline check: with the production trigger a customer CAN reset their own downloads_used (fixed by 20260928000000)');
    const cs = makeUser(STATES.cancelScheduled);
    const tl = makeUser(Object.assign({}, STATES.trialLive, { topup_credits:3 }));
    const oldCs = consumeAs(cs, null), oldTl = consumeAs(tl, null);
    assert.strictEqual(oldCs.ok, false, 'baseline check: original PR function blocks a scheduled cancellation (the bug fixed by 20260926000000)');
    assert.deepStrictEqual([oldTl.source, oldTl.clean_export], ['plan', false], 'baseline check: original PR function spends a watermarked trial download despite purchased downloads');
    run(`drop database if exists ${DB};`, 'postgres');
    console.log(`download entitlement SQL checks passed (${checks+4} groups; real migrations on local PostgreSQL)`);
  }).catch(e => { console.error(e); process.exitCode = 1; });
}
