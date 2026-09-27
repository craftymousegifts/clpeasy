// CLPeasy TEST-ONLY QA harness (never in the repo, never on production).
// Token-guarded; refuses to run unless the Stripe key is the CLPeasy Sandbox.
// Creates only disposable qa-harness-*@example.test users; never touches the
// manual QA account.
const TOKEN = "<one-off token, rotated; set before use>";
const SANDBOX_ACCT = "acct_1TdczqKF3jvQfgEa";
const PROTECTED_USER = "33333333-0000-4000-8000-000000000156";
const SB = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SK = Deno.env.get("STRIPE_SECRET_KEY") || "";
const V10 = "https://clpeasy-pr156-payg-test-v10.netlify.app";
const P = {
  startM: "price_1Tdd5SKF3jvQfgEaclfSUxn5", startA: "price_1Tdd7pKF3jvQfgEa8DxgQHEW",
  proM: "price_1Tdd9OKF3jvQfgEaYsCmOwOa", proA: "price_1TddAyKF3jvQfgEaE7Vwbxl6",
  top5: "price_1TeBHjKF3jvQfgEaX2aPZX6E", top10: "price_1TeBIKKF3jvQfgEaxU4TjPHu",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function stripe(method: string, path: string, params?: Record<string, string>) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}` + (method === "GET" && body ? `?${body}` : "");
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${SK}`, "Stripe-Version": "2024-04-10", "Content-Type": "application/x-www-form-urlencoded" }, body: method === "GET" ? undefined : body });
  const b = await r.json();
  if (!r.ok) throw new Error(`Stripe ${method} ${path}: ${b?.error?.message}`);
  return b;
}
async function rest(method: string, path: string, body?: unknown, prefer = "return=representation") {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", Prefer: prefer }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`REST ${method} ${path}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function newUser(tag: string, profile: Record<string, unknown>) {
  const email = `qa-harness-${tag}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = crypto.randomUUID() + "Aa1!";
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
  const u = await r.json();
  if (!r.ok) throw new Error("createUser " + JSON.stringify(u));
  if (Object.keys(profile).length) await rest("PATCH", `profiles?id=eq.${u.id}`, profile);
  const t = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const tok = await t.json();
  if (!t.ok) throw new Error("signin " + JSON.stringify(tok));
  return { id: u.id as string, email, jwt: tok.access_token as string };
}
async function callFn(name: string, jwt: string | null, body: unknown, origin = V10) {
  const h: Record<string, string> = { apikey: ANON, "Content-Type": "application/json", Origin: origin };
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  const r = await fetch(`${SB}/functions/v1/${name}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  let b: any; const t = await r.text(); try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
}
async function inspectSession(url: string) {
  const id = (url.match(/cs_test_[A-Za-z0-9]+/) || [])[0];
  if (!id) return { error: "no test session id in url", url: url.slice(0, 60) };
  const s = await stripe("GET", `checkout/sessions/${id}`, { "expand[]": "line_items" });
  const out = { id, livemode: s.livemode, mode: s.mode, amount_subtotal: s.amount_subtotal, amount_total: s.amount_total, currency: s.currency,
    price: s.line_items?.data?.[0]?.price?.id, product_name: s.line_items?.data?.[0]?.description, metadata: s.metadata,
    success_url: s.success_url, cancel_url: s.cancel_url, discount: s.total_details?.amount_discount, customer_email: s.customer_email,
    billing_address_collection: s.billing_address_collection };
  await stripe("POST", `checkout/sessions/${id}/expire`, {});
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-qa-token") !== TOKEN) return j({ error: "gone" }, 410);
  if (!SK.startsWith("sk_test_")) return j({ error: "refusing: not a test key" }, 403);
  const acct = await stripe("GET", "account");
  if (acct.id !== SANDBOX_ACCT) return j({ error: "refusing: not the CLPeasy sandbox", acct: acct.id }, 403);
  const { action, ...a } = await req.json();
  const out: any = { action, account: acct.id };
  try {
    if (action === "config") {
      out.prices = {};
      for (const [k, id] of Object.entries(P)) { const p = await stripe("GET", `prices/${id}`); out.prices[k] = { id, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null, active: p.active, livemode: p.livemode }; }
      const c = await stripe("GET", "coupons/gWcEql0d");
      out.coupon = { id: c.id, percent_off: c.percent_off, duration: c.duration, valid: c.valid };
      const we = await stripe("GET", "webhook_endpoints", { limit: "20" });
      out.webhooks = we.data.map((w: any) => ({ url: w.url, status: w.status, events: w.enabled_events }));
      return j(out);
    }
    if (action === "checkout") {
      const DAY = 86400000, iso = (ms: number) => new Date(Date.now() + ms).toISOString();
      const states: Record<string, Record<string, unknown>> = {
        trial: {},
        expired: { trial_end: iso(-2 * DAY) },
        payg: { plan: "payg", subscription_status: "payg", downloads_limit: 0, topup_credits: 3, trial_end: iso(-9 * DAY) },
        start: { plan: "easy_start", subscription_status: "active", downloads_limit: 20, billing_cycle: "monthly" },
        pro: { plan: "easy_pro", is_pro: true, subscription_status: "active", downloads_limit: 30, billing_cycle: "monthly" },
        cancelSched: { plan: "easy_pro", is_pro: true, subscription_status: "cancelled", downloads_limit: 30, deletion_date: iso(10 * DAY) },
        paused: { plan: "easy_start", subscription_status: "paused", downloads_limit: 20 },
        ended: { plan: "free", subscription_status: "cancelled", downloads_limit: 0 },
        endedPeriodOver: { plan: "easy_start", subscription_status: "cancelled", downloads_limit: 20, deletion_date: iso(-1 * DAY) },
      };
      const users: Record<string, any> = {};
      for (const [k, prof] of Object.entries(states)) users[k] = await newUser(k, prof);
      out.users = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, u.id]));
      const payg = { productKey: "payg_5", mode: "payment", successUrl: `${V10}/account.html?payg=success`, cancelUrl: `${V10}/pricing.html?payg=cancelled`, priceId: P.top5 };
      const top = (pid: string) => ({ priceId: pid, mode: "payment", successUrl: `${V10}/builder.html?topup=success`, cancelUrl: `${V10}/builder.html?topup=cancelled` });
      out.results = {};
      for (const k of Object.keys(states)) {
        const r: any = {};
        for (const [label, body] of [["payg", payg], ["top5", top(P.top5)], ["top10", top(P.top10)]] as const) {
          const c = await callFn("create-checkout-session", users[k].jwt, body);
          r[label] = { status: c.status, code: c.body?.code ?? null, error: c.status === 200 ? undefined : c.body?.error };
          if (c.status === 200 && c.body?.url) r[label].session = await inspectSession(c.body.url);
        }
        out.results[k] = r;
      }
      // subscription checkouts (fresh trial user each, locks cleared between)
      const subs: any = {};
      const attempt = async (name: string, body: any) => {
        const u = await newUser("sub-" + name, {});
        const c = await callFn("create-checkout-session", u.jwt, body);
        subs[name] = { status: c.status, code: c.body?.code ?? null, error: c.status === 200 ? undefined : c.body?.error };
        if (c.status === 200) subs[name].session = await inspectSession(c.body.url);
        return u;
      };
      const sb = (pid: string, extra: any = {}) => ({ priceId: pid, mode: "subscription", successUrl: `${V10}/builder.html?subscribed=true`, cancelUrl: `${V10}/checkout.html?cancelled=true`, ...extra });
      await attempt("startMonthly", sb(P.startM));
      await attempt("proMonthly", sb(P.proM));
      await attempt("startAnnual", sb(P.startA));
      await attempt("proAnnual", sb(P.proA));
      await attempt("injectCoupon", sb(P.startA, { coupon: "gWcEql0d", discounts: [{ coupon: "gWcEql0d" }], promotion_code: "X", allow_promotion_codes: true }));
      await attempt("foreignReturnUrls", sb(P.startM, { successUrl: "https://evil.example/steal", cancelUrl: "https://clpeasy.com.evil.example/x" }));
      const dbl = await attempt("doubleClick1", sb(P.proM));
      const c2 = await callFn("create-checkout-session", dbl.jwt, sb(P.proM));
      subs.doubleClick2 = { status: c2.status, code: c2.body?.code ?? null };
      const noAuth = await callFn("create-checkout-session", null, payg);
      subs.noAuth = { status: noAuth.status };
      const badJwt = await callFn("create-checkout-session", "not-a-jwt", payg);
      subs.badJwt = { status: badJwt.status };
      out.subscriptions = subs;
      // billing-status for non-subscribers
      out.billingStatusTrial = (await callFn("billing-status", users.trial.jwt, {})).body;
      out.billingStatusNoAuth = (await callFn("billing-status", null, {})).status;
      return j(out);
    }
    if (action === "user") {
      const u = await newUser(a.tag || "u", a.profile || {});
      return j({ ...out, id: u.id, jwt: u.jwt });
    }
    if (action === "session") {
      return j({ ...out, session: await inspectSession(a.url) });
    }
    if (action === "clock_setup") {
      const now = Math.floor(Date.now() / 1000);
      const clock = await stripe("POST", "test_helpers/test_clocks", { frozen_time: String(now), name: "clpeasy-pr156-qa" });
      out.clock = clock.id;
      let other = null;
      try { other = await stripe("GET", "coupons/QA_OTHER_SAVE50"); } catch { other = await stripe("POST", "coupons", { id: "QA_OTHER_SAVE50", percent_off: "50", duration: "forever", name: "QA unrelated save-offer (test only)" }); }
      const plans: [string, string, string | null, Record<string, unknown>][] = [
        ["startPromo", P.startM, "gWcEql0d", { plan: "easy_start", subscription_status: "active", downloads_limit: 20, billing_cycle: "monthly" }],
        ["proPromo", P.proM, "gWcEql0d", { plan: "easy_pro", is_pro: true, subscription_status: "active", downloads_limit: 30, billing_cycle: "monthly" }],
        ["startOther", P.startM, "QA_OTHER_SAVE50", { plan: "easy_start", subscription_status: "active", downloads_limit: 20, billing_cycle: "monthly" }],
        ["startAnnual", P.startA, null, { plan: "easy_start", subscription_status: "active", downloads_limit: 20, billing_cycle: "annual" }],
        ["proMonthlyCredit", P.proM, "gWcEql0d", { plan: "easy_pro", is_pro: true, subscription_status: "active", downloads_limit: 30, billing_cycle: "monthly" }],
      ];
      out.subs = {};
      for (const [k, price, coupon, prof] of plans) {
        const u = await newUser("clock-" + k, prof);
        const cust = await stripe("POST", "customers", { email: u.email, test_clock: clock.id, payment_method: "pm_card_visa", "invoice_settings[default_payment_method]": "pm_card_visa", "metadata[qa]": "pr156" });
        if (k === "proMonthlyCredit") await stripe("POST", `customers/${cust.id}/balance_transactions`, { amount: "-500", currency: "gbp", description: "QA account credit £5" });
        const params: Record<string, string> = { customer: cust.id, "items[0][price]": price, "metadata[userId]": u.id, "metadata[priceId]": price };
        if (coupon) { params["discounts[0][coupon]"] = coupon; if (coupon === "gWcEql0d") params["metadata[promo]"] = "2026_monthly"; }
        const s = await stripe("POST", "subscriptions", params);
        await rest("POST", "subscriptions", { user_id: u.id, stripe_customer_id: cust.id, stripe_subscription_id: s.id, price_id: price, plan: k, status: "active", updated_at: new Date().toISOString() }, "resolution=merge-duplicates,return=minimal");
        out.subs[k] = { user: u.id, email: u.email, customer: cust.id, sub: s.id, status: s.status };
      }
      return j(out);
    }
    if (action === "clock_advance") {
      const c = await stripe("POST", `test_helpers/test_clocks/${a.clock}/advance`, { frozen_time: String(a.to) });
      return j({ ...out, clock: c.id, status: c.status, frozen_time: c.frozen_time });
    }
    if (action === "clock_status") {
      const c = await stripe("GET", `test_helpers/test_clocks/${a.clock}`);
      out.clock = { status: c.status, frozen_time: new Date(c.frozen_time * 1000).toISOString() };
      out.subs = {};
      for (const [k, s] of Object.entries<any>(a.subs)) {
        const sub = await stripe("GET", `subscriptions/${s.sub}`);
        const inv = await stripe("GET", "invoices", { subscription: s.sub, limit: "6" });
        const prof = (await rest("GET", `profiles?id=eq.${s.user}&select=plan,subscription_status,downloads_limit,downloads_used,billing_cycle,next_payment,downloads_reset_date`))[0];
        // billing-status as that customer (fresh sign-in via magic: admin generate link is heavy; use a service-signed session instead)
        out.subs[k] = {
          status: sub.status, discount: sub.discount?.coupon?.id ?? null, current_period_start: new Date(sub.current_period_start * 1000).toISOString(), current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          invoices: inv.data.map((i: any) => ({ id: i.id, billing_reason: i.billing_reason, status: i.status, total: i.total, amount_due: i.amount_due, period_start: new Date((i.lines?.data?.[0]?.period?.start ?? 0) * 1000).toISOString().slice(0, 10), discount: i.discount?.coupon?.id ?? null })),
          profile: prof,
        };
      }
      return j(out);
    }
    if (action === "billing_status_as") {
      // Sign the customer in again (password unknown) -> set a new password via admin API.
      if (a.user === PROTECTED_USER) return j({ error: "refusing protected user" }, 403);
      const pw = crypto.randomUUID() + "Aa1!";
      await fetch(`${SB}/auth/v1/admin/users/${a.user}`, { method: "PUT", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const t = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: a.email, password: pw }) })).json();
      const r = await callFn("billing-status", t.access_token, {});
      return j({ ...out, status: r.status, body: r.body });
    }
    if (action === "cleanup") {
      if (a.clock) { try { await stripe("DELETE", `test_helpers/test_clocks/${a.clock}`); out.clockDeleted = true; } catch (e) { out.clockError = String(e); } }
      const us = await rest("GET", "profiles?email=like.qa-harness-*&select=id,email");
      let n = 0;
      for (const u of us) {
        if (u.id === PROTECTED_USER) continue;
        const r = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
        if (r.ok) n++;
      }
      out.usersDeleted = n;
      try { await stripe("DELETE", "coupons/QA_OTHER_SAVE50"); out.otherCouponDeleted = true; } catch { /* none */ }
      return j(out);
    }
    return j({ error: "unknown action" }, 400);
  } catch (e) {
    out.error = String(e);
    return j(out, 500);
  }
});
