// 📋 PIM report (T55) — the pure model, offline. Built on the demo tenant the
// way 🧬's own tests are, then bent one way per test: an extra role on a job
// group, a missing link, Tier 0 left at Microsoft's default, approval routed
// to an empty group, the baseline tenant carrying every profile, and the
// export carrying its picture inside the file.
// Run: node --test tools/pimreport.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const PR = require(path.join(__dirname, "..", "js", "pimreport.js"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const MULTI = PB.profile(CAT, "multi");

function tenant(over = {}) {
  const d = clone(DEMO.pim);
  return Object.assign({ roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, names: {}, aus: d.aus || [], named: d.groups, readAt: Date.parse("2026-10-12T11:40:00Z") }, over);
}
function report(raw, extra = {}, cat = MULTI) {
  const res = PB.compare(cat, raw);
  const members = {};
  (raw.named || raw.groups || []).forEach((g) => { members[g.id] = { read: true, active: [], eligible: [] }; });
  return PR.build(Object.assign({ cat, res, raw, members: extra.members || members, tenant: "contoso.nl", readAt: raw.readAt }, extra));
}
const groupId = (raw, n) => (raw.groups.find((g) => g.displayName === n) || {}).id;
const finding = (m, id) => m.findings.find((f) => f.id === id);

test("the model has every part the screen and the export use", () => {
  const m = report(tenant());
  for (const k of ["tiles", "findings", "matrix", "roleSettings", "groupSettings", "groups", "approvers", "outside", "people", "counts"]) assert.ok(k in m, k);
  assert.equal(m.tiles.length, 5);
  assert.ok(m.matrix.cells.length > 0, "the demo groups hold roles");
  for (const c of m.matrix.cells) assert.ok(["match", "extra", "wrong", "missing", "scoped"].includes(c.verdict), c.verdict);
  for (const f of m.findings) { assert.ok(PR.SEV[f.sev], f.id); assert.ok(f.impact && f.recovery, `${f.id}: impact and way back`); }
});

test("a role a job group holds outside the catalog is an extra cell and a finding naming group and role", () => {
  const raw = tenant();
  const ops = raw.groups.find((g) => /^PIM-SG-M365-Ops$/.test(g.displayName));
  assert.ok(ops, "demo has PIM-SG-M365-Ops");
  raw.active.push({ roleName: "Exchange Recipient Administrator", principalId: ops.id, principalName: ops.displayName, principalType: "Group", endDateTime: null, assignmentType: "Assigned", directoryScopeId: "/" });
  const m = report(raw);
  const c = m.matrix.cells.find((x) => x.group === "PIM-SG-M365-Ops" && x.role === "Exchange Recipient Administrator");
  assert.equal(c && c.verdict, "extra");
  const f = finding(m, "links-extra");
  assert.ok(f && /PIM-SG-M365-Ops: Exchange Recipient Administrator/.test(f.detail));
});

test("a link the catalog expects but the tenant lacks is a missing cell and a high finding", () => {
  const raw = tenant();
  const ops = groupId(raw, "PIM-SG-M365-Ops");
  const before = raw.active.length;
  const drop = raw.active.findIndex((a) => a.principalId === ops && a.roleName === "Intune Administrator");
  assert.ok(drop >= 0, "the demo Ops group holds Intune Administrator");
  raw.active.splice(drop, 1);
  assert.equal(raw.active.length, before - 1);
  const m = report(raw);
  assert.ok(m.matrix.cells.some((c) => c.group === "PIM-SG-M365-Ops" && c.role === "Intune Administrator" && c.verdict === "missing"));
  const f = finding(m, "links");
  assert.equal(f && f.sev, "high");
});

test("Tier 0 at Microsoft's default is a high finding on the direct path; the job path's policy is judged on its own", () => {
  const raw = tenant();
  const deflt = [
    { id: "Expiration_EndUser_Assignment", isExpirationRequired: true, maximumDuration: "PT8H" },
    { id: "Enablement_EndUser_Assignment", enabledRules: ["MultiFactorAuthentication", "Justification"] },
    { id: "Approval_EndUser_Assignment", setting: { isApprovalRequired: false, approvalStages: [{ primaryApprovers: [] }] } },
    { id: "AuthenticationContext_EndUser_Assignment", isEnabled: false, claimValue: null },
    { id: "Expiration_Admin_Eligibility", isExpirationRequired: false, maximumDuration: "P365D" },
    { id: "Expiration_Admin_Assignment", isExpirationRequired: true, maximumDuration: "P180D" },
  ];
  raw.policies = Object.assign({}, raw.policies, { "Global Administrator": deflt });
  const m = report(raw);
  const f = finding(m, "tier0-policy");
  assert.ok(f, "found");
  assert.equal(f.sev, "high");
  assert.match(f.detail, /Global Administrator: 8 h/);
  assert.equal(m.tiles.find((t) => t.key === "rpol").state, "bad");
  const ga = m.roleSettings.find((r) => r.role === "Global Administrator");
  assert.equal(ga.path, "direct");
});

