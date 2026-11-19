// node --test tools/encaaccess.test.cjs — 🔐 ENCA access (T62): the two PIM
// groups for Workspace 01 (design R94 v3). Pure model + plan + undo, offline.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const EA = require(path.join(__dirname, "..", "js", "encaaccess.js"));

const CAA = "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", GR = "f2ef992c-3afb-46b9-b7cf-a126ee74c451", SR = "5d6b6bb7-de71-4623-b4af-96380a352509", APA = "0526716b-113d-4c15-b2c8-68e3c22b9f80";
const rules = (o = {}) => [
  { id: "Expiration_EndUser_Assignment", "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule", isExpirationRequired: true, maximumDuration: "PT8H", target: { caller: "EndUser" } },
  { id: "Enablement_EndUser_Assignment", "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyEnablementRule", enabledRules: o.req || ["MultiFactorAuthentication"], target: { caller: "EndUser" } },
  { id: "AuthenticationContext_EndUser_Assignment", "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyAuthenticationContextRule", isEnabled: !!o.ac, claimValue: o.ac ? "c1" : null },
  { id: "Approval_EndUser_Assignment", "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule", setting: { isApprovalRequired: !!o.approval } },
  { id: "Expiration_Admin_Eligibility", "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule", isExpirationRequired: o.permElig === false, maximumDuration: "P365D" },
  { id: "Expiration_Admin_Assignment", "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule", isExpirationRequired: false, maximumDuration: "P180D" },
];
function raw(extra) {
  return Object.assign({
    groups: [], roleDefs: [GR, SR, CAA, APA].map((id) => ({ id, templateId: id, isBuiltIn: true, displayName: id })),
    active: [], eligible: [],
    aus: [{ id: "au1", displayName: "CA-RMAU-BreakGlass", isMemberManagementRestricted: true }, { id: "au2", displayName: "CA-RMAU-Persona-Admins", isMemberManagementRestricted: true }, { id: "au3", displayName: "CA-RMAU-Old", isMemberManagementRestricted: false }, { id: "au4", displayName: "AU-Region-EU", isMemberManagementRestricted: true }],
    policies: { [CAA]: { id: "pol-caa", rules: rules() }, [APA]: { id: "pol-apa", rules: rules({ ac: true, req: [] }) } },
    members: {}, me: { id: "me1", upn: "mihai@contoso.nl", canWrite: true, via: "Privileged Role Administrator" },
    sp: { id: "sp1", appId: "app1", displayName: "ENCA", appRoleAssignmentRequired: false, assignedTo: [] }, skus: { p1: true, p2: true },
  }, extra || {});
}

test("empty tenant: two groups, the custom role, 2 active + 3 eligible at tenant + the Group Operator at each RESTRICTED CA-RMAU-* unit", () => {
  const r = EA.compare(raw());
  assert.equal(r.rows.filter((x) => x.kind === "group").length, 2);
  assert.ok(r.rows.find((x) => x.kind === "roleDef" && x.status === "create"));
  const asg = r.rows.filter((x) => x.kind === "assignment");
  assert.equal(asg.length, 2 + 3 + 2, "au3 is not restricted, AU-Region-EU is not CA-RMAU-*");
  assert.ok(asg.every((x) => x.status === "create"));
  assert.ok(r.rows.every((x) => x.why && x.why.length > 20), "every row says why");
  const P = EA.plan(raw(), r, { PimPlan: PP });
  assert.deepEqual(P.blocked, []);
  const keys = P.ops.map((o) => o.key);
  assert.deepEqual(keys.slice(0, 3), ["group:read", "group:admin", "roledef"], "creates first");
  const elig = P.ops.filter((o) => /roleEligibilityScheduleRequests$/.test(o.url));
  assert.equal(elig.length, 5);
  assert.ok(elig.some((o) => o.body.roleDefinitionId === "{{role:op}}" && o.body.directoryScopeId === "/administrativeUnits/au1"));
  assert.ok(elig.every((o) => o.body.principalId === "{{group:admin}}"));
  const act = P.ops.filter((o) => /roleAssignmentScheduleRequests$/.test(o.url));
  assert.deepEqual(act.map((o) => o.body.roleDefinitionId).sort(), [GR, SR].sort());
  const g = P.ops.find((o) => o.key === "group:read");
  assert.equal(g.body.isAssignableToRole, true);
  assert.deepEqual(P.ops.find((o) => o.key === "roledef").body.rolePermissions[0].allowedResourceActions.filter((a) => /delete/.test(a)), [], "no delete");
  assert.ok(!P.ops.some((o) => o.method === "PATCH"), "settings untouched unless ticked");
});

