// ======================================================================
// 🌍 Fill deploy groups from regions (beta 32432, generic since 32509) — T12.
//
// Read the member groups of a region list, get their users, and sort them by
// the RULES below into the seven deploy groups (default names CAD-SEC-U-DG-*,
// the ENCA framework names; each can be renamed per tenant in ⚙ Settings).
//
// NOTHING TENANT-SPECIFIC LIVES IN THIS FILE (Mihai, 12 Oct: "this should be
// generic and read from a CSV import — no PVM thing hard-coded"). The region
// list is a CSV the person imports once per tenant; the domains, the external
// marker and the target names are settings. The app keeps both per tenant in
// localStorage `enca-dgfill:<tenantId>` (prefs schema v2) and can export the
// list back to CSV.
//
// The CSV — one row per source group, header required, `,` or `;`:
//   region,group,label,ticked,mode
//   region  the box the group is drawn in (rows grouped in CSV order)
//   group   display name (any case) · object id · or a name ending in * for
//           every group whose name starts with the rest
//   label   what the tick shows (empty = the group's name)
//   ticked  yes/no — ticked when the dialog opens (default yes)
//   mode    empty = the rules · sa-only = its users go to SA only (rule 0c)
//           · ignore = listed, never read
//
//   0a  a SECOND account (UPN in one of the second-account domains) whose
//       part before the @ is also a MAIN account (@main domain) → ADM only
//   0b  a second account without a main account → SA only
//   0c  a user whose only sources are sa-only rows → SA only
//   1   userType Guest → GUESTUSERS                       ┐
//   2   the external marker (an extensionAttribute, any    │ exclusive
//       case) starts with the external prefix → EXT        │
//   3   anybody else → INT                                 ┘
//   4   everybody of 1–3 → GLO
//   5   a MAIN account that has a second account → DevOps (additive)
// No second-account domains → rules 0a, 0b and 5 are off. An empty external
// prefix → rule 2 is off.
//
// Pairing is the part before the @, case-insensitive (employeeId is often
// not set on second accounts).
//
// FIX: a user READ FROM A TICKED SOURCE who sits in a managed group the rules
// do not give her is taken out of it — INT → EXT, GLO/INT → SA and so on.
// Somebody who is in no ticked source is never touched: the tool only knows
// the people it read. DevOps is add-only (it also holds people added by hand).
// Removal is of DIRECT membership only; a nested member is reported, never
// "removed" by a call that cannot do it.
//
// ORDER IS THE SAFETY PROPERTY: every add runs before any removal, so a user
// moving from INT to EXT is never in neither for a moment.
//
// Pure planning, no Graph — the app injects the reads and the writes, and
// tools/dgfill.test.cjs drives the whole thing with fakes.
// ======================================================================
const DgFill = (() => {
  const TARGETS = [
    { key: "GLO",        name: "CAD-SEC-U-DG-GLO",        fix: true,  label: "everybody (rules 1–3)" },
    { key: "INT",        name: "CAD-SEC-U-DG-INT",        fix: true,  label: "internal members" },
    { key: "EXT",        name: "CAD-SEC-U-DG-EXT",        fix: true,  label: "the external marker starts with the external prefix" },
    { key: "GUESTUSERS", name: "CAD-SEC-U-DG-GUESTUSERS", fix: true,  label: "guests" },
    { key: "DevOps",     name: "CAD-SEC-U-DG-DevOps",     fix: false, label: "main account of a user with a second account" },
    { key: "ADM",        name: "CAD-SEC-U-DG-ADM",        fix: true,  label: "second account with a main account" },
    { key: "SA",         name: "CAD-SEC-U-DG-SA",         fix: true,  label: "second account without a main account, and users only in sa-only sources" },
  ];
  const KEYS = TARGETS.map((t) => t.key);

  // Generic: no domains, no prefix. The app fills mainDomain with the
  // tenant's default domain when the person has not set one.
  const DEFAULTS = {
    prefix: "",                 // optional: also list tenant groups starting with this, unticked
    mainDomain: "",
    secondDomains: [],
    extAttr: "extensionAttribute10",
    extPrefix: "External",
    targetNames: {},            // KEY → display name, overrides TARGETS[].name
    skipDisabled: true,
    fix: true,
  };
  const EXT_ATTRS = Array.from({ length: 15 }, (_, i) => `extensionAttribute${i + 1}`);
  const MODES = ["", "sa-only", "ignore"];
  const CSV_HEAD = ["region", "group", "label", "ticked", "mode"];

  const lc = (s) => String(s || "").trim().toLowerCase();
  const domainOf = (upn) => { const s = lc(upn); const i = s.lastIndexOf("@"); return i < 0 ? "" : s.slice(i + 1); };
  const localOf = (upn) => { const s = lc(upn); const i = s.lastIndexOf("@"); return i < 0 ? s : s.slice(0, i); };
  const extVal = (u, attr) => String(((u && u.onPremisesExtensionAttributes) || {})[attr || "extensionAttribute10"] || (u && u.ext10) || "").trim();
  const ext10 = (u) => extVal(u, "extensionAttribute10");
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());
  const isWild = (s) => /\*$/.test(String(s || "").trim());
  const opt = (o) => ({ ...DEFAULTS, ...(o || {}) });

  // The seven targets with this tenant's names.
  function targetsFor(opts) {
    const n = (opts && opts.targetNames) || {};
    return TARGETS.map((t) => ({ ...t, name: String(n[t.key] || "").trim() || t.name }));
  }

  // ---------- the CSV ----------
  function splitLine(line, sep) {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }
  const yes = (s) => { const v = lc(s); return v === "" ? null : ["yes", "y", "true", "1", "x", "ja", "on"].includes(v) ? true : ["no", "n", "false", "0", "nee", "off", "-"].includes(v) ? false : undefined; };
  // → { rows: [{ line, region, group, label, ticked, mode }], errors: [{ line, why }] }
  function parseCsv(text) {
    const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
    const errors = [], rows = [];
    let at = 0;
    while (at < lines.length && !lines[at].trim()) at++;
    if (at >= lines.length) return { rows, errors: [{ line: 0, why: "the file is empty" }] };
    const first = lines[at];
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const head = splitLine(first, sep).map(lc);
    const col = Object.fromEntries(CSV_HEAD.map((h) => [h, head.indexOf(h)]));
    if (col.group < 0) return { rows, errors: [{ line: at + 1, why: `no “group” column in the header (found: ${head.join(", ") || "nothing"}) — the first line must name the columns: ${CSV_HEAD.join(",")}` }] };
    for (let i = at + 1; i < lines.length; i++) {
      if (!lines[i].trim() || /^\s*#/.test(lines[i])) continue;
      const f = splitLine(lines[i], sep);
      const get = (k) => (col[k] >= 0 ? f[col[k]] || "" : "");
      const group = get("group");
      if (!group) { errors.push({ line: i + 1, why: "no group" }); continue; }
      const t = yes(get("ticked"));
      if (t === undefined) { errors.push({ line: i + 1, why: `ticked “${get("ticked")}” — use yes or no` }); continue; }
      const mode = lc(get("mode")).replace(/^sa$|^saonly$|^sa only$/, "sa-only");
      if (!MODES.includes(mode)) { errors.push({ line: i + 1, why: `mode “${get("mode")}” — empty, sa-only or ignore` }); continue; }
      rows.push({ line: i + 1, region: get("region") || "Sources", group, label: get("label"), ticked: t !== false, mode });
    }
    if (!rows.length && !errors.length) errors.push({ line: at + 1, why: "a header but no rows" });
    return { rows, errors };
  }
  function toCsv(list) {
    const q = (s) => { const v = String(s == null ? "" : s); return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    return [CSV_HEAD.join(","), ...(list || []).map((r) => [r.region, r.group, r.label || "", r.ticked === false ? "no" : "yes", r.mode || ""].map(q).join(","))].join("\r\n") + "\r\n";
  }
  const TEMPLATE = toCsv([
    { region: "Europe", group: "SG-Users-NL", label: "Netherlands" },
    { region: "Europe", group: "SG-Users-BE", label: "Belgium" },
    { region: "Americas", group: "SG-Users-US", label: "United States" },
    { region: "Americas", group: "00000000-0000-0000-0000-000000000000", label: "Canada (by object id)", ticked: false },
    { region: "No Intune licence", group: "SG-Users-Unlicensed-*", label: "Unlicensed", mode: "sa-only" },
    { region: "Ignored", group: "SG-Users-Disabled", label: "Disabled accounts", mode: "ignore" },
  ]);

  // ---------- matching the list to the tenant ----------
  // groups: every candidate group the app read ({ id, displayName, ... }).
  // → per row { row, status, groups, why }. status:
  //   ok · missing · ambiguous (a NAME two groups carry) · duplicate (every
  //   group it names is already named by an earlier row) · target (it names
  //   one of the seven deploy groups — reading a target as a source is a loop)
  function check(list, groups, opts) {
    const o = opt(opts);
    const tnames = new Set(targetsFor(o).map((t) => lc(t.name)));
    const seen = new Map();          // group id → first row line
    const all = groups || [];
    return (list || []).map((row) => {
      const g = String(row.group || "").trim();
      let hit;
      if (isGuid(g)) hit = all.filter((x) => lc(x.id) === lc(g));
      else if (isWild(g)) { const base = lc(g.slice(0, -1)); hit = base ? all.filter((x) => lc(x.displayName).startsWith(base)) : []; }
      else hit = all.filter((x) => lc(x.displayName) === lc(g));
      hit = [...new Map(hit.map((x) => [x.id, x])).values()];
      if (!hit.length) return { row, status: "missing", groups: [], why: isWild(g) ? "no group starts with this" : "not in this tenant" };
      if (!isGuid(g) && !isWild(g) && hit.length > 1) return { row, status: "ambiguous", groups: hit, why: `${hit.length} groups carry this name — use the object id` };
      if (hit.some((x) => tnames.has(lc(x.displayName)))) return { row, status: "target", groups: hit, why: "a deploy group — it cannot be its own source" };
      const fresh = hit.filter((x) => !seen.has(x.id));
      if (!fresh.length) return { row, status: "duplicate", groups: hit, why: `already on line ${seen.get(hit[0].id)}` };
      fresh.forEach((x) => seen.set(x.id, row.line));
      return { row, status: "ok", groups: fresh, why: "" };
    });
  }

  // ---------- sources ----------
  // checked: check()'s result. extra: tenant groups under opts.prefix (shown
  // unticked under "Not in your region list" when the list does not name
  // them). → { rows, missing, refused }
  function classifySources(checked, extra, opts) {
    const o = opt(opts);
    const rows = [], missing = [], refused = [];
    const regionOrder = [];
    const listedIds = new Set();
    for (const c of checked || []) {
      const r = c.row;
      if (c.status === "missing") { missing.push({ name: r.group, region: r.region, label: r.label, line: r.line }); continue; }
      if (c.status !== "ok") { refused.push({ name: r.group, line: r.line, status: c.status, why: c.why }); continue; }
      const region = r.mode === "ignore" ? "Ignored" : r.region;
      if (!regionOrder.includes(region)) regionOrder.push(region);
      for (const g of c.groups) {
        listedIds.add(g.id);
        const name = String(g.displayName || g.name || g.id);
        const label = isWild(r.group) ? (r.label ? `${r.label} · ${name.slice(r.group.length - 1) || name}` : name) : (r.label || name);
        rows.push({
          id: g.id, name, suffix: name, label, region, tag: "",
          kind: r.mode === "ignore" ? "ignored" : r.mode === "sa-only" ? "unlicensed" : "source",
          mode: r.mode, rule: String(g.membershipRule || ""),
          dynamic: (g.groupTypes || []).includes("DynamicMembership") || !!g.membershipRule,
          listed: true, line: r.line,
          ticked: r.mode !== "ignore" && r.ticked !== false,
          count: g.count == null ? null : Number(g.count),
        });
      }
    }
    const pre = lc(o.prefix);
    if (pre) {
      const tnames = new Set(targetsFor(o).map((t) => lc(t.name)));
      for (const g of extra || []) {
        const name = String(g.displayName || "");
        if (listedIds.has(g.id) || !lc(name).startsWith(pre) || tnames.has(lc(name))) continue;
        listedIds.add(g.id);
        rows.push({ id: g.id, name, suffix: name.slice(o.prefix.length), label: name.slice(o.prefix.length) || name, region: "Not in your region list", tag: "", kind: "source", mode: "", rule: String(g.membershipRule || ""), dynamic: !!g.membershipRule, listed: false, ticked: false, count: g.count == null ? null : Number(g.count) });
      }
    }
    const order = [...regionOrder.filter((r) => r !== "Ignored"), "Not in your region list", "Ignored"];
    rows.sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region) || (a.listed ? 0 : 1) - (b.listed ? 0 : 1) || (a.line || 0) - (b.line || 0) || a.name.localeCompare(b.name));
    return { rows, missing, refused };
  }

  // ---------- pairing ----------
  // second: users in the second-account domains. mains: Map lower(upn) →
  // user | null for every candidate main account (read by the app).
  function pairs(second, mains, opts) {
    const o = opt(opts);
    const out = [];
    if (!o.mainDomain) return out;
    for (const s of second || []) {
      if (!isSecond(s, o)) continue;
      const want = `${localOf(s.userPrincipalName)}@${lc(o.mainDomain)}`;
      const main = mains && mains.get ? mains.get(want) : null;
      out.push({ second: s, mainUpn: want, main: main || null });
    }
    return out;
  }
  // A guest's UPN ends in the tenant's onmicrosoft.com domain too
  // (j.smith_partner.com#EXT#@contoso.onmicrosoft.com) — it is a guest, not
  // somebody's second account. No second-account domains → nobody is one.
  const isSecond = (u, o) => lc(u.userType) !== "guest" && !/#ext#/i.test(u.userPrincipalName || "")
    && (o.secondDomains || []).map(lc).filter(Boolean).includes(domainOf(u.userPrincipalName));

  // ---------- the plan ----------
  // input:
  //   sources:  [{ id, name, kind }] — only the TICKED ones
  //   members:  Map sourceId → [user]   (transitive users of each source)
  //   guests:   [user] | null           — the "All guests" source when ticked
  //   second:   [user] | null           — every account in the second domains
  //   mains:    Map lower(upn) → user|null — the main account of every
  //             second account in members, guests or second
  //   targets:  { KEY: { id, name, dynamic, roleAssignable, direct: Set(ids), nested: Set(ids) } | null }
  function plan(input, opts) {
    const o = opt(opts);
    const TG = targetsFor(o);
    const inp = input || {};
    const users = new Map();          // id → { u, from: Set(kind), src: [names] }
    const touch = (u, kind, name) => {
      if (!u || !u.id) return;
      const e = users.get(u.id) || { u, from: new Set(), src: [] };
      e.from.add(kind); if (name && !e.src.includes(name)) e.src.push(name);
      users.set(u.id, e);
    };
    for (const s of inp.sources || []) for (const u of (inp.members && inp.members.get(s.id)) || []) touch(u, s.kind, s.label || s.suffix || s.name);
    for (const u of inp.guests || []) touch(u, "guests", "All guests");
    for (const u of inp.second || []) if (isSecond(u, o)) touch(u, "second", "Second accounts");

    // Pair EVERY second account read — from the Second accounts tick or from a
    // ticked source (an admin account is often in an sa-only group). Pairing
    // only the tick's list sent such an account to SA, and Fix took it out of
    // ADM, whenever the tick was off (32513).
    const pr = pairs([...users.values()].map((e) => e.u).filter((u) => isSecond(u, o)), inp.mains, o);
    const pairBySecond = new Map(pr.map((p) => [p.second.id, p]));
    const mainsWithSecond = new Map();   // main id → [second upn]
    for (const p of pr) if (p.main && p.main.id && !(o.skipDisabled && p.main.accountEnabled === false)) {
      const list = mainsWithSecond.get(p.main.id) || []; list.push(p.second.userPrincipalName); mainsWithSecond.set(p.main.id, list);
    }

    const targets = inp.targets || {};
    const refusals = [];
    for (const t of TG) {
      const g = targets[t.key];
      if (!g) refusals.push({ key: t.key, name: t.name, why: "not found in this tenant — create it first (② Create)" });
      else if (g.dynamic) refusals.push({ key: t.key, name: t.name, why: "dynamic membership — its rule decides who is in it; members cannot be added or removed" });
    }
    const usable = (k) => targets[k] && !targets[k].dynamic;
    const fixOn = (k) => o.fix && TG.find((t) => t.key === k).fix && !(o.noFix || []).includes(k);

    const rows = [];
    const adds = Object.fromEntries(KEYS.map((k) => [k, []]));
    const removes = Object.fromEntries(KEYS.map((k) => [k, []]));
    const nestedOnly = [];
    const extValues = new Map();
    const inDirect = (k, id) => !!(targets[k] && targets[k].direct && targets[k].direct.has(id));
    const inNested = (k, id) => !!(targets[k] && targets[k].nested && targets[k].nested.has(id));

    const decide = (e) => {
      const u = e.u;
      if (isSecond(u, o)) {
        const p = pairBySecond.get(u.id) || pairs([u], inp.mains, o)[0];
        return p && p.main ? { want: ["ADM"], rule: "0a", why: `second account of ${p.main.userPrincipalName}` }
          : { want: ["SA"], rule: "0b", why: `no ${p ? p.mainUpn : "main account"}` };
      }
      const licensedSource = [...e.from].some((k) => k !== "unlicensed" && k !== "second");
      if (!licensedSource && e.from.has("unlicensed")) return { want: ["SA"], rule: "0c", why: "only in an sa-only source" };
      if (lc(u.userType) === "guest") return { want: ["GUESTUSERS", "GLO"], rule: "1", why: "guest" };
      const x = extVal(u, o.extAttr);
      if (x) extValues.set(x, (extValues.get(x) || 0) + 1);
      if (lc(o.extPrefix) && lc(x).startsWith(lc(o.extPrefix))) return { want: ["EXT", "GLO"], rule: "2", why: `${o.extAttr} "${x}"` };
      return { want: ["INT", "GLO"], rule: "3", why: "member" };
    };

    for (const e of users.values()) {
      const u = e.u;
      const row = { id: u.id, upn: u.userPrincipalName || u.displayName || u.id, userType: u.userType || "", ext10: extVal(u, o.extAttr), src: e.src, add: [], remove: [], keep: [], rule: "", why: "" };
      if (o.skipDisabled && u.accountEnabled === false) { row.rule = "skip"; row.why = "disabled account — skipped"; rows.push(row); continue; }
      const d = decide(e);
      const want = new Set(d.want);
      if (mainsWithSecond.has(u.id)) { want.add("DevOps"); row.second = mainsWithSecond.get(u.id); }
      row.rule = d.rule + (want.has("DevOps") ? "+5" : ""); row.why = d.why + (want.has("DevOps") ? ` · has ${row.second.join(", ")}` : "");
      for (const k of want) {
        if (inDirect(k, u.id)) row.keep.push(k);
        else if (usable(k)) { row.add.push(k); adds[k].push(u.id); }
      }
      for (const k of KEYS) {
        if (want.has(k) || !fixOn(k) || !usable(k)) continue;
        if (inDirect(k, u.id)) { row.remove.push(k); removes[k].push(u.id); }
        else if (inNested(k, u.id)) { nestedOnly.push({ id: u.id, upn: row.upn, key: k }); row.nested = (row.nested || []).concat(k); }
      }
      rows.push(row);
    }
    // Rule 5 for a main account nobody ticked a source for: DevOps still
    // follows from the second account, and nothing else about her changes.
    for (const [mid] of mainsWithSecond) {
      if (users.has(mid)) continue;
      const p = pr.find((x) => x.main && x.main.id === mid);
      const row = { id: mid, upn: p.main.userPrincipalName, userType: p.main.userType || "", ext10: extVal(p.main, o.extAttr), src: ["(main account of a second account)"], add: [], remove: [], keep: [], rule: "5", why: `has ${mainsWithSecond.get(mid).join(", ")}`, second: mainsWithSecond.get(mid) };
      if (inDirect("DevOps", mid)) row.keep.push("DevOps");
      else if (usable("DevOps")) { row.add.push("DevOps"); adds.DevOps.push(mid); }
      rows.push(row);
    }

    const counts = Object.fromEntries(KEYS.map((k) => [k, {
      add: adds[k].length, remove: removes[k].length,
      now: targets[k] && targets[k].direct ? targets[k].direct.size : null,
    }]));
    const unpaired = pr.filter((p) => !p.main).map((p) => p.second.userPrincipalName);
    return {
      opts: o, rows, adds, removes, counts, refusals, nestedOnly, unpaired,
      extValues: [...extValues.entries()].sort((a, b) => b[1] - a[1]),
      users: rows.length,
      changes: KEYS.reduce((n, k) => n + adds[k].length + removes[k].length, 0),
      addTotal: KEYS.reduce((n, k) => n + adds[k].length, 0),
      removeTotal: KEYS.reduce((n, k) => n + removes[k].length, 0),
      moved: rows.filter((r) => r.add.length && r.remove.length).length,
    };
  }

  // ---------- operations ----------
  // Adds first, every group; removals after. One op per (group, user).
  function ops(p, targets) {
    const out = [];
    for (const k of KEYS) for (const uid of p.adds[k]) out.push({ op: "add", key: k, group: targets[k].id, user: uid });
    for (const k of KEYS) for (const uid of p.removes[k]) out.push({ op: "remove", key: k, group: targets[k].id, user: uid });
    return out;
  }
  // Graph $batch request for one op. "Already a member" / "not a member" are
  // the state we wanted — the caller counts them as done (see settled()).
  function request(op, i) {
    return op.op === "add"
      ? { id: String(i), method: "POST", url: `/groups/${op.group}/members/$ref`, body: { "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${op.user}` } }
      : { id: String(i), method: "DELETE", url: `/groups/${op.group}/members/${op.user}/$ref` };
  }
  function settled(op, res) {
    if (!res) return { ok: false, why: "no answer" };
    if (!res.error) return { ok: true };
    const msg = String(res.error || "");
    if (op.op === "add" && (/already exist/i.test(msg) || res.status === 400 && /added object references/i.test(msg))) return { ok: true, already: true };
    if (op.op === "remove" && (res.status === 404 || /does not exist|not found/i.test(msg))) return { ok: true, already: true };
    return { ok: false, why: msg };
  }
  // The exact reverse of what landed — ↩ Undo this run.
  function undoOps(done) {
    return (done || []).filter((d) => d.ok && !d.already).map((d) => ({ ...d, op: d.op === "add" ? "remove" : "add", ok: undefined, already: undefined })).reverse()
      // re-adds first, then removals, same safety order as a run
      .sort((a, b) => (a.op === "add" ? 0 : 1) - (b.op === "add" ? 0 : 1));
  }

  // ---------- report ----------
  function report(meta, p, targets, done) {
    const m = meta || {};
    const L = [];
    L.push(`# 🌍 Fill deploy groups from regions — ${m.tenant || "tenant"}`, "");
    L.push(`Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · mode ${p.opts.fix ? "add + fix" : "add only"} · ${p.users} users read`, "");
    L.push("| Group | Before | Added | Removed |", "|---|---:|---:|---:|");
    for (const t of targetsFor(p.opts)) {
      const c = p.counts[t.key];
      const g = targets && targets[t.key];
      const d = (done || []).filter((x) => x.key === t.key && x.ok);
      L.push(`| ${t.name}${g ? "" : " (not found)"} | ${c.now == null ? "—" : c.now} | ${done ? d.filter((x) => x.op === "add").length : c.add} | ${done ? d.filter((x) => x.op === "remove").length : c.remove} |`);
    }
    if (done) {
      const fail = done.filter((x) => !x.ok);
      L.push("", `${done.filter((x) => x.ok).length} of ${done.length} changes landed${fail.length ? `, **${fail.length} refused**` : ""}.`);
      if (fail.length) { L.push("", "## Refused", ""); fail.slice(0, 200).forEach((f) => L.push(`- ${f.op} ${f.key} · ${f.upn || f.user} — ${f.why}`)); }
    }
    if (p.refusals.length) { L.push("", "## Groups not written", ""); p.refusals.forEach((r) => L.push(`- ${r.name} — ${r.why}`)); }
    if (p.unpaired.length) { L.push("", "## Second accounts without a main account (→ SA)", ""); p.unpaired.forEach((u) => L.push(`- ${u}`)); }
    if (p.nestedOnly.length) { L.push("", "## Nested members the fix cannot remove", ""); p.nestedOnly.slice(0, 200).forEach((n) => L.push(`- ${n.upn} in ${n.key} through another group`)); }
    if (p.extValues.length) { L.push("", `## ${p.opts.extAttr} values seen`, ""); p.extValues.forEach(([v, n]) => L.push(`- "${v}" — ${n}${lc(p.opts.extPrefix) && lc(v).startsWith(lc(p.opts.extPrefix)) ? " (external)" : ""}`)); }
    const changed = p.rows.filter((r) => r.add.length || r.remove.length);
    L.push("", `## Changes per user (${changed.length})`, "", "| User | Sources | Rule | Adds | Removes | Why |", "|---|---|---|---|---|---|");
    changed.slice(0, 2000).forEach((r) => L.push(`| ${r.upn} | ${r.src.join(", ")} | ${r.rule} | ${r.add.join(" ")} | ${r.remove.join(" ")} | ${r.why.replace(/\|/g, "\\|")} |`));
    if (changed.length > 2000) L.push("", `…and ${changed.length - 2000} more — Export CSV has every row.`);
    return L.join("\n");
  }
  function csv(p) {
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["userPrincipalName", "id", "userType", p.opts.extAttr || "extensionAttribute10", "sources", "rule", "add", "remove", "already", "why"];
    return [head.join(";"), ...p.rows.map((r) => [r.upn, r.id, r.userType, r.ext10, r.src.join(" | "), r.rule, r.add.join(" "), r.remove.join(" "), r.keep.join(" "), r.why].map(q).join(";"))].join("\r\n");
  }

  // ---------- demo ----------
  // A small made-up tenant (contoso): a handful of country groups, a site
  // group, an Unlicensed group, guests, second accounts with and without a
  // main account, somebody in the wrong group — and the region list as a
  // CSV, so the demo opens the way a real tenant does after its import.
  function demo() {
    const P = "DEMO-USERS-";
    const rule = (cc) => `(user.usageLocation -eq "${cc}") and (user.assignedPlans -any (assignedPlan.servicePlanId -eq "c1ec4a95-1f05-45b3-a911-aa3fa01094f5" -and assignedPlan.capabilityStatus -eq "Enabled"))`;
    const groups = [
      ...["NL", "BE", "IT", "US", "IN", "PL", "SK"].map((cc) => ({ id: `src-${cc}`, displayName: P + cc, membershipRule: rule(cc), groupTypes: ["DynamicMembership"] })),
      { id: "src-SITE-NORTH", displayName: P + "SITE-North", membershipRule: '(user.city -eq "Northtown")', groupTypes: ["DynamicMembership"] },
      { id: "src-UNL-Q-T", displayName: P + "Unlicensed-Q-T", membershipRule: '(user.userType -ne "Guest") and (user.accountEnabled -eq true) and (not (user.assignedPlans -any (assignedPlan.servicePlanId -eq "c1ec4a95-1f05-45b3-a911-aa3fa01094f5")) and (user.userPrincipalName -match "^[q-tQ-T].*"))', groupTypes: ["DynamicMembership"] },
      { id: "src-DIS", displayName: P + "DISABLED", membershipRule: "(user.accountEnabled -eq false)", groupTypes: ["DynamicMembership"] },
    ];
    const csv = toCsv([
      { region: "Europe", group: P + "NL", label: "Netherlands" },
      { region: "Europe", group: P + "BE", label: "Belgium" },
      { region: "Europe", group: P + "SITE-North", label: "Plant North (site)" },
      { region: "Europe", group: P + "PL", label: "Poland (rest)" },
      { region: "Italy", group: P + "IT", label: "Italy" },
      { region: "Americas", group: P + "US", label: "United States" },
      { region: "Asia", group: P + "IN", label: "India" },
      { region: "No Intune licence", group: P + "Unlicensed-*", label: "Unlicensed", mode: "sa-only" },
      { region: "Ignored", group: P + "DISABLED", label: "Disabled", mode: "ignore" },
    ]);
    const opts = { prefix: P, mainDomain: "contoso.com", secondDomains: ["contoso-adm.com", "contoso.onmicrosoft.com"] };
    const U = (id, upn, x) => ({ id, userPrincipalName: upn, displayName: upn.split("@")[0], userType: "Member", accountEnabled: true, onPremisesExtensionAttributes: { extensionAttribute10: null }, ...(x || {}) });
    const ext = (v) => ({ onPremisesExtensionAttributes: { extensionAttribute10: v } });
    const users = {
      anna: U("u-anna", "anna.jansen@contoso.com"), lukas: U("u-lukas", "lukas.weber@contoso.com"),
      marco: U("u-marco", "marco.rossi@contoso.com", ext("External - Supplier")), paula: U("u-paula", "paula.souza@contoso.com", ext("EXTERNAL")),
      pieter: U("u-pieter", "pieter.claes@contoso.com"), raj: U("u-raj", "raj.kumar@contoso.com"),
      kasia: U("u-kasia", "k.nowak@contoso.com"), jan: U("u-jan", "jan.kowalski@contoso.com"),
      rtan: U("u-rtan", "r.tan@contoso.com"), sam: U("u-sam", "s.old@contoso.com", { accountEnabled: false }),
      guest: U("u-guest", "j.smith_partner.com#EXT#@contoso.onmicrosoft.com", { userType: "Guest", ...ext("EXTERNAL") }),
      annaAdm: U("u-anna-adm", "anna.jansen@contoso-adm.com"), svc: U("u-svc", "svc-build@contoso-adm.com"),
      rajAdm: U("u-raj-adm", "raj.kumar@contoso.onmicrosoft.com"),
    };
    const members = new Map([
      ["src-NL", [users.anna, users.lukas, users.sam]], ["src-BE", [users.pieter]], ["src-IT", [users.marco]],
      ["src-US", [users.paula]], ["src-IN", [users.raj]], ["src-PL", [users.kasia, users.jan]], ["src-SITE-NORTH", [users.jan]],
      ["src-UNL-Q-T", [users.rtan]], ["src-SK", []],
    ]);
    const tg = {
      GLO: { id: "dg-glo", name: "CAD-SEC-U-DG-GLO", direct: new Set(["u-lukas", "u-paula", "u-rtan"]), nested: new Set() },
      INT: { id: "dg-int", name: "CAD-SEC-U-DG-INT", direct: new Set(["u-lukas", "u-paula", "u-rtan"]), nested: new Set() },
      EXT: { id: "dg-ext", name: "CAD-SEC-U-DG-EXT", direct: new Set(), nested: new Set() },
      GUESTUSERS: { id: "dg-guest", name: "CAD-SEC-U-DG-GUESTUSERS", direct: new Set(), nested: new Set() },
      DevOps: { id: "dg-devops", name: "CAD-SEC-U-DG-DevOps", direct: new Set(["u-lukas"]), nested: new Set() },
      ADM: { id: "dg-adm", name: "CAD-SEC-U-DG-ADM", direct: new Set(["u-anna-adm"]), nested: new Set() },
      SA: { id: "dg-sa", name: "CAD-SEC-U-DG-SA", direct: new Set(), nested: new Set() },
    };
    const second = [users.annaAdm, users.svc, users.rajAdm];
    const mains = new Map([["anna.jansen@contoso.com", users.anna], ["svc-build@contoso.com", null], ["raj.kumar@contoso.com", users.raj]]);
    return { groups, csv, opts, members, guests: [users.guest], second, mains, targets: tg };
  }

  return {
    isSecond: (u, opts) => isSecond(u, opt(opts)), TARGETS, KEYS, DEFAULTS, EXT_ATTRS, CSV_HEAD, TEMPLATE,
    targets: targetsFor, parseCsv, toCsv, check, classifySources, pairs, plan, ops, request, settled, undoOps, report, csv, demo,
    localOf, domainOf, ext10, extVal, isGuid, isWild,
  };
})();
if (typeof module !== "undefined") module.exports = DgFill;
