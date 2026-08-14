// ======================================================================
// Report-only impact — what happens the day a report-only policy goes live.
//   https://learn.microsoft.com/entra/identity/conditional-access/concept-conditional-access-report-only
//
// Every sign-in record carries the verdict of every policy that was
// evaluated, including the ones in report-only. Where the Sign-in failures
// tool keeps only the failures, this module keeps EVERY report-only verdict
// so it can put a denominator under the failures:
//
//   reportOnlySuccess     — the sign-in already satisfies the policy: going
//                           live changes nothing for it.
//   reportOnlyInterrupted — the user would have been stopped for an extra
//                           step (MFA, compliant device, terms of use…):
//                           going live means friction, not lock-out.
//   reportOnlyFailure     — the sign-in would have been DENIED: the user
//                           cannot satisfy the controls (or the policy
//                           blocks). Going live locks this out.
//   reportOnlyNotApplied  — evaluated but out of scope for this sign-in.
//
// The result is per policy (how safe is flipping THIS one on) and per user
// (what happens to THIS person when everything in report-only goes live).
//
// Read-only. Needs AuditLog.Read.All and a reader role (Reports Reader,
// Security Reader, Security Administrator). Graph cannot server-filter on
// appliedConditionalAccessPolicies, so the whole window is read and
// filtered here — the caller caps the record count.
// ======================================================================
const ReportImpact = (() => {
  // Date-window read; report-only verdicts cannot be filtered server-side.
  function query(days) {
    const since = new Date(Date.now() - (days || 7) * 864e5).toISOString();
    return `/auditLogs/signIns?$filter=${encodeURIComponent(`createdDateTime ge ${since}`)}&$orderby=createdDateTime desc&$top=999`;
  }

  const RO = {
    reportOnlySuccess: "success",
    reportOnlyInterrupted: "interrupted",
    reportOnlyFailure: "failure",
    reportOnlyNotApplied: "notApplied",
  };

  // Per-policy verdict for the card and the chips: what going live means.
  //   block — at least one sign-in would have been denied
  //   prompt — nobody denied, but users would be interrupted for a control
  //   clean — traffic seen, every applying sign-in already satisfies it
  //   scoped — evaluated in the window but never in scope for any sign-in
  //   nodata — a report-only policy with no evaluations in the window
  function verdictOf(p) {
    if (p.failure) return "block";
    if (p.interrupted) return "prompt";
    if (p.success) return "clean";
    if (p.notApplied) return "scoped";
    return "nodata";
  }

  // ---- why a sign-in would be DENIED --------------------------------------
  // The scope explanation answers "why did this policy look at you". It does
  // not answer "and why would it have said no", which is the question a
  // go-live turns on. Graph does not hand over a per-control verdict, but the
  // sign-in record carries the facts each control is judged on — so the honest
  // answer is: this is what the policy demands, and this is what the sign-in
  // brought. Stated as evidence, never as a diagnosis we cannot support.
  const CONTROL_LABEL = {
    mfa: "multifactor authentication",
    compliantdevice: "a compliant device",
    domainjoineddevice: "a Microsoft Entra hybrid joined device",
    approvedapplication: "an approved client app",
    compliantapplication: "an app protection policy",
    passwordchange: "a password change",
    block: "__BLOCK__",
  };
  const norm = (c) => String(c || "").toLowerCase().replace(/^require/, "").replace(/[^a-z]/g, "");

  function deviceEvidence(rec) {
    const d = rec.deviceDetail || {};
    const bits = [];
    // isCompliant is a tri-state in practice: true, false, or absent because
    // the device was never registered — and "absent" is not "false".
    if (d.isCompliant === true) bits.push("device reported compliant");
    else if (d.isCompliant === false) bits.push("device NOT compliant");
    else bits.push("no compliance state on the sign-in (unregistered device?)");
    if (d.trustType) bits.push(String(d.trustType));
    else bits.push("not joined");
    if (d.isManaged === false) bits.push("unmanaged");
    if (d.operatingSystem) bits.push(String(d.operatingSystem));
    return bits.join(", ");
  }

  function denyWhy(rec, ap) {
    const controls = (ap.enforcedGrantControls || []).filter(Boolean);
    if (!controls.length) return null;
    const kindsAll = controls.map(norm);
    // A Block policy has no control to satisfy — saying "needs …" of it would
    // be nonsense, and the distinction matters: nothing the user does helps.
    if (kindsAll.includes("block")) return "blocks outright — no control can satisfy it";
    const wants = controls.map((c) => CONTROL_LABEL[norm(c)] || String(c)).join(" or ");
    const ev = [];
    const kinds = new Set(controls.map(norm));
    if (kinds.has("compliantdevice") || kinds.has("domainjoineddevice")) ev.push(deviceEvidence(rec));
    if (kinds.has("mfa")) {
      ev.push(rec.authenticationRequirement === "multiFactorAuthentication"
        ? "the sign-in did satisfy MFA — another control in the same policy is the one that failed"
        : "single-factor sign-in");
    }
    if (kinds.has("approvedapplication") || kinds.has("compliantapplication")) {
      ev.push(`client app: ${rec.clientAppUsed || rec.appDisplayName || "unknown"}`);
    }
    return `needs ${wants}${ev.length ? ` — ${ev.join("; ")}` : ""}`;
  }

  // Graph reports two different risks and a policy can key off either, so both
  // are kept and labelled rather than merged into one number that would be
  // right half the time. "hidden" is what a tenant without Entra ID P2 gets —
  // it is not the same as "none", and saying so is the difference between
  // "no risk was involved" and "you cannot see whether it was".
  const RISK_LABEL = { none: "no risk", low: "low", medium: "medium", high: "high",
    hidden: "hidden (needs Entra ID P2)", unknownFutureValue: "unknown" };
  const riskWord = (v) => RISK_LABEL[v] || (v ? String(v) : null);
  function riskOf(rec) {
    const out = [];
    const u = riskWord(rec.riskLevelAggregated);
    const s = riskWord(rec.riskLevelDuringSignIn);
    if (u && u !== "no risk") out.push(`user risk ${u}`);
    if (s && s !== "no risk") out.push(`sign-in risk ${s}`);
    return out.length ? out.join(" · ") : null;
  }
  const bump = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };

  // roPolicies: [{id, name}] — the tenant's report-only policies from the
  // already-loaded policy list, so a policy with zero log traffic still
  // shows up (as "no data" — the one answer that should stop a go-live).
  function build(records, roPolicies) {
    const pol = new Map();      // policy id/name → aggregate
    const usr = new Map();      // upn → cross-policy aggregate
    const ensureP = (id, name) => {
      const key = id || name;
      let e = pol.get(key);
      if (!e) {
        e = { key, id: id || "", name: name || "(unnamed policy)", inTenant: false,
          success: 0, interrupted: 0, failure: 0, notApplied: 0,
          users: new Map(), apps: new Map(), controls: new Set(), first: null, last: null };
        pol.set(key, e);
      }
      return e;
    };
    for (const rp of roPolicies || []) { ensureP(rp.id, rp.name).inTenant = true; }

    for (const rec of records || []) {
      for (const ap of rec.appliedConditionalAccessPolicies || []) {
        const kind = RO[ap.result];
        if (!kind) continue;                       // enforced / notEnabled / unknown
        const e = ensureP(ap.id, ap.displayName);
        e[kind]++;
        const when = rec.createdDateTime || "";
        if (!e.last || when > e.last) e.last = when;
        if (!e.first || when < e.first) e.first = when;
        [...(ap.enforcedGrantControls || []), ...(ap.enforcedSessionControls || [])]
          .filter(Boolean).forEach((c) => e.controls.add(c));
        if (kind === "notApplied") continue;       // out of scope: no user/app impact
        const upn = rec.userPrincipalName || rec.userDisplayName || "(unknown)";
        let u = e.users.get(upn);
        if (!u) { u = { upn, name: rec.userDisplayName || upn, success: 0, interrupted: 0, failure: 0, apps: new Set(), last: "", risk: new Map(), deny: new Map() }; e.users.set(upn, u); }
        u[kind]++;
        // WHY the policy bit. A verdict of "3 interrupted" on a policy called
        // LowMediumUserRisk raises the obvious question — low, or medium? —
        // and the answer was in the record all along and being discarded.
        // Counted per level so a mixture reads as a mixture.
        if (kind !== "success") bump(u.risk, riskOf(rec));
        // Only a FAILURE is a denial. An interruption was satisfied by doing
        // the extra step, so explaining it as a refusal would be wrong.
        if (kind === "failure") bump(u.deny, denyWhy(rec, ap));
        if (when > u.last) u.last = when;
        const app = rec.appDisplayName || rec.resourceDisplayName || "(app)";
        u.apps.add(app);
        e.apps.set(app, (e.apps.get(app) || 0) + 1);

        // cross-policy view: one row per user over everything in report-only
        let g = usr.get(upn);
        if (!g) { g = { upn, name: rec.userDisplayName || upn, success: 0, interrupted: 0, failure: 0, apps: new Set(), last: "", policies: new Map() }; usr.set(upn, g); }
        g[kind]++;
        if (when > g.last) g.last = when;
        g.apps.add(app);
        let gp = g.policies.get(e.key);
        if (!gp) { gp = { key: e.key, id: e.id, name: e.name, success: 0, interrupted: 0, failure: 0, risk: new Map(), deny: new Map() }; g.policies.set(e.key, gp); }
        gp[kind]++;
        if (kind !== "success") bump(gp.risk, riskOf(rec));
        if (kind === "failure") bump(gp.deny, denyWhy(rec, ap));
      }
    }

    const ORDER = { block: 0, prompt: 1, clean: 2, scoped: 3, nodata: 4 };
    const riskList = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ what: k, n }));
    const policies = [...pol.values()].map((e) => {
      const users = [...e.users.values()]
        .map((u) => ({ ...u, riskWhy: riskList(u.risk), denyWhy: riskList(u.deny) }))
        .sort((a, b) => (b.failure - a.failure) || (b.interrupted - a.interrupted) || (b.success - a.success));
      const evaluated = e.success + e.interrupted + e.failure;
      return {
        ...e,
        users,
        apps: [...e.apps.entries()].sort((a, b) => b[1] - a[1]),
        controls: [...e.controls],
        evaluated,
        total: evaluated + e.notApplied,
        blockedUsers: users.filter((u) => u.failure > 0),
        promptedUsers: users.filter((u) => !u.failure && u.interrupted > 0),
        verdict: verdictOf(e),
      };
    }).sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || b.failure - a.failure || b.interrupted - a.interrupted || b.evaluated - a.evaluated);

    const users = [...usr.values()].map((g) => ({
      ...g,
      apps: [...g.apps],
      policies: [...g.policies.values()]
        .map((x) => ({ ...x, riskWhy: riskList(x.risk), denyWhy: riskList(x.deny) }))
        .sort((a, b) => b.failure - a.failure || b.interrupted - a.interrupted),
      worst: g.failure ? "block" : g.interrupted ? "prompt" : "clean",
    })).sort((a, b) => ORDER[a.worst] - ORDER[b.worst] || b.failure - a.failure || b.interrupted - a.interrupted);

    return {
      policies, users,
      counts: {
        block: policies.filter((p) => p.verdict === "block").length,
        prompt: policies.filter((p) => p.verdict === "prompt").length,
        clean: policies.filter((p) => p.verdict === "clean").length,
        scoped: policies.filter((p) => p.verdict === "scoped").length,
        nodata: policies.filter((p) => p.verdict === "nodata").length,
      },
      blockedUsers: users.filter((u) => u.worst === "block").length,
      promptedUsers: users.filter((u) => u.worst === "prompt").length,
      records: (records || []).length,
    };
  }

  // One line a change-advisory board can read per policy.
  function verdictLine(p) {
    if (p.verdict === "nodata") return "No sign-in in this window was evaluated against it — no evidence either way. Widen the window or drive traffic before enabling.";
    if (p.verdict === "scoped") return `Evaluated ${p.notApplied.toLocaleString()}× but never in scope for a sign-in — check the assignments before concluding it is safe.`;
    if (p.verdict === "clean") return `Every applying sign-in (${p.success.toLocaleString()}) already satisfies it — enabling changes nothing observed in this window.`;
    const parts = [];
    const nInt = p.users.filter((u) => u.interrupted > 0).length;
    if (p.failure) parts.push(`${p.blockedUsers.length} user${p.blockedUsers.length === 1 ? "" : "s"} would be DENIED (${p.failure.toLocaleString()} sign-in${p.failure === 1 ? "" : "s"})`);
    if (p.interrupted) parts.push(`${nInt} user${nInt === 1 ? "" : "s"} interrupted for a control (${p.interrupted.toLocaleString()}×)`);
    if (p.success) parts.push(`${p.success.toLocaleString()} pass unchanged`);
    return "Going live now: " + parts.join(" · ") + ".";
  }

  // ---- Markdown: the go-live evidence, per policy then per user ---------
  function toMd(res, days) {
    const range = days >= 1
      ? `${days} day${days === 1 ? "" : "s"}`
      : `${Math.round(days * 24)} hour${Math.round(days * 24) === 1 ? "" : "s"}`;
    const L = ["# Report-only impact — go-live forecast", "",
      `Window: last ${range} · ${res.records.toLocaleString()} sign-ins read · generated ${new Date().toISOString().slice(0, 10)}`, "",
      `**${res.counts.block}** would block users · **${res.counts.prompt}** add prompts only · **${res.counts.clean}** change nothing · **${res.counts.scoped + res.counts.nodata}** without evidence`, "",
      "Verdicts come from the sign-in log's report-only results: `reportOnlyFailure` = the sign-in would have been denied, `reportOnlyInterrupted` = the user would have been stopped for an extra step, `reportOnlySuccess` = already satisfied.", ""];
    L.push("## Per policy", "");
    L.push("| Policy | Verdict | Would deny | Interrupted | Pass | Out of scope | Users hit |");
    L.push("|---|---|---|---|---|---|---|");
    const V = { block: "🔴 would block", prompt: "🟡 prompts only", clean: "🟢 no change", scoped: "⚪ never in scope", nodata: "⚪ no data" };
    for (const p of res.policies) {
      L.push(`| ${p.name.replace(/\|/g, "\\|")} | ${V[p.verdict]} | ${p.failure} | ${p.interrupted} | ${p.success} | ${p.notApplied} | ${p.blockedUsers.length + p.promptedUsers.length} |`);
    }
    L.push("");
    for (const p of res.policies.filter((x) => x.verdict === "block" || x.verdict === "prompt")) {
      L.push(`### ${p.name}`, "", verdictLine(p), "");
      if (p.controls.length) L.push(`Controls: ${p.controls.join(", ")}`, "");
      L.push("| User | Would deny | Interrupted | Pass | Apps |");
      L.push("|---|---|---|---|---|");
      for (const u of p.users.slice(0, 50)) {
        L.push(`| ${u.upn} | ${u.failure || ""} | ${u.interrupted || ""} | ${u.success || ""} | ${[...u.apps].slice(0, 4).join(", ")} |`);
      }
      if (p.users.length > 50) L.push(`| … ${p.users.length - 50} more users | | | | |`);
      L.push("");
    }
    L.push("## Per user — everything in report-only at once", "");
    L.push("| User | Outcome | Would deny | Interrupted | Pass | Policies involved |");
    L.push("|---|---|---|---|---|---|");
    const W = { block: "🔴 locked out of something", prompt: "🟡 new prompts", clean: "🟢 unaffected" };
    for (const u of res.users.slice(0, 200)) {
      L.push(`| ${u.upn} | ${W[u.worst]} | ${u.failure || ""} | ${u.interrupted || ""} | ${u.success || ""} | ${u.policies.map((x) => x.name).join("; ").replace(/\|/g, "\\|")} |`);
    }
    if (res.users.length > 200) L.push(`| … ${res.users.length - 200} more users | | | | | |`);
    return L.join("\n");
  }

  return { query, build, verdictLine, toMd, RO };
})();
