// supabase/functions/site-link-health/index.ts
//
// Website & Link Health Monitor for the internal monitor.html dashboard.
//
//   POST {action:"run"}      start a scan (weekly pg_cron job, or the
//                            "Check links now" button)
//   POST {action:"results"}  latest results for monitor.html
//   GET  ?action=results     same as above
//
// Who may call it:
//   - the weekly pg_cron job, proven by the Vault token in the
//     x-link-health-token header (checked in the database), or
//   - the CLPeasy admin, proven by a Supabase sign-in token whose email is
//     on the same admin allowlist as admin-package-monitor (server-side).
// Everyone else gets 401/403. The request body is never used for URLs:
// only links discovered on clpeasy.com itself are checked.
//
// Runs entirely on Supabase (Edge Function + Postgres). No AI, no paid
// third-party service. It never edits the website: redirects are only
// recorded and suggested in monitor.html.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { defaultDeps, runScan, type Deps, type ScanResult } from './checker.ts';

const DEFAULT_ADMIN_EMAILS = ['michaela.feeley@googlemail.com'];

function adminEmails(): string[] {
  const fromEnv = (Deno.env.get('LINK_HEALTH_ADMIN_EMAILS') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ADMIN_EMAILS;
}

// Bearer-token auth only (no cookies), so any origin may call; the token
// is what authorises the request. monitor.html is opened locally, not
// from clpeasy.com (it is blocked there by _redirects).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// deno-lint-ignore no-explicit-any
type Client = any;
let _admin: Client = null;
let _auth: Client = null;
function adminClient(): Client {
  return _admin ??= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}
function authClient(): Client {
  return _auth ??= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
}

// Overridable by the offline tests only.
export const runtime = { deps: defaultDeps() as Deps };

type Caller = { kind: 'cron' } | { kind: 'admin'; email: string };

async function identify(req: Request): Promise<Caller | Response> {
  const cronToken = req.headers.get('x-link-health-token');
  if (cronToken) {
    const { data, error } = await adminClient().rpc('site_link_health_verify_cron_token', { p_token: cronToken });
    if (error) { console.error('site-link-health: token check failed', error.message); return json({ error: 'Not authorized' }, 403); }
    return data === true ? { kind: 'cron' } : json({ error: 'Not authorized' }, 403);
  }
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not authenticated' }, 401);
  const { data, error } = await authClient().auth.getUser(token);
  const user = data?.user;
  const email = (user?.email || '').toLowerCase();
  if (error || !user || !email || !adminEmails().includes(email)) return json({ error: 'Not authorized' }, 403);
  return { kind: 'admin', email };
}

async function readAction(req: Request): Promise<string> {
  const q = new URL(req.url).searchParams.get('action');
  if (req.method === 'GET') return q || 'results';
  try {
    const body = await req.json();
    return typeof body?.action === 'string' ? body.action : (q || '');
  } catch {
    return q || '';
  }
}

async function loadResults() {
  const db = adminClient();
  const runs = await db.from('link_check_runs')
    .select('id, trigger, started_at, completed_at, status, pages_scanned, links_checked, healthy_count, redirected_count, warning_count, broken_count, review_required_count, error_summary')
    .order('started_at', { ascending: false }).limit(10);
  if (runs.error) throw new Error(runs.error.message);
  const links = await db.from('site_links')
    .select('source_page, source_url, link_text, target_url, link_type, authority_type, first_seen_at, last_seen_at, last_checked_at, http_status, final_url, redirect_count, redirect_permanent, replacement_url, health_status, failure_count, first_failed_at, last_healthy_at, last_error, review_required')
    .eq('active', true).order('target_url', { ascending: true }).limit(3000);
  if (links.error) throw new Error(links.error.message);
  const lastScheduled = (runs.data || []).find((r: { trigger: string; status: string }) => r.trigger === 'scheduled' && r.status !== 'running') || null;
  return { runs: runs.data || [], last_scheduled: lastScheduled, links: links.data || [] };
}

const FAILING = new Set(['WARNING', 'BROKEN', 'REVIEW_REQUIRED']);

export async function persistScan(runId: string, scan: ScanResult, startedIso: string) {
  const db = adminClient();
  const nowIso = new Date().toISOString();

  // Previous per-destination state (for history + first-failed/last-healthy dates).
  const prevRes = await db.from('site_links').select('target_url, health_status, first_failed_at, last_healthy_at');
  if (prevRes.error) throw new Error(prevRes.error.message);
  const prev = new Map<string, { health_status: string; first_failed_at: string | null; last_healthy_at: string | null }>();
  for (const r of prevRes.data || []) {
    const p = prev.get(r.target_url);
    if (!p) { prev.set(r.target_url, r); continue; }
    if (!p.first_failed_at || (r.first_failed_at && r.first_failed_at < p.first_failed_at)) p.first_failed_at = r.first_failed_at ?? p.first_failed_at;
    if (!p.last_healthy_at || (r.last_healthy_at && r.last_healthy_at > p.last_healthy_at)) p.last_healthy_at = r.last_healthy_at ?? p.last_healthy_at;
  }

  const checked: Record<string, unknown>[] = [];
  const unchecked: Record<string, unknown>[] = [];
  for (const o of scan.occurrences) {
    const base = {
      source_page: o.sourcePage, source_url: o.sourceUrl, link_text: o.linkText, target_url: o.targetUrl,
      link_type: o.linkType, authority_type: o.authorityType, last_seen_at: nowIso, active: true, updated_at: nowIso,
    };
    const r = scan.results.get(o.targetUrl);
    if (!r) { unchecked.push(base); continue; }
    const p = prev.get(o.targetUrl);
    const failing = FAILING.has(r.health) && r.failureCount > 0;
    checked.push({
      ...base,
      last_checked_at: nowIso,
      http_status: r.outcome.status,
      final_url: r.outcome.finalUrl,
      redirect_count: r.outcome.redirectCount,
      redirect_permanent: r.outcome.redirectCount ? r.outcome.permanent : null,
      redirect_chain: r.outcome.chain.length ? r.outcome.chain : null,
      replacement_url: r.replacementUrl,
      health_status: r.health,
      failure_count: r.failureCount,
      first_failed_at: failing ? (p?.first_failed_at ?? nowIso) : null,
      last_healthy_at: r.health === 'HEALTHY' || r.health === 'REDIRECTED' ? nowIso : (p?.last_healthy_at ?? null),
      last_error: FAILING.has(r.health) ? r.note : null,
      review_required: r.reviewRequired,
    });
  }
  for (let i = 0; i < checked.length; i += 200) {
    const { error } = await db.from('site_links').upsert(checked.slice(i, i + 200), { onConflict: 'source_url,target_url' });
    if (error) throw new Error('save links: ' + error.message);
  }
  for (let i = 0; i < unchecked.length; i += 200) {
    const { error } = await db.from('site_links').upsert(unchecked.slice(i, i + 200), { onConflict: 'source_url,target_url' });
    if (error) throw new Error('save links: ' + error.message);
  }

  // Links no longer on the site: only retire them after a COMPLETE crawl.
  if (!scan.partial) {
    const { error } = await db.from('site_links').update({ active: false, updated_at: nowIso }).lt('last_seen_at', startedIso).eq('active', true);
    if (error) throw new Error('retire links: ' + error.message);
  }

  // History: status transitions only (bounded growth).
  const history: Record<string, unknown>[] = [];
  for (const [url, r] of scan.results) {
    const before = prev.get(url)?.health_status ?? null;
    if (before === r.health) continue;
    history.push({ run_id: runId, target_url: url, previous_status: before, new_status: r.health, http_status: r.outcome.status, final_url: r.outcome.finalUrl, detail: r.note });
  }
  if (history.length) {
    const { error } = await db.from('link_check_history').insert(history);
    if (error) throw new Error('save history: ' + error.message);
  }

  const counts = { healthy_count: 0, redirected_count: 0, warning_count: 0, broken_count: 0, review_required_count: 0 };
  for (const r of scan.results.values()) {
    if (r.health === 'HEALTHY') counts.healthy_count++;
    else if (r.health === 'REDIRECTED') counts.redirected_count++;
    else if (r.health === 'WARNING') counts.warning_count++;
    else if (r.health === 'BROKEN') counts.broken_count++;
    if (r.reviewRequired) counts.review_required_count++;
  }
  const { error } = await db.from('link_check_runs').update({
    ...counts,
    status: scan.partial ? 'partial' : 'completed',
    completed_at: new Date().toISOString(),
    pages_scanned: scan.pagesScanned.length,
    links_checked: scan.results.size,
    error_summary: scan.errors.length ? scan.errors.join(' | ').slice(0, 2000) : null,
  }).eq('id', runId);
  if (error) throw new Error('save run: ' + error.message);

  const prune = await db.rpc('site_link_health_prune');
  if (prune.error) console.error('site-link-health: prune failed', prune.error.message);
}

async function performRun(runId: string) {
  const db = adminClient();
  const startedIso = new Date().toISOString();
  try {
    const prevRes = await db.from('site_links').select('target_url, failure_count');
    if (prevRes.error) throw new Error(prevRes.error.message);
    const prevFailures = new Map<string, number>();
    for (const r of prevRes.data || []) prevFailures.set(r.target_url, Math.max(prevFailures.get(r.target_url) ?? 0, r.failure_count ?? 0));
    const scan = await runScan(runtime.deps, prevFailures);
    await persistScan(runId, scan, startedIso);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('site-link-health: run failed', msg);
    await db.from('link_check_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error_summary: msg.slice(0, 2000) }).eq('id', runId);
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const caller = await identify(req);
    if (caller instanceof Response) return caller;
    const action = await readAction(req);

    if (action === 'results') {
      if (caller.kind !== 'admin') return json({ error: 'Not authorized' }, 403);
      return json(await loadResults());
    }

    if (action === 'run' && req.method === 'POST') {
      const trigger = caller.kind === 'cron' ? 'scheduled' : 'manual';
      const { data, error } = await adminClient().rpc('site_link_health_begin_run', { p_trigger: trigger });
      if (error) throw new Error(error.message);
      if (!data?.ok) {
        const status = data?.reason === 'too_soon' ? 429 : 409;
        return json({ started: false, reason: data?.reason || 'unavailable', retry_after_seconds: data?.retry_after_seconds ?? null }, status);
      }
      const work = performRun(data.run_id);
      // deno-lint-ignore no-explicit-any
      const er = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(work); else await work;
      return json({ started: true, run_id: data.run_id, trigger }, 202);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('site-link-health error:', err);
    return json({ error: 'Unexpected server error' }, 500);
  }
}

Deno.serve(handler);
