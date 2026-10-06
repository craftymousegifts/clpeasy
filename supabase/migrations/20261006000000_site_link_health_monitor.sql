-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — Website & Link Health Monitor (storage + run control)
-- ─────────────────────────────────────────────────────────────────
-- Stores the results of the site-link-health Edge Function, which
-- crawls the public clpeasy.com pages and checks every link it finds.
--
--   site_links         one row per (CLPeasy page, destination URL),
--                      so a destination used on several pages lists
--                      every page that needs fixing.
--   link_check_runs    one row per scan (weekly or manual).
--   link_check_history status TRANSITIONS only (not every check), so
--                      it grows only when something changes; pruned
--                      after ~13 months by site_link_health_prune().
--
-- Security: RLS is enabled with NO policies and all privileges are
-- revoked from anon/authenticated. Customers cannot read or list any
-- of this. Only the service role (inside the Edge Function, which
-- checks the caller is the CLPeasy admin) can read or write it.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.link_check_runs (
  id                    uuid primary key default gen_random_uuid(),
  trigger               text not null check (trigger in ('scheduled','manual')),
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  status                text not null default 'running'
                        check (status in ('running','completed','partial','failed')),
  pages_scanned         integer not null default 0,
  links_checked         integer not null default 0,
  healthy_count         integer not null default 0,
  redirected_count      integer not null default 0,
  warning_count         integer not null default 0,
  broken_count          integer not null default 0,
  review_required_count integer not null default 0,
  error_summary         text
);

-- At most ONE run may be 'running' at any time (prevents overlapping scans).
create unique index if not exists link_check_runs_single_running
  on public.link_check_runs ((true)) where status = 'running';
create index if not exists link_check_runs_started_at_idx
  on public.link_check_runs (started_at desc);

create table if not exists public.site_links (
  id                 uuid primary key default gen_random_uuid(),
  source_page        text not null,              -- path, e.g. /compliance.html
  source_url         text not null,              -- full URL of the CLPeasy page
  link_text          text,
  target_url         text not null,              -- normalised destination
  link_type          text not null check (link_type in ('internal','external')),
  authority_type     text not null default 'standard'
                     check (authority_type in ('standard','regulatory')),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  last_checked_at    timestamptz,
  http_status        integer,
  final_url          text,
  redirect_count     integer not null default 0,
  redirect_permanent boolean,
  redirect_chain     jsonb,
  replacement_url    text,                       -- ordinary links only (301/308 → healthy)
  health_status      text not null default 'UNCHECKED'
                     check (health_status in ('UNCHECKED','HEALTHY','REDIRECTED','WARNING','BROKEN','REVIEW_REQUIRED')),
  failure_count      integer not null default 0, -- consecutive failed scans
  first_failed_at    timestamptz,
  last_healthy_at    timestamptz,
  last_error         text,
  review_required    boolean not null default false,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint site_links_source_target_key unique (source_url, target_url)
);

create index if not exists site_links_target_url_idx on public.site_links (target_url);
create index if not exists site_links_active_status_idx on public.site_links (health_status) where active;
create index if not exists site_links_review_idx on public.site_links (review_required) where active and review_required;

create table if not exists public.link_check_history (
  id              bigint generated always as identity primary key,
  run_id          uuid references public.link_check_runs(id) on delete set null,
  target_url      text not null,
  previous_status text,
  new_status      text not null,
  http_status     integer,
  final_url       text,
  detail          text,
  changed_at      timestamptz not null default now()
);

create index if not exists link_check_history_target_idx on public.link_check_history (target_url, changed_at desc);
create index if not exists link_check_history_changed_at_idx on public.link_check_history (changed_at);

alter table public.link_check_runs    enable row level security;
alter table public.site_links         enable row level security;
alter table public.link_check_history enable row level security;
-- No policies on purpose: no anon/authenticated access at all.

revoke all on public.link_check_runs, public.site_links, public.link_check_history from public, anon, authenticated;
grant all on public.link_check_runs, public.site_links, public.link_check_history to service_role;

-- ── Run control ─────────────────────────────────────────────────
-- Atomically claims the single 'running' slot. A run left 'running'
-- for more than 15 minutes (Edge Functions stop long before that) is
-- marked failed so it can never block the schedule permanently.
-- Manual scans are additionally limited to one every 10 minutes.
create or replace function public.site_link_health_begin_run(p_trigger text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id   uuid;
  v_last timestamptz;
begin
  if p_trigger not in ('scheduled','manual') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_trigger');
  end if;

  update link_check_runs
     set status = 'failed',
         completed_at = now(),
         error_summary = coalesce(error_summary || ' | ', '') || 'Run did not finish within 15 minutes (marked stuck)'
   where status = 'running' and started_at < now() - interval '15 minutes';

  if exists (select 1 from link_check_runs where status = 'running') then
    return jsonb_build_object('ok', false, 'reason', 'already_running');
  end if;

  if p_trigger = 'manual' then
    select max(started_at) into v_last from link_check_runs;
    if v_last is not null and v_last > now() - interval '10 minutes' then
      return jsonb_build_object('ok', false, 'reason', 'too_soon',
                                'retry_after_seconds', ceil(extract(epoch from (v_last + interval '10 minutes' - now())))::int);
    end if;
  end if;

  begin
    insert into link_check_runs (trigger) values (p_trigger) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_running');
  end;

  return jsonb_build_object('ok', true, 'run_id', v_id);
end;
$$;

-- ── Retention ───────────────────────────────────────────────────
-- Keeps the database small: history and runs for ~13 months, and
-- links no longer present on the site for 6 months.
create or replace function public.site_link_health_prune()
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from link_check_history where changed_at < now() - interval '400 days';
  delete from link_check_runs    where started_at < now() - interval '400 days' and status <> 'running';
  delete from site_links         where not active and last_seen_at < now() - interval '180 days';
$$;

revoke all on function public.site_link_health_begin_run(text) from public, anon, authenticated;
revoke all on function public.site_link_health_prune()         from public, anon, authenticated;
grant execute on function public.site_link_health_begin_run(text) to service_role;
grant execute on function public.site_link_health_prune()         to service_role;
