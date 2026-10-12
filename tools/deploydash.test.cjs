// node --test tools/deploydash.test.cjs — 📊 Deployment dashboard (T54), the
// pure model: coverage over the ENABLED users, left-out split in two, route
// in, policies by state, exclusions by route with the first route winning,
// readiness folded from a 🌊 result, and the export being script-free.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
globalThis.DgFill = require(path.join(__dirname, "..", "js", "dgfill.js"));
const DeployDash = require(path.join(__dirname, "..", "js", "deploydash.js"));

const U = (id, upn, o) => Object.assign({ id, userPrincipalName: upn, displayName: id, userType: "Member", accountEnabled: true }, o || {});
const set = (...a) => new Set(a);
function fixture(extra) {
  const users = [
    U("a", "anna@perfettivanmelle.com"), U("b", "bob@perfettivanmelle.com"), U("c", "cid@perfettivanmelle.com"),
    U("d", "dee@perfettivanmelle.com"), U("e", "ext@perfettivanmelle.com", { onPremisesExtensionAttributes: { extensionAttribute10: "External contractor" } }),
    U("g", "gary_x#EXT#@t.onmicrosoft.com", { userType: "Guest" }), U("s", "anna@pvmict.com"), U("z", "zed@perfettivanmelle.com", { accountEnabled: false }),
    U("bg", "breakglass@perfettivanmelle.com"),
  ];
  const groups = [
    { key: "GLO", name: "CAD-SEC-U-DG-GLO", id: "g-glo", direct: set("bg"), nested: set("a", "b", "c", "g") },
    { key: "INT", name: "CAD-SEC-U-DG-INT", id: "g-int", direct: set("c"), nested: set("a", "b") },
    { key: "EXT", name: "CAD-SEC-U-DG-EXT", id: "g-ext", direct: set("c"), nested: set() },
    { key: "GUESTUSERS", name: "CAD-SEC-U-DG-GUESTUSERS", id: "g-gu", direct: set("g"), nested: set() },
    { key: "SA", name: "CAD-SEC-U-DG-SA", id: null, direct: set(), nested: set() },
  ];
  const policies = [
    { id: "p1", name: "CA001-Global-BaseProtection", state: "enabled", includeGroups: ["g-glo"], excludeGroups: ["x-bg", "x-ca001"], excludeUsers: [], excludeRoles: [] },
    { id: "p2", name: "CA201-Internals-MFA", state: "enabledForReportingButNotEnforced", includeGroups: ["g-int"], excludeGroups: ["x-ca201"], excludeUsers: ["b"], excludeRoles: ["r-ga"] },
    { id: "p3", name: "CA301-Externals-Block", state: "disabled", includeGroups: ["g-ext"], excludeGroups: [], excludeUsers: [], excludeRoles: [] },
    { id: "p4", name: "CA400-Guests", state: "enabled", includeGroups: ["g-gu"], excludeGroups: ["x-other"], excludeUsers: [], excludeRoles: [] },
  ];
  const exclGroups = new Map([
    ["x-bg", { name: "CAB-SEC-U-BreakGlass", members: set("bg") }],
    ["x-ca001", { name: "CAB-SEC-U-CA001-Exclusion", members: set("a", "bg") }],
    ["x-ca201", { name: "CAB-SEC-U-CA201-Exclusion", members: set("a") }],
    ["x-other", { name: "SG-Partners", members: set("g") }],
    ["x-empty", { name: "CAB-SEC-U-CA302-Exclusion", members: set() }],
  ]);
  const roleMembers = new Map([["r-ga", set("c")]]);
  const sources = [
    { id: "s-nl", name: "PVM-UG-CORP-MEM-USERS-NL", label: "Netherlands", ticked: true, memberIds: set("a", "b", "d") },
    { id: "s-de", name: "PVM-UG-CORP-MEM-USERS-DE", label: "Germany", ticked: false, memberIds: set("c") },
  ];
  return Object.assign({ users, groups, policies, exclGroups, roleMembers, sources, opts: DgFill.DEFAULTS, mains: new Map([["anna@perfettivanmelle.com", users[0]]]) }, extra || {});
}

