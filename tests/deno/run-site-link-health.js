// Runs the offline Deno tests for the site-link-health Edge Function
// (fake web + Supabase stub; nothing reaches real websites).
// Uses $DENO, then `deno` on PATH; prints SKIP and exits 0 if neither exists.
//   node tests/deno/run-site-link-health.js
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const candidates = [process.env.DENO, 'deno'].filter(Boolean);
const deno = candidates.find(c => { try { return spawnSync(c, ['--version']).status === 0; } catch (e) { return false; } });
if (!deno) { console.log('SKIP site-link-health Edge Function tests: Deno is not installed'); process.exit(0); }
const r = spawnSync(deno, ['run', '--no-remote', '--allow-env', '--allow-read', '--import-map=tests/deno/link-health-import_map.json', 'tests/deno/site-link-health.test.ts'],
  { cwd: root, stdio: 'inherit', env: Object.assign({}, process.env, { DENO_NO_UPDATE_CHECK: '1', NO_COLOR: '1' }) });
process.exit(r.status === 0 ? 0 : 1);
