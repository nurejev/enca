// 🎖 T49 Roles & assignments (js/pimroles.js), offline, against the demo tenant.
// Run: node --test tools/pimroles.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const PR = new Function(read("js/pimroles.js") + ";return PimRoles;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const d = DEMO.pim;
const defId = new Map(d.roleDefinitions.map((r) => [r.displayName, r.id]));
const conv = (i) => ({ roleDefinitionId: defId.get(i.roleName), principalId: i.principalId, principal: { "@odata.type": `#microsoft.graph.${i.principalType === "Group" ? "group" : "user"}`, displayName: i.principalName }, directoryScopeId: i.directoryScopeId || "/", endDateTime: i.endDateTime, assignmentType: i.assignmentType });
const raw = (over = {}) => Object.assign({ roles: d.roleDefinitions, eligible: d.eligible.map(conv), active: d.active.map(conv), aus: d.aus, groupMembers: d.groupMembers, activations: d.activations.map((a) => Object.assign({ roleDefinitionId: defId.get(a.roleName) }, a)), readAt: 0, demo: true, protectedIds: ["u-bg1", "u-bg2"] }, over);
const NOW = Date.parse("2026-09-28T12:00:00Z");
const M = (over, cat = PB.profile(CAT, "multi")) => PR.model(cat, raw(over), { now: NOW });
const role = (m, n) => m.roles.find((r) => r.role === n);

test("Global Administrator: groups opened up into people, break-glass not a finding, Joey is", () => {
  const m = M();
  const ga = role(m, "Global Administrator");
  assert.equal(ga.tier, "Tier0");
  assert.equal(ga.permanent, 3); assert.equal(ga.protectedPermanent, 2);
  assert.ok(ga.findings.some((f) => /1 permanent active outside the framework: Joey Bakker/.test(f)));
  assert.ok(ga.findings.some((f) => /eligible directly, not through a PIM-SG group/.test(f)));
  const through = ga.rows.filter((r) => r.via === "PIM-SG-M365-GlobalAdmin").map((r) => r.principal).sort();
  assert.deepEqual(through, ["adm-anna", "adm-mihai"]);
  assert.equal(ga.lastActivation.who, "adm-anna");
});

test("how a person holds a role through a group follows both: an eligible member of a group is only eligible", () => {
  const m = M();
  const hd = role(m, "Helpdesk Administrator");
  const newbie = hd.rows.find((r) => r.principal === "adm-desk-new");
  assert.equal(newbie.how, "eligible"); assert.equal(newbie.viaHow, "eligible member");
  // Directory Readers is held ACTIVE by PIM-SG-M365-Ops: its active member holds it active,
  // its eligible member (3.0 job group) only eligible — one activation away.
  const dr = role(m, "Directory Readers");
  assert.equal(dr.rows.find((r) => r.via === "PIM-SG-M365-Ops" && r.principal === "adm-joey").how, "active");
  assert.equal(dr.rows.find((r) => r.via === "PIM-SG-M365-Ops" && r.principal === "adm-kees").how, "eligible");
  // 3.0: a job group's eligible member is eligible for every role the group holds.
  assert.equal(role(m, "Intune Administrator").rows.find((r) => r.via === "PIM-SG-M365-Ops" && r.principal === "adm-kees").how, "eligible");
});

test("scoped rows carry the unit's name; ending-soon and never-ending are counted; a group not read is said", () => {
  const m = M();
  const scoped = m.rows.filter((r) => r.scope !== "/");
  assert.ok(scoped.length >= 5);
  assert.ok(scoped.some((r) => r.scopeName === "AU-EU-NL-Users"));
  const act = m.rows.find((r) => r.how === "activated");
  assert.equal(act.principal, "Joey Bakker");
  const gm = Object.assign({}, d.groupMembers); delete gm["g-PIM-SG-M365-SecOps"];
  const m2 = M({ groupMembers: gm });
  assert.deepEqual(m2.unreadGroups, ["PIM-SG-M365-SecOps"]);
  assert.match(PR.render(m2, { tab: "roles" }), /Members not read for 1 group/);
  const soon = M({ eligible: [Object.assign(conv(d.eligible[0]), { endDateTime: "2026-10-05T00:00:00Z" })], active: [], groupMembers: {} });
  assert.equal(soon.counts.expiring, 1);
});

test("people: every principal once, with its roles; CSV has one line per assignment", () => {
  const m = M();
  const anna = m.people.find((p) => p.name === "adm-anna");
  assert.ok(anna.tier0 && anna.roles.includes("Global Administrator") && anna.roles.includes("Privileged Role Administrator"));
  const csv = PR.toCsv(m).split("\n");
  assert.equal(csv.length, m.rows.length + 1);
  assert.match(csv[0], /^role,tier,principal/);
  assert.ok(PR.render(m, { tab: "people", q: "anna" }).includes("adm-anna"));
});
