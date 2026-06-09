// send-feedback-email — Supabase Edge Function
// Triggered by beta-feedback.html form submission
// Sends formatted feedback email to support@clpeasy.com via Brevo transactional API

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      name = 'Anonymous',
      email = '',
      ease_rating,
      hazard_trust,
      best_feature,
      q3_other,
      feedback,
      would_pay,
      other_comments,
    } = body;

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) {
      console.error('BREVO_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email config missing' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const html = `
      <h2>New CLPeasy Beta Feedback</h2>
      <table cellpadding="6" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse;">
        <tr><td style="font-weight:bold;padding-right:16px;">Name</td><td>${name || '—'}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Email</td><td>${email || '—'}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Ease of use (1-10)</td><td>${ease_rating ?? '—'}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Hazard data trust</td><td>${hazard_trust ?? '—'}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Best feature</td><td>${best_feature ?? '—'}${q3_other ? ` — ${q3_other}` : ''}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">General feedback</td><td>${feedback || '—'}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Would pay?</td><td>${would_pay ?? '—'}</td></tr>
        <tr><td style="font-weight:bold;padding-right:16px;">Other comments</td><td>${other_comments || '—'}</td></tr>
      </table>
    `;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: 'noreply@clpeasy.com', name: 'CLPeasy Feedback' },
        to: [{ email: 'support@clpeasy.com', name: 'CLPeasy Support' }],
        replyTo: email ? { email, name: name || '' } : undefined,
        subject: `Beta feedback from ${name || 'Anonymous'}${email ? ' (' + email + ')' : ''}`,
        htmlContent: html,
      }),
    });

    const status = res.status;
    console.log(`Feedback email sent — Brevo HTTP ${status}`);

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
    console.error('send-feedback-email error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
