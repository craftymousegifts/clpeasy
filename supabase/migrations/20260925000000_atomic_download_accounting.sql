-- Atomic download accounting for subscriptions, trials and Pay As You Go.
-- Customer-facing terminology is "downloads"; topup_credits remains the
-- legacy internal column name for the non-expiring purchased-download balance.
--
-- One call = one finished exported file. Composer A4 exports therefore call
-- this once for the whole sheet, regardless of how many labels are on it.
-- Preserve the entitlement attached to the original individual-label export.
-- This makes a free 7-day re-download deterministic after a PAYG balance reaches
-- zero or after a trial/subscription state changes.
alter table public.label_downloads
  add column if not exists clean_export boolean not null default false;

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
  v_clean_export boolean := false;
  v_source text := null;
begin
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

  -- A paid subscription is usable while active. A trial is usable only until
  -- its stored trial_end. Purchased downloads are independent and never expire.
  v_subscription_usable :=
    v_profile.subscription_status = 'active'
    or (
      v_profile.subscription_status = 'trialing'
      and v_profile.trial_end is not null
      and v_profile.trial_end > v_now
    );

  if v_subscription_usable
     and coalesce(v_profile.downloads_used,0) < coalesce(v_profile.downloads_limit,0) then
    v_clean_export := v_profile.subscription_status = 'active';
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
grant execute on function public.consume_download(text) to authenticated;
