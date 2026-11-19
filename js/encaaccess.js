// ======================================================================
// 🔐 ENCA access (T62, beta 33308, R94) — the two PIM groups for the people
// who use ENCA's Workspace 01 · Conditional Access. Pure: no DOM, no Graph.
//
// Mihai, 11–19 Nov 2026: "need a pim design for user who wants to use enca",
// then "focus … workplace 01 only", "bring this down to 2 groups", and "create
// a tool in ENCA to create the PIM groups … the reader and Operator" — on the
// mockup: build it as shown, ALSO offer the activation settings, and "there
// should be a description why which role". Design: claude/ENCA-pim-for-enca-
// roles.md (v3).
//
//   PIM-SG-ENCA-CA-Read   everyone who uses ENCA — Global Reader + Security
//                         Reader, ACTIVE (reads only, so they can stay on)
//   PIM-SG-ENCA-CA-Admin  CA engineers — Conditional Access Administrator,
//                         ENCA CA Group Operator (custom; tenant-wide and at
//                         every CA-RMAU-* unit) and Authentication Policy
//                         Administrator, ELIGIBLE: the person activates the
//                         ROLE the task needs (fast activation, framework 5.0)
//
// Both groups are role-assignable with ACTIVE, DIRECT members (a role-
// assignable group holds no nested group). Tier 0 is in neither: creating the
// CA-RMAU-* units, moving members of a role-assignable group and creating a
// Microsoft service principal stay with the tenant's Tier 0 admin.
//
// THE ACTIVATION SETTINGS BELONG TO THE ROLE, NOT THE GROUP: changing them
// changes them for everyone eligible for that role in the tenant. So they are
// an explicit tick, off by default, rule by rule, only the two rules this
// design governs (duration; MFA + justification) — plus, ticked, permanent
// eligibility so the Admin group's eligibilities need no renewal. Every rule
// PATCHed keeps its `before` (PimPlan.backup → ↩ Put back).
//
// Nothing here removes what already exists: an assignment held another way
// (active where the design says eligible) is reported, never taken away.
//
//   catalog()                 the design: groups, roles with WHY, custom role
//   compare(raw)              the read → rows with verdicts
//   plan(raw, opts)           ops for PimPlan (preview / ▶ Apply in app.js)
//   undoPlan(plan, res)       what the run made, taken back in reverse order
//   render(res, opts)         the screen; toMd(res) the report
// ======================================================================
const EncaAccess = (() => {
  const V1 = "https://graph.microsoft.com/v1.0";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (s) => String(s || "").toLowerCase();
  const G_W = ["Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory"];
  const R_W = ["RoleManagement.ReadWrite.Directory"];
  const P_W = ["RoleManagementPolicy.ReadWrite.Directory"];
  const APP_W = ["Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All"];
  const READ_SCOPES = ["RoleManagement.Read.Directory", "RoleManagementPolicy.Read.Directory", "AdministrativeUnit.Read.All", "Application.Read.All"];
  const GA = "62e90394-69f5-4237-9190-012177145e10", PRA = "e8611ab8-c189-46e8-94e1-60213ab1f814";
  const RMAU_PREFIX = "CA-RMAU-";
  const DEFAULT_APP_ROLE = "00000000-0000-0000-0000-000000000000";

  const GROUPS = [
    { key: "read", name: "PIM-SG-ENCA-CA-Read", who: "everyone who uses ENCA",
      why: "Always on. Everybody who opens ENCA's Conditional Access workspace reads all day; the two roles behind this group can read everything and change nothing.",
      description: "ENCA Workspace 01 · Conditional Access: readers. Global Reader + Security Reader, active. Direct members only." },
    { key: "admin", name: "PIM-SG-ENCA-CA-Admin", who: "CA engineers, rollout people",
      why: "Active members, eligible roles. A member activates only the role the task needs — editing a policy activates Conditional Access Administrator and nothing else — so nobody holds write access standing.",
      description: "ENCA Workspace 01 · Conditional Access: writers. Conditional Access Administrator, ENCA CA Group Operator and Authentication Policy Administrator, eligible — activate the role, not the group. Direct members only." },
  ];
  const CUSTOM = {
    name: "ENCA CA Group Operator",
    description: "ENCA Workspace 01: create Conditional Access groups and manage their members and dynamic rules. No delete. Assigned tenant-wide and at every CA-RMAU-* restricted unit.",
    actions: ["microsoft.directory/groups/create", "microsoft.directory/groups/members/update", "microsoft.directory/groups/basic/update",
      "microsoft.directory/groups/dynamicMembershipRule/update", "microsoft.directory/groups/standard/read", "microsoft.directory/groups/members/read"],
  };
  // How each role is held, and why — shown on the screen, in the preview and
  // in the report (Mihai: "there should be a description why which role").
  const ROLES = [
    { key: "gr", group: "read", name: "Global Reader", templateId: "f2ef992c-3afb-46b9-b7cf-a126ee74c451", how: "active",
      why: "Every read in Workspace 01: Policies, Gap analyse, Checks, Baseline compare, What-If, Who is…, Change audit and the sign-in log. It can read every setting in the tenant and change none of them, so it can stay on." },
    { key: "sr", group: "read", name: "Security Reader", templateId: "5d6b6bb7-de71-4623-b4af-96380a352509", how: "active",
      why: "Defender hunting as the sign-in source — the sign-in window, Session controls, Report-only impact. Global Reader does not reach Advanced Hunting in every tenant (Defender unified RBAC); Security Reader does, and it is read-only too." },
    { key: "caa", group: "admin", name: "Conditional Access Administrator", templateId: "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", how: "eligible", duration: "PT4H",
      why: "Every Conditional Access write: create, edit, switch and delete policies; Import, Baseline import, the Builder, MS Learn apply; named locations, authentication contexts and strengths. Conditional Access cannot go into a custom role, so this built-in role it is." },
    { key: "op", group: "admin", custom: true, name: CUSTOM.name, how: "eligible", duration: "PT4H", rmau: true,
      why: "👥 CA groups: create exclusion and deploy groups, add and remove members, the Teams devices dynamic rule. Custom on purpose: it cannot delete a group, and assigned at each CA-RMAU-* unit it is the only role below Tier 0 that can edit the protected exclusion groups — tenant-wide Groups Administrator cannot touch a group in a restricted unit." },
    { key: "apa", group: "admin", name: "Authentication Policy Administrator", templateId: "0526716b-113d-4c15-b2c8-68e3c22b9f80", how: "eligible", duration: "PT2H",
      why: "Checks → Passkeys (the FIDO2 method) and the authentication-method decisions behind them. Rarely needed, so a shorter activation." },
  ];
  const SETTINGS = { requirement: ["Justification", "MultiFactorAuthentication"] };
  const catalog = () => ({ groups: GROUPS, roles: ROLES, custom: CUSTOM, settings: SETTINGS });

  // ---- the read ------------------------------------------------------------
  // raw: { groups: [{ id, displayName, isAssignableToRole, securityEnabled,
  //   groupTypes, createdDateTime }], roleDefs: [{ id, displayName, templateId,
  //   isBuiltIn, rolePermissions }], active: [{ principalId, roleDefinitionId,
  //   directoryScopeId, assignmentType, endDateTime }], eligible: [same],
  //   aus: [{ id, displayName, isMemberManagementRestricted }],
  //   policies: { [roleDefinitionId]: { id, rules } }, members: { [groupId]:
  //   [{ id, displayName, userPrincipalName }] }, me: { id, upn, canWrite,
  //   via }, sp: { id, appId, appRoleAssignmentRequired, assignedTo: [ids] } |
  //   null, skus: { p1, p2 } }
  function roleIdOf(raw, r) {
    if (!r.custom) { const d = (raw.roleDefs || []).find((x) => x.templateId === r.templateId || x.id === r.templateId); return d ? d.id : r.templateId; }
    const l = (raw.roleDefs || []).filter((x) => !x.isBuiltIn && lc(x.displayName) === lc(r.name));
    return l.length === 1 ? l[0].id : null;
  }
  const scopeOf = (a) => a.directoryScopeId || "/";
  function units(raw) {
    return (raw.aus || []).filter((u) => String(u.displayName || "").toUpperCase().startsWith(RMAU_PREFIX)).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }
  function compare(raw) {
    const R = raw || {};
    const rows = [], problems = [];
    const gOf = {};
    GROUPS.forEach((g) => {
      const l = (R.groups || []).filter((x) => lc(x.displayName) === lc(g.name));
      const row = { kind: "group", key: `group:${g.key}`, group: g.key, name: g.name, why: g.why, how: "role-assignable security group, assigned membership, direct members", id: null, status: "create", detail: "" };
      if (l.length > 1) { row.status = "conflict"; row.detail = `exists ${l.length} times (${l.map((x) => x.id).join(", ")}) — keep one by hand, then read again`; problems.push(`${g.name} exists ${l.length} times`); }
      else if (l.length === 1) {
        row.id = l[0].id;
        if (l[0].isAssignableToRole === false) { row.status = "conflict"; row.detail = "exists but is NOT role-assignable — that flag is set at creation only; rename it away and read again"; problems.push(`${g.name} is not role-assignable`); }
        else if ((l[0].groupTypes || []).includes("DynamicMembership")) { row.status = "conflict"; row.detail = "is a dynamic group — PIM and role assignment need an assigned group"; problems.push(`${g.name} is dynamic`); }
        else { row.status = "ok"; row.detail = l[0].createdDateTime ? `created ${String(l[0].createdDateTime).slice(0, 10)}` : ""; }
      }
      gOf[g.key] = row;
      rows.push(row);
      ROLES.filter((r) => r.group === g.key).forEach((r) => {
        const rid = roleIdOf(R, r);
        if (r.custom) {
          const defs = (R.roleDefs || []).filter((x) => !x.isBuiltIn && lc(x.displayName) === lc(r.name));
          const d = { kind: "roleDef", key: "roledef", name: r.name, why: "One definition, six permissions on groups, no delete — " + CUSTOM.actions.map((a) => a.replace("microsoft.directory/", "")).join(" · "), how: "custom role definition", status: "create", detail: "", id: null };
          if (defs.length > 1) { d.status = "conflict"; d.detail = `exists ${defs.length} times — keep one by hand`; problems.push(`${r.name} exists ${defs.length} times`); }
          else if (defs.length === 1) {
            d.id = defs[0].id;
            const have = new Set(((defs[0].rolePermissions || [])[0] || {}).allowedResourceActions || []);
            const miss = CUSTOM.actions.filter((a) => !have.has(a)), extra = [...have].filter((a) => !CUSTOM.actions.includes(a));
            d.status = miss.length || extra.length ? "differs" : "ok";
            d.detail = d.status === "ok" ? "six permissions, as designed" : `${miss.length ? `missing ${miss.map((a) => a.replace("microsoft.directory/", "")).join(", ")}` : ""}${miss.length && extra.length ? "; " : ""}${extra.length ? `also holds ${extra.map((a) => a.replace("microsoft.directory/", "")).join(", ")}` : ""} — changed by hand in Entra, this tool never edits a definition`;
          }
          rows.push(d);
        }
        const scopes = [{ scope: "/", label: "tenant" }].concat(r.rmau ? units(R).filter((u) => u.isMemberManagementRestricted).map((u) => ({ scope: `/administrativeUnits/${u.id}`, label: u.displayName })) : []);
        scopes.forEach((s) => {
          const row2 = { kind: "assignment", key: `${r.how === "active" ? "act" : "elig"}:${r.key}:${s.scope}`, group: g.key, role: r.key, name: `${r.name} → ${g.name.replace("PIM-SG-ENCA-CA-", "")}${s.scope === "/" ? "" : ` · ${s.label}`}`, roleName: r.name, scope: s.scope, scopeLabel: s.label, why: s.scope === "/" ? r.why : `The same role at ${s.label}'s scope: a group in this restricted unit can only be changed by a role scoped to the unit.`, how: r.how === "active" ? "active, no end date" : `eligible · activate for ${r.duration === "PT2H" ? "2" : "4"} hours`, status: "create", detail: "" };
          const gid = gOf[g.key].id;
          if (gid && rid) {
            const act = (R.active || []).some((a) => a.principalId === gid && a.roleDefinitionId === rid && scopeOf(a) === s.scope && a.assignmentType !== "Activated");
            const eli = (R.eligible || []).some((a) => a.principalId === gid && a.roleDefinitionId === rid && scopeOf(a) === s.scope);
            if (r.how === "active") { if (act) { row2.status = "ok"; } else if (eli) { row2.status = "differs"; row2.detail = "held ELIGIBLE — the design says active; Preview adds the active one, the eligible one is left as it is"; } }
            else if (eli) { row2.status = "ok"; if (act) row2.detail = "also held ACTIVE — that is standing write access; remove the active one by hand in PIM"; }
            else if (act) { row2.status = "differs"; row2.detail = "held ACTIVE today — Preview adds the eligible one; the active one is left, not removed (remove it by hand once the eligible one works)"; }
          }
          rows.push(row2);
        });
      });
    });
    const ru = units(R);
    const notRestricted = ru.filter((u) => !u.isMemberManagementRestricted).map((u) => u.displayName);
    const me = R.me || {};
    const settings = ROLES.filter((r) => r.how === "eligible").map((r) => {
      const rid = roleIdOf(R, r);
      const pol = rid ? (R.policies || {})[rid] : null;
      return { role: r, roleId: rid, policyId: pol && pol.id, rules: pol && pol.rules, now: pol ? describeRules(pol.rules) : null };
    });
    const counts = { ok: 0, create: 0, differs: 0, conflict: 0 };
    rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return { rows, counts, problems, units: ru, notRestricted, me, settings, sp: R.sp || null, members: R.members || {}, groupIds: { read: gOf.read.id, admin: gOf.admin.id }, skus: R.skus || {} };
  }

  // ---- activation settings ---------------------------------------------------
  const ruleOf = (rules, id) => (rules || []).find((r) => r && r.id === id) || null;
  function hours(iso) { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(String(iso || "")); return m ? (+(m[1] || 0) + (+(m[2] || 0)) / 60) : null; }
  function describeRules(rules) {
    const exp = ruleOf(rules, "Expiration_EndUser_Assignment"), en = ruleOf(rules, "Enablement_EndUser_Assignment");
    const ap = ruleOf(rules, "Approval_EndUser_Assignment"), ac = ruleOf(rules, "AuthenticationContext_EndUser_Assignment"), el = ruleOf(rules, "Expiration_Admin_Eligibility");
    const req = (en && en.enabledRules) || [];
    return { hours: exp ? hours(exp.maximumDuration) : null, mfa: req.includes("MultiFactorAuthentication"), justification: req.includes("Justification"),
      approval: !!(ap && ap.setting && ap.setting.isApprovalRequired), authContext: !!(ac && ac.isEnabled), permanentEligibility: el ? el.isExpirationRequired === false : null, eligibilityMax: el && el.isExpirationRequired !== false ? el.maximumDuration : null };
  }
  const nowText = (n) => n ? `${n.hours != null ? `${n.hours}h max` : "?"} · ${n.mfa ? "MFA" : n.authContext ? "auth context" : "no MFA"} · ${n.justification ? "justification" : "no justification"}${n.approval ? " · approval" : ""}${n.permanentEligibility === false ? ` · eligibility ends after ${n.eligibilityMax || "?"}` : ""}` : "not read";
  // The design's rules for one role: only these, nothing else touched. MFA is
  // left out where the role asks an authentication context instead — Entra
  // takes one or the other.
  function settingsChanges(rules, role) {
    const out = [];
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const set = (id, fn) => { const r = ruleOf(rules, id); if (!r) { out.push({ ruleId: id, missing: true }); return; } const a = clone(r); fn(a); if (JSON.stringify(a) !== JSON.stringify(r)) out.push({ ruleId: id, before: r, after: a }); };
    const ac = ruleOf(rules, "AuthenticationContext_EndUser_Assignment");
    const want = SETTINGS.requirement.filter((x) => !(x === "MultiFactorAuthentication" && ac && ac.isEnabled)).sort();
    set("Expiration_EndUser_Assignment", (r) => { r.isExpirationRequired = true; r.maximumDuration = role.duration || "PT4H"; });
    set("Enablement_EndUser_Assignment", (r) => { const cur = (r.enabledRules || []).slice().sort(); const keep = cur.filter((x) => !SETTINGS.requirement.includes(x)); const next = [...new Set([...keep, ...want])].sort(); if (next.join("|") !== cur.join("|")) r.enabledRules = next; });
    set("Expiration_Admin_Eligibility", (r) => { r.isExpirationRequired = false; });
    return out;
  }
  const ruleBody = (r) => { const b = {}; Object.keys(r || {}).forEach((k) => { if (!/@odata\.context$/.test(k) && k !== "@odata.etag") b[k] = r[k]; }); return b; };
  // The longest an assignment may run under the role's own rule, when it
  // cannot be permanent.
  function expiryFor(rules, ruleId, settingsOn) {
    const r = ruleOf(rules, ruleId);
    if (settingsOn && ruleId === "Expiration_Admin_Eligibility") return { type: "noExpiration" };
    if (!r || r.isExpirationRequired === false || !r.maximumDuration) return { type: "noExpiration" };
    return { type: "afterDuration", duration: r.maximumDuration };
  }

  // ---- the plan --------------------------------------------------------------
  // opts: { members: { read: [{ id, name }], admin: [...] }, settings: bool,
  //   lock: bool, PimPlan }
  function plan(raw, res, opts) {
    const PP = opts.PimPlan;
    const P = PP.newPlan({ tool: "ENCA access (T62)", design: "R94 v3" });
    const o = opts || {};
    if (res.problems.length) res.problems.forEach((p) => P.blocked.push(`${p} — fix it in Entra first; this tool never renames or deletes`));
    if (res.me && res.me.canWrite === false) P.blocked.push("You do not hold Privileged Role Administrator or Global Administrator ACTIVE — activate one, then read again (role-assignable groups, role assignments and the custom role all need it)");
    const ref = (k) => res.groupIds[k] || `{{group:${k}}}`;
    // groups
    GROUPS.forEach((g) => {
      if (res.groupIds[g.key]) return;
      PP.add(P, { key: `group:${g.key}`, method: "POST", url: `${V1}/groups`, produces: `group:${g.key}`, needs: G_W, section: "groups",
        summary: `create ${g.name} (role-assignable) — ${g.who}`,
        body: { displayName: g.name, mailEnabled: false, mailNickname: PP.mailNickname(g.name), securityEnabled: true, groupTypes: [], isAssignableToRole: true, description: g.description } });
    });
    // custom role definition
    const defRow = res.rows.find((r) => r.kind === "roleDef");
    const opRef = defRow && defRow.id ? defRow.id : "{{role:op}}";
    if (defRow && defRow.status === "create") PP.add(P, { key: "roledef", method: "POST", url: `${V1}/roleManagement/directory/roleDefinitions`, produces: "role:op", needs: R_W, section: "roles",
      summary: `create the custom role ${CUSTOM.name} (${CUSTOM.actions.length} group permissions, no delete)`,
      body: { displayName: CUSTOM.name, description: CUSTOM.description, isEnabled: true, rolePermissions: [{ allowedResourceActions: CUSTOM.actions }] } });
    // activation settings (ticked)
    const changed = new Set();
    if (o.settings) res.settings.forEach((s) => {
      if (!s.roleId || !s.policyId || !s.rules) { P.findings.push(`${s.role.name}: activation settings not set — ${s.role.custom && !s.roleId ? "the role is made in this run; read again after it and tick the settings once more" : "its PIM policy was not read"}`); return; }
      settingsChanges(s.rules, s.role).forEach((c) => {
        if (c.missing) { P.findings.push(`${s.role.name}: the policy has no rule ${c.ruleId} — left as it is`); return; }
        changed.add(s.role.key);
        PP.add(P, { key: `rpol:${s.role.key}:${c.ruleId}`, method: "PATCH", url: `${V1}/policies/roleManagementPolicies/${s.policyId}/rules/${c.ruleId}`, needs: P_W, section: "settings", before: ruleBody(c.before),
          summary: `${s.role.name}: ${c.ruleId === "Expiration_EndUser_Assignment" ? `activation at most ${(s.role.duration || "PT4H").replace("PT", "").toLowerCase()}` : c.ruleId === "Enablement_EndUser_Assignment" ? `activation asks ${(c.after.enabledRules || []).join(" + ")}` : "eligibility may be permanent"} — for EVERYONE eligible for this role`,
          body: ruleBody(c.after) });
      });
    });
    // assignments
    res.rows.filter((r) => r.kind === "assignment" && r.status !== "ok").forEach((r) => {
      const role = ROLES.find((x) => x.key === r.role);
      const rid = role.custom ? opRef : (roleIdOf(raw, role));
      const s = res.settings.find((x) => x.role.key === role.key);
      const active = role.how === "active";
      const pol = s ? s.rules : (raw.policies || {})[rid] && raw.policies[rid].rules;
      const exp = active ? expiryFor(pol, "Expiration_Admin_Assignment", false) : expiryFor(pol, "Expiration_Admin_Eligibility", o.settings && changed.has(role.key));
      if (exp.type !== "noExpiration") P.findings.push(`${r.name}: the role allows ${active ? "an active assignment" : "an eligibility"} for at most ${exp.duration} — given that; renew it before it ends${active ? "" : ", or tick the activation settings to allow permanent eligibility"}`);
      const requires = P.ops.filter((x) => x.key.startsWith(`rpol:${role.key}:`)).map((x) => x.key);
      PP.add(P, { requires, key: r.key, kind: "request", url: `${V1}/roleManagement/directory/${active ? "roleAssignmentScheduleRequests" : "roleEligibilityScheduleRequests"}`, needs: R_W, section: active ? "read" : "admin",
        summary: `${GROUPS.find((g) => g.key === r.group).name} ${active ? "ACTIVE in" : "ELIGIBLE for"} ${role.name}${r.scope === "/" ? "" : ` at ${r.scopeLabel}`}${exp.type === "noExpiration" ? "" : ` (${exp.duration})`}`,
        body: { action: "adminAssign", principalId: ref(r.group), roleDefinitionId: rid, directoryScopeId: r.scope, justification: `ENCA access (T62): ${role.name} ${active ? "active" : "eligible"} for ${GROUPS.find((g) => g.key === r.group).name}`, scheduleInfo: { expiration: exp } } });
    });
    // members
    ["read", "admin"].forEach((k) => {
      const have = new Set(((res.groupIds[k] && res.members[res.groupIds[k]]) || []).map((m) => m.id));
      (((o.members || {})[k]) || []).forEach((m) => {
        if (have.has(m.id)) return;
        PP.add(P, { key: `member:${k}:${m.id}`, method: "POST", url: `${V1}/groups/${ref(k)}/members/$ref`, needs: G_W, section: "people",
          summary: `add ${m.name} to ${GROUPS.find((g) => g.key === k).name} (active, direct)`, body: { "@odata.id": `${V1}/directoryObjects/${m.id}` }, member: m.id, group: k });
      });
    });
    // lock the ENCA app to the two groups (ticked)
    if (o.lock) {
      const sp = res.sp;
      const meIn = (k) => ((res.groupIds[k] && res.members[res.groupIds[k]]) || []).some((m) => m.id === res.me.id) || (((o.members || {})[k]) || []).some((m) => m.id === res.me.id);
      if (!sp || !sp.id) P.blocked.push("Lock ENCA: this tenant's ENCA service principal was not read — untick the lock or read again");
      else if (!(meIn("read") || meIn("admin"))) P.blocked.push("Lock ENCA: you are in neither group and would lock yourself out of ENCA — add yourself under People first");
      else {
        GROUPS.forEach((g) => {
          if ((sp.assignedTo || []).includes(res.groupIds[g.key])) return;
          PP.add(P, { key: `appassign:${g.key}`, method: "POST", url: `${V1}/servicePrincipals/${sp.id}/appRoleAssignedTo`, needs: APP_W, section: "lock", summary: `assign ${g.name} to ENCA (${sp.displayName || sp.appId})`,
            body: { principalId: ref(g.key), resourceId: sp.id, appRoleId: DEFAULT_APP_ROLE } });
        });
        if (!sp.appRoleAssignmentRequired) PP.add(P, { requires: P.ops.filter((x) => x.key.startsWith("appassign:")).map((x) => x.key), key: "applock", method: "PATCH", url: `${V1}/servicePrincipals/${sp.id}`, needs: APP_W, section: "lock",
          summary: "ENCA: assignment required ON — only the two groups can sign in", body: { appRoleAssignmentRequired: true }, before: { appRoleAssignmentRequired: false } });
      }
    }
    res.rows.filter((r) => r.kind === "assignment" && r.status === "ok" && r.detail).forEach((r) => P.findings.push(`${r.name}: ${r.detail}`));
    if (res.notRestricted.length) P.findings.push(`${res.notRestricted.join(", ")}: named CA-RMAU-* but not restricted — left out of the Group Operator scopes (a regular unit needs no scoped role)`);
    if (!res.units.some((u) => u.isMemberManagementRestricted)) P.findings.push("No restricted CA-RMAU-* unit was found — the Group Operator role is tenant-wide only. Create the units in 🔒 Protect exclusions (Tier 0), then read again here to add the scoped eligibilities");
    P.manual.push("Members: role-assignable groups take direct members only — add people here or in Entra, never a nested group");
    return P;
  }

  // ---- undo: what the run made, in reverse -----------------------------------
  function undoPlan(plan, res, PP) {
    const U = PP.newPlan({ tool: "ENCA access (T62)", undoOf: plan.meta && plan.meta.createdAt });
    const done = new Map((res.outcome || []).filter((r) => /^done/.test(r.status)).map((r) => [r.key, r]));
    const ids = res.ids || {};
    const rv = (v) => { try { return PP.resolve(v, ids); } catch { return null; } };
    [...plan.ops].reverse().forEach((op) => {
      const rec = done.get(op.key);
      if (!rec) return;
      if (op.kind === "request") {
        const b = rv(op.body); if (!b) return;
        PP.add(U, { key: `undo:${op.key}`, method: "POST", url: op.url, needs: op.needs, section: "undo", summary: `take back: ${op.summary}`,
          body: { action: "adminRemove", principalId: b.principalId, roleDefinitionId: b.roleDefinitionId, directoryScopeId: b.directoryScopeId, justification: "ENCA access (T62): undo this run" } });
      } else if (op.key.startsWith("member:")) {
        const url = rv(op.url); if (!url) return;
        PP.add(U, { key: `undo:${op.key}`, method: "DELETE", url: url.replace(/\/\$ref$/, `/${op.member}/$ref`), needs: op.needs, section: "undo", summary: `take back: ${op.summary}` });
      } else if (op.key.startsWith("appassign:") && rec.id) {
        PP.add(U, { key: `undo:${op.key}`, method: "DELETE", url: `${op.url}/${rec.id}`, needs: op.needs, section: "undo", summary: `take back: ${op.summary}` });
      } else if (op.method === "PATCH" && op.before) {
        PP.add(U, { key: `undo:${op.key}`, method: "PATCH", url: op.url, needs: op.needs, section: "undo", summary: `put back: ${op.summary.replace(/ — for EVERYONE.*$/, "")}`, body: op.before });
      } else if (op.produces && rec.id) {
        const what = op.key === "roledef" ? "roleDefinitions" : "groups";
        PP.add(U, { key: `undo:${op.key}`, method: "DELETE", url: what === "groups" ? `${V1}/groups/${rec.id}` : `${V1}/roleManagement/directory/roleDefinitions/${rec.id}`, needs: op.needs, section: "undo", summary: `delete what this run made: ${op.summary.replace(/^create /, "")}` });
      }
    });
    return U;
  }

  // ---- screen ------------------------------------------------------------------
  const PILL = { ok: ["ea-ok", "✓ exists"], create: ["ea-new", "＋ create"], differs: ["ea-dif", "≠ differs"], conflict: ["ea-bad", "⚠ conflict"] };
  const pill = (s) => `<span class="ea-pill ${PILL[s][0]}">${PILL[s][1]}</span>`;
  function render(res, opts) {
    const o = opts || {};
    const c = res.counts;
    const me = res.me || {};
    const pre = `<div class="ea-pre">
      <div class="ea-pf"><b class="${me.canWrite ? "ea-good" : "ea-badt"}">${me.canWrite ? "✓" : "✗"} ${esc(me.canWrite ? (me.via || "Privileged Role Administrator") + " active" : "No Privileged Role Administrator active")}</b>${esc(me.upn || "")} · needed for role-assignable groups, role assignments and the custom role</div>
      <div class="ea-pf"><b class="${res.skus.p2 ? "ea-good" : res.skus.p2 === false ? "ea-badt" : "ea-warnt"}">${res.skus.p2 ? "✓ Entra ID P2" : res.skus.p2 === false ? "✗ No Entra ID P2" : "? Entra ID P2 not read"}</b>eligible assignments need it; the custom role needs P1</div>
      <div class="ea-pf"><b class="${res.units.length ? "ea-warnt" : ""}">${res.units.filter((u) => u.isMemberManagementRestricted).length} restricted CA-RMAU-* unit${res.units.filter((u) => u.isMemberManagementRestricted).length === 1 ? "" : "s"} found</b>the Group Operator role is also made eligible at each unit's scope</div></div>`;
    const grpRows = (k) => res.rows.filter((r) => r.group === k || (k === "admin" && r.kind === "roleDef"));
    const tr = (r) => `<tr class="ea-row ea-${r.status}"><td><b>${esc(r.name)}</b>${r.kind === "group" ? `<div class="mini">${esc(r.how)}</div>` : ""}</td><td class="mini">${r.kind === "group" ? "group" : esc(r.how)}</td><td class="ea-why">${esc(r.why)}</td><td>${pill(r.status)}${r.detail ? `<div class="mini">${esc(r.detail)}</div>` : ""}</td></tr>`;
    const table = `<div class="list-card xt-card"><h3>What this creates <span class="mini">· verdict from the read · ${c.create || 0} to create · ${c.ok || 0} exist${c.differs ? ` · ${c.differs} differ` : ""}${c.conflict ? ` · ${c.conflict} conflict` : ""} · nothing is written before Preview and the typed domain</span></h3>
      <div class="xt-tw"><table class="xt-tbl ea-tbl"><thead><tr><th>Object</th><th>How</th><th>Why this role</th><th>Verdict</th></tr></thead><tbody>
      ${GROUPS.map((g) => `<tr class="ea-grp"><td colspan="4">${esc(g.name)} · ${esc(g.who)}</td></tr>${grpRows(g.key).map(tr).join("")}`).join("")}
      </tbody></table></div></div>`;
    const people = ["read", "admin"].map((k) => {
      const g = GROUPS.find((x) => x.key === k);
      const cur = (res.groupIds[k] && res.members[res.groupIds[k]]) || [];
      const add = ((o.members || {})[k]) || [];
      return `<div class="ea-people"><p class="mini" style="margin:0"><b>${esc(g.name.replace("PIM-SG-ENCA-CA-", ""))}</b>${k === "admin" ? ' <span class="ea-warnt">— usually also in Read, so reads keep working outside an activation</span>' : ""}</p>
        <div class="ea-who">${cur.map((m) => `<span title="${esc(m.userPrincipalName || "")}">${esc(m.displayName || m.userPrincipalName)}</span>`).join("")}${add.map((m) => `<span class="ea-add">＋ ${esc(m.name)} <button type="button" data-earm="${k}:${esc(m.id)}" title="Leave out">✕</button></span>`).join("")}${!cur.length && !add.length ? '<span class="mini">nobody yet</span>' : ""}</div>
        ${o.app ? `<div class="ea-addrow"><input type="text" data-eaupn="${k}" placeholder="UPN or name — Enter to add" autocomplete="off" spellcheck="false"><button class="btn" type="button" data-eaadd="${k}">＋ Add</button></div>` : ""}</div>`;
    }).join("");
    const setRows = res.settings.map((s) => `<tr><td><b>${esc(s.role.name)}</b><div class="mini">today: ${esc(s.now ? nowText(s.now) : s.role.custom && !s.roleId ? "the role is made in the run — read again after it" : "not read")}</div><div class="mini">design: ${(s.role.duration || "").replace("PT", "").toLowerCase()} · MFA · justification · permanent eligibility</div></td></tr>`).join("");
    const settings = `<div class="list-card xt-card"><h3>Activation settings</h3>
      <div class="xt-tw"><table class="xt-tbl ea-tbl"><tbody>${setRows}</tbody></table></div>
      <label class="chk ea-opt"><input type="checkbox" data-easettings${o.settings ? " checked" : ""}${o.app ? "" : " disabled"}><span><b>Set the design's activation settings</b> on these three roles</span></label>
      <p class="mini"><b>Impact:</b> PIM settings belong to the ROLE, not the group — this changes them for <b>everyone eligible</b> for that role in the tenant, not only for ENCA's Admin group. Only the activation length, MFA + justification and permanent eligibility are touched; approval, authentication context and notifications stay as they are. A role that asks an authentication context keeps it instead of MFA. <b>Way back:</b> every rule is kept as it was — ⬇ Backup and ↩ Undo this run put it back.</p></div>`;
    const sp = res.sp;
    const lock = `<div class="list-card xt-card"><h3>Optional · lock ENCA to these groups</h3>
      <label class="chk ea-opt"><input type="checkbox" data-ealock${o.lock ? " checked" : ""}${o.app && sp ? "" : " disabled"}><span>On ${sp ? `<b>${esc(sp.displayName || "ENCA")}</b>${sp.appRoleAssignmentRequired ? " (assignment already required)" : ""}` : "this tenant's ENCA service principal (not read)"}: turn <b>assignment required</b> on and assign both groups</span></label>
      <p class="mini"><b>Impact:</b> everyone else gets "not assigned" at ENCA sign-in — the tool refuses if you are in neither group. Only the ENCA registration this session signed in with is touched. <b>Way back:</b> turn assignment required off (↩ Undo this run does).</p></div>`;
    const not = `<div class="list-card xt-card"><h3>Not done here, on purpose</h3><ul class="mini" style="margin:0;padding-left:16px;line-height:1.6">
      <li>Privileged Role Administrator for ENCA operators — Tier 0 stays out of both groups</li>
      <li>Creating the CA-RMAU-* units — 🔒 Protect exclusions / 🛡 Administrative units (Tier 0)</li>
      <li>Removing or renaming anything that already exists; editing an existing custom role</li>
      <li>Workspace 02 (PIM-buddy) and Workspace 03 roles</li></ul></div>`;
    return `${pre}<div class="ea-grid"><div>${table}<div class="list-card xt-card"><h3>People <span class="mini">· direct members only — role-assignable groups take no nested group · users, no guests</span></h3>${people}</div></div><div>${settings}${lock}${not}</div></div>`;
  }
  function toMd(res, meta) {
    const m = meta || {};
    const L = [`# 🔐 ENCA access — ${m.tenant || "tenant"}`, "", `Read ${m.readAt ? new Date(m.readAt).toISOString().slice(0, 16).replace("T", " ") : ""} UTC${m.build ? ` · ${m.build}` : ""} · design R94 v3 (Workspace 01 · Conditional Access, two groups)`, "",
      "| Object | How | Why this role | Verdict |", "| --- | --- | --- | --- |"];
    res.rows.forEach((r) => L.push(`| ${r.name} | ${r.kind === "group" ? "group" : r.how} | ${String(r.why).replace(/\|/g, "/")} | ${PILL[r.status][1]}${r.detail ? ` — ${r.detail}` : ""} |`));
    L.push("", "## Activation settings", "", "| Role | Tenant today | Design |", "| --- | --- | --- |");
    res.settings.forEach((s) => L.push(`| ${s.role.name} | ${nowText(s.now)} | ${(s.role.duration || "").replace("PT", "").toLowerCase()} · MFA · justification · permanent eligibility |`));
    L.push("", "PIM settings belong to the role: changing them changes them for everyone eligible for that role in the tenant.");
    return L.join("\n");
  }

  return { catalog, compare, plan, undoPlan, render, toMd, settingsChanges, describeRules, nowText, units, roleIdOf, GROUPS, ROLES, CUSTOM, READ_SCOPES, GA, PRA, RMAU_PREFIX };
})();
if (typeof module !== "undefined") module.exports = EncaAccess;