test("no Privileged Role Administrator active, a non-role-assignable group or a duplicate: blocked, nothing renamed or deleted", () => {
  assert.match(EA.plan(raw({ me: { id: "x", canWrite: false } }), EA.compare(raw({ me: { id: "x", canWrite: false } })), { PimPlan: PP }).blocked.join(" "), /Privileged Role Administrator/);
  const bad = raw({ groups: [{ id: "g1", displayName: "PIM-SG-ENCA-CA-Read", isAssignableToRole: false }] });
  assert.match(EA.plan(bad, EA.compare(bad), { PimPlan: PP }).blocked.join(" "), /not role-assignable/);
  const dup = raw({ groups: [{ id: "g1", displayName: "PIM-SG-ENCA-CA-Admin", isAssignableToRole: true }, { id: "g2", displayName: "PIM-SG-ENCA-CA-Admin", isAssignableToRole: true }] });
  assert.match(EA.plan(dup, EA.compare(dup), { PimPlan: PP }).blocked.join(" "), /exists 2 times/);
});

test("existing state: what exists is a match, ACTIVE where the design says eligible is reported and left, never removed", () => {
  const R = raw({ groups: [{ id: "gr", displayName: "PIM-SG-ENCA-CA-Read", isAssignableToRole: true }, { id: "ga", displayName: "PIM-SG-ENCA-CA-Admin", isAssignableToRole: true }],
    active: [{ principalId: "gr", roleDefinitionId: GR, directoryScopeId: "/", assignmentType: "Assigned" }, { principalId: "ga", roleDefinitionId: APA, directoryScopeId: "/", assignmentType: "Assigned" }],
    eligible: [{ principalId: "ga", roleDefinitionId: CAA, directoryScopeId: "/" }] });
  const r = EA.compare(R);
  assert.equal(r.rows.find((x) => x.key === `act:gr:/`).status, "ok");
  assert.equal(r.rows.find((x) => x.key === `elig:caa:/`).status, "ok");
  const apa = r.rows.find((x) => x.key === `elig:apa:/`);
  assert.equal(apa.status, "differs"); assert.match(apa.detail, /left, not removed/);
  const P = EA.plan(R, r, { PimPlan: PP });
  assert.ok(!P.ops.some((o) => o.key.startsWith("group:")));
  assert.ok(!P.ops.some((o) => /adminRemove/.test(JSON.stringify(o.body || {}))), "nothing removed");
  assert.ok(P.ops.find((o) => o.key === "elig:apa:/").body.principalId === "ga");
});

test("activation settings: only when ticked, only three rules, MFA left out where an auth context is asked, before kept", () => {
  const R = raw();
  const P = EA.plan(R, EA.compare(R), { PimPlan: PP, settings: true });
  const pat = P.ops.filter((o) => o.method === "PATCH");
  assert.ok(pat.length >= 4);
  assert.ok(pat.every((o) => /Expiration_EndUser_Assignment|Enablement_EndUser_Assignment|Expiration_Admin_Eligibility/.test(o.url)), "approval, auth context, notifications untouched");
  assert.ok(pat.every((o) => o.before && o.summary.includes("EVERYONE")));
  const caaExp = pat.find((o) => o.key === "rpol:caa:Expiration_EndUser_Assignment");
  assert.equal(caaExp.body.maximumDuration, "PT4H");
  const apaEn = pat.find((o) => o.key === "rpol:apa:Enablement_EndUser_Assignment");
  assert.deepEqual(apaEn.body.enabledRules, ["Justification"], "auth context role keeps it instead of MFA");
  assert.equal(pat.find((o) => o.key === "rpol:apa:Expiration_EndUser_Assignment").body.maximumDuration, "PT2H");
  assert.match(P.findings.join(" "), /ENCA CA Group Operator: activation settings not set — the role is made in this run/);
  const e = P.ops.find((o) => o.key === "elig:caa:/");
  assert.deepEqual(e.requires.sort(), pat.filter((o) => o.key.startsWith("rpol:caa:")).map((o) => o.key).sort(), "eligibility waits for its settings");
  assert.equal(e.body.scheduleInfo.expiration.type, "noExpiration");
});

