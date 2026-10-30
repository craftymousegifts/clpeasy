// CLP-001 / CLP-026: Plausible analytics is retired. The Plausible trial ended
// in July 2026 and the account's stats were deleted on 21 Oct 2026, so this
// function no longer holds any key or contacts Plausible. It answers every
// request with 410 Gone; the monitor page already treats a failed fetch as
// "no analytics".
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const headers = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  return new Response(JSON.stringify({ error: 'Analytics retired' }), { status: 410, headers });
});
