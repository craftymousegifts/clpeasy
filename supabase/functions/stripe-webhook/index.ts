// supabase/functions/stripe-webhook/index.ts
// Handles Stripe webhook events for CLPeasy subscriptions.
// Uses raw fetch (no npm:stripe) to avoid Deno microtask errors in Supabase edge runtime.

import { createClient } from "npm:@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// ── Price ID → plan mapping (live price IDs) ─────────────────────────────────
const PRICE_MAP: Record<string, { plan: string; downloads_limit: number; is_pro: boolean }> = {
  // Live mode price IDs
  "price_1TdoEYGZLILz5vqUIqlEsf4X": { plan: "easy_start_monthly", downloads_limit: 20, is_pro: false },
  "price_1TdoEXGZLILz5vqUQj5n6Zri": { plan: "easy_start_annual",  downloads_limit: 20, is_pro: false },
  "price_1TdoEXGZLILz5vqUvZKB1RQw": { plan: "easy_pro_monthly",   downloads_limit: 30, is_pro: true  },
  "price_1TdoEXGZLILz5vqUFgTznTUT": { plan: "easy_pro_annual",    downloads_limit: 30, is_pro: true  },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Stripe signature verification (manual HMAC-SHA256) ───────────────────────
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = sigHeader.split(",").reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts["t"];
    const signature = parts["v1"];
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return computed === signature;
  } catch {
    return false;
  }
}

// ── Raw Stripe API call ───────────────────────────────────────────────────────
async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      "Authorization": `Bearer ${Deno.env.get("STRIPE_SECRET_KEY") ?? ""}`,
    },
  });
  return res.json();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const body = await req.text();

  const valid = await verifyStripeSignature(body, sig, webhookSecret);
  if (!valid) {
    console.error("Invalid Stripe signature");
    return json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(body);
  console.log("Stripe event:", event.type);

  try {
    switch (event.type) {

      // ── Checkout completed → activate subscription ──────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        if (!userId || !subscriptionId) {
          console.error("Missing userId or subscriptionId", { userId, subscriptionId });
          break;
        }

        // Retrieve subscription via raw fetch to get price ID
        const subscription = await stripeGet(`subscriptions/${subscriptionId}`) as Record<string, unknown>;
        console.log("Subscription retrieved:", JSON.stringify(subscription).slice(0, 300));

        const items = subscription.items as Record<string, unknown>;
        const itemData = (items?.data as Record<string, unknown>[])?.[0];
        const price = itemData?.price as Record<string, unknown>;
        const priceId = price?.id as string ?? "";

        console.log("Price ID found:", priceId);

        const planInfo = PRICE_MAP[priceId];
        console.log("Plan info:", planInfo ? JSON.stringify(planInfo) : "NOT FOUND in PRICE_MAP");

        if (!planInfo) {
          // Still update subscriptions with what we have so it's not totally blank
          await supabase.from("subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            price_id: priceId || null,
            plan: "unknown",
            status: "active",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          console.error("Unknown price ID:", priceId);
          break;
        }

        // Update subscriptions table
        const { error: subErr } = await supabase.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          price_id: priceId,
          plan: planInfo.plan,
          status: "active",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        console.log("Subscriptions upsert error:", subErr);

        // Update profiles table
        const { error: profErr } = await supabase.from("profiles").update({
          subscription_status: "active",
          plan: planInfo.plan,
          downloads_limit: planInfo.downloads_limit,
          downloads_used: 0,
          is_pro: planInfo.is_pro,
          downloads_reset_date: new Date(
            new Date().setMonth(new Date().getMonth() + 1)
          ).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", userId);
        console.log("Profiles update error:", profErr);

        break;
      }

      // ── Invoice paid → renew/refill allowance ───────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        const subscription = await stripeGet(`subscriptions/${subscriptionId}`) as Record<string, unknown>;
        const items = subscription.items as Record<string, unknown>;
        const itemData = (items?.data as Record<string, unknown>[])?.[0];
        const price = itemData?.price as Record<string, unknown>;
        const priceId = price?.id as string ?? "";
        const planInfo = PRICE_MAP[priceId];

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (!subRow?.user_id) break;

        if (planInfo) {
          await supabase.from("profiles").update({
            downloads_used: 0,
            downloads_limit: planInfo.downloads_limit,
            downloads_reset_date: new Date(
              new Date().setMonth(new Date().getMonth() + 1)
            ).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", subRow.user_id);
        }

        await supabase.from("subscriptions").update({
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", subscriptionId);

        break;
      }

      // ── Subscription updated → keep plan in sync ────────────────────────────
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
        const planInfo = PRICE_MAP[priceId];

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (!subRow?.user_id) break;

        await supabase.from("subscriptions").update({
          price_id: priceId || null,
          plan: planInfo?.plan ?? "unknown",
          status: subscription.status,
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", subscription.id);

        if (planInfo) {
          await supabase.from("profiles").update({
            plan: planInfo.plan,
            downloads_limit: planInfo.downloads_limit,
            is_pro: planInfo.is_pro,
            subscription_status: subscription.status,
            updated_at: new Date().toISOString(),
          }).eq("id", subRow.user_id);
        }

        break;
      }

      // ── Subscription deleted → cancel and remove access ─────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();

        if (!subRow?.user_id) break;

        await supabase.from("subscriptions").update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", subscription.id);

        await supabase.from("profiles").update({
          subscription_status: "inactive",
          plan: "free",
          downloads_limit: 10,
          is_pro: false,
          updated_at: new Date().toISOString(),
        }).eq("id", subRow.user_id);

        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return json({ received: true });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("stripe-webhook error:", message);
    return json({ error: message }, 500);
  }
});