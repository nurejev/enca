// ======================================================================
// CA Exclusion analyzer — every exclusion in every policy, as a matrix.
// Collects excluded users, groups, directory roles, guest/external types,
// applications, named locations and device platforms; resolves them to
// display names and expands group membership, so you can see both the
// configured exclusions and who is *effectively* excluded, per policy.
// Read-only: Policy.Read.All + Directory.Read.All.
// ======================================================================
const Exclusions = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const MEMBER_CAP = 500; // per group, keeps very large groups from stalling the UI

  const KIND = {
    user: { label: "User", icon: "👤", order: 1 },
    group: { label: "Group", icon: "👥", order: 2 },
    role: { label: "Directory role", icon: "🛡", order: 3 },
    guest: { label: "Guest / external", icon: "🤝", order: 4 },
    app: { label: "Application", icon: "📦", order: 5 },
    location: { label: "Named location", icon: "🌐", order: 6 },
    platform: { label: "Device platform", icon: "💻", order: 7 },
  };
  const GUEST_TYPE_LABEL = {
    internalGuest: "Local guests", b2bCollaborationGuest: "B2B collaboration guests",
    b2bCollaborationMember: "B2B collaboration members", b2bDirectConnectUser: "B2B direct connect",
    otherExternalUser: "Other external users", serviceProvider: "Service provider users",
  };
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

  // ---- 1. collect every exclusion reference from the raw policies ----
  function collect(raws) {
    const entities = new Map(); // key -> entity
    const policies = [];
    const add = (kind, id, p, name) => {
      const key = `${kind}:${id}`;
      let e = entities.get(key);
      if (!e) { e = { key, kind, id, name: name || null, policyIds: new Set(), members: null, memberTotal: null }; entities.set(key, e); }
      e.policyIds.add(p.id);
    };
    for (const p of raws) {
      let guestClause = null;   // the whole external-user clause, for the risk review
      const u = p.conditions?.users || {}, a = p.conditions?.applications || {};
      const l = p.conditions?.locations || {}, pl = p.conditions?.platforms || {};
      (u.excludeUsers || []).forEach((id) => add("user", id, p));
      (u.excludeGroups || []).forEach((id) => add("group", id, p));
      (u.excludeRoles || []).forEach((id) => add("role", id, p));
      if (u.excludeGuestsOrExternalUsers) {
        // The WHOLE clause, not just the types. An exclusion of B2B guests
        // from two named partner tenants is not an exclusion of every
        // external user, and keeping only guestOrExternalUserTypes made those
        // two identical: same key, same entity, same "all guests" risk flag.
        const g = u.excludeGuestsOrExternalUsers;
        const t = g.guestOrExternalUserTypes || "";
        const types = t.split(",").map((x) => x.trim()).filter(Boolean);
        const et = g.externalTenants || {};
        const kind = et.membershipKind || "all";
        const tenants = (et.members || []).slice();
        const typeLabel = types.map((x) => GUEST_TYPE_LABEL[x] || x).join(", ") || "All guest/external";
        const tenantLabel = kind === "all" || !tenants.length ? "all external tenants"
          : `${tenants.length} named tenant${tenants.length === 1 ? "" : "s"}`;
        const label = `${typeLabel} — ${tenantLabel}`;
        // The key carries the clause, so two different clauses are two rows.
        add("guest", `${t || "all"}|${kind}|${tenants.join("+")}`, p, label);
        const e = entities.get(`guest:${t || "all"}|${kind}|${tenants.join("+")}`);
        guestClause = { types, allTypes: !types.length || types.length >= Object.keys(GUEST_TYPE_LABEL).length,
          tenantKind: kind, tenants, allTenants: kind === "all" || !tenants.length, name: label };
        if (e) e.clause = guestClause;
      }
      (a.excludeApplications || []).forEach((id) => add("app", id, p));
      (l.excludeLocations || []).forEach((id) => add("location", id, p));
      (pl.excludePlatforms || []).forEach((id) => add("platform", id, p, id));
      const n = (u.excludeUsers || []).length + (u.excludeGroups || []).length + (u.excludeRoles || []).length
        + (u.excludeGuestsOrExternalUsers ? 1 : 0) + (a.excludeApplications || []).length
        + (l.excludeLocations || []).length + (pl.excludePlatforms || []).length;
      // per-policy breakdown, kept for the risk review
      const SENT = ["All", "None", "GuestsOrExternalUsers"];
      const g = p.grantControls || {};
      policies.push({
        id: p.id, name: p.displayName || "(unnamed policy)", state: p.state, seq: null, exclusionCount: n,
        raw: p,   // the shared comparison (js/coverage.js) reads the whole policy
        // the include side + whether the policy enforces anything, for the
        // "is this excluded app covered by another policy" question
        inc: {
          allApps: (a.includeApplications || []).includes("All"),
          apps: (a.includeApplications || []).map((x) => String(x).toLowerCase()),
          allUsers: (u.includeUsers || []).includes("All"),
          users: (u.includeUsers || []).filter((x) => !SENT.includes(x)),
          groups: (u.includeGroups || []),
          roles: (u.includeRoles || []),
        },
        enforces: (g.builtInControls || []).length > 0 || !!g.authenticationStrength,
        exc: {
          users: (u.excludeUsers || []).filter((x) => !SENT.includes(x)),
          groups: (u.excludeGroups || []),
          roles: (u.excludeRoles || []),
          guests: !!u.excludeGuestsOrExternalUsers || (u.excludeUsers || []).includes("GuestsOrExternalUsers"),
          // The clause behind that boolean. The legacy token in excludeUsers
          // carries no detail, so it IS the all-guests case; a modern clause
          // may be far narrower, and the risk review reads this rather than
          // the boolean.
          guestClauses: guestClause ? [guestClause]
            : (u.excludeUsers || []).includes("GuestsOrExternalUsers")
              ? [{ types: [], allTypes: true, tenantKind: "all", tenants: [], allTenants: true, name: "All guests and external users (legacy token)" }]
              : [],
          apps: (a.excludeApplications || []),
          locations: (l.excludeLocations || []),
          platforms: (pl.excludePlatforms || []),
        },
      });
    }
    return { policies, entities: [...entities.values()] };
  }

  // ---- 2. resolve display names + expand group membership ----
  async function resolve(model, opts = {}) {
    const { onStatus, demo, signal } = opts;
    const byKind = (k) => model.entities.filter((e) => e.kind === k);

    // well-known sentinels that are not directory objects
    const SENTINEL = { All: "All users", None: "None", GuestsOrExternalUsers: "Guests & external users", AllTrusted: "All trusted locations", Office365: "Office 365", MicrosoftAdminPortals: "Microsoft Admin Portals" };
    model.entities.forEach((e) => { if (SENTINEL[e.id]) e.name = SENTINEL[e.id]; });

    if (demo) {
      const names = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.names) || {};
      model.entities.forEach((e) => { e.name = e.name || names[e.id] || (e.kind === "app" && firstPartyAppName(e.id)) || e.id; });
      byKind("app").forEach((e) => { if (isGuid(e.id) && !names[e.id]) e.noSp = true; });
      appCoverage(model);
      byKind("group").forEach((e) => {
        const ids = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.scopeGroups && DEMO_DATA.scopeGroups[e.name]) || [];
        const users = (typeof DEMO_DATA !== "undefined" && DEMO_DATA.analyzeUsers) || [];
        e.members = ids.map((id) => { const u = users.find((x) => x.id === id); return { id, name: u?.displayName || id, upn: u?.userPrincipalName || "" }; });
        e.memberTotal = e.members.length;
        // demo nesting: the last member of a group with 2+ members comes in
        // through a nested group, so the ↪ marks have something to show
        if (e.members.length >= 2) {
          const last = e.members[e.members.length - 1], child = `SG-Demo-${((e.name || "").match(/CA\d+/) || ["team"])[0]}`;
          e.nested = [{ id: `g-nest-${e.id}`, name: child, dynamic: false, memberIds: new Set([last.id]) }];
          e.members.forEach((m) => { m.direct = m.id !== last.id; m.via = m.id === last.id ? [child] : []; });
        } else { e.nested = []; e.members.forEach((m) => { m.direct = true; m.via = []; }); }
        e.directCount = e.members.filter((m) => m.direct).length; e.nestedCount = e.members.length - e.directCount;
      });
      return model;
    }

    // users + groups in one batched directory lookup
    const dirIds = [...byKind("user"), ...byKind("group")].map((e) => e.id).filter(isGuid);
    if (dirIds.length) {
      onStatus?.("Resolving users and groups…");
      for (const ids of chunk([...new Set(dirIds)], 1000)) {
        try {
          const j = await Graph.gpost("/directoryObjects/getByIds", { ids, types: ["user", "group"] });
          (j.value || []).forEach((o) => {
            model.entities.forEach((e) => {
              if (e.id === o.id) {
                e.name = o.displayName || e.name; e.upn = o.userPrincipalName || "";
                // a disabled account still sitting in an exclusion list is the
                // classic sign that offboarding never cleans exclusions up
                if (o.accountEnabled === false) e.disabled = true;
              }
            });
          });
        } catch (e) { console.warn("Exclusions: directory lookup failed", e.message); }
      }
    }
    // directory roles by template id
    if (byKind("role").length) {
      onStatus?.("Resolving directory roles…");
      try {
        const tpl = await Graph.ggetAll("/directoryRoleTemplates");
        byKind("role").forEach((e) => { const t = tpl.find((x) => x.id === e.id); if (t) e.name = t.displayName; });
      } catch (e) { console.warn("Exclusions: role templates failed", e.message); }
    }
    // named locations
    if (byKind("location").length) {
      onStatus?.("Resolving named locations…");
      try {
        const locs = await Graph.ggetAll("/identity/conditionalAccess/namedLocations");
        byKind("location").forEach((e) => { const l = locs.find((x) => x.id === e.id); if (l) e.name = l.displayName; });
      } catch (e) { console.warn("Exclusions: named locations failed", e.message); }
    }
    // applications by appId
    const apps = byKind("app").filter((e) => isGuid(e.id));
    if (apps.length) {
      onStatus?.("Resolving applications…");
      for (const part of chunk(apps, 15)) {
        try {
          const flt = part.map((e) => `'${e.id}'`).join(",");
          const sps = await Graph.ggetAll(`/servicePrincipals?$filter=appId in (${flt})&$select=appId,displayName`);
          part.forEach((e) => {
            const sp = sps.find((s) => String(s.appId).toLowerCase() === String(e.id).toLowerCase());
            if (sp) e.name = sp.displayName;
            // A GUID the tenant has no service principal for: the exclusion
            // names an app that is not here. It protects nothing today and
            // becomes live the moment the app is consented or created.
            else e.noSp = true;
          });
        } catch (e) { console.warn("Exclusions: app lookup failed", e.message); }
      }
    }
    // group membership (transitive users)
    const groups = byKind("group");
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      onStatus?.(`Expanding group ${i + 1}/${groups.length}…`, i + 1, groups.length);
      try {
        const members = await Graph.ggetAll(`/groups/${g.id}/transitiveMembers/microsoft.graph.user?$select=id,displayName,userPrincipalName,accountEnabled&$top=999`, { signal });
        g.memberTotal = members.length;
        g.members = members.map((m) => ({ id: m.id, name: m.displayName || m.id, upn: m.userPrincipalName || "", disabled: m.accountEnabled === false }));
        g.disabledMembers = g.members.filter((m) => m.disabled).length;
      } catch (e) {
        console.warn(`Exclusions: members of ${g.name || g.id} failed`, e.message);
        throw new Error(`Exclusion membership incomplete for ${g.name || g.id}: ${e.message}. No complete user totals are available.`);
      }
    }
    // Nesting — HOW each member got in. One $batch over the excluded groups'
    // direct members (users and groups), then one over the nested groups'
    // transitive users (first 40 nested groups), so a member can be marked
    // direct or "through <nested group>". An exclusion group whose members
    // all arrive through nesting is a pointer to groups managed elsewhere —
    // that is the gap the risk review flags.
    try { await readNesting(groups, onStatus); }
    catch (e) { console.warn("Exclusions: nesting read failed", e.message); }
    model.entities.forEach((e) => { e.name = e.name || (e.kind === "app" && firstPartyAppName(e.id)) || e.id; });
    appCoverage(model);
    return model;
  }

  // ---- 2b. is an app excluded from an All-resources policy covered elsewhere? ----
  // Microsoft's guidance is a baseline policy on all users and all resources
  // WITHOUT resource exclusions; an app excluded from it needs its own policy.
  // The question is whether that other policy gives the SAME protection to the
  // SAME people — which is one comparison, shared with T03 Gap analyse and
  // living in js/coverage.js since beta 25409.
  //
  // What this used to do, and why it was too kind: a candidate qualified if it
  // was enabled, carried ANY grant control and its INCLUDE side looked at
  // least as broad. Its own user exclusions were never subtracted, its
  // conditions never compared, its controls never compared. A policy scoped to
  // Windows, excluding the one user who mattered and requiring only a
  // compliant device closed an MFA gap on paper. Now it comes back as PARTIAL
  // with the three reasons named, and an app nothing reaches reads "no
  // equivalent coverage established by this analysis" rather than the much
  // stronger claim that it has no Conditional Access at all.
  function appCoverage(model) {
    const SENT = new Set(["all", "none"]);
    // Resource COLLECTIONS are not expanded by this analysis. Silently
    // skipping them read as "nothing to say"; they get an explicit unresolved
    // verdict instead.
    const COLLECTION = { office365: "Office 365", microsoftadminportals: "Microsoft Admin Portals" };
    const byPol = new Map(model.policies.map((p) => [p.id, p]));
    const live = model.policies.filter((p) => p.state === "enabled" && p.enforces && p.inc);
    for (const e of model.entities) {
      if (e.kind !== "app") continue;
      const id = String(e.id).toLowerCase();
      if (SENT.has(id)) continue;
      e.coverage = {};      // policyId → [names that establish EQUIVALENT coverage]
      e.verdicts = {};      // policyId → the full comparison result
      e.uncoveredIn = [];   // policyIds where equivalence was not established
      for (const pid of e.policyIds) {
        const p = byPol.get(pid);
        if (!p || p.state !== "enabled" || !p.enforces || !p.inc?.allApps) continue;
        if (COLLECTION[id]) {
          e.verdicts[pid] = { state: "unestablished", by: [], partial: [],
            unresolved: [`${COLLECTION[id]} is a resource collection and is not expanded by this analysis`] };
          e.coverage[pid] = [];
          e.uncoveredIn.push(pid);
          continue;
        }
        const candidates = live.filter((q) => q.id !== p.id
          && !(q.exc.apps || []).some((x) => String(x).toLowerCase() === id)
          && (q.inc.allApps || q.inc.apps.includes(id)));
        // gate:false — these candidates already reach the app, and one that
        // requires the WRONG control is the finding, not noise.
        const v = CaCoverage.bestOf(p.raw, candidates.map((q) => q.raw), { gate: false });
        e.verdicts[pid] = v;
        e.coverage[pid] = v.by.map((x) => x.name);
        if (v.state !== "equivalent") e.uncoveredIn.push(pid);
      }
    }
    return model;
  }

  const NEST_CAP = 40;
  // Provenance — direct or through which nested group — is read separately from
  // membership, and the two have different completeness. Effective membership
  // can be exact while the PATH is unknown, and saying "nested" because a name
  // was missing from an incomplete direct-member page is an invented route:
  // before beta 25410 the direct read consumed one $batch page and never
  // followed @odata.nextLink, so every direct member on page two was reported
  // as coming in through nesting. Member.direct is now true, false or NULL
  // (path not resolved), and the group carries pathComplete.
  async function readNesting(groups, onStatus) {
    const gs = groups.filter((g) => g.members && g.members.length);
    if (!gs.length) return;
    onStatus?.("Reading nesting…");
    const direct = await Graph.gbatch(gs.map((g, i) => ({ id: i, url: `/groups/${g.id}/members?$select=id,displayName,groupTypes&$top=999` })));
    const nestedAll = [];
    const more = [];
    gs.forEach((g, i) => {
      const v = direct[i], body = v && v.body, rows = (body && body.value) || null;
      if (!rows) { g.nested = null; g.pathComplete = false; return; }
      g.__rows = rows.slice();
      g.__next = body["@odata.nextLink"] || null;
      if (g.__next) more.push(g);
    });
    // Follow the continuations rather than treating page one as the whole list.
    for (const g of more) {
      onStatus?.(`Reading the rest of ${g.name || "a group"}'s direct members…`);
      try {
        const all = await Graph.ggetAll(`/groups/${g.id}/members?$select=id,displayName,groupTypes&$top=999`);
        g.__rows = all; g.__next = null;
      } catch (e) {
        console.warn("Exclusions: direct-member continuation failed", g.id, e.message);
        g.__pathPartial = true;
      }
    }
    gs.forEach((g) => {
      const rows = g.__rows;
      if (!rows) return;
      const dIds = new Set(rows.filter((m) => !/group$/i.test(m["@odata.type"] || "")).map((m) => m.id));
      g.nested = rows.filter((m) => /group$/i.test(m["@odata.type"] || "")).map((m) => ({ id: m.id, name: m.displayName || m.id, dynamic: (m.groupTypes || []).includes("DynamicMembership"), memberIds: null }));
      // Incomplete direct list: a member we did not see is UNKNOWN, not nested.
      g.members.forEach((m) => { m.direct = dIds.has(m.id) ? true : g.__pathPartial ? null : false; m.via = []; });
      g.directCount = g.members.filter((m) => m.direct === true).length;
      g.nestedCount = g.members.filter((m) => m.direct === false).length;
      g.unknownPathCount = g.members.filter((m) => m.direct === null).length;
      g.pathComplete = !g.__pathPartial;
      g.nested.forEach((n) => nestedAll.push({ g, n }));
      delete g.__rows; delete g.__next; delete g.__pathPartial;
    });
    const todo = nestedAll.slice(0, NEST_CAP);
    const capped = nestedAll.slice(NEST_CAP);
    capped.forEach((x) => { x.g.pathComplete = false; x.g.nestingCapped = (x.g.nestingCapped || 0) + 1; });
    if (todo.length) {
      const res = await Graph.gbatch(todo.map((x, i) => ({ id: i, url: `/groups/${x.n.id}/transitiveMembers/microsoft.graph.user?$select=id&$top=999` })));
      const follow = [];
      todo.forEach((x, i) => {
        const v = res[i], body = v && v.body, rows = (body && body.value) || null;
        if (!rows) { x.g.pathComplete = false; return; }
        x.n.memberIds = new Set(rows.map((u) => u.id));
        if (body["@odata.nextLink"]) follow.push(x);
      });
      for (const x of follow) {
        try {
          const all = await Graph.ggetAll(`/groups/${x.n.id}/transitiveMembers/microsoft.graph.user?$select=id&$top=999`);
          x.n.memberIds = new Set(all.map((u) => u.id));
        } catch (e) { x.g.pathComplete = false; console.warn("Exclusions: nested continuation failed", x.n.id, e.message); }
      }
      todo.forEach((x) => {
        if (!x.n.memberIds) return;
        x.g.members.forEach((m) => { if (m.direct === false && x.n.memberIds.has(m.id)) m.via.push(x.n.name); });
      });
    }
    // A member that is not direct and matched no resolved nested group has a
    // route nobody read. Say so instead of leaving it looking resolved.
    gs.forEach((g) => {
      if (!g.members) return;
      g.members.forEach((m) => { if (m.direct === false && !m.via.length && !g.pathComplete) m.pathUnknown = true; });
    });
  }

  // ---- 3. per-user exclusions: CONFIGURED versus EFFECTIVE ----
  // Two different facts, kept apart since beta 25410.
  //
  //   configured — this user is named in the policy's exclusion list, or is a
  //                member of a group that is.
  //   effective  — the policy would otherwise have INCLUDED them, so the
  //                exclusion is a real bypass.
  //
  // Before this, every configured exclusion was counted as a bypass. A policy
  // that includes only the Finance group and excludes the break-glass account
  // never addressed that account: the shared scope check (CaScope) has always
  // called that "not addressed", and T09 disagreed with it, inflating the
  // bypass count with rows that bypass nothing.
  //
  // What can be decided here is bounded by what was read. This tool expands
  // the EXCLUSION side, not the include side, so when a policy includes a
  // group or role whose membership was never read the answer is UNKNOWN —
  // never a quiet "not in scope", which would hide a real bypass.
  const INCL = { bypass: "bypass", configured: "configured", unknown: "unknown" };
  function inclusionOf(p, userId, known) {
    const inc = p.inc || {};
    if (inc.allUsers) return INCL.bypass;
    if ((inc.users || []).includes(userId)) return INCL.bypass;
    for (const gid of inc.groups || []) {
      const m = known.get(gid);
      if (m && m.has(userId)) return INCL.bypass;
    }
    const unresolved = (inc.groups || []).some((g) => !known.has(g))
      || (inc.roles || []).length > 0
      || !!(p.raw && p.raw.conditions && p.raw.conditions.users && p.raw.conditions.users.includeGuestsOrExternalUsers);
    return unresolved ? INCL.unknown : INCL.configured;
  }

  function effectiveUsers(model) {
    const users = new Map(); // userId -> { name, upn, byPolicy: Map(policyId -> {state, reasons}) }
    // Every group membership this scan actually resolved — the only evidence
    // available for the include side.
    const known = new Map();
    model.entities.forEach((e) => { if (e.kind === "group" && e.members) known.set(e.id, new Set(e.members.map((m) => m.id))); });
    const byPolId = new Map(model.policies.map((p) => [p.id, p]));
    const touch = (id, name, upn) => {
      let u = users.get(id);
      if (!u) { u = { id, name: name || id, upn: upn || "", byPolicy: new Map() }; users.set(id, u); }
      if (name && u.name === u.id) u.name = name;
      if (upn && !u.upn) u.upn = upn;
      return u;
    };
    const addReason = (u, pid, reason) => {
      let cell = u.byPolicy.get(pid);
      if (!cell) {
        const p = byPolId.get(pid);
        cell = { state: p ? inclusionOf(p, u.id, known) : INCL.unknown, reasons: [] };
        u.byPolicy.set(pid, cell);
      }
      cell.reasons.push(reason);
      return cell;
    };
    // "All"/"None"/"GuestsOrExternalUsers" are sentinels, not real principals
    const SENTINEL_IDS = new Set(["All", "None", "GuestsOrExternalUsers"]);
    for (const e of model.entities) {
      if (e.kind === "user" && !SENTINEL_IDS.has(e.id)) {
        const u = touch(e.id, e.name, e.upn);
        e.policyIds.forEach((pid) => addReason(u, pid, { via: "direct" }));
      } else if (e.kind === "group" && e.members) {
        for (const m of e.members) {
          const u = touch(m.id, m.name, m.upn);
          e.policyIds.forEach((pid) => addReason(u, pid, { via: "group", group: e.name, nested: m.direct === false, pathUnknown: m.direct === null || !!m.pathUnknown, through: m.via || [] }));
        }
      }
    }
    const list = [...users.values()];
    // Populations this list does NOT contain, stated rather than implied:
    // an excluded directory role is not expanded to its members, so those
    // people are excluded and absent from every count here.
    const roles = model.entities.filter((e) => e.kind === "role");
    model.unexpanded = {
      roles: roles.map((e) => ({ id: e.id, name: e.name, policies: [...e.policyIds] })),
      guests: model.entities.filter((e) => e.kind === "guest").map((e) => ({ id: e.id, name: e.name, policies: [...e.policyIds] })),
    };
    const count = (st) => list.reduce((acc, u) => acc + ([...u.byPolicy.values()].some((c) => c.state === st) ? 1 : 0), 0);
    model.userStates = { bypass: count(INCL.bypass), configured: count(INCL.configured), unknown: count(INCL.unknown) };
    // Effective bypasses first — that is the finding; configured-only rows are
    // inventory and sort below them.
    const rank = (u) => ([...u.byPolicy.values()].some((c) => c.state === INCL.bypass) ? 0
      : [...u.byPolicy.values()].some((c) => c.state === INCL.unknown) ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b) || b.byPolicy.size - a.byPolicy.size || a.name.localeCompare(b.name));
    // The aggregates travel WITH the rows. This runs in the analysis worker,
    // which is handed a structured clone of the model — anything written back
    // onto that copy never reaches the screen, and extra properties on the
    // returned array do not survive the clone either.
    return { users: list, states: model.userStates, unexpanded: model.unexpanded };
  }

  // ---- 4. risk review -----------------------------------------------------
  // Per-policy governance flags. The pattern set follows Tiago S. Carvalho's
  // "Audit Conditional Access Exclusions with PowerShell"
  // (tiagoscarvalho.com/scripts-automation/ca-exclusions-audit), reimplemented
  // here in JS and extended: because this tool expands group membership we can
  // also see disabled accounts sitting *inside* an excluded group, not just
  // directly excluded ones. Flags are prompts to review, not findings.
  const PRIVILEGED_ROLE_IDS = {
    "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
    "e8611ab8-c189-46e8-94e1-60213ab1f814": "Privileged Role Administrator",
    "7be44c8a-adaf-4e2a-84d6-ab2649e08a13": "Privileged Authentication Administrator",
    "194ae4cb-b126-40b2-bd5b-6091b380977d": "Security Administrator",
    "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9": "Conditional Access Administrator",
    "c4e39bd9-1100-46d3-8c65-fb160da0071f": "Authentication Administrator",
  };
  const PRIVILEGED_ROLE_NAMES = new Set(Object.values(PRIVILEGED_ROLE_IDS).map((x) => x.toLowerCase()));
  const LEVEL_ORDER = { high: 0, medium: 1, info: 2, none: 3 };
  const MANY_GROUPS = 5;

  function risk(model, opts = {}) {
    const maxGroups = opts.maxGroups || MANY_GROUPS;
    const byId = new Map(model.entities.map((e) => [`${e.kind}:${e.id}`, e]));
    const ent = (kind, id) => byId.get(`${kind}:${id}`);

    const rows = model.policies.filter((p) => p.exclusionCount > 0).map((p) => {
      const x = p.exc || {}, flags = [];
      const add = (level, text, detail) => flags.push({ level, text, detail: detail || "" });

      // High — a privileged role excluded from the policy meant to protect it
      const priv = (x.roles || []).map((id) => {
        const e = ent("role", id);
        const name = (e && e.name) || PRIVILEGED_ROLE_IDS[id] || id;
        const isPriv = !!PRIVILEGED_ROLE_IDS[id] || PRIVILEGED_ROLE_NAMES.has(String(name).toLowerCase());
        return isPriv ? name : null;
      }).filter(Boolean);
      if (priv.length) add("high", `High-privilege role excluded: ${priv.join(", ")}`,
        "Privileged roles should rarely be excluded from MFA or compliance policies. If this is a break-glass path, make sure it is alerted on.");

      // High — every guest/external principal removed from scope. A clause
      // naming two partner tenants is NOT that, and saying so was the point of
      // keeping the whole clause (beta 25410).
      if (x.guests) {
        const clauses = (x.guestClauses || []).length ? x.guestClauses
          : [{ allTypes: true, allTenants: true, name: "All guests and external users" }];
        const broad = clauses.filter((c) => c.allTypes && c.allTenants);
        const scoped = clauses.filter((c) => !(c.allTypes && c.allTenants));
        if (broad.length) add("high", "All guests and external users are excluded",
          "External collaborators fall outside this policy entirely. Prefer a dedicated guest policy over excluding them here.");
        if (scoped.length) add("medium", `Scoped external exclusion: ${scoped.map((c) => c.name).join(" · ")}`,
          "Only the named external types and tenants are excluded, so this is narrower than an all-guests exclusion — review that the scope is still the one intended, and that no partner tenant has been added since.");
      }

      // Medium — direct user exclusions have no lifecycle
      const directUsers = (x.users || []);
      if (directUsers.length) add("medium", `${directUsers.length} direct user exclusion${directUsers.length === 1 ? "" : "s"}`,
        "Individual accounts have no membership lifecycle. Move them to a per-policy exclusion group with an access review.");

      // Medium — disabled accounts still excluded (directly, or via a group)
      const disabledDirect = directUsers.map((id) => ent("user", id)).filter((e) => e && e.disabled);
      const disabledViaGroup = (x.groups || []).map((id) => ent("group", id))
        .filter((e) => e && e.disabledMembers > 0)
        .map((e) => `${e.name} (${e.disabledMembers})`);
      if (disabledDirect.length || disabledViaGroup.length) {
        const bits = [];
        if (disabledDirect.length) bits.push(`${disabledDirect.length} excluded directly: ${disabledDirect.map((e) => e.name).join(", ")}`);
        if (disabledViaGroup.length) bits.push(`inside excluded group${disabledViaGroup.length === 1 ? "" : "s"}: ${disabledViaGroup.join(", ")}`);
        add("medium", "Disabled accounts sit in the exclusion scope", bits.join(" · ")
          + " — stale exclusions mean offboarding isn't clearing them.");
      }

      // Nested groups inside an exclusion group: whoever manages the nested
      // group decides who bypasses this policy. High when EVERY member of an
      // excluded group arrives that way — the exclusion group is then only a
      // pointer to groups managed elsewhere.
      const nestedGroups = (x.groups || []).map((id) => ent("group", id)).filter((e) => e && e.nested && e.nested.length);
      if (nestedGroups.length) {
        const allNested = nestedGroups.filter((e) => e.members && e.members.length && e.directCount === 0);
        const detail = nestedGroups.map((e) => `${e.name}: ${e.nested.length} nested group${e.nested.length === 1 ? "" : "s"} (${e.nested.map((n) => n.name).join(", ")}) — ${e.nestedCount} of ${e.memberTotal} member${e.memberTotal === 1 ? "" : "s"} come through them`).join(" · ");
        add(allNested.length ? "high" : "medium",
          allNested.length
            ? `Exclusion group${allNested.length === 1 ? "" : "s"} fed entirely by nested groups: ${allNested.map((e) => e.name).join(", ")}`
            : `Nested groups inside ${nestedGroups.length === 1 ? "an excluded group" : `${nestedGroups.length} excluded groups`}`,
          detail + ". Whoever can change the nested groups' membership widens this exclusion without touching the exclusion group — protect the nested groups the same way, or replace them with direct members.");
      }

      // High — an app excluded from this All-resources policy that no other
      // enabled, enforcing policy reaches for the same users: zero Conditional
      // Access for that app. Info when every excluded app IS covered elsewhere,
      // so the reader can see the exclusion was closed deliberately.
      const appEnts = (x.apps || []).map((id) => ent("app", id)).filter((e) => e && e.coverage && p.id in e.coverage);
      const uncovered = appEnts.filter((e) => e.uncoveredIn.includes(p.id));
      const covered = appEnts.filter((e) => !e.uncoveredIn.includes(p.id));
      if (uncovered.length) add("high", `${uncovered.length} excluded app${uncovered.length === 1 ? "" : "s"} with no equivalent coverage established: ${uncovered.map((e) => e.name).join(", ")}`,
        "This policy targets All resources, and no other ENABLED policy with a grant control reaches these apps for the same users — they have no Conditional Access at all. Microsoft's guidance is a baseline policy on all users and all resources without resource exclusions: give each app its own targeted policy, or remove the exclusion.");
      if (covered.length) add("info", `${covered.length} excluded app${covered.length === 1 ? "" : "s"} covered by another policy`,
        covered.map((e) => `${e.name} — ${e.coverage[p.id].join(", ")}`).join(" · ") + ". Equivalent coverage was established: same users, same conditions, same controls. Keep the two in step when either changes.");

      // Medium — an excluded app id with no service principal in this tenant:
      // the exclusion protects nothing today and goes live on consent.
      const phantom = (x.apps || []).map((id) => ent("app", id)).filter((e) => e && e.noSp);
      if (phantom.length) add("medium", `Phantom app exclusion${phantom.length === 1 ? "" : "s"}: ${phantom.map((e) => e.name).join(", ")}`,
        "No service principal for this app id exists in the tenant, so the exclusion matches nothing today — and the moment someone consents to or creates the app, it is excluded from this policy without anyone deciding so. Remove the exclusion, or register the app deliberately and review it.");

      // Medium — an exclusion list that has grown
      if ((x.groups || []).length > maxGroups) add("medium", `${x.groups.length} group exclusions`,
        "Review each for relevance; consider restructuring who the policy includes instead.");

      // Info — report-only exclusions become real the moment it is enforced
      if (p.state === "enabledForReportingButNotEnforced") add("info", "Report-only policy with exclusions",
        "These exclusions apply the instant the policy is enforced. Review them before switching it on.");

      const level = flags.length ? flags.reduce((m, f) => LEVEL_ORDER[f.level] < LEVEL_ORDER[m] ? f.level : m, "info") : "none";
      // how many users the policy's exclusions actually reach
      const reach = new Set();
      directUsers.forEach((id) => reach.add(id));
      (x.groups || []).forEach((id) => { const e = ent("group", id); (e && e.members || []).forEach((m) => reach.add(m.id)); });
      return { id: p.id, name: p.name, state: p.state, exclusionCount: p.exclusionCount, flags, level, reach: reach.size };
    });

    rows.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.flags.length - a.flags.length || a.name.localeCompare(b.name));
    const counts = { high: 0, medium: 0, info: 0, none: 0 };
    rows.forEach((r) => counts[r.level]++);
    return {
      rows, counts,
      flagged: rows.filter((r) => r.level !== "none").length,
      directUserPolicies: rows.filter((r) => r.flags.some((f) => /direct user exclusion/.test(f.text))).length,
    };
  }

  function summary(model, users) {
    const withExc = model.policies.filter((p) => p.exclusionCount > 0).length;
    const counts = {};
    model.entities.forEach((e) => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
    const nestedGroups = model.entities.filter((e) => e.kind === "group" && e.nested && e.nested.length);
    const nestedUsers = new Set(); nestedGroups.forEach((e) => e.members.forEach((m) => { if (m.direct === false) nestedUsers.add(m.id); }));
    const pathPartial = model.entities.filter((e) => e.kind === "group" && e.members && e.members.length && e.pathComplete === false).length;
    const pathUnknownUsers = new Set();
    model.entities.forEach((e) => { if (e.kind === "group" && e.members) e.members.forEach((m) => { if (m.direct === null || m.pathUnknown) pathUnknownUsers.add(m.id); }); });
    const phantomApps = model.entities.filter((e) => e.kind === "app" && e.noSp).length;
    const uncoveredApps = model.entities.filter((e) => e.kind === "app" && e.uncoveredIn && e.uncoveredIn.length).length;
    return { phantomApps, uncoveredApps, policies: model.policies.length, policiesWithExclusions: withExc, entities: model.entities.length, users: users.length, counts, nestedGroups: nestedGroups.length, nestedUsers: nestedUsers.size, allNested: nestedGroups.filter((e) => e.directCount === 0).length,
      pathPartial, pathUnknownUsers: pathUnknownUsers.size,
      states: model.userStates || { bypass: 0, configured: 0, unknown: 0 },
      unexpandedRoles: (model.unexpanded && model.unexpanded.roles.length) || 0 };
  }

  // ---- rendering ----
  const sortEntities = (a, b) => (KIND[a.kind].order - KIND[b.kind].order) || b.policyIds.size - a.policyIds.size || String(a.name).localeCompare(String(b.name));

  function renderSummary(s) {
    const kinds = Object.entries(s.counts).sort((a, b) => KIND[a[0]].order - KIND[b[0]].order)
      .map(([k, n]) => `<span class="tag">${KIND[k].icon} ${n} ${esc(KIND[k].label)}${n === 1 ? "" : "s"}</span>`).join(" ");
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        ${toolHead("toolExclusions")}
        <p style="margin-bottom:8px">Every exclusion configured across your Conditional Access policies — users, groups (with their members), directory roles, guest types, applications, named locations and device platforms — mapped against the policies that exclude them.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${kinds || '<span class="mini">No exclusions found.</span>'}${s.nestedGroups ? ` <span class="tag block" title="Members who come into an exclusion group through a group nested inside it">↪ ${s.nestedGroups} excluded group${s.nestedGroups === 1 ? "" : "s"} with nested groups · ${s.nestedUsers} user${s.nestedUsers === 1 ? "" : "s"} through nesting${s.allNested ? ` · ${s.allNested} fed entirely by nesting` : ""}</span>` : ""}${s.uncoveredApps ? ` <span class="tag block" title="Apps excluded from an All-resources policy where no other enabled policy was shown to give the same users the same protection">⚠ ${s.uncoveredApps} excluded app${s.uncoveredApps === 1 ? "" : "s"} with no equivalent coverage</span>` : ""}${s.phantomApps ? ` <span class="tag new" title="Excluded app ids with no service principal in this tenant — the exclusion matches nothing today">👻 ${s.phantomApps} phantom app exclusion${s.phantomApps === 1 ? "" : "s"}</span>` : ""}${s.states && (s.states.bypass || s.states.configured || s.states.unknown) ? ` <span class="tag block" title="A user listed in an exclusion is not necessarily taken out of anything: the policy has to include them first. Effective bypass counts only the users a policy would otherwise have reached.">✗ ${s.states.bypass} effective bypass${s.states.bypass === 1 ? "" : "es"}${s.states.configured ? ` · ○ ${s.states.configured} configured only` : ""}${s.states.unknown ? ` · ? ${s.states.unknown} not established` : ""}</span>` : ""}${s.unexpandedRoles ? ` <span class="tag new" title="An excluded directory role is not expanded to its members, so those users are excluded and are not counted above">🛡 ${s.unexpandedRoles} excluded role${s.unexpandedRoles === 1 ? "" : "s"} not expanded</span>` : ""}${s.pathPartial ? ` <span class="tag new" title="Effective membership is complete; the route (direct or through which nested group) could not be fully resolved for these groups">↪ ${s.pathPartial} group${s.pathPartial === 1 ? "" : "s"} with an unresolved path${s.pathUnknownUsers ? ` · ${s.pathUnknownUsers} user${s.pathUnknownUsers === 1 ? "" : "s"}` : ""}</span>` : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${s.entities}<span class="mini" style="font-weight:400"> exclusions</span></div>
        <div class="mini">${s.policiesWithExclusions} of ${s.policies} policies have exclusions</div>
        <div class="mini">${s.users} user${s.users === 1 ? "" : "s"} effectively excluded</div>
      </div>
    </div>`;
  }

  // Entities of the same kind that are excluded from exactly the same set of
  // policies say one thing, not seventeen — collapse them into a single row.
  // (A baseline typically excludes all 17 admin roles from the same policy.)
  function mergeRows(list) {
    const groups = new Map();
    for (const e of list) {
      const key = e.kind + "|" + [...e.policyIds].sort().join(",");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.values()].map((items) => ({
      kind: items[0].kind,
      policyIds: items[0].policyIds,
      items,
      name: items.length === 1 ? items[0].name : `${items.length} ${KIND[items[0].kind].label.toLowerCase()}s`,
      merged: items.length > 1,
    })).sort((a, b) => (KIND[a.kind].order - KIND[b.kind].order) || b.policyIds.size - a.policyIds.size
      || b.items.length - a.items.length || String(a.name).localeCompare(String(b.name)));
  }

  const nestSub = (e) => {
    const bits = [];
    if (e.nested && e.nested.length) bits.push(`↪ ${e.nestedCount === e.memberTotal ? "all" : e.nestedCount} through ${e.nested.length} nested group${e.nested.length === 1 ? "" : "s"}`);
    if (e.unknownPathCount) bits.push(`${e.unknownPathCount} path not resolved`);
    else if (e.pathComplete === false) bits.push("path partly unresolved");
    if (e.nestingCapped) bits.push(`${e.nestingCapped} nested group${e.nestingCapped === 1 ? "" : "s"} beyond the read cap`);
    return bits.length ? ` · ${bits.join(" · ")}` : "";
  };
  const appSub = (e) => {
    const bits = [];
    if (e.noSp) bits.push("⚠ no service principal in this tenant");
    if (e.uncoveredIn && e.uncoveredIn.length) {
      const st = e.uncoveredIn.map((pid) => (e.verdicts && e.verdicts[pid] && e.verdicts[pid].state) || "none");
      const part = st.filter((x) => x === "partial").length, unk = st.filter((x) => x === "unestablished").length;
      const none = st.length - part - unk;
      const bit = [];
      if (none) bit.push(`no equivalent coverage in ${none}`);
      if (part) bit.push(`partial in ${part}`);
      if (unk) bit.push(`not established in ${unk}`);
      bits.push(`⚠ ${bit.join(" · ")} polic${st.length === 1 ? "y" : "ies"}`);
    }
    return bits.join(" · ");
  };
  const rowSub = (e) => (e.kind === "group"
    ? (e.memberTotal == null ? "members unknown" : `${e.memberTotal} member${e.memberTotal === 1 ? "" : "s"}${nestSub(e)}`)
    : e.kind === "app"
      ? [e.id !== e.name ? e.id : "", appSub(e)].filter(Boolean).join(" · ")
      : e.upn || (e.id !== e.name ? e.id : ""));

  // Focus banner — shown above a matrix when a row and/or column is pinned, so
  // it is clear the grid is filtered and there is a one-click way back.
  function focusBanner(rowLabel, colLabel) {
    if (!rowLabel && !colLabel) return "";
    const bits = [];
    if (rowLabel) bits.push(`<b>${esc(rowLabel)}</b>`);
    if (colLabel) bits.push(`policy <b>${esc(colLabel)}</b>`);
    return `<div class="ex-focus">🔎 Filtered to ${bits.join(" × ")} — only in-scope ${rowLabel && !colLabel ? "policies" : colLabel && !rowLabel ? "exclusions" : "cells"} shown.<button class="fchip" data-exclearfocus="1">✕ Clear filter</button></div>`;
  }

  // matrix: exclusions (rows) × policies (columns)
  // focus = { row: entityKey|null, col: policyId|null } — clicking a row hides
  // every policy that entity is *in scope* for (all the "·" columns); clicking a
  // policy header hides every exclusion not in scope for it (all the "·" rows).
  function renderMatrix(model, filterKind, query, merge = true, focus = {}) {
    if (!model.policies.some((p) => p.exclusionCount > 0)) return '<p class="mini" style="padding:20px">No policy in scope has any exclusion configured.</p>';
    const q = (query || "").toLowerCase();
    let matched = model.entities
      .filter((e) => filterKind === "all" || e.kind === filterKind)
      .filter((e) => !q || String(e.name).toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q))
      .sort(sortEntities);

    // resolve the requested focus against what is actually visible now
    const focusEnt = focus.row ? model.entities.find((e) => e.key === focus.row) : null;
    let pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const focusPol = focus.col ? pols.find((p) => p.id === focus.col) : null;

    if (focusEnt) pols = pols.filter((p) => focusEnt.policyIds.has(p.id));           // hide the entity's out-of-scope columns
    if (focusPol) matched = matched.filter((e) => e.policyIds.has(focusPol.id));      // hide out-of-scope rows for the pinned policy

    const banner = focusBanner(focusEnt ? focusEnt.name : null, focusPol ? focusPol.name : null);
    if (!matched.length) return `${banner}<p class="mini" style="padding:20px">No exclusions match the current filter.</p>`;
    if (!pols.length) return `${banner}<p class="mini" style="padding:20px">The pinned exclusion is not in scope for any policy.</p>`;

    const rows = merge ? mergeRows(matched) : matched.map((e) => ({ kind: e.kind, policyIds: e.policyIds, items: [e], name: e.name, merged: false }));
    const collapsed = matched.length - rows.length;
    const head = `<th class="ucol" style="position:relative">Exclusion (${rows.length}${collapsed ? ` of ${matched.length}` : ""})<span class="colgrip" data-colgrip="1" title="Drag to resize"></span></th>` + pols.map((p) =>
      `<th class="pcol clickable${focusPol && focusPol.id === p.id ? " focused" : ""}" data-expol="${esc(p.id)}"><div class="ph" title="Click to show only exclusions in scope for: ${esc(p.name)}">${esc(p.name)}${p.state === "disabled" ? " [Off]" : p.state === "enabledForReportingButNotEnforced" ? " [RO]" : ""}</div></th>`).join("");
    // What a grid does that a list cannot: show the ODD ONE OUT. When most of
    // the policies on screen carry an exclusion, the few that do not are the
    // finding — a baseline everybody trusts except one policy. The dominant
    // pattern is drawn muted and the deviation carries the colour.
    const DEV_MIN = 0.6;
    const devOf = (r) => {
      const inScope = pols.filter((p) => r.policyIds.has(p.id)).length;
      if (!pols.length || inScope < 2) return null;
      const share = inScope / pols.length;
      if (share < DEV_MIN || share === 1) return null;
      return { inScope, missing: pols.length - inScope };
    };
    const body = rows.map((r) => {
      const dev = devOf(r);
      const rowKey = r.items.length === 1 ? r.items[0].key : "";
      const clickable = rowKey ? " clickable" : "";
      const focused = rowKey && focus.row === rowKey ? " focused" : "";
      const label = r.merged
        ? `<span class="uname" title="${esc(r.items.map((i) => i.name).join(", "))}">${KIND[r.kind].icon} ${esc(r.name)}</span><div class="uupn" title="${esc(r.items.map((i) => i.name).join(", "))}">${esc(r.items.map((i) => i.name).join(" · "))}</div>`
        : (() => {
            const e0 = r.items[0], sub = rowSub(e0);
            // a group's member count opens the member list rather than filtering
            const canList = r.kind === "group" && e0.members && e0.members.length;
            const subHtml = sub ? " · " + (canList
              ? `<button class="ex-memlink" data-exmembers="${esc(e0.key)}" title="Show the members of ${esc(e0.name)}">${esc(sub)}</button>`
              : esc(sub)) : "";
            return `<span class="uname" title="Click to show only the policies excluding: ${esc(e0.name)}">${KIND[r.kind].icon} ${esc(e0.name)}</span><div class="uupn" title="${esc(e0.id)}">${esc(KIND[r.kind].label)}${subHtml}</div>`;
          })();
      return `<tr><td class="ucol${r.merged ? " merged" : ""}${clickable}${focused}"${rowKey ? ` data-exrow="${esc(rowKey)}"` : ""}>${label}</td>` +
        pols.map((p) => r.policyIds.has(p.id)
          ? `<td class="cellv${dev ? " dom" : " no"}" title="${esc(r.name)} excluded from ${esc(p.name)}"><span class="cell ${dev ? "dom" : "no"}">✗</span></td>`
          : dev
            ? `<td class="cellv dev" title="${esc(p.name)} does NOT exclude ${esc(r.name)} — ${dev.inScope} of ${pols.length} policies do. The odd one out is the finding here."><span class="cell dev">⚠</span></td>`
            : `<td class="cellv"><span class="cell na">·</span></td>`).join("") + "</tr>";
    }).join("");
    const devRows = rows.filter((r) => devOf(r));
    const note = `${collapsed ? `<p class="mini" style="padding:8px 2px 0">${collapsed} exclusion${collapsed === 1 ? "" : "s"} merged into shared rows — entries of the same type excluded from exactly the same policies are shown together.</p>` : ""}
      ${devRows.length ? `<p class="mini" style="padding:6px 2px 0"><b>⚠ marks the odd one out</b> — ${devRows.map((r) => `${esc(r.name)} is excluded from ${devOf(r).inScope} of ${pols.length} policies, not from ${devOf(r).missing}`).join("; ")}. A grid is the only view that shows a gap in a pattern; the Exclusions list is the better inventory.</p>` : ""}`;
    return `${banner}<div class="mwrap-x"><table class="mtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${note}`;
  }

  // Grouped view — the readable default. One card per distinct exclusion set:
  // the policies are named in the card header, so nothing has to be read off a
  // 90-column grid. The matrix stays available for cross-referencing.
  function renderGroups(model, filterKind, query) {
    const q = (query || "").toLowerCase();
    const matched = model.entities
      .filter((e) => filterKind === "all" || e.kind === filterKind)
      .filter((e) => !q || String(e.name).toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q));
    if (!matched.length) return '<p class="mini" style="padding:20px">No exclusions match the current filter.</p>';

    // one card per identical policy set, regardless of entity kind
    const sets = new Map();
    for (const e of matched) {
      const key = [...e.policyIds].sort().join(",");
      if (!sets.has(key)) sets.set(key, { policyIds: e.policyIds, entities: [] });
      sets.get(key).entities.push(e);
    }
    const byId = new Map(model.policies.map((p) => [p.id, p]));
    const cards = [...sets.values()]
      .sort((a, b) => b.policyIds.size - a.policyIds.size || b.entities.length - a.entities.length)
      .map((s) => {
        const pols = [...s.policyIds].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
        const polList = pols.map((p) => `<span class="ex-pol${p.state === "disabled" ? " off" : p.state === "enabledForReportingButNotEnforced" ? " ro" : ""}">${esc(p.name)}${p.state === "disabled" ? " · Off" : p.state === "enabledForReportingButNotEnforced" ? " · report-only" : ""}</span>`).join("");
        // entities grouped by kind inside the card
        const byKind = new Map();
        for (const e of s.entities) { if (!byKind.has(e.kind)) byKind.set(e.kind, []); byKind.get(e.kind).push(e); }
        const kinds = [...byKind.entries()].sort((a, b) => KIND[a[0]].order - KIND[b[0]].order).map(([k, items]) => {
          items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
          const chips = items.map((e) => {
            const sub = rowSub(e);
            const nest = e.kind === "group" && e.nested && e.nested.length ? `<em class="ex-nest" title="${esc(e.nestedCount)} of ${esc(e.memberTotal)} members come through ${esc(e.nested.map((n) => n.name).join(", "))}">↪${e.nestedCount === e.memberTotal ? " all" : ` ${e.nestedCount}`}</em>` : "";
            return `<span class="ex-ent${e.kind === "group" && e.nested && e.nested.length && e.directCount === 0 ? " allnested" : ""}" title="${esc(e.id)}${sub ? " · " + esc(sub) : ""}">${esc(e.name)}${e.kind === "group" && e.memberTotal != null ? `<i>${e.memberTotal}</i>` : ""}${nest}</span>`;
          }).join("");
          return `<div class="ex-kind"><div class="ex-kind-h">${KIND[k].icon} ${esc(KIND[k].label)}${items.length === 1 ? "" : "s"} <b>${items.length}</b></div><div class="ex-chips">${chips}</div></div>`;
        }).join("");
        // what is excluded comes first; the policies doing the excluding follow
        return `<div class="list-card ex-card">
          <div class="ex-card-b">
            <div class="ex-card-t">${s.entities.length} exclusion${s.entities.length === 1 ? "" : "s"}</div>
            ${kinds}
          </div>
          <div class="ex-card-h">
            <div class="ex-card-t">Excluded from <b>${pols.length}</b> polic${pols.length === 1 ? "y" : "ies"}</div>
            <div class="ex-pols">${polList}</div>
          </div>
        </div>`;
      }).join("");
    return `<p class="mini" style="margin:0 0 10px">${matched.length} exclusion${matched.length === 1 ? "" : "s"} across ${sets.size} distinct exclusion set${sets.size === 1 ? "" : "s"} — everything in a card is excluded from exactly the same policies.</p>${cards}`;
  }

  // matrix: effectively excluded users (rows) × policies (columns)
  // focus = { row: userId|null, col: policyId|null } — same click-to-filter
  // behaviour as the exclusion matrix, so "not in scope" (·) cells drop away.
  function renderUsers(model, users, query, page, pageSize, focus = {}) {
    let pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const q = (query || "").toLowerCase();
    let list = users.filter((u) => !q || u.name.toLowerCase().includes(q) || (u.upn || "").toLowerCase().includes(q));

    const focusUser = focus.row ? users.find((u) => u.id === focus.row) : null;
    const focusPol = focus.col ? pols.find((p) => p.id === focus.col) : null;
    if (focusUser) pols = pols.filter((p) => focusUser.byPolicy.has(p.id));            // hide the user's out-of-scope columns
    if (focusPol) list = list.filter((u) => u.byPolicy.has(focusPol.id));              // hide users not excluded from the pinned policy

    const banner = focusBanner(focusUser ? focusUser.name : null, focusPol ? focusPol.name : null);
    if (!list.length) return { html: `${banner}<p class="mini" style="padding:20px">No excluded users match the current filter.</p>`, pages: 1, page: 0 };
    if (!pols.length) return { html: `${banner}<p class="mini" style="padding:20px">The pinned user is not excluded from any policy.</p>`, pages: 1, page: 0 };
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(Math.max(0, page), pages - 1);
    const slice = list.slice(page * pageSize, (page + 1) * pageSize);
    const head = `<th class="ucol" style="position:relative">Excluded user (${list.length})<span class="colgrip" data-colgrip="1" title="Drag to resize"></span></th>` + pols.map((p) =>
      `<th class="pcol clickable${focusPol && focusPol.id === p.id ? " focused" : ""}" data-expol="${esc(p.id)}"><div class="ph" title="Click to show only users excluded from: ${esc(p.name)} — ${esc(p.state === "enabled" ? "On" : p.state === "enabledForReportingButNotEnforced" ? "Report-only" : "Off")}">${esc(p.name)}${p.state === "disabled" ? " [Off]" : p.state === "enabledForReportingButNotEnforced" ? " [RO]" : ""}</div></th>`).join("");
    const body = slice.map((u) => `<tr><td class="ucol clickable${focus.row === u.id ? " focused" : ""}" data-exrow="${esc(u.id)}"><span class="uname" title="Click to show only the policies excluding: ${esc(u.name)}">${esc(u.name)}</span><div class="uupn" title="${esc(u.upn)}">${esc(u.upn)}</div></td>` +
      pols.map((p) => {
        const cell = u.byPolicy.get(p.id);
        if (!cell) return `<td class="cellv"><span class="cell na">·</span></td>`;
        const r = cell.reasons;
        const direct = r.some((x) => x.via === "direct");
        const groups = [...new Set(r.filter((x) => x.via === "group").map((x) => x.group + (x.nested ? ` ↪ ${x.through.length ? x.through.join(" / ") : "a nested group"}` : x.pathUnknown ? " ↪ path not resolved" : "")))];
        const nestedOnly = !direct && r.length > 0 && r.every((x) => x.nested);
        const how = direct ? "excluded directly" : `excluded via ${groups.join(", ")}${nestedOnly ? " — through nesting only" : ""}`;
        // Configured-only and unknown rows are deliberately NOT drawn like a
        // bypass: the exclusion exists, but it takes nothing out of scope.
        if (cell.state === "configured") return `<td class="cellv" title="${esc(u.name)}: ${esc(how)}, but this policy does not include them in the first place — configured, not a bypass"><span class="cell na" style="opacity:.75">○</span></td>`;
        if (cell.state === "unknown") return `<td class="cellv ro" title="${esc(u.name)}: ${esc(how)}. Whether this policy includes them could not be decided here — its include side names a group or role this scan did not read."><span class="cell ro">?</span></td>`;
        return `<td class="cellv no" title="${esc(u.name)}: ${esc(how)}"><span class="cell ${direct ? "no" : nestedOnly ? "ro nest" : "ro"}">${direct ? "✗" : nestedOnly ? "↪" : "◐"}</span></td>`;
      }).join("") + "</tr>").join("");
    const st = model.userStates || {};
    const legend = `<p class="mini muted" style="margin:8px 2px 0">✗ direct bypass · ◐ via a group · ↪ through nesting only · ○ listed in an exclusion but the policy never includes them (not a bypass) · ? include side not read, so it could not be decided · &nbsp;&middot;&nbsp; not excluded.
      ${st.bypass || 0} user${st.bypass === 1 ? "" : "s"} effectively bypass a policy; ${st.configured || 0} ${st.configured === 1 ? "is" : "are"} configured only; ${st.unknown || 0} could not be decided.
      ${(model.unexpanded && model.unexpanded.roles.length) ? `${model.unexpanded.roles.length} excluded directory role${model.unexpanded.roles.length === 1 ? " is" : "s are"} NOT expanded to members — those users are excluded and are not rows here.` : ""}
      ${(model.unexpanded && model.unexpanded.guests.length) ? `${model.unexpanded.guests.length} guest/external clause${model.unexpanded.guests.length === 1 ? "" : "s"} cover people who hold no listed membership here.` : ""}</p>`;
    return { html: `${banner}<div class="mwrap-x"><table class="mtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${legend}`, pages, page };
  }

  // risk review: policies worth looking at, worst first
  const LEVEL_LABEL = { high: "High", medium: "Medium", info: "Info", none: "No flags" };
  function renderRisk(rk, query) {
    const q = (query || "").toLowerCase();
    const rows = rk.rows.filter((r) => !q || r.name.toLowerCase().includes(q)
      || r.flags.some((f) => `${f.text} ${f.detail}`.toLowerCase().includes(q)));
    if (!rows.length) return '<p class="mini" style="padding:20px">No policy matches the current filter.</p>';
    const stateTag = (s) => s === "disabled" ? '<span class="tag">Off</span>'
      : s === "enabledForReportingButNotEnforced" ? '<span class="tag">report-only</span>' : "";
    return `<p class="mini muted" style="margin:0 0 10px">${rk.counts.high} high · ${rk.counts.medium} medium · ${rk.counts.info} info · ${rk.counts.none} with no flags.
      Patterns follow Tiago S. Carvalho's CA exclusions audit — each flag is a prompt to review, not a finding.</p>`
      + rows.map((r) => `<div class="list-card rk-card ${r.level}">
        <div class="rk-h">
          <span class="rk-lv ${r.level}">${LEVEL_LABEL[r.level]}</span>
          <b class="pol-link" data-polid="${esc(r.id)}">${esc(r.name)}</b> ${stateTag(r.state)}
          <span class="mini muted rk-meta">${r.exclusionCount} exclusion${r.exclusionCount === 1 ? "" : "s"}${r.reach ? ` · reaches ${r.reach} user${r.reach === 1 ? "" : "s"}` : ""}</span>
        </div>
        ${r.flags.length ? `<ul class="rk-flags">${r.flags.map((f) => `<li class="${f.level}">
            <span class="rk-fl ${f.level}">${LEVEL_LABEL[f.level]}</span>
            <span><b>${esc(f.text)}</b>${f.detail ? `<div class="rk-d">${esc(f.detail)}</div>` : ""}</span></li>`).join("")}</ul>`
          : '<p class="mini muted" style="margin:6px 0 0">No governance flags — exclusions look routine.</p>'}
      </div>`).join("");
  }

  // ---- CSV export (exclusion × policy) ----
  function toCsv(model, users) {
    const pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [];
    lines.push([q("Type"), q("Exclusion"), q("Id"), q("Members"), ...pols.map((p) => q(p.name))].join(","));
    model.entities.slice().sort(sortEntities).forEach((e) => {
      lines.push([q(KIND[e.kind].label), q(e.name), q(e.id), q(e.kind === "group" ? (e.memberTotal ?? "") : ""),
        ...pols.map((p) => q(e.policyIds.has(p.id) ? "excluded" : ""))].join(","));
    });
    lines.push("");
    lines.push([q("Excluded user"), q("UPN"), ...pols.map((p) => q(`${p.name} [${p.state === "enabled" ? "On" : p.state === "enabledForReportingButNotEnforced" ? "Report-only" : "Off"}]`))].join(","));
    users.forEach((u) => {
      lines.push([q(u.name), q(u.upn), ...pols.map((p) => {
        const cell = u.byPolicy.get(p.id);
        if (!cell) return q("");
        const r = cell.reasons;
        const how = r.some((x) => x.via === "direct") ? "direct"
          : `via ${[...new Set(r.filter((x) => x.via === "group").map((x) => x.group + (x.nested ? ` > ${x.through.join("+") || "nested"}` : x.pathUnknown ? " > path not resolved" : "")))].join(" / ")}`;
        const label = cell.state === "bypass" ? "effective bypass" : cell.state === "configured" ? "configured only (policy does not include them)" : "not established (include side not read)";
        return q(`${label}: ${how}`);
      })].join(","));
    });
    return lines.join("\n");
  }

  // ---- Markdown export (shareable / pasteable into a chat or ticket) ----
  // Wide matrices do not survive markdown, so the matrix is transposed into
  // one row per exclusion with the excluding policies listed inline. A compact
  // ✗/◐ matrix is added as well when the policy count still fits.
  const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const stateTag = (s) => (s === "disabled" ? " *(Off)*" : s === "enabledForReportingButNotEnforced" ? " *(report-only)*" : "");
  const MD_MATRIX_MAX = 12; // columns beyond this become unreadable

  function toMd(model, users, tenantName) {
    const pols = model.policies.filter((p) => p.exclusionCount > 0).slice().sort((a, b) => a.name.localeCompare(b.name));
    const clean = model.policies.filter((p) => !p.exclusionCount);
    const s = summary(model, users);
    const ents = model.entities.slice().sort(sortEntities);
    const L = [];

    L.push(`# CA Exclusion analysis — ${mdEsc(tenantName || "tenant")}`);
    L.push("");
    L.push(Brand.generatedBy());
    L.push("");
    L.push("## Summary");
    L.push("");
    L.push(`- Policies in scope: **${s.policies}** — **${s.policiesWithExclusions}** have one or more exclusions, ${s.policies - s.policiesWithExclusions} have none.`);
    L.push(`- Distinct exclusions: **${s.entities}**` + (Object.keys(s.counts).length
      ? ` (${Object.entries(s.counts).sort((a, b) => KIND[a[0]].order - KIND[b[0]].order).map(([k, n]) => `${n} ${KIND[k].label.toLowerCase()}${n === 1 ? "" : "s"}`).join(", ")})`
      : ""));
    L.push(`- Users effectively excluded from at least one policy (directly or through a group): **${s.users}**`);
    if (s.uncoveredApps) L.push(`- **${s.uncoveredApps}** app${s.uncoveredApps === 1 ? "" : "s"} excluded from an All-resources policy with **no equivalent coverage established** — no enabled policy was shown to give the same users the same protection. This is what the comparison could establish, not proof that nothing else protects them.`);
    if (s.phantomApps) L.push(`- **${s.phantomApps}** phantom app exclusion${s.phantomApps === 1 ? "" : "s"}: excluded app ids with no service principal in this tenant — the exclusion matches nothing today and goes live on consent.`);
    L.push("");

    // ---- risk review ----
    const rk = risk(model);
    if (rk.rows.length) {
      L.push("## Risk review");
      L.push("");
      L.push(`**${rk.counts.high}** high · **${rk.counts.medium}** medium · ${rk.counts.info} info · ${rk.counts.none} with no flags. Flag patterns follow [Tiago S. Carvalho's CA exclusions audit](https://www.tiagoscarvalho.com/scripts-automation/ca-exclusions-audit) — each is a prompt to review, not a finding.`);
      L.push("");
      for (const r of rk.rows.filter((x) => x.level !== "none")) {
        L.push(`### ${LEVEL_LABEL[r.level]} — ${mdEsc(r.name)}${stateTag(r.state)}`);
        L.push("");
        r.flags.forEach((f) => L.push(`- **${LEVEL_LABEL[f.level]}** — ${mdEsc(f.text)}${f.detail ? ` _${mdEsc(f.detail)}_` : ""}`));
        L.push("");
      }
    }

    // ---- exclusions ----
    L.push("## Exclusions by policy");
    L.push("");
    if (!ents.length) {
      L.push("_No exclusions are configured on any policy in scope._");
    } else {
      L.push("Entries of the same type excluded from exactly the same policies are merged into one row.");
      L.push("");
      L.push("| Type | Exclusion | Members | Policies | Excluded from |");
      L.push("| --- | --- | --- | --- | --- |");
      for (const r of mergeRows(ents)) {
        const names = pols.filter((p) => r.policyIds.has(p.id)).map((p) => mdEsc(p.name));
        const who = (r.merged ? `**${r.items.length} ${KIND[r.kind].label.toLowerCase()}s** — ${r.items.map((i) => mdEsc(i.name)).join(", ")}` : mdEsc(r.items[0].name))
          + (r.kind === "app" ? r.items.map((i) => appSub(i)).filter(Boolean).map((t) => ` _${mdEsc(t)}_`).join("") : "");
        const members = r.kind === "group" ? r.items.reduce((s, i) => s + (i.memberTotal || 0), 0) || "?" : "—";
        L.push(`| ${KIND[r.kind].label} | ${who} | ${members} | ${names.length} | ${names.join("<br>") || "—"} |`);
      }
    }
    L.push("");

    // ---- compact matrix when it fits ----
    if (pols.length && pols.length <= MD_MATRIX_MAX && ents.length) {
      L.push("### Exclusion × policy matrix");
      L.push("");
      L.push(`| Exclusion | ${pols.map((p) => mdEsc(p.name)).join(" | ")} |`);
      L.push(`| --- |${pols.map(() => " :-: |").join("")}`);
      for (const e of ents) {
        L.push(`| ${KIND[e.kind].label}: ${mdEsc(e.name)} | ${pols.map((p) => (e.policyIds.has(p.id) ? "✗" : "·")).join(" | ")} |`);
      }
      L.push("");
      L.push("`✗` = excluded · `·` = in scope");
      L.push("");
    }

    // ---- group membership ----
    const groups = ents.filter((e) => e.kind === "group" && e.members && e.members.length);
    if (groups.length) {
      L.push("## Excluded group membership");
      L.push("");
      for (const g of groups) {
        const more = g.memberTotal != null && g.memberTotal > g.members.length ? ` — showing ${g.members.length} of ${g.memberTotal}` : "";
        L.push(`**${mdEsc(g.name)}** (${g.memberTotal == null ? "?" : g.memberTotal} member${g.memberTotal === 1 ? "" : "s"}${more})`);
        L.push("");
        for (const m of g.members) L.push(`- ${mdEsc(m.name)}${m.upn ? ` — \`${mdEsc(m.upn)}\`` : ""}`);
        L.push("");
      }
    }

    // ---- effective users ----
    L.push("## Effectively excluded users");
    L.push("");
    if (!users.length) {
      L.push("_No individual user could be resolved from the configured exclusions._");
    } else {
      L.push("| User | UPN | Policies | Excluded from (how) |");
      L.push("| --- | --- | --- | --- |");
      for (const u of users) {
        const parts = [];
        for (const p of pols) {
          const cell = u.byPolicy.get(p.id);
          if (!cell) continue;
          const r = cell.reasons;
          const how = r.some((x) => x.via === "direct")
            ? "direct"
            : `via ${[...new Set(r.filter((x) => x.via === "group").map((x) => x.group + (x.nested ? ` ↪ ${x.through.join(" + ") || "nested"}` : x.pathUnknown ? " ↪ path not resolved" : "")))].map(mdEsc).join(" / ")}`;
          const label = cell.state === "bypass" ? how : cell.state === "configured" ? `${how} — configured only, the policy does not include them` : `${how} — not established, the include side was not read`;
          parts.push(`${mdEsc(p.name)} (${label})`);
        }
        L.push(`| ${mdEsc(u.name)} | ${mdEsc(u.upn)} | ${parts.length} | ${parts.join("<br>") || "—"} |`);
      }
    }
    L.push("");

    if (clean.length) {
      L.push("## Policies without exclusions");
      L.push("");
      for (const p of clean) L.push(`- ${mdEsc(p.name)}${stateTag(p.state)}`);
      L.push("");
    }
    return L.join("\n");
  }

  return { collect, resolve, appCoverage, effectiveUsers, risk, summary, renderSummary, renderGroups, renderMatrix, renderUsers, renderRisk, toCsv, toMd, KIND };
})();
