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
  ];
  // Which actions read a group selection (everything except "All Users").
  const NEEDS_GROUPS = (a) => a !== 4;

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
  function buildGroupPayload(t) {
    const nickname = (String(t.mailNickname || t.displayName || "grp").replace(/[^A-Za-z0-9]/g, "").slice(0, 60)) || "CADSECgroup";
    const dynamic = !!t.dynamic;
    // explicit wins; otherwise assigned⇒role-assignable, dynamic⇒not
    const wantRole = t.roleAssignable != null ? !!t.roleAssignable : !dynamic;
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
    // beta-only: no group may be added as a member of this one. Only settable
    // at creation today, which is why the CA groups tool has a recreate path.
    if (t.disableNesting) p.disableNesting = true;
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
    const payload = buildGroupPayload(template);
    const g = await Graph.gpostGroupCreate("/groups", payload);
    return { id: g.id, name: g.displayName, created: true,
      dynamic: !!template.dynamic, roleAssignable: !!payload.isAssignableToRole };
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

  return { ACTIONS, ROLE_ACTIONS, actionsFor, ADMIN_ROLE_NAMES, roleTemplates, isAdminRole, NEEDS_GROUPS, REMOVE_ACTIONS, PERSONAS, personasWithGroup, templateFor, PREDEFINED, findGroup, searchGroups, resolveGroups, newUsersBlock, apply, buildGroupPayload, createGroup, templates };
})();
