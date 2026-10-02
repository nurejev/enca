// 🚀 T51 Deploy — import from the baseline (js/pimdeploy.js), offline.
// The plan must be the scripts' plan: nothing removed, conflicts block,
// approvers exist before approval is switched on, placeholders for what the
// same run makes, eligibilities capped, new groups' policies deferred.
// Run: node --test tools/pimdeploy.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const IR = new Function("PimPlan", read("js/intunerbac.js") + ";return IntuneRbac;")(PP);
const PD = new Function("PimPlan", "PimBaseline", "IntuneRbac", read("js/pimdeploy.js") + ";return PimDeploy;")(PP, PB, IR);
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const raw = () => { const d = clone(DEMO.pim); return { roles: d.roleDefinitions, policies: d.policies, policyIds: Object.fromEntries(Object.keys(d.policies).map((n, i) => [n, `pol-role-${i + 1}`])), eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, groupPolicyIds: Object.fromEntries(Object.keys(d.groupPolicies).map((n, i) => [n, `pol-group-${i + 1}`])), names: d.names, aus: d.aus, named: d.named, domain: "contoso.nl", verifiedDomains: ["contoso.nl"], readAt: 0, demo: true }; };
const LARGE = PB.profile(CAT, "large"), MULTI = PB.profile(CAT, "multi"), SMALL = PB.profile(CAT, "small");

