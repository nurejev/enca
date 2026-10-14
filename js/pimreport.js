// ======================================================================
// 📋 PIM report (T55, beta 32507) — pure module, no DOM, no Graph.
//
// Mihai, 12 Oct 2026: "need a PIM report of the current situation. roles vs
// groups and settings" — then "must also be included in the PIM-Buddy
// solution in enca", and "go create T55" off the mockup (option A: its own
// tool in Workspace 02, not a tab in 🧬 Baseline).
//
// The report is a READING of what two tools already read, put side by side
// with what neither of them reads:
//
//   🧬 PIM baseline (T48)   PimBaseline.compare — every catalog role's PIM
//                           policy and every PIM-SG group's member policy,
//                           setting by setting; which roles each group holds
//   🎖 Roles (T49)          PimRoles.model — every assignment, people through
//                           groups, permanent, scoped, expiring
//   T55's own read          the members (active and eligible) of EVERY
//                           framework group and approver group — 🎖 opens only
//                           the groups that hold a role, and an access group
//                           (Intune, XDR, Exchange, Azure) holds none
//
// The two gates. Since framework 3.0 there are two paths and the gate sits in
// a different place on each, which is the one thing a reader must take away:
//
//   job path      people ELIGIBLE for the group, the group ACTIVE in its
//                 roles — the GROUP's member policy is the gate
//   direct path   people ACTIVE in the group, the group ELIGIBLE for each
//                 role — the ROLE's policy is the gate
//
// So a role policy left at Microsoft's default matters on the direct path and
// not on the job path, and the findings say which path a gap is on.
//
// What it returns (build): summary tiles, findings with impact and the way
// back (Mihai's rule for change plans: impact and recovery before commands),
// the roles × groups matrix with a verdict per cell, both settings tables,
// the people per group, standing access outside PIM, and what was read.
// Exports: toMd (one Markdown file, the diagram EMBEDDED as an SVG data URI so
// the file keeps its picture when moved — the handover lesson of 12 Oct),
// toCsv (the matrix). Plain text in every string (no HTML in the notes).
// ======================================================================
const PimReport = (() => {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mdc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const TIER_ORDER = ["Tier0", "Tier1", "Tier2", "Reader"];
  const SEV = { high: { label: "HIGH", order: 0 }, medium: { label: "MED", order: 1 }, low: { label: "LOW", order: 2 }, info: { label: "INFO", order: 3 } };
  const TENANT = (a) => !a.directoryScopeId || a.directoryScopeId === "/";

  // "PT2H" → "2 h", "P365D" → "365 days"; anything else as it came.
  function human(v) {
    if (v === null) return "none";
    if (v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(String(v));
    if (!m) return String(v);
    const [, d, h, mi] = m;
    return [d && `${d} day${d === "1" ? "" : "s"}`, h && `${h} h`, mi && `${mi} min`].filter(Boolean).join(" ") || String(v);
  }
  const ABSENT = "(not set)";
  // A short line for a settings object (expected or got).
  function brief(s) {
    if (!s) return "not read";
    const parts = [];
    if (s.activation !== undefined) parts.push(human(s.activation));
    const en = Array.isArray(s.enablement) ? s.enablement : [];
    if (en.includes("MultiFactorAuthentication")) parts.push("MFA");
    if (en.includes("Justification")) parts.push("justification");
    if (en.includes("Ticketing")) parts.push("ticket");
    if (s.authContext) parts.push(`context ${s.authContext}`);
    if (s.approval === true) parts.push(`approval${s.approvers && s.approvers.length ? ` by ${s.approvers.join(", ")}` : ""}`);
    else if (s.approval === false) parts.push("no approval");
    return parts.join(" · ");
  }

  // ---- build ------------------------------------------------------------
  // input: { cat, res, raw, roles, members, readAt, tenant, demo }
  //   cat     the profiled catalog (pmbCat())
  //   res     PimBaseline.compare(cat, raw)
  //   raw     the 🧬 read (eligible, active, groups, named, aus, names, …)
  //   roles   PimRoles.model (optional — the people through groups)
  //   members { [groupId]: { read, active: [{id,name,type}], eligible: [...] } }
  function build(input) {
    const cat = input.cat, res = input.res, raw = input.raw || {};
    const members = input.members || {};
    const auName = new Map((raw.aus || []).map((a) => [a.id, a.displayName]));
    const scopeName = (s) => (!s || s === "/" ? "tenant" : /^\/administrativeUnits\//.test(s) ? (auName.get(s.split("/")[2]) || "unit") : s);
    // Every group the report is about: the catalog's (as compare resolved
    // them), the regional ones, and the approver groups.
    const byName = new Map();
    [...(raw.groups || []), ...(raw.named || [])].forEach((g) => { if (g && g.displayName && !byName.has(g.displayName)) byName.set(g.displayName, g); });
    // Regional groups: what compare recognised, plus any name that fits a
    // regional template (the Remote Help module's -<REG> groups among them —
    // compare's own pattern predates the modules and lists them as extra).
    const regTplNames = (((cat.regions && cat.regions.template) || {}).groups || []).map((x) => new RegExp("^" + x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<REG>", ".+") + "$"));
    const fitsRegional = (n) => regTplNames.some((re) => re.test(n));
    const regionalSet = new Set([...(res.regionalGroups || []), ...[...(raw.named || []), ...(raw.groups || [])].map((g) => g.displayName).filter((n) => n && fitsRegional(n) && !(res.groups || []).some((g) => g.name === n))]);
    const extraGroups = (res.extraGroups || []).filter((n) => !fitsRegional(n));
    // On the baseline tenant every profile's links are expected at once.
    const also = input.alsoCarries || {};
    const approverNames = [...new Set([cat.approvers && cat.approvers.name, ...Object.values(cat.profiles || {}).map((p) => p.approvers), ...[...byName.keys()].filter((n) => /^PIM-SG-.*Approvers$/.test(n))].filter(Boolean))];
    const regTpl = (cat.regions && cat.regions.template) || {};
    const regPath = (name) => {
      const t = (regTpl.groups || []).find((x) => new RegExp("^" + x.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<REG>", ".+") + "$").test(name));
      return t ? { path: t.path || null, template: t.template, persona: t.persona } : { path: null, template: null, persona: "" };
    };
    const groups = [];
    (res.groups || []).forEach((g) => groups.push({ name: g.name, id: g.id || null, present: !!g.present, path: g.path || null, kind: g.path === "job" ? "job" : g.path === "direct" ? "direct" : "access", scope: g.scope, template: g.template, persona: g.persona, carries: g.carries || [], has: g.has || [], missingRoles: g.missingRoles || [], extraRoles: g.extraRoles || [], wrongShape: g.wrongShape || [], settings: g.settings, diffs: g.diffs || [], status: g.status, regional: false }));
    // The baseline tenant: groups of the other profiles (input.everyGroup —
    // PimBaseline.allGroups over the base catalog) are framework groups too.
    (input.everyGroup || []).filter((c) => !groups.some((g) => g.name === c.name)).forEach((c) => { const tg = byName.get(c.name); groups.push({ name: c.name, id: tg ? tg.id : null, present: !!tg, path: c.path || null, kind: c.path === "job" ? "job" : c.path === "direct" ? "direct" : "access", scope: c.scope, template: c.template, persona: c.persona, carries: also[c.name] || [], has: [], missingRoles: [], extraRoles: [], wrongShape: [], settings: "unread", diffs: [], status: "other-profile", regional: false, otherProfile: true, def: c }); });
    // Their member policies compare through the caller's PimBaseline (kept out
    // of this module so it stays pure): input.groupDiff(catalogGroup, rules).
    groups.filter((g) => g.otherProfile && g.id && raw.groupPolicies && raw.groupPolicies[g.id] && typeof input.groupDiff === "function").forEach((g) => { const d = input.groupDiff(g.def, raw.groupPolicies[g.id]) || []; g.diffs = d; g.settings = d.length ? "differs" : "match"; });
    [...regionalSet].forEach((n) => { const t = byName.get(n); const p = regPath(n); groups.push({ name: n, id: t ? t.id : null, present: !!t, path: p.path, kind: p.path === "job" ? "job" : p.path === "direct" ? "direct" : /Approvers$/.test(n) ? "approver" : "access", scope: "region", template: p.template, persona: p.persona, carries: [], has: [], missingRoles: [], extraRoles: [], wrongShape: [], settings: null, diffs: [], status: "regional", regional: true }); });
    approverNames.filter((n) => !groups.some((g) => g.name === n)).forEach((n) => { const t = byName.get(n); groups.push({ name: n, id: t ? t.id : null, present: !!t, path: null, kind: "approver", scope: "approval", template: null, persona: "Approves activations", carries: [], has: [], missingRoles: [], extraRoles: [], wrongShape: [], settings: null, diffs: [], status: t ? "present" : "missing", regional: false }); });
    const groupById = new Map(groups.filter((g) => g.id).map((g) => [g.id, g]));
    // People per group.
    groups.forEach((g) => {
      const m = g.id ? members[g.id] : null;
      g.membersRead = !!(m && m.read !== false);
      g.active = m && m.read !== false ? (m.active || []) : [];
      g.eligible = m && m.read !== false ? (m.eligible || []) : [];
    });

    // ---- the matrix: every assignment held by a framework group --------
    const cells = [];
    const regionalExpect = (regTpl.eligibilities || []);
    const regExpected = (role, gname, auNameS) => regionalExpect.some((x) => x.role === role && new RegExp("^" + x.group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<REG>", "(.+)") + "$").test(gname) && (() => { const code = new RegExp("^" + x.group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<REG>", "(.+)") + "$").exec(gname)[1]; return x.au.replace("<REG>", code) === auNameS; })());
    const add = (a, how) => {
      const g = groupById.get(a.principalId);
      if (!g || a.assignmentType === "Activated") return;
      const scope = scopeName(a.directoryScopeId);
      let verdict;
      if (g.regional) verdict = regExpected(a.roleName, g.name, scope) ? ((g.kind === "job") === (how === "active") ? "match" : "wrong") : "extra";
      else if (!TENANT(a)) verdict = "scoped";
      else if (g.carries.includes(a.roleName) || (also[g.name] || []).includes(a.roleName)) verdict = g.wrongShape.includes(a.roleName) ? "wrong" : "match";
      else verdict = g.kind === "access" ? "extra" : "extra";
      cells.push({ role: a.roleName, group: g.name, kind: g.kind, how, scope, end: a.endDateTime || null, verdict });
    };
    (raw.active || []).forEach((a) => add(a, "active"));
    (raw.eligible || []).forEach((a) => add(a, "eligible"));
    groups.filter((g) => g.present).forEach((g) => g.missingRoles.forEach((r) => cells.push({ role: r, group: g.name, kind: g.kind, how: g.kind === "job" ? "active" : "eligible", scope: "tenant", end: null, verdict: "missing" })));
    const tierOf = new Map((res.rows || []).map((r) => [r.name, r.tier]));
    const matrixRoles = [...new Set(cells.map((c) => c.role))].sort((a, b) => (TIER_ORDER.indexOf(tierOf.get(a)) + 1 || 9) - (TIER_ORDER.indexOf(tierOf.get(b)) + 1 || 9) || a.localeCompare(b));
    const matrixGroups = groups.filter((g) => cells.some((c) => c.group === g.name)).map((g) => g.name);
    const vcount = (v) => cells.filter((c) => c.verdict === v).length;
    const matrix = { roles: matrixRoles.map((r) => ({ role: r, tier: tierOf.get(r) || null })), groups: matrixGroups, cells, counts: { cells: cells.length, match: vcount("match"), extra: vcount("extra"), wrong: vcount("wrong"), missing: vcount("missing"), scoped: vcount("scoped"), active: cells.filter((c) => c.how === "active" && c.verdict !== "missing").length, eligible: cells.filter((c) => c.how === "eligible" && c.verdict !== "missing").length, auScoped: cells.filter((c) => c.scope !== "tenant" && c.verdict !== "missing").length } };

    // ---- settings ------------------------------------------------------
    const roleSettings = (res.rows || []).map((r) => ({ role: r.name, tier: r.tier, template: r.template, status: r.status, expected: r.expected || null, got: r.got || null, diffs: r.diffs || [], path: (r.via || []).some((g) => (groups.find((x) => x.name === g) || {}).kind === "direct") ? "direct" : (r.via || []).length ? "job" : "none", via: r.via || [] }));
    const groupSettings = groups.filter((g) => g.present && (g.kind === "job" || g.kind === "direct" || g.kind === "access") && !g.regional).map((g) => ({ group: g.name, kind: g.kind, template: g.template, settings: g.settings, diffs: g.diffs }));
    const gotRules = (raw.groupPolicies || null);

    // ---- people --------------------------------------------------------
    const frameworkGroups = groups.filter((g) => g.present && g.kind !== "approver");
    const peopleIds = new Set(); frameworkGroups.forEach((g) => [...g.active, ...g.eligible].forEach((m) => peopleIds.add(m.id || m.principalId)));
    const unreadMembers = groups.filter((g) => g.present && !g.membersRead).map((g) => g.name);
    const approvers = groups.filter((g) => g.kind === "approver").map((g) => ({ name: g.name, present: g.present, read: g.membersRead, count: g.active.length }));

    // ---- standing access outside the framework -------------------------
    const prot = new RegExp((cat.protected && cat.protected.pattern) || "^$", "i");
    const protIds = new Set(raw.protectedIds || []);
    const outside = [];
    const seen = new Map();
    const pushOut = (a, how) => {
      if (a.assignmentType === "Activated") return;
      if (groupById.has(a.principalId)) return;
      const name = a.principalName || a.principalId;
      if (a.principalType === "Group" && /^PIM-SG-/.test(name)) return;
      const k = a.principalId;
      if (!seen.has(k)) { const o = { id: k, name, type: a.principalType || "User", protected: protIds.has(k) || prot.test(name), holds: [] }; seen.set(k, o); outside.push(o); }
      seen.get(k).holds.push({ role: a.roleName, how, permanent: !a.endDateTime, scope: scopeName(a.directoryScopeId), tier: tierOf.get(a.roleName) || null });
    };
    (raw.active || []).forEach((a) => pushOut(a, "active"));
    (raw.eligible || []).forEach((a) => pushOut(a, "eligible"));
    outside.sort((a, b) => (b.holds.some((h) => h.role === "Global Administrator") - a.holds.some((h) => h.role === "Global Administrator")) || (a.type === b.type ? 0 : a.type === "User" ? -1 : 1) || a.name.localeCompare(b.name));
    const standingGa = outside.filter((o) => o.type === "User" && o.holds.some((h) => h.role === "Global Administrator" && h.how === "active" && h.permanent));

    // ---- findings ------------------------------------------------------
    const F = [];
    const f = (id, sev, title, detail, impact, recovery, fix) => F.push({ id, sev, title, detail, impact, recovery, fix: fix || null });
    const missingGroups = groups.filter((g) => !g.present && g.kind !== "approver" && g.scope !== "azure");
    if (missingGroups.length) f("groups-missing", "high", `${missingGroups.length} framework group${missingGroups.length === 1 ? " is" : "s are"} missing`, missingGroups.map((g) => g.name).join(", "), "The roles those groups carry cannot be reached through the framework.", "Creating a group grants nobody anything until members are added.", "toolPimDeploy");
    if (matrix.counts.missing || matrix.counts.wrong) f("links", "high", `${matrix.counts.missing + matrix.counts.wrong} role link${matrix.counts.missing + matrix.counts.wrong === 1 ? " differs" : "s differ"} from the catalog`, [...cells.filter((c) => c.verdict === "missing").map((c) => `${c.group} does not hold ${c.role}`), ...cells.filter((c) => c.verdict === "wrong").map((c) => `${c.group} holds ${c.role} ${c.how}, the catalog says ${c.how === "active" ? "eligible" : "active"}`)].slice(0, 8).join("; "), "A missing link means the job or direct group does not give that role; a link of the wrong type moves the gate to the other policy.", "Deploy adds links and never removes one; a wrong-type link is removed by hand in PIM after the right one exists.", "toolPimDeploy");
    if (matrix.counts.extra) f("links-extra", "medium", `${matrix.counts.extra} role${matrix.counts.extra === 1 ? " is" : "s are"} held by a framework group outside the catalog`, cells.filter((c) => c.verdict === "extra").map((c) => `${c.group}: ${c.role} (${c.how}, ${c.scope})`).slice(0, 8).join("; "), "Whoever uses that group gets more than the framework says.", "Remove the assignment in PIM → the role → Assignments; it can be added back the same way.", "toolPimRoles");
    const directDiff = roleSettings.filter((r) => r.path === "direct" && r.status === "differs");
    const t0 = directDiff.filter((r) => r.tier === "Tier0");
    if (t0.length) f("tier0-policy", "high", `${t0.length} Tier 0 role polic${t0.length === 1 ? "y differs" : "ies differ"} from the framework (direct path — this IS the gate)`, t0.map((r) => `${r.role}: ${brief(r.got)} → ${brief(r.expected)}`).join("; "), "Anyone put in the direct group activates the role under these settings.", "🚀 Deploy keeps a backup of every rule it changes; ↩ Put back restores it for the same tenant after a preview.", "toolPimDeploy");
    const otherDirect = directDiff.filter((r) => r.tier !== "Tier0");
    if (otherDirect.length) f("direct-policy", "medium", `${otherDirect.length} other direct-path role polic${otherDirect.length === 1 ? "y differs" : "ies differ"}`, otherDirect.map((r) => `${r.role}: ${brief(r.got)} → ${brief(r.expected)}`).slice(0, 8).join("; "), "Activation of these roles is longer or less controlled than the framework intends.", "Same as above: Deploy backs up, ↩ Put back restores.", "toolPimDeploy");
    const unreadRoles = roleSettings.filter((r) => r.status === "unread");
    if (unreadRoles.length) f("policy-unread", "low", `${unreadRoles.length} role polic${unreadRoles.length === 1 ? "y was" : "ies were"} not read`, unreadRoles.map((r) => r.role).slice(0, 8).join(", "), "Nothing is concluded about them — not read is not fine.", "Read again with RoleManagementPolicy.Read.Directory consented.", "toolPimBaseline");
    const gDiff = groupSettings.filter((g) => g.settings === "differs");
    if (gDiff.length) f("group-policy", gDiff.some((g) => g.kind === "job") ? "high" : "medium", `${gDiff.length} group member polic${gDiff.length === 1 ? "y differs" : "ies differ"}`, gDiff.map((g) => `${g.group}: ${g.diffs.map((d) => `${d.label} ${d.tenant} → ${d.baseline}`).join(", ")}`).slice(0, 6).join("; "), "On the job path the group's member policy is the only gate.", "Deploy backs up the old rules; ↩ Put back restores them.", "toolPimDeploy");
    const gUnread = groupSettings.filter((g) => g.settings === "unread" && g.kind !== "access");
    if (gUnread.length) f("group-policy-unread", "low", `${gUnread.length} group member polic${gUnread.length === 1 ? "y was" : "ies were"} not read`, gUnread.map((g) => g.group).slice(0, 8).join(", "), "A new group's policy shows as not read until PIM for Groups knows the group.", "Add the first eligible member, read again.", "toolPimBaseline");
    // Approval switched on with nobody to approve.
    const apCount = new Map(approvers.map((a) => [a.name, a.read ? a.count : null]));
    const emptyApproval = [];
    roleSettings.forEach((r) => { if (r.got && r.got.approval === true) (r.got.approvers || []).forEach((n) => { if (apCount.get(n) === 0) emptyApproval.push(`${r.role} → ${n}`); }); });
    (res.groups || []).forEach((g) => { if (g.present && raw.groupPolicies && raw.groupPolicies[g.id]) { const ap = approversOf(raw.groupPolicies[g.id], raw.names || {}); ap.forEach((n) => { if (apCount.get(n) === 0) emptyApproval.push(`${g.name} → ${n}`); }); } });
    if (emptyApproval.length) f("approvers-empty", "medium", "Approval is switched on, but the approver group is empty", emptyApproval.slice(0, 8).join("; "), "No such activation can ever be approved — safe, but it deadlocks the moment real admins rely on it.", "Add at least two approvers who are not requesters; removing them again grants nothing.", "toolCaGroups");
    if (!peopleIds.size && frameworkGroups.length) f("no-people", "medium", "Nobody is in the model yet", `${frameworkGroups.length} framework groups, 0 active and 0 eligible members${unreadMembers.length ? ` (${unreadMembers.length} not read)` : ""}`, "The model is in place but unused — admin work still runs through whatever standing access exists.", "Start with one test admin: eligible member of one job group, test the activation; a direct group only after its role policies are right.", "toolPimRoles");
    if (standingGa.length) f("standing-ga", standingGa.filter((o) => !o.protected).length > 1 ? "high" : "medium", `${standingGa.length} permanent Global Administrator${standingGa.length === 1 ? "" : "s"} outside PIM`, standingGa.map((o) => `${o.name}${o.protected ? " (break-glass by name)" : ""}`).join(", "), "Each unprotected one is standing Tier 0 next to the model.", "Decide per account: keep as a documented exception, or move to an eligible membership of the GlobalAdmin group once its role policy is right.", "toolPimRoles");
    const sps = outside.filter((o) => o.type === "ServicePrincipal");
    if (sps.length) f("apps", "info", `${sps.length} app${sps.length === 1 ? "" : "s"} hold${sps.length === 1 ? "s" : ""} ${sps.reduce((n, o) => n + o.holds.length, 0)} role${sps.reduce((n, o) => n + o.holds.length, 0) === 1 ? "" : "s"} permanently`, sps.map((o) => `${o.name}: ${o.holds.map((h) => h.role).join(", ")}`).join("; "), "Apps cannot use PIM; their roles are standing by nature.", "Review them with the groups, yearly.", "toolPimRoles");
    const otherUsers = outside.filter((o) => o.type === "User" && !standingGa.includes(o));
    if (otherUsers.length) f("users-outside", "low", `${otherUsers.length} account${otherUsers.length === 1 ? " holds" : "s hold"} roles outside the framework groups`, otherUsers.map((o) => `${o.name}: ${o.holds.map((h) => `${h.role} (${h.how}${h.scope !== "tenant" ? `, ${h.scope}` : ""}${h.permanent ? ", permanent" : ""})`).slice(0, 4).join(", ")}${o.holds.length > 4 ? ` +${o.holds.length - 4}` : ""}`).join("; "), "Access the framework does not explain.", "Move to a PIM-SG group or record it as an accepted exception.", "toolPimRoles");
    // 5.0: the slow path and the fold, each with the way out.
    const slowCells = cells.filter((c) => c.how === "active" && c.verdict === "wrong" && c.kind === "direct");
    if (slowCells.length) f("slow-path", "high", `${slowCells.length} role${slowCells.length === 1 ? " is" : "s are"} still held ACTIVE by a role group (the 4.1 slow path)`, slowCells.slice(0, 10).map((c) => `${c.group}: ${c.role}${c.scope !== "tenant" ? ` at ${c.scope}` : ""}`).join("; ") + (slowCells.length > 10 ? "; …" : ""), "Whoever activates the group membership gets every role at once, and Exchange, SharePoint, Teams and Intune notice it minutes to hours later. Framework 5.0 makes the group ELIGIBLE per role, so a person activates one role, in seconds.", "🚀 Deploy: tick Group assignments and apply (adds the eligibilities); Preview again with 5.0 migration ticked (removes the active assignments, kept in the backup for ↩ Put back).", "toolPimDeploy");
    const retired = res.retiredGroups || [];
    if (retired.length) f("retired-groups", retired.some((r) => r.count) ? "medium" : "low", `${retired.length} group${retired.length === 1 ? "" : "s"} retired in 5.0 still in the tenant`, retired.map((r) => `${r.name} → ${r.into}${r.count ? ` (holds ${r.holds.join(", ")})` : " (holds no role)"}`).join("; "), "The -Direct groups were folded into their job group; a member of one still reaches the roles it holds, outside the roster that is reviewed.", "🚀 Deploy's 5.0 migration removes what they hold once the job group is eligible for it; then delete the group by hand, after checking nothing references it.", "toolPimDeploy");
    if (extraGroups.length) f("extra-groups", "low", `${extraGroups.length} role-assignable group${extraGroups.length === 1 ? "" : "s"} outside the framework`, extraGroups.join(", "), "Groups that can hold roles but are not part of the model.", "Review with their owner.", "toolCaGroups");
    F.sort((a, b) => SEV[a.sev].order - SEV[b.sev].order);

    // ---- summary -------------------------------------------------------
    const present = groups.filter((g) => g.present && g.kind !== "approver").length;
    const catGroups = groups.filter((g) => !g.regional && g.kind !== "approver");
    const catalogTotal = catGroups.length;
    const catalogPresent = catGroups.filter((g) => g.present).length;
    const jobGroups = groups.filter((g) => g.present && g.kind === "job" && cells.some((c) => c.group === g.name && c.how === "active"));
    const directGroups = groups.filter((g) => g.present && g.kind === "direct" && cells.some((c) => c.group === g.name && c.how === "eligible"));
    const jobPolicy = groupSettings.filter((g) => g.kind === "job");
    const tiles = [
      { key: "groups", label: "PIM groups", value: `${catalogPresent} / ${catalogTotal}`, detail: `catalog groups present · ${regionalSet.size} regional${extraGroups.length ? ` · ${extraGroups.length} outside the framework` : ""}`, state: catalogPresent === catalogTotal ? "ok" : "bad" },
      { key: "links", label: "Roles vs groups", value: matrix.counts.missing + matrix.counts.wrong + matrix.counts.extra ? `${matrix.counts.missing + matrix.counts.wrong + matrix.counts.extra} differ` : `${matrix.counts.match} / ${matrix.counts.match} match`, detail: `${matrix.counts.active} active on ${jobGroups.length} job groups (${matrix.counts.auScoped} at AU scope) · ${matrix.counts.eligible} eligible on ${directGroups.length} direct groups`, state: matrix.counts.missing + matrix.counts.wrong ? "bad" : matrix.counts.extra ? "warn" : "ok" },
      { key: "gpol", label: "Group policies (job gate)", value: jobPolicy.length ? `${jobPolicy.filter((g) => g.settings === "match").length} / ${jobPolicy.length} match` : "none", detail: jobPolicy.some((g) => g.settings === "unread") ? `${jobPolicy.filter((g) => g.settings === "unread").length} not read` : "member activation as the template says", state: jobPolicy.some((g) => g.settings === "differs") ? "bad" : jobPolicy.some((g) => g.settings === "unread") ? "warn" : "ok" },
      { key: "rpol", label: "Role policies (direct gate)", value: t0.length ? `Tier 0: ${t0.length} differ` : directDiff.length ? `${directDiff.length} differ` : "match", detail: `${roleSettings.filter((r) => r.path === "direct").length} direct-path roles · ${roleSettings.filter((r) => r.status === "match").length} of ${roleSettings.length} catalog roles match`, state: t0.length ? "bad" : directDiff.length ? "warn" : "ok" },
      { key: "people", label: "People", value: `${peopleIds.size} in the model`, detail: `${approvers.filter((a) => a.read && a.count === 0).length ? `${approvers.filter((a) => a.read && a.count === 0).length} empty approver group${approvers.filter((a) => a.read && a.count === 0).length === 1 ? "" : "s"} · ` : ""}${standingGa.length} standing GA${standingGa.length === 1 ? "" : "s"}`, state: !peopleIds.size || standingGa.length > 1 ? "warn" : "ok" },
    ];
    const verdict = F.some((x) => x.sev === "high") ? "action" : F.some((x) => x.sev === "medium") ? "review" : "ok";

    return {
      readAt: input.readAt || raw.readAt || null, demo: !!(input.demo || raw.demo), tenant: input.tenant || "", tenantId: input.tenantId || "",
      catalog: res.catalog, profile: res.profile ? res.profile.label || res.profile.id || "" : "",
      tiles, verdict, findings: F, matrix, roleSettings, groupSettings, groups, approvers, outside, standingGa,
      people: { total: peopleIds.size, unread: unreadMembers },
      counts: { groups: present, regional: regionalSet.size, catalogGroups: catalogTotal, catalogPresent, jobGroups: jobGroups.length, directGroups: directGroups.length, findings: F.length, high: F.filter((x) => x.sev === "high").length },
      sources: Object.assign({}, res.sources || {}, { members: unreadMembers.length ? `${groups.filter((g) => g.present).length - unreadMembers.length} of ${groups.filter((g) => g.present).length}` : "ok" }),
      groupPoliciesRead: !!gotRules,
    };
  }
  function approversOf(rules, names) {
    const a = (rules || []).find((r) => r && r.id === "Approval_EndUser_Assignment");
    if (!a || !a.setting || !a.setting.isApprovalRequired) return [];
    return (a.setting.approvalStages || []).flatMap((s) => s.primaryApprovers || []).map((x) => names[x.groupId] || x.description || x.groupId).filter(Boolean);
  }

  // ---- the diagram: two paths, coloured by state -------------------------
  // Plain SVG, its own colours (it travels inside a Markdown file and has to
  // read on white and dark viewers alike, so it carries a white card).
  function flowSvg(m) {
    const C = { ok: ["#e3f4ea", "#2e7d4f"], bad: ["#fde7e4", "#c0392b"], warn: ["#fff4d6", "#b7860b"], obj: ["#eef2f7", "#5b6b7f"] };
    const jp = m.groupSettings.filter((g) => g.kind === "job");
    const jpState = jp.some((g) => g.settings === "differs") ? "bad" : jp.some((g) => g.settings === "unread") ? "warn" : "ok";
    const dr = m.roleSettings.filter((r) => r.path === "direct");
    const drT0 = dr.filter((r) => r.tier === "Tier0" && r.status === "differs").length;
    const drState = drT0 ? "bad" : dr.some((r) => r.status === "differs") ? "warn" : dr.some((r) => r.status === "unread") ? "warn" : "ok";
    const linkState = m.matrix.counts.missing + m.matrix.counts.wrong ? "bad" : m.matrix.counts.extra ? "warn" : "ok";
    const emptyAp = m.approvers.some((a) => a.read && a.count === 0);
    const box = (x, y, w, h, kind, lines) => {
      const [fill, stroke] = C[kind];
      const t = lines.map((l, i) => `<text x="${x + w / 2}" y="${y + 22 + i * 17}" text-anchor="middle" font-size="${i === 0 ? 13 : 12}" font-weight="${i === 0 ? 700 : 400}" fill="#18202b">${esc(l)}</text>`).join("");
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${t}`;
    };
    const arrow = (x1, y1, x2, y2, label) => `<path d="M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="#5b6b7f" stroke-width="1.5" marker-end="url(#a)"/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" font-size="11" fill="#5b6b7f">${esc(label)}</text>` : ""}`;
    const W = 980, H = 330;
    const people = m.people.total;
    const s = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">`,
      `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#5b6b7f"/></marker></defs>`,
      `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
      `<text x="250" y="24" font-size="12" font-weight="700" fill="#5b6b7f">JOB PATH · people eligible · group active in the roles</text>`,
      `<text x="250" y="184" font-size="12" font-weight="700" fill="#5b6b7f">DIRECT PATH · people active · group eligible for each role</text>`,
      box(16, 120, 170, 70, people ? "ok" : "bad", ["Admin accounts", `${people} in the model`]),
      box(250, 40, 210, 80, "obj", ["Job groups", `${m.counts.jobGroups} holding roles`]),
      box(500, 40, 220, 80, jpState, ["Group policy = the gate", jpState === "ok" ? "as the template says" : jpState === "bad" ? "differs from the template" : "not read for every group"]),
      box(760, 40, 200, 80, linkState, ["Roles held ACTIVE", `${m.matrix.counts.active} assignments`, `${m.matrix.counts.auScoped} at AU scope`]),
      box(250, 200, 210, 80, "obj", ["Direct groups", `${m.counts.directGroups} holding roles`]),
      box(500, 200, 220, 80, linkState, ["Roles ELIGIBLE", `${m.matrix.counts.eligible} eligibilities`]),
      box(760, 200, 200, 80, drState, ["Role policy = the gate", drT0 ? `${drT0} Tier 0 differ` : drState === "ok" ? "as the template says" : "differs or not read", emptyAp ? "approver group empty" : ""].filter(Boolean)),
      arrow(186, 145, 250, 80, "eligible member"), arrow(460, 80, 500, 80), arrow(720, 80, 760, 80),
      arrow(186, 165, 250, 240, "active member"), arrow(460, 240, 500, 240), arrow(720, 240, 760, 240),
      `<text x="16" y="${H - 14}" font-size="11" fill="#5b6b7f">green: as designed · amber: depends on something missing · red: not as the framework says</text>`,
      `</svg>`,
    ];
    return s.join("");
  }
  const b64 = (str) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, "utf8").toString("base64"));
  const flowDataUri = (m) => `data:image/svg+xml;base64,${b64(flowSvg(m))}`;

  // ---- render (screen) ---------------------------------------------------
  const TOOL_NAME = { toolPimDeploy: "⤒ Deploy", toolPimBaseline: "🧬 Baseline", toolPimRoles: "👤 Roles", toolCaGroups: "👥 PIM groups" };
  const VERDICT = { match: ["ok", "match"], extra: ["warn", "extra"], wrong: ["bad", "wrong type"], missing: ["bad", "missing"], scoped: ["warn", "scoped"] };
  function render(m, st) {
    st = st || {};
    const tab = st.tab || "findings";
    const q = String(st.q || "").toLowerCase();
    const hit = (s) => !q || String(s).toLowerCase().includes(q);
    const tiles = `<div class="prp-tiles">${m.tiles.map((t) => `<div class="prp-tile prp-${t.state}"><span class="k">${esc(t.label)}</span><span class="v">${esc(t.value)}</span><span class="d">${esc(t.detail)}</span></div>`).join("")}</div>`;
    let body = "";
    if (tab === "findings") {
      body = m.findings.length ? m.findings.filter((x) => hit(x.title + " " + x.detail)).map((x) => `<div class="prp-find"><span class="prp-sev prp-sev-${x.sev}">${SEV[x.sev].label}</span><div><b>${esc(x.title)}</b><p class="mini">${esc(x.detail)}</p><p class="mini"><b>Impact:</b> ${esc(x.impact)} <b>Way back:</b> ${esc(x.recovery)}${x.fix ? ` <button class="btn sm" data-prpopen="${esc(x.fix)}">${esc(TOOL_NAME[x.fix] || "Open")} →</button>` : ""}</p></div></div>`).join("") : `<p class="mini" style="padding:12px 0">No findings — the tenant carries the framework as the catalog says.</p>`;
    } else if (tab === "matrix") {
      const groups = m.matrix.groups.filter((g) => !st.kind || st.kind === "all" || (m.groups.find((x) => x.name === g) || {}).kind === st.kind);
      const roles = m.matrix.roles.filter((r) => hit(r.role) || m.matrix.cells.some((c) => c.role === r.role && groups.includes(c.group) && hit(c.group)));
      const cell = (r, g) => { const cs = m.matrix.cells.filter((c) => c.role === r && c.group === g); if (!cs.length) return "<td></td>"; return `<td class="prp-c">${cs.map((c) => `<span class="prp-cell prp-${VERDICT[c.verdict][0]}" title="${esc(`${c.group} · ${c.role} · ${c.how}${c.scope !== "tenant" ? ` at ${c.scope}` : ""} · ${VERDICT[c.verdict][1]}`)}">${c.how === "active" ? "A" : "E"}${c.scope !== "tenant" ? "·AU" : ""}${c.verdict === "match" ? "" : c.verdict === "missing" ? "?" : "!"}</span>`).join("")}</td>`; };
      const kinds = [["all", "All groups"], ["job", "Job"], ["direct", "Direct"]];
      body = `<div class="prp-sub">${kinds.map(([k, l]) => `<button class="fchip${(st.kind || "all") === k ? " active" : ""}" data-prpkind="${k}">${esc(l)}</button>`).join("")}<span class="mini muted">A = the group holds the role active (job path) · E = the group is eligible (direct path) · ·AU = at an administrative unit · ! extra or wrong type · ? missing</span></div>`
        + `<div class="prp-tw"><table class="prp-matrix"><thead><tr><th>Role</th><th>Tier</th>${groups.map((g) => `<th class="prp-gh"><span>${esc(g.replace(/^PIM-SG-/, ""))}</span></th>`).join("")}</tr></thead><tbody>${roles.map((r) => `<tr><td>${esc(r.role)}</td><td>${esc(r.tier || "—")}</td>${groups.map((g) => cell(r.role, g)).join("")}</tr>`).join("")}</tbody></table></div>`;
    } else if (tab === "settings") {
      const gs = m.groupSettings.filter((g) => hit(g.group));
      const rs = m.roleSettings.filter((r) => hit(r.role));
      const pill = (s) => `<span class="prp-pill prp-${s === "match" ? "ok" : s === "differs" ? "bad" : "warn"}">${esc(s === "match" ? "match" : s === "differs" ? "differs" : s === "missing" ? "missing" : "not read")}</span>`;
      body = `<h4 class="prp-h">Group member policies <span class="mini muted">the gate on the job path</span></h4><div class="prp-tw"><table><thead><tr><th>Group</th><th>Path</th><th>Template</th><th>Differences (tenant → framework)</th><th>Verdict</th></tr></thead><tbody>${gs.map((g) => `<tr><td class="mono">${esc(g.group)}</td><td>${esc(g.kind)}</td><td>${esc(g.template || "—")}</td><td>${esc(g.diffs.map((d) => `${d.label}: ${d.tenant} → ${d.baseline}`).join("; ") || "—")}</td><td>${pill(g.settings)}</td></tr>`).join("")}</tbody></table></div>`
        + `<h4 class="prp-h">Role policies <span class="mini muted">the gate on the direct path</span></h4><div class="prp-tw"><table><thead><tr><th>Role</th><th>Tier</th><th>Path</th><th>Framework</th><th>Tenant</th><th>Verdict</th></tr></thead><tbody>${rs.map((r) => `<tr><td>${esc(r.role)}</td><td>${esc(r.tier)}</td><td>${esc(r.path)}</td><td>${esc(brief(r.expected))}</td><td>${esc(r.got ? brief(r.got) : "not read")}</td><td>${pill(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
    } else if (tab === "people") {
      const gs = m.groups.filter((g) => g.present && hit(g.name));
      body = `<p class="mini">${m.people.total} account${m.people.total === 1 ? "" : "s"} in the model${m.people.unread.length ? ` · members of ${m.people.unread.length} group${m.people.unread.length === 1 ? "" : "s"} could not be read` : ""}. Approver groups: ${m.approvers.map((a) => `${a.name} ${a.present ? (a.read ? a.count : "?") : "missing"}`).join(" · ") || "none"}.</p><div class="prp-tw"><table><thead><tr><th>Group</th><th>Kind</th><th>Active members</th><th>Eligible members</th></tr></thead><tbody>${gs.map((g) => `<tr><td class="mono">${esc(g.name)}</td><td>${esc(g.kind)}</td><td>${g.membersRead ? (g.active.length ? esc(g.active.map((x) => x.name || x.displayName || x.id).join(", ")) : "0") : "not read"}</td><td>${g.membersRead ? (g.eligible.length ? esc(g.eligible.map((x) => x.name || x.displayName || x.id).join(", ")) : "0") : "not read"}</td></tr>`).join("")}</tbody></table></div>`;
    } else if (tab === "outside") {
      const open = st.open || new Set(), ug = st.ug || {}, ca = st.ca || null;
      body = m.outside.length ? `<div class="prp-tw"><table><thead><tr><th>Principal</th><th>Kind</th><th>Holds</th><th class="prp-tagc">Tags</th></tr></thead><tbody>${m.outside.filter((o) => hit(o.name)).map((o) => { const isU = o.type === "User", op = isU && open.has(o.id); return `<tr><td>${esc(o.name)}${isU ? `<div><button class="prp-ugbtn" type="button" data-prpug="${esc(o.id)}" aria-expanded="${op}">${op ? "▾" : "▸"} Groups</button></div>` : ""}</td><td>${esc(o.type === "ServicePrincipal" ? "app" : o.type.toLowerCase())}</td><td>${esc(o.holds.map((h) => `${h.role} (${h.how}${h.scope !== "tenant" ? `, ${h.scope}` : ""}${h.permanent ? ", permanent" : ""})`).join("; "))}</td><td class="prp-tagc">${o.protected ? `<span class="prp-pill prp-ok">break-glass</span>` : ""}</td></tr>${op ? `<tr class="prp-ug"><td colspan="4">${holderGroupsHtml(holderGroups(m, o, ug[o.id], ca), { id: o.id })}</td></tr>` : ""}`; }).join("")}</tbody></table></div>` : `<p class="mini" style="padding:12px 0">Nobody holds a role outside the framework groups.</p>`;
    }
    return `${tiles}<div class="prp-body">${body}</div>`;
  }
  // The tab strip, for the toolbar's chip slot.
  const tabs = (m) => [["findings", `⚠ Findings${m ? ` (${m.findings.length})` : ""}`], ["matrix", "🔗 Roles × groups"], ["settings", "⚙ Settings"], ["people", `👤 People${m ? ` (${m.people.total})` : ""}`], ["outside", `🚪 Outside PIM${m ? ` (${m.outside.length})` : ""}`]];

  // ---- Markdown export ----------------------------------------------------
  function toMd(m, meta) {
    meta = meta || {};
    const L = [];
    const when = m.readAt ? new Date(m.readAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "";
    L.push(`# 📋 PimBuddy PIM report — ${m.tenant || "tenant"}`, "");
    L.push(`*Roles vs groups and settings, compared with the ${m.catalog.label} ${m.catalog.release}*`, "");
    L.push(`${m.demo ? "Demo data · " : ""}Read ${when}${m.tenantId ? ` · tenant ${m.tenantId}` : ""} · catalog revised ${m.catalog.revised}${m.profile ? ` · profile ${m.profile}` : ""}${meta.build ? ` · ENCA build ${meta.build}` : ""}`, "");
    L.push("## Summary", "", "| Area | Result | Detail |", "|---|---|---|");
    m.tiles.forEach((t) => L.push(`| ${mdc(t.label)} | ${t.state === "ok" ? "✅" : t.state === "bad" ? "❌" : "⚠️"} ${mdc(t.value)} | ${mdc(t.detail)} |`));
    L.push("", "## How access flows", "", `![The two paths of the framework and the state of each step in this tenant](${flowDataUri(m)})`, "");
    L.push("On the **job path** people are eligible members of the group and the group holds its roles active — the group's member policy is the gate. On the **direct path** people are active members and the group is eligible for each role — the role's policy is the gate.", "");
    L.push("## Findings", "");
    if (!m.findings.length) L.push("No findings — the tenant carries the framework as the catalog says.", "");
    m.findings.forEach((x, i) => {
      L.push(`### ${i + 1}. ${x.title} — ${SEV[x.sev].label}`, "", x.detail, "", `- **Impact:** ${x.impact}`, `- **Way back:** ${x.recovery}`);
      if (x.fix) L.push(`- **Where:** ${TOOL_NAME[x.fix] || x.fix}`);
      L.push("");
    });
    L.push("## Roles vs groups", "", "A = the group holds the role active (job path) · E = the group is eligible (direct path) · ·AU = at an administrative unit. Only cells that differ from the catalog carry a word.", "");
    const byGroup = new Map();
    m.matrix.cells.forEach((c) => { (byGroup.get(c.group) || byGroup.set(c.group, []).get(c.group)).push(c); });
    L.push("| Group | Kind | Roles | Differs |", "|---|---|---|---|");
    m.matrix.groups.forEach((g) => {
      const cs = byGroup.get(g) || []; const k = (m.groups.find((x) => x.name === g) || {}).kind || "";
      const roles = cs.filter((c) => c.verdict !== "missing").map((c) => `${c.role} ${c.how === "active" ? "A" : "E"}${c.scope !== "tenant" ? ` (${c.scope})` : ""}`);
      const off = cs.filter((c) => c.verdict !== "match").map((c) => `${c.role}: ${VERDICT[c.verdict][1]}`);
      L.push(`| ${mdc(g)} | ${k} | ${mdc(roles.join(", "))} | ${mdc(off.join("; ") || "—")} |`);
    });
    L.push("", "## Settings", "", "### Group member policies — the gate on the job path", "", "| Group | Path | Template | Differences (tenant → framework) | Verdict |", "|---|---|---|---|---|");
    m.groupSettings.forEach((g) => L.push(`| ${mdc(g.group)} | ${g.kind} | ${g.template || "—"} | ${mdc(g.diffs.map((d) => `${d.label}: ${d.tenant} → ${d.baseline}`).join("; ") || "—")} | ${g.settings === "match" ? "✅ match" : g.settings === "differs" ? "❌ differs" : "not read"} |`));
    L.push("", "### Role policies — the gate on the direct path", "", "| Role | Tier | Path | Framework | Tenant | Verdict |", "|---|---|---|---|---|---|");
    m.roleSettings.forEach((r) => L.push(`| ${mdc(r.role)} | ${r.tier} | ${r.path} | ${mdc(brief(r.expected))} | ${mdc(r.got ? brief(r.got) : "not read")} | ${r.status === "match" ? "✅ match" : r.status === "differs" ? "❌ differs" : r.status} |`));
    L.push("", "## People", "", `${m.people.total} account${m.people.total === 1 ? "" : "s"} in the model. Approver groups: ${m.approvers.map((a) => `${a.name} ${a.present ? (a.read ? `${a.count} member${a.count === 1 ? "" : "s"}` : "not read") : "missing"}`).join(" · ") || "none"}.`, "");
    L.push("| Group | Kind | Active members | Eligible members |", "|---|---|---|---|");
    m.groups.filter((g) => g.present).forEach((g) => L.push(`| ${mdc(g.name)} | ${g.kind} | ${g.membersRead ? mdc(g.active.map((x) => x.name || x.displayName || x.id).join(", ") || "0") : "not read"} | ${g.membersRead ? mdc(g.eligible.map((x) => x.name || x.displayName || x.id).join(", ") || "0") : "not read"} |`));
    L.push("", "## Standing access outside PIM", "");
    if (!m.outside.length) L.push("Nobody holds a role outside the framework groups.");
    else { L.push("| Principal | Kind | Holds |", "|---|---|---|"); m.outside.forEach((o) => L.push(`| ${mdc(o.name)}${o.protected ? " (break-glass)" : ""} | ${o.type === "ServicePrincipal" ? "app" : o.type.toLowerCase()} | ${mdc(o.holds.map((h) => `${h.role} (${h.how}${h.scope !== "tenant" ? `, ${h.scope}` : ""}${h.permanent ? ", permanent" : ""})`).join("; "))} |`)); }
    L.push("", "## What was read", "", `Sources: ${Object.entries(m.sources || {}).map(([k, v]) => `${k} ${v}`).join(" · ")}. Read-only — this report changes nothing. Comparison through PimBaseline.profile() and compare(), the same as 🧬 Baseline.`);
    return L.join("\n") + "\n";
  }
  function toCsv(m) {
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const rows = [["Role", "Tier", "Group", "Group kind", "How", "Scope", "Ends", "Verdict"].map(q).join(",")];
    m.matrix.cells.forEach((c) => rows.push([c.role, (m.matrix.roles.find((r) => r.role === c.role) || {}).tier || "", c.group, c.kind, c.how, c.scope, c.end || "", VERDICT[c.verdict][1]].map(q).join(",")));
    return rows.join("\r\n") + "\r\n";
  }

  // ---- a holder's groups (🚪 Outside PIM → Groups) ------------------------
  // Two sources, kept apart because they answer different questions.
  //   PIM groups  from the report's own member read (active AND eligible —
  //               an eligible member is NOT in memberOf until she activates,
  //               so memberOf alone would hide exactly the PIM path)
  //   nested      from memberOf: the user's direct groups, then each group's
  //               parents, breadth first, capped at NEST_CAP group reads. Every
  //               group reached keeps the path that reached it first (the
  //               shortest).
  // A role-assignable group cannot have a group as a member, so a nested path
  // INTO one is never real; nestPaths drops it and counts it (a read problem,
  // not a finding).
  const NEST_CAP = 40;
  function pimGroupsOf(m, id) {
    const out = [];
    (m.groups || []).filter((g) => g.present).forEach((g) => {
      const a = (g.active || []).some((x) => (x.id || x.principalId) === id);
      const e = (g.eligible || []).some((x) => (x.id || x.principalId) === id);
      if (!a && !e) return;
      const roles = (m.matrix.cells || []).filter((c) => c.group === g.name && c.verdict !== "missing").map((c) => `${c.role} (${c.how}${c.scope !== "tenant" ? `, ${c.scope}` : ""})`);
      out.push({ name: g.name, kind: g.kind, how: a ? "active" : "eligible", roles: [...new Set(roles)], carries: g.carries || [] });
    });
    return out.sort((x, y) => x.name.localeCompare(y.name));
  }
  // direct:  [{ id, displayName, isAssignableToRole }]  the user's memberOf
  // parents: { [groupId]: [{ id, displayName, isAssignableToRole }] | null }
  //          null = that group's parents were not read (cap or error)
  function nestPaths(userName, direct, parents) {
    const reached = new Map(); let impossible = 0, unread = 0;
    const q = [];
    (direct || []).forEach((g) => { if (g && g.id && !reached.has(g.id)) { reached.set(g.id, { id: g.id, name: g.displayName || g.id, roleAssignable: !!g.isAssignableToRole, depth: 1, path: [userName, g.displayName || g.id] }); q.push(g.id); } });
    while (q.length) {
      const id = q.shift(), from = reached.get(id);
      const ps = parents ? parents[id] : undefined;
      if (ps === null || ps === undefined) { if (ps === null) unread++; continue; }
      ps.forEach((p) => {
        if (!p || !p.id || reached.has(p.id)) return;
        if (p.isAssignableToRole) { impossible++; return; }
        reached.set(p.id, { id: p.id, name: p.displayName || p.id, roleAssignable: false, depth: from.depth + 1, path: [...from.path, p.displayName || p.id] });
        q.push(p.id);
      });
    }
    return { groups: [...reached.values()].sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name)), impossible, unread };
  }
  // ca: { [groupId]: { inc, exc, excOn } } from the loaded CA policies, or null
  // when no policies are loaded in this session.
  function holderGroups(m, o, read, ca) {
    const pim = pimGroupsOf(m, o.id);
    if (!read || read.err || read.busy) return { pim, read: read || null };
    const n = nestPaths(o.name, read.direct, read.parents);
    const pimNames = new Set(pim.map((g) => g.name));
    const matters = (g) => /^PIM-SG-/.test(g.name) || g.roleAssignable || (ca && ca[g.id] && (ca[g.id].inc || ca[g.id].exc)) || (g.depth === 1 && n.groups.some((x) => x.depth > 1 && x.path[1] === g.name && /^PIM-SG-/.test(x.name)));
    const rows = n.groups.filter((g) => !pimNames.has(g.name) || g.depth > 1).map((g) => Object.assign({}, g, { ca: ca ? ca[g.id] || { inc: 0, exc: 0, excOn: 0 } : null }));
    const shown = rows.filter(matters), hidden = rows.length - shown.length;
    return { pim, nested: n, shown, all: rows, hidden, ca: !!ca, read };
  }
  function holderGroupsHtml(h, opts) {
    opts = opts || {};
    const how = (g) => g.depth === 1 ? "Direct" : `<span class="prp-path">${g.path.map(esc).join(" → ")}</span><span class="prp-nest">nested, ${g.depth} levels</span>`;
    const caTxt = (g) => {
      if (/^PIM-SG-/.test(g.name)) return g.depth > 1 ? "Framework group, reached through another group" : "Framework group the report did not read as hers";
      if (!g.ca) return g.roleAssignable ? "Role-assignable" : "—";
      const bits = [];
      if (g.ca.inc) bits.push(`Included by ${g.ca.inc} CA polic${g.ca.inc === 1 ? "y" : "ies"}`);
      if (g.ca.exc) bits.push(`<span class="${g.ca.excOn ? "prp-bad-txt" : ""}">Excluded from ${g.ca.exc}${g.ca.excOn ? ` (${g.ca.excOn} enforced)` : ""}</span>`);
      return bits.join(" · ") || (g.roleAssignable ? "Role-assignable" : "Carries her into a PIM group");
    };
    let s = `<div class="prp-ug-in"><h5>PIM groups · ${h.pim.length}</h5>`;
    s += h.pim.length ? `<table><thead><tr><th>Group</th><th>Membership</th><th>What it gives</th></tr></thead><tbody>${h.pim.map((g) => `<tr><td class="prp-nw">${esc(g.name)}</td><td class="prp-nw">${g.how === "active" ? "active member" : "eligible member · JIT"}</td><td>${esc(g.roles.join("; ") || (g.carries.length ? g.carries.join(", ") : "nothing read"))}</td></tr>`).join("")}</tbody></table>` : `<p class="mini">Not an active or eligible member of any framework group.</p>`;
    const r = h.read;
    if (!r) s += `<p class="mini"><button class="btn sm" type="button" data-prpugread="${esc(opts.id || "")}">Read her other groups and nested paths</button></p>`;
    else if (r.busy) s += `<p class="mini">Reading memberOf and the parents of each group…</p>`;
    else if (r.err) s += `<p class="mini prp-bad-txt">Could not read memberOf — ${esc(r.err)} <button class="btn sm" type="button" data-prpugread="${esc(opts.id || "")}">Try again</button></p>`;
    else {
      s += `<h5>Other groups that matter${h.ca ? " to CA" : ""} · ${h.shown.length}</h5>`;
      s += h.shown.length ? `<table><thead><tr><th>Group</th><th>How she is in it</th><th>What it does</th></tr></thead><tbody>${h.shown.map((g) => `<tr${g.depth > 1 ? ` class="prp-nested"` : ""}><td class="prp-nw">${esc(g.name)}</td><td>${how(g)}</td><td>${caTxt(g)}</td></tr>`).join("")}</tbody></table>` : `<p class="mini">None.</p>`;
      const notes = [];
      if (h.hidden) notes.push(`${h.hidden} more group${h.hidden === 1 ? "" : "s"} with no PIM or CA role`);
      if (!h.ca) notes.push("CA policies are not loaded in this session, so include and exclude counts are not shown — open 🗂 Policies once to add them");
      if (h.nested.unread) notes.push(`parents of ${h.nested.unread} group${h.nested.unread === 1 ? "" : "s"} not read (cap ${NEST_CAP})`);
      if (h.nested.impossible) notes.push(`${h.nested.impossible} nested route${h.nested.impossible === 1 ? "" : "s"} into a role-assignable group ignored — such a group cannot hold groups, so the read is wrong`);
      if (notes.length) s += `<p class="mini muted">${notes.map(esc).join(" · ")}</p>`;
    }
    return s + "</div>";
  }

  return { build, render, tabs, toMd, toCsv, flowSvg, flowDataUri, brief, human, SEV, VERDICT, pimGroupsOf, nestPaths, holderGroups, holderGroupsHtml, NEST_CAP };
})();
if (typeof module !== "undefined") module.exports = PimReport;
