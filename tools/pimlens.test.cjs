// PIM lenses on the carried-over tools and T49's Azure tab (js/pimlens.js), offline.
// Run: node --test tools/pimlens.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const PR = new Function(read("js/pimroles.js") + ";return PimRoles;")();
const IR = new Function("PimPlan", read("js/intunerbac.js") + ";return IntuneRbac;")(PP);
const RM = new Function("PimPlan", read("js/pimrmau.js") + ";return PimRmau;")(PP);
const PL = new Function(read("js/pimlens.js") + ";return PimLens;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const d = JSON.parse(JSON.stringify(DEMO.pim));
const MULTI = PB.profile(CAT, "multi");
const tenant = { roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, names: d.names, aus: d.aus, named: d.named, domain: "contoso.nl" };
const res = PB.compare(MULTI, tenant);
const defId = new Map(d.roleDefinitions.map((r) => [r.displayName, r.id]));
const conv = (i) => ({ roleDefinitionId: defId.get(i.roleName), principalId: i.principalId, principal: { "@odata.type": `#microsoft.graph.${i.principalType === "Group" ? "group" : "user"}`, displayName: i.principalName }, directoryScopeId: i.directoryScopeId || "/", endDateTime: i.endDateTime, assignmentType: i.assignmentType });
const roles = PR.model(MULTI, { roles: d.roleDefinitions, eligible: d.eligible.map(conv), active: d.active.map(conv), aus: d.aus, groupMembers: d.groupMembers, activations: [] });
const groups = new Map(); [...d.groups, ...d.named].forEach((g) => (groups.get(g.displayName) || groups.set(g.displayName, []).get(g.displayName)).push(g));
const intune = IR.compare(MULTI, [], IR.model(d.intune), groups, d.names);
const rmau = RM.check(MULTI, { aus: d.aus, members: d.rmauMembers, eligible: d.eligible, active: d.active, groups: d.groups, named: d.named, roles: d.roleDefinitions });

test("T08 PIM checks: failing first, each with the tool that fixes it; not read is never a pass", () => {
  const ca = [{ displayName: "CA004 Tier 0 context", state: "enabledForReportingButNotEnforced", conditions: { applications: { includeAuthenticationContextClassReferences: ["c1"] } } }];
  const list = PL.checks({ cat: MULTI, res, roles, intune, rmau, caPolicies: ca });
  const by = (id) => list.find((c) => c.id === id);
  assert.equal(by("ga-permanent").state, "fail"); assert.match(by("ga-permanent").detail, /Joey Bakker/);
  assert.equal(by("intune-standing").state, "fail");
  assert.equal(by("rmau-pim").state, "fail");
  assert.equal(by("ctx-policy").state, "fail"); assert.match(by("ctx-policy").detail, /only report-only or off/);
  assert.equal(by("t0-approval").state, "fail"); assert.match(by("t0-approval").detail, /Privileged Role Administrator/);
  assert.equal(list[0].state, "fail"); assert.equal(list[list.length - 1].state, "pass");
  const none = PL.checks({ cat: MULTI, res: null, roles: null, intune: null, rmau: null, caPolicies: null });
  assert.ok(none.every((c) => c.state === "unread"));
});

test("T12 / T16 / T17 / T19 lenses", () => {
  const g = PL.groups({ raw: tenant, res, rolesRaw: { groupMembers: d.groupMembers } });
  const legacy = g.find((x) => x.name === "CAB-SEC-U-Admins-Legacy");
  assert.equal(legacy.framework, "not in the framework"); assert.ok(legacy.roles.some((r) => /User Administrator \(active\)/.test(r)));
  assert.equal(g.find((x) => x.name === "PIM-SG-M365-GlobalAdmin").active, 2);
  const a = PL.audit(d.audit);
  assert.equal(a[0].kind, "activation"); assert.ok(a.some((x) => x.kind === "setting"));
  assert.match(PL.renderAudit(a, "setting"), /Update role setting in PIM/);
  const acts = PL.activations(d.activations);
  assert.equal(acts.filter((x) => x.pending).length, 1); assert.ok(PL.renderActivations(acts).includes("1 waiting for approval"));
  const w = PL.whois({ roles, cat: MULTI, caPolicies: [] }, "anna");
  assert.ok(w.people.some((p) => p.name === "adm-anna" && p.rows.some((r) => r.role === "Global Administrator" && r.via === "PIM-SG-M365-GlobalAdmin")));
  assert.match(PL.renderWhois(w), /no Conditional Access policy targets it/);
});

test("Azure RBAC: the framework's groups eligible where it says; a person holding Owner permanently is a finding", () => {
  const m = PL.azure(d.azure, CAT);
  assert.ok(m.groups.find((g) => g.name === "PIM-SG-AZ-Platform-Owner").ok);
  assert.ok(!m.groups.find((g) => g.name === "PIM-SG-AZ-Corp-Owner").ok);
  assert.ok(m.findings.some((f) => /Joey Bakker holds Owner on Corp permanently and directly/.test(f)));
  assert.ok(m.findings.some((f) => /PIM-SG-AZ-Corp-Contributor holds Contributor on Corp ACTIVE/.test(f)));
  assert.ok(!m.findings.some((f) => /SOC readers/.test(f)), "Reader is not a privileged Azure role");
});
