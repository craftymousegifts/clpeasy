// In-memory stand-in for the supabase-js calls made by
// supabase/functions/site-link-health. State lives on globalThis.__lh so the
// test can seed users/tokens and inspect what was written.
// deno-lint-ignore-file no-explicit-any
type Row = Record<string, any>;

export function freshLh() {
  return {
    tables: { site_links: [] as Row[], link_check_runs: [] as Row[], link_check_history: [] as Row[] } as Record<string, Row[]>,
    users: {} as Record<string, { id: string; email: string }>, // access token → user
    cronToken: 'c'.repeat(64),
    rpcCalls: [] as { name: string; args: any }[],
    clients: [] as { url: string; key: string }[],
  };
}
(globalThis as any).__lh = freshLh();
const lh = () => (globalThis as any).__lh;
let seq = 0;

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op = 'select';
  private payload: any = null;
  private conflict: string[] = [];
  private orderBy: [string, boolean] | null = null;
  private max = Infinity;
  constructor(private table: string) {}
  select(_c?: string) { return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(row: Row) { this.op = 'update'; this.payload = row; return this; }
  upsert(rows: Row[], opts: { onConflict: string }) { this.op = 'upsert'; this.payload = rows; this.conflict = opts.onConflict.split(','); return this; }
  eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
  lt(k: string, v: any) { this.filters.push((r) => r[k] < v); return this; }
  order(k: string, o: { ascending: boolean }) { this.orderBy = [k, o.ascending]; return this; }
  limit(n: number) { this.max = n; return this; }
  private rows() { return lh().tables[this.table] ??= []; }
  private exec(): { data: any; error: any } {
    const rows = this.rows();
    const now = new Date().toISOString();
    if (this.op === 'insert') {
      for (const r of this.payload) rows.push({ id: ++seq, changed_at: now, ...r });
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      for (const r of this.payload) {
        const ex = rows.find((x) => this.conflict.every((k) => x[k] === r[k]));
        if (ex) Object.assign(ex, r);
        else rows.push({ id: ++seq, first_seen_at: now, created_at: now, health_status: 'UNCHECKED', failure_count: 0, review_required: false, redirect_count: 0, ...r });
      }
      return { data: null, error: null };
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') { hit.forEach((r) => Object.assign(r, this.payload)); return { data: null, error: null }; }
    let out = [...hit];
    if (this.orderBy) {
      const [k, asc] = this.orderBy;
      out.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
    }
    return { data: out.slice(0, this.max).map((r) => ({ ...r })), error: null };
  }
  then(res: any, rej?: any) { return Promise.resolve(this.exec()).then(res, rej); }
}

// Mirrors the SQL functions in 20261006000000/20261006000100.
function rpc(name: string, args: any): { data: any; error: any } {
  lh().rpcCalls.push({ name, args });
  const runs: Row[] = lh().tables.link_check_runs;
  if (name === 'site_link_health_verify_cron_token') return { data: typeof args.p_token === 'string' && args.p_token.length >= 32 && args.p_token === lh().cronToken, error: null };
  if (name === 'site_link_health_prune') return { data: null, error: null };
  if (name === 'site_link_health_begin_run') {
    const now = Date.now();
    for (const r of runs) if (r.status === 'running' && now - Date.parse(r.started_at) > 15 * 60000) { r.status = 'failed'; r.completed_at = new Date().toISOString(); }
    if (runs.some((r) => r.status === 'running')) return { data: { ok: false, reason: 'already_running' }, error: null };
    if (args.p_trigger === 'manual') {
      const last = Math.max(0, ...runs.map((r) => Date.parse(r.started_at)));
      if (last && now - last < 10 * 60000) return { data: { ok: false, reason: 'too_soon', retry_after_seconds: 600 }, error: null };
    }
    const id = 'run-' + (++seq);
    runs.push({ id, trigger: args.p_trigger, started_at: new Date().toISOString(), status: 'running' });
    return { data: { ok: true, run_id: id }, error: null };
  }
  return { data: null, error: { message: 'unknown rpc ' + name } };
}

export function createClient(url: string, key: string) {
  lh().clients.push({ url, key });
  return {
    from: (t: string) => new Query(t),
    rpc: async (name: string, args: any = {}) => rpc(name, args),
    auth: {
      getUser: async (token: string) => {
        const u = lh().users[token];
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
      },
    },
  };
}
