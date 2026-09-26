-- PR #156 owner decision C1 (26 Sep 2026): same-label re-download rules.
--
-- consume_download() is unchanged from 20260927000000 except:
--  1. A label first downloaded WATERMARKED (free trial) is no longer
--     re-issued free and watermarked once the customer can download clean:
--     that re-download is charged once and delivered clean. Later
--     re-downloads of that clean download follow the normal free rule.
--  2. The 7-day free re-download period is FIXED from the last charged
--     download of the label. A free re-download no longer moves
--     label_downloads.last_downloaded_at, so it cannot extend the period.
--  3. The annual monthly refill now runs BEFORE the re-download decision, so
--     "can download clean" uses the refilled allowance (corner case found in
--     the recovered, unapplied B1 proposal).
-- The Builder's label key now also includes the physical label size (see
-- builder.html computeLabelKey); the key is opaque text to this function.
-- Permissions are unchanged: authenticated may execute, anon/public may not.

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
  v_next_reset timestamptz;
  v_prior_clean boolean := false;
  v_clean_available boolean := false;
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
    and coalesce(v_profile.plan,'free') not in ('free','trial','cancelled','paused','payg')
    and coalesce(v_profile.downloads_limit,0) > 0
    and (v_profile.deletion_date is null or v_profile.deletion_date > v_now);

  v_plan_clean := v_profile.subscription_status = 'active' or v_cancel_scheduled;

  -- Annual plans are sold as "20/30 downloads per month" (pricing.html), and
  -- stripe-webhook sets downloads_reset_date one month ahead even for annual
  -- billing. The only monthly refill for annual plans was a browser-side
  -- reset in builder.html, which PR #156 removed (and which let customers
  -- write their own counter — closed by 20260928000000). invoice.paid refills
  -- monthly plans; annual plans are refilled here, atomically, at the first
  -- download after each monthly reset date.
  if coalesce(v_profile.billing_cycle,'') = 'annual'
     and v_plan_clean
     and v_profile.downloads_reset_date is not null
     and v_profile.downloads_reset_date <= v_now then
    v_next_reset := v_profile.downloads_reset_date;
    while v_next_reset <= v_now loop
      v_next_reset := v_next_reset + interval '1 month';
    end loop;
    update public.profiles
    set downloads_used = 0, downloads_reset_date = v_next_reset
    where id = v_user_id
    returning * into v_profile;
  end if;

  -- A clean download is available now if the charge below would produce a
  -- clean file: paid-plan allowance left (after any annual refill above) or
  -- purchased downloads. Computed AFTER the annual refill, so an annual
  -- customer whose monthly refill is due is correctly treated as able to
  -- download clean (the corner case in the recovered B1 proposal).
  v_clean_available :=
    (v_plan_clean and coalesce(v_profile.downloads_used,0) < coalesce(v_profile.downloads_limit,0))
    or coalesce(v_profile.topup_credits,0) > 0;

  -- 7-day same-label re-download (approved 26 Sep 2026, owner decision C1).
  -- Individual labels pass their label key (the Builder's key includes the
  -- physical label size). Sheet exports pass NULL, so every finished A4
  -- export consumes exactly one.
  --  * The 7 days are FIXED from the last CHARGED download of that label:
  --    label_downloads.last_downloaded_at is written only when a download is
  --    charged, never by a free re-download, so re-downloading cannot extend
  --    the free period indefinitely.
  --  * A free re-download keeps the clean/watermarked status of that charged
  --    download, EXCEPT that a watermarked (trial) download is not re-issued
  --    free once the customer can download clean: it falls through and is
  --    charged once as a new clean download, which starts a new 7 days.
  if p_label_key is not null and length(trim(p_label_key)) > 0 then
    select last_downloaded_at, clean_export into v_recent, v_prior_clean
    from public.label_downloads
    where user_id = v_user_id and label_key = p_label_key;

    if v_recent is not null and v_recent >= v_now - interval '7 days'
       and (v_prior_clean or not v_clean_available) then
      return jsonb_build_object(
        'ok', true,
        'consumed', false,
        'free_redownload', true,
        'source', 'redownload',
        'clean_export', v_prior_clean,
        'downloads_used', coalesce(v_profile.downloads_used,0),
        'downloads_limit', coalesce(v_profile.downloads_limit,0),
        'purchased_downloads', coalesce(v_profile.topup_credits,0)
      );
    end if;
  end if;

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

comment on column public.label_downloads.last_downloaded_at is
  'Time of the last CHARGED download of this label key (free re-downloads do not update it). Start of the fixed 7-day free re-download period.';

revoke all on function public.consume_download(text) from public;
revoke all on function public.consume_download(text) from anon;
grant execute on function public.consume_download(text) to authenticated;
