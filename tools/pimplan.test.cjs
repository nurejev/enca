// PIM plan / apply (js/pimplan.js) and the 🛡 T27 PIM lens (js/pimrmau.js),
// offline. The runner is the browser port of tools/pim/PimCommon.psm1: these
// tests hold it to the scripts' rules — placeholders, the replication retry,
// rule-by-rule PATCHes, deferred membership policies, nothing run that
// depends on a create that did not happen.
// Run: node --test tools/pimplan.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const PR = new Function("PimPlan", read("js/pimrmau.js") + ";return PimRmau;")(PP);
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));

test("ruleChanges: only the rules that differ, each sent back whole with its own @odata.type", () => {
  const rules = clone(DEMO.pim.policies["Exchange Administrator"]);
  const T = Object.assign({}, CAT.templates.Tier1);
  const r = PP.ruleChanges(rules, T, { domain: "contoso.nl" });
  assert.equal(r.problem, null);
  const ids = r.changes.map((c) => c.ruleId).sort();
  assert.ok(ids.includes("Expiration_EndUser_Assignment"), "24 h → 2 h");
  const act = r.changes.find((c) => c.ruleId === "Expiration_EndUser_Assignment");
  assert.equal(act.after.maximumDuration, "PT2H");
  assert.equal(act.after["@odata.type"], "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule");
  assert.equal(act.before.maximumDuration, "PT24H", "the before is kept for the backup");
  // A second pass over the changed rules finds nothing: idempotent.
  const after = rules.map((x) => (r.changes.find((c) => c.ruleId === x.id) || { after: x }).after);
  assert.deepEqual(PP.ruleChanges(after, T, { domain: "contoso.nl" }).changes, []);
});

