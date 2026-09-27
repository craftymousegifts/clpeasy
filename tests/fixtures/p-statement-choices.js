// Synthetic SUPPLIER completions for the precautionary statements that need
// the supplier's selection/completion (Issue #5, M19/M20 -- see P_DEFS in
// label-render.js). Test data only: it stands in for what a maker copies
// from their supplier SDS Section 2.2, so fixtures that represent a
// COMPLETE label keep printing a finished statement. It is never a CLPeasy
// default -- the app has none.
//
// P260 uses the Annex IV condition's own example ("dusts or mists").
// P261/P302+P352/P501 use the real Nikura Section 2.2 wording already in
// tests/slash-p-code-normalisation.js ("Avoid breathing vapour or dust.",
// "IF ON SKIN: Wash with plenty of soap and water.", "Dispose of
// contents/container to approved disposal site, in accordance with local
// regulations.").
const FIXTURE_P_CHOICES = {
  'P260': { text: 'dusts or mists', source: 'maker' },
  'P261': { text: 'vapour or dust', source: 'maker' },
  'P301+P310': { text: 'a POISON CENTRE/doctor', source: 'maker' },
  'P301+P312': { text: 'a POISON CENTRE/doctor', source: 'maker' },
  'P302+P352': { text: 'soap and water', source: 'maker' },
  'P312': { text: 'a POISON CENTRE/doctor', source: 'maker' },
  'P321': { text: 'the first aid instructions', source: 'maker' },
  'P370+P378': { text: 'foam, carbon dioxide or dry powder', source: 'maker' },
  'P501': { scope: 'both', text: 'approved disposal site, in accordance with local regulations', source: 'maker' },
};
module.exports = { FIXTURE_P_CHOICES };
