// ======================================================================
// CaCoverage — the one "does this policy replace that one?" comparison.
// (js/verdict.js is a different thing entirely: the shared tile component.)
// Beta 25409, queue 233. Before it, two tools answered the question with
// two different, more confident answers:
//
//   analyze.js  accepted a replacement that shared ONE grant control with
//               the policy a user bypasses, then compared six conditions.
//               MFA + compliant device was "covered" by an MFA-only policy.
//   exclusions.js accepted any enabled policy carrying any grant control
//               whose INCLUDE side looked broad enough. It never subtracted
//               the replacement's own exclusions, never compared conditions
//               and never compared controls at all.
//
// Both said "covered". Neither had established it. This module answers with
// four states instead of a boolean, and names what is missing:
//
//   equivalent     every requirement compared is met, and nothing on either
//                  side was beyond the comparison
//   partial        it reaches some of the way — `missing` says what it does
//                  not carry
//   none           no candidate was relevant at all
//   unestablished  nothing missing was found, but a condition on one of the
//                  policies is outside what this comparison models. It is
//                  never green: "we could not tell" and "it is covered" are
//                  opposite findings, and only one of them is safe to print.
//
// The supported-dimension registry below is the honest part. Conditional
// Access keeps growing; a comparison that silently ignores a dimension it
// has never heard of reports equivalence it cannot possibly have checked.
// Anything not in SUPPORTED lands in `unsupported` and costs the verdict its
// green, which is the conservative direction.
//
// Pure over its arguments: no DOM, no Graph, no globals. Testable with node.
// ======================================================================
const CaCoverage = (() => {
  // The conditions and controls this comparison actually models. Written out
  // rather than implied so the list can be checked against the Graph schema
  // when Microsoft adds one.
  const SUPPORTED = [
    "users (include and exclude, incl. guest/external types)",
    "applications (include and exclude)",
    "device platforms", "locations", "client app types",
    "sign-in risk", "user risk",
    "built-in grant controls, AND/OR operator, block, authentication strength identity",
  ];

  // Anything here is real policy behaviour this comparison does NOT model.
  // Its presence on either side means the answer is "not established".
  function unsupportedOf(raw) {
    const c = (raw && raw.conditions) || {}, g = (raw && raw.grantControls) || {}, a = c.applications || {}, out = [];
    const d = c.devices || {};
    if (d.deviceFilter || (d.includeDevices || []).length || (d.excludeDevices || []).length) out.push("device filter");
    if (c.authenticationFlows && Object.keys(c.authenticationFlows).length) out.push("authentication flows");
    if ((a.includeAuthenticationContextClassReferences || []).length) out.push("authentication context");
    if (a.applicationFilter) out.push("application filter");
    if ((a.includeUserActions || []).length) out.push("user actions");
    if (c.insiderRiskLevels) out.push("insider risk");
    if ((c.servicePrincipalRiskLevels || []).length) out.push("workload identity risk");
    if (c.times) out.push("time window");
    if ((g.termsOfUse || []).length) out.push("terms of use");
    if ((g.customAuthenticationFactors || []).length) out.push("custom controls");
    if (raw && raw.sessionControls && Object.values(raw.sessionControls).some((v) => v && (v.isEnabled === undefined || v.isEnabled))) out.push("session controls");
    return out;
  }

  const SENT = ["All", "None", "GuestsOrExternalUsers"];
  const lower = (x) => String(x ?? "").toLowerCase();

  // Normalize a raw Graph policy into the shape compare() reads. An object
  // that already carries the prepped fields (analyze.js's buildLookup) is
  // passed through with the two fields it does not have filled in from .raw,
  // so no call site has to change its data.
  function prep(raw) {
    const p = raw || {}, c = p.conditions || {}, u = c.users || {}, a = c.applications || {}, g = p.grantControls || {};
    const controls = new Set(g.builtInControls || []);
    if (g.authenticationStrength) controls.add("authStrength:" + (g.authenticationStrength.displayName || g.authenticationStrength.id));
    return {
      id: p.id, name: p.displayName || "(unnamed policy)", state: p.state,
      enforced: p.state === "enabled",
      includeAll: (u.includeUsers || []).includes("All"),
      incUsers: (u.includeUsers || []).filter((x) => !SENT.includes(x)),
      incGroups: u.includeGroups || [], incRoles: u.includeRoles || [],
      excUsers: (u.excludeUsers || []).filter((x) => !SENT.includes(x)),
      excGroups: u.excludeGroups || [], excRoles: u.excludeRoles || [],
      incGuests: !!u.includeGuestsOrExternalUsers || (u.includeUsers || []).includes("GuestsOrExternalUsers"),
      excGuests: !!u.excludeGuestsOrExternalUsers || (u.excludeUsers || []).includes("GuestsOrExternalUsers"),
      appInc: (a.includeApplications || []).length ? a.includeApplications : ["All"],
      appExc: a.excludeApplications || [],
      platInc: (c.platforms?.includePlatforms || []).length ? c.platforms.includePlatforms : ["all"],
      platExc: c.platforms?.excludePlatforms || [],
      locInc: (c.locations?.includeLocations || []).length ? c.locations.includeLocations : ["All"],
      locExc: c.locations?.excludeLocations || [],
      clientApps: c.clientAppTypes || [], signInRisk: c.signInRiskLevels || [], userRisk: c.userRiskLevels || [],
      controls, isBlock: controls.has("block"), grantOp: g.operator || "AND",
      requiresMfa: typeof CaScope !== "undefined" && CaScope.requiresMfa ? CaScope.requiresMfa(g) : controls.has("mfa"),
      unsupported: unsupportedOf(p), raw: p,
    };
  }

  // Accept either shape. buildLookup entries carry appInc + controls already.
  function N(x) {
    if (!x) return prep(null);
    if (x.__v) return x;
    if (x.appInc && x.controls) {
      const base = prep(x.raw || {});
      const out = { ...base, ...x, __v: true };
      out.unsupported = base.unsupported;
      out.grantOp = (x.raw?.grantControls || {}).operator || "AND";
      return out;
    }
    return { ...prep(x), __v: true };
  }

  // ---- condition supersets ---------------------------------------------
  const hasTok = (arr, x) => (arr || []).some((v) => lower(v) === lower(x));
  function dimCovered(incP, excP, incQ, excQ, all) {
    incP = incP || []; excP = excP || []; incQ = incQ || []; excQ = excQ || [];
    const pAll = hasTok(incP, all), qAll = hasTok(incQ, all);
    if (pAll) { if (!qAll) return false; return excQ.every((x) => hasTok(excP, x)); }
    const pSet = incP.filter((x) => !hasTok(excP, x));
    if (qAll) return pSet.every((x) => !hasTok(excQ, x));
    const qSet = incQ.filter((x) => !hasTok(excQ, x));
    return pSet.every((x) => hasTok(qSet, x));
  }
  function listCovered(lp, lq) {
    lp = (lp || []).filter(Boolean); lq = (lq || []).filter(Boolean);
    const pU = !lp.length || lp.includes("all"), qU = !lq.length || lq.includes("all");
    if (pU) return qU;
    if (qU) return true;
    return lp.every((x) => lq.includes(x));
  }

  // ---- the user scope the replacement has to reach ----------------------
  // The finding this exists for: a policy that excludes the very user whose
  // bypass it is supposed to close is not a replacement for them.
  function userGap(P, Q) {
    const out = [];
    const excOf = (X) => [...(X.excUsers || []), ...(X.excGroups || []), ...(X.excRoles || [])];
    if (P.includeAll) {
      if (!Q.includeAll) { out.push("the replacement is not scoped to all users"); return out; }
      const pe = new Set(excOf(P).map(lower));
      const extra = excOf(Q).filter((x) => !pe.has(lower(x)));
      if (extra.length) out.push(`${extra.length} principal${extra.length === 1 ? "" : "s"} excluded from the replacement`);
    } else {
      const inc = [...(P.incUsers || []), ...(P.incGroups || []), ...(P.incRoles || [])];
      if (!Q.includeAll) {
        const qi = new Set([...(Q.incUsers || []), ...(Q.incGroups || []), ...(Q.incRoles || [])].map(lower));
        const uncovered = inc.filter((x) => !qi.has(lower(x)));
        if (uncovered.length) out.push("user scope");
      }
      const qe = new Set(excOf(Q).map(lower));
      const hit = inc.filter((x) => qe.has(lower(x)));
      if (hit.length) out.push(`${hit.length} of its principals ${hit.length === 1 ? "is" : "are"} excluded from the replacement`);
    }
    if (P.incGuests && !(Q.incGuests || Q.includeAll)) out.push("guest and external users");
    if (Q.excGuests && !P.excGuests) out.push("guests are excluded from the replacement");
    return out;
  }

  // ---- the controls it has to require ----------------------------------
  const CONTROL_LABEL = {
    mfa: "multifactor authentication", compliantDevice: "a compliant device",
    domainJoinedDevice: "a hybrid Entra joined device", approvedApplication: "an approved client app",
    compliantApplication: "an app protection policy", passwordChange: "a password change",
    block: "a block decision",
  };
  function controlGap(P, Q) {
    const missing = [], unresolved = [];
    if (P.isBlock && !Q.isBlock) missing.push("a block decision");
    if (P.requiresMfa && !Q.requiresMfa) missing.push("MFA is not mandatory in the replacement");
    for (const c of P.controls) {
      if (c === "mfa" || c === "block") continue;
      if (String(c).startsWith("authStrength:")) {
        if (Q.controls.has(c)) continue;
        // Two strengths are comparable only by their contents, which the
        // policy object does not carry. Equal identity passes; anything else
        // is a question this comparison cannot answer.
        unresolved.push(`authentication strength “${String(c).slice(13)}” cannot be compared with the replacement's controls`);
        continue;
      }
      if (!Q.controls.has(c)) missing.push(CONTROL_LABEL[c] || String(c));
    }
    // An OR policy grants access on ANY of its controls, so holding the right
    // one in the list does not mean it is required.
    if (P.controls.size && Q.grantOp === "OR" && Q.controls.size > 1) missing.push("the replacement accepts alternative grant controls");
    return { missing, unresolved };
  }

  // Is this candidate worth comparing at all? Without a gate every unrelated
  // policy in the tenant renders as a partial match and the list is noise.
  function relevant(P, Q) {
    P = N(P); Q = N(Q);
    if (!Q.enforced) return false;
    if (!Q.controls.size) return false;
    for (const c of P.controls) if (Q.controls.has(c)) return true;
    return !!(P.requiresMfa && Q.requiresMfa);
  }

  // ---- the comparison ---------------------------------------------------
  function compare(P, Q) {
    P = N(P); Q = N(Q);
    const missing = [...userGap(P, Q)];
    if (!dimCovered(P.appInc, P.appExc, Q.appInc, Q.appExc, "All")) missing.push("applications");
    if (!dimCovered(P.platInc, P.platExc, Q.platInc, Q.platExc, "all")) missing.push("device platforms");
    if (!dimCovered(P.locInc, P.locExc, Q.locInc, Q.locExc, "All")) missing.push("locations");
    if (!listCovered(P.clientApps, Q.clientApps)) missing.push("client apps");
    if (!listCovered(P.signInRisk, Q.signInRisk)) missing.push("sign-in risk");
    if (!listCovered(P.userRisk, Q.userRisk)) missing.push("user risk");
    const cg = controlGap(P, Q);
    missing.push(...cg.missing);
    const unresolved = [...new Set([...cg.unresolved,
      ...P.unsupported.map((u) => `${u} on ${P.name}`),
      ...Q.unsupported.map((u) => `${u} on ${Q.name}`)])];
    const state = missing.length ? "partial" : unresolved.length ? "unestablished" : "equivalent";
    return { state, missing, unresolved, id: Q.id, name: Q.name, reportOnly: !Q.enforced };
  }

  // Best answer over a candidate list. `by` names what established the
  // equivalence; `partial` keeps the near misses in order of how much they
  // are missing, because "nothing covers this" and "one thing covers most of
  // it" are different findings.
  // `gate` (default true) keeps the shared-control relevance test, which is
  // what stops every unrelated policy in the tenant rendering as a partial
  // match. The Exclusion analyzer passes gate:false: there the candidates are
  // already the policies that reach the excluded app, and a candidate that
  // requires the WRONG control is exactly the finding worth showing.
  function bestOf(P, candidates, opts = {}) {
    const gate = opts.gate !== false;
    const results = (candidates || []).filter((Q) => (gate ? relevant(P, Q) : N(Q).enforced)).map((Q) => compare(P, Q));
    const eq = results.filter((r) => r.state === "equivalent");
    if (eq.length) return { state: "equivalent", by: eq, partial: [], unresolved: [] };
    const un = results.filter((r) => r.state === "unestablished");
    const part = results.filter((r) => r.state === "partial").sort((a, b) => a.missing.length - b.missing.length);
    if (un.length) return { state: "unestablished", by: [], partial: part.slice(0, 5), unresolved: un.flatMap((r) => r.unresolved), near: un };
    if (part.length) return { state: "partial", by: [], partial: part.slice(0, 5), unresolved: [] };
    return { state: "none", by: [], partial: [], unresolved: [] };
  }

  // ---- shared presentation ---------------------------------------------
  // One vocabulary, rendered the same in both tools, so a user does not have
  // to learn two ways of reading the same answer.
  const STATE = {
    equivalent: { cls: "eq", glyph: "✔", label: "Equivalent coverage" },
    partial: { cls: "part", glyph: "◐", label: "Partial coverage" },
    none: { cls: "none", glyph: "✖", label: "No equivalent coverage" },
    unestablished: { cls: "unk", glyph: "?", label: "Not established" },
  };
  const escv = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  function chip(state, extra, title) {
    const s = STATE[state] || STATE.unestablished;
    return `<span class="vd ${s.cls}"${title ? ` title="${escv(title)}"` : ""}>${s.glyph} ${escv(extra ? `${s.label} — ${extra}` : s.label)}</span>`;
  }
  // Plain text for exports and titles — same words, no markup.
  function text(res) {
    const s = STATE[res?.state] || STATE.unestablished;
    if (res?.state === "equivalent") return `${s.label} by ${res.by.map((b) => b.name).join(", ")}`;
    if (res?.state === "partial" && res.partial.length) {
      const p = res.partial[0];
      return `${s.label} by ${p.name} — missing ${p.missing.join(", ")}`;
    }
    if (res?.state === "unestablished") return `${s.label} — ${(res.unresolved || []).slice(0, 2).join("; ") || "a condition outside this analysis"}`;
    return "No equivalent coverage established by this analysis";
  }

  return { prep, compare, bestOf, relevant, chip, text, STATE, SUPPORTED, unsupportedOf,
    // exposed for the offline tests
    _dimCovered: dimCovered, _listCovered: listCovered, _userGap: userGap, _controlGap: controlGap };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { CaCoverage };
