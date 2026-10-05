// supabase/functions/clp-account-events/index.ts
//
// Notifies Brevo of account lifecycle events (pause / cancel / save-offer-accepted)
// so marketing automations can react. Called from account.html.
//
// SECURITY FIX (2026-07-27): this function was previously deployed with
// verify_jwt=false and trusted an `email` field supplied directly in the request
// body with no authentication at all — meaning any unauthenticated caller could
// trigger a templated email to an arbitrary address, or overwrite an arbitrary
// email address's Brevo contact attributes (SUBSCRIPTION_STATUS, DISCOUNT_ACTIVE,
// CANCEL_REASON). The function now requires a verified Supabase JWT and looks up
// the caller's own email server-side from `profiles` — the client-supplied `email`
// is no longer trusted. All existing Brevo calls and template IDs are unchanged.
//
// IMPORTANT: this function must be redeployed with verify_jwt = true (it is
// currently deployed with verify_jwt = false) for the platform-level JWT check to
// also apply; this file adds the corresponding in-function check regardless.

// FURTHER FIX (2026-07-27, Phase 8): save_offer_accepted previously only wrote
// discount_active/discount_ends to `profiles` from the BROWSER (account.html
// acceptSaveOffer()), and never actually applied any discount in Stripe — a
// customer who accepted "3 months at 50% off" would still be charged full
// price on their next Stripe invoice. That profiles write now happens here
// instead (service-role, after verifying the caller), and — if
// STRIPE_SAVE_OFFER_COUPON_ID is configured — a real Stripe coupon is applied
// to the subscription too. See AUDIT_AND_FIX_LOG.md "BLOCKER-3": no coupon ID
// was available to verify against the actual CLPeasy Stripe account, so this
// is wired to activate the moment that secret is set, without a further code
// change, and simply skips the Stripe-side discount (logging a warning) until
// then — it no longer silently claims a discount that was never applied.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SAVE_OFFER_COUPON_ID = Deno.env.get('STRIPE_SAVE_OFFER_COUPON_ID') || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe = STRIPE_SAVE_OFFER_COUPON_ID
  ? new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
  : null;

// Only these events are ever accepted — anything else is rejected up front.
const ALLOWED_EVENTS = new Set([
  'subscription_paused',
  'subscription_cancelled',
  'save_offer_accepted',
]);

// Brevo template IDs — update these once you note the IDs from Brevo dashboard
const BREVO_TEMPLATES: Record<string, number> = {
  subscription_paused:         7,
  cancel_save_offer_price:     8,
  cancel_save_offer_downloads: 9,
  winback_day3:                12,
  winback_day14:               10,
  winback_day28:               11,
};

async function sendBrevoEmail(to: string, templateId: number, params: Record<string, string>) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ email: to }],
      templateId,
      params,
    }),
  });
  return res.ok;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    const { event, reason, deletionDate } = await req.json();

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return json({ error: 'Unknown or missing event' }, 400);
    }

    // Look up the authenticated user's own email server-side — a client can no
    // longer specify an arbitrary email address for another account.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle();
    const email = profile?.email || user.email;
    if (!email) return json({ error: 'No email on file for this account' }, 400);

    // Format deletion date for email
    const deletionFormatted = deletionDate
      ? new Date(deletionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    let sent = false;

    if (event === 'subscription_paused') {
      sent = await sendBrevoEmail(email, BREVO_TEMPLATES.subscription_paused, {
        FIRSTNAME: email.split('@')[0],
      });
    }

    else if (event === 'subscription_cancelled') {
      // Route to correct save offer template based on reason
      // Send after 2hr delay — handled by Brevo automation trigger instead
      // Here we just add contact to Brevo with event data so automation fires
      await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          attributes: {
            CANCEL_REASON: reason || '',
            DELETION_DATE: deletionFormatted,
            SUBSCRIPTION_STATUS: 'cancelled',
          },
          listIds: [],
          updateEnabled: true,
        }),
      }).catch(() => null);

      // Also update contact attributes via contacts API
      await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: {
            CANCEL_REASON: reason || '',
            DELETION_DATE: deletionFormatted,
            SUBSCRIPTION_STATUS: 'cancelled',
          },
        }),
      }).catch(() => null);

      sent = true;
    }

    else if (event === 'save_offer_accepted') {
      const discountEnds = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      // Apply a real Stripe discount if a coupon has been configured; without
      // one, do NOT claim a discount is active — just log and move on.
      let stripeDiscountApplied = false;
      if (stripe) {
        try {
          const { data: sub } = await supabaseAdmin
            .from('subscriptions')
            .select('stripe_subscription_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (sub?.stripe_subscription_id) {
            await stripe.subscriptions.update(sub.stripe_subscription_id, {
              coupon: STRIPE_SAVE_OFFER_COUPON_ID,
            });
            stripeDiscountApplied = true;
          } else {
            console.warn('save_offer_accepted: no stripe_subscription_id for user', user.id);
          }
        } catch (e) {
          console.error('save_offer_accepted: failed to apply Stripe coupon:', e);
        }
      } else {
        console.warn('save_offer_accepted: STRIPE_SAVE_OFFER_COUPON_ID not configured — skipping Stripe-side discount, see AUDIT_AND_FIX_LOG.md BLOCKER-3');
      }

      // Update profiles server-side (service role) — the browser no longer
      // writes discount_active/discount_ends directly.
      await supabaseAdmin.from('profiles').update({
        discount_active: stripeDiscountApplied,
        discount_ends: stripeDiscountApplied ? discountEnds : null,
      }).eq('id', user.id);

      // Update Brevo contact status
      await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: {
            SUBSCRIPTION_STATUS: 'active',
            DISCOUNT_ACTIVE: stripeDiscountApplied ? 'true' : 'false',
          },
        }),
      }).catch(() => null);
      sent = true;

      // PRE-DEPLOYMENT REVIEW FINDING (2026-07-28): `success: sent` only ever
      // meant "the event was processed", not "a real discount was applied" —
      // account.html was checking `data.success` alone to show the "Your
      // discount has been applied" screen, which would have been shown even
      // when STRIPE_SAVE_OFFER_COUPON_ID isn't configured (today's state).
      // Return discountApplied explicitly so the caller can tell the two
      // apart and never overstate what happened.
      return new Response(JSON.stringify({ success: sent, discountApplied: stripeDiscountApplied }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
