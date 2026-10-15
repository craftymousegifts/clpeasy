// Exercise the production display/control functions without browser dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../builder.html'), 'utf8');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) {
    const buttons = [{disabled:false}, {disabled:false}];
    elements.set(id, {innerHTML:'', style:{}, buttons,
      closest: () => ({querySelectorAll: () => buttons})});
  }
  return elements.get(id);
};
const context = vm.createContext({window:{_ftRenderedFS:{}, _ftLastOpts:{}},
  S:{}, document:{getElementById:element}});
const start = html.indexOf('const _FT_CONTROLS=');
const end = html.indexOf('function nudgeTypeFS', start);
assert(start > 0 && end > start);
vm.runInContext(html.slice(start,end) + '\nthis.controls=_FT_CONTROLS;', context);
for (const control of context.controls) {
  const bounds = {min:1.2, auto:1.2, max:1.248};
  context.window[control.bounds] = bounds;
  context.window._ftRenderedFS[control.fs] = bounds.auto;
  context.S[control.ov] = null;
}
context.syncAdjustPanel();
for (const c of context.controls) {
  const e=element(c.el), b=context.window[c.bounds];
  assert.equal(e.innerHTML, '100%<span class="ft-min">minimum</span>');
  assert.deepEqual(e.buttons.map(b=>b.disabled), [true,false]);
  // The narrow range reported by Michaela: one step must be visible.
  context.S[c.ov]=b.auto+(b.max-b.min)*.08;
  context.window._ftRenderedFS[c.fs]=context.S[c.ov];
  context.syncAdjustPanel();
  assert.equal(e.innerHTML, '100.3%');
  assert.deepEqual(e.buttons.map(b=>b.disabled), [false,false]);
  context.S[c.ov]=b.max;
  context.window._ftRenderedFS[c.fs]=b.max;
  context.syncAdjustPanel();
  assert.equal(e.innerHTML, '104%<span class="ft-max">maximum</span>');
  assert.deepEqual(e.buttons.map(b=>b.disabled), [false,true]);
  // Reset must restore automatic, its limit status, and button states.
  context.S[c.ov]=null;
  context.window._ftRenderedFS[c.fs]=b.auto;
  context.syncAdjustPanel();
  assert.equal(e.innerHTML, '100%<span class="ft-min">minimum</span>');
  assert.deepEqual(e.buttons.map(b=>b.disabled), [true,false]);
  // A collapsed range has no adjustment in either direction.
  b.max=b.min;
  context.syncAdjustPanel();
  assert.match(e.innerHTML,/minimum/);
  assert.match(e.innerHTML,/maximum/);
  assert.deepEqual(e.buttons.map(b=>b.disabled),[true,true]);
  b.max=1.248;
}
console.log('PASS: all five controls: narrow-range decimals, limits, button states, Reset and collapsed ranges');