test("coverage counts ENABLED users only and splits left out in two", () => {
  const m = DeployDash.build(fixture());
  assert.equal(m.total.users, 9);
  assert.equal(m.total.enabled, 8);
  assert.equal(m.total.disabled, 1);
  // in a deploy group: a b c g bg = 5; left out: d (NL, ticked), e (no source), s (no source)
  assert.equal(m.cov.in, 5);
  assert.equal(m.cov.none, 1);
  assert.equal(m.cov.nosrc, 2);
  assert.deepEqual(m.leftOut.map((r) => r.id), ["d", "e", "s"]);
  const d = m.leftOut.find((r) => r.id === "d");
  assert.equal(d.rule, "3"); assert.equal(d.target, "DG-INT"); assert.equal(d.kind, "none"); assert.match(d.why, /ticked source/);
  const e = m.leftOut.find((r) => r.id === "e");
  assert.equal(e.rule, "2"); assert.equal(e.target, "DG-EXT"); assert.equal(e.kind, "nosrc");
  const s = m.leftOut.find((r) => r.id === "s");
  assert.equal(s.rule, "0a"); assert.equal(s.target, "DG-ADM");
  assert.equal(m.leftOut.some((r) => r.id === "z"), false, "a disabled account is never left out");
});

test("route in: nested, direct, by hand (a direct member no source holds)", () => {
  const m = DeployDash.build(fixture());
  const glo = m.groups.find((r) => r.key === "GLO");
  assert.deepEqual(glo.route, { nested: 4, direct: 0, hand: 1 });   // bg is direct and in no source
  const int = m.groups.find((r) => r.key === "INT");
  assert.deepEqual(int.route, { nested: 2, direct: 1, hand: 0 });   // c is direct and in DE
});

test("policies by state per group and once in the total; a missing group is said", () => {
  const m = DeployDash.build(fixture());
  assert.deepEqual(m.groups.find((r) => r.key === "GLO").pol, { enf: 1, ro: 0, off: 0 });
  assert.deepEqual(m.groups.find((r) => r.key === "INT").pol, { enf: 0, ro: 1, off: 0 });
  assert.deepEqual(m.groups.find((r) => r.key === "EXT").pol, { enf: 0, ro: 0, off: 1 });
  assert.deepEqual(m.pol, { enf: 2, ro: 1, off: 1 });
  assert.equal(m.groups.find((r) => r.key === "GLO").live, true);
  assert.equal(m.groups.find((r) => r.key === "EXT").live, false);
  assert.deepEqual(m.notFound, ["CAD-SEC-U-DG-SA"]);
});

test("exclusions: first route wins, Off policies never count, roles and direct users count", () => {
  const m = DeployDash.build(fixture());
  const glo = m.groups.find((r) => r.key === "GLO");
  // bg is in BreakGlass AND CA001-Exclusion → counted once, as BreakGlass; a via CA001
  assert.equal(glo.excl, 2);
  assert.deepEqual(glo.exclBy, { ca: 1, bg: 1, group: 0, user: 0, role: 0 });
  const int = m.groups.find((r) => r.key === "INT");
  // a via CA201 group, b direct user, c via the role — report-only still counts
  assert.equal(int.excl, 3);
  assert.deepEqual(int.exclBy, { ca: 1, bg: 0, group: 0, user: 1, role: 1 });
  const gu = m.groups.find((r) => r.key === "GUESTUSERS");
  assert.deepEqual(gu.exclBy, { ca: 0, bg: 0, group: 1, user: 0, role: 0 });
  assert.equal(m.groups.find((r) => r.key === "EXT").excl, 0, "an Off policy's exclusions are not a hole");
  assert.equal(m.exclMembers, 5, "a b c bg g — a counted once though she is taken out of GLO and INT");
  assert.deepEqual(m.excl, { ca: 1, bg: 1, group: 1, user: 1, role: 1 }, "the pie counts a person once, by her strongest route");
});

