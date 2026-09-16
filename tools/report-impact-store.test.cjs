// readRoBuckets (js/app.js) through the on-device store (R58): the second look
// asks Microsoft only for the days the store lacks plus today, what the device
// holds is streamed to the sink first, and nothing is held in the tab. Both
// functions are lifted out of app.js by their markers and run against a
// simulated hunting engine and the store's memory backend.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const cut = (from, to) => { const a = app.indexOf(from), b = app.indexOf(to, a); assert.ok(a > 0 && b > a, from); return app.slice(a, b + to.length); };
const HUNT = cut("  const HUNT_MIN_SLICE_MS =", "    return { records: out, count, capped, splits, queries };\n  }\n");
const RO = cut("  let roCache = null;", "    roCache = result; return { ...result, reused: false };\n  }\n");
const STORE = fs.readFileSync(path.join(root, "js/signinstore.js"), "utf8");
const H = 3600000, DAY = 24 * H;

function harness(startClock, { policies = [{ id: "p1", name: "One", state: "enabledForReportingButNotEnforced" }, { id: "p2", name: "Two", state: "enabledForReportingButNotEnforced" }] } = {}) {
  const clock = { t: startClock };
  class D extends Date { static now() { return clock.t; } }
  const calls = [];
  const box = {
    console: { warn() {}, log() {} }, Math, Array, Promise, Object, Number, String, Error, Map, Set, RegExp, JSON, Infinity, Date: D, setTimeout,
    tenantId: "t1", tenantName: "T", isDemo: false, logSource: "huntall", huntTable: "EntraIdSignInEvents", huntSlim: true, policiesReadAt: 1, policies,
    localStorage: { getItem: () => null, setItem() {} },
    requireProduct: async () => {}, preConsent: async () => true,
    AUTH_CONFIG: { scopes: [] }, HUNT_SCOPES: [],
    Signins: { HUNT_CAP: 20000, RO_CAP: 90000, huntingQuery: () => "", fromHunting: (r) => r,
      roBucketQuery: ({ from, to, cap, policyId, withTotals }) => JSON.stringify({ from, to, cap, policyId, withTotals }),
      fromRoBuckets: (rows) => rows },
    // per query: one "n" row per UTC day touched (totals only when asked), carrying the hours it covers, plus one "ro" row per policy
    huntRun: async (q) => {
      const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to); calls.push([from, to, o.policyId]);
      const out = [];
      for (let d = Math.floor(from / DAY) * DAY; d < to; d += DAY) {
        const hours = (Math.min(to, d + DAY) - Math.max(from, d)) / H;
        if (o.withTotals) out.push({ kind: "n", signIns: Math.round(hours * 10), bin: new D(d).toISOString(), createdDateTime: new D(Math.max(from, d) + 60000).toISOString() });
        out.push({ kind: "ro", n: Math.round(hours), bin: new D(d).toISOString(), createdDateTime: new D(Math.max(from, d) + 60000).toISOString(), policy: o.policyId });
      }
      return out;
    },
  };
  vm.createContext(box);
  vm.runInContext(STORE + "\n" + HUNT + "\n" + RO + "\n;globalThis.read = readRoBuckets; globalThis.dropCache = () => { roCache = null; }; globalThis.SigninStore = SigninStore;", box);
  box.SigninStore._useMemory();
  const prog = { start() {}, tick() {}, detail() {}, check() {}, st: {} };
  const hours = (list) => list.reduce((n, [a, b]) => n + (b - a), 0) / H;
  const run = async (days, force) => { const got = []; const r = await box.read(days, prog, force, { onRows: async (recs, note) => { for (const x of recs) got.push({ ...x, note }); } }); return { r, got }; };
  return { box, calls, clock, hours, run };
}
const T0 = Date.UTC(2026, 8, 15, 10, 30);   // 10:30 — not on the hour, on purpose

test("without consent every read asks for the whole window, once per policy, and nothing is kept in the reader", async () => {
  const h = harness(T0);
  const { r, got } = await h.run(7);
  assert.equal(r.stored, null);
  assert.equal(h.calls.length, 14, "7 days × 2 policies");
  assert.equal(h.calls.filter((c) => c[2] === "p1").length, 7);
  assert.equal(Math.round(h.hours(h.calls)), 336, "the window is read once per policy");
  assert.equal(r.records, undefined, "the result carries no records — the sink got them");
  // without the store the day slices start at 10:30 and cross UTC midnight, so a slice yields two day totals; still one policy carries them
  assert.equal(got.filter((x) => x.kind === "n").length, 14, "totals travel with the first policy only (7 slices × 2 UTC days each)");
  assert.equal(r.signIns, 168 * 10);
  h.box.dropCache(); h.calls.length = 0;
  await h.run(7);
  assert.equal(h.calls.length, 14, "the store is not consulted");
});

