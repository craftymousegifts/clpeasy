import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Crafty Mouse Gifts — Stripe Checkout Edge Function ──────────────
// Lives in the CLPeasy Supabase project but handles CMG payments only.
// Uses the CRAFTYMOUSE_STRIPE_SECRET_KEY secret (separate from CLPeasy).
// Free delivery automatically applied for orders >= £30.
// ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ['https://craftymousegifts.com', 'https://craftymousegifts.netlify.app'];
const FREE_DELIVERY_THRESHOLD = 3000; // £30 in pence

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const STRIPE_SECRET = Deno.env.get('CRAFTYMOUSE_STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET) throw new Error('Stripe key not configured');

    const { items, subtotal } = await req.json();
    // items = [{ price_id, quantity }]
    // subtotal = order total in pence (sent from cart JS for shipping decision)

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const freeDelivery = (subtotal || 0) >= FREE_DELIVERY_THRESHOLD;

    const params: Record<string, string> = {
      mode: 'payment',
      success_url: 'https://craftymousegifts.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://craftymousegifts.com/shop.html',
      'shipping_address_collection[allowed_countries][0]': 'GB',
      'payment_method_types[0]': 'card',
      // Single shipping option — free or standard based on order value
      'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
      'shipping_options[0][shipping_rate_data][display_name]': freeDelivery
        ? '🎉 Free UK Delivery'
        : 'Standard UK Delivery (£3.95)',
      'shipping_options[0][shipping_rate_data][fixed_amount][amount]': freeDelivery ? '0' : '395',
      'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'gbp',
    };

    // If not free, also show standard so customer sees one option
    items.forEach((item: { price_id: string; quantity: number; variant?: string }, i: number) => {
      params[`line_items[${i}][price]`] = item.price_id;
      params[`line_items[${i}][quantity]`] = String(item.quantity);
      if (item.variant) {
        params[`line_items[${i}][adjustable_quantity][enabled]`] = 'false';
        // Pass scent/variant as custom field in metadata
        params[`metadata[item_${i}_variant]`] = item.variant;
      }
    });
    
    // Add all variants to session metadata for order notes
    const variantNotes = items
      .filter((i: { variant?: string }) => i.variant)
      .map((i: { price_id: string; variant?: string }, idx: number) => `Item ${idx+1}: ${i.variant}`)
      .join(' | ');
    if (variantNotes) {
      params['metadata[scent_choices]'] = variantNotes;
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });

    const session = await response.json();

    if (session.error) {
      throw new Error(session.error.message);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('CMG checkout error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});