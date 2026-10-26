import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

// ── SECURITY HARDENING (added 17 Jul 2026) ─────────────────────────
// Previously this was an open proxy: any caller, any origin, any model,
// any token count — all billed to the CLPeasy Anthropic key. Now:
//   1. Origin must be clpeasy.com (or Netlify preview)
//   2. Model is restricted to an allowlist; caller cannot pick Opus etc.
//   3. max_tokens capped server-side
//   4. Per-IP daily rate limit via api_rate_limits table
// ──────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ["https://clpeasy.com", "https://www.clpeasy.com", "https://clpeasy.netlify.app"];
const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-3-5-haiku-20241022",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
]);
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 2000;
const DAILY_LIMIT_PER_IP = 40;

const supabase = createClient(
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
    // 1. Origin check — browser requests from other sites are rejected
    const origin = req.headers.get("origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Per-IP daily rate limit
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: count, error: rlError } = await supabase.rpc("increment_rate_limit", { p_key: `wizard:${ip}` });
    if (rlError) console.error("Rate limit check failed (allowing request):", rlError.message);
    if (typeof count === "number" && count > DAILY_LIMIT_PER_IP) {
      return new Response(JSON.stringify({ error: "Daily limit reached. Please try again tomorrow or contact support@clpeasy.com." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // 3. Model allowlist + token cap enforced server-side
    const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
    const maxTokens = Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: body.system ?? "",
        messages: body.messages ?? [],
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});