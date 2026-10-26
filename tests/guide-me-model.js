// Guide Me must request a model that is still served. claude-sonnet-4-20250514
// was retired on 15 Jun 2026; requests to retired models fail. The deployed
// clp-wizard function only forwards models on its allow-list, which includes
// claude-sonnet-4-6.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'builder.html'), 'utf8');
const models = [...html.matchAll(/\bmodel:\s*'([^']+)'/g)].map(m => m[1]);
assert.deepStrictEqual(models, ['claude-sonnet-4-6'], 'Guide Me requests claude-sonnet-4-6 only');
for (const retired of ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'])
  assert(!html.includes(retired), 'retired model still referenced: ' + retired);
console.log('PASS guide-me-model: Guide Me requests a supported, server-allowed model');
