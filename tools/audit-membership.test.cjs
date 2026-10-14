// T16 / T12 (beta 32511): who was added to a CA exclusion group, and when.
// The event shapes below are the ones cloudfellows.dev returned on 13 Oct 2026
// (names replaced). No credentials, packages or network.
// Run: node --test tools/audit-membership.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error, isFinite };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root, "js/audit.js"), "utf8") + ";globalThis.A=Audit;", box);
const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/groupsview.js"), "utf8") + ";globalThis.GV=GroupsView;", ctx);
const A = box.A, GV = ctx.GV;

const GID = "031484ab-c7ad-4ad1-97bd-983abc1dbb3e", UID = "7f0bc7a6-08fb-449d-96a0-5baa6d9b6ae4";
const appBy = { user: null, app: { appId: null, displayName: "Automation App", servicePrincipalId: "38a54ac6" } };
const userBy = { user: { displayName: "Sam Admin", userPrincipalName: "sam.admin@contoso.example", ipAddress: "" }, app: null };
const member = (extra) => ({ id: UID, displayName: null, type: "User", userPrincipalName: "eva@contoso.example", groupType: null,
  modifiedProperties: [{ displayName: "Group.ObjectID", oldValue: null, newValue: `"${GID}"` }, { displayName: "Group.DisplayName", oldValue: null, newValue: '"Excl-Test"' }, ...(extra || [])] });
const group = { id: GID, displayName: null, type: "Group", userPrincipalName: null, groupType: "unknownFutureValue", modifiedProperties: [] };
const ev = (activity, when, result, by, extra) => ({ id: `Directory_${activity}_${when}`, category: "GroupManagement", result, resultReason: "",
  activityDisplayName: activity, activityDateTime: when, loggedByService: "Core Directory", operationType: activity.startsWith("Add") ? "Assign" : "Unassign",
  initiatedBy: by, targetResources: [member(extra), group] });
const watch = new Map([[GID, { name: "Excl-Test", how: "exclude", policies: ["P005 MFA for everyone"] }]]);

test("the membership read asks for the two exact activities, never startswith or ne", () => {
  const qs = A.queryMembershipExact(30).map(decodeURIComponent);
  assert.equal(qs.length, 2);
  assert.ok(qs[0].includes("activityDisplayName eq 'Add member to group'"));
  assert.ok(qs[1].includes("activityDisplayName eq 'Remove member from group'"));
  for (const q of qs) { assert.ok(!/startswith|\bne\b/.test(q)); assert.ok(q.includes("activityDateTime ge")); }
});

test("a successful add by an app on an exclusion group is applied, flagged, and names the member", () => {
  const r = A.parseMembership(ev("Add member to group", "2026-10-13T08:36:24Z", "success", appBy), watch, { utcOffsetMinutes: 0 });
  assert.equal(r.applied, true); assert.equal(r.action, "add");
  assert.equal(r.member, "eva@contoso.example"); assert.equal(r.memberUpn, "eva@contoso.example"); assert.equal(r.memberId, UID);
  assert.equal(r.actor.kind, "app");
  assert.deepEqual([...r.flags].sort(), ["byApp", "widensBypass"]);   // 08:36 UTC on a Tuesday is not off hours
});

test("a failed duplicate add is refused: not applied, reason named, no bypass flag", () => {
  const r = A.parseMembership(ev("Add member to group", "2026-10-13T08:36:38Z", "failure", appBy,
    [{ displayName: "MethodExecutionResult.", oldValue: null, newValue: '"Microsoft.Online.DirectoryServices.DirectoryValueExistsException"' }]), watch);
  assert.equal(r.applied, false);
  assert.equal(r.failure, "DirectoryValueExistsException");
  assert.deepEqual([...r.flags], ["failed"]);
});

test("summarize does not count a refused add as an add or as a person who moved", () => {
  const rows = [
    A.parseMembership(ev("Add member to group", "2026-10-13T08:36:24Z", "success", userBy), watch),
    A.parseMembership(ev("Add member to group", "2026-10-13T08:36:38Z", "failure", userBy), watch),
  ];
  const [s] = A.summarize(rows);
  assert.equal(s.add, 1); assert.equal(s.failed, 1); assert.equal(s.total, 1); assert.equal(s.memberCount, 1);
});