test("ruleChanges: approval needs an approver id or a placeholder; recipients land in the alert domain", () => {
  const rules = clone(DEMO.pim.policies["Privileged Role Administrator"]);
  const T = Object.assign({}, CAT.templates.Tier0);
  const none = PP.ruleChanges(rules, T, { domain: "contoso.nl" });
  assert.match(none.problem, /PIM-SG-Approvers has no id/);
  const ok = PP.ruleChanges(rules, T, { domain: "contoso.nl", approverIds: { "PIM-SG-Approvers": "{{group:PIM-SG-Approvers}}" } });
  const ap = ok.changes.find((c) => c.ruleId === "Approval_EndUser_Assignment");
  assert.equal(ap.after.setting.isApprovalRequired, true);
  assert.equal(ap.after.setting.approvalStages[0].primaryApprovers[0].groupId, "{{group:PIM-SG-Approvers}}");
  const T2 = Object.assign({}, T, { Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts", "soc@evil.example"] } });
  const r2 = PP.ruleChanges(rules, T2, { domain: "contoso.nl", verifiedDomains: ["contoso.nl"], approverIds: { "PIM-SG-Approvers": "g1" } });
  const n = r2.changes.find((c) => c.ruleId === "Notification_Admin_EndUser_Assignment");
  assert.deepEqual(n.after.notificationRecipients, ["pim-alerts@contoso.nl", "soc@contoso.nl"], "an address outside the verified domains is rewritten to the alert domain");
});

test("eligibilityDuration: never more than the role's own maximum", () => {
  const rules = [{ id: "Expiration_Admin_Eligibility", isExpirationRequired: true, maximumDuration: "P180D" }];
  assert.deepEqual(PP.eligibilityDuration(rules, "P365D"), { duration: "P180D", capped: true });
  assert.deepEqual(PP.eligibilityDuration([{ id: "Expiration_Admin_Eligibility", isExpirationRequired: false }], "P365D"), { duration: "P365D", capped: false });
  assert.equal(PP.seconds("PT2H"), 7200);
  assert.equal(PP.seconds("P1D"), 86400);
});

function fakeSend(opts = {}) {
  const calls = []; let n = 0; const fail404 = Object.assign({}, opts.fail404 || {});
  const send = async (method, url, body) => {
    calls.push({ method, url, body: clone(body) });
    for (const k of Object.keys(fail404)) if (url.includes(k) || JSON.stringify(body || {}).includes(k)) { if (fail404[k]-- > 0) throw Object.assign(new Error(opts.msg404 || "Graph request failed (404): SubjectNotFound"), { status: 404 }); }
    if (opts.failOn && url.includes(opts.failOn)) throw Object.assign(new Error("Graph request failed (403): Forbidden"), { status: 403 });
    return method === "POST" ? { id: `new-${++n}`, status: /Requests$/.test(url) ? "Provisioned" : undefined } : null;
  };
  return { send, calls };
}

test("run: a placeholder takes the id the create returned; a 404 on it waits and tries again", async () => {
  const P = PP.newPlan({});
  PP.add(P, { key: "group:X", method: "POST", url: `${PP.V1}/groups`, produces: "group:X", body: { displayName: "X" }, summary: "create X" });
  PP.add(P, { key: "elig", kind: "request", url: `${PP.V1}/roleManagement/directory/roleEligibilityScheduleRequests`, body: PP.eligibility({ principalId: "{{group:X}}", roleDefinitionId: "r1" }), summary: "X eligible" });
  const f = fakeSend({ fail404: { "new-1": 2 } });
  const waits = [];
  const res = await PP.run(P, { send: f.send, sleep: async (ms) => { waits.push(ms); }, onWait: () => {} });
  assert.equal(res.done, 2); assert.equal(res.failed, 0);
  assert.deepEqual(waits, [5000, 10000]);
  const req = f.calls.filter((c) => /Requests$/.test(c.url)).pop();
  assert.equal(req.body.principalId, "new-1");
  assert.ok(req.body.scheduleInfo.startDateTime, "a request starts now");
  assert.match(res.outcome[1].status, /after 2 retries/);
});

test("run: an op that needs a create that failed is skipped, independent ops go on; a 404 on an OLD object is not retried", async () => {
  const P = PP.newPlan({});
  PP.add(P, { key: "group:X", method: "POST", url: `${PP.V1}/groups`, produces: "group:X", body: { displayName: "X" }, summary: "create X" });
  PP.add(P, { key: "elig", kind: "request", url: `${PP.V1}/roleManagement/directory/roleEligibilityScheduleRequests`, body: PP.eligibility({ principalId: "{{group:X}}", roleDefinitionId: "r1" }), summary: "X eligible" });
  PP.add(P, { key: "rule", method: "PATCH", url: `${PP.V1}/policies/roleManagementPolicies/p1/rules/Expiration_EndUser_Assignment`, body: { id: "Expiration_EndUser_Assignment" }, before: { id: "Expiration_EndUser_Assignment" }, summary: "rule" });
  const f = fakeSend({ failOn: "/groups" });
  const res = await PP.run(P, { send: f.send, sleep: async () => {} });
  assert.deepEqual(res.outcome.map((r) => r.status.split(" ")[0]), ["failed", "skipped", "done"]);
  const g = fakeSend({ fail404: { "p1/rules": 1 }, msg404: "Graph request failed (404): Resource not found" });
  const r2 = await PP.run(P, { send: g.send, sleep: async () => { throw new Error("must not wait"); } });
  assert.equal(r2.outcome[2].status, "failed", "a 404 on an object that existed before the run is a failure, not replication lag");
});

test("run: a membership policy of a group not in PIM for Groups yet is deferred, and Stop stops between ops", async () => {
  const P = PP.newPlan({});
  PP.add(P, { key: "gp", kind: "groupPolicy", group: "X", groupId: "g1", summary: "policy" });
  PP.add(P, { key: "b", method: "POST", url: `${PP.V1}/groups`, body: {}, summary: "b" });
  let stop = false;
  const parts = [];
  const res = await PP.run(P, { send: fakeSend().send, groupPolicy: async () => { stop = true; return "deferred — not in PIM for Groups yet"; }, stopped: () => stop, onPart: (i, n) => parts.push(n) });
  assert.equal(res.deferred, 1); assert.equal(res.outcome[1].status, "stopped"); assert.equal(parts.length, 1);
});

test("backup and restore: only PIM policy rules go back, anything else in a file is refused", () => {
  const P = PP.newPlan({ tenantId: "t" });
  PP.add(P, { key: "rpol:A:Expiration_EndUser_Assignment", method: "PATCH", url: `${PP.V1}/policies/roleManagementPolicies/p1/rules/Expiration_EndUser_Assignment`, body: {}, before: { id: "Expiration_EndUser_Assignment", maximumDuration: "PT24H", "@odata.context": "x" }, summary: "A" });
  PP.add(P, { key: "group:X", method: "POST", url: `${PP.V1}/groups`, body: {}, summary: "X" });
  const b = PP.backup(P);
  assert.equal(b.rules.length, 1);
  b.rules.push({ key: "evil", url: `${PP.V1}/users/u1`, before: { accountEnabled: false } });
  const r = PP.restorePlan(b);
  assert.equal(r.ops.length, 1); assert.equal(r.blocked.length, 1);
  assert.equal(r.ops[0].body["@odata.context"], undefined);
  assert.equal(r.ops[0].body.maximumDuration, "PT24H");
});

// ---- 🛡 T27 PIM lens ------------------------------------------------------
const data = (over = {}) => { const d = clone(DEMO.pim); return Object.assign({ aus: d.aus, members: d.rmauMembers, eligible: d.eligible, active: d.active, groups: d.groups, named: d.named, roles: d.roleDefinitions, policies: d.policies, readAt: 0, demo: true }, over); };
const LARGE = PB.profile(CAT, "large");

test("T27 lens: AU-RM-Executives present and restricted; the VIP desk blocked until its group exists", () => {
  const r = PR.check(LARGE, data());
  const u = r.units[0];
  assert.equal(u.name, "AU-RM-Executives"); assert.equal(u.status, "present");
  assert.deepEqual(u.members, { user: 3, device: 1, group: 1, other: 0 });
  const vip = u.scoped.filter((s) => s.group === "PIM-SG-M365-ServiceDesk-VIP");
  assert.equal(vip.length, 3); assert.ok(vip.every((s) => s.status === "blocked" && /does not exist yet/.test(s.detail)));
});

test("T27 lens: a PIM-SG group and an adm- account in a restricted unit are findings; executives are not", () => {
  const r = PR.check(LARGE, data());
  const k = r.violations.map((v) => `${v.memberName}:${v.kind}`).sort();
  assert.deepEqual(k, ["PIM-SG-M365-Tier0:pim-group", "adm-joey:admin-account"]);
  assert.equal(r.counts.violations, 2);
  // Removal is never ticked for you.
  assert.ok(![...PR.defaultSelection(r)].some((s) => s.startsWith("out:")));
  const P = PR.plan(LARGE, data(), r, new Set([`out:au-rm-admins|${r.violations[0].memberId}`]), {});
  assert.equal(P.ops.length, 1); assert.equal(P.ops[0].method, "DELETE"); assert.ok(P.ops[0].removes);
  assert.match(P.ops[0].url, /\/administrativeUnits\/au-rm-admins\/members\/.+\/\$ref$/);
});

test("T27 lens: a missing unit is created restricted, and the desk's eligibilities are scoped to it by placeholder", () => {
  const d = data();
  d.aus = d.aus.filter((a) => a.displayName !== "AU-RM-Executives");
  d.groups.push({ id: "g-vip", displayName: "PIM-SG-M365-ServiceDesk-VIP", isAssignableToRole: true }, { id: "g-idn", displayName: "PIM-SG-M365-Identity", isAssignableToRole: true });
  const r = PR.check(LARGE, d);
  assert.equal(r.units[0].status, "missing");
  const sel = PR.defaultSelection(r);
  assert.equal(sel.size, 5, "the unit and its four scoped eligibilities");
  const P = PR.plan(LARGE, d, r, sel, {});
  assert.equal(P.ops[0].body.isMemberManagementRestricted, true);
  assert.equal(P.ops[0].produces, "au:AU-RM-Executives");
  const e = P.ops.filter((o) => o.kind === "request");
  assert.equal(e.length, 4);
  assert.ok(e.every((o) => o.body.directoryScopeId === "/administrativeUnits/{{au:AU-RM-Executives}}" && o.body.action === "adminAssign"));
  assert.equal(PP.scopesOf(P).join(","), "AdministrativeUnit.ReadWrite.All,RoleManagement.ReadWrite.Directory");
});

test("T27 lens: a tenant-wide desk is flagged, a restricted regional unit is flagged, unread members are not judged", () => {
  const d = data();
  d.groups.push({ id: "g-vip", displayName: "PIM-SG-M365-ServiceDesk-VIP", isAssignableToRole: true });
  d.eligible.push({ roleName: "Helpdesk Administrator", principalId: "g-vip", principalName: "PIM-SG-M365-ServiceDesk-VIP", directoryScopeId: "/" });
  d.aus.push({ id: "au-x", displayName: "AU-EU-FR-Users", isMemberManagementRestricted: true });
  const r = PR.check(LARGE, d);
  assert.equal(r.units[0].scoped.find((s) => s.role === "Helpdesk Administrator").status, "wide");
  assert.equal(r.regional.length, 1);
  assert.deepEqual(r.unreadUnits, ["AU-EU-FR-Users"]);
  const small = PR.check(PB.profile(CAT, "small"), d);
  assert.equal(small.units.length, 0, "small business expects no restricted unit");
  assert.ok(PR.render(small, new Set(), { tab: "units" }).includes("No restricted unit"));
});
