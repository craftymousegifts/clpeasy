-- ═══════════════════════════════════════════════════════════════
-- CLPeasy — Website & Link Health Monitor (weekly schedule)
-- ─────────────────────────────────────────────────────────────────
-- pg_cron + pg_net call the site-link-health Edge Function once a
-- week: Mondays 03:17 UTC (low-traffic, off the hour).
--
-- Authentication of the scheduled call: a random token is generated
-- INSIDE the database and kept in Supabase Vault
-- ('site_link_health_cron_token'). The cron job sends it in the
-- x-link-health-token header; the Edge Function checks it with
-- site_link_health_verify_cron_token(), which only the service role
-- can execute. The token is never in the repository or the browser.
-- Same Vault pattern as notify_beta_tester_email().
--
-- The Authorization header carries the project's PUBLIC anon key
-- (already published in the site's pages) only so the Functions
-- gateway accepts the request; it grants nothing by itself.
--
-- Overlapping runs are prevented in site_link_health_begin_run().
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'site_link_health_cron_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'site_link_health_cron_token',
      'Shared token: pg_cron weekly job -> site-link-health Edge Function'
    );
  end if;
end $$;

create or replace function public.site_link_health_verify_cron_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'site_link_health_cron_token'
   limit 1;
  return v_secret is not null and v_secret = p_token;
end;
$$;

revoke all on function public.site_link_health_verify_cron_token(text) from public, anon, authenticated;
grant execute on function public.site_link_health_verify_cron_token(text) to service_role;

-- Re-runnable: replace any previous definition of the job.
select cron.unschedule(jobid) from cron.job where jobname = 'site-link-health-weekly';

select cron.schedule(
  'site-link-health-weekly',
  '17 3 * * 1',
  $job$
  select net.http_post(
    url := 'https://qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/site-link-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2a29zZHFjcnlyY2ZianRheGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTkzOTIsImV4cCI6MjA5NTI5NTM5Mn0.Uo18YEjMKN3vgQ4WGgrdZR4eVa85M1ubAv-FIYUYAYw',
      'x-link-health-token', (select decrypted_secret from vault.decrypted_secrets
                              where name = 'site_link_health_cron_token' limit 1)
    ),
    body := jsonb_build_object('action', 'run', 'trigger', 'scheduled'),
    timeout_milliseconds := 15000
  );
  $job$
);
