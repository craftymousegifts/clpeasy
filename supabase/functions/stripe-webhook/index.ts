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
    // Upsert contact with plan attribute
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
    const upsertStatus = upsertRes.status;
    console.log(`Brevo paid contact upsert HTTP ${upsertStatus} for ${email}`);

    // Trigger paid Day 0 automation if ID is set
    const automationId = Deno.env.get('BREVO_PAID_AUTOMATION_ID');
    if (automationId) {
      const triggerRes = await fetch('https://api.brevo.com/v3/automations/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          event: 'paid_subscription_activated',
          email,
          properties: { plan: planLabel },
          workflowId: parseInt(automationId, 10),
        }),
      });
      console.log(`Brevo paid automation trigger HTTP ${triggerRes.status} for ${email}`);
    }
  } catch (err) {
    // Non-fatal — log and continue
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
    // Sandbox price IDs (kept for safety during transition)
    'price_1Tdd5SKF3jvQfgEaclfSUxn5': 'Easy Start Monthly',
    'price_1Tdd7pKF3jvQfgEa8DxgQHEW': 'Easy Start Annual',
    'price_1Tdd9OKF3jvQfgEaYsCmOwOa': 'Easy Pro Monthly',
    'price_1TddAyKF3jvQfgEaE7Vwbxl6': 'Easy Pro Annual',
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
        if (type === 'topup') {
          const credits = TOPUP_CREDITS[priceId ?? ''] ?? 0;
          if (credits === 0) { console.error('Unknown top-up priceId:', priceId); break; }

          const { data: profile } = await supabase
            .from('profiles')
            .select('downloads_limit')
            .eq('id', userId)
            .single();

          const current = profile?.downloads_limit ?? 0;
          await supabase.from('profiles').update({
            downloads_limit: current + credits,
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
        const userId  = subscription.metadata?.userId;
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

        if (status === 'active') {
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
// Sandbox IDs kept alongside live IDs for safe transition
const TOPUP_CREDITS: Record<string, number> = {
  'price_1TeBHjKF3jvQfgEaX2aPZX6E': 5,   // 5 downloads £3.99
  'price_1TeBIKKF3jvQfgEaxU4TjPHu': 10,  // 10 downloads £7.99
};

// ── HELPERS ───────────────────────────────────────────────────
function getPlanFromPriceId(priceId: string): string {
  const map: Record<string, string> = {
    // Live price IDs
    'price_1TdoEYGZLILz5vqUIqlEsf4X': 'easy_start_monthly',
    'price_1TdoEXGZLILz5vqUQj5n6Zri': 'easy_start_annual',
    'price_1TdoEXGZLILz5vqUvZKB1RQw': 'easy_pro_monthly',
    'price_1TdoEXGZLILz5vqUFgTznTUT': 'easy_pro_annual',
    // Sandbox price IDs (kept for safe transition)
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
  // Note: profiles table has no updated_at column — do not include it
  await supabase.from('profiles').update({
    plan: info.plan,
    is_pro: info.is_pro,
    billing_cycle: info.cycle,
    downloads_limit: info.limit,
    downloads_used: 0,
    downloads_reset_date: addOneMonth(),
    next_payment: info.cycle === 'annual' ? addOneYear() : addOneMonth(),
  }).eq('id', userId);
}