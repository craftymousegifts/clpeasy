// supabase/functions/manage-subscription/index.ts
//
// NEW FUNCTION (2026-07-27, AUDIT_AND_FIX_LOG.md Phase 8/9) — drafted locally,
// NOT YET DEPLOYED.
//
// Makes CLPeasy's account-page Pause / Cancel / Reactivate actions perform a
// REAL Stripe subscription change before Supabase is ever updated, instead of
// (as found during the audit) only writing subscription_status to `profiles`
// while the real Stripe subscription kept renewing and charging untouched.
//
// Actions (POST body: { action: 'pause' | 'cancel' | 'reactivate', reason? }):
//   pause      → stripe.subscriptions.update(id, { pause_collection: { behavior: 'mark_uncollectible' } })
//                Stripe stops generating invoices; the subscription itself is
//                not cancelled.
//   cancel     → stripe.subscriptions.update(id, { cancel_at_period_end: true })
//                Access continues until the current period ends (matches the
//                existing "your library is safe for 30 days" UI copy); the
//                already-deployed stripe-webhook's customer.subscription.deleted
//                handler still fires the full downgrade when the period ends.
//   reactivate → clears pause_collection and cancel_at_period_end on the SAME
//                subscription. Returns { code: 'FULLY_ENDED' } if Stripe
//                reports the subscription has already fully ended — the caller
//                should fall back to starting a new subscription via
//                create-checkout-session in that case (which independently
//                guards against creating a duplicate active subscription).
//
// SECURITY: the authenticated user is derived solely from the verified JWT in
// the Authorization header (same pattern as the create-portal-session fix) —
// never from the request body — and the Stripe subscription id is looked up
// server-side from `subscriptions` for that user only.
//
// `profiles` is updated optimistically here for immediate UI feedback, but the
// Stripe webhook (customer.subscription.updated / .deleted) remains the
// ultimate source of truth for subscription state and will reconcile shortly
// after regardless of anything this function writes.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // ── DERIVE THE AUTHENTICATED USER FROM THE JWT — never trust the body ──
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Missing Authorization token' }, 401);

    const supabaseAsCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabaseAsCaller.auth.getUser();
    if (authError || !user) return json({ error: 'Not authenticated' }, 401);

    const { action, reason } = await req.json();
    if (!['pause', 'cancel', 'reactivate'].includes(action)) {
      return json({ error: 'Unknown action' }, 400);
    }

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const subId = sub?.stripe_subscription_id;
    if (!subId) {
      return json({ error: 'No Stripe subscription found for this account.', code: 'NO_SUBSCRIPTION' }, 404);
    }

    let stripeSub: Stripe.Subscription;

    if (action === 'pause') {
      stripeSub = await stripe.subscriptions.update(subId, {
        pause_collection: { behavior: 'mark_uncollectible' },
      });
      await supabaseAdmin.from('profiles').update({
        subscription_status: 'paused',
        pause_reason: reason || null,
        paused_at: new Date().toISOString(),
      }).eq('id', user.id);

    } else if (action === 'cancel') {
      stripeSub = await stripe.subscriptions.update(subId, {
        cancel_at_period_end: true,
      });
      const periodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000).toISOString()
        : null;
      await supabaseAdmin.from('profiles').update({
        subscription_status: 'cancelled',
        cancel_reason: reason || null,
        deletion_date: periodEnd,
      }).eq('id', user.id);

    } else {
      // reactivate — undo a pause and/or a scheduled cancellation on the SAME
      // subscription. If Stripe reports it's already fully ended, there is
      // nothing to reactivate.
      const current = await stripe.subscriptions.retrieve(subId);
      if (current.status === 'canceled') {
        return json({
          error: 'Your previous subscription has fully ended. Please choose a plan to start a new one.',
          code: 'FULLY_ENDED',
        }, 409);
      }
      stripeSub = await stripe.subscriptions.update(subId, {
        cancel_at_period_end: false,
        pause_collection: null,
      });
      await supabaseAdmin.from('profiles').update({
        subscription_status: 'active',
        pause_reason: null,
        paused_at: null,
        cancel_reason: null,
        deletion_date: null,
      }).eq('id', user.id);
    }

    return json({ success: true, status: stripeSub.status });
  } catch (err) {
    console.error('manage-subscription error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return json({ error: message }, 500);
  }
});
