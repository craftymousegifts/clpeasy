// Runs the REAL supabase/functions/notify-signup/index.ts offline under Deno
// (Supabase stubbed, Brevo fetch mocked). Nothing leaves the machine.
//   node tests/deno/run.js
import { freshDb } from './stubs/supabase.ts';

for (const [k, v] of Object.entries({ BREVO_API_KEY: 'offline-brevo-key', BREVO_LIST_ID: '3', BREVO_AUTOMATION_ID: '1', SUPABASE_URL: 'http://offline.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline' })) Deno.env.set(k, v);
const calls: any[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (!String(url).startsWith('https://api.brevo.com/')) throw new Error('unexpected outbound fetch in test: ' + url);
  calls.push({ url, body: JSON.parse(init.body) });
  return new Response('{"id":1}', { status: 201 });
};
for (const k of ['log', 'warn', 'error'] as const) console[k] = () => {};
const out = (...a: unknown[]) => Deno.stdout.writeSync(new TextEncoder().encode(a.join(' ') + '\n'));
(globalThis as any).__db = freshDb();
(globalThis as any).__db.tables.signup_notifications = [];
await import('../../supabase/functions/notify-signup/index.ts');
const handler = (globalThis as any).__handler as (r: Request) => Promise<Response>;

function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`ASSERTION FAILED: ${msg}\n  expected ${JSON.stringify(b)}\n  actual   ${JSON.stringify(a)}`); }

const r = await handler(new Request('http://localhost/', { method: 'POST', body: JSON.stringify({ email: 'new.maker@example.com', user_id: 'user-9', is_beta: false }) }));
eq(r.status, 200, 'status');
const contact = calls.find(c => c.url === 'https://api.brevo.com/v3/contacts');
eq(contact.body, { email: 'new.maker@example.com', updateEnabled: true, listIds: [3], attributes: { FIRSTNAME: 'new.maker' } }, 'sign-up contact: list + FIRSTNAME only');
const all = JSON.stringify(calls.filter(c => !c.url.endsWith('/smtp/email')));
for (const k of ['CLPEASY_', 'SUBSCRIPTION_STATUS', 'PLAN']) if (all.includes(k)) throw new Error('ASSERTION FAILED: sign-up must not write ' + k);
eq(calls.some(c => c.url.includes('/automations')), true, 'onboarding automation still triggered (unchanged)');
eq(calls.filter(c => c.url.endsWith('/smtp/email')).length, 1, 'admin alert still sent (unchanged)');
out('PASS: notify-signup writes only FIRSTNAME + list, never a plan/status (cannot reset a paying customer)');
out('notify-signup offline checks passed (1 scenario)');
