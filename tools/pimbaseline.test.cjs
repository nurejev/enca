// 🧬 PIM baseline (T48) — the catalog, the compare and the export, offline.
// Run: node --test tools/pimbaseline.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const tenant = () => { const d = DEMO.pim; return { roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, names: d.names, demo: true, readAt: 0 }; };

test("catalog: every role names a template that exists, every via names a group that exists, names are unique", () => {
  const groups = new Set(CAT.groups.map((g) => g.name));
  const seen = new Set();
  for (const r of CAT.roles) {
    assert.ok(CAT.templates[r.template], `${r.name}: template ${r.template}`);
    assert.ok(!seen.has(r.name), `${r.name} twice`); seen.add(r.name);
    for (const g of r.via || []) assert.ok(groups.has(g), `${r.name} via ${g}`);
  }
  for (const g of CAT.groups) { assert.ok(CAT.templates[g.template], `${g.name}: template`); assert.match(g.name, new RegExp(CAT.naming.pattern)); }
  assert.equal(new Set(CAT.groups.map((g) => g.name)).size, CAT.groups.length);
});

test("catalog: Tier 0 asks context c1 without MFA-on-activation (Entra refuses both), approval by PIM-SG-Approvers", () => {
  for (const t of ["Tier0", "GroupTier0"]) {
    const e = PB.fromTemplate(CAT.templates[t]);
    assert.equal(e.authContext, "c1"); assert.ok(!e.enablement.includes("MultiFactorAuthentication"), t);
    assert.equal(e.approval, true); assert.deepEqual(e.approvers, ["PIM-SG-Approvers"]);
    assert.equal(e.permEligible, false); assert.equal(e.permActive, false);
  }
  const ga = PB.expected(CAT, CAT.roles.find((r) => r.name === "Global Administrator"));
  assert.equal(ga.activation, "PT1H", "the 1.3 exception carried as an override");
  const dr = PB.expected(CAT, CAT.roles.find((r) => r.name === "Directory Readers"));
  assert.equal(dr.permActive, true);
});

test("fromRules reads Graph's rule ids into the same shape the templates give", () => {
  const rules = DEMO.pim.policies["Global Administrator"];
  const got = PB.fromRules(rules, DEMO.pim.names);
  const exp = PB.expected(CAT, CAT.roles.find((r) => r.name === "Global Administrator"));
  assert.deepEqual(PB.diff(exp, got), [], "the demo sets Global Administrator exactly right");
  const ex = PB.fromRules(DEMO.pim.policies["Exchange Administrator"], DEMO.pim.names);
  assert.equal(ex.activation, "PT24H");
});

test("compare on the demo: the deliberate differences, the findings, the group model", () => {
  const res = PB.compare(CAT, tenant());
  assert.equal(res.counts.roles, CAT.roles.length);
  assert.equal(res.counts.missing, 0);
  const row = (n) => res.rows.find((r) => r.name === n);
  assert.equal(row("Global Administrator").status, "match");
  assert.equal(row("Conditional Access Administrator").status, "match");
  assert.equal(row("Privileged Role Administrator").status, "differs");
  assert.deepEqual(row("Privileged Role Administrator").diffs.map((d) => d.key), ["approval", "approvers"]);
  const ex = row("Exchange Administrator");
  assert.equal(ex.status, "differs");
  assert.deepEqual(ex.diffs.map((d) => d.key), ["activation"]);
  assert.ok(ex.findings.some((f) => /permanent active outside/.test(f) && /Admins-Legacy/.test(f)));
  assert.ok(ex.findings.some((f) => /not eligible through PIM-SG-M365-AppOps/.test(f)));
  assert.equal(row("Global Administrator").permanent, 3);
  assert.equal(row("Global Administrator").protectedPermanent, 2, "the two break-glass accounts are protected");
  assert.equal(row("Global Administrator").permanentOutside, 1);
  assert.equal(res.permanentOutside, 3);
  const g = (n) => res.groups.find((x) => x.name === n);
  assert.equal(g("PIM-SG-M365-GlobalAdmin").status, "match");
  assert.equal(g("PIM-SG-M365-SecOps").status, "differs");
  assert.ok(g("PIM-SG-M365-SecOps").missingRoles.includes("Compliance Data Administrator"));
  assert.ok(g("PIM-SG-M365-SecOps").diffs.some((d) => d.key === "approval"));
  assert.equal(g("PIM-SG-M365-Helpdesk").roleAssignable, false);
  assert.equal(g("PIM-SG-M365-AppOps").present, false);
  assert.deepEqual(res.extraGroups, ["CAB-SEC-U-Admins-Legacy"]);
  assert.equal(res.gcounts.present, 5); assert.equal(res.gcounts.total, 7);
});

