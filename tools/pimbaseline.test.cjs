// 🧬 PIM baseline (T48) — the catalog, the compare, the regions, the exports
// and the samples, offline. The "review" tests are the reliability review's
// own failure scenarios (25 Sep 2026): each must give a precise finding, never
// a false pass.
// Run: node --test tools/pimbaseline.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const tenant = (over = {}) => { const d = clone(DEMO.pim); return Object.assign({ roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, names: d.names, aus: d.aus, named: d.named, domain: d.domain, demo: true, readAt: 0 }, over); };
const MULTI = PB.profile(CAT, "multi"), SMALL = PB.profile(CAT, "small"), LARGE = PB.profile(CAT, "large");
const row = (res, n) => res.rows.find((r) => r.name === n);
const grp = (res, n) => res.groups.find((g) => g.name === n);

test("catalog: every role names a template, every via a group of its profile, names unique and solution-first", () => {
  const all = PB.allGroups(CAT);
  assert.equal(new Set(all.map((g) => g.name)).size, all.length);
  for (const g of all) { assert.ok(CAT.templates[g.template], `${g.name}: template`); assert.match(g.name, new RegExp(CAT.naming.pattern)); }
  for (const id of PB.profileIds(CAT)) {
    const c = PB.profile(CAT, id), names = new Set(c.groups.map((g) => g.name)), seen = new Set();
    for (const r of c.roles) {
      assert.ok(c.templates[r.template], `${id} ${r.name}: template`);
      assert.ok(!seen.has(r.name), `${r.name} twice`); seen.add(r.name);
      for (const g of r.via) assert.ok(names.has(g), `${id}: ${r.name} via ${g}, which the profile does not have`);
    }
  }
  assert.deepEqual(PB.profileIds(CAT), ["small", "large", "multi"]);
});

test("2.1 model: persona groups have active members, Intune access groups eligible ones, nothing in a restricted AU", () => {
  assert.ok(!Object.keys(CAT.templates).some((k) => /^GroupTier/.test(k)), "the 2.0 group tiers are gone");
  for (const g of PB.allGroups(CAT)) assert.equal(g.template, g.scope === "intune" ? "GroupJIT" : g.scope === "xdr" ? (g.name === "PIM-SG-XDR-Admin" ? "GroupJITTier0" : "GroupJIT") : "GroupMember", g.name);
  const m = PB.fromTemplate(CAT.templates.GroupMember), j = PB.fromTemplate(CAT.templates.GroupJIT);
  assert.equal(m.permActive, false); assert.equal(m.maxActive, "P365D"); assert.equal(m.approval, true, "eligible membership, if anyone is made eligible anyway, needs approval");
  assert.equal(j.permActive, false); assert.equal(j.activation, "PT8H");
  for (const id of PB.profileIds(CAT)) {
    const p = PB.profile(CAT, id).profile;
    for (const u of p.rmau) assert.doesNotMatch(u.holds, /every PIM-SG|adm- account and/i, `${id}: ${u.name}`);
    for (const a of p.intune.assignments) for (const mem of a.members) assert.ok(/^PIM-SG-INT-/.test(mem) || a.roles.every((x) => x === "Read Only Operator"), `${id} ${a.name}: an Intune role must name an eligible access group, not ${mem}`);
  }
  for (const a of CAT.regions.template.intune.assignments) assert.ok(a.members.every((mem) => /^PIM-SG-INT-/.test(mem)), a.name);
  assert.ok(CAT.protection.filter((p) => /PIM-SG|adm-/.test(p.object)).every((p) => p.rmau === false));
  assert.doesNotMatch(read("js/pimBaselineData.js"), /Activating a persona group grants every role/, "the 2.0 promise of one activation is gone");
});

test("tiers: Tier 0 asks c1 without MFA-on-activation, approval by named approvers; profiles change what they should", () => {
  for (const t of ["Tier0"]) {
    const e = PB.fromTemplate(CAT.templates[t]);
    assert.equal(e.authContext, "c1"); assert.ok(!e.enablement.includes("MultiFactorAuthentication"));
    assert.equal(e.approval, true); assert.deepEqual(e.approvers, ["PIM-SG-Approvers"]);
  }
  assert.equal(PB.expected(CAT, CAT.roles.find((r) => r.name === "Global Administrator")).activation, "PT1H");
  const ga = PB.expected(SMALL, SMALL.roles.find((r) => r.name === "Global Administrator"));
  assert.equal(ga.activation, "PT2H"); assert.equal(ga.approval, true, "small: approval on the GA role itself");
  assert.equal(PB.expected(SMALL, SMALL.roles.find((r) => r.name === "Privileged Role Administrator")).approval, false);
  const lg = PB.expected(LARGE, LARGE.roles.find((r) => r.name === "Global Administrator"));
  assert.ok(lg.enablement.includes("Ticketing")); assert.deepEqual(lg.approvers, ["PIM-SG-Approvers-Tier0"]);
  assert.deepEqual(LARGE.roles.find((r) => r.name === "Exchange Administrator").via, ["PIM-SG-M365-Collab"]);
  assert.deepEqual(SMALL.roles.find((r) => r.name === "Helpdesk Administrator").via, ["PIM-SG-M365-Ops"]);
});

