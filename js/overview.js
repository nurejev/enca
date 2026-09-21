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
//
// Pure over their arguments: the app builds `d` and `cards` from its state.
// ======================================================================
const Overview = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
  const DAY = 86400000;

  // The dated retirements the temporary tools exist for. A date is a fact;
  // the tool behind each one reads what the tenant still has in play.
  const DEADLINES = [
    { tool: "toolSmsVoice", icon: "📵", label: "SMS & voice retirement", at: "2027-02-01T00:00:00Z", note: "auto-enable for passkeys has been on since 1 September 2026" },
    { tool: "toolMemberOf", icon: "🧷", label: "memberOf retirement", at: "2026-11-03T00:00:00Z", note: "rules that still use it stop updating on that day" },
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
    // "Older than 30 days" is measured on the last modification — the app
    // does not know when a policy ENTERED report-only, only when it was last
    // touched, and the tile says exactly that.
    const roStale = pols.filter((p) => p.state === "enabledForReportingButNotEnforced" && p.modified && now - new Date(p.modified).getTime() > 30 * DAY).length;
    const tile = (cls, num, label, sub, tool) => `<div class="db-tile${cls ? " " + cls : ""}${tool ? " clickable" : ""}"${tool ? ` data-ovtool="${esc(tool)}" role="button" tabindex="0"` : ""}><div class="n" title="${esc(String(num).replace(/<[^>]+>/g, ""))}">${num}</div><div class="l">${esc(label)}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
    // The policy counts themselves live in the workspace's Current snapshot
    // panel beside this band; these tiles say what that panel does not.
    const tiles = [
      tile(st.ro ? "warn" : "", n(st.ro), "report-only", st.ro ? (roStale ? `${roStale} untouched for 30+ days` : "all touched within 30 days") : "nothing staged", "toolSignins"),
      tile("", n(changed.length), "changed in 30 days", changed.length ? `last: ${esc(changed[0].name)}, ${ago(changed[0].modified, now)}` : "no policy modified in 30 days", "toolAudit"),
      d.baseline
        ? tile(d.baseline.missing || d.baseline.outdated || d.baseline.conflict ? "warn" : "ok", esc(d.baseline.label), "baseline match",
            `${n(d.baseline.missing)} missing · ${n(d.baseline.outdated)} outdated · ${n(d.baseline.conflict)} in conflict · ${n(d.baseline.coverage)}% covered`, "toolBaseline")
        : tile("", "—", "baseline match", "no catalog matched", "toolBaseline"),
      d.exclusions
        ? tile("", n(d.exclusions.entities), "configured exclusions",
            `${[["user", "user"], ["group", "group"], ["role", "role"], ["guest", "external clause"], ["app", "app"]].filter(([k]) => d.exclusions.byKind[k]).map(([k, w]) => `${d.exclusions.byKind[k]} ${w}${d.exclusions.byKind[k] === 1 ? "" : "s"}`).join(" · ") || "none"} — configured, not effective`, "toolExclusions")
        : "",
    ].join("");
    const deadlines = DEADLINES.map((x) => {
      const days = daysUntil(x.at, now);
      const when = days > 0 ? `in <b>${days} day${days === 1 ? "" : "s"}</b>` : days === 0 ? "<b>today</b>" : `<b>${-days} day${days === -1 ? "" : "s"} ago</b>`;
      return `<button type="button" class="db-dead${days <= 60 ? " soon" : ""}" data-ovtool="${esc(x.tool)}">${x.icon} ${esc(x.label)} ${when} <span class="mini muted">— ${esc(x.note)}</span></button>`;
    }).join("");
    return `<div class="db-band">
      <h3>Tenant <span class="mini muted">${esc(d.isDemo ? "Demo tenant" : d.tenantName || "")}${d.snapshot ? ` · policies read ${esc(new Date(d.snapshot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}` : ""}</span></h3>
      <div class="db-tiles">${tiles}</div>
      <div class="db-deads">${deadlines}</div>
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

  return { tenant, runs, DEADLINES };
})();
if (typeof module !== "undefined" && module.exports) module.exports = { Overview };
