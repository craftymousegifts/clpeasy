// Executes supabase/migrations/20261024000000_secure_signup_webhook.sql
// against a throwaway LOCAL PostgreSQL database (never Supabase), with
// Vault / pg_net / auth.users shimmed (tests/sql/signup-webhook-shim.sql).
// Prints SKIP and exits 0 when no local PostgreSQL is available.
//   node tests/signup-webhook-sql.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DB = 'clpeasy_signup_webhook_test';
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '20261024000000_secure_signup_webhook.sql');

function detectPsql() {
  for (const c of [process.env.CLP_PSQL, 'psql', 'runuser -u postgres -- psql'].filter(Boolean)) {
    try { execSync(`${c} -X -At -d postgres -c "select 1"`, { stdio: ['ignore', 'pipe', 'ignore'] }); return c; } catch (e) {}
  }
  return null;
}
const PSQL = detectPsql();
if (!PSQL) { console.log('SKIP signup-webhook-sql: no local PostgreSQL available'); process.exit(0); }
function run(sql, db) {
  const r = spawnSync('sh', ['-c', `${PSQL} -X -At -q -v ON_ERROR_STOP=1 -d ${db || DB}`], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || '').trim() || 'psql failed');
  return r.stdout.trim();
}
const ok = m => console.log('PASS: ' + m);
let n = 0; const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const addUser = (id, email) => run(`insert into auth.users(id, email, encrypted_password, confirmation_token, raw_user_meta_data)
  values ('${id}', '${email}', '$2a$10$fakehashfakehashfakehash', 'conf-token-xyz', '{"name":"x"}');`);

run(`drop database if exists ${DB};`, 'postgres');
run(`create database ${DB};`, 'postgres');
run(fs.readFileSync(path.join(__dirname, 'sql', 'signup-webhook-shim.sql'), 'utf8'));

// Source hygiene: no credential-looking value in the migration itself.
const src = fs.readFileSync(MIGRATION, 'utf8');
assert(!/eyJ[A-Za-z0-9_-]{10,}\./.test(src) && !/sb_secret_|sk_live_|sk_test_|whsec_|xkeysib-/.test(src), 'migration contains a credential');
ok('migration file contains no JWT or API key');

run(fs.readFileSync(MIGRATION, 'utf8'));
const triggers = run(`select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal`);
assert.strictEqual(triggers, 'notify_signup_webhook,on_auth_user_created');
ok('old "on-user-signup" trigger dropped; new notify_signup_webhook added; handle_new_user trigger kept');

assert.strictEqual(run(`select count(*) from vault.secrets where name='notify_signup_webhook_secret'`), '1');
assert.strictEqual(run(`select length(secret) from vault.secrets where name='notify_signup_webhook_secret'`), '64');
const firstSecretId = run(`select id from vault.secrets where name='notify_signup_webhook_secret'`);
ok('random 256-bit secret generated inside the database and stored in Vault');

// Sign-up path
const u1 = uid(); addUser(u1, 'maker1@example.com');
assert.strictEqual(run(`select count(*) from public.profiles where id='${u1}'`), '1', 'profile seeded');
assert.strictEqual(run(`select count(*) from public.old_webhook_calls`), '0', 'old webhook no longer fires');
const call = JSON.parse(run(`select row_to_json(c) from net.calls c`));
assert.strictEqual(call.url, 'https://qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/notify-signup');
assert.deepStrictEqual(Object.keys(call.body.record).sort(), ['created_at', 'email', 'id']);
assert.strictEqual(call.body.record.id, u1); assert.strictEqual(call.body.record.email, 'maker1@example.com');
assert.strictEqual(call.body.type, 'INSERT');
const raw = JSON.stringify(call.body);
for (const s of ['encrypted_password', '$2a$', 'conf-token', 'raw_user_meta_data']) assert(!raw.includes(s), 'payload leaks ' + s);
assert.strictEqual(Object.keys(call.headers).sort().join(','), 'Content-Type,x-clpeasy-webhook-secret');
assert(!('Authorization' in call.headers), 'no Authorization/JWT header');
assert.strictEqual(run(`select (select headers->>'x-clpeasy-webhook-secret' from net.calls limit 1) = (select secret from vault.secrets where name='notify_signup_webhook_secret')`), 't');
ok('one sign-up -> profile seeded + exactly one pg_net call with id/email/created_at only and the Vault secret header (no JWT)');

