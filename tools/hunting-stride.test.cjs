// The hunting reader's slicing (js/app.js readSignInsHunting) — run with the
// other offline checks: node --test tools/*.test.cjs
//
// The function lives inside app.js's IIFE, so it is lifted out by its
// markers and run against a simulated tenant: a fixed rate of rows a day,
// a row cap, and a result-size limit. What is asserted is the QUERY COUNT —
// the thing the stride (25375) exists to bring down — and that no row is
// ever dropped on the way.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const END = "    return { records: out, count, capped, ceiling, splits, queries };\n  }\n";
const a = app.indexOf("  const HUNT_MIN_SLICE_MS ="), b = app.indexOf(END, a);
assert.ok(a > 0 && b > a, "readSignInsHunting markers");
const src = app.slice(a, b + END.length);
const DAY = 86400000;

function harness({ perDay, cap = 20000, sizeLimitRows = Infinity, saved = null, rateAt = null }) {
  const store = new Map(); if (saved) store.set("enca-huntstride:t1:huntall:rows", String(saved));
  const calls = [];
  const box = {
    console: { warn() {}, log() {} }, Math, Date, Array, Promise, Object, Number, String, Error, Map, Set, RegExp, JSON, Infinity,
    tenantId: "t1", logSource: "huntall", huntTable: "EntraIdSignInEvents", huntSlim: true,
    localStorage: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v) },
    requireProduct: async () => {},
    Signins: { HUNT_CAP: 20000, huntingQuery: (o) => JSON.stringify(o), fromHunting: (rows) => rows },
    huntRun: async (q) => {
      const o = JSON.parse(q); const from = Date.parse(o.from), to = Date.parse(o.to);
      calls.push([from, to, o.cap]);
      const rate = rateAt ? rateAt(from) : perDay;
      const n = Math.round(rate * (to - from) / DAY);
      const got = Math.min(n, o.cap);   // take ${cap} runs before the result-size check
      if (got > sizeLimitRows) throw new Error("Query execution has exceeded the allowed result size");
      return Array.from({ length: got }, (_, i) => ({ i, from }));
    },
  };
  vm.createContext(box);
  vm.runInContext(src + "\n;globalThis.read = readSignInsHunting;", box);
  const prog = { start() {}, tick() {}, detail() {}, check() {}, st: {} };
  return { read: (days, opts) => box.read(days, prog, opts), calls, store };
}

test("a day that needs 6-hour slices is halved once, then every later day starts at 6 hours", async () => {
  // 60,000 rows a day, cap 20,000: 24 h and 12 h come back at the cap, 6 h holds 15,000
  // max: Infinity — these are the SLICING tests; what a tab may keep is the
  // ceiling's own tests at the bottom of this file
  const h = harness({ perDay: 60000 });
  const r = await h.read(7, { source: "huntall", max: Infinity });
  // day one: 1 (24 h) + 2 (12 h) + 4 (6 h) = 7 queries; days two to seven: 4 each
  assert.equal(h.calls.length, 7 + 6 * 4, "queries");
  assert.equal(r.records.length, 7 * 60000, "no row dropped");
  assert.equal(r.capped, false);
  assert.equal(h.store.get("enca-huntstride:t1:huntall:rows"), String(6 * 3600000), "stride kept for the next session");
});

test("without the stride the same week costs a halving descent every day", async () => {
  // the shape 25375 replaces — asserted so the saving is a number, not a claim
  const h = harness({ perDay: 60000 });
  await h.read(7, { source: "huntall", userId: "u1", max: Infinity });   // a user read keeps plain day slices: the old behaviour
  assert.equal(h.calls.length, 7 * 7);
});

