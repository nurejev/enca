// js/auinv.js — 🛡 Administrative units, the inventory (T27 2.0, 32435).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const AI = new Function(read("js/auinv.js") + ";return AuInv;")();

const GA = "fdd7a751-b60b-444a-984c-02652fe8fa1c";   // Groups Administrator
const HD = "729827e3-9c14-49f7-bb1b-9608f156bbb8";   // Helpdesk Administrator
const au = (id, name, extra = {}) => ({ id, displayName: name, isMemberManagementRestricted: false, membershipType: "Assigned", ...extra });
const rau = (id, name) => au(id, name, { isMemberManagementRestricted: true });
const grp = (id, name, extra = {}) => ({ id, displayName: name, "@odata.type": "#microsoft.graph.group", isAssignableToRole: false, mailEnabled: false, groupTypes: [], ...extra });
const usr = (id) => ({ id, displayName: id, "@odata.type": "#microsoft.graph.user" });
const role = (auId, roleName, tpl, principalName, extra = {}) => ({ directoryScopeId: `/administrativeUnits/${auId}`, roleName, roleTemplateId: tpl, principalId: "p-" + principalName, principalName, principalType: "Group", state: "eligible", endDateTime: null, assignmentType: "Eligible", ...extra });
const pol = (id, users) => ({ id, displayName: id, state: "enabled", conditions: { users } });
const members = (o) => Object.fromEntries(Object.entries(o).map(([k, list]) => [k, list === null ? { list: null, error: "denied" } : { list, error: null, capped: false }]));
const run = (d) => AI.model({ assignments: [], eligibleRead: true, policies: [], ...d });
const ids = (u) => u.findings.map((f) => f.id);

test("a CA exclusion group in a regular unit with Groups Administrator scoped is HIGH, with a move action", () => {
  const r = run({
    aus: [au("a1", "Helpdesk NL")],
    members: members({ a1: [grp("g1", "CA-Excl")] }),
    assignments: [role("a1", "Groups Administrator", GA, "SG-HD")],
    policies: [pol("P1", { includeUsers: ["All"], excludeGroups: ["g1"] }), pol("P2", { includeUsers: ["All"], excludeGroups: ["g1"] })],
  });
  const f = r.units[0].findings.find((x) => x.id === "ca-group-writable");
  assert.strictEqual(f.sev, "high");
  assert.match(f.body, /excluded by 2 policies/);
  assert.match(f.body, /adding someone takes them out/);
  assert.strictEqual(f.action.kind, "move");
  assert.strictEqual(f.policies.length, 2);
});

test("the same group with only Helpdesk scoped is MEDIUM — one grant away", () => {
  const r = run({ aus: [au("a1", "U")], members: members({ a1: [grp("g1", "X")] }),
    assignments: [role("a1", "Helpdesk Administrator", HD, "SG-HD")], policies: [pol("P", { excludeGroups: ["g1"] })] });
  assert.strictEqual(r.units[0].findings.find((x) => x.id === "ca-group-writable").sev, "medium");
});

test("an INCLUDE group is a finding too, and says removing someone is the bypass", () => {
  const r = run({ aus: [au("a1", "U")], members: members({ a1: [grp("g1", "X")] }),
    assignments: [role("a1", "Groups Administrator", GA, "G")], policies: [pol("P", { includeGroups: ["g1"] })] });
  assert.match(r.units[0].findings[0].body, /removing someone takes them out/);
});

test("no CA finding when the group also sits in a restricted unit (Learn: regular-scoped roles are blocked then)", () => {
  const r = run({ aus: [au("a1", "U"), rau("r1", "Vault")], members: members({ a1: [grp("g1", "X")], r1: [grp("g1", "X")] }),
    assignments: [role("a1", "Groups Administrator", GA, "G"), role("r1", "Groups Administrator", GA, "V")], policies: [pol("P", { excludeGroups: ["g1"] })] });
  assert.ok(!ids(r.units[0]).includes("ca-group-writable"));
});

