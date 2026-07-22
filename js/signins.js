// ======================================================================
// Sign-in failures — which sign-ins a Conditional Access policy blocked,
// and which policy did it.
//   https://learn.microsoft.com/graph/api/signin-list
//
// Every interactive sign-in leaves a record whose
// appliedConditionalAccessPolicies[] carries the verdict of every policy
// that was evaluated. This module reads the window, keeps the sign-ins a
// policy actually failed, and turns them into a per-policy view: which
// policy is blocking whom, on which app, from where — the log-side
// counterpart of What-If.
//
// Two modes, because Graph can only server-filter one of them:
//   enforced   — conditionalAccessStatus eq 'failure': a policy's grant
//                controls were not satisfied and the sign-in was blocked
//                or interrupted. Filtered server-side, cheap.
//   reportonly — policies in report-only that WOULD have failed. Their
//                sign-ins complete (status success/notApplied), so the
//                only way in is reading the window and filtering here.
//                Bounded by the caller with a record cap.
//
// Read-only. Needs AuditLog.Read.All (delegated) and a reader role such as
// Reports Reader, Security Reader or Security Administrator. Retention is
// what the tenant's licence gives — 30 days on P1/P2, 7 days otherwise.
// ======================================================================
const Signins = (() => {
  // appliedConditionalAccessPolicies[].result values that count as "failed"
  const FAIL = { enforced: new Set(["failure"]), reportonly: new Set(["reportOnlyFailure", "reportOnlyInterrupted"]) };

  // Graph filter for the fetch: date window, server-filtered to CA failures
  // when the mode allows it. signIns caps $top at 999 like directoryAudits.
  function query(days, mode) {
    const since = new Date(Date.now() - (days || 7) * 864e5).toISOString();
    const parts = [`createdDateTime ge ${since}`];
    if (mode !== "reportonly") parts.push(`conditionalAccessStatus eq 'failure'`);
    return `/auditLogs/signIns?$filter=${encodeURIComponent(parts.join(" and "))}&$orderby=createdDateTime desc&$top=999`;
  }

  // The policies that failed this sign-in, per mode.
  function failuresOf(rec, mode) {
    const want = FAIL[mode] || FAIL.enforced;
    return (rec.appliedConditionalAccessPolicies || [])
      .filter((p) => want.has(p.result))
      .map((p) => ({
        id: p.id || "",
        name: p.displayName || p.id || "(unnamed policy)",
        result: p.result,
        controls: [...(p.enforcedGrantControls || []), ...(p.enforcedSessionControls || [])].filter(Boolean),
      }));
  }

  // ---- one sign-in record → a display model ----------------------------
  function parse(rec, mode) {
    const fails = failuresOf(rec, mode);
    if (!fails.length) return null;            // nothing failed in this mode
    const dev = rec.deviceDetail || {};
    const loc = rec.location || {};
    const st = rec.status || {};
    return {
      id: rec.id,
      when: rec.createdDateTime,
      user: rec.userDisplayName || rec.userPrincipalName || "(unknown)",
      upn: rec.userPrincipalName || "",
      userId: rec.userId || "",
      app: rec.appDisplayName || rec.resourceDisplayName || "(app)",
      appId: rec.appId || "",
      resource: rec.resourceDisplayName || "",
      ip: rec.ipAddress || "",
      city: loc.city || "",
      country: loc.countryOrRegion || "",
      client: rec.clientAppUsed || "",
      os: dev.operatingSystem || "",
      browser: dev.browser || "",
      compliant: dev.isCompliant === true,
      managed: dev.isManaged === true,
      trustType: dev.trustType || "",
      errorCode: st.errorCode ?? null,
      failureReason: st.failureReason || "",
      caStatus: rec.conditionalAccessStatus || "",
      signInRisk: rec.riskLevelDuringSignIn || "",
      policies: fails,
    };
  }

  // ---- the whole read → per-policy summary + flat rows -----------------
  function build(records, mode) {
    const rows = (records || []).map((r) => parse(r, mode)).filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const byPolicy = new Map();
    for (const r of rows) {
      for (const p of r.policies) {
        const key = p.id || p.name;
        let e = byPolicy.get(key);
        if (!e) {
          e = { key, id: p.id, name: p.name, count: 0, users: new Map(), apps: new Map(),
            controls: new Set(), first: r.when, last: r.when, rows: [] };
          byPolicy.set(key, e);
        }
        e.count++;
        const uk = r.upn || r.user;
        e.users.set(uk, (e.users.get(uk) || 0) + 1);
        e.apps.set(r.app, (e.apps.get(r.app) || 0) + 1);
        p.controls.forEach((c) => e.controls.add(c));
        if (String(r.when) > String(e.last)) e.last = r.when;
        if (String(r.when) < String(e.first)) e.first = r.when;
        e.rows.push(r);
      }
    }
    const policies = [...byPolicy.values()].map((e) => ({
      ...e,
      userCount: e.users.size,
      appCount: e.apps.size,
      users: [...e.users.entries()].sort((a, b) => b[1] - a[1]),
      apps: [...e.apps.entries()].sort((a, b) => b[1] - a[1]),
      controls: [...e.controls],
    })).sort((a, b) => b.count - a.count || String(b.last).localeCompare(String(a.last)));
    const by = (fn) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
    return {
      mode,
      rows,
      total: rows.length,
      policies,
      users: Object.entries(by((r) => r.upn || r.user)).sort((a, b) => b[1] - a[1]),
      apps: Object.entries(by((r) => r.app)).sort((a, b) => b[1] - a[1]),
      from: rows.length ? rows[rows.length - 1].when : null,
      to: rows.length ? rows[0].when : null,
    };
  }

  // ---- CSV: one line per sign-in × failing policy ----------------------
  // That is the shape a pivot table or a SIEM ingest wants — a sign-in that
  // failed two policies is two lines, each naming its policy.
  const CSV_HEAD = ["when", "userDisplayName", "userPrincipalName", "appDisplayName", "appId",
    "policyName", "policyId", "result", "enforcedControls", "ipAddress", "city", "country",
    "clientAppUsed", "operatingSystem", "browser", "deviceCompliant", "deviceTrustType",
    "signInRisk", "errorCode", "failureReason", "signInId"];
  const csvCell = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function toCsv(rows) {
    const L = [CSV_HEAD.join(",")];
    for (const r of rows || []) {
      for (const p of r.policies) {
        L.push([r.when, r.user, r.upn, r.app, r.appId,
          p.name, p.id, p.result, p.controls.join("|"), r.ip, r.city, r.country,
          r.client, r.os, r.browser, r.compliant ? "yes" : "no", r.trustType,
          r.signInRisk, r.errorCode ?? "", r.failureReason, r.id].map(csvCell).join(","));
      }
    }
    return L.join("\r\n");
  }

  return { FAIL, query, failuresOf, parse, build, toCsv };
})();