test("with consent the first read fills the store per slice; the next streams the held days first and asks only for today", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true, ttlDays: 8 });
  const first = await h.run(7);
  // 7 days back from Sep 15 10:30, floored to the UTC day: Sep 8; settled = floor(10:30 − 2 h) = Sep 15 00:00 → 7 settled days + today's 10.5 h
  assert.equal(first.r.stored.days, 0); assert.equal(first.r.stored.of, 7); assert.equal(first.r.stored.read, 7);
  assert.equal(Math.round(h.hours(h.calls) * 2), (168 + 10.5) * 2 * 2, "settled days and today, once per policy");
  assert.ok(!first.got.some((x) => x.note === "held"), "nothing held yet");
  assert.equal(first.r.signIns, 178.5 * 10);
  const cov = await h.box.SigninStore.coverage("t1", "huntall", "ro");
  assert.equal(cov.length, 1); assert.equal((cov[0][1] - cov[0][0]) / DAY, 7, "the settled days are covered, today is not");
  assert.equal((await h.box.SigninStore.summary("t1")).days, 7, "seven days on the device, appended slice by slice");
  // an hour later
  h.clock.t = T0 + H; h.box.dropCache(); h.calls.length = 0;
  const second = await h.run(7);
  assert.equal(second.r.stored.days, 7); assert.equal(second.r.stored.read, 0);
  assert.equal(Math.round(h.hours(h.calls) * 2), 11.5 * 2 * 2, "today only, once per policy — not the week");
  assert.equal(second.got[0].note, "held", "what the device holds is streamed before any query");
  assert.equal(second.got.filter((x) => x.note === "held" && x.kind === "n").length, 7, "seven held days");
  assert.equal(second.r.signIns, 179.5 * 10, "the forecast covers the whole window");
  assert.equal(second.got.filter((x) => x.kind === "n").length, 8, "one total per day, no day twice");
  // the next morning: yesterday became a settled day, is read once, then kept
  h.clock.t = T0 + DAY; h.box.dropCache(); h.calls.length = 0;
  const third = await h.run(7);
  assert.equal(third.r.stored.days, 6); assert.equal(third.r.stored.read, 1);
  assert.equal(Math.round(h.hours(h.calls) * 2), (24 + 10.5) * 2 * 2);
  // a rescan reads everything and rewrites
  h.box.dropCache(); h.calls.length = 0;
  const fourth = await h.run(7, true);
  assert.equal(Math.round(h.hours(h.calls) * 2), (168 + 10.5) * 2 * 2);
  assert.equal(fourth.r.stored.days, 0);
  assert.equal((await h.box.SigninStore.summary("t1")).days, 8, "the seven days rewritten in place, not doubled — plus Sep 8, which fell out of the window and waits for purge()");
  // a shorter window on the same store: served from the device, only today is read
  h.box.dropCache(); h.calls.length = 0;
  const fifth = await h.run(1);
  assert.equal(fifth.r.stored.days, 1); assert.equal(fifth.r.stored.read, 0);
  assert.equal(Math.round(h.hours(h.calls) * 2), 10.5 * 2 * 2);
});

test("a capped slice is shown but its gap is never marked covered", async () => {
  const h = harness(T0);
  await h.box.SigninStore.setConsent("t1", { on: true });
  h.box.Signins.RO_CAP = 20;
  h.box.huntRun = async (q) => { const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to); h.calls.push([from, to, o.policyId]); const out = []; for (let i = 0; i < o.cap; i++) out.push({ kind: "ro", n: 1, bin: new h.box.Date(Math.floor(from / DAY) * DAY).toISOString(), createdDateTime: new h.box.Date(from).toISOString() }); return out; };
  const { r } = await h.run(2);
  assert.equal(r.capped, true);
  assert.equal((await h.box.SigninStore.coverage("t1", "huntall", "ro")).length, 0, "nothing claimed as covered");
});

test("no report-only policy: one part, the read still runs and the totals still come", async () => {
  const h = harness(T0, { policies: [] });
  const { r } = await h.run(1);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][2], undefined);
  assert.equal(r.parts, 1); assert.equal(r.signIns, 240);
});

test("a week of a large tenant never sits in memory: the sink sees every record, the reader keeps none", async () => {
  const h = harness(T0, { policies: [{ id: "p1", name: "One", state: "enabledForReportingButNotEnforced" }] });
  await h.box.SigninStore.setConsent("t1", { on: true });
  let seen = 0, largest = 0;
  h.box.huntRun = async (q) => { const o = JSON.parse(q); h.calls.push([Date.parse(o.from), Date.parse(o.to), o.policyId]); const from = Date.parse(o.from); const out = new Array(60000); for (let i = 0; i < out.length; i++) out[i] = { kind: "ro", n: 1, bin: new h.box.Date(Math.floor(from / DAY) * DAY).toISOString(), createdDateTime: new h.box.Date(from).toISOString() }; return out; };
  const r = await h.box.read(7, { start() {}, tick() {}, detail() {}, check() {}, st: {} }, false, { onRows: async (recs) => { seen += recs.length; largest = Math.max(largest, recs.length); } });
  assert.equal(seen, 60000 * 8); assert.equal(largest, 60000, "one slice at a time");
  assert.equal(r.records, undefined);
  // and the held stream comes back in chunks of at most 4,000
  h.box.dropCache(); let heldChunk = 0;
  await h.box.read(7, { start() {}, tick() {}, detail() {}, check() {}, st: {} }, false, { onRows: async (recs, note) => { if (note === "held") heldChunk = Math.max(heldChunk, recs.length); } });
  assert.ok(heldChunk > 0 && heldChunk <= 4000, `held chunk ${heldChunk}`);
});
