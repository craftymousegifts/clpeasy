-- Local stand-in for the Supabase pieces used by
-- supabase/migrations/20261024000000_secure_signup_webhook.sql
-- (Vault, pg_net, pgcrypto in "extensions", auth.users). Used ONLY by
-- tests/signup-webhook-sql.js against a throwaway LOCAL PostgreSQL database.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Vault (same object names and columns the migration reads)
create schema if not exists vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text not null);
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$ insert into vault.secrets(name, description, secret) values (new_name, new_description, new_secret) returning id $$;
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;

-- pg_net (signature of net.http_post); calls are recorded instead of sent.
create schema if not exists net;
create table net.calls (id bigserial primary key, url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int);
create table net.fail (on_ boolean);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{"Content-Type":"application/json"}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
declare v bigint;
begin
  if exists (select 1 from net.fail where on_) then raise exception 'simulated pg_net failure'; end if;
  insert into net.calls(url, body, params, headers, timeout_milliseconds)
  values (url, body, params, headers, timeout_milliseconds) returning id into v;
  return v;
end $$;

-- auth.users with the sensitive columns the old webhook used to post.
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, encrypted_password text,
  confirmation_token text, raw_user_meta_data jsonb, created_at timestamptz default now());

-- Existing production triggers on auth.users, modelled:
--  on_auth_user_created -> handle_new_user() (profile seeding; must keep working)
--  "on-user-signup"      -> the Dashboard webhook being replaced
create table public.profiles (id uuid primary key, email text);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, email) values (new.id, new.email); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.old_webhook_calls (user_id uuid);
create function public.old_dashboard_webhook() returns trigger language plpgsql as $$
begin insert into public.old_webhook_calls values (new.id); return new; end $$;
create trigger "on-user-signup" after insert on auth.users for each row execute function public.old_dashboard_webhook();
