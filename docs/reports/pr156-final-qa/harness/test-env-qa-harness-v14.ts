// CLPeasy TEST-ONLY QA harness (v14 automated E2E). Never in production.
// Token-guarded; refuses to run unless the Stripe key is the CLPeasy Sandbox.
// Creates only disposable qa-v14-*@example.test users and never touches the
// manual QA account. Every Checkout Session it inspects is expired at once.
const TOKEN = "<one-off token, rotated; set before use>";
const SANDBOX_ACCT = "acct_1TdczqKF3jvQfgEa";
const PROTECTED_USER = "33333333-0000-4000-8000-000000000156";
const SB = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SK = Deno.env.get("STRIPE_SECRET_KEY") || "";
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const DAY = 86400000, iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function stripe(method: string, path: string, params?: Record<string, string>) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}` + (method === "GET" && body ? `?${body}` : "");
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${SK}`, "Stripe-Version": "2024-04-10", "Content-Type": "application/x-www-form-urlencoded" }, body: method === "GET" ? undefined : body });
  const b = await r.json();
  if (!r.ok) throw new Error(`Stripe ${method} ${path}: ${b?.error?.message}`);
  return b;
}
async function rest(method: string, path: string, body?: unknown, auth: string | null = SRK) {
  // Service calls: apikey+Bearer = service key (it may be a non-JWT secret key).
  // Customer calls: apikey = anon key, Bearer = the customer's own JWT.
  // Anonymous calls: apikey = anon key only.
  const headers: Record<string, string> = { "Content-Type": "application/json", Prefer: "return=representation" };
  if (auth === SRK) { headers.apikey = SRK; headers.Authorization = `Bearer ${SRK}`; }
  else { headers.apikey = ANON; if (auth) headers.Authorization = `Bearer ${auth}`; }
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: any; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
}
async function newUser(tag: string, profile: Record<string, unknown>) {
  const email = `qa-v14-${tag}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = crypto.randomUUID() + "Aa1!";
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
  const u = await r.json(); if (!r.ok) throw new Error("createUser " + JSON.stringify(u));
  if (Object.keys(profile).length) { const p = await rest("PATCH", `profiles?id=eq.${u.id}`, profile); if (p.status >= 300) throw new Error("profile " + JSON.stringify(p.body)); }
  const t = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  return { id: u.id as string, jwt: t.access_token as string };
}
const prof = async (id: string) => (await rest("GET", `profiles?id=eq.${id}&select=plan,subscription_status,downloads_used,downloads_limit,topup_credits`)).body[0];
const rpc = async (jwt: string, args: Record<string, unknown>) => rest("POST", "rpc/consume_download", args, jwt);

Deno.serve(async (req) => {
  if (req.headers.get("x-qa-token") !== TOKEN) return j({ error: "gone" }, 410);
  if (!SK.startsWith("sk_test_")) return j({ error: "refusing: not a test key" }, 403);
  const acct = await stripe("GET", "account");
  if (acct.id !== SANDBOX_ACCT) return j({ error: "refusing: not the CLPeasy sandbox" }, 403);
  const { action, ...a } = await req.json();
  try {
    if (action === "users") {
      const STATES: Record<string, Record<string, unknown>> = {
        trial: {}, expired: { trial_end: iso(-2 * DAY) },
        payg: { plan: "payg", subscription_status: "payg", downloads_limit: 0, topup_credits: 3, trial_end: iso(-9 * DAY) },
        start: { plan: "easy_start", subscription_status: "active", downloads_limit: 20, billing_cycle: "monthly" },
        pro: { plan: "easy_pro", is_pro: true, subscription_status: "active", downloads_limit: 30, billing_cycle: "monthly" },
        cancelSched: { plan: "easy_pro", is_pro: true, subscription_status: "cancelled", downloads_limit: 30, deletion_date: iso(10 * DAY) },
        paused: { plan: "easy_start", subscription_status: "paused", downloads_limit: 20 },
        ended: { plan: "free", subscription_status: "cancelled", downloads_limit: 0 },
        endedPeriodOver: { plan: "easy_start", subscription_status: "cancelled", downloads_limit: 20, deletion_date: iso(-1 * DAY) },
        subStartM: {}, subProM: {}, subStartA: {}, subProA: {}, subInject: {}, subForeign: {}, subDouble: {},
        subActive: { plan: "easy_start", subscription_status: "active", downloads_limit: 20, billing_cycle: "monthly" },
      };
      const out: Record<string, unknown> = {};
      for (const [k, p] of Object.entries(STATES)) out[k] = await newUser(k, p);
      // an active subscriber with a linked Stripe subscription row (for the ALREADY_SUBSCRIBED guard)
      const sa = out.subActive as any;
      await rest("POST", "subscriptions", { user_id: sa.id, stripe_customer_id: "cus_qa_v14_fake", stripe_subscription_id: "sub_qa_v14_fake", price_id: "price_1Tdd5SKF3jvQfgEaclfSUxn5", plan: "easy_start_monthly", status: "active" });
      return j({ anon: ANON, users: out });
    }
    if (action === "sessions") {
      const res: Record<string, unknown> = {};
      for (const [k, url] of Object.entries<string>(a.urls)) {
        const id = (String(url).match(/cs_test_[A-Za-z0-9]+/) || [])[0];
        if (!id) { res[k] = { error: "no test session id" }; continue; }
        const s = await stripe("GET", `checkout/sessions/${id}`, { "expand[]": "line_items" });
        res[k] = { livemode: s.livemode, mode: s.mode, amount_subtotal: s.amount_subtotal, amount_total: s.amount_total, currency: s.currency,
          price: s.line_items?.data?.[0]?.price?.id, product: s.line_items?.data?.[0]?.description, metadata: s.metadata,
          success_url: s.success_url, cancel_url: s.cancel_url, discount: s.total_details?.amount_discount,
          discounts: (s.discounts || []).map((d: any) => d.coupon), billing_address_collection: s.billing_address_collection };
        await stripe("POST", `checkout/sessions/${id}/expire`, {});
      }
      return j(res);
    }
    if (action === "rpc") {
      // Real PostgREST path with a real customer JWT (no function-to-function calls).
      const out: Record<string, unknown> = {};
      const u = await newUser("rpc", { plan: "payg", subscription_status: "payg", downloads_limit: 0, topup_credits: 3, trial_end: iso(-9 * DAY) });
      const K = "rpc qa::scented candle::rectangle::80x95mm", L = "rpc qa::scented candle";
      out.first = { r: (await rpc(u.jwt, { p_label_key: K, p_legacy_label_key: L })).body, p: await prof(u.id) };
      out.again = { r: (await rpc(u.jwt, { p_label_key: K, p_legacy_label_key: L })).body, p: await prof(u.id) };
      out.otherSize = { r: (await rpc(u.jwt, { p_label_key: "rpc qa::scented candle::rectangle::60x60mm", p_legacy_label_key: L })).body, p: await prof(u.id) };
      out.composer = { r: (await rpc(u.jwt, { p_label_key: null })).body, p: await prof(u.id) };
      out.zero = { r: (await rpc(u.jwt, { p_label_key: "rpc qa 2::wax melt::circle::52mm", p_legacy_label_key: "rpc qa 2::wax melt" })).body, p: await prof(u.id) };
      out.zeroRedownload = { r: (await rpc(u.jwt, { p_label_key: K, p_legacy_label_key: L })).body, p: await prof(u.id) };
      out.onlyKeyArg = (await rpc(u.jwt, { p_label_key: K })).body;
      out.selfCredit = { patch: await rest("PATCH", `profiles?id=eq.${u.id}`, { topup_credits: 999, plan: "easy_pro", subscription_status: "active", downloads_limit: 999 }, u.jwt), p: await prof(u.id) };
      out.selfRpcCredit = (await rest("POST", "rpc/credit_payg_purchase", { p_user_id: u.id, p_downloads: 100 }, u.jwt)).status;
      out.otherUserRead = (await rest("GET", `profiles?id=eq.${PROTECTED_USER}&select=topup_credits`, undefined, u.jwt)).body;
      out.anonRpc = (await rest("POST", "rpc/consume_download", { p_label_key: null }, null)).status;
      // legacy transition: a pre-v13 key within 7 days is inherited once, by one size only
      const v = await newUser("rpclegacy", { plan: "payg", subscription_status: "payg", downloads_limit: 0, topup_credits: 2, trial_end: iso(-9 * DAY) });
      await rest("POST", "label_downloads", { user_id: v.id, label_key: "legacy qa::reed diffuser", last_downloaded_at: iso(-2 * DAY), clean_export: true });
      out.legacyFirst = { r: (await rpc(v.jwt, { p_label_key: "legacy qa::reed diffuser::rectangle::50x50mm", p_legacy_label_key: "legacy qa::reed diffuser" })).body, p: await prof(v.id),
        rows: (await rest("GET", `label_downloads?user_id=eq.${v.id}&select=label_key,last_downloaded_at`)).body };
      out.legacySecondSize = { r: (await rpc(v.jwt, { p_label_key: "legacy qa::reed diffuser::rectangle::70x70mm", p_legacy_label_key: "legacy qa::reed diffuser" })).body, p: await prof(v.id) };
      return j(out);
    }
    if (action === "cleanup") {
      const us = (await rest("GET", "profiles?email=like.qa-v14-*&select=id")).body || [];
      let n = 0;
      for (const u of us) { if (u.id === PROTECTED_USER) continue; const d = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } }); if (d.ok) n++; }
      return j({ usersDeleted: n });
    }
    return j({ error: "unknown action" }, 400);
  } catch (e) { return j({ error: String(e) }, 500); }
});
