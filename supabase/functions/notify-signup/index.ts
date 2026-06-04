// ═══════════════════════════════════════════════════════════════
// CLPeasy — notify-new-user Edge Function
// Supabase → Functions → notify-new-user → index.ts
// 1. Sends alert email to support@clpeasy.com on every new signup
// 2. Adds new user to Brevo onboarding automation (Day 1,3,7,10)
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const ALERT_TO     = "support@clpeasy.com";
const FROM_EMAIL   = "support@clpeasy.com";
const FROM_NAME    = "CLPeasy™";

// ── Your Brevo automation ID ────────────────────────────────────
// Find this in Brevo → Automations → your onboarding sequence → URL contains the ID
// e.g. https://app.brevo.com/automation/edit/12345 → ID is 12345
const BREVO_AUTOMATION_ID = Deno.env.get("BREVO_AUTOMATION_ID") ?? "";

// ── Your Brevo list ID for new users ───────────────────────────
// Brevo → Contacts → Lists → your CLPeasy trial users list → ID shown in URL
const BREVO_LIST_ID = parseInt(Deno.env.get("BREVO_LIST_ID") ?? "2");

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email, user_id, is_beta, trial_ends, created_at } = await req.json();

    const isBeta = is_beta === true;
    const trialEndDate = new Date(trial_ends).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
    const signupTime = new Date(created_at).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    // ── STEP 1: Add contact to Brevo ──────────────────────────
    // Creates the contact in Brevo (or updates if already exists)
    const brevoContact = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        updateEnabled: true,  // update if contact already exists
        listIds: [BREVO_LIST_ID],
        attributes: {
          FIRSTNAME: email.split("@")[0],  // fallback name from email
          CLPEASY_PLAN: "trial",
          CLPEASY_BETA: isBeta ? "yes" : "no",
          CLPEASY_TRIAL_ENDS: trial_ends,
          CLPEASY_SIGNUP_DATE: created_at,
          CLPEASY_USER_ID: user_id,
        }
      })
    });

    const contactResult = await brevoContact.text();
    console.log("Brevo contact upsert:", brevoContact.status, contactResult);

    // ── STEP 2: Trigger onboarding automation ─────────────────
    // Fires the Day 1, 3, 7, 10 email sequence in Brevo
    let automationResult = "skipped — no BREVO_AUTOMATION_ID set";
    if (BREVO_AUTOMATION_ID) {
      const automationResp = await fetch(
        `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}/automations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": BREVO_API_KEY
          },
          body: JSON.stringify({
            automationId: parseInt(BREVO_AUTOMATION_ID)
          })
        }
      );
      automationResult = `status ${automationResp.status}`;
      console.log("Brevo automation trigger:", automationResult);
    }

    // ── STEP 3: Send admin alert to support@clpeasy.com ───────
    const subject = isBeta
      ? `🧪 Beta tester signed up — ${email}`
      : `🎉 New CLPeasy™ trial signup — ${email}`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <div style="background:${isBeta ? '#F59E0B' : '#0D9488'};padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:white;margin:0;font-size:18px;">
            ${isBeta ? '🧪 Beta Tester Signup' : '🎉 New Trial Signup'}
          </h2>
        </div>
        <div style="background:#F7F8FA;padding:24px;border-radius:0 0 8px 8px;border:1px solid #E8EAED;">
          <table style="width:100%;font-size:14px;color:#374151;">
            <tr>
              <td style="padding:8px 0;font-weight:700;width:120px;">Email</td>
              <td style="padding:8px 0;">${email}</td>
            </tr>
            <tr style="background:white;">
              <td style="padding:8px 6px;font-weight:700;">User ID</td>
              <td style="padding:8px 6px;font-size:11px;color:#6B7280;">${user_id}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-weight:700;">Signed up</td>
              <td style="padding:8px 0;">${signupTime}</td>
            </tr>
            <tr style="background:white;">
              <td style="padding:8px 6px;font-weight:700;">Trial ends</td>
              <td style="padding:8px 6px;">${trialEndDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-weight:700;">Beta tester</td>
              <td style="padding:8px 0;">${isBeta ? '✅ Yes — 30 day trial' : '❌ No — 14 day trial'}</td>
            </tr>
            <tr style="background:white;">
              <td style="padding:8px 6px;font-weight:700;">Brevo contact</td>
              <td style="padding:8px 6px;">HTTP ${brevoContact.status} — added to list ${BREVO_LIST_ID}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-weight:700;">Automation</td>
              <td style="padding:8px 0;">${automationResult}</td>
            </tr>
          </table>
          ${isBeta ? `
          <div style="margin-top:16px;padding:12px 16px;background:#FEF3C7;border-radius:8px;border-left:3px solid #F59E0B;">
            <strong style="color:#92400E;">⚡ Action needed:</strong>
            <span style="color:#78350F;"> Confirm beta access is set correctly in Supabase for this user.</span>
          </div>` : `
          <div style="margin-top:16px;padding:12px 16px;background:#CCFBF1;border-radius:8px;border-left:3px solid #0D9488;">
            <span style="color:#0f2236;">📧 Brevo onboarding sequence triggered — Day 1 email on its way.</span>
          </div>`}
          <div style="margin-top:20px;text-align:center;">
            <a href="https://supabase.com/dashboard/project/qvkosdqcryrcfbjtaxic/auth/users"
               style="background:#0D9488;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">
              View in Supabase →
            </a>
          </div>
        </div>
        <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:12px;">CLPeasy™ automated alert · clpeasy.com</p>
      </div>
    `;

    const alertResp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: ALERT_TO, name: "CLPeasy Admin" }],
        subject,
        htmlContent,
      }),
    });

    if (!alertResp.ok) {
      const err = await alertResp.text();
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    return new Response(JSON.stringify({
      success: true,
      brevo_contact: brevoContact.status,
      automation: automationResult
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
