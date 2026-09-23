// ======================================================================
// 📰 Learn changes — the daily Microsoft Learn watch, read and triaged.
//
// The feed is written every night by .github/workflows/learn-feed.yml
// (tools/learn-feed.mjs) to the `learn-feed` branch and read here from
// raw.githubusercontent.com; js/learnfeed-snapshot.json is the copy shipped
// with the build, for when GitHub cannot be reached (a self-hosted
// container without egress, or before the first run).
//
// This module is PURE and shared: the browser uses it to draw the tab, and
// the nightly generator loads the SAME file to decide what the GitHub issue
// says — so the site and the notification can never disagree about what is
// open.
//
// Nothing here changes a check. An item is decided by a person:
//   a page a check relies on changed after the check was verified
//     → ✓ Re-verified (still correct)  |  ✎ The check needs a change
//   a new page, a changed page, a What's-new entry
//     → ＋ New check | ↗ Extends a check | ✓ Already covered | – Not for ENCA
// A decision made on the tab is PENDING — kept in this browser — until it is
// recorded in js/learntriage.js; 📋 Work order carries the pending decisions
// and the work they order to a session that records and builds them.
// ======================================================================
const LearnFeed = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const SCHEMA = "enca-learn-feed/1";
  const FEED_URL = "https://raw.githubusercontent.com/nurejev/enca/learn-feed/learn-feed.json";
  const SNAPSHOT_URL = "js/learnfeed-snapshot.json";
  const STALE_DAYS = 3;
  const DOCS_REPO = "https://github.com/MicrosoftDocs/entra-docs";

  const DECISIONS = {
    reverified: { label: "✓ Re-verified", long: "Re-verified — the check is still correct", work: false },
    "check-change": { label: "✎ Check needs a change", long: "The check needs a change", work: true },
    "new-check": { label: "＋ New check", long: "A new check", work: true },
    extends: { label: "↗ Extends a check", long: "Extends an existing check", work: true },
    covered: { label: "✓ Already covered", long: "Already covered by a check", work: false },
    "not-relevant": { label: "– Not for ENCA", long: "Not for ENCA", work: false },
  };
  const ALERT_CHOICES = ["reverified", "check-change"];
  const ITEM_CHOICES = ["new-check", "extends", "covered", "not-relevant"];

  // https://learn.microsoft.com/en-us/entra/x#y → https://learn.microsoft.com/entra/x
  const bare = (u) => String(u || "").split("#")[0].split("?")[0]
    .replace(/^https:\/\/learn\.microsoft\.com\/[a-z]{2}-[a-z]{2}\//i, "https://learn.microsoft.com/").replace(/\/$/, "");
  const day = (iso) => String(iso || "").slice(0, 10);
  const commitUrl = (sha) => sha ? `${DOCS_REPO}/commit/${sha}` : null;
  const keyDoc = (path) => `doc:${path}`;
  const keyWn = (w) => `wn:${w.month}|${w.title}`;
  const titleFromUrl = (u) => bare(u).split("/").pop().replace(/-/g, " ");

  // The checks as js/mslearn.js writes them: id, title, docUrl, verified.
  // String parse, so the generator can read the file without running it.
  function checksFrom(src) {
    const s = String(src || "");
    const start = s.indexOf("const CHECKS = [");
    const body = start >= 0 ? s.slice(start) : s;
    const out = [];
    const re = /\n {6}id: "([^"]+)"/g;
    const hits = [...body.matchAll(re)];
    hits.forEach((m, i) => {
      const block = body.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : body.length);
      const f = (k) => { const r = new RegExp(`\\n {6}${k}: "((?:[^"\\\\]|\\\\.)*)"`).exec(block); return r ? r[1] : null; };
      const docUrl = f("docUrl");
      if (docUrl) out.push({ id: m[1], title: f("title") || m[1], docUrl, verified: f("verified") || null });
    });
    return out;
  }

  // docUrl (bare) → the checks that cite it
  function checkPages(checks) {
    const m = new Map();
    for (const c of checks || []) {
      if (!c || !c.docUrl) continue;
      const u = bare(c.docUrl);
      if (!m.has(u)) m.set(u, []);
      m.get(u).push({ id: c.id, title: c.title, verified: c.verified || null });
    }
    return m;
  }

  // A decision counts for an item only when it was made about THIS change or
  // a later one: a page that changes again after "re-verified" is open again.
  function decide(key, since, triage, local) {
    const ok = (d) => d && (!since || !d.upTo || String(d.upTo) >= String(since));
    const repo = triage && triage.decisions ? triage.decisions[key] : null;
    if (ok(repo)) return { ...repo, src: "repo" };
    const loc = local ? local[key] : null;
    if (ok(loc)) return { ...loc, src: "local" };
    return null;
  }

  function classify(feed, checks, triage, local) {
    const f = feed || {};
    const pages = checkPages(checks);
    const docsByUrl = new Map((f.docs || []).map((d) => [bare(d.url), d]));
    const watched = {};
    for (const [u, w] of Object.entries(f.watched || {})) watched[bare(u)] = w;
    const alerts = [], unwatched = [], alertKeys = new Set();
    for (const [url, list] of pages) {
      const w = watched[url];
      if (!w || !w.watched) { unwatched.push({ url, checks: list, reason: (w && w.reason) || "not in the feed" }); continue; }
      const ch = w.lastSubstantive;
      if (!ch || !ch.date) continue;
      const stale = list.filter((c) => !c.verified || day(ch.date) > c.verified);
      if (!stale.length) continue;
      const doc = docsByUrl.get(url);
      const key = keyDoc(w.path);
      alertKeys.add(key);
      alerts.push({
        key, kind: "alert", url, path: w.path,
        title: (doc && doc.title) || w.title || titleFromUrl(url),
        since: ch.date, sha: ch.sha, subject: ch.subject, diff: commitUrl(ch.sha),
        lines: doc ? doc.lines : null,
        checks: stale, allChecks: list,
        decision: decide(key, ch.date, triage, local),
      });
    }
    const newDocs = [], changed = [], minor = [];
    for (const d of f.docs || []) {
      const key = keyDoc(d.path);
      if (alertKeys.has(key)) continue;
      const c0 = (d.commits || [])[0] || {};
      const item = {
        key, kind: d.kind === "new" ? "new" : "changed", url: d.url, path: d.path, title: d.title,
        since: d.lastChange, sha: c0.sha, subject: c0.subject, diff: commitUrl(c0.sha),
        lines: d.lines, nCommits: (d.commits || []).length,
        checks: pages.get(bare(d.url)) || [],
        decision: decide(key, d.lastChange, triage, local),
      };
      if (d.kind === "removed") item.kind = "removed";
      if (item.kind === "new") newDocs.push(item);
      else if (d.bulkOnly || d.minor) minor.push(item);
      else changed.push(item);
    }
    const whatsNew = [], mentions = [];
    for (const w of f.whatsNew || []) {
      const key = keyWn(w);
      const item = { key, kind: "whatsnew", title: w.title, month: w.month, stage: w.stage, category: w.category, text: w.text, url: (w.links || []).find((l) => /\/conditional-access\//.test(l)) || (w.links || [])[0] || null, primary: !!w.primary, decision: decide(key, null, triage, local) };
      (w.primary ? whatsNew : mentions).push(item);
    }
    // what still needs a person — a decision recorded in the repo closes an
    // item; a pending one on this browser does not (it is not recorded yet)
    const open = [...alerts, ...newDocs, ...whatsNew].filter((x) => !x.decision || x.decision.src !== "repo");
    const pending = [...alerts, ...newDocs, ...changed, ...minor, ...whatsNew, ...mentions].filter((x) => x.decision && x.decision.src === "local");
    return {
      generated: f.generated || null, head: f.source && f.source.head, windowDays: f.windowDays || null,
      alerts, newDocs, changed, minor, whatsNew, mentions, unwatched, open, pending,
      counts: { alerts: alerts.filter((x) => !x.decision).length, open: open.length, pending: pending.length },
    };
  }

  // Keys that are open now and were not open in the previous feed — what
  // the nightly run comments about, so the issue does not repeat itself.
  function newKeys(prevOpen, open) {
    const was = new Set((prevOpen || []).map((x) => x.key || x));
    return (open || []).filter((x) => !was.has(x.key));
  }

  const kindLabel = (x) => x.kind === "alert" ? "⚠ check page changed" : x.kind === "new" ? "new page" : x.kind === "whatsnew" ? "what's new" : x.kind;
  const itemLine = (x) => {
    const bits = [];
    if (x.since) bits.push(day(x.since));
    if (x.month) bits.push(x.month);
    if (x.stage) bits.push(x.stage);
    if (x.checks && x.checks.length) bits.push(`checks: ${x.checks.map((c) => c.id + (c.verified ? ` (verified ${c.verified})` : "")).join(", ")}`);
    if (x.subject) bits.push(`"${x.subject}"`);
    return bits.join(" · ");
  };

  // The GitHub issue body — written by the nightly run.
  function issueMarkdown(res, fresh) {
    const L = [];
    L.push(`Microsoft Learn changed in ways ENCA's 📘 MS Learn checks have not decided about yet. Triage them in ENCA → 🛡 Checks → 📘 MS Learn → **📰 Learn changes**, then take **📋 Work order** to a session.`);
    L.push("");
    L.push(`Feed ${res.generated ? day(res.generated) : "?"} · MicrosoftDocs/entra-docs \`${res.head || "?"}\` · last ${res.windowDays || "?"} days. This issue is rewritten every night and closes itself when nothing is open.`);
    L.push("");
    const sec = (title, list) => {
      if (!list.length) return;
      L.push(`### ${title} (${list.length})`);
      L.push("");
      for (const x of list) L.push(`- [ ] **${x.title}**${x.url ? ` — ${x.url}` : ""}${x.diff ? ` · [diff](${x.diff})` : ""}  \n  ${itemLine(x)}${fresh && fresh.has(x.key) ? " · 🆕" : ""}`);
      L.push("");
    };
    sec("⚠ Pages a check relies on changed after the check was verified", res.open.filter((x) => x.kind === "alert"));
    sec("New Conditional Access pages", res.open.filter((x) => x.kind === "new"));
    sec("What's new in Entra for Conditional Access", res.open.filter((x) => x.kind === "whatsnew"));
    if (res.changed.length) { L.push(`Also changed, for reading when there is time: ${res.changed.length} page${res.changed.length === 1 ? "" : "s"} (listed in the tab).`); L.push(""); }
    return L.join("\n");
  }
  function commentMarkdown(fresh) {
    if (!fresh || !fresh.length) return "";
    return [`🆕 ${fresh.length} new since the last run:`, "", ...fresh.map((x) => `- **${x.title}** (${kindLabel(x)})${x.url ? ` — ${x.url}` : ""}${x.diff ? ` · [diff](${x.diff})` : ""}`)].join("\n");
  }

  // 📋 Work order — the pending decisions to record and the work they order,
  // for a session to carry out. Plain markdown, like the promotion order.
  function workOrder(res, meta = {}) {
    const all = [...res.alerts, ...res.newDocs, ...res.changed, ...res.minor, ...res.whatsNew, ...res.mentions];
    const pend = all.filter((x) => x.decision && x.decision.src === "local");
    const work = pend.filter((x) => DECISIONS[x.decision.d] && DECISIONS[x.decision.d].work);
    const still = res.open.filter((x) => !x.decision);
    const L = [];
    L.push(`# ENCA — Learn changes work order, ${meta.date || day(new Date().toISOString())}`);
    L.push("");
    L.push(`Feed ${res.generated ? res.generated : "?"} · MicrosoftDocs/entra-docs \`${res.head || "?"}\`${meta.source ? ` · read from the ${meta.source}` : ""}${meta.build ? ` · ENCA ${meta.build}` : ""}.`);
    L.push("");
    L.push("This is the ORDER, not the verification: read each Learn page before changing a check.");
    L.push("");
    L.push(`## 1. Record these decisions in js/learntriage.js (${pend.length})`);
    L.push("");
    if (!pend.length) L.push("None — nothing was decided on the tab.");
    else {
      L.push("| Item | Decision | Reason / check |");
      L.push("| --- | --- | --- |");
      for (const x of pend) L.push(`| ${x.title.replace(/\|/g, "\\|")} | ${DECISIONS[x.decision.d] ? DECISIONS[x.decision.d].long : x.decision.d} | ${String(x.decision.why || "").replace(/\|/g, "\\|")} |`);
      L.push("");
      L.push("Lines for the `decisions` object (one per decision):");
      L.push("");
      for (const x of pend) {
        const o = { d: x.decision.d, at: x.decision.at || meta.date || null };
        if (x.since) o.upTo = x.since;
        if (x.decision.why) o.why = x.decision.why;
        if (x.kind === "alert") o.checks = x.checks.map((c) => c.id);
        L.push(`- \`${JSON.stringify(x.key)}: ${JSON.stringify(o)},\``);
      }
    }
    L.push("");
    L.push(`## 2. Work to build (${work.length})`);
    L.push("");
    if (!work.length) L.push("None.");
    for (const x of work) {
      L.push(`### ${DECISIONS[x.decision.d].long}: ${x.title}`);
      L.push("");
      if (x.url) L.push(`- Learn: ${x.url}`);
      if (x.diff) L.push(`- What changed: ${x.diff} ("${x.subject || ""}", ${day(x.since)}${x.lines != null ? `, ${x.lines} lines` : ""})`);
      if (x.kind === "whatsnew") L.push(`- What's new, ${x.month}${x.stage ? `, ${x.stage}` : ""}: ${x.text || ""}`);
      if (x.checks && x.checks.length) L.push(`- Checks: ${x.checks.map((c) => `${c.id}${c.verified ? ` (verified ${c.verified})` : ""}`).join(", ")}`);
      if (x.decision.why) L.push(`- Note: ${x.decision.why}`);
      L.push(`- Done means: the check's text or logic follows the page, its \`verified\` date in js/mslearn.js moves to the day it was checked, a test covers it, and a beta build with a queue item carries it.`);
      L.push("");
    }
    L.push(`## 3. Still open, not decided (${still.length})`);
    L.push("");
    if (!still.length) L.push("Nothing.");
    for (const x of still) L.push(`- ${x.title} (${kindLabel(x)}) — ${itemLine(x)}`);
    L.push("");
    return L.join("\n");
  }

  // ---------------- the tab ----------------
  function feedAge(res, now) {
    if (!res.generated) return null;
    return Math.floor(((now || Date.now()) - Date.parse(res.generated)) / 864e5);
  }
  function band(res, st) {
    const age = feedAge(res, st.now);
    const stale = age != null && age > STALE_DAYS;
    const src = st.source === "snapshot"
      ? `<span class="lf-warn">GitHub could not be reached${st.error ? ` (${esc(st.error)})` : ""} — showing the copy shipped with this build</span>`
      : stale ? `<span class="lf-warn">${age} days old — the nightly run has not written a newer one</span>` : `<span class="lf-ok">fresh</span>`;
    return `<div class="lf-band">
      <span>Feed <b>${res.generated ? esc(new Date(res.generated).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })) : "—"}</b> · ${src}</span>
      <span>MicrosoftDocs/entra-docs <code>${esc(res.head || "?")}</code></span>
      ${res.windowDays ? `<span>last <b>${res.windowDays}</b> days</span>` : ""}
      <span><b>${res.counts.open}</b> to decide${res.counts.pending ? ` · <b>${res.counts.pending}</b> decided here, not yet recorded` : ""}</span>
    </div>`;
  }
  function chips(res, filter) {
    const n = (k) => ({ all: null, alerts: res.alerts.length, new: res.newDocs.length, changed: res.changed.length, whatsnew: res.whatsNew.length, pending: res.pending.length })[k];
    return [["all", "All"], ["alerts", "⚠ Touches a check"], ["new", "New pages"], ["changed", "Changed"], ["whatsnew", "What's new"], ["pending", "Decided here"]]
      .filter(([k]) => k === "all" || n(k))
      .map(([k, l]) => `<button class="fchip ${filter === k ? "active" : ""}" data-lff="${k}">${l}${n(k) != null ? ` (${n(k)})` : ""}</button>`).join("");
  }
  function decisionChip(x) {
    const d = x.decision;
    if (!d) return "";
    const lab = DECISIONS[d.d] ? DECISIONS[d.d].label : d.d;
    return d.src === "repo"
      ? `<span class="lf-dec repo" title="Recorded in js/learntriage.js${d.at ? ` on ${esc(d.at)}` : ""}">${esc(lab)}</span>`
      : `<span class="lf-dec local" title="Decided on this browser — not recorded yet; 📋 Work order carries it">${esc(lab)} · pending</span> <button class="lf-undo" data-lfundo="${esc(x.key)}" title="Take this decision back">undo</button>`;
  }
  function triageRow(x) {
    if (x.decision) return "";
    const choices = x.kind === "alert" ? ALERT_CHOICES : ITEM_CHOICES;
    return `<div class="lf-tri"><input type="text" class="lf-why" data-lfwhy="${esc(x.key)}" aria-label="Reason or check" placeholder="${x.kind === "alert" ? "what changed, or why it still holds" : "reason, or the check it belongs to"}">
      ${choices.map((c) => `<button class="btn sm" data-lfd="${esc(x.key)}" data-lfdv="${c}">${esc(DECISIONS[c].label)}</button>`).join("")}</div>`;
  }
  function row(x) {
    const pills = [];
    if (x.kind === "alert") pills.push('<span class="lf-pill chk">check page</span>');
    else if (x.kind === "new") pills.push('<span class="lf-pill new">NEW</span>');
    else if (x.kind === "removed") pills.push('<span class="lf-pill">removed</span>');
    else if (x.kind === "whatsnew") pills.push(`<span class="lf-pill">${esc(x.stage || "what's new")}</span>`);
    else if (x.checks && x.checks.length) pills.push('<span class="lf-pill chk dim">check page</span>');
    if (x.lines != null) pills.push(`<span class="lf-pill mute">${x.lines} line${x.lines === 1 ? "" : "s"}</span>`);
    const when = x.kind === "whatsnew" ? esc(x.month) : esc(new Date(x.since).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
    const sub = [];
    if (x.kind === "alert") sub.push(`Used by <b>${x.checks.map((c) => esc(c.id)).join(", ")}</b>, verified ${esc(x.checks.map((c) => c.verified || "never").filter((v, i, a) => a.indexOf(v) === i).join(" / "))}`);
    else if (x.checks && x.checks.length) sub.push(`Used by ${x.checks.map((c) => esc(c.id)).join(", ")} (verified ${esc(x.checks[0].verified || "never")} — after this change)`);
    if (x.subject) sub.push(`“${esc(x.subject)}”${x.nCommits > 1 ? ` · ${x.nCommits} commits` : ""}`);
    if (x.text) sub.push(esc(x.text.length > 220 ? x.text.slice(0, 217) + "…" : x.text));
    if (x.diff) sub.push(`<a href="${esc(x.diff)}" target="_blank" rel="noopener noreferrer">see the diff ↗</a>`);
    return `<div class="lf-row${x.decision ? " decided" : ""}" data-lfkey="${esc(x.key)}">
      <div class="lf-date">${when}</div>
      <div class="lf-main">
        <div class="lf-t">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title)} ${decisionChip(x)}</div>
        ${sub.length ? `<div class="lf-sub">${sub.join(" · ")}</div>` : ""}
        ${triageRow(x)}
      </div>
      <div class="lf-pills">${pills.join("")}</div>
    </div>`;
  }
  function section(title, hint, list, opts = {}) {
    if (!list.length) return "";
    const live = list.filter((x) => !x.decision || x.decision.src !== "repo");
    const done = list.filter((x) => x.decision && x.decision.src === "repo");
    const body = live.map(row).join("") + (done.length ? `<details class="lf-fold"><summary>${done.length} already decided</summary>${done.map(row).join("")}</details>` : "");
    if (opts.fold) return `<details class="lf-sec lf-fold-sec"><summary><b>${esc(title)}</b> <span class="mini muted">${esc(hint)}</span></summary>${body}</details>`;
    return `<div class="lf-sec"><h4>${esc(title)} <span class="mini muted">${esc(hint)}</span></h4>${body}</div>`;
  }
  function render(res, st = {}) {
    const f = st.filter || "all";
    const want = (k) => f === "all" || f === k;
    const pend = (l) => f === "pending" ? l.filter((x) => x.decision && x.decision.src === "local") : l;
    let html = band(res, st);
    html += `<div class="lf-body">`;
    if (want("alerts") || f === "pending") html += section("⚠ A page a check relies on changed after the check was verified", "read the change, then re-verify or order a change", pend(res.alerts));
    if (want("new") || f === "pending") html += section("New pages", "possible new checks", pend(res.newDocs));
    if (want("changed") || f === "pending") {
      html += section("Changed", "newest first", pend(res.changed));
      if (f !== "pending") html += section(`Typo, link and bulk edits (${res.minor.length})`, "rebrands, link fixes, a handful of lines", res.minor, { fold: true });
    }
    if (want("whatsnew") || f === "pending") {
      html += section("What's new in Entra for Conditional Access", "from the Entra release notes, updated monthly", pend(res.whatsNew));
      if (f !== "pending") html += section(`Only mentions Conditional Access (${res.mentions.length})`, "other services' entries", res.mentions, { fold: true });
    }
    if (!res.alerts.length && !res.newDocs.length && !res.changed.length && !res.whatsNew.length) html += `<p class="mini" style="padding:16px">Nothing changed on Microsoft Learn for Conditional Access in the window.</p>`;
    html += `</div>`;
    if (res.unwatched.length) html += `<p class="mini muted lf-foot">Not watched (${res.unwatched.length}): ${res.unwatched.map((u) => esc(u.url.replace("https://learn.microsoft.com/", ""))).join(" · ")} — outside MicrosoftDocs/entra-docs, still checked by hand.</p>`;
    return html;
  }

  // The same signal on a finding: the check's page changed after it was verified.
  function driftFor(res, checkId) {
    if (!res) return null;
    const a = res.alerts.find((x) => !x.decision && x.checks.some((c) => c.id === checkId));
    if (!a) return null;
    const c = a.checks.find((q) => q.id === checkId);
    return { item: a, html: `<div class="lf-drift"><span>⚠</span><div><b>Learn changed on ${esc(new Date(a.since).toLocaleDateString(undefined, { day: "numeric", month: "short" }))}, after this check was verified${c && c.verified ? ` (${esc(c.verified)})` : ""}.</b> The advice below may be out of date. ${a.diff ? `<a href="${esc(a.diff)}" target="_blank" rel="noopener noreferrer">See what changed ↗</a> · ` : ""}<a href="#" data-lfgo="${esc(a.key)}">Open in 📰 Learn changes</a></div></div>` };
  }

  return { chips, SCHEMA, FEED_URL, SNAPSHOT_URL, STALE_DAYS, DECISIONS, ALERT_CHOICES, ITEM_CHOICES, bare, checksFrom, checkPages, classify, newKeys, issueMarkdown, commentMarkdown, workOrder, render, driftFor, feedAge };
})();