test("an unread restricted unit leaves the CA finding open, and says so", () => {
  const r = run({ aus: [au("a1", "U"), rau("r1", "Vault")], members: members({ a1: [grp("g1", "X")], r1: null }),
    policies: [pol("P", { excludeGroups: ["g1"] })] });
  assert.match(r.units[0].findings.find((x) => x.id === "ca-group-writable").body, /Not checked against 1 restricted unit/);
});

test("role-assignable groups are never a finding; M365 and mail-enabled groups cannot be moved", () => {
  const r = run({ aus: [au("a1", "U")], members: members({ a1: [grp("g1", "RA", { isAssignableToRole: true }), grp("g2", "M365", { groupTypes: ["Unified"] }), grp("g3", "Mail", { mailEnabled: true })] }),
    policies: [pol("P", { excludeGroups: ["g1", "g2", "g3"] })] });
  const fs = r.units[0].findings.filter((x) => x.id === "ca-group-writable");
  assert.deepStrictEqual(fs.map((f) => f.groupId).sort(), ["g2", "g3"]);
  fs.forEach((f) => assert.strictEqual(f.action.kind, "blocked"));
});

test("a CA group in a RESTRICTED unit is not this finding", () => {
  const r = run({ aus: [rau("r1", "V")], members: members({ r1: [grp("g1", "X")] }), assignments: [role("r1", "Groups Administrator", GA, "G")], policies: [pol("P", { excludeGroups: ["g1"] })] });
  assert.deepStrictEqual(ids(r.units[0]), []);
});

test("CA lens: a user holding a role directly and permanently is MEDIUM; eligible, time-bound or activated is not", () => {
  const base = { aus: [au("a1", "U")], members: members({ a1: [usr("u1")] }) };
  const mk = (x) => run({ ...base, assignments: [role("a1", "User Administrator", "fe930be7-5e62-47db-91af-98c3a49a38b1", "adm-x", { principalType: "User", ...x })] });
  assert.ok(ids(mk({ state: "active", assignmentType: "Assigned" }).units[0]).includes("holder-direct-standing"));
  assert.ok(!ids(mk({ state: "eligible" }).units[0]).includes("holder-direct-standing"));
  assert.ok(!ids(mk({ state: "active", assignmentType: "Assigned", endDateTime: "2027-01-01T00:00:00Z" }).units[0]).includes("holder-direct-standing"));
  assert.ok(!ids(mk({ state: "active", assignmentType: "Activated" }).units[0]).includes("holder-direct-standing"));
});

test("PIM lens: any holder that is not a PIM-SG group is a finding", () => {
  const d = { aus: [au("a1", "U")], members: members({ a1: [usr("u1")] }), lens: "pim",
    assignments: [role("a1", "Helpdesk Administrator", HD, "PIM-SG-EU-ServiceDesk"), role("a1", "Helpdesk Administrator", HD, "SG-Old-Desk"), role("a1", "Helpdesk Administrator", HD, "jan", { principalType: "User" })] };
  const fs = run(d).units[0].findings.filter((f) => f.id === "holder-not-pim-group");
  assert.strictEqual(fs.length, 2);
  assert.ok(fs.every((f) => !/PIM-SG-EU-ServiceDesk/.test(f.body)));
});

test("overlap: two regular units with desks on both share users — both get the finding; no desk, no finding", () => {
  const m = members({ a: [usr("1"), usr("2"), usr("3")], b: [usr("3"), usr("4")], c: [usr("1")] });
  const r = run({ aus: [au("a", "EU"), au("b", "NA"), au("c", "Quiet")], members: m,
    assignments: [role("a", "Helpdesk Administrator", HD, "E"), role("b", "Helpdesk Administrator", HD, "N")] });
  assert.deepStrictEqual(r.overlaps, [{ a: "a", b: "b", n: 1 }]);
  assert.ok(ids(r.units[0]).includes("overlap") && ids(r.units[1]).includes("overlap"));
  assert.ok(!ids(r.units[2]).includes("overlap"));
});

test("overlap is not judged on a unit read only in part", () => {
  const r = run({ aus: [au("a", "A"), au("b", "B")], members: { a: { list: [usr("1")], capped: true }, b: { list: [usr("1")], capped: false } },
    assignments: [role("a", "Helpdesk Administrator", HD, "E"), role("b", "Helpdesk Administrator", HD, "N")] });
  assert.strictEqual(r.overlaps.length, 0);
  assert.ok(r.notes.some((n) => /read only in part/.test(n)));
});

