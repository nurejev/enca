// ======================================================================
// SigninStore — the sign-in evidence a browser keeps for its owner (R58,
// beta 25378). OFF BY DEFAULT, per tenant, in words, with a way out.
//
// What it is for. A report-only review is a cadence — an hour after the
// policy was staged, four hours, the next morning, a week — and each look
// used to read the whole window again. This store keeps what an earlier
// read brought back so a later one asks Microsoft only for the hours it
// does not hold yet. The unit is the HOUR, because Report-only impact's
// hunting read (T26 2.0) already comes back per hour and hours are
// additive over disjoint time: coverage is a list of settled [from, to)
// intervals, and "what is missing" is plain interval arithmetic.
//
// What it holds. Report-only verdict BUCKETS (Signins.fromRoBuckets rows:
// policy, verdict, hour, user, app, counts, one sample sign-in), per tenant
// and sign-in source. That is user principal names, IP addresses and
// locations of sign-ins — evidence, not tokens; tokens never come near this
// file. Nothing is kept until the person ticks the box for THIS tenant, the
// box says what is kept, Forget deletes it at once, and everything ages out
// after the days chosen (default 8 — a week plus the unsettled tail).
//
// Where. IndexedDB, in this browser, on this device, for this origin. It
// never leaves the device, the site cannot read it from anywhere else, and
// the same user in the same browser profile can read it — say exactly that,
// no more. A browser without IndexedDB (private mode, a locked-down
// profile, the test runner) gets an in-memory copy that lives as long as
// the tab, so nothing else has to know.
//
// Rows for the other tools (🕵 🌊 🛂 need whole sign-ins, not buckets) are
// NOT here yet — a later build, and a separate, larger consent.
// ======================================================================
const SigninStore = (() => {
  const DB = "enca-signins", VERSION = 1, HOUR = 3600000;
  const DEFAULT_TTL_DAYS = 8, MAX_TTL_DAYS = 30;

  // ---- interval arithmetic (pure; exported for the tests) -----------------
  // intervals are [from, to) in ms, hour-aligned by the caller
  function merge(list) {
    const s = (list || []).filter((x) => x && x[1] > x[0]).map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const x of s) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x); }
    return out;
  }
  function missing(window, coverage) {
    let [from, to] = window; const out = [];
    for (const [a, b] of merge(coverage)) {
      if (b <= from) continue; if (a >= to) break;
      if (a > from) out.push([from, a]);
      from = Math.max(from, b);
      if (from >= to) break;
    }
    if (from < to) out.push([from, to]);
    return out;
  }
  const covered = (window, coverage) => merge(coverage).reduce((n, [a, b]) => n + Math.max(0, Math.min(b, window[1]) - Math.max(a, window[0])), 0);
  const subtract = (coverage, cut) => merge(coverage).flatMap(([a, b]) => missing([a, b], [cut]));   // coverage minus one interval
  const floorHour = (t) => Math.floor(t / HOUR) * HOUR;

  // ---- backends ------------------------------------------------------------
  // Both expose the same five verbs over the three stores; the IndexedDB one
  // is what a real browser uses, the memory one is the fallback and the test
  // double. Records are plain JSON-able objects.
  function memBackend() {
    const t = { tenants: new Map(), coverage: new Map(), buckets: new Map() };
    return {
      kind: "memory",
      async get(store, key) { return t[store].get(String(key)) ?? null; },
      async put(store, key, value) { t[store].set(String(key), value); },
      async del(store, key) { t[store].delete(String(key)); },
      async all(store, pred) { return [...t[store].values()].filter(pred || (() => true)); },
      async delWhere(store, pred) { let n = 0; for (const [k, v] of [...t[store]]) if (pred(v)) { t[store].delete(k); n++; } return n; },
    };
  }
  function idbBackend() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("tenants")) db.createObjectStore("tenants", { keyPath: "k" });
        if (!db.objectStoreNames.contains("coverage")) db.createObjectStore("coverage", { keyPath: "k" });
        if (!db.objectStoreNames.contains("buckets")) db.createObjectStore("buckets", { keyPath: "k" });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error || new Error("IndexedDB refused to open"));
      req.onblocked = () => rej(new Error("IndexedDB is blocked by another tab"));
    }));
    const tx = async (store, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode), os = t.objectStore(store);
        let out; try { out = fn(os); } catch (e) { rej(e); return; }
        t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("transaction aborted"));
      });
    };
    const cursorAll = (os, each) => new Promise((res, rej) => {
      const out = []; const req = os.openCursor();
      req.onsuccess = () => { const c = req.result; if (!c) { res(out); return; } each(c, out); c.continue(); };
      req.onerror = () => rej(req.error);
    });
    return {
      kind: "indexeddb",
      async get(store, key) { const r = await tx(store, "readonly", (os) => os.get(String(key))); return r ? r.v : null; },
      async put(store, key, value) { await tx(store, "readwrite", (os) => os.put({ k: String(key), v: value })); },
      async del(store, key) { await tx(store, "readwrite", (os) => os.delete(String(key))); },
      async all(store, pred) {
        const db = await open();
        return new Promise((res, rej) => {
          const t = db.transaction(store, "readonly");
          cursorAll(t.objectStore(store), (c, out) => { if (!pred || pred(c.value.v)) out.push(c.value.v); }).then(res, rej);
        });
      },
      async delWhere(store, pred) {
        const db = await open();
        return new Promise((res, rej) => {
          const t = db.transaction(store, "readwrite"); let n = 0;
          cursorAll(t.objectStore(store), (c) => { if (pred(c.value.v)) { c.delete(); n++; } }).then(() => { t.oncomplete = () => res(n); }, rej);
        });
      },
    };
  }
  let backend = null, backendKind = "";
  function be() {
    if (backend) return backend;
    try { backend = (typeof indexedDB !== "undefined" && indexedDB) ? idbBackend() : memBackend(); }
    catch { backend = memBackend(); }
    backendKind = backend.kind;
    return backend;
  }
  // a failing IndexedDB (quota, corruption, a policy that blocks it) drops
  // to memory for the session rather than failing the read that asked
  async function safe(fn, fallback) {
    try { return await fn(be()); }
    catch (e) {
      if (backendKind !== "memory") { console.warn("SigninStore: IndexedDB failed, keeping sign-ins in memory for this session", e); backend = memBackend(); backendKind = "memory"; try { return await fn(backend); } catch { /* fall through */ } }
      return fallback;
    }
  }

  // ---- consent -------------------------------------------------------------
  const tKey = (tenantId) => `t:${tenantId}`;
  async function consent(tenantId) { return tenantId ? safe((b) => b.get("tenants", tKey(tenantId)), null) : null; }
  async function enabled(tenantId) { const c = await consent(tenantId); return !!(c && c.on); }
  async function setConsent(tenantId, { on, ttlDays }) {
    if (!tenantId) return null;
    const prev = (await consent(tenantId)) || {};
    const ttl = Math.min(MAX_TTL_DAYS, Math.max(1, Number(ttlDays) || prev.ttlDays || DEFAULT_TTL_DAYS));
    const rec = { tenantId, on: !!on, ttlDays: ttl, at: prev.at && prev.on && on ? prev.at : (on ? Date.now() : prev.at || null) };
    await safe((b) => b.put("tenants", tKey(tenantId), rec));
    if (on && typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch { /* the browser decides */ } }
    if (!on) await forget(tenantId, { keepConsent: true });
    return rec;
  }

  // ---- coverage ------------------------------------------------------------
  const cKey = (tenantId, source, kind) => `c:${tenantId}|${source}|${kind}`;
  async function coverage(tenantId, source, kind) { const c = await safe((b) => b.get("coverage", cKey(tenantId, source, kind)), null); return merge(c && c.intervals); }
  async function addCoverage(tenantId, source, kind, interval) {
    const now = merge([...(await coverage(tenantId, source, kind)), interval]);
    await safe((b) => b.put("coverage", cKey(tenantId, source, kind), { tenantId, source, kind, intervals: now }));
    return now;
  }

  // ---- buckets -------------------------------------------------------------
  // One entry per (tenant, source, hour): the bucket records of that hour.
  // A re-read of an hour replaces the hour whole — the unsettled tail is
  // re-read on purpose, and two copies of an hour would double count.
  const bKey = (tenantId, source, hour) => `b:${tenantId}|${source}|${hour}`;
  const hourOf = (rec) => floorHour(Date.parse(rec.hour || rec.createdDateTime || 0));
  async function putBuckets(tenantId, source, from, to, records) {
    const byHour = new Map();
    for (let h = floorHour(from); h < to; h += HOUR) byHour.set(h, []);
    for (const r of records || []) { const h = hourOf(r); if (!Number.isFinite(h)) continue; if (!byHour.has(h)) byHour.set(h, []); byHour.get(h).push(r); }
    for (const [h, rows] of byHour) {
      if (rows.length) await safe((b) => b.put("buckets", bKey(tenantId, source, h), { tenantId, source, hour: h, rows }));
      else await safe((b) => b.del("buckets", bKey(tenantId, source, h)));
    }
    return byHour.size;
  }
  async function getBuckets(tenantId, source, from, to) {
    const hours = await safe((b) => b.all("buckets", (v) => v.tenantId === tenantId && v.source === source && v.hour >= floorHour(from) && v.hour < to), []);
    return hours.sort((a, b) => a.hour - b.hour).flatMap((h) => h.rows);
  }

  // ---- forgetting ----------------------------------------------------------
  async function forget(tenantId, { keepConsent = false } = {}) {
    if (!tenantId) return;
    await safe((b) => b.delWhere("buckets", (v) => v.tenantId === tenantId));
    await safe((b) => b.delWhere("coverage", (v) => v.tenantId === tenantId));
    if (!keepConsent) await safe((b) => b.del("tenants", tKey(tenantId)));
  }
  async function forgetAll() {
    for (const s of ["buckets", "coverage", "tenants"]) await safe((b) => b.delWhere(s, () => true));
  }
  // Ageing: everything older than the tenant's ttl goes, and the coverage is
  // cut to match so a later read does not believe it holds hours it dropped.
  // A tenant with no consent record (or consent withdrawn) holds nothing.
  async function purge(now = Date.now()) {
    const tenants = await safe((b) => b.all("tenants"), []);
    let dropped = 0;
    for (const t of tenants) {
      if (!t.on) { await forget(t.tenantId, { keepConsent: true }); continue; }
      const cutoff = floorHour(now - (t.ttlDays || DEFAULT_TTL_DAYS) * 86400000);
      dropped += await safe((b) => b.delWhere("buckets", (v) => v.tenantId === t.tenantId && v.hour < cutoff), 0);
      const covs = await safe((b) => b.all("coverage", (v) => v.tenantId === t.tenantId), []);
      for (const c of covs) {
        const cut = subtract(c.intervals, [-Infinity, cutoff]);
        if (cut.length !== (c.intervals || []).length || covered([-Infinity, Infinity], cut) !== covered([-Infinity, Infinity], c.intervals)) await safe((b) => b.put("coverage", cKey(c.tenantId, c.source, c.kind), { ...c, intervals: cut }));
      }
    }
    return dropped;
  }
  async function summary(tenantId) {
    const c = await consent(tenantId); if (!c) return null;
    const hours = await safe((b) => b.all("buckets", (v) => v.tenantId === tenantId), []);
    const rows = hours.reduce((n, h) => n + h.rows.length, 0);
    const bytes = hours.reduce((n, h) => n + JSON.stringify(h.rows).length, 0);
    return { ...c, hours: hours.length, rows, bytes, backend: backendKind || be().kind };
  }

  return { HOUR, DEFAULT_TTL_DAYS, MAX_TTL_DAYS, merge, missing, covered, floorHour, consent, enabled, setConsent, coverage, addCoverage, putBuckets, getBuckets, forget, forgetAll, purge, summary, backend: () => backendKind || be().kind, _useMemory: () => { backend = memBackend(); backendKind = "memory"; } };
})();