test("large profile: groups first, approvers before the policies that name them, placeholders, nothing removed", () => {
  const P = PD.build(LARGE, raw(), { sections: new Set(["groups", "approvers", "rolePolicies", "eligibilities", "groupPolicies"]), domain: "contoso.nl" });
  assert.deepEqual(P.blocked, []);
  const keys = P.ops.map((o) => o.key);
  const firstPatch = keys.findIndex((k) => k.startsWith("rpol:"));
  const lastCreate = keys.map((k, i) => (k.startsWith("group:") ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  assert.ok(lastCreate < firstPatch, "every group is made before a policy is changed");
  assert.ok(keys.includes("group:PIM-SG-Approvers-Tier0"));
  assert.ok(keys.includes("group:PIM-SG-M365-Identity") && keys.includes("group:PIM-SG-M365-ServiceDesk-VIP"));
  const vip = P.ops.find((o) => o.key === "group:PIM-SG-M365-Identity");
  assert.equal(vip.body.isAssignableToRole, true); assert.equal(vip.body.visibility, "Private");
  const ap = P.ops.find((o) => o.key === "group:PIM-SG-Approvers-Tier0");
  assert.equal(ap.body.isAssignableToRole, undefined, "approvers are a plain group");
  // Approval is never switched on with an approver group made empty in the same run (review, 32429).
  assert.ok(!P.ops.some((o) => o.key === "rpol:Privileged Role Administrator:Approval_EndUser_Assignment"));
  assert.ok(P.findings.some((f) => /Privileged Role Administrator: approval is not switched on yet — PIM-SG-Approvers-Tier0 must exist with at least two members/.test(f)));
  const pra = P.ops.find((o) => o.key.startsWith("rpol:Privileged Role Administrator:"));
  assert.ok(pra.before, "the rule as it was is kept for the backup");
  const el = P.ops.find((o) => o.key === "elig:User Administrator:PIM-SG-M365-Identity:tenant scope");
  assert.equal(el.body.principalId, "{{group:PIM-SG-M365-Identity}}"); assert.equal(el.body.directoryScopeId, "/");
  assert.ok(!P.ops.some((o) => o.method === "DELETE" || o.removes));
  assert.ok(P.ops.some((o) => o.kind === "groupPolicy" && o.group === "PIM-SG-M365-Identity"), "a new group's membership policy is deferred");
  assert.ok(P.findings.some((f) => /Global Administrator: 1 permanent active .* by hand/.test(f)));
});

test("an existing eligibility is not asked again; an existing group's policy is PATCHed rule by rule", () => {
  const P = PD.build(MULTI, raw(), { sections: new Set(["eligibilities", "groupPolicies", "approvers"]), domain: "contoso.nl" });
  assert.ok(!P.ops.some((o) => o.key === "elig:Global Administrator:PIM-SG-M365-GlobalAdmin:tenant scope"), "the demo already has it");
  const secops = P.ops.filter((o) => o.key.startsWith("gpol:PIM-SG-M365-SecOps:"));
  assert.ok(secops.some((o) => o.key.endsWith("Expiration_Admin_Assignment")), "SecOps allows permanent membership — drift fixed");
  assert.match(secops[0].url, /roleManagementPolicies\/pol-group-\d+\/rules\//);
});

test("conflicts and a group that is not role-assignable block; ticked-only imports only what was ticked", () => {
  const r = raw();
  r.groups.push({ id: "g-dup", displayName: "PIM-SG-M365-Ops", isAssignableToRole: true });
  r.groups = r.groups.map((g) => (g.displayName === "PIM-SG-M365-Tier0" ? Object.assign({}, g, { isAssignableToRole: false }) : g));
  const P = PD.build(MULTI, r, { sections: new Set(["groups"]) });
  assert.ok(P.blocked.some((b) => /PIM-SG-M365-Tier0 exists but is NOT role-assignable/.test(b)));
  const only = PD.build(LARGE, raw(), { sections: null, only: new Set(["role:Exchange Administrator"]) });
  assert.ok(only.ops.filter((o) => o.section === "rolePolicies").every((o) => o.key.startsWith("rpol:Exchange Administrator:")));
  assert.ok(!only.ops.some((o) => o.key === "group:PIM-SG-M365-Identity"));
});

test("regions: units, groups, scoped eligibilities by placeholder; an existing unit whose rule differs is a finding, not a change", () => {
  const rows = PB.parseRegions(DEMO.pim.regionsCsv, CAT).rows;
  const P = PD.build(MULTI, raw(), { sections: new Set(["regions", "approvers"]), rows, userIds: { "anna@contoso.nl": "u-anna" } });
  const k = P.ops.map((o) => o.key);
  assert.ok(k.includes("au:AU-EU-DE-Devices") && k.includes("au:AU-EU-DE-Groups"));
  assert.ok(!k.includes("au:AU-EU-NL-Users"), "exists");
  assert.ok(P.findings.some((f) => /AU-EU-NL-Devices differs from the template/.test(f)));
  const de = P.ops.find((o) => o.key === "elig:Cloud Device Administrator:PIM-SG-EU-DE-Ops:AU-EU-DE-Devices");
  assert.equal(de.body.directoryScopeId, "/administrativeUnits/{{au:AU-EU-DE-Devices}}");
  assert.ok(k.includes("group:INT-SG-DEV-EU-DE-All"));
  assert.deepEqual(P.ops.find((o) => o.key === "group:INT-SG-DEV-EU-DE-All").body.groupTypes, ["DynamicMembership"]);
  assert.ok(P.ops.some((o) => o.key === "member:PIM-SG-EU-NL-Approvers:u-anna"));
  assert.ok(P.findings.some((f) => /approver mihai@contoso.nl was not found/.test(f)));
});

test("rmau is off unless ticked; ticked it makes the restricted unit and scopes the desk on it", () => {
  const r = raw(); r.aus = r.aus.filter((a) => a.displayName !== "AU-RM-Executives");
  const s = PD.sections(LARGE, r, {});
  assert.equal(s.find((x) => x.key === "rmau").defaultOn, false);
  const P = PD.build(LARGE, r, { sections: new Set(["groups", "rmau"]) });
  const u = P.ops.find((o) => o.key === "au:AU-RM-Executives");
  assert.equal(u.body.isMemberManagementRestricted, true);
  const vip = P.ops.find((o) => o.key === "elig:Helpdesk Administrator:PIM-SG-M365-ServiceDesk-VIP:AU-RM-Executives");
  assert.equal(vip.body.directoryScopeId, "/administrativeUnits/{{au:AU-RM-Executives}}");
  assert.equal(vip.body.principalId, "{{group:PIM-SG-M365-ServiceDesk-VIP}}");
  assert.equal(PD.sections(SMALL, r, {}).find((x) => x.key === "rmau"), undefined, "small has no restricted unit");
});

test("the whole large plan runs end to end against a fake Graph: created ids flow into later ops, new groups' policies wait", async () => {
  const P = PD.build(LARGE, raw(), { domain: "contoso.nl" });
  let n = 0; const calls = [];
  const res = await PP.run(P, { send: async (m, u, b) => { calls.push({ m, u, b }); return m === "POST" ? { id: `new-${++n}` } : null; }, sleep: async () => {}, groupPolicy: async (op, ids) => (String(ids[`group:${op.group}`] || op.groupId).startsWith("new-") ? "deferred — not in PIM for Groups yet" : "done") });
  assert.equal(res.failed, 0); assert.equal(res.skipped, 0);
  assert.ok(res.deferred >= 6);
  assert.ok(!JSON.stringify(calls).includes("{{"), "no placeholder reaches Graph");
});

test("review 32429: approval on with a ready approver group only; eligibilities wait for their role's settings; the planned maximum caps the request", async () => {
  const r = raw();
  r.groups.push({ id: "g-ap0", displayName: "PIM-SG-Approvers-Tier0", isAssignableToRole: false });
  const one = PD.build(LARGE, r, { sections: new Set(["rolePolicies"]), approverMembers: { "PIM-SG-Approvers-Tier0": 1 } });
  assert.ok(!one.ops.some((o) => o.key === "rpol:Privileged Role Administrator:Approval_EndUser_Assignment"), "one approver is not enough");
  const three = PD.build(LARGE, r, { sections: new Set(["rolePolicies"]), approverMembers: { "PIM-SG-Approvers-Tier0": 3 } });
  const pra = three.ops.find((o) => o.key === "rpol:Privileged Role Administrator:Approval_EndUser_Assignment");
  assert.equal(pra.body.setting.approvalStages[0].primaryApprovers[0].groupId, "g-ap0");
  // A role whose settings failed to change gets no eligibility in that run.
  const P = PD.build(LARGE, raw(), { sections: new Set(["groups", "rolePolicies", "eligibilities"]) });
  const e = P.ops.find((o) => o.key === "elig:Exchange Administrator:PIM-SG-M365-Collab:tenant scope");
  assert.ok(e.requires.length && e.requires.every((k) => k.startsWith("rpol:Exchange Administrator:")));
  let n = 0;
  const res = await PP.run(P, { send: async (m, u) => { if (m === "PATCH" && P.ops.find((o) => o.url === u && o.key.startsWith("rpol:Exchange Administrator:"))) throw Object.assign(new Error("Graph request failed (400)"), { status: 400 }); return m === "POST" ? { id: `n${++n}` } : null; }, sleep: async () => {} });
  assert.equal(res.outcome[P.ops.indexOf(e)].status, "skipped");
  // The maximum a run sets is the cap of the request that follows it.
  const V = Object.assign({}, LARGE, { templates: Object.assign({}, LARGE.templates, { Tier1: Object.assign({}, LARGE.templates.Tier1, { MaximumEligibilityDuration: "P180D" }) }) });
  const Q = PD.build(V, raw(), { sections: new Set(["groups", "rolePolicies", "eligibilities"]) });
  assert.equal(Q.ops.find((o) => o.key === "elig:Exchange Administrator:PIM-SG-M365-Collab:tenant scope").body.scheduleInfo.expiration.duration, "P180D");
  // A context no enabled policy enforces is said.
  const C = PD.build(LARGE, raw(), { sections: new Set(["rolePolicies"]), caPolicies: [] });
  assert.ok(C.findings.some((f) => /authentication context c1: no enabled Conditional Access policy targets it/.test(f)));
});

test("review 32429: backups hold PIM policy rules only; the lens never scopes on an unrestricted or duplicate unit", () => {
  const P = PP.newPlan({});
  PP.add(P, { key: "introlefix:X", method: "PATCH", url: `${PP.BETA}/deviceManagement/roleDefinitions/r1`, body: {}, before: { a: 1 }, summary: "x" });
  PP.add(P, { key: "rpol:A:B", method: "PATCH", url: `${PP.V1}/policies/roleManagementPolicies/p/rules/Expiration_EndUser_Assignment`, body: {}, before: { id: "Expiration_EndUser_Assignment" }, summary: "y" });
  assert.deepEqual(PP.backup(P).rules.map((r) => r.key), ["rpol:A:B"]);
  const RM = new Function("PimPlan", read("js/pimrmau.js") + ";return PimRmau;")(PP);
  const d = clone(DEMO.pim);
  d.aus = d.aus.map((a) => (a.displayName === "AU-RM-Executives" ? Object.assign({}, a, { isMemberManagementRestricted: false }) : a));
  d.groups.push({ id: "g-vip", displayName: "PIM-SG-M365-ServiceDesk-VIP", isAssignableToRole: true });
  const c = RM.check(LARGE, { aus: d.aus, members: {}, eligible: d.eligible, active: d.active, groups: d.groups, named: d.named, roles: d.roleDefinitions });
  assert.equal(c.units[0].status, "unrestricted"); assert.equal(c.units[0].id, null);
  assert.ok(c.units[0].scoped.every((s) => s.status !== "missing"), "nothing to tick onto the wrong unit");
});

test("approval readiness requires a known count of at least two users", () => {
  const r = raw();
  r.groups.push({ id: "ready-approvers", displayName: "PIM-SG-Approvers-Tier0", isAssignableToRole: false });
  const key = "rpol:Privileged Role Administrator:Approval_EndUser_Assignment";
  for (const count of [undefined, null, NaN, -1, 0, 1, "2"]) {
    const plan = PD.build(LARGE, r, { sections: new Set(["rolePolicies", "groupPolicies"]), approverMembers: { "PIM-SG-Approvers-Tier0": count } });
    assert.ok(!plan.ops.some(o => o.key === key), `must not enable approval for count ${count}`);
    assert.ok(plan.manual.some(x => x.includes("PIM-SG-Approvers-Tier0")));
    assert.ok(plan.ops.filter(o => o.kind === "groupPolicy" && o.settings.ApprovalRequired).every(o => o.skipApproval));
  }
  const ready = PD.build(LARGE, r, { sections: new Set(["rolePolicies"]), approverMembers: { "PIM-SG-Approvers-Tier0": 2 } });
  assert.ok(ready.ops.some(o => o.key === key));
});

// ---- 2.2: the Defender XDR groups travel as one section; the portal is never in the plan ----
test("2.2 xdr section: the PIM-SG-XDR groups and their policies, on by default, nothing for the Defender portal but a By hand line", () => {
  const r = raw();
  const secs = PD.sections(LARGE, r, {});
  const x = secs.find((s) => s.key === "xdr");
  assert.ok(x && x.defaultOn, "Defender XDR groups is a section of its own, on by default");
  assert.equal(x.kinds.create, 5, "five groups to make"); assert.equal(x.kinds.later, 5, "five membership policies once PIM for Groups knows them");
  assert.equal(PD.sections(SMALL, r, {}).find((s) => s.key === "xdr").kinds.create, 3, "small: Admin, Operator-T3, Reader");
  const P = PD.build(LARGE, r, { sections: new Set(["xdr"]), domain: "contoso.nl" });
  assert.deepEqual(P.blocked, []);
  const groups = P.ops.filter((o) => o.key.startsWith("group:")).map((o) => o.key);
  assert.deepEqual(groups.sort(), ["group:PIM-SG-XDR-Admin", "group:PIM-SG-XDR-Operator-T1", "group:PIM-SG-XDR-Operator-T2", "group:PIM-SG-XDR-Operator-T3", "group:PIM-SG-XDR-Reader"]);
  for (const o of P.ops) { assert.equal(o.section, "xdr"); assert.ok(!/defender|security\.microsoft|roleManagement\/defender/i.test(o.url || ""), "nothing in the plan touches the Defender portal"); }
  const adm = P.ops.find((o) => o.key === "gpolnew:PIM-SG-XDR-Admin");
  assert.equal(adm.settings.AuthenticationContext_Value, "c1"); assert.equal(adm.settings.ActivationDuration, "PT2H"); assert.equal(adm.skipApproval, true, "no approver group with two members yet → approval waits, as everywhere");
  assert.ok(P.manual.some((m) => /Defender XDR: in the Defender portal .*PIM-SG-XDR-Admin → Defender XDR Administrator/.test(m)));
  assert.ok(P.manual.some((m) => /PIM-SG-INT-\* and PIM-SG-XDR-\* access groups ELIGIBLE/.test(m)));
  // Unticked: no XDR group, no XDR policy, even with Membership policies on.
  const Q = PD.build(LARGE, r, { sections: new Set(["groups", "groupPolicies"]), domain: "contoso.nl" });
  assert.ok(!Q.ops.some((o) => /PIM-SG-XDR/.test(o.key)));
});