test("membership: dynamic users / devices, and a paused rule", () => {
  const r = run({ aus: [au("a", "A", { membershipType: "Dynamic", membershipRule: '(user.usageLocation -eq "NL")', membershipRuleProcessingState: "Paused" }), au("b", "B", { membershipType: "Dynamic", membershipRule: 'device.deviceCategory -eq "Kiosk"', membershipRuleProcessingState: "On" })],
    members: members({ a: [usr("1")], b: [] }) });
  assert.strictEqual(r.units[0].membership, "Dynamic users");
  assert.strictEqual(r.units[1].membership, "Dynamic devices");
  assert.ok(ids(r.units[0]).includes("rule-paused"));
  assert.ok(!ids(r.units[1]).includes("rule-paused"));
});

test("a role on an empty unit is LOW; a regular unit with no role is INFO; a restricted one with no role is a closed vault", () => {
  const r = run({ aus: [au("e", "Empty"), au("n", "Nobody"), rau("v", "Vault")], members: members({ e: [], n: [usr("1")], v: [grp("g", "x")] }),
    assignments: [role("e", "Password Administrator", "x", "G")] });
  const by = Object.fromEntries(r.units.map((u) => [u.name, u]));
  assert.strictEqual(by.Empty.findings[0].id, "scoped-empty");
  assert.strictEqual(by.Empty.findings[0].sev, "low");
  assert.strictEqual(by.Nobody.findings[0].id, "unused");
  assert.strictEqual(by.Nobody.findings[0].sev, "info");
  assert.strictEqual(by.Vault.findings[0].id, "vault-closed");
});

test("roles not read: no role-dependent finding, and a note — never 'nothing uses this unit'", () => {
  const r = AI.model({ aus: [au("n", "N")], members: members({ n: [usr("1")] }), assignments: null, policies: [] });
  assert.deepStrictEqual(ids(r.units[0]), []);
  assert.ok(r.notes.some((n) => /not read/.test(n)));
  assert.strictEqual(r.units[0].holdersRead, false);
});

test("active-only fallback is said in the notes", () => {
  const r = run({ aus: [au("n", "N")], members: members({ n: [] }), eligibleRead: false, eligibleNote: "PIM needs Entra ID P2" });
  assert.ok(r.notes.some((n) => /Only active roles.*P2/.test(n)));
});

test("unreadable members: the unit is listed, counted as unread, never judged on what it holds", () => {
  const r = run({ aus: [au("h", "Hidden", { visibility: "HiddenMembership" })], members: members({ h: null }), policies: [pol("P", { excludeGroups: ["g"] })] });
  assert.strictEqual(r.units[0].read, false);
  assert.strictEqual(r.counts.unread, 1);
  assert.ok(!ids(r.units[0]).includes("ca-group-writable"));
});

test("PIM lens + regions file: a differing unit, a regional name the file does not build, and a missing one", () => {
  const regions = { regions: [{ code: "EU-NL", name: "Netherlands", items: [
    { kind: "au", name: "AU-EU-NL-Users", status: "differs", detail: "rule processing is Paused" },
    { kind: "au", name: "AU-EU-NL-Devices", status: "missing" },
  ] }] };
  const r = run({ lens: "pim", regions, aus: [au("a", "AU-EU-NL-Users"), au("b", "AU-EU-BE-Users")], members: members({ a: [], b: [] }) });
  const by = Object.fromEntries(r.units.map((u) => [u.name, ids(u)]));
  assert.ok(by["AU-EU-NL-Users"].includes("region-differs"));
  assert.ok(by["AU-EU-BE-Users"].includes("region-unknown"));
  assert.deepStrictEqual(r.regionsMissing, [{ region: "EU-NL · Netherlands", name: "AU-EU-NL-Devices" }]);
  const ca = run({ lens: "ca", regions, aus: [au("a", "AU-EU-NL-Users")], members: members({ a: [] }) });
  assert.ok(!ids(ca.units[0]).includes("region-differs"), "the CA lens does not judge regions");
});

