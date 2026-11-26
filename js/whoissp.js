// ======================================================================
// 🤖 Who is … to CA — the SERVICE PRINCIPAL subject (T36 1.7.0, beta 33608).
//
// The fourth subject beside a user, a group and Compare users. The question
// is the user one asked of a workload identity: which Conditional Access
// policies reach this service principal or managed identity, what its
// sign-ins did, and WHERE it signs in from — the 🌐 card is WhoIs.ipsHtml,
// the same one the user subject shows, fed from its own sign-ins.
//
// Conditional Access for workload identities is a different scope from the
// user one (conditions.clientApplications), and its rules come from
// 🤖 Workload identities (js/workloadid.js) — never copied here:
//   • only a SINGLE-TENANT service principal registered in this tenant can
//     be targeted; a managed identity, a multi-tenant or a Microsoft app
//     cannot (WorkloadId.kindOf)
//   • it must be named directly, or covered by ServicePrincipalsInMyTenant;
//     an attribute filter decides on attributes this tool does not evaluate
//     (WorkloadId.targets / inScope)
// A policy aimed at USERS never applies to a service principal sign-in, so
// those are counted in one line, not listed.
//
// Pure. The Graph / hunting reads live in app.js (wp*).
//
//   WhoIsSp.fromHunting(rows)        → records in the Graph shape, weighted (_n)
//   WhoIsSp.huntQuery(table, id, from, to)
//   WhoIsSp.analyze({ sp, records, policies, locations, tenantId, days, now, source })
//   WhoIsSp.render(m, opts) / toMd(m, meta) / toCsv(m)
// ======================================================================
const WhoIsSp = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const STATE = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };
  const caNumOf = (name) => { const m = String(name || "").match(/\bCA\d{3,4}[A-Za-z]?\b/); return m ? m[0] : ""; };
  const WHY_NOT = {
    mi: "a managed identity — Conditional Access for workload identities does not cover managed identities",
    multi: "a multi-tenant app registered in another tenant — only single-tenant service principals registered here can be targeted",
    multiHere: "a multi-tenant app — only single-tenant service principals can be targeted",
    microsoft: "a Microsoft first-party app — Conditional Access for workload identities does not cover it",
  };
  const isFailure = (r) => !!((r.status && r.status.errorCode === 53003) || r.conditionalAccessStatus === "failure");

  // ---- hunting -------------------------------------------------------------
  // One principal, summarised per address, place, resource and day: the raw
  // table can hold far more rows than a response carries, and the IP card
  // only needs counts. Each row becomes one weighted record (_n sign-ins,
  // _stopped of them error 53003) — WhoIs.ipsOf honours the weight.
  function huntQuery(table, id, from, to) {
    const safe = String(id || "").replace(/[^0-9a-fA-F-]/g, "");
    return `${table || "EntraIdSpnSignInEvents"}
| where Timestamp between (datetime(${from}) .. datetime(${to}))
| where ServicePrincipalId == "${safe}" or ApplicationId == "${safe}"
| summarize n = count(), blocked = countif(ErrorCode == 53003), failed = countif(ErrorCode != 0), first = min(Timestamp), last = max(Timestamp) by IPAddress, Country, City, ResourceDisplayName, Day = bin(Timestamp, 1d)
| take 20000`;
  }
  function fromHunting(rows) {
    return (rows || []).map((r, i) => ({
      id: `h-${i}`, createdDateTime: r.last || r.Day || "", _first: r.first || "", _n: +r.n || 1, _stopped: +r.blocked || 0, _failed: +r.failed || 0,
      ipAddress: r.IPAddress || "", location: { city: r.City || "", countryOrRegion: r.Country || "" }, resourceDisplayName: r.ResourceDisplayName || "",
      status: { errorCode: 0 }, hunting: true,
    }));
  }

  // ---- analyse -------------------------------------------------------------
  function analyze(input) {
    const I = input || {};
    const sp = I.sp || {};
    const W = typeof WorkloadId !== "undefined" ? WorkloadId : null;
    const recs = I.records || [];
    const mi = /managedidentity/i.test(String(sp.servicePrincipalType || "")) || recs.some((r) => (r.signInEventTypes || []).includes("managedIdentity"));
    const kind = W ? W.kindOf(sp, mi, I.tenantId) : "unknown";
    const targetable = kind === "single" || kind === "unknown";
    const hunting = recs.some((r) => r.hunting);
    const w = (r) => +r._n || 1;
    // per policy: which results its sign-ins carry (Graph sources only)
    const results = new Map();
    recs.forEach((r) => (r.appliedConditionalAccessPolicies || []).forEach((x) => {
      const c = results.get(x.id) || results.set(x.id, {}).get(x.id);
      c[x.result] = (c[x.result] || 0) + w(r);
    }));
    const raws = I.policies || [];
    let userPolicies = 0;
    const rows = [];
    raws.forEach((p) => {
      const t = W ? W.targets(p) : null;
      if (!t) { userPolicies++; return; }
      const ids = [sp.id, sp.appId].filter(Boolean);
      const excluded = t.exclude.some((x) => ids.includes(x));
      const named = t.include.some((x) => ids.includes(x));
      const v = W.inScope(t, { id: sp.id, appId: sp.appId }, kind);
      const s = !targetable && (named || t.all) ? "cannot" : excluded ? "exc" : v === true ? "inc" : v === null ? "filter" : "na";
      const how = s === "exc" ? "excluded — named in the policy's exclusions"
        : s === "cannot" ? (named ? "named, but this kind cannot be targeted" : "all service principals in the tenant, but this kind cannot be targeted")
        : named ? "named directly" : t.all ? "all service principals in the tenant" : "not named";
      const grant = ((p.grantControls || {}).builtInControls || []).map(String);
      rows.push({ id: p.id, name: p.displayName || p.id, seq: caNumOf(p.displayName), state: STATE[p.state] || "off", s, how, filter: t.filter, byFilter: v === null,
        block: grant.some((g) => /^block$/i.test(g)), grant, locations: !!((p.conditions || {}).locations), risk: ((p.conditions || {}).servicePrincipalRiskLevels || []).length > 0,
        res: results.get(p.id) || null });
    });
    const ORDER = { inc: 0, filter: 1, cannot: 2, exc: 3, na: 4 };
    rows.sort((a, b) => ORDER[a.s] - ORDER[b.s] || (a.seq || a.name).localeCompare(b.seq || b.name));
    const reach = rows.filter((r) => r.s === "inc" || r.s === "filter");
    // resources it signs in to
    const res = new Map();
    let total = 0, stopped = 0, failed = 0, last = "", first = "";
    recs.forEach((r) => {
      const n = w(r); total += n;
      const st = r.hunting ? (+r._stopped || 0) : (isFailure(r) ? 1 : 0);
      const fl = r.hunting ? (+r._failed || 0) : (r.status && r.status.errorCode ? 1 : 0);
      stopped += st; failed += fl;
      const t = String(r.createdDateTime || ""), f = String(r._first || r.createdDateTime || "");
      if (t > last) last = t;
      if (f && (!first || f < first)) first = f;
      const k = r.resourceDisplayName || r.resourceId || "(resource)";
      const e = res.get(k) || res.set(k, { name: k, n: 0, stopped: 0, failed: 0, last: "" }).get(k);
      e.n += n; e.stopped += st; e.failed += fl; if (t > e.last) e.last = t;
    });
    const failedIds = new Set(recs.filter((r) => !r.hunting && isFailure(r)).map((r) => r.id));
    const ips = typeof WhoIs !== "undefined" ? WhoIs.ipsOf(recs, failedIds, I.locations === undefined ? null : I.locations, I.now, I.days) : null;
    const callouts = [];
    if (!targetable) callouts.push({ kind: "info", text: `Conditional Access cannot target this principal: it is ${WHY_NOT[kind] || "of a kind Conditional Access for workload identities does not cover"}. Every policy below that names it, or covers all service principals in the tenant, passes it by.` });
    else if (!reach.length && total) callouts.push({ kind: ips && ips.by.outside ? "warn" : "info", text: `No workload-identity policy reaches it.${ips && ips.by.outside ? ` ${ips.by.outside} of its ${ips.rows.length} address${ips.rows.length === 1 ? "" : "es"} sit outside every IP named location — a location-scoped policy would pin it to where it runs.` : ""} Creating one needs Workload Identities Premium; existing policies keep working without it.` });
    if (stopped) callouts.push({ kind: "bad", text: `${stopped.toLocaleString()} sign-in${stopped === 1 ? " was" : "s were"} stopped by Conditional Access (error 53003)${hunting ? " — the hunting source does not say which policy" : ""}.` });
    const filterRows = reach.filter((r) => r.s === "filter");
    if (filterRows.length) callouts.push({ kind: "info", text: `${filterRows.length} polic${filterRows.length === 1 ? "y decides" : "ies decide"} by an attribute filter (${filterRows.map((r) => r.seq || r.name).join(", ")}) — whether it matches this principal's custom security attributes is not evaluated here.` });
    return {
      sp, kind, kindLabel: (W && W.KIND_LABEL && W.KIND_LABEL[kind]) || kind, targetable, mi, rows, reach, userPolicies,
      counts: { reach: reach.length, on: reach.filter((r) => r.state === "on").length, ro: reach.filter((r) => r.state === "ro").length, off: reach.filter((r) => r.state === "off").length, total: rows.length },
      total, stopped, failed, first, last, resources: [...res.values()].sort((a, b) => b.n - a.n), ips, callouts, hunting,
      days: I.days || 0, capped: !!I.capped, source: I.source || "", notes: I.notes || [],
    };
  }

  // ---- render --------------------------------------------------------------
  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return String(iso || ""); } };
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const credLine = (sp) => {
    const c = sp.credentials;
    if (!c) return "";
    if (!c.count) return '<span class="wo-ipl n">no secret or certificate on the registration</span>';
    const d = c.nextExpiry ? Date.parse(c.nextExpiry) : NaN, days = Number.isFinite(d) ? Math.floor((d - Date.now()) / 86400000) : null;
    const cls = days != null && days < 0 ? "wo-ipl new" : days != null && days < 30 ? "wo-ipl new" : "wo-ipl";
    return `<span class="${cls}">${c.secrets ? `${c.secrets} secret${c.secrets === 1 ? "" : "s"}` : ""}${c.secrets && c.certs ? " · " : ""}${c.certs ? `${c.certs} certificate${c.certs === 1 ? "" : "s"}` : ""}${c.nextExpiry ? ` · ${days < 0 ? "expired" : "next expires"} ${esc(String(c.nextExpiry).slice(0, 10))}` : ""}</span>`;
  };
  const RES_LABEL = { failure: "blocked", success: "applied", notApplied: "not applied", reportOnlyFailure: "report-only: would block", reportOnlySuccess: "report-only: would apply", reportOnlyNotApplied: "report-only: not applied", notEnabled: "off" };
  const resHtml = (r, hunting) => {
    if (hunting) return '<span class="mini muted">not in the hunting source</span>';
    if (!r.res) return '<span class="mini muted">on none of its sign-ins</span>';
    return Object.entries(r.res).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="wo-res ${/failure/i.test(k) ? "blk" : /success/.test(k) ? "nc" : ""}">${esc(RES_LABEL[k] || k)} ×${n.toLocaleString()}</span>`).join(" ");
  };
  function render(m, opts = {}) {
    const sp = m.sp, rangeLabel = opts.rangeLabel || (m.days ? `${m.days} days` : "window");
    const S = { inc: ["tc-on", "Reaches it"], filter: ["xt-info", "If the filter matches"], cannot: ["wl-na", "Cannot target this kind"], exc: ["xt-medium", "Excluded"], na: ["xt-info", "Not targeted"] };
    const pf = ["reach", "all"].includes(opts.filter) ? opts.filter : "reach";
    const shown = pf === "all" ? m.rows : m.rows.filter((r) => r.s !== "na");
    const head = `<div class="list-card wo-card">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
        <h3 style="margin:0">🤖 ${esc(sp.displayName || sp.id)} <span class="wo-ipl">${esc(m.kindLabel)}</span>${sp.accountEnabled === false ? ' <span class="wo-ipl new">disabled</span>' : ""} ${credLine(sp)}</h3>
        <span class="mini muted mono">appId ${esc(sp.appId || "—")} · object ${esc(sp.id || "—")}</span>
      </div>
      <div class="wo-iptiles" style="margin-top:10px">
        <div class="wo-ipt"><span>Policies reaching it</span><b>${m.targetable ? m.counts.reach : "—"}</b><i>${m.targetable ? `${m.counts.on} on · ${m.counts.ro} report-only · ${m.counts.off} off` : "Conditional Access cannot target it"}</i></div>
        <div class="wo-ipt"><span>Sign-ins</span><b>${m.total.toLocaleString()}</b><i>${m.resources.length} resource${m.resources.length === 1 ? "" : "s"}${m.failed ? ` · ${m.failed.toLocaleString()} failed` : ""}</i></div>
        <div class="wo-ipt"><span>IP addresses</span><b>${m.ips ? m.ips.rows.length : 0}</b><i>${m.ips && m.ips.locationsRead ? `${m.ips.trusted} in a trusted location` : "named locations not read"}</i></div>
        <div class="wo-ipt${m.stopped ? " bad" : ""}"><span>Stopped by CA</span><b>${m.stopped.toLocaleString()}</b><i>in this window</i></div>
      </div>
      ${m.callouts.map((c) => `<div class="wo-callout${c.kind === "bad" ? " bad" : c.kind === "info" ? "" : ""}">${esc(c.text)}</div>`).join("")}
      ${m.capped ? `<p class="mini muted" style="margin:8px 0 0">The read stopped at its cap — counts are from the newest sign-ins only.</p>` : ""}
    </div>`;
    const pols = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="sppol">Workload identity policies ${pill(m.counts.reach, "")}</h3>
      <div class="chip-filter" style="margin:0 0 8px"><button class="fchip${pf === "reach" ? " active" : ""}" data-wp-pfilter="reach">Relevant ${m.rows.filter((r) => r.s !== "na").length}</button><button class="fchip${pf === "all" ? " active" : ""}" data-wp-pfilter="all">All workload policies ${m.rows.length}</button></div>
      ${shown.length ? `<div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>State</th><th>How it reaches</th><th>Result on its sign-ins</th></tr></thead><tbody>
        ${shown.map((r) => `<tr><td><span class="pol-link" data-polid="${esc(r.id)}" title="${esc(r.name)}">${esc(r.seq || r.name)}</span>${r.seq ? `<div class="mini muted">${esc(r.name)}</div>` : ""}<div class="mini muted">${esc([r.block ? "block" : r.grant.join(", "), r.locations ? "locations" : "", r.risk ? "service principal risk" : ""].filter(Boolean).join(" · "))}</div></td>
          <td>${esc(STATE_LABEL[r.state])}</td>
          <td><span class="xt-pill ${S[r.s][0]}">${S[r.s][1]}</span><div class="mini muted">${esc(r.how)}${r.byFilter ? " — an attribute filter decides" : ""}</div></td>
          <td>${resHtml(r, m.hunting)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="mini muted">${m.rows.length ? "No workload-identity policy names it or covers all service principals — the All chip lists the others." : "The tenant has no policy aimed at workload identities."}</p>`}
      <p class="mini muted" style="margin-top:8px">${m.userPolicies} polic${m.userPolicies === 1 ? "y targets" : "ies target"} users and never appl${m.userPolicies === 1 ? "ies" : "y"} to a service principal sign-in. Only a single-tenant service principal registered in this tenant can be targeted, named directly or through all service principals in the tenant; a managed identity, a multi-tenant or a Microsoft app cannot. Creating or changing a workload-identity policy needs Workload Identities Premium.</p>
    </div>`;
    const resT = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="spres">Resources it signs in to · ${esc(rangeLabel)} ${pill(m.resources.length, "")}</h3>
      ${m.resources.length ? `<div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Resource</th><th class="num">Sign-ins</th><th class="num">Stopped</th><th class="num">Failed</th><th>Last</th></tr></thead><tbody>
        ${m.resources.slice(0, 30).map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.n.toLocaleString()}</td><td class="num">${r.stopped ? `<span class="wo-res blk">${r.stopped}</span>` : ""}</td><td class="num">${r.failed || ""}</td><td class="num">${r.last ? esc(fmtWhen(r.last)) : "—"}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="mini muted">No sign-ins in the window.</p>`}
    </div>`;
    const ipCard = m.ips ? WhoIs.ipsHtml(m.ips, { who: "it", whose: "its", rangeLabel, filter: opts.ipFilter, group: opts.ipGroup, source: opts.source || null }) : "";
    return head + pols + ipCard + resT;
  }

  // ---- exports -------------------------------------------------------------
  function toMd(m, meta = {}) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const sp = m.sp;
    const L = [`# Who is ${e(sp.displayName || sp.id)} to Conditional Access — ${e(meta.tenant || "")}`, "", (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy("Generated") : "", ""];
    L.push(`**${e(sp.displayName)}** — ${e(m.kindLabel)}, appId ${e(sp.appId)}, object ${e(sp.id)}${sp.accountEnabled === false ? ", DISABLED" : ""}`, "");
    L.push("## At a glance", "");
    L.push(`- **Policies reaching it:** ${m.targetable ? `${m.counts.reach} — ${m.counts.on} on, ${m.counts.ro} report-only, ${m.counts.off} off` : "none can — Conditional Access cannot target this kind"}`);
    L.push(`- **Sign-ins (${e(meta.rangeLabel || "window")}):** ${m.total} to ${m.resources.length} resource(s), ${m.stopped} stopped by CA, ${m.failed} failed${meta.source ? ` — source: ${e(meta.source)}` : ""}`);
    m.callouts.forEach((c) => L.push(`- ${e(c.text)}`));
    L.push("", "## Workload identity policies", "", "| Policy | State | How it reaches | Result on its sign-ins |", "|---|---|---|---|");
    m.rows.filter((r) => r.s !== "na").forEach((r) => L.push(`| ${e(r.seq || r.name)} | ${STATE_LABEL[r.state]} | ${e(r.how)} | ${m.hunting ? "not in the hunting source" : r.res ? Object.entries(r.res).map(([k, n]) => `${RES_LABEL[k] || k} ×${n}`).join(", ") : "none"} |`));
    L.push("");
    if (m.ips && m.ips.rows.length) L.push(...WhoIs.ipsMd(m.ips, "it", e));
    if (m.resources.length) {
      L.push("## Resources it signs in to", "", "| Resource | Sign-ins | Stopped | Failed | Last |", "|---|---|---|---|---|");
      m.resources.forEach((r) => L.push(`| ${e(r.name)} | ${r.n} | ${r.stopped || ""} | ${r.failed || ""} | ${e(r.last)} |`));
    }
    return L.join("\n");
  }

  return { analyze, render, toMd, huntQuery, fromHunting };
})();