test("fromRules: the demo's Global Administrator matches exactly; recipients compare as full addresses", () => {
  const exp = PB.expected(CAT, CAT.roles.find((r) => r.name === "Global Administrator"), "contoso.nl");
  assert.deepEqual(PB.diff(exp, PB.fromRules(DEMO.pim.policies["Global Administrator"], DEMO.pim.names)), []);
  const evil = clone(DEMO.pim.policies["Global Administrator"]).map((r) => (/^Notification_/.test(r.id) ? Object.assign(r, { notificationRecipients: ["pim-alerts@evil.example"] }) : r));
  const d = PB.diff(exp, PB.fromRules(evil, DEMO.pim.names));
  assert.deepEqual(d.map((x) => x.key), ["recipients"], "review: another domain must not compare equal");
  const off = clone(DEMO.pim.policies["Global Administrator"]).map((r) => (r.id === "Notification_Admin_Admin_Assignment" ? Object.assign(r, { isDefaultRecipientsEnabled: false }) : r));
  assert.deepEqual(PB.diff(exp, PB.fromRules(off, DEMO.pim.names)).map((x) => x.key), ["defaults"]);
});

test("review: a rule the policy does not carry reads 'rule absent', never a default that happens to match", () => {
  const rules = clone(DEMO.pim.policies["Global Administrator"]).filter((r) => r.id !== "AuthenticationContext_EndUser_Assignment" && r.id !== "Expiration_EndUser_Assignment");
  const d = PB.diff(PB.expected(CAT, CAT.roles.find((r) => r.name === "Global Administrator"), "contoso.nl"), PB.fromRules(rules, DEMO.pim.names));
  assert.deepEqual(d.map((x) => x.key).sort(), ["activation", "authContext"]);
  assert.ok(d.every((x) => x.tenant === "rule absent"));
});

test("compare on the demo (multi-region): policies, findings, the group model by id", () => {
  const res = PB.compare(MULTI, tenant());
  assert.equal(res.counts.roles, CAT.roles.length); assert.equal(res.counts.match, 26); assert.equal(res.counts.differs, 12); assert.equal(res.counts.conflict, 0);
  assert.equal(row(res, "Global Administrator").status, "match");
  assert.deepEqual(row(res, "Privileged Role Administrator").diffs.map((d) => d.key), ["approval", "approvers"]);
  const ex = row(res, "Exchange Administrator");
  assert.deepEqual(ex.diffs.map((d) => d.key), ["activation"]);
  assert.ok(ex.findings.some((f) => /permanent active outside/.test(f) && /Admins-Legacy/.test(f)));
  assert.ok(ex.findings.some((f) => /not eligible through PIM-SG-M365-AppOps \(the group is missing\)/.test(f)));
  const ga = row(res, "Global Administrator");
  assert.equal(ga.permanent, 3); assert.equal(ga.permanentOutside, 1);
  assert.ok(ga.findings.some((f) => /by name only/.test(f)), "break-glass by name is flagged, not silently protected");
  const byId = PB.compare(MULTI, tenant({ protectedIds: ["u-bg1", "u-bg2"] }));
  assert.ok(!row(byId, "Global Administrator").findings.some((f) => /by name only/.test(f)));
  assert.equal(grp(res, "PIM-SG-M365-GlobalAdmin").status, "match");
  const sec = grp(res, "PIM-SG-M365-SecOps");
  assert.equal(sec.status, "differs"); assert.ok(sec.diffs.some((d) => d.key === "permActive"), "permanent membership allowed is drift in 2.1");
  assert.equal(grp(res, "PIM-SG-M365-Helpdesk").roleAssignable, false);
  assert.deepEqual(grp(res, "PIM-SG-M365-Ops").extraRoles, ["Directory Readers"], "review: an unexpected privilege is a difference");
  assert.equal(grp(res, "PIM-SG-M365-Ops").status, "differs");
  assert.equal(grp(res, "PIM-SG-INT-Ops").status, "match");
  assert.equal(grp(res, "PIM-SG-M365-AppOps").present, false);
  assert.deepEqual(res.extraGroups, ["CAB-SEC-U-Admins-Legacy"]);
  assert.deepEqual(res.regionalGroups, ["PIM-SG-EU-DE-Ops", "PIM-SG-EU-NL-Helpdesk", "PIM-SG-EU-NL-Ops", "PIM-SG-INT-HelpDesk-EU-NL"]);
  assert.equal(res.domainChecked, true);
});

