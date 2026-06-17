// CMG Newsletter Subscribe Edge Function
// Adds a contact to the CMG Subscribers list (ID: 6) in Brevo

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) throw new Error('Brevo API key not configured');

    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [6],
        updateEnabled: true,
      }),
    });

    if (res.status === 201 || res.status === 204) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Brevo error');
    }

  } catch (e) {
    console.error('CMG subscribe error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});