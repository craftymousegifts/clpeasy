// Retired-endpoint stub for CLP-004 (prepared 26 Oct 2026, NOT deployed).
//
// Deployed under an existing slug (clp-wizard, clp-search, finn-chat or
// beta-tester-email) it answers every request with 410 Gone and does
// nothing else: no AI call, no email, no database access, no secrets read.
// The original code for each slug is kept in ../rollback/<slug>/ so the
// change can be undone by redeploying that folder.
//
// Written without Deno-only imports so tests/retired-endpoint-stub.js can
// run it under Node as well.

const ALLOWED_ORIGINS = ["https://clpeasy.com", "https://www.clpeasy.com", "https://clpeasy.netlify.app"];

function headersFor(req) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

Deno.serve((req) => {
  const headers = headersFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    error: "This CLPeasy service has been retired. Guide Me and the Knowledge Base search now work directly in your browser — please refresh the page. Need help? Email support@clpeasy.com.",
  }), { status: 410, headers });
});
