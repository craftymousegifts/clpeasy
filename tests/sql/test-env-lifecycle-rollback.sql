-- PR #156 lifecycle checks against the REAL CLPeasy Test database functions.
-- Everything runs in ONE DO block that always ends with RAISE EXCEPTION, so
-- every row it creates (synthetic auth users, profiles, downloads) is rolled
-- back. The exception message carries the PASS/FAIL lines. Never run against
-- production. Synthetic users only: qa-rollback-*@example.test.
-- Run (26 Sep 2026) via the Supabase SQL runner on CLPeasy Test. Raw outputs
-- are kept in docs/reports/pr156-final-qa/test-db-rollback/. Paste the whole DO
-- block; the "error" returned IS the report. From 20260929000000 (owner
-- decision C1) T17 is a PASS check and T17b/T34-T37 cover the new rules;
-- from 20260930000000 (v13) T38-T41 cover the legacy re-download key transition;
-- from 20261002000000 (Easy Start Unlimited) T21-T23, T31, T32 and T37 expect
-- unlimited subscription downloads and T42-T47 cover the unlimited rules.
do $qa$
declare
  res text[] := '{}';
  fails int := 0;
  u uuid; r jsonb; p public.profiles%rowtype; n int;
  procedure_ok boolean;
begin
  -- helpers (inline): as_admin / as_user are set_config calls
  -- ── 1. expired trial -> PAYG purchase ─────────────────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-1@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set trial_end = now() - interval '2 days' where id = u;
  -- expired trial with 0 credits cannot download
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('expired::scented candle');
  if (r->>'ok')::boolean = false and r->>'reason'='no_downloads_remaining' then res := res || 'PASS T01 expired trial, 0 purchased: download blocked'::text; else res := res || ('FAIL T01 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  r := public.credit_payg_purchase(u, 8);
  select * into p from public.profiles where id = u;
  if p.subscription_status='payg' and p.plan='payg' and p.topup_credits=8 and p.downloads_limit=0 and (r->>'trial_converted')::boolean then res := res || 'PASS T02 expired trial + PAYG(8): converted to Pay As You Go, 8 purchased, trial allowance 0'::text; else res := res || ('FAIL T02 '||r::text); fails:=fails+1; end if;
  -- label downloads
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('lavender::scented candle');
  if (r->>'source')='purchased' and (r->>'clean_export')::boolean and (r->>'purchased_downloads')::int=7 then res := res || 'PASS T03 first export: clean, purchased 8 -> 7'::text; else res := res || ('FAIL T03 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('lavender::scented candle');
  if (r->>'free_redownload')::boolean and (r->>'purchased_downloads')::int=7 and (r->>'clean_export')::boolean then res := res || 'PASS T04 same label within 7 days: free, clean, stays 7'::text; else res := res || ('FAIL T04 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('lavender edited::scented candle');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=6 then res := res || 'PASS T05 renamed label: charged 7 -> 6'::text; else res := res || ('FAIL T05 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('lavender edited::wax melt');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=5 then res := res || 'PASS T06 same name, different product type: charged 6 -> 5'::text; else res := res || ('FAIL T06 '||r::text); fails:=fails+1; end if;
  r := public.consume_download(null);
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=4 then res := res || 'PASS T07 Composer sheet (no label key): always charged 5 -> 4'::text; else res := res || ('FAIL T07 '||r::text); fails:=fails+1; end if;
  -- 8 days later the same label is charged again
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.label_downloads set last_downloaded_at = now() - interval '8 days' where user_id=u and label_key='lavender::scented candle';
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('lavender::scented candle');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=3 then res := res || 'PASS T08 same label after 7 days: charged 4 -> 3'::text; else res := res || ('FAIL T08 '||r::text); fails:=fails+1; end if;
  -- client cannot write billing/counter columns directly (RLS + trigger).
  -- consume_download() sets request.jwt.claim.role=service_role for the rest
  -- of ITS transaction; a real PostgREST request is its own transaction, so
  -- reset the claim here to model a fresh customer request.
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  update public.profiles set topup_credits = 999, downloads_used = 0, downloads_limit = 999, plan='easy_pro', subscription_status='active', downloads_reset_date = current_date where id = u;
  execute 'reset role';
  select * into p from public.profiles where id = u;
  if p.topup_credits=3 and p.downloads_limit=0 and p.plan='payg' and p.subscription_status='payg' then res := res || 'PASS T09 signed-in customer cannot write credits/limit/plan/status/counters directly'::text; else res := res || ('FAIL T09 credits='||p.topup_credits||' plan='||p.plan); fails:=fails+1; end if;
  -- customer cannot call the crediting functions
  begin
    execute 'set local role authenticated';
    perform public.credit_payg_purchase(u, 100);
    execute 'reset role';
    res := res || 'FAIL T10 authenticated role could call credit_payg_purchase'::text; fails:=fails+1;
  exception when insufficient_privilege then
    execute 'reset role';
    res := res || 'PASS T10 customer cannot call credit_payg_purchase / credit themselves'::text;
  end;
  begin
    execute 'set local role authenticated';
    perform public.credit_purchased_downloads(u, 100);
    execute 'reset role';
    res := res || 'FAIL T11 authenticated role could call credit_purchased_downloads'::text; fails:=fails+1;
  exception when insufficient_privilege then
    execute 'reset role';
    res := res || 'PASS T11 customer cannot call credit_purchased_downloads'::text;
  end;
  -- PAYG at zero stays PAYG and is blocked
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform public.consume_download('a::candle'); perform public.consume_download('b::candle'); perform public.consume_download('c::candle');
  r := public.consume_download('d::candle');
  select * into p from public.profiles where id = u;
  if (r->>'ok')::boolean=false and p.subscription_status='payg' and p.plan='payg' and p.topup_credits=0 then res := res || 'PASS T12 PAYG at 0: blocked, account remains Pay As You Go'::text; else res := res || ('FAIL T12 '||r::text||' '||p.subscription_status); fails:=fails+1; end if;
  -- late subscription.deleted (the webhook's exact two updates) cannot revert PAYG
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='free', is_pro=false, downloads_limit=0, billing_cycle='monthly', subscription_status='cancelled' where id=u and subscription_status is distinct from 'payg';
  update public.profiles set is_pro=false, downloads_limit=0 where id=u and subscription_status='payg';
  select * into p from public.profiles where id = u;
  if p.subscription_status='payg' and p.plan='payg' then res := res || 'PASS T13 late Stripe deletion statements leave Pay As You Go intact'::text; else res := res || ('FAIL T13 '||p.subscription_status); fails:=fails+1; end if;
  -- buy again at zero: +8, stays PAYG
  r := public.credit_payg_purchase(u, 8);
  select * into p from public.profiles where id = u;
  if p.topup_credits=8 and p.subscription_status='payg' and not (r->>'trial_converted')::boolean then res := res || 'PASS T14 PAYG buys again at 0: +8, still Pay As You Go'::text; else res := res || ('FAIL T14 '||r::text); fails:=fails+1; end if;

  -- ── 2. live trial ───────────────────────────────────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-2@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('trial rose::scented candle');
  if (r->>'source')='plan' and not (r->>'clean_export')::boolean and (r->>'downloads_used')::int=1 then res := res || 'PASS T15 live trial: download uses trial allowance and is watermarked'::text; else res := res || ('FAIL T15 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  r := public.credit_payg_purchase(u, 8);
  select * into p from public.profiles where id = u;
  if p.subscription_status='payg' and p.downloads_limit=0 and p.trial_end <= now() and p.topup_credits=8 then res := res || 'PASS T16 live trial + PAYG: trial ends now, remaining trial allowance forfeited, 8 purchased'::text; else res := res || ('FAIL T16 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('trial rose::scented candle');
  -- Owner decision C1 (20260929000000): no longer re-issued free+watermarked.
  if (r->>'consumed')::boolean and (r->>'clean_export')::boolean and (r->>'source')='purchased' and (r->>'purchased_downloads')::int=7 then res := res || 'PASS T17 C1: trial-watermarked label re-downloaded after buying PAYG is charged once (8 -> 7) and clean'::text; else res := res || ('FAIL T17 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('trial rose::scented candle');
  if (r->>'free_redownload')::boolean and (r->>'clean_export')::boolean and (r->>'purchased_downloads')::int=7 then res := res || 'PASS T17b C1: that clean download then re-downloads free and clean'::text; else res := res || ('FAIL T17b '||r::text); fails:=fails+1; end if;
  r := public.consume_download('new label::scented candle');
  if (r->>'source')='purchased' and (r->>'clean_export')::boolean and (r->>'purchased_downloads')::int=6 then res := res || 'PASS T18 converted trial: new label is clean from purchased downloads'::text; else res := res || ('FAIL T18 '||r::text); fails:=fails+1; end if;

  -- ── 3. active Easy Start monthly at limit, top-ups ─────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-3@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='easy_start', subscription_status='active', downloads_limit=20, downloads_used=20, billing_cycle='monthly', downloads_reset_date=(current_date - 3) where id=u;
  perform public.credit_purchased_downloads(u, 5);
  select * into p from public.profiles where id = u;
  if p.topup_credits=5 then res := res || 'PASS T19 5-download top-up credits exactly 5'::text; else res := res || ('FAIL T19 '||p.topup_credits); fails:=fails+1; end if;
  perform public.credit_purchased_downloads(u, 10);
  select * into p from public.profiles where id = u;
  if p.topup_credits=15 then res := res || 'PASS T20 10-download top-up credits exactly 10 (5+10=15)'::text; else res := res || ('FAIL T20 '||p.topup_credits); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('start::candle');
  if (r->>'source')='subscription' and (r->>'unlimited')::boolean and (r->>'clean_export')::boolean and not (r->>'consumed')::boolean and (r->>'downloads_used')::int=20 and (r->>'purchased_downloads')::int=15 then res := res || 'PASS T21 Easy Start Unlimited at old 20/20: clean, consumes nothing (no counter, purchased kept 15)'::text; else res := res || ('FAIL T21 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set downloads_used=3 where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('start2::candle');
  select * into p from public.profiles where id = u;
  if (r->>'source')='subscription' and (r->>'clean_export')::boolean and (r->>'purchased_downloads')::int=15 and p.downloads_used=3 then res := res || 'PASS T22 Easy Start Unlimited: counter never moves (3 stays 3), purchased untouched'::text; else res := res || ('FAIL T22 '||r::text); fails:=fails+1; end if;
  -- cancel at period end, still paid
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set subscription_status='cancelled', deletion_date=now()+interval '10 days' where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('start3::candle');
  if (r->>'source')='subscription' and (r->>'unlimited')::boolean and (r->>'clean_export')::boolean and not (r->>'consumed')::boolean then res := res || 'PASS T23 cancel-at-period-end inside paid period stays unlimited'::text; else res := res || ('FAIL T23 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  r := public.credit_payg_purchase(u, 8);
  if not (r->>'trial_converted')::boolean and (r->>'subscription_status')='cancelled' then res := res || 'PASS T24 cancel-scheduled subscriber credited by PAYG webhook is NOT converted (checkout refuses them anyway)'::text; else res := res || ('FAIL T24 '||r::text); fails:=fails+1; end if;
  -- paid period now over -> ended subscriber
  update public.profiles set deletion_date=now()-interval '1 day' where id=u;
  r := public.credit_payg_purchase(u, 8);
  select * into p from public.profiles where id = u;
  if (r->>'trial_converted')::boolean and p.plan='payg' and p.subscription_status='payg' and p.downloads_limit=0 then res := res || 'PASS T25 paid period over + PAYG: converts to Pay As You Go, subscription allowance removed'::text; else res := res || ('FAIL T25 '||r::text); fails:=fails+1; end if;
  select count(*) into n from public.label_downloads where user_id=u;
  if n=3 then res := res || 'PASS T26 conversion keeps download history (3 label records)'::text; else res := res || ('FAIL T26 '||n); fails:=fails+1; end if;

  -- ── 4. paused ────────────────────────────────────────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-4@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='easy_pro', is_pro=true, subscription_status='paused', downloads_limit=30, downloads_used=2, billing_cycle='monthly' where id=u;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('paused::candle');
  if (r->>'ok')::boolean=false then res := res || 'PASS T27 paused subscriber with no purchased downloads: blocked (allowance not usable while paused)'::text; else res := res || ('FAIL T27 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  r := public.credit_payg_purchase(u, 8);
  select * into p from public.profiles where id = u;
  if p.subscription_status='paused' and p.plan='easy_pro' and p.topup_credits=8 then res := res || 'PASS T28 paused + PAYG: credited, remains paused Easy Pro (not converted)'::text; else res := res || ('FAIL T28 '||r::text); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('paused::candle');
  if (r->>'source')='purchased' and (r->>'clean_export')::boolean then res := res || 'PASS T29 paused: exports from purchased downloads, clean'::text; else res := res || ('FAIL T29 '||r::text); fails:=fails+1; end if;

  -- ── 5. ended (downgraded) ─────────────────────────────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-5@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='free', is_pro=false, subscription_status='cancelled', downloads_limit=0, downloads_used=4 where id=u;
  r := public.credit_payg_purchase(u, 8);
  select * into p from public.profiles where id = u;
  if (r->>'trial_converted')::boolean and (r->>'previous_status')='cancelled' and p.plan='payg' then res := res || 'PASS T30 fully ended subscriber + PAYG: current plan becomes Pay As You Go'::text; else res := res || ('FAIL T30 '||r::text); fails:=fails+1; end if;

  -- ── 6. annual refill ──────────────────────────────────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-6@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='easy_pro', is_pro=true, subscription_status='active', downloads_limit=30, downloads_used=30, billing_cycle='annual', downloads_reset_date=(current_date - 40) where id=u;
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('annual::candle');
  select * into p from public.profiles where id = u;
  if (r->>'source')='subscription' and (r->>'unlimited')::boolean and p.downloads_used=30 then res := res || ('PASS T31 annual (legacy Pro) at old 30/30: unlimited, nothing consumed, no refill needed')::text; else res := res || ('FAIL T31 '||r::text||' reset='||p.downloads_reset_date); fails:=fails+1; end if;
  r := public.consume_download('annual2::candle');
  select * into p from public.profiles where id = u;
  if p.downloads_used=30 and (r->>'unlimited')::boolean then res := res || 'PASS T32 annual: next download also unlimited, counter unchanged'::text; else res := res || ('FAIL T32 used='||p.downloads_used); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set subscription_status='paused', downloads_used=30, downloads_reset_date=(current_date - 5) where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('annual3::candle');
  select * into p from public.profiles where id = u;
  if (r->>'ok')::boolean=false and p.downloads_used=30 then res := res || 'PASS T33 paused annual plan is not refilled'::text; else res := res || ('FAIL T33 '||r::text); fails:=fails+1; end if;

  -- ── 7. C1 fixed 7-day window, size in key, annual corner case ─────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-7@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.credit_payg_purchase(u, 5);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('amber::wax melt::square::40x40mm');
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.label_downloads set last_downloaded_at = now() - interval '6 days' where user_id=u and label_key='amber::wax melt::square::40x40mm';
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('amber::wax melt::square::40x40mm');
  select count(*) into n from public.label_downloads where user_id=u and label_key='amber::wax melt::square::40x40mm' and last_downloaded_at < now() - interval '5 days';
  if (r->>'free_redownload')::boolean and (r->>'purchased_downloads')::int=4 and n=1 then res := res || 'PASS T34 C1: day-6 re-download is free and does NOT move the charged-download time'::text; else res := res || ('FAIL T34 '||r::text||' n='||n); fails:=fails+1; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.label_downloads set last_downloaded_at = now() - interval '8 days' where user_id=u and label_key='amber::wax melt::square::40x40mm';
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('amber::wax melt::square::40x40mm');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=3 then res := res || 'PASS T35 C1: 8 days after the charged download it is charged again (window fixed, not extended by the day-6 re-download)'::text; else res := res || ('FAIL T35 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('amber::wax melt::square::60x60mm');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=2 then res := res || 'PASS T36 C1: same label at another physical size is a new charged download'::text; else res := res || ('FAIL T36 '||r::text); fails:=fails+1; end if;
  -- annual corner case: trial watermarked label, then annual Pro at 30/30 with the monthly refill due
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-8@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('oud::pillar candle::circle::70x70mm');
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='easy_pro', is_pro=true, subscription_status='active', billing_cycle='annual', downloads_limit=30, downloads_used=30, downloads_reset_date=(current_date - 2) where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('oud::pillar candle::circle::70x70mm');
  select * into p from public.profiles where id = u;
  if not (r->>'consumed')::boolean and (r->>'source')='subscription' and (r->>'clean_export')::boolean and p.downloads_used=30 then res := res || 'PASS T37 trial-watermarked label after subscribing: re-issued clean by the unlimited subscription, nothing consumed'::text; else res := res || ('FAIL T37 '||r::text); fails:=fails+1; end if;

  -- ── 8. v13 transition: re-download history under the OLD key (name::type) ──
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-9@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.credit_payg_purchase(u, 5);
  insert into public.label_downloads(user_id,label_key,last_downloaded_at,clean_export) values
    (u,'legacy clean::scented candle', now() - interval '5 days', true),
    (u,'legacy wm::scented candle', now() - interval '2 days', false),
    (u,'legacy old::scented candle', now() - interval '8 days', true);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('legacy clean::scented candle::circle::52x52mm', 'legacy clean::scented candle');
  select count(*) into n from public.label_downloads where user_id=u and label_key='legacy clean::scented candle::circle::52x52mm' and last_downloaded_at < now() - interval '4 days';
  if (r->>'free_redownload')::boolean and (r->>'clean_export')::boolean and (r->>'purchased_downloads')::int=5 and n=1
     and not exists(select 1 from public.label_downloads where user_id=u and label_key='legacy clean::scented candle') then res := res || 'PASS T38 transition: legacy clean record inside its 7 days -> free, clean, ORIGINAL time kept, legacy record claimed'::text; else res := res || ('FAIL T38 '||r::text||' n='||n); fails:=fails+1; end if;
  r := public.consume_download('legacy clean::scented candle::circle::70x70mm', 'legacy clean::scented candle');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=4 then res := res || 'PASS T39 transition: a different size after the transition is charged'::text; else res := res || ('FAIL T39 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('legacy wm::scented candle::circle::52x52mm', 'legacy wm::scented candle');
  if (r->>'consumed')::boolean and (r->>'clean_export')::boolean and (r->>'purchased_downloads')::int=3 then res := res || 'PASS T40 transition: legacy watermarked record + paid downloads -> charged once, clean'::text; else res := res || ('FAIL T40 '||r::text); fails:=fails+1; end if;
  r := public.consume_download('legacy old::scented candle::circle::52x52mm', 'legacy old::scented candle');
  if (r->>'consumed')::boolean and (r->>'purchased_downloads')::int=2 then res := res || 'PASS T41 transition: legacy record outside 7 days -> charged'::text; else res := res || ('FAIL T41 '||r::text); fails:=fails+1; end if;

  -- ── 9. Easy Start Unlimited (2 Oct 2026) ───────────────────────────
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-rollback-10@example.test', '{}'::jsonb, now(), now());
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='easy_start', is_pro=false, subscription_status='active', downloads_limit=20, downloads_used=20, billing_cycle='annual', downloads_reset_date=(current_date - 40) where id=u;
  perform public.credit_payg_purchase(u, 8);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  for n in 1..25 loop r := public.consume_download('unl'||n||'::candle::circle::60x60mm'); end loop;
  r := public.consume_download(null);
  select * into p from public.profiles where id = u;
  if (r->>'unlimited')::boolean and p.downloads_used=20 and p.topup_credits=8 and p.downloads_reset_date=(current_date - 40) then res := res || 'PASS T42 annual Easy Start Unlimited: 25 labels + a Composer sheet, nothing consumed, PAYG kept (8), no refill write'::text; else res := res || ('FAIL T42 '||r::text||' used='||p.downloads_used||' purchased='||p.topup_credits); fails:=fails+1; end if;
  select count(*) into n from public.label_downloads where user_id=u and clean_export;
  if n=25 then res := res || 'PASS T43 unlimited downloads are recorded clean (25 label records)'::text; else res := res || ('FAIL T43 n='||n); fails:=fails+1; end if;
  -- paid period over but not yet downgraded by the webhook: NOT unlimited, PAYG used
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set subscription_status='cancelled', deletion_date=now()-interval '1 hour' where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download('after::candle::circle::60x60mm');
  if (r->>'unlimited') is null and (r->>'source')='purchased' and (r->>'purchased_downloads')::int=7 then res := res || 'PASS T44 cancelled past the paid period: unlimited ends, Pay As You Go used (8 -> 7)'::text; else res := res || ('FAIL T44 '||r::text); fails:=fails+1; end if;
  -- paused: NOT unlimited
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set subscription_status='paused', deletion_date=null where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download(null);
  if (r->>'unlimited') is null and (r->>'source')='purchased' and (r->>'purchased_downloads')::int=6 then res := res || 'PASS T45 paused: not unlimited, purchased download used (7 -> 6)'::text; else res := res || ('FAIL T45 '||r::text); fails:=fails+1; end if;
  -- ended (downgraded to free): NOT unlimited
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.profiles set plan='free', subscription_status='cancelled', downloads_limit=0 where id=u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download(null);
  if (r->>'unlimited') is null and (r->>'source')='purchased' and (r->>'purchased_downloads')::int=5 then res := res || 'PASS T46 ended subscription: not unlimited, purchased download used (6 -> 5)'::text; else res := res || ('FAIL T46 '||r::text); fails:=fails+1; end if;
  -- customer cannot make themselves unlimited (same model as T09)
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  update public.profiles set plan='easy_start', subscription_status='active', deletion_date=null where id=u;
  execute 'reset role';
  select * into p from public.profiles where id = u;
  perform set_config('request.jwt.claim.role','authenticated',true);
  r := public.consume_download(null);
  if p.plan='free' and (r->>'unlimited') is null and (r->>'purchased_downloads')::int=4 then res := res || 'PASS T47 customer cannot write plan/status to become unlimited'::text; else res := res || ('FAIL T47 plan='||p.plan||' '||r::text); fails:=fails+1; end if;

  raise exception 'QA_RESULTS fails=% %', fails, E'\n' || array_to_string(res, E'\n');
end
$qa$;
