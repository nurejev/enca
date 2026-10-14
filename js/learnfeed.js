// ======================================================================
// 📰 Learn changes — the daily Microsoft Learn watch, read and triaged.
//
// The feed is written once a week (32311; it was nightly) by .github/workflows/learn-feed.yml
// (tools/learn-feed.mjs) to the `learn-feed` branch and read here from
// raw.githubusercontent.com; js/learnfeed-snapshot.json is the copy shipped
// with the build, for when GitHub cannot be reached (a self-hosted
// container without egress, or before the first run).
//
// This module is PURE and shared: the browser uses it to draw the tab, and
// the weekly generator loads the SAME file to decide what the GitHub issue
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
  // weekly since 32311 (Mihai: the checks will be once a week at most)
  const STALE_DAYS = 8;
  const DOCS_REPO = "https://github.com/MicrosoftDocs/entra-docs";

  const DECISIONS = {
    reverified: { label: "✓ Still correct", hint: "nothing to change; stop flagging it", long: "Still correct — the check was read against the change", work: false },
    "check-change": { label: "✎ The check needs a change", hint: "say what changed below", long: "The check needs a change", work: true },
    "new-check": { label: "＋ Make it a new check", hint: "something ENCA should detect", long: "A new check", work: true },
    extends: { label: "↗ Add to an existing check", hint: "name the check below", long: "Add to an existing check", work: true },
    covered: { label: "✓ Already covered", hint: "name the check below", long: "Already covered by a check", work: false },
    "not-relevant": { label: "– Not relevant", hint: "say why below", long: "Not relevant for ENCA", work: false },
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
      counts: { alerts: alerts.filter((x) => !x.decision).length, open: open.length, pending: pending.length,
        undecided: open.filter((x) => !x.decision).length,
        recorded: [...alerts, ...newDocs, ...changed, ...minor, ...whatsNew, ...mentions].filter((x) => x.decision && x.decision.src === "repo").length },
    };
  }

  // Keys that are open now and were not open in the previous feed — what
  // the weekly run comments about, so the issue does not repeat itself.
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

  // The GitHub issue body — written by the weekly run.
  function issueMarkdown(res, fresh) {
    const L = [];
    L.push(`Microsoft Learn changed in ways ENCA's 📘 MS Learn checks have not decided about yet. Decide them in ENCA → 🛡 Checks → 📘 Microsoft Learn → **📰 Learn changes**, then hand **📋 Make work order** to Claude in a session.`);
    L.push("");
    L.push(`Feed ${res.generated ? day(res.generated) : "?"} · MicrosoftDocs/entra-docs \`${res.head || "?"}\` · last ${res.windowDays || "?"} days. This issue is rewritten by every weekly run and closes itself when nothing is open.`);
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
  // 32311 (Mihai: "we need to do a better job explaining how this works — I
  // cannot understand it, what to do when"): the tab explains itself. A How
  // this works card (open until folded, remembered), a status bar that always
  // says where you are with the hand-over button in it, a sentence per section
  // on what it is and whether it needs an answer, and on every item its
  // question in words above buttons that say what they mean.
  function howCard(open) {
    return `<details class="lf-how" data-lfhow${open ? " open" : ""}><summary><b>How this works</b> <span class="mini muted">read, decide, hand over — about once a week</span></summary>
      <p class="lf-how-lead">Once a week ENCA reads Microsoft's own documentation for Conditional Access and lists what changed. Nothing here touches your tenant. Your part is to <b>decide what each change means for ENCA</b>; building a change happens later, in a session.</p>
      <div class="lf-steps">
        <div class="lf-step"><span class="lf-n">1</span><b>Read</b><p>Open an item and click <b>see the diff</b> for exactly which lines Microsoft changed.</p></div>
        <div class="lf-step"><span class="lf-n">2</span><b>Decide</b><p>Answer the one question on the item with a button. The answer is kept <b>in this browser</b> and counted as decided, not handed over yet.</p></div>
        <div class="lf-step"><span class="lf-n">3</span><b>Hand over</b><p><b>📋 Make work order</b> gives you a file to hand to Claude in a session. Claude records your answers — then they leave this tab on every device and the GitHub issue — and builds the check changes you asked for.</p></div>
      </div>
      <p class="lf-when"><b>When?</b> When the GitHub issue 📰 Learn changes gets a new comment, or on your weekly round. Only the sections marked <span class="lf-tag must">answer needed</span> need an answer; <span class="lf-tag opt">for reading</span> is for when you have time.</p>
      <div class="lf-after">
        <div><b>✓ Still correct · ✓ Already covered · – Not relevant</b><span>No work. After the hand-over the item is recorded and leaves the list. If Microsoft changes the page again later, it comes back.</span></div>
        <div><b>✎ The check needs a change · ＋ Make it a new check · ↗ Add to an existing check</b><span>This is work: the work order carries it with the Learn page, the diff and your note, and it is built as a beta build with a queue item and a test, like any other change.</span></div>
      </div>
    </details>`;
  }
  function statusBar(res, st) {
    const age = feedAge(res, st.now);
    const stale = age != null && age > STALE_DAYS;
    const src = st.source === "snapshot"
      ? `<span class="lf-warn">GitHub could not be reached${st.error ? ` (${esc(st.error)})` : ""} — showing the copy shipped with this build</span>`
      : stale ? `<span class="lf-warn">${age} days old — the weekly run has not written a newer one</span>` : `<span class="lf-ok">current</span>`;
    const c = res.counts;
    return `<div class="lf-status">
      <div class="lf-counts">
        <div><b>${c.undecided}</b><span>to decide</span></div>
        <div${c.pending ? ' class="warn"' : ""}><b>${c.pending}</b><span>decided, not handed over yet</span></div>
        <div><b>${c.recorded}</b><span>recorded</span></div>
      </div>
      <button class="btn${c.pending ? " lemon" : ""}" data-lfwo${c.pending ? "" : ' title="Nothing decided yet — the work order would only list what is still open"'}>📋 Make work order${c.pending ? ` (${c.pending})` : ""}<small>the file to hand to Claude in a session</small></button>
      <div class="lf-feed mini muted">Feed ${res.generated ? esc(new Date(res.generated).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })) : "—"} · ${src} · MicrosoftDocs/entra-docs <code>${esc(res.head || "?")}</code>${res.windowDays ? ` · last ${res.windowDays} days` : ""}</div>
    </div>`;
  }
  function chips(res, filter) {
    const n = (k) => ({ all: null, alerts: res.alerts.length, new: res.newDocs.length, whatsnew: res.whatsNew.length, changed: res.changed.length + res.minor.length, pending: res.pending.length })[k];
    return [["all", "All"], ["alerts", "⚠ A check may be out of date"], ["new", "New pages"], ["whatsnew", "What's new"], ["changed", "Changed pages"], ["pending", "Decided, not handed over"]]
      .filter(([k]) => k === "all" || n(k))
      .map(([k, l]) => `<button class="fchip ${filter === k ? "active" : ""}" data-lff="${k}">${l}${n(k) != null ? ` (${n(k)})` : ""}</button>`).join("");
  }
  const QUESTION = {
    alert: (x) => `Is the check ${x.checks.map((c) => `<i>${esc(c.id)}</i>`).join(", ")} still right? <small>Read the diff first.</small>`,
    new: () => "Should ENCA do something with this new page?",
    whatsnew: () => "Should ENCA do something with this announcement?",
    other: () => `Anything for ENCA here? <small>Optional.</small>`,
  };
  function triageRow(x) {
    if (x.decision) {
      const d = x.decision, lab = DECISIONS[d.d] ? DECISIONS[d.d].label : d.d;
      return d.src === "repo"
        ? `<div class="lf-done">Recorded: <b>${esc(lab)}</b>${d.at ? ` on ${esc(d.at)}` : ""}${d.why ? ` — ${esc(d.why)}` : ""}</div>`
        : `<div class="lf-pend"><b>Decided: ${esc(lab)}</b>${d.why ? ` — ${esc(d.why)}` : ""} · kept in this browser, goes with the next work order <button class="btn sm" data-lfundo="${esc(x.key)}">undo</button></div>`;
    }
    const choices = x.kind === "alert" ? ALERT_CHOICES : ITEM_CHOICES;
    const q = (QUESTION[x.kind] || QUESTION.other)(x);
    return `<div class="lf-q">${q}</div>
      <div class="lf-choices">${choices.map((c) => `<button class="btn" data-lfd="${esc(x.key)}" data-lfdv="${c}">${esc(DECISIONS[c].label)}<small>${esc(DECISIONS[c].hint)}</small></button>`).join("")}</div>
      <div class="lf-whyrow"><input type="text" class="lf-why" data-lfwhy="${esc(x.key)}" aria-label="Your note" placeholder="${x.kind === "alert" ? "What changed? (needed for “needs a change”)" : "Which check, or why not"}"></div>`;
  }
  function row(x) {
    const pills = [];
    if (x.kind === "new") pills.push('<span class="lf-pill new">NEW</span>');
    else if (x.kind === "removed") pills.push('<span class="lf-pill">removed</span>');
    else if (x.kind === "whatsnew" && x.stage) pills.push(`<span class="lf-pill">${esc(x.stage)}</span>`);
    const when = x.kind === "whatsnew" ? esc(x.month) : esc(new Date(x.since).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
    const sub = [];
    sub.push(x.kind === "whatsnew" ? `Announced ${when}` : `${x.kind === "new" ? "Published" : "Changed"} ${when}`);
    if (x.lines != null) sub.push(`${x.lines} line${x.lines === 1 ? "" : "s"}`);
    if (x.kind === "alert") sub.push(`used by check ${x.checks.map((c) => `<b>${esc(c.id)}</b>`).join(", ")}, last read ${esc(x.checks.map((c) => c.verified || "never").filter((v, i, a) => a.indexOf(v) === i).join(" / "))}`);
    else if (x.checks && x.checks.length) sub.push(`used by ${x.checks.map((c) => esc(c.id)).join(", ")}, read after this change`);
    if (x.subject) sub.push(`“${esc(x.subject)}”`);
    if (x.diff) sub.push(`<a href="${esc(x.diff)}" target="_blank" rel="noopener noreferrer">see the diff ↗</a>`);
    return `<div class="lf-row${x.decision ? " decided" : ""}" data-lfkey="${esc(x.key)}">
      <div class="lf-t">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title)} ${pills.join("")}</div>
      <div class="lf-sub">${sub.join(" · ")}</div>
      ${x.text ? `<div class="lf-sub">${esc(x.text.length > 240 ? x.text.slice(0, 237) + "…" : x.text)}</div>` : ""}
      ${triageRow(x)}
    </div>`;
  }
  function section(title, what, list, opts = {}) {
    if (!list.length) return "";
    const live = list.filter((x) => !x.decision || x.decision.src !== "repo");
    const done = list.filter((x) => x.decision && x.decision.src === "repo");
    const tag = opts.optional ? '<span class="lf-tag opt">for reading</span>' : live.some((x) => !x.decision) ? '<span class="lf-tag must">answer needed</span>' : '<span class="lf-tag ok">all answered</span>';
    const head = `<div class="lf-sech"><div><h4>${esc(title)} (${list.length})</h4><div class="lf-what">${what}</div></div>${tag}</div>`;
    const body = live.map(row).join("") + (done.length ? `<details class="lf-fold"><summary>${done.length} already recorded</summary>${done.map(row).join("")}</details>` : "");
    if (opts.fold) return `<details class="lf-sec lf-fold-sec"><summary>${head}</summary><div class="lf-rows">${body}</div></details>`;
    return `<div class="lf-sec">${head}<div class="lf-rows">${body}</div></div>`;
  }
  function render(res, st = {}) {
    const f = st.filter || "all";
    const want = (k) => f === "all" || f === k;
    const pend = (l) => f === "pending" ? l.filter((x) => x.decision && x.decision.src === "local") : l;
    const P = f === "pending";
    let html = howCard(st.howOpen !== false) + statusBar(res, st) + `<div class="lf-body">`;
    if (want("alerts") || P) html += section("⚠ A check may be out of date", "One of ENCA's checks is based on this Learn page, and Microsoft changed the page <b>after</b> the check was last read. <b>What to do:</b> read the change and say whether the check is still right.", pend(res.alerts));
    if (want("new") || P) html += section("New pages", "Microsoft published a new Conditional Access article. <b>What to do:</b> decide whether ENCA should check for it.", pend(res.newDocs));
    if (want("whatsnew") || P) html += section("What's new in Entra for Conditional Access", "Feature announcements from Microsoft's release notes, preview and GA. <b>What to do:</b> the same question as a new page.", pend(res.whatsNew));
    if (want("changed") || P) {
      html += section("Changed pages", "Other Conditional Access pages that changed; no ENCA check depends on them. <b>Nothing to do</b>, unless something catches your eye.", pend(res.changed), { optional: true, fold: !P && f !== "changed" });
      html += section("Typo, link and bulk edits", "Rebrands, link fixes, a handful of lines. <b>Nothing to do.</b>", pend(res.minor), { optional: true, fold: true });
    }
    if (want("whatsnew") && !P) html += section("Only mention Conditional Access", "Other services' release notes that name Conditional Access in passing. <b>Nothing to do.</b>", res.mentions, { optional: true, fold: true });
    if (!res.alerts.length && !res.newDocs.length && !res.changed.length && !res.whatsNew.length) html += `<p class="mini" style="padding:16px">Nothing changed on Microsoft Learn for Conditional Access in the window.</p>`;
    html += `</div>`;
    if (res.unwatched.length) html += `<p class="mini muted lf-foot">Not watched (${res.unwatched.length}): ${res.unwatched.map((u) => esc(u.url.replace("https://learn.microsoft.com/", ""))).join(" · ")} — these pages live outside MicrosoftDocs/entra-docs and are still checked by hand.</p>`;
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
