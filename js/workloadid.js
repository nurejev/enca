// ======================================================================
// 🤖 Workload identities — do the service-principal policies ever fire?
// (R46, T47, beta 32406) — a tab of 🚦 Sign-in log.
//
// Conditional Access for workload identities targets service principals
// (conditions.clientApplications), and its evidence is in a sign-in log of
// its own. Microsoft Learn (workload-identity, read 2026-09-24):
//   • only SINGLE-TENANT service principals registered in this tenant can
//     be targeted; Microsoft and third-party SaaS apps, multitenant apps and
//     managed identities are not covered
//   • a service principal reached through a GROUP is not enforced — it must
//     be assigned directly as a workload identity
//   • creating or changing such a policy needs Workload Identities Premium;
//     existing ones keep working without it
//
// Two sources, one row shape:
//   Entra log (default) — GET /beta/auditLogs/signIns filtered to the
//     servicePrincipal / managedIdentity event types: one record per
//     sign-in, WITH appliedConditionalAccessPolicies, so it names the policy
//     that blocked and what a report-only policy would have done.
//   Defender hunting (optional) — EntraIdSpnSignInEvents (AADSpnSignInEventsBeta
//     before 19 Oct 2026), summarised per principal × IP × country. 30 days
//     and cheap, but the table has NO Conditional Access columns: a block is
//     only error 53003, never a policy name, and there is no forecast.
//
//   WorkloadId.targets(raw)                          → scope of one policy
//   WorkloadId.fromGraph(records) / fromHunting(rows) → rows
//   WorkloadId.huntQuery(table, from, to)             → KQL
//   WorkloadId.analyze({ policies, rows, sps, tenantId, locations, … })
//   WorkloadId.render(m, o) / chips(m, f) / toMd(m, tenant)
// ======================================================================
const WorkloadId = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const STATE = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };
  // tenants that own Microsoft's first-party applications
  const MS_OWNERS = new Set(["f8cdef31-a31e-4b4a-93e4-5f571e91255a", "72f988bf-86f1-41af-91ab-2d7cd011db47", "33e01921-4d64-4f8c-a055-5bdaffd5e33d"]);
  const KIND_LABEL = { single: "Single-tenant app", multiHere: "Multi-tenant app (registered here)", multi: "Multi-tenant app", mi: "Managed identity", microsoft: "Microsoft app", unknown: "Not read" };
  const TARGETABLE = new Set(["single"]);
  const LEARN_URL = "https://learn.microsoft.com/entra/identity/conditional-access/workload-identity";

  // ---- scope ---------------------------------------------------------------
  function targets(p) {
    const ca = ((p && p.conditions) || {}).clientApplications || {};
    const inc = ca.includeServicePrincipals || [], exc = ca.excludeServicePrincipals || [];
    if (!inc.length && !ca.servicePrincipalFilter) return null;
    return { all: inc.includes("ServicePrincipalsInMyTenant"), include: inc.filter((x) => x !== "ServicePrincipalsInMyTenant"), exclude: exc,
      filter: ca.servicePrincipalFilter ? { mode: ca.servicePrincipalFilter.mode, rule: ca.servicePrincipalFilter.rule } : null };
  }
  // true / false, or null when an attribute filter decides (not evaluated here)
  function inScope(t, sp, kind) {
    if (!t) return false;
    const ids = [sp.id, sp.appId].filter(Boolean);
    if (t.exclude.some((x) => ids.includes(x))) return false;
    const named = t.include.some((x) => ids.includes(x));
    const byAll = t.all && (kind === "single" || kind === "multiHere" || kind === "unknown");
    if (!named && !byAll) return false;
    return t.filter ? null : true;
  }

  // ---- sources -------------------------------------------------------------
  function fromGraph(records) {
    return (records || []).map((r) => ({
      spId: r.servicePrincipalId || "", appId: r.appId || "", name: r.servicePrincipalName || r.appDisplayName || r.servicePrincipalId || "",
      mi: (r.signInEventTypes || []).includes("managedIdentity") || !!(r.managedServiceIdentity && r.managedServiceIdentity.msiType && r.managedServiceIdentity.msiType !== "none"),
      ip: r.ipAddress || "", country: ((r.location || {}).countryOrRegion) || "", n: 1,
      blocked: (r.status && r.status.errorCode === 53003) || r.conditionalAccessStatus === "failure" ? 1 : 0,
      failed: r.status && r.status.errorCode ? 1 : 0, last: r.createdDateTime || null, resource: r.resourceDisplayName || "",
      policies: (r.appliedConditionalAccessPolicies || []).map((x) => ({ id: x.id, result: x.result })),
    }));
  }
  function fromHunting(rows) {
    const b = (v) => v === true || v === 1 || /^(true|1)$/i.test(String(v));
    return (rows || []).map((r) => ({
      spId: r.ServicePrincipalId || "", appId: r.ApplicationId || "", name: r.name || r.ServicePrincipalName || r.ServicePrincipalId || "",
      mi: b(r.mi), ip: r.IPAddress || "", country: r.Country || "", n: +r.n || 0, blocked: +r.blocked || 0, failed: +r.failed || 0,
      last: r.last || null, resource: "", policies: null,
    }));
  }
  function huntQuery(table, from, to) {
    return `${table || "EntraIdSpnSignInEvents"}
| where Timestamp between (datetime(${from}) .. datetime(${to}))
| summarize n = count(), blocked = countif(ErrorCode == 53003), failed = countif(ErrorCode != 0), last = max(Timestamp), name = take_any(ServicePrincipalName), mi = max(iff(tostring(IsManagedIdentity) in~ ("true", "1"), 1, 0)) by ServicePrincipalId, ApplicationId, IPAddress, Country
| take 20000`;
  }

  // ---- places --------------------------------------------------------------
  function placeTest(locations, inCidr) {
    const ranges = [], countries = new Set();
    for (const l of locations || []) {
      const t = String(l["@odata.type"] || "").toLowerCase();
      if (t.includes("country")) (l.countriesAndRegions || []).forEach((c) => countries.add(String(c).toUpperCase()));
      else if (!t.includes("compliantnetwork")) (l.ipRanges || []).forEach((r) => r.cidrAddress && ranges.push(r.cidrAddress));
    }
    const any = ranges.length > 0 || countries.size > 0;
    return { any, inside: (ip, cc) => (!!ip && ranges.some((c) => inCidr(ip, c))) || (!!cc && countries.has(String(cc).toUpperCase())) };
  }

  function kindOf(sp, mi, tenantId) {
    if (mi || (sp && /managedidentity/i.test(String(sp.servicePrincipalType || "")))) return "mi";
    if (!sp) return "unknown";
    const owner = sp.appOwnerOrganizationId || "";
    if (MS_OWNERS.has(owner)) return "microsoft";
    if (tenantId && owner && owner !== tenantId) return "multi";
    // owned here: single-tenant unless the application says otherwise (an
    // unread audience counts as single — the scope check is the portal's)
    if (tenantId && owner === tenantId) return sp.signInAudience && sp.signInAudience !== "AzureADMyOrg" ? "multiHere" : "single";
    return "unknown";
  }

  function analyze(input) {
    const I = input || {};
    const raws = I.policies || [];
    const pols = raws.map((p) => ({ id: p.id, name: p.displayName || "(unnamed)", state: STATE[p.state] || "off", t: targets(p) })).filter((p) => p.t);
    const sps = I.sps || {};
    const place = placeTest(I.locations, I.inCidr || (() => false));
    const by = new Map();
    for (const r of I.rows || []) {
      const key = r.spId || r.appId || r.name;
      if (!by.has(key)) by.set(key, { id: r.spId, appId: r.appId, name: r.name, mi: false, n: 0, blocked: 0, failed: 0, outside: 0, last: null, ips: new Set(), countries: new Map(), pol: new Map(), resources: new Set() });
      const s = by.get(key);
      s.mi = s.mi || r.mi; s.n += r.n; s.blocked += r.blocked; s.failed += r.failed;
      if (r.ip) s.ips.add(r.ip);
      if (r.country) s.countries.set(r.country, (s.countries.get(r.country) || 0) + r.n);
      if (r.resource) s.resources.add(r.resource);
      if (place.any && !place.inside(r.ip, r.country)) s.outside += r.n;
      if (r.last && (!s.last || r.last > s.last)) s.last = r.last;
      if (r.policies) for (const x of r.policies) {
        if (!s.pol.has(x.id)) s.pol.set(x.id, {});
        const c = s.pol.get(x.id); c[x.result] = (c[x.result] || 0) + r.n;
      }
    }
    // principals a policy names that never signed in still belong on the list
    for (const p of pols) for (const id of p.t.include) if (![...by.values()].some((s) => s.id === id || s.appId === id)) {
      const sp = sps[id];
      by.set(id, { id, appId: sp && sp.appId, name: (sp && sp.displayName) || id, mi: false, n: 0, blocked: 0, failed: 0, outside: 0, last: null, ips: new Set(), countries: new Map(), pol: new Map(), resources: new Set(), namedOnly: true });
    }
    const list = [...by.values()].map((s) => {
      const sp = sps[s.id] || (s.appId && Object.values(sps).find((x) => x.appId === s.appId)) || null;
      const kind = kindOf(sp, s.mi, I.tenantId);
      const scoped = pols.map((p) => ({ p, v: inScope(p.t, { id: s.id, appId: s.appId }, kind) })).filter((x) => x.v !== false);
      const on = scoped.filter((x) => x.p.state === "on"), ro = scoped.filter((x) => x.p.state === "ro");
      let verdict;
      if (!TARGETABLE.has(kind) && kind !== "unknown") verdict = "cannot";
      else if (s.blocked && on.length) verdict = "blocked";
      else if (on.length) verdict = scoped.some((x) => x.v === null) ? "filter" : "covered";
      else if (ro.length) verdict = "ro";
      else verdict = kind === "unknown" ? "unknown" : "untargeted";
      return { id: s.id, appId: s.appId, name: (sp && sp.displayName) || s.name, kind, n: s.n, blocked: s.blocked, failed: s.failed, outside: s.outside, last: s.last,
        ips: s.ips.size, countries: [...s.countries.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c), resources: [...s.resources].slice(0, 5),
        policies: scoped.map((x) => ({ id: x.p.id, name: x.p.name, state: x.p.state, byFilter: x.v === null })), pol: s.pol, verdict, namedOnly: !!s.namedOnly };
    });
    const ORDER = { blocked: 0, untargeted: 1, ro: 2, filter: 3, covered: 4, unknown: 5, cannot: 6 };
    list.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || b.outside - a.outside || b.n - a.n);
    // per policy
    const cards = pols.map((p) => {
      const hit = list.filter((s) => s.policies.some((x) => x.id === p.id));
      const res = { failure: 0, success: 0, reportOnlyFailure: 0, reportOnlySuccess: 0, notApplied: 0 };
      for (const s of list) { const c = s.pol.get(p.id); if (c) for (const k of Object.keys(c)) res[k] = (res[k] || 0) + c[k]; }
      return { ...p, principals: hit.length, signingIn: hit.filter((s) => s.n).length, signIns: hit.reduce((a, s) => a + s.n, 0), res,
        cannot: p.t.include.filter((id) => { const s = list.find((x) => x.id === id || x.appId === id); return s && s.kind !== "single" && s.kind !== "unknown"; }).length };
    });
    const visible = I.showMicrosoft ? list : list.filter((s) => s.kind !== "microsoft");
    const counts = { all: visible.length };
    for (const s of visible) counts[s.verdict] = (counts[s.verdict] || 0) + 1;
    return { list: visible, hiddenMicrosoft: list.length - visible.length, cards, counts, policies: pols.length,
      signedIn: visible.filter((s) => s.n).length,
      // named by a policy but not enforceable (a managed identity, say) is not "in scope"
      inScope: visible.filter((s) => s.policies.length && s.n && s.verdict !== "cannot").length,
      blocked: visible.reduce((a, s) => a + s.blocked, 0), unreachableOutside: visible.filter((s) => s.verdict === "cannot" && s.outside).length,
      untargetedOutside: visible.filter((s) => s.verdict === "untargeted" && s.outside).length,
      placesKnown: place.any, source: I.source || "graph", days: I.days || 0, capped: !!I.capped, notes: I.notes || [], demo: !!I.demo };
  }

  // ---- render --------------------------------------------------------------
  const V = {
    blocked: ["xt-high", "Blocked"], untargeted: ["xt-medium", "Reachable, not targeted"], ro: ["xt-medium", "Report-only only"],
    filter: ["xt-info", "In scope if the attribute filter matches"], covered: ["tc-on", "Covered, applied"], unknown: ["xt-info", "Kind not read"], cannot: ["wl-na", "Cannot be targeted"],
  };
  const FILTERS = [["all", "All"], ["blocked", "Blocked"], ["untargeted", "Not targeted"], ["ro", "Report-only only"], ["covered", "Covered"], ["cannot", "Cannot be targeted"]];
  function chips(m, f) {
    return FILTERS.map(([k, l]) => { const n = m.counts[k] || 0; return (n || k === "all" || k === f) ? `<button class="fchip ${f === k ? "active" : ""}" data-wlf="${k}">${l} (${n})</button>` : ""; }).join("");
  }
  const when = (t) => t ? new Date(t).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  function render(m, o) {
    const f = (o && o.filter) || "all";
    const t = (cls, label, n) => `<div class="xt-tile ${cls}"><span class="mini">${label}</span><b>${n}</b></div>`;
    const tiles = `<div class="xt-tiles wl-tiles">${t("", "Policies target workload identities", m.policies)}${t("", "Service principals signed in", m.signedIn)}${t("", "…in a policy's scope", m.inScope)}${t(m.blocked ? "h" : "", m.source === "hunting" ? "Blocked by CA (53003)" : "Sign-ins blocked by a policy", m.blocked.toLocaleString())}${t(m.untargetedOutside ? "m" : "", "Targetable, not targeted, outside named locations", m.untargetedOutside)}</div>`;
    const list = m.list.filter((s) => f === "all" || s.verdict === f);
    const polCell = (s) => s.policies.length ? s.policies.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span> <span class="mini muted">${STATE_LABEL[p.state]}${p.byFilter ? " · filter" : ""}</span>`).join("<br>") : '<span class="muted">—</span>';
    const table = `<div class="list-card xt-card"><h3>Service principals <span class="mini">— ${m.days} day${m.days === 1 ? "" : "s"} · ${m.source === "hunting" ? "Defender hunting" : "Entra log"}${m.hiddenMicrosoft ? ` · ${m.hiddenMicrosoft} Microsoft app${m.hiddenMicrosoft === 1 ? "" : "s"} hidden` : ""}</span></h3>${list.length ? `<div class="xt-tw"><table class="xt-tbl wl-tbl">
      <thead><tr><th>Service principal</th><th>Kind</th><th>Sign-ins</th><th>${m.placesKnown ? "Outside named locations" : "IPs · countries"}</th><th>Last</th><th>Policies</th><th>Verdict</th></tr></thead>
      <tbody>${list.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.appId ? `<br><span class="mini muted xt-id">${esc(s.appId)}</span>` : ""}${s.namedOnly ? '<br><span class="mini muted">named by a policy, no sign-in in the window</span>' : ""}</td>
        <td class="mini">${esc(KIND_LABEL[s.kind])}</td><td>${s.n.toLocaleString()}${s.failed ? `<br><span class="mini muted">${s.failed.toLocaleString()} failed</span>` : ""}</td>
        <td class="mini">${m.placesKnown ? `${s.outside.toLocaleString()}${s.countries.length ? ` · ${esc(s.countries.slice(0, 3).join(", "))}` : ""}` : `${s.ips} · ${esc(s.countries.slice(0, 3).join(", "))}`}</td>
        <td class="mini">${when(s.last)}</td><td class="mini">${polCell(s)}</td>
        <td><span class="xt-pill ${V[s.verdict][0]}">${V[s.verdict][1]}${s.verdict === "blocked" ? ` ${s.blocked.toLocaleString()}×` : ""}</span></td></tr>`).join("")}</tbody></table></div>` : '<p class="mini">Nothing of this kind in the window.</p>'}</div>`;
    const cards = m.cards.length ? `<div class="list-card xt-card"><h3>Per policy</h3>${m.cards.map((c) => `<div class="xt-f"><span class="xt-pill ${c.state === "on" ? "tc-on" : c.state === "ro" ? "tc-ro" : "wl-na"}">${STATE_LABEL[c.state]}</span><div>
        <b class="pol-link" data-polid="${esc(c.id)}">${esc(c.name)}</b>
        <p>${c.t.all ? "All service principals owned by this tenant" : `${c.t.include.length} named service principal${c.t.include.length === 1 ? "" : "s"}`}${c.t.exclude.length ? `, ${c.t.exclude.length} excluded` : ""}${c.t.filter ? `, attribute filter (${esc(c.t.filter.mode)})` : ""}. ${c.principals} principal${c.principals === 1 ? "" : "s"} in scope, ${c.signingIn} signed in (${c.signIns.toLocaleString()} sign-ins).
        ${m.source === "graph" ? ` Blocked ${c.res.failure || 0}×${c.state === "ro" ? `; as report-only it WOULD have blocked ${c.res.reportOnlyFailure || 0}× and let ${c.res.reportOnlySuccess || 0} through` : ""}.` : " Which policy blocked is not in the hunting table — switch to the Entra log for per-policy results."}
        ${c.cannot ? ` ${c.cannot} of the principals it names cannot be targeted (managed identity, Microsoft or multi-tenant app) — the policy does nothing for them.` : ""}</p></div></div>`).join("")}</div>`
      : `<div class="list-card xt-card"><h3>Per policy</h3><p class="mini">No policy targets workload identities. Every service principal below signs in with no Conditional Access at all — Workload Identities Premium is needed to create one.</p></div>`;
    const notes = `<p class="mini muted">${m.notes.length ? esc(m.notes.join(" · ")) + " · " : ""}${m.capped ? "The window was CAPPED — counts are lower bounds. " : ""}Only single-tenant service principals registered in this tenant can be targeted; managed identities, Microsoft apps and multi-tenant apps cannot, and a service principal reached through a group is not enforced (<a href="${LEARN_URL}" target="_blank" rel="noopener">Microsoft Learn</a>). Read-only.</p>`;
    return tiles + table + cards + notes + (m.demo ? '<p class="mini muted">Demo data — example service principals, not a real tenant.</p>' : "");
  }
  function toMd(m, tenant) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const L = [`# Workload identity Conditional Access — ${tenant || "tenant"}`, "", `${m.days} days · ${m.source === "hunting" ? "Defender hunting" : "Entra log"}${m.capped ? " (CAPPED)" : ""} · ${m.policies} policies · ${m.signedIn} service principals signed in${m.demo ? " (demo)" : ""}`, "",
      "| Service principal | Kind | Sign-ins | Outside named locations | Policies | Verdict |", "| --- | --- | --- | --- | --- | --- |"];
    for (const s of m.list) L.push(`| ${e(s.name)} | ${KIND_LABEL[s.kind]} | ${s.n} | ${s.outside} | ${e(s.policies.map((p) => `${p.name} (${STATE_LABEL[p.state]})`).join("; ") || "—")} | ${V[s.verdict][1]}${s.verdict === "blocked" ? ` ${s.blocked}` : ""} |`);
    L.push("", "## Per policy", "");
    if (!m.cards.length) L.push("No policy targets workload identities.");
    for (const c of m.cards) L.push(`- ${c.name} (${STATE_LABEL[c.state]}): ${c.principals} in scope, ${c.signingIn} signed in${m.source === "graph" ? `, blocked ${c.res.failure || 0}, report-only would block ${c.res.reportOnlyFailure || 0}` : ""}${c.cannot ? `, ${c.cannot} named principals cannot be targeted` : ""}`);
    return L.join("\n");
  }
  return { targets, inScope, fromGraph, fromHunting, huntQuery, kindOf, analyze, render, chips, toMd, KIND_LABEL, MS_OWNERS };
})();
