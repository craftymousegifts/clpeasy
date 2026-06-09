import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { priceId, userEmail, userId, mode } = await req.json();
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!priceId || !userEmail || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // mode: 'subscription' (default) or 'payment' (one-off top-up)
    const checkoutMode = mode === "payment" ? "payment" : "subscription";

    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "mode": checkoutMode,
      "payment_method_collection": "always",
      "customer_email": userEmail,
      "success_url": "https://clpeasy.com/builder.html?topup=success",
      "cancel_url": "https://clpeasy.com/builder.html?topup=cancelled",
    });

    // Require billing address — enables country verification post-payment
    // Full UK-only enforcement: add Stripe Radar rule in dashboard (billing_address.country != GB → block)
    if (checkoutMode === "subscription") {
      params.set("billing_address_collection", "required");
    }

    // For subscriptions, add metadata and trial
    if (checkoutMode === "subscription") {
      params.set("subscription_data[metadata][userId]", userId);
      params.set("metadata[userId]", userId);
    } else {
      // For one-off payments, add metadata so webhook can credit the user
      params.set("metadata[userId]", userId);
      params.set("metadata[type]", "topup");
      params.set("metadata[priceId]", priceId);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Stripe error:", session);
      return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});