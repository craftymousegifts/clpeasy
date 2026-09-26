// ═══════════════════════════════════════════════════════════════
// CLPeasy — billing-status Edge Function (approved decision 4, 26 Sep 2026)
// ═══════════════════════════════════════════════════════════════
// Returns the signed-in customer's ACTUAL next Stripe charge for the Account
// page, so it never shows a guessed list price (e.g. £9.99 to a customer on
// the 2026 £8.99 promotion, or on the account save-offer).
//
// The amount is Stripe's own upcoming-invoice calculation (price, coupons,
// customer balance), never recalculated here. The browser sends only its
// Supabase session token; the Stripe customer/subscription are looked up
// server-side for THAT user. No Stripe secret or ID is returned.
//
// One adjustment: stripe-webhook removes the 2026 monthly promotion coupon at
// the first renewal whose period starts on/after 1 Jan 2027. Stripe's preview
// cannot know that, so for that renewal the preview is requested without
// discounts (Stripe still does the calculation).
//
// Any failure returns { available: false } — the page then shows no amount.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STRIPE_API_VERSION = "2024-04-10"; // same as stripe-webhook
const PROMO_2026_END_MS = Date.UTC(2027, 0, 1);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const unavailable = (reason: string) => json({ available: false, reason });

async function stripeGet(path: string, params: URLSearchParams, key: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}?${params.toString()}`, {
    headers: { "Authorization": `Bearer ${key}`, "Stripe-Version": STRIPE_API_VERSION },
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || `Stripe ${res.status}`), { stripeCode: body?.error?.code });
  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization token" }, 401);
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return unavailable("not_configured");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row, error: rowError } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row?.stripe_customer_id || !row?.stripe_subscription_id) return unavailable("no_subscription");

    const sub = await stripeGet(`subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`, new URLSearchParams(), stripeKey);
    // Never trust a subscription that isn't this customer's.
    if (sub.customer !== row.stripe_customer_id) return unavailable("mismatch");
    if (sub.status !== "active" || sub.cancel_at_period_end || sub.pause_collection) return unavailable("no_upcoming_charge");

    const params = new URLSearchParams({ customer: row.stripe_customer_id, subscription: row.stripe_subscription_id });
    const promoCoupons = new Set(["PROMO_2026_EASY_START_MONTHLY_COUPON_ID", "PROMO_2026_EASY_PRO_MONTHLY_COUPON_ID"]
      .map((k) => Deno.env.get(k) || "").filter(Boolean));
    const promoAttached = !!sub.discount?.coupon?.id && promoCoupons.has(sub.discount.coupon.id);
    const promoEndsBeforeNextPeriod = promoAttached && (sub.current_period_end ?? 0) * 1000 >= PROMO_2026_END_MS;
    if (promoEndsBeforeNextPeriod) params.set("discounts", "");

    const inv = await stripeGet("invoices/upcoming", params, stripeKey);
    const recurring = sub.items?.data?.[0]?.price?.recurring;
    return json({
      available: true,
      amount_due: inv.amount_due,          // minor units, Stripe-calculated
      currency: inv.currency,
      next_payment_at: inv.next_payment_attempt ?? sub.current_period_end ?? null, // unix seconds
      interval: recurring?.interval ?? null,  // 'month' | 'year'
      discounted: Array.isArray(inv.total_discount_amounts) && inv.total_discount_amounts.some((d: any) => (d?.amount ?? 0) > 0),
      promo_2026: promoAttached && !promoEndsBeforeNextPeriod,
    });
  } catch (err) {
    console.error("billing-status failed:", err);
    return unavailable("lookup_failed");
  }
});
