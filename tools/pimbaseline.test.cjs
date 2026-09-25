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

test("the committed tools/pim/pim-baseline.json is the catalog's own export — every profile's groups, for the baseline tenant", () => {
  const file = JSON.parse(read("tools/pim/pim-baseline.json"));
  const fresh = PB.toOrchestrator(CAT, { domain: "cloudfellows.dev", everyProfile: true });
  assert.ok(Object.keys(file.GroupRoles.Policies).includes("PIM-SG-AZ-Sub-Owner"), "the small profile's Azure groups are there too");
  for (const id of ["small", "multi"]) assert.deepEqual(JSON.parse(read(`tools/pim/pim-baseline.${id}.json`)).GroupRoles, PB.toOrchestrator(PB.profile(CAT, id), { domain: "<tenant domain>" }).GroupRoles, id);
  assert.deepEqual(file.PolicyTemplates, fresh.PolicyTemplates);
  assert.deepEqual(file.EntraRoles, fresh.EntraRoles);
  assert.deepEqual(file.GroupRoles, fresh.GroupRoles);
  assert.deepEqual(file.Assignments, fresh.Assignments);
});

test("profiles: small folds Tier0, Helpdesk and AppOps into four groups and drops approval off the Tier 0 roles; multi is the base plus regions", () => {
  const small = PB.profile(CAT, "small"), multi = PB.profile(CAT, "multi");
  assert.deepEqual(small.groups.map((g) => g.name), ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-SecOps", "PIM-SG-M365-Ops", "PIM-SG-M365-SecOpsReader", "PIM-SG-AZ-Tenant-Owner", "PIM-SG-AZ-Sub-Owner", "PIM-SG-AZ-Sub-Contributor"]);
  const role = (cat, n) => cat.roles.find((r) => r.name === n);
  assert.deepEqual(role(small, "Privileged Role Administrator").via, ["PIM-SG-M365-GlobalAdmin"]);
  assert.deepEqual(role(small, "Helpdesk Administrator").via, ["PIM-SG-M365-Ops"]);
  assert.deepEqual(role(small, "Exchange Administrator").via, ["PIM-SG-M365-Ops"], "Ops and AppOps collapse to one");
  assert.equal(PB.expected(small, role(small, "Privileged Role Administrator")).approval, false);
  assert.equal(PB.expected(small, role(small, "Privileged Role Administrator")).authContext, "c1");
  assert.equal(PB.expected(small, role(small, "Global Administrator")).activation, "PT2H");
  assert.equal(PB.expected(small, role(small, "Exchange Administrator")).alertActivation, "Critical");
  assert.equal(PB.expected(small, small.groups[0]).approval, true, "the GlobalAdmin group keeps its gate");
  assert.equal(PB.expected(small, small.groups[1]).approval, false, "SecOps has none in a small business");
  assert.equal(multi.groups.length, CAT.groups.length); assert.ok(multi.profile.regions); assert.equal(multi.profile.rmau[0].name, "AU-RM-Admins");
  assert.equal(PB.expected(multi, role(multi, "Global Administrator")).activation, "PT1H", "the base stays");
  const res = PB.compare(small, tenant());
  assert.equal(res.gcounts.total, 4); assert.equal(res.profile.id, "small");
  assert.ok(res.rows.find((r) => r.name === "Global Administrator").diffs.some((d) => d.key === "activation"));
  assert.ok(!res.rows.find((r) => r.name === "Privileged Role Administrator").diffs.some((d) => d.key === "approval"), "the demo's PRA without approval is what the small profile wants");
  assert.equal(Object.keys(PB.toOrchestrator(small, { domain: "x.nl" }).GroupRoles.Policies).length, 7);
});

test("regions: the file is parsed with defaults and named errors, a row fills the template, the demo compares per region", () => {
  const pr = PB.parseRegions(CAT.regions.example, CAT);
  assert.deepEqual(pr.errors, []); assert.equal(pr.rows.length, 2);
  assert.deepEqual(pr.rows[0].approvers, ["a@contoso.nl", "b@contoso.nl"]); assert.equal(pr.rows[1].devicePrefix, "DE-");
  const bad = PB.parseRegions("code,name\nnl,Netherlands\nEU-NL,NL\nEU-NL,Again\nNA-US,", CAT);
  assert.equal(bad.rows.length, 2); assert.ok(bad.errors.some((e) => /Row 2/.test(e) && /nl/i.test(e))); assert.ok(bad.errors.some((e) => /twice/.test(e)));
  assert.equal(bad.rows[1].name, "NA-US"); assert.equal(bad.rows[1].value, "NA-US"); assert.equal(bad.rows[1].devicePrefix, "US-");
  const json = PB.parseRegions(JSON.stringify([{ code: "apac-sg", name: "Singapore", approvers: ["x@y.z"] }]), CAT);
  assert.equal(json.rows[0].code, "APAC-SG"); assert.deepEqual(json.rows[0].approvers, ["x@y.z"]);
  assert.ok(PB.parseRegions("", CAT).errors.length);
  const r = PB.region(CAT, pr.rows[0]);
  assert.equal(r.aus[0].name, "AU-EU-NL-Users"); assert.equal(r.aus[0].rule, '(user.extensionAttribute1 -eq "EU-NL")');
  assert.match(r.aus[1].rule, /device\.displayName -startsWith "NL-"/);
  assert.equal(r.groups[2].members, "a@contoso.nl; b@contoso.nl");
  assert.equal(r.eligibilities.length, 8); assert.ok(r.eligibilities.every((e) => /^AU-EU-NL-/.test(e.au)));
  assert.equal(r.intune.assignments[1].roles[0], "INT-ROLE-Regional-Ops"); assert.equal(r.intune.tag.name, "INT-TAG-EU-NL");
  // the demo tenant
  const d = DEMO.pim; const t = Object.assign(tenant(), { aus: d.aus, named: d.named });
  const multi = PB.profile(CAT, "multi");
  const rows = PB.parseRegions(d.regionsCsv, CAT).rows;
  const cr = PB.compareRegions(multi, rows, t);
  assert.equal(cr.totals.regions, 2); assert.equal(cr.central[0].status, "match");
  const nl = cr.regions[0], de = cr.regions[1];
  assert.equal(nl.items.find((i) => i.name === "AU-EU-NL-Devices").status, "differs");
  assert.equal(nl.items.find((i) => i.name === "AU-EU-NL-Users").status, "match");
  const ua = nl.items.find((i) => /^User Administrator/.test(i.name)); assert.equal(ua.status, "missing"); assert.match(ua.detail, /TENANT scope/);
  assert.equal(nl.items.find((i) => /^Helpdesk Administrator/.test(i.name)).status, "match");
  assert.equal(nl.items.find((i) => i.name === "INT-SG-DEV-EU-NL-All").status, "match");
  assert.equal(nl.items.find((i) => i.name === "INT-TAG-EU-NL").status, "unread");
  assert.equal(de.items.find((i) => i.name === "PIM-SG-EU-DE-Ops").status, "match");
  assert.equal(de.items.find((i) => i.name === "AU-EU-DE-Devices").status, "missing");
  assert.ok(de.items.find((i) => /^Cloud Device Administrator/.test(i.name)).detail.includes("unit is missing"));
  assert.deepEqual(cr.missingCodes, ["EU-NL", "EU-DE"]);
  // units not read: everything Entra is "unread", nothing is called missing
  const un = PB.compareRegions(multi, rows, Object.assign(tenant(), { aus: null, named: [] }));
  assert.equal(un.auRead, false); assert.ok(un.regions[0].items.filter((i) => i.kind === "au").every((i) => i.status === "unread"));
  // the base compare keeps the regional groups apart from the extra ones
  const res = PB.compare(multi, t);
  assert.deepEqual(res.extraGroups, ["CAB-SEC-U-Admins-Legacy"]); assert.deepEqual(res.regionalGroups, ["PIM-SG-EU-DE-Ops", "PIM-SG-EU-NL-Helpdesk", "PIM-SG-EU-NL-Ops"]);
  const html = PB.renderRegions(cr); for (const n of ["AU-EU-NL-Users", "PIM-SG-EU-DE-Approvers", "INT-RBAC-Ops-EU-DE", "AU-RM-Admins"]) assert.ok(html.includes(`<b>${n}</b>`), n);
  assert.match(PB.regionsMd(cr, "Contoso"), /^# 🗺 Regions — Contoso/);
});

test("regions file: the ticked rows, the template, the Intune role — and the committed template is the catalog's own", () => {
  const multi = PB.profile(CAT, "multi");
  const rows = PB.parseRegions(CAT.regions.example, CAT).rows;
  const f = PB.toRegionsFile(multi, rows, { domain: "contoso.nl", codes: ["EU-DE"] });
  assert.equal(f.regions.length, 1); assert.equal(f.regions[0].code, "EU-DE"); assert.equal(f.profile, "multi");
  assert.equal(f.template.eligibilities.length, 8); assert.equal(f.intuneRoles[0].name, "INT-ROLE-Regional-Ops"); assert.equal(f.central.rmau[0].name, "AU-RM-Admins");
  assert.equal(f.groupTemplates.GroupTier2.ActivationDuration, "PT8H");
  assert.match(PB.regionsCommand("regions.contoso.nl.json", "contoso.nl"), /New-PimRegions\.ps1 -RegionsFile \.\\regions\.contoso\.nl\.json -TenantId contoso\.nl$/);
  const tpl = JSON.parse(read("tools/pim/pim-regions-template.json"));
  assert.deepEqual(tpl.template, CAT.regions.template); assert.deepEqual(tpl.intuneRoles, CAT.intuneRoles);
  const cf = JSON.parse(read("tools/pim/regions.cloudfellows.dev.json"));
  assert.deepEqual(cf.regions.map((r) => r.code), ["EU-NL", "EU-DE"]); assert.deepEqual(cf.template, CAT.regions.template);
  assert.equal(read("tools/pim/regions.csv").split("\n")[0], CAT.regions.columns.join(","));
});
