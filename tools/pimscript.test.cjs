// 🚀 Deploy — the script where no API exists (js/pimscript.js), offline.
// Run: node --test tools/pimscript.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PS = new Function(read("js/pimscript.js") + ";return PimScript;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const tenant = () => { const d = clone(DEMO.pim); return { roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, aus: d.aus, named: d.named }; };
const ids = { "PIM-SG-EXO-Recipients": "11111111-1111-4111-8111-111111111111", "PIM-SG-PUR-eDiscovery": "22222222-2222-4222-8222-222222222222" };
const lookup = (n) => ids[n] || null;

test("forPlan: one script per workload, every Exchange and Purview group of the profile, ids where known", () => {
  const res = PB.compare(PB.profile(CAT, "large"), tenant());
  const out = PS.forPlan(CAT, res, lookup, { domain: "contoso.nl" });
  assert.deepEqual(out.map((x) => x.kind), ["exchange", "purview"]);
  const exo = out[0], pur = out[1];
  assert.equal(exo.entries.length, 4); assert.equal(pur.entries.length, 5);
  assert.equal(exo.file, "pim-exchange.contoso.nl.ps1");
  assert.equal(exo.entries.find((e) => e.group === "PIM-SG-EXO-Recipients").groupId, ids["PIM-SG-EXO-Recipients"]);
  assert.equal(exo.entries.find((e) => e.group === "PIM-SG-EXO-Reader").groupId, null, "a group not yet created has no id");
  assert.match(exo.text, /Connect-ExchangeOnline .*-Organization 'contoso\.nl'/);
  assert.match(pur.text, /Connect-IPPSSession/);
  assert.match(exo.text, /roleGroup = 'Recipient Management'; member = 'PIM-SG-EXO-Recipients'; memberId = '11111111-1111-4111-8111-111111111111'/);
  assert.match(exo.text, /memberId = \$null/, "an unknown id is resolved by name and said so");
  assert.match(exo.text, /Add-RoleGroupMember -Identity \$b\.roleGroup -Member \$id/);
  assert.match(pur.text, /roleGroup = 'eDiscovery Manager'/);
  assert.match(exo.text, /pim-exchange-outcome\./);
});

test("forPlan: sections off leave their script out; the small profile has Recipients only and two Purview groups", () => {
  const res = PB.compare(PB.profile(CAT, "small"), tenant());
  const out = PS.forPlan(CAT, res, lookup, { domain: "contoso.nl", on: (k) => k !== "purview" });
  assert.deepEqual(out.map((x) => x.kind), ["exchange"]);
  assert.deepEqual(out[0].entries.map((e) => e.target), ["Recipient Management"]);
  const all = PS.forPlan(CAT, res, lookup, { domain: "contoso.nl" });
  assert.deepEqual(all[1].entries.map((e) => e.group).sort(), ["PIM-SG-PUR-InfoProtection", "PIM-SG-PUR-eDiscovery"]);
});

