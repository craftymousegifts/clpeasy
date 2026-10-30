// CLP-001 / CLP-026: this analytics-reading proxy is retired. The Plausible
// trial ended in July 2026 and Plausible's notices scheduled the stats for
// deletion on 21 Oct 2026 (not independently confirmed). The function no
// longer holds any key or contacts Plausible; it answers every request with
// 410 Gone, and the monitor page already treats a failed fetch as "no
// analytics". The previously exposed key's validity and revocation status are
// unresolved and tracked separately. Page tracking scripts are not affected.
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
