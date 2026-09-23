// ======================================================================
// Overview — the home page, once a tenant is loaded. Beta 25419, queue 241.
//
// The overview reuses the policy set and context already read at sign-in.
// It presents local calculations, the existing catalog comparison, or the
// last result of
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
//   Overview.worth(w, o) the ranked findings the loaded policy set shows (25420),
//                        each opening its evidence in place (25423)
//   Overview.checks(rows) one compact row per on-demand tool (25422 — the
//                        25419 cards, folded to a line each)
//   Overview.map(m)      the configuration map, folded: review queue, recent
//                        change, controls by state, snapshot context, the diff
//                        since the previous refresh (25424)
//
// Pure over their arguments: the app builds `d` and `cards` from its state.
// ======================================================================
const Overview = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const DAY = 86400000;
  const icon = (tool, fallback) => typeof FlatIcons !== "undefined" ? FlatIcons.tool(tool) : esc(fallback || "");

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
    // `tool` is a tool id, or "state:report" for the policy list filtered to
    // that state (25423: a policy count opens the policies it counts);
    // `also` = { tool, label } is a second, smaller action on the tile
    const tile = (cls, num, label, sub, tool, also) => {
      const target = !tool ? "" : tool.startsWith("state:") ? ` data-ovstate="${esc(tool.slice(6))}"` : ` data-ovtool="${esc(tool)}"`;
      const tag = tool ? "button" : "div";
      return `<div class="db-tile${cls ? " " + cls : ""}"><${tag} class="db-tile-main"${tool ? ` type="button"${target}` : ""}><span class="n">${num}</span><span class="l">${esc(label)}</span>${sub ? `<span class="s">${sub}</span>` : ""}</${tag}>${also ? `<button type="button" class="db-also" data-ovtool="${esc(also.tool)}">${esc(also.label)} ›</button>` : ""}</div>`;
    };
    // State totals live in the snapshot strip. These rows add context.
    const tiles = [
      tile(st.ro ? "warn" : "", n(st.ro), "Report-only", st.ro
        ? [roStale ? `${roStale} last modified 30+ days ago` : "", roUndated ? `date unavailable for ${roUndated}` : "", !roStale && !roUndated ? "all modified within 30 days" : ""].filter(Boolean).join(" · ")
        : "nothing staged", "state:report", { tool: "toolSignins", label: "validate with sign-ins" }),
      tile("", n(changed.length), "Modified in 30 days", [
        changed.length ? `last: ${esc(changed[0].name)}, ${ago(changed[0].modified, now)}` : (undated < pols.length ? "no dated policy modified in 30 days" : ""),
        undated ? `date unavailable for ${undated}` : "",
      ].filter(Boolean).join(" · ") || "no dates available", "state:all", { tool: "toolAudit", label: "who changed what" }),
      d.baseline
        ? tile(d.baseline.missing || d.baseline.outdated || d.baseline.conflict ? "warn" : "ok", esc(d.baseline.label), "Baseline match",
            `${n(d.baseline.missing)} missing · ${n(d.baseline.outdated)} outdated · ${n(d.baseline.conflict)} in conflict · ${n(d.baseline.coverage)}% of catalog matched`, "toolBaseline")
        : tile("", "—", "Baseline match", "no catalog matched", "toolBaseline"),
      d.exclusions
        ? tile("", n(d.exclusions.entities), "Unique exclusion references",
            `${exclusionKinds(d.exclusions.byKind) || "none"}${d.exclusions.policies ? ` in ${n(d.exclusions.policies)} polic${d.exclusions.policies === 1 ? "y" : "ies"}` : ""} — configured, not effective`, "toolExclusions")
        : "",
    ].join("");
    return `<aside id="ovContext" class="db-band db-context" aria-labelledby="ovContextHeading">
      <h3 id="ovContextHeading">Policy context</h3>
      <div class="db-tiles">${tiles}</div>
      <p class="db-context-note mini muted">Configuration from the loaded snapshot. Effective user impact needs a check.</p>
    </aside>${d.showAdvisories === false ? "" : advisories(d)}`;
  }

  // Published dates remain available without interrupting the review queue.
  function advisories(d = {}) {
    const deadlines = DEADLINES.map((x) => advisory(x, (d.impact || {})[x.tool], d.now || Date.now())).join("");
    const advSummary = DEADLINES.map((x) => `${esc(x.short || x.label)} ${x.cohorts.map((c) => esc(new Date(c.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))).join(" / ")}`).join(" · ");
    return `<details class="db-advs"${d.advisoriesOpen ? " open" : ""}><summary>Upcoming changes <span class="mini muted">· ${advSummary}</span></summary><div class="db-deads">${deadlines}</div></details>`;
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
      <div class="db-adv-h">${icon(x.tool, x.icon)} <b>${esc(x.label)}</b> <span class="mini muted">published advisory · <a href="${esc(x.source)}" target="_blank" rel="noopener">Microsoft</a>, checked ${esc(x.verified)}</span></div>
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
        <div class="t">${icon(c.tool, c.icon)} ${esc(c.label)}<small>${esc(c.what || "")}</small></div>
        <div class="s">${state}</div>
        <div class="a">${c.never ? "" : `<button type="button" class="fchip" data-ovtool="${esc(c.tool)}">Open</button>`}<button type="button" class="fchip${c.stale ? " active" : ""}" data-ovrun="${esc(c.run)}">${esc(c.never ? "Run check" : c.stale ? "Run again" : c.runLabel || "Run again")}</button></div>
      </div>`;
    };
    return `<section class="db-band db-check-section" aria-labelledby="ovChecksHeading">
      <h3 id="ovChecksHeading">Your checks <span class="mini muted">Run when needed</span></h3>
      <div class="db-checks">${rows.map(row).join("")}</div>
    </section>`;
  }

  // ---- Worth a look first (25420; findings with evidence 25423) ----
  // w = { items: [finding], provisional: string|null, zt: {overall, at}|null, snapshotAt }
  // finding = { id, source, sev, icon, toolLabel, tool, tab, text, sub,
  //             policyIds: [], evidence: {state, label, at, note},
  //             detail: {observed, next}, action: {label} }
  // opts = { showAll, open: finding id | null, policyOf(id) → view model | null }
  // The items are RANKED by the app (severity, then tool). Three show by
  // default; View all keeps the rest one press away. A line is a button
  // that opens the finding's evidence in place: what was observed, the
  // policies it names with their scope, grant logic and exclusions, the
  // evidence state and the observation time, and the action into the tool.
  const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
  const SHOW = 3;
  const EV_CLASS = { snapshot: "ok", partial: "warn", needed: "na", previous: "warn", failed: "bad" };
  const hhmm = (t) => t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  function evidenceChip(ev) {
    if (!ev) return "";
    return `<span class="db-ev ${EV_CLASS[ev.state] || "na"}" title="${esc(ev.note || "")}">${esc(ev.label)}${ev.at ? ` · ${esc(hhmm(ev.at))}` : ""}</span>`;
  }
  function worth(w, opts = {}) {
    const items = w.items || [];
    const shown = opts.showAll ? items : items.slice(0, SHOW);
    const line = (x) => {
      const open = opts.open === x.id;
      return `<div class="db-worth-wrap${open ? " open" : ""}"><button type="button" class="db-worth sev-${esc(x.sev)}" data-ovfind="${esc(x.id)}" aria-expanded="${open}">
      <span class="sv">${esc(SEV[x.sev] || x.sev)}</span>
      <span class="tx">${esc(x.text)}${x.sub ? ` <span class="mini muted">— ${esc(x.sub)}</span>` : ""}</span>
      ${evidenceChip(x.evidence)}
      <span class="to mini">${icon(x.tool, x.icon)} ${esc(x.toolLabel || "")} ${open ? "▴" : "▾"}</span>
    </button>${open ? evidence(x, opts) : ""}</div>`;
    };
    const empty = `<div class="db-worth-empty mini muted">Nothing critical or high in the loaded policy set${w.provisional ? " on a first pass" : ""} — the tools below go deeper than this band can.</div>`;
    const more = items.length > SHOW ? `<button type="button" class="db-more" data-ovshowall>${opts.showAll ? "Show the top three" : `View all ${items.length} findings`}</button>` : "";
    return `<section id="ovWorth" class="db-band db-findings" aria-labelledby="ovWorthHeading">
      <h3 id="ovWorthHeading">Worth a look first</h3>
      <p class="db-assessment mini muted">${w.zt ? `configuration score ${esc(w.zt.overall)}/100 from the 🛡 run${w.zt.at ? ` at ${esc(w.zt.at)}` : ""} — findings, not effective protection` : `<span class="db-na">configuration checks — partial</span>`}</p>
      <div class="db-worths">${shown.length ? shown.map(line).join("") : empty}</div>
      ${more}
      ${w.provisional ? `<details class="db-assessment-detail"><summary>About this assessment</summary><div class="db-worth-note mini muted">${esc(w.provisional)}</div></details>` : ""}
    </section>`;
  }
  // The evidence panel for one finding. Policy facts come from the view
  // models the app resolves (original names, scope, grant logic, exclusions);
  // a policy the snapshot no longer holds is said to be missing, not skipped.
  function evidence(x, opts) {
    const pols = (x.policyIds || []).map((id) => ({ id, p: opts.policyOf ? opts.policyOf(id) : null }));
    const list = (arr, max = 4) => { arr = arr || []; return arr.length ? esc(arr.slice(0, max).join(", ")) + (arr.length > max ? ` <span class="muted">+${arr.length - max}</span>` : "") : "<span class=\"muted\">none</span>"; };
    const stateWord = { on: "On", report: "Report-only", off: "Off" };
    const pol = ({ id, p }) => !p
      ? `<div class="db-pol missing"><b>${esc(id)}</b> <span class="mini muted">— not in the loaded snapshot</span></div>`
      : `<div class="db-pol">
          <div class="db-pol-h"><b>${esc(p.name)}</b> <span class="tag ${p.state === "on" ? "ok" : p.state === "report" ? "" : "block"}">${esc(stateWord[p.state] || p.state)}</span> <span class="mini muted">modified ${esc(p.modified)}</span></div>
          <dl class="db-pol-f">
            <dt>Users</dt><dd>${list(p.users.inc)}${p.users.exc && p.users.exc.length ? ` <span class="db-exc">excluding ${list(p.users.exc, 3)}</span>` : ""}</dd>
            <dt>Resources</dt><dd>${list(p.apps.inc)}${p.apps.exc && p.apps.exc.length ? ` <span class="db-exc">excluding ${list(p.apps.exc, 3)}</span>` : ""}</dd>
            ${(p.cond.platforms && p.cond.platforms.length) || (p.net.exc && p.net.exc.length) || (p.cond.platformsExc && p.cond.platformsExc.length) ? `<dt>Conditions</dt><dd>${[p.cond.platforms && p.cond.platforms.length ? `platforms: ${list(p.cond.platforms)}` : "", p.cond.platformsExc && p.cond.platformsExc.length ? `<span class="db-exc">excluding platforms ${list(p.cond.platformsExc)}</span>` : "", p.net.inc && p.net.inc[0] !== "Any network or location" ? `locations: ${list(p.net.inc)}` : "", p.net.exc && p.net.exc.length ? `<span class="db-exc">excluding locations ${list(p.net.exc)}</span>` : ""].filter(Boolean).join(" · ")}</dd>` : ""}
            <dt>Grant</dt><dd>${p.grant.mode === "block" ? "<b>Block</b>" : `${list(p.grant.controls, 6)}${p.grant.controls.length > 1 && p.grant.op ? ` <span class="db-op">${esc(String(p.grant.op).toUpperCase())}</span>${String(p.grant.op).toUpperCase() === "OR" ? ' <span class="mini muted">— any one control satisfies it</span>' : ""}` : ""}`}</dd>
            ${p.session && p.session.length ? `<dt>Session</dt><dd>${list(p.session)}</dd>` : ""}
          </dl>
        </div>`;
    return `<div class="db-evid">
      <div class="db-evid-row"><span class="l">Observed</span><span>${esc(x.detail && x.detail.observed || x.text)}</span></div>
      <div class="db-evid-row"><span class="l">Evidence</span><span>${evidenceChip(x.evidence)} ${x.evidence && x.evidence.note ? `<span class="mini muted">${esc(x.evidence.note)}</span>` : ""}${x.evidence && x.evidence.state === "partial" ? ' <span class="mini muted">— a finding on partial context can be understated, never invented</span>' : ""}</span></div>
      ${pols.length ? `<div class="db-evid-row"><span class="l">Policies</span><span class="db-pols">${pols.map(pol).join("")}</span></div>` : `<div class="db-evid-row"><span class="l">Policies</span><span class="mini muted">${x.source === "gap" ? "tenant-wide — no single policy carries this finding" : "named in the tool"}</span></div>`}
      ${x.detail && x.detail.next ? `<div class="db-evid-row"><span class="l">Next step</span><span>${esc(x.detail.next)}</span></div>` : ""}
      <div class="db-evid-act">
        <button type="button" class="fchip active" data-ovtool="${esc(x.tool)}"${x.tab ? ` data-ovtab="${esc(x.tab)}"` : ""}>${esc(x.action && x.action.label || "Open the tool")}</button>
        ${pols.length ? `<button type="button" class="fchip" data-ovpolicies="${esc(pols.map((q) => q.id).join(","))}">Show ${pols.length === 1 ? "this policy" : `these ${pols.length} policies`}</button>` : ""}
      </div>
    </div>`;
  }

  // ---- the configuration map (25424) ----
  // Summaries from what is already in memory, each with its unit and its
  // limit spelled out. Pure helpers first, so the offline suite can hold them.

  // A policy definition with the volatile metadata removed, keys sorted, so
  // two reads of an unchanged policy normalise to the same string.
  const VOLATILE = new Set(["modifiedDateTime", "createdDateTime", "@odata.context", "@odata.etag", "@odata.type"]);
  function normalize(raw) {
    const sort = (v) => {
      if (Array.isArray(v)) return v.map(sort);
      if (v && typeof v === "object") return Object.keys(v).filter((k) => !VOLATILE.has(k) && !k.startsWith("@odata")).sort().reduce((o, k) => { o[k] = sort(v[k]); return o; }, {});
      return v;
    };
    return JSON.stringify(sort(raw || {}));
  }
  // prev, cur: Map(id → {name, norm}). Compared by id and normalised
  // definition; who made a change is not inferred — that is audit data.
  function diff(prev, cur) {
    const added = [], removed = [], modified = [];
    for (const [id, c] of cur) {
      const p = prev.get(id);
      if (!p) added.push({ id, name: c.name });
      else if (p.norm !== c.norm) modified.push({ id, name: c.name, was: p.name });
    }
    for (const [id, p] of prev) if (!cur.has(id)) removed.push({ id, name: p.name });
    return { added, removed, modified };
  }
  // Which controls and conditions the policies reference, split by state.
  // Counts overlap (one policy can sit in several rows) and say nothing
  // about who is protected: a definition, not an effect.
  const CONTROL_ROWS = [
    { key: "mfa", label: "MFA or authentication strength", test: (p) => { const g = p.grantControls || {}; return (g.builtInControls || []).includes("mfa") || !!g.authenticationStrength; } },
    { key: "device", label: "Compliant or hybrid-joined device", test: (p) => { const b = (p.grantControls || {}).builtInControls || []; return b.includes("compliantDevice") || b.includes("domainJoinedDevice"); } },
    { key: "block", label: "Block access", test: (p) => ((p.grantControls || {}).builtInControls || []).includes("block") },
    { key: "legacy", label: "Legacy-client condition", test: (p) => ((p.conditions || {}).clientAppTypes || []).some((t) => t === "exchangeActiveSync" || t === "other") },
    { key: "risk", label: "User or sign-in risk", test: (p) => { const c = p.conditions || {}; return (c.userRiskLevels || []).length > 0 || (c.signInRiskLevels || []).length > 0 || !!c.agentIdRiskLevels; } },
    { key: "location", label: "Named location condition", test: (p) => { const l = (p.conditions || {}).locations; return !!l && ((l.includeLocations || []).length > 0 || (l.excludeLocations || []).length > 0); } },
    { key: "session", label: "Session controls", test: (p) => Object.values(p.sessionControls || {}).some((v) => v && typeof v === "object" && (v.isEnabled !== false)) },
    { key: "workload", label: "Workload identities or agents", test: (p) => { const ca = (p.conditions || {}).clientApplications; return !!ca && ((ca.includeServicePrincipals || []).length > 0 || !!ca.servicePrincipalFilter); } },
  ];
  const STATE_COL = { enabled: "on", enabledForReportingButNotEnforced: "report", disabled: "off" };
  function controls(raws) {
    return CONTROL_ROWS.map((r) => {
      const row = { key: r.key, label: r.label, on: 0, report: 0, off: 0 };
      for (const p of raws || []) { let hit = false; try { hit = !!r.test(p); } catch {} if (hit) row[STATE_COL[p.state] || "off"]++; }
      return row;
    });
  }
  // m = { reviewQueue: {rows: [{id,name,modified,days}], total},
  //       recent: {rows: [{id,name,modified}], undated},
  //       exclusions: {entities, occurrences, policies, byKind} | null,
  //       baseline: {label, source, release, released, author, basis, matched, missing, outdated, conflict, total, coverage} | null,
  //       controls: [...], diff: {prevAt, added, removed, modified} | null,
  //       context: [{label, text, state: read|partial|none}], open, now }
  function map(m) {
    const now = m.now || Date.now();
    const days = (iso) => Math.floor((now - new Date(iso).getTime()) / DAY);
    const date = (iso) => iso ? esc(new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })) : "date unavailable";
    const ids = (rows) => esc(rows.map((r) => r.id).filter(Boolean).join(","));
    const q = m.reviewQueue || { rows: [], total: 0 };
    const rc = m.recent || { rows: [], undated: 0 };
    const review = `<section class="db-map-sec"><h4>Report-only review queue <span class="mini muted">· ${n(q.total)} in report-only</span></h4>
      ${q.rows.length ? `<ul class="db-list">${q.rows.map((r) => `<li><span class="nm">${esc(r.name)}</span><span class="mini muted">${r.modified ? `last modified ${date(r.modified)} · ${days(r.modified)} days ago` : "date unavailable"}</span></li>`).join("")}</ul>${q.total > q.rows.length ? `<div class="mini muted">and ${q.total - q.rows.length} more</div>` : ""}` : `<div class="mini muted">Nothing in report-only.</div>`}
      <div class="mini muted">Oldest modification first. An old modification is a review prompt, not proof of a forgotten rollout; time spent in report-only is not known.</div>
      <div class="db-map-act"><button type="button" class="fchip" data-ovstate="report">Open the report-only list</button><button type="button" class="fchip" data-ovtool="toolSignins">Validate with sign-ins</button></div></section>`;
    const recent = `<section class="db-map-sec"><h4>Recently modified <span class="mini muted">· 30 days</span></h4>
      ${rc.rows.length ? `<ul class="db-list">${rc.rows.map((r) => `<li><span class="nm">${esc(r.name)}</span><span class="mini muted">${date(r.modified)} · ${days(r.modified) === 0 ? "today" : `${days(r.modified)} days ago`}</span></li>`).join("")}</ul>` : `<div class="mini muted">No dated policy modified in the last 30 days.</div>`}
      ${rc.undated ? `<div class="mini muted">Date unavailable for ${n(rc.undated)} polic${rc.undated === 1 ? "y" : "ies"}.</div>` : ""}
      <div class="mini muted">Names and dates from the policy read; who changed what is audit data.</div>
      <div class="db-map-act">${rc.rows.length ? `<button type="button" class="fchip" data-ovpolicies="${ids(rc.rows)}">Show these policies</button>` : ""}<button type="button" class="fchip" data-ovtool="toolAudit">Who changed what</button></div></section>`;
    const ctl = `<section class="db-map-sec"><h4>Controls referenced by policies <span class="mini muted">· policy counts, categories overlap</span></h4>
      <table class="db-ctl"><thead><tr><th>Control or condition</th><th>Enabled</th><th>Report-only</th><th>Off</th></tr></thead><tbody>${(m.controls || []).map((r) => `<tr><td>${esc(r.label)}</td><td><span class="db-n on">${n(r.on)}</span></td><td><span class="db-n rep">${n(r.report)}</span></td><td>${n(r.off)}</td></tr>`).join("")}</tbody></table>
      <div class="mini muted">Counts describe configuration. Conditions, exclusions and AND / OR logic decide applicability; none of this counts protected people.</div>
      <div class="db-map-act"><button type="button" class="fchip" data-ovstate="all">Inspect policies and grant logic</button></div></section>`;
    const b = m.baseline, ex = m.exclusions;
    const ctxRows = (m.context || []).map((c) => `<div class="db-kv"><span>${esc(c.label)}</span><b class="${c.state === "read" ? "ok" : c.state === "partial" ? "warn" : "na"}">${esc(c.text)}</b></div>`).join("");
    const snap = `<section class="db-map-sec"><h4>Snapshot context</h4>
      ${b ? `<div class="db-kv"><span>Selected baseline</span><b>${esc(b.label)}${b.release ? ` ${esc(b.release)}` : ""}</b></div>
      <div class="db-kv"><span>Source · basis</span><b>${esc(b.source || "")}${b.author ? ` (${esc(b.author)})` : ""} · ${esc(b.basis)}</b></div>
      <div class="db-kv"><span>Requirements matched</span><b>${n(b.matched)} of ${n(b.total)}</b></div>
      <div class="db-kv"><span>Missing / outdated / conflict</span><b>${n(b.missing)} / ${n(b.outdated)} / ${n(b.conflict)}</b></div>` : `<div class="db-kv"><span>Selected baseline</span><b class="na">none matched</b></div>`}
      ${ex ? `<div class="db-kv"><span>Exclusion references</span><b>${n(ex.entities)} unique · ${n(ex.occurrences)} occurrence${ex.occurrences === 1 ? "" : "s"} · ${n(ex.policies)} polic${ex.policies === 1 ? "y" : "ies"}</b></div>
      <div class="db-kv"><span>Effective user impact</span><b class="na">${ex.effective || "not checked"}</b></div>` : ""}
      ${ctxRows}
      <div class="mini muted">The catalog comparison is a configuration review; user coverage needs a scoped analysis.</div>
      <div class="db-map-act"><button type="button" class="fchip" data-ovtool="toolBaseline">Open the baseline</button><button type="button" class="fchip" data-ovtool="toolExclusions">Open exclusions</button></div></section>`;
    const df = m.diff;
    const since = `<section class="db-map-sec"><h4>Since your previous refresh${df ? ` <span class="mini muted">· this session · ${esc(hhmm(df.prevAt))} → ${esc(hhmm(m.snapshotAt))}</span>` : ""}</h4>
      ${df ? `<div class="db-diff"><span><b>${n(df.added.length)}</b> added</span><span><b>${n(df.modified.length)}</b> modified</span><span><b>${n(df.removed.length)}</b> removed</span></div>
        ${df.added.length + df.modified.length + df.removed.length ? `<ul class="db-list">${[...df.added.map((r) => ({ ...r, w: "added" })), ...df.modified.map((r) => ({ ...r, w: "modified" })), ...df.removed.map((r) => ({ ...r, w: "removed" }))].slice(0, 8).map((r) => `<li><span class="nm">${esc(r.name)}</span><span class="mini muted">${r.w}</span></li>`).join("")}</ul>` : `<div class="mini muted">No definition changed between the two reads.</div>`}
        <div class="mini muted">Compared by policy id and normalised definition, modification dates left out. Audit history is needed to identify who made a change.</div>
        <div class="db-map-act">${df.added.length + df.modified.length ? `<button type="button" class="fchip" data-ovpolicies="${ids([...df.added, ...df.modified])}">Show the changed policies</button>` : ""}<button type="button" class="fchip" data-ovtool="toolAudit">Audit history</button></div>`
      : `<div class="mini muted">No earlier snapshot in this session. Refresh the policies and this shows what changed between the two reads.</div>`}</section>`;
    return `<details id="ovMap" class="db-band db-map"${m.open ? " open" : ""}><summary><h3>Configuration map <span class="mini muted">— counts by control and state, what is under review, and what moved since your previous refresh</span></h3></summary>
      <div class="db-map-grid">${review}${recent}${ctl}${snap}${since}</div>
      <div class="db-map-note">Not established by this map: affected users, successful MFA, effective bypasses or actual sign-in impact.</div>
    </details>`;
  }

  return { header, lead, tenant, advisories, checks, worth, evidence, map, normalize, diff, controls, CONTROL_ROWS, DEADLINES, exclusionKinds };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { Overview };