test("forPlan: a region adds the scoped Exchange script — one line per role, the unit by id when known", () => {
  const R = PB.region(CAT, { code: "EU-NL", name: "Netherlands", attribute: "extensionAttribute1", value: "EU-NL", devicePrefix: "NL-", autopilotTag: "EU-NL", approvers: [], itLead: "", timezone: "" });
  const res = PB.compare(PB.profile(CAT, "multi"), tenant());
  const out = PS.forPlan(CAT, res, lookup, { domain: "contoso.nl", regions: [R], au: (n) => (n === "AU-EU-NL-Users" ? "au-nl" : null) });
  const reg = out.find((x) => x.kind === "exchange-regional");
  assert.ok(reg, "regional script");
  assert.deepEqual(reg.entries.map((e) => e.group), ["PIM-SG-EXO-Recipients-EU-NL", "PIM-SG-EXO-HelpDesk-EU-NL"]);
  assert.equal(reg.entries[0].roles.length, 8); assert.equal(reg.entries[1].roles.length, 3);
  assert.equal((reg.text.match(/New-ManagementRoleAssignment/g) || []).length, 1, "one call site, looped");
  assert.equal((reg.text.match(/role = '/g) || []).length, 11);
  assert.match(reg.text, /unit = 'AU-EU-NL-Users'; unitId = 'au-nl'/);
  assert.match(reg.text, /-RecipientAdministrativeUnitScope \$uid/);
  const none = PS.forPlan(CAT, res, lookup, { domain: "contoso.nl", regions: [R], on: (k) => k !== "regions" });
  assert.ok(!none.some((x) => x.kind === "exchange-regional"));
});

test("the script carries names, ids and a domain — never a secret, a token or a password", () => {
  const res = PB.compare(PB.profile(CAT, "large"), tenant());
  for (const x of PS.forPlan(CAT, res, lookup, { domain: "contoso.nl" })) {
    assert.doesNotMatch(x.text, /password|secret|token|clientsecret|credential\s*=/i, x.kind);
    assert.doesNotMatch(x.text, /Connect-MgGraph|Invoke-RestMethod|Invoke-WebRequest/, "nothing but the Exchange module");
    assert.match(x.text, /^#Requires -Version 7$/m);
    for (const e of x.entries) assert.ok(x.text.includes(`'${e.group}'`), `${e.group} named`);
  }
});

test("readOutcome: shape checked, statuses normalised, verified list and summary", () => {
  const good = JSON.stringify({ kind: "exchange", tenant: "contoso.nl", ran: "2026-10-13T08:00:00Z", results: [
    { roleGroup: "Recipient Management", member: "PIM-SG-EXO-Recipients", memberId: "x", status: "added", error: null },
    { roleGroup: "Help Desk", member: "PIM-SG-EXO-HelpDesk", memberId: "y", status: "present", error: null },
    { roleGroup: "Hygiene Management", member: "PIM-SG-EXO-Hygiene", memberId: "z", status: "failed", error: "The operation couldn't be performed because object 'z' couldn't be found" },
    { roleGroup: "View-Only Organization Management", member: "PIM-SG-EXO-Reader", memberId: null, status: "weird", error: "<script>" },
  ] });
  const r = PS.readOutcome(good);
  assert.equal(r.ok, true); assert.equal(r.kind, "exchange");
  assert.deepEqual(r.summary, { present: 1, added: 1, failed: 1, unknown: 1 });
  assert.deepEqual(r.verified, ["PIM-SG-EXO-Recipients→Recipient Management", "PIM-SG-EXO-HelpDesk→Help Desk"]);
  assert.equal(r.results[3].status, "unknown", "an unknown status is never a pass");
  assert.equal(r.results[2].error.length <= 300, true);
  assert.equal(PS.readOutcome("not json").ok, false);
  assert.equal(PS.readOutcome(JSON.stringify({ kind: "exchange" })).ok, false);
  assert.match(PS.readOutcome(JSON.stringify({ kind: "ssh", results: [] })).error, /unknown kind/);
  const reg = PS.readOutcome(JSON.stringify({ kind: "exchange-regional", results: [{ role: "Mail Recipients", group: "PIM-SG-EXO-Recipients-EU-NL", unit: "AU-EU-NL-Users", status: "added" }] }));
  assert.deepEqual(reg.verified, ["PIM-SG-EXO-Recipients-EU-NL→AU-EU-NL-Users:Mail Recipients"]);
});

test("Deploy attaches the scripts to the plan when the module is loaded, and the By hand lines name no .ps1 of the repo", () => {
  const PD = new Function(read("js/pimplan.js") + read("js/intunerbac.js") + read("js/pimbaseline.js") + read("js/pimscript.js") + read("js/pimdeploy.js") + ";return PimDeploy;")();
  const t = tenant(); t.domain = "contoso.nl";
  const P = PD.build(PB.profile(CAT, "large"), t, { domain: "contoso.nl" });
  assert.ok(Array.isArray(P.scripts) && P.scripts.length === 2, "exchange and purview scripts on the plan");
  assert.ok(P.manual.some((m) => /^Exchange RBAC: run the script Deploy generates/.test(m)));
  assert.ok(P.manual.some((m) => /^Purview: run the script Deploy generates/.test(m)));
  assert.ok(!P.manual.some((m) => /\.ps1/.test(m)) && !P.findings.some((f) => /\.ps1/.test(f)), "no repo script is named in customer copy");
  assert.ok(P.ops.some((o) => o.key === "group:PIM-SG-PUR-eDiscovery" && o.section === "purview"));
});
