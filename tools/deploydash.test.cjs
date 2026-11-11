// node --test tools/deploydash.test.cjs — 📊 Deployment dashboard (T54), the
// pure model: coverage over the ENABLED users (in a deploy group or left out
// of every one), route in, policies by state, exclusions by route with the
// first route winning, readiness folded from a 🌊 result, the export being
// script-free — and, since 32514, that nothing here comes from 🌍 Fill from
// regions (queue 311): the two tools share the tenant and nothing else.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const DeployDash = require(path.join(__dirname, "..", "js", "deploydash.js"));

const U = (id, upn, o) => Object.assign({ id, userPrincipalName: upn, displayName: id, userType: "Member", accountEnabled: true }, o || {});
const set = (...a) => new Set(a);
function fixture(extra) {
  const users = [
    U("a", "anna@contoso.com"), U("b", "bob@contoso.com"), U("c", "cid@contoso.com"),
    U("d", "dee@contoso.com"), U("e", "ext@contoso.com"),
    U("g", "gary_x#EXT#@t.onmicrosoft.com", { userType: "Guest" }), U("s", "anna@contoso-adm.com"), U("z", "zed@contoso.com", { accountEnabled: false }),
    U("bg", "breakglass@contoso.com"),
  ];
  const groups = [
    { key: "GLO", name: "CAD-SEC-U-DG-GLO", id: "g-glo", direct: set("bg"), nested: set("a", "b", "c", "g"), children: [{ id: "c-nl", name: "SG-NL", memberIds: set("a", "b") }, { id: "c-de", name: "SG-DE", memberIds: set("c", "g") }] },
    { key: "INT", name: "CAD-SEC-U-DG-INT", id: "g-int", direct: set("c"), nested: set("a", "b"), children: [{ id: "c-nl", name: "SG-NL", memberIds: set("a", "b") }] },
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
  return Object.assign({ users, groups, policies, exclGroups, roleMembers }, extra || {});
}

test("nothing from 🌍 Fill from regions: no DgFill / dg* symbol in the tool or its app.js block", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "deploydash.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  const start = app.indexOf("// ---------- 📊 Deployment dashboard");
  const end = app.indexOf("\n  // ---------- ", start + 10);
  assert.ok(start > 0 && end > start, "the dd block sits between two banners");
  const block = app.slice(start, end);
  assert.ok(/function readDeployReadiness/.test(block), "the block holds the readiness read too");
  const banned = /\bDgFill\b|\bdgPrefs\b|\bdgListStored\b|\bdgReadCandidates\b|\bopenDgFill\b|\bdgSavePrefs\b|data-dd-fill|onPremisesExtensionAttributes/;
  assert.doesNotMatch(src, banned, "js/deploydash.js reads nothing from dgfill");
  assert.doesNotMatch(block, banned, "the dd* block in app.js reads nothing from dgfill");
  assert.equal(typeof DeployDash.ruleFor, "undefined", "Fill's rules are not mirrored here");
});

test("coverage counts ENABLED users only: in a deploy group or left out of every one", () => {
  const m = DeployDash.build(fixture());
  assert.equal(m.total.users, 9);
  assert.equal(m.total.enabled, 8);
  assert.equal(m.total.disabled, 1);
  // in a deploy group: a b c g bg = 5; left out: d e s
  assert.equal(m.cov.in, 5);
  assert.equal(m.cov.out, 3);
  assert.deepEqual(m.leftOut.map((r) => r.id), ["d", "e", "s"]);
  const d = m.leftOut.find((r) => r.id === "d");
  assert.deepEqual(Object.keys(d).sort(), ["id", "name", "type", "upn"], "a left-out row is who she is, not where she would go");
  assert.equal(d.type, "member");
  assert.equal(m.leftOut.some((r) => r.id === "z"), false, "a disabled account is never left out");
});

test("route in: nested through a group inside, or direct — nothing else", () => {
  const m = DeployDash.build(fixture());
  const glo = m.groups.find((r) => r.key === "GLO");
  assert.deepEqual(glo.route, { nested: 4, direct: 1 });
  assert.equal(glo.nestedGroups, 2);
  const int = m.groups.find((r) => r.key === "INT");
  assert.deepEqual(int.route, { nested: 2, direct: 1 });
  assert.deepEqual(m.route, { nested: 6, direct: 4 });
});

