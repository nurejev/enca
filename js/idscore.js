// ======================================================================
// 🏅 Identity Secure Score — Microsoft Entra's own score and recommendations,
// with what ENCA sees in the loaded policies next to each one.
//
// Mihai, 23 Sep: "the dashboard should also show the secure score percentage
// and a recommendations section" — then, on the mockup: "only focus on
// identity". So this is the ENTRA Identity Secure Score (Entra ID → Identity
// Secure Score in the admin center), not Microsoft 365 Secure Score:
//   GET /directory/recommendations/tenantSecureScores   daily score history
//   GET /directory/recommendations                      the recommendations
// both on the beta endpoint, both DirectoryRecommendations.Read.All
// (delegated, admin consent; the signed-in user needs Reports Reader,
// Security Reader, Global Reader or similar). Microsoft recalculates once a
// day. READ-ONLY: the API can mark a recommendation planned, dismissed or
// risk-accepted — this tool never does; status stays the portal's.
//
// PURE: no DOM, no Graph. The app reads, this module judges and draws.
// ENCA's own column ("What ENCA sees") reads the LOADED policies for the
// recommendations Conditional Access answers — MFA for admin roles, legacy
// authentication, sign-in risk, user risk, insider risk, MFA for everyone —
// and says whether a policy doing it is On, report-only, Off or missing. It
// never claims Microsoft is wrong: Microsoft's check runs daily on its own
// criteria, and a policy switched on today shows up tomorrow.
// ======================================================================
const IdScore = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const SCOPES = ["DirectoryRecommendations.Read.All"];
  const DAY = 864e5;
  const PORTAL = "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView";

  // ---- the score ----
  // rows = [{ tenantScore, tenantMaxScore, createDateTime }] — newest first
  // in Microsoft's example, but sorted here rather than trusted.
  function latest(rows) {
    const s = (rows || []).filter((r) => r && r.tenantMaxScore > 0 && r.createDateTime)
      .map((r) => ({ score: +r.tenantScore || 0, max: +r.tenantMaxScore, at: r.createDateTime, pct: Math.round(((+r.tenantScore || 0) / +r.tenantMaxScore) * 1000) / 10 }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    if (!s.length) return null;
    const now = s[0];
    const back = s.find((r) => Date.parse(now.at) - Date.parse(r.at) >= 28 * DAY) || null;
    return { ...now, delta: back ? Math.round((now.pct - back.pct) * 10) / 10 : null, deltaFrom: back ? back.at : null, history: s.slice(0, 90).reverse() };
  }

  // 32309: the score from the recommendations themselves, for when the
  // history endpoint does not answer. Mihai's first real read: tenantSecure-
  // Scores came back 400 "Please try again after some time" (UnknownError) —
  // a beta endpoint that fails on its own while /directory/recommendations
  // works. The recommendations in the score carry currentScore and maxScore;
  // their sums are the score Microsoft shows, give or take recommendations
  // it leaves out (an ignored one does not count), so it is labelled as
  // derived, never passed off as Microsoft's figure.
  function fromRecs(recs, at) {
    const inScore = (recs || []).filter((r) => r && r.category === "identitySecureScore" && r.maxScore > 0);
    if (!inScore.length) return null;
    const score = inScore.reduce((n, r) => n + (+r.currentScore || 0), 0), max = inScore.reduce((n, r) => n + (+r.maxScore || 0), 0);
    return { score: Math.round(score * 100) / 100, max: Math.round(max * 100) / 100, at: at || new Date().toISOString(), pct: Math.round((score / max) * 1000) / 10, delta: null, deltaFrom: null, history: [], derived: true };
  }

  // ---- the recommendations ----
  const OPEN = new Set(["active", "needsMoreAction"]);
  const DONE = new Set(["completedBySystem", "completedByUser"]);
  const PARKED = new Set(["riskAccepted", "dismissed", "thirdParty", "alternateMitigation", "planned", "postponed", "unknownFutureValue"]);
  const STATUS_TEXT = {
    active: "To address", needsMoreAction: "Needs more action", completedBySystem: "Completed", completedByUser: "Marked complete",
    riskAccepted: "Risk accepted", dismissed: "Dismissed", thirdParty: "Third party", alternateMitigation: "Alternate mitigation",
    planned: "Planned", postponed: "Postponed", unknownFutureValue: "Set in the portal",
  };
  const PRIO = { critical: 0, high: 1, medium: 2, low: 3 };

  // Which recommendations Conditional Access answers, and how ENCA reads the
  // policies for each. Keyed on recommendationType where Microsoft publishes
  // one, on the title where it does not (insider risk).
  const CA_KIND = {
    adminMFAV2: "adminMfa",
    blockLegacyAuthentication: "legacy",
    signinRiskPolicy: "signinRisk",
    userRiskPolicy: "userRisk",
    mfaRegistrationV2: "allMfa",
    tenantMFA: "allMfa",
    switchFromPerUserMFA: "allMfa",
    turnOffPerUserMFA: "allMfa",
  };
  const kindOf = (r) => CA_KIND[r.recommendationType] || (/insider risk/i.test(r.displayName || "") ? "insiderRisk" : null);

  function normalize(recs) {
    return (recs || []).map((r) => {
      const status = r.status || "active";
      const isScore = r.category === "identitySecureScore";
      const max = isScore && r.maxScore != null ? +r.maxScore : null;
      const cur = isScore && r.currentScore != null ? +r.currentScore : null;
      return {
        id: r.id, type: r.recommendationType || null, name: r.displayName || r.recommendationType || "(untitled)",
        isScore, status, statusText: STATUS_TEXT[status] || status,
        open: OPEN.has(status), done: DONE.has(status), parked: PARKED.has(status),
        priority: r.priority || null, max, cur, lost: max != null && cur != null ? Math.max(0, Math.round((max - cur) * 100) / 100) : null,
        impactType: r.impactType || null, insights: r.insights || "", benefits: r.benefits || "", remediationImpact: r.remediationImpact || "",
        steps: (r.actionSteps || []).map((s) => ({ text: s.text || "", link: s.actionUrl && s.actionUrl.url ? { name: s.actionUrl.displayName || "Open", url: s.actionUrl.url } : null })),
        lastChecked: r.lastCheckedDateTime || null, release: r.releaseType || null,
        kind: kindOf(r),
      };
    });
  }

  // ---- what ENCA sees in the loaded policies ----
  const arr = (x) => Array.isArray(x) ? x : [];
  const users = (p) => (p.conditions && p.conditions.users) || {};
  const grantCtl = (p) => arr(p.grantControls && p.grantControls.builtInControls);
  const isBlock = (p) => grantCtl(p).includes("block");
  const isMfa = (p) => grantCtl(p).includes("mfa") || !!(p.grantControls && p.grantControls.authenticationStrength);
  const allUsers = (p) => arr(users(p).includeUsers).includes("All");
  const hasRoles = (p) => arr(users(p).includeRoles).length > 0;
  const allApps = (p) => { const a = (p.conditions && p.conditions.applications) || {}; return arr(a.includeApplications).includes("All"); };
  const JUDGE = {
    adminMfa: { what: "MFA or a strength for directory roles (or for All users)", test: (p) => (hasRoles(p) || allUsers(p)) && isMfa(p) },
    legacy: { what: "a block on legacy authentication clients", test: (p) => isBlock(p) && arr(p.conditions && p.conditions.clientAppTypes).some((c) => c === "exchangeActiveSync" || c === "other") },
    signinRisk: { what: "a sign-in risk condition", test: (p) => arr(p.conditions && p.conditions.signInRiskLevels).length > 0 },
    userRisk: { what: "a user risk condition", test: (p) => arr(p.conditions && p.conditions.userRiskLevels).length > 0 },
    insiderRisk: { what: "an insider risk condition", test: (p) => !!(p.conditions && p.conditions.insiderRiskLevels) },
    allMfa: { what: "MFA or a strength for All users on all resources", test: (p) => allUsers(p) && allApps(p) && isMfa(p) },
  };
  // → { kind, what, on:[names], report:[names], off:[names], verdict, text }
  function evidence(kind, raws) {
    const j = JUDGE[kind];
    if (!j) return null;
    const hit = (raws || []).filter((p) => { try { return j.test(p); } catch { return false; } });
    const nm = (p) => p.displayName || "(unnamed)";
    const on = hit.filter((p) => p.state === "enabled").map(nm);
    const report = hit.filter((p) => p.state === "enabledForReportingButNotEnforced").map(nm);
    const off = hit.filter((p) => p.state === "disabled").map(nm);
    const list = (a) => a.length <= 2 ? a.join(", ") : `${a.slice(0, 2).join(", ")} and ${a.length - 2} more`;
    let verdict, text;
    if (on.length) { verdict = "on"; text = `On: ${list(on)}${report.length || off.length ? ` · ${report.length + off.length} more not enforcing` : ""}`; }
    else if (report.length) { verdict = "report"; text = `Report-only: ${list(report)}${off.length ? ` · ${off.length} Off` : ""} — nothing enforces it yet`; }
    else if (off.length) { verdict = "off"; text = `Built, Off: ${list(off)}`; }
    else { verdict = "none"; text = `No policy here has ${j.what}`; }
    return { kind, what: j.what, on, report, off, verdict, text };
  }

  // The whole model the tab and the dashboard draw from.
  function model(scores, recs, raws, meta = {}) {
    const score = latest(scores) || fromRecs(recs, meta.readAt ? new Date(meta.readAt).toISOString() : null);
    const rows = normalize(recs).map((r) => ({ ...r, ev: r.kind ? evidence(r.kind, raws) : null }));
    // order: open first, then points to gain, then priority
    rows.sort((a, b) => (b.open - a.open) || ((b.lost ?? -1) - (a.lost ?? -1)) || ((PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)) || a.name.localeCompare(b.name));
    const open = rows.filter((r) => r.open);
    const openPts = open.reduce((n, r) => n + (r.lost || 0), 0);
    const caOpen = open.filter((r) => r.ev);
    const caPts = caOpen.reduce((n, r) => n + (r.lost || 0), 0);
    const oneSwitch = caOpen.filter((r) => r.ev.verdict === "off" || r.ev.verdict === "report");
    return {
      score, rows, readAt: meta.readAt || null, demo: !!meta.demo,
      // a part that could not be read is named, not silently empty
      scoreErr: meta.scoreErr || null, recsErr: meta.recsErr || null,
      counts: { all: rows.length, open: open.length, ca: rows.filter((r) => r.ev).length, caOpen: caOpen.length, done: rows.filter((r) => r.done).length, parked: rows.filter((r) => r.parked).length, score: rows.filter((r) => r.isScore).length },
      openPts: Math.round(openPts * 10) / 10, caPts: Math.round(caPts * 10) / 10,
      oneSwitch: oneSwitch.length, oneSwitchPts: Math.round(oneSwitch.reduce((n, r) => n + (r.lost || 0), 0) * 10) / 10,
    };
  }

  // ---------------- drawing ----------------
  const fmtPts = (v) => v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString();
  const when = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const TOOL_FOR = { adminMfa: "toolBaseline", legacy: "toolGapCheck", signinRisk: "toolBaseline", userRisk: "toolBaseline", insiderRisk: "toolBaseline", allMfa: "toolGapCheck" };
  const VERDICT_CLS = { on: "on", report: "report", off: "off", none: "none" };

  function spark(history) {
    const h = (history || []).filter((x) => x.max > 0);
    if (h.length < 2) return "";
    const W = 160, H = 34, P = 3;
    const pcts = h.map((x) => x.pct);
    const lo = Math.max(0, Math.min(...pcts) - 5), hi = Math.min(100, Math.max(...pcts) + 5);
    const X = (i) => P + (i * (W - 2 * P)) / (h.length - 1);
    const Y = (v) => H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
    const pts = h.map((x, i) => `${X(i).toFixed(1)},${Y(x.pct).toFixed(1)}`).join(" ");
    const last = h[h.length - 1];
    return `<svg class="is-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Identity Secure Score over ${h.length} days, from ${h[0].pct}% to ${last.pct}%"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${X(h.length - 1).toFixed(1)}" cy="${Y(last.pct).toFixed(1)}" r="2.6" fill="currentColor"/></svg>`;
  }

  function head(m) {
    const s = m.score;
    return `<div class="is-head">
      <div class="is-score">
        <div class="is-pct">${s ? `${s.pct}<small>%</small>` : "—"}</div>
        <div class="is-lbl">Identity Secure Score</div>
        <div class="is-sub">${s ? `${fmtPts(s.score)} of ${fmtPts(s.max)} points · ${s.derived ? "summed from the recommendations — the score history did not answer" : `Microsoft, ${esc(when(s.at))}`}` : "no score returned"}${s && s.delta != null ? ` · <b class="${s.delta >= 0 ? "up" : "down"}">${s.delta >= 0 ? "+" : ""}${s.delta}</b> since ${esc(when(s.deltaFrom))}` : ""}</div>
        ${s ? `<div class="is-meter"><i style="width:${Math.min(100, s.pct)}%"></i></div>` : ""}
      </div>
      ${s ? `<div class="is-trend">${spark(s.history)}<span class="mini muted">${s.history.length} day${s.history.length === 1 ? "" : "s"}</span></div>` : ""}
      <div class="is-facts">
        <div><b>${m.counts.open}</b><span>to address · ${fmtPts(m.openPts)} points open</span></div>
        <div><b>${m.counts.caOpen}</b><span>answered by Conditional Access · ${fmtPts(m.caPts)} points</span></div>
        <div><b>${m.oneSwitch}</b><span>of those already built here, not enforcing · ${fmtPts(m.oneSwitchPts)} points</span></div>
      </div>
    </div>`;
  }

  const FILTERS = [["open", "To address"], ["ca", "Conditional Access"], ["score", "In the score"], ["all", "All"], ["done", "Completed"], ["parked", "Accepted, planned, dismissed"]];
  const pick = (m, f) => m.rows.filter((r) => f === "open" ? r.open : f === "ca" ? !!r.ev : f === "score" ? r.isScore : f === "done" ? r.done : f === "parked" ? r.parked : true);
  function chips(m, filter) {
    return FILTERS.map(([k, l]) => { const n = pick(m, k).length; return (n || k === "open" || k === filter) ? `<button class="fchip ${filter === k ? "active" : ""}" data-isf="${k}">${l} (${n})</button>` : ""; }).join("");
  }
  function row(r, open) {
    const ev = r.ev;
    return `<tr class="is-row${r.open ? "" : " closed"}" data-isrow="${esc(r.id)}">
      <td class="is-pts">${r.lost != null ? `<b>+${fmtPts(r.lost)}</b><small>of ${fmtPts(r.max)}</small>` : '<small class="muted">not scored</small>'}</td>
      <td><button class="is-name" data-istoggle="${esc(r.id)}" aria-expanded="${open ? "true" : "false"}"><span class="caret">${open ? "▼" : "▶"}</span> ${esc(r.name)}</button>
        <div class="mini muted">${[r.priority ? `${r.priority} priority` : "", r.impactType ? `impacts ${esc(({ tenantLevel: "the whole tenant", users: "users", apps: "apps" })[r.impactType] || r.impactType)}` : "", r.release === "preview" ? "preview" : ""].filter(Boolean).join(" · ")}</div></td>
      <td><span class="is-st st-${r.open ? "open" : r.done ? "done" : "parked"}">${esc(r.statusText)}</span></td>
      <td class="is-ev">${ev ? `<span class="is-v v-${VERDICT_CLS[ev.verdict]}">${esc(ev.text)}</span>` : '<span class="mini muted">outside Conditional Access</span>'}</td>
      <td class="is-go">${ev ? `<button class="btn sm" data-isgo="${TOOL_FOR[ev.kind]}">${TOOL_FOR[ev.kind] === "toolBaseline" ? "🧬 Baseline" : "🛡 Checks"} ›</button>` : ""}</td>
    </tr>${open ? `<tr class="is-det"><td></td><td colspan="4">
      ${r.insights ? `<h5>Why it applies here</h5><p>${esc(r.insights)}</p>` : ""}
      ${r.benefits ? `<h5>Value</h5><p>${esc(r.benefits)}</p>` : ""}
      ${r.remediationImpact ? `<h5>User impact</h5><p>${esc(r.remediationImpact)}</p>` : ""}
      ${r.steps.length ? `<h5>Microsoft's steps</h5><ol>${r.steps.map((s) => `<li>${esc(s.text)}${s.link ? ` <a href="${esc(s.link.url)}" target="_blank" rel="noopener noreferrer">${esc(s.link.name)} ↗</a>` : ""}</li>`).join("")}</ol>` : ""}
      ${ev ? `<h5>What ENCA sees in the loaded policies</h5><p>Looked for ${esc(ev.what)}. ${ev.on.length ? `On: ${esc(ev.on.join(", "))}. ` : ""}${ev.report.length ? `Report-only: ${esc(ev.report.join(", "))}. ` : ""}${ev.off.length ? `Off: ${esc(ev.off.join(", "))}. ` : ""}${!ev.on.length && !ev.report.length && !ev.off.length ? "None found. " : ""}${ev.on.length && r.open ? "Microsoft still counts it open: its check runs once a day on its own criteria (a policy may not reach everyone it expects, or was switched on since)." : ""}</p>` : ""}
      <p class="mini muted">Microsoft last checked ${esc(when(r.lastChecked))}. Status changes (planned, risk accepted, dismissed) are made in the <a href="${PORTAL}" target="_blank" rel="noopener noreferrer">Entra admin center ↗</a> — this tool only reads.</p>
    </td></tr>` : ""}`;
  }
  function render(m, st = {}) {
    const f = st.filter || "open";
    const list = pick(m, f);
    const exp = st.expanded || new Set();
    const partial = [m.scoreErr ? `The score history could not be read (${esc(m.scoreErr)})${m.score && m.score.derived ? " — the score is summed from the recommendations, and there is no trend" : ""}.` : "", m.recsErr ? `The recommendations could not be read (${esc(m.recsErr)}) — only the score is shown.` : ""].filter(Boolean);
    return head(m) + (partial.length ? `<p class="mini is-partial">${partial.join(" ")} ⟳ Refresh tries again.</p>` : "") + `<div class="list-card is-list"><div class="is-tw"><table class="is-tbl">
      <thead><tr><th>Points</th><th>Recommendation</th><th>Status</th><th>What ENCA sees</th><th></th></tr></thead>
      <tbody>${list.map((r) => row(r, exp.has(r.id))).join("") || `<tr><td colspan="5" class="mini muted" style="padding:16px">Nothing ${f === "open" ? "to address" : "under this filter"}.</td></tr>`}</tbody>
    </table></div>
    <p class="mini muted" style="padding:8px 14px">Microsoft's recommendations and points as Microsoft reports them${m.readAt ? `, read ${esc(new Date(m.readAt).toLocaleString())}` : ""}${m.demo ? " (demo data)" : ""}. "What ENCA sees" is ENCA's reading of the policies loaded now, for the recommendations Conditional Access answers.</p></div>`;
  }

  // The dashboard's two pieces: the number in the snapshot strip and the
  // "Microsoft recommends" band — the open recommendations with the most
  // points, Conditional Access first.
  function dashboardTile(m, st = {}) {
    if (st.busy) return { cls: "", n: "…", label: "Identity Secure Score", sub: "reading…" };
    if (st.error) return { cls: "", n: "—", label: "Identity Secure Score", sub: "not readable" };
    if (!m || !m.score) return { cls: "", n: "—", label: "Identity Secure Score", sub: m ? "no score returned" : "▶ read it", unread: !m };
    return { cls: "", n: `${m.score.derived ? "≈" : ""}${m.score.pct}%`, label: "Identity Secure Score", sub: `${m.counts.open} to address${m.score.delta != null ? ` · ${m.score.delta >= 0 ? "+" : ""}${m.score.delta} in 30 days` : ""}`, pct: m.score.pct };
  }
  function dashboardRecs(m, st = {}) {
    if (!m) {
      return `<section class="db-band is-dash" aria-labelledby="ovRecsHeading"><h3 id="ovRecsHeading">Microsoft recommends <span class="mini muted">Entra Identity Secure Score</span></h3>
        <p class="mini muted">${st.error ? `Could not be read — ${esc(st.error)}` : "Not read in this session. It needs DirectoryRecommendations.Read.All (read-only, admin consent once) and a role such as Security Reader or Global Reader."}</p>
        <button type="button" class="fchip" data-ovrun="is">${st.busy ? "Reading…" : "▶ Read Identity Secure Score"}</button></section>`;
    }
    const open = m.rows.filter((r) => r.open);
    const top = [...open.filter((r) => r.ev), ...open.filter((r) => !r.ev)].slice(0, 4);
    return `<section class="db-band is-dash" aria-labelledby="ovRecsHeading"><h3 id="ovRecsHeading">Microsoft recommends <span class="mini muted">Entra Identity Secure Score · ${m.counts.open} to address, Conditional Access first</span></h3>
      ${top.length ? top.map((r) => `<div class="is-drow">
        <div class="is-pts">${r.lost != null ? `<b>+${fmtPts(r.lost)}</b><small>of ${fmtPts(r.max)}</small>` : ""}</div>
        <div><div class="is-dname">${esc(r.name)}</div>${r.ev ? `<div class="mini"><span class="is-v v-${VERDICT_CLS[r.ev.verdict]}">${esc(r.ev.text)}</span></div>` : '<div class="mini muted">outside Conditional Access</div>'}</div>
        ${r.ev ? '<span class="is-ca">CA</span>' : ""}
      </div>`).join("") : '<p class="mini muted">Nothing open — every recommendation is completed, planned or accepted.</p>'}
      <button type="button" class="fchip" data-ovtool="toolGapCheck" data-ovtab="checks:idscore">All ${m.counts.all} recommendations ›</button></section>`;
  }

  // Markdown, for the report / export.
  function toMd(m, tenant) {
    const L = [];
    L.push(`# Identity Secure Score — ${tenant || "tenant"}`);
    L.push("");
    if (m.score) L.push(`**${m.score.pct}%** — ${fmtPts(m.score.score)} of ${fmtPts(m.score.max)} points (Microsoft, ${when(m.score.at)})${m.score.delta != null ? `, ${m.score.delta >= 0 ? "+" : ""}${m.score.delta} since ${when(m.score.deltaFrom)}` : ""}.`);
    L.push("");
    L.push(`${m.counts.open} recommendations to address (${fmtPts(m.openPts)} points); ${m.counts.caOpen} answered by Conditional Access (${fmtPts(m.caPts)} points), ${m.oneSwitch} of them built in this tenant but not enforcing.`);
    L.push("");
    L.push("| Points open | Recommendation | Status | What ENCA sees |");
    L.push("| --- | --- | --- | --- |");
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    for (const r of m.rows) L.push(`| ${r.lost != null ? `${fmtPts(r.lost)} of ${fmtPts(r.max)}` : "—"} | ${e(r.name)} | ${e(r.statusText)} | ${e(r.ev ? r.ev.text : "outside Conditional Access")} |`);
    L.push("");
    L.push("Microsoft's recommendations and points as Microsoft reports them; \"What ENCA sees\" reads the loaded Conditional Access policies.");
    return L.join("\n");
  }

  return { SCOPES, PORTAL, latest, normalize, evidence, model, render, chips, dashboardTile, dashboardRecs, toMd, kindOf };
})();