test("approval switched on with an empty approver group is a finding; with two approvers it is not", () => {
  const raw = tenant();
  const ga = raw.groups.find((g) => g.displayName === "PIM-SG-M365-GlobalAdmin");
  const ap = { id: "ap-1", displayName: "PIM-SG-Approvers", isAssignableToRole: false };
  raw.named = [...raw.groups, ap];
  raw.names = { "ap-1": "PIM-SG-Approvers" };
  raw.groupPolicies = Object.assign({}, raw.groupPolicies, { [ga.id]: [{ id: "Approval_EndUser_Assignment", setting: { isApprovalRequired: true, approvalStages: [{ primaryApprovers: [{ groupId: "ap-1" }] }] } }] });
  const empty = {}; raw.named.forEach((g) => { empty[g.id] = { read: true, active: [], eligible: [] }; });
  const m = report(raw, { members: empty });
  assert.ok(finding(m, "approvers-empty"), "empty approvers found");
  const full = clone(empty); full["ap-1"] = { read: true, active: [{ id: "u1", name: "Anna" }, { id: "u2", name: "Bob" }], eligible: [] };
  assert.equal(finding(report(raw, { members: full }), "approvers-empty"), undefined);
});

test("members not read are said, never counted as empty", () => {
  const raw = tenant();
  const m = report(raw, { members: {} });
  assert.ok(m.people.unread.length > 0);
  assert.equal(finding(m, "no-people") && /not read/.test(finding(m, "no-people").detail), true);
});

test("the baseline tenant: another profile's link is expected, not extra", () => {
  const raw = tenant();
  const ops = raw.groups.find((g) => g.displayName === "PIM-SG-M365-Ops");
  raw.active.push({ roleName: "Exchange Recipient Administrator", principalId: ops.id, principalName: ops.displayName, principalType: "Group", endDateTime: null, assignmentType: "Assigned", directoryScopeId: "/" });
  const m = report(raw, { alsoCarries: { "PIM-SG-M365-Ops": ["Exchange Recipient Administrator"] } });
  const c = m.matrix.cells.find((x) => x.group === "PIM-SG-M365-Ops" && x.role === "Exchange Recipient Administrator");
  assert.equal(c.verdict, "match");
});

test("standing Global Administrators outside PIM: break-glass marked by the framework's pattern", () => {
  const raw = tenant();
  raw.active.push({ roleName: "Global Administrator", principalId: "u-bg", principalName: "BreakGlass-01", principalType: "User", endDateTime: null, assignmentType: "Assigned", directoryScopeId: "/" });
  raw.active.push({ roleName: "Global Administrator", principalId: "u-x", principalName: "Someone Admin", principalType: "User", endDateTime: null, assignmentType: "Assigned", directoryScopeId: "/" });
  const m = report(raw);
  const bg = m.outside.find((o) => o.id === "u-bg"), x = m.outside.find((o) => o.id === "u-x");
  assert.ok(bg.protected, "break-glass by pattern");
  assert.ok(!x.protected);
  assert.ok(finding(m, "standing-ga"));
});

test("Markdown: one file, the diagram embedded as an SVG data URI, no HTML tags, every section", () => {
  const m = report(tenant());
  const md = PR.toMd(m, { build: 32507 });
  const imgs = md.match(/!\[[^\]]*\]\(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+\)/g) || [];
  assert.equal(imgs.length, 1);
  const svg = Buffer.from(imgs[0].split("base64,")[1].slice(0, -1), "base64").toString("utf8");
  assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(!/<script/i.test(svg));
  const text = md.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  assert.ok(!/<\/?(b|i|em|strong|br|code|div|span)\b/i.test(text), "plain Markdown");
  for (const h of ["## Summary", "## How access flows", "## Findings", "## Roles vs groups", "## Settings", "## People", "## Standing access outside PIM", "## What was read"]) assert.ok(md.includes(h), h);
});

test("CSV: a header and one row per matrix cell", () => {
  const m = report(tenant());
  const rows = PR.toCsv(m).trim().split("\r\n");
  assert.equal(rows[0], '"Role","Tier","Group","Group kind","How","Scope","Ends","Verdict"');
  assert.equal(rows.length - 1, m.matrix.cells.length);
});

test("render: every tab paints and escapes what it shows", () => {
  const raw = tenant();
  raw.active.push({ roleName: "Global Administrator", principalId: "u-y", principalName: "<img src=x onerror=alert(1)>", principalType: "User", endDateTime: null, assignmentType: "Assigned", directoryScopeId: "/" });
  const m = report(raw);
  for (const tab of ["findings", "matrix", "settings", "people", "outside"]) {
    const h = PR.render(m, { tab });
    assert.ok(h.length > 100, tab);
    assert.ok(!h.includes("<img src=x"), `${tab} escapes`);
  }
  assert.equal(PR.tabs(m).length, 5);
});
