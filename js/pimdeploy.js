// ======================================================================
// 🚀 Deploy — import from the baseline (T51, beta 32425, R72). Pure.
//
// THE CUSTOMER NEVER RUNS A SCRIPT (Mihai, 28 Sep 2026: "the PIM tool
// onboarding or configuration should always be from the browser … just
// select and import from the baseline in their tenant"). This module turns
// what 🧬 T48, 🗺 Regions, 📱 T53 and 🛡 T27 read into ONE plan — the same
// operations, in the same order and under the same guardrails as
// tools/pim/New-PimBaseline.ps1 + New-PimRegions.ps1 — which the shared
// runner (js/pimplan.js, js/app.js pimApply) shows as a WhatIf and applies
// after the tenant's domain is typed.
//
// Order: approver groups → persona and Intune access groups → units →
// Intune scope groups → role policies (they name the approvers) → group
// eligibilities (tenant scope) → scoped eligibilities (a unit) → membership
// policies of existing groups → Intune (custom role, tags, assignments) →
// membership policies of new groups (deferred until PIM for Groups knows
// the group).
//
// Guardrails, all of them the scripts':
//   * nothing is removed; a permanent assignment outside the framework, an
//     active group assignment of the 2.0 style, a unit whose rule differs —
//     are FINDINGS for a person to decide;
//   * a name that exists twice, or a group that should be role-assignable
//     and is not (the flag cannot be set later), BLOCKS what needs it;
//   * approval is only ever switched on with an approver group that exists
//     or is made in the same run;
//   * eligibilities never exceed the role's own maximum;
//   * people are never in the catalog: members are added by hand (or, for a
//     region's approver group, from the addresses in the regions file).
//
// build(cat, raw, opts) → PimPlan
//   raw  = 🧬 T48's read + policyIds / groupPolicyIds (the policy object ids
//          the rule PATCHes need), verifiedDomains
//   opts = { sections: Set, only: Set("role:X" | "group:Y") | null,
//            rows (regions), intune (IntuneRbac.compare result), intuneModel,
//            userIds: { upn: id }, domain, tenantId }
// sections(cat, raw, opts) → per section { key, label, n, what } (for the pick)
// ======================================================================
const PimDeploy = (() => {
  const V1 = PimPlan.V1;
  const G_W = ["Group.ReadWrite.All", "RoleManagement.ReadWrite.Directory"];
  const SECTIONS = [
    ["groups", "PIM-SG groups", "role-assignable, private — created empty"],
    ["approvers", "Approver groups", "plain security groups; members are added by you (a region's from its regions file)"],
    ["rolePolicies", "Role settings", "rule by rule, only the rules that differ; the rules as they were go into the backup"],
    ["eligibilities", "Group eligibilities", "each persona group eligible for its roles at tenant scope, one year"],
    ["groupPolicies", "Membership policies", "GroupMember / GroupJIT on every PIM-SG group; a new group's policy follows once PIM for Groups knows it"],
    ["rmau", "Restricted unit", "AU-RM-Executives and the desk scoped on it — the restricted flag cannot be undone"],
    ["regions", "Regions", "per row of the regions file: units, groups, scoped eligibilities, Intune scope groups"],
    ["intune", "Intune RBAC", "custom role, scope tags, role assignments to the PIM-SG-INT access groups"],
    ["azure", "Azure groups", "PIM-SG-AZ-* groups only; their Azure role assignments are made in Azure"],
  ];
  const DEFAULT_OFF = new Set(["rmau", "azure"]);

  function index(raw) {
    const byId = new Map();
    [...(raw.groups || []), ...(raw.named || [])].forEach((g) => { if (g && g.id && !byId.has(g.id)) byId.set(g.id, g); });
    const byName = new Map();
    for (const g of byId.values()) (byName.get(g.displayName) || byName.set(g.displayName, []).get(g.displayName)).push(g);
    const aus = new Map();
    (raw.aus || []).forEach((a) => (aus.get(a.displayName) || aus.set(a.displayName, []).get(a.displayName)).push(a));
    const roleId = new Map((raw.roles || []).filter((r) => r.isBuiltIn !== false).map((r) => [r.displayName, r.id]));
    return { byName, aus, roleId };
  }
  const ruleKey = (r) => String(r || "").replace(/\s+/g, " ").replace(/[‘’“”]/g, '"').trim().toLowerCase();

  function build(cat, raw, opts = {}) {
    const on = (k) => !opts.sections || opts.sections.has(k);
    const only = opts.only || null;
    const want = (k) => !only || only.has(k);
    const domain = opts.domain || raw.domain || "";
    const P = PimPlan.newPlan({ tool: "T51", catalog: `${cat.label} ${cat.release}`, profile: cat.profile ? cat.profile.id : null, tenantId: opts.tenantId || raw.tenantId || null, domain });
    const I = index(raw);
    const made = new Set();
    const ref = (n) => { const l = I.byName.get(n) || []; if (l.length === 1) return l[0].id; if (made.has(`group:${n}`)) return `{{group:${n}}}`; return null; };
    const auRef = (n) => { const l = I.aus.get(n) || []; if (l.length === 1) return l[0].id; if (made.has(`au:${n}`)) return `{{au:${n}}}`; return null; };
    const res = PimBaseline.compare(cat, raw);
    const region = cat.profile && cat.profile.regions && Array.isArray(opts.rows) && opts.rows.length;
    const regs = region ? opts.rows.map((row) => PimBaseline.region(cat, row)) : [];

    // ---- groups -----------------------------------------------------------
    const approverNames = new Set([cat.approvers && cat.approvers.name, ...Object.values(cat.profiles || {}).map((p) => p.approvers)].filter(Boolean));
    const usedApprovers = new Set();
    Object.values(cat.templates).forEach((t) => PimPlan.approverNames(t).forEach((n) => usedApprovers.add(n)));
    cat.roles.forEach((r) => PimPlan.approverNames(Object.assign({}, cat.templates[r.template], r.override || {})).forEach((n) => usedApprovers.add(n)));
    const createGroup = (n, roleAssignable, description, section, extra) => {
      const l = I.byName.get(n) || [];
      if (l.length > 1) { P.blocked.push(`${n} exists ${l.length} times (${l.map((x) => x.id).join(", ")}) — keep one before anything uses it`); return; }
      if (l.length === 1) { if (roleAssignable && l[0].isAssignableToRole === false) P.blocked.push(`${n} exists but is NOT role-assignable — the flag cannot be set later; rename it away and import again`); return; }
      const body = Object.assign({ displayName: n, mailEnabled: false, mailNickname: PimPlan.mailNickname(n), securityEnabled: true, groupTypes: [], description: String(description || "").slice(0, 1024) }, roleAssignable ? { isAssignableToRole: true, visibility: "Private" } : {}, extra || {});
      PimPlan.add(P, { key: `group:${n}`, method: "POST", url: `${V1}/groups`, produces: `group:${n}`, needs: roleAssignable ? G_W : ["Group.ReadWrite.All"], section, summary: `create ${roleAssignable ? "role-assignable" : body.groupTypes.includes("DynamicMembership") ? "dynamic" : "plain"} group ${n}`, body });
      made.add(`group:${n}`);
    };
    if (on("approvers")) [...usedApprovers].filter((n) => approverNames.has(n) || /Approvers/.test(n)).sort().forEach((n) => createGroup(n, false, `${cat.label} ${cat.release}: approves activations; a plain group, never role-assignable.`, "approvers"));
    res.groups.forEach((g) => {
      const sec = g.scope === "azure" ? "azure" : "groups";
      if (!on(sec) || !want(`group:${g.name}`)) return;
      if (g.status === "conflict") { P.blocked.push(g.conflict || `${g.name} is in conflict`); return; }
      if (!g.present) createGroup(g.name, true, `${cat.label} ${cat.release}: ${g.persona}. ${g.description || ""}`.trim(), sec);
      else if (g.roleAssignable === false) P.blocked.push(`${g.name} exists but is NOT role-assignable — the flag cannot be set later; rename it away and import again`);
    });
    if (on("regions")) regs.forEach((R) => R.groups.forEach((g) => createGroup(g.name, !!g.roleAssignable, `${cat.label}: ${g.persona}, ${R.name} (${R.code}). ${g.description || ""}`.trim(), "regions")));

    // ---- units -------------------------------------------------------------
    const rmauUnits = (cat.profile && cat.profile.rmau) || [];
    if (on("rmau")) rmauUnits.forEach((u) => {
      const l = I.aus.get(u.name) || [];
      if (l.length > 1) { P.blocked.push(`administrative unit ${u.name} exists ${l.length} times — keep one by hand`); return; }
      if (l.length === 1) { if (u.restricted && !l[0].isMemberManagementRestricted) P.blocked.push(`${u.name} exists but is NOT restricted — the flag is set at creation only; rename it away and import again`); return; }
      PimPlan.add(P, { key: `au:${u.name}`, method: "POST", url: `${V1}/directory/administrativeUnits`, produces: `au:${u.name}`, needs: ["AdministrativeUnit.ReadWrite.All"], section: "rmau", summary: `create restricted unit ${u.name} (empty — executives are added by hand)`, body: { displayName: u.name, description: `${cat.label}: ${u.holds}`.slice(0, 1024), isMemberManagementRestricted: !!u.restricted } });
      made.add(`au:${u.name}`);
    });
    if (on("regions")) regs.forEach((R) => R.aus.forEach((a) => {
      const l = I.aus.get(a.name) || [];
      if (l.length > 1) { P.blocked.push(`administrative unit ${a.name} exists ${l.length} times — keep one by hand`); return; }
      if (l.length === 1) {
        const u = l[0];
        if (u.isMemberManagementRestricted) P.findings.push(`${a.name} is a restricted management unit — a region's unit must not be; left as it is`);
        if (a.kind === "dynamic" && (u.membershipType !== "Dynamic" || ruleKey(u.membershipRule) !== ruleKey(a.rule) || (u.membershipRuleProcessingState && u.membershipRuleProcessingState !== "On"))) P.findings.push(`${a.name} differs from the template (${u.membershipType !== "Dynamic" ? "assigned, not dynamic" : `rule ${u.membershipRule || "(none)"}, processing ${u.membershipRuleProcessingState || "?"}`}) — not changed: a dynamic rule removes every member it does not match; set it in the portal`);
        return;
      }
      const body = { displayName: a.name, description: `${cat.label}: ${R.name} (${R.code}) — ${a.kind} unit for the region's ${a.type}s` };
      if (a.kind === "dynamic") Object.assign(body, { membershipType: "Dynamic", membershipRule: a.rule, membershipRuleProcessingState: "On" });
      PimPlan.add(P, { key: `au:${a.name}`, method: "POST", url: `${V1}/directory/administrativeUnits`, produces: `au:${a.name}`, needs: ["AdministrativeUnit.ReadWrite.All"], section: "regions", summary: `create ${a.kind} unit ${a.name}${a.kind === "dynamic" ? `: ${a.rule}` : ""}`, body });
      made.add(`au:${a.name}`);
    }));
    if (on("regions")) regs.forEach((R) => ((R.intune && R.intune.groups) || []).forEach((g) => {
      const l = I.byName.get(g.name) || [];
      if (l.length === 1) { if (ruleKey(l[0].membershipRule) !== ruleKey(g.rule)) P.findings.push(`${g.name} differs from the template (rule ${l[0].membershipRule || "(none)"}) — not changed`); return; }
      createGroup(g.name, false, `${cat.label}: Intune scope group, ${R.name} (${R.code}), ${g.type}s`, "regions", { groupTypes: ["DynamicMembership"], membershipRule: g.rule, membershipRuleProcessingState: "On" });
    }));
    // A region's approvers, from the file's addresses.
    if (on("regions")) regs.forEach((R) => R.groups.filter((g) => !g.roleAssignable && g.members).forEach((g) => {
      const gid = ref(g.name);
      (R.row.approvers || []).forEach((upn) => {
        const uid = (opts.userIds || {})[String(upn).toLowerCase()];
        if (!uid) { P.findings.push(`${g.name}: approver ${upn} was not found in the tenant — add the person by hand`); return; }
        if (gid && !String(gid).startsWith("{{") && ((opts.members || {})[gid] || []).includes(uid)) return;
        if (!gid) return;
        PimPlan.add(P, { key: `member:${g.name}:${uid}`, method: "POST", url: `${V1}/groups/${gid}/members/$ref`, needs: ["Group.ReadWrite.All"], section: "regions", summary: `add ${upn} to ${g.name}`, body: { "@odata.id": `${V1}/directoryObjects/${uid}` } });
      });
    }));

    // ---- role policies -----------------------------------------------------
    const approverIds = {};
    usedApprovers.forEach((n) => { const r = ref(n); if (r) approverIds[n] = r; });
    // Approval is only switched ON with an approver group that can approve
    // today: it exists (not made in this run) and has at least two members
    // when the count was read. Otherwise the approval rule is left as it is
    // and the plan says so — an approval nobody can give locks the role out
    // for everybody but break-glass (32429, review).
    const ready = (n) => { const id = approverIds[n]; if (!id || String(id).startsWith("{{")) return false; const c = (opts.approverMembers || {})[n]; return c === undefined || c >= 2; };
    const notReady = new Set();
    const approvalOk = (T) => PimPlan.approverNames(T).every((n) => { const ok = ready(n); if (!ok) notReady.add(n); return ok; });
    if (on("rolePolicies")) res.rows.forEach((row) => {
      if (row.status !== "differs" || !want(`role:${row.name}`)) return;
      const r = cat.roles.find((x) => x.name === row.name);
      const T = Object.assign({}, cat.templates[r.template], r.override || {});
      const pid = (raw.policyIds || {})[row.name];
      const rules = (raw.policies || {})[row.name];
      if (!pid || !rules) { P.findings.push(`${row.name}: its policy id was not read — role settings left out`); return; }
      const okA = approvalOk(T);
      const ch = PimPlan.ruleChanges(rules, T, { approverIds, domain, verifiedDomains: raw.verifiedDomains, skipApproval: !okA });
      if (ch.problem) { P.blocked.push(`${row.name}: ${ch.problem} (tick Approver groups)`); return; }
      if (!okA && T.ApprovalRequired && !(row.got && row.got.approval === true)) P.findings.push(`${row.name}: approval is not switched on yet — ${PimPlan.approverNames(T).join(", ")} must exist with at least two members first; add them, then Preview again`);
      ch.changes.forEach((c) => {
        if (c.missing) { P.findings.push(`${row.name}: the policy has no rule ${c.ruleId} — left as it is`); return; }
        PimPlan.add(P, { key: `rpol:${row.name}:${c.ruleId}`, method: "PATCH", url: `${V1}/policies/roleManagementPolicies/${pid}/rules/${c.ruleId}`, needs: ["RoleManagementPolicy.ReadWrite.Directory"], section: "rolePolicies", summary: `${row.name}: ${c.ruleId.replace(/_/g, " ")} → ${r.template}`, body: c.after, before: c.before });
      });
    });

    // ---- eligibilities -----------------------------------------------------
    const eligible = raw.eligible || [];
    const active = raw.active || [];
    const elig = (roleName, gname, scope, scopeLabel, section) => {
      const rid = I.roleId.get(roleName);
      if (!rid) { P.blocked.push(`${roleName}: no built-in role with that name was read`); return; }
      const gid = ref(gname);
      if (!gid) { P.findings.push(`${gname} → ${roleName}: left out — the group does not exist and is not in this import`); return; }
      if (scope.includes("{{") === false && !String(gid).startsWith("{{") && eligible.some((a) => a.principalId === gid && a.roleName === roleName && (a.directoryScopeId || "/") === scope)) return;
      if (!String(gid).startsWith("{{") && active.some((a) => a.principalId === gid && a.roleName === roleName && a.assignmentType !== "Activated" && (a.directoryScopeId || "/") === scope)) P.findings.push(`${gname} holds ${roleName} ACTIVE (2.0 style) — once the eligibility exists, remove the active assignment by hand`);
      if (scope !== "/" && !String(gid).startsWith("{{") && eligible.some((a) => a.principalId === gid && a.roleName === roleName && (a.directoryScopeId || "/") === "/")) P.findings.push(`${gname} is eligible for ${roleName} at TENANT scope — wider than ${scopeLabel}; remove the tenant-wide one by hand`);
      // The maximum this run leaves the role with, not the one it found:
      // a tighter tier applied first would refuse a longer request (32429).
      let dur = PimPlan.eligibilityDuration((raw.policies || {})[roleName], "P365D");
      const planned = P.ops.find((o) => o.key === `rpol:${roleName}:Expiration_Admin_Eligibility`);
      if (planned) { const d2 = PimPlan.eligibilityDuration([planned.body], dur.duration); if (d2.capped) dur = d2; }
      if (dur.capped) P.findings.push(`${roleName} allows eligibility for at most ${dur.duration}; ${gname} gets that`);
      // If any of this role's settings fails to change, its eligibilities are
      // left out: they would be granted under the old, weaker settings.
      const requires = P.ops.filter((o) => o.key.startsWith(`rpol:${roleName}:`)).map((o) => o.key);
      PimPlan.add(P, { requires, key: `elig:${roleName}:${gname}:${scopeLabel}`, kind: "request", url: `${V1}/roleManagement/directory/roleEligibilityScheduleRequests`, needs: ["RoleManagement.ReadWrite.Directory"], section, summary: `${gname} eligible for ${roleName} at ${scopeLabel} (${dur.duration})`,
        body: PimPlan.eligibility({ principalId: gid, roleDefinitionId: rid, scope, duration: dur.duration, justification: `${cat.label} ${cat.release}: ${gname} carries ${roleName}${scope === "/" ? "" : ` in ${scopeLabel}`}` }) });
    };
    if (on("eligibilities")) cat.roles.forEach((r) => (r.via || []).forEach((g) => {
      if (!want(`role:${r.name}`) && !want(`group:${g}`)) return;
      const gg = res.groups.find((x) => x.name === g);
      if (gg && gg.scope === "azure") return;
      elig(r.name, g, "/", "tenant scope", "eligibilities");
    }));
    if (on("rmau")) ((cat.profile && cat.profile.scoped) || []).forEach((s) => { const a = auRef(s.au); if (a) elig(s.role, s.group, `/administrativeUnits/${a}`, s.au, "rmau"); });
    if (on("regions")) regs.forEach((R) => R.eligibilities.forEach((e) => { const a = auRef(e.au); if (!a) { P.findings.push(`${e.group} → ${e.role} at ${e.au}: left out — the unit does not exist and is not in this import`); return; } elig(e.role, e.group, `/administrativeUnits/${a}`, e.au, "regions"); }));

    // ---- membership policies ------------------------------------------------
    const deferred = [];
    const gpolFor = (name, template, section) => {
      if (!template || !cat.templates[template]) return;
      const T = cat.templates[template];
      const gid = ref(name);
      if (!gid) return;
      const miss = PimPlan.approverNames(T).filter((n) => !approverIds[n]);
      if (miss.length) P.findings.push(`${name} membership policy: approver group ${miss.join(", ")} does not exist and is not in this import — its approval rule is left as it is`);
      const newGroup = String(gid).startsWith("{{");
      const rules = newGroup ? null : ((raw.groupPolicies || {})[gid] || (raw.groupPolicies || {})[name]);
      const pid = newGroup ? null : ((raw.groupPolicyIds || {})[gid] || (raw.groupPolicyIds || {})[name]);
      if (rules && pid) {
        const okA = approvalOk(T);
        const ch = PimPlan.ruleChanges(rules, T, { approverIds, domain, verifiedDomains: raw.verifiedDomains, skipApproval: !okA });
        if (ch.problem) { P.blocked.push(`${name}: ${ch.problem}`); return; }
        ch.changes.forEach((c) => { if (c.missing) return; PimPlan.add(P, { key: `gpol:${name}:${c.ruleId}`, method: "PATCH", url: `${V1}/policies/roleManagementPolicies/${pid}/rules/${c.ruleId}`, needs: ["RoleManagementPolicy.ReadWrite.AzureADGroup"], section, summary: `${name} membership: ${c.ruleId.replace(/_/g, " ")} → ${template}`, body: c.after, before: c.before }); });
      } else deferred.push({ name, template, gid, section, T });
    };
    if (on("groupPolicies")) {
      res.groups.filter((g) => g.scope !== "azure" || on("azure")).forEach((g) => { if (want(`group:${g.name}`)) gpolFor(g.name, g.template, "groupPolicies"); });
      if (on("regions")) regs.forEach((R) => R.groups.filter((g) => g.template).forEach((g) => gpolFor(g.name, g.template, "regions")));
    }

    // ---- Intune ------------------------------------------------------------
    if (on("intune") && opts.intune) IntuneRbac.plan(P, cat, opts.intune, ref, opts.intuneSel || null);
    if (on("intune") && opts.intuneModel) IntuneRbac.bindBuiltIns(P, opts.intuneModel);
    if (on("intune") && !opts.intune) P.findings.push("Intune RBAC was not read — read it in 📱 Intune RBAC to import its objects");

    // ---- membership policies of groups PIM for Groups does not know yet ------
    deferred.forEach((d) => PimPlan.add(P, { key: `gpolnew:${d.name}`, kind: "groupPolicy", group: d.name, groupId: String(d.gid).startsWith("{{") ? null : d.gid, settings: d.T, skipApproval: !approvalOk(d.T), approverIds: Object.fromEntries(Object.entries(approverIds).filter(([n]) => ready(n))), domain, verifiedDomains: raw.verifiedDomains, needs: ["RoleManagementPolicy.ReadWrite.AzureADGroup"], section: d.section, summary: `${d.name} membership policy → ${d.template} (once PIM for Groups knows the group)` }));

    if (notReady.size) P.manual.push(`approvers: ${[...notReady].join(", ")} — at least two people each; approval on the roles and groups that name them is switched on by the next Preview once they are there`);
    // The authentication context is only a gate when a policy enforces it.
    const ctxIds = [...new Set(Object.values(cat.templates).filter((t) => t.AuthenticationContext_Enabled).map((t) => String(t.AuthenticationContext_Value || "")))];
    if (opts.caPolicies && ctxIds.length) ctxIds.forEach((c) => { const on = opts.caPolicies.filter((p) => p.state === "enabled" && ((((p.conditions || {}).applications || {}).includeAuthenticationContextClassReferences) || []).includes(c)); if (!on.length) P.findings.push(`authentication context ${c}: no enabled Conditional Access policy targets it — Tier 0 activation then asks for justification only; build and switch on the context's policy in Workspace 01 before relying on it`); });
    // ---- what a person decides ---------------------------------------------
    res.rows.forEach((r) => { if (r.permanentOutside) P.findings.push(`${r.name}: ${r.permanentOutside} permanent active assignment${r.permanentOutside === 1 ? "" : "s"} outside the framework — make eligible or remove, by hand (never by an import)`); });
    P.manual.push("members: persona groups ACTIVE for at most a year, PIM-SG-INT-* access groups ELIGIBLE — add them in PIM for Groups or with an access package");
    if (on("approvers")) P.manual.push(`the approvers in ${[...usedApprovers].join(", ")} — at least two people who never approve their own activation`);
    if (region) P.manual.push("per region: the Autopilot profile (naming, group tag) and the yearly access review by the region's IT lead");
    ((cat.profile && cat.profile.intune && cat.profile.intune.switches) || []).forEach((s) => { if (on("intune")) P.manual.push(`Intune: ${s}`); });
    if (on("rmau") && rmauUnits.length) P.manual.push("executives, their devices and sensitive groups into the restricted unit — after the scoped desk is tested");
    return P;
  }
  // What each section would do now — the counts on the pick.
  function sections(cat, raw, opts = {}) {
    const all = build(cat, raw, Object.assign({}, opts, { sections: null }));
    const has = (k) => k === "regions" ? !!(cat.profile && cat.profile.regions) : k === "rmau" ? !!((cat.profile && cat.profile.rmau) || []).length : k === "azure" ? cat.groups.some((g) => g.scope === "azure") : true;
    return SECTIONS.filter(([k]) => has(k)).map(([key, label, what]) => {
      const ops = all.ops.filter((o) => o.section === key);
      const kinds = {};
      ops.forEach((o) => { const k = o.kind === "request" ? "add" : o.kind === "groupPolicy" ? "later" : o.method === "PATCH" ? "update" : o.method === "POST" && o.produces ? "create" : "add"; kinds[k] = (kinds[k] || 0) + 1; });
      return { key, label, what, n: ops.length, kinds, defaultOn: !DEFAULT_OFF.has(key) };
    });
  }
  return { SECTIONS, DEFAULT_OFF, build, sections };
})();
