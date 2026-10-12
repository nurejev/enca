// 🧩 PIM modules — Remote Help, Remote Help unattended, Windows 365 (beta 4.0). Offline.
// Run: node --test tools/pimmodules.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const IR = new Function("PimPlan", read("js/intunerbac.js") + ";return IntuneRbac;")(PP);
const PD = new Function("PimPlan", "PimBaseline", "IntuneRbac", read("js/pimdeploy.js") + ";return PimDeploy;")(PP, PB, IR);
const PM = new Function(read("js/pimmodules.js") + ";return PimModules;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const names = (c) => c.groups.map((g) => g.name);
const role = (n) => CAT.intuneRoles.concat(...Object.values(CAT.modules).map((m) => m.roleDefs || [])).find((r) => r.name === n);

// What the two Lokka tenants returned on 12 Oct 2026 (part numbers only).
const DEVCF = [{ skuPartNumber: "DEFENDER_AND_PURVIEW_SUITES_FOR_BUSINESS_PREMIUM_NEW", capabilityStatus: "Enabled" }, { skuPartNumber: "SPB", capabilityStatus: "Enabled" }, { skuPartNumber: "RMSBASIC", capabilityStatus: "Enabled" }];
const GIMI = [{ skuPartNumber: "FLOW_FREE", capabilityStatus: "Enabled" }, { skuPartNumber: "SPB", capabilityStatus: "Enabled" }, { skuPartNumber: "CPC_E_4C_16GB_256GB\u200B", capabilityStatus: "Enabled" }];
const E3 = [{ skuPartNumber: "SPE_E3", capabilityStatus: "Enabled" }];

test("offer: Small gets Remote Help with E3, or Business Premium with the Defender suite — not with Business Premium alone", () => {
  assert.equal(PM.offer(E3, "small").rh.available, true);
  assert.equal(PM.offer(E3, "small").rh.entitlement, "included");
  const dev = PM.offer(DEVCF, "small");
  assert.equal(dev.rh.available, true, "Business Premium + Defender suite");
  assert.equal(dev.rh.entitlement, "none", "but no Remote Help service plan is in those SKUs");
  assert.match(PM.entitlementNote(dev), /No Remote Help entitlement found/);
  assert.equal(PM.offer(GIMI, "small").rh.available, false, "Business Premium alone");
});

test("offer: Windows 365 only with a Windows 365 licence; the zero-width character in the SKU name does not hide it", () => {
  assert.equal(PM.norm("CPC_E_4C_16GB_256GB\u200B"), "CPC_E_4C_16GB_256GB");
  assert.equal(PM.offer(GIMI, "small").w365.available, true);
  assert.equal(PM.offer(GIMI, "large").w365.available, true);
  assert.equal(PM.offer(DEVCF, "large").w365.available, false);
  assert.match(PM.offer(DEVCF, "large").w365.reason, /no Windows 365 licence/);
});

test("offer: large and multi always offer Remote Help and unattended; Small never offers unattended; unread licences hide nothing", () => {
  ["large", "multi"].forEach((id) => { const o = PM.offer(DEVCF, id); assert.equal(o.rh.available, true); assert.equal(o.rhu.available, true); });
  assert.equal(PM.offer(E3, "small").rhu.available, false);
  const u = PM.offer(null, "small");
  assert.equal(u.rh.available, true); assert.equal(u.w365.available, true); assert.equal(u.rh.entitlement, "unknown");
  assert.match(PM.offer([{ skuPartNumber: "X", servicePlans: [{ servicePlanName: "REMOTE_HELP" }] }], "small").rh.reason, /Remote Help entitlement/);
  assert.equal(PM.offer([{ skuPartNumber: "SPE_E3", capabilityStatus: "Suspended" }], "small").rh.available, false, "a suspended SKU does not count");
});

test("state: unknown ids and unattended without Remote Help are dropped; toggling Remote Help off takes unattended with it", () => {
  assert.deepEqual(PM.parse('["rh","rhu","bogus"]', CAT).sort(), ["rh", "rhu"]);
  assert.deepEqual(PM.parse('["rhu"]', CAT), []);
  assert.deepEqual(PM.parse("not json", CAT), []);
  assert.deepEqual(PM.toggle(["rh", "rhu"], "rh", false, CAT), []);
  assert.deepEqual(PM.toggle([], "rhu", true, CAT), []);
  assert.deepEqual(PM.toggle(["rh"], "w365", true, CAT).sort(), ["rh", "w365"]);
});

test("profile: with no module the catalog is exactly what it was; modules change nothing until they are on", () => {
  ["small", "large", "multi"].forEach((id) => {
    const base = PB.profile(CAT, id), none = PB.profile(CAT, id, { modules: [] });
    assert.deepEqual(names(base), names(none));
    assert.ok(!names(base).some((n) => /-RH-|-W365-|W365Admin/.test(n)));
    assert.deepEqual(base.profile.modules, []);
  });
});

test("profile: Remote Help adds the groups of the profile — Small two, Large three, unattended only in Large and Multi, never without Remote Help", () => {
  assert.deepEqual(names(PB.profile(CAT, "small", { modules: ["rh"] })).filter((n) => /-RH-/.test(n)), ["PIM-SG-INT-RH-Full", "PIM-SG-INT-RH-Elevation"]);
  assert.deepEqual(names(PB.profile(CAT, "large", { modules: ["rh"] })).filter((n) => /-RH-/.test(n)), ["PIM-SG-INT-RH-View", "PIM-SG-INT-RH-Full", "PIM-SG-INT-RH-Elevation"]);
  const u = names(PB.profile(CAT, "large", { modules: ["rh", "rhu"] })).filter((n) => /-RH-/.test(n));
  assert.ok(u.includes("PIM-SG-INT-RH-Unattended-Win") && u.includes("PIM-SG-INT-RH-Unattended-Android"));
  assert.ok(!names(PB.profile(CAT, "large", { modules: ["rhu"] })).some((n) => /Unattended/.test(n)), "needs Remote Help");
  assert.ok(!names(PB.profile(CAT, "small", { modules: ["rh", "rhu"] })).some((n) => /Unattended/.test(n)), "Small has none");
});

test("approval: Elevation needs approval in Large and Multi, not in Small (one approver cannot approve); unattended Windows keeps context c1", () => {
  assert.equal(PB.profile(CAT, "large", { modules: ["rh"] }).templates.GroupJITApproval.ApprovalRequired, true);
  assert.equal(PB.profile(CAT, "multi", { modules: ["rh"] }).templates.GroupJITApproval.ApprovalRequired, true);
  assert.equal(PB.profile(CAT, "small", { modules: ["rh"] }).templates.GroupJITApproval.ApprovalRequired, false);
  const g = (n) => PB.profile(CAT, "large", { modules: ["rh", "rhu"] }).groups.find((x) => x.name === n);
  assert.equal(g("PIM-SG-INT-RH-Elevation").template, "GroupJITApproval");
  assert.equal(g("PIM-SG-INT-RH-Unattended-Win").template, "GroupJITTier0");
  assert.equal(CAT.templates.GroupJITApproval.ActivationDuration, "PT4H");
});

test("Windows 365: three groups, the Entra role through the direct group, global only; Small keeps one group", () => {
  const L = PB.profile(CAT, "large", { modules: ["w365"] });
  assert.deepEqual(names(L).filter((n) => /W365/.test(n)).sort(), ["PIM-SG-INT-W365-Operator", "PIM-SG-INT-W365-Reader", "PIM-SG-M365-W365Admin"]);
  const r = L.roles.find((x) => x.name === "Windows 365 Administrator");
  assert.equal(r.templateId, "11451d60-acb2-45eb-a7d6-43d0f0125c13"); assert.deepEqual(r.via, ["PIM-SG-M365-W365Admin"]);
  assert.deepEqual(L.profile.cloudPc.map((x) => x.role).sort(), ["Cloud PC Administrator", "Cloud PC Reader"]);
  assert.deepEqual(names(PB.profile(CAT, "small", { modules: ["w365"] })).filter((n) => /W365/.test(n)), ["PIM-SG-INT-W365-Operator"]);
  assert.ok(!PB.profile(CAT, "large").roles.some((x) => x.name === "Windows 365 Administrator"));
});

test("every module group follows the naming contract and names a template the catalog has", () => {
  const re = new RegExp(CAT.naming.pattern);
  Object.values(CAT.modules).forEach((m) => m.groups.forEach((g) => { assert.match(g.name, re, g.name); assert.ok(CAT.templates[g.template], `${g.name} template`); }));
});

test("roles: INT-ROLE-HelpDesk is the built-in Help Desk Operator without Elevation and Android unattended; the Remote Help roles carry exactly their permission", () => {
  const hd = role("INT-ROLE-HelpDesk");
  assert.equal(hd.allowed.length, 93);
  assert.ok(!hd.allowed.some((a) => /RemoteAssistanceApp_(Elevation|Unattended|WindowsUnattended)/.test(a)));
  assert.ok(hd.allowed.includes("Microsoft.Intune_RemoteAssistanceApp_ViewScreen") && hd.allowed.includes("Microsoft.Intune_RemoteAssistanceApp_TakeFullControl"));
  assert.deepEqual(role("INT-ROLE-RH-Elevation").allowed.filter((a) => /RemoteAssistanceApp/.test(a)), ["Microsoft.Intune_RemoteAssistanceApp_Elevation"]);
  assert.deepEqual(role("INT-ROLE-RH-Unattended-Win").allowed.filter((a) => /RemoteAssistanceApp/.test(a)), ["Microsoft.Intune_RemoteAssistanceApp_WindowsUnattended"]);
  assert.deepEqual(role("INT-ROLE-RH-Unattended-Android").allowed.filter((a) => /RemoteAssistanceApp/.test(a)), ["Microsoft.Intune_RemoteAssistanceApp_Unattended"]);
  assert.ok(role("INT-ROLE-RH-Full").allowed.includes("Microsoft.Intune_RemoteTasks_RequestRemoteAssistance") && role("INT-ROLE-RH-Full").allowed.includes("Microsoft.Intune_RemoteAssistance_Read"));
  ["small", "large", "multi"].forEach((id) => PB.profile(CAT, id).profile.intune.assignments.filter((a) => /HelpDesk/.test(a.name)).forEach((a) => assert.deepEqual(a.roles, ["INT-ROLE-HelpDesk"], `${id} ${a.name}`)));
  assert.deepEqual(CAT.regions.template.intune.assignments.find((a) => /HelpDesk/.test(a.name)).roles, ["INT-ROLE-HelpDesk"]);
});

test("multi-region: regional IT gets Remote Help view and full control scoped to the region, never Elevation or unattended", () => {
  const M = PB.profile(CAT, "multi", { modules: ["rh", "rhu"] });
  const rows = PB.parseRegions(DEMO.pim.regionsCsv, CAT).rows;
  const E = IR.expected(M, rows);
  const nl = E.regions.find((r) => r.code === "EU-NL");
  assert.deepEqual(nl.assignments.filter((a) => /-RH-/.test(a.name)).map((a) => a.role).sort(), ["INT-ROLE-RH-Full", "INT-ROLE-RH-View"]);
  nl.assignments.filter((a) => /-RH-/.test(a.name)).forEach((a) => { assert.equal(a.scopeType, "resourceScope"); assert.deepEqual(a.tags, ["INT-TAG-EU-NL"]); assert.ok(a.scopeGroups.length === 2); });
  assert.ok(!nl.assignments.some((a) => /Elevation|Unattended/.test(a.name)));
  const reg = PB.region(M, rows[0]);
  assert.ok(reg.groups.some((g) => g.name === "PIM-SG-INT-RH-Full-EU-NL"));
  const central = E.central.filter((a) => /-RH-/.test(a.name));
  assert.ok(central.every((a) => a.scopeType === "allDevices" && a.tags.join() === "default"));
});

test("deploy: Remote Help and Windows 365 are sections that are off by default and appear only when the module is on", () => {
  assert.ok(PD.DEFAULT_OFF.has("rh") && PD.DEFAULT_OFF.has("w365"));
  const raw = () => { const d = clone(DEMO.pim); return { roles: d.roleDefinitions, policies: d.policies, policyIds: {}, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, named: d.named, names: d.names, readAt: 1, demo: true }; };
  assert.ok(!PD.sections(PB.profile(CAT, "large"), raw()).some((s) => s.key === "rh" || s.key === "w365"));
  const on = PD.sections(PB.profile(CAT, "large", { modules: ["rh", "w365"] }), raw());
  assert.ok(on.find((s) => s.key === "rh") && on.find((s) => s.key === "w365"));
  assert.equal(on.find((s) => s.key === "rh").defaultOn, false);
  const P = PD.build(PB.profile(CAT, "large", { modules: ["rh", "rhu", "w365"] }), raw(), { sections: new Set(["rh", "w365"]), domain: "contoso.nl" });
  const keys = P.ops.map((o) => o.key);
  ["PIM-SG-INT-RH-View", "PIM-SG-INT-RH-Full", "PIM-SG-INT-RH-Elevation", "PIM-SG-INT-RH-Unattended-Win", "PIM-SG-INT-W365-Reader", "PIM-SG-M365-W365Admin"].forEach((n) => assert.ok(keys.includes(`group:${n}`), n));
  assert.ok(!keys.some((k) => /^group:PIM-SG-M365-(GlobalAdmin|Ops)$/.test(k)), "the rest of the framework is not part of this selection");
  assert.ok(P.manual.some((m) => /switch it on in the Intune admin center/.test(m)));
  assert.ok(P.manual.some((m) => /Remote Desktop policy/.test(m) && /LAPS/.test(m)));
  assert.ok(P.manual.some((m) => /Cloud PC Administrator to PIM-SG-INT-W365-Operator/.test(m) && /Cloud PC Reader to PIM-SG-INT-W365-Reader/.test(m)));
  assert.ok(P.findings.some((f) => /tick Intune RBAC as well/.test(f)), "the roles and assignments belong to Intune RBAC");
  assert.ok(!P.ops.some((o) => /roleManagement\/cloudPC/.test(o.url || "")), "no Cloud PC assignment is planned");
});

test("deploy + T53: Remote Help roles and assignments are planned only with the Remote Help section; Elevation is its own role", () => {
  const M = PB.profile(CAT, "large", { modules: ["rh"] });
  const d = clone(DEMO.pim); const groups = new Map(); [...d.groups, ...d.named].forEach((g) => (groups.get(g.displayName) || groups.set(g.displayName, []).get(g.displayName)).push(g));
  const res = IR.compare(M, [], IR.model(clone(DEMO.pim.intune)), groups, d.names);
  const mod = res.items.filter((i) => i.module === "rh");
  assert.deepEqual(mod.map((i) => i.name).sort(), ["INT-RBAC-RH-Elevation", "INT-RBAC-RH-Full", "INT-RBAC-RH-View"]);
  assert.ok(res.customRoles.some((c) => c.name === "INT-ROLE-RH-Elevation" && c.module === "rh"));
  const ref = (n) => `{{group:${n}}}`;
  const off = PP.newPlan({}); IR.plan(off, M, res, ref, null, (m) => m !== "rh");
  assert.ok(!off.ops.some((o) => /RH-/.test(o.key)), "section off: nothing of the module is planned");
  const on = PP.newPlan({}); IR.plan(on, M, res, ref, null, () => true);
  const keys = on.ops.map((o) => o.key);
  assert.deepEqual(on.blocked, [], "the demo tenant lists every permission the roles name");
  ["introle:INT-ROLE-HelpDesk", "introle:INT-ROLE-RH-Elevation", "intassign:INT-RBAC-RH-Elevation|INT-ROLE-RH-Elevation", "intassign:INT-RBAC-HelpDesk|INT-ROLE-HelpDesk"].forEach((k) => assert.ok(keys.includes(k), k));
});

test("Windows 365 (4.1): Cloud PC role assignments are planned only when the provider was read; existing ones are skipped; otherwise By hand", () => {
  const raw = () => { const d = clone(DEMO.pim); return { roles: d.roleDefinitions, policies: d.policies, policyIds: {}, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, named: d.named, names: d.names, readAt: 1, demo: true }; };
  const cat = PB.profile(CAT, "large", { modules: ["w365"] });
  const sel = { sections: new Set(["w365"]), domain: "contoso.nl" };
  const none = PD.build(cat, raw(), sel);
  assert.ok(!none.ops.some((o) => /^cpc:/.test(o.key)), "not read: nothing planned");
  assert.ok(none.manual.some((m) => /Cloud PC Administrator to PIM-SG-INT-W365-Operator/.test(m)));
  const R = raw(); R.cloudPc = { roles: [{ id: "b5c08161-a7af-481c-ace2-a20a69a48fb1", displayName: "Cloud PC Administrator" }, { id: "d40368cb-fbf4-4965-bbc1-f17b3a78e510", displayName: "Cloud PC Reader" }], assignments: [] };
  const P = PD.build(cat, R, sel);
  const cpc = P.ops.filter((o) => /^cpc:/.test(o.key));
  assert.deepEqual(cpc.map((o) => o.key).sort(), ["cpc:PIM-SG-INT-W365-Operator|Cloud PC Administrator", "cpc:PIM-SG-INT-W365-Reader|Cloud PC Reader"]);
  cpc.forEach((o) => { assert.equal(o.method, "POST"); assert.match(o.url, /\/roleManagement\/cloudPC\/roleAssignments$/); assert.equal(o.body.directoryScopeId, "/"); assert.deepEqual(o.needs, ["RoleManagement.ReadWrite.CloudPC"]); assert.ok(/^\{\{group:/.test(o.body.principalId), "the group is made in the same plan"); });
  assert.ok(!P.manual.some((m) => /Cloud PC Administrator to/.test(m)), "planned, not By hand");
  const R2 = raw(); R2.cloudPc = { roles: R.cloudPc.roles, assignments: [] };
  R2.groups = [...R2.groups, { id: "g-op", displayName: "PIM-SG-INT-W365-Operator", isAssignableToRole: true }];
  R2.cloudPc.assignments = [{ principalId: "g-op", roleDefinitionId: "b5c08161-a7af-481c-ace2-a20a69a48fb1", directoryScopeId: "/" }];
  const P2 = PD.build(cat, R2, sel);
  assert.ok(!P2.ops.some((o) => o.key === "cpc:PIM-SG-INT-W365-Operator|Cloud PC Administrator"), "an existing assignment is not planned again");
  const R3 = raw(); R3.cloudPc = { roles: [{ id: "x", displayName: "Cloud PC Reader" }], assignments: [] };
  const P3 = PD.build(cat, R3, sel);
  assert.ok(P3.manual.some((m) => /Cloud PC Administrator to PIM-SG-INT-W365-Operator/.test(m)) && P3.ops.some((o) => o.key === "cpc:PIM-SG-INT-W365-Reader|Cloud PC Reader"), "a role the provider does not list stays By hand, the rest is planned");
});
