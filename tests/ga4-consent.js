/* No network calls: test the opt-in loader's behaviour in a VM. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('ga4-consent.js', 'utf8');
function boot(value) {
  const store = new Map();
  if (value) store.set('clpeasy-ga4-consent', value);
  const appended = [];
  const document = { head: { appendChild: (node) => appended.push(node) }, createElement: () => ({}) };
  const window = { localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, val) => store.set(key, val) }, location: { reload: () => { window.reloaded = true; } } };
  vm.runInNewContext(source, { window, document, Date, encodeURIComponent });
  return { window, appended, store };
}
for (const state of [null, 'denied', 'accepted', 'essential']) {
  const { window, appended } = boot(state);
  assert.equal(appended.length, 0, 'GA must not load for ' + state);
  assert.equal(window.CLPeasyGA4.isAllowed(), false);
}
{
  const { window, appended } = boot('granted');
  assert.equal(appended.length, 1);
  assert.match(appended[0].src, /G-BRNTQTTB5P/);
  assert.equal(window.CLPeasyGA4.start(), false);
  assert.equal(appended.length, 1, 'must not load twice');
  window.CLPeasyGA4.setConsent(false);
  assert.equal(window.reloaded, true, 'revoking an active tag requires reload');
}
{
  const { window, appended } = boot(null);
  window.CLPeasyGA4.setConsent(true);
  assert.equal(appended.length, 1);
  assert.equal(window.CLPeasyGA4.isAllowed(), true);
}
console.log('GA4 opt-in loader tests passed');
