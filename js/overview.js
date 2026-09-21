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
//   Overview.tenant(d)   the tenant band: policy states, recent change,
//                        baseline match, configured exclusions, deadlines
//   Overview.runs(cards) one card per on-demand tool: headline, run, freshness
//   Overview.worth(w)    the ranked findings the loaded policy set shows (25420)
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
    { tool: "toolSmsVoice", icon: "📵", label: "Microsoft-provided SMS & voice delivery",
      cohorts: [
        { who: "most users, internal guests included", at: "2027-02-01T00:00:00Z" },
        { who: "Global Administrators and external users", at: "2027-07-01T00:00:00Z" },
      ],
      note: "passkeys auto-enabled for SMS/voice users since 1 September 2026",
      source: "https://learn.microsoft.com/entra/identity/authentication/concept-sms-voice-retirement", verified: "2026-09-21" },
    { tool: "toolMemberOf", icon: "🧷", label: "memberOf in dynamic membership rules",
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
    return `<div class="db-band">
      <h3>Tenant <span class="mini muted">${esc(d.isDemo ? "Demo tenant" : d.tenantName || "")}${d.snapshot ? ` · policies read ${esc(new Date(d.snapshot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}` : ""}</span></h3>
      <div class="db-tiles">${tiles}</div>
      <div class="db-deads">${deadlines}</div>
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

  // cards = [{ tool, icon, label, headline: {n, unit} | null, meta, stale, never, open, run, runLabel }]
  function runs(cards) {
    const card = (c) => `<div class="db-run${c.stale ? " stale" : ""}${c.never ? " never" : ""}">
      <div class="t">${c.icon} ${esc(c.label)}</div>
      <div class="h">${c.never ? "—" : `${esc(c.headline.n)} <span class="mini muted">${esc(c.headline.unit)}</span>`}</div>
      <div class="m">${c.never ? "not run this session" : c.stale ? `⚠ policies reloaded after run #${esc(c.meta.id)}` : `run #${esc(c.meta.id)} · ${esc(new Date(c.meta.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))} · ${esc(c.meta.completeness)}`}</div>
      <div class="a">${c.never ? "" : `<button type="button" class="fchip" data-ovtool="${esc(c.tool)}">Open</button>`}<button type="button" class="fchip${c.stale ? " active" : ""}" data-ovrun="${esc(c.run)}">${esc(c.never ? "Run" : c.stale ? "Run again" : c.runLabel || "Rescan")}</button></div>
    </div>`;
    return `<div class="db-band">
      <h3>Your runs <span class="mini muted">— the on-demand tools, with the run each result came from</span></h3>
      <div class="db-runs">${cards.map(card).join("")}</div>
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

  return { tenant, runs, worth, DEADLINES, exclusionKinds };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { Overview };
