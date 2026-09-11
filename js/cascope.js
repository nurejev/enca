// ======================================================================
// IS THIS PRINCIPAL IN THE POLICY'S SCOPE — one implementation.
//
// Every tool that says anything about a person and a policy has to answer
// this first, and the answer has three states, not two: INCLUDED, EXCLUDED
// (included by one clause and taken out by another — which is the
// interesting one, because that is a bypass), or NOT ADDRESSED at all.
//
// Until build 25345 two tools answered it separately:
//
//   whois.js stateFor      🕵 Who is Anna to CA and 🌊 the wave. Users,
//                          groups, roles AND the guest / external user type,
//                          with the REASON named — "reaches her via DG-INT",
//                          direct or nested.
//   validator.js appliesTo ⚡ CA validator. Users, groups, roles. No guests.
//
// That difference was not cosmetic. A policy assigned to "Guests and external
// users" reaches a guest, 🕵 said so, and ⚡ reported the same policy as out
// of scope for the same person — so the tool whose whole job is enumerating
// the simulations a policy implies skipped every guest simulation on every
// guest-scoped policy. Two implementations of one question is how a tool ends
// up quietly answering it wrong; this file is the answer both tools now use,
// built from the more complete of the two.
//
//   CaScope.of(policy, subject, opts) -> {
//     state      "inc" | "exc" | "na"
//     applies    state === "inc"          (what ⚡ asks)
//     included   was included by some clause, before exclusions
//     excluded   included, then taken out
//     byAll      included because the policy says All users
//     inc        why it was included: { kind, id?, text, how? } | null
//     exc        why it was taken out: same shape | null
//     via        exc && exc.id — the id that excluded it, for callers that
//                only want the id (⚡'s old field name, kept)
//   }
//
//   policy    a RAW Graph policy, or an already-prepared object from prep()
//   subject   { kind: "user" | "group", id, groupIds: Set, roleIds: Set,
//              guest: bool, names?: {id: name}, direct?: Set, via?: {id: []} }
//   opts      { guests: bool  — count the guest / external user type. Default
//                              TRUE: a policy that reaches guests reaches
//                              them, and a caller that wants the old blind
//                              answer has to ask for it.
//              howOf: fn(subject, groupId) -> "direct" | "nested via X" }
//
// A GROUP subject is a different question from a user subject and is treated
// as one: a group is reached by All users or by an include that names it (or
// a group it is nested in), and it is taken out only by an exclude that names
// one of those — a group has no roles and is not a guest.
//
// Pure: no Graph, no storage, no DOM.
// ======================================================================
const CaScope = (() => {
  const GUEST_TOKEN = "GuestsOrExternalUsers";
  const isRaw = (p) => !!(p && p.conditions);

  // Normalise a raw policy's users block into the shape the check reads. The
  // guest type arrives two ways depending on the tenant and the API version —
  // its own boolean, or the GuestsOrExternalUsers token in the user list — so
  // both are read and the token is kept OUT of incUsers, where it would
  // otherwise be compared against an object id and never match.
  function prep(p) {
    const u = ((p || {}).conditions || {}).users || {};
    const inc = u.includeUsers || [], exc = u.excludeUsers || [];
    return {
      includeAll: inc.includes("All"),
      incUsers: new Set(inc.filter((x) => x !== "All" && x !== "None" && x !== GUEST_TOKEN)),
      excUsers: new Set(exc.filter((x) => x !== GUEST_TOKEN)),
      incGroups: u.includeGroups || [], excGroups: u.excludeGroups || [],
      incRoles: u.includeRoles || [], excRoles: u.excludeRoles || [],
      incGuests: !!u.includeGuestsOrExternalUsers || inc.includes(GUEST_TOKEN),
      excGuests: !!u.excludeGuestsOrExternalUsers || exc.includes(GUEST_TOKEN),
    };
  }

  const NA = { state: "na", applies: false, included: false, excluded: false, byAll: false, inc: null, exc: null, via: null };

  function of(policy, subject, opts) {
    const P = isRaw(policy) ? prep(policy) : (policy || {});
    const s = subject || {};
    const o = opts || {};
    const guests = o.guests !== false;
    const nameOf = (id) => ((s.names || {})[id]) || id;
    const howOf = typeof o.howOf === "function" ? (gid) => o.howOf(s, gid) : () => undefined;
    const gids = (s.groupIds && s.groupIds.size) ? s.groupIds : new Set(s.id ? [s.id] : []);
    const rids = s.roleIds || new Set();
    const has = (set, id) => !!(set && (set.has ? set.has(id) : set.includes(id)));
    const groupHit = (list) => (list || []).find((x) => gids.has(x)) || null;
    const why = (kind, text, id, how) => {
      const w = { kind, text };
      if (id) w.id = id;
      if (how !== undefined) w.how = how;
      return w;
    };

    // ---- a GROUP subject: no roles, no guest type ----
    if (s.kind === "group") {
      let inc = null;
      if (P.includeAll) inc = why("all", "All users");
      else { const g = groupHit(P.incGroups); if (g) inc = why("group", nameOf(g), g); }
      if (!inc) return { ...NA };
      const xg = groupHit(P.excGroups);
      const exc = xg ? why("group", nameOf(xg), xg) : null;
      return { state: exc ? "exc" : "inc", applies: !exc, included: true, excluded: !!exc,
        byAll: !!P.includeAll, inc, exc, via: exc ? exc.id : null };
    }

    // ---- a USER subject ----
    let inc = null;
    if (P.includeAll) inc = why("all", "All users");
    else if (has(P.incUsers, s.id)) inc = why("user", "named directly");
    else {
      const g = groupHit(P.incGroups);
      if (g) inc = why("group", nameOf(g), g, howOf(g));
      else {
        const r = (P.incRoles || []).find((x) => rids.has(x)) || null;
        if (r) inc = why("role", nameOf(r), r);
        else if (guests && P.incGuests && s.guest) inc = why("guest", "guest / external user type");
      }
    }
    if (!inc) return { ...NA };

    let exc = null;
    if (has(P.excUsers, s.id)) exc = why("user", "named directly in the exclusions");
    else {
      const g = groupHit(P.excGroups);
      if (g) exc = why("group", nameOf(g), g, howOf(g));
      else {
        const r = (P.excRoles || []).find((x) => rids.has(x)) || null;
        if (r) exc = why("role", nameOf(r), r);
        else if (guests && P.excGuests && s.guest) exc = why("guest", "guest / external user type");
      }
    }
    return { state: exc ? "exc" : "inc", applies: !exc, included: true, excluded: !!exc,
      byAll: !!P.includeAll, inc, exc, via: exc ? (exc.id || s.id) : null };
  }

  return { of, prep, GUEST_TOKEN };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { CaScope };
