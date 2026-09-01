// Checkpoint A regression tests -- label-library.js (identity/migration)
// and label-render.js's new getPhysicalSpec()/checkCompatibility()
// (31 Aug 2026, connected print-workflow task; revised after Checkpoint A
// review corrections -- new PARTs 3b, 4b, 4c, 5b, 5c, 6b, 7b, 11, 12, 13
// were added specifically to cover those corrections; PARTs 3, 4, 6, 7, 8,
// 9, 10 were updated for the new setNamespace()-then-init() lifecycle).
// Neither file is wired into any production page yet -- these are
// pure-logic tests against the two shared modules in isolation, run via a
// jsdom sandbox (label-render.js needs a real, stubbed DOM/canvas).
//   node tests/label-identity-and-spec.js
const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');

const labelLibrarySource = fs.readFileSync('label-library.js', 'utf8');
const labelRendererSource = fs.readFileSync('label-render.js', 'utf8');

// ── jsdom window per "tab" -- label-render.js does top-level canvas/DOM
// setup at load time (pictogram-measurement scaffolding), so it needs a
// real (stubbed) document, not a bare vm sandbox. Follows the exact same
// canvas-stub pattern already established in
// tests/custom-rect-grid-geometry.js. Each call returns an independent
// window/localStorage -- used to simulate two separate browser tabs. ──
function makeWindow(){
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://local.clpeasy.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText(text){
      const size = Number((String(this.font).match(/([\d.]+)px/)||[])[1]) || 12;
      return { width: [...String(text)].reduce((w,c)=>w+size*(/[MW@%]/.test(c)?.82:/[ilI1.,' ]/.test(c)?.28:.54), 0) };
    },
    drawImage(){}, fillRect(){}, clearRect(){}, getImageData(){ return { data: [] }; },
  });
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
  // jsdom's own window.crypto implements randomUUID()/getRandomValues()
  // but NOT crypto.subtle (SubtleCrypto) -- real browsers in a secure
  // context all provide it, so this polyfills the SAME underlying Web
  // Crypto spec via Node's real webcrypto implementation, to test against
  // realistic browser behaviour rather than jsdom's gap. PART 6 below
  // explicitly deletes it again on one specific window to deliberately
  // simulate a genuinely subtle-less environment.
  try{ window.crypto.subtle = webcrypto.subtle; }catch(e){}
  // navigator.locks is left undefined by default -- exercises the
  // deterministic fallback path unless a test explicitly injects a mock.
  try{ window.navigator.locks = undefined; }catch(e){}
  return window;
}

// review point 11: label-library.js only attaches LabelLibrary._internal
// when the loading script has set this flag BEFORE the file runs. Every
// test in this file (bar PART 13, which specifically proves the negative)
// needs that surface, so loadInto() sets it; loadIntoProductionMode()
// deliberately does NOT, to prove _internal is genuinely absent otherwise.
function loadInto(window){
  window.__LABEL_LIBRARY_TEST__ = true;
  window.eval(labelRendererSource);
  window.eval(labelLibrarySource);
  return window;
}
function loadIntoProductionMode(window){
  window.eval(labelRendererSource);
  window.eval(labelLibrarySource);
  return window;
}

// Legacy fixtures -- no 'id' field, exactly as a pre-migration record
// would look.
function legacyCircle52(){ return { scentName:'Vanilla Bean', productType:'Candle', shape:'circle', size:'52' }; }
function legacyRect63(){ return { scentName:'Cedar', productType:'Candle', shape:'rectangle', size:'63' }; }
function customRect57x99(){ return { scentName:'Fireside Amber', productType:'Candle', shape:'rectangle', size:'custom', customW:57, customH:99 }; }
function customRectDecimal(){ return { scentName:'OL Match', productType:'Candle', shape:'rectangle', size:'custom', customW:99.1, customH:57.3 }; }

// Normalizes to an outer (Node-realm) plain array of id strings before any
// deepStrictEqual comparison. LabelLibrary's own return values -- and the
// simulated "tabs'" arrays -- are built via their OWN jsdom window's Array
// constructor; two different windows (or a window vs. outer Node) have
// distinct Array.prototypes, so comparing them directly fails
// deepStrictEqual on prototype identity even when every element is an
// identical primitive string. Array.from, invoked unqualified here,
// always builds against Node's own Array regardless of the input's realm,
// so this makes every comparison realm-neutral without weakening it.
function idsOf(arrLike){ return Array.from(arrLike, function(e){ return e.id; }); }

(async () => {
  try{
    // ══════════════════════════════════════════════════════════════════
    // PART 1 -- getPhysicalSpec() dimension correctness (the exact four
    // cases requested, proving the real {mmW,mmH} property names are used,
    // not the illustrative {w,h} that would have produced undefined).
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LR = sb.LabelRenderer;

      const s52 = LR.getPhysicalSpec(legacyCircle52());
      assert.strictEqual(s52.widthMm, 52, 'legacy 52mm circle: widthMm');
      assert.strictEqual(s52.heightMm, 52, 'legacy 52mm circle: heightMm');
      assert.strictEqual(s52.diameterMm, 52, 'legacy 52mm circle: diameterMm');
      assert(Number.isFinite(s52.widthMm) && Number.isFinite(s52.heightMm), 'must never be undefined -- proves {mmW,mmH} destructuring is correct');

      const s63 = LR.getPhysicalSpec(legacyRect63());
      assert.strictEqual(s63.widthMm, 63, 'legacy 63mm preset rectangle: widthMm');
      assert.strictEqual(s63.heightMm, 44, 'legacy 63mm preset rectangle: heightMm must be Math.round(63*0.7)=44');

      const sCustom = LR.getPhysicalSpec(customRect57x99());
      assert.strictEqual(sCustom.widthMm, 57, 'custom 57x99mm rectangle: widthMm exact, not defaulted');
      assert.strictEqual(sCustom.heightMm, 99, 'custom 57x99mm rectangle: heightMm exact, not defaulted');
      assert.strictEqual(sCustom.orientation, 'portrait', '99>57 must report portrait');

      const sDecimal = LR.getPhysicalSpec(customRectDecimal());
      assert.strictEqual(sDecimal.widthMm, 99.1, 'decimal custom 99.1x57.3mm: widthMm must not be rounded to an integer');
      assert.strictEqual(sDecimal.heightMm, 57.3, 'decimal custom 99.1x57.3mm: heightMm must not be rounded to an integer');
      assert.strictEqual(sDecimal.orientation, 'landscape');

      console.log('PART 1 passed: getPhysicalSpec() dimension correctness (legacy 52mm, legacy 63mm, custom 57x99mm, decimal 99.1x57.3mm)');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 2 -- checkCompatibility()
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LR = sb.LabelRenderer;
      const eu30009 = { kind:'registry', shape:'rectangle', widthMm:99.1, heightMm:57.3 };
      const eu30009Circle = { kind:'registry', shape:'circle', widthMm:63, heightMm:63 };

      // Exact preset-to-template and custom-to-template matches.
      const presetMatch = LR.checkCompatibility(LR.getPhysicalSpec({shape:'circle',size:'63'}), eu30009Circle);
      assert.strictEqual(presetMatch.compatible, true);
      assert.strictEqual(presetMatch.matchType, 'exact');

      const customMatch = LR.checkCompatibility(LR.getPhysicalSpec(customRectDecimal()), eu30009);
      assert.strictEqual(customMatch.compatible, true, 'a custom-origin label matching a template exactly must be compatible -- source must never block it');
      assert.strictEqual(customMatch.matchType, 'exact');

      // Square shape (not circle, not rectangle) -- must validate BOTH
      // template dimensions via the same general exact-match path.
      const squareMatch = LR.checkCompatibility(LR.getPhysicalSpec({shape:'square', size:'40'}), { kind:'registry', shape:'square', widthMm:40, heightMm:40 });
      assert.strictEqual(squareMatch.compatible, true);
      assert.strictEqual(squareMatch.matchType, 'exact');

      // Rotated dimensions -- must be reported as unavailable, NOT compatible.
      const rotated = LR.checkCompatibility(LR.getPhysicalSpec(customRect57x99()), { kind:'registry', shape:'rectangle', widthMm:99, heightMm:57 });
      // 57x99 vs a 99x57 template: swapped-dimension match exists.
      assert.strictEqual(rotated.compatible, false, 'a rotated-only match must NOT be reported as compatible');
      assert.strictEqual(rotated.matchType, 'rotation-unavailable');
      assert.strictEqual(rotated.rotationDeg, null, 'rotationDeg must be null, not 0 or 90, since no rotation is actually offered');
      assert(/isn't supported yet/i.test(rotated.reason));

      // Shape mismatch.
      const shapeMismatch = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), eu30009);
      assert.strictEqual(shapeMismatch.compatible, false);
      assert.strictEqual(shapeMismatch.matchType, 'incompatible');

      // Genuinely incompatible size (not exact, not swapped).
      const sizeMismatch = LR.checkCompatibility(LR.getPhysicalSpec(legacyRect63()), eu30009);
      assert.strictEqual(sizeMismatch.compatible, false);
      assert.strictEqual(sizeMismatch.matchType, 'incompatible');

      // Custom Sheet: always compatible, source/presetId irrelevant.
      const customSheetSpec = { kind:'custom-sheet' };
      const cs1 = LR.checkCompatibility(LR.getPhysicalSpec(customRect57x99()), customSheetSpec);
      const cs2 = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), customSheetSpec);
      assert.strictEqual(cs1.compatible, true);
      assert.strictEqual(cs1.matchType, 'custom-sheet');
      assert.strictEqual(cs2.compatible, true);

      // review point 10 -- malformed/non-finite geometry must fail closed
      // as 'invalid-spec', never report compatible, and never build a
      // NaN-laced customer-facing message.
      const nanLabel = LR.checkCompatibility({shape:'rectangle', widthMm: NaN, heightMm: 40}, eu30009);
      assert.strictEqual(nanLabel.compatible, false);
      assert.strictEqual(nanLabel.matchType, 'invalid-spec');

      const undefinedDiameter = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:52, diameterMm: undefined}, eu30009Circle);
      assert.strictEqual(undefinedDiameter.compatible, false);
      assert.strictEqual(undefinedDiameter.matchType, 'invalid-spec');

      // Circle matching validates BOTH template width and height as the
      // required diameter -- a malformed circle template entry whose
      // height disagrees with its width must never be trusted from width
      // alone.
      const malformedCircleTemplate = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), { kind:'registry', shape:'circle', widthMm:52, heightMm: NaN });
      assert.strictEqual(malformedCircleTemplate.compatible, false, "a circle template with a non-finite height must never be silently trusted from width alone");
      assert.strictEqual(malformedCircleTemplate.matchType, 'invalid-spec');

      // Square matching validates both template dimensions too.
      const malformedSquareTemplate = LR.checkCompatibility(LR.getPhysicalSpec({shape:'square', size:'40'}), { kind:'registry', shape:'square', widthMm:40, heightMm: undefined });
      assert.strictEqual(malformedSquareTemplate.compatible, false, 'square matching must validate both template dimensions');
      assert.strictEqual(malformedSquareTemplate.matchType, 'invalid-spec');

      const nullSpec = LR.checkCompatibility(null, eu30009);
      assert.strictEqual(nullSpec.compatible, false);
      assert.strictEqual(nullSpec.matchType, 'invalid-spec');

      console.log('PART 2 passed: checkCompatibility() exact/rotated-unavailable/incompatible/custom-sheet/square cases, including the exact 57x99 vs 99x57 rotation example, and fail-closed invalid-spec handling for malformed/non-finite geometry');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 3 -- LabelLibrary namespace gating (review point 3: init() has
    // no namespace argument and must never read storage before the
    // namespace is confirmed)
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      assert.throws(() => LL.getSaved(), /namespace not resolved/, 'getSaved() before setNamespace() must throw, never read the guest key');

      sb.localStorage.setItem('clpeasy_labels__u_never-confirmed', JSON.stringify([legacyCircle52()]));
      // jsdom's real Storage instances don't honour a plain instance-
      // property override of getItem (confirmed separately -- calls keep
      // reaching the real implementation regardless), so the whole
      // localStorage reference is swapped for a thin delegating wrapper
      // instead -- proven to actually intercept calls made from inside
      // window.eval'd code, unlike patching individual methods.
      let getItemCalls = 0;
      const realStorage = sb.localStorage;
      Object.defineProperty(sb, 'localStorage', { configurable: true, value: {
        getItem(k){ getItemCalls++; return realStorage.getItem(k); },
        setItem(k, v){ return realStorage.setItem(k, v); },
        removeItem(k){ return realStorage.removeItem(k); },
      }});
      await assert.rejects(() => LL.init(), /namespace not resolved/, 'init() before setNamespace() must reject, never silently pick a default/guest namespace');
      assert.strictEqual(getItemCalls, 0, 'init() before setNamespace() must never touch localStorage at all -- namespace resolution is not optional');
      Object.defineProperty(sb, 'localStorage', { configurable: true, value: realStorage });

      LL.setNamespace('user-1');
      assert.throws(() => LL.getSaved(), /before init\(\) completed/, 'getSaved() before init() resolves must throw, never return an unmigrated/uncached array');
      console.log('PART 3 passed: namespace gating (fail-closed before setNamespace, fail-closed before init, init() never reads storage before namespace is confirmed)');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 3b -- init() takes no namespace argument; it can only ever
    // operate on whatever setNamespace() already confirmed, so a caller
    // can never bypass the auth gate by passing a namespace into init().
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_alice-p3', JSON.stringify([legacyCircle52()]));
      sb.localStorage.setItem('clpeasy_labels__u_mallory-p3', JSON.stringify([legacyRect63()]));
      LL.setNamespace('alice-p3');
      const result = await LL.init('mallory-p3'); // any argument here must simply be ignored
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scentName, 'Vanilla Bean', "init() must only ever operate on the namespace setNamespace() already confirmed -- an argument passed to init() must never select a different namespace");
      console.log("PART 3b passed: init() cannot be passed a namespace to switch identity -- only setNamespace() establishes it, and setNamespace('alice')+init() reads only alice");
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 4 -- migration: assigns ids, persists, idempotent, ordering/
    // field-preservation, never regenerates an existing valid id
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const raw = [legacyCircle52(), customRect57x99(), legacyRect63()];
      sb.localStorage.setItem('clpeasy_labels__u_user-2', JSON.stringify(raw));

      LL.setNamespace('user-2');
      const migrated = await LL.init();
      assert.strictEqual(migrated.length, 3, 'migration must preserve every existing record');
      migrated.forEach(e => assert(LL.isValidId(e.id), 'every migrated record must have a valid-format id'));
      assert.strictEqual(migrated[0].scentName, 'Vanilla Bean', 'ordering preserved (index 0)');
      assert.strictEqual(migrated[1].scentName, 'Fireside Amber', 'ordering preserved (index 1)');
      assert.strictEqual(migrated[2].scentName, 'Cedar', 'ordering preserved (index 2)');
      assert.strictEqual(migrated[1].customW, 57, 'every existing field preserved, not just scentName');

      const persistedRaw = JSON.parse(sb.localStorage.getItem('clpeasy_labels__u_user-2'));
      assert.deepStrictEqual(idsOf(persistedRaw), idsOf(migrated), 'the persisted collection must exactly match what init() returned');

      // Idempotency: re-running init() must not change any id.
      const idsBefore = idsOf(migrated);
      const migratedAgain = await LL.init();
      assert.deepStrictEqual(idsOf(migratedAgain), idsBefore, 'a second migration run must never regenerate/replace an id that already exists');

      console.log('PART 4 passed: migration assigns ids, persists, preserves order and fields, is idempotent');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 4b -- review point 1: unique ids are required, not merely
    // valid-format ids. Two records already sharing one valid id must
    // fail closed, never be silently accepted.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const dupId = '11111111-1111-4111-8111-111111111111';
      const rawDup = [
        Object.assign({id: dupId}, legacyCircle52()),
        Object.assign({id: dupId}, legacyRect63()),
      ];
      sb.localStorage.setItem('clpeasy_labels__u_user-dup', JSON.stringify(rawDup));
      LL.setNamespace('user-dup');
      await assert.rejects(() => LL.init(), /LibraryMigrationError|could not be safely completed/, 'two existing records sharing one valid id must fail closed, never be silently accepted');

      // persistSaved() must reject a collection with duplicate ids outright.
      LL.reset();
      LL.setNamespace('user-dup2');
      sb.localStorage.setItem('clpeasy_labels__u_user-dup2', JSON.stringify([legacyCircle52()]));
      const arr = await LL.init();
      const bad = [arr[0], Object.assign({}, arr[0])]; // same id twice
      assert.throws(() => LL._internal.persistSaved(bad), /valid, unique id/, 'persistSaved() must reject a collection containing duplicate ids');

      // findById() is not itself the ambiguity guard -- init()/persistSaved()
      // are, and are proven above to reject duplicate ids before findById
      // ever legitimately sees a collection. Documented directly: handed an
      // already-ambiguous array by hand, findById deterministically returns
      // the first match rather than merging/preferring one silently.
      const ambiguous = [Object.assign({}, arr[0], {id: dupId, scentName:'First'}), Object.assign({}, arr[0], {id: dupId, scentName:'Second'})];
      assert.strictEqual(LL.findById(ambiguous, dupId).scentName, 'First', 'findById() is never the ambiguity guard -- init()/persistSaved() are the only sources of a "current" collection, and both are proven to reject duplicate ids before findById ever sees one');

      console.log('PART 4b passed: duplicate valid ids are never accepted -- init() fails closed, persistSaved() rejects them outright, findById is never relied on to catch ambiguity');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 4c -- review point 2: random-id generation must fail closed
    // (throw) after exhausting its attempt budget, never return a known
    // collision or a malformed value.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_user-collide', JSON.stringify([legacyCircle52()]));
      LL.setNamespace('user-collide');
      const arr = await LL.init();
      const existingId = arr[0].id;

      // Force every "random" id to collide with the one id already in the library.
      sb.crypto.randomUUID = () => existingId;
      assert.throws(() => LL.generateId(), /IdGenerationError|could not generate a unique id/, 'randomId() must throw after exhausting its attempt budget, never return a known collision');

      // A malformed generated candidate must also never be returned.
      sb.crypto.randomUUID = () => 'not-a-uuid';
      assert.throws(() => LL.generateId(), /IdGenerationError|could not generate a unique id/, 'a malformed generated id must never be returned -- format-invalid candidates must be discarded, not accepted');

      console.log('PART 4c passed: random id generation fails closed (throws IdGenerationError) rather than ever returning a colliding or malformed id');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 5 -- computeMigratedArray() is a pure function of its inputs:
    // two independent computations over the IDENTICAL pre-migration
    // snapshot produce IDENTICAL ids, with zero coordination. This is the
    // property the whole deterministic-migration design rests on. (This
    // part does not by itself prove storage-race safety -- two separate
    // jsdom windows' localStorage are never actually shared, which is
    // exactly what PART 5b below fixes by injecting one genuinely shared
    // backing store.)
    // ══════════════════════════════════════════════════════════════════
    {
      const sbA = loadInto(makeWindow()); // "Tab A" -- its own sandbox/module instance
      const sbB = loadInto(makeWindow()); // "Tab B" -- a separate instance, same input

      // Three GENUINE duplicates (identical content) plus one distinct
      // record, proving the occurrence discriminator gives the three
      // duplicates three distinct ids.
      const rawSnapshot = [legacyCircle52(), customRect57x99(), legacyCircle52(), legacyCircle52()];
      const namespace = 'race-namespace';
      const resultA = await sbA.LabelLibrary._internal.computeMigratedArray(namespace, rawSnapshot);
      const resultB = await sbB.LabelLibrary._internal.computeMigratedArray(namespace, rawSnapshot);

      assert(resultA && resultB, 'both simulated tabs must successfully compute a migrated array (Web Crypto is available in this environment)');
      const idsA = idsOf(resultA), idsB = idsOf(resultB);
      assert.deepStrictEqual(idsA, idsB, "two independent computations over the same snapshot must produce identical ids -- no coordination needed because migration is deterministic");

      const dupIds = [resultA[0].id, resultA[2].id, resultA[3].id];
      assert.strictEqual(new Set(dupIds).size, 3, 'three content-identical legacy records must receive three DISTINCT ids (occurrence discriminator), not one shared id');

      console.log('PART 5 passed: computeMigratedArray() is pure/deterministic -- identical ids from two independent computations, distinct ids for content-duplicates');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 5b -- review point 8: the actual cross-tab race, against ONE
    // genuinely shared storage backend (confirmed separately that two
    // separate jsdom windows' localStorage are NOT shared by default).
    // Both migrations are started before either is awaited, so they truly
    // interleave on the same event loop/microtask queue against the same
    // shared store -- exercising the no-Web-Locks fallback path for real.
    // ══════════════════════════════════════════════════════════════════
    {
      const sbA = loadInto(makeWindow());
      const sbB = loadInto(makeWindow());

      const sharedStore = (function(){
        const map = new Map();
        return {
          getItem(k){ return map.has(k) ? map.get(k) : null; },
          setItem(k, v){ map.set(k, String(v)); },
          removeItem(k){ map.delete(k); },
        };
      })();
      Object.defineProperty(sbA, 'localStorage', { value: sharedStore, configurable: true });
      Object.defineProperty(sbB, 'localStorage', { value: sharedStore, configurable: true });

      const namespace = 'shared-race-namespace';
      const rawSnapshot = [legacyCircle52(), customRect57x99(), legacyCircle52(), legacyCircle52()];
      sharedStore.setItem('clpeasy_labels__u_' + namespace, JSON.stringify(rawSnapshot));

      sbA.LabelLibrary.setNamespace(namespace);
      sbB.LabelLibrary.setNamespace(namespace);

      // Both init() calls are kicked off together (Promise.all) rather than
      // sequentially awaited -- each runs synchronously up to its first
      // real await (the SHA-256 digest call), so both read the identical
      // pre-migration snapshot before either writes anything, then their
      // remaining work genuinely interleaves.
      const [resultA, resultB] = await Promise.all([sbA.LabelLibrary.init(), sbB.LabelLibrary.init()]);

      const idsA = idsOf(resultA), idsB = idsOf(resultB);
      assert.deepStrictEqual(idsA, idsB, 'both callers must return the SAME ids even though they raced against one shared store');

      const finalRaw = JSON.parse(sharedStore.getItem('clpeasy_labels__u_' + namespace));
      assert.deepStrictEqual(idsOf(finalRaw), idsA, 'the final shared-storage persistence must contain exactly the ids both callers returned');

      const dupIdsShared = [resultA[0].id, resultA[2].id, resultA[3].id];
      assert.strictEqual(new Set(dupIdsShared).size, 3, 'duplicate content must remain distinctly identified even under a genuine shared-storage race');

      const linkFromA = idsA[1], linkFromB = idsB[1]; // Fireside Amber's id, as each tab saw it
      assert.strictEqual(linkFromA, linkFromB, 'both tabs must have produced the same link target for the same record');
      const resolvedRecord = finalRaw.find(e => e.id === linkFromA);
      assert(resolvedRecord && resolvedRecord.scentName === 'Fireside Amber', 'a link produced by either racing instance must still resolve against the final shared persistence');

      // Neither instance's returned ids were transient/later replaced:
      // what each returned IS what ended up persisted, byte for byte.
      assert.deepStrictEqual(idsOf(resultA), idsOf(finalRaw), "tab A's returned ids must never be a transient value later replaced by tab B's write");
      assert.deepStrictEqual(idsOf(resultB), idsOf(finalRaw), "tab B's returned ids must never be a transient value later replaced by tab A's write");

      console.log('PART 5b passed: genuine shared-storage race (interleaved via Promise.all, one real shared backing store) -- both callers return identical ids, final persistence matches, duplicates stay distinct, links resolve, nothing transient');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 5c -- review point 7: a forced deterministic-hash collision is
    // resolved via a deterministic salt counter, and two independent
    // computations resolve it to the SAME alternate id.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb1 = loadInto(makeWindow());
      const namespace = 'collision-namespace';
      const recordA = legacyCircle52();
      const recordB = legacyRect63();

      // Precompute what recordB's salt-0 deterministic id would naturally
      // be, then plant an ALREADY-VALID decoy record carrying exactly that
      // id -- forcing recordB's real migration to collide at salt 0 and
      // walk the deterministic salt counter to resolve it.
      const forcedId = await sb1.LabelLibrary._internal.deterministicId(namespace, recordB, 1, 0);
      assert(sb1.LabelLibrary.isValidId(forcedId), 'setup: the precomputed salt-0 id must itself be a valid id so it can occupy that slot');

      const decoy = Object.assign({}, legacyRect63(), { id: forcedId, scentName: 'Decoy (occupies the salt-0 slot)' });
      const rawSnapshot = [decoy, recordA, recordB];

      const resultA = await sb1.LabelLibrary._internal.computeMigratedArray(namespace, rawSnapshot);
      assert(resultA, 'migration must still succeed by walking the deterministic salt counter past the forced collision');
      const migratedRecordB = resultA[2];
      assert.notStrictEqual(migratedRecordB.id, forcedId, 'the colliding record must never be assigned the id that was already taken');
      assert.strictEqual(migratedRecordB.scentName, 'Cedar');

      // A second, completely independent computation over the SAME
      // snapshot (simulating a second tab) must resolve the SAME
      // collision the SAME way -- collision resolution must itself be
      // deterministic, not randomised.
      const sb2 = loadInto(makeWindow());
      const resultB = await sb2.LabelLibrary._internal.computeMigratedArray(namespace, rawSnapshot);
      assert.strictEqual(resultB[2].id, migratedRecordB.id, "both simulated tabs must resolve the forced collision to the SAME alternate id");

      console.log('PART 5c passed: a forced deterministic-hash collision is resolved via a deterministic salt counter, and two independent tabs resolve it to the identical alternate id');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 6 -- fail-closed when deterministic migration is unreliable
    // (Web Crypto unavailable, no Web Locks either)
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      delete sb.crypto.subtle; // simulate an environment where SHA-256 can't be computed
      sb.localStorage.setItem('clpeasy_labels__u_user-3', JSON.stringify([legacyCircle52()]));
      sb.LabelLibrary.setNamespace('user-3');
      await assert.rejects(
        () => sb.LabelLibrary.init(),
        /LibraryMigrationError|could not be safely completed/,
        'when deterministic migration cannot be performed reliably, init() must reject (fail closed), never return an array with a fabricated/unsafe id'
      );
      console.log('PART 6 passed: fails closed (rejects) rather than assigning unreliable ids when Web Crypto is unavailable');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 6b -- review point 6: readRaw() distinguishes a genuinely
    // missing key / explicit [] (both a valid empty collection) from
    // malformed JSON, wrong-shaped data, and a throwing getItem (all of
    // which fail closed with a LibraryReadError, never silently emptied,
    // and never overwrite the original value).
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;

      LL.setNamespace('never-saved');
      const emptyResult = await LL.init();
      assert.strictEqual(emptyResult.length, 0, 'a namespace that has never saved anything must migrate to a valid empty collection, not an error');

      LL.reset();
      sb.localStorage.setItem('clpeasy_labels__u_explicitly-empty', JSON.stringify([]));
      LL.setNamespace('explicitly-empty');
      const explicitEmptyResult = await LL.init();
      assert.strictEqual(explicitEmptyResult.length, 0, 'an explicitly-stored [] must likewise be a valid empty collection');

      LL.reset();
      sb.localStorage.setItem('clpeasy_labels__u_corrupt-json', '{not valid json');
      LL.setNamespace('corrupt-json');
      await assert.rejects(() => LL.init(), /LibraryReadError|not valid JSON/, 'malformed JSON must never be silently treated as an empty collection');
      assert.strictEqual(sb.localStorage.getItem('clpeasy_labels__u_corrupt-json'), '{not valid json', 'the original corrupt value must be left completely untouched, never overwritten');

      LL.reset();
      sb.localStorage.setItem('clpeasy_labels__u_wrong-shape', JSON.stringify({not:'an array'}));
      LL.setNamespace('wrong-shape');
      await assert.rejects(() => LL.init(), /LibraryReadError|not an array/, 'a stored object instead of an array must also fail closed');

      LL.reset();
      LL.setNamespace('getitem-throws');
      // As above (PART 3): swap the whole localStorage reference rather
      // than patching one method, since jsdom's real Storage instances
      // don't honour a plain instance-property override.
      const realStorage2 = sb.localStorage;
      Object.defineProperty(sb, 'localStorage', { configurable: true, value: {
        getItem(k){
          if(k === 'clpeasy_labels__u_getitem-throws') throw new Error('simulated storage access failure');
          return realStorage2.getItem(k);
        },
        setItem(k, v){ return realStorage2.setItem(k, v); },
        removeItem(k){ return realStorage2.removeItem(k); },
      }});
      await assert.rejects(() => LL.init(), /LibraryReadError|could not be accessed/, 'getItem() itself throwing must fail closed rather than being swallowed into an empty collection');
      Object.defineProperty(sb, 'localStorage', { configurable: true, value: realStorage2 });

      console.log('PART 6b passed: readRaw() distinguishes a genuinely missing key / explicit [] (valid empty collections) from malformed JSON, wrong-shaped data, and a throwing getItem (all fail closed, never silently emptied, original value never overwritten)');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 7 -- Web Locks used as the primary mechanism when available
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      let lockRequested = null;
      sb.navigator.locks = { request(name, fn){ lockRequested = name; return fn(); } };
      sb.localStorage.setItem('clpeasy_labels__u_user-4', JSON.stringify([legacyCircle52()]));
      sb.LabelLibrary.setNamespace('user-4');
      await sb.LabelLibrary.init();
      assert(lockRequested && lockRequested.indexOf('user-4') !== -1, 'when navigator.locks is available, it must be used as the primary coordination mechanism');
      console.log('PART 7 passed: Web Locks API used as primary mechanism when available');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 7b -- review point 4: a storage-event reconciliation for a
    // namespace this tab has since left must never adopt into the new
    // namespace's cache or fire onChange with the stale data. An ordinary
    // same-namespace reconciliation must still work.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;

      const aliceKey = 'clpeasy_labels__u_alice-race';
      const bobKey = 'clpeasy_labels__u_bob-race';
      sb.localStorage.setItem(aliceKey, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('alice-race');
      await LL.init(); // establishes a genuine, already-migrated cache for alice

      const onChangeCalls = [];
      LL.onChange(function(arr){ onChangeCalls.push(arr); });

      // Start reconciling an incoming storage event for ALICE's key...
      const pending = LL._internal.reconcileFromStorageEvent(aliceKey);
      // ...but switch to Bob before that reconciliation's poll resolves.
      // JS is single-threaded and async functions run synchronously up to
      // their first await/return-through-a-promise, so this switch is
      // guaranteed to land before reconcileFromStorageEvent's internal
      // pollUntilAllValid().then() callback ever runs.
      LL.setNamespace('bob-race');
      sb.localStorage.setItem(bobKey, JSON.stringify([legacyRect63()]));

      await pending;

      assert.strictEqual(onChangeCalls.length, 0, "Alice's stale reconciliation must never fire onChange after switching to Bob");
      assert.throws(() => LL.getSaved(), /before init\(\) completed/, "switching to bob-race must have cleared the cache, and Alice's stale reconciliation must never have re-populated it");

      const bobResult = await LL.init();
      assert.strictEqual(bobResult[0].scentName, 'Cedar', "bob's own data must load correctly, uncontaminated by alice's race");

      // Sanity check: an ordinary (non-racing) reconciliation for the
      // CURRENT namespace still works -- the guard must not break the
      // normal case.
      sb.localStorage.setItem(bobKey, JSON.stringify(bobResult));
      await LL._internal.reconcileFromStorageEvent(bobKey);
      assert.strictEqual(onChangeCalls.length, 1, 'a normal same-namespace reconciliation must still fire onChange once every guard condition is satisfied');

      console.log("PART 7b passed: a storage-event reconciliation for a namespace this tab has since left never adopts into the new namespace's cache or fires onChange; an ordinary same-namespace reconciliation still works");
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 8 -- editing preserves id; duplication creates a distinct id;
    // delete doesn't change other ids; reordering doesn't change identity
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_user-5', JSON.stringify([legacyCircle52(), customRect57x99(), legacyRect63()]));
      LL.setNamespace('user-5');
      let arr = await LL.init();
      const [idA, idB, idC] = arr.map(e=>e.id);

      // Editing: change a field on record B, persist, id must be unchanged.
      const idxB = LL.findIndexById(arr, idB);
      arr[idxB] = Object.assign({}, arr[idxB], { scentName: 'Fireside Amber (renamed)' });
      LL._internal.persistSaved(arr);
      let reread = LL.getSaved();
      assert.strictEqual(LL.findById(reread, idB).scentName, 'Fireside Amber (renamed)');
      assert.strictEqual(LL.findById(reread, idB).id, idB, 'editing a record must preserve its id');

      // Duplication: clone record C's content with a NEW id.
      const source = LL.findById(reread, idC);
      const clone = Object.assign({}, source, { id: LL.generateId(), scentName: source.scentName + ' (Copy)' });
      assert.notStrictEqual(clone.id, idC, 'a duplicate must receive a distinct id, never the source id');
      reread.push(clone);
      LL._internal.persistSaved(reread);
      reread = LL.getSaved();
      assert.strictEqual(reread.length, 4);
      assert(LL.findById(reread, idC), 'the original record C must still exist, untouched, after duplication');

      // Delete: remove record A (the earliest); B and the duplicate's ids must be unaffected.
      let afterDelete = reread.filter(e => e.id !== idA);
      LL._internal.persistSaved(afterDelete);
      afterDelete = LL.getSaved();
      assert.strictEqual(LL.findById(afterDelete, idA), null, 'deleted record must no longer resolve');
      assert(LL.findById(afterDelete, idB), "an unrelated record's id must survive deleting an earlier record");
      assert.strictEqual(LL.findById(afterDelete, idB).id, idB);

      // Reorder: shuffle the remaining array's order and persist; every id must be unchanged and still resolve.
      const reordered = afterDelete.slice().reverse();
      LL._internal.persistSaved(reordered);
      const afterReorder = LL.getSaved();
      assert(LL.findById(afterReorder, idB), 'reordering must never change an existing record\'s identity');
      assert(LL.findById(afterReorder, idC));

      console.log('PART 8 passed: edit preserves id, duplicate gets a distinct id, delete leaves other ids untouched, reordering does not change identity');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 9 -- unknown/malformed id handling, and the legacy ?open=
    // index-migration shim
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_user-6', JSON.stringify([legacyCircle52(), customRect57x99()]));
      LL.setNamespace('user-6');
      const arr = await LL.init();

      assert.strictEqual(LL.findById(arr, 'not-a-real-id'), null, 'a malformed id must never resolve to any record');
      assert.strictEqual(LL.findById(arr, '0'), null, 'a bare numeric string must NEVER be treated as an array index by findById');
      assert.strictEqual(LL.findById(arr, ''), null);
      assert.strictEqual(LL.findById(arr, null), null);
      assert.strictEqual(LL.findById(arr, undefined), null);

      // Legacy ?open=<index> shim -- resolves against an ALREADY-migrated
      // array (so the record it returns always already has a valid id);
      // this is the ONLY place index-based lookup is still legitimate.
      const byIndex = LL.resolveLegacyIndex(arr, '1');
      assert.strictEqual(byIndex.scentName, 'Fireside Amber');
      assert(LL.isValidId(byIndex.id), 'the record resolved via the legacy index shim must already carry a valid id');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '99'), null, 'an out-of-range legacy index must fail closed, never wrap/clamp to another record');
      assert.strictEqual(LL.resolveLegacyIndex(arr, 'not-a-number'), null);

      console.log('PART 9 passed: unknown/malformed ids never resolve; legacy ?open= index shim only ever returns an already-id-bearing record or null');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 10 -- namespace isolation: no cross-namespace reads/writes,
    // switching namespace clears cache
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_alice', JSON.stringify([legacyCircle52()]));
      sb.localStorage.setItem('clpeasy_labels__u_guest', JSON.stringify([legacyRect63()]));

      LL.setNamespace('alice');
      const aliceArr = await LL.init();
      assert.strictEqual(aliceArr[0].scentName, 'Vanilla Bean');

      LL.setNamespace('guest'); // simulates sign-out
      assert.throws(() => LL.getSaved(), /before init\(\) completed/, 'switching namespace must clear the cache -- must not silently keep serving the previous namespace\'s data');
      const guestArr = await LL.init();
      assert.strictEqual(guestArr[0].scentName, 'Cedar', 'must now read the guest namespace, not a leftover of alice\'s data');

      // Writing under 'guest' must never touch alice's key.
      LL._internal.persistSaved(guestArr);
      const aliceRawStillIntact = JSON.parse(sb.localStorage.getItem('clpeasy_labels__u_alice'));
      assert.strictEqual(aliceRawStillIntact.length, 1);
      assert.strictEqual(aliceRawStillIntact[0].id, aliceArr[0].id, "a write scoped to 'guest' must never alter alice's stored key");

      console.log('PART 10 passed: namespace isolation -- no cross-namespace reads or writes, switching namespace clears cache');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 11 -- review point 5: getSaved()/init() return genuine deep
    // clones. Mutating nested content on a returned value must never
    // reach the cache or storage, and a snapshot taken before a later
    // edit is provably unaffected by that edit (documents
    // sheetItems[].labelData, in Checkpoint C, as an intentional
    // detached snapshot, not a live reference).
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const withNested = Object.assign({}, legacyCircle52(), {
        hazards: ['H315', 'H319'],
        pictograms: { selected: ['GHS07'], meta: { source: 'auto' } },
      });
      sb.localStorage.setItem('clpeasy_labels__u_user-nested', JSON.stringify([withNested]));
      LL.setNamespace('user-nested');
      const initResult = await LL.init();

      initResult[0].hazards.push('H411');
      initResult[0].pictograms.meta.source = 'MUTATED';

      const saved1 = LL.getSaved();
      assert.deepStrictEqual(Array.from(saved1[0].hazards), ['H315', 'H319'], 'mutating a nested array on what init() returned must never affect the cache');
      assert.strictEqual(saved1[0].pictograms.meta.source, 'auto', 'mutating a nested object on what init() returned must never affect the cache');

      saved1[0].hazards.push('SHOULD_NOT_PERSIST');
      const saved2 = LL.getSaved();
      assert.deepStrictEqual(Array.from(saved2[0].hazards), ['H315', 'H319'], 'mutating a nested array on a getSaved() result must never affect the cache or a later getSaved() call');

      const stillRaw = JSON.parse(sb.localStorage.getItem('clpeasy_labels__u_user-nested'));
      assert.deepStrictEqual(Array.from(stillRaw[0].hazards), ['H315', 'H319'], 'localStorage must remain unchanged until persistSaved() is explicitly called');

      // Composer-style scenario: a "sheetItems[].labelData" snapshot taken
      // via getSaved() must survive a LATER library edit to that record.
      const snapshotForSheet = LL.getSaved()[0];
      const idToEdit = snapshotForSheet.id;
      const editable = LL.getSaved();
      const idx = LL.findIndexById(editable, idToEdit);
      editable[idx] = Object.assign({}, editable[idx], { scentName: 'Renamed After Snapshot', hazards: [] });
      LL._internal.persistSaved(editable);

      assert.strictEqual(snapshotForSheet.scentName, 'Vanilla Bean', "a Composer-style snapshot taken via getSaved() must be unaffected by a LATER library edit to the same record -- it is an intentional detached snapshot, not a live reference");
      assert.deepStrictEqual(Array.from(snapshotForSheet.hazards), ['H315', 'H319']);

      console.log('PART 11 passed: getSaved()/init() return genuine deep clones -- nested mutation never reaches the cache or storage, and a snapshot taken before an edit is provably unaffected by that later edit');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 12 -- review point 9: canonicalize() recursively sorts nested
    // object keys, preserves array order, handles null/primitives
    // consistently, and fails closed on cyclic references and
    // non-JSON-compatible values.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const canonicalize = LL._internal.canonicalize;

      const recordKeyOrderA = { scentName:'Vanilla Bean', productType:'Candle', shape:'circle', size:'52', meta:{b:2,a:1} };
      const recordKeyOrderB = { size:'52', shape:'circle', meta:{a:1,b:2}, productType:'Candle', scentName:'Vanilla Bean' };
      assert.strictEqual(canonicalize(recordKeyOrderA), canonicalize(recordKeyOrderB), 'two records that are semantically identical but differ only in top-level AND nested key insertion order must canonicalize identically');

      // Array order IS semantically meaningful and must be preserved.
      const withArrayOrderA = { scentName:'X', tags:['a','b','c'] };
      const withArrayOrderB = { scentName:'X', tags:['c','b','a'] };
      assert.notStrictEqual(canonicalize(withArrayOrderA), canonicalize(withArrayOrderB), 'array element order must be preserved, not treated as unordered');

      const withNull = { scentName:'X', note: null };
      assert.strictEqual(canonicalize(withNull), canonicalize({ note: null, scentName:'X' }), 'null must be handled consistently regardless of key order');

      const cyclic = { scentName:'X' };
      cyclic.self = cyclic;
      assert.throws(() => canonicalize(cyclic), /cyclic/i, 'a cyclic reference must fail closed with a recognisable error, never hang or corrupt output');

      const withFunction = { scentName:'X', handler: function(){} };
      assert.throws(() => canonicalize(withFunction), /JSON-compatible/i, 'a non-JSON-compatible value type must fail closed with a recognisable error');

      // Proves the fix end-to-end: two legacy records differing only in
      // nested key order must migrate to the SAME deterministic id.
      const idA = await LL._internal.deterministicId('ns-canon-test', recordKeyOrderA, 1, 0);
      const idB = await LL._internal.deterministicId('ns-canon-test', recordKeyOrderB, 1, 0);
      assert.strictEqual(idA, idB, 'nested key order must never affect the resulting deterministic migration id for semantically identical records');

      console.log('PART 12 passed: canonicalize() recursively sorts nested object keys (order-independent), preserves array order (order-meaningful), handles null/primitives consistently, and fails closed on cyclic references and non-JSON-compatible values');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 13 -- review point 11: _internal is a genuine test-only
    // surface, absent entirely unless the loading script has explicitly
    // opted in. Production pages (which never set that flag) can never
    // depend on it, even by accident, and the full public API works
    // completely normally without it.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadIntoProductionMode(makeWindow());
      assert.strictEqual(sb.LabelLibrary._internal, undefined, '_internal must not exist at all when the loading page has not explicitly opted into the test surface');

      sb.localStorage.setItem('clpeasy_labels__u_prod-check', JSON.stringify([legacyCircle52()]));
      sb.LabelLibrary.setNamespace('prod-check');
      const arr = await sb.LabelLibrary.init();
      assert.strictEqual(arr.length, 1);
      assert(sb.LabelLibrary.isValidId(arr[0].id));

      console.log('PART 13 passed: _internal is a genuine test-only surface -- absent entirely unless the loading script opts in, and the full public API works normally without it');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 14 -- review point 1 (surgical fixes round): a namespace
    // change WHILE init() is still awaiting must not merely skip cache
    // adoption -- it must REJECT the stale call outright with
    // StaleLibraryInitializationError. Page code still holding that
    // original promise must never be able to render or act on the old
    // namespace's label data after the app has already switched users.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_ns-a-stale', JSON.stringify([legacyCircle52()]));
      sb.localStorage.setItem('clpeasy_labels__u_ns-b-stale', JSON.stringify([legacyRect63()]));

      LL.setNamespace('ns-a-stale');
      const pendingA = LL.init(); // started for A, deliberately not yet awaited
      // Switch away from A before A's init() settles. JS is single-threaded
      // and async functions run synchronously up to their first real
      // await, so this switch is guaranteed to land before init()'s own
      // await chain (the SHA-256 digest calls) resolves.
      LL.setNamespace('ns-b-stale');

      await assert.rejects(() => pendingA, /StaleLibraryInitializationError/, "a namespace switch mid-init() must cause the STALE call to REJECT -- it must never resolve with the old namespace's label data");
      assert.throws(() => LL.getSaved(), /before init\(\) completed/, "B's cache must remain empty until B's OWN init() -- A's stale (and now-rejected) init() must never have populated it");

      const resultB = await LL.init();
      assert.strictEqual(resultB.length, 1, "B's own init() must return only B's own labels");
      assert.strictEqual(resultB[0].scentName, 'Cedar', "B's own init() must return B's own data, uncontaminated by A's earlier stale, now-rejected completion");

      console.log("PART 14 passed: a namespace switch while init() is still awaiting causes that stale call to REJECT with StaleLibraryInitializationError -- it never returns the old namespace's label data, and the new namespace's cache stays empty until its own init() runs");
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 15 -- review point 2 (final corrections round): a malformed
    // legacy entry (not a real object -- null, a primitive, an array)
    // must be rejected outright, never silently coerced into a
    // fabricated id-bearing object.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;

      const malformedFirstEntries = [null, 'not an object', 42, ['nested', 'array']];
      for(let i = 0; i < malformedFirstEntries.length; i++){
        LL.reset();
        const ns = 'malformed-entry-' + i;
        sb.localStorage.setItem('clpeasy_labels__u_' + ns, JSON.stringify([malformedFirstEntries[i], legacyCircle52()]));
        LL.setNamespace(ns);
        await assert.rejects(() => LL.init(), /LibraryMigrationError|could not be safely completed/, `a malformed entry (${JSON.stringify(malformedFirstEntries[i])}) must fail migration closed, never be turned into a fabricated {id:...} object`);
      }

      console.log('PART 15 passed: malformed legacy entries (null, a primitive, an array) are rejected outright -- migration never fabricates an id-bearing object out of one');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 16 -- review point 3 (final corrections round): a record that
    // carries a PRESENT but malformed (non-empty) id -- not simply
    // absent -- must be rejected, not silently repaired/overwritten with
    // a new one. A genuinely absent (or null) id remains the ordinary
    // legacy case and must still migrate normally.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;

      const badIds = ['not-a-real-uuid', 12345, ''];
      for(let i = 0; i < badIds.length; i++){
        LL.reset();
        const ns = 'malformed-id-' + i;
        const badRecord = Object.assign({id: badIds[i]}, legacyCircle52());
        sb.localStorage.setItem('clpeasy_labels__u_' + ns, JSON.stringify([badRecord]));
        LL.setNamespace(ns);
        await assert.rejects(() => LL.init(), /LibraryMigrationError|could not be safely completed/, `a record with a present but malformed id (${JSON.stringify(badIds[i])}) must fail migration closed, never be silently repaired`);
      }

      LL.reset();
      sb.localStorage.setItem('clpeasy_labels__u_absent-id-ok', JSON.stringify([legacyCircle52(), Object.assign({id: null}, legacyRect63())]));
      LL.setNamespace('absent-id-ok');
      const migrated = await LL.init();
      assert.strictEqual(migrated.length, 2, 'a genuinely absent or explicitly null id is the ordinary legacy case and must still migrate normally');
      migrated.forEach(e => assert(LL.isValidId(e.id)));

      console.log('PART 16 passed: a present-but-malformed existing id fails migration closed; a genuinely absent (or null) id still migrates normally');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 17 -- review point 4 (final corrections round): resolveLegacyIndex()
    // must validate the COMPLETE value, not use permissive parseInt().
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_legacy-idx', JSON.stringify([legacyCircle52(), customRect57x99(), legacyRect63()]));
      LL.setNamespace('legacy-idx');
      const arr = await LL.init();

      assert.strictEqual(LL.resolveLegacyIndex(arr, '1').scentName, 'Fireside Amber', 'a clean integer string must still resolve normally');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '5abc'), null, 'a garbage-suffixed value must never be truncated down to a valid index by parseInt-style parsing');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '  1'), null, 'leading whitespace must not be silently tolerated');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '1  '), null, 'trailing whitespace must not be silently tolerated');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '1.0'), null, 'a decimal value must not be truncated down to an integer index');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '+1'), null, 'a leading sign must not be silently tolerated');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '-1'), null, 'a negative value must never wrap to the end of the array');
      assert.strictEqual(LL.resolveLegacyIndex(arr, '0x1'), null, 'a hex-prefixed value must never be silently accepted');
      assert.strictEqual(LL.resolveLegacyIndex(arr, ''), null);
      assert.strictEqual(LL.resolveLegacyIndex(arr, null), null);
      assert.strictEqual(LL.resolveLegacyIndex(arr, undefined), null);
      assert.strictEqual(LL.resolveLegacyIndex(arr, '01').scentName, 'Fireside Amber', 'a clean, if zero-padded, in-range integer string is still unambiguous and may resolve');

      console.log('PART 17 passed: resolveLegacyIndex() validates the COMPLETE value -- garbage suffixes, whitespace, decimals, signs, and hex-like values are all rejected, never permissively parsed');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 18 -- review point 5 (final corrections round): consecutive
    // generateId() calls made before either result is persisted must
    // never return the same id.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      sb.localStorage.setItem('clpeasy_labels__u_gen-consec', JSON.stringify([legacyCircle52()]));
      LL.setNamespace('gen-consec');
      await LL.init();

      const uuidX = '22222222-2222-4222-8222-222222222222';
      const uuidY = '33333333-3333-4333-8333-333333333333';
      // Simulate the underlying randomness handing back uuidX twice in a
      // row (once for each call) before finally producing something
      // distinct -- without the fix, the second generateId() call would
      // happily accept the repeat immediately, since _cache alone hasn't
      // changed yet.
      const queue = [uuidX, uuidX, uuidY];
      let qi = 0;
      sb.crypto.randomUUID = () => queue[Math.min(qi++, queue.length - 1)];

      const id1 = LL.generateId();
      const id2 = LL.generateId(); // neither id1 nor id2 has been persisted yet
      assert.strictEqual(id1, uuidX);
      assert.notStrictEqual(id2, id1, 'two generateId() calls made before either result is persisted must never return the same id, even if the underlying randomness repeats');
      assert.strictEqual(id2, uuidY);

      console.log('PART 18 passed: consecutive generateId() calls before persist never collide, even when the underlying randomness itself repeats a value');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 19 -- review point 6 (final corrections round): checkCompatibility()
    // requires POSITIVE dimensions (not merely finite), a supported label
    // shape and template kind, and internally consistent circle/square
    // geometry on both sides.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LR = sb.LabelRenderer;
      const eu30009 = { kind:'registry', shape:'rectangle', widthMm:99.1, heightMm:57.3 };

      const zeroWidth = LR.checkCompatibility({shape:'rectangle', widthMm: 0, heightMm: 40}, eu30009);
      assert.strictEqual(zeroWidth.matchType, 'invalid-spec', 'a zero dimension must fail closed, never be treated as merely "finite and fine"');

      const negativeHeight = LR.checkCompatibility({shape:'rectangle', widthMm: 50, heightMm: -10}, eu30009);
      assert.strictEqual(negativeHeight.matchType, 'invalid-spec', 'a negative dimension must fail closed');

      const unsupportedLabelShape = LR.checkCompatibility({shape:'hexagon', widthMm: 50, heightMm: 50}, eu30009);
      assert.strictEqual(unsupportedLabelShape.matchType, 'invalid-spec', 'an unrecognised label shape must fail closed, never fall through into a geometry comparison it does not understand');

      const unsupportedTemplateKind = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), { kind:'mystery-kind', shape:'circle', widthMm:52, heightMm:52 });
      assert.strictEqual(unsupportedTemplateKind.matchType, 'invalid-spec', 'an unrecognised template kind must fail closed');

      const unsupportedTemplateShape = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), { kind:'registry', shape:'hexagon', widthMm:52, heightMm:52 });
      assert.strictEqual(unsupportedTemplateShape.matchType, 'invalid-spec', 'an unrecognised template shape must fail closed');

      // Internal consistency: a "circle" whose own width and height
      // disagree isn't really a circle.
      const inconsistentCircleLabel = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:53, diameterMm:52}, { kind:'registry', shape:'circle', widthMm:52, heightMm:52 });
      assert.strictEqual(inconsistentCircleLabel.matchType, 'invalid-spec', "a label whose own circle width/height disagree must fail closed");

      const inconsistentCircleTemplate = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), { kind:'registry', shape:'circle', widthMm:52, heightMm:53 });
      assert.strictEqual(inconsistentCircleTemplate.matchType, 'invalid-spec', "a circle template whose own width/height disagree must fail closed");

      const inconsistentSquareLabel = LR.checkCompatibility({shape:'square', widthMm:40, heightMm:41}, { kind:'registry', shape:'square', widthMm:40, heightMm:40 });
      assert.strictEqual(inconsistentSquareLabel.matchType, 'invalid-spec', "a label whose own square width/height disagree must fail closed");

      const inconsistentSquareTemplate = LR.checkCompatibility(LR.getPhysicalSpec({shape:'square', size:'40'}), { kind:'registry', shape:'square', widthMm:40, heightMm:41 });
      assert.strictEqual(inconsistentSquareTemplate.matchType, 'invalid-spec', "a square template whose own width/height disagree must fail closed");

      // A genuinely valid, self-consistent case must still work.
      const stillValid = LR.checkCompatibility(LR.getPhysicalSpec(legacyCircle52()), { kind:'registry', shape:'circle', widthMm:52, heightMm:52 });
      assert.strictEqual(stillValid.compatible, true);
      assert.strictEqual(stillValid.matchType, 'exact');

      console.log('PART 19 passed: checkCompatibility() requires positive dimensions, a supported label shape and template kind, and internally consistent circle/square geometry on both sides');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 20 -- review point 7 (final corrections round): if the stored
    // collection changes underneath an in-flight migration (another write
    // lands on the same key while this migration's hash computation is
    // still awaiting), the stale derived result must never blindly
    // overwrite what's there now -- migration must be recomputed against
    // the fresh snapshot instead.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_overwrite-race';
      const raw1 = [legacyCircle52()]; // what init() will initially read
      const raw2 = [legacyCircle52(), legacyRect63()]; // what "lands" mid-flight, from elsewhere in this same tab

      sb.localStorage.setItem(key, JSON.stringify(raw1));
      LL.setNamespace('overwrite-race');

      const realDigest = sb.crypto.subtle.digest.bind(sb.crypto.subtle);
      let injected = false;
      sb.crypto.subtle.digest = async function(algo, data){
        if(!injected){
          injected = true;
          // Simulate a second record landing directly in storage WHILE
          // this migration's first hash computation is still in flight --
          // e.g. a direct persistSaved() call elsewhere in the same tab.
          sb.localStorage.setItem(key, JSON.stringify(raw2));
        }
        return realDigest(algo, data);
      };

      const result = await LL.init();
      sb.crypto.subtle.digest = realDigest;

      assert.strictEqual(result.length, 2, "the record that landed mid-migration must never be lost -- migration must have been recomputed against the fresh (2-record) snapshot, not blindly written from the stale (1-record) one");
      result.forEach(e => assert(LL.isValidId(e.id)));
      assert.strictEqual(new Set(result.map(e=>e.id)).size, 2, 'both records must have distinct ids');

      const finalRaw = JSON.parse(sb.localStorage.getItem(key));
      assert.strictEqual(finalRaw.length, 2, "what's actually persisted must also reflect the fresh snapshot, not the stale one");

      console.log('PART 20 passed: a collection change landing mid-migration is never overwritten by a stale derived result -- migration recomputes against the fresh snapshot instead');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 21 -- review point 8 (final corrections round): a storage
    // event whose storageArea does not reference this page's own
    // localStorage must be ignored outright, never treated as a same-key
    // localStorage change just because the key string matches. When
    // storageArea information isn't available at all, the existing
    // key-based handling still applies.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_storagearea-ns';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('storagearea-ns');
      await LL.init();

      const onChangeCalls = [];
      LL.onChange(v => onChangeCalls.push(v));

      await LL._internal.handleStorageEvent({ key, storageArea: {} });
      assert.strictEqual(onChangeCalls.length, 0, "a storage event whose storageArea is not this page's own localStorage must be ignored entirely, even though the key string matches");

      await LL._internal.handleStorageEvent({ key, storageArea: sb.localStorage });
      assert.strictEqual(onChangeCalls.length, 1, 'an event whose storageArea correctly matches localStorage must still be processed');

      await LL._internal.handleStorageEvent({ key });
      assert.strictEqual(onChangeCalls.length, 2, 'an event with no storageArea information at all must fall back to the existing key-based handling');

      console.log('PART 21 passed: a storage event from a different storageArea is ignored outright; an event with no storageArea information falls back to key-based handling');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 22 -- review point 2 (surgical fixes round): checkCompatibility()
    // must validate that a circle label's diameterMm agrees with its own
    // widthMm/heightMm, not just that widthMm~=heightMm. A malformed
    // circle spec whose diameter disagrees with its stored physical
    // width/height must never be allowed to match a template through the
    // diameter field alone.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LR = sb.LabelRenderer;
      const eu30009Circle60 = { kind:'registry', shape:'circle', widthMm:60, heightMm:60 };
      const eu30009Circle52 = { kind:'registry', shape:'circle', widthMm:52, heightMm:52 };

      // A 52x52 label whose diameterMm claims 60 must NEVER match a 60mm
      // template -- the label's own width/height (52x52) are what it
      // actually is; a mismatched diameter field means the spec itself is
      // internally inconsistent and must fail closed, not "helpfully"
      // match on the diameter alone.
      const inconsistentVs60 = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:52, diameterMm:60}, eu30009Circle60);
      assert.strictEqual(inconsistentVs60.compatible, false, "a circle label whose diameterMm disagrees with its own widthMm/heightMm must never be reported compatible");
      assert.strictEqual(inconsistentVs60.matchType, 'invalid-spec', "diameter/width/height disagreement on the LABEL side must fail closed as invalid-spec, not incompatible");

      // The same malformed label must not somehow match its "own" 52mm
      // template either -- the inconsistency is caught before templateSpec
      // is even considered.
      const inconsistentVs52 = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:52, diameterMm:60}, eu30009Circle52);
      assert.strictEqual(inconsistentVs52.compatible, false, "an internally-inconsistent circle label must fail closed regardless of which template it's checked against");
      assert.strictEqual(inconsistentVs52.matchType, 'invalid-spec');

      // A genuinely consistent 52x52 / diameter 52 label DOES match a 52mm
      // template exactly -- the new check must not be so strict it blocks
      // legitimate, self-consistent circle specs.
      const consistent52 = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:52, diameterMm:52}, eu30009Circle52);
      assert.strictEqual(consistent52.compatible, true, "a self-consistent circle label (width==height==diameter) must still match its template exactly");
      assert.strictEqual(consistent52.matchType, 'exact');

      // And it must correctly report incompatible (not invalid-spec) against
      // a DIFFERENT, but still self-consistent, template size.
      const consistentButWrongSize = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:52, diameterMm:52}, eu30009Circle60);
      assert.strictEqual(consistentButWrongSize.compatible, false);
      assert.strictEqual(consistentButWrongSize.matchType, 'incompatible', "a self-consistent circle label that simply doesn't match the template size must be reported incompatible, not invalid-spec");

      // A missing diameterMm on an otherwise-plausible circle label must
      // also fail closed (already covered for `undefined` in PART 2, this
      // covers the field being entirely absent).
      const missingDiameter = LR.checkCompatibility({shape:'circle', widthMm:52, heightMm:52}, eu30009Circle52);
      assert.strictEqual(missingDiameter.compatible, false);
      assert.strictEqual(missingDiameter.matchType, 'invalid-spec');

      console.log('PART 22 passed: checkCompatibility() validates that a circle label\'s diameterMm agrees with its own widthMm/heightMm before any template comparison -- no malformed circle can match a template through diameter alone');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 23 -- review point 3 (surgical fixes round): a same-namespace
    // storage-event cache refresh must never release a still-unpersisted
    // generateId() reservation. persistSaved() must reconcile reservations
    // against exactly what it actually persisted, leaving unrelated
    // pending reservations from other in-flight generateId() calls intact.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_pending-reservation';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('pending-reservation');
      await LL.init();

      const uuidA = '55555555-5555-4555-8555-555555555555';
      const uuidB = '66666666-6666-4666-8666-666666666666';
      const uuidC = '77777777-7777-4777-8777-777777777777';

      sb.crypto.randomUUID = () => uuidA;
      const idA = LL.generateId();
      sb.crypto.randomUUID = () => uuidB;
      const idB = LL.generateId();
      assert.deepStrictEqual(new Set(LL._internal.debugPendingIds()), new Set([idA, idB]), 'setup: both generated ids must be tracked as pending before either is persisted');

      // A same-namespace storage-event cache refresh (e.g. another tab
      // wrote something unrelated) must NEVER release these still-live,
      // still-unpersisted reservations.
      await LL._internal.handleStorageEvent({ key, storageArea: sb.localStorage });
      assert.deepStrictEqual(new Set(LL._internal.debugPendingIds()), new Set([idA, idB]), 'a same-namespace storage-event cache refresh must never release a still-unpersisted reservation');

      // generateId() must still refuse to hand out idA again after that
      // refresh, even if the underlying randomness would otherwise repeat it.
      const queue = [idA, uuidC];
      let qi = 0;
      sb.crypto.randomUUID = () => queue[Math.min(qi++, queue.length - 1)];
      const idNext = LL.generateId();
      assert.notStrictEqual(idNext, idA, 'generateId() must still refuse a reserved-but-unpersisted id after a storage-event cache refresh');
      assert.strictEqual(idNext, uuidC);

      // Now actually persist a record using idA -- persistSaved() must
      // release exactly that reservation, and no other.
      const toSave = LL.getSaved();
      toSave.push(Object.assign({}, legacyRect63(), { id: idA }));
      LL._internal.persistSaved(toSave);

      const pendingAfter = new Set(LL._internal.debugPendingIds());
      assert.strictEqual(pendingAfter.has(idA), false, "persistSaved() must release the reservation for an id it actually persisted");
      assert.strictEqual(pendingAfter.has(idB), true, "persistSaved() must leave an UNRELATED, still-unpersisted reservation (idB) untouched");
      assert.strictEqual(pendingAfter.has(idNext), true, "persistSaved() must leave the unrelated idNext reservation untouched too");

      console.log('PART 23 passed: a storage-event cache refresh never releases an unpersisted generateId() reservation; persistSaved() releases exactly the reservations it actually committed, leaving unrelated pending reservations intact');
    }

    // ══════════════════════════════════════════════════════════════════
    // Checkpoint B0 -- LabelLibrary.mutate(), the shared coordinated
    // mutation path every real page write must use instead of the old
    // whole-array-snapshot persistSaved(). PARTs 24-32 below.
    // ══════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════
    // PART 24 -- two tabs editing DIFFERENT labels, genuinely racing
    // against one real shared storage backend with no Web Lock available
    // (the honest no-Web-Locks fallback path). Neither edit may be lost:
    // mutate()'s compare-before-write + bounded retry must detect the
    // other tab's write and recompute its own proposal against the fresh
    // (already-containing-the-other-edit) snapshot, rather than either
    // silently overwriting the other.
    // ══════════════════════════════════════════════════════════════════
    {
      const sbA = loadInto(makeWindow());
      const sbB = loadInto(makeWindow());
      const sharedStore = (function(){
        const map = new Map();
        return {
          getItem(k){ return map.has(k) ? map.get(k) : null; },
          setItem(k, v){ map.set(k, String(v)); },
          removeItem(k){ map.delete(k); },
        };
      })();
      Object.defineProperty(sbA, 'localStorage', { value: sharedStore, configurable: true });
      Object.defineProperty(sbB, 'localStorage', { value: sharedStore, configurable: true });

      const namespace = 'mutate-two-tabs';
      const key = 'clpeasy_labels__u_' + namespace;
      sharedStore.setItem(key, JSON.stringify([legacyCircle52(), legacyRect63()]));
      sbA.LabelLibrary.setNamespace(namespace);
      sbB.LabelLibrary.setNamespace(namespace);
      const seed = await sbA.LabelLibrary.init();
      sbB.LabelLibrary.setNamespace(namespace); // B picks up the same already-migrated store
      await sbB.LabelLibrary.init();
      const idX = seed.find(e => e.scentName === 'Vanilla Bean').id; // A will edit this one
      const idY = seed.find(e => e.scentName === 'Cedar').id;        // B will edit this one

      // NO_CHANGE is a per-window sentinel object (each jsdom window has
      // its own module instance) -- a mutator handed to sbX.mutate() must
      // reference sbX's OWN NO_CHANGE, never a different window's.
      const editMutator = (sb, id, patch) => (current) => {
        const idx = current.findIndex(e => e.id === id);
        if(idx === -1) return sb.LabelLibrary.NO_CHANGE;
        const next = current.slice();
        next[idx] = Object.assign({}, next[idx], patch);
        return next;
      };

      // Both kicked off together (Promise.all), not sequentially awaited --
      // each runs synchronously up to its first real await (inside
      // mutate(), at `await mutator(...)`), so both genuinely interleave
      // against the same shared store with no lock serialising them.
      const [outcomeA, outcomeB] = await Promise.all([
        sbA.LabelLibrary.mutate(editMutator(sbA, idX, { scentName: 'Vanilla Bean (edited by A)' })),
        sbB.LabelLibrary.mutate(editMutator(sbB, idY, { scentName: 'Cedar (edited by B)' })),
      ]);

      assert.strictEqual(outcomeA.committed, true);
      assert.strictEqual(outcomeB.committed, true);

      const finalRaw = JSON.parse(sharedStore.getItem(key));
      const finalX = finalRaw.find(e => e.id === idX);
      const finalY = finalRaw.find(e => e.id === idY);
      assert.strictEqual(finalX.scentName, 'Vanilla Bean (edited by A)', "tab A's edit must survive a genuine race against tab B, never silently overwritten");
      assert.strictEqual(finalY.scentName, 'Cedar (edited by B)', "tab B's edit must survive a genuine race against tab A, never silently overwritten");
      assert.strictEqual(finalRaw.length, 2, 'no record may be duplicated or dropped by the race');

      console.log('PART 24 passed: two tabs editing different labels under a genuine no-Web-Locks race both survive -- mutate() detects the other tab\'s write via compare-before-write and recomputes against the fresh snapshot rather than losing either change');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 25 -- delete racing with edit of the SAME record. There is no
    // way to "merge" a delete and an edit of the same record, so the only
    // safe, well-defined outcome is: the record ends up deleted (delete
    // wins), and whichever mutate() call resolves its own proposal
    // against a snapshot that already reflects the deletion must treat
    // "the record is gone" as NO_CHANGE, never resurrect it or throw.
    // ══════════════════════════════════════════════════════════════════
    {
      const sbA = loadInto(makeWindow());
      const sbB = loadInto(makeWindow());
      const sharedStore = (function(){
        const map = new Map();
        return {
          getItem(k){ return map.has(k) ? map.get(k) : null; },
          setItem(k, v){ map.set(k, String(v)); },
          removeItem(k){ map.delete(k); },
        };
      })();
      Object.defineProperty(sbA, 'localStorage', { value: sharedStore, configurable: true });
      Object.defineProperty(sbB, 'localStorage', { value: sharedStore, configurable: true });

      const namespace = 'mutate-delete-vs-edit';
      const key = 'clpeasy_labels__u_' + namespace;
      sharedStore.setItem(key, JSON.stringify([legacyCircle52(), legacyRect63()]));
      sbA.LabelLibrary.setNamespace(namespace);
      const seed = await sbA.LabelLibrary.init();
      sbB.LabelLibrary.setNamespace(namespace);
      await sbB.LabelLibrary.init();
      const targetId = seed.find(e => e.scentName === 'Vanilla Bean').id;

      const deleteMutator = (current) => current.filter(e => e.id !== targetId);
      const editMutator = (current) => {
        const idx = current.findIndex(e => e.id === targetId);
        if(idx === -1) return sbB.LabelLibrary.NO_CHANGE; // the record is already gone -- safely no-op, never resurrect it
        const next = current.slice();
        next[idx] = Object.assign({}, next[idx], { scentName: 'Should never survive' });
        return next;
      };

      const [deleteOutcome, editOutcome] = await Promise.all([
        sbA.LabelLibrary.mutate(deleteMutator),
        sbB.LabelLibrary.mutate(editMutator),
      ]);

      assert.strictEqual(deleteOutcome.committed, true, 'the delete must always commit');
      // The edit either committed a no-op-equivalent write it never got to
      // make (impossible, since NO_CHANGE never writes) or genuinely
      // NO_CHANGEd once it saw the deletion -- either way it must never
      // throw and must never resurrect the deleted record.
      const finalRaw = JSON.parse(sharedStore.getItem(key));
      assert.strictEqual(finalRaw.some(e => e.id === targetId), false, 'the deleted record must not exist in the final persisted collection, regardless of interleaving order');
      assert.strictEqual(finalRaw.length, 1, 'exactly one record must remain');
      if(editOutcome.committed){
        // If the edit's retry happened to run before it ever saw the
        // deletion land, its own proposal must itself have been a
        // pass-through of an already-deleted state on a LATER retry --
        // committed can only be true here if collection is unchanged from
        // what delete already produced, i.e. NO_CHANGE-equivalent.
        assert.strictEqual(finalRaw.some(e => e.scentName === 'Should never survive'), false, "the edit's content must never appear in final storage once the record it targeted is deleted");
      }

      console.log('PART 25 passed: delete racing with edit of the same record always ends with the record deleted -- the edit safely NO_CHANGEs rather than resurrecting it or throwing');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 26 -- duplicate racing with save: two independent CREATE
    // mutations (a duplicate-of-existing and a brand-new save) racing
    // with no Web Lock. Both are pure additions (neither touches the
    // other's target), so both must survive, and their independently
    // pre-generated ids must never collide even under the race.
    // ══════════════════════════════════════════════════════════════════
    {
      const sbA = loadInto(makeWindow());
      const sbB = loadInto(makeWindow());
      const sharedStore = (function(){
        const map = new Map();
        return {
          getItem(k){ return map.has(k) ? map.get(k) : null; },
          setItem(k, v){ map.set(k, String(v)); },
          removeItem(k){ map.delete(k); },
        };
      })();
      Object.defineProperty(sbA, 'localStorage', { value: sharedStore, configurable: true });
      Object.defineProperty(sbB, 'localStorage', { value: sharedStore, configurable: true });

      const namespace = 'mutate-duplicate-vs-save';
      const key = 'clpeasy_labels__u_' + namespace;
      sharedStore.setItem(key, JSON.stringify([legacyCircle52()]));
      sbA.LabelLibrary.setNamespace(namespace);
      const seed = await sbA.LabelLibrary.init();
      sbB.LabelLibrary.setNamespace(namespace);
      await sbB.LabelLibrary.init();
      const sourceId = seed[0].id;

      // Per the documented mutate() usage pattern: generate the new id
      // ONCE, before calling mutate(), and close over it -- never inside
      // the mutator itself (which may run more than once on retry).
      const duplicateId = sbA.LabelLibrary.generateId();
      const saveId = sbB.LabelLibrary.generateId();
      assert.notStrictEqual(duplicateId, saveId, 'two independently pre-generated ids must never collide');

      const duplicateMutator = (current) => {
        const src = current.find(e => e.id === sourceId);
        if(!src) return sbA.LabelLibrary.NO_CHANGE;
        return current.concat([Object.assign({}, src, { id: duplicateId })]);
      };
      const saveMutator = (current) => current.concat([Object.assign({}, customRect57x99(), { id: saveId })]);

      const [dupOutcome, saveOutcome] = await Promise.all([
        sbA.LabelLibrary.mutate(duplicateMutator),
        sbB.LabelLibrary.mutate(saveMutator),
      ]);

      assert.strictEqual(dupOutcome.committed, true);
      assert.strictEqual(saveOutcome.committed, true);

      const finalRaw = JSON.parse(sharedStore.getItem(key));
      assert.strictEqual(finalRaw.length, 3, 'the original record plus both independently-created records must all be present');
      assert.strictEqual(finalRaw.some(e => e.id === duplicateId), true, "the duplicate's id must be present in final storage");
      assert.strictEqual(finalRaw.some(e => e.id === saveId), true, "the new save's id must be present in final storage");
      assert.strictEqual(new Set(idsOf(finalRaw)).size, 3, 'all three final ids must be distinct -- no collision under the race');

      console.log('PART 26 passed: duplicate racing with save (two independent creates) -- both survive, and independently pre-generated ids never collide under the race');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 27 -- stale namespace during mutate(): a namespace switch WHILE
    // mutate() is still awaiting its mutator must reject the stale call
    // with StaleLibraryMutationError, make ZERO writes to the old
    // namespace's storage, and leave the new namespace's own state
    // completely uncontaminated.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const aliceKey = 'clpeasy_labels__u_alice-mutate-stale';
      const bobKey = 'clpeasy_labels__u_bob-mutate-stale';
      sb.localStorage.setItem(aliceKey, JSON.stringify([legacyCircle52()]));
      sb.localStorage.setItem(bobKey, JSON.stringify([legacyRect63()]));

      LL.setNamespace('alice-mutate-stale');
      await LL.init();
      const aliceBefore = sb.localStorage.getItem(aliceKey);

      const pendingMutation = LL.mutate(function(current){
        return current.map(e => Object.assign({}, e, { scentName: 'Should never persist' }));
      });
      // JS is single-threaded; mutate()'s synchronous prefix (requireReady,
      // the coordination call, readRaw, isValidCollection, deepClone, and
      // the synchronous portion of calling the mutator) runs to completion
      // up to `await mutator(...)` before control returns here -- so this
      // namespace switch is guaranteed to land before that await resolves.
      LL.setNamespace('bob-mutate-stale');

      await assert.rejects(() => pendingMutation, /StaleLibraryMutationError/, 'a namespace switch mid-mutate() must cause the stale call to REJECT, never commit into the new namespace\'s lifecycle');

      assert.strictEqual(sb.localStorage.getItem(aliceKey), aliceBefore, "Alice's storage must be completely unchanged -- the stale mutation must never have been written");
      assert.throws(() => LL.getSaved(), /before init\(\) completed/, "Bob's cache must remain empty until Bob's own init() -- Alice's stale, rejected mutate() must never have touched it");

      const bobResult = await LL.init();
      assert.strictEqual(bobResult.length, 1);
      assert.strictEqual(bobResult[0].scentName, 'Cedar', "Bob's own init() must load correctly, uncontaminated by Alice's stale mutate() call");

      console.log('PART 27 passed: a namespace switch while mutate() is still awaiting causes that stale call to REJECT with StaleLibraryMutationError -- zero writes to the old namespace, and the new namespace stays completely uncontaminated');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 28 -- mutation retries when storage changes: a deterministic,
    // single-tab forced retry (an external write is injected between this
    // mutate() call's read and its write, simulating another writer with
    // no shared Web Lock). The mutator must be re-invoked against the
    // FRESH snapshot, and the retried write must contain BOTH the
    // external change and this call's own change -- never blindly
    // overwrite the external write, never lose its own. Also proves the
    // bounded retry budget genuinely fails closed rather than looping
    // forever, via LibraryMutationRetriesExhaustedError, when storage
    // never stops changing.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_mutate-retry';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52(), legacyRect63()]));
      LL.setNamespace('mutate-retry');
      const initial = await LL.init();
      const idA = initial.find(e => e.scentName === 'Vanilla Bean').id;
      const idB = initial.find(e => e.scentName === 'Cedar').id;

      let callCount = 0;
      const outcome = await LL.mutate(function(current){
        callCount++;
        if(callCount === 1){
          // Simulate an external write landing between mutate()'s read and
          // its write -- e.g. another tab, with no shared Web Lock.
          const conflicting = current.map(e => e.id === idB ? Object.assign({}, e, { scentName: 'EXTERNAL WRITE' }) : e);
          sb.localStorage.setItem(key, JSON.stringify(conflicting));
        }
        return current.map(e => e.id === idA ? Object.assign({}, e, { scentName: 'Edited By Mutate' }) : e);
      });

      assert.strictEqual(callCount, 2, 'the mutator must be re-invoked exactly once, against the fresh post-conflict snapshot, after compare-before-write detects the external change');
      assert.strictEqual(outcome.committed, true);
      const finalStored = JSON.parse(sb.localStorage.getItem(key));
      assert.strictEqual(finalStored.find(e => e.id === idA).scentName, 'Edited By Mutate', "the retried mutation's own change must be present");
      assert.strictEqual(finalStored.find(e => e.id === idB).scentName, 'EXTERNAL WRITE', 'the external change (already present in the fresh snapshot the retry recomputed from) must be preserved, never blindly overwritten');

      // Bounded fail-closed: an external write on EVERY single attempt
      // must eventually exhaust the retry budget rather than loop forever
      // or ever commit a proposal computed against stale data.
      let retryCallCount = 0;
      await assert.rejects(
        () => LL.mutate(function(current){
          retryCallCount++;
          sb.localStorage.setItem(key, JSON.stringify(current.concat([]))); // trivially re-serialised but always "changes" relative to the exact object identity check below
          // Force an ACTUAL content change every attempt so compare-before-write
          // never matches: append a distinguishable marker each time.
          sb.localStorage.setItem(key, JSON.stringify(current.map(e => Object.assign({}, e, { _marker: retryCallCount }))));
          return current;
        }),
        /LibraryMutationRetriesExhaustedError/,
        'when storage keeps changing on every single attempt, mutate() must fail closed after its bounded retry budget rather than loop forever'
      );
      assert(retryCallCount >= 2, 'the exhausted-retry path must have genuinely retried more than once before failing closed');

      console.log('PART 28 passed: mutate() retries against the fresh snapshot when storage changes underneath it, preserving both the external and its own change, and fails closed with LibraryMutationRetriesExhaustedError when the retry budget is genuinely exhausted');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 29 -- duplicate-ID rejection: a mutator proposing a collection
    // with two records sharing one id must be rejected outright, with
    // ZERO writes -- the same "ambiguous identity is never accepted"
    // guarantee isValidCollection() already enforces elsewhere in this
    // file, now enforced on every mutate() proposal too.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_mutate-dup-reject';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('mutate-dup-reject');
      const initial = await LL.init();
      const before = sb.localStorage.getItem(key);

      await assert.rejects(
        () => LL.mutate(function(current){
          return current.concat([Object.assign({}, current[0])]); // same id, twice
        }),
        /valid, unique id/,
        'mutate() must reject a proposed collection containing duplicate ids'
      );

      assert.strictEqual(sb.localStorage.getItem(key), before, 'a rejected duplicate-id proposal must result in ZERO writes to storage');
      assert.strictEqual(JSON.stringify(LL.getSaved()), JSON.stringify(initial), 'the cache must remain exactly what it was before the rejected mutation');

      console.log('PART 29 passed: mutate() rejects a proposed collection with duplicate ids outright, with zero writes to storage or cache');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 30 -- mutator exception causes zero writes: if the mutator
    // itself throws, mutate() must propagate that exact error and must
    // never have written anything, at any point.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_mutate-mutator-throws';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('mutate-mutator-throws');
      const initial = await LL.init();
      const before = sb.localStorage.getItem(key);

      await assert.rejects(
        () => LL.mutate(function(){ throw new Error('deliberate mutator failure'); }),
        /deliberate mutator failure/,
        "mutate() must propagate the mutator's own exception rather than swallowing it"
      );
      await assert.rejects(
        () => LL.mutate(async function(){ throw new Error('deliberate ASYNC mutator failure'); }),
        /deliberate ASYNC mutator failure/,
        'the same must hold for a mutator that throws after its own await'
      );

      assert.strictEqual(sb.localStorage.getItem(key), before, 'a mutator exception must result in ZERO writes to storage');
      assert.strictEqual(JSON.stringify(LL.getSaved()), JSON.stringify(initial), 'the cache must remain exactly what it was before the failed mutation');

      console.log('PART 30 passed: a mutator exception (sync or async) propagates through mutate() and causes zero writes to storage or cache');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 31 -- cache matches final persistence: after a successful
    // mutate(), LabelLibrary.getSaved() must return exactly what was just
    // written to storage -- no drift between the in-memory cache and the
    // persisted value.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_mutate-cache-matches';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52(), legacyRect63()]));
      LL.setNamespace('mutate-cache-matches');
      const initial = await LL.init();
      const targetId = initial[0].id;

      const outcome = await LL.mutate(function(current){
        return current.filter(e => e.id !== targetId);
      });

      const storedNow = JSON.parse(sb.localStorage.getItem(key));
      const cacheNow = LL.getSaved();
      assert.deepStrictEqual(idsOf(cacheNow), idsOf(storedNow), 'the cache must contain exactly the same ids as final persistence after a successful mutate()');
      assert.deepStrictEqual(idsOf(outcome.collection), idsOf(storedNow), "mutate()'s own returned collection must also match final persistence exactly");
      assert.strictEqual(storedNow.length, 1, 'the deleted record must be gone from storage');

      console.log('PART 31 passed: after a successful mutate(), the in-memory cache, the resolved outcome.collection, and final storage all agree exactly');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 32 -- pending generated-ID reservations remain correct through
    // mutate(): an id generated via generateId() and then actually
    // committed by mutate() must have its reservation released; an
    // UNRELATED still-pending reservation (a different in-flight
    // generateId() call this mutate() didn't use) must remain untouched.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_mutate-pending-ids';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('mutate-pending-ids');
      await LL.init();

      const usedId = LL.generateId();
      const unrelatedId = LL.generateId();
      assert.deepStrictEqual(new Set(LL._internal.debugPendingIds()), new Set([usedId, unrelatedId]), 'setup: both generated ids must be tracked as pending before either is used');

      const outcome = await LL.mutate(function(current){
        return current.concat([Object.assign({}, customRect57x99(), { id: usedId })]);
      });
      assert.strictEqual(outcome.committed, true);

      const pendingAfter = new Set(LL._internal.debugPendingIds());
      assert.strictEqual(pendingAfter.has(usedId), false, 'mutate() must release the reservation for an id it actually committed');
      assert.strictEqual(pendingAfter.has(unrelatedId), true, 'mutate() must leave an UNRELATED, still-unpersisted reservation untouched');

      console.log('PART 32 passed: mutate() releases exactly the pending generateId() reservation it actually commits, leaving unrelated pending reservations from other in-flight generateId() calls intact');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 33 -- B0 review round, point 2: a mutator's NO_CHANGE decision
    // must never be trusted if it was computed from data that's since
    // gone stale. Before this fix, mutate() returned `{committed:false,
    // collection: deepClone(before)}` unconditionally on NO_CHANGE, with
    // no re-check against fresh storage -- so a NO_CHANGE decided against
    // a stale snapshot could permanently miss a change that was only
    // valid against the ACTUAL current data (sub-test 1), and even a
    // genuinely-correct NO_CHANGE could hand back / cache a snapshot
    // older than what's actually persisted (sub-test 2).
    // ══════════════════════════════════════════════════════════════════
    {
      // Sub-test 1: a NO_CHANGE decided against a stale snapshot must be
      // RE-EVALUATED against the fresh one, not returned as-is -- proven
      // by a case where the fresh re-evaluation produces a REAL write
      // that the stale decision would have missed entirely.
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_mutate-nochange-stale';
      sb.localStorage.setItem(key, JSON.stringify([legacyCircle52()]));
      LL.setNamespace('mutate-nochange-stale');
      await LL.init();
      const targetId = LL.generateId();

      let callCount = 0;
      const outcome = await LL.mutate(function(current){
        callCount++;
        if(callCount === 1){
          // Simulate another tab adding the target record between this
          // read and mutate()'s finalize check -- the OLD code would have
          // returned NO_CHANGE (correct against what THIS call was
          // given) and silently discarded the fact that a real edit was
          // actually possible against the true current data.
          const withNewRecord = current.concat([Object.assign({}, legacyRect63(), { id: targetId })]);
          sb.localStorage.setItem(key, JSON.stringify(withNewRecord));
        }
        const idx = current.findIndex(e => e.id === targetId);
        if(idx === -1) return LL.NO_CHANGE; // correct against what THIS call's `current` actually contains
        const next = current.slice();
        next[idx] = Object.assign({}, next[idx], { scentName: 'Edited on retry' });
        return next;
      });

      assert.strictEqual(callCount, 2, "a NO_CHANGE decision computed from data that's gone stale must trigger a retry against the fresh snapshot, not be trusted as-is");
      assert.strictEqual(outcome.committed, true, 'once re-evaluated against the fresh data (which now contains the target record), this must resolve as a genuine write -- never silently stay a stale NO_CHANGE');
      const finalStored = JSON.parse(sb.localStorage.getItem(key));
      assert.strictEqual(finalStored.find(e => e.id === targetId).scentName, 'Edited on retry', 'the retried mutation must actually apply against the now-current data');

      // Sub-test 2: even a genuinely-correct, non-racing NO_CHANGE must
      // hand back (and cache) the CONFIRMED-current collection, not
      // whatever `before` happened to be -- getSaved() right after must
      // never disagree with what's actually persisted.
      const sb2 = loadInto(makeWindow());
      const LL2 = sb2.LabelLibrary;
      const key2 = 'clpeasy_labels__u_mutate-nochange-plain';
      sb2.localStorage.setItem(key2, JSON.stringify([legacyCircle52()]));
      LL2.setNamespace('mutate-nochange-plain');
      const initial2 = await LL2.init();

      const outcome2 = await LL2.mutate(function(current){
        return LL2.NO_CHANGE; // nothing ever changes underneath this one -- a plain, non-racing no-op
      });
      assert.strictEqual(outcome2.committed, false);
      const storedNow2 = JSON.parse(sb2.localStorage.getItem(key2));
      assert.deepStrictEqual(idsOf(outcome2.collection), idsOf(storedNow2), "a plain NO_CHANGE outcome's collection must match what's actually persisted");
      assert.deepStrictEqual(idsOf(LL2.getSaved()), idsOf(storedNow2), 'the cache must be synced to the confirmed-current value after NO_CHANGE too, so getSaved() never disagrees with actual persistence');
      assert.deepStrictEqual(idsOf(outcome2.collection), idsOf(initial2), 'and in this non-racing case the confirmed-current value is, correctly, unchanged from what init() originally returned');

      console.log('PART 33 passed: a NO_CHANGE decision is only trusted once confirmed against a fresh read -- a stale NO_CHANGE is retried and can resolve into a real write, and even a genuinely-correct NO_CHANGE syncs the cache and returns the confirmed-current collection rather than a possibly-stale snapshot');
    }

    // ══════════════════════════════════════════════════════════════════
    // PART 34 -- B0 review round, missed correction: generateId() before
    // init() must fail closed, never silently treat the not-yet-loaded
    // cache as "zero existing ids". requireReady() alone only proves
    // setNamespace() resolved -- it says nothing about init() having
    // actually completed, and `(_cache || [])` was silently masking that
    // gap.
    // ══════════════════════════════════════════════════════════════════
    {
      const sb = loadInto(makeWindow());
      const LL = sb.LabelLibrary;
      const key = 'clpeasy_labels__u_generateId-before-init';
      const seedId = '99999999-9999-4999-8999-999999999999';
      sb.localStorage.setItem(key, JSON.stringify([Object.assign({}, legacyCircle52(), { id: seedId })]));

      // 2. Call setNamespace() -- but deliberately do NOT await init() yet.
      LL.setNamespace('generateId-before-init');

      // Spy on the ONLY source of real randomness randomId()/randomIdOnce()
      // can draw from in this environment (window.crypto.randomUUID) --
      // if generateId() fails closed correctly, it must never reach this.
      let randomUUIDCalls = 0;
      sb.crypto.randomUUID = function(){ randomUUIDCalls++; return '11111111-1111-4111-8111-111111111111'; };

      // 3/4. Call generateId() before init() -- must throw a clear,
      // specific "before init() completed" error.
      assert.throws(() => LL.generateId(), /before init\(\) completed/, 'generateId() called before init() completes must throw a clear, specific error');

      // 5. Random generation must never have been invoked on this path.
      assert.strictEqual(randomUUIDCalls, 0, 'generateId() failing closed for a not-yet-initialised cache must never reach randomId()/randomIdOnce()');

      // 6. No pending reservation may be created on this failure path.
      // Array.from() rebuilds the array in NODE's own realm -- debugPendingIds()
      // is called from inside the window's own module instance, so a raw
      // deepStrictEqual against a bare [] literal would otherwise fail on
      // prototype/constructor identity alone, even for two empty arrays
      // (the same cross-realm Array.prototype mismatch idsOf() exists to
      // avoid elsewhere in this file).
      assert.deepStrictEqual(Array.from(LL._internal.debugPendingIds()), [], 'no pending reservation may exist after generateId() throws before init()');

      // 7. After await init(), generateId() must work normally.
      const arr = await LL.init();
      assert.strictEqual(arr.length, 1);
      assert.strictEqual(arr[0].id, seedId, 'the seeded, already-valid persisted id must be preserved by init() untouched');

      const newId = LL.generateId();
      assert.strictEqual(sb.LabelLibrary.isValidId(newId), true, 'generateId() after init() must return a validly-formatted id');

      // 8. It must not return the existing persisted id.
      assert.notStrictEqual(newId, seedId, "generateId() after init() must never return the id already persisted for this namespace -- proof that it IS now checking against the real, loaded collection, not an empty stand-in");

      // 9. Exactly one pending reservation must now exist.
      assert.deepStrictEqual(Array.from(LL._internal.debugPendingIds()), [newId], 'generateId() after init() must create exactly one pending reservation, for the id it actually returned');

      console.log('PART 34 passed: generateId() before init() completes fails closed with a clear error, never calls into random generation, and creates no pending reservation; after init() completes, it works normally, never returns an already-persisted id, and reserves exactly the one id it returns');
    }

    console.log('\nALL label-identity-and-spec.js checks passed.');
  } catch(error){
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
})();