test("review: group settings that were not read are 'Not read', never Match", () => {
  const res = PB.compare(MULTI, tenant({ groupPolicies: null, groupPoliciesError: "access denied" }));
  const g = grp(res, "PIM-SG-M365-GlobalAdmin");
  assert.equal(g.status, "unread"); assert.equal(g.settings, "unread");
  assert.equal(grp(res, "PIM-SG-M365-SecOps").status, "differs", "a known difference stays known");
  assert.ok(!PB.defaultSelection(res).has("group:PIM-SG-M365-GlobalAdmin"), "unknown never becomes a change");
});

test("review: an eligibility at an administrative unit is not a tenant-wide carry", () => {
  const t = tenant();
  t.eligible = t.eligible.map((a) => (a.principalName === "PIM-SG-M365-Tier0" ? Object.assign({}, a, { directoryScopeId: "/administrativeUnits/au-x" }) : a));
  const res = PB.compare(MULTI, t);
  const g = grp(res, "PIM-SG-M365-Tier0");
  assert.equal(g.status, "differs"); assert.deepEqual(g.missingRoles, ["Privileged Authentication Administrator", "Privileged Role Administrator"]);
  assert.deepEqual(g.scopedOnly, ["Privileged Authentication Administrator", "Privileged Role Administrator"]);
  assert.ok(row(res, "Privileged Role Administrator").findings.some((f) => /only at an administrative unit/.test(f)));
});

test("review: matching is by id — a look-alike name on another object carries nothing", () => {
  const t = tenant();
  t.eligible = t.eligible.map((a) => (a.principalName === "PIM-SG-M365-Tier0" ? Object.assign({}, a, { principalId: "g-somebody-else" }) : a));
  const res = PB.compare(MULTI, t);
  assert.equal(grp(res, "PIM-SG-M365-Tier0").missingRoles.length, 2);
  assert.ok(row(res, "Privileged Role Administrator").findings.some((f) => /not eligible through PIM-SG-M365-Tier0$/.test(f)));
});

test("review: two groups under one name are a Conflict, never collapsed into one", () => {
  const t = tenant();
  t.groups = t.groups.concat([{ id: "g-dup", displayName: "PIM-SG-M365-GlobalAdmin", isAssignableToRole: true }]);
  const res = PB.compare(MULTI, t);
  const g = grp(res, "PIM-SG-M365-GlobalAdmin");
  assert.equal(g.status, "conflict"); assert.deepEqual(g.ids.sort(), ["g-PIM-SG-M365-GlobalAdmin", "g-dup"]);
  assert.match(g.conflict, /Find-PimDuplicates/);
  assert.ok(row(res, "Global Administrator").findings.some((f) => /2 groups are called PIM-SG-M365-GlobalAdmin/.test(f)));
  assert.ok(!PB.defaultSelection(res).has("group:PIM-SG-M365-GlobalAdmin"));
  assert.ok(!PB.selectable(res).has("group:PIM-SG-M365-GlobalAdmin"), "no config resolves a conflict");
  const custom = tenant(); custom.roles = custom.roles.map((r) => (r.displayName === "Exchange Administrator" ? Object.assign({}, r, { isBuiltIn: false }) : r));
  assert.equal(row(PB.compare(MULTI, custom), "Exchange Administrator").status, "conflict", "a custom role wearing a built-in name");
});

test("diff ignores what cannot matter: the maximum under permanent, the approvers under no approval", () => {
  const a = PB.fromTemplate(CAT.templates.Reader);
  assert.deepEqual(PB.diff(a, Object.assign({}, a, { maxEligible: "P30D" })), []);
  const c = Object.assign({}, PB.fromTemplate(CAT.templates.Tier1), { approvers: ["Somebody"] });
  assert.deepEqual(PB.diff(PB.fromTemplate(CAT.templates.Tier1), c), []);
});

