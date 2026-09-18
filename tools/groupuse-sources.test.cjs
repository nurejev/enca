// The 25382 sources of the 🔗 User or Group analyzer (js/groupuse.js) against
// fixture Graph answers: Windows 365, Intune role assignments (both directions)
// and the enrolment configurations named for what they are.
// Run with the other offline checks: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const G = "11111111-1111-1111-1111-111111111111", S = "22222222-2222-2222-2222-222222222222", OTHER = "33333333-3333-3333-3333-333333333333";
function load(answers) {
  const calls = [];
  const box = { console: { warn() {}, log() {}, error() {} }, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error, Promise, URL, encodeURIComponent,
    Graph: { ggetAll: async (url) => { calls.push(url); const k = Object.keys(answers).find((p) => url.startsWith(p)); if (!k) throw new Error("404 · not found: " + url); const v = answers[k]; if (v instanceof Error) throw v; return v; }, ARM_SCOPES: [] } };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root, "js/groupuse.js"), "utf8") + "\n;globalThis.GU = GroupUse;", box);
  return { GU: box.GU, calls };
}
const ctx = () => ({ ids: new Set([G, S]), principal: { id: G }, isUser: false, status() {}, note() {} });
const target = (gid, excl) => ({ target: { "@odata.type": excl ? "#microsoft.graph.exclusionGroupAssignmentTarget" : "#microsoft.graph.cloudPcManagementGroupAssignmentTarget", groupId: gid } });

test("Windows 365: provisioning policies and user settings assigned to the group are hits; another group's are not", async () => {
  const { GU, calls } = load({
    "/deviceManagement/virtualEndpoint/provisioningPolicies": [{ id: "pp1", displayName: "W365 Sales", assignments: [target(G)] }, { id: "pp2", displayName: "W365 Other", assignments: [target(OTHER)] }],
    "/deviceManagement/virtualEndpoint/userSettings": [{ id: "us1", displayName: "Local admin on", assignments: [target(G)] }],
  });
  const hits = await GU.sourceById("w365").run(ctx());
  assert.equal(hits.length, 2);
  assert.equal(hits.find((h) => h.sub === "Provisioning policy").name, "W365 Sales");
  assert.equal(hits.find((h) => h.sub === "User settings").how, "assigned");
  assert.ok(calls.every((u) => u.includes("$expand=assignments")));
  assert.ok(GU.AREA_SCOPES.intune.includes("CloudPC.Read.All"));
});

test("Windows 365 absent from the tenant fails soft", async () => {
  const { GU } = load({});
  await assert.rejects(GU.sourceById("w365").run(ctx()), /404/);
});

test("Intune role assignments: a member group may manage, a scope group is managed — never the other way round", async () => {
  const { GU } = load({
    "/deviceManagement/roleAssignments?$expand": [
      { id: "ra1", displayName: "Helpdesk NL", roleDefinitionId: "rd1", roleDefinition: { displayName: "Help Desk Operator", isBuiltIn: true }, members: [G], resourceScopes: [S, OTHER], scopeType: "resourceScope" },
      { id: "ra2", displayName: "Everything", roleDefinitionId: "rd2", roleDefinition: { displayName: "Site Admins", isBuiltIn: false }, members: [OTHER], resourceScopes: [], scopeType: "allDevicesAndLicensedUsers" },
    ],
  });
  const hits = await GU.sourceById("intuneRbac").run(ctx());
  assert.equal(hits.length, 2);
  const member = hits.find((h) => h.pid === G), scope = hits.find((h) => h.pid === S);
  assert.equal(member.how, "member (may manage)"); assert.equal(member.sub, "Member"); assert.match(member.detail, /role: Help Desk Operator · scope: 2 scope groups/);
  assert.equal(scope.how, "in scope (is managed by)"); assert.equal(scope.sub, "Scope"); assert.match(scope.detail, /role: Help Desk Operator · 1 member group$/);
  assert.ok(!member.detail.includes("(custom)"));
  assert.ok(GU.AREA_SCOPES.intune.includes("DeviceManagementRBAC.Read.All"));
});

test("Intune role assignments: when $expand is refused the plain shape is read and the role name looked up; a custom role is marked", async () => {
  const { GU, calls } = load({
    "/deviceManagement/roleAssignments?$expand": new Error("400 · BadRequest expand not supported"),
    "/deviceManagement/roleAssignments": [{ id: "ra2", displayName: "Everything", roleDefinitionId: "rd2", members: [G], resourceScopes: [], scopeType: "allDevices" }],
    "/deviceManagement/roleDefinitions": [{ id: "rd2", displayName: "Site Admins", isBuiltIn: false }],
  });
  const hits = await GU.sourceById("intuneRbac").run(ctx());
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /role: Site Admins \(custom\) · scope: all devices/);
  assert.ok(calls.some((u) => u.startsWith("/deviceManagement/roleDefinitions")));
});

test("enrolment configurations are named for what they are", async () => {
  const t = (type, name, gid) => ({ id: name, displayName: name, "@odata.type": "#microsoft.graph." + type, assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: gid } }] });
  const { GU } = load({
    "/deviceManagement/deviceEnrollmentConfigurations": [
      t("windows10EnrollmentCompletionPageConfiguration", "ESP default", G),
      t("deviceEnrollmentWindowsHelloForBusinessConfiguration", "WHfB", G),
      t("deviceEnrollmentPlatformRestrictionConfiguration", "No Android", G),
      t("deviceEnrollmentLimitConfiguration", "Limit 5", G),
      t("deviceEnrollmentNotificationConfiguration", "Welcome mail", OTHER),
    ],
  });
  const src = GU.sourceById("intuneEnrollPlatform");
  assert.equal(src.label, "Enrolment configurations");
  const hits = await src.run(ctx());
  assert.equal(JSON.stringify(hits.map((h) => h.sub).sort()), JSON.stringify(["Enrollment Status Page", "Platform restriction", "Windows Hello for Business"]));
  assert.ok(!hits.some((h) => h.name === "Limit 5"), "limits stay with the device-limit source");
  assert.ok(!hits.some((h) => h.name === "Welcome mail"), "another group's notification is not a hit");
});
