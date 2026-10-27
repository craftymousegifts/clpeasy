import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

// ── SECURITY (17 Jul 2026): origin lock + per-IP daily rate limit ──
const ALLOWED_ORIGINS = ["https://clpeasy.com", "https://www.clpeasy.com", "https://clpeasy.netlify.app"];
const DAILY_LIMIT_PER_IP = 40;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const origin = req.headers.get("origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: count, error: rlError } = await supabaseAdmin.rpc("increment_rate_limit", { p_key: `search:${ip}` });
    if (rlError) console.error("Rate limit check failed (allowing request):", rlError.message);
    if (typeof count === "number" && count > DAILY_LIMIT_PER_IP) {
      return new Response(JSON.stringify({ error: "Daily question limit reached. Please try again tomorrow." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const question = body.question || "";

    if (!question.trim()) {
      return new Response(JSON.stringify({ error: "No question provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: "You are CLPeasy's compliance helper for UK candle, wax melt, reed diffuser and room spray makers, most of them running small home-based businesses. Write in plain, simple English — avoid legal jargon and don't cite regulation section or article numbers unless the person specifically asks for them. Keep answers under 300 words. If someone asks about a label being too small for the hazard text: the main answer is to try a bigger label size first, since that solves it for most people. Only mention fold-out labels or attached tags as a brief secondary option, without going into detail on how they work. Always make clear that no hazard statement can ever be left off a label to save space, no matter how minor it seems — all are legally required. Every label must show at minimum: the hazard symbol, the warning word, the product name, and the maker's contact details. End with: ⚠️ This is general guidance only — not legal advice.",
        messages: [{ role: "user", content: question }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = data.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    return new Response(JSON.stringify({ answer: text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});