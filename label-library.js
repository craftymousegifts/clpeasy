// ── LabelLibrary — shared saved-label identity & storage helper ──────────
// (31 Aug 2026, Checkpoint A of the connected print-workflow task. Revised
// after Checkpoint A review corrections -- see the numbered fixes below,
// each tagged with the review point it addresses.)
//
// Replaces the three independent, copy-pasted libNS()/libKey()/getSaved()/
// persistSaved() implementations previously living separately in
// builder.html, my-labels.html and print.html with ONE shared module, so
// identity/migration logic exists in exactly one place. Loaded via
// <script src="label-library.js"></script> -- same "one shared file, every
// page loads it" pattern already established by label-render.js.
//
// NOT YET WIRED INTO ANY PAGE. This file and its tests are the whole of
// Checkpoint A -- builder.html/my-labels.html/print.html are unchanged and
// still use their own old copies of this logic until Checkpoint B/C.
//
// ── Design summary ────────────────────────────────────────────────────
// 1. NAMESPACE GATING: every saved-label read/write requires setNamespace()
//    to have been called first with a CONFIRMED value (a real signed-in
//    user id, or a real "no session" resolution -- never a default/assumed
//    guest before auth has actually been checked). getSaved()/persistSaved()
//    throw rather than silently falling back to a guest read. init() takes
//    NO namespace argument -- it can only operate on whatever namespace
//    setNamespace() has already confirmed, so a caller can never bypass the
//    auth-resolution gate by passing a namespace straight into init().
//    [review point 3]
//
// 2. MIGRATION: init() is the one async entry point a page awaits before
//    rendering anything. It guarantees every record it returns has a
//    valid-format, UNIQUE id within the collection -- either because it
//    already did, or because this call assigned one and verified the write
//    actually landed. A collection containing two records that already
//    share one valid id is never accepted -- identity must be unambiguous,
//    not merely well-formatted. [review point 1]
//
// 3. CONCURRENCY: Web Locks API (navigator.locks) is used for real mutual
//    exclusion where available. Where it isn't, migration relies on
//    DETERMINISTIC id assignment (see computeMigratedArray below) rather
//    than on any localStorage token being an atomic lock -- two tabs
//    migrating the same pre-migration collection independently compute the
//    SAME ids for the same records, so it is provably safe regardless of
//    write order. The best-effort token exchange that still runs in the
//    no-Web-Locks path is purely an optimisation to reduce redundant
//    writes, never the source of correctness. Deterministic hash collisions
//    are themselves resolved deterministically (a salt counter baked into
//    the hash input), never by falling back to randomness, so two tabs
//    still agree on the resolved id. [review point 7]
//
// 4. IDs already present are NEVER recalculated or replaced -- migration
//    only ever fills in what's missing.
//
// 5. Every record returned to a caller (getSaved(), init(), a storage-event
//    callback) is a deep, JSON-based clone -- saved labels contain nested
//    arrays/objects (hazard lists, pictogram selections, etc.), and a
//    caller mutating that nested content must never be able to reach back
//    into this module's own cache or another caller's already-placed data
//    (e.g. a Composer sheet snapshot). [review point 5]
(function(global){
  'use strict';

  // One validated format governs every id everywhere it's generated, read
  // from a URL, or compared -- random (crypto.randomUUID()/getRandomValues
  // fallback) and deterministic (SHA-256-derived) ids both conform to this
  // exact shape, so a single regex is the one source of truth for "is this
  // a real id" throughout the whole app, not just this file.
  var ID_FORMAT = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

  function isValidId(id){
    return typeof id === 'string' && ID_FORMAT.test(id);
  }

  function keyFor(namespace){ return 'clpeasy_labels__u_' + namespace; }

  // ── Distinguishable error types ───────────────────────────────────────
  // Every fail-closed path throws one of these rather than a generic Error,
  // so a caller (and a test) can tell "no data yet" apart from "something
  // is actually wrong and needs attention" -- and can distinguish which
  // kind of wrong.
  function LibraryReadError(namespace, reason){
    var err = new Error('LabelLibrary: could not read saved labels for namespace "' + namespace + '" (' + reason + '). The stored value was left untouched.');
    err.name = 'LibraryReadError';
    err.namespace = namespace;
    err.reason = reason;
    return err;
  }
  function LibraryMigrationError(namespace){
    var err = new Error('LabelLibrary: migration could not be safely completed for namespace "' + namespace + '".');
    err.name = 'LibraryMigrationError';
    err.namespace = namespace;
    return err;
  }
  function IdGenerationError(){
    var err = new Error('LabelLibrary: could not generate a unique id after multiple attempts.');
    err.name = 'IdGenerationError';
    return err;
  }
  // review point 1 (surgical fixes round): thrown by init() when the
  // namespace/generation it was called for no longer matches by the time
  // its work completes -- a stale init() call must never resolve with
  // the OLD namespace's label data into a page lifecycle that has since
  // moved on (sign-out, account switch). See init() below.
  function StaleLibraryInitializationError(namespace){
    var err = new Error('LabelLibrary: init() for namespace "' + namespace + '" completed after the namespace changed -- rejecting rather than returning stale data into the new page lifecycle.');
    err.name = 'StaleLibraryInitializationError';
    err.namespace = namespace;
    return err;
  }
  // ── Checkpoint B0: coordinated mutation errors ───────────────────────
  // Thrown by mutate() (see below) when the namespace/generation it was
  // called for no longer matches by the time it's ready to apply or
  // commit the mutation -- the same "never resolve a stale caller with
  // another user's data or write into another user's namespace" guarantee
  // init() already provides, extended to every future write path.
  function StaleLibraryMutationError(namespace){
    var err = new Error('LabelLibrary: mutate() for namespace "' + namespace + '" was rejected because the namespace changed while the mutation was in progress -- rejecting rather than applying or returning a stale-namespace result.');
    err.name = 'StaleLibraryMutationError';
    err.namespace = namespace;
    return err;
  }
  // Thrown when the stored collection kept changing out from under a
  // mutate() call (compare-before-write kept failing) past the bounded
  // retry budget -- fails closed rather than looping forever or, worse,
  // ever writing a proposal that was computed against data that's since
  // gone stale.
  function LibraryMutationRetriesExhaustedError(namespace){
    var err = new Error('LabelLibrary: mutate() for namespace "' + namespace + '" could not commit -- the stored collection kept changing underneath it after the retry budget was exhausted. No write was made.');
    err.name = 'LibraryMutationRetriesExhaustedError';
    err.namespace = namespace;
    return err;
  }

  // ── review point 6: distinguish empty / corrupt / inaccessible storage.
  // A missing key (never saved before) and a stored "[]" are both a
  // genuine, valid empty collection. Anything else that doesn't parse as
  // an array -- malformed JSON, an object, getItem itself throwing -- is
  // NEVER silently treated as "no labels": it fails closed with a
  // LibraryReadError, and nothing is written over it. ──
  function readRaw(namespace){
    var raw;
    try{
      raw = global.localStorage.getItem(keyFor(namespace));
    }catch(e){
      throw LibraryReadError(namespace, 'storage could not be accessed');
    }
    if(raw === null || typeof raw === 'undefined') return []; // genuinely missing key
    var parsed;
    try{
      parsed = JSON.parse(raw);
    }catch(e){
      throw LibraryReadError(namespace, 'the stored value is not valid JSON');
    }
    if(!Array.isArray(parsed)){
      throw LibraryReadError(namespace, 'the stored value is not an array');
    }
    return parsed;
  }
  function writeRaw(namespace, arr){
    global.localStorage.setItem(keyFor(namespace), JSON.stringify(arr));
  }

  // ── review point 1: a collection is valid only if every entry is a
  // real object, every id matches the format, AND every id is unique
  // within the collection -- two records sharing one valid-format id is
  // an ambiguous identity, never an acceptable "all valid" result. ──
  function isValidCollection(arr){
    if(!Array.isArray(arr)) return false;
    var seen = new Set();
    for(var i = 0; i < arr.length; i++){
      var e = arr[i];
      if(!e || typeof e !== 'object' || Array.isArray(e)) return false;
      if(!isValidId(e.id)) return false;
      if(seen.has(e.id)) return false;
      seen.add(e.id);
    }
    return true;
  }

  // review point 2/3 (final corrections round): a real object with no 'id'
  // key (or an explicitly null/undefined one) is the ordinary legacy case
  // -- never migrated yet, safe to assign a fresh deterministic id. An
  // object that DOES carry a defined, non-null 'id' value that ISN'T a
  // valid-format id is a different situation: very likely data corruption
  // (a half-written migration, manual tampering, a bug), not "never
  // migrated." There is no safe, well-defined rule for silently repairing
  // or discarding an existing id, so computeMigratedArray() below fails
  // closed on it rather than overwriting it.
  function hasIdField(e){
    return Object.prototype.hasOwnProperty.call(e, 'id') && e.id !== undefined && e.id !== null;
  }

  // ── review point 5: one consistent deep-clone helper. The saved-label
  // schema is, and must remain, JSON-compatible (no functions/Dates/
  // Symbols/cycles), so JSON round-tripping is a correct and cheap deep
  // clone for it -- used for every value handed to or adopted from
  // outside this module. ──
  function deepClone(value){
    return typeof value === 'undefined' ? undefined : JSON.parse(JSON.stringify(value));
  }

  // ── Random id generation -- for genuinely NEW labels and duplicates
  // ONLY. Never used for legacy migration (see computeMigratedArray): a
  // fresh save or a duplicate must always get a brand-new, unpredictable
  // id even if its content is byte-identical to an existing record, which
  // is the opposite of what migration needs (the same legacy record must
  // resolve to the same id on every tab). ──
  function bytesToUuidString(bytes){
    var hex = Array.prototype.map.call(bytes, function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20,32);
  }
  function hexToBytes32(hex){
    var bytes = new Uint8Array(16);
    for(var i=0;i<16;i++) bytes[i]=parseInt(hex.substr(i*2,2)||'0',16);
    return bytes;
  }
  function randomIdOnce(){
    if(global.crypto && typeof global.crypto.randomUUID === 'function'){
      return global.crypto.randomUUID();
    }
    if(global.crypto && typeof global.crypto.getRandomValues === 'function'){
      var bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
      return bytesToUuidString(bytes);
    }
    // Last-resort degrade for an environment with no Web Crypto at all.
    // Still format-checked and collision-checked by the caller below.
    var hex = '';
    for(var i=0;i<32;i++) hex += Math.floor(Math.random()*16).toString(16);
    return bytesToUuidString(hexToBytes32(hex));
  }
  // review point 2: after exhausting the attempt budget, throw a specific
  // IdGenerationError rather than returning a known-colliding (or
  // malformed) id -- a caller must never be silently handed an ambiguous
  // identity. Every candidate is format-validated before it's even
  // considered, let alone returned.
  function randomId(existingIds){
    var maxAttempts = 8;
    for(var attempts = 0; attempts < maxAttempts; attempts++){
      var id = randomIdOnce();
      if(!isValidId(id)) continue; // never return a malformed value
      if(!existingIds || !existingIds.has(id)) return id;
    }
    throw IdGenerationError();
  }

  // ── Deterministic legacy-migration id ────────────────────────────────
  // input = confirmed namespace + canonical content (every field except
  // id, recursively sorted so nested key order never matters) + a stable
  // duplicate-occurrence discriminator (1-based count of identical-content
  // records at or before this one, scanned in array order) + a collision
  // salt (see computeMigratedArray, review point 7). SHA-256'd via Web
  // Crypto so two tabs computing this from the same starting array
  // independently arrive at the identical id, with no coordination
  // required.
  //
  // review point 9: canonicalize() recursively sorts keys at every nesting
  // level (not just the top level), preserves array element order (order
  // is semantically meaningful for arrays, unlike object key order), and
  // fails closed (throws) on a value type JSON can't represent (function,
  // symbol, bigint) or on a cyclic reference -- both of which would mean
  // the record isn't the JSON-compatible data the saved-label schema is
  // defined to be. Nested property insertion order in a saved label is
  // never semantically meaningful in this schema (it's always built by
  // assigning known fields, never by preserving arbitrary external key
  // order), so a stable, sorted re-serialisation is the correct
  // "canonical" form: two in-memory copies of the same logical record can
  // only differ in incidental key order, never in meaning.
  function stableCanonicalValue(value, seen){
    if(value === null || typeof value !== 'object'){
      if(typeof value === 'undefined') return null; // JSON-compatible stand-in
      if(typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint'){
        throw new Error('LabelLibrary: canonicalize() encountered a "' + typeof value + '" value -- saved-label records must be JSON-compatible.');
      }
      return value; // string / number / boolean
    }
    if(seen.has(value)){
      throw new Error('LabelLibrary: canonicalize() encountered a cyclic reference -- saved-label records must be JSON-compatible, non-cyclic data.');
    }
    seen.add(value);
    var result;
    if(Array.isArray(value)){
      result = value.map(function(v){ return stableCanonicalValue(v, seen); });
    } else {
      result = {};
      Object.keys(value).sort().forEach(function(k){
        result[k] = stableCanonicalValue(value[k], seen);
      });
    }
    seen.delete(value);
    return result;
  }
  function canonicalize(record){
    var clone = {};
    Object.keys(record || {}).sort().forEach(function(k){
      if(k === 'id') return; // the one intentionally-omitted identity field
      clone[k] = stableCanonicalValue(record[k], new Set());
    });
    return JSON.stringify(clone);
  }

  async function deterministicIdFromCanon(namespace, canon, occurrenceIndex, salt){
    if(!(global.crypto && global.crypto.subtle && typeof global.crypto.subtle.digest === 'function')){
      return null; // "cannot be made reliable" -- caller fails closed
    }
    var input = namespace + ' ' + canon + ' ' + occurrenceIndex + ' ' + (salt || 0);
    var data = new TextEncoder().encode(input);
    var digestBuf = await global.crypto.subtle.digest('SHA-256', data);
    var hex = Array.prototype.map.call(new Uint8Array(digestBuf), function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    return bytesToUuidString(hexToBytes32(hex.slice(0,32)));
  }
  // Test/debug-friendly wrapper taking a raw record instead of a
  // pre-canonicalised string -- computeMigratedArray uses
  // deterministicIdFromCanon directly since it already has `canon` on
  // hand from occurrence-counting and shouldn't recompute it.
  async function deterministicId(namespace, record, occurrenceIndex, salt){
    var canon;
    try{ canon = canonicalize(record); }catch(e){ return null; }
    return deterministicIdFromCanon(namespace, canon, occurrenceIndex, salt);
  }

  // review point 7: a deterministic hash collision (two DIFFERENT records
  // whose salt-0 digest happens to match, or a collision against an
  // already-valid id) is resolved by walking a bounded, deterministic salt
  // counter -- never by falling back to randomness, which would break the
  // "two tabs agree" guarantee. Both tabs start from the same rawArr, so
  // both compute the exact same sequence of candidates and land on the
  // same resolved id. If the whole bounded search is exhausted, migration
  // fails closed rather than ever returning an ambiguous/colliding id.
  var MAX_COLLISION_SALT = 50;

  // Pure async function: rawArr -> a NEW array where every entry has a
  // valid, unique id. Entries that already have one are copied through
  // completely untouched (never recalculated/replaced). Returns null if
  // deterministic migration cannot be performed reliably (no Web Crypto),
  // if two entries already share one valid id (review point 1 -- an
  // ambiguity migration must never silently resolve on its own), if a
  // record isn't JSON-compatible (review point 9), or if a genuine id
  // collision can't be resolved within the bounded salt search -- all are
  // "fail closed" signals to the caller, never a silently-broken
  // assignment.
  async function computeMigratedArray(namespace, rawArr){
    if(!Array.isArray(rawArr)) return null;

    var existingIds = new Set();
    for(var i0 = 0; i0 < rawArr.length; i0++){
      var e0 = rawArr[i0];
      // review point 2 (final corrections round): a malformed legacy
      // entry -- not a real object at all (null, a primitive, an array
      // masquerading as an entry) -- must never be silently coerced into
      // a fabricated id-bearing object (e.g. Object.assign({}, null, {id})
      // would otherwise quietly manufacture a near-empty "label"). Fail
      // closed instead.
      if(!e0 || typeof e0 !== 'object' || Array.isArray(e0)) return null;
      if(isValidId(e0.id)){
        if(existingIds.has(e0.id)) return null; // ambiguous identity already present
        existingIds.add(e0.id);
      } else if(hasIdField(e0)){
        // review point 3 (final corrections round): a PRESENT but
        // malformed id -- see hasIdField()'s comment above.
        return null;
      }
    }

    var occurrenceCounts = Object.create(null);
    var usedThisPass = new Set();
    var out = [];
    for(var i = 0; i < rawArr.length; i++){
      var e = rawArr[i];
      if(e && isValidId(e.id)){ out.push(e); continue; }

      var canon;
      try{ canon = canonicalize(e); }catch(err){ return null; }
      var occ = (occurrenceCounts[canon] || 0) + 1;
      occurrenceCounts[canon] = occ;

      var id = null;
      for(var salt = 0; salt <= MAX_COLLISION_SALT; salt++){
        var candidate = await deterministicIdFromCanon(namespace, canon, occ, salt);
        if(candidate === null) return null; // Web Crypto unavailable
        if(!existingIds.has(candidate) && !usedThisPass.has(candidate)){ id = candidate; break; }
      }
      if(id === null) return null; // exhausted deterministic collision resolution

      usedThisPass.add(id);
      existingIds.add(id);
      out.push(Object.assign({}, e, { id: id }));
    }

    return isValidCollection(out) ? out : null; // defense in depth
  }

  // ── Namespace gating ──────────────────────────────────────────────────
  var _namespace = null;
  var _namespaceResolved = false;
  var _cache = null; // migrated+verified array for the CURRENT _namespace only
  var _onChange = null;
  // review point 4: bumped on every genuine namespace change or reset() --
  // a pending storage-event reconciliation captures this at the moment it
  // starts and refuses to adopt its result if the generation has moved on.
  var _namespaceGeneration = 0;
  // review point 5 (final corrections round) / review point 3 (surgical
  // fixes round): ids generateId() has already handed out for THIS
  // namespace but that haven't been persisted yet. Without tracking
  // these, two generateId() calls made back-to-back before either result
  // is persisted both build their collision set from the SAME unchanged
  // _cache and could return the same id.
  //
  // Three DIFFERENT things can touch this set, and they must NOT all
  // behave the same way (surgical fixes round, point 3):
  //   - adoptCache() -- a full context change (setNamespace()/reset()/a
  //     successful init()). The whole cache is being replaced wholesale
  //     because we've moved to a different namespace or a fresh
  //     migration, so any reservations from the PREVIOUS context are no
  //     longer meaningful and are cleared.
  //   - refreshCacheFromReconciliation() -- a storage-event refresh
  //     WITHIN THE SAME namespace/generation (another tab wrote
  //     something). This must NEVER clear pending reservations: those
  //     ids haven't landed in storage from ANY tab yet, and a caller
  //     elsewhere in THIS tab may still be holding one, about to persist
  //     it. Releasing it here would let a second generateId() call hand
  //     the same id to someone else while the first caller still holds it.
  //   - persistSaved() -- reconciles reservations against what it
  //     ACTUALLY just persisted: a pending id that made it into this
  //     write is now genuinely committed (and is also now present in
  //     _cache, which already blocks reuse on its own) and is released;
  //     any OTHER still-pending id this call didn't persist is left alone.
  //
  // Abandoned reservations (generateId() called, but its result never
  // persisted and the namespace never changed) are intentionally NOT
  // released by a timer or any other automatic expiry -- there is no safe
  // way to tell "abandoned" apart from "still in progress" from in here,
  // and silently freeing a live unpersisted id for reuse is exactly the
  // bug this exists to prevent. In practice such a reservation is bounded
  // and harmless: the set is small (at most a handful of in-flight new
  // labels), lives only in memory for this page's lifetime, and is
  // naturally cleared by the very next namespace change, sign-out, or
  // page reload (a fresh module instance starts with an empty set).
  var _pendingGeneratedIds = new Set();

  function adoptCache(newCache){
    _cache = newCache;
    _pendingGeneratedIds.clear();
  }
  function refreshCacheFromReconciliation(newCache){
    _cache = newCache; // same-namespace refresh only -- pending reservations are preserved
  }

  function setNamespace(ns){
    if(typeof ns !== 'string' || !ns){
      throw new Error('LabelLibrary.setNamespace requires a non-empty namespace string (a user id, or the literal "guest" once auth has genuinely resolved to no session).');
    }
    if(_namespace !== ns){
      _namespace = ns;
      adoptCache(null); // never carry a previous namespace's data (or its pending ids) into a new one
      _namespaceGeneration++;
    }
    _namespaceResolved = true;
  }
  function reset(){
    _namespace = null;
    _namespaceResolved = false;
    adoptCache(null);
    _namespaceGeneration++;
  }
  function requireReady(){
    if(!_namespaceResolved || !_namespace){
      throw new Error('LabelLibrary: namespace not resolved yet -- call setNamespace() (only after auth has genuinely resolved, including a confirmed-guest "no session" result) before reading or writing saved labels.');
    }
  }

  // ── Cross-tab coordination ────────────────────────────────────────────
  function withCoordination(namespace, fn){
    if(global.navigator && global.navigator.locks && typeof global.navigator.locks.request === 'function'){
      return global.navigator.locks.request('clpeasy-labels-migrate:' + namespace, fn);
    }
    return withBestEffortToken(namespace, fn);
  }
  async function withBestEffortToken(namespace, fn){
    // NOT a claim of atomicity -- see the file-header note. Purely reduces
    // (does not guarantee against) redundant concurrent writes; the actual
    // safety net is computeMigratedArray()'s determinism plus the
    // post-write verification in init() below, which hold regardless of
    // whether this exchange raced.
    var lockKey = keyFor(namespace) + '__migrating';
    var token = Math.random().toString(36).slice(2) + ':' + Date.now();
    try{ global.localStorage.setItem(lockKey, token); }catch(e){}
    var after = null;
    try{ after = global.localStorage.getItem(lockKey); }catch(e){}
    try{
      return await fn();
    } finally {
      try{ if(after === token) global.localStorage.removeItem(lockKey); }catch(e){}
    }
  }

  async function pollUntilAllValid(namespace, opts){
    opts = opts || {};
    var intervalMs = opts.intervalMs || 20, timeoutMs = opts.timeoutMs || 800;
    var start = Date.now();
    while(true){
      var arr = readRaw(namespace); // may throw LibraryReadError -- propagates, fail closed
      if(isValidCollection(arr)) return arr;
      if(Date.now() - start > timeoutMs) return null;
      await new Promise(function(r){ setTimeout(r, intervalMs); });
    }
  }

  // review point 3: init() takes NO namespace argument -- it can only ever
  // operate on whatever setNamespace() has already confirmed. This is the
  // whole point of the gate: a caller cannot bypass auth resolution by
  // simply calling init('guest') directly.
  //
  // Guarantees: every record in the returned array has a valid, UNIQUE id;
  // that array is exactly what's persisted in storage right now (never a
  // stale pre-migration snapshot); every returned/cached value is an
  // independent deep clone (review point 5); and if any of that can't be
  // met, this rejects rather than returning anything.
  //
  // review point 1 (final corrections round; tightened in the surgical
  // fixes round): this call's own local `namespace`/`generation` are
  // captured up front and used for every read/write it performs -- but by
  // the time its awaits resolve, the app may have moved on (sign-out,
  // account switch) while this call was still in flight. Rather than
  // resolving with the OLD namespace's data (which page code could still
  // render or act on after the app has already switched to a different
  // user), a stale completion REJECTS with StaleLibraryInitializationError
  // -- no cache adoption, no old-namespace data ever handed back.
  //
  // review point 7 (final corrections round): between reading the
  // pre-migration snapshot and writing the migrated result back, another
  // write can land on the SAME key from elsewhere in this same tab (e.g.
  // a direct persistSaved() call firing while this migration's hash
  // computation is still awaiting) -- Web Locks/the best-effort token
  // only coordinate against OTHER callers going through this same
  // coordination path, not arbitrary same-tab writers. So immediately
  // before writing, the current stored value is re-read and compared
  // against the exact snapshot this migration was computed from; if it
  // changed, the derived result is stale and is never written -- instead
  // migration is recomputed from the fresh snapshot, up to a bounded
  // number of retries, failing closed rather than looping forever.
  var MAX_MIGRATION_RETRIES = 5;
  async function init(){
    requireReady();
    var namespace = _namespace;
    var generation = _namespaceGeneration;
    return withCoordination(namespace, async function(){
      var attempt = 0;
      while(true){
        var raw = readRaw(namespace);
        if(isValidCollection(raw)) break; // nothing to migrate (or someone else already finished)
        var migrated = await computeMigratedArray(namespace, raw);
        if(migrated === null) throw LibraryMigrationError(namespace);
        var current = readRaw(namespace);
        if(JSON.stringify(current) !== JSON.stringify(raw)){
          attempt++;
          if(attempt > MAX_MIGRATION_RETRIES) throw LibraryMigrationError(namespace);
          continue; // the source snapshot went stale -- retry against the fresh one
        }
        writeRaw(namespace, migrated);
        break;
      }
      var verified = await pollUntilAllValid(namespace, { intervalMs: 20, timeoutMs: 800 });
      if(verified === null) throw LibraryMigrationError(namespace);
      // Immediately before cache assignment AND before returning: if the
      // namespace/generation this call started with is no longer current,
      // this completion is stale. Reject rather than adopt or return.
      if(!(_namespaceResolved && _namespace === namespace && _namespaceGeneration === generation)){
        throw StaleLibraryInitializationError(namespace);
      }
      var result = deepClone(verified);
      adoptCache(deepClone(verified));
      return result;
    });
  }

  function getSaved(){
    requireReady();
    if(_cache === null){
      throw new Error('LabelLibrary: getSaved() called before init() completed -- await LabelLibrary.init() first.');
    }
    // A genuine deep clone (review point 5): callers (e.g. Composer's
    // sheetItems, in Checkpoint C) must never hold a live reference into
    // the library's own cache -- including nested arrays/objects -- so
    // mutating or deleting a library entry later can never retroactively
    // change something already placed elsewhere.
    return deepClone(_cache);
  }

  function persistSaved(arr){
    requireReady();
    if(!isValidCollection(arr)){
      throw new Error('LabelLibrary.persistSaved(): every record must already have a valid, unique id -- use LabelLibrary.generateId() for a new record before persisting it.');
    }
    var snapshot = deepClone(arr); // detach from whatever the caller still holds
    writeRaw(_namespace, snapshot);
    _cache = snapshot;
    // review point 3 (surgical fixes round): reconcile reservations
    // against what was ACTUALLY persisted here -- release exactly the
    // pending ids that made it into this write (they're now genuinely
    // committed, and _cache already blocks their reuse on its own too);
    // leave any OTHER still-pending id (a different in-flight
    // generateId() call this one didn't persist) untouched. This is
    // deliberately NOT adoptCache(), which would release every pending
    // reservation regardless of whether this write actually persisted it.
    var persistedIds = new Set(snapshot.map(function(e){ return e.id; }));
    _pendingGeneratedIds.forEach(function(id){
      if(persistedIds.has(id)) _pendingGeneratedIds.delete(id);
    });
  }

  // ── Checkpoint B0: coordinated mutation API ───────────────────────────
  // persistSaved() above is now test-only (see the _internal export block
  // at the bottom of this file) -- it accepts a whole-array snapshot and
  // writes it unconditionally, which is exactly the "blind overwrite of
  // newer storage" pattern that made the three separate page-level
  // save/edit/duplicate/delete implementations unsafe to run concurrently
  // (same tab in quick succession, or two tabs). mutate() is the one
  // shared, coordinated replacement every real page mutation must use
  // from Checkpoint B onward.
  //
  // Return a sentinel from a mutator to mean "nothing to persist" -- e.g.
  // an edit/delete that targeted an id no longer present. mutate() makes
  // ZERO writes in that case and resolves with the collection unchanged.
  var NO_CHANGE = { __labelLibraryNoChange: true };

  // Contract:
  //   const outcome = await LabelLibrary.mutate(function(currentCollection){
  //     // currentCollection is a DETACHED deep clone of whatever is
  //     // currently persisted -- the freshest value available at the
  //     // moment this specific attempt started, read from inside the same
  //     // Web Lock migration and every other mutate()/init() call
  //     // contends for. Mutating it in place is safe; it is never a live
  //     // reference into this module's cache.
  //     ...compute a proposed next collection, ID-based...
  //     return proposedCollection;             // the common case, OR
  //     return LabelLibrary.NO_CHANGE;          // nothing to write, OR
  //     return { collection: proposedCollection, ...anythingElse };
  //   });
  //   // outcome = { committed: true|false, collection: <deep clone of
  //   // whatever is now current>, ...anythingElse (deep-cloned) }
  //
  // The mutator MUST be a pure function of the collection it receives --
  // no reliance on outside mutable state, no side effects beyond
  // computing and returning the proposal -- because it may be invoked
  // MORE THAN ONCE per mutate() call if a retry is needed (see below). In
  // particular, a "create" mutator that needs a fresh id should call
  // LabelLibrary.generateId() ONCE, before calling mutate(), and close
  // over that id, rather than generating a new one from inside the
  // mutator -- otherwise a retried attempt would reserve (and abandon) a
  // different id on every retry.
  //
  // What this actually guarantees, honestly:
  //   - Where the Web Locks API is available (the same primary mechanism
  //     migration already uses, via the identical withCoordination() /
  //     'clpeasy-labels-migrate:<namespace>' lock name -- so a mutate()
  //     can never run concurrently with an in-flight init() migration,
  //     or with another mutate() call, in ANY tab sharing this origin):
  //     genuine mutual exclusion. Only one read-modify-write critical
  //     section for this namespace executes at a time, anywhere. The
  //     compare-before-write check below is then a defensive backstop
  //     (e.g. against a same-tab caller that bypassed mutate() entirely),
  //     not the primary correctness mechanism.
  //   - Where Web Locks are NOT available (the best-effort token
  //     fallback): there is NO real cross-tab mutual exclusion. Two tabs'
  //     mutate() calls can genuinely interleave. What IS still guaranteed
  //     is that no write ever blindly overwrites a collection state it
  //     never saw: immediately before writing, the current stored value
  //     is re-read and compared against the exact snapshot the mutator's
  //     proposal was computed from (the same discipline init()'s
  //     migration already uses); a mismatch means somebody else wrote in
  //     the meantime, so this attempt is discarded and the mutator is
  //     re-run against the fresh value, up to MAX_MUTATION_RETRIES times,
  //     then fails closed with LibraryMutationRetriesExhaustedError
  //     rather than ever committing a stale proposal. This is NOT a claim
  //     of perfect atomic serialization -- a sufficiently unlucky
  //     scheduling of two tabs' compare-then-write pairs around each
  //     other in the fallback path is still theoretically possible, the
  //     same way it always has been for any two independent localStorage
  //     writers with no real lock between them. It IS a guarantee that a
  //     write is always based on data at least as fresh as what was just
  //     re-checked immediately before that write, never on an
  //     arbitrarily-stale in-memory copy held across an earlier await.
  var MAX_MUTATION_RETRIES = 5;
  function assertMutationNotStale(namespace, generation){
    if(!(_namespaceResolved && _namespace === namespace && _namespaceGeneration === generation)){
      throw StaleLibraryMutationError(namespace);
    }
  }
  async function mutate(mutator){
    requireReady();
    if(typeof mutator !== 'function'){
      throw new Error('LabelLibrary.mutate(): mutator must be a function.');
    }
    var namespace = _namespace;
    var generation = _namespaceGeneration;
    return withCoordination(namespace, async function(){
      var attempt = 0;
      while(true){
        assertMutationNotStale(namespace, generation);

        // Read the LATEST persisted collection from inside the lock --
        // never a snapshot cached from before this attempt started.
        var before = readRaw(namespace); // may throw LibraryReadError -- propagates, fail closed
        if(!isValidCollection(before)){
          throw new Error('LabelLibrary.mutate(): the stored collection for namespace "' + namespace + '" is not a valid migrated collection -- call LabelLibrary.init() before mutate().');
        }
        var detached = deepClone(before); // the mutator never receives a live reference

        var raw = await mutator(detached);
        // The mutator may itself have awaited something -- re-check
        // immediately after, before any further use of its result.
        assertMutationNotStale(namespace, generation);

        // review point 2 (B0 review round): classify what the mutator
        // returned FIRST, but do not trust either outcome -- NO_CHANGE
        // included -- until it's been confirmed against a fresh read.
        // Classifying (rather than acting on) a malformed non-array,
        // non-NO_CHANGE, non-{collection} return is a caller-programming
        // error, not a staleness question, so that specific shape check
        // still throws immediately without consuming a retry attempt or
        // an extra read.
        var isNoChange = (raw === NO_CHANGE);
        var proposed = null, extra = null;
        if(!isNoChange){
          if(Array.isArray(raw)){
            proposed = raw; extra = null;
          } else if(raw && typeof raw === 'object' && Array.isArray(raw.collection)){
            proposed = raw.collection; extra = raw;
          } else {
            throw new Error('LabelLibrary.mutate(): mutator must return an array (the proposed collection), LabelLibrary.NO_CHANGE, or { collection: [...], ...}.');
          }
          if(!isValidCollection(proposed)){
            throw new Error('LabelLibrary.mutate(): the mutator\'s proposed collection is not valid -- every record needs a valid, unique id (use LabelLibrary.generateId() for a new one).');
          }
        }

        // Compare-before-finalize (the same discipline init()'s migration
        // retry already uses) -- applied to BOTH outcomes, not just a
        // write. A NO_CHANGE decision computed from `before` is only
        // trustworthy if `before` is still the actual current state: if
        // storage moved on while the mutator was running, that decision
        // may now be wrong (something the mutator would have handled
        // differently against the fresh data) and must never be returned
        // as though it were still accurate. Re-run the mutator against
        // the fresh snapshot instead, bounded, exactly as a stale write
        // proposal already does.
        var current = readRaw(namespace);
        if(JSON.stringify(current) !== JSON.stringify(before)){
          attempt++;
          if(attempt > MAX_MUTATION_RETRIES) throw LibraryMutationRetriesExhaustedError(namespace);
          continue;
        }

        assertMutationNotStale(namespace, generation); // final check, immediately before finalizing either outcome

        if(isNoChange){
          // Confirmed against the freshest available read (current ===
          // before, just verified above): genuinely nothing to persist.
          // Still safe -- and correct -- to sync the cache to this
          // confirmed-current value even though no write happened, so a
          // caller relying on getSaved() right after a NO_CHANGE outcome
          // never sees an older in-memory cache than what's actually
          // persisted.
          var syncedCache = deepClone(current);
          _cache = syncedCache;
          return { committed: false, collection: deepClone(syncedCache) };
        }

        writeRaw(namespace, proposed);

        var snapshot = deepClone(proposed);
        _cache = snapshot;
        // Same targeted reconciliation persistSaved() already used:
        // release exactly the pending reservations that made it into
        // THIS write; leave any other in-flight generateId() reservation
        // (a different, still-unpersisted mutation) untouched.
        var persistedIds = new Set(snapshot.map(function(e){ return e.id; }));
        _pendingGeneratedIds.forEach(function(id){
          if(persistedIds.has(id)) _pendingGeneratedIds.delete(id);
        });

        var result = { committed: true, collection: deepClone(snapshot) };
        if(extra){
          Object.keys(extra).forEach(function(k){
            if(k === 'collection') return;
            result[k] = deepClone(extra[k]);
          });
        }
        return result;
      }
    });
  }

  // review point 5 (final corrections round): the collision set includes
  // every id already handed out by an EARLIER generateId() call this
  // "session" (since the cache was last adopted) as well as whatever's
  // already in _cache, so two calls made back-to-back before either
  // result is persisted can never return the same id.
  //
  // review point (B0 review round, missed correction): requireReady()
  // only proves setNamespace() has resolved -- it says nothing about
  // whether init() has actually completed. Between setNamespace() and a
  // successful init(), _cache is still null, and `(_cache || [])` was
  // silently treating that as "zero existing ids" -- so a caller who
  // (incorrectly) called generateId() before awaiting init() would get
  // back an id validated against an EMPTY collision set, never checked
  // against whatever ids are actually already persisted for this
  // namespace. Fail closed instead: generateId() requires a resolved
  // namespace AND a successfully initialised cache, throws a clear,
  // distinguishable error otherwise, and -- critically -- must never
  // reach randomId() or touch _pendingGeneratedIds on that failure path,
  // since no id was actually generated or reserved.
  function generateId(){
    requireReady();
    if(_cache === null){
      throw new Error('LabelLibrary.generateId(): called before init() completed -- await LabelLibrary.init() first, so new ids are checked against every id already persisted for this namespace.');
    }
    var existing = new Set(_cache.map(function(e){ return e.id; }));
    _pendingGeneratedIds.forEach(function(id){ existing.add(id); });
    var id = randomId(existing);
    _pendingGeneratedIds.add(id);
    return id;
  }

  function findById(arr, id){
    if(!isValidId(id)) return null;
    for(var i = 0; i < arr.length; i++){ if(arr[i].id === id) return arr[i]; }
    return null;
  }
  function findIndexById(arr, id){
    if(!isValidId(id)) return -1;
    for(var i = 0; i < arr.length; i++){ if(arr[i].id === id) return i; }
    return -1;
  }

  // Legacy builder.html?open=<index> migration shim ONLY (Checkpoint B) --
  // resolves a numeric index against an ALREADY-migrated array (so the
  // returned record always has a valid id already), never treated as a
  // permanent identity system. Composer's own ?label= must never call this.
  //
  // review point 4 (final corrections round): parseInt() is permissive --
  // parseInt('5abc', 10) === 5, parseInt('  5', 10) === 5,
  // parseInt('5.7', 10) === 5 -- so a garbage-suffixed, whitespace-padded
  // or decimal URL param would silently resolve to a real record instead
  // of failing closed. The COMPLETE string must be a clean non-negative
  // integer, with nothing else in it.
  var LEGACY_INDEX_FORMAT = /^\d+$/;
  function resolveLegacyIndex(arr, idxStr){
    if(typeof idxStr !== 'string' || !LEGACY_INDEX_FORMAT.test(idxStr)) return null;
    var idx = parseInt(idxStr, 10);
    if(idx < 0 || idx >= arr.length) return null;
    return arr[idx];
  }

  // ── Storage-event reconciliation ─────────────────────────────────────
  // review point 4: capture the namespace AND its generation counter at
  // the moment the event arrives; re-check BOTH (plus that the key still
  // matches the now-current namespace) immediately before adopting
  // anything into _cache or handing it to onChange. A slow-resolving poll
  // for a namespace this tab has since left (sign-out, account switch)
  // must never land its stale result in the new namespace's cache.
  function reconcileFromStorageEvent(key){
    if(!_namespaceResolved || !_namespace || !key) return Promise.resolve();
    var capturedNamespace = _namespace;
    var capturedGeneration = _namespaceGeneration;
    if(key !== keyFor(capturedNamespace)) return Promise.resolve();
    return pollUntilAllValid(capturedNamespace, { intervalMs: 20, timeoutMs: 200 })
      .then(function(arr){
        if(arr === null || !isValidCollection(arr)) return; // never adopt an invalid/ambiguous read
        if(!_namespaceResolved || _namespace !== capturedNamespace || _namespaceGeneration !== capturedGeneration) return;
        if(keyFor(_namespace) !== key) return;
        // review point 3 (surgical fixes round): this is a same-namespace
        // storage-event REFRESH, not a namespace change -- it must never
        // release still-unpersisted generateId() reservations made by this
        // tab. Using adoptCache() here would let another generateId() call
        // hand out an id this tab already gave to a caller who hasn't
        // persisted it yet. Use refreshCacheFromReconciliation() instead.
        refreshCacheFromReconciliation(deepClone(arr));
        if(_onChange) _onChange(deepClone(arr));
      })
      .catch(function(){ /* fail closed: keep the existing last-known-good cache */ });
  }
  function onChange(cb){ _onChange = cb; }
  // review point 8 (final corrections round): a 'storage' event's
  // storageArea identifies WHICH Storage object actually changed. Real
  // browsers always set it; only a manually-constructed test/synthetic
  // event might omit it. When it IS present and doesn't reference this
  // page's own localStorage (e.g. it fired for sessionStorage, or some
  // unrelated Storage instance that coincidentally used the same key
  // string), the event is not ours to reconcile and must be ignored
  // outright -- never treated as a same-key localStorage change just
  // because the key string matches. When storageArea isn't available at
  // all, the existing key-only handling is the best information there is,
  // so it proceeds as before.
  function handleStorageEvent(evt){
    if(evt && Object.prototype.hasOwnProperty.call(evt, 'storageArea') && evt.storageArea && evt.storageArea !== global.localStorage){
      return Promise.resolve();
    }
    return reconcileFromStorageEvent(evt ? evt.key : null);
  }
  if(global.addEventListener){
    global.addEventListener('storage', handleStorageEvent);
  }

  // review point 6 (Checkpoint B0): persistSaved() is deliberately NOT on
  // the public, page-facing API from here on -- it accepts a whole-array
  // snapshot and writes it unconditionally with no coordination and no
  // compare-before-write check, which is exactly the "last write wins,
  // blindly overwrites newer storage" contract Checkpoint B0 replaces.
  // It remains available under _internal (test-only, see below) because
  // several existing lower-level identity/spec tests legitimately use it
  // as a direct "just persist this exact snapshot" primitive, independent
  // of the coordination layer under test elsewhere. Every real,
  // page-facing mutation (create/save, edit, duplicate, delete, and any
  // future library-changing operation) must go through mutate() instead.
  global.LabelLibrary = {
    ID_FORMAT: ID_FORMAT,
    isValidId: isValidId,
    setNamespace: setNamespace,
    reset: reset,
    init: init,
    getSaved: getSaved,
    mutate: mutate,
    NO_CHANGE: NO_CHANGE,
    generateId: generateId,
    findById: findById,
    findIndexById: findIndexById,
    resolveLegacyIndex: resolveLegacyIndex,
    onChange: onChange,
  };

  // review point 11: _internal is a genuine test-only surface, not
  // something a production page can depend on even by accident -- it's
  // only attached when the loading script has explicitly opted in by
  // setting this flag BEFORE this file runs (the test harness below does
  // exactly that). No production page sets it, so LabelLibrary._internal
  // simply does not exist there.
  if(global.__LABEL_LIBRARY_TEST__){
    global.LabelLibrary._internal = {
      computeMigratedArray: computeMigratedArray,
      canonicalize: canonicalize,
      deterministicId: deterministicId,
      readRaw: readRaw,
      writeRaw: writeRaw,
      keyFor: keyFor,
      isValidCollection: isValidCollection,
      randomId: randomId,
      deepClone: deepClone,
      reconcileFromStorageEvent: reconcileFromStorageEvent,
      handleStorageEvent: handleStorageEvent,
      debugPendingIds: function(){ return Array.from(_pendingGeneratedIds); },
      // Checkpoint B0: persistSaved() is test-only from here on -- see the
      // comment above global.LabelLibrary for why. Production/page code
      // must never reach this; only this test file (and only where it's
      // deliberately testing the raw primitive, or using it as ordinary
      // test-fixture setup) does.
      persistSaved: persistSaved,
    };
  }

})(typeof window !== 'undefined' ? window : globalThis);
