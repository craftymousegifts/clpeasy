// ═══════════════════════════════════════════════════════════════
// CLPeasy — notify-new-user Edge Function
// Supabase → Functions → notify-new-user → index.ts
// Sends alert email to support@clpeasy.com on every new signup
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const ALERT_TO = "admin@clpeasy.com";
const FROM_EMAIL = "support@clpeasy.com";
const FROM_NAME = "CLPeasy™ Alerts";

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

    const subject = isBeta
      ? `🧪 Beta tester signed up — ${email}`
      : `🎉 New CLPeasy™ trial signup — ${email}`;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <div style="background:${isBeta ? '#F59E0B' : '#4C9BB0'};padding:16px 24px;border-radius:8px 8px 0 0;">
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
          </table>
          ${isBeta ? `
          <div style="margin-top:16px;padding:12px 16px;background:#FEF3C7;border-radius:8px;border-left:3px solid #F59E0B;">
            <strong style="color:#92400E;">⚡ Action needed:</strong>
            <span style="color:#78350F;"> Check Supabase and confirm beta access is set correctly for this user.</span>
          </div>` : `
          <div style="margin-top:16px;padding:12px 16px;background:#EBF6F9;border-radius:8px;border-left:3px solid #4C9BB0;">
            <span style="color:#0f2236;">📧 Brevo onboarding sequence should trigger automatically for this user.</span>
          </div>`}
          <div style="margin-top:20px;text-align:center;">
            <a href="https://supabase.com/dashboard/project/qvkosdqcryrcfbjtaxic/auth/users" 
               style="background:#4C9BB0;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">
              View in Supabase →
            </a>
          </div>
        </div>
        <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:12px;">CLPeasy™ automated alert · clpeasy.com</p>
      </div>
    `;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: ALERT_TO, name: "CLPeasy Admin" }],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
