// ═══════════════════════════════════════════════════════════════
// CLPeasy — notify-signup Edge Function
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const BREVO_API_KEY       = Deno.env.get("BREVO_API_KEY")!;
const ALERT_TO            = "support@clpeasy.com";
const FROM_EMAIL          = "support@clpeasy.com";
const FROM_NAME           = "CLPeasy™";
const BREVO_AUTOMATION_ID = Deno.env.get("BREVO_AUTOMATION_ID") ?? "";
const BREVO_LIST_ID       = parseInt(Deno.env.get("BREVO_LIST_ID") ?? "2");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function safeDate(val: unknown): Date {
  if (!val) return new Date();
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? new Date() : d;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    console.log("notify-signup received:", JSON.stringify(body));

    const email      = body.email      ?? body.record?.email ?? "";
    const user_id    = body.user_id    ?? body.record?.id    ?? "";
    const is_beta    = body.is_beta    === true;
    const trial_ends = body.trial_ends ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const created_at = body.created_at ?? new Date().toISOString();

    if (!email) {
      console.log("No email in payload — skipping");
      return new Response(JSON.stringify({ skipped: "no email" }), { status: 200 });
    }

    const trialEndDate = safeDate(trial_ends).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
    const signupTime = safeDate(created_at).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    // ── STEP 1: Add contact to Brevo ─────────────────────────
    const brevoContact = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
      body: JSON.stringify({
        email,
        updateEnabled: true,
        listIds: [BREVO_LIST_ID],
        attributes: {
          FIRSTNAME: email.split("@")[0],
          CLPEASY_PLAN: "trial",
          CLPEASY_BETA: is_beta ? "yes" : "no",
          CLPEASY_TRIAL_ENDS: trial_ends,
          CLPEASY_SIGNUP_DATE: created_at,
          CLPEASY_USER_ID: user_id,
        }
      })
    });
    const contactResult = await brevoContact.text();
    console.log("Brevo contact upsert:", brevoContact.status, contactResult);

    // ── STEP 2: Trigger onboarding automation ────────────────
    let automationResult = "skipped — no BREVO_AUTOMATION_ID set";
    if (BREVO_AUTOMATION_ID) {
      const automationResp = await fetch(
        `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}/automations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
          body: JSON.stringify({ automationId: parseInt(BREVO_AUTOMATION_ID) })
        }
      );
      automationResult = `status ${automationResp.status}`;
      console.log("Brevo automation trigger:", automationResult);
    }

    // ── IDEMPOTENCY GATE: only ever send ONE admin alert per user_id ──
    // notify-signup is called twice per real signup (auth.html frontend +
    // the "on-user-signup" DB webhook), ~150ms apart. Claim the user_id via
    // a primary-key insert; whichever call wins the insert sends the alert,
    // the loser skips it. Steps 1-2 (Brevo contact + automation) above are
    // unaffected and still run on every call as before.
    let shouldSendAlert = true;
    if (user_id) {
      const { error: claimError } = await supabase
        .from("signup_notifications")
        .insert({ user_id });
      if (claimError) {
        if (claimError.code === "23505") {
          // unique_violation — another call already claimed this user_id
          console.log("notify-signup: duplicate call for user_id, skipping admin alert:", user_id);
          shouldSendAlert = false;
        } else {
          // Unexpected DB error — fail open so a real signup is never silently unreported
          console.error("signup_notifications insert error (failing open):", claimError.message);
        }
      }
    } else {
      console.log("notify-signup: no user_id in payload — skipping idempotency check, failing open");
    }

    if (!shouldSendAlert) {
      return new Response(JSON.stringify({
        success: true,
        brevo_contact: brevoContact.status,
        automation: automationResult,
        alert: "skipped — duplicate notification for this user_id"
      }), { status: 200 });
    }

    // ── STEP 3: Admin alert email ─────────────────────────────
    const subject = is_beta
      ? `🧪 Beta tester signed up — ${email}`
      : `🎉 New CLPeasy™ trial signup — ${email}`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <div style="background:${is_beta ? '#F59E0B' : '#0D9488'};padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:white;margin:0;font-size:18px;">
            ${is_beta ? '🧪 Beta Tester Signup' : '🎉 New Trial Signup'}
          </h2>
        </div>
        <div style="background:#F7F8FA;padding:24px;border-radius:0 0 8px 8px;border:1px solid #E8EAED;">
          <table style="width:100%;font-size:14px;color:#374151;">
            <tr><td style="padding:8px 0;font-weight:700;width:120px;">Email</td><td>${email}</td></tr>
            <tr style="background:white;"><td style="padding:8px 6px;font-weight:700;">User ID</td><td style="font-size:11px;color:#6B7280;">${user_id}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Signed up</td><td>${signupTime}</td></tr>
            <tr style="background:white;"><td style="padding:8px 6px;font-weight:700;">Trial ends</td><td>${trialEndDate}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Beta tester</td><td>${is_beta ? '✅ Yes — 30 day trial' : '❌ No — 14 day trial'}</td></tr>
            <tr style="background:white;"><td style="padding:8px 6px;font-weight:700;">Brevo contact</td><td>HTTP ${brevoContact.status}</td></tr>
            <tr><td style="padding:8px 0;font-weight:700;">Automation</td><td>${automationResult}</td></tr>
          </table>
          <div style="margin-top:20px;text-align:center;">
            <a href="https://supabase.com/dashboard/project/qvkosdqcryrcfbjtaxic/auth/users"
               style="background:#0D9488;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">
              View in Supabase →
            </a>
          </div>
        </div>
        <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:12px;">CLPeasy™ automated alert · clpeasy.com</p>
      </div>`;

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

    const alertResult = await alertResp.text();
    console.log("Admin alert email:", alertResp.status, alertResult);

    return new Response(JSON.stringify({
      success: true,
      brevo_contact: brevoContact.status,
      automation: automationResult,
      alert: alertResp.status
    }), { status: 200 });

  } catch (err) {
    console.error("notify-signup error:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});