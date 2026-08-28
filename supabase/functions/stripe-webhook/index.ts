import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// ── BREVO CONFIG ──────────────────────────────────────────────
// Set BREVO_API_KEY and BREVO_PAID_LIST_ID in Supabase secrets
// BREVO_PAID_LIST_ID = the list ID you get from Brevo after creating "CLPeasy Paid Subscribers"
// BREVO_PAID_AUTOMATION_ID = the automation workflow ID for the paid sequence (set after building in Brevo)
async function addToBrevoPayList(email: string, firstName: string, planLabel: string): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const listId = Deno.env.get('BREVO_PAID_LIST_ID');

  if (!apiKey || !listId) {
    console.warn('Brevo paid list config missing — skipping Brevo upsert');
    return;
  }

  try {
    const upsertRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName || '',
          PLAN: planLabel,
        },
        listIds: [parseInt(listId, 10)],
        updateEnabled: true,
      }),
    });

    console.log(`Brevo paid contact upsert HTTP ${upsertRes.status} for ${email}`);

    if (!upsertRes.ok) {
      const errorText = await upsertRes.text();
      console.error(`Brevo paid contact upsert failed: ${errorText}`);
    }
  } catch (err) {
    // Non-fatal — Stripe subscription processing continues
    console.error('Brevo paid list error (non-fatal):', err);
  }
}

