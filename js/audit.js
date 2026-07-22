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

  // Keep only records that touch a Conditional Access resource. The category
  // filter is done server-side; this drops anything unrelated that slips in.
  const isCaRecord = (r) => r.kind !== "other" || /conditional access|named location|authentication (strength|context)|terms of use/i.test(r.activity);

  function build(records, opts = {}) {
    const rows = (records || []).map(parse).filter((r) => opts.keepAll || isCaRecord(r))
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

  // Graph filter for the fetch: date window, optionally narrowed to policy
  // changes (the category every CA resource change lands in).
  function query(days, category) {
    const since = new Date(Date.now() - (days || 30) * 864e5).toISOString();
    const parts = [`activityDateTime ge ${since}`];
    if (category !== "all") parts.push("category eq 'Policy'");
    return `/auditLogs/directoryAudits?$filter=${encodeURIComponent(parts.join(" and "))}&$orderby=activityDateTime desc&$top=999`;
  }

  return { KIND, build, parse, diff, decode, query, kindOf, actionOf, actorOf };
})();
