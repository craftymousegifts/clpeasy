// ── HazardProvenance — where a saved label's hazard information came from ──
// CLP-007 Smart Paste lockdown (founder-approved, 26 Oct 2026). Shared by
// builder.html, my-labels.html and print.html so the Builder, My Labels and
// the Print Sheet Composer apply exactly the same rule.
//
// New hazard (H/P) information can only come from Smart Paste extraction.
// Labels saved before the lockdown with manually chosen H/P statements stay
// printable (read-only) only if they are recorded, ONCE, in a per-browser
// register when this code first runs for that account/guest namespace:
//   * written by pre-lockdown code (schemaVersion missing or < 2);
//   * not extracted (no hazardFromExtraction and no C3 sdsSignal inference);
//   * saved on a day BEFORE the release date -- the label itself or a saved
//     version-history entry with the same hazard information. Release-day
//     records with no earlier evidence are not accepted (founder decision);
//   * after that first run the namespace is frozen and nothing is ever added.
// Legacy status belongs to the hazard information (its fingerprint), not to
// a record id: a duplicate or a resize keeps it, a stale pre-release tab that
// resaves the same label keeps it, any different hazard information never
// gets it. Missing provenance never grants permission ('unverified' blocks).
//
// The register lives in this browser only, like the labels themselves, so a
// person editing their own storage can forge it -- the same limit every
// client-side download block has. Pure logic plus explicit storage access.
(function (global) {
  'use strict';
  // UK calendar date (YYYY-MM-DD) of the lockdown deploy. Records saved on or
  // after this day by pre-lockdown code are not accepted as older labels.
  // MUST equal the production release day (release checklist item).
  const LOCKDOWN_RELEASE_DATE = '2026-10-27';
  const SCHEMA_VERSION = 2;
  const REGISTER_BASE = 'clpeasy_legacy_hazard';
  const FREEZE_BASE = 'clpeasy_hazard_lockdown';
  const HISTORY_BASE = 'clpeasy_history';

  const codes = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(String);

  function hasHazardData(r) {
    r = r || {};
    return !!(codes(r.hStatements).length || codes(r.pStatements).length ||
      list(r.pictograms).length || list(r.sensitisers).length || list(r.p280Items).length ||
      String(r.p280Other || '').trim() || r.signal);
  }
  // Same rule as the Builder's C3 restore (moved here unchanged).
  function isExtracted(r) {
    r = r || {};
    return r.hazardFromExtraction === true ||
      (r.hazardFromExtraction === undefined && typeof r.sdsSignal === 'string' && r.sdsSignal.trim() !== '');
  }
  // The hazard information a maker could ever have chosen. The signal word
  // and pictograms are left out on purpose: for labels without supplier
  // wording the Builder derives both from the H codes on every update.
  function fingerprint(r) {
    r = r || {};
    return JSON.stringify([codes(r.hStatements), codes(r.pStatements), list(r.sensitisers).sort(),
      list(r.p280Items).sort(), String(r.p280Other || '').trim()]);
  }
  // savedAt has always been written as toLocaleDateString('en-GB').
  function savedDay(r) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String((r && r.savedAt) || '').trim());
    return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
  }
  function isPreLockdownManual(r) {
    return !!r && hasHazardData(r) && !isExtracted(r) && !(Number(r.schemaVersion) >= SCHEMA_VERSION);
  }
  function isEligible(r, releaseDate) {
    const day = savedDay(r);
    return isPreLockdownManual(r) && !!day && day < (releaseDate || LOCKDOWN_RELEASE_DATE);
  }

  function classify(r, register) {
    if (!hasHazardData(r)) return 'none';
    if (isExtracted(r)) return 'extracted';
    if (register && Object.prototype.hasOwnProperty.call(register, fingerprint(r))) return 'legacy-manual';
    return 'unverified';
  }
  function legacyEntry(r, register) {
    return classify(r, register) === 'legacy-manual' ? register[fingerprint(r)] : null;
  }

  const keyFor = (base, ns) => base + '__u_' + ns;
  function readJSON(storage, key, fallback) {
    try { const v = JSON.parse(storage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : fallback; }
    catch (e) { return fallback; }
  }
  function readRegister(ns, storage) {
    storage = storage || global.localStorage;
    return readJSON(storage, keyFor(REGISTER_BASE, ns), {});
  }
  function isFrozen(ns, storage) {
    storage = storage || global.localStorage;
    try { return !!storage.getItem(keyFor(FREEZE_BASE, ns)); } catch (e) { return false; }
  }

  // Candidate records: saved labels plus every saved version-history entry.
  function buildRegister(records, history, wordingFor, releaseDate, nowISO) {
    const out = {};
    const add = r => {
      if (!isEligible(r, releaseDate)) return;
      const fp = fingerprint(r);
      if (!out[fp]) out[fp] = { wording: wordingFor ? wordingFor(r) : {}, acceptedAt: nowISO };
    };
    (records || []).forEach(add);
    Object.keys(history || {}).forEach(k => (Array.isArray(history[k]) ? history[k] : []).forEach(add));
    return out;
  }

  // One-time registration for a namespace, then frozen for good. Returns the
  // namespace's register (unchanged once frozen).
  function runMigration(opts) {
    const storage = opts.storage || global.localStorage;
    const ns = opts.ns;
    if (isFrozen(ns, storage)) return readRegister(ns, storage);
    const nowISO = (opts.now || new Date()).toISOString();
    const history = readJSON(storage, keyFor(HISTORY_BASE, ns), {});
    const register = Object.assign(buildRegister(opts.records, history, opts.wordingFor, opts.releaseDate, nowISO),
      readRegister(ns, storage));
    try {
      storage.setItem(keyFor(REGISTER_BASE, ns), JSON.stringify(register));
      storage.setItem(keyFor(FREEZE_BASE, ns), nowISO);
    } catch (e) { /* storage full or blocked: not frozen, retried next load */ }
    return register;
  }

  // Keeps each older label's frozen wording on the record itself (a stale
  // pre-release tab rewrites records without it). Returns a new array, or
  // null when nothing needs to change.
  function reconcile(records, register) {
    let changed = false;
    const out = (records || []).map(r => {
      const entry = legacyEntry(r, register);
      if (!entry) return r;
      const w = entry.wording || {};
      if (JSON.stringify(r.legacyWording || null) === JSON.stringify(w)) return r;
      changed = true;
      return Object.assign({}, r, { legacyWording: w });
    });
    return changed ? out : null;
  }

  const BLOCK_HEADING = 'Hazard information needs Smart Paste';
  const BLOCK_MESSAGE = 'Hazard information needs Smart Paste. CLPeasy can\'t confirm where this label\'s hazard information came from, so it can\'t be downloaded or printed. Clear the hazard data and use Smart Paste with your supplier\'s SDS Section 2.2. Your other details are kept.';
  const RESTORE_REFUSED = 'This version can\'t be restored because its hazard information didn\'t come from Smart Paste.';
  const TAG = 'Needs Smart Paste';

  const api = { LOCKDOWN_RELEASE_DATE, SCHEMA_VERSION, REGISTER_BASE, FREEZE_BASE, hasHazardData, isExtracted, fingerprint,
    savedDay, isPreLockdownManual, isEligible, classify, legacyEntry, readRegister, isFrozen, buildRegister, runMigration,
    reconcile, BLOCK_HEADING, BLOCK_MESSAGE, RESTORE_REFUSED, TAG };
  global.HazardProvenance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
