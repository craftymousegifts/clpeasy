import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PLAUSIBLE_API_KEY = 'hejAa6p7Cz6cESKYnFwxhk7FZOL9dF0iPjpiD7QLGg9VtIas5Xh-8hIPWMz-XRYl';
const BASE = 'https://plausible.io/api/v1/stats/';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://clpeasy.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function fetchSiteStats(siteId: string) {
  const headers = { 'Authorization': `Bearer ${PLAUSIBLE_API_KEY}` };
  const site = `?site_id=${siteId}`;

  const fetches: Record<string, Promise<Response>> = {
    rt:        fetch(BASE + 'realtime/visitors' + site, { headers }),
    agg:       fetch(BASE + 'aggregate' + site + '&period=day&metrics=visitors,pageviews,bounce_rate,visit_duration', { headers }),
    pages:     fetch(BASE + 'breakdown' + site + '&period=day&property=event:page&metrics=visitors,pageviews,bounce_rate,visit_duration&limit=10', { headers }),
    sources:   fetch(BASE + 'breakdown' + site + '&period=day&property=visit:source&limit=8', { headers }),
    devices:   fetch(BASE + 'breakdown' + site + '&period=day&property=visit:device&limit=5', { headers }),
    countries: fetch(BASE + 'breakdown' + site + '&period=day&property=visit:country&limit=8', { headers }),
    entry:     fetch(BASE + 'breakdown' + site + '&period=day&property=visit:entry_page&limit=5', { headers }),
    exit:      fetch(BASE + 'breakdown' + site + '&period=day&property=visit:exit_page&limit=5', { headers }),
    events:    fetch(BASE + 'breakdown' + site + '&period=day&property=event:name&limit=20', { headers }),
  };

  const keys = Object.keys(fetches);
  const responses = await Promise.all(Object.values(fetches));
  const jsons = await Promise.all(responses.map(r => r.json()));

  const result: Record<string, unknown> = {};
  keys.forEach((k, i) => result[k] = jsons[i]);
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const site = url.searchParams.get('site') || 'clpeasy.com';
    const allowed = ['clpeasy.com', 'craftymousegifts.com', 'artisansweb.co.uk'];
    if (!allowed.includes(site)) {
      return new Response(JSON.stringify({ error: 'Site not allowed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await fetchSiteStats(site);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});