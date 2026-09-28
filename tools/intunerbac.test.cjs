// 📱 T53 Intune RBAC (js/intunerbac.js), offline, against the demo tenant.
// Run: node --test tools/intunerbac.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const IR = new Function("PimPlan", read("js/intunerbac.js") + ";return IntuneRbac;")(PP);
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const MULTI = PB.profile(CAT, "multi"), LARGE = PB.profile(CAT, "large"), SMALL = PB.profile(CAT, "small");
const rows = PB.parseRegions(DEMO.pim.regionsCsv, CAT).rows;
const groups = () => { const m = new Map(); [...DEMO.pim.groups, ...DEMO.pim.named].forEach((g) => (m.get(g.displayName) || m.set(g.displayName, []).get(g.displayName)).push(g)); return m; };
const run = (cat = MULTI, raw = DEMO.pim.intune, rs = rows) => IR.compare(cat, rs, IR.model(clone(raw)), groups(), DEMO.pim.names);
const item = (res, name, role) => res.items.find((i) => i.name === name && (!role || i.role === role));

test("expected: an assignment with two roles is two Intune assignments; regions add a tag and two assignments per row", () => {
  const E = IR.expected(MULTI, rows);
  assert.equal(E.central.filter((a) => a.name === "INT-RBAC-PolicyProfile-Central").length, 2);
  assert.equal(E.regions.length, 2);
  assert.deepEqual(E.regions.map((r) => r.tag.name), ["INT-TAG-EU-NL", "INT-TAG-EU-DE"]);
  assert.equal(E.customRoles[0].name, "INT-ROLE-Regional-Ops");
  assert.equal(IR.expected(SMALL, rows).regions.length, 0, "no regions outside the multi-region profile");
  assert.equal(IR.expected(LARGE, []).tags[0].name, "INT-TAG-Workplace");
});

test("compare: the right assignment matches, the missing half is missing, a standing group is a difference", () => {
  const r = run();
  assert.equal(item(r, "INT-RBAC-PolicyProfile-Central", "Policy and Profile Manager").status, "match", "role names compare without case");
  assert.equal(item(r, "INT-RBAC-PolicyProfile-Central", "Application Manager").status, "missing");
  const hd = item(r, "INT-RBAC-HelpDesk-Central");
  assert.equal(hd.status, "differs"); assert.match(hd.detail, /PIM-SG-INT-HelpDesk does not exist/);
  assert.equal(item(r, "INT-RBAC-HelpDesk-EU-NL").status, "match");
  assert.equal(item(r, "INT-RBAC-Ops-EU-NL").status, "missing");
  assert.equal(item(r, "INT-TAG-EU-NL").status, "match", "auto-assigned from its device group");
  assert.equal(item(r, "INT-TAG-EU-DE").status, "missing");
  const other = r.other.find((o) => o.name === "Legacy workplace team");
  assert.match(other.finding, /CAB-SEC-U-Admins-Legacy — not a PIM-SG-INT access group/);
});

test("custom role: permissions resolved like New-PimRegions.ps1 — ids and Resource/Action labels; the lacking ones named", () => {
  const r = run();
  const c = r.customRoles[0];
  assert.equal(c.status, "differs");
  assert.equal(c.unresolved.length, 0, "the four admin-center labels resolve through resourceName/actionName");
  assert.deepEqual(c.missing.sort(), ["Microsoft.Intune_RemoteTasks_LocateDevice", "Microsoft.Intune_RemoteTasks_RotateLocalAdminPassword", "Microsoft.Intune_TermsAndConditions_Read"]);
  const rs = IR.resolveActions(["Enrollment programs / Read device.", "Mobile apps/View reports"], DEMO.pim.intune.ops);
  assert.deepEqual(rs.ids, ["Microsoft.Intune_EnrollmentPrograms_ReadDevice"]);
  assert.match(rs.unknown[0].hint, /MobileApps_Read/);
  const raw = clone(DEMO.pim.intune); raw.roles[5].rolePermissions = [];
  assert.match(run(MULTI, raw).customRoles[0].detail, /no permissions at all/);
});