// ── PLAN LABEL for Brevo attribute ───────────────────────────
function getPlanLabel(priceId: string): string {
  const map: Record<string, string> = {
    // Live price IDs
    'price_1TdoEYGZLILz5vqUIqlEsf4X': 'Easy Start Monthly',
    'price_1TdoEXGZLILz5vqUQj5n6Zri': 'Easy Start Annual',
    'price_1TdoEXGZLILz5vqUvZKB1RQw': 'Easy Pro Monthly',
    'price_1TdoEXGZLILz5vqUFgTznTUT': 'Easy Pro Annual',

    // Legacy/sandbox price IDs — NOT used by any live checkout entry point
    // (confirmed 2026-07-28, AUDIT_AND_FIX_LOG.md: pricing.html/checkout.html/
    // account.html all exclusively send the "Live price IDs" above). Retained
    // here deliberately for backwards compatibility in case any already-issued
    // Stripe object still references one of these — not archived, not removed.
    'price_1Tdd5SKF3jvQfgEaclfSUxn5': 'Easy Start Monthly',
    'price_1Tdd7pKF3jvQfgEa8DxgQHEW': 'Easy Start Annual',
    'price_1Tdd9OKF3jvQfgEaYsCmOwOa': 'Easy Pro Monthly',
    'price_1TddAyKF3jvQfgEaE7Vwbxl6': 'Easy Pro Annual',

    // Test Mode price IDs
    'price_1TyDuRGZLILz5vqU3RIuVFJD': 'Easy Start Monthly',
    'price_1TyDxBGZLILz5vqUEKx7d2jp': 'Easy Pro Monthly',
    'price_1TyrwjGZLILz5vqUjYaiQtfL': 'Easy Start Annual',
    'price_1TyryIGZLILz5vqU5OaMB0jG': 'Easy Pro Annual',
  };
  return map[priceId] ?? 'Unknown Plan';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  console.log('Stripe event received:', event.type);

  // ── IDEMPOTENCY GUARD ───────────────────────────────────────────
  // Stripe may redeliver the same event (timeouts, ambiguous responses,
  // manual resends) — without this, a redelivered checkout.session.completed
  // for a top-up would double-credit downloads/topup_months, since those
  // paths do non-idempotent increments rather than idempotent absolute-value
  // writes like the other handlers below. Same atomic-unique-constraint
  // pattern already used for checkout_locks: claim event.id first: a second
  // insert for the same id fails outright rather than racing, so only one
  // invocation ever proceeds past this point.
  const { error: dedupeError } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: event.id, event_type: event.type });

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      // Genuine duplicate delivery of an already-processed event — skip all
      // side effects, but still return 200 so Stripe does not keep retrying.
      console.log(`Duplicate event ${event.id} (${event.type}) — already processed, skipping.`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Any other error claiming the dedupe marker (e.g. a transient DB issue)
    // — don't risk silently dropping a legitimate event. Log and fall
    // through to process normally; worst case is a rare double-process
    // rather than a silently skipped webhook.
    console.error('stripe_processed_events insert error (non-duplicate):', dedupeError);
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId        = session.metadata?.userId;
        const priceId       = session.metadata?.priceId;
        const type          = session.metadata?.type;   // 'topup' for one-off packs
        const customerId    = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId) { console.error('No userId in session metadata'); break; }

        // ── ONE-OFF TOP-UP PURCHASE ──────────────────────────────
        // FIX (2026-07-30, top-up credits separation): previously wrote
        // downloads_limit: current + credits, blending the purchased credit
        // into the same field applyProfilePlan() unconditionally overwrites
        // to the plan base on every invoice.paid — silently wiping any
        // unused top-up at the customer's next renewal despite "Credits
        // never expire" being shown throughout the marketing copy. Now
        // written to the dedicated, protected topup_credits column instead,
        // which no other handler in this file ever touches. topup_months is
        // incremented in the same update so the existing (previously dead —
        // nothing incremented it) Easy Pro upgrade nudge on account.html
        // starts working; both writes are covered by the idempotency guard
        // above, so a redelivered event cannot double-credit either field.
        if (type === 'topup') {
          const credits = TOPUP_CREDITS[priceId ?? ''] ?? 0;
          if (credits === 0) { console.error('Unknown top-up priceId:', priceId); break; }

          const { data: profile } = await supabase
            .from('profiles')
            .select('topup_credits, topup_months')
            .eq('id', userId)
            .single();

          const currentCredits = profile?.topup_credits ?? 0;
          const currentTopupMonths = profile?.topup_months ?? 0;
          await supabase.from('profiles').update({
            topup_credits: currentCredits + credits,
            topup_months: currentTopupMonths + 1,
          }).eq('id', userId);

          console.log(`Top-up: +${credits} credits (balance ${currentCredits + credits}) for user ${userId}; topup_months now ${currentTopupMonths + 1}`);
          break;
        }

        // ── SUBSCRIPTION PURCHASE ────────────────────────────────
        const plan = getPlanFromPriceId(priceId!);
        // FIX (28 Aug 2026): this upsert's error was previously discarded —
        // a failure here (e.g. a future schema/permission change) left the
        // customer showing subscription_status:'active' on their profile
        // with no row in `subscriptions` at all, breaking the Stripe billing
        // portal (create-portal-session 404s with no stripe_customer_id to
        // hand it). Logging only, not throwing — the idempotency claim above
        // has already been made, so aborting here would make Stripe's retry
        // of this event get silently skipped as a "duplicate" instead of
        // actually reprocessing; profile/plan activation below must still
        // proceed so the customer isn't blocked over a logging concern.
        const { error: subUpsertError } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          price_id: priceId,
          plan: plan,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (subUpsertError) {
          console.error('❌ subscriptions upsert FAILED (checkout.session.completed):', {
            userId, error: subUpsertError.message, code: subUpsertError.code, details: subUpsertError.details,
          });
        }

        await applyProfilePlan(userId, priceId!);
        await supabase.from('profiles').update({ subscription_status: 'active' }).eq('id', userId);
        console.log(`Subscription activated for user ${userId} — plan: ${plan}`);

        // ── ADD TO BREVO PAID LIST ───────────────────────────────
        const customerEmail = session.customer_details?.email || session.customer_email || '';
        const customerName  = session.customer_details?.name || '';
        if (customerEmail) {
          await addToBrevoPayList(customerEmail, customerName.split(' ')[0] || '', getPlanLabel(priceId!));
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        // Only the changed fields, with their PRIOR values — the one
        // reliable signal for telling a genuine reactivation apart from an
        // ordinary update, since subscription.status alone stays 'active'
        // throughout a pause, a scheduled cancellation, and after
        // reactivation alike.
        const prev = (event.data as any).previous_attributes as Partial<Stripe.Subscription> | undefined;
        const userId  = subscription.metadata?.userId;
        if (!userId) break;

        const priceId = subscription.items.data[0]?.price.id;
        const plan    = getPlanFromPriceId(priceId!);
        const status  = subscription.status === 'active' ? 'active' : 'inactive';

        const { error: subUpsertError2 } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          price_id: priceId,
          plan: plan,
          status: status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (subUpsertError2) {
          console.error('❌ subscriptions upsert FAILED (customer.subscription.updated):', {
            userId, error: subUpsertError2.message, code: subUpsertError2.code, details: subUpsertError2.details,
          });
        }

        // ── Terminal state can arrive via 'updated' instead of 'deleted' in
        // some flows (e.g. exhausted payment retries). Treat it as a real
        // termination so the account can never be stuck showing 'cancelled'
        // while still retaining paid access if 'deleted' never arrives.
        if (subscription.status === 'canceled') {
          await downgradeToFree(userId);
          console.log(`Subscription reached 'canceled' via updated event for user ${userId} — downgraded to free`);
          break;
        }

        const isPaused          = !!subscription.pause_collection;
        const isCancelScheduled = !!subscription.cancel_at_period_end;

const profileStatus =
  isCancelScheduled ? 'cancelled' :
  isPaused ? 'paused' :
  subscription.status === 'active' ? 'active' :
  null; // past_due / unpaid / incomplete / incomplete_expired — no
        // mapped account.html state; leave subscription_status as-is.

if (profileStatus) {
  await supabase
    .from('profiles')
    .update({
      subscription_status: profileStatus,
      deletion_date: isCancelScheduled && subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      cancel_reason: isCancelScheduled ? 'other' : null,
    })
    .eq('id', userId);
}

        // ── Only refresh plan/downloads/next_payment for a GENUINE
        // reactivation OR a genuine price/plan change — never for an
        // ordinary update, and never while paused/cancel-scheduled.
        const pauseJustChanged  = !!prev && Object.prototype.hasOwnProperty.call(prev, 'pause_collection');
        const cancelJustChanged = !!prev && Object.prototype.hasOwnProperty.call(prev, 'cancel_at_period_end');
        const cameOutOfPause    = pauseJustChanged && !!(prev as any).pause_collection && !subscription.pause_collection;
        const cameOutOfCancel   = cancelJustChanged && (prev as any).cancel_at_period_end === true && !subscription.cancel_at_period_end;
        const isGenuineReactivation =
          (cameOutOfPause || cameOutOfCancel) && !isPaused && !isCancelScheduled && subscription.status === 'active';

        // A legitimate in-place plan/price change (e.g. via the Stripe
        // Billing Portal) also fires this event with subscription.status
        // staying 'active' and neither pause_collection nor
        // cancel_at_period_end changing — previous_attributes.items is the
        // signal that the line items (price) actually changed, distinct
        // from an ordinary update (payment method, metadata, etc.) that
        // should NOT reset the allowance/cycle.
        const priceJustChanged = !!prev && Object.prototype.hasOwnProperty.call(prev, 'items');

        const shouldRefreshPlan =
          !isPaused && !isCancelScheduled && subscription.status === 'active' &&
          (isGenuineReactivation || priceJustChanged);

        if (shouldRefreshPlan) {
          await applyProfilePlan(userId, priceId!);

          // Add to Brevo paid list on reactivation / plan change
          const custId = subscription.customer as string;
          try {
            const customer = await stripe.customers.retrieve(custId) as Stripe.Customer;
            if (customer.email) {
              await addToBrevoPayList(
                customer.email,
                (customer.name || '').split(' ')[0] || '',
                getPlanLabel(priceId!)
              );
            }
          } catch (e) { console.warn('Could not retrieve customer for Brevo:', e); }
        }

        console.log(`Subscription updated for user ${userId} — status: ${status}, profile status: ${profileStatus ?? 'unchanged'}, reactivation: ${isGenuineReactivation}, priceChanged: ${priceJustChanged}, planRefreshed: ${shouldRefreshPlan}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId   = invoice.subscription as string | null;
        if (!subId) break;

        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId  = subscription.metadata?.userId;
        const priceId = subscription.items.data[0]?.price.id;
        if (!userId || !priceId) break;

        await applyProfilePlan(userId, priceId);

        // Don't flip subscription_status back to 'active' if a deliberate
        // pause/cancel-scheduled state is in effect for this same period —
        // a subscription with cancel_at_period_end=true still generates one
        // real final invoice.
        if (!subscription.pause_collection && !subscription.cancel_at_period_end) {
          await supabase.from('profiles').update({ subscription_status: 'active' }).eq('id', userId);
        }

        console.log(`Allowance refilled for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const { error: subUpsertError3 } = await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          status: 'cancelled',
          plan: 'free',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (subUpsertError3) {
          console.error('❌ subscriptions upsert FAILED (customer.subscription.deleted):', {
            userId, error: subUpsertError3.message, code: subUpsertError3.code, details: subUpsertError3.details,
          });
        }

        await downgradeToFree(userId);

        console.log(`Subscription cancelled for user ${userId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── TOP-UP CREDIT MAP ─────────────────────────────────────────
// FIX (2026-07-28, AUDIT_AND_FIX_LOG.md BLOCKER-2, resolved): this map
// previously recognised price_1TeBHj.../price_1TeBIK..., which builder.html
// and account.html never actually sent — those purchases were charged by
// Stripe and silently zero-credited. Michaela confirmed directly against the
// CLPeasy Stripe dashboard that price_1Tdpd7.../price_1TdpdzG... (matching
// builder.html/account.html/checkout.html) are the correct, canonical top-up
// Price IDs. The old pair has been removed, not left alongside these, so
// there is exactly one recognised mapping.
//
// UPDATE (2026-07-30): price_1Tdpd7.../price_1TdpdzG... above were then
// discovered to be the old Live-mode price IDs, which do not exist in the
// Test Mode environment CLPeasy actually runs in (acct_1TdczNGZLILz5vqU).
// checkout.html/account.html now send the new Test Mode top-up prices below.
// The old pair is kept mapped here only for backwards compatibility with
// any already-issued Stripe object — not removed, per the established
// pattern in this file of never deleting historical price ID mappings.
const TOPUP_CREDITS: Record<string, number> = {
  'price_1Tdpd7GZLILz5vqUAiSw9udI': 5,   // 5 downloads £3.99 (old Live-mode ID — retained for backward compatibility)
  'price_1TdpdzGZLILz5vqUYEjn6TZ2': 10,  // 10 downloads £7.99 (old Live-mode ID — retained for backward compatibility)

  // Test Mode price IDs (correct, currently active)
  'price_1Tys3JGZLILz5vqUXA6L9jxc': 5,   // 5 downloads £3.99
  'price_1Tys3qGZLILz5vqUnNlRAF6Q': 10,  // 10 downloads £7.99
};

// ── HELPERS ───────────────────────────────────────────────────
function getPlanFromPriceId(priceId: string): string {
  const map: Record<string, string> = {
    // Live price IDs
    'price_1TdoEYGZLILz5vqUIqlEsf4X': 'easy_start_monthly',
    'price_1TdoEXGZLILz5vqUQj5n6Zri': 'easy_start_annual',
    'price_1TdoEXGZLILz5vqUvZKB1RQw': 'easy_pro_monthly',
    'price_1TdoEXGZLILz5vqUFgTznTUT': 'easy_pro_annual',
    // Sandbox price IDs
    'price_1Tdd5SKF3jvQfgEaclfSUxn5': 'easy_start_monthly',
    'price_1Tdd7pKF3jvQfgEa8DxgQHEW': 'easy_start_annual',
    'price_1Tdd9OKF3jvQfgEaYsCmOwOa': 'easy_pro_monthly',
    'price_1TddAyKF3jvQfgEaE7Vwbxl6': 'easy_pro_annual',

    // Test Mode price IDs
    'price_1TyDuRGZLILz5vqU3RIuVFJD': 'easy_start_monthly',
    'price_1TyDxBGZLILz5vqUEKx7d2jp': 'easy_pro_monthly',
    'price_1TyrwjGZLILz5vqUjYaiQtfL': 'easy_start_annual',
    'price_1TyryIGZLILz5vqU5OaMB0jG': 'easy_pro_annual',
  };
  return map[priceId] ?? 'unknown';
}

interface ProfilePlan { plan: string; is_pro: boolean; limit: number; cycle: string; }
function profileInfoFromPriceId(priceId: string): ProfilePlan {
  const map: Record<string, ProfilePlan> = {
    // Live price IDs
    'price_1TdoEYGZLILz5vqUIqlEsf4X': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'monthly' },
    'price_1TdoEXGZLILz5vqUQj5n6Zri': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'annual'  },
    'price_1TdoEXGZLILz5vqUvZKB1RQw': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'monthly' },
    'price_1TdoEXGZLILz5vqUFgTznTUT': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'annual'  },

    // Sandbox price IDs
    'price_1Tdd5SKF3jvQfgEaclfSUxn5': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'monthly' },
    'price_1Tdd7pKF3jvQfgEa8DxgQHEW': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'annual'  },
    'price_1Tdd9OKF3jvQfgEaYsCmOwOa': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'monthly' },
    'price_1TddAyKF3jvQfgEaE7Vwbxl6': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'annual'  },

    // Test Mode price IDs
    'price_1TyDuRGZLILz5vqU3RIuVFJD': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'monthly' },
    'price_1TyDxBGZLILz5vqUEKx7d2jp': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'monthly' },
    'price_1TyrwjGZLILz5vqUjYaiQtfL': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'annual'  },
    'price_1TyryIGZLILz5vqU5OaMB0jG': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'annual'  },
  };
  return map[priceId] ?? { plan: 'free', is_pro: false, limit: 0, cycle: 'monthly' };
}

function addOneMonth(from = new Date()): string {
  const d = new Date(from); d.setMonth(d.getMonth() + 1); return d.toISOString();
}
function addOneYear(from = new Date()): string {
  const d = new Date(from); d.setFullYear(d.getFullYear() + 1); return d.toISOString();
}

async function applyProfilePlan(userId: string, priceId: string): Promise<void> {
  const info = profileInfoFromPriceId(priceId);

  console.log('Applying profile plan:', {
    userId,
    priceId,
    plan: info.plan,
    is_pro: info.is_pro,
    downloads_limit: info.limit,
    billing_cycle: info.cycle,
  });

  const { data, error } = await supabase
    .from('profiles')
    .update({
      plan: info.plan,
      is_pro: info.is_pro,
      billing_cycle: info.cycle,
      downloads_limit: info.limit,
      downloads_used: 0,
      downloads_reset_date: addOneMonth(),
      next_payment: info.cycle === 'annual' ? addOneYear() : addOneMonth(),
    })
    .eq('id', userId)
    .select('id, plan, is_pro, downloads_limit, billing_cycle, next_payment')
    .single();

  if (error) {
    console.error('❌ applyProfilePlan FAILED:', {
      userId,
      priceId,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    throw new Error(`Failed to update profile plan: ${error.message}`);
  }

  console.log('✅ applyProfilePlan SUCCESS:', data);
}

// ── FULL DOWNGRADE TO FREE — the only place paid access is actually removed.
// Called when a subscription genuinely ends: customer.subscription.deleted,
// or the rare case where Stripe reports status: 'canceled' via an 'updated'
// event instead. Never called for a pause or a scheduled cancellation —
// those only change subscription_status, retaining the paid plan/allowance
// until the subscription genuinely ends. Deliberately does NOT touch
// topup_credits — purchased credits are a one-off, non-subscription
// purchase and survive cancellation per "Credits never expire" (see
// checkout.html, index.html, refund.html).
async function downgradeToFree(userId: string): Promise<void> {
  await supabase.from('profiles').update({
    plan: 'free',
    is_pro: false,
    downloads_limit: 0,
    billing_cycle: 'monthly',
    subscription_status: 'cancelled',
  }).eq('id', userId);
}
