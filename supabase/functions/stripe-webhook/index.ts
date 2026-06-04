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

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId   = session.metadata?.userId;
        const priceId  = session.metadata?.priceId;
        const type     = session.metadata?.type;        // 'topup' for one-off packs
        const customerId    = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId) { console.error('No userId in session metadata'); break; }

        // ── ONE-OFF TOP-UP PURCHASE ──────────────────────────────
        if (type === 'topup') {
          const credits = TOPUP_CREDITS[priceId ?? ''] ?? 0;
          if (credits === 0) { console.error('Unknown top-up priceId:', priceId); break; }

          // Add credits to downloads_limit (never expire — they stack)
          const { data: profile } = await supabase
            .from('profiles')
            .select('downloads_limit')
            .eq('id', userId)
            .single();

          const current = profile?.downloads_limit ?? 0;
          await supabase.from('profiles').update({
            downloads_limit: current + credits,
            updated_at: new Date().toISOString(),
          }).eq('id', userId);

          console.log(`Top-up: +${credits} downloads credited to user ${userId}`);
          break;
        }

        // ── SUBSCRIPTION PURCHASE ────────────────────────────────
        const plan = getPlanFromPriceId(priceId!);
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          price_id: priceId,
          plan: plan,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await applyProfilePlan(userId, priceId!);
        console.log(`Subscription activated for user ${userId} — plan: ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const priceId = subscription.items.data[0]?.price.id;
        const plan    = getPlanFromPriceId(priceId!);
        const status  = subscription.status === 'active' ? 'active' : 'inactive';

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          price_id: priceId,
          plan: plan,
          status: status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        if (status === 'active') await applyProfilePlan(userId, priceId!);
        console.log(`Subscription updated for user ${userId} — status: ${status}`);
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
        console.log(`Allowance refilled for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          status: 'cancelled',
          plan: 'free',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        await supabase.from('profiles').update({
          plan: 'free',
          is_pro: false,
          downloads_limit: 0,
          billing_cycle: 'monthly',
          updated_at: new Date().toISOString(),
        }).eq('id', userId);

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
// Sandbox price IDs — add live IDs here on go-live day
const TOPUP_CREDITS: Record<string, number> = {
  'price_1TeBHjKF3jvQfgEaX2aPZX6E': 5,   // 5 downloads £3.99
  'price_1TeBIKKF3jvQfgEaxU4TjPHu': 10,  // 10 downloads £7.99
};

// ── HELPERS ───────────────────────────────────────────────────
function getPlanFromPriceId(priceId: string): string {
  const map: Record<string, string> = {
    'price_1Tdd5SKF3jvQfgEaclfSUxn5': 'easy_start_monthly',
    'price_1Tdd7pKF3jvQfgEa8DxgQHEW': 'easy_start_annual',
    'price_1Tdd9OKF3jvQfgEaYsCmOwOa': 'easy_pro_monthly',
    'price_1TddAyKF3jvQfgEaE7Vwbxl6': 'easy_pro_annual',
  };
  return map[priceId] ?? 'unknown';
}

interface ProfilePlan { plan: string; is_pro: boolean; limit: number; cycle: string; }
function profileInfoFromPriceId(priceId: string): ProfilePlan {
  const map: Record<string, ProfilePlan> = {
    'price_1Tdd5SKF3jvQfgEaclfSUxn5': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'monthly' },
    'price_1Tdd7pKF3jvQfgEa8DxgQHEW': { plan: 'easy_start', is_pro: false, limit: 20, cycle: 'annual'  },
    'price_1Tdd9OKF3jvQfgEaYsCmOwOa': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'monthly' },
    'price_1TddAyKF3jvQfgEaE7Vwbxl6': { plan: 'easy_pro',   is_pro: true,  limit: 30, cycle: 'annual'  },
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
  await supabase.from('profiles').update({
    plan: info.plan,
    is_pro: info.is_pro,
    billing_cycle: info.cycle,
    downloads_limit: info.limit,
    downloads_used: 0,
    downloads_reset_date: addOneMonth(),
    next_payment: info.cycle === 'annual' ? addOneYear() : addOneMonth(),
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
}
