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

-- Mirrors the CLPeasy Test project (baselined from production 25 Sep 2026):
-- column types and the real protect_profile_billing_columns() body.
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
grant execute on function auth.role() to anon, authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_beta boolean,
  is_pro boolean default false,
  plan text,
  trial_start timestamptz,
  trial_end timestamptz,
  subscription_status text,
  cancel_reason text,
  deletion_date timestamptz,
  created_at timestamptz default now(),
  billing_cycle text,
  next_payment date,
  card_last4 text,
  downloads_used integer default 0,
  downloads_limit integer,
  downloads_reset_date date,
  topup_months integer,
  cancelled_days_remaining integer,
  discount_active boolean,
  discount_ends date,
  paused_at timestamptz,
  pause_reason text,
  topup_credits integer default 0
);

-- Exact production body (note: downloads_used / downloads_reset_date are NOT
-- protected here; 20260928000000_protect_download_counters.sql fixes that).
create or replace function public.protect_profile_billing_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  new.is_pro                   := old.is_pro;
  new.plan                     := old.plan;
  new.subscription_status      := old.subscription_status;
  new.downloads_limit          := old.downloads_limit;
  new.billing_cycle            := old.billing_cycle;
  new.next_payment             := old.next_payment;
  new.card_last4               := old.card_last4;
  new.topup_months             := old.topup_months;
  new.topup_credits            := old.topup_credits;
  new.cancelled_days_remaining := old.cancelled_days_remaining;
  new.discount_active          := old.discount_active;
  new.discount_ends            := old.discount_ends;
  new.is_beta                  := old.is_beta;
  new.trial_start              := old.trial_start;
  new.trial_end                := old.trial_end;
  new.cancel_reason            := old.cancel_reason;
  new.deletion_date            := old.deletion_date;
  new.paused_at                := old.paused_at;
  new.pause_reason             := old.pause_reason;
  return new;
end;
$$;

drop trigger if exists protect_profile_billing_columns_trg on public.profiles;
create trigger protect_profile_billing_columns_trg
  before update on public.profiles
  for each row execute function public.protect_profile_billing_columns();

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.profiles to authenticated, anon;
grant all on public.profiles to service_role;