test("sortNames: the framework order first, then the rest alphabetically, case-free", () => {
  assert.deepEqual(DeployDash.sortNames(["CAD-SEC-U-DG-SA", "CAD-SEC-U-DG-fw", "CAD-SEC-U-DG-GLO", "CAD-SEC-U-DG-GUESTAdmins", "CAD-SEC-U-DG-INT", "CAD-SEC-U-DG-ADM"]),
    ["CAD-SEC-U-DG-GLO", "CAD-SEC-U-DG-INT", "CAD-SEC-U-DG-ADM", "CAD-SEC-U-DG-SA", "CAD-SEC-U-DG-fw", "CAD-SEC-U-DG-GUESTAdmins"]);
  assert.equal(DeployDash.keyOf("CAD-SEC-U-DG-GUESTUSERS"), "GUESTUSERS");
  assert.equal(DeployDash.keyOf("Other-DG-X"), "X");
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

test("html: app view carries the drill-throughs, the export carries none and no script, nothing points at 🌍", () => {
  const m = DeployDash.build(fixture({ readiness: new Map([["INT", DeployDash.readinessOf({ rows: [{ state: "ro", name: "CA201", seq: "CA201", forecast: { verdict: "notyet", blocked: [{ id: "a" }], prompted: [], unchanged: 1, silent: 0 } }] })]]) }));
  const app = DeployDash.html(m, { app: true, list: "leftout" });
  assert.match(app, /data-dd-wave="g-glo"/);
  assert.match(app, /data-dd-group="g-int"/);
  assert.match(app, /data-dd-who="dee@contoso.com"/);
  assert.match(app, /NOT YET · 1 locked out/);
  assert.match(app, /data-dd-list="leftout"/);
  assert.match(app, /3<\/b> left out of every deploy group/);
  assert.match(app, /2 groups nested inside/);
  assert.doesNotMatch(app, /data-dd-fill|data-dd-left|🌍|region source|Rule that would place/);
  const narrowed = DeployDash.html(m, { app: true, group: "INT" });
  assert.match(narrowed, /Route in · DG-INT/);
  assert.doesNotMatch(narrowed, /CAD-SEC-U-DG-GLO<\/button>/);
  const x = DeployDash.exportHtml(m, { tenant: "Contoso", build: "beta 32514", now: Date.UTC(2026, 9, 13) });
  assert.doesNotMatch(x, /<script/);
  assert.doesNotMatch(x, /data-dd-/);
  assert.match(x, /Left out — 3 enabled users/);
  assert.match(x, /dee@contoso.com/);
  assert.match(x, /2026-10-13/);
  assert.match(x, /<title>Deployment dashboard — Contoso<\/title>/);
});

test("csv: one row per group, then the left-out rows — who, not where", () => {
  const m = DeployDash.build(fixture());
  const csv = DeployDash.toCsv(m);
  const lines = csv.split("\r\n");
  assert.equal(lines[0].split(",")[0], "deploy_group");
  assert.doesNotMatch(lines[0], /by_hand/);
  assert.equal(lines.filter((l) => l.startsWith("CAD-SEC-U-DG-")).length, 5);
  assert.ok(lines.includes("left_out_upn,name,type"));
  assert.ok(lines.some((l) => l === "dee@contoso.com,d,member"));
});

// 0.3.0 (33208) — Mihai 10 Nov: "i dont think that the Covered · of every
// enabled user piechart is acurate": being in a deploy group no live policy
// includes is not coverage. The ring splits by the strongest state a policy on
// one of her groups gives her, and its centre is the ENFORCED share.
test("coverage splits by what a policy does: enforced, report-only only, no live policy, left out", () => {
  const base = DeployDash.build(fixture());
  assert.deepEqual({ enf: base.cov.enf, ro: base.cov.ro, none: base.cov.none, out: base.cov.out, in: base.cov.in }, { enf: 5, ro: 0, none: 0, out: 3, in: 5 }, "GLO is enforced and holds every grouped user");
  const f = fixture();
  f.users.push(U("n", "nora@contoso.com"));
  f.groups.find((g) => g.key === "EXT").direct = set("c", "n");           // EXT's only policy is off
  f.policies.find((p) => p.id === "p1").state = "enabledForReportingButNotEnforced";
  const m = DeployDash.build(f);
  // g: GUESTUSERS enforced (p4) beats GLO report-only → enf; a b c bg: GLO/INT report-only → ro; n: EXT (off) only → none
  assert.equal(m.cov.enf, 1);
  assert.equal(m.cov.ro, 4);
  assert.equal(m.cov.none, 1);
  assert.equal(m.cov.out, 3);
  assert.equal(m.cov.in, m.cov.enf + m.cov.ro + m.cov.none, "in a deploy group is still the sum");
  assert.equal(m.cov.enf + m.cov.ro + m.cov.none + m.cov.out, m.total.enabled, "every enabled user once");
  assert.deepEqual(m.noPolicy.map((r) => [r.id, r.groups]), [["n", ["DG-EXT"]]], "the no-policy list says which groups she sits in");
  const h = DeployDash.html(m, { app: true });
  assert.match(h, /targeted by an enforced policy/);
  assert.match(h, /data-dd-list="nopolicy"/);
  assert.match(h, /data-dd-list="leftout"/);
  assert.match(DeployDash.html(m, { app: true, list: "nopolicy" }), /In a deploy group, no live policy — 1 enabled user/);
  const x = DeployDash.exportHtml(m, { tenant: "T" });
  assert.match(x, /no live policy/i, "the export carries both lists");
  assert.match(DeployDash.toCsv(m), /no_live_policy_upn,name,type,deploy_groups\r\nnora@contoso.com,n,member,DG-EXT/);
});

// 0.4.0 (33303, Mihai 11 Nov): a site group nested in GLO and INT read "no
// group nested inside" and no policy. The row says where it is nested and
// counts the policies that reach it through those groups.
function nestFixture(extra) {
  const users = [U("a", "a@c.com"), U("b", "b@c.com"), U("x", "x@c.com"), U("y", "y@c.com")];
  const groups = [
    { key: "GLO", name: "CAD-SEC-U-DG-GLO", id: "g-glo", direct: set(), nested: set("a", "b"), children: [], childIds: ["g-int-sit", "g-ext-sit"] },
    { key: "INT", name: "CAD-SEC-U-DG-INT", id: "g-int", direct: set(), nested: set("a"), children: [], childIds: ["g-int-sit"] },
    { key: "EXT", name: "CAD-SEC-U-DG-EXT", id: "g-ext", direct: set(), nested: set("b"), children: [], childIds: ["g-ext-sit"] },
    { key: "INT-NL-Sittard", name: "CAD-SEC-U-DG-INT-NL-Sittard", id: "g-int-sit", direct: set("a"), nested: set(), dynamic: true },
    { key: "EXT-NL-Sittard", name: "CAD-SEC-U-DG-EXT-NL-Sittard", id: "g-ext-sit", direct: set("b"), nested: set(), dynamic: true },
    { key: "EXT-BD", name: "CAD-SEC-U-DG-EXT-BD", id: "g-ext-bd", direct: set("x"), nested: set(), dynamic: true },
    { key: "EXT-AU", name: "CAD-SEC-U-DG-EXT-AU", id: "g-ext-au", direct: set(), nested: set(), dynamic: true, ancestors: [{ id: "g-glo", name: "CAD-SEC-U-DG-GLO" }, { id: "g-ext", name: "CAD-SEC-U-DG-EXT" }] },
    { key: "EXT-PL", name: "CAD-SEC-U-DG-EXT-PL", id: "g-ext-pl", direct: set("y"), nested: set(), ancestors: [{ id: "sg-poland", name: "SG-Poland-All" }] },
  ];
  const policies = [
    { id: "p1", name: "CA001-Global", state: "enabled", includeGroups: ["g-glo"], excludeGroups: [], excludeUsers: [], excludeRoles: [] },
    { id: "p2", name: "CA200-Int-MFA", state: "enabledForReportingButNotEnforced", includeGroups: ["g-int"], excludeGroups: [], excludeUsers: [], excludeRoles: [] },
    { id: "p3", name: "CA300-Ext", state: "enabled", includeGroups: ["g-ext", "g-glo"], excludeGroups: [], excludeUsers: [], excludeRoles: [] },
    { id: "p4", name: "CA500-Poland", state: "enabled", includeGroups: ["sg-poland"], excludeGroups: [], excludeUsers: [], excludeRoles: [] },
  ];
  return Object.assign({ users, groups, policies }, extra || {});
}

test("nested in: deploy-group parents from childIds, outside parents from ancestors, inherited policies counted once", () => {
  const m = DeployDash.build(nestFixture());
  const row = (k) => m.groups.find((r) => r.key === k);
  const sit = row("INT-NL-Sittard");
  assert.deepEqual(sit.nestedIn.map((a) => a.label), ["GLO", "INT"]);
  assert.deepEqual(sit.polDirect, { enf: 0, ro: 0, off: 0 });
  assert.deepEqual(sit.pol, { enf: 2, ro: 1, off: 0 }, "CA001 + CA300 via GLO, CA200 via INT — each once");
  assert.ok(sit.look.some((l) => l.kind === "through" && l.text === "targeted through GLO · INT"));
  const ext = row("EXT-NL-Sittard");
  assert.deepEqual(ext.nestedIn.map((a) => a.label), ["GLO", "EXT"]);
  assert.equal(ext.pol.enf, 2, "CA300 includes both GLO and EXT — counted once");
  const bd = row("EXT-BD");
  assert.deepEqual(bd.nestedIn, []);
  assert.ok(bd.look.some((l) => l.kind === "untargeted" && /nest it in GLO \+ EXT/.test(l.text)));
  assert.ok(row("EXT-AU").look.some((l) => l.text === "empty group"));
  const pl = row("EXT-PL");
  assert.deepEqual(pl.nestedIn.map((a) => [a.label, a.dg]), [["SG-Poland-All", false]]);
  assert.equal(pl.pol.enf, 1, "a parent outside CAD-SEC-U-DG-* brings its policy");
  assert.equal(row("GLO").nestedIn.length, 0);
  assert.deepEqual(row("GLO").pol, { enf: 2, ro: 0, off: 0 }, "a parent's own count is untouched");
  // coverage: y is targeted through the outside parent, x through nothing
  assert.equal(m.cov.enf, 3);
  assert.equal(m.cov.none, 1);
  assert.equal(m.noPolicy[0].upn, "x@c.com");
});

test("nested in: chips, the via line, jump buttons only in the app, and the CSV columns", () => {
  const m = DeployDash.build(nestFixture());
  const app = DeployDash.html(m, { app: true });
  assert.match(app, /data-dd-row="g-int-sit"/);
  assert.match(app, /data-dd-jump="g-glo"[^>]*>↑ GLO</);
  assert.match(app, /<b>0<\/b> direct · 2 via GLO · 1 via INT/);
  assert.match(app, /dd-up-out[^>]*>↑ SG-Poland-All</, "an outside parent is a grey chip, not a jump");
  assert.match(app, /nested in nothing/);
  assert.match(app, /targeted through GLO · INT/);
  const x = DeployDash.exportHtml(m, { tenant: "T" });
  assert.doesNotMatch(x, /data-dd-jump|data-dd-row/);
  assert.match(x, /↑ GLO/);
  const csv = DeployDash.toCsv(m);
  assert.match(csv, /needs_a_look,nested_in,policies_direct/);
  assert.match(csv, /CAD-SEC-U-DG-INT-NL-Sittard,.*"CAD-SEC-U-DG-GLO; CAD-SEC-U-DG-INT",0/);
});

test("nested in: a two-level chain is closed — a group under a region group under GLO is in both", () => {
  const f = nestFixture();
  f.groups.push({ key: "INT-NL", name: "CAD-SEC-U-DG-INT-NL", id: "g-int-nl", direct: set(), nested: set("a"), children: [], childIds: ["g-int-sit"] });
  f.groups[0].childIds = ["g-int-nl", "g-ext-sit"];
  f.groups[1].childIds = ["g-int-nl"];
  const sit = DeployDash.build(f).groups.find((r) => r.key === "INT-NL-Sittard");
  assert.deepEqual(sit.nestedIn.map((a) => a.label).sort(), ["GLO", "INT", "INT-NL"]);
});
