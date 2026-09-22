// Assign.newGuestsBlock (js/assign.js) — the guest / external-user clause.
// Run with the other offline checks: node --test tools/*.test.cjs
//
// Unlike groups and roles this is not a list of ids but ONE object per side,
// so the actions mean something different and the edges are where the risk is:
// a tenant scope that cannot merge, an empty type list that is not a valid
// clause, and a clause that must survive an edit aimed at something else.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(box);
vm.runInContext("const Graph={},CaGroups={},GROUP_TEMPLATES=[];", box);
vm.runInContext(fs.readFileSync(path.join(root, "js/assign.js"), "utf8"), box, { filename: "assign.js" });
vm.runInContext("globalThis.A = Assign;", box);
const { A } = box;
// assign.js runs in a vm context, so the objects it builds carry that realm's
// Object/Array prototypes and assert's deepEqual refuses them as "same
// structure but not reference-equal". Compare the plain data.
const plain = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const eq = (actual, expected, msg) => assert.deepEqual(plain(actual), plain(expected), msg);

const ALL = { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" };
const some = (...ids) => ({ "@odata.type": "#microsoft.graph.conditionalAccessEnumeratedExternalTenants", membershipKind: "enumerated", members: ids });
const policy = (users) => ({ conditions: { users } });
const selAll = (...types) => ({ types, tenantKind: "all", tenantIds: [] });
const selSome = (types, ids) => ({ types, tenantKind: "enumerated", tenantIds: ids });
// action numbers, as the wizard uses them
const SET_INC = 0, SET_EXC = 1, ADD_INC = 2, ADD_EXC = 3, RM_INC = 5, RM_EXC = 6;

test("Set EXCLUDE writes the clause with the right @odata.type for all tenants", () => {
  const { users } = A.newGuestsBlock(policy({ includeUsers: ["All"] }), SET_EXC, selAll("serviceProvider"));
  eq(users.excludeGuestsOrExternalUsers, {
    guestOrExternalUserTypes: "serviceProvider",
    externalTenants: ALL,
  });
  assert.equal(users.includeGuestsOrExternalUsers, null);
  // an exclusion does not touch who is included
  eq(users.includeUsers, ["All"]);
});

test("named tenants carry the enumerated @odata.type — the abstract base is rejected without it", () => {
  const { users } = A.newGuestsBlock(policy({}), SET_EXC, selSome(["b2bCollaborationGuest"], ["11111111-1111-1111-1111-111111111111"]));
  const et = users.excludeGuestsOrExternalUsers.externalTenants;
  assert.equal(et["@odata.type"], "#microsoft.graph.conditionalAccessEnumeratedExternalTenants");
  assert.equal(et.membershipKind, "enumerated");
  eq(et.members, ["11111111-1111-1111-1111-111111111111"]);
});

test("guests on the INCLUDE side clear 'All users', and say so", () => {
  const { users, notes } = A.newGuestsBlock(policy({ includeUsers: ["All"] }), SET_INC, selAll("b2bCollaborationGuest"));
  eq(users.includeUsers, ["None"]);
  assert.match(notes.join(" "), /clears 'All users'/);
  assert.ok(users.includeGuestsOrExternalUsers);
});

test("ADD unions the types when the tenant scope already matches", () => {
  const raw = policy({ excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: ALL } });
  const { users, skip } = A.newGuestsBlock(raw, ADD_EXC, selAll("serviceProvider"));
  assert.equal(skip, null);
  assert.equal(users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes, "b2bCollaborationGuest,serviceProvider");
});

test("ADD onto a DIFFERENT tenant scope is skipped, with the reason", () => {
  const raw = policy({ excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: some("22222222-2222-2222-2222-222222222222") } });
  const { skip } = A.newGuestsBlock(raw, ADD_EXC, selAll("serviceProvider"));
  assert.ok(skip, "the policy must not be silently rescoped");
  assert.match(skip, /already scoped to 1 named tenant/);
  assert.match(skip, /"Set"/);
});

test("ADD with the same named tenants, in any order, is not a conflict", () => {
  const a = "33333333-3333-3333-3333-333333333333", b2 = "44444444-4444-4444-4444-444444444444";
  const raw = policy({ excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: some(a, b2) } });
  const { skip, users } = A.newGuestsBlock(raw, ADD_EXC, selSome(["serviceProvider"], [b2, a]));
  assert.equal(skip, null);
  assert.equal(users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes, "b2bCollaborationGuest,serviceProvider");
  // the scope the policy had is kept, not rewritten from the selection
  eq(users.excludeGuestsOrExternalUsers.externalTenants.members, [a, b2]);
});

