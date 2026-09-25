// Runs the offline Deno Edge Function tests (Stripe/Supabase/Brevo mocked).
// Uses $DENO, then `deno` on PATH; prints SKIP and exits 0 if neither exists.
//   node tests/deno/run.js
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const candidates = [process.env.DENO, 'deno'].filter(Boolean);
const deno = candidates.find(c => { try { return spawnSync(c, ['--version']).status === 0; } catch (e) { return false; } });
if (!deno) { console.log('SKIP Edge Function tests: Deno is not installed'); process.exit(0); }
let failed = 0;
for (const t of ['stripe-webhook.test.ts', 'create-checkout-session.test.ts']) {
  const r = spawnSync(deno, ['run', '--no-remote', '--allow-env', '--allow-read', '--import-map=tests/deno/import_map.json', 'tests/deno/' + t],
    { cwd: root, stdio: 'inherit', env: Object.assign({}, process.env, { DENO_NO_UPDATE_CHECK: '1', NO_COLOR: '1' }) });
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
