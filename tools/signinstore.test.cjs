// SigninStore (js/signinstore.js, R58) on its memory backend — the interval
// arithmetic the delta read depends on, and the store verbs. Run with the
// other offline checks: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
function load() {
  const box = { console: { warn() {} }, Map, Set, JSON, Math, Date, Number, String, Array, Object, Promise, Infinity };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root, "js/signinstore.js"), "utf8") + "\n;globalThis.S = SigninStore;", box);
  return box.S;
}
const H = 3600000, D = 24 * H, T = Date.UTC(2026, 8, 15);
// arrays cross a vm context boundary here, so compare by value, not by prototype
const deq = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);

test("missing() is the window minus the coverage, merged and clipped", () => {
  const S = load();
  deq(S.merge([[5, 7], [1, 3], [2, 4], [7, 9]]), [[1, 4], [5, 9]]);
  deq(S.missing([0, 10], []), [[0, 10]]);
  deq(S.missing([0, 10], [[0, 10]]), []);
  deq(S.missing([0, 10], [[2, 4], [6, 7]]), [[0, 2], [4, 6], [7, 10]]);
  deq(S.missing([3, 8], [[0, 4], [7, 12]]), [[4, 7]]);
  deq(S.missing([3, 8], [[0, 3], [8, 12]]), [[3, 8]]);
  assert.equal(S.covered([0, 10], [[2, 4], [6, 12]]), 6);
});

test("consent is per tenant, off by default, and switching it off forgets the data", async () => {
  const S = load(); S._useMemory();
  assert.equal(await S.enabled("t1"), false);
  const c = await S.setConsent("t1", { on: true, ttlDays: 8 });
  assert.equal(c.on, true); assert.equal(c.ttlDays, 8); assert.ok(c.at);
  assert.equal(await S.enabled("t1"), true);
  assert.equal(await S.enabled("t2"), false, "another tenant is not covered by t1's consent");
  await S.putBuckets("t1", "huntall", T, T + H, [{ hour: new Date(T).toISOString(), n: 3 }]);
  await S.addCoverage("t1", "huntall", "ro", [T, T + H]);
  assert.equal((await S.getBuckets("t1", "huntall", T - D, T + D)).length, 1);
  await S.setConsent("t1", { on: false });
  assert.equal((await S.getBuckets("t1", "huntall", T - D, T + D)).length, 0, "off forgets the buckets");
  deq(await S.coverage("t1", "huntall", "ro"), [], "and the coverage");
  assert.equal((await S.consent("t1")).on, false, "the decision itself is remembered");
  const capped = await S.setConsent("t1", { on: true, ttlDays: 999 });
  assert.equal(capped.ttlDays, S.MAX_TTL_DAYS, "ttl is capped at what Microsoft keeps anyway");
});

test("a re-read of an hour replaces that hour whole; hours are read back in order; coverage merges", async () => {
  const S = load(); S._useMemory();
  await S.setConsent("t1", { on: true });
  const rec = (h, n) => ({ hour: new Date(T + h * H).toISOString(), createdDateTime: new Date(T + h * H + 60000).toISOString(), n });
  await S.putBuckets("t1", "hunt", T, T + 3 * H, [rec(0, 1), rec(1, 2), rec(2, 3), rec(2, 4)]);
  await S.addCoverage("t1", "hunt", "ro", [T, T + 3 * H]);
  deq((await S.getBuckets("t1", "hunt", T, T + 3 * H)).map((r) => r.n), [1, 2, 3, 4]);
  await S.putBuckets("t1", "hunt", T + 2 * H, T + 3 * H, [rec(2, 9)]);
  deq((await S.getBuckets("t1", "hunt", T, T + 3 * H)).map((r) => r.n), [1, 2, 9], "hour 2 replaced, not appended");
  await S.putBuckets("t1", "hunt", T + H, T + 2 * H, []);
  deq((await S.getBuckets("t1", "hunt", T, T + 3 * H)).map((r) => r.n), [1, 9], "an hour re-read as empty is emptied");
  await S.addCoverage("t1", "hunt", "ro", [T + 3 * H, T + 5 * H]);
  deq(await S.coverage("t1", "hunt", "ro"), [[T, T + 5 * H]]);
  deq(await S.coverage("t1", "huntall", "ro"), [], "coverage is per source");
  deq(S.missing([T - H, T + 6 * H], await S.coverage("t1", "hunt", "ro")), [[T - H, T], [T + 5 * H, T + 6 * H]]);
});

test("purge ages buckets out past the tenant's ttl and cuts the coverage to match; forget removes a tenant", async () => {
  const S = load(); S._useMemory();
  await S.setConsent("t1", { on: true, ttlDays: 2 });
  await S.setConsent("t2", { on: true, ttlDays: 8 });
  for (const t of ["t1", "t2"]) {
    await S.putBuckets(t, "hunt", T - 3 * D, T - 3 * D + H, [{ hour: new Date(T - 3 * D).toISOString(), n: 1 }]);
    await S.putBuckets(t, "hunt", T - H, T, [{ hour: new Date(T - H).toISOString(), n: 2 }]);
    await S.addCoverage(t, "hunt", "ro", [T - 3 * D, T - 3 * D + H]);
    await S.addCoverage(t, "hunt", "ro", [T - H, T]);
  }
  const dropped = await S.purge(T);
  assert.equal(dropped, 1, "only t1's old hour is past its ttl");
  deq((await S.getBuckets("t1", "hunt", T - 4 * D, T)).map((r) => r.n), [2]);
  deq(await S.coverage("t1", "hunt", "ro"), [[T - H, T]], "coverage no longer claims the dropped hour");
  deq((await S.getBuckets("t2", "hunt", T - 4 * D, T)).map((r) => r.n), [1, 2]);
  const sum = await S.summary("t2"); assert.equal(sum.hours, 2); assert.equal(sum.rows, 2); assert.equal(sum.backend, "memory");
  await S.forget("t2");
  assert.equal(await S.consent("t2"), null);
  assert.equal((await S.getBuckets("t2", "hunt", T - 4 * D, T)).length, 0);
  await S.forgetAll();
  assert.equal(await S.consent("t1"), null);
});
