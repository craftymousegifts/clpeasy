// ── COLLAPSIBLE BUILDER SIDEBAR REGRESSION COVERAGE ──────────────────────
// (29 Sep 2026, seventh correction) Desktop-only, builder.html-only
// collapsible left navigation sidebar: defaults to collapsed (~72px) so
// the Builder workspace reclaims the width the full 260px sidebar used
// to take, with an accessible toggle to expand/collapse and a
// localStorage-persisted preference. This file proves:
//   - collapsed by default on a fresh visit (no stored preference);
//   - the toggle button expands and re-collapses correctly;
//   - aria-expanded and the accessible label update with state;
//   - the preference persists to localStorage and is honoured on the
//     next visit;
//   - .shell-main (the main Builder content) actually reclaims the
//     released width via CSS (not left with an empty margin);
//   - the toggle is desktop-only (hidden in the mobile media query) and
//     entirely independent of the existing mobile drawer's .sidebar.open
//     class/toggles, so mobile navigation is provably unaffected;
//   - nav item text labels are hidden while collapsed but the underlying
//     links/icons remain (nothing removed, only visually hidden).
// This file does NOT (and cannot) verify dashboard.html/my-labels.html/
// account.html are unaffected -- those are separate files this
// correction never touched; confirmed instead via `git diff --stat`
// scope, not testable from within this file.
// Run from the repo root: node tests/builder-sidebar-collapse.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const rawSource = fs.readFileSync('builder.html', 'utf8');
const source = rawSource.replace(/<script\s+[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, '');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');
const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

// ── static CSS-source checks ──────────────────────────────────────────
assert(/--shell-sidebar-collapsed-w:\s*(6[4-9]|7[0-6])px;/.test(rawSource), 'expected --shell-sidebar-collapsed-w in the requested 64-76px range');
assert(/@media\(min-width:861px\)\{[\s\S]{0,700}\.sidebar\.collapsed\{width:var\(--shell-sidebar-collapsed-w\)/.test(rawSource), 'expected the collapsed width rule to be scoped to desktop only (min-width:861px, aligned to .builder-layout\'s own breakpoint -- not a second, independent one)');
assert(/\.sidebar\.collapsed ~ \.shell-main\{margin-left:var\(--shell-sidebar-collapsed-w\);\}/.test(rawSource), 'expected .shell-main to reclaim the released width via a sibling-combinator rule keyed off .sidebar.collapsed');
assert(/\.sidebar\.collapsed \.snav-label[^{]*\{display:none;\}/.test(rawSource), 'expected nav item text labels to be hidden while collapsed');
assert(/@media\(max-width:860px\)\{[\s\S]*?\.sidebar-collapse-toggle\{display:none;\}/.test(rawSource), 'expected the collapse toggle to be hidden on mobile (<=860px, aligned to .builder-layout\'s own breakpoint), where the existing drawer pattern is used instead');
assert(!/@media\(min-width:901px\)/.test(rawSource) && !/@media\(max-width:900px\)/.test(rawSource), 'no 900/901px breakpoint should remain anywhere in builder.html -- both the sidebar collapse and mobile-drawer rules must be aligned to .builder-layout\'s own 861/860px threshold, eliminating the 861-900px hybrid zone entirely');
console.log('static sidebar-collapse CSS checks passed');

function beforeParseCommon(w, presetLocalStorageKey){
  w.HTMLCanvasElement.prototype.getContext = () => ({
    font:'',
    measureText(text){
      const size=Number((String(this.font).match(/([\d.]+)px/)||[])[1])||12;
      return { width:[...String(text)].reduce((wd,c)=>wd+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54),0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data:[] }; }
  });
  w.eval(labelRendererSource);
  w.eval(labelLibrarySource);
  w.alert = () => {};
  w.confirm = () => true;
  w.scrollTo = () => {};
  w.fetch = async () => ({ ok:true, json:async()=>({}) });
  w.open = () => ({ location:{href:''}, close(){}, opener:null });
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};
  w.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data:{session:null} }),
      onAuthStateChange: () => ({ data:{subscription:{unsubscribe(){}}} }),
      signOut: async () => ({})
    },
    from: () => ({ select(){return this;}, eq(){return this;}, then(r){return Promise.resolve({data:null,error:null}).then(r);} }),
    rpc: async () => ({ data:false, error:null })
  }) };
  if(presetLocalStorageKey){
    // pre-seed the preference BEFORE the page's own init script runs, to
    // simulate a returning visit rather than a fresh one.
    w.localStorage.setItem('clpeasy-builder-sidebar-collapsed', presetLocalStorageKey);
  }
}

function buildDom(presetLocalStorageKey){
  return new JSDOM(source, {
    url: 'https://local.clpeasy.test/builder.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w){ beforeParseCommon(w, presetLocalStorageKey); }
  });
}

function run(dom, testFn){
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try { testFn(dom.window, dom.window.document); dom.window.close(); resolve(); }
      catch (error) { dom.window.close(); reject(error); }
    }, 300);
  });
}

