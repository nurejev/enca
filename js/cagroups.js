// ======================================================================
// Conditional Access Groups — the groups a CA baseline depends on, as one
// tool. Four things you actually do with them:
//
//   1. Check     — is the expected set of groups present in this tenant?
//   2. Create    — make the missing ones (role-assignable, or dynamic with
//                  their rule where the template says so).
//   3. Members   — who is in them, as a members × groups matrix.
//   4. Assign    — point policies at them (the assign-groups wizard).
//
// "Expected" is the union of three sources, because no single one is complete:
//   · GROUP_TEMPLATES        — the reference group export
//   · the baseline catalog   — every group named in an include/exclude list
//   · the tenant's policies  — groups the deployment already references
// A group referenced by a policy but absent from the directory is the case
// worth catching: Entra keeps the dangling GUID and the policy silently
// targets nothing.
//
// Read-only except Create. Directory.Read.All covers the scan; creation
// consents Group.ReadWrite.All + RoleManagement.ReadWrite.Directory on demand
// via Assign.createGroup, so the rules about role-assignable vs dynamic live
// in exactly one place.
// ======================================================================
const CaGroups = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const MEMBER_CAP = 500;   // per group — a 10k group would stall the matrix
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

  const STATUS = {
    present: { icon: "✓", label: "Present", cls: "ok", order: 2 },
    missing: { icon: "✗", label: "Missing", cls: "bad", order: 0 },
    dangling: { icon: "⚠", label: "Referenced but gone", cls: "warn", order: 1 },
    extra: { icon: "＋", label: "Not in the baseline", cls: "info", order: 3 },
  };

  // ---- what the baseline expects -----------------------------------------
  // Catalog entries carry assignment as display strings like
  // "CAB-SEC-U-CA001-Exclusion (group)" — only the "(group)" ones are groups;
  // roles, guest types and "All users" are not.
  const GROUP_SUFFIX = /\s*\(group\)\s*$/i;

  // Which catalogs' groups count as "expected" here. The Limon-IT catalog is
  // this app's own baseline and always counts. A second catalog only counts if
  // the tenant actually deploys it — otherwise every group of a baseline you
  // never chose would be reported missing, which is noise, not a finding.
  const JOEY_MIN_MATCH = 3;
  function activeCatalogs(raws) {
    const out = [];
    if (typeof BASELINE !== "undefined") out.push(BASELINE);
    if (typeof BASELINE_JOEY !== "undefined") {
      const theirs = new Set((BASELINE_JOEY.policies || []).map((p) => String(p.name).toLowerCase()));
      const hits = (raws || []).filter((p) => theirs.has(String(p.name || "")
        .replace(/^\(?(NEW|UP)\)\s*/i, "").trim().toLowerCase())).length;
      if (hits >= JOEY_MIN_MATCH) out.push(BASELINE_JOEY);
    }
    return out;
  }

  function catalogGroupNames(raws) {
    const out = new Set();
    for (const cat of activeCatalogs(raws)) {
      for (const p of cat.policies || []) {
        for (const v of [...(p.include || []), ...(p.exclude || [])]) {
          if (GROUP_SUFFIX.test(v)) out.add(String(v).replace(GROUP_SUFFIX, "").trim());
        }
      }
      // Joey's catalog names its groups directly rather than per policy
      for (const g of cat.groups || []) if (!/^one /i.test(g)) out.add(g);
      if (cat.breakGlassGroup) out.add(cat.breakGlassGroup);
    }
    return out;
  }

  function templateNames() {
    const m = new Map();
    (typeof GROUP_TEMPLATES !== "undefined" ? GROUP_TEMPLATES : [])
      .forEach((t) => m.set(t.displayName, t));
    return m;
  }

  // Group ids referenced by the tenant's own policies, with the policies that
  // reference them — this is what makes a dangling reference findable.
  function policyRefs(raws) {
    const byId = new Map();
    for (const p of raws || []) {
      const u = (p.raw || p).conditions?.users || {};
      for (const [ids, how] of [[u.includeGroups, "include"], [u.excludeGroups, "exclude"]]) {
        for (const id of ids || []) {
          if (!isGuid(id)) continue;
          let e = byId.get(id);
          if (!e) { e = { id, include: [], exclude: [] }; byId.set(id, e); }
          e[how].push({ id: p.id, name: p.name || p.displayName || p.id });
        }
      }
    }
    return byId;
  }

  // ---- archived leftovers -------------------------------------------------
  // Recreating a group (role-assignable, dynamic, nesting) renames the original
  // aside rather than deleting it — deliberately, so a bad run is recoverable.
  // The cost is that they accumulate, and a directory full of
  // "X (legacy 2026-08-04)" is its own kind of mess. This finds them.
  //
  // $search rather than $filter: Graph has no contains() for displayName, and
  // enumerating every group to regex it client-side is not a thing to do to a
  // 20 000-group tenant. The search is a net; ARCHIVE_SUFFIX is the sieve.
  async function findArchived(raws) {
    const seen = new Map();
    for (const term of ["legacy", "nesting", "migrated", "static"]) {
      try {
        const gs = await Graph.ggetAll(`/groups?$search=${encodeURIComponent(`"displayName:${term}"`)}`
          + "&$select=id,displayName,isAssignableToRole,groupTypes,membershipRule,createdDateTime&$top=999");
        gs.forEach((g) => { if (ARCHIVE_SUFFIX.test(g.displayName || "")) seen.set(g.id, g); });
      } catch (e) { console.warn("CaGroups: archived search failed for", term, e.message); }
    }
    const refs = policyRefs(raws);
    return [...seen.values()].map((g) => {
      const ref = refs.get(g.id) || { include: [], exclude: [] };
      return {
        id: g.id,
        name: g.displayName,
        // the name it was archived FROM — what the live group should be called
        liveName: String(g.displayName).replace(ARCHIVE_SUFFIX, "").trim(),
        roleAssignable: !!g.isAssignableToRole,
        dynamic: !!g.membershipRule,
        created: g.createdDateTime || "",
        refs: ref,
        refCount: ref.include.length + ref.exclude.length,
      };
    }).sort((a, b) => b.refCount - a.refCount || a.name.localeCompare(b.name));
  }

  // ---- scan ---------------------------------------------------------------
  // onStatus is called with human-readable progress; the caller decides
  // whether to show it. Nothing here writes.
  // scope:
  //   "policies" (default) — only the groups the tenant's own CA policies
  //                          actually reference. Nothing is looked up that no
  //                          policy points at, which is far less Graph traffic.
  //   "all"                — additionally expect every bundled template and
  //                          baseline-catalog group, so missing ones show up.
  async function scan(raws, opts) {
    const o = opts || {};
    const scope = o.scope === "all" ? "all" : "policies";
    const tpl = templateNames();
    const cat = catalogGroupNames(raws);
    const refs = policyRefs(raws);
    // names the baseline/templates know about — used to classify a referenced
    // group as a baseline group or an ad-hoc one, in either scope
    const known = new Set([...tpl.keys(), ...cat].map((n) => String(n).toLowerCase()));

    // Every expected name, with where the expectation comes from. A name in
    // more than one source is one row, not three.
    const expected = new Map();
    const want = (name, src) => {
      const n = String(name || "").trim(); if (!n) return;
      let e = expected.get(n);
      if (!e) { e = { name: n, sources: new Set(), template: tpl.get(n) || null }; expected.set(n, e); }
      e.sources.add(src);
    };
    if (scope === "all") {
      tpl.forEach((t, n) => want(n, "template"));
      cat.forEach((n) => want(n, "catalog"));
    }

    // Resolve the expected names in one $filter per chunk rather than one call
    // per group — 100+ sequential lookups is a visibly slow tool.
    const names = [...expected.keys()];
    const found = new Map();  // lowercased name -> {id,name,...}
    let done = 0;
    for (const part of chunk(names, 15)) {
      o.onStatus?.(`Looking up groups… ${done}/${names.length}`, done, names.length);
      const flt = part.map((n) => `displayName eq '${String(n).replace(/'/g, "''")}'`).join(" or ");
      try {
        const gs = await Graph.ggetAll(`/groups?$filter=${encodeURIComponent(flt)}`
          + `&$select=id,displayName,description,isAssignableToRole,groupTypes,membershipRule,securityEnabled,mailEnabled&$top=999`);
        gs.forEach((g) => found.set(String(g.displayName).toLowerCase(), g));
      } catch (e) { console.warn("CaGroups: name lookup failed", e.message); }
      done += part.length;
    }

    // Referenced-by-policy groups, resolved by id — these may not be in the
    // expected set at all (someone pointed a policy at an ad-hoc group).
    const byId = new Map();
    const refIds = [...refs.keys()];
    done = 0;
    for (const part of chunk(refIds, 15)) {
      o.onStatus?.(`Resolving referenced groups… ${done}/${refIds.length}`, done, refIds.length);
      const flt = part.map((i) => `id eq '${i}'`).join(" or ");
      try {
        const gs = await Graph.ggetAll(`/groups?$filter=${encodeURIComponent(flt)}`
          + `&$select=id,displayName,description,isAssignableToRole,groupTypes,membershipRule,securityEnabled,mailEnabled&$top=999`);
        gs.forEach((g) => byId.set(g.id, g));
      } catch (e) { console.warn("CaGroups: id lookup failed", e.message); }
      done += part.length;
    }

    const rows = [];
    const claimed = new Set();
    for (const e of expected.values()) {
      const g = found.get(e.name.toLowerCase()) || null;
      if (g) claimed.add(g.id);
      rows.push(row({
        name: e.name, group: g, template: e.template,
        sources: [...e.sources],
        status: g ? "present" : "missing",
        refs: g ? refs.get(g.id) : null,
      }));
    }
    // referenced groups that are not part of the expected set
    for (const [id, ref] of refs) {
      if (claimed.has(id)) continue;
      const g = byId.get(id) || null;
      const isKnown = g && known.has(String(g.displayName).toLowerCase());
      rows.push(row({
        name: g ? g.displayName : id, group: g,
        template: g ? (tpl.get(g.displayName) || null) : null,
        sources: ["policy"],
        // referenced by a policy but not resolvable = the dangling case;
        // resolvable and named in the baseline = a baseline group in use
        status: g ? (isKnown ? "present" : "extra") : "dangling",
        refs: ref,
      }));
    }

    rows.sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.name.localeCompare(b.name));
    const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const expectedTotal = rows.filter((r) => r.status === "present" || r.status === "missing").length;
    return {
      rows, counts, expectedTotal, scope,
      present: counts.present || 0,
      coverage: expectedTotal ? Math.round(((counts.present || 0) / expectedTotal) * 100) : 100,
      scanned: new Date(),
    };
  }

  function row(r) {
    const g = r.group;
    const dynamic = !!(g && (g.groupTypes || []).includes("DynamicMembership"));
    const nRef = r.refs ? (r.refs.include.length + r.refs.exclude.length) : 0;
    return {
      name: r.name, status: r.status, sources: r.sources, template: r.template,
      id: g ? g.id : null,
      description: g ? g.description || "" : (r.template?.description || ""),
      roleAssignable: g ? !!g.isAssignableToRole : null,
      groupTypes: g ? (g.groupTypes || []).slice() : [],
      dynamic, membershipRule: g ? g.membershipRule || "" : (r.template?.membershipRule || ""),
      refs: r.refs || { include: [], exclude: [] },
      refCount: nRef,
      members: null, memberTotal: null, memberError: null,
      // INVERTED (build 25026). A plain assigned group used to be reported as
      // drift because the baseline made everything role-assignable. That has
      // been retired: role-assignable was only ever a way to keep membership
      // away from tenant-wide group administrators, and a restricted AU does
      // it better. So a plain group is now correct, and the flag points the
      // other way — a role-assignable group is the one with somewhere to go.
      drift: g && g.isAssignableToRole
        ? "role-assignable — migrate it to a restricted AU (⑦ Migrate)"
        : (g && r.template && r.template.membershipRule && !dynamic
          ? "template is dynamic but this group is assigned" : null),
    };
  }

  // ---- convert an assigned group to dynamic ------------------------------
  // Two different jobs wearing one name:
  //
  //  * A plain security group CAN be converted in place. Entra keeps the id, so
  //    every policy, app and role assignment that points at it still does. This
  //    is always the better route when it is available.
  //  * A ROLE-ASSIGNABLE group cannot. `isAssignableToRole` is immutable and a
  //    role-assignable group must have assigned membership — the two are
  //    mutually exclusive by design, so "converting" it means standing up a new
  //    group and moving the policy references across. The new group is NOT
  //    role-assignable; that capability is what you are trading away.
  //
  // In both cases the members that do not match the rule stop being members.
  const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };

  // ====================================================================
  // Disable group nesting (BETA)
  //
  // Entra exposes `disableNesting` on the beta group resource: set it and no
  // other group can be added as a member. That matters here because a nested
  // group is an invisible route into a Conditional Access assignment — someone
  // adds a group to a group and a policy's scope changes without the policy
  // being touched. On a persona group the whole design assumes membership is
  // deliberate, so this closes the side door.
  //
  // Two awkward facts drive the shape of this code:
  //
  //  1. READING it is not free. A plain GET does not return the property at
  //     all; only `?$select=disableNesting` does, and only on groups where it
  //     is already set. So "not returned" is genuinely ambiguous — it means
  //     "allowed", or "this tenant does not have the feature yet". We report
  //     that third state honestly rather than guessing.
  //
  //  2. WRITING it is undocumented. Group-NestingSupport.ReadWrite.All is
  //     listed on Learn as the least-privileged permission for PATCH /groups,
  //     which strongly implies the property is meant to be patchable — but
  //     `disableNesting` is absent from the documented updatable-properties
  //     table, and the field reports say it only takes at creation. So we TRY
  //     THE PATCH FIRST and only fall back to the destructive recreate if
  //     Entra refuses. When Microsoft finishes shipping this, ENCA quietly
  //     stops recreating groups without a line of code changing.
  // ====================================================================
  // The scoped-administrator box takes several accounts. One is the common
  // case, but a break-glass pair — or an admin plus the team that covers them —
  // is exactly the shape you want here, and typing a comma is the obvious way
  // to ask for it. Split on comma, semicolon or newline; de-duplicate, because
  // granting the same principal twice is a 400 nobody needs to read.
  function adminList(raw) {
    return [...new Set(String(raw || "")
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean))];
  }

  // The archive names this tool leaves behind: "(legacy YYYY-MM-DD)" from the
  // role-assignable recreate, "(nesting YYYY-MM-DD)" from the nesting one,
  // "(migrated YYYY-MM-DD)" from the restricted-AU migration, and
  // "-static-<stamp>" from the make-dynamic conversion.
  const ARCHIVE_SUFFIX = /(\s*\((?:legacy|nesting|migrated)\s+\d{4}-\d{2}-\d{2}\)|-static-[\w.-]+)\s*$/i;
  const isoDay = () => new Date().toISOString().slice(0, 10);
  // The literal this tool writes. ARCHIVE_SUFFIX above is the MATCHER — a
  // RegExp — and interpolating it into a name yields nonsense; keep the two
  // apart by name so the mistake is hard to make.
  const MIGRATED_TAG = "migrated";
  const migratedName = (name) => `${name} (${MIGRATED_TAG} ${isoDay()})`;

  const NESTING = {
    disabled: { icon: "🚫", label: "Nesting disabled", cls: "ok" },
    allowed:  { icon: "↪", label: "Nesting allowed", cls: "warn" },
    unknown:  { icon: "?", label: "Not reported", cls: "muted" },
  };
  // Group.ReadWrite.All comes along because the fallback creates a group and
  // renames one; the nesting scope alone only covers the PATCH.
  const NEST_WRITE_SCOPES = ["Group-NestingSupport.ReadWrite.All", "Group.ReadWrite.All"];

  // ---- Is this property actually shipped? ---------------------------------
  // On 2026-08-19 a real tenant answered every disableNesting write with
  //
  //   400 Request_BadRequest — "Unexpected request made to property
  //   'disableNesting' of resource 'Group'"
  //
  // both on PATCH and in the CREATE body. That wording is the directory saying
  // it does not know the property NAME — not that it dislikes the value, and
  // not "settable only at creation", which is what the field reports had led us
  // to assume. Checking Learn again:
  //
  //   * v1.0 PATCH /groups names it, but only in the permissions note:
  //     "Group-NestingSupport.ReadWrite.All is the least privileged permission
  //     to update the disableNesting property".
  //   * BETA PATCH /groups does not list it among updatable properties.
  //   * NEITHER version's group resource carries it in the property table or
  //     the JSON representation.
  //
  // So the permission is documented and the property is not on any published
  // schema: it is not generally available. Two consequences, both here:
  //
  //  1. ENCA talks to /beta everywhere (AUTH_CONFIG.graphBase), and the only
  //     page that names the property is the v1.0 one. This property alone is
  //     therefore addressed at v1.0 explicitly, so a tenant that HAS it is not
  //     refused merely because we asked the wrong version.
  //  2. Until it is GA, no create asks for it by default. A security setting
  //     that fails on every group is not a safeguard, it is a red line under
  //     every create — and worse, it made every create panel promise something
  //     the tenant would not do.
  const NESTING_GA = false;              // flip to true when Microsoft ships it
  const NEST_V1 = (path) => `https://graph.microsoft.com/v1.0${path}`;

  // The refusal above is a statement about the TENANT, not about one group. It
  // has to be told apart from an ordinary failure, because it is the difference
  // between "try the other route" and "there is no route" — and the other route
  // is a destructive recreate that sets the property at creation, which is
  // exactly what was just refused.
  function nestingUnsupported(err) {
    const s = String((err && (err.message || err.code)) || err || "").toLowerCase();
    if (!s.includes("disablenesting")) return false;
    return s.includes("unexpected request made to property")
        || s.includes("request_badrequest")
        || s.includes("unrecognized") || s.includes("unknown propert") || s.includes("invalid propert");
  }
  // Remembered for the session: creating ten baseline groups should not mean
  // ten identical refusals for something that cannot succeed in this tenant.
  // Deliberately NOT persisted — a new sign-in re-tests, so the day Microsoft
  // enables it nobody has to clear anything.
  let nestUnsupported = false;
  const nestingSupported = () => !nestUnsupported;
  function noteNestingUnsupported(err) {
    if (nestingUnsupported(err)) { nestUnsupported = true; return true; }
    return false;
  }
  const NESTING_UNSUPPORTED_TEXT = "this tenant's directory does not recognise the disableNesting property — it is not generally available yet, and no route here can set it (recreating the group would be refused in exactly the same way)";

  // g is whatever came back from ?$select=id,disableNesting.
  function nestingState(g) {
    if (!g) return "unknown";
    if (g.disableNesting === true) return "disabled";
    if (g.disableNesting === false) return "allowed";
    return "unknown";   // property absent — see note 1 above
  }

  // row: a Check row. nested/users: the group's DIRECT members, split by type.
  // → { ok, blocked?, reason?, steps[], warnings[], nested[], userCount, refs }
  function nestingPlan(row, members = {}) {
    const nested = members.groups || [];
    const users = members.users || [];
    const refs = row?.refs || { include: [], exclude: [] };
    const nRef = refs.include.length + refs.exclude.length;
    const base = { name: row?.name, id: row?.id, nested, userCount: users.length, refs, nRef };

    if (!row || !row.id) return { ...base, ok: false, reason: "This group does not exist in the tenant yet. Create it first — new groups can be created with nesting already disabled." };

    // A group whose NAME still carries an archive suffix is the leftover half
    // of an earlier recreate — "X (legacy 2026-08-04)", "X-static-…". Acting on
    // one is wrong twice over: the live group is the one WITHOUT the suffix,
    // and a recreate here would create a brand-new group literally called
    // "X (legacy 2026-08-04)", then rename this one to
    // "X (legacy 2026-08-04) (nesting 2026-08-04)". Stacked archive suffixes,
    // and a permanent group with a misleading name.
    if (ARCHIVE_SUFFIX.test(row.name)) {
      return { ...base, ok: false, reason: `“${row.name}” is the archived half of an earlier recreate, not the live group — the live one is the same name without the suffix. Disabling nesting here would create a permanent new group still called “${row.name}”. Work on the live group instead, and delete this one once you are satisfied nothing still points at it (Group Analyzer will tell you).` };
    }
    if (row.nesting === "disabled") return { ...base, ok: false, reason: "Nesting is already disabled on this group." };
    // Asked and answered, this session. Offering the button again would only
    // walk the reader to the same refusal — and then to a destructive recreate
    // that cannot work either, because it sets the property at creation.
    if (!nestingSupported()) return { ...base, ok: false, reason: `Not available: ${NESTING_UNSUPPORTED_TEXT}. A restricted management administrative unit limits who can change the members at all, is generally available today, and is what ⑥ Protect uses.` };
    if (row.dynamic) return { ...base, ok: false, reason: "This is a dynamic group. Its membership is decided by the rule, so a group cannot be added to it by hand in the first place." };
    // Entra already forbids it: "Group nesting isn't supported. A group can't be
    // added as a member of a role-assignable group."
    // (learn.microsoft.com/entra/identity/role-based-access-control/groups-concept)
    if (row.roleAssignable) return { ...base, ok: false, reason: "This is a role-assignable group, and Entra already refuses to put a group inside one — nesting is impossible here whatever disableNesting says. Nothing to do." };

    // The blocker. A nesting-disabled group cannot hold a group, so recreating
    // one that currently does means those memberships are lost — and with them,
    // silently, every user who was only in the group through the nested one.
    if (nested.length) {
      return { ...base, ok: false, blocked: true,
        reason: `This group contains ${nested.length} nested group${nested.length === 1 ? "" : "s"}. A nesting-disabled group cannot hold them, so they cannot come across — and neither can the users who are only members through them. Resolve those memberships first, then come back.` };
    }

    return { ...base, ok: true,
      steps: [
        { key: "patch", text: "Try setting disableNesting on the group as it stands — no id change, nothing else touched" },
        { key: "verify", text: "Read the property back to confirm Entra actually took it" },
      ],
      fallback: [
        { key: "rename", text: `Rename “${row.name}” aside, keeping its members` },
        { key: "create", text: `Create “${row.name}” again with nesting disabled from the start` },
        ...(users.length ? [{ key: "members", text: `Add its ${users.length} user member${users.length === 1 ? "" : "s"} to the new group` }] : []),
        ...(nRef ? [{ key: "policies", text: `Point ${nRef} Conditional Access assignment${nRef === 1 ? "" : "s"} at the new group` }] : []),
      ],
      warnings: [
        "The property is beta and undocumented for updates. If Entra refuses the in-place change, the only route is to recreate the group — which gives it a new object id.",
        nRef ? `A new id means anything outside Conditional Access that points at this group — app assignments, Intune, licensing, Azure RBAC — keeps pointing at the OLD one. Run Group Analyzer on it first.` : "Anything outside Conditional Access that points at this group would keep pointing at the old one if a recreate is needed. Run [Group Analyzer](#tool:toolGroupUse) on it first.",
      ],
    };
  }

  // One Markdown change report for both routes.
  function nestingReport(plan, log, tenant) {
    const L = [`# Disable group nesting — ${tenant || "tenant"}`, "",
      `- **Group:** ${plan.name}`,
      `- **Route:** ${log.route === "patch" ? "set in place (group id unchanged)" : "recreated"}`];
    if (log.route === "patch") {
      L.push(`- **Object ID:** \`${plan.id}\` — unchanged`, "",
        "Nesting is now disabled. Nothing else about the group moved: members, policy assignments, app assignments and licensing are untouched.");
    } else {
      L.push(`- **Old group renamed to:** ${log.archiveName} (id \`${plan.id}\`)`,
        `- **New group id:** \`${log.newId}\``,
        `- **Members moved:** ${log.membersMoved}/${plan.userCount}`,
        `- **Policies moved:** ${log.moved.length}${log.failed.length ? ` · **failed:** ${log.failed.length}` : ""}`, "",
        `_In-place update was attempted first and refused: ${log.patchError || "unknown reason"}._`);
    }
    if (log.moved && log.moved.length) {
      L.push("", "## Policies moved to the new group", "", "| Policy | Slot |", "|---|---|");
      log.moved.forEach((m) => L.push(`| ${m.name} | ${m.how} |`));
    }
    if (log.failed && log.failed.length) {
      L.push("", "## Failed — fix these by hand", "");
      log.failed.forEach((f) => L.push(`- ❌ **${f.name}** — ${f.error}`));
    }
    if (log.route === "recreate") {
      L.push("", "The old group is renamed, not deleted. Check the new group, then remove the old one once you are satisfied.",
        "", "**Before you delete it:** the old id may still be referenced outside Conditional Access — app assignments, Intune, group-based licensing, Azure RBAC. [Group Analyzer](#tool:toolGroupUse) will tell you.");
    }
    L.push("", "---", Brand.generatedBy("Generated"));
    return L.join("\n");
  }

  function convertPlan(row, opts = {}) {
    const rule = (opts.rule != null ? opts.rule : (row && (row.membershipRule || row.template?.membershipRule))) || "";
    const base = { name: row?.name, id: row?.id, rule, refs: row?.refs || { include: [], exclude: [] } };
    if (!row || !row.id) return { ...base, ok: false, reason: "This group does not exist in the tenant yet — create it from the template instead." };
    if (row.dynamic) return { ...base, ok: false, reason: "This group already has dynamic membership." };
    if (!rule.trim()) return { ...base, ok: false, reason: "No membership rule to convert to — the template does not define one." };

    const nRef = base.refs.include.length + base.refs.exclude.length;
    if (!row.roleAssignable) {
      return { ...base, ok: true, mode: "inPlace",
        // keep any unrelated groupTypes (Unified, …) — dropping one would change what the group IS
        groupTypes: [...new Set([...(row.groupTypes || []), "DynamicMembership"])],
        steps: [
          { key: "patch", text: `Turn on dynamic membership for “${row.name}” with the rule below` },
        ],
        keeps: `The group keeps its id, so all ${nRef} policy reference${nRef === 1 ? "" : "s"} — and any app or role assignment outside Conditional Access — stay exactly as they are.`,
        warnings: [
          "Current members who do not match the rule are removed once Entra processes it, and you can no longer add members by hand.",
        ],
      };
    }

    const archiveName = `${row.name}-static-${stamp()}`;
    return { ...base, ok: true, mode: "recreate", archiveName,
      steps: [
        { key: "rename", text: `Rename the current group to “${archiveName}” (it keeps its members and stays role-assignable)` },
        { key: "create", text: `Create “${row.name}” as a dynamic group with the rule below` },
        ...(base.refs.include.length ? [{ key: "addInc", text: `Add the new group to the INCLUDE of ${base.refs.include.length} polic${base.refs.include.length === 1 ? "y" : "ies"}` }] : []),
        ...(base.refs.exclude.length ? [{ key: "addExc", text: `Add the new group to the EXCLUDE of ${base.refs.exclude.length} polic${base.refs.exclude.length === 1 ? "y" : "ies"}` }] : []),
        ...(base.refs.include.length ? [{ key: "delInc", text: `Remove the renamed group from those ${base.refs.include.length} include assignment${base.refs.include.length === 1 ? "" : "s"}` }] : []),
        ...(base.refs.exclude.length ? [{ key: "delExc", text: `Remove the renamed group from those ${base.refs.exclude.length} exclude assignment${base.refs.exclude.length === 1 ? "" : "s"}` }] : []),
      ],
      keeps: `The old group is kept, renamed and emptied of policy references — it is your rollback. Delete it once the new one has the right members.`,
      warnings: [
        "**The new group is not role-assignable.** Entra forbids dynamic membership on a role-assignable group, which is the whole reason this cannot be done in place — if the current group is used for a directory role or in PIM, do not convert it.",
        "The new group starts empty and fills as Entra evaluates the rule. Between the add and the removal both groups are assigned, so nothing is uncovered mid-flight — but a policy is only as good as the new group's membership, so check it before deleting the old one.",
        ...(nRef === 0 ? ["No policy references this group, so nothing is reassigned."] : []),
      ],
    };
  }

  // Executes the plan step by step, logging each one. Stops at the first
  // failure: half a conversion is recoverable, a wrong order is not.
  async function runConvert(plan, onStatus) {
    const log = [];
    const note = (ok, text, detail) => { log.push({ ok, text, detail }); onStatus?.(text); };
    if (!plan || !plan.ok) throw new Error(plan?.reason || "Nothing to convert");

    if (plan.mode === "inPlace") {
      await Graph.gpatch(`/groups/${plan.id}`, {
        groupTypes: plan.groupTypes,
        membershipRule: plan.rule,
        membershipRuleProcessingState: "On",
      }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]);
      note(true, `“${plan.name}” now has dynamic membership`, `rule: ${plan.rule}`);
      return { log, newGroupId: plan.id };
    }

    // 1. rename the current group out of the way
    await Graph.gpatch(`/groups/${plan.id}`, { displayName: plan.archiveName }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]);
    note(true, `Renamed to “${plan.archiveName}”`, `id ${plan.id} — unchanged, still role-assignable`);

    // 2. create the dynamic replacement under the original name
    let created;
    try {
      // mustCreate: never reuse a name match here. The rename above may not have
      // replicated yet, so a lookup can still return the OLD group — and reusing
      // it would mean steps 3 and 4 add and then remove the same id, quietly
      // stripping the group from every policy instead of replacing it.
      created = await Assign.createGroup({ displayName: plan.name, dynamic: true, membershipRule: plan.rule, roleAssignable: false }, { mustCreate: true });
    } catch (e) {
      // put the name back rather than leaving the tenant renamed for nothing
      try { await Graph.gpatch(`/groups/${plan.id}`, { displayName: plan.name }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]); } catch { /* reported below */ }
      note(false, `Could not create the dynamic group — the rename was rolled back`, e.message || String(e));
      throw e;
    }
    // Belt and braces: if anything ever hands back the id we just renamed, stop
    // before touching a single policy. Adding and removing one id is destructive.
    if (!created || !created.id || created.id === plan.id) {
      try { await Graph.gpatch(`/groups/${plan.id}`, { displayName: plan.name }, [...AUTH_CONFIG.scopes, "Group.ReadWrite.All"]); } catch { /* reported below */ }
      note(false, `The new group came back with the same id as the old one — nothing was changed on any policy, and the rename was rolled back`, `id ${created?.id || "none"}`);
      throw new Error("Create returned the existing group instead of a new one — no policy was touched. Re-run once the rename has replicated.");
    }
    note(true, `Created “${plan.name}” as a dynamic group`, `id ${created.id} (was ${plan.id})`);

    // 3./4. move the policy references: add the new group first, then remove the
    // old one, so no policy is ever left without either.
    const incIds = plan.refs.include.map((p) => p.id), excIds = plan.refs.exclude.map((p) => p.id);
    const run = async (ids, action, label) => {
      if (!ids.length) return;
      const res = await Assign.apply(ids, action, [action === 2 || action === 3 ? created.id : plan.id], onStatus);
      const bad = res.filter((r) => !r.ok);
      note(!bad.length, `${label}: ${res.filter((r) => r.ok).length}/${ids.length} polic${ids.length === 1 ? "y" : "ies"}`,
        bad.length ? bad.map((r) => `${r.name}: ${r.error}`).join(" · ") : res.map((r) => r.name).join(", "));
      if (bad.length) throw new Error(`${label} failed on ${bad.length} polic${bad.length === 1 ? "y" : "ies"} — the old group is still assigned, so nothing is uncovered. Fix and re-run.`);
    };
    await run(incIds, 2, "Added the new group to INCLUDE");
    await run(excIds, 3, "Added the new group to EXCLUDE");
    await run(incIds, 5, "Removed the old group from INCLUDE");
    await run(excIds, 6, "Removed the old group from EXCLUDE");
    return { log, newGroupId: created.id, oldGroupId: plan.id, archiveName: plan.archiveName };
  }

  // Which expected groups can be created, i.e. we have a template for them.
  // Without one we would be inventing a mailNickname and a membership model.
  function creatable(res) {
    return res.rows.filter((r) => r.status === "missing" && r.template);
  }
  function missingNoTemplate(res) {
    return res.rows.filter((r) => r.status === "missing" && !r.template);
  }

  // ---- members ------------------------------------------------------------
  // One call per group, so this is opt-in and reports progress. `shouldStop`
  // lets the UI cancel a long scan without leaving half-filled rows lying.
  async function loadMembers(rows, opts) {
    const o = opts || {};
    const targets = rows.filter((r) => r.id);
    let i = 0;
    for (const r of targets) {
      if (o.shouldStop?.()) break;
      i++;
      o.onStatus?.(`Reading members… ${i}/${targets.length} · ${r.name}`, i, targets.length);
      try {
        const ms = await Graph.ggetAll(`/groups/${r.id}/transitiveMembers/microsoft.graph.user`
          + `?$select=id,displayName,userPrincipalName,accountEnabled&$top=999`);
        r.memberTotal = ms.length;
        r.members = ms.slice(0, MEMBER_CAP).map((m) => ({
          id: m.id, name: m.displayName || m.id, upn: m.userPrincipalName || "",
          disabled: m.accountEnabled === false,
        }));
        r.memberError = null;
      } catch (e) {
        r.members = []; r.memberTotal = null; r.memberError = e.message || String(e);
      }
      o.onProgress?.(i, targets.length);
    }
    return rows;
  }

  // members × groups. Only groups that were actually scanned become columns,
  // so an unscanned or failed group never reads as "nobody is in it".
  function matrix(rows) {
    const cols = rows.filter((r) => r.members);
    const users = new Map();
    cols.forEach((c) => {
      (c.members || []).forEach((m) => {
        let u = users.get(m.id);
        if (!u) { u = { ...m, groups: new Set() }; users.set(m.id, u); }
        u.groups.add(c.name);
      });
    });
    const list = [...users.values()].sort((a, b) =>
      b.groups.size - a.groups.size || a.name.localeCompare(b.name));
    return { cols, users: list, empty: cols.filter((c) => (c.memberTotal || 0) === 0) };
  }

  // ---- rendering ----------------------------------------------------------
  function renderSummary(res, tenant) {
    const chip = (k) => res.counts[k]
      ? `<span class="bl-chip ${STATUS[k].cls}">${STATUS[k].icon} ${res.counts[k]} ${esc(STATUS[k].label.toLowerCase())}</span>` : "";
    const onlyPolicies = res.scope === "policies";
    const inUse = res.rows.length;
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:280px">
        <h3>👥 Conditional Access groups — ${esc(tenant || "this tenant")}</h3>
        <p style="margin-bottom:10px">${onlyPolicies
          ? `Only the groups your Conditional Access policies actually reference. A group a policy references but the directory no longer has is flagged — Entra keeps the GUID and the policy targets nobody. Switch the scope to <b>Baseline + templates</b> to also check which expected groups are missing.`
          : `The groups your Conditional Access baseline depends on: every group named in the bundled templates or in a baseline catalog, plus every group your own policies point at. A group a policy references but the directory no longer has is flagged — Entra keeps the GUID and the policy targets nobody.`}</p>
        <div class="bl-chips">${["missing", "dangling", "present", "extra"].map(chip).join("")}</div>
      </div>
      <div style="text-align:right;min-width:150px">
        ${onlyPolicies
          ? `<div style="font-size:34px;font-weight:700">${inUse}</div>
             <div class="mini muted">groups referenced by policies</div>`
          : `<div style="font-size:34px;font-weight:700;color:${res.coverage >= 90 ? "var(--on)" : res.coverage >= 60 ? "var(--report)" : "var(--off)"}">${res.coverage}<span style="font-size:15px">%</span></div>
             <div class="mini muted">${res.present} of ${res.expectedTotal} expected groups exist</div>`}
      </div>
    </div>`;
  }

  function chips(res, active) {
    const all = res.rows.length;
    const c = [`<button class="chip ${active === "all" ? "active" : ""}" data-cgf="all">All (${all})</button>`];
    for (const k of ["missing", "dangling", "present", "extra"]) {
      if (res.counts[k]) c.push(`<button class="chip ${active === k ? "active" : ""}" data-cgf="${k}">${STATUS[k].icon} ${esc(STATUS[k].label)} (${res.counts[k]})</button>`);
    }
    return c.join("");
  }

  const filtered = (res, filter, q) => res.rows.filter((r) =>
    (filter === "all" || r.status === filter)
    && (!q || r.name.toLowerCase().includes(q) || (r.id || "").toLowerCase().includes(q)));

  const attrEsc = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // `prot` is groupId -> { auId, auName } for restricted units, or null when
  // the units were not read. Null renders as "—", never as "not protected":
  // unknown and unprotected are different answers and only one is reassuring.
  function renderTable(res, filter, q, prot) {
    const rows = filtered(res, filter, q);
    if (!rows.length) return '<p class="mini" style="padding:20px">No groups match the current filter.</p>';
    // Deliberately NOT .mtable: that class makes the header row sticky for the
    // wide scrolling matrices, which here just slides it under the sticky
    // toolbar and leaves the list looking headerless.
    return `<div class="cg-tablewrap"><table class="cg-table">
      <thead><tr><th style="width:34px"></th><th>Group</th><th style="width:150px">Type</th><th style="width:120px">Policies</th><th style="width:150px">Protection</th><th style="width:140px">Expected by</th><th style="width:110px">Members</th></tr></thead>
      <tbody>${rows.map((r) => {
        const st = STATUS[r.status];
        const type = r.status === "missing"
          ? (r.template ? (r.template.membershipRule ? "dynamic (template)" : "role-assignable (template)") : "unknown — no template")
          : r.dynamic ? "dynamic"
          : r.roleAssignable ? "role-assignable" : "assigned";
        // The member column doubles as the per-group scan trigger, and a
        // per-row Create for a missing group that has a template — so a single
        // missing group can be fixed without going to the Create tab.
        const mem = r.memberError ? '<span class="cg-err" title="scan failed">error</span>'
          : r.members ? `<b>${r.memberTotal}</b>${r.memberTotal > MEMBER_CAP ? ` <span class="mini">(first ${MEMBER_CAP})</span>` : ""}`
          : r.id ? `<button class="btn sm cg-scan" data-cgscan="${esc(r.name)}">Scan</button>`
          : r.status === "missing" && r.template ? `<button class="btn sm primary" data-cgcreateone="${esc(r.name)}">Create</button>`
          : '<span class="mini muted">—</span>';
        // A present group that should be role-assignable but is not — isAssignableToRole
        // is immutable, so offer to recreate it (rename old, make a new one, move policies).
        // The other direction: the template says dynamic, the tenant group is
        // assigned. Offer the conversion — in place when Entra allows it.
        const dynDrift = r.drift && /template is dynamic/i.test(r.drift);
        return `<tr class="cg-row" data-cgrow="${esc(r.name)}">
          <td class="cg-ic ${st.cls}">${st.icon}</td>
          <td><b>${esc(r.name)}</b>${r.id ? `<div class="mini muted">${esc(r.id)}</div>` : ""}
            ${r.drift ? `<div class="mini" style="color:var(--report)">⚠ ${esc(r.drift)}</div>` : ""}
            ${r.roleAssignable ? `<button class="btn sm" data-cgmigrate="${esc(r.name)}" style="margin-top:4px">⑦ Migrate off role-assignable</button>` : ""}
            ${dynDrift ? `<button class="btn sm" data-cgdynamic="${esc(r.name)}" style="margin-top:4px">⟳ Make dynamic</button>` : ""}
            ${r.roleAssignable
              ? `<div class="mini" style="color:var(--on)">🚫 Nesting already impossible — Entra does not allow a group as a member of a role-assignable group</div>`
              : r.nesting === "disabled"
                ? `<div class="mini" style="color:var(--on)">🚫 Nesting disabled — no group can be added as a member</div>`
                : r.id && !r.dynamic
                  ? `<button class="btn sm" data-cgnesting="${esc(r.name)}" style="margin-top:4px" title="Stop any group being added as a member of this one">🚫 Disable nesting <span class="tag new">BETA</span></button>`
                  : ""}
            ${r.status === "dangling" ? '<div class="mini" style="color:var(--off)">Referenced by a policy but not found in the directory</div>' : ""}</td>
          <td class="mini">${esc(type)}</td>
          <td class="mini">${r.refCount ? `${r.refCount} <span class="muted">(${r.refs.include.length} inc / ${r.refs.exclude.length} exc)</span>` : '<span class="muted">unused</span>'}</td>
          <td class="mini">${(() => {
            // Answers "where does this group actually live?" without leaving the
            // Check tab. Blank when the units were not read — unknown is not the
            // same as unprotected, and only one of them is reassuring.
            if (!prot) return '<span class="muted">—</span>';
            const p = r.id ? prot.get(r.id) : null;
            if (!p) return '<span class="muted">not in a unit</span>';
            return r.roleAssignable
              ? `<span style="color:var(--off)" title="Role-assignable AND restricted — nobody can change its members">🧊 frozen in ${attrEsc(p.auName)}</span>`
              : `🔒 <span title="${attrEsc(p.auName)}">${esc(p.auName)}</span>`;
          })()}</td>
          <td class="mini">${r.sources.map((s) => `<span class="tag">${esc(s)}</span>`).join(" ")}</td>
          <td class="mini cg-mem">${mem}</td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }

  // members × groups, users as rows — same shape as the exclusion matrix
  function renderMatrix(m, q) {
    if (!m.cols.length) return '<p class="mini" style="padding:20px">No members loaded yet — run the member scan.</p>';
    const users = q ? m.users.filter((u) => u.name.toLowerCase().includes(q) || (u.upn || "").toLowerCase().includes(q)) : m.users;
    if (!users.length) return '<p class="mini" style="padding:20px">No members match the search.</p>';
    return `<div class="tablewrap"><table class="mtable cg-matrix">
      <thead><tr>
        <th class="stick">Member (${users.length})</th>
        ${m.cols.map((c) => `<th class="vert" title="${esc(c.name)}"><span>${esc(c.name)}</span></th>`).join("")}
        <th style="width:60px">In</th>
      </tr></thead>
      <tbody>${users.map((u) => `<tr>
        <td class="stick">${esc(u.name)}${u.disabled ? ' <span class="tag block">disabled</span>' : ""}<div class="mini muted">${esc(u.upn || "")}</div></td>
        ${m.cols.map((c) => u.groups.has(c.name)
          ? '<td class="cellv ok" title="member">●</td>' : '<td class="cellv"></td>').join("")}
        <td class="mini"><b>${u.groups.size}</b></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  // ---- markdown -----------------------------------------------------------
  const mdEsc = (s) => String(s ?? "").replace(/\|/g, "\\|");
  function toMd(res, tenant, withMembers) {
    const L = [];
    L.push(`# Conditional Access groups — ${mdEsc(tenant || "tenant")}`);
    L.push("");
    L.push(`- **Expected groups present:** ${res.present} of ${res.expectedTotal} (${res.coverage}%)`);
    for (const k of ["missing", "dangling", "extra"]) {
      if (res.counts[k]) L.push(`- **${STATUS[k].label}:** ${res.counts[k]}`);
    }
    L.push("");
    L.push("## Groups");
    L.push("");
    L.push("| | Group | Type | Policies | Expected by | Members |");
    L.push("|---|---|---|---|---|---|");
    for (const r of res.rows) {
      const type = r.status === "missing"
        ? (r.template ? (r.template.membershipRule ? "dynamic (template)" : "role-assignable (template)") : "no template")
        : r.dynamic ? "dynamic" : r.roleAssignable ? "role-assignable" : "assigned";
      L.push(`| ${STATUS[r.status].icon} | ${mdEsc(r.name)} | ${type} | ${r.refCount || "—"} | ${r.sources.join(", ")} | ${r.members ? r.memberTotal : "—"} |`);
    }
    const dangling = res.rows.filter((r) => r.status === "dangling");
    if (dangling.length) {
      L.push("");
      L.push("## Dangling references");
      L.push("");
      L.push("These object IDs are referenced by a policy but do not resolve to a group. The policy still carries the GUID and targets nobody through it.");
      L.push("");
      for (const r of dangling) {
        L.push(`- \`${mdEsc(r.name)}\` — ${[...r.refs.include.map((p) => `include in ${p.name}`), ...r.refs.exclude.map((p) => `exclude from ${p.name}`)].join("; ")}`);
      }
    }
    if (withMembers) {
      const withM = res.rows.filter((r) => r.members && r.members.length);
      if (withM.length) {
        L.push("");
        L.push("## Members");
        for (const r of withM) {
          L.push("");
          L.push(`### ${mdEsc(r.name)} (${r.memberTotal})`);
          L.push("");
          r.members.forEach((m) => L.push(`- ${mdEsc(m.name)}${m.upn ? ` — ${mdEsc(m.upn)}` : ""}${m.disabled ? " _(disabled)_" : ""}`));
        }
      }
    }
    L.push("");
    L.push("---");
    L.push(`Generated by ${BRANDING.name} — Conditional Access Groups`);
    return L.join("\n");
  }

  // ---- ⑤ import members from CSV -----------------------------------------
  // The deployment-test workflow: a CSV of pilot users (UPN + optional Persona
  // column) is routed into the CA groups, exactly like the PowerShell
  // bulk-add scripts consultants carry around — but with the same
  // review-before-apply step as every other write in this app.

  // A small but real CSV parser: quoted cells, embedded commas and quotes,
  // CRLF. Returns { cols, rows } with rows as plain objects keyed by header.
  function csvParse(text) {
    const out = [];
    let row = [], cell = "", q = false;
    const s = String(text || "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some((x) => x.trim() !== "")) out.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some((x) => x.trim() !== "")) out.push(row);
    if (!out.length) return { cols: [], rows: [] };
    const cols = out[0].map((c) => c.trim());
    const rows = out.slice(1).map((r) => {
      const o = {};
      cols.forEach((c, i) => { o[c] = (r[i] ?? "").trim(); });
      return o;
    });
    return { cols, rows };
  }

  // Which columns hold the UPN and the persona. Falls back to "the column
  // whose values look like email addresses" so unnamed exports still work.
  function csvDetect(cols, rows) {
    const byName = (rx) => cols.find((c) => rx.test(c.trim()));
    let upnCol = byName(/^(userprincipalname|upn|user|email|mail)$/i);
    if (!upnCol) {
      upnCol = cols.find((c) => rows.slice(0, 20).filter((r) => /@/.test(r[c] || "")).length >= Math.min(rows.length, 3));
    }
    const personaCol = byName(/^(persona|personas|role|roles|group|groups)$/i) || null;
    return { upnCol: upnCol || cols[0] || null, personaCol };
  }

  // A persona cell may hold several personas: "Global, internals".
  const csvPersonas = (v) => String(v || "").split(/[,;|\s]+/).map((x) => x.trim()).filter(Boolean);

  // Distinct users with their union of personas, CSV order preserved.
  function csvUsers(rows, upnCol, personaCol) {
    const m = new Map();
    for (const r of rows) {
      const upn = (r[upnCol] || "").trim();
      if (!upn) continue;
      const k = upn.toLowerCase();
      if (!m.has(k)) m.set(k, { upn, personas: [] });
      if (personaCol) for (const p of csvPersonas(r[personaCol])) {
        const e = m.get(k);
        if (!e.personas.some((x) => x.toLowerCase() === p.toLowerCase())) e.personas.push(p);
      }
    }
    return [...m.values()];
  }

  // Best-guess group for a persona name. Handles both this app's naming
  // (CAB-SEC-U-Persona-Internals) and abbreviated deployments
  // (CAD-SEC-U-DG-INT) via a persona → common-abbreviation table.
  const CSV_ABBREV = {
    global: ["glo", "global", "all"],
    admins: ["adm", "admin"],
    internals: ["int", "internal"],
    externals: ["ext", "external"],
    guestusers: ["guestuser", "guests", "guest"],
    g_admins: ["guestadmin", "gadm"],
    serviceaccounts: ["sa", "svc", "serviceaccount"],
    devops: ["devops", "dvo"],
    factoryworkers: ["fw", "factory", "frontline"],
  };
  function csvSuggest(persona, groupNames) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const p = norm(persona);
    if (!p) return "";
    const keys = [p, ...(CSV_ABBREV[persona.toLowerCase()] || []).map(norm)];
    // Token-aware scoring so "admins" prefers …-ADM (exact token via its
    // abbreviation) over …-GUESTAdmins (mere substring): an exact name segment
    // beats a segment prefix beats a substring anywhere. Earlier keys (the
    // persona itself before its abbreviations) win ties, then the shorter
    // group name (GLO over GLO-Something).
    let best = "", bestScore = 0;
    for (const g of groupNames) {
      const tokens = String(g).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const gn = norm(g);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!k) continue;
        let s = 0;
        if (tokens.includes(k)) s = 3000;
        else if (tokens.some((t) => t.startsWith(k))) s = 2000;
        else if (tokens.some((t) => t.includes(k))) s = 1000;
        else if (gn.includes(k)) s = 500;
        if (!s) continue;
        const score = s - i * 10 + k.length - g.length / 100;
        if (score > bestScore) { bestScore = score; best = g; }
      }
    }
    return best;
  }

  // Markdown change report, one section per target group.
  function csvReport(meta, results) {
    const L = [`# CA group member import — ${meta.tenant || "tenant"}`, "",
      meta.generatedBy || "", "",
      `- Source: \`${meta.fileName || "CSV"}\` — ${meta.userCount} distinct users${meta.personaCol ? `, personas via \`${meta.personaCol}\`` : ", manual group selection"}`,
      `- Added: **${results.filter((r) => r.state === "added").length}** · already members: ${results.filter((r) => r.state === "already").length} · not found: ${results.filter((r) => r.state === "notfound").length} · failed: ${results.filter((r) => r.state === "failed").length}`, ""];
    const byGroup = new Map();
    for (const r of results) {
      const k = r.group || "(unresolved)";
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(r);
    }
    for (const [g, rs] of byGroup) {
      L.push(`## ${g}`, "", "| User | Result |", "| --- | --- |");
      rs.forEach((r) => L.push(`| ${r.upn} | ${r.state}${r.error ? ` — ${String(r.error).replace(/\|/g, "\\|")}` : ""} |`));
      L.push("");
    }
    return L.join("\n");
  }

  // ---- ⑥ protect: restricted management administrative unit ---------------
  // The groups worth protecting are the ones a policy EXCLUDES: membership of
  // an exclusion group is a Conditional Access bypass, and any tenant-level
  // Groups/User Administrator can quietly add themselves to one. Placing those
  // groups in a restricted management administrative unit
  // (isMemberManagementRestricted, immutable at creation) removes that path:
  // only principals holding a role scoped to THAT administrative unit can
  // modify the members — tenant-wide admins, Global Administrator included,
  // are reduced to read.
  // Candidates are the groups this tool has an opinion about. That used to mean
  // "currently excluded by at least one policy", which had a blind spot with
  // teeth: a baseline exclusion group that no policy references right now — a
  // spare, or one whose policy was retired — could be sitting inside a
  // restricted unit, or frozen inside one, and NOTHING in the app would say so.
  // It was not listed here, so its protection state was unreachable.
  //
  // So: referenced as an exclusion, OR expected by the baseline and named like
  // an exclusion group. The second kind is marked `unused` and never
  // pre-selected — it is here to be SEEN, not to be acted on by default.
  const EXCLUSION_NAME = /-Exclusions?$|-Exclusion-|BreakGlass/i;
  function rmauCandidates(res) {
    return (res ? res.rows : [])
      .filter((r) => r.id)
      .filter((r) => (r.refs?.exclude || []).length
        || (EXCLUSION_NAME.test(r.name || "")
            && (r.template || (r.sources || []).some((x) => x === "template" || x === "catalog"))))
      .map((r) => ({ ...r, unused: !(r.refs?.exclude || []).length }))
      .sort((a, b) => (b.refs.exclude.length - a.refs.exclude.length) || String(a.name).localeCompare(String(b.name)));
  }

  // `units` is the list actually written to — each group goes to its own
  // persona unit, so naming a single one would be a report that reads well and
  // describes something that did not happen.
  function rmauReport(meta, au, results, units) {
    const ok = results.filter((r) => r.state === "added").length;
    const list = (units && units.length) ? units : (au && au.id ? [au] : []);
    const byAu = new Map();
    for (const r of results) if (r.state === "added") byAu.set(r.auName, (byAu.get(r.auName) || 0) + 1);
    const L = [`# Restricted management administrative units — ${meta.tenant || "tenant"}`, "",
      meta.generatedBy || "", "",
      `- Administrative units written to: **${byAu.size}** — each exclusion group is filed under its own persona, so a scoped administrator for one persona cannot reach another's exclusions.`,
      ...[...byAu].map(([n, c]) => `  - **${n}** — ${c} group${c === 1 ? "" : "s"}${list.find((u) => u.name === n && u.created) ? " _(created by this run)_" : ""}`),
      `- Restricted management: **yes** (\`isMemberManagementRestricted\`, immutable)`,
      `- Groups protected: **${ok}** · already in one: ${results.filter((r) => r.state === "already").length} · failed: ${results.filter((r) => r.state === "failed").length} · skipped: ${results.filter((r) => r.state === "skipped").length}`,
      ...((meta.scopedAdmins && meta.scopedAdmins.length)
        ? [`- Scoped administrator grants (Groups Administrator, per administrative unit): `
            + meta.scopedAdmins.map((a) => `**${a.upn}**${a.au ? ` → ${a.au}` : ""}${a.ok ? "" : ` — ❌ ${String(a.error || "failed").replace(/\|/g, "\\|")}`}`).join(", ")]
        : []),
      "", "| Group | Excluded on | Administrative unit | Result |", "| --- | --- | --- | --- |"];
    results.forEach((r) => L.push(`| ${r.name} | ${r.excludeCount} polic${r.excludeCount === 1 ? "y" : "ies"} | ${r.auName || "—"} | ${r.state}${r.error ? ` — ${String(r.error).replace(/\|/g, "\\|")}` : ""} |`));
    if (results.some((r) => r.state === "skipped")) {
      L.push("", "> **Skipped groups were not filed anywhere else.** A group whose persona unit is missing, or whose name carries no CA number, is left unprotected rather than placed in whichever unit was nearest — putting an Admins exclusion group into the Global vault would hand the Global vault's administrators control of it.");
    }
    L.push("", "## What changed operationally", "",
      "- Membership of the protected groups can now only be changed by principals holding a role **scoped to the administrative unit each one is in** — tenant-level Groups/User Administrators (and Global Administrator) can read but not modify.",
      "- That includes this tool: ⑤ Import members and any member add against these groups needs the signed-in account to hold an administrative-unit-scoped role.",
      "- The groups themselves (name, policies referencing them) are unaffected — only member management is restricted.");
    return L.join("\n");
  }

  // ---------- migrate: role-assignable -> plain group in a restricted AU ----------
  //
  // WHY. A CA exclusion group was made role-assignable purely for the side
  // effect: only Global Administrator or Privileged Role Administrator can
  // change its members. A restricted management administrative unit does that
  // job better, because it lets you NAME who may manage the group instead of
  // leaving it to whoever holds PRA. It also drops the role-assignable costs:
  // the 500-per-tenant cap, no dynamic membership, and no nesting control.
  //
  // The two must never be combined: a role-assignable group admits only GA/PRA,
  // an RMAU blocks exactly those two, and neither can be assigned at AU scope —
  // so a group with both has nobody who can edit its members.
  //
  // isAssignableToRole is IMMUTABLE, so this is a recreate, not a patch.
  const MIGRATE_SCOPES = ["Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory",
    "AdministrativeUnit.ReadWrite.All", "Policy.ReadWrite.ConditionalAccess"];

  // Does this group CARRY a directory role? If so it is doing more than being a
  // CA exclusion, and a plain group cannot hold a role at all — so it is skipped
  // rather than quietly broken. Read-only; a failure here is reported, never
  // assumed to mean "no roles", because assuming that would migrate it anyway.
  async function heldRoles(groupId) {
    const out = { active: [], eligible: [], ok: true, error: "" };
    try {
      const a = await Graph.gget(`/roleManagement/directory/roleAssignments?$filter=principalId eq '${groupId}'&$expand=roleDefinition($select=displayName)`);
      out.active = ((a && a.value) || []).map((r) => (r.roleDefinition && r.roleDefinition.displayName) || r.roleDefinitionId);
    } catch (e) { out.ok = false; out.error = e.message || String(e); }
    try {
      const b = await Graph.gget(`/roleManagement/directory/roleEligibilitySchedules?$filter=principalId eq '${groupId}'&$expand=roleDefinition($select=displayName)`);
      out.eligible = ((b && b.value) || []).map((r) => (r.roleDefinition && r.roleDefinition.displayName) || r.roleDefinitionId);
    } catch (e) {
      // PIM is licence-gated; "not licensed" is not the same as "failed to read".
      if (!/not licensed|does not have|Insufficient privileges/i.test(e.message || "")) { out.ok = false; out.error = out.error || (e.message || String(e)); }
    }
    return out;
  }

  // One plan per group. `roles` is a Map(id -> heldRoles result); `protectedIn`
  // a Map(id -> {auName}) for groups already inside a restricted AU.
  function migratePlan(rows, opts = {}) {
    const roles = opts.roles || new Map();
    const protectedIn = opts.protectedIn || new Map();
    const disableNesting = opts.disableNesting !== false;      // default ON
    // Placing the new group in the restricted AU is optional. Skipping it leaves
    // an ordinary group that ⑥ Protect can pick up later — which is the same
    // path any never-role-assignable baseline group takes, so nothing special
    // is needed to finish the job afterwards.
    const toAu = opts.toAu !== false;
    const items = (rows || []).map((row) => {
      const base = { id: row.id, name: row.name, row,
        refs: row.refs || { include: [], exclude: [] },
        memberTotal: row.memberTotal };
      const nRef = base.refs.include.length + base.refs.exclude.length;

      if (!row.id) return { ...base, ok: false, reason: "Not in the tenant yet — create it first." };
      if (!row.roleAssignable) return { ...base, ok: false, reason: "Already a plain group — nothing to convert. Use ⑥ Protect to place it in a restricted AU." };
      if (protectedIn.has(row.id)) return { ...base, ok: false, reason: `Already inside the restricted AU “${protectedIn.get(row.id).auName}” — its members cannot be read or moved from here.` };

      const r = roles.get(row.id);
      if (r && !r.ok) return { ...base, ok: false, reason: `Could not check whether this group holds a directory role (${r.error}). Skipped rather than risk breaking a role assignment.` };
      if (r && (r.active.length || r.eligible.length)) {
        const names = [...new Set([...r.active, ...r.eligible])].join(", ");
        return { ...base, ok: false,
          reason: `This group holds a directory role (${names}). A plain group cannot carry a role, so migrating it would break that assignment. Deal with the role first.` };
      }

      const archiveName = migratedName(row.name);
      return { ...base, ok: true, archiveName, disableNesting,
        // The order IS the safety property. Members must move while the new
        // group is still ordinary; once it is inside the restricted AU only an
        // AU-scoped role could add them. And the new group is added to every
        // policy BEFORE the old one is removed, so no policy is ever left
        // without either — an exclusion that briefly vanishes is an outage.
        steps: [
          { key: "rename",  text: `Rename “${row.name}” to “${archiveName}” — kept as the rollback` },
          { key: "create",  text: `Create “${row.name}” as a plain security group${disableNesting ? ", nesting disabled" : ""}` },
          { key: "members", text: row.memberTotal != null
              ? `Copy ${row.memberTotal} member${row.memberTotal === 1 ? "" : "s"} across — the archived group keeps its own copy`
              : `Copy the members across (count unknown — the read failed) — the archived group keeps its own copy` },
          ...(base.refs.include.length ? [{ key: "addInc", text: `Add the new group to the INCLUDE of ${base.refs.include.length} polic${base.refs.include.length === 1 ? "y" : "ies"}` }] : []),
          ...(base.refs.exclude.length ? [{ key: "addExc", text: `Add the new group to the EXCLUDE of ${base.refs.exclude.length} polic${base.refs.exclude.length === 1 ? "y" : "ies"}` }] : []),
          ...(base.refs.include.length ? [{ key: "delInc", text: `Remove the archived group from those ${base.refs.include.length} include assignment${base.refs.include.length === 1 ? "" : "s"}` }] : []),
          ...(base.refs.exclude.length ? [{ key: "delExc", text: `Remove the archived group from those ${base.refs.exclude.length} exclude assignment${base.refs.exclude.length === 1 ? "" : "s"}` }] : []),
          ...(toAu ? [{ key: "rmau", text: `Add the new group to the restricted AU${opts.rmauName ? ` “${opts.rmauName}”` : ""} — last, so the member copy is still possible` }]
                   : [{ key: "noAu", text: `Leave it outside the restricted AU for now — add it later from ⑥ Protect` }]),
        ],
        toAu,
        nRef,
      };
    });
    return {
      items,
      eligible: items.filter((x) => x.ok),
      skipped: items.filter((x) => !x.ok),
      disableNesting, toAu,
    };
  }

  function migrateReport(plan, results, meta = {}) {
    const L = [`# Migration: role-assignable → restricted administrative unit`, "",
      `**Tenant:** ${meta.tenant || "—"}  `,
      `**Restricted AU:** ${meta.auName || "—"}  `,
      `**Generated by:** ${meta.build || ""}  `,
      `**When:** ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
      `Role-assignable groups were used to keep CA exclusion membership out of reach of tenant-wide group administrators. A restricted management administrative unit does that and lets you name who may manage them. The two cannot be combined: a role-assignable group admits only Global Administrator or Privileged Role Administrator, and a restricted AU blocks exactly those two.`, ""];
    L.push(`## Result`, "");
    L.push(`| Group | Outcome | New id | Members | Policies |`, `| --- | --- | --- | ---: | ---: |`);
    for (const r of (results || [])) {
      const mem = r.membersMoved != null && r.memberTotal != null ? `${r.membersMoved}/${r.memberTotal}` : (r.membersMoved != null ? String(r.membersMoved) : "—");
      L.push(`| ${r.name} | ${r.ok ? "migrated" : "FAILED"} | ${r.newId || "—"} | ${mem} | ${r.refsMoved != null ? r.refsMoved : "—"} |`);
    }
    L.push("");
    const skipped = (plan && plan.skipped) || [];
    if (skipped.length) {
      L.push(`## Not migrated (${skipped.length})`, "");
      for (const s of skipped) L.push(`- **${s.name}** — ${s.reason}`);
      L.push("");
    }
    L.push(`## What to do next`, "");
    L.push(`1. Check the members of each new group against the archived one before deleting anything.`);
    const outside = (results || []).filter((r) => r.ok && !r.inAu);
    if (outside.length) {
      L.push(`2. **${outside.length} group${outside.length === 1 ? " is" : "s are"} not in the restricted AU yet** — ${outside.map((r) => r.name).join(", ")}. They are ordinary groups now, so **CA groups → ⑥ Protect** can place them whenever you are ready.`);
    } else {
      L.push(`2. Grant a **scoped administrator** on the restricted AU if you have not — otherwise nobody can manage these members.`);
    }
    L.push(`3. Delete the archived \`(${MIGRATED_TAG} …)\` groups from **CA groups → 🧹 Archived groups** once satisfied. They are your rollback until then.`);
    L.push("");
    L.push(`_The archived groups keep their members and remain role-assignable; they simply no longer appear in any Conditional Access policy._`);
    return L.join("\n");
  }

  return {
    STATUS, MEMBER_CAP, scan, loadMembers, matrix, creatable, missingNoTemplate,
    renderSummary, chips, renderTable, renderMatrix, toMd, filtered,
    NESTING, NEST_WRITE_SCOPES, nestingState, nestingPlan, nestingReport, adminList,
    NESTING_GA, NEST_V1, nestingUnsupported, nestingSupported, noteNestingUnsupported, NESTING_UNSUPPORTED_TEXT,
    ARCHIVE_SUFFIX, findArchived,
    catalogGroupNames, templateNames, policyRefs, convertPlan, runConvert,
    MIGRATE_SCOPES, heldRoles, migratePlan, migrateReport, migratedName,
    csvParse, csvDetect, csvPersonas, csvUsers, csvSuggest, csvReport,
    rmauCandidates, rmauReport,
  };
})();
