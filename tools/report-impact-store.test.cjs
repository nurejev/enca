// readRoBuckets (js/app.js) through the on-device store (R58, 25378): the
// second look asks Microsoft only for the hours the store lacks plus the
// unsettled tail. Both functions are lifted out of app.js by their markers
// and run against a simulated hunting engine and the store's memory backend.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const cut = (from, to) => { const a = app.indexOf(from), b = app.indexOf(to, a); assert.ok(a > 0 && b > a, from); return app.slice(a, b + to.length); };
const HUNT = cut("  const HUNT_MIN_SLICE_MS =", "    return { records: out, capped, splits, queries };\n  }\n");
const RO = cut("  let roCache = null;", "    roCache = result; return { ...result, reused: false };\n  }\n");
const STORE = fs.readFileSync(path.join(root, "js/signinstore.js"), "utf8");
const H = 3600000;

function harness(startClock) {
  const clock = { t: startClock };
  class D extends Date { static now() { return clock.t; } }
  const calls = [];
  const box = {
    console: { warn() {}, log() {} }, Math, Array, Promise, Object, Number, String, Error, Map, Set, RegExp, JSON, Infinity, Date: D,
    tenantId: "t1", tenantName: "T", isDemo: false, logSource: "huntall", huntTable: "EntraIdSignInEvents", huntSlim: true, policiesReadAt: 1,
    localStorage: { getItem: () => null, setItem() {} },
    requireProduct: async () => {}, preConsent: async () => true,
    AUTH_CONFIG: { scopes: [] }, HUNT_SCOPES: [],
    Signins: { HUNT_CAP: 20000, huntingQuery: () => "", fromHunting: (r) => r,
      roBucketQuery: ({ from, to, cap }) => JSON.stringify({ from, to, cap }),
      // one "n" row per hour so the store has something to hold; the hour is the query's own hour
      fromRoBuckets: (rows) => rows },
    huntRun: async (q) => {
      const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to); calls.push([from, to]);
      const out = []; for (let h = Math.floor(from / H) * H; h < to; h += H) out.push({ Kind: "n", signIns: 10, hour: new D(h).toISOString(), createdDateTime: new D(h + 60000).toISOString() });
      return out;
    },
  };
  vm.createContext(box);
  vm.runInContext(STORE + "\n" + HUNT + "\n" + RO + "\n;globalThis.read = readRoBuckets; globalThis.dropCache = () => { roCache = null; }; globalThis.SigninStore = SigninStore;", box);
  box.SigninStore._useMemory();
  const prog = { start() {}, tick() {}, detail() {}, check() {}, st: {} };
  const hours = (list) => list.reduce((n, [a, b]) => n + (b - a), 0) / H;
  return { box, calls, clock, prog, hours, read: (days, force, onPartial) => box.read(days, prog, force, onPartial) };
}
const T0 = Date.UTC(2026, 8, 15, 10, 30);   // 10:30 — not on the hour, on purpose

test("without consent every read asks for the whole window", async () => {
  const h = harness(T0);
  const r = await h.read(7);
  assert.equal(r.stored, null);
  assert.equal(Math.round(h.hours(h.calls)), 168);
  h.box.dropCache(); h.calls.length = 0;
  await h.read(7);
  assert.equal(Math.round(h.hours(h.calls)), 168, "the store is not consulted");
});

test("with consent the first read fills the store, the next asks only for the new hours and the unsettled tail", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true, ttlDays: 8 });
  const r1 = await h.read(7);
  // 7 days back from 10:30, floored to the hour: 166 settled hours (10:00 - 2h = 08:00) + the 2.5-hour tail
  assert.equal(r1.stored.hours, 0); assert.equal(r1.stored.of, 166); assert.equal(r1.stored.read, 166);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 168.5);
  assert.equal(r1.signIns, 168 * 10 + 10, "168 whole hours plus the half hour's bucket");
  const cov = await h.box.SigninStore.coverage("t1", "huntall", "ro");
  assert.equal(cov.length, 1); assert.equal((cov[0][1] - cov[0][0]) / H, 166, "the settled part is covered, the tail is not");
  // an hour later, a new look
  h.clock.t = T0 + H; h.box.dropCache(); h.calls.length = 0;
  const r2 = await h.read(7);
  assert.equal(r2.stored.hours, 165, "one hour fell off the front of the window");
  assert.equal(r2.stored.read, 1, "one settled hour is new");
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 3.5, "1 new settled hour + the 2.5-hour tail — not 168");
  assert.equal(r2.signIns, 168 * 10 + 10, "the forecast still covers the whole window");
  assert.equal(r2.records.filter((x) => x.signIns).length, 169, "one bucket per hour, no hour twice");
  // a rescan reads everything and rewrites
  h.box.dropCache(); h.calls.length = 0;
  const r3 = await h.read(7, true);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 168.5);
  assert.equal(r3.stored.hours, 0);
  // a shorter window on the same store: served from the device, only the tail is read
  h.box.dropCache(); h.calls.length = 0;
  const r4 = await h.read(1);
  assert.equal(r4.stored.hours, 22); assert.equal(r4.stored.read, 0);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 2.5);
});

test("a capped interval is shown but not kept", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true });
  h.box.Signins.HUNT_CAP = 20; h.box.huntRun = async (q) => { const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to); h.calls.push([from, to]); const out = []; for (let i = 0; i < o.cap; i++) out.push({ Kind: "n", signIns: 1, hour: new h.box.Date(from).toISOString(), createdDateTime: new h.box.Date(from).toISOString() }); return out; };
  const r = await h.read(1 / 12);   // two hours: everything is tail or capped
  assert.equal(r.capped, true);
  assert.equal((await h.box.SigninStore.coverage("t1", "huntall", "ro")).length, 0, "nothing claimed as covered");
});
