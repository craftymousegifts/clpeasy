// send-support-email — Supabase Edge Function
// Triggered by support.html's "Get help" form submission
// Sends the support request to support@clpeasy.com via Brevo transactional API
// (mirrors the existing send-feedback-email pattern used by beta-feedback.html)

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function esc(s: unknown): string {
  return String(s ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      name = '',
      email = '',
      step = '',
      description = '',
      errors = '',
      refresh = '',
      incognito = '',
      browser = '',
      other = '',
    } = body;

    if (!name || !email || !step || !description) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) {
      console.error('BREVO_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email config missing' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const html = `
      <h2>New CLPeasy Support Request</h2>
      <table cellpadding="6" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse;">
        <tr><td style="font-weight:bold;padding-right:16px;">Name</td><td>${esc(name)}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Email</td><td>${esc(email)}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Step</td><td>${esc(step)}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;vertical-align:top;">What happened</td><td>${esc(description)}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;vertical-align:top;">Error messages</td><td>${esc(errors || 'None provided')}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Hard refresh result</td><td>${esc(refresh || 'Not answered')}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Incognito result</td><td>${esc(incognito || 'Not answered')}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Browser/device</td><td>${esc(browser || 'Not provided')}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;vertical-align:top;">Additional info</td><td>${esc(other || 'None')}</td></tr>
      </table>
    `;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: 'noreply@clpeasy.com', name: 'CLPeasy Support' },
        to: [{ email: 'support@clpeasy.com', name: 'CLPeasy Support' }],
        replyTo: { email, name: name || '' },
        subject: `Support Request from ${name} (${step})`,
        htmlContent: html,
      }),
    });

    const status = res.status;
    console.log(`Support email sent — Brevo HTTP ${status}`);

    if (status >= 200 && status < 300) {
      return new Response(JSON.stringify({ sent: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const err = await res.text();
      console.error('Brevo error:', err);
      return new Response(JSON.stringify({ error: 'Email send failed', detail: err }), {
        status: 500,
        headers: corsHeaders,
      });
    }

  } catch (err) {
    console.error('send-support-email error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
