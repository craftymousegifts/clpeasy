-- Minimal local stand-in for the parts of Supabase that the CLPeasy
-- download-accounting migrations depend on. Used ONLY by
-- tests/download-entitlement-sql.js against a throwaway local PostgreSQL
-- database. It never touches Supabase.
--
-- The profiles table and its billing-protection trigger live only in the
-- production database (not in this repository), so they are modelled here
-- from what the application code relies on: the columns read/written by
-- stripe-webhook and the pages, and the documented behaviour that billing
-- columns silently revert unless the caller's JWT role is service_role.

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text,
  is_pro boolean default false,
  subscription_status text,
  trial_end timestamptz,
  deletion_date timestamptz,
  downloads_used integer default 0,
  downloads_limit integer,
  topup_credits integer default 0
);

create or replace function public.protect_profile_billing_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    new.downloads_used := old.downloads_used;
    new.downloads_limit := old.downloads_limit;
    new.topup_credits := old.topup_credits;
    new.plan := old.plan;
    new.is_pro := old.is_pro;
    new.subscription_status := old.subscription_status;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_billing_columns on public.profiles;
create trigger protect_profile_billing_columns
  before update on public.profiles
  for each row execute function public.protect_profile_billing_columns();

grant usage on schema public to anon, authenticated, service_role;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