// Caller check
assert.strictEqual(run(`select public.verify_notify_signup_secret((select secret from vault.secrets where name='notify_signup_webhook_secret'))`), 't');
for (const bad of [`'wrong'`, `''`, 'null', `upper((select secret from vault.secrets where name='notify_signup_webhook_secret'))`])
  assert.strictEqual(run(`select public.verify_notify_signup_secret(${bad})`), 'f', 'accepted ' + bad);
ok('verify_notify_signup_secret: true only for the exact secret (wrong/empty/null/case-changed rejected)');

for (const role of ['anon', 'authenticated']) {
  assert.throws(() => run(`set role ${role}; select public.verify_notify_signup_secret('x');`), /permission denied/);
  assert.throws(() => run(`set role ${role}; select public.notify_signup_webhook();`), /permission denied|trigger functions can only be called as triggers/);
}
assert.strictEqual(run(`set role service_role; select public.verify_notify_signup_secret('x');`), 'f');
ok('anon/authenticated cannot execute either function; service_role can run the check');

// Failure modes must never block a sign-up
run(`insert into net.fail values (true);`);
const u2 = uid(); addUser(u2, 'maker2@example.com');
assert.strictEqual(run(`select count(*) from auth.users where id='${u2}'`), '1');
assert.strictEqual(run(`select count(*) from public.profiles where id='${u2}'`), '1');
run(`delete from net.fail;`);
ok('pg_net failure -> sign-up and profile still succeed (warning only)');

run(`update vault.secrets set name='parked' where name='notify_signup_webhook_secret';`);
const before = run(`select count(*) from net.calls`);
const u3 = uid(); addUser(u3, 'maker3@example.com');
assert.strictEqual(run(`select count(*) from auth.users where id='${u3}'`), '1');
assert.strictEqual(run(`select count(*) from net.calls`), before, 'no call without secret');
run(`update vault.secrets set name='notify_signup_webhook_secret' where name='parked';`);
ok('Vault secret missing -> sign-up still succeeds; no unauthenticated call is sent');

// Test-environment URL override
run(`select vault.create_secret('https://test-ref.supabase.co/functions/v1/notify-signup', 'notify_signup_function_url', 'test');`);
addUser(uid(), 'maker4@example.com');
assert.strictEqual(run(`select url from net.calls order by id desc limit 1`), 'https://test-ref.supabase.co/functions/v1/notify-signup');
run(`delete from vault.secrets where name='notify_signup_function_url';`);
ok('Vault URL override (Test project) honoured; production URL is the default');

// Re-running the migration is safe and keeps the same secret
run(fs.readFileSync(MIGRATION, 'utf8'));
assert.strictEqual(run(`select id from vault.secrets where name='notify_signup_webhook_secret'`), firstSecretId);
assert.strictEqual(run(`select count(*) from pg_trigger where tgrelid='auth.users'::regclass and tgname='notify_signup_webhook'`), '1');
ok('migration is re-runnable: same secret, single trigger');

// Non-owner role (production: postgres is not the owner of auth.users):
// the guarded drop must warn, not abort the migration.
run(`create table auth.owned_elsewhere (id int); create function public.noop_trg() returns trigger language plpgsql as $$ begin return new; end $$;
     create trigger "on-user-signup" after insert on auth.users for each row execute function public.noop_trg();
     do $$ begin create role clp_nonowner nologin; exception when duplicate_object then null; end $$;
     grant usage on schema auth to clp_nonowner; grant trigger on auth.users to clp_nonowner;`);
const dropBlock = src.slice(src.indexOf('DO $$\nBEGIN\n  DROP TRIGGER IF EXISTS "on-user-signup"'));
const r = spawnSync('sh', ['-c', `${PSQL} -X -At -q -v ON_ERROR_STOP=1 -d ${DB}`], { input: 'set role clp_nonowner;\n' + dropBlock, encoding: 'utf8' });
assert.strictEqual(r.status, 0, 'guarded drop aborted: ' + r.stderr);
assert(/could not drop "on-user-signup"/.test(r.stderr), 'expected a warning');
assert.strictEqual(run(`select count(*) from pg_trigger where tgrelid='auth.users'::regclass and tgname='on-user-signup'`), '1');
ok('as a non-owner the old-trigger drop warns (Dashboard fallback) instead of aborting');

run(`drop database if exists ${DB};`, 'postgres');
console.log('signup webhook SQL checks passed (11 groups; real migration on local PostgreSQL)');
