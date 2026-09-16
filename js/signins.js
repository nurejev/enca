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
  // The same codes in words, for a row whose record carries no failureReason
  // (hunting rows never do; Graph rows for interrupts usually say "Strong
  // Authentication is required", which is the code again). What the code
  // MEANS for the person reading it — the prompt that was shown and not
  // completed — not the portal's wording.
  const CODE_TEXT = {
    50074: "MFA was demanded — the prompt was shown and not completed",
    50076: "MFA was demanded by policy, a per-user change or a new location — not completed",
    50072: "MFA enrolment was demanded — the user has no method registered yet",
    50079: "MFA enrolment was demanded — the user has no method registered yet",
    50097: "device authentication was demanded — a compliant or joined device, or sign-in frequency needing the device's session",
    50158: "an external challenge was demanded — terms of use, or a third-party MFA provider",
    500121: "the MFA request failed — wrong code, denied, or timed out",
    53000: "a compliant device was required and this one is not",
    53001: "a domain-joined device was required and this one is not",
    53003: "blocked by Conditional Access",
    530032: "blocked by a security policy on the tenant",
  };
  const codeText = (code) => CODE_TEXT[Number(code)] || "";
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
    return `/v1.0/auditLogs/signIns?$filter=${encodeURIComponent(parts.join(" and "))}&$orderby=createdDateTime desc&$top=999`;
  }

  // Companion fetch for enforced mode: the interrupted sign-ins. Graph can't
  // OR across different properties on signIns, so this is its own query —
  // errorCode supports eq, and same-property or-chains are fine.
  function interruptQuery(days) {
    const since = new Date(Date.now() - (days || 7) * 864e5).toISOString();
    const codes = [...INTERRUPT].map((c) => `status/errorCode eq ${c}`).join(" or ");
    return `/v1.0/auditLogs/signIns?$filter=${encodeURIComponent(`createdDateTime ge ${since} and (${codes})`)}&$orderby=createdDateTime desc&$top=999`;
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
  const HUNT_COLS = "Timestamp, Application, ApplicationId, LogonType, ErrorCode, CorrelationId, SessionId, AccountDisplayName, AccountObjectId, AccountUpn, ResourceDisplayName, ResourceId, OSPlatform, DeviceTrustType, IsManaged, IsCompliant, RiskLevelDuringSignIn, ClientAppUsed, Browser, ConditionalAccessPolicies, ConditionalAccessStatus, IPAddress, Country, City, RequestId, ReportId, DeviceName, EntraIdDeviceId, AuthenticationRequirement, RiskLevelAggregated, RiskState";
  const HUNT_CAP = 20000;
  // from / to: ISO instants for one slice. The caller slices the window —
  // a day at first, halving on "result size exceeded" — so the query only
  // ever names an explicit range.
  // enforcedOnly: the CA failures and interrupts, filtered server-side —
  // KQL can OR across columns where the Graph signIns filter cannot, so
  // enforced mode on a large tenant reads hundreds of rows, not a day's
  // hundreds of thousands. ConditionalAccessStatus is an int in the hunting
  // schema (1 = failure) but a word in the pre-October one, so both are matched.
  // SLIM ROWS (25328). On a 140-policy tenant every sign-in row carries 140
  // policy entries, ~130 of them "notApplied" / "reportOnlyNotApplied" —
  // 30 KB of JSON per row that nothing downstream reads except one count.
  // That is what blew past the hunting result-size cap and drove a 7-day
  // read to 459 queries of 15-minute slices (Perfetti, 2026-09-10: 40
  // minutes for 93,500 rows). The entries are dropped server-side; the
  // report-only-not-applied ones survive as a list of ids (RoNotApplied) so
  // the "out of scope" verdicts keep their counts; success, failure, the
  // three report-only verdicts and everything with a control stay whole.
  // A row with no policies at all is kept (the placeholder keeps mv-apply
  // from swallowing it). Rows shrink 10–20×, a day fits in one or two
  // queries again.
  const SLIM = `| extend _P = todynamic(ConditionalAccessPolicies)
| extend _P = iff(array_length(_P) > 0, _P, dynamic([{}]))
| mv-apply _X = _P to typeof(dynamic) on (
    summarize _Kept = make_list_if(_X, isnotempty(_X.id) and tostring(_X.result) !in~ ("notApplied", "notEnabled", "reportOnlyNotApplied", "2", "3", "8")),
              _RoNA = make_list_if(tostring(_X.id), tostring(_X.result) in~ ("reportOnlyNotApplied", "8"))
  )
| extend ConditionalAccessPolicies = tostring(_Kept), RoNotApplied = tostring(_RoNA)`;
  function huntingQuery({ from, to, table, interactiveOnly, userId, cap, enforcedOnly, slim }) {
    const T = table || "EntraIdSignInEvents";
    return `${T}
| where Timestamp between (datetime(${from}) .. datetime(${to}))
${interactiveOnly ? '| where LogonType !has "non"' : ""}
${userId ? `| where AccountObjectId == "${String(userId).replace(/"/g, "")}"` : ""}
${enforcedOnly ? `| where tostring(ConditionalAccessStatus) in~ ("1", "failure") or toint(ErrorCode) in (${[...INTERRUPT].join(", ")})` : ""}
${slim === false ? "" : SLIM}
| project ${HUNT_COLS}${slim === false ? "" : ", RoNotApplied"}
| order by Timestamp desc
| take ${cap || HUNT_CAP}`;
  }
  const RISK_N = { 0: "none", 1: "none", 10: "low", 50: "medium", 100: "high" };
  const RISK_STATE_N = { 0: "none", 1: "confirmedSafe", 2: "remediated", 3: "dismissed", 4: "atRisk", 5: "confirmedCompromised" };
  const CA_STATUS_N = { 0: "success", 1: "failure", 2: "notApplied" };
  const RESULT_N = { 0: "success", 1: "failure", 2: "notApplied", 3: "notEnabled", 4: "unknown", 5: "unknownFutureValue", 6: "reportOnlySuccess", 7: "reportOnlyFailure", 8: "reportOnlyNotApplied", 9: "reportOnlyInterrupted" };
  const pick = (o, ...ks) => { for (const k of ks) { if (o && o[k] != null) return o[k]; } return undefined; };
  // the ids the slim query set aside (see SLIM) — a string of JSON, or absent
  const roNotApplied = (r) => { try { const v = typeof r.RoNotApplied === "string" ? JSON.parse(r.RoNotApplied || "[]") : (r.RoNotApplied || []); return Array.isArray(v) ? v.map(String).filter(Boolean) : []; } catch { return []; } };
  function fromHunting(rows) {
    return (rows || []).map((r) => {
      let pols = [];
      try { const v = typeof r.ConditionalAccessPolicies === "string" ? JSON.parse(r.ConditionalAccessPolicies || "[]") : (r.ConditionalAccessPolicies || []); pols = Array.isArray(v) ? v : []; } catch { pols = []; }
      const status = r.ConditionalAccessStatus;
      const caStatus = typeof status === "number" || /^\d+$/.test(String(status)) ? (CA_STATUS_N[Number(status)] || "") : String(status || "").replace(/^policies applied$/i, "success").replace(/^policies not applied$/i, "notApplied");
      const interactive = !/non/i.test(String(r.LogonType || ""));
      const trust = { workplace: "Workplace", azuread: "AzureAd", serverad: "ServerAd" }[String(r.DeviceTrustType || "").toLowerCase()] || (r.DeviceTrustType || "");
      const risk = typeof r.RiskLevelDuringSignIn === "number" ? (RISK_N[r.RiskLevelDuringSignIn] || "none") : String(r.RiskLevelDuringSignIn || "none").toLowerCase();
      const riskAgg = typeof r.RiskLevelAggregated === "number" ? (RISK_N[r.RiskLevelAggregated] || "none") : String(r.RiskLevelAggregated || "none").toLowerCase();
      const riskState = typeof r.RiskState === "number" ? (RISK_STATE_N[r.RiskState] || "none") : String(r.RiskState || "none");
      return {
        id: r.RequestId || r.ReportId || r.CorrelationId || "",
        createdDateTime: r.Timestamp, correlationId: r.CorrelationId || "", sessionId: r.SessionId || "",
        userDisplayName: r.AccountDisplayName || "", userPrincipalName: r.AccountUpn || "", userId: r.AccountObjectId || "",
        appDisplayName: r.Application || "", appId: r.ApplicationId || "", resourceDisplayName: r.ResourceDisplayName || "", resourceId: r.ResourceId || "",
        ipAddress: r.IPAddress || "", location: { city: r.City || "", countryOrRegion: r.Country || "" },
        clientAppUsed: r.ClientAppUsed || "",
        deviceDetail: { deviceId: r.EntraIdDeviceId || r.AadDeviceId || "", displayName: r.DeviceName || "", operatingSystem: r.OSPlatform || "", browser: r.Browser || "", isCompliant: Number(r.IsCompliant) === 1 || r.IsCompliant === true, isManaged: Number(r.IsManaged) === 1 || r.IsManaged === true, trustType: trust },
        status: { errorCode: Number(r.ErrorCode) || 0, failureReason: "" },
        conditionalAccessStatus: caStatus, riskLevelDuringSignIn: risk, riskLevelAggregated: riskAgg, riskState,
        // hunting has the requirement but not the per-step detail, so fresh
        // MFA vs an MFA claim reused from the token cannot be told apart here
        authenticationRequirement: /multi/i.test(String(r.AuthenticationRequirement || "")) ? "multiFactorAuthentication" : (r.AuthenticationRequirement ? "singleFactorAuthentication" : ""),
        signInEventTypes: [interactive ? "interactiveUser" : "nonInteractiveUser"], interactive,
        appliedConditionalAccessPolicies: pols.map((p) => ({
          id: pick(p, "id", "Id", "policyId", "PolicyId") || "",
          displayName: pick(p, "displayName", "DisplayName", "name", "Name") || "",
          result: (() => { const v = pick(p, "result", "Result"); return typeof v === "number" ? (RESULT_N[v] || String(v)) : String(v || ""); })(),
          enforcedGrantControls: pick(p, "enforcedGrantControls", "EnforcedGrantControls") || [],
          enforcedSessionControls: pick(p, "enforcedSessionControls", "EnforcedSessionControls") || [],
        })).concat(roNotApplied(r).map((id) => ({ id, displayName: "", result: "reportOnlyNotApplied", enforcedGrantControls: [], enforcedSessionControls: [] }))),
        source: "hunting",
      };
    });
  }
  // ---- Report-only verdicts as BUCKETS (T26 2.0, 25377; reshaped 25380) --
  // Report-only impact never reads a sign-in as a sign-in: it counts, per
  // policy × verdict × user, remembers first and last, collects the controls,
  // lists the apps and keeps a sample of a denial. That is a summarize, so
  // the query asks Microsoft for the answer instead of the rows.
  //
  // WHAT THE ROWS ARE — and why the shape is what it is. 25377 grouped by
  // hour × user × app × client × OS × trust × … with a sample sign-in on
  // every row; on a large tenant that was millions of rows a week and the
  // tab died twice (25378/25379). The dimensions that multiply rows without
  // changing a verdict are gone from the user rows: the day is the only time
  // bin, the app is a SET on the row (make_set) with the per-app counts in
  // their own small rows, and the sample sign-ins are their own rows too —
  // one per user × policy, only for the denials, which are the rare thing.
  // What stays exact per user × policy × verdict × day: the count, first and
  // last, device compliance, management, the MFA requirement and both risk
  // levels — everything the "why it would say no" line is judged on.
  //
  // The query is run PER POLICY (part = one policy id) so that a day of a
  // large tenant stays under the engine's 100,000-row cap without time
  // slicing — slicing a day into hours multiplies the day rows by the number
  // of slices, which is what made 25379 heavy. Five kinds of row, one union:
  //   n   — sign-ins per day (the denominator; part 0 only, withTotals)
  //   na  — reportOnlyNotApplied per day × policy (the "never in scope" count)
  //   a   — sign-ins per day × policy × app for the evaluated verdicts (the
  //         policy's app list with real counts)
  //   ro  — the user rows: count, first, last, controls, app set, by day ×
  //         policy × verdict × user × compliance × management × MFA × risks
  //   s   — one sample sign-in per user × policy that WOULD BE DENIED
  //         (arg_max on Timestamp: the latest denial, a real sign-in)
  // fromRoBuckets shapes them into slim records ReportImpact's accumulator
  // reads; a record's n is how many sign-ins it stands for. Numeric and word
  // forms of result are both matched — the hunting schema has carried either.
  const RO_WORDS = ["reportOnlySuccess", "reportOnlyFailure", "reportOnlyInterrupted", "6", "7", "9"];
  const RO_NA = ["reportOnlyNotApplied", "8"];
  const RO_FAIL = ["reportOnlyFailure", "7"];
  const RO_CAP = 90000;   // rows: the engine stops at 100,000 and 50 MB; slim rows keep 90,000 well under the size
  const kql = (list) => list.map((s) => `"${String(s).replace(/"/g, "")}"`).join(", ");
  function roBucketQuery({ from, to, table, interactiveOnly, cap, policyId, withTotals = true }) {
    const T = table || "EntraIdSignInEvents";
    const D = "bin(Timestamp, 1d)";
    return `let W = ${T}
| where Timestamp between (datetime(${from}) .. datetime(${to}))${interactiveOnly ? '\n| where LogonType !has "non"' : ""};
let P = W
| extend _P = todynamic(ConditionalAccessPolicies)
| mv-expand _X = _P
| extend PolicyId = tostring(_X.id), PolicyName = tostring(_X.displayName), Result = tostring(_X.result)
| where Result in~ (${kql([...RO_WORDS, ...RO_NA])})${policyId ? `\n| where PolicyId =~ ${kql([policyId])}` : ""};
union${withTotals ? `
  (W | summarize N = count() by Bin = ${D} | extend Kind = "n"),` : ""}
  (P | where Result in~ (${kql(RO_NA)}) | summarize N = count(), First = min(Timestamp), Last = max(Timestamp) by Bin = ${D}, PolicyId, PolicyName | extend Kind = "na"),
  (P | where Result !in~ (${kql(RO_NA)}) | summarize N = count() by Bin = ${D}, PolicyId, PolicyName, Application | extend Kind = "a"),
  (P | where Result !in~ (${kql(RO_NA)})
     | summarize N = count(), First = min(Timestamp), Last = max(Timestamp), Apps = make_set(Application, 32),
         Grant = take_any(tostring(_X.enforcedGrantControls)), Session = take_any(tostring(_X.enforcedSessionControls))
       by Bin = ${D}, PolicyId, PolicyName, Result, AccountObjectId, AccountUpn, AccountDisplayName, IsCompliant, IsManaged, AuthenticationRequirement, RiskLevelDuringSignIn, RiskLevelAggregated
     | extend Kind = "ro"),
  (P | where Result in~ (${kql(RO_FAIL)})
     | summarize arg_max(Timestamp, RequestId, Application, ResourceDisplayName, ClientAppUsed, OSPlatform, Browser, IPAddress, City, Country, IsCompliant, IsManaged, DeviceTrustType, ErrorCode)
       by PolicyId, AccountObjectId
     | extend Kind = "s")
| take ${cap || RO_CAP}`;
  }
  const parseList = (s) => { try { const v = typeof s === "string" ? JSON.parse(s || "[]") : (s || []); return Array.isArray(v) ? v.filter(Boolean).map(String) : []; } catch { return []; } };
  const roResult = (v) => /^\d+$/.test(String(v)) ? (RESULT_N[Number(v)] || String(v)) : String(v || "");
  const riskOfN = (v) => typeof v === "number" ? (RISK_N[v] || "none") : String(v || "none").toLowerCase();
  const isOn = (v) => Number(v) === 1 || v === true || String(v).toLowerCase() === "true";
  // Slim records — only the fields ReportImpact reads. Samples and app
  // counts come first in the output so the accumulator holds them before
  // the user rows that refer to them arrive.
  function fromRoBuckets(rows) {
    const first = [], rest = [];
    for (const r of rows || []) {
      const n = Number(r.N) || 0;
      switch (r.Kind) {
        case "n": rest.push({ kind: "n", signIns: n, bin: r.Bin, createdDateTime: r.Bin, bucket: true }); break;
        case "a": first.push({ kind: "a", n, bin: r.Bin, policyId: r.PolicyId || "", policyName: r.PolicyName || "", app: r.Application || "(app)", bucket: true }); break;
        case "s": first.push({ kind: "s", policyId: r.PolicyId || "", userId: r.AccountObjectId || "", bucket: true,
          sample: { id: r.RequestId || "", when: r.Timestamp || "", app: r.Application || r.ResourceDisplayName || "(app)", client: r.ClientAppUsed || "", os: r.OSPlatform || "", browser: r.Browser || "",
            ip: r.IPAddress || "", city: r.City || "", country: r.Country || "", compliant: isOn(r.IsCompliant), managed: isOn(r.IsManaged),
            trustType: { workplace: "Workplace", azuread: "AzureAd", serverad: "ServerAd" }[String(r.DeviceTrustType || "").toLowerCase()] || (r.DeviceTrustType || ""),
            errorCode: Number(r.ErrorCode) || 0, failureReason: "", controls: [] } }); break;
        case "na": rest.push({ kind: "na", n, bin: r.Bin, createdDateTime: r.Last || r.Bin, firstDateTime: r.First || r.Bin, bucket: true,
          appliedConditionalAccessPolicies: [{ id: r.PolicyId || "", displayName: r.PolicyName || "", result: "reportOnlyNotApplied", enforcedGrantControls: [], enforcedSessionControls: [] }] }); break;
        default: rest.push({ kind: "ro", n, bin: r.Bin, createdDateTime: r.Last || r.Bin, firstDateTime: r.First || r.Bin, bucket: true,
          userId: r.AccountObjectId || "", userPrincipalName: r.AccountUpn || "", userDisplayName: r.AccountDisplayName || "",
          apps: parseList(r.Apps),
          deviceDetail: { isCompliant: r.IsCompliant == null || r.IsCompliant === "" ? undefined : isOn(r.IsCompliant), isManaged: r.IsManaged == null || r.IsManaged === "" ? undefined : isOn(r.IsManaged) },
          authenticationRequirement: /multi/i.test(String(r.AuthenticationRequirement || "")) ? "multiFactorAuthentication" : (r.AuthenticationRequirement ? "singleFactorAuthentication" : ""),
          riskLevelDuringSignIn: riskOfN(r.RiskLevelDuringSignIn), riskLevelAggregated: riskOfN(r.RiskLevelAggregated),
          appliedConditionalAccessPolicies: [{ id: r.PolicyId || "", displayName: r.PolicyName || "", result: roResult(r.Result), enforcedGrantControls: parseList(r.Grant), enforcedSessionControls: parseList(r.Session) }] });
      }
    }
    return first.concat(rest);
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

  return { FAIL, INTERRUPT, isInterrupt, query, interruptQuery, huntingQuery, fromHunting, roBucketQuery, fromRoBuckets, RO_CAP, isInteractive, HUNT_CAP, failuresOf, parse, build, toCsv, codeText };
})();
