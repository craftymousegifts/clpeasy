// Applies the real Website & Link Health migrations to a throwaway LOCAL
// PostgreSQL database (never Supabase) and checks RLS/privileges, run
// locking, the Vault cron token and the weekly pg_cron job.
//
// Needs a local PostgreSQL + psql; prints SKIP and exits 0 otherwise.
//   node tests/site-link-health-sql.js
// Optional: CLP_PSQL="runuser -u postgres -- psql" (default auto-detected).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DB = 'clpeasy_link_health_test';
const MIGRATIONS = ['20261006000000_site_link_health_monitor.sql', '20261006000100_site_link_health_schedule.sql'];

function detectPsql(){
  const candidates = [process.env.CLP_PSQL, 'psql', 'runuser -u postgres -- psql'].filter(Boolean);
  for (const c of candidates){
    try { execSync(`${c} -X -At -d postgres -c "select 1"`, { stdio:['ignore','pipe','ignore'] }); return c; } catch(e){}
  }
  return null;
}
const PSQL = detectPsql();
if (!PSQL){ console.log('SKIP site-link-health-sql: no local PostgreSQL available'); process.exit(0); }

function run(sql, db){
  const r = spawnSync('sh', ['-c', `${PSQL} -X -At -q -v ON_ERROR_STOP=1 -d ${db||DB}`], { input: sql, encoding:'utf8' });
  if (r.status !== 0) throw new Error((r.stderr||'').trim() || 'psql failed');
  return r.stdout.trim();
}
function fails(sql){ try { run(sql); return null; } catch(e){ return e.message; } }
// pg_cron is not installed locally; the shim provides the cron schema instead.
const migration = m => fs.readFileSync(path.join(ROOT,'supabase','migrations',m),'utf8')
  .replace(/^create extension if not exists pg_cron.*$/mi, '-- (pg_cron provided by local shim)');

run(`drop database if exists ${DB};`, 'postgres');
run(`create database ${DB};`, 'postgres');
run(fs.readFileSync(path.join(__dirname,'sql','link-health-shim.sql'),'utf8'));
for (const m of MIGRATIONS) run(migration(m));
// Re-applying must be safe (no duplicate job/secret).
run(migration(MIGRATIONS[1]));

let checks = 0;
const ok = (c, msg) => { assert.ok(c, msg); checks++; };

// RLS + privileges
ok(run(`select string_agg(relname||':'||relrowsecurity, ',' order by relname) from pg_class where relname in ('site_links','link_check_runs','link_check_history')`)
  === 'link_check_history:true,link_check_runs:true,site_links:true', 'RLS enabled on all three tables');
ok(run(`select count(*) from pg_policies where tablename in ('site_links','link_check_runs','link_check_history')`) === '0', 'no RLS policies (no client access)');
for (const role of ['anon','authenticated']){
  for (const t of ['site_links','link_check_runs','link_check_history']){
    ok(/permission denied/.test(fails(`set role ${role}; select * from public.${t};`) || ''), `${role} cannot read ${t}`);
  }
  ok(/permission denied/.test(fails(`set role ${role}; insert into public.link_check_runs(trigger) values ('manual');`) || ''), `${role} cannot insert runs`);
  ok(/permission denied/.test(fails(`set role ${role}; select public.site_link_health_begin_run('manual');`) || ''), `${role} cannot start a run`);
  ok(/permission denied/.test(fails(`set role ${role}; select public.site_link_health_verify_cron_token('x');`) || ''), `${role} cannot probe the cron token`);
  ok(/permission denied/.test(fails(`set role ${role}; select * from vault.decrypted_secrets;`) || ''), `${role} cannot read Vault`);
}

