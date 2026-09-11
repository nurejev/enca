// ======================================================================
// WHICH POLICIES USE THIS DEPENDENCY — one implementation, four kinds.
//
// A Conditional Access policy references four kinds of object that are
// managed elsewhere: named locations, authentication contexts, authentication
// strengths and terms-of-use agreements. Every one of those tools has to
// answer the same question before it can say anything useful — "is this in
// use, and by what?" — because it decides the Unused chip, the In use count,
// whether Delete is offered at all and what its refusal says.
//
// Until build 25341 each of them answered it with its OWN private usedBy():
// locations.js:99, authcontexts.js:33, authstrengths.js:160,
// termsofuse.js:24. Four copies of one query is not a style problem. Three of
// them returned { id, name, state } and the fourth returned two more fields,
// so a caller could not be written against "a usage" without knowing which
// tool it came from; and a fix to one — the trusted-locations implication is
// the obvious one — reached exactly one of the four.
//
// So the shape is stated once, here:
//
//   CaUses.by(kind, id, raws, opts) -> [{ id, policyId, name, state, side, ...extra }]
//
//   id / policyId   the policy (`id` is kept because every existing caller
//                   reads it; policyId is the name new code should use)
//   name, state     the policy's display name and On / reportonly / Off
//   side            NORMALISED across the kinds, so a caller can group by it:
//                   included | excluded | both  (locations)
//                   granted   (a strength the policy grants)
//                   required  (an agreement the policy requires)
//                   referenced (a context the policy is scoped to)
//   extra           per kind: locations add `how` (the sentence the tool
//                   prints) and `implicit` (true when the policy never names
//                   this location and reaches it through All trusted
//                   locations — the case worth keeping separate, because
//                   flipping isTrusted changes those policies' behaviour
//                   without anybody editing them)
//
// Each tool keeps its own usedBy() as a ONE-LINE delegation to this. That is
// deliberate: it leaves every call site — the chips, the summaries, the
// delete guards, the Markdown exports — untouched, so the only thing this
// consolidation can get wrong is one of the four predicates below, and those
// are four lines each with the old code beside them in the diff.
//
// The consolidation plan calls this CaMap.usedBy. It is NOT in js/camap.js:
// that module is the per-tenant group-to-persona MAPPING, a different subject
// with its own storage and its own invariants, and bolting a cross-policy
// query onto it would make both harder to read. Same one implementation, its
// own file.
//
// Pure: no storage, no Graph, no DOM. Testable with node alone.
// ======================================================================
const CaUses = (() => {
  const lower = (v) => String(v == null ? "" : v).toLowerCase();

  // Each predicate answers with null (not used) or the extra fields for the
  // row. `side` is set here so the normalisation is visible per kind rather
  // than guessed by the caller.
  const KINDS = {
    // A location is reached by name, or implicitly through All trusted
    // locations when the location itself is trusted. opts.trusted says which,
    // because trustedness lives on the location object the tool holds.
    location(p, id, opts) {
      const l = (p.conditions && p.conditions.locations) || {};
      const inc = l.includeLocations || [], exc = l.excludeLocations || [];
      const trusted = !!(opts && opts.trusted);
      const dInc = inc.includes(id), dExc = exc.includes(id);
      const tInc = trusted && inc.includes("AllTrusted");
      const tExc = trusted && exc.includes("AllTrusted");
      if (!(dInc || dExc || tInc || tExc)) return null;
      const how = dInc && dExc ? "included + excluded"
        : dInc ? "included" : dExc ? "excluded"
        : tInc && tExc ? "included + excluded via All trusted locations"
        : tInc ? "included via All trusted locations" : "excluded via All trusted locations";
      const on = dInc || tInc, off = dExc || tExc;
      return { side: on && off ? "both" : on ? "included" : "excluded", how, implicit: !(dInc || dExc) };
    },
    context(p, id) {
      const refs = (p.conditions && p.conditions.applications
        && p.conditions.applications.includeAuthenticationContextClassReferences) || [];
      return refs.includes(id) ? { side: "referenced" } : null;
    },
    strength(p, id) {
      const s = p.grantControls && p.grantControls.authenticationStrength;
      return s && lower(s.id) === lower(id) ? { side: "granted" } : null;
    },
    terms(p, id) {
      const t = (p.grantControls && p.grantControls.termsOfUse) || [];
      return t.includes(id) ? { side: "required" } : null;
    },
  };

  function by(kind, id, raws, opts) {
    const test = KINDS[kind];
    if (!test || id == null || id === "") return [];
    const out = [];
    for (const p of raws || []) {
      if (!p) continue;
      let hit = null;
      try { hit = test(p, id, opts); } catch { hit = null; }
      if (!hit) continue;
      out.push(Object.assign({ id: p.id, policyId: p.id, name: p.displayName, state: p.state }, hit));
    }
    return out;
  }

  // How many policies use "All trusted locations"? Those follow every trusted
  // IP location, so flipping isTrusted changes their behaviour too. It lives
  // here rather than in locations.js because it is the same read of the same
  // field as the location predicate above.
  function trustedConsumers(raws) {
    return (raws || []).filter((p) => {
      const l = (p.conditions && p.conditions.locations) || {};
      return (l.includeLocations || []).includes("AllTrusted") || (l.excludeLocations || []).includes("AllTrusted");
    }).map((p) => ({ id: p.id, policyId: p.id, name: p.displayName, state: p.state,
      side: ((p.conditions.locations.includeLocations || []).includes("AllTrusted")) ? "included" : "excluded" }));
  }

  return { by, trustedConsumers, kinds: () => Object.keys(KINDS) };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { CaUses };
