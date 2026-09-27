// CLPeasy TEST-ONLY lifecycle harness (Stripe Sandbox test clocks). Never in production.
// Token-guarded; refuses to run unless the Stripe key is the CLPeasy Sandbox.
// Disposable qa-lc-*@example.test users only; never touches the manual QA account.
const TOKEN = "<one-off token, rotated; set before use>";
const SANDBOX_ACCT = "acct_1TdczqKF3jvQfgEa";
const PROTECTED_USER = "33333333-0000-4000-8000-000000000156";
const TEST_WEBHOOK_URL = "https://wwjhvpphlbgtywxskqnf.supabase.co/functions/v1/stripe-webhook";
const PROD_WEBHOOK_URL = "https://qvkosdqcryrcfbjtaxic.supabase.co/functions/v1/stripe-webhook";
const SB = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SK = Deno.env.get("STRIPE_SECRET_KEY") || "";
const P = { startM: "price_1Tdd5SKF3jvQfgEaclfSUxn5", startA: "price_1Tdd7pKF3jvQfgEa8DxgQHEW", proM: "price_1Tdd9OKF3jvQfgEaYsCmOwOa", proA: "price_1TddAyKF3jvQfgEaE7Vwbxl6" };
const PROMO = "gWcEql0d";
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const isoS = (t: number) => new Date(t * 1000).toISOString();