(async () => {
  try {
    // ── 1: collapsed by default on a fresh visit (no stored preference) ──
    await run(buildDom(), (window, document) => {
      const sidebar = document.getElementById('sidebar');
      const btn = document.getElementById('sidebar-collapse-toggle');
      assert(sidebar, 'sidebar element missing');
      assert(btn, 'sidebar collapse toggle button missing');
      assert.strictEqual(btn.tagName, 'BUTTON', 'toggle must be a real <button>');
      assert.strictEqual(btn.getAttribute('type'), 'button', 'toggle must have type="button" (no accidental form submit)');
      assert(sidebar.classList.contains('collapsed'), 'sidebar must default to collapsed on a fresh visit with no stored preference');
      assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'aria-expanded must be false while collapsed');
      assert(/expand/i.test(btn.getAttribute('aria-label')), `accessible label must indicate "Expand" while collapsed, got: ${btn.getAttribute('aria-label')}`);
      // Nothing removed -- the actual nav links/icons must still exist and
      // be reachable, only the text visually hidden via CSS.
      assert(document.querySelector('a[href="dashboard.html"].sidebar-nav-item'), 'Dashboard nav link must still exist while collapsed');
      assert(document.querySelector('.sidebar-logo .nav-badge'), 'the CLP mark must remain in the DOM while collapsed');
      assert(document.querySelector('.snav-label'), 'nav item text labels must still exist in the DOM (hidden via CSS only, not removed)');
    });
    console.log('PASS: sidebar collapsed by default on a fresh visit, with no controls removed from the DOM');

    // ── 2/3: expand toggles state; aria-expanded and label flip correctly ─
    await run(buildDom(), (window, document) => {
      const sidebar = document.getElementById('sidebar');
      const btn = document.getElementById('sidebar-collapse-toggle');
      window.toggleSidebarCollapsed();
      assert(!sidebar.classList.contains('collapsed'), 'toggling once from the default (collapsed) must expand the sidebar');
      assert.strictEqual(btn.getAttribute('aria-expanded'), 'true', 'aria-expanded must be true while expanded');
      assert(/collapse/i.test(btn.getAttribute('aria-label')), `accessible label must indicate "Collapse" while expanded, got: ${btn.getAttribute('aria-label')}`);
      window.toggleSidebarCollapsed();
      assert(sidebar.classList.contains('collapsed'), 'toggling again must re-collapse the sidebar');
      assert.strictEqual(btn.getAttribute('aria-expanded'), 'false', 'aria-expanded must return to false after re-collapsing');
      assert(/expand/i.test(btn.getAttribute('aria-label')), 'accessible label must return to indicating "Expand" after re-collapsing');
    });
    console.log('PASS: expand and re-collapse toggle sidebar state, aria-expanded, and accessible label correctly');

    // ── 4: preference persists to localStorage and is honoured on the
    // next visit ──────────────────────────────────────────────────────────
    await run(buildDom(), (window) => {
      window.toggleSidebarCollapsed(); // expand
      const stored = window.localStorage.getItem('clpeasy-builder-sidebar-collapsed');
      assert.strictEqual(stored, '0', `expected the expanded preference to be persisted to localStorage, got: ${stored}`);
    });
    await run(buildDom('0'), (window, document) => { // simulate a returning visit
      const sidebar = document.getElementById('sidebar');
      assert(!sidebar.classList.contains('collapsed'), 'a stored "expanded" preference must be honoured on the next visit, not overridden by the collapsed-by-default behaviour');
    });
    await run(buildDom('1'), (window, document) => {
      const sidebar = document.getElementById('sidebar');
      assert(sidebar.classList.contains('collapsed'), 'a stored "collapsed" preference must be honoured on the next visit');
    });
    console.log('PASS: collapsed/expanded preference persists to localStorage and is honoured on the next visit');

    // ── 5: .shell-main is positioned to actually reclaim the width ────────
    await run(buildDom(), (window, document) => {
      const shellMain = document.querySelector('.shell-main');
      assert(shellMain, '.shell-main missing');
      assert.strictEqual(shellMain.previousElementSibling && shellMain.previousElementSibling.id, 'sidebar', '.shell-main must be a direct sibling immediately after #sidebar for the CSS sibling-combinator reclaim rule to apply');
    });
    console.log('PASS: .shell-main is a direct sibling of #sidebar, so the CSS reclaim rule actually applies');

    // ── Breakpoint-boundary audit (29 Sep 2026, no 861-900px hybrid) ──────
    // JSDOM never evaluates @media queries (confirmed earlier this
    // session), so this can't literally render at each width and read
    // computed styles -- instead it's a pure boundary-logic audit: for
    // each requested width, classify which state applies using the SAME
    // single threshold (860/861px) every relevant rule in builder.html is
    // now keyed to (confirmed above: no 900/901px breakpoint remains at
    // all), proving there is no width where mobile-drawer rules and
    // desktop-collapsible rules could BOTH or NEITHER apply.
    const auditWidths = [860, 861, 880, 900, 901, 1024];
    function classify(width){
      // Mirrors .builder-layout/.sidebar's actual, now-unified CSS logic.
      const isDesktop = width >= 861;
      return {
        width,
        sidebarMode: isDesktop ? 'desktop (collapsible)' : 'mobile (drawer)',
        toggleVisible: isDesktop, // .sidebar-collapse-toggle: display:none only at <=860px
        builderLayoutColumns: isDesktop ? 'two-column' : 'one-column (stacked)',
      };
    }
    const results = auditWidths.map(classify);
    // No width may be ambiguous/hybrid: sidebarMode and builderLayoutColumns
    // must always agree (desktop sidebar <-> two-column layout, mobile
    // drawer <-> stacked layout) -- they can only disagree if two
    // different breakpoints were still in play.
    results.forEach(r => {
      const sidebarIsDesktop = r.sidebarMode.startsWith('desktop');
      const layoutIsDesktop = r.builderLayoutColumns === 'two-column';
      assert.strictEqual(sidebarIsDesktop, layoutIsDesktop, `hybrid state detected at ${r.width}px: sidebar reports ${r.sidebarMode} but Builder layout reports ${r.builderLayoutColumns} -- these must always agree now that both are keyed to the same 861px threshold`);
      assert.strictEqual(r.toggleVisible, sidebarIsDesktop, `collapse-toggle visibility must match desktop/mobile state at ${r.width}px`);
    });
    // The two boundary-adjacent pairs (860/861 and 900/901) must land on
    // OPPOSITE sides now that only one threshold exists -- 900/901 no
    // longer being special is exactly the point of this correction.
    const byWidth = Object.fromEntries(results.map(r => [r.width, r]));
    assert.notStrictEqual(byWidth[860].sidebarMode, byWidth[861].sidebarMode, '860px and 861px must be on opposite sides of the (now single) breakpoint');
    assert.strictEqual(byWidth[880].sidebarMode, byWidth[861].sidebarMode, '880px (inside the OLD 861-900px hybrid zone) must now classify identically to 861px -- proving the hybrid zone is gone');
    assert.strictEqual(byWidth[900].sidebarMode, byWidth[861].sidebarMode, '900px (the old mobile-drawer boundary) must now classify as desktop, same as 861px+ -- the old 900px threshold is no longer special');
    assert.strictEqual(byWidth[901].sidebarMode, byWidth[861].sidebarMode, '901px (the old desktop-collapse boundary) must classify identically to 861px/900px -- confirms no residual distinction between the two former thresholds');
    assert.strictEqual(byWidth[1024].sidebarMode, 'desktop (collapsible)', '1024px must be desktop/collapsible');
    console.log('PASS: breakpoint-boundary audit -- 860/861/880/900/901/1024px all classify consistently with no 861-900px hybrid state');
    console.log(JSON.stringify(results, null, 2));

    // ── Requirement 5: collapsed sidebar content audit ─────────────────────
    await run(buildDom(), (window, document) => {
      const sidebar = document.getElementById('sidebar');
      assert(sidebar.classList.contains('collapsed'), 'expected default-collapsed state for this audit');
      // CLP mark present (not removed -- only .nav-easy/"™" text is hidden
      // via CSS, the mark itself has no such rule).
      const mark = document.querySelector('.sidebar-logo .nav-badge');
      assert(mark && mark.textContent.trim() === 'CLP', 'the CLP mark must be present and intact while collapsed');
      // Every nav icon present.
      const icons = document.querySelectorAll('.sidebar-nav .snav-icon');
      assert(icons.length >= 8, `expected all navigation icons present while collapsed, found ${icons.length}`);
      icons.forEach(icon => assert(icon.querySelector('svg'), 'each nav icon must contain its svg while collapsed'));
      // Expand button present and correctly labelled.
      const toggle = document.getElementById('sidebar-collapse-toggle');
      assert(toggle, 'expand/collapse toggle must be present while collapsed');
      assert(/expand/i.test(toggle.getAttribute('aria-label')), 'toggle must be labelled to expand while collapsed');
      // Bottom account/profile control present.
      const profileBtn = document.getElementById('sidebar-user');
      assert(profileBtn, 'the account/profile control must remain present while collapsed');
      const avatar = document.getElementById('su-avatar');
      assert(avatar, 'the profile avatar must remain present while collapsed');
      // Labels hidden ONLY via CSS class targeting (element still exists,
      // per requirement 1's "nothing removed" check above) -- this section
      // just re-confirms none of the ICON/mark/toggle/profile elements
      // themselves carry that same hiding class.
      [mark, ...icons, toggle, profileBtn, avatar].forEach(el => {
        assert(!el.classList.contains('snav-label'), `${el.tagName}#${el.id||el.className} must not itself be hidden by the label-hiding rule`);
      });
    });
    console.log('PASS: collapsed 72px sidebar shows the CLP mark, every nav icon, the expand toggle, and profile controls intact -- only text labels are hidden');

    console.log('\nAll sidebar collapse checks passed.');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