test("ADD onto a policy with no clause creates it from the selection", () => {
  const { users, skip } = A.newGuestsBlock(policy({}), ADD_EXC, selAll("serviceProvider"));
  assert.equal(skip, null);
  assert.equal(users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes, "serviceProvider");
});

test("REMOVE takes types out and keeps the tenant scope", () => {
  const raw = policy({ excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest,serviceProvider", externalTenants: some("55555555-5555-5555-5555-555555555555") } });
  const { users } = A.newGuestsBlock(raw, RM_EXC, selAll("serviceProvider"));
  assert.equal(users.excludeGuestsOrExternalUsers.guestOrExternalUserTypes, "b2bCollaborationGuest");
  eq(users.excludeGuestsOrExternalUsers.externalTenants.members, ["55555555-5555-5555-5555-555555555555"]);
});

test("REMOVING the last type drops the whole clause — an empty type list is not valid", () => {
  const raw = policy({ excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "serviceProvider", externalTenants: ALL } });
  const { users, notes } = A.newGuestsBlock(raw, RM_EXC, selAll("serviceProvider"));
  assert.equal(users.excludeGuestsOrExternalUsers, null, "null is how Graph is told to drop it");
  assert.match(notes.join(" "), /removes the whole guest/);
});

test("REMOVE on a policy that has no clause is a no-op, not a crash", () => {
  const { users, skip } = A.newGuestsBlock(policy({ includeUsers: ["All"] }), RM_EXC, selAll("serviceProvider"));
  assert.equal(skip, null);
  assert.equal(users.excludeGuestsOrExternalUsers, null);
});

test("the OTHER side's clause is never touched", () => {
  const inc = { guestOrExternalUserTypes: "internalGuest", externalTenants: ALL };
  const raw = policy({ includeGuestsOrExternalUsers: inc });
  const { users } = A.newGuestsBlock(raw, SET_EXC, selAll("serviceProvider"));
  eq(users.includeGuestsOrExternalUsers, inc);
});

test("a ROLE edit no longer drops the guest clause", () => {
  // conditions.users is PATCHed whole, so a block left out of the object is a
  // block deleted from the policy. Until 25430 the roles path omitted both.
  const exc = { guestOrExternalUserTypes: "serviceProvider", externalTenants: ALL };
  const raw = policy({ includeUsers: ["All"], excludeGuestsOrExternalUsers: exc });
  const { users } = A.newUsersBlock(raw, 3 /* add to exclude roles */, ["role-id"], "roles");
  eq(users.excludeGuestsOrExternalUsers, exc, "the exclusion must survive a role edit");
  eq(users.excludeRoles, ["role-id"]);
});

test("a GROUP edit still carries the guest clause through", () => {
  const exc = { guestOrExternalUserTypes: "serviceProvider", externalTenants: ALL };
  const raw = policy({ includeUsers: ["All"], excludeGuestsOrExternalUsers: exc });
  const { users } = A.newUsersBlock(raw, 3 /* add to exclude groups */, ["group-id"], "groups");
  eq(users.excludeGuestsOrExternalUsers, exc);
});

test("the action list is the guest one for the guests target", () => {
  const a = A.actionsFor("guests");
  assert.equal(a.length, 8);
  assert.equal(a[4], null, "'All users' has no guest equivalent");
  assert.equal(a[7], null, "the CAxxx-Exclusion convention is about groups");
  assert.match(a[3], /ADD to EXCLUDE guest types/);
});

test("clause labels read the way the exclusion analyzer writes them", () => {
  assert.equal(
    A.guestClauseLabel({ guestOrExternalUserTypes: "serviceProvider", externalTenants: ALL }),
    "Service provider users — all external tenants");
  assert.equal(
    A.guestClauseLabel({ guestOrExternalUserTypes: "b2bCollaborationGuest,serviceProvider", externalTenants: some("a", "b") }),
    "B2B collaboration guests, Service provider users — 2 named tenants");
  assert.equal(A.guestClauseLabel(null), "none");
});