async function stripe(method: string, path: string, params?: Record<string, string> | URLSearchParams) {
  const body = params ? (params instanceof URLSearchParams ? params : new URLSearchParams(params)).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}` + (method !== "POST" && body ? `?${body}` : "");
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${SK}`, "Stripe-Version": "2024-04-10", "Content-Type": "application/x-www-form-urlencoded" }, body: method === "POST" ? body : undefined });
  const b = await r.json();
  if (!r.ok) throw new Error(`Stripe ${method} ${path}: ${b?.error?.message}`);
  return b;
}
async function rest(method: string, path: string, body?: unknown) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: any; try { b = JSON.parse(t); } catch { b = t; }
  if (r.status >= 300) throw new Error(`REST ${method} ${path} ${r.status} ${t}`);
  return b;
}
async function newUser(tag: string) {
  const email = `qa-lc-${tag}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = crypto.randomUUID() + "Aa1!";
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
  const u = await r.json(); if (!r.ok) throw new Error("createUser " + JSON.stringify(u));
  const t = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  return { id: u.id as string, email, jwt: t.access_token as string };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-qa-token") !== TOKEN) return j({ error: "gone" }, 410);
  if (!SK.startsWith("sk_test_")) return j({ error: "refusing: not a test key" }, 403);
  const acct = await stripe("GET", "account");
  if (acct.id !== SANDBOX_ACCT) return j({ error: "refusing: not the CLPeasy sandbox" }, 403);
  const { action, ...a } = await req.json();
  try {
    if (action === "webhooks_inspect") {
      const we = await stripe("GET", "webhook_endpoints", { limit: "20" });
      const endpoints = we.data.map((w: any) => ({ id: w.id, url: w.url, status: w.status, livemode: w.livemode, enabled_events: w.enabled_events, api_version: w.api_version, description: w.description, created: isoS(w.created) }));
      const recent = await stripe("GET", "events", { limit: "25" });
      const failing = await stripe("GET", "events", { limit: "25", delivery_success: "false" });
      const ev = (e: any) => ({ id: e.id, type: e.type, created: isoS(e.created), pending_webhooks: e.pending_webhooks, livemode: e.livemode });
      return j({ account: acct.id, endpoints, recent_events: recent.data.map(ev), events_with_failed_deliveries: failing.data.map(ev) });
    }
    if (action === "webhooks_apply") {
      const we = await stripe("GET", "webhook_endpoints", { limit: "20" });
      const bad = we.data.find((w: any) => w.id === a.disableId);
      const test = we.data.find((w: any) => w.id === a.testId);
      if (!bad || bad.url !== PROD_WEBHOOK_URL || bad.livemode !== false) return j({ error: "refusing: endpoint to disable is not the Sandbox->production endpoint", bad }, 400);
      if (!test || test.url !== TEST_WEBHOOK_URL || test.livemode !== false) return j({ error: "refusing: test endpoint mismatch", test }, 400);
      const before = { bad: { status: bad.status, events: bad.enabled_events }, test: { status: test.status, events: test.enabled_events } };
      const disabled = await stripe("POST", `webhook_endpoints/${bad.id}`, { disabled: "true" });
      const want = Array.from(new Set([...test.enabled_events, "invoice.paid", "customer.subscription.updated", "customer.subscription.deleted"]));
      const p = new URLSearchParams(); want.forEach((e, i) => p.set(`enabled_events[${i}]`, e));
      const updated = await stripe("POST", `webhook_endpoints/${test.id}`, p);
      return j({ before, after: { bad: { id: disabled.id, url: disabled.url, status: disabled.status, events: disabled.enabled_events }, test: { id: updated.id, url: updated.url, status: updated.status, events: updated.enabled_events } } });
    }
    if (action === "resend_failed") {
      // Re-deliver failed Sandbox events to the CLPeasy Test endpoint only (what `stripe events resend` does).
      const failing = await stripe("GET", "events", { limit: "20", delivery_success: "false", type: a.type });
      const out: any[] = [];
      for (const e of failing.data) {
        if (e.livemode) continue;
        try { await stripe("POST", `events/${e.id}/retry`, { webhook_endpoint: "we_1UJZJ5KF3jvQfgEahDqXnOEL" }); out.push({ id: e.id, created: isoS(e.created), resent: true }); }
        catch (err) { out.push({ id: e.id, error: String(err) }); }
      }
      return j(out);
    }
    if (action === "portal_config") {
      const c = await stripe("GET", "billing_portal/configurations", { limit: "5" });
      return j(c.data.map((x: any) => ({ id: x.id, active: x.active, is_default: x.is_default, default_return_url: x.default_return_url, features: x.features })));
    }
    if (action === "setup") {
      const now = Math.floor(Date.now() / 1000);
      const clock = await stripe("POST", "test_helpers/test_clocks", { frozen_time: String(now), name: "clpeasy-pr156-lifecycle" });
      let other; try { other = await stripe("GET", "coupons/QA_OTHER_SAVE50"); } catch { other = await stripe("POST", "coupons", { id: "QA_OTHER_SAVE50", percent_off: "50", duration: "forever", name: "QA unrelated save-offer (test only)" }); }
      const plans: [string, string, string | null][] = [["promo", P.startM, PROMO], ["other", P.startM, "QA_OTHER_SAVE50"], ["life", P.proM, PROMO]];
      const out: any = { clock: clock.id, frozen: isoS(now), subs: {} };
      for (const [k, price, coupon] of plans) {
        const u = await newUser(k);
        const cust = await stripe("POST", "customers", { email: u.email, test_clock: clock.id, payment_method: "pm_card_visa", "invoice_settings[default_payment_method]": "pm_card_visa", "metadata[qa]": "pr156-lifecycle" });
        // Mirror what checkout.session.completed records for a real Checkout subscription.
        const params: Record<string, string> = { customer: cust.id, "items[0][price]": price, "metadata[userId]": u.id, "metadata[priceId]": price };
        if (coupon) params["discounts[0][coupon]"] = coupon;
        if (coupon === PROMO) params["metadata[promo]"] = "2026_monthly";
        const s = await stripe("POST", "subscriptions", params);
        await rest("POST", "subscriptions", { user_id: u.id, stripe_customer_id: cust.id, stripe_subscription_id: s.id, price_id: price, plan: price === P.proM ? "easy_pro_monthly" : "easy_start_monthly", status: "active", updated_at: new Date().toISOString() });
        out.subs[k] = { user: u.id, email: u.email, jwt: u.jwt, customer: cust.id, sub: s.id, status: s.status, period_end: isoS(s.current_period_end) };
      }
      return j(out);
    }
    if (action === "advance") {
      const c = await stripe("POST", `test_helpers/test_clocks/${a.clock}/advance`, { frozen_time: String(a.to) });
      return j({ status: c.status, frozen_time: isoS(c.frozen_time) });
    }
    if (action === "sub_update") {
      // Simulates what the Stripe portal / Account plan management does on Stripe's side.
      const params: Record<string, string> = {};
      if (a.op === "pause") params["pause_collection[behavior]"] = "void";
      if (a.op === "resume") params["pause_collection"] = "";
      if (a.op === "cancel_at_period_end") params["cancel_at_period_end"] = "true";
      if (a.op === "reactivate") params["cancel_at_period_end"] = "false";
      if (a.op === "switch_price") {
        const s = await stripe("GET", `subscriptions/${a.sub}`);
        params["items[0][id]"] = s.items.data[0].id; params["items[0][price]"] = a.price; params["proration_behavior"] = "none";
        params["metadata[priceId]"] = a.price;
      }
      if (a.op === "cancel_now") { const d = await stripe("DELETE", `subscriptions/${a.sub}`); return j({ status: d.status }); }
      const s = await stripe("POST", `subscriptions/${a.sub}`, params);
      return j({ status: s.status, cancel_at_period_end: s.cancel_at_period_end, pause_collection: s.pause_collection, price: s.items?.data?.[0]?.price?.id });
    }
    if (action === "set_used") {
      await rest("PATCH", `profiles?id=eq.${a.user}`, { downloads_used: a.used });
      return j({ ok: true });
    }
    if (action === "status") {
      const c = await stripe("GET", `test_helpers/test_clocks/${a.clock}`);
      const out: any = { clock: { status: c.status, frozen_time: isoS(c.frozen_time) }, subs: {} };
      for (const [k, s] of Object.entries<any>(a.subs)) {
        let sub: any = null; try { sub = await stripe("GET", `subscriptions/${s.sub}`); } catch (e) { sub = { error: String(e) }; }
        const inv = await stripe("GET", "invoices", { subscription: s.sub, limit: "8" });
        const prof = (await rest("GET", `profiles?id=eq.${s.user}&select=plan,is_pro,subscription_status,billing_cycle,downloads_used,downloads_limit,topup_credits,deletion_date,next_payment`))[0];
        const row = (await rest("GET", `subscriptions?user_id=eq.${s.user}&select=status,plan,price_id`))[0];
        out.subs[k] = {
          stripe: sub?.error ? sub : { status: sub.status, discount: sub.discount?.coupon?.id ?? null, cancel_at_period_end: sub.cancel_at_period_end, pause: !!sub.pause_collection, price: sub.items?.data?.[0]?.price?.id, period: `${isoS(sub.current_period_start).slice(0, 10)}..${isoS(sub.current_period_end).slice(0, 10)}` },
          invoices: inv.data.map((i: any) => ({ reason: i.billing_reason, status: i.status, total: i.total, period_start: isoS(i.lines?.data?.[0]?.period?.start ?? 0).slice(0, 10), discount: i.discount?.coupon?.id ?? null })),
          profile: prof, subscriptions_row: row,
        };
      }
      return j(out);
    }
    if (action === "cleanup") {
      const out: any = {};
      if (a.clock) { try { await stripe("DELETE", `test_helpers/test_clocks/${a.clock}`); out.clockDeleted = true; } catch (e) { out.clockError = String(e); } }
      try { await stripe("DELETE", "coupons/QA_OTHER_SAVE50"); out.couponDeleted = true; } catch { /* none */ }
      const us = await rest("GET", "profiles?email=like.qa-lc-*&select=id");
      let n = 0;
      for (const u of us) { if (u.id === PROTECTED_USER) continue; const d = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } }); if (d.ok) n++; }
      out.usersDeleted = n;
      return j(out);
    }
    return j({ error: "unknown action" }, 400);
  } catch (e) { return j({ error: String(e) }, 500); }
});
