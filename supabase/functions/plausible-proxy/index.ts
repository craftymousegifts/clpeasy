import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PLAUSIBLE_API_KEY = 'hejAa6p7Cz6cESKYnFwxhk7FZOL9dF0iPjpiD7QLGg9VtIas5Xh-8hIPWMz-XRYl';
const PLAUSIBLE_SITE = 'clpeasy.com';
const BASE = 'https://plausible.io/api/v1/stats/';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const headers = { 'Authorization': `Bearer ${PLAUSIBLE_API_KEY}` };
    const site = `?site_id=${PLAUSIBLE_SITE}`;

    const [rt, agg, pages, sources] = await Promise.all([
      fetch(BASE + 'realtime/visitors' + site, { headers }),
      fetch(BASE + 'aggregate' + site + '&period=day&metrics=visitors,pageviews,bounce_rate,visit_duration', { headers }),
      fetch(BASE + 'breakdown' + site + '&period=day&property=event:page&limit=5', { headers }),
      fetch(BASE + 'breakdown' + site + '&period=day&property=visit:source&limit=5', { headers }),
    ]);

    const [rtData, aggData, pagesData, sourcesData] = await Promise.all([
      rt.json(),
      agg.json(),
      pages.json(),
      sources.json(),
    ]);

    const payload = {
      realtime: rtData,
      aggregate: aggData,
      pages: pagesData,
      sources: sourcesData,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
