// 🔀 Merge duplicate groups (js/groupmerge.js, build 25477).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const GM = require("../js/groupmerge.js");

const row = (id, name, extra) => ({ id, name, status: "present", refs: { include: [], exclude: [] }, refCount: 0, ...extra });
const pol = (id, users) => ({ id, displayName: id, state: "disabled", conditions: { users: { includeUsers: [], excludeUsers: [], includeGroups: [], excludeGroups: [], ...users } } });
const M = (entries) => new Map(entries.map(([id, list]) => [id, { ok: true, list: list.map((x) => ({ id: x, type: "user", name: x })) }]));

test("two groups with one name form a set; the one more policies use is suggested", () => {
  const sets = GM.duplicateSets([row("a", "CAB-SEC-U-Persona-Externals", { refCount: 4 }), row("b", "cab-sec-u-persona-externals ", { refCount: 9 }), row("c", "Other")]);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].keepId, "b");
});

test("the plan swaps include AND exclude, moves only missing members, and renames aside by default", () => {
  const set = GM.duplicateSets([row("keep", "X", { refCount: 2 }), row("drop", "X")])[0];
  const raws = [pol("CA300", { includeGroups: ["drop"] }), pol("CA000", { excludeGroups: ["keep", "drop", "bg"] }), pol("CA999", { includeGroups: ["other"] })];
  const p = GM.plan(set, "keep", raws, M([["keep", ["u1"]], ["drop", ["u1", "u2"]]]));
  assert.ok(p.canRun);
  assert.deepEqual(p.moves.map((m) => m.id), ["u2"]);
  assert.deepEqual(p.edits.map((e) => e.id), ["CA300", "CA000"]);
  assert.equal(p.remove, "rename");
  assert.match(p.archiveNames[0].to, /^X \(merged \d{4}-\d{2}-\d{2}\)$/);
  assert.deepEqual(GM.usersWithSwap(raws[1].conditions.users, ["drop"], "keep").excludeGroups, ["keep", "bg"]);
});

test("refused: keeping a dynamic group that lacks the other's members", () => {
  const set = GM.duplicateSets([row("dyn", "X", { dynamic: true, refCount: 5 }), row("asg", "X")])[0];
  const p = GM.plan(set, "dyn", [], M([["dyn", []], ["asg", ["u1"]]]));
  assert.equal(p.canRun, false);
  assert.match(p.refusals[0].why, /DYNAMIC/);
  assert.ok(GM.plan(set, "asg", [], M([["dyn", []], ["asg", ["u1"]]])).canRun, "keeping the assigned one is fine");
});

test("refused: a policy that includes one and excludes the other", () => {
  const set = GM.duplicateSets([row("a", "X"), row("b", "X")])[0];
  const p = GM.plan(set, "a", [pol("P", { includeGroups: ["a"], excludeGroups: ["b"] })], M([["a", []], ["b", []]]));
  assert.equal(p.canRun, false);
  assert.match(p.refusals[0].why, /exclusion wins/);
});

test("refused: members that could not be read", () => {
  const set = GM.duplicateSets([row("a", "X"), row("b", "X")])[0];
  const p = GM.plan(set, "a", [], new Map([["a", { ok: true, list: [] }], ["b", { ok: false, error: "403" }]]));
  assert.equal(p.canRun, false);
});

function fakes(opts = {}) {
  const policies = new Map((opts.policies || []).map((p) => [p.id, JSON.parse(JSON.stringify(p))]));
  const calls = [];
  return { policies, calls, deps: {
    addMember: async (g, o) => { calls.push(["add", g, o]); if (opts.addFails === o) throw new Error("403 Forbidden"); },
    getPolicy: async (id) => JSON.parse(JSON.stringify(policies.get(id))),
    patchPolicy: async (id, body) => { calls.push(["patch", id]); if (opts.patchFails === id) throw new Error("400 BadRequest"); policies.get(id).conditions.users = body.conditions.users; },
    readSettled: async (id) => JSON.parse(JSON.stringify(policies.get(id))),
    renameGroup: async (id, name) => { calls.push(["rename", id, name]); },
    deleteGroup: async (id) => { calls.push(["delete", id]); },
  } };
}

test("the run goes members → policies → removal, and the policies end up on the kept group", async () => {
  const set = GM.duplicateSets([row("keep", "X", { refCount: 1 }), row("drop", "X")])[0];
  const raws = [pol("CA300", { includeGroups: ["drop"] }), pol("CA000", { excludeGroups: ["drop"] })];
  const p = GM.plan(set, "keep", raws, M([["keep", []], ["drop", ["u9"]]]));
  const f = fakes({ policies: raws });
  const r = await GM.run(p, f.deps);
  assert.ok(r.ok);
  assert.deepEqual(f.calls.map((c) => c[0]), ["add", "patch", "patch", "rename"]);
  assert.deepEqual(f.policies.get("CA300").conditions.users.includeGroups, ["keep"]);
  assert.deepEqual(f.policies.get("CA000").conditions.users.excludeGroups, ["keep"]);
});

test("a policy that refuses the change leaves the other group in place", async () => {
  const set = GM.duplicateSets([row("keep", "X"), row("drop", "X")])[0];
  const raws = [pol("CA300", { includeGroups: ["drop"] })];
  const p = GM.plan(set, "keep", raws, M([["keep", []], ["drop", []]]), { remove: "delete" });
  const f = fakes({ policies: raws, patchFails: "CA300" });
  const r = await GM.run(p, f.deps);
  assert.equal(r.ok, false);
  assert.ok(!f.calls.some((c) => c[0] === "delete"), "never deletes a group a policy may still name");
  assert.match(r.error, /NOT removed/);
});

test("a member that cannot be added stops the run before any policy changes", async () => {
  const set = GM.duplicateSets([row("keep", "X"), row("drop", "X")])[0];
  const raws = [pol("CA300", { includeGroups: ["drop"] })];
  const p = GM.plan(set, "keep", raws, M([["keep", []], ["drop", ["u1"]]]));
  const f = fakes({ policies: raws, addFails: "u1" });
  const r = await GM.run(p, f.deps);
  assert.equal(r.ok, false);
  assert.ok(!f.calls.some((c) => c[0] === "patch"));
});

test("the policy is rebuilt from a FRESH read, not the snapshot", async () => {
  const set = GM.duplicateSets([row("keep", "X"), row("drop", "X")])[0];
  const snap = [pol("CA300", { includeGroups: ["drop"] })];
  const p = GM.plan(set, "keep", snap, M([["keep", []], ["drop", []]]));
  const live = [pol("CA300", { includeGroups: ["drop"], excludeGroups: ["added-since"] })];
  const f = fakes({ policies: live });
  await GM.run(p, f.deps);
  assert.deepEqual(f.policies.get("CA300").conditions.users.excludeGroups, ["added-since"], "an exclusion added after the plan survives");
});