test("toOrchestrator: the whole framework, a delta, explicit protected ids only", () => {
  const all = PB.toOrchestrator(CAT, { domain: "cloudfellows.dev" });
  assert.equal(Object.keys(all.EntraRoles.Policies).length, CAT.roles.length);
  assert.equal(Object.keys(all.GroupRoles.Policies).length, CAT.groups.length);
  assert.deepEqual(all.EntraRoles.Policies["Global Administrator"], { Template: "Tier0", ActivationDuration: "PT1H" });
  assert.equal(all.GroupRoles.Policies["PIM-SG-M365-Ops"].Member.Template, "GroupMember");
  assert.equal(all.GroupRoles.Policies["PIM-SG-INT-Ops"].Member.Template, "GroupJIT");
  assert.deepEqual(all.PolicyTemplates.Tier0.Approvers[0], { id: "<id of PIM-SG-Approvers>", description: "PIM-SG-Approvers", type: "group" });
  assert.equal(all.PolicyTemplates.Tier0.Notification_Activation_Alert.Recipients[0], "pim-alerts@cloudfellows.dev");
  assert.equal(all._meta.schema, "cloudfellows-pim-config/2.1");
  assert.deepEqual(all.ProtectedUsers, ["<id of PIM-SG-M365-GlobalAdmin>"], "no name pattern protects anybody");
  assert.deepEqual(PB.toOrchestrator(CAT, { protectedIds: ["11111111-1111-1111-1111-111111111111"] }).ProtectedUsers.slice(-1), ["11111111-1111-1111-1111-111111111111"]);
  const delta = PB.toOrchestrator(CAT, { domain: "contoso.nl", delta: true, roles: ["Exchange Administrator", "Privileged Role Administrator"], groups: ["PIM-SG-M365-AppOps"] });
  assert.deepEqual(Object.keys(delta.EntraRoles.Policies).sort(), ["Exchange Administrator", "Privileged Role Administrator"]);
  assert.deepEqual(Object.keys(delta.PolicyTemplates).sort(), ["GroupMember", "Tier0", "Tier1"]);
  const roles = delta.Assignments.EntraRoles.map((a) => a.roleName);
  assert.ok(roles.includes("Cloud Application Administrator") && !roles.includes("Global Administrator"));
  assert.match(PB.command("pim-delta.contoso.nl.json", "CONTOSO"), /New-PimBaseline\.ps1 -ConfigFile .*-Customer CONTOSO$/);
});

