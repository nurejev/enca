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
//                controls were not satisfied and the sign-in was blocked.
//                Filtered server-side, cheap. PLUS the interrupts: a
//                sign-in a policy stopped mid-flow (MFA prompt shown and
//                abandoned, MFA enrolment, device auth, terms of use…)
//                is NOT a CA failure in Graph — conditionalAccessStatus
//                has no 'interrupted' value, those records carry
//                'success' — so they need a second fetch, server-filtered
//                on the interrupt error codes, and are attributed here to
//                the applied policies that imposed the control.
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

  // status.errorCode values the portal shows as "Interrupted" that a CA
  // control can cause. The interrupt is the control being demanded — the
  // record's conditionalAccessStatus is 'success', which is exactly why
  // the failure filter above never sees these.
  //   50074  strong auth required — MFA prompt shown, not passed/abandoned
  //   50076  strong auth required — policy, per-user change or new location
  //   50072  MFA enrolment required (interactive interrupt)
  //   50079  MFA enrolment required
  //   50097  device authentication required
  //   50158  external security challenge — terms of use / third-party MFA
  //   500121 authentication failed during the strong auth request
  const INTERRUPT = new Set([50074, 50076, 50072, 50079, 50097, 50158, 500121]);
  const isInterrupt = (rec) => INTERRUPT.has((rec.status || {}).errorCode);

  // The error code narrows WHICH control stopped the sign-in — a 50097 next
  // to an MFA policy and a sign-in-frequency policy belongs to the latter:
  // enforcing SIF in a browser means authenticating the DEVICE to read the
  // session's auth timestamp, and on a machine without a PRT that round-trip
  // is the interrupt. Matched against the enforced control strings; when no
  // applied policy carries a matching control (terms-of-use agreements can
  // surface under their own display name) attribution falls back to every
  // control-bearing policy rather than dropping the record.
  const MFA_RX = /mfa|auth(entication)?.?strength/i;
  const INT_CONTROLS = {
    50074: MFA_RX, 50076: MFA_RX, 50072: MFA_RX, 50079: MFA_RX, 500121: MFA_RX,
    50097: /compliantdevice|domainjoineddevice|signinfrequency/i,
    50158: /termsofuse|tou/i,
  };

  // Graph filter for the fetch: date window, server-filtered to CA failures
  // when the mode allows it. signIns caps $top at 999 like directoryAudits.
  function query(days, mode) {
    const since = new Date(Date.now() - (days || 7) * 864e5).toISOString();
    const parts = [`createdDateTime ge ${since}`];
    if (mode !== "reportonly") parts.push(`conditionalAccessStatus eq 'failure'`);
    return `/auditLogs/signIns?$filter=${encodeURIComponent(parts.join(" and "))}&$orderby=createdDateTime desc&$top=999`;
  }

  // Companion fetch for enforced mode: the interrupted sign-ins. Graph can't
  // OR across different properties on signIns, so this is its own query —
  // errorCode supports eq, and same-property or-chains are fine.
  function interruptQuery(days) {
    const since = new Date(Date.now() - (days || 7) * 864e5).toISOString();
    const codes = [...INTERRUPT].map((c) => `status/errorCode eq ${c}`).join(" or ");
    return `/auditLogs/signIns?$filter=${encodeURIComponent(`createdDateTime ge ${since} and (${codes})`)}&$orderby=createdDateTime desc&$top=999`;
  }

  // ---- Defender advanced hunting as a second source --------------------
  // EntraIdSignInEvents (AADSignInEventsBeta until 19 October 2026) holds
  // the same sign-ins as the Graph list PLUS the non-interactive ones —
  // token refreshes and background client sign-ins the Graph list ENCA reads
  // never shows — with no 10,000 cap and 30 days of retention. Needs Entra
  // ID P2 for the table to be populated at all, and ThreatHunting.Read.All.
  //
  // The rows are shaped into the SAME record the Graph list returns, so
  // parse / build / ReportImpact never learn which source fed them. One
  // day per query keeps every result under the 50 MB response cap; a day
  // that hits the row cap is reported as capped, never silently trimmed.
  const HUNT_COLS = "Timestamp, Application, ApplicationId, LogonType, ErrorCode, CorrelationId, SessionId, AccountDisplayName, AccountObjectId, AccountUpn, ResourceDisplayName, ResourceId, OSPlatform, DeviceTrustType, IsManaged, IsCompliant, RiskLevelDuringSignIn, ClientAppUsed, Browser, ConditionalAccessPolicies, ConditionalAccessStatus, IPAddress, Country, City, RequestId, ReportId";
  const HUNT_CAP = 20000;
  // from / to: ISO instants for one slice. The caller slices the window —
  // a day at first, halving on "result size exceeded" — so the query only
  // ever names an explicit range.
  function huntingQuery({ from, to, table, interactiveOnly, userId, cap }) {
    const T = table || "EntraIdSignInEvents";
    return `${T}
| where Timestamp between (datetime(${from}) .. datetime(${to}))
${interactiveOnly ? '| where LogonType !has "non"' : ""}
${userId ? `| where AccountObjectId == "${String(userId).replace(/"/g, "")}"` : ""}
| project ${HUNT_COLS}
| order by Timestamp desc
| take ${cap || HUNT_CAP}`;
  }
  const RISK_N = { 0: "none", 1: "none", 10: "low", 50: "medium", 100: "high" };
  const CA_STATUS_N = { 0: "success", 1: "failure", 2: "notApplied" };
  const RESULT_N = { 0: "success", 1: "failure", 2: "notApplied", 3: "notEnabled", 4: "unknown", 5: "unknownFutureValue", 6: "reportOnlySuccess", 7: "reportOnlyFailure", 8: "reportOnlyNotApplied", 9: "reportOnlyInterrupted" };
  const pick = (o, ...ks) => { for (const k of ks) { if (o && o[k] != null) return o[k]; } return undefined; };
  function fromHunting(rows) {
    return (rows || []).map((r) => {
      let pols = [];
      try { const v = typeof r.ConditionalAccessPolicies === "string" ? JSON.parse(r.ConditionalAccessPolicies || "[]") : (r.ConditionalAccessPolicies || []); pols = Array.isArray(v) ? v : []; } catch { pols = []; }
      const status = r.ConditionalAccessStatus;
      const caStatus = typeof status === "number" || /^\d+$/.test(String(status)) ? (CA_STATUS_N[Number(status)] || "") : String(status || "").replace(/^policies applied$/i, "success").replace(/^policies not applied$/i, "notApplied");
      const interactive = !/non/i.test(String(r.LogonType || ""));
      const trust = { workplace: "Workplace", azuread: "AzureAd", serverad: "ServerAd" }[String(r.DeviceTrustType || "").toLowerCase()] || (r.DeviceTrustType || "");
      const risk = typeof r.RiskLevelDuringSignIn === "number" ? (RISK_N[r.RiskLevelDuringSignIn] || "none") : String(r.RiskLevelDuringSignIn || "none").toLowerCase();
      return {
        id: r.RequestId || r.ReportId || r.CorrelationId || "",
        createdDateTime: r.Timestamp, correlationId: r.CorrelationId || "", sessionId: r.SessionId || "",
        userDisplayName: r.AccountDisplayName || "", userPrincipalName: r.AccountUpn || "", userId: r.AccountObjectId || "",
        appDisplayName: r.Application || "", appId: r.ApplicationId || "", resourceDisplayName: r.ResourceDisplayName || "", resourceId: r.ResourceId || "",
        ipAddress: r.IPAddress || "", location: { city: r.City || "", countryOrRegion: r.Country || "" },
        clientAppUsed: r.ClientAppUsed || "",
        deviceDetail: { operatingSystem: r.OSPlatform || "", browser: r.Browser || "", isCompliant: Number(r.IsCompliant) === 1 || r.IsCompliant === true, isManaged: Number(r.IsManaged) === 1 || r.IsManaged === true, trustType: trust },
        status: { errorCode: Number(r.ErrorCode) || 0, failureReason: "" },
        conditionalAccessStatus: caStatus, riskLevelDuringSignIn: risk,
        signInEventTypes: [interactive ? "interactiveUser" : "nonInteractiveUser"], interactive,
        appliedConditionalAccessPolicies: pols.map((p) => ({
          id: pick(p, "id", "Id", "policyId", "PolicyId") || "",
          displayName: pick(p, "displayName", "DisplayName", "name", "Name") || "",
          result: (() => { const v = pick(p, "result", "Result"); return typeof v === "number" ? (RESULT_N[v] || String(v)) : String(v || ""); })(),
          enforcedGrantControls: pick(p, "enforcedGrantControls", "EnforcedGrantControls") || [],
          enforcedSessionControls: pick(p, "enforcedSessionControls", "EnforcedSessionControls") || [],
        })),
        source: "hunting",
      };
    });
  }
  // interactive unless the record says otherwise (the Graph list ENCA reads is interactive-only)
  const isInteractive = (rec) => rec.interactive != null ? !!rec.interactive : !((rec.signInEventTypes || []).some((t) => /noninteractive/i.test(String(t))));

  const shapePol = (p) => ({
    id: p.id || "",
    name: p.displayName || p.id || "(unnamed policy)",
    result: p.result,
    controls: [...(p.enforcedGrantControls || []), ...(p.enforcedSessionControls || [])].filter(Boolean),
  });

  // The policies that failed this sign-in, per mode.
  function failuresOf(rec, mode) {
    const want = FAIL[mode] || FAIL.enforced;
    const out = (rec.appliedConditionalAccessPolicies || [])
      .filter((p) => want.has(p.result))
      .map(shapePol);
    if (out.length || mode === "reportonly" || !isInterrupt(rec)) return out;
    // A CA interrupt: the responsible policies are the applied ones whose
    // result is 'success' AND that imposed a control — that control is what
    // stopped the sign-in. An interrupt with no such policy (per-user MFA,
    // security defaults) is not CA's doing and is dropped by the caller.
    const bearing = (rec.appliedConditionalAccessPolicies || [])
      .filter((p) => p.result === "success"
        && ((p.enforcedGrantControls || []).length || (p.enforcedSessionControls || []).length));
    const rx = INT_CONTROLS[(rec.status || {}).errorCode];
    const matched = rx ? bearing.filter((p) =>
      [...(p.enforcedGrantControls || []), ...(p.enforcedSessionControls || [])].some((c) => rx.test(String(c)))) : [];
    return (matched.length ? matched : bearing)
      .map((p) => ({ ...shapePol(p), result: "interrupted" }));
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
      interrupted: fails.some((p) => p.result === "interrupted"),
      interactive: isInteractive(rec),
      policies: fails,
    };
  }

  // ---- the whole read → per-policy summary + flat rows -----------------
  function build(records, mode) {
    const rows = (records || []).map((r) => parse(r, mode)).filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const nonInteractive = rows.filter((r) => !r.interactive).length;
    const recNonInteractive = (records || []).filter((r) => !isInteractive(r)).length;
    const byPolicy = new Map();
    for (const r of rows) {
      for (const p of r.policies) {
        const key = p.id || p.name;
        let e = byPolicy.get(key);
        if (!e) {
          e = { key, id: p.id, name: p.name, count: 0, ints: 0, users: new Map(), apps: new Map(),
            controls: new Set(), first: r.when, last: r.when, rows: [] };
          byPolicy.set(key, e);
        }
        e.count++;
        if (p.result === "interrupted") e.ints++;
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
      interrupted: rows.filter((r) => r.interrupted).length,
      nonInteractive, recTotal: (records || []).length, recNonInteractive,
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

  return { FAIL, INTERRUPT, isInterrupt, query, interruptQuery, huntingQuery, fromHunting, isInteractive, HUNT_CAP, failuresOf, parse, build, toCsv };
})();
