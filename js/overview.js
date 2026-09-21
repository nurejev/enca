// ======================================================================
// Overview — the home page, once a tenant is loaded. Beta 25419, queue 241.
//
// The constraint that shapes it: at sign-in ENCA holds the policy set and
// nothing else. So everything here is one of three things — pure over the
// loaded policies (free, instant, honest as long as it says "configured"),
// the catalog comparison that already runs at sign-in, or the LAST RESULT of
// an on-demand tool carrying the run it came from (js/runmeta.js). Anything
// that needs a tenant-wide membership read stays behind its Run button,
// which is where this app has always kept it; a home page that reads the
// tenant fourteen times before it shows anything is a different product.
//
//   Overview.header(d)   the snapshot header: the four state counts, and the
//                        loading / failed / empty status when there is one (25422)
//   Overview.lead(d)     the one-line lead under the page title (25422)
//   Overview.tenant(d)   what the policy set shows: report-only age, recent
//                        change, baseline match, exclusion references, advisories
//   Overview.worth(w)    the ranked findings the loaded policy set shows (25420)
//   Overview.checks(rows) one compact row per on-demand tool (25422 — the
//                        25419 cards, folded to a line each)
//
// Pure over their arguments: the app builds `d` and `cards` from its state.
// ======================================================================
const Overview = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const DAY = 86400000;

  // The dated retirements the temporary tools exist for. A published date is
  // a fact about Microsoft, not about this tenant: each advisory carries its
  // source and the day it was checked, and the tenant impact stays "not
  // assessed" until the tool behind it has run (25421).
  const DEADLINES = [
    { tool: "toolSmsVoice", icon: "📵", label: "Microsoft-provided SMS & voice delivery", short: "SMS/voice",
      cohorts: [
        { who: "most users, internal guests included", at: "2027-02-01T00:00:00Z" },
        { who: "Global Administrators and external users", at: "2027-07-01T00:00:00Z" },
      ],
      note: "passkeys auto-enabled for SMS/voice users since 1 September 2026",
      source: "https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement", verified: "2026-09-21" },
    { tool: "toolMemberOf", icon: "🧷", label: "memberOf in dynamic membership rules", short: "memberOf",
      cohorts: [{ who: "rules that still use it stop updating", at: "2026-11-03T00:00:00Z" }],
      note: "",
      source: "https://learn.microsoft.com/entra/identity/users/groups-dynamic-rule-member-of", verified: "2026-09-21" },
  ];

  const daysUntil = (iso, now) => Math.ceil((new Date(iso).getTime() - now) / DAY);
  const ago = (t, now) => {
    if (!t) return "";
    const d = Math.floor((now - new Date(t).getTime()) / DAY);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };

  // `d` = { tenantName, isDemo, snapshot, policies: [{name, state, modified}],
  //         baseline: {label, missing, outdated, conflict, coverage} | null,
  //         exclusions: {entities, byKind:{user,group,role,guest,app,...}, policies} | null,
  //         now }
  function tenant(d) {
    const now = d.now || Date.now();
    const pols = d.policies || [];
    const st = { on: 0, ro: 0, off: 0 };
    pols.forEach((p) => { if (p.state === "enabled") st.on++; else if (p.state === "enabledForReportingButNotEnforced") st.ro++; else st.off++; });
    const changed = pols.filter((p) => p.modified && now - new Date(p.modified).getTime() <= 30 * DAY)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    // A policy without a date is not evidence of no change: it is counted
    // apart, never folded into "nothing modified" (25421).
    const undated = pols.filter((p) => !p.modified).length;
    // "30+ days" is measured on the last modification — the app does not
    // know when a policy ENTERED report-only, only when it was last touched,
    // and the tile says exactly that.
    const ro = pols.filter((p) => p.state === "enabledForReportingButNotEnforced");
    const roStale = ro.filter((p) => p.modified && now - new Date(p.modified).getTime() > 30 * DAY).length;
    const roUndated = ro.filter((p) => !p.modified).length;
    const tile = (cls, num, label, sub, tool) => `<div class="db-tile${cls ? " " + cls : ""}${tool ? " clickable" : ""}"${tool ? ` data-ovtool="${esc(tool)}" role="button" tabindex="0"` : ""}><div class="n" title="${esc(String(num).replace(/<[^>]+>/g, ""))}">${num}</div><div class="l">${esc(label)}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
    // The policy counts themselves live in the workspace's Current snapshot
    // panel beside this band; these tiles say what that panel does not.
    const tiles = [
      tile(st.ro ? "warn" : "", n(st.ro), "report-only", st.ro
        ? [roStale ? `${roStale} last modified 30+ days ago` : "", roUndated ? `date unavailable for ${roUndated}` : "", !roStale && !roUndated ? "all modified within 30 days" : ""].filter(Boolean).join(" · ")
        : "nothing staged", "toolSignins"),
      tile("", n(changed.length), "modified in 30 days", [
        changed.length ? `last: ${esc(changed[0].name)}, ${ago(changed[0].modified, now)}` : (undated < pols.length ? "no dated policy modified in 30 days" : ""),
        undated ? `date unavailable for ${undated}` : "",
      ].filter(Boolean).join(" · ") || "no dates available", "toolAudit"),
      d.baseline
        ? tile(d.baseline.missing || d.baseline.outdated || d.baseline.conflict ? "warn" : "ok", esc(d.baseline.label), "baseline match",
            `${n(d.baseline.missing)} missing · ${n(d.baseline.outdated)} outdated · ${n(d.baseline.conflict)} in conflict · ${n(d.baseline.coverage)}% covered`, "toolBaseline")
        : tile("", "—", "baseline match", "no catalog matched", "toolBaseline"),
      d.exclusions
        ? tile("", n(d.exclusions.entities), "unique exclusion references",
            `${exclusionKinds(d.exclusions.byKind) || "none"}${d.exclusions.policies ? ` in ${n(d.exclusions.policies)} polic${d.exclusions.policies === 1 ? "y" : "ies"}` : ""} — configured, not effective`, "toolExclusions")
        : "",
    ].join("");
    const deadlines = DEADLINES.map((x) => advisory(x, (d.impact || {})[x.tool], now)).join("");
    const advSummary = DEADLINES.map((x) => `${x.icon} ${esc(x.short || x.label)} ${x.cohorts.map((c) => esc(new Date(c.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))).join(" / ")}`).join(" · ");
    return `<div class="db-band">
      <h3>What the policy set shows <span class="mini muted">— configuration, read from the loaded policies; nothing here is a measure of who is protected</span></h3>
      <div class="db-tiles">${tiles}</div>
      <details class="db-advs"${d.advisoriesOpen ? " open" : ""}><summary>Upcoming changes <span class="mini muted">· ${advSummary}</span></summary><div class="db-deads">${deadlines}</div></details>
    </div>`;
  }

  // Every kind Exclusions.collect can produce, so the breakdown adds up to
  // the tile's number (25421: locations and platforms were left out and the
  // subtitle summed to less than the total).
  const KIND_WORD = [["user", "user"], ["group", "group"], ["role", "role"], ["guest", "external clause"], ["app", "app"], ["location", "named location"], ["platform", "device platform"]];
  function exclusionKinds(byKind) {
    byKind = byKind || {};
    const known = KIND_WORD.filter(([k]) => byKind[k]).map(([k, w]) => `${byKind[k]} ${w}${byKind[k] === 1 ? "" : "s"}`);
    const other = Object.keys(byKind).filter((k) => !KIND_WORD.some(([kk]) => kk === k)).reduce((a, k) => a + byKind[k], 0);
    if (other) known.push(`${other} other reference${other === 1 ? "" : "s"}`);
    return known.join(" · ");
  }
  // One advisory: the published cohorts and dates, the source and when it
  // was checked, and what THIS tenant shows — "not assessed" until the tool
  // has run. `impact` = { text } from the app, or nothing.
  function advisory(x, impact, now) {
    const when = (iso) => {
      const days = daysUntil(iso, now);
      const date = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      return days > 0 ? `in <b>${days} day${days === 1 ? "" : "s"}</b> (${esc(date)})` : days === 0 ? `<b>today</b> (${esc(date)})` : `<b>${-days} day${days === -1 ? "" : "s"} ago</b> (${esc(date)})`;
    };
    const soon = x.cohorts.some((c) => daysUntil(c.at, now) <= 60);
    return `<div class="db-adv${soon ? " soon" : ""}">
      <div class="db-adv-h">${x.icon} <b>${esc(x.label)}</b> <span class="mini muted">published advisory · <a href="${esc(x.source)}" target="_blank" rel="noopener">Microsoft</a>, checked ${esc(x.verified)}</span></div>
      <div class="db-adv-c">${x.cohorts.map((c) => `<span>${esc(c.who)}: ${when(c.at)}</span>`).join("")}${x.note ? `<span class="mini muted">${esc(x.note)}</span>` : ""}</div>
      <div class="db-adv-i">tenant impact: ${impact && impact.text ? `<b>${esc(impact.text)}</b>` : `<span class="db-na">not assessed</span>`} <button type="button" class="fchip" data-ovtool="${esc(x.tool)}">${impact && impact.text ? "Open" : "Assess"}</button></div>
    </div>`;
  }

  // ---- the snapshot header (25422) ----
  // d = { tenantName, isDemo, snapshot, counts: {total, on, report, off},
  //       status: { kind: loading|failed|empty|loaded, at, message, since } }
  // The four counts are the one thing every viewport keeps; each opens the
  // policy list filtered to that state. The status line exists only when
  // there is something to say beyond "loaded".
  function header(d) {
    const c = d.counts || { total: 0, on: 0, report: 0, off: 0 };
    const tile = (k, num, label, sub) => `<button type="button" class="db-count" data-ovstate="${k}"><b>${n(num)}</b><span>${esc(label)}</span><small>${esc(sub)}</small></button>`;
    const st = d.status || { kind: "loaded" };
    const t = (v) => v ? esc(new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : "";
    let status = "";
    if (st.kind === "loading") status = `<div class="db-status loading" role="status">Reading policies…${st.since ? ` The snapshot from ${t(st.since)} stays until the read completes.` : ""}</div>`;
    else if (st.kind === "failed") status = `<div class="db-status failed" role="alert">Policies could not be re-read at ${t(st.at)}${st.message ? ` — ${esc(st.message)}` : ""}.${st.since ? ` Showing the snapshot read at ${t(st.since)}.` : ""} <button type="button" class="fchip" data-ovrefresh>Retry</button></div>`;
    else if (st.kind === "empty") status = `<div class="db-status empty" role="status">0 policies loaded${d.tenantName ? ` from ${esc(d.tenantName)}` : ""}${d.snapshot ? ` at ${t(d.snapshot)}` : ""} — the tenant has no Conditional Access policies, or this account cannot read them. <button type="button" class="fchip" data-ovrefresh>Read again</button> <button type="button" class="fchip" data-ovtool="toolBaseline">Start from a baseline</button> <button type="button" class="fchip" data-ovtool="toolImport">Import</button></div>`;
    return `<div class="db-head">
      <div class="db-counts">${tile("all", c.total, "Policies loaded", "current snapshot")}${tile("on", c.on, "Enabled", "configured to enforce")}${tile("report", c.report, "Report-only", "evaluation only")}${tile("off", c.off, "Off", "not enforcing")}</div>
      ${status}
    </div>`;
  }
  // The one-line lead under the page title: what was read and when, and that
  // detail comes from each check's own run.
  function lead(d) {
    if (!d.snapshot) return "";
    const when = new Date(d.snapshot).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return `Policies read ${when}${d.isDemo ? " (demo data)" : ""} · details come from each check’s own run.`;
  }

  // ---- Your checks (25422): one compact row per on-demand tool ----
  // rows = [{ tool, icon, label, what, headline: {n, unit} | null, meta, stale, never, run, runLabel }]
  function checks(rows) {
    const t = (v) => esc(new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    const row = (c) => {
      let state, cls = "";
      if (c.never) state = "Not run this session";
      else if (c.stale) { state = `Previous snapshot · run #${esc(c.meta.id)} at ${t(c.meta.at)} — policies reloaded since`; cls = " stale"; }
      else { state = `<b>${esc(c.headline.n)}</b> ${esc(c.headline.unit)} · run #${esc(c.meta.id)} at ${t(c.meta.at)} · ${esc(c.meta.completeness)}`; if (/partial|incomplete|stopped/i.test(c.meta.completeness || "")) cls = " partial"; }
      return `<div class="db-check${cls}${c.never ? " never" : ""}">
        <div class="t">${c.icon} ${esc(c.label)}<small>${esc(c.what || "")}</small></div>
        <div class="s">${state}</div>
        <div class="a">${c.never ? "" : `<button type="button" class="fchip" data-ovtool="${esc(c.tool)}">Open</button>`}<button type="button" class="fchip${c.stale ? " active" : ""}" data-ovrun="${esc(c.run)}">${esc(c.never ? "Run check" : c.stale ? "Run again" : c.runLabel || "Run again")}</button></div>
      </div>`;
    };
    return `<div class="db-band">
      <h3>Your checks <span class="mini muted">— on demand; each result carries the run it came from</span></h3>
      <div class="db-checks">${rows.map(row).join("")}</div>
    </div>`;
  }

  // ---- Worth a look first (25420) ----
  // w = { items: [{ sev, icon, text, sub, tool, tab }], provisional: string|null,
  //       zt: {overall, at}|null — only from a 🛡 run whose context was read;
  //       a provisional pass shows "partial", never a number (25421) }
  // The items are RANKED by the app (severity, then tool) and capped there;
  // this only draws them. Every line is a button into the tool that owns the
  // finding, and the band never says more than the finding does.
  const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
  function worth(w) {
    const items = w.items || [];
    const line = (x) => `<button type="button" class="db-worth sev-${esc(x.sev)}" data-ovtool="${esc(x.tool)}"${x.tab ? ` data-ovtab="${esc(x.tab)}"` : ""}>
      <span class="sv">${esc(SEV[x.sev] || x.sev)}</span>
      <span class="tx">${esc(x.text)}${x.sub ? ` <span class="mini muted">— ${esc(x.sub)}</span>` : ""}</span>
      <span class="to mini">${x.icon || ""} ${esc(x.toolLabel || "")} ›</span>
    </button>`;
    const empty = `<div class="db-worth-empty mini muted">Nothing critical or high in the loaded policy set${w.provisional ? " on a first pass" : ""} — the tools below go deeper than this band can.</div>`;
    return `<div class="db-band">
      <h3>Worth a look first <span class="mini muted">— the highest-severity findings the loaded policies show · ${w.zt ? `configuration score ${esc(w.zt.overall)}/100 from the 🛡 run${w.zt.at ? ` at ${esc(w.zt.at)}` : ""} — findings, not effective protection` : `<span class="db-na">configuration checks — partial</span>`}</span></h3>
      <div class="db-worths">${items.length ? items.map(line).join("") : empty}</div>
      ${w.provisional ? `<div class="db-worth-note mini muted">${esc(w.provisional)}</div>` : ""}
    </div>`;
  }

  return { header, lead, tenant, checks, worth, DEADLINES, exclusionKinds };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { Overview };
