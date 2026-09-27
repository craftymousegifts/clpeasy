-- Protect the plan download counters from direct client writes.
-- NOT YET APPLIED TO PRODUCTION.
--
-- Found while preparing CLPeasy Test (26 Sep 2026): the production
-- protect_profile_billing_columns() trigger resets every billing column for
-- non-service-role callers EXCEPT downloads_used and downloads_reset_date,
-- and RLS lets a signed-in user update their own profile row. So any
-- customer could PATCH their own downloads_used back to 0 through the public
-- REST API and get unlimited plan downloads (and move their reset date).
-- No page writes these columns any more (consume_download() and the Stripe
-- webhook do, as the service role), so they are added to the protected list.
-- Everything else in the function is unchanged from production.
create or replace function public.protect_profile_billing_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  new.is_pro                   := old.is_pro;
  new.plan                     := old.plan;
  new.subscription_status      := old.subscription_status;
  new.downloads_limit          := old.downloads_limit;
  new.downloads_used           := old.downloads_used;
  new.downloads_reset_date     := old.downloads_reset_date;
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
$function$;
