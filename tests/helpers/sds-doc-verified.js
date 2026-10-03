// Test helper (3 Oct 2026): Composer fixtures are saved labels. Since the
// supplier-document confirmation is required for export, a fixture that
// stands for a label the maker completed in the Builder carries the same
// confirmation the Builder would have saved, made by the production module
// (sds-doc-check.js). It uses the record's REAL product type and fragrance %:
// a blank or unlisted type, or a missing %, throws instead of being swapped.
'use strict';
const SdsDocCheck = require('../../sds-doc-check.js');
// defaultPct: the fixture's fragrance % when the fixture never stated one
// (it becomes part of the saved record, exactly as the Builder saves it).
function withConfirmedDoc(rec, defaultPct) {
  if (defaultPct != null && !String(rec.fragLoad || '').trim()) rec = Object.assign({}, rec, { fragLoad: defaultPct });
  const group = SdsDocCheck.GROUP_BY_TYPE[rec.productType];
  if (!group) throw new Error('fixture product type is not a Builder product type: ' + JSON.stringify(rec.productType));
  const pct = SdsDocCheck.parsePct(rec.fragLoad);
  if (pct === null) throw new Error('fixture has no single fragrance %: ' + JSON.stringify(rec.fragLoad));
  const out = Object.assign({}, rec, { sdsDoc: { kind: 'finished', pct: String(pct), base: group } });
  out.sdsDoc.confirmed = SdsDocCheck.confirmationFor(out);
  if (!SdsDocCheck.isVerified(out)) throw new Error('fixture could not be confirmed');
  return out;
}
module.exports = { withConfirmedDoc };
