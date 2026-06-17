// CMG Contact Form Edge Function
// Receives contact form submissions and sends email via Brevo

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { name, email, subject, message, orderNumber } = await req.json();

    if (!email || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) throw new Error('Brevo API key not configured');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;color:#1e1e1e;">
        <div style="background:#e46d69;padding:20px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;">📬 New Contact Form Message</h1>
        </div>
        <div style="padding:24px;background:#fff;">
          <p><strong>Name:</strong> ${name || 'Not provided'}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Subject:</strong> ${subject || 'General Enquiry'}</p>
          ${orderNumber ? `<p><strong>Order Number:</strong> ${orderNumber}</p>` : ''}
          <hr style="border:none;border-top:1px solid #f0e8e6;margin:16px 0;">
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-line;color:#555;">${message}</p>
        </div>
        <div style="background:#f3e8e6;padding:12px;text-align:center;font-size:12px;color:#888;">
          Reply directly to ${email} — Crafty Mouse Gifts Contact Form
        </div>
      </div>`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: 'CMG Contact Form', email: 'contact@craftymousegifts.com' },
        to: [{ email: 'contact@craftymousegifts.com', name: 'Crafty Mouse Gifts' }],
        replyTo: { email, name: name || email },
        subject: `Contact Form: ${subject || 'New Message'} from ${name || email}`,
        htmlContent: html,
      }),
    });

    if (!res.ok) throw new Error(`Brevo error: ${res.status}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Contact form error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