test("findings sort high first; counts add up; matches() filters by kind, findings and text", () => {
  const r = run({ aus: [au("a1", "Helpdesk NL"), rau("r1", "Vault"), au("x", "Quiet")], members: members({ a1: [grp("g1", "X")], r1: [usr("vip")], x: [usr("1")] }),
    assignments: [role("a1", "Groups Administrator", GA, "G"), role("r1", "Groups Administrator", GA, "V"), role("x", "Helpdesk Administrator", HD, "Q")],
    policies: [pol("P", { excludeGroups: ["g1"] })] });
  assert.strictEqual(r.units[0].findings[0].sev, "high");
  assert.strictEqual(r.counts.total, 3);
  assert.strictEqual(r.counts.restricted + r.counts.regular, 3);
  assert.strictEqual(r.counts.high + r.counts.other, r.findings.length);
  const u = r.units[0];
  assert.ok(AI.matches(u, "regular", "") && !AI.matches(u, "restricted", ""));
  assert.ok(AI.matches(u, "findings", "") && !AI.matches(r.units[1], "findings", ""));
  assert.ok(AI.matches(u, "all", "groups administrator"), "search reaches the role holders");
});

test("renderTable escapes names; renderUnit offers the move only for a movable group; toMd lists findings", () => {
  const r = run({ aus: [au("a1", "<b>Evil</b>")], members: members({ a1: [grp("g1", "X")] }), assignments: [role("a1", "Groups Administrator", GA, "G")], policies: [pol("P", { excludeGroups: ["g1"] })] });
  const t = AI.renderTable(r, { filter: "all" });
  assert.ok(!t.includes("<b>Evil</b>") && t.includes("&lt;b&gt;Evil&lt;/b&gt;"));
  assert.ok(t.includes('data-auinvopen="a1"'));
  assert.match(AI.renderUnit(r.units[0]), /no restricted unit to move it into/, "no target, no button");
  const withT = AI.renderUnit(r.units[0], { targets: [{ id: "r1", name: "Vault A" }, { id: "r2", name: "Vault B" }], suggest: () => "r2" });
  assert.ok(withT.includes('data-auinvmove="a1|g1"') && withT.includes('data-auinvtarget="a1|g1"'));
  assert.match(withT, /value="r2" selected>Vault B \(its persona vault\)/);
  assert.match(AI.renderUnit(r.units[0], { targets: [{ id: "r1", name: "V" }] }), /— pick a restricted unit —/, "no vault: nothing pre-selected");
  assert.match(AI.renderUnit(r.units[0]), /cannot be switched to restricted/);
  const md = AI.toMd(r, {});
  assert.match(md, /## Inventory — every unit/);
  assert.match(md, /\*\*High · <b>Evil<\/b>\*\*|High · /);
  assert.strictEqual(AI.renderTable(run({ aus: [], members: {} }), {}).includes("No unit matches"), true);
});

test("demo data: the inventory finds the CA212 group in Helpdesk NL as HIGH and the two regional units overlap", () => {
  const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
  const pols = (DEMO.policies || []).map((p) => p.raw || p);
  const mem = Object.fromEntries(Object.entries(DEMO.adminUnitDetails).map(([k, v]) => [k, { list: v.members, error: null, capped: false }]));
  const r = AI.model({ aus: DEMO.adminUnits, members: mem, assignments: DEMO.adminUnitRoles, eligibleRead: true, policies: pols });
  const hd = r.units.find((u) => u.name === "Helpdesk NL");
  assert.strictEqual(hd.findings[0].id, "ca-group-writable");
  assert.strictEqual(hd.findings[0].sev, "high");
  assert.ok(r.overlaps.some((o) => o.n === 1));
  assert.ok(r.units.find((u) => u.name === "AU-NA-Users").findings.some((f) => f.id === "rule-paused"));
  assert.ok(r.units.find((u) => u.name === "AU-Legacy-HR").findings.some((f) => f.id === "unused"));
  assert.ok(r.units.find((u) => u.name === "AU-Site-Warehouse").findings.some((f) => f.id === "scoped-empty"));
});
