// ═══════════════════════════════════════════════════════════════
// CLPeasy — notify-signup Edge Function
// 1. Sends alert email to support@clpeasy.com on every new signup
// 2. Adds new user to Brevo contact list #3
// 3. Triggers Brevo onboarding automation #1
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const ALERT_TO     = "support@clpeasy.com";
const FROM_EMAIL   = "support@clpeasy.com";
const FROM_NAME    = "CLPeasy™";
const BREVO_LIST_ID = 3;
const BREVO_AUTOMATION_ID = 1;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const email      = body.email      ?? "";
    const userId     = body.user_id    ?? "";
    const isBeta     = body.is_beta    ?? false;
    const trialEnds  = body.trial_ends ?? "";
    const createdAt  = body.created_at ?? new Date().toISOString();

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 1. Admin alert email ────────────────────────────────
    const alertRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: ALERT_TO }],
        subject: `🎉 New CLPeasy signup: ${email}`,
        htmlContent: `
          <h2>New CLPeasy Trial Signup</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Beta tester:</strong> ${isBeta ? "Yes" : "No"}</p>
          <p><strong>Trial ends:</strong> ${trialEnds}</p>
          <p><strong>Signed up:</strong> ${createdAt}</p>
        `,
      }),
    });

    const alertData = await alertRes.json();
    console.log("Alert email:", alertRes.status, JSON.stringify(alertData));

    // ── 2. Add to Brevo contact list #3 ────────────────────
    const contactRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email,
        listIds: [BREVO_LIST_ID],
        updateEnabled: true,
        attributes: {
          TRIAL_ENDS: trialEnds,
          SIGNUP_DATE: createdAt,
          IS_BETA: isBeta,
          CLPEASY_USER_ID: userId,
        },
      }),
    });

    const contactData = await contactRes.json();
    console.log("Brevo contact:", contactRes.status, JSON.stringify(contactData));

    // ── 3. Trigger Brevo automation ────────────────────────
    if (BREVO_AUTOMATION_ID) {
      const autoRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}/automations/${BREVO_AUTOMATION_ID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY,
        },
        body: JSON.stringify({}),
      });
      console.log("Brevo automation:", autoRes.status);
    }

    return new Response(JSON.stringify({ success: true, email }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("notify-signup error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});