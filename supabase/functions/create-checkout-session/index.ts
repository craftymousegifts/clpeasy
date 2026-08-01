import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── SAFE REDIRECT ALLOWLIST (fix: previously frontend-supplied successUrl/
// cancelUrl were silently ignored and everything was hard-coded to
// builder.html?topup=success regardless of mode; now we honour the caller's
// intent but only within known CLPeasy pages — never an arbitrary external URL) ──
const ALLOWED_ORIGIN = "https://clpeasy.com";
const ALLOWED_PATHS = new Set(["/builder.html", "/checkout.html", "/account.html", "/dashboard.html"]);

function safeRedirect(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string" || !candidate) return fallback;
  try {
    const u = new URL(candidate);
    if (u.origin !== ALLOWED_ORIGIN) return fallback;
    if (!ALLOWED_PATHS.has(u.pathname)) return fallback;
    return u.toString(); // query string is passed through untouched — only origin+path are restricted
  } catch {
    return fallback;
  }
}

// Service-role client — used only for the duplicate-subscription guard below.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── DERIVE THE AUTHENTICATED USER FROM THE JWT — never trust the body ──
    // (fix: previously userId/userEmail were taken directly from the client-
    // supplied POST body with no server-side check that the caller actually
    // is that user — same pattern already fixed in manage-subscription /
    // create-portal-session.)
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing Authorization token" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const supabaseAsCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: authError } = await supabaseAsCaller.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;
    const userEmail = user.email;

    const { priceId, mode, successUrl, cancelUrl } = await req.json();
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!priceId || !userEmail || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // mode: 'subscription' (default) or 'payment' (one-off top-up)
    const checkoutMode = mode === "payment" ? "payment" : "subscription";

    // ── DUPLICATE-SUBSCRIPTION GUARD ──
    // (fix: resubscribe/reactivate previously always created a brand-new
    // Stripe subscription with no check for an existing one)
    //
    // PRE-DEPLOYMENT REVIEW FINDING (2026-07-28): the status check alone is a
    // check-then-act race — two near-simultaneous requests could both pass it
    // before either's webhook updates `subscriptions`, and both would receive
    // a valid Stripe Checkout Session URL. Closed with an atomic DB-level
    // lock (see supabase/migrations/20260728090000_create_checkout_locks.sql,
    // NOW APPLIED): a UNIQUE constraint means a second concurrent request
    // for the same user_id cannot both insert a lock row, so the second
    // request is rejected outright rather than racing.
    let acquiredLock = false;
    if (checkoutMode === "subscription") {
      const { data: existingSub } = await supabaseAdmin
        .from("subscriptions")
        .select("status, stripe_subscription_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingSub?.status === "active" && existingSub?.stripe_subscription_id) {
        return new Response(JSON.stringify({
          error: "You already have an active subscription. Manage or change your plan from your account's billing portal instead of starting a new checkout.",
          code: "ALREADY_SUBSCRIBED",
        }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // Clear any stale/abandoned lock (older than 5 minutes) for this user.
      await supabaseAdmin
        .from("checkout_locks")
        .delete()
        .eq("user_id", userId)
        .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

      // Atomically claim the lock. If another request already holds it, this
      // insert fails on the primary key and we reject the second request.
      const { error: lockError } = await supabaseAdmin
        .from("checkout_locks")
        .insert({ user_id: userId });

      if (lockError) {
        return new Response(JSON.stringify({
          error: "A checkout is already in progress for this account. Please wait a moment and try again.",
          code: "CHECKOUT_IN_PROGRESS",
        }), {
          status: 409, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      acquiredLock = true;
    }

    const defaultSuccess = checkoutMode === "subscription"
      ? "https://clpeasy.com/builder.html?subscribed=true"
      : "https://clpeasy.com/builder.html?topup=success";
    const defaultCancel = checkoutMode === "subscription"
      ? "https://clpeasy.com/checkout.html?cancelled=true"
      : "https://clpeasy.com/builder.html?topup=cancelled";

    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "mode": checkoutMode,
      "customer_email": userEmail,
      "success_url": safeRedirect(successUrl, defaultSuccess),
      "cancel_url": safeRedirect(cancelUrl, defaultCancel),
    });

    // Require billing address — enables country verification post-payment
    // Full UK-only enforcement: add Stripe Radar rule in dashboard (billing_address.country != GB → block)
    //
    // payment_method_collection is only valid on subscription-mode (recurring
    // price) sessions — Stripe rejects one-off/payment-mode sessions (e.g.
    // top-ups) outright with "You can only set `payment_method_collection`
    // if there are recurring prices." Moved here, under the existing
    // subscription-only guard, alongside billing_address_collection.
    if (checkoutMode === "subscription") {
      params.set("billing_address_collection", "required");
      params.set("payment_method_collection", "always");
    }

    // Metadata: always stamp priceId + type regardless of mode (fix: previously
    // only set for one-off 'payment' checkouts; subscription checkouts left
    // session.metadata.priceId undefined, which made the webhook's
    // checkout.session.completed handler resolve the plan as 'unknown' until
    // invoice.paid separately self-corrected the profiles row moments later —
    // and never corrected the subscriptions table at all).
    params.set("metadata[userId]", userId);
    params.set("metadata[priceId]", priceId);
    if (checkoutMode === "subscription") {
      params.set("subscription_data[metadata][userId]", userId);
      params.set("subscription_data[metadata][priceId]", priceId);
    } else {
      params.set("metadata[type]", "topup");
    }

    try {
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
        // Release the lock on failure only — a legitimate retry after a
        // Stripe-side error (e.g. a bad card) shouldn't be blocked.
        if (acquiredLock) {
          await supabaseAdmin.from("checkout_locks").delete().eq("user_id", userId);
        }
        return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // NOTE: on success, the lock is deliberately left in place rather than
      // released immediately. Releasing it right away would only close the
      // millisecond-scale race between two literally-overlapping requests —
      // it would do nothing for the more realistic case of a customer with
      // two tabs open clicking "Subscribe" a few seconds apart, before Stripe
      // Checkout has been completed in either tab. Leaving the lock in place
      // gives a real ~5 minute cooldown per user (it self-expires via the
      // stale-lock cleanup at the top of this function on their next
      // request), which is a much stronger guard against duplicate
      // subscriptions at the cost of a short wait if someone abandons a
      // checkout and immediately wants to start a different one.
      return new Response(JSON.stringify({ url: session.url }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (stripeCallErr) {
      // Network/unexpected error talking to Stripe — release the lock so the
      // user isn't stuck for 5 minutes over a transient failure.
      if (acquiredLock) {
        await supabaseAdmin.from("checkout_locks").delete().eq("user_id", userId);
      }
      throw stripeCallErr;
    }

  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
