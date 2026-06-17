import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('CRAFTYMOUSE_STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// ── SEND EMAIL VIA BREVO ──────────────────────────────────────
async function sendEmail(to: string, toName: string, subject: string, htmlContent: string): Promise<void> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) { console.warn('No BREVO_API_KEY — skipping email'); return; }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      sender: { name: 'Crafty Mouse Gifts', email: 'contact@craftymousegifts.com' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent,
    }),
  });
  console.log(`Brevo email to ${to}: HTTP ${res.status}`);
}

// ── FORMAT CURRENCY ───────────────────────────────────────────
function formatGBP(amount: number): string {
  return `£${(amount / 100).toFixed(2)}`;
}

// ── BUILD ORDER ITEMS HTML ────────────────────────────────────
function buildItemsTable(lineItems: Stripe.LineItem[]): string {
  const rows = lineItems.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0e8e6;">${item.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0e8e6;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0e8e6;text-align:right;">${formatGBP(item.amount_total ?? 0)}</td>
    </tr>`).join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#f3e8e6;">
          <th style="padding:10px 12px;text-align:left;">Item</th>
          <th style="padding:10px 12px;text-align:center;">Qty</th>
          <th style="padding:10px 12px;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('CMG_STRIPE_WEBHOOK_SECRET')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  console.log('CMG Stripe event received:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const customerEmail = session.customer_details?.email ?? '';
      const customerName  = session.customer_details?.name ?? 'Customer';
      const firstName     = customerName.split(' ')[0] || 'there';
      const orderTotal    = formatGBP(session.amount_total ?? 0);
      const sessionId     = session.id;

      // Get shipping address
      const addr = session.customer_details?.address;
      const shippingLine = addr
        ? [addr.line1, addr.line2, addr.city, addr.postal_code, addr.country].filter(Boolean).join(', ')
        : 'Not provided';

      // Retrieve line items
      let lineItemsHtml = '';
      try {
        const itemsRes = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 50 });
        lineItemsHtml = buildItemsTable(itemsRes.data);
      } catch (e) {
        console.warn('Could not retrieve line items:', e);
        lineItemsHtml = `<p>Order total: ${orderTotal}</p>`;
      }

      // ── OWNER NOTIFICATION EMAIL ──────────────────────────
      const ownerHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e1e1e;">
          <div style="background:#e46d69;padding:20px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">🛒 New Crafty Mouse Gifts Order!</h1>
          </div>
          <div style="padding:24px;background:#fff;">
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Shipping to:</strong> ${shippingLine}</p>
            <p><strong>Order total:</strong> ${orderTotal}</p>
            <h3 style="color:#e46d69;">Order Items</h3>
            ${lineItemsHtml}
            <p style="margin-top:24px;">
              <a href="https://dashboard.stripe.com/payments" 
                 style="background:#e46d69;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;">
                View in Stripe →
              </a>
            </p>
          </div>
          <div style="background:#f3e8e6;padding:16px;text-align:center;font-size:12px;color:#888;">
            Crafty Mouse Gifts · craftymousegifts.com
          </div>
        </div>`;

      await sendEmail(
        'contact@craftymousegifts.com',
        'Crafty Mouse Gifts',
        `🛒 New Order — ${orderTotal} from ${customerName}`,
        ownerHtml
      );

      // ── CUSTOMER CONFIRMATION EMAIL ───────────────────────
      if (customerEmail) {
        const customerHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e1e1e;">
            <div style="background:#f3e8e6;padding:30px;text-align:center;">
              <img src="https://craftymousegifts.com/logo.png" alt="Crafty Mouse Gifts" style="height:80px;margin-bottom:12px;">
              <h1 style="color:#e46d69;margin:0;font-size:24px;">Thank you, ${firstName}! 🌿</h1>
              <p style="color:#555;margin:8px 0 0;">Your order has been received and is being lovingly prepared.</p>
            </div>
            <div style="padding:24px;background:#fff;">
              <h3 style="color:#e46d69;">Your Order Summary</h3>
              ${lineItemsHtml}
              <p style="margin-top:16px;"><strong>Order total:</strong> ${orderTotal}</p>
              <p><strong>Delivering to:</strong> ${shippingLine}</p>
              <hr style="border:none;border-top:1px solid #f0e8e6;margin:24px 0;">
              <p style="font-size:14px;color:#555;">
                Your handmade items are made with care in the Scottish Borders. 
                We aim to dispatch within 3–5 working days. 
                If you have any questions, reply to this email or contact us at 
                <a href="mailto:contact@craftymousegifts.com" style="color:#e46d69;">contact@craftymousegifts.com</a>.
              </p>
              <p style="font-size:14px;color:#555;">
                With love,<br>
                <strong>Michaela</strong><br>
                Crafty Mouse Gifts 🐭
              </p>
            </div>
            <div style="background:#f3e8e6;padding:16px;text-align:center;font-size:12px;color:#888;">
              © 2026 Crafty Mouse Gifts · 66 Paul Street, London EC2A 4NA · 
              <a href="https://craftymousegifts.com/privacy.html" style="color:#e46d69;">Privacy Policy</a>
            </div>
          </div>`;

        await sendEmail(customerEmail, customerName, 'Your Crafty Mouse Gifts Order Confirmation 🌿', customerHtml);
      }

      console.log(`CMG order processed — ${orderTotal} from ${customerEmail}`);
    }
  } catch (err) {
    console.error('Error processing CMG webhook:', err);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});