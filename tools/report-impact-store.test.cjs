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
const DAY = 24 * 3600000;
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
      // one "n" row per UTC day touched, carrying the hours it covers, so the store has something to hold
      fromRoBuckets: (rows) => rows },
    huntRun: async (q) => {
      const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to); calls.push([from, to]);
      const out = []; for (let d = Math.floor(from / DAY) * DAY; d < to; d += DAY) out.push({ Kind: "n", signIns: Math.round((Math.min(to, d + DAY) - Math.max(from, d)) / H * 10), bin: new D(d).toISOString(), createdDateTime: new D(Math.max(from, d) + 60000).toISOString() });
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

test("with consent the first read fills the store, the next asks only for the new days and the current day", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true, ttlDays: 8 });
  const notes = [];
  const r1 = await h.read(7, false, (rows, done, total, note) => notes.push([done, total, note, rows.length]));
  // 7 days back from Sep 15 10:30, floored to the UTC day: Sep 8 00:00; settled = floor(10:30 − 2 h) = Sep 15 00:00 → 7 settled days + a 10.5-hour tail
  assert.equal(r1.stored.days, 0); assert.equal(r1.stored.of, 7); assert.equal(r1.stored.read, 7);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 178.5);
  assert.equal(r1.signIns, 178.5 * 10, "every hour of the window counted once");
  assert.ok(!notes.some((n) => n[2] === "held"), "nothing held yet, so no held render");
  const cov = await h.box.SigninStore.coverage("t1", "huntall", "ro");
  assert.equal(cov.length, 1); assert.equal((cov[0][1] - cov[0][0]) / DAY, 7, "the settled days are covered, today is not");
  // an hour later, a new look: only today is read, and what the device holds is rendered first
  h.clock.t = T0 + H; h.box.dropCache(); h.calls.length = 0; notes.length = 0;
  const r2 = await h.read(7, false, (rows, done, total, note) => notes.push([done, total, note, rows.length]));
  assert.equal(r2.stored.days, 7, "all seven settled days from the device");
  assert.equal(r2.stored.read, 0);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 11.5, "today only — not 178");
  assert.equal(notes[0][2], "held", "the held forecast is handed over before any query");
  assert.equal(notes[0][3], 7, "seven day-buckets held");
  assert.equal(r2.signIns, 179.5 * 10, "the forecast covers the whole window");
  assert.equal(r2.records.filter((x) => x.signIns).length, 8, "one bucket per day, no day twice");
  // the next morning: yesterday became a settled day and is read once, then kept
  h.clock.t = T0 + DAY; h.box.dropCache(); h.calls.length = 0;
  const r3 = await h.read(7);
  assert.equal(r3.stored.days, 6, "one day fell off the front, one new settled day is missing");
  assert.equal(r3.stored.read, 1);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 24 + 10.5, "the new settled day and today");
  // a rescan reads everything and rewrites
  h.box.dropCache(); h.calls.length = 0;
  const r4 = await h.read(7, true);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 178.5);
  assert.equal(r4.stored.days, 0);
  // a shorter window on the same store: served from the device, only today is read
  h.box.dropCache(); h.calls.length = 0;
  const r5 = await h.read(1);
  assert.equal(r5.stored.days, 1); assert.equal(r5.stored.read, 0);
  assert.equal(Math.round(h.hours(h.calls) * 2) / 2, 10.5);
});

test("a capped interval is shown but not kept", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true });
  h.box.Signins.HUNT_CAP = 20; h.box.huntRun = async (q) => { const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to); h.calls.push([from, to]); const out = []; for (let i = 0; i < o.cap; i++) out.push({ Kind: "n", signIns: 1, bin: new h.box.Date(Math.floor(from / DAY) * DAY).toISOString(), createdDateTime: new h.box.Date(from).toISOString() }); return out; };
  const r = await h.read(2);   // two days: one settled day, capped, and today
  assert.equal(r.capped, true);
  assert.equal((await h.box.SigninStore.coverage("t1", "huntall", "ro")).length, 0, "nothing claimed as covered");
});

test("a week of a large tenant does not blow the call stack (25378 died on push(...records))", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true });
  const big = (from) => { const out = new Array(150000); for (let i = 0; i < out.length; i++) out[i] = { n: 1, bin: new h.box.Date(Math.floor(from / DAY) * DAY).toISOString(), createdDateTime: new h.box.Date(from).toISOString() }; return out; };
  h.box.Signins.HUNT_CAP = 1e9;
  h.box.huntRun = async (q) => { const o = JSON.parse(q); h.calls.push([Date.parse(o.from), Date.parse(o.to)]); return big(Date.parse(o.from)); };
  const r = await h.read(7);
  assert.ok(r.records.length >= 150000 * 8, `records ${r.records.length}`);
  h.box.dropCache();
  const r2 = await h.read(7);
  assert.ok(r2.records.length >= 150000 * 8);
});
