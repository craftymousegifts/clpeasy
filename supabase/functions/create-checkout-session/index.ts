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
const ALLOWED_PATHS = new Set(["/builder.html", "/checkout.html", "/account.html", "/dashboard.html", "/pricing.html"]);

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

// ── 2026 MONTHLY PROMOTION (approved D3) ──
// Easy Start / Easy Pro MONTHLY keep their standard Stripe prices
// (£9.99 / £14.99); until 31 Dec 2026 (UK) a server-configured Stripe coupon
// makes them £8.99 / £13.49. The coupon IDs live ONLY in Supabase secrets:
//   PROMO_2026_EASY_START_MONTHLY_COUPON_ID, PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID
// The browser can never choose or inject a coupon, promotion code or
// discount — any such request fields are ignored. Annual prices are never
// discounted. stripe-webhook removes the coupon at the first renewal after
// the promotion ends.
const PROMO_2026_END_MS = Date.UTC(2027, 0, 1);
// Monthly price IDs already established in stripe-webhook's plan maps.
const MONTHLY_PROMO_PLAN_BY_PRICE: Record<string, "EASY_START" | "EASY_PRO"> = {
  "price_1TdoEYGZLILz5vqUIqlEsf4X": "EASY_START", // live Easy Start monthly
  "price_1TdoEXGZLILz5vqUvZKB1RQw": "EASY_PRO",   // live Easy Pro monthly
  "price_1TyDuRGZLILz5vqU3RIuVFJD": "EASY_START", // test-mode Easy Start monthly
  "price_1TyDxBGZLILz5vqUEKx7d2jp": "EASY_PRO",   // test-mode Easy Pro monthly
  "price_1Tdd5SKF3jvQfgEaclfSUxn5": "EASY_START", // legacy sandbox Easy Start monthly
  "price_1Tdd9OKF3jvQfgEaYsCmOwOa": "EASY_PRO",   // legacy sandbox Easy Pro monthly
};