test("render and toMd: every role and group, escaped names, 'Policy matches' beside a finding, readable durations", () => {
  const res = PB.compare(MULTI, tenant());
  const html = PB.tiles(res) + PB.render(res, { filter: "all" });
  for (const r of CAT.roles) assert.ok(html.includes(`<b>${r.name}</b>`), r.name);
  for (const g of CAT.groups) assert.ok(html.includes(`<b>${g.name}</b>`), g.name);
  assert.ok(!/<b>[^<]*<script/.test(html));
  assert.ok(html.includes("✓ Policy matches"), "Global Administrator matches but carries findings");
  assert.ok(html.includes("1 day") || html.includes("24 h"), "PT24H read as a duration");
  assert.ok(PB.render(res, { filter: "differs" }).includes("Exchange Administrator"));
  const sel = new Set(["role:Exchange Administrator"]);
  const only = PB.render(res, { filter: "all", selected: sel });
  assert.ok(/data-pmbfix="role:Exchange Administrator" checked/.test(only));
  assert.ok(!/data-pmbfix="role:Privileged Role Administrator" checked/.test(only), "the selection is the caller's, not the DOM's");
  const md = PB.toMd(res, "Contoso");
  assert.match(md, /^# 🧬 PIM baseline — Contoso/);
  assert.ok(md.includes("Policy matches · finding"));
  assert.equal(PB.human("PT2H"), "2 h"); assert.equal(PB.human("P365D"), "365 days"); assert.equal(PB.human("PT1H30M"), "1 h 30 min");
});

test("regions: strict parsing — errors leave a row out, warnings keep it, nothing throws", () => {
  const ok = PB.parseRegions(CAT.regions.example, CAT);
  assert.deepEqual(ok.errors, []); assert.equal(ok.rows.length, 2);
  assert.deepEqual(ok.rows[0].approvers, ["a@contoso.nl", "b@contoso.nl"]); assert.equal(ok.rows[1].devicePrefix, "DE-");
  for (const bad of [JSON.stringify({ regions: {} }), "[null]", "{", "[1,2]", JSON.stringify({ code: "EU-NL" }), ""]) {
    let r; assert.doesNotThrow(() => { r = PB.parseRegions(bad, CAT); }, bad);
    assert.equal(r.rows.length, 0, bad); assert.ok(r.errors.length, bad);
  }
  const mixed = PB.parseRegions([
    "code,name,attribute,value,devicePrefix,approvers",
    "nl,Netherlands,,,,",
    "EU-NL,Netherlands,country,,,",
    'EU-DE,Germany,,"DE"") -or (true",,',
    "EU-BE,Belgium,,,,x@y",
    "EU-FR,France,,,,a@b.fr;c@d.fr",
    "EU-FR,Again,,,,",
  ].join("\n"), CAT);
  assert.deepEqual(mixed.rows.map((r) => r.code), ["EU-FR"]);
  assert.ok(mixed.errors.some((e) => /Row 2/.test(e) && /continent-country/.test(e)));
  assert.ok(mixed.errors.some((e) => /EU-NL/.test(e) && /extensionAttribute1 to extensionAttribute15/.test(e)), "country cannot drive the device unit");
  assert.ok(mixed.errors.some((e) => /EU-DE/.test(e) && /membership rule/.test(e)), "a quote never reaches a rule");
  assert.ok(mixed.errors.some((e) => /EU-BE/.test(e) && /not an address/.test(e)));
  assert.ok(mixed.errors.some((e) => /twice/.test(e)));
  assert.deepEqual(mixed.rows[0].approvers, ["a@b.fr", "c@d.fr"]);
  assert.ok(mixed.warnings.some((w) => /IT lead/.test(w)));
  const json = PB.parseRegions(JSON.stringify([{ code: "apac-sg", name: "Singapore", approvers: ["x@y.sg", "z@y.sg"] }]), CAT);
  assert.equal(json.rows[0].code, "APAC-SG"); assert.deepEqual(json.rows[0].approvers, ["x@y.sg", "z@y.sg"]);
  assert.ok(PB.parseRegions("x".repeat(CAT.regions.maxBytes + 1), CAT).errors[0].includes("larger"));
  assert.throws(() => PB.region(CAT, Object.assign({}, ok.rows[0], { value: 'x") -or (true' })), /not safe/);
});

test("regions: the demo compares per region by id, scope and processing state", () => {
  const t = tenant();
  const cr = PB.compareRegions(MULTI, PB.parseRegions(DEMO.pim.regionsCsv, CAT).rows, t);
  const nl = cr.regions[0], de = cr.regions[1];
  const it = (r, n) => r.items.find((i) => i.name === n);
  assert.equal(it(nl, "AU-EU-NL-Users").status, "match");
  assert.equal(it(nl, "AU-EU-NL-Devices").status, "differs");
  assert.match(it(nl, "INT-SG-DEV-EU-NL-All").detail, /Paused/, "review: processing state, not only rule text");
  assert.match(it(nl, "User Administrator → PIM-SG-EU-NL-Ops").detail, /TENANT scope/);
  assert.equal(it(nl, "PIM-SG-INT-HelpDesk-EU-NL").status, "match");
  assert.equal(it(nl, "PIM-SG-INT-Ops-EU-NL").status, "missing");
  assert.equal(it(de, "PIM-SG-EU-DE-Ops").status, "unread", "membership settings not read");
  assert.equal(it(nl, "INT-TAG-EU-NL").status, "unread");
  // the framework-groups read failed: plain groups are unknown, never missing
  const un = PB.compareRegions(MULTI, PB.parseRegions(DEMO.pim.regionsCsv, CAT).rows, tenant({ named: null }));
  assert.equal(un.regions[0].items.find((i) => i.name === "PIM-SG-EU-NL-Approvers").status, "unread");
  assert.equal(un.regions[0].items.find((i) => i.name === "INT-SG-USR-EU-NL-All").status, "unread");
  const noAu = PB.compareRegions(MULTI, PB.parseRegions(DEMO.pim.regionsCsv, CAT).rows, tenant({ aus: null }));
  assert.ok(noAu.regions[0].items.filter((i) => i.kind === "au" || i.kind === "eligibility").every((i) => i.status === "unread"));
});

// A tenant carrying one region exactly as the template says.
function perfectRegion(row) {
  const r = PB.region(CAT, row);
  const aus = r.aus.map((a, i) => ({ id: `au-${i}`, displayName: a.name, membershipType: a.kind === "dynamic" ? "Dynamic" : "Assigned", membershipRule: a.rule || null, membershipRuleProcessingState: "On", isMemberManagementRestricted: false }));
  const groups = r.groups.filter((g) => g.roleAssignable).map((g) => ({ id: `g-${g.name}`, displayName: g.name, isAssignableToRole: true }));
  const named = r.groups.filter((g) => !g.roleAssignable).map((g) => ({ id: `g-${g.name}`, displayName: g.name, isAssignableToRole: false }))
    .concat(r.intune.groups.map((g) => ({ id: `g-${g.name}`, displayName: g.name, isAssignableToRole: false, membershipRule: g.rule, membershipRuleProcessingState: "On" })));
  const eligible = r.eligibilities.map((e) => ({ roleName: e.role, principalId: `g-${e.group}`, principalName: e.group, principalType: "Group", directoryScopeId: `/administrativeUnits/${aus.find((a) => a.displayName === e.au).id}` }));
  const rulesFor = (tpl) => { const x = clone(DEMO.pim.groupPolicies[tpl === "GroupJIT" ? "PIM-SG-INT-Ops" : "PIM-SG-M365-GlobalAdmin"]); return x; };
  const groupPolicies = Object.fromEntries(r.groups.filter((g) => g.template).map((g) => [`g-${g.name}`, rulesFor(g.template)]));
  return { roles: [], eligible, active: [], groups, named, aus, groupPolicies, names: clone(DEMO.pim.names), domain: "contoso.nl" };
}

test("review: a region whose Entra side matches but whose Intune side is unread is 'partial', not Match; a tenant-wide extra is drift", () => {
  const row0 = PB.parseRegions(CAT.regions.example, CAT).rows[0];
  const t = perfectRegion(row0);
  let cr = PB.compareRegions(MULTI, [row0], t);
  assert.equal(cr.regions[0].status, "partial");
  assert.deepEqual(cr.missingCodes, []);
  assert.equal(cr.regions[0].counts.unread, 3);
  t.eligible.push({ roleName: "Helpdesk Administrator", principalId: "g-PIM-SG-EU-NL-Helpdesk", principalName: "PIM-SG-EU-NL-Helpdesk", principalType: "Group", directoryScopeId: "/" });
  cr = PB.compareRegions(MULTI, [row0], t);
  const hd = cr.regions[0].items.find((i) => i.name === "Helpdesk Administrator → PIM-SG-EU-NL-Helpdesk");
  assert.equal(hd.status, "differs"); assert.match(hd.detail, /ALSO held at tenant scope/);
  t.aus.push(Object.assign({}, t.aus[0], { id: "au-dup" }));
  assert.equal(PB.compareRegions(MULTI, [row0], t).regions[0].status, "conflict");
});

test("regions file: the chosen rows with approvers as a list, the template, both group templates", () => {
  const rows = PB.parseRegions(CAT.regions.example, CAT).rows;
  const f = PB.toRegionsFile(MULTI, rows, { domain: "contoso.nl", codes: ["EU-DE"] });
  assert.deepEqual(f.regions.map((r) => r.code), ["EU-DE"]); assert.ok(Array.isArray(f.regions[0].approvers)); assert.equal(f.regions[0].approvers.length, 2);
  assert.deepEqual(Object.keys(f.groupTemplates), ["GroupMember", "GroupJIT"]);
  assert.equal(f.intuneRoles[0].name, "INT-ROLE-Regional-Ops"); assert.equal(f._meta.schema, "cloudfellows-pim-regions/2.1");
  assert.ok(f.fields.attribute && f.codePattern);
});

test("EasyPIM samples: one per scenario, parse once the comments are stripped, every value to change says EDIT", () => {
  for (const id of PB.profileIds(CAT)) {
    const text = PB.toSample(CAT, id);
    const j = JSON.parse(PB.stripJsonComments(text));
    const prof = PB.profile(CAT, id), names = new Set(prof.groups.map((g) => g.name));
    assert.equal(j._meta.sample, id);
    assert.ok(j.Assignments.Groups.length > 0);
    for (const g of j.Assignments.Groups) {
      assert.ok(names.has(g.groupId.replace(/^<id of |>$/g, "")), `${id}: ${g.groupId}`);
      for (const a of g.assignments) {
        assert.match(a.principalId, /^<EDIT: /);
        assert.equal(a.assignmentType, /^<id of PIM-SG-(INT|XDR)-/.test(g.groupId) ? "Eligible" : "Active", `${id} ${g.groupId}`);
      }
    }
    assert.ok(j.ProtectedUsers.some((p) => /EDIT: object id of break-glass/.test(p)));
    assert.match(text, /EDIT: every "pim-alerts@contoso\.com"/);
    assert.match(text, /NEVER -Mode initial/);
  }
  assert.match(PB.toSample(CAT, "multi"), /tenant scope only/);
  assert.match(PB.toSample(CAT, "large"), /PIM-SG-Approvers-Tier0 is the rota/);
  assert.equal(PB.stripJsonComments('{"u":"https://x/y", // c\n"v":1 /* d */}'), '{"u":"https://x/y", \n"v":1 }');
});

test("the committed files under tools/pim are exactly what tools/pim/generate.cjs writes", () => {
  const { files } = require("./pim/generate.cjs");
  for (const [name, body] of Object.entries(files())) assert.equal(read(`tools/pim/${name}`), body, `tools/pim/${name} is stale — run node tools/pim/generate.cjs`);
});

// 32417 — cloudfellows.dev: New-PimBaseline.ps1 stopped at "role 'Microsoft Entra
// Joined Device Local Administrator' does not exist in the tenant": the tenant's
// role definition still carried a former name. Built-in roles match on template id.
test("roles by template id: every framework role carries its built-in template id; regions only name catalog roles", () => {
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ids = new Set();
  for (const r of CAT.roles) { assert.match(String(r.templateId), GUID, `${r.name}: templateId`); assert.ok(!ids.has(r.templateId), `${r.name}: templateId twice`); ids.add(r.templateId); }
  for (const id of PB.profileIds(CAT)) for (const r of PB.profile(CAT, id).roles) assert.match(String(r.templateId), GUID, `${id} ${r.name}: templateId survives the profile`);
  assert.equal(CAT.roles.find((r) => r.name === "Microsoft Entra Joined Device Local Administrator").templateId, "9f06204d-73c1-4d4c-880a-6edb90606fd8");
  const names = new Set(CAT.roles.map((r) => r.name));
  const regionRoles = [...new Set([...read("tools/pim/pim-regions-template.json").matchAll(/"role": "([^"]+)"/g)].map((m) => m[1]))];
  assert.ok(regionRoles.length >= 5, "the region template names roles");
  for (const n of regionRoles) assert.ok(names.has(n), `region role ${n} is a catalog role (so the scripts know its template id)`);
  const pr = JSON.parse(read("tools/pim/pim-roles.json"));
  assert.equal(pr.roles.length, CAT.roles.length);
  assert.deepEqual(pr.roles.find((r) => r.templateId === "9f06204d-73c1-4d4c-880a-6edb90606fd8").formerNames, ["Azure AD Joined Device Local Administrator"]);
});

test("roles by template id: a tenant that still shows a former name compares under the catalog name, with a finding for EasyPIM", () => {
  const EJ = "Microsoft Entra Joined Device Local Administrator", OLD = "Azure AD Joined Device Local Administrator", TPL = "9f06204d-73c1-4d4c-880a-6edb90606fd8";
  const t = tenant();
  t.roles = t.roles.map((r) => (r.displayName === EJ ? { ...r, id: TPL, templateId: TPL, displayName: OLD } : r));
  // what the read did before 32417: the role is Missing
  assert.equal(row(PB.compare(MULTI, t), EJ).status, "missing");
  // the read now: built-in roles take the catalog name by template id
  const canon = PB.canonRoles(CAT, t.roles);
  const def = canon.find((r) => r.id === TPL);
  assert.equal(def.displayName, EJ); assert.equal(def.tenantName, OLD);
  assert.equal(canon.filter((r) => r.tenantName).length, 1, "only the renamed role changes");
  const r = row(PB.compare(MULTI, { ...t, roles: canon }), EJ);
  assert.notEqual(r.status, "missing");
  assert.ok(r.findings.some((f) => f.includes(`this tenant calls it ${OLD}`) && f.includes("EasyPIM")), r.findings.join(" | "));
  // a custom role wearing the catalog name keeps its own identity: two definitions, a Conflict
  const custom = PB.canonRoles(CAT, [...t.roles, { id: "custom-1", displayName: EJ, isBuiltIn: false, templateId: "custom-1" }]);
  assert.equal(custom.find((x) => x.id === "custom-1").displayName, EJ);
  assert.equal(custom.find((x) => x.id === "custom-1").tenantName, undefined);
  assert.equal(row(PB.compare(MULTI, { ...t, roles: custom }), EJ).status, "conflict");
  // a role the catalog does not know is left alone
  const other = PB.canonRoles(CAT, [{ id: "x", templateId: "11111111-2222-3333-4444-555555555555", displayName: "Something Else", isBuiltIn: true }]);
  assert.equal(other[0].displayName, "Something Else"); assert.equal(other[0].tenantName, undefined);
});

test("roles by template id: the in-browser read asks for templateId and canonicalises before keying policies", () => {
  const app = read("js/app.js");
  assert.match(app, /roleDefinitions\?\$select=id,displayName,isBuiltIn,templateId"/);
  assert.match(app, /PimBaseline\.canonRoles\(PIM_BASELINE, await pmbProg\.fetchAll\("\/v1\.0\/roleManagement\/directory\/roleDefinitions/);
});

// ---- 2.2: Defender XDR access groups, the Entra side only (2 Oct 2026) ----
test("2.2 catalog: five PIM-SG-XDR access groups, eligible members, Admin on the Tier 0 gate, per profile as decided", () => {
  const xdr = CAT.groups.filter((g) => g.scope === "xdr");
  assert.deepEqual(xdr.map((g) => g.name), ["PIM-SG-XDR-Admin", "PIM-SG-XDR-Operator-T3", "PIM-SG-XDR-Operator-T2", "PIM-SG-XDR-Operator-T1", "PIM-SG-XDR-Reader"]);
  for (const g of xdr) {
    assert.match(g.name, new RegExp(CAT.naming.pattern));
    assert.ok(g.xdr && /^Defender XDR /.test(g.xdr.role) && g.xdr.scope === "All", `${g.name}: names its portal role`);
    assert.ok(!CAT.roles.some((r) => (r.via || []).includes(g.name)), `${g.name}: carries no Entra role`);
  }
  // The Admin group: Tier 0's gate on a group — eligible, two hours, c1 without MFA-on-activation, approval.
  const a = PB.fromTemplate(CAT.templates.GroupJITTier0);
  assert.equal(a.activation, "PT2H"); assert.equal(a.authContext, "c1"); assert.ok(!a.enablement.includes("MultiFactorAuthentication"));
  assert.equal(a.approval, true); assert.deepEqual(a.approvers, ["PIM-SG-Approvers"]); assert.equal(a.permActive, false); assert.equal(a.permEligible, false);
  const j = PB.fromTemplate(CAT.templates.GroupJIT);
  assert.equal(j.activation, "PT8H", "operators and the reader take the framework's shift, not the document's ten hours");
  // Profiles: small keeps three (T1 and T2 fold into T3), large five with the Tier 0 rota, multi five centrally.
  const names = (p) => p.groups.filter((g) => g.scope === "xdr").map((g) => g.name);
  assert.deepEqual(names(SMALL), ["PIM-SG-XDR-Admin", "PIM-SG-XDR-Operator-T3", "PIM-SG-XDR-Reader"]);
  assert.equal(CAT.profiles.small.merge["PIM-SG-XDR-Operator-T1"], "PIM-SG-XDR-Operator-T3"); assert.equal(CAT.profiles.small.merge["PIM-SG-XDR-Operator-T2"], "PIM-SG-XDR-Operator-T3");
  assert.equal(names(LARGE).length, 5); assert.equal(names(MULTI).length, 5);
  const lg = PB.fromTemplate(LARGE.templates.GroupJITTier0);
  assert.deepEqual(lg.approvers, ["PIM-SG-Approvers-Tier0"]); assert.ok(lg.enablement.includes("Ticketing"));
  assert.ok(!JSON.stringify(CAT.regions.template).includes("PIM-SG-XDR"), "no regional XDR groups: that is the portal's device-group scoping, excluded");
  assert.match(CAT.outside.join(" "), /Defender XDR \(2\.2\).*never read or written here/);
});

test("2.2 compare and exports: an XDR group is a model without Entra roles; the portal side is named, never compared", () => {
  const t = tenant();
  const id = "g-xdr-t1";
  t.groups.push({ id, displayName: "PIM-SG-XDR-Operator-T1", isAssignableToRole: true });
  t.groupPolicies[id] = clone(t.groupPolicies["PIM-SG-INT-Ops"]);
  t.eligible.push({ principalId: id, principalName: "PIM-SG-XDR-Operator-T1", roleName: "Security Reader", directoryScopeId: "/", principalType: "Group" });
  const res = PB.compare(LARGE, t);
  const g = grp(res, "PIM-SG-XDR-Operator-T1");
  assert.equal(g.present, true); assert.deepEqual(g.carries, []); assert.deepEqual(g.missingRoles, []);
  assert.deepEqual(g.extraRoles, ["Security Reader"], "an Entra role on an XDR group is a finding"); assert.equal(g.status, "differs");
  assert.equal(grp(res, "PIM-SG-XDR-Admin").status, "missing");
  const html = PB.render(res, { filter: "groups" });
  assert.ok(html.includes("Defender XDR · assigned in the portal") && html.includes("Defender XDR Operator T1 · scope All") && html.includes("eligible · JIT"));
  assert.match(PB.toMd(res, "contoso"), /PIM-SG-XDR-Operator-T1 \| Helpdesk \| eligible · JIT \| yes \| yes \| Defender XDR, assigned in the portal/);
  const cfg = PB.toOrchestrator(LARGE, { domain: "contoso.nl" });
  assert.equal(cfg.GroupRoles.Policies["PIM-SG-XDR-Admin"].Member.Template, "GroupJITTier0");
  assert.equal(cfg.PolicyTemplates.GroupJITTier0.AuthenticationContext_Value, "c1");
  for (const id2 of PB.profileIds(CAT)) assert.match(PB.toSample(CAT, id2), /Defender XDR: the PIM-SG-XDR groups are .*Entra side only/);
});
