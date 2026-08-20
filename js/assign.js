// ======================================================================
// Assign groups — web port of Update-CAPolicyGroupAssignments.ps1.
// Changes the include/exclude groups of selected CA policies from a
// predefined persona-group list (or any group resolved by name).
// WRITE operation: uses Policy.ReadWrite.ConditionalAccess, requested on
// demand. Creating role-assignable groups is NOT ported (needs PRA +
// RoleManagement.ReadWrite.Directory) — use the PowerShell script for that.
// ======================================================================
const Assign = (() => {
  const ACTIONS = [
    "Set INCLUDE groups (replace current include groups)",
    "Set EXCLUDE groups (replace current exclude groups)",
    "ADD to INCLUDE groups (keep existing, add selected)",
    "ADD to EXCLUDE groups (keep existing, add selected)",
    "Set INCLUDE to All Users (clear include groups)",
    "REMOVE from INCLUDE groups (keep the rest)",
    "REMOVE from EXCLUDE groups (keep the rest)",
    "RESTORE each policy's own CAxxx-Exclusion group (adds only what is missing)",
  ];
  // Which actions read a group selection (everything except "All Users" and
  // the mapped restore, which works out its own group per policy).
  const NEEDS_GROUPS = (a) => a !== 4 && !MAPPED_ACTIONS.has(a);

  // ---------- the mapped action: one group PER POLICY --------------------
  // Every other action applies ONE group list to every selected policy. The
  // baseline's per-policy exclusion groups cannot work that way: CA200 wants
  // CAB-SEC-U-CA200-Exclusion and CA201 wants CAB-SEC-U-CA201-Exclusion, so
  // the target is a mapping, not a list. That is the whole reason this action
  // exists rather than being "ADD to EXCLUDE" used carefully — and why the
  // write goes through applyMapped() instead of apply().
  const MAPPED_ACTIONS = new Set([7]);

  // The same seven actions, aimed at directory roles instead. This is the
  // portal's "Directory roles" under Include/Exclude — the assignment behind
  // every "require MFA for admins" policy. "All users" has no role equivalent,
  // so that slot is empty and the wizard hides it.
  const ROLE_ACTIONS = [
    "Set INCLUDE roles (replace current include roles)",
    "Set EXCLUDE roles (replace current exclude roles)",
    "ADD to INCLUDE roles (keep existing, add selected)",
    "ADD to EXCLUDE roles (keep existing, add selected)",
    null,
    "REMOVE from INCLUDE roles (keep the rest)",
    "REMOVE from EXCLUDE roles (keep the rest)",
    null,   // the CAxxx-Exclusion convention is about groups; roles have none
  ];
  const actionsFor = (target) => (target === "roles" ? ROLE_ACTIONS : ACTIONS);

  // Microsoft's minimum set for "require MFA for administrators"
  // (learn.microsoft.com/entra/identity/conditional-access/policy-old-require-mfa-admin).
  // Held as NAMES and resolved against the tenant's own role templates rather
  // than hard-coded GUIDs — a wrong GUID here would silently target nothing.
  const ADMIN_ROLE_NAMES = [
    "Global Administrator", "Application Administrator", "Authentication Administrator",
    "Billing Administrator", "Cloud Application Administrator", "Conditional Access Administrator",
    "Exchange Administrator", "Helpdesk Administrator", "Password Administrator",
    "Privileged Authentication Administrator", "Privileged Role Administrator",
    "Security Administrator", "SharePoint Administrator", "User Administrator",
  ];

  // "Admin roles" as someone asking for them means it. directoryRoleTemplates
  // is every built-in template, which includes Guest User, Restricted Guest
  // User, Device Join and the Partner Tier support roles — not things anyone
  // means when they say "all the admin roles", and offering them behind one
  // click is how a policy ends up scoped to 146 entries by accident.
  const isAdminRole = (r) => /administrator/i.test(r.name) || !!r.recommended;

  // Conditional Access is enforced for BUILT-IN roles only — not custom roles
  // and not administrative-unit-scoped assignments. directoryRoleTemplates is
  // exactly the built-in set, and its id IS the roleTemplateId a policy stores.
  async function roleTemplates() {
    const list = await Graph.ggetAll("/directoryRoleTemplates?$select=id,displayName,description");
    const rec = new Set(ADMIN_ROLE_NAMES.map((n) => n.toLowerCase()));
    return list
      .map((r) => ({ id: r.id, name: r.displayName || r.id, description: r.description || "",
                     recommended: rec.has(String(r.displayName || "").toLowerCase()) }))
      .sort((a, b) => (b.recommended - a.recommended) || a.name.localeCompare(b.name));
  }

  // The baseline personas and the group that represents each. Lets the wizard
  // offer "pick by persona" instead of hunting for the exact group name — and
  // create it from a template if the tenant does not have it yet. Order matches
  // the CA-number ranges the rest of the app groups by.
  const PERSONAS = [
    { key: "global", label: "🌐 Global", group: null },  // no single persona group; global policies use All-users − exclusions
    { key: "admins", label: "🛡 Admins", group: "CAB-SEC-U-Persona-Admins" },
    { key: "internals", label: "👤 Internals", group: "CAB-SEC-U-Persona-Internals" },
    { key: "externals", label: "🤝 Externals", group: "CAB-SEC-U-Persona-Externals" },
    { key: "guestusers", label: "👥 Guest users", group: "CAB-SEC-U-Persona-GuestUsers" },
    { key: "guestadmins", label: "🔑 Guest admins", group: "CAB-SEC-U-Persona-GuestAdmins" },
    { key: "serviceaccounts", label: "⚙ M365 service accounts", group: "CAB-SEC-U-Persona-Microsoft365ServiceAccounts" },
    { key: "devops", label: "🧰 DevOps", group: "CAB-SEC-U-Persona-DevOps" },
    { key: "breakglass", label: "🚨 Break-glass", group: "CAB-SEC-U-BreakGlass" },
  ];
  // Only personas that map to a real group can be picked directly.
  const personasWithGroup = () => PERSONAS.filter((p) => p.group);
  const templateFor = (name) => templates().find((t) => t.displayName === name)
    || { displayName: name, mailNickname: name.replace(/[^A-Za-z0-9]/g, "") };
  // Which actions only ever remove — safe to run tenant-wide without the ALL
  // guard, like ADD-to-exclude, because they never rewrite what stays.
  const REMOVE_ACTIONS = new Set([5, 6]);

  const PREDEFINED = [
    // deploy / test
    "CAD-SEC-U-DG-GLO", "CAD-SEC-U-DG-ADM", "CAD-SEC-U-DG-INT", "CAD-SEC-U-DG-EXT",
    "CAD-SEC-U-DG-GUESTUSERS", "CAD-SEC-U-DG-GUESTAdmins", "CAD-SEC-U-DG-SA",
    "CAD-SEC-U-DG-DevOps", "CAD-SEC-U-DG-FW",
    // production
    "CAB-SEC-U-BreakGlass", "Emergency_Access1", "Emergency_Access2",
    "CAB-SEC-U-Persona-Admins", "CAB-SEC-U-Persona-GuestAdmins", "CAB-SEC-U-Persona-Guests",
    "CAB-SEC-U-Persona-Internals", "CAB-SEC-U-Persona-Externals",
    "CAB-SEC-U-Persona-Microsoft365ServiceAccounts", "CAB-SEC-U-Persona-DevOps",
  ];

  async function findGroup(name) {
    const flt = encodeURIComponent(`displayName eq '${name.replace(/'/g, "''")}'`);
    const found = await Graph.ggetAll(`/groups?$filter=${flt}&$select=id,displayName`);
    return found.length ? { id: found[0].id, name: found[0].displayName } : null;
  }

  // Free-text group lookup, so any group can be picked as an exclusion target —
  // not only the persona groups the baseline knows about. Accepts an object ID
  // (exact) or a name prefix; exact-name matches are hoisted to the top so
  // typing a full name still behaves like findGroup did.
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  async function searchGroups(q, limit) {
    const term = String(q || "").trim();
    if (!term) return [];
    if (isGuid(term)) {
      try {
        const g = await Graph.gget(`/groups/${term}?$select=id,displayName`);
        return [{ id: g.id, name: g.displayName }];
      } catch { return []; }
    }
    const esc = term.replace(/'/g, "''");
    const flt = encodeURIComponent(`startswith(displayName,'${esc}')`);
    const found = await Graph.ggetAll(`/groups?$filter=${flt}&$select=id,displayName&$top=${limit || 25}`);
    const out = found.map((g) => ({ id: g.id, name: g.displayName }));
    out.sort((a, b) => (a.name.toLowerCase() === term.toLowerCase() ? -1 : 0)
      - (b.name.toLowerCase() === term.toLowerCase() ? -1 : 0) || a.name.localeCompare(b.name));
    return out.slice(0, limit || 25);
  }

  // Resolve the predefined groups that exist in this tenant.
  async function resolveGroups(onStatus) {
    const out = [];
    for (const name of PREDEFINED) {
      onStatus?.(`Checking ${name}…`);
      try { const g = await findGroup(name); if (g) out.push(g); } catch {}
    }
    return out;
  }

  // ---------- convention exclusions: what each policy SHOULD exclude -----
  // The baseline gives most numbered policies their own exclusion group, and
  // that reference is the first thing to go missing: somebody rebuilds a
  // policy, imports an older version, or tidies an exclusion list, and the
  // group is left in the directory with nothing pointing at it. Nothing
  // notices, because an absent exclusion looks exactly like a policy that
  // never had one — until the day the exception it existed for is needed.
  const CONV_RE = /^CAB-SEC-U-CA(\d+)-Exclusion$/i;
  // The CA token as the policy NAME spells it, leading zeros intact: CA006
  // and CA1009 are both real, and the group name has to match the tenant's
  // spelling character for character or the lookup finds nothing.
  const caToken = (policyName) => {
    const m = String(policyName || "").match(/\bCA(\d{3,4})\b/);
    return m ? m[1] : null;
  };

  // What group this policy should exclude, and on whose authority.
  //   catalog — the baseline itself names one for this CA number. Definitive.
  //   derived — the policy carries a CA number the catalog does not have (a
  //             tenant's own numbering), so the convention is applied by
  //             pattern. Offered, but labelled: it is an inference.
  // null means there is nothing to restore, which is the right answer for a
  // policy with no CA number AND for a catalog policy that legitimately has
  // no exclusion group of its own — 14 of the 99 do not.
  function conventionExclusionFor(policyName) {
    const tok = caToken(policyName);
    if (!tok) return null;
    const cat = (typeof BASELINE !== "undefined" ? BASELINE.policies : [])
      .find((p) => p.num === parseInt(tok, 10));
    if (cat) {
      const hit = (cat.exclude || [])
        .map((x) => String(x).replace(/\s*\(group\)$/, ""))
        .find((x) => CONV_RE.test(x));
      return hit ? { name: hit, source: "catalog" } : null;
    }
    return { name: `CAB-SEC-U-CA${tok}-Exclusion`, source: "derived" };
  }

  // One row per policy, so the panel can be read as a drift report rather
  // than a list of things to tick. States, and each is a different job:
  //   present  — already excluded. Nothing to do, and worth showing, because
  //              "how many are already right" is half the answer.
  //   missing  — the group exists in the tenant and the policy does not
  //              reference it. This is the one a run actually fixes.
  //   nogroup  — the group does not exist at all, so it must be created
  //              before it can be referenced.
  //   none     — no convention group applies to this policy.
  function conventionPlan(policyList, groupsByName) {
    const byName = groupsByName instanceof Map ? groupsByName
      : new Map((groupsByName || []).map((g) => [String(g.name).toLowerCase(), g]));
    return (policyList || []).map((p) => {
      const want = conventionExclusionFor(p.name);
      const row = { id: p.id, policy: p.name };
      if (!want) return { ...row, state: "none" };
      const g = byName.get(want.name.toLowerCase()) || null;
      const cur = new Set(((((p.raw || {}).conditions || {}).users || {}).excludeGroups) || []);
      if (!g) return { ...row, group: want.name, source: want.source, state: "nogroup" };
      if (cur.has(g.id)) return { ...row, group: want.name, groupId: g.id, source: want.source, state: "present" };
      return { ...row, group: want.name, groupId: g.id, source: want.source, state: "missing" };
    });
  }

  const planCounts = (rows) => (rows || []).reduce((a, r) => (a[r.state] = (a[r.state] || 0) + 1, a), {});

  // Every CAB-SEC group in one read. Resolving 99 names one at a time is 99
  // round trips for a question a single prefix filter answers.
  async function groupsByPrefix(prefix) {
    const p = String(prefix || "CAB-SEC-").replace(/'/g, "''");
    const flt = encodeURIComponent(`startswith(displayName,'${p}')`);
    const found = await Graph.ggetAll(`/groups?$filter=${flt}&$select=id,displayName&$top=999`);
    return found.map((g) => ({ id: g.id, name: g.displayName }));
  }

  // The mapped write. Same PATCH as apply(), but the group ids come from the
  // row rather than from one shared selection, and the action is fixed to
  // ADD-to-exclude: restoring a reference must never rewrite the exclusions a
  // policy already has, whatever else is in that list.
  async function applyMapped(items, onStatus) {
    const results = [];
    for (let i = 0; i < (items || []).length; i++) {
      const it = items[i];
      let name = it.policy || it.policyId;
      try {
        const fresh = await Graph.gget(`/identity/conditionalAccess/policies/${it.id}`);
        name = fresh.displayName || name;
        onStatus?.(`Updating ${name} (${i + 1}/${items.length})…`);
        const { users } = newUsersBlock(fresh, 3, [it.groupId], "groups");
        if (!groupsChanged(fresh, users)) { results.push({ name, ok: true, changed: false, group: it.group }); continue; }
        await Graph.gpatch(`/identity/conditionalAccess/policies/${it.id}`, { conditions: { users } });
        results.push({ name, ok: true, changed: true, group: it.group });
        await pause(80);
      } catch (e) {
        console.error(`Assign restore: ${name} failed`, e);
        results.push({ name, ok: false, error: e.message || String(e), group: it.group });
      }
    }
    return results;
  }

  // ---------- group creation (pure Graph, no PowerShell) ----------
  // ASSIGNED groups are always created role-assignable (isAssignableToRole:true
  // — immutable, so it must be set at creation).
  //
  // DYNAMIC groups are left exactly as designed: they keep their membership
  // rule and are NOT role-assignable, because Entra does not allow the two
  // together. A dynamic group's whole point is its rule, so the rule wins.
  // Build the Graph payload. Two axes, decoupled: assigned-vs-dynamic, and
  // role-assignable-or-not. The one combination Entra rejects is dynamic +
  // role-assignable, so that is the only thing forced here. For a baseline
  // template with no explicit roleAssignable, keep the historical default:
  // assigned groups are role-assignable, dynamic ones are not.
  // Group-NestingSupport.ReadWrite.All is what Learn names as the least
  // privileged permission for updating disableNesting; Group.ReadWrite.All
  // comes along because the same token reads the group back.
  const NEST_SCOPES = [...(typeof AUTH_CONFIG !== "undefined" ? AUTH_CONFIG.scopes : []),
                       "Group-NestingSupport.ReadWrite.All", "Group.ReadWrite.All"];

  function buildGroupPayload(t) {
    const nickname = (String(t.mailNickname || t.displayName || "grp").replace(/[^A-Za-z0-9]/g, "").slice(0, 60)) || "CADSECgroup";
    const dynamic = !!t.dynamic;
    // DEFAULT CHANGED (build 25026): assigned groups are no longer created
    // role-assignable. That flag was only ever used here for a side effect —
    // membership reachable by Global Administrator / Privileged Role
    // Administrator only — and a restricted management administrative unit
    // does that better, names who may manage it, and does not carry the
    // 500-per-tenant cap, the no-dynamic-membership rule or the inability to
    // control nesting. It also cannot be combined with a restricted AU: a
    // group with both has nobody who can change its members.
    //
    // An explicit roleAssignable:true still wins, so a caller that genuinely
    // needs a group to HOLD a directory role can still ask for one.
    const wantRole = t.roleAssignable === true;
    const roleAssignable = wantRole && !dynamic;   // Entra forbids the combination
    const p = {
      displayName: t.displayName,
      description: t.description || `Conditional Access target group. Created by ${Brand.title}.`,
      mailEnabled: false,
      securityEnabled: true,
      mailNickname: nickname,
    };
    if (dynamic) {
      p.groupTypes = ["DynamicMembership"];
      p.membershipRule = t.membershipRule || "";
      p.membershipRuleProcessingState = "On";
    }
    if (roleAssignable) p.isAssignableToRole = true;
    // beta-only: no group may be added as a member of this one.
    //
    // DEFAULT CHANGED: every group this tool creates now asks for it, because a
    // nested group is an invisible route into a Conditional Access assignment —
    // somebody adds a group to a group and a policy's scope changes without the
    // policy being touched. The persona design assumes membership is deliberate.
    // Pass disableNesting:false to opt a create out.
    //
    // It goes in the POST body AND is confirmed by PATCH afterwards (see
    // createGroup): field reports say it only takes at creation, while Learn
    // documents it as patchable with Group-NestingSupport.ReadWrite.All. Doing
    // both means whichever is true in this tenant, the group ends up right.
    // Redundant on two shapes, so not sent for them: a DYNAMIC group's members
    // are rule-driven and can only be users or devices, and a ROLE-ASSIGNABLE
    // group already has group-in-group refused by Entra.
    // OPT-IN until the property is generally available. It used to default ON
    // for every create (build 284), which was right in principle and wrong in
    // practice: on a tenant whose directory does not carry the property, every
    // single create ended in a red failure line for a security setting that
    // could not be applied — and every create panel had promised it would be.
    // A caller now has to ask for it explicitly, and CaGroups.NESTING_GA flips
    // the default back the day Microsoft ships it, without touching callers.
    // Skipped entirely once this tenant has already refused it once.
    const wantsNesting = (t.disableNesting === true || (CaGroups.NESTING_GA && t.disableNesting !== false))
      && !dynamic && !roleAssignable && CaGroups.nestingSupported();
    if (wantsNesting) p.disableNesting = true;
    return p;
  }

  // Create (or reuse) a group. Returns {id, name, created, dynamic, roleAssignable}.
  // opts.mustCreate skips the reuse shortcut: a caller that has just renamed the
  // old group out of the way cannot trust a name lookup, because the directory
  // is eventually consistent and will happily return the group under its former
  // name for a while. Reusing it there is not a no-op — it hands back the very
  // id the caller is trying to replace.
  async function createGroup(template, opts = {}) {
    const existing = opts.mustCreate ? null : await findGroup(template.displayName);
    if (existing) return { ...existing, created: false };
    let payload = buildGroupPayload(template);
    const wanted = payload.disableNesting === true;
    let g;
    try {
      g = await Graph.gpostGroupCreate("/groups", payload);
    } catch (e) {
      // A tenant that does not know the property must still get its group. Only
      // retry when the create actually complained about THIS field — retrying
      // blindly would swallow a real validation error and create a group the
      // caller did not describe.
      if (!wanted || !/disablenesting|unknown|not recognized|invalid propert/i.test(e.message || "")) throw e;
      const unsupported = CaGroups.noteNestingUnsupported(e);
      payload = { ...payload }; delete payload.disableNesting;
      g = await Graph.gpostGroupCreate("/groups", payload);
      const out = { id: g.id, name: g.displayName, created: true,
        dynamic: !!template.dynamic, roleAssignable: !!payload.isAssignableToRole };
      // A directory that does not know the property will not know it a moment
      // later either — do not spend two more calls proving it per group.
      if (unsupported) return { ...out, nesting: "unsupported", nestingError: CaGroups.NESTING_UNSUPPORTED_TEXT };
      return { ...out, ...(await confirmNesting(out, e.message)) };
    }
    const out = { id: g.id, name: g.displayName, created: true,
      dynamic: !!template.dynamic, roleAssignable: !!payload.isAssignableToRole };
    if (!wanted) return { ...out, nesting: "n/a" };
    return { ...out, ...(await confirmNesting(out, null)) };
  }

  // Did the create actually take disableNesting? A plain GET never returns the
  // property, so it has to be asked for by name — and "absent" is ambiguous:
  // either not set, or a tenant without the feature. When it is not confirmed
  // we PATCH once (the route Learn documents) and read it back again.
  //
  // Nothing here is allowed to lose the group: every failure returns the group
  // with nesting: "failed" and the reason, so the caller can report it and the
  // ⑧ Disable nesting step can finish the job. A group that exists with nesting
  // allowed is a smaller problem than a create that threw.
  async function confirmNesting(group, createNote) {
    // v1.0, not the beta base every other call uses: the ONLY Learn page that
    // names disableNesting is the v1.0 PATCH /groups one. See the note in
    // js/cagroups.js — asking beta for a property beta does not document is a
    // plausible reading of the 400 this returns on some tenants.
    const read = async () => {
      try {
        const r = await Graph.gget(CaGroups.NEST_V1(`/groups/${group.id}?$select=id,disableNesting`), NEST_SCOPES);
        return r && r.disableNesting === true;
      } catch (e) {
        if (CaGroups.noteNestingUnsupported(e)) return "unsupported";
        return null;                    // null = could not tell
      }
    };
    const first = await read();
    if (first === true) return { nesting: "disabled" };
    if (first === "unsupported") return { nesting: "unsupported", nestingError: CaGroups.NESTING_UNSUPPORTED_TEXT, nestingNote: createNote || null };
    try {
      await Graph.gpatch(CaGroups.NEST_V1(`/groups/${group.id}`), { disableNesting: true }, NEST_SCOPES);
    } catch (e) {
      if (CaGroups.noteNestingUnsupported(e)) return { nesting: "unsupported", nestingError: CaGroups.NESTING_UNSUPPORTED_TEXT, nestingNote: createNote || null };
      return { nesting: "failed", nestingError: e.message || String(e), nestingNote: createNote || null };
    }
    if (await read() === true) return { nesting: "disabled" };
    return { nesting: "failed",
      nestingError: "the tenant accepted the change but does not report disableNesting as set — it may not have the feature yet",
      nestingNote: createNote || null };
  }

  function templates() { return typeof GROUP_TEMPLATES !== "undefined" ? GROUP_TEMPLATES : []; }

  // Same semantics as the PowerShell script's action switch.
  function newUsersBlock(raw, action, groupIds, target) {
    if (target === "roles") return newRolesBlock(raw, action, groupIds);
    const u = raw.conditions?.users || {};
    const cur = {
      includeUsers: u.includeUsers || [], excludeUsers: u.excludeUsers || [],
      includeGroups: u.includeGroups || [], excludeGroups: u.excludeGroups || [],
      includeRoles: u.includeRoles || [], excludeRoles: u.excludeRoles || [],
    };
    let { includeUsers, includeGroups, excludeGroups } = cur;
    const notes = [];
    switch (action) {
      case 0: // replace include groups — groups take over from includeUsers
        includeUsers = ["None"]; includeGroups = [...groupIds];
        break;
      case 1: // replace exclude groups
        excludeGroups = [...groupIds];
        break;
      case 2: // add to include groups
        if (includeUsers.includes("All")) { includeUsers = ["None"]; notes.push("clears 'All users' from include (groups take over)"); }
        includeGroups = [...new Set([...cur.includeGroups, ...groupIds])];
        break;
      case 3: // add to exclude groups
        excludeGroups = [...new Set([...cur.excludeGroups, ...groupIds])];
        break;
      case 4: // include All Users, clear include groups
        includeUsers = ["All"]; includeGroups = [];
        break;
      case 5: { // remove selected from include groups
        const drop = new Set(groupIds);
        includeGroups = cur.includeGroups.filter((g) => !drop.has(g));
        break;
      }
      case 6: { // remove selected from exclude groups
        const drop = new Set(groupIds);
        excludeGroups = cur.excludeGroups.filter((g) => !drop.has(g));
        break;
      }
    }
    return {
      users: {
        includeUsers, excludeUsers: cur.excludeUsers,
        includeGroups, excludeGroups,
        includeRoles: cur.includeRoles, excludeRoles: cur.excludeRoles,
      },
      notes,
    };
  }

  // Roles version. Deliberately a separate function rather than more branches
  // in the one above: the two share the shape but not the edge cases, and the
  // group path is the one everything else already depends on.
  function newRolesBlock(raw, action, roleIds) {
    const u = raw.conditions?.users || {};
    const cur = {
      includeUsers: u.includeUsers || [], excludeUsers: u.excludeUsers || [],
      includeGroups: u.includeGroups || [], excludeGroups: u.excludeGroups || [],
      includeRoles: u.includeRoles || [], excludeRoles: u.excludeRoles || [],
    };
    let { includeUsers, includeRoles, excludeRoles } = cur;
    const notes = [];
    // Include is a choice in the portal: All users, or a selection. A policy
    // holding "All" cannot also hold a role selection, so setting one clears
    // the other — and says so, because it changes who the policy covers.
    const clearAll = () => {
      if (includeUsers.includes("All")) {
        includeUsers = ["None"];
        notes.push("clears 'All users' from include (the role selection takes over)");
      }
    };
    switch (action) {
      case 0: clearAll(); includeRoles = [...roleIds]; break;
      case 1: excludeRoles = [...roleIds]; break;
      case 2: clearAll(); includeRoles = [...new Set([...cur.includeRoles, ...roleIds])]; break;
      case 3: excludeRoles = [...new Set([...cur.excludeRoles, ...roleIds])]; break;
      case 5: { const drop = new Set(roleIds); includeRoles = cur.includeRoles.filter((r) => !drop.has(r)); break; }
      case 6: { const drop = new Set(roleIds); excludeRoles = cur.excludeRoles.filter((r) => !drop.has(r)); break; }
    }
    return {
      users: {
        includeUsers, excludeUsers: cur.excludeUsers,
        includeGroups: cur.includeGroups, excludeGroups: cur.excludeGroups,
        includeRoles, excludeRoles,
      },
      notes,
    };
  }

  // Apply to each policy: GET a fresh copy, compute the new users block, PATCH.
  // Would this new users block actually change the group assignment? Removal
  // (and add) is a no-op on a policy that never referenced the group; skipping
  // the PATCH there means a tenant-wide remove only writes the policies that
  // really had it, and the result list can say "unchanged" for the rest.
  // Would this new users block actually change the assignment? Roles are in
  // here too: without them a role-only edit compares equal on the group fields
  // and gets skipped as "no change", which is a silent no-op on every policy.
  function groupsChanged(raw, users) {
    const u = raw.conditions?.users || {};
    const same = (a, b) => { const A = new Set(a || []), B = new Set(b || []); return A.size === B.size && [...A].every((x) => B.has(x)); };
    return !same(u.includeGroups, users.includeGroups)
      || !same(u.excludeGroups, users.excludeGroups)
      || !same(u.includeRoles, users.includeRoles)
      || !same(u.excludeRoles, users.excludeRoles)
      || !same(u.includeUsers, users.includeUsers);
  }

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  async function apply(policyIds, action, groupIds, onStatus, target) {
    const results = [];
    for (let i = 0; i < policyIds.length; i++) {
      let name = policyIds[i];
      try {
        const fresh = await Graph.gget(`/identity/conditionalAccess/policies/${policyIds[i]}`);
        name = fresh.displayName || name;
        onStatus?.(`Updating ${name} (${i + 1}/${policyIds.length})…`);
        const { users } = newUsersBlock(fresh, action, groupIds, target);
        if (!groupsChanged(fresh, users)) { results.push({ name, ok: true, changed: false }); continue; }
        await Graph.gpatch(`/identity/conditionalAccess/policies/${policyIds[i]}`, { conditions: { users } });
        results.push({ name, ok: true, changed: true });
        // Gentle pacing between writes only. A tenant-wide run is 100+ PATCHes;
        // spacing them slightly keeps us under Graph's burst limit so the
        // Retry-After back-off in graphFetch rarely has to fire at all.
        await pause(80);
      } catch (e) {
        console.error(`Assign: ${name} failed`, e);
        results.push({ name, ok: false, error: e.message || String(e) });
      }
    }
    return results;
  }

  return { ACTIONS, ROLE_ACTIONS, actionsFor, ADMIN_ROLE_NAMES, roleTemplates, isAdminRole, NEEDS_GROUPS, REMOVE_ACTIONS, MAPPED_ACTIONS,
    conventionExclusionFor, conventionPlan, planCounts, groupsByPrefix, applyMapped, PERSONAS, personasWithGroup, templateFor, PREDEFINED, findGroup, searchGroups, resolveGroups, newUsersBlock, apply, buildGroupPayload, createGroup, confirmNesting, NEST_SCOPES, templates };
})();
