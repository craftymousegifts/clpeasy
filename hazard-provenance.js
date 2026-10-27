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
//   * saved on a day BEFORE the cut-off -- the label itself or a saved
//     version-history entry of THE SAME label with the same hazard
//     information. Release-day records with no earlier evidence are not
//     accepted (founder decision);
//   * after that first run the namespace is frozen.
// Legacy status belongs to a label's identity (its id) AND its exact hazard
// information: an unrelated label with identical codes never gets it. It
// passes to a new id only by duplicating, or saving as new, a label that is
// itself a registered older label with that same hazard information
// (inheritLegacy). Missing provenance never grants permission.
//
// Cut-off day = the earlier of LOCKDOWN_RELEASE_DATE (if set) and the day
// this code first ran in this browser for the namespace. See the constant.
//
// The register lives in this browser only, like the labels themselves, so a
// person editing their own storage can forge it -- the same limit every
// client-side download block has. Pure logic plus explicit storage access.
(function (global) {
  'use strict';
  // Production release day (YYYY-MM-DD, UK) of the lockdown, set in the
  // release commit. null = not set: the cut-off is then the day this code
  // first runs in each browser. It must NEVER be set earlier than the real
  // deploy day (genuine labels saved in between would be locked out); a
  // later date is harmless (the first-run day then applies).
  const LOCKDOWN_RELEASE_DATE = null;
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
  // Local calendar day (savedAt is written in local time too).
  function localDay(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // The earlier of the configured release day and the first-run day.
  function cutoffDay(now, releaseDate) {
    const first = localDay(now || new Date());
    const rel = releaseDate === undefined ? LOCKDOWN_RELEASE_DATE : releaseDate;
    return rel && /^\d{4}-\d{2}-\d{2}$/.test(rel) && rel < first ? rel : first;
  }
  function isEligible(r, cutoff) {
    const day = savedDay(r);
    return isPreLockdownManual(r) && !!day && !!cutoff && day < cutoff;
  }

  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  // register = { ids: { <label id>: [fingerprint, ...] }, wording: { <fp>: {...} }, cutoff, frozenAt }
  function classify(r, register) {
    if (!hasHazardData(r)) return 'none';
    if (isExtracted(r)) return 'extracted';
    const fps = register && r && r.id && has(register.ids, r.id) ? register.ids[r.id] : null;
    if (Array.isArray(fps) && fps.includes(fingerprint(r))) return 'legacy-manual';
    return 'unverified';
  }
  function legacyEntry(r, register) {
    if (classify(r, register) !== 'legacy-manual') return null;
    const fp = fingerprint(r);
    return { fp, wording: (has(register.wording, fp) && register.wording[fp]) || {} };
  }
  function addLegacy(register, id, r, wordingFor) {
    const out = { ids: Object.assign({}, register && register.ids), wording: Object.assign({}, register && register.wording),
      cutoff: register && register.cutoff, frozenAt: register && register.frozenAt };
    const fp = fingerprint(r);
    out.ids[id] = (out.ids[id] || []).includes(fp) ? out.ids[id] : (out.ids[id] || []).concat([fp]);
    if (!has(out.wording, fp)) out.wording[fp] = wordingFor ? wordingFor(r) : {};
    return out;
  }

  const keyFor = (base, ns) => base + '__u_' + ns;
  function readJSON(storage, key, fallback) {
    try { const v = JSON.parse(storage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : fallback; }
    catch (e) { return fallback; }
  }
  function readRegister(ns, storage) {
    storage = storage || global.localStorage;
    const r = readJSON(storage, keyFor(REGISTER_BASE, ns), {});
    return { ids: r.ids || {}, wording: r.wording || {}, cutoff: r.cutoff || null, frozenAt: r.frozenAt || null };
  }
  function isFrozen(ns, storage) {
    storage = storage || global.localStorage;
    try { return !!storage.getItem(keyFor(FREEZE_BASE, ns)); } catch (e) { return false; }
  }

  // Candidate records: saved labels plus every saved version-history entry,
  // each registered under the id of the saved label it belongs to.
  function buildRegister(records, history, wordingFor, cutoff) {
    let reg = { ids: {}, wording: {}, cutoff: cutoff, frozenAt: null };
    const ids = new Set((records || []).map(r => r && r.id).filter(Boolean));
    (records || []).forEach(r => { if (r && r.id && isEligible(r, cutoff)) reg = addLegacy(reg, r.id, r, wordingFor); });
    Object.keys(history || {}).forEach(k => (Array.isArray(history[k]) ? history[k] : []).forEach(v => {
      if (!isEligible(v, cutoff)) return;
      const owners = v && v.id && ids.has(v.id) ? [v.id]
        : (records || []).filter(r => r && r.id && (r.scentName + '|' + r.productType) === k).map(r => r.id);
      owners.forEach(id => { reg = addLegacy(reg, id, v, wordingFor); });
    }));
    return reg;
  }

  // One-time registration for a namespace, then frozen. Returns the
  // namespace's register (only inheritLegacy() adds to it afterwards).
  function runMigration(opts) {
    const storage = opts.storage || global.localStorage;
    const ns = opts.ns;
    if (isFrozen(ns, storage)) return readRegister(ns, storage);
    const now = opts.now || new Date();
    const history = readJSON(storage, keyFor(HISTORY_BASE, ns), {});
    const built = buildRegister(opts.records, history, opts.wordingFor, cutoffDay(now, opts.releaseDate));
    const prev = readRegister(ns, storage);
    const register = { ids: Object.assign({}, built.ids, prev.ids), wording: Object.assign({}, built.wording, prev.wording),
      cutoff: built.cutoff, frozenAt: now.toISOString() };
    try {
      storage.setItem(keyFor(REGISTER_BASE, ns), JSON.stringify(register));
      storage.setItem(keyFor(FREEZE_BASE, ns), register.frozenAt);
    } catch (e) { /* storage full or blocked: not frozen, retried next load */ }
    return register;
  }

  // Duplicate / save-as-new of a registered older label: the new id gets the
  // same status only when the source id is registered with exactly this
  // hazard information. Returns the (possibly unchanged) register.
  function inheritLegacy(opts) {
    const storage = opts.storage || global.localStorage;
    // The page's in-memory register (if given) merged with the stored one, so
    // another tab's additions are never overwritten.
    const stored = readRegister(opts.ns, storage), mem = opts.register || {};
    const reg = Object.assign({}, stored, { ids: Object.assign({}, mem.ids), wording: Object.assign({}, mem.wording, stored.wording) });
    Object.keys(stored.ids).forEach(k => { reg.ids[k] = Array.from(new Set((reg.ids[k] || []).concat(stored.ids[k]))); });
    const src = Object.assign({}, opts.record, { id: opts.sourceId });
    if (!opts.newId || classify(src, reg) !== 'legacy-manual') return reg;
    const out = addLegacy(reg, opts.newId, src, null);
    try { storage.setItem(keyFor(REGISTER_BASE, opts.ns), JSON.stringify(out)); } catch (e) { return reg; }
    return out;
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
    savedDay, localDay, cutoffDay, isPreLockdownManual, isEligible, classify, legacyEntry, addLegacy, readRegister, isFrozen,
    buildRegister, runMigration, inheritLegacy, reconcile, BLOCK_HEADING, BLOCK_MESSAGE, RESTORE_REFUSED, TAG };
  global.HazardProvenance = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
