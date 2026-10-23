// Customer journeys that should keep working across guide and layout changes.
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('printing-and-cutting.html', 'utf8');
const js = fs.readFileSync('printing-help.js', 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function guide(url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.eval(js);
  return { dom, w, d: w.document };
}

(async () => {
  const { dom, w, d } = await guide('https://clpeasy.com/knowledge/printing-and-cutting?from=builder#one');
  const click = async selector => {
    d.querySelector(selector).click();
    // Fragment navigation fires asynchronously, independently of click dispatch.
    for (let i = 0; i < 30; i++) {
      await tick();
      if (d.querySelector('.panel.active').id === w.location.hash.slice(1)) return;
    }
  };
  assert.equal(d.querySelector('.panel.active').id, 'one', 'A shared route link opens the requested guide');
  assert(d.querySelector('#entry-context').textContent.includes('original tab'), 'Builder users can keep their original work open');
  for (const a of d.querySelectorAll('a[data-guide]')) {
    assert.equal(new URL(a.href).pathname, '/knowledge/printing-and-cutting', 'Opening a guide link in another tab stays on the guide, despite the site base URL');
  }
  await click('#one a[href$="#checks"]');
  assert.equal(d.querySelector('.panel.active').id, 'checks');
  assert(!d.querySelector('.return-context').hidden);
  await click('#return-guide');
  assert.equal(d.querySelector('.panel.active').id, 'one', 'Return restores the originating guide');
  await click('.sidenav a[href$="#faq"]');
  assert(d.querySelector('.return-context').hidden, 'Choosing a new route clears the unrelated breadcrumb');
  const search = d.getElementById('faq-search');
  search.value = 'thermal'; search.dispatchEvent(new w.Event('input'));
  assert.equal([...d.querySelectorAll('.faq-item')].filter(x => !x.hidden).length, 1);
  assert(d.getElementById('faq-count').textContent.startsWith('1 of '));
  search.value = 'no-such-question-123'; search.dispatchEvent(new w.Event('input'));
  assert(!d.getElementById('faq-empty').hidden, 'A failed search gives a recovery route');
  w.dispatchEvent(new w.Event('beforeprint'));
  assert([...d.querySelectorAll('.faq-item')].every(x => x.open && !x.hidden), 'Printing includes every answer');
  w.dispatchEvent(new w.Event('afterprint'));
  assert([...d.querySelectorAll('.faq-item')].every(x => x.hidden), 'Printing does not discard the search state');
  await click('.sidenav a[href$="#start"]');
  const screenshot = d.querySelector('.screenshot img'); screenshot.click();
  assert(d.getElementById('lightbox').classList.contains('open'));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert(!d.getElementById('lightbox').classList.contains('open'), 'Screenshot enlargement can be dismissed by keyboard');
  assert.equal(d.activeElement, screenshot, 'Focus returns to the selected screenshot');
  dom.window.close();
  const malformed = await guide('https://clpeasy.com/knowledge/printing-and-cutting#%E0%A4%A');
  assert.equal(malformed.d.querySelector('.panel.active').id, 'home', 'A malformed shared fragment falls back safely');
  malformed.dom.window.close();
  console.log('printing help customer journeys: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
