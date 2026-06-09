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
      return new Response(JSON.stringify({ error: 'Email config missing' }), { status: 500 });
    }

    // Format the email body
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#4C9BB0;padding:16px 24px;border-radius:10px 10px 0 0;">
          <h2 style="color:white;margin:0;font-size:18px;">New Beta Feedback Submission</h2>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">CLPeasy beta feedback form</p>
        </div>
        <div style="background:#F7F8FA;border:1px solid #E8EAED;border-top:none;border-radius:0 0 10px 10px;padding:24px;">

          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr style="border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;width:40%;">Name</td>
              <td style="padding:8px 12px;color:#111318;">${name || '—'}</td>
            </tr>
            <tr style="background:white;border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;">Email</td>
              <td style="padding:8px 12px;color:#111318;">${email || '—'}</td>
            </tr>
            <tr style="border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;">Ease of use rating</td>
              <td style="padding:8px 12px;color:#111318;">${ease_rating !== undefined ? ease_rating + ' / 5' : '—'}</td>
            </tr>
            <tr style="background:white;border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;">Hazard data trust</td>
              <td style="padding:8px 12px;color:#111318;">${hazard_trust || '—'}</td>
            </tr>
            <tr style="border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;">Best feature</td>
              <td style="padding:8px 12px;color:#111318;">${best_feature || '—'}</td>
            </tr>
            ${q3_other ? `
            <tr style="background:white;border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;">Feature comments</td>
              <td style="padding:8px 12px;color:#111318;">${q3_other}</td>
            </tr>` : ''}
            <tr style="background:white;border-bottom:1px solid #E8EAED;">
              <td style="padding:8px 12px;font-weight:700;color:#374151;">Would pay?</td>
              <td style="padding:8px 12px;color:#111318;">${would_pay || '—'}</td>
            </tr>
          </table>

          ${feedback ? `
          <div style="margin-top:16px;">
            <div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:6px;">Feedback / what would improve it:</div>
            <div style="background:white;border:1px solid #E8EAED;border-radius:8px;padding:12px 14px;font-size:14px;color:#111318;line-height:1.6;">${feedback}</div>
          </div>` : ''}

          ${other_comments ? `
          <div style="margin-top:12px;">
            <div style="font-weight:700;font-size:13px;color:#374151;margin-bottom:6px;">Other comments:</div>
            <div style="background:white;border:1px solid #E8EAED;border-radius:8px;padding:12px 14px;font-size:14px;color:#111318;line-height:1.6;">${other_comments}</div>
          </div>` : ''}

          <p style="font-size:12px;color:#9CA3AF;margin-top:20px;">Submitted via beta-feedback.html · CLPeasy</p>
        </div>
      </div>
    `;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: 'CLPeasy Feedback', email: 'noreply@clpeasy.com' },
        to: [{ email: 'support@clpeasy.com', name: 'Michaela @ CLPeasy' }],
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