test("without settings, a role that caps eligibility gets the cap and says so", () => {
  const R = raw({ policies: { [CAA]: { id: "pol-caa", rules: rules({ permElig: false }) }, [APA]: { id: "pol-apa", rules: rules() } } });
  const P = EA.plan(R, EA.compare(R), { PimPlan: PP });
  assert.deepEqual(P.ops.find((o) => o.key === "elig:caa:/").body.scheduleInfo.expiration, { type: "afterDuration", duration: "P365D" });
  assert.match(P.findings.join(" "), /at most P365D/);
});

test("people and the ENCA lock: members added direct, lock refused when you'd lock yourself out, assignment before the switch", () => {
  const R = raw();
  const r = EA.compare(R);
  const P1 = EA.plan(R, r, { PimPlan: PP, lock: true, members: { read: [{ id: "u2", name: "Anna" }] } });
  assert.match(P1.blocked.join(" "), /lock yourself out/);
  const P2 = EA.plan(R, r, { PimPlan: PP, lock: true, members: { read: [{ id: "me1", name: "Mihai" }], admin: [{ id: "me1", name: "Mihai" }] } });
  assert.deepEqual(P2.blocked, []);
  const m = P2.ops.find((o) => o.key === "member:read:me1");
  assert.equal(m.url, "https://graph.microsoft.com/v1.0/groups/{{group:read}}/members/$ref");
  const lock = P2.ops.find((o) => o.key === "applock");
  assert.deepEqual(lock.requires, ["appassign:read", "appassign:admin"]);
  assert.ok(P2.ops.indexOf(lock) > P2.ops.findIndex((o) => o.key === "appassign:admin"));
});

test("undo: what the run made, taken back in reverse — requests removed, member and app assignment deleted, rules put back, creates deleted", () => {
  const R = raw();
  const P = EA.plan(R, EA.compare(R), { PimPlan: PP, settings: true, lock: true, members: { read: [{ id: "me1", name: "Mihai" }] } });
  const ids = { "group:read": "GR1", "group:admin": "GA1", "role:op": "OP1" };
  const res = { ids, outcome: P.ops.map((o) => ({ key: o.key, status: "done", id: o.produces ? ids[o.produces] : o.key.startsWith("appassign:") ? `asg-${o.key}` : null })) };
  const U = EA.undoPlan(P, res, PP);
  assert.equal(U.ops.length, P.ops.length);
  assert.equal(U.ops[0].key, `undo:${P.ops[P.ops.length - 1].key}`, "reverse order");
  assert.equal(U.ops[U.ops.length - 1].url, "https://graph.microsoft.com/v1.0/groups/GR1", "the first create is deleted last");
  const rm = U.ops.find((o) => o.key === "undo:elig:op:/administrativeUnits/au1");
  assert.equal(rm.body.action, "adminRemove"); assert.equal(rm.body.roleDefinitionId, "OP1"); assert.equal(rm.body.principalId, "GA1");
  assert.equal(U.ops.find((o) => o.key === "undo:member:read:me1").url, "https://graph.microsoft.com/v1.0/groups/GR1/members/me1/$ref");
  assert.equal(U.ops.find((o) => o.key === "undo:applock").body.appRoleAssignmentRequired, false);
  assert.ok(U.ops.find((o) => o.key === "undo:roledef").url.endsWith("/roleDefinitions/OP1"));
  assert.ok(U.ops.find((o) => o.key === "undo:rpol:caa:Expiration_EndUser_Assignment").body.maximumDuration === "PT8H");
});

test("render: every role shows why, the settings say everyone, export has no buttons", () => {
  const R = raw();
  const r = EA.compare(R);
  const h = EA.render(r, { app: true });
  EA.ROLES.forEach((x) => assert.ok(h.includes(x.why.slice(0, 40).replace(/&/g, "&amp;").replace(/'/g, "&#39;")), x.name));
  assert.match(h, /everyone eligible/);
  assert.match(h, /data-easettings/);
  const md = EA.toMd(r, { tenant: "Contoso" });
  assert.match(md, /Why this role/);
  assert.doesNotMatch(EA.render(r, {}), /data-eaadd/);
});
