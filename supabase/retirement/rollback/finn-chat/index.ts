import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

// ── SECURITY (17 Jul 2026) ────────────────────────────────────
// Finn is Michaela's private assistant. This function now requires a valid
// Supabase Auth token belonging to an allowed account — no anonymous use.
// Also: origin lock, model pinned server-side, per-IP daily rate limit.
// ──────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ["https://clpeasy.com", "https://www.clpeasy.com", "https://clpeasy.netlify.app"];
const ALLOWED_EMAILS = ["michaela.feeley@googlemail.com"];
const DAILY_LIMIT_PER_IP = 200;

const supabaseAuth = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Origin check
    const origin = req.headers.get("origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: { message: "Origin not allowed" } }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Require a valid signed-in session belonging to an allowed account
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: { message: "Not signed in" } }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user || !user.email || !ALLOWED_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ error: { message: "Not authorized" } }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Per-IP daily rate limit (backstop)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: count, error: rlError } = await supabaseAdmin.rpc("increment_rate_limit", { p_key: `finn:${ip}` });
    if (rlError) console.error("Rate limit check failed (allowing request):", rlError.message);
    if (typeof count === "number" && count > DAILY_LIMIT_PER_IP) {
      return new Response(JSON.stringify({ error: { message: "Daily chat limit reached. Try again tomorrow." } }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { system, messages, temperature } = await req.json();

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system,
        messages,
        temperature: temperature ?? 0.35,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});