test("exclusion groups list: used by, of which in a deploy group, orphan and largest hole", () => {
  const m = DeployDash.build(fixture());
  const ca001 = m.exclList.find((r) => r.name === "CAB-SEC-U-CA001-Exclusion");
  assert.equal(ca001.inDg, 2); assert.deepEqual(ca001.usedBy, ["CA001 · enforced"]); assert.equal(ca001.orphan, false);
  const other = m.exclList.find((r) => r.name === "SG-Partners");
  assert.equal(other.inDg, 1);
  const empty = m.exclList.find((r) => r.name === "CAB-SEC-U-CA302-Exclusion");
  assert.equal(empty.orphan, true); assert.equal(empty.members, 0);
  assert.deepEqual(m.biggest, [ca001.id]);
});

test("needs a look: in both INT and EXT, disabled members, a standing bypass on a live policy", () => {
  const m = DeployDash.build(fixture());
  const int = m.groups.find((r) => r.key === "INT");
  assert.ok(int.look.some((l) => l.kind === "two" && l.n === 1), "c is in INT and EXT");
  const glo = m.groups.find((r) => r.key === "GLO");
  assert.ok(glo.look.some((l) => l.kind === "bypass" && l.n === 2), "a and bg are taken out of the enforced CA001");
  assert.ok(!int.look.some((l) => l.kind === "bypass"), "a report-only exclusion is not a standing bypass");
});

test("readinessOf folds a 🌊 result: worst verdict, locked out counted once across policies", () => {
  const res = { rows: [
    { state: "ro", name: "CA201", seq: "CA201", forecast: { verdict: "notyet", blocked: [{ id: "a" }, { id: "b" }], prompted: [{ id: "b" }, { id: "c" }], unchanged: 4, silent: 2 } },
    { state: "ro", name: "CA202", seq: "CA202", forecast: { verdict: "friction", blocked: [], prompted: [{ id: "a" }], unchanged: 6, silent: 1 } },
    { state: "on", name: "CA001", seq: "CA001" },
  ] };
  const r = DeployDash.readinessOf(res);
  assert.equal(r.ro, 2); assert.equal(r.verdict, "notyet");
  assert.equal(r.locked, 2); assert.equal(r.prompted, 1, "b and a are locked out somewhere, so only c is prompted-only");
  assert.equal(r.silent, 2);
  assert.equal(DeployDash.readinessOf({ rows: [{ state: "on" }] }).verdict, "none");
});

test("html: app view carries the drill-throughs, the export carries none and no script", () => {
  const m = DeployDash.build(fixture({ readiness: new Map([["INT", DeployDash.readinessOf({ rows: [{ state: "ro", name: "CA201", seq: "CA201", forecast: { verdict: "notyet", blocked: [{ id: "a" }], prompted: [], unchanged: 1, silent: 0 } }] })]]) }));
  const app = DeployDash.html(m, { app: true, list: "leftout" });
  assert.match(app, /data-dd-wave="g-glo"/);
  assert.match(app, /data-dd-group="g-int"/);
  assert.match(app, /data-dd-who="dee@perfettivanmelle.com"/);
  assert.match(app, /NOT YET · 1 locked out/);
  assert.match(app, /data-dd-list="leftout"/);
  const narrowed = DeployDash.html(m, { app: true, group: "INT" });
  assert.match(narrowed, /Route in · DG-INT/);
  assert.doesNotMatch(narrowed, /CAD-SEC-U-DG-GLO<\/button>/);
  const x = DeployDash.exportHtml(m, { tenant: "Contoso", build: "beta 32505", now: Date.UTC(2026, 9, 12) });
  assert.doesNotMatch(x, /<script/);
  assert.doesNotMatch(x, /data-dd-/);
  assert.match(x, /Left out — 3 enabled users/);
  assert.match(x, /dee@perfettivanmelle.com/);
  assert.match(x, /2026-10-12/);
  assert.match(x, /<title>Deployment dashboard — Contoso<\/title>/);
});

test("csv: one row per group, then the left-out rows", () => {
  const m = DeployDash.build(fixture());
  const csv = DeployDash.toCsv(m);
  const lines = csv.split("\r\n");
  assert.equal(lines[0].split(",")[0], "deploy_group");
  assert.equal(lines.filter((l) => l.startsWith("CAD-SEC-U-DG-")).length, 5);
  assert.ok(lines.some((l) => l.startsWith("dee@perfettivanmelle.com,")));
});
