// ======================================================================
// Group → persona mapping, per tenant (roadmap R28).
//
// THE PROBLEM THIS SOLVES. Everything that routes a group to a persona vault
// reads the CA NUMBER out of its name — Rmau.codeForGroup(). That works for
// the baseline and for nothing else. A tenant's own exclusion group,
// SEC-VIP-Exceptions or Contractors-NoMFA, carries no CA number, so it matches
// no persona: ⑥ Protect skips it unless a fallback unit is picked by hand,
// ＋ Bulk add never offers it, and break-glass had to be special-cased BY NAME
// to work at all. Most tenants have groups that predate the baseline, and
// telling them their naming convention is wrong is not a feature.
//
// So: say ONCE that Contractors-NoMFA belongs to Externals, and every tool
// routes it there afterwards.
//
// TWO THINGS THIS MUST NOT DO, and both are enforced below rather than
// promised in a comment:
//
//   1. GUESS. A mapping nobody stated is how a group ends up in the wrong
//      vault silently — and a vault is an authorisation boundary, so the cost
//      of a wrong guess is one persona's scoped administrator holding another
//      persona's exclusions. Matching is EXACT: the group's object id, or its
//      display name compared case-insensitively. No prefixes, no fuzzy match,
//      no "looks like an admin group".
//
//   2. HIDE THE UNMAPPED. A group with no persona stays visible AS unmapped
//      rather than dropping quietly out of every list. codeForGroup() always
//      returns a source, and `null` is a source too.
//
// WHERE IT IS KEPT. With the tenant, not in the code: localStorage under the
// tenant id, so it survives a release and never becomes our list of everybody's
// group names — nothing here is sent anywhere, and the hosted site goes on
// storing nothing server-side. Two consequences stated rather than hidden:
// it does not follow the operator to another browser, and a private window
// keeps it in memory for the session only. Both are why export/import exists —
// the mapping is a small JSON file that can live in a repository next to the
// tenant's other configuration.
//
// Pure over its inputs apart from two storage calls (read() / write()), so the
// routing can be tested with node alone: stub those two and everything else
// is a function of its arguments.
// ======================================================================
const CaMap = (() => {
  const SCHEMA = "enca-group-personas/1";
  // R36: the mapping is per tenant AND per baseline, because the persona
  // codes differ between them (Joey Verlinden's has AGENTS and no EXT). The
  // CloudFellows key is the original, unsuffixed one, so every mapping saved
  // before R36 is still exactly where it was.
  const baselineId = () => {
    try { return (typeof Baseline !== "undefined" && Baseline.activeCatalogId) ? Baseline.activeCatalogId() : "limonit"; } catch { return "limonit"; }
  };
  const KEY = (tid, bl) => `enca-camap:${tid || "unknown"}${(bl || baselineId()) === "limonit" ? "" : `:${bl || baselineId()}`}`;

  let tenantId = null;
  let boundTo = null;                     // the baseline id the entries were read for
  let entries = [];                       // [{ id, name, code, note }]
  // A browser that refuses storage (private mode, a locked-down profile) must
  // not break the tool — the mapping simply lives for the session. The tool
  // says so rather than pretending it saved.
  let persisted = true;

  const codeList = () => (typeof Rmau !== "undefined" && Rmau.BASELINE_AUS ? Rmau.BASELINE_AUS : []);
  const isCode = (c) => codeList().some((a) => a.code === c);
  const labelOf = (c) => (codeList().find((a) => a.code === c) || {}).label || c;

  const norm = (s) => String(s || "").trim().toLowerCase();

  function read(tid) {
    try {
      const raw = localStorage.getItem(KEY(tid));
      if (!raw) return [];
      const o = JSON.parse(raw);
      return Array.isArray(o && o.entries) ? o.entries : [];
    } catch { persisted = false; return []; }
  }
  function write() {
    try {
      // written under the baseline the entries were READ for, so a switch
      // that races a save can never file one baseline's codes under the other
      localStorage.setItem(KEY(tenantId, boundTo || undefined), JSON.stringify({ schema: SCHEMA, tenant: tenantId, baseline: boundTo || baselineId(), entries }));
      persisted = true;
    } catch { persisted = false; }
  }

  // Bind to a tenant. Called once when a tenant finishes loading; calling it
  // with the same id again is a no-op so a refresh does not drop unsaved work.
  function use(tid) {
    const id = String(tid || "");
    if (tenantId === id && boundTo === baselineId()) return;
    tenantId = id;
    boundTo = baselineId();
    entries = sanitize(read(id));
  }
  // R36: the active baseline changed — the drawer for the other baseline's
  // codes is a different drawer. Nothing is lost: the previous one was
  // written on every change and is read back when that baseline is active
  // again.
  function rebind() {
    if (tenantId == null) return;
    boundTo = baselineId();
    entries = sanitize(read(tenantId));
  }
  // Demo mode gets its own drawer, so playing with the mapping in the demo
  // cannot land in a real tenant's saved state.
  const forget = () => { tenantId = null; boundTo = null; entries = []; };

  // Drop anything that is not a usable record rather than carrying it forward:
  // a stored code for a persona that no longer exists would route a group into
  // a vault with no name.
  function sanitize(list) {
    const out = [], seen = new Set();
    for (const e of list || []) {
      const name = String((e && e.name) || "").trim();
      const code = String((e && e.code) || "");
      if (!name || !isCode(code)) continue;
      const key = e.id ? `id:${e.id}` : `nm:${norm(name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: e.id ? String(e.id) : null, name, code, note: e.note ? String(e.note) : "" });
    }
    return out;
  }

  const list = () => entries.slice().sort((a, b) => a.name.localeCompare(b.name));
  const count = () => entries.length;
  const isPersisted = () => persisted;
  const tenant = () => tenantId;

  // ---- the lookup ------------------------------------------------------
  // EXACT only. `g` may be a group object ({id, displayName} or {id, name}) or
  // a bare display name — most call sites have only the name, and refusing to
  // answer for those would leave half the tools unmapped for no gain.
  function entryFor(g) {
    if (!g) return null;
    const id = typeof g === "object" ? (g.id || null) : null;
    const name = typeof g === "object" ? (g.displayName || g.name || "") : String(g);
    if (id) { const byId = entries.find((e) => e.id === id); if (byId) return byId; }
    if (name) { const n = norm(name); const byName = entries.find((e) => norm(e.name) === n); if (byName) return byName; }
    return null;
  }

  // The effective routing decision, and WHO made it.
  //   tenant      — this tenant said so, by hand
  //   convention  — the CA number in the name (Rmau.codeForGroup)
  //   null        — nothing places it; the caller must show it as unmapped
  //
  // The stated mapping wins over the convention. That is deliberate and it is
  // not a guess: somebody typed it, against this group, in this tenant. The
  // source travels with the answer so every screen can say which rule decided,
  // rather than leaving a moved baseline group looking like a bug.
  function codeForGroup(g) {
    const e = entryFor(g);
    if (e) return { code: e.code, source: "tenant", entry: e };
    const name = typeof g === "object" ? (g.displayName || g.name || "") : String(g || "");
    let conv = null;
    try { conv = (typeof Rmau !== "undefined" && Rmau.codeForGroup) ? Rmau.codeForGroup(name) : null; } catch { conv = null; }
    return conv ? { code: conv, source: "convention", entry: null } : { code: null, source: null, entry: null };
  }
  // The common case at a call site that only wants the answer.
  const codeOf = (g) => codeForGroup(g).code;

  // ---- editing ---------------------------------------------------------
  // Returns { ok, error }. A refusal always says why: a silent no-op on a
  // mapping screen reads as "it saved" and is discovered in the wrong tenant.
  function set(g, code) {
    const id = typeof g === "object" ? (g.id || null) : null;
    const name = String((typeof g === "object" ? (g.displayName || g.name) : g) || "").trim();
    if (!name) return { ok: false, error: "Pick a group first." };
    if (!isCode(code)) return { ok: false, error: `“${code}” is not one of the persona vaults.` };
    const existing = entryFor(id ? { id, displayName: name } : name);
    if (existing) { existing.code = code; existing.name = name; if (id) existing.id = id; }
    else entries.push({ id, name, code, note: "" });
    write();
    return { ok: true, error: null };
  }
  function remove(key) {
    const before = entries.length;
    entries = entries.filter((e) => e.id !== key && norm(e.name) !== norm(key));
    if (entries.length !== before) write();
    return before - entries.length;
  }
  function clear() { entries = []; write(); }

  // ---- export / import -------------------------------------------------
  // The escape hatch from browser-local storage: a mapping is a handful of
  // lines of JSON, and a tenant that keeps its configuration in a repository
  // should be able to keep this there too.
  function toExport(meta = {}) {
    return {
      schema: SCHEMA,
      generated: new Date().toISOString(),
      tenant: meta.tenantName || "",
      tenantId: tenantId || "",
      build: meta.build || "",
      entries: list(),
    };
  }
  function fromExport(obj) {
    if (!obj || typeof obj !== "object") throw new Error("That file isn't a group-persona mapping.");
    if (obj.schema !== SCHEMA) throw new Error(`Unexpected format "${obj.schema || "unknown"}" — expected ${SCHEMA}.`);
    if (!Array.isArray(obj.entries)) throw new Error("The file carries no entries.");
    return obj;
  }
  // `replace` false merges (the file wins on a collision, because loading a
  // file is a deliberate act); true is the clean-slate option. The caller is
  // told what happened rather than left to diff two counts.
  function importAll(obj, { replace = false } = {}) {
    const incoming = sanitize(obj.entries);
    const skipped = (obj.entries || []).length - incoming.length;
    if (replace) { entries = incoming; write(); return { added: incoming.length, updated: 0, skipped, replaced: true }; }
    let added = 0, updated = 0;
    for (const e of incoming) {
      const hit = entryFor(e.id ? { id: e.id, displayName: e.name } : e.name);
      if (hit) { hit.code = e.code; hit.name = e.name; if (e.id) hit.id = e.id; updated++; }
      else { entries.push(e); added++; }
    }
    write();
    return { added, updated, skipped, replaced: false };
  }

  // ---- reporting -------------------------------------------------------
  // For the Markdown exports: the mapping in use, stated where a reader can
  // see it. A routing decision that appears nowhere in the documentation is a
  // decision the next administrator has to rediscover.
  function toMdSection() {
    if (!entries.length) return [];
    const esc = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const L = [`## Group → persona mapping (this tenant)`, "",
      `${entries.length} group${entries.length === 1 ? " is" : "s are"} routed to a persona vault by a mapping stated in this tenant rather than by the CA number in the name. This mapping is held in the browser, not in your directory — it is not a property of the group, and another administrator on another machine will not have it unless it is exported to them.`, "",
      `| Group | Persona vault |`, `| --- | --- |`];
    for (const e of list()) L.push(`| ${esc(e.name)} | ${esc(labelOf(e.code))} (${esc(e.code)}) |`);
    L.push("");
    return L;
  }

  return { SCHEMA, use, rebind, forget, list, count, isPersisted, tenant, entryFor, codeForGroup, codeOf,
    set, remove, clear, toExport, fromExport, importAll, toMdSection, isCode, labelOf, codeList };
})();
