// ======================================================================
// Change audit — who changed which Conditional Access resource, when, and
// exactly what changed.
//   https://learn.microsoft.com/graph/api/directoryaudit-list
//
// Entra writes a directoryAudit record for every CA policy, named location,
// authentication strength/context and terms-of-use change. The interesting
// part is targetResources[].modifiedProperties[], where oldValue/newValue
// hold the whole resource as a JSON string. This module decodes those and
// turns them into a readable field-level diff instead of a wall of JSON.
//
// Read-only. Needs AuditLog.Read.All (delegated) and a reader role such as
// Reports Reader, Security Reader or Security Administrator. Retention is
// what the tenant's licence gives — 30 days on P1/P2, 7 days otherwise.
// ======================================================================
const Audit = (() => {
  // ---- what kind of CA resource does a record touch? ----
  const KIND = {
    policy: { label: "Conditional Access policy", icon: "🗂" },
    location: { label: "Named location", icon: "🌐" },
    strength: { label: "Authentication strength", icon: "🔑" },
    context: { label: "Authentication context", icon: "🏷" },
    tou: { label: "Terms of use", icon: "📜" },
    membership: { label: "Exclusion group membership", icon: "👥" },
    other: { label: "Other policy change", icon: "•" },
  };
  function kindOf(rec) {
    const t = `${rec.activityDisplayName || ""} ${(rec.targetResources || []).map((r) => r.type || "").join(" ")}`.toLowerCase();
    if (t.includes("conditional access")) return "policy";
    if (t.includes("named location") || t.includes("namedlocation")) return "location";
    if (t.includes("authentication strength") || t.includes("authenticationstrength")) return "strength";
    if (t.includes("authentication context") || t.includes("authenticationcontext")) return "context";
    if (t.includes("terms of use") || t.includes("agreement")) return "tou";
    return "other";
  }
  // add / update / delete, from operationType or the activity wording
  function actionOf(rec) {
    const op = String(rec.operationType || "").toLowerCase();
    if (op === "add" || op === "update" || op === "delete") return op;
    const a = String(rec.activityDisplayName || "").toLowerCase();
    if (a.startsWith("add") || a.includes("create")) return "add";
    if (a.startsWith("delete") || a.includes("remove")) return "delete";
    return "update";
  }
  function actorOf(rec) {
    const b = rec.initiatedBy || {};
    if (b.user && (b.user.userPrincipalName || b.user.displayName || b.user.id)) {
      return { kind: "user", name: b.user.displayName || b.user.userPrincipalName || b.user.id,
        upn: b.user.userPrincipalName || "", ip: b.user.ipAddress || "" };
    }
    if (b.app && (b.app.displayName || b.app.appId)) {
      return { kind: "app", name: b.app.displayName || b.app.appId, upn: "", ip: "" };
    }
    return { kind: "unknown", name: "(unknown)", upn: "", ip: "" };
  }

  // ---- value decoding -------------------------------------------------
  // modifiedProperties values arrive as JSON strings, and are sometimes
  // double-encoded ("\"{...}\""), sometimes wrapped in a one-element array.
  function decode(v) {
    if (v == null || v === "") return null;
    let x = v;
    for (let i = 0; i < 3; i++) {
      if (typeof x !== "string") break;
      const s = x.trim();
      if (!(s.startsWith("{") || s.startsWith("[") || s.startsWith('"'))) break;
      try { x = JSON.parse(s); } catch { break; }
    }
    if (Array.isArray(x) && x.length === 1 && x[0] && typeof x[0] === "object") return x[0];
    return x;
  }

  // ---- field-level diff of two decoded values --------------------------
  // Arrays of scalars are compared as sets (added / removed), which is what
  // an assignment list actually is. Noise keys are dropped.
  const SKIP = new Set(["modifiedDateTime", "createdDateTime", "@odata.context", "@odata.type"]);
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const scalarArray = (a) => Array.isArray(a) && a.every((x) => x == null || typeof x !== "object");

  function diff(oldV, newV, path = "", out = []) {
    if (out.length > 400) return out;                       // runaway guard
    const a = oldV, b = newV;
    if (isObj(a) || isObj(b)) {
      const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => !SKIP.has(k));
      for (const k of keys) diff(a ? a[k] : undefined, b ? b[k] : undefined, path ? `${path}.${k}` : k, out);
      return out;
    }
    if (scalarArray(a) || scalarArray(b)) {
      const A = new Set((a || []).map(String)), B = new Set((b || []).map(String));
      const added = [...B].filter((x) => !A.has(x)), removed = [...A].filter((x) => !B.has(x));
      if (added.length) out.push({ path, op: "add", value: added });
      if (removed.length) out.push({ path, op: "remove", value: removed });
      return out;
    }
    if (Array.isArray(a) || Array.isArray(b)) {   // arrays of objects
      const A = JSON.stringify(a || []), B = JSON.stringify(b || []);
      if (A !== B) out.push({ path, op: "change", from: a, to: b });
      return out;
    }
    const same = a === b || (a == null && b == null) || String(a ?? "") === String(b ?? "");
    if (!same) {
      if (a == null || a === "") out.push({ path, op: "set", to: b });
      else if (b == null || b === "") out.push({ path, op: "clear", from: a });
      else out.push({ path, op: "change", from: a, to: b });
    }
    return out;
  }

  // ---- one audit record → a display model ------------------------------
  function parse(rec) {
    const target = (rec.targetResources || [])[0] || {};
    const props = (target.modifiedProperties || []);
    // the CA payload usually sits in a single property holding the whole object
    let changes = [], rawPairs = [];
    for (const p of props) {
      const name = p.displayName || "";
      if (SKIP.has(name)) continue;
      const o = decode(p.oldValue), n = decode(p.newValue);
      if (isObj(o) || isObj(n)) changes.push(...diff(o, n, ""));
      else {
        const so = o == null ? "" : String(o), sn = n == null ? "" : String(n);
        if (so !== sn) rawPairs.push({ path: name, op: so ? (sn ? "change" : "clear") : "set", from: o, to: n });
      }
    }
    changes = changes.concat(rawPairs);
    // name the thing that changed: prefer the display name, else a name found
    // inside the payload, else the id
    let name = target.displayName || "";
    if (!name) {
      const withName = props.map((p) => decode(p.newValue) || decode(p.oldValue)).find((v) => isObj(v) && v.displayName);
      name = (withName && withName.displayName) || target.id || "(unnamed)";
    }
    return {
      id: rec.id,
      when: rec.activityDateTime,
      activity: rec.activityDisplayName || "(activity)",
      action: actionOf(rec),
      kind: kindOf(rec),
      result: rec.result || "",
      reason: rec.resultReason || "",
      service: rec.loggedByService || "",
      category: rec.category || "",
      correlationId: rec.correlationId || "",
      actor: actorOf(rec),
      targetId: target.id || "",
      target: name,
      changes,
      changeCount: changes.length,
    };
  }

  // ---- group membership changes on the groups CA policies point at --------
  // Adding someone to an exclusion group widens a bypass without any policy
  // being touched, so it never shows up as a policy change. These land under
  // GroupManagement as "Add member to group" / "Remove member from group".
  const isMembershipActivity = (a) => /member (to|from) group/i.test(a || "");

  function parseMembership(rec, watch) {
    const trs = rec.targetResources || [];
    let groupId = "", groupName = "";
    // group identity can be its own targetResource, or carried as Group.* on the user's
    for (const t of trs) {
      if (String(t.type || "").toLowerCase() === "group" && !groupId) { groupId = t.id || ""; groupName = t.displayName || ""; }
      for (const p of (t.modifiedProperties || [])) {
        const dn = String(p.displayName || "");
        if (/group\.objectid/i.test(dn) && !groupId) groupId = String(decode(p.newValue) ?? decode(p.oldValue) ?? "");
        if (/group\.displayname/i.test(dn) && !groupName) groupName = String(decode(p.newValue) ?? decode(p.oldValue) ?? "");
      }
    }
    if (!groupId) return null;
    const w = watch && watch.get(groupId);
    if (watch && !w) return null;              // not a group any policy references
    const mt = trs.find((t) => t.id && t.id !== groupId) || {};
    const member = mt.displayName || mt.userPrincipalName || mt.id || "(unknown)";
    const removed = /remove/i.test(rec.activityDisplayName || "");
    return {
      id: rec.id,
      when: rec.activityDateTime,
      activity: rec.activityDisplayName || "",
      action: removed ? "delete" : "add",
      kind: "membership",
      result: rec.result || "",
      reason: rec.resultReason || "",
      service: rec.loggedByService || "",
      category: rec.category || "",
      correlationId: rec.correlationId || "",
      actor: actorOf(rec),
      targetId: groupId,
      target: groupName || (w && w.name) || groupId,
      usedAs: w ? w.how : "",
      usedBy: w ? w.policies : [],
      changes: [{ path: removed ? "member removed" : "member added", op: removed ? "remove" : "add", value: [member] }],
      changeCount: 1,
      member,
    };
  }

  // The groups worth watching: every group a CA policy includes or excludes.
  // → Map(groupId → { name, how, policies[] })
  function watchedGroups(rawPolicies, names) {
    const m = new Map();
    for (const p of rawPolicies || []) {
      const u = (p.raw || p).conditions?.users || {};
      for (const [ids, how] of [[u.excludeGroups, "exclude"], [u.includeGroups, "include"]]) {
        for (const id of ids || []) {
          let e = m.get(id);
          if (!e) { e = { name: (names && names[id]) || id, how, policies: [] }; m.set(id, e); }
          if (e.how !== how) e.how = "both";
          e.policies.push(p.displayName || p.name || p.id);
        }
      }
    }
    return m;
  }

  // Keep only records that touch a Conditional Access resource. The category
  // filter is done server-side; this drops anything unrelated that slips in.
  const isCaRecord = (r) => r.kind !== "other" || /conditional access|named location|authentication (strength|context)|terms of use/i.test(r.activity);

  function build(records, opts = {}) {
    const watch = opts.watch || null;
    const rows = (records || []).map((rec) => isMembershipActivity(rec.activityDisplayName)
        ? parseMembership(rec, watch)
        : parse(rec))
      .filter(Boolean)
      .filter((r) => r.kind === "membership" || opts.keepAll || isCaRecord(r))
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const by = (fn) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
    const actors = Object.entries(by((r) => r.actor.name)).sort((a, b) => b[1] - a[1]);
    const targets = Object.entries(by((r) => r.target)).sort((a, b) => b[1] - a[1]);
    return {
      rows,
      total: rows.length,
      byKind: by((r) => r.kind),
      byAction: by((r) => r.action),
      actors, targets,
      failures: rows.filter((r) => r.result && r.result.toLowerCase() !== "success").length,
      from: rows.length ? rows[rows.length - 1].when : null,
      to: rows.length ? rows[0].when : null,
    };
  }

  // ---- aggregate ---------------------------------------------------------
  // A busy tenant produces thousands of membership events that are all the same
  // shape (entitlement management adding guests to one group). One card each is
  // unreadable, so roll them up per resource: what was touched, how often, by
  // whom, and how many distinct people moved.
  function summarize(rows) {
    const m = new Map();
    for (const r of rows || []) {
      const key = r.targetId || r.target;
      let e = m.get(key);
      if (!e) {
        e = { key, target: r.target, kind: r.kind, usedAs: r.usedAs || "", usedBy: r.usedBy || [],
          add: 0, remove: 0, update: 0, actors: new Map(), members: new Set(),
          first: r.when, last: r.when, rows: [] };
        m.set(key, e);
      }
      if (r.action === "add") e.add++;
      else if (r.action === "delete") e.remove++;
      else e.update++;
      e.actors.set(r.actor.name, (e.actors.get(r.actor.name) || 0) + 1);
      if (r.member) e.members.add(r.member);
      if (String(r.when) > String(e.last)) e.last = r.when;
      if (String(r.when) < String(e.first)) e.first = r.when;
      e.rows.push(r);
    }
    return [...m.values()].map((e) => ({
      ...e,
      total: e.add + e.remove + e.update,
      actors: [...e.actors.entries()].sort((a, b) => b[1] - a[1]),
      memberCount: e.members.size,
      rows: e.rows.sort((a, b) => String(b.when).localeCompare(String(a.when))),
    })).sort((a, b) => b.total - a.total || String(b.last).localeCompare(String(a.last)));
  }

  // ---- snapshots ---------------------------------------------------------
  // The audit log only keeps ~30 days, and nothing here is stored server-side,
  // so the way to build real history is to export a snapshot now and compare a
  // later run against it. Records carry a stable id, which is what we match on.
  const EXPORT_SCHEMA = "enca-audit/1";
  // Snapshots are the whole point of this tool, so a rename must not orphan the
  // ones already on disk: "cadoc-audit/1" (pre-2026-07 name) is the same format
  // and is still accepted on load. New exports carry the current schema.
  const EXPORT_SCHEMA_LEGACY = ["cadoc-audit/1"];

  function toExport(res, meta = {}) {
    return {
      schema: EXPORT_SCHEMA,
      generated: new Date().toISOString(),
      tenant: meta.tenant || "",
      windowDays: meta.days || null,
      build: meta.build || "",
      from: res.from || null,
      to: res.to || null,
      count: res.rows.length,
      rows: res.rows,
    };
  }
  function fromExport(obj) {
    if (!obj || typeof obj !== "object") throw new Error(`That file isn't a ${BRANDING.name} audit export.`);
    if (obj.schema !== EXPORT_SCHEMA && !EXPORT_SCHEMA_LEGACY.includes(obj.schema)) throw new Error(`Unexpected format "${obj.schema || "unknown"}" — expected ${EXPORT_SCHEMA}.`);
    if (!Array.isArray(obj.rows)) throw new Error("The export has no rows.");
    return obj;
  }
  // What is in the current read that the snapshot didn't have, and what has
  // since aged out of the log (present in the snapshot, gone from Entra).
  function compare(currentRows, snapRows) {
    const cur = new Map((currentRows || []).map((r) => [r.id, r]));
    const snap = new Map((snapRows || []).map((r) => [r.id, r]));
    const newSince = (currentRows || []).filter((r) => !snap.has(r.id));
    const aged = (snapRows || []).filter((r) => !cur.has(r.id))
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    return { newSince, aged, common: (currentRows || []).length - newSince.length,
      newIds: new Set(newSince.map((r) => r.id)) };
  }

  // Graph filter for the fetch: date window, optionally narrowed to policy
  // changes (the category every CA resource change lands in).
  function query(days, category) {
    const since = new Date(Date.now() - (days || 30) * 864e5).toISOString();
    const parts = [`activityDateTime ge ${since}`];
    if (category && category !== "all") parts.push(`category eq '${category}'`);
    return `/auditLogs/directoryAudits?$filter=${encodeURIComponent(parts.join(" and "))}&$orderby=activityDateTime desc&$top=999`;
  }
  // membership changes live in a different category, so they need their own pass
  const queryPolicy = (days) => query(days, "Policy");
  const queryMembership = (days) => query(days, "GroupManagement");

  return { KIND, EXPORT_SCHEMA, build, summarize, toExport, fromExport, compare,
    parse, parseMembership, watchedGroups, isMembershipActivity,
    diff, decode, query, queryPolicy, queryMembership, kindOf, actionOf, actorOf };
})();