test("diff ignores what cannot matter: the maximum under permanent, the approvers under no approval", () => {
  const a = PB.fromTemplate(CAT.templates.Reader);
  const b = Object.assign({}, a, { maxEligible: "P30D" });
  assert.deepEqual(PB.diff(a, b), [], "permanent eligibility allowed on both sides makes the maximum moot");
  const c = Object.assign({}, PB.fromTemplate(CAT.templates.Tier1), { approvers: ["Somebody"] });
  assert.deepEqual(PB.diff(PB.fromTemplate(CAT.templates.Tier1), c), []);
});

test("toOrchestrator: the whole framework, then a delta of two roles and one group", () => {
  const all = PB.toOrchestrator(CAT, { domain: "cloudfellows.dev" });
  assert.equal(Object.keys(all.EntraRoles.Policies).length, CAT.roles.length);
  assert.equal(Object.keys(all.GroupRoles.Policies).length, CAT.groups.length);
  assert.deepEqual(all.EntraRoles.Policies["Global Administrator"], { Template: "Tier0", ActivationDuration: "PT1H" });
  assert.equal(all.PolicyTemplates.Tier0.Approvers[0].description, "PIM-SG-Approvers");
  assert.equal(all.PolicyTemplates.Tier0.Notification_Activation_Alert.Recipients[0], "pim-alerts@cloudfellows.dev");
  assert.equal(all.PolicyTemplates.Tier0.Notification_Activation_Alert.isDefaultRecipientEnabled, "true", "EasyPIM wants the string");
  assert.ok(all.ProtectedUsers.some((p) => /PIM-SG-M365-GlobalAdmin/.test(p)));
  assert.ok(JSON.stringify(all).length > 5000);
  const delta = PB.toOrchestrator(CAT, { domain: "contoso.nl", delta: true, roles: ["Exchange Administrator", "Privileged Role Administrator"], groups: ["PIM-SG-M365-AppOps"] });
  assert.deepEqual(Object.keys(delta.EntraRoles.Policies).sort(), ["Exchange Administrator", "Privileged Role Administrator"]);
  assert.deepEqual(Object.keys(delta.GroupRoles.Policies), ["PIM-SG-M365-AppOps"]);
  assert.deepEqual(Object.keys(delta.PolicyTemplates).sort(), ["GroupTier2", "Tier0", "Tier1"]);
  const roles = delta.Assignments.EntraRoles.map((a) => a.roleName);
  assert.ok(roles.includes("Exchange Administrator") && roles.includes("Cloud Application Administrator"), "the ticked group's eligibilities come along");
  assert.ok(!roles.includes("Global Administrator"));
  assert.match(PB.command("pim-delta.contoso.nl.json", "contoso.nl"), /-Mode delta -WhatIf$/);
});

test("render and toMd hold every role and group and escape names", () => {
  const res = PB.compare(CAT, tenant());
  const html = PB.tiles(res) + PB.render(res, { filter: "all" });
  for (const r of CAT.roles) assert.ok(html.includes(`<b>${r.name}</b>`), r.name);
  for (const g of CAT.groups) assert.ok(html.includes(`<b>${g.name}</b>`), g.name);
  assert.ok(!/<b>[^<]*<script/.test(html));
  assert.ok(PB.render(res, { filter: "differs" }).includes("Exchange Administrator"));
  assert.ok(!PB.render(res, { filter: "differs" }).includes("<b>Global Administrator</b>"));
  const md = PB.toMd(res, "Contoso");
  assert.match(md, /^# 🧬 PIM baseline — Contoso/);
  assert.ok(md.split("\n").filter((l) => l.startsWith("| ")).length > CAT.roles.length + CAT.groups.length);
});

test("the committed tools/pim/pim-baseline.json is the catalog's own export", () => {
  const file = JSON.parse(read("tools/pim/pim-baseline.json"));
  const fresh = PB.toOrchestrator(CAT, { domain: "cloudfellows.dev" });
  assert.deepEqual(file.PolicyTemplates, fresh.PolicyTemplates);
  assert.deepEqual(file.EntraRoles, fresh.EntraRoles);
  assert.deepEqual(file.GroupRoles, fresh.GroupRoles);
  assert.deepEqual(file.Assignments, fresh.Assignments);
});
