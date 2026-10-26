// Test helper (CLP-007 Smart Paste lockdown, 26 Oct 2026): older tests build
// their hazard fixtures by hand. Hand-entered hazard data is now only
// accepted for a genuine older label registered before the lockdown, so this
// sets the Builder state from the given codes and registers that exact
// hazard data as such an older label -- the same state a maker's pre-release
// label has after the one-time registration (hazard-provenance.js). It never
// alters the production checks themselves.
'use strict';
function script(h, p) {
  return `S.hStatements=${JSON.stringify(h)};S.pStatements=${JSON.stringify(p)};` +
    `S.hSelected=S.hStatements.split(',').map(x=>x.trim()).filter(Boolean);S.pSelected=S.pStatements.split(',').map(x=>x.trim()).filter(Boolean);` +
    `document.getElementById('h-statements').value=S.hStatements;document.getElementById('p-statements').value=S.pStatements;` +
    `window._clpLegacyRegister=Object.assign({},window._clpLegacyRegister,{[HazardProvenance.fingerprint(_hazardProvenanceRecord())]:{wording:{},acceptedAt:'test'}});`;
}
module.exports = { script };
