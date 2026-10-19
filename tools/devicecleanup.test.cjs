// T59 🧹 Entra device cleanup — js/devicecleanup.js (pure, ported from TUNO T25). node --test tools/devicecleanup.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const D = require("../js/devicecleanup.js");

const NOW = Date.parse("2026-10-18T10:00:00Z");
const ago = (d) => new Date(NOW - d * 86400000 - 3600000).toISOString();
const dev = (id, days, enabled, extra) => Object.assign({ id, displayName: id.toUpperCase(), operatingSystem: "Windows", approximateLastSignInDateTime: days == null ? null : ago(days), accountEnabled: enabled }, extra || {});

test("bucketize: one bucket per device; 90d+ enabled is still only a disable candidate; unknown is not stale", () => {
  const b = D.bucketize([dev("a", 2, true), dev("s1", 45, true), dev("s2", 200, true), dev("p", 40, false), dev("x", 120, false), dev("u", null, true), dev("ad", 5, false)], { now: NOW });
  assert.deepStrictEqual(b.active.map((r) => r.d.id), ["a", "ad"]);
  assert.deepStrictEqual(b.stale.map((r) => r.d.id), ["s2", "s1"], "sorted most silent first; 200d enabled is NOT a delete candidate");
  assert.deepStrictEqual(b.parked.map((r) => r.d.id), ["p"]);
  assert.deepStrictEqual(b.deletable.map((r) => r.d.id), ["x"]);
  assert.deepStrictEqual(b.unknown.map((r) => r.d.id), ["u"]);
  assert.deepStrictEqual(b.disabled.map((r) => r.d.id).sort(), ["ad", "p", "x"], "every disabled device is a re-enable candidate");
  const t = D.bucketize([dev("s1", 45, true)], { now: NOW, disableDays: 60, deleteDays: 120 });
  assert.strictEqual(t.active.length, 1, "thresholds move the line");
});

// a fake directory behind the io seam
function fakeIO(devices, opts) {
  const o = opts || {}, calls = [];
  const find = (url) => devices.find((d) => url.includes(`/devices/${d.id}`));
  return { calls,
    read: async (url) => { calls.push(["read", url]); if (o.wake && url.includes(o.wake) && url.includes("approximateLast")) { const d = find(url); return Object.assign({}, d, { approximateLastSignInDateTime: ago(1) }); } const d = find(url); return d ? Object.assign({}, d) : null; },
    patch: async (url, body) => { calls.push(["patch", url, body]); if (o.forbid) throw new Error("Graph request failed (403): Insufficient privileges"); if (!o.noop) Object.assign(find(url), body); },
    del: async (url) => { calls.push(["del", url]); const i = devices.indexOf(find(url)); if (!o.sticky) devices.splice(i, 1); },
  };
}

test("apply: fresh read, write, read-back; woke up skipped; re-enabled since refused at delete; gone skipped", async () => {
  const devs = [dev("s1", 45, true), dev("s2", 50, true), dev("x1", 120, false), dev("x2", 130, false)];
  const io = fakeIO(devs, { wake: "/devices/s2" });
  devs.find((d) => d.id === "x2").accountEnabled = true;   // somebody re-enabled it after the read
  const ops = [{ kind: "disable", d: { id: "s1" } }, { kind: "disable", d: { id: "s2" } }, { kind: "delete", d: { id: "x1" } }, { kind: "delete", d: { id: "x2" } }, { kind: "disable", d: { id: "gone" } }];
  const ledger = { rows: {}, stopped: false, start() {}, done(i, d, st) { this.rows[i] = st; }, skip(i, d, st) { this.rows[i] = st; }, fail(i) { this.rows[i] = "failed"; } };
  const r = await D.apply(ops, { io, now: NOW, ledger });
  assert.deepStrictEqual(r.map((x) => x.outcome), ["disabled", "skipped", "deleted", "refused", "skipped"]);
  assert.match(r[1].detail, /woke up/);
  assert.match(r[3].detail, /re-enabled since/);
  assert.match(r[4].detail, /gone/);
  assert.deepStrictEqual(ledger.rows, { 0: "disabled", 1: "skipped", 2: "deleted", 3: "refused", 4: "skipped" }, "the ledger says what the results say");
  assert.ok(!io.calls.some((c) => c[0] === "patch" && c[1].includes("s2")), "no write for a device that woke up");
  assert.ok(!io.calls.some((c) => c[0] === "del" && c[1].includes("x2")), "never deletes a device somebody re-enabled");
  // the buckets follow the read-backs
  const after = D.afterResults([dev("s1", 45, true), dev("x1", 120, false)], r);
  assert.deepStrictEqual(after.map((d) => [d.id, d.accountEnabled]), [["s1", false]]);
});

test("apply: re-enable has no wake-up check; a read-back that disagrees fails; a 403 names the role gate; Stop is honoured", async () => {
  const devs = [dev("p", 40, false), dev("s", 45, true)];
  let r = await D.apply([{ kind: "enable", d: { id: "p" } }], { io: fakeIO(devs), now: NOW });
  assert.strictEqual(r[0].outcome, "enabled");
  r = await D.apply([{ kind: "disable", d: { id: "s" } }], { io: fakeIO([dev("s", 45, true)], { noop: true }), now: NOW });
  assert.strictEqual(r[0].outcome, "failed"); assert.match(r[0].detail, /read-back does not say disabled/);
  r = await D.apply([{ kind: "disable", d: { id: "s" } }], { io: fakeIO([dev("s", 45, true)], { forbid: true }), now: NOW });
  assert.match(r[0].detail, /DIRECTORY-ROLE gate/); assert.match(r[0].detail, /Cloud Device Administrator/);
  r = await D.apply([{ kind: "delete", d: { id: "x" } }], { io: fakeIO([dev("x", 120, false)], { sticky: true }), now: NOW });
  assert.strictEqual(r[0].outcome, "failed"); assert.match(r[0].detail, /still reads back/);
  const L = { stopped: true, start() {}, done() {}, skip() {}, fail() {} };
  r = await D.apply([{ kind: "disable", d: { id: "s" } }], { io: fakeIO([dev("s", 45, true)]), now: NOW, ledger: L });
  assert.deepStrictEqual([r[0].outcome, r[0].detail], ["skipped", "stopped"]);
});

test("markdown: summary, actions with outcomes, BitLocker warning, unknowns", () => {
  const b = D.bucketize(D.demo(NOW), { now: NOW });
  const md = D.markdown({ buckets: b, results: [{ op: { d: b.stale[0].d, days: b.stale[0].days }, outcome: "disabled", detail: "verified by read-back" }, { op: { d: b.stale[1].d }, outcome: "skipped", detail: "woke up" }], tenant: "demo", now: NOW });
  assert.match(md, /^# Entra stale-device cleanup/);
  assert.match(md, /11 devices: 4 active · 3 stale and enabled/);
  assert.match(md, /### Disabled \(1\)/); assert.match(md, /### Not done, and why \(1\)/);
  assert.match(md, /BitLocker recovery keys/); assert.match(md, /## Never seen — no action offered \(1\)/);
});

test("demo estate: every bucket present", () => {
  const b = D.bucketize(D.demo(NOW), { now: NOW });
  for (const k of ["active", "stale", "parked", "deletable", "unknown", "disabled"]) assert.ok(b[k].length > 0, k);
  assert.strictEqual(D.WRITE_SCOPE, "Device.ReadWrite.All");
});
