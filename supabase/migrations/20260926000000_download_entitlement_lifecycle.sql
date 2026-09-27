-- Download entitlement lifecycle corrections for PR #156 (Pay As You Go).
-- NOT YET APPLIED ANYWHERE. Replaces public.consume_download() from
-- 20260925000000_atomic_download_accounting.sql; everything else in that
-- migration (clean_export column, credit_purchased_downloads, grants) is
-- unchanged. The browser mirror of these rules is entitlement.js.
--
-- 1. Scheduled cancellation (cancel_at_period_end) keeps its paid, clean
--    plan allowance until deletion_date, instead of losing it immediately.
-- 2. A live-trial customer who has purchased downloads receives a clean
--    purchased download instead of spending a watermarked trial download.
-- Paused subscriptions, expired trials, the 7-day same-label grace and the
-- anon/authenticated/service_role permissions behave exactly as before.

create or replace function public.consume_download(p_label_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_recent timestamptz;
  v_subscription_usable boolean := false;
  v_plan_clean boolean := false;
  v_cancel_scheduled boolean := false;
  v_clean_export boolean := false;
  v_source text := null;
begin
  -- profiles has a billing-field protection trigger that permits billing
  -- mutations only when the caller JWT is service_role. This RPC is SECURITY
  -- DEFINER but retains the authenticated caller's JWT, so without a local
  -- service-role claim the trigger silently restores downloads_used/topup_credits.
  -- The function itself is executable only by authenticated users and always
  -- operates on auth.uid(), so scope the bypass to this transaction only.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  -- Individual labels may pass their stable label key. The existing public
  -- promise is that re-downloading the same label within 7 days is free.
  -- Sheet exports pass NULL, so every finished A4 export consumes exactly one.
  if p_label_key is not null and length(trim(p_label_key)) > 0 then
    select last_downloaded_at, clean_export into v_recent, v_clean_export
    from public.label_downloads
    where user_id = v_user_id and label_key = p_label_key;

    if v_recent is not null and v_recent >= v_now - interval '7 days' then
      update public.label_downloads
      set last_downloaded_at = v_now
      where user_id = v_user_id and label_key = p_label_key;

      return jsonb_build_object(
        'ok', true,
        'consumed', false,
        'free_redownload', true,
        'source', 'redownload',
        'clean_export', v_clean_export,
        'downloads_used', coalesce(v_profile.downloads_used,0),
        'downloads_limit', coalesce(v_profile.downloads_limit,0),
        'purchased_downloads', coalesce(v_profile.topup_credits,0)
      );
    end if;
  end if;

  -- A paid subscription is usable while active, and also while a scheduled
  -- cancellation is still inside the period the customer has paid for:
  -- stripe-webhook sets subscription_status='cancelled' + deletion_date
  -- (Stripe cancel_at) when cancel_at_period_end is set, and only
  -- downgradeToFree() (plan='free', downloads_limit=0) removes paid access
  -- when the subscription genuinely ends. account.html promises "Access
  -- continues until" that date. A paused subscription is not usable
  -- ("Downloads are paused"). A trial is usable only until trial_end, and
  -- its downloads are watermarked. Purchased downloads never expire.
  v_cancel_scheduled :=
    v_profile.subscription_status = 'cancelled'
    and coalesce(v_profile.plan,'free') not in ('free','trial','cancelled','paused')
    and coalesce(v_profile.downloads_limit,0) > 0
    and (v_profile.deletion_date is null or v_profile.deletion_date > v_now);

  v_plan_clean := v_profile.subscription_status = 'active' or v_cancel_scheduled;

  v_subscription_usable :=
    v_plan_clean
    or (
      v_profile.subscription_status = 'trialing'
      and v_profile.trial_end is not null
      and v_profile.trial_end > v_now
    );

  -- If the plan allowance would only produce a watermarked (trial) file and
  -- the customer has purchased downloads, use the purchased download so a
  -- paying customer receives the clean file they paid for.
  if v_subscription_usable
     and coalesce(v_profile.downloads_used,0) < coalesce(v_profile.downloads_limit,0)
     and (v_plan_clean or coalesce(v_profile.topup_credits,0) <= 0) then
    v_clean_export := v_plan_clean;
    v_source := 'plan';
    update public.profiles
    set downloads_used = coalesce(downloads_used,0) + 1
    where id = v_user_id
    returning * into v_profile;
  elsif coalesce(v_profile.topup_credits,0) > 0 then
    v_clean_export := true;
    v_source := 'purchased';
    update public.profiles
    set topup_credits = coalesce(topup_credits,0) - 1
    where id = v_user_id
    returning * into v_profile;
  else
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_downloads_remaining',
      'downloads_used', coalesce(v_profile.downloads_used,0),
      'downloads_limit', coalesce(v_profile.downloads_limit,0),
      'purchased_downloads', coalesce(v_profile.topup_credits,0)
    );
  end if;

  if p_label_key is not null and length(trim(p_label_key)) > 0 then
    insert into public.label_downloads(user_id,label_key,last_downloaded_at,clean_export)
    values(v_user_id,p_label_key,v_now,v_clean_export)
    on conflict(user_id,label_key)
    do update set last_downloaded_at = excluded.last_downloaded_at,
                  clean_export = excluded.clean_export;
  end if;

  return jsonb_build_object(
    'ok', true,
    'consumed', true,
    'free_redownload', false,
    'source', v_source,
    'clean_export', v_clean_export,
    'downloads_used', coalesce(v_profile.downloads_used,0),
    'downloads_limit', coalesce(v_profile.downloads_limit,0),
    'purchased_downloads', coalesce(v_profile.topup_credits,0)
  );
end;
$$;

revoke all on function public.consume_download(text) from public;
revoke all on function public.consume_download(text) from anon;
grant execute on function public.consume_download(text) to authenticated;
