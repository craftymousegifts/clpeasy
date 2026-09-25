// In-memory stand-in for the parts of supabase-js the Edge Functions use.
// State lives on globalThis.__db so tests can seed it and inject failures.
type Row = Record<string, any>;
export function freshDb() {
  return {
    tables: { stripe_processed_events: [] as Row[], profiles: [] as Row[], subscriptions: [] as Row[], checkout_locks: [] as Row[] } as Record<string, Row[]>,
    failRpcOnce: 0,
    rpcCalls: [] as any[],
    authUser: { id: 'user-1', email: 'buyer@example.com' } as Row | null,
  };
}
(globalThis as any).__db = freshDb();
const db = () => (globalThis as any).__db;

class Query {
  private filters: [string, any, string][] = [];
  private op: string = 'select';
  private payload: any = null;
  constructor(private table: string) {}
  select(_cols?: string) { if (this.op === 'select') this.op = 'select'; return this; }
  insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
  update(row: Row) { this.op = 'update'; this.payload = row; return this; }
  upsert(row: Row) { this.op = 'upsert'; this.payload = row; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k: string, v: any) { this.filters.push([k, v, 'eq']); return this; }
  lt(k: string, v: any) { this.filters.push([k, v, 'lt']); return this; }
  private rows() { return db().tables[this.table] ?? (db().tables[this.table] = []); }
  private match(r: Row) { return this.filters.every(([k, v, op]) => op === 'eq' ? r[k] === v : r[k] < v); }
  private exec(): { data: any; error: any } {
    const rows = this.rows();
    if (this.op === 'insert') {
      if (this.table === 'stripe_processed_events' && rows.some(r => r.event_id === this.payload.event_id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      if (this.table === 'checkout_locks' && rows.some(r => r.user_id === this.payload.user_id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      rows.push({ created_at: new Date().toISOString(), ...this.payload });
      return { data: null, error: null };
    }
    if (this.op === 'delete') { db().tables[this.table] = rows.filter(r => !this.match(r)); return { data: null, error: null }; }
    if (this.op === 'update') { rows.filter(r => this.match(r)).forEach(r => Object.assign(r, this.payload)); return { data: null, error: null }; }
    if (this.op === 'upsert') {
      const existing = rows.find(r => r.user_id === this.payload.user_id);
      if (existing) Object.assign(existing, this.payload); else rows.push({ ...this.payload });
      return { data: null, error: null };
    }
    return { data: rows.filter(r => this.match(r)), error: null };
  }
  single() { const r = this.exec(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }); }
  maybeSingle() { return this.single(); }
  then(res: any, rej?: any) { return Promise.resolve(this.exec()).then(res, rej); }
}

export function createClient(_url: string, _key: string, _opts?: unknown) {
  return {
    from: (t: string) => new Query(t),
    rpc: async (name: string, args: any) => {
      db().rpcCalls.push({ name, args });
      if (db().failRpcOnce > 0) { db().failRpcOnce--; return { data: null, error: { message: 'simulated transient database failure' } }; }
      if (name === 'credit_purchased_downloads') {
        const p = db().tables.profiles.find((r: Row) => r.id === args.p_user_id);
        if (!p) return { data: null, error: { message: 'Profile not found' } };
        p.topup_credits = (p.topup_credits ?? 0) + args.p_downloads;
        return { data: p.topup_credits, error: null };
      }
      return { data: null, error: { message: 'unknown rpc ' + name } };
    },
    auth: { getUser: async () => ({ data: { user: db().authUser }, error: db().authUser ? null : { message: 'no user' } }) },
  };
}