test("noise in GroupManagement never becomes a membership row", () => {
  const noise = [
    { id: "1", category: "GroupManagement", result: "success", activityDisplayName: "Add group", activityDateTime: "2026-10-13T06:45:30Z", initiatedBy: appBy, targetResources: [{ id: GID, type: "Group", modifiedProperties: [] }] },
    { id: "2", category: "GroupManagement", result: "success", activityDisplayName: "GroupsODataV4_Get", activityDateTime: "2026-10-12T12:05:36Z", initiatedBy: userBy, targetResources: [{ id: "00000000-0000-0000-0000-000000000000", type: "Other", modifiedProperties: [] }] },
    { id: "3", category: "GroupManagement", result: "success", activityDisplayName: "Add member to role in PIM completed (permanent)", activityDateTime: "2026-10-05T10:01:30Z", initiatedBy: appBy, targetResources: [{ id: GID, type: "Group", modifiedProperties: [] }] },
  ];
  const res = A.build([...noise, ev("Add member to group", "2026-10-13T08:36:24Z", "success", userBy)], { watch });
  assert.equal(res.rows.filter((r) => r.kind === "membership").length, 1);
});

test("addedIndex: latest successful add wins, a later removal clears it, a refused add changes nothing", () => {
  const P = (a, t, res, by) => A.parseMembership(ev(a, t, res, by), null);
  const idx = A.addedIndex([
    P("Add member to group", "2026-10-10T09:00:00Z", "success", userBy),
    P("Add member to group", "2026-10-11T09:00:00Z", "failure", appBy),
  ]);
  assert.equal(idx["eva@contoso.example"].by, "Sam Admin");
  assert.equal(idx["eva@contoso.example"].when, "2026-10-10T09:00:00Z");
  assert.equal(idx[UID].byKind, "user");
  const gone = A.addedIndex([
    P("Add member to group", "2026-10-10T09:00:00Z", "success", userBy),
    P("Remove member from group", "2026-10-12T09:00:00Z", "success", appBy),
  ]);
  assert.deepEqual(Object.keys(gone), []);
});

test("offHours: nights and weekends in the given offset, office hours not", () => {
  assert.equal(A.offHours("2026-10-13T08:00:00Z", 0), false);        // Tue 08:00
  assert.equal(A.offHours("2026-10-13T22:41:00Z", 0), true);         // Tue 22:41
  assert.equal(A.offHours("2026-10-13T05:30:00Z", 0), true);         // Tue 05:30
  assert.equal(A.offHours("2026-10-17T11:00:00Z", 0), true);         // Saturday
  assert.equal(A.offHours("2026-10-13T22:30:00Z", 120), true);       // Wed 00:30 local
  assert.equal(A.offHours("2026-10-13T08:00:00Z", 600), false);      // 18:00 local, still office hours
  assert.equal(A.offHours("not a date"), false);
});

test("drawer: direct members show when and by whom once the history was read; nested ones and unread groups do not", () => {
  const r = { id: GID, name: "Excl-Test", members: [{ id: UID, name: "Eva", upn: "eva@contoso.example", direct: true }, { id: "u2", name: "Bo", upn: "bo@contoso.example", direct: true }],
    memberTotal: 2, directIds: true, children: [] };
  const c = { excOn: 1 };
  const plain = GV.memberTree(r, c, {});
  assert.ok(!/added/.test(plain));
  const o = { hist: { id: GID, more: false, added: { "eva@contoso.example": { when: "13 Oct 2026, 08:36", by: "Automation App", byKind: "app" } } } };
  const html = GV.memberTree(r, c, o);
  assert.match(html, /added 13 Oct 2026, 08:36 by Automation App \(app\)/);
  assert.match(html, /bo@contoso\.example · no add in the last 30 days/);
  const other = GV.memberTree(r, c, { hist: { id: "another-group", added: {} } });
  assert.ok(!/added|no add/.test(other));
});

test("drawer: a truncated history never claims a member was added earlier", () => {
  const r = { id: GID, name: "Excl-Test", members: [{ id: "u2", name: "Bo", upn: "bo@contoso.example", direct: true }], memberTotal: 1, directIds: true, children: [] };
  const html = GV.memberTree(r, { excOn: 1 }, { hist: { id: GID, more: true, added: {} } });
  assert.match(html, /no add among the newest events read/);
  assert.ok(!/earlier/.test(html));
});
