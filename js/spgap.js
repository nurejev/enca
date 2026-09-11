// ======================================================================
// 🫥 Apps with no service principal (T39, BETA) — pure functions.
//
// An app that signed in over the last 30 days but has NO service principal
// in this tenant is invisible to Conditional Access: it is not in the app
// picker, so it can be neither included nor excluded by name — only a policy
// on All resources reaches it. Microsoft Graph gives one row per app for the
// past 30 days in a single call (GET /beta/auditLogs/signInEventsAppSummary,
// AuditLog.Read.All; a fixed window, at most 1000 rows), which this module
// diffs against the tenant's service principals. For each app left over it
// says three things:
//   · which policies WOULD apply the moment the app exists (WhatIfEval, the
//     same engine as 🧪 What-If, with an All-users scenario) — will / may /
//     will not, with the reason;
//   · whether any policy already EXCLUDES the id (a phantom exclusion — it
//     protects nothing today and becomes live on consent);
//   · what Entra recorded on the newest sign-in, when a sign-in window is
//     loaded — evidence, never a prediction.
// Reads only. No generated PowerShell: the CSV lists the app ids for whoever
// registers them, deliberately, by hand.
// ======================================================================
const SpGap = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const NULL_GUID = "00000000-0000-0000-0000-000000000000";
  const SUMMARY_CAP = 1000;   // the endpoint tops out here; more apps = truncated
  const isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");
  const lc = (s) => String(s || "").toLowerCase();
  const CONTROL_LABEL = {
    block: "Block", mfa: "MFA", compliantDevice: "compliant device", domainJoinedDevice: "hybrid-joined device",
    approvedApplication: "approved client app", compliantApplication: "app protection policy",
    passwordChange: "password change", riskRemediation: "risk remediation", authenticationStrength: "authentication strength",
  };

  // ---- which policies would hit the app once it exists ----
  // Scenario: the app, for All users, nothing else known. A policy the
  // scenario cannot decide (location, risk, platform, client app, a group
  // scope) is "may apply" with the reason; an app-scope miss is "will not".
  function impactOf(raws, appId) {
    const out = { will: [], may: [], wont: [] };
    if (typeof WhatIfEval === "undefined" || !WhatIfEval.evaluate) return out;
    const sc = { appId, appName: appId, userId: "", groupIds: new Set(), roleIds: new Set(), isGuest: false };
    let r;
    try { r = WhatIfEval.evaluate(raws, sc, {}); } catch (e) { console.warn("SpGap: What-If evaluation failed", e.message); return out; }
    for (const a of r.applied || []) {
      const grant = (a.grant || []).map((g) => CONTROL_LABEL[g] || g);
      out.will.push({ id: a.id, name: a.name, state: a.state, grant, block: (a.grant || []).includes("block"), operator: a.operator });
    }
    for (const n of r.notApplied || []) {
      if (n.why === "app" || n.why === "excluded") out.wont.push({ id: n.id, name: n.name, state: n.state, reason: n.reason });
      else out.may.push({ id: n.id, name: n.name, state: n.state, reason: n.reason, why: n.why });
    }
    return out;
  }

  // ---- newest sign-in for the app, from a loaded window (raw Graph records) ----
  function evidenceOf(records, appId) {
    if (!records || !records.length) return null;
    const id = lc(appId);
    let best = null;
    for (const r of records) {
      if (lc(r.appId) !== id) continue;
      if (!best || String(r.createdDateTime || "") > String(best.createdDateTime || "")) best = r;
    }
    if (!best) return null;
    const applied = (best.appliedConditionalAccessPolicies || [])
      .filter((p) => p && p.result && !/notApplied|notEnabled|reportOnlyNotApplied/i.test(p.result))
      .map((p) => ({ name: p.displayName || p.id, result: p.result }));
    const st = best.status || {};
    return {
      when: best.createdDateTime || "", user: best.userDisplayName || best.userPrincipalName || "", upn: best.userPrincipalName || "",
      ip: best.ipAddress || "", client: best.clientAppUsed || "", caStatus: best.conditionalAccessStatus || "",
      error: st.errorCode ?? null, resource: best.resourceDisplayName || "", applied,
    };
  }

  // ---- the analysis ----
  // summary: rows from signInEventsAppSummary ({ appId, signInCount })
  // spIds: Set of lower-case appIds that HAVE a service principal here
  // raws: the policies; names: (id) => display name; records: sign-in window or null
  function analyze({ summary, spIds, raws, names, records, truncated }) {
    const rows = (summary || []).filter((r) => r && isGuid(r.appId) && lc(r.appId) !== NULL_GUID && !spIds.has(lc(r.appId)));
    const enabled = (raws || []).filter((p) => p.state === "enabled");
    const apps = rows.map((r) => {
      const id = r.appId;
      const known = typeof firstPartyAppName === "function" ? firstPartyAppName(id) : null;
      const name = (names && names(id) !== id ? names(id) : null) || known || "Unknown app";
      const phantomIn = (raws || []).filter((p) => ((p.conditions?.applications?.excludeApplications) || []).some((a) => lc(a) === lc(id)))
        .map((p) => ({ id: p.id, name: p.displayName, state: p.state }));
      const impact = impactOf(raws, id);
      const enforcing = impact.will.filter((w) => w.state === "enabled");
      const blocked = enforcing.some((w) => w.block);
      const covered = enforcing.length > 0;
      return {
        appId: id, name, firstParty: !!known, signIns: r.signInCount || 0, phantomIn, impact,
        blocked, covered,
        // the one-word verdict
        verdict: blocked ? "blocked" : covered ? "enforced" : impact.may.some((m) => m.state === "enabled") ? "maybe" : "uncovered",
        evidence: evidenceOf(records, id),
      };
    }).sort((a, b) => b.signIns - a.signIns || a.name.localeCompare(b.name));
    const tiles = {
      total: apps.length,
      signIns: apps.reduce((s, a) => s + a.signIns, 0),
      blocked: apps.filter((a) => a.verdict === "blocked").length,
      enforced: apps.filter((a) => a.verdict === "enforced").length,
      maybe: apps.filter((a) => a.verdict === "maybe").length,
      uncovered: apps.filter((a) => a.verdict === "uncovered").length,
      phantom: apps.filter((a) => a.phantomIn.length).length,
      named: apps.filter((a) => a.name !== "Unknown app").length,
      enabledPolicies: enabled.length,
    };
    return { apps, tiles, truncated: !!truncated || (summary || []).length >= SUMMARY_CAP, hasEvidence: !!(records && records.length), windowDays: 30 };
  }

  // ---- rendering ----
  const VERDICT = {
    blocked: ["block", "would be blocked", "an enabled block policy on All resources reaches it"],
    enforced: ["grant", "would be enforced", "an enabled grant policy on All resources reaches it"],
    maybe: ["warn", "depends", "only policies with conditions the scenario cannot decide reach it"],
    uncovered: ["bad", "no Conditional Access", "no enabled policy reaches it — not even All resources"],
  };
  const tile = (k, v, s, cls, title) => `<div class="wo-vt${cls ? " " + cls : ""}" title="${esc(title || "")}"><span class="k">${esc(k)}</span><span class="v">${v}</span><span class="s">${esc(s)}</span></div>`;

  function renderTiles(R) {
    const t = R.tiles;
    return `<div class="wo-verdicts wo-5">
      ${tile("No service principal", String(t.total), `${t.signIns.toLocaleString()} sign-ins in 30 days${R.truncated ? " · capped at 1,000 apps" : ""}`, "", "Apps that signed in over the last 30 days and have no service principal in this tenant")}
      ${tile("No Conditional Access", String(t.uncovered), t.uncovered ? "not even All resources reaches them" : "every app is reached by something", t.uncovered ? "bad" : "ok", VERDICT.uncovered[2])}
      ${tile("Depends on conditions", String(t.maybe), "only conditional policies reach them", t.maybe ? "warn" : "", VERDICT.maybe[2])}
      ${tile("Reached once it exists", `${t.enforced + t.blocked}`, `${t.enforced} enforced · ${t.blocked} blocked`, t.enforced + t.blocked ? "ok" : "", "An enabled All-resources policy applies the moment the app has a service principal")}
      ${tile("Phantom exclusions", String(t.phantom), t.phantom ? "excluded by id before it exists" : "no policy excludes one of these", t.phantom ? "warn" : "", "Apps some policy already EXCLUDES by id — the exclusion matches nothing today and goes live on consent")}
    </div>`;
  }

  function verdictChip(a) {
    const v = VERDICT[a.verdict] || VERDICT.uncovered;
    return `<span class="sev ${v[0] === "bad" ? "high" : v[0] === "warn" ? "medium" : "info"}" title="${esc(v[2])}">${esc(v[1])}</span>`;
  }

  function renderTable(R, filter, q) {
    const qq = lc(q || "").trim();
    let rows = R.apps;
    if (filter && filter !== "all") rows = rows.filter((a) => filter === "phantom" ? a.phantomIn.length : a.verdict === filter);
    if (qq) rows = rows.filter((a) => lc(a.name).includes(qq) || lc(a.appId).includes(qq) || a.impact.will.some((w) => lc(w.name).includes(qq)) || a.phantomIn.some((p) => lc(p.name).includes(qq)));
    if (!R.apps.length) return `<p class="mini" style="padding:20px">Every app that signed in over the last 30 days has a service principal in this tenant — Conditional Access can name all of them.${R.truncated ? " (The summary was capped at 1,000 apps, so this is true of the 1,000 busiest.)" : ""}</p>`;
    if (!rows.length) return `<p class="mini" style="padding:20px">No app matches the current filter.</p>`;
    const pol = (list, cls) => list.length ? list.map((p) => `<span class="pill ${cls}" style="text-align:left;white-space:normal" title="${esc(p.reason || (p.grant || []).join(" " + (p.operator || "OR") + " ") || "")}">${esc(p.name)}${p.state === "enabledForReportingButNotEnforced" ? " <span class=\"muted\">(report-only)</span>" : ""}</span>`).join(" ") : '<span class="muted">—</span>';
    const body = rows.map((a) => {
      const ev = a.evidence;
      const evHtml = !R.hasEvidence ? '<span class="muted" title="Load a sign-in window (📖 Read evidence) to see the newest sign-in">not read</span>'
        : !ev ? '<span class="muted">not in the loaded window</span>'
        : `<div title="${esc(ev.when)}">${esc((ev.when || "").slice(0, 16).replace("T", " "))} · ${esc(ev.user)}${ev.client ? ` · ${esc(ev.client)}` : ""}</div><div class="mini muted">CA: ${esc(ev.caStatus || "—")}${ev.error ? ` · error ${esc(ev.error)}` : ""}${ev.applied.length ? ` · ${ev.applied.map((p) => `${esc(p.name)} (${esc(p.result)})`).join(", ")}` : " · no policy applied"}</div>`;
      return `<tr data-sg-app="${esc(a.appId)}">
        <td><div><b>${esc(a.name)}</b>${a.firstParty ? ' <span class="tag" title="Microsoft first-party app id (name from ENCA\'s built-in map, not from this tenant)">Microsoft</span>' : ""}</div><div class="mini muted" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(a.appId)}</div></td>
        <td class="num">${a.signIns.toLocaleString()}</td>
        <td>${verdictChip(a)}</td>
        <td>${pol(a.impact.will, "green")}</td>
        <td>${pol(a.impact.may, "amber")}</td>
        <td>${a.phantomIn.length ? a.phantomIn.map((p) => `<span class="pill red" style="text-align:left;white-space:normal" title="This policy excludes the app by id — the exclusion protects nothing today and goes live on consent">${esc(p.name)}</span>`).join(" ") : '<span class="muted">—</span>'}</td>
        <td>${evHtml}</td>
      </tr>`;
    }).join("");
    return `<div class="mwrap-x"><table class="mtable sg-table"><thead><tr>
      <th>App</th><th class="num">Sign-ins (30 d)</th><th>Once it exists</th><th>Would apply</th><th>May apply</th><th>Excluded by</th><th>Newest sign-in</th>
    </tr></thead><tbody>${body}</tbody></table></div>
    <p class="mini muted" style="margin-top:8px">${rows.length} of ${R.apps.length} app${R.apps.length === 1 ? "" : "s"}${R.truncated ? " · the summary tops out at 1,000 apps — the tenant has more" : ""} · “Would apply” is the 🧪 What-If verdict for an All-users sign-in to this app with nothing else known; “May apply” lists the policies whose other conditions the scenario cannot decide.</p>`;
  }

  // ---- exports ----
  const mdEsc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  function toMd(R, tenantName) {
    const L = [];
    L.push(`# Apps with no service principal — ${mdEsc(tenantName || "tenant")}`);
    L.push("");
    if (typeof Brand !== "undefined" && Brand.generatedBy) L.push(Brand.generatedBy());
    L.push("");
    L.push("Apps that signed in over the last 30 days (Microsoft Graph `auditLogs/signInEventsAppSummary`) and have **no service principal** in this tenant. Such an app is not in the Conditional Access app picker — it can be neither included nor excluded by name; only a policy on **All resources** reaches it.");
    L.push("");
    const t = R.tiles;
    L.push(`- Apps without a service principal: **${t.total}** (${t.signIns.toLocaleString()} sign-ins between them${R.truncated ? "; the summary is capped at 1,000 apps" : ""})`);
    L.push(`- No Conditional Access at all: **${t.uncovered}** · depends on conditions: ${t.maybe} · would be enforced: ${t.enforced} · would be blocked: ${t.blocked}`);
    L.push(`- Phantom exclusions (a policy already excludes the id): **${t.phantom}**`);
    L.push("");
    if (R.apps.length) {
      L.push("| App | App id | Sign-ins | Once it exists | Would apply | May apply | Excluded by | Newest sign-in |");
      L.push("| --- | --- | ---: | --- | --- | --- | --- | --- |");
      for (const a of R.apps) {
        const ev = a.evidence;
        L.push(`| ${mdEsc(a.name)} | \`${a.appId}\` | ${a.signIns} | ${VERDICT[a.verdict][1]} | ${a.impact.will.map((p) => mdEsc(p.name) + (p.state === "enabledForReportingButNotEnforced" ? " (report-only)" : "")).join("<br>") || "—"} | ${a.impact.may.map((p) => mdEsc(p.name)).join("<br>") || "—"} | ${a.phantomIn.map((p) => mdEsc(p.name)).join("<br>") || "—"} | ${ev ? `${mdEsc(ev.when.slice(0, 16).replace("T", " "))} ${mdEsc(ev.user)} — CA ${mdEsc(ev.caStatus || "—")}${ev.applied.length ? ": " + ev.applied.map((p) => `${mdEsc(p.name)} (${p.result})`).join(", ") : ""}` : R.hasEvidence ? "not in the loaded window" : "not read"} |`);
      }
      L.push("");
    } else {
      L.push("_Every app that signed in over the last 30 days has a service principal here._");
      L.push("");
    }
    L.push("## What to do");
    L.push("");
    L.push("- An app with **no Conditional Access at all** is reached by nothing — not even your All-resources policies, because those only apply once a service principal exists and the app is in scope. Decide per app: register it deliberately (`New-MgServicePrincipal -AppId <id>` from the CSV, `-WhatIf` first) so your policies apply, or find out why an unregistered app is signing in at all.");
    L.push("- A **phantom exclusion** is an exclusion on an id that is not here: it protects nothing today and goes live the moment the app is consented. Remove it, or register the app and review the exclusion.");
    L.push("- “Would apply” is a prediction from the policy set for an All-users sign-in; the **newest sign-in** column is what Entra actually recorded. Where they disagree, the sign-in is right.");
    L.push("");
    return L.join("\n");
  }

  function toCsv(R) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const L = [["appId", "name", "signIns30d", "verdict", "wouldApply", "mayApply", "excludedBy", "newestSignIn", "newestUser", "newestCaStatus"].join(",")];
    for (const a of R.apps) {
      const ev = a.evidence || {};
      L.push([a.appId, a.name, a.signIns, a.verdict, a.impact.will.map((p) => p.name).join("; "), a.impact.may.map((p) => p.name).join("; "), a.phantomIn.map((p) => p.name).join("; "), ev.when || "", ev.upn || ev.user || "", ev.caStatus || ""].map(q).join(","));
    }
    return L.join("\n");
  }

  return { analyze, impactOf, evidenceOf, renderTiles, renderTable, toMd, toCsv, VERDICT };
})();