// Service role run control
const asService = sql => run(`set role service_role; ${sql}`);
const r1 = JSON.parse(asService(`select public.site_link_health_begin_run('scheduled')`));
ok(r1.ok === true && r1.run_id, 'service role can start a run');
ok(JSON.parse(asService(`select public.site_link_health_begin_run('scheduled')`)).reason === 'already_running', 'second concurrent run refused');
ok(/duplicate key/.test(fails(`insert into public.link_check_runs(trigger) values ('manual');`) || ''), 'unique index allows only one running row');
run(`update public.link_check_runs set status='completed', completed_at=now() where id='${r1.run_id}'`);
ok(JSON.parse(asService(`select public.site_link_health_begin_run('manual')`)).reason === 'too_soon', 'manual scan rate-limited to one per 10 minutes');
ok(JSON.parse(asService(`select public.site_link_health_begin_run('bogus')`)).reason === 'invalid_trigger', 'invalid trigger refused');
run(`update public.link_check_runs set started_at = now() - interval '20 minutes'`);
const r2 = JSON.parse(asService(`select public.site_link_health_begin_run('scheduled')`));
ok(r2.ok, 'scheduled run allowed after completion');
run(`update public.link_check_runs set started_at = now() - interval '16 minutes' where id='${r2.run_id}'`);
const r3 = JSON.parse(asService(`select public.site_link_health_begin_run('scheduled')`));
ok(r3.ok && run(`select status from public.link_check_runs where id='${r2.run_id}'`) === 'failed', 'stuck run (>15 min) marked failed and replaced');

// Vault token
ok(run(`select count(*) from vault.secrets where name='site_link_health_cron_token'`) === '1', 'exactly one Vault token after re-applying');
const token = run(`select decrypted_secret from vault.decrypted_secrets where name='site_link_health_cron_token'`);
ok(/^[0-9a-f]{64}$/.test(token), 'token is 64 random hex chars');
ok(asService(`select public.site_link_health_verify_cron_token('${token}')`) === 't', 'correct token verifies');
ok(asService(`select public.site_link_health_verify_cron_token('${'0'.repeat(64)}')`) === 'f', 'wrong token rejected');
ok(asService(`select public.site_link_health_verify_cron_token(null)`) === 'f', 'null token rejected');

// Weekly job
ok(run(`select count(*) from cron.job where jobname='site-link-health-weekly'`) === '1', 'exactly one weekly job');
ok(run(`select schedule from cron.job where jobname='site-link-health-weekly'`) === '17 3 * * 1', 'runs Mondays 03:17 UTC');
const cmd = run(`select command from cron.job where jobname='site-link-health-weekly'`);
ok(/functions\/v1\/site-link-health/.test(cmd) && /vault\.decrypted_secrets/.test(cmd) && !cmd.includes(token), 'job calls the function with the Vault token, no literal secret');
const jwts = fs.readFileSync(path.join(ROOT,'supabase','migrations',MIGRATIONS[1]),'utf8').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) || [];
ok(jwts.length === 1 && JSON.parse(Buffer.from(jwts[0].split('.')[1], 'base64url').toString()).role === 'anon', 'only the public anon key is embedded (no service-role key)');
run(cmd); // execute the job body against the pg_net stub
const req = JSON.parse(run(`select row_to_json(r) from net.requests r order by id desc limit 1`));
ok(req.headers['x-link-health-token'] === token && req.body.action === 'run', 'job sends token header and run action');

// Retention
run(`insert into public.link_check_history(target_url,new_status,changed_at) values ('https://a/','HEALTHY',now()-interval '500 days'),('https://b/','BROKEN',now());
     insert into public.site_links(source_page,source_url,target_url,link_type,active,last_seen_at) values
       ('/','https://clpeasy.com/','https://old/', 'external', false, now()-interval '200 days'),
       ('/','https://clpeasy.com/','https://keep/', 'external', true, now()-interval '200 days');`);
asService(`select public.site_link_health_prune()`);
ok(run(`select string_agg(target_url, ',' order by target_url) from public.link_check_history`) === 'https://b/', 'history older than 400 days pruned');
ok(run(`select string_agg(target_url, ',' order by target_url) from public.site_links`) === 'https://keep/', 'long-retired links pruned, active kept');
ok(/duplicate key/.test(fails(`insert into public.site_links(source_page,source_url,target_url,link_type) values ('/','https://clpeasy.com/','https://keep/','external')`) || ''), 'one row per (source page, target)');

run(`drop database if exists ${DB};`, 'postgres');
console.log(`site-link-health-sql passed (${checks} checks)`);