// ── SUBSCRIBER TOP-UPS (approved D4) ──
// 5 for £3.99 / 10 for £7.99 are only for active Easy Start/Pro subscribers,
// or a scheduled cancellation still inside its paid period. Everyone else
// uses Pay As You Go. Only the top-up prices stripe-webhook can credit.
const TOPUP_PRICE_IDS = new Set([
  "price_1Tdpd7GZLILz5vqUAiSw9udI", "price_1TdpdzGZLILz5vqUYEjn6TZ2", // live
  "price_1Tys3JGZLILz5vqUXA6L9jxc", "price_1Tys3qGZLILz5vqUnNlRAF6Q", // test mode
  "price_1TeBHjKF3jvQfgEaX2aPZX6E", "price_1TeBIKKF3jvQfgEaxU4TjPHu", // CLPeasy sandbox (verified 26 Sep 2026)
]);
// A CURRENT Easy Start/Pro subscriber: active, or cancel-at-period-end still
// inside the paid period. Paused and ended subscriptions are not current.
// (Same rule as entitlement.js topupEligible / consume_download.)
function topupEligible(p: { subscription_status?: string | null; plan?: string | null; downloads_limit?: number | null; deletion_date?: string | null } | null): boolean {
  if (!p) return false;
  if (p.subscription_status === "active") return true;
  const paidPlan = !!p.plan && !["free", "trial", "cancelled", "paused", "payg"].includes(p.plan) && (p.downloads_limit ?? 0) > 0;
  return p.subscription_status === "cancelled" && paidPlan && (!p.deletion_date || new Date(p.deletion_date).getTime() > Date.now());
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

    const { priceId: clientPriceId, productKey, mode, successUrl, cancelUrl } = await req.json();
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    // PAYG prices stay server-side so the public pricing page never needs a
    // live Stripe price ID. Set PAYG_5_PRICE_ID in Supabase secrets after
    // creating the one-off £4.99 Stripe price.
    const paygPriceId = productKey === "payg_5" ? Deno.env.get("PAYG_5_PRICE_ID") : null;
    // Fail closed: a PAYG request must never fall back to a browser-supplied
    // price. Otherwise, if PAYG_5_PRICE_ID were missing, a caller could pair
    // productKey "payg_5" (stamped as 8 downloads) with any cheaper one-off
    // price in the Stripe account.
    if (productKey === "payg_5" && !paygPriceId) {
      console.error("PAYG_5_PRICE_ID is not configured");
      return new Response(JSON.stringify({ error: "Pay As You Go is not available right now. Please try again later." }), {
        status: 503, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const priceId = paygPriceId || clientPriceId;

    if (!priceId || !userEmail || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // mode: 'subscription' (default) or 'payment' (one-off top-up)
    // PAYG is always a one-off payment, whatever mode the caller sends, so
    // its checks below can never be skipped by sending mode=subscription.
    const checkoutMode = (mode === "payment" || productKey === "payg_5") ? "payment" : "subscription";
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

    // ── D4: subscriber top-ups are server-enforced ──
    if (checkoutMode === "payment" && productKey !== "payg_5") {
      if (!TOPUP_PRICE_IDS.has(priceId)) {
        return json(400, { error: "Unknown download pack.", code: "UNKNOWN_TOPUP" });
      }
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("subscription_status, plan, downloads_limit, deletion_date")
        .eq("id", userId)
        .maybeSingle();
      if (!topupEligible(prof)) {
        return json(403, {
          error: "Top-up packs are for Easy Start and Easy Pro subscribers. Please use Pay As You Go to buy downloads.",
          code: "TOPUP_SUBSCRIBERS_ONLY",
        });
      }
    }

    // ── Approved decision 2: current subscribers cannot buy PAYG ──
    // Active Easy Start/Pro (including cancel-at-period-end still inside the
    // paid period) must use subscriber top-ups. Paused, ended, trial and PAYG
    // accounts may buy PAYG. Enforced here so the endpoint cannot be called
    // directly to bypass the pricing page.
    if (checkoutMode === "payment" && productKey === "payg_5") {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("subscription_status, plan, downloads_limit, deletion_date")
        .eq("id", userId)
        .maybeSingle();
      if (topupEligible(prof)) {
        return json(403, {
          error: "Pay As You Go isn't available while you have an Easy Start or Easy Pro subscription. Please use subscriber top-ups from your account page instead.",
          code: "PAYG_NOT_FOR_SUBSCRIBERS",
          topupUrl: "https://clpeasy.com/account.html?topup=1",
        });
      }
    }

    // ── D3: 2026 monthly promotion coupon, chosen server-side only ──
    let promoCoupon: string | null = null;
    const promoPlan = checkoutMode === "subscription" ? MONTHLY_PROMO_PLAN_BY_PRICE[priceId] : undefined;
    if (promoPlan && Date.now() < PROMO_2026_END_MS) {
      promoCoupon = Deno.env.get(`PROMO_2026_${promoPlan}_MONTHLY_COUPON_ID`) || null;
      if (!promoCoupon) {
        // Fail closed: never charge the standard price while the site
        // advertises the promotional one.
        console.error(`PROMO_2026_${promoPlan}_MONTHLY_COUPON_ID is not configured`);
        return json(503, { error: "This offer is not available right now. Please try again later.", code: "PROMO_NOT_CONFIGURED" });
      }
    }

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
      if (promoCoupon) {
        params.set("discounts[0][coupon]", promoCoupon);
        params.set("subscription_data[metadata][promo]", "2026_monthly");
      }
    } else if (productKey === "payg_5") {
      params.set("metadata[type]", "payg");
      // 2026 PAYG launch: £4.99 buys 5 + 3 free through 31 Dec 2026.
      // The webhook validates this server-stamped quantity; the browser cannot choose it.
      const paygDownloads = new Date() < new Date("2027-01-01T00:00:00Z") ? "8" : "5";
      params.set("metadata[downloads]", paygDownloads);
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