test("a saved stride is used from the first slice and grows again on an easy tenant", async () => {
  // last session ended at 15-minute slices; today the tenant does 1,000 rows a day
  const h = harness({ perDay: 1000, saved: 15 * 60000 });
  const r = await h.read(2, { source: "huntall" });
  assert.equal(r.records.length, 2000);
  // 15 min ×3 → 30 min ×3 → 1 h ×3 → 2 h ×3 → 4 h ×3 → 8 h … the walk doubles
  // every three easy slices instead of running 96 quarter-hours a day
  assert.ok(h.calls.length < 60, `queries ${h.calls.length} (a plain 15-minute walk is 192)`);
  assert.ok(+h.store.get("enca-huntstride:t1:huntall:rows") >= 4 * 3600000, "the stride grew");
});

test("a size error halves down to 15 minutes, then lowers the cap and reports capped", async () => {
  // 3,000,000 rows a day: a 15-minute slice is 31,250 rows — the 20,000 the
  // cap lets through still exceed a 15,000-row size limit, so the cap must come down
  const h = harness({ perDay: 3000000, sizeLimitRows: 15000 });
  const r = await h.read(1 / 24, { source: "huntall" });   // one hour
  assert.equal(r.capped, true);
  for (const [from, to] of h.calls) assert.ok(to - from >= 15 * 60000, "never below 15 minutes");
  assert.ok(h.calls.some(([, , cap]) => cap < 20000), "the cap was lowered");
});

test("the window can be given as from/to and a different query and shape", async () => {
  const h = harness({ perDay: 100 });
  const from = Date.UTC(2026, 8, 10), to = from + 2 * DAY;
  const r = await h.read(0, { source: "huntall", from, to, kind: "buckets", query: (f, t, cap) => JSON.stringify({ from: new Date(f).toISOString(), to: new Date(t).toISOString(), cap }), shape: (rows) => rows.map(() => "x") });
  assert.equal(r.records.length, 200);
  assert.equal(r.records.slice(0, 2).join(), "x,x");
  assert.equal(h.calls[0][0], from);
  assert.equal(h.store.get("enca-huntstride:t1:huntall:buckets"), String(DAY));
});

// ---- the ceiling on what the tab keeps (25428) -------------------------
// A read that KEEPS its rows stops at HUNT_ROW_MAX. Nothing bounded this
// before: on Hunting + non-interactive the enforced read is dominated by
// legacy-protocol blocks of service accounts retrying every few seconds, and
// a window of hundreds of thousands of shaped records killed the tab.

test("a read that keeps its rows stops at the ceiling and says so", async () => {
  // 400,000 rows a day over 7 days is 2.8 million — far past what a tab holds
  const h = harness({ perDay: 400000 });
  const r = await h.read(7, { source: "huntall" });
  assert.equal(r.ceiling, true, "the ceiling was reached");
  assert.equal(r.capped, true, "a ceiling is a truncated window");
  assert.equal(r.records.length, 50000, "never more than HUNT_ROW_MAX kept");
  // and it STOPS: the remaining days are not read for rows nobody keeps
  assert.ok(h.calls.length < 7 * 40, `queries ${h.calls.length} — the read stopped rather than walking the whole window`);
});

test("a window that fits is untouched by the ceiling", async () => {
  const h = harness({ perDay: 1000 });
  const r = await h.read(7, { source: "huntall" });
  assert.equal(r.ceiling, false);
  assert.equal(r.capped, false);
  assert.equal(r.records.length, 7000, "no row dropped");
});

test("a streaming read has no ceiling — it keeps nothing", async () => {
  // the shape T26's bucket read uses: every slice goes to onRows and is let go
  const h = harness({ perDay: 400000 });
  let seen = 0;
  const r = await h.read(7, { source: "huntall", onRows: (recs) => { seen += recs.length; } });
  assert.equal(r.ceiling, false, "a stream is bounded already");
  assert.equal(r.records.length, 0, "nothing is kept");
  assert.equal(seen, 7 * 400000, "every row reached the sink");
  assert.equal(r.count, 7 * 400000, "the count says how many went by");
});

test("the ceiling can be raised or lowered by the caller", async () => {
  const h = harness({ perDay: 400000 });
  const r = await h.read(7, { source: "huntall", max: 1000 });
  assert.equal(r.records.length, 1000);
  assert.equal(r.ceiling, true);
});
