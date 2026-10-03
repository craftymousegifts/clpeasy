// ── SdsDocCheck — supplier-document applicability for the fragrance % ────
// (3 Oct 2026, owner decisions 1-4.) Shared by builder.html and print.html so
// the Builder and the Print Sheet Composer apply exactly the same rule.
// Pure functions only: no DOM, no storage, no rendering.
//
// CLPeasy EVIDENCE REQUIREMENT (product policy, not a statement that the law
// demands an exact match): CLPeasy only uses supplier hazard information for
// a label when the maker confirms it is a FINISHED-PRODUCT document that
// covers their product type and states the SAME fragrance percentage as the
// product. Anything else (concentrated-oil SDS, unknown document, a different
// % higher OR lower, a document for another product, an unstated %) is not
// accepted, and the maker is guided to ask the supplier.
//
// PRECISION: percentages are compared exactly as numbers, never rounded to
// make a match, and no tolerance is applied. 9.0909 is not 9.1; 10 and 10.0
// are equal. Equal numbers are only CONSISTENT answers: they never prove the
// document applies (CLPeasy cannot read the document).
//
// RANGES / "UP TO": a document stating a range or an upper limit is not
// accepted while the owner decision is open. It is reported separately
// ('doc-pct-range') from a single higher-% document ('lower'), because
// explicit supplier coverage is different from a maker assuming that a
// higher-% document covers a lower %. No acknowledgement bypasses either.
//
// CONFIRMATION: a label is "verified" only while the fragrance %, product type
// and hazard information are the same as when the maker last confirmed the
// document (Builder, leaving Step 3). Any change requires re-confirmation.
//
// WRITTEN SUPPLIER CONFIRMATION ('supplier-confirmed'): the supplier has
// confirmed in writing that their GB CLP information applies to the maker's
// product AT THE MAKER'S EXACT PERCENTAGE. This is supplier evidence for the
// actual formulation (the supplier makes the call, e.g. about a rounded or
// range document); it is not the maker's own assumption. Accepted only when
// the confirmed % equals the maker's % exactly and names their product group,
// with who confirmed it, when, and which document it refers to. CLPeasy
// cannot see or check the confirmation. Whether CLPeasy accepts this route at
// all is an OWNER DECISION: SUPPLIER_CONFIRMATION_ACCEPTED. When false the
// option is hidden and no message tells the maker to record one.
(function (global) {
  'use strict';
  const SUPPLIER_CONFIRMATION_ACCEPTED = true;

  // Product-type groups. Candles and wax melts are NOT interchangeable
  // (owner decision 4): a document covers both only if the supplier names both.
  const GROUP_BY_TYPE = {
    'Scented Candle': 'candle', 'Soy Candle': 'candle', 'Votive Candle': 'candle', 'Tea Light Candle': 'candle',
    'Pillar Candle': 'candle', 'Advent Calendar Candle': 'candle',
    'Wax Melt': 'waxmelt', 'Wax Tart': 'waxmelt', 'Snap Bar': 'waxmelt', 'Wax Melt Clamshell': 'waxmelt',
    'Advent Calendar Wax Melt': 'waxmelt', 'Wax Melt Bag': 'waxmelt', 'Wax Melt Bouquet': 'waxmelt',
    'Reed Diffuser': 'reed', 'Electric Diffuser': 'plugin', 'Plugin Diffuser': 'plugin', 'Car Diffuser': 'cardiffuser',
    'Room Spray': 'spray', 'Linen Spray': 'spray', 'Car Air Freshener Spray': 'carspray',
    'Scented Sachet': 'sachet', 'Potpourri': 'potpourri'
  };
  // Document "product covered" choice -> groups it covers.
  const DOC_COVERS = {
    candle: ['candle'], waxmelt: ['waxmelt'], 'candle+waxmelt': ['candle', 'waxmelt'],
    reed: ['reed'], plugin: ['plugin'], cardiffuser: ['cardiffuser'],
    spray: ['spray'], carspray: ['carspray'], sachet: ['sachet'], potpourri: ['potpourri'], other: []
  };
  const DOC_BASE_OPTIONS = [
    ['candle', 'Candles'],
    ['waxmelt', 'Wax melts'],
    ['candle+waxmelt', 'Candles and wax melts (the document names both)'],
    ['reed', 'Reed diffusers'],
    ['plugin', 'Electric or plug-in diffusers'],
    ['cardiffuser', 'Car diffusers'],
    ['spray', 'Room or linen sprays'],
    ['carspray', 'Car air freshener sprays'],
    ['sachet', 'Scented sachets'],
    ['potpourri', 'Potpourri'],
    ['other', 'Something else / not stated']
  ];

  // A single number, 0 < n <= 100, optionally followed by "%".
  // Decimal comma accepted. Returns the number or null (ranges, words -> null).
  function parsePct(value) {
    const t = String(value == null ? '' : value).trim().replace(',', '.').replace(/\s*%\s*$/, '');
    if (!/^\d{1,3}(?:\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
  }

  // "8-10%", "8 to 10", "up to 10%", "max 10%", "≤10%", "less than 10%"
  function isRangeOrUpTo(value) {
    const t = String(value == null ? '' : value).trim().toLowerCase();
    return /\d\s*(?:-|–|—|to)\s*\d/.test(t) || /(?:up\s*to|max(?:imum)?|not\s+more\s+than|less\s+than|below|under|≤|<=|<)\s*\d/.test(t);
  }
  // True when the maker's exact % only rounds to the document's figure at the
  // document's precision (9.0909 vs 9.1). Used for wording only, never to accept.
  function _roundsTo(actual, docRaw, docPct) {
    const m = String(docRaw).trim().replace(',', '.').replace(/\s*%\s*$/, '').split('.');
    const dp = m[1] ? m[1].length : 0;
    return Number(actual.toFixed(dp)) === docPct;
  }

  function _list(v) {
    const a = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
    return a.map(x => String(x).trim()).filter(Boolean).sort();
  }
  // What the confirmation is bound to. Hazard order is ignored (not a change
  // in content); any added/removed/changed code, pictogram, signal word or
  // named sensitiser is a change.
  function confirmationFor(rec) {
    rec = rec || {};
    const pct = parsePct(rec.fragLoad);
    const d = rec.sdsDoc || {};
    return {
      fragPct: pct === null ? null : pct,
      productType: String(rec.productType || ''),
      hazards: JSON.stringify({
        h: _list(rec.hStatements), p: _list(rec.pStatements), pictos: _list(rec.pictograms),
        signal: String(rec.signal || '').trim().toUpperCase(), sens: _list(rec.sensitisers)
      }),
      doc: JSON.stringify({ kind: d.kind || '', pct: parsePct(d.pct), base: d.base || '',
        supplier: String(d.supplier || '').trim(), cdate: String(d.cdate || '').trim(), cref: String(d.cref || '').trim() })
    };
  }

  // Applicability of the maker's answers for this product. {ok, code, message}
  function evaluate(rec) {
    rec = rec || {};
    const d = rec.sdsDoc || {};
    const actual = parsePct(rec.fragLoad);
    const type = String(rec.productType || '');
    const typeLc = type ? type.toLowerCase() : 'product';
    const ask = pct => ' Ask your supplier for GB CLP information for your ' + typeLc + ' at ' + (pct != null ? pct + '%' : 'the percentage you use') + '.';
    // Where the supplier may decide coverage (rounding, ranges), point to the
    // written-confirmation route only when the owner has accepted it.
    const confirmRoute = pct => SUPPLIER_CONFIRMATION_ACCEPTED
      ? ' If your supplier confirms in writing that their GB CLP information applies to your ' + typeLc + ' at exactly ' + pct + '%, choose "My supplier has confirmed in writing" above and record it. Otherwise, ask your supplier for GB CLP information stating ' + pct + '%.'
      : ask(pct);
    if (actual === null) return { ok: false, code: 'actual-missing', message: 'Enter the fragrance percentage in your finished product (Step 2) as a single number, for example 8 or 8.5. CLPeasy needs it to check your supplier information covers your product.' };
    if (!d.kind) return { ok: false, code: 'kind-missing', message: 'Choose what your supplier document describes.' };
    if (d.kind === 'concentrate') return { ok: false, code: 'concentrate', message: '⛔ An SDS for the fragrance oil on its own describes the concentrated oil, not your finished product. Its hazards are not the hazards of a product containing ' + actual + '%, and CLPeasy does not calculate them.' + ask(actual) };
    if (d.kind === 'unsure') return { ok: false, code: 'unsure', message: '⛔ Check the document title and Sections 1 and 2: it should name a finished product (for example "candle") and the fragrance percentage it covers. If it doesn\'t, CLPeasy can\'t use it.' + ask(actual) };
    if (d.kind === 'supplier-confirmed') return _evaluateConfirmation(d, actual, type, typeLc, ask);
    if (d.kind !== 'finished') return { ok: false, code: 'kind-missing', message: 'Choose what your supplier document describes.' };
    const docPct = parsePct(d.pct);
    if (docPct === null && isRangeOrUpTo(d.pct)) return { ok: false, code: 'doc-pct-range', message: '⛔ Your document states a range or an "up to" percentage. CLPeasy doesn\'t decide whether a range covers your product, even when it includes ' + actual + '%: that is for your supplier.' + confirmRoute(actual) };
    if (docPct === null) return { ok: false, code: 'doc-pct-missing', message: 'Enter the single fragrance percentage the document states, for example 10. A range or no stated percentage can\'t be used.' + ask(actual) };
    // Unknown values include answers saved before candles and wax melts were
    // split (old 'wax' / 'diffuser' / 'spray'): the maker must choose again.
    if (!d.base || !Object.prototype.hasOwnProperty.call(DOC_COVERS, d.base)) return { ok: false, code: 'base-missing', message: 'Choose the product the document covers.' };
    const myGroup = GROUP_BY_TYPE[type] || null;
    const covers = DOC_COVERS[d.base] || [];
    if (!myGroup || d.base === 'other') return { ok: false, code: 'base-unverified', message: '⛔ CLPeasy can only match documents for the product types listed. For any other product, use supplier CLP information written for your exact product.' + ask(actual) };
    if (covers.indexOf(myGroup) === -1) return { ok: false, code: 'base-mismatch', message: '⛔ This document covers a different product. What the product is made with (wax, diffuser base, spray base) changes the hazards, and CLPeasy only uses a document that names your type of product. It can\'t be used for your ' + typeLc + '.' + ask(actual) };
    const rounding = _roundsTo(actual, d.pct, docPct);
    const tail = rounding ? ' The difference may only be rounding, but CLPeasy does not round or apply a tolerance; whether the document applies is for your supplier to say.' + confirmRoute(actual) : ask(actual);
    if (actual > docPct) return { ok: false, code: 'higher', message: '⛔ You use ' + actual + '%, more than the ' + docPct + '% this document states. Hazards can be more severe or additional at a higher percentage.' + tail };
    if (actual < docPct) return { ok: false, code: 'lower', message: '⛔ You use ' + actual + '%, less than the ' + docPct + '% this document states. CLPeasy only uses supplier information for the exact percentage you use: some label warnings depend on concentration thresholds (for example a sensitiser warning can change from H317 to "EUH208 Contains …"), so a document for a different percentage may not give the right label. A document for a higher percentage is not assumed to cover a lower one.' + tail };
    return { ok: true, code: 'match', message: '✓ Your answers are consistent: a finished-product document for your type of product stating ' + actual + '%, the percentage you use. CLPeasy can\'t read the document itself, so make sure it is your supplier\'s GB CLP information for this fragrance in your ' + typeLc + '. Paste its Section 2.2 below.' };
  }

  function _validDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
    if (!m) return false;
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return false;
    return dt.getTime() <= Date.now() + 864e5; // not in the future (one day's allowance for time zones)
  }
  function _evaluateConfirmation(d, actual, type, typeLc, ask) {
    if (!SUPPLIER_CONFIRMATION_ACCEPTED) return { ok: false, code: 'kind-missing', message: 'Choose what your supplier document describes.' };
    const conf = parsePct(d.pct);
    if (conf === null) return { ok: false, code: 'conf-pct-missing', message: 'Enter the single percentage your supplier confirmed in writing, exactly as written, for example ' + actual + '. A range or "up to" figure is not a confirmation for your exact percentage.' + ask(actual) };
    if (conf !== actual) return { ok: false, code: 'conf-pct-mismatch', message: '⛔ The written confirmation must name the percentage you use: ' + actual + '%. It names ' + conf + '%. CLPeasy does not round or apply a tolerance.' + ask(actual) };
    if (!d.base || !Object.prototype.hasOwnProperty.call(DOC_COVERS, d.base)) return { ok: false, code: 'base-missing', message: 'Choose the product your supplier confirmed.' };
    const myGroup = GROUP_BY_TYPE[type] || null;
    if (!myGroup || d.base === 'other') return { ok: false, code: 'base-unverified', message: '⛔ CLPeasy can only record a confirmation for the product types listed.' + ask(actual) };
    if ((DOC_COVERS[d.base] || []).indexOf(myGroup) === -1) return { ok: false, code: 'base-mismatch', message: '⛔ The confirmation must name your type of product. It can\'t be used for your ' + typeLc + '.' + ask(actual) };
    if (String(d.supplier || '').trim().length < 2) return { ok: false, code: 'conf-supplier-missing', message: 'Enter the supplier who confirmed it.' };
    if (!_validDate(d.cdate)) return { ok: false, code: 'conf-date-missing', message: 'Enter the date of the written confirmation (not a future date).' };
    if (String(d.cref || '').trim().length < 2) return { ok: false, code: 'conf-ref-missing', message: 'Enter which supplier document the confirmation refers to (its title or reference), so you can find it again.' };
    return { ok: true, code: 'confirmed-match', message: '✓ Your answers are consistent: you have recorded written confirmation from ' + String(d.supplier).trim() + ' (' + String(d.cdate).trim() + ') that their GB CLP information applies to your ' + typeLc + ' at ' + actual + '%. CLPeasy can\'t see or check that confirmation, so keep it with your records. Paste the Section 2.2 from the document it refers to below.' };
  }

  // 'verified' | 'not-checked' (never confirmed, e.g. a label saved before
  // this check existed) | 'needs-recheck' (changed since) | 'not-covered'
  function status(rec) {
    rec = rec || {};
    const d = rec.sdsDoc;
    const c = d && d.confirmed;
    if (!d || !d.kind || !c || typeof c !== 'object') return 'not-checked';
    if (!evaluate(rec).ok) return 'not-covered';
    const now = confirmationFor(rec);
    if (c.fragPct !== now.fragPct || c.productType !== now.productType || c.hazards !== now.hazards || c.doc !== now.doc) return 'needs-recheck';
    return 'verified';
  }
  function isVerified(rec) { return status(rec) === 'verified'; }

  function exportBlockMessage(rec) {
    const s = status(rec);
    if (s === 'verified') return null;
    if (s === 'needs-recheck') return 'The fragrance percentage, product type, hazard information or document details changed after you confirmed your supplier document. Go to Step 3 (Hazards), check "Check your supplier document first" still matches, and continue to Step 5 to download.';
    if (s === 'not-covered') return evaluate(rec).message.replace(/^[⛔✓]\s*/, '') + ' Update Step 3 (Hazards) before downloading.';
    return 'Not ready to download yet. Confirm which supplier document this label\'s hazard information comes from: go to Step 3 (Hazards), complete "Check your supplier document first", and continue to Step 5. Your design is kept, and you can still save it as a draft.';
  }

  const api = { SUPPLIER_CONFIRMATION_ACCEPTED, isRangeOrUpTo, GROUP_BY_TYPE, DOC_COVERS, DOC_BASE_OPTIONS, parsePct, confirmationFor, evaluate, status, isVerified, exportBlockMessage };
  global.SdsDocCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
