-- Minimal local stand-in for the Supabase pieces the Website & Link Health
-- migrations use (roles, Vault, pg_cron, pg_net). Used ONLY by
-- tests/site-link-health-sql.js against a throwaway LOCAL PostgreSQL
-- database. It never touches Supabase.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique, description text, secret text not null, created_at timestamptz default now()
);
create or replace view vault.decrypted_secrets as select id, name, description, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets(name, description, secret) values (new_name, new_description, new_secret) returning id
$$;

create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v;
  return v;
end $$;
create or replace function cron.unschedule(job_id bigint) returns boolean
language sql as $$ delete from cron.job where jobid = job_id returning true $$;

create schema if not exists net;
create table if not exists net.requests (id bigserial primary key, url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.requests(url, headers, body) values (url, headers, body) returning id $$;