test("regions: T53's verdicts replace the Not read rows; without a read they stay Not read", () => {
  const t = { ...clone(DEMO.pim), roles: DEMO.pim.roleDefinitions, readAt: 0 };
  const before = PB.compareRegions(MULTI, rows, t);
  assert.ok(before.regions[0].items.filter((i) => i.kind === "intune").every((i) => i.status === "unread"));
  t.intune = { verdicts: run().verdicts };
  const after = PB.compareRegions(MULTI, rows, t);
  const nl = after.regions.find((x) => x.code === "EU-NL").items.filter((i) => i.kind === "intune");
  assert.deepEqual(nl.map((i) => `${i.name}:${i.status}`), ["INT-TAG-EU-NL:match", "INT-RBAC-HelpDesk-EU-NL:match", "INT-RBAC-Ops-EU-NL:missing"]);
});

test("plan: missing tags, the missing permissions and missing assignments — by placeholder, tags as direct group targets, nothing removed", () => {
  const r = run();
  const P = PP.newPlan({});
  const ids = new Map([...groups()].map(([n, l]) => [n, l[0].id]));
  IR.plan(P, MULTI, r, (n) => ids.get(n) || (n === "PIM-SG-INT-HelpDesk" || n === "PIM-SG-INT-Ops-EU-NL" || n.startsWith("INT-SG-") || n === "PIM-SG-INT-SecOps" || n === "PIM-SG-INT-HelpDesk-EU-DE" || n === "PIM-SG-INT-Ops-EU-DE" ? `{{group:${n}}}` : null), null);
  IR.bindBuiltIns(P, IR.model(clone(DEMO.pim.intune)));
  const keys = P.ops.map((o) => o.key);
  assert.ok(keys.includes("tag:INT-TAG-EU-DE") && keys.includes("tagassign:INT-TAG-EU-DE"));
  const ta = P.ops.find((o) => o.key === "tagassign:INT-TAG-EU-DE");
  assert.equal(ta.body.assignments[0].target["@odata.type"], "#microsoft.graph.groupAssignmentTarget");
  const fix = P.ops.find((o) => o.key === "introlefix:INT-ROLE-Regional-Ops");
  assert.equal(fix.method, "PATCH"); assert.equal(fix.body.rolePermissions[0].resourceActions[0].allowedResourceActions.length, 31, "28 kept + 3 added, none removed");
  const am = P.ops.find((o) => o.key === "intassign:INT-RBAC-PolicyProfile-Central|Application Manager");
  assert.equal(am.body.scopeType, "allDevicesAndLicensedUsers"); assert.deepEqual(am.body.roleScopeTagIds, ["0"]);
  assert.match(am.body["roleDefinition@odata.bind"], /roleDefinitions\/ir-am$/);
  const de = P.ops.find((o) => o.key === "intassign:INT-RBAC-Ops-EU-DE|INT-ROLE-Regional-Ops");
  assert.deepEqual(de.body.roleScopeTagIds, ["{{tag:INT-TAG-EU-DE}}"]);
  assert.match(de.body["roleDefinition@odata.bind"], /roleDefinitions\/ir-regional-ops$/);
  assert.ok(P.findings.some((f) => /INT-RBAC-HelpDesk-Central .* differs .* not rewritten/.test(f)));
  assert.ok(!P.ops.some((o) => o.method === "DELETE"));
  assert.deepEqual(PP.scopesOf(P), ["DeviceManagementRBAC.ReadWrite.All"]);
});

test("plan: a custom role whose permissions do not all resolve is never created reduced", () => {
  const raw = clone(DEMO.pim.intune); raw.roles = raw.roles.filter((r) => r.isBuiltIn); raw.ops = raw.ops.filter((o) => !/EnrollmentPrograms/.test(o.id));
  const r = run(MULTI, raw);
  const P = PP.newPlan({});
  IR.plan(P, MULTI, r, () => "x", null);
  assert.ok(!P.ops.some((o) => o.key.startsWith("introle:")));
  assert.ok(P.blocked.some((b) => /reduced role is never created/.test(b)));
});
