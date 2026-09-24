#!/usr/bin/env node
// ======================================================================
// learn-feed — what changed on Microsoft Learn for Conditional Access.
//
// Run weekly (Mondays, since 32311) by .github/workflows/learn-feed.yml (on main — scheduled
// workflows only fire from the default branch). Reads a clone of the
// public MicrosoftDocs/entra-docs repo, never learn.microsoft.com itself,
// and writes one JSON file the 📚 MS Learn tool reads at run time from
// raw.githubusercontent.com/nurejev/enca/learn-feed/learn-feed.json.
//
// It REPORTS, it never edits a check: every rule in js/mslearn.js stays
// hand-written. Three things come out:
//   docs      — CA-related articles added or changed in the window
//   whatsNew  — "Service category: Conditional Access" entries (and any
//               entry whose text names Conditional Access) from the
//               Entra what's-new page, newest month first
//   watched   — for every docUrl in js/mslearn.js, the last commit that
//               touched its article, so a check can say "Learn changed
//               since this was verified"
//
// No dependencies. Usage:
//   node tools/learn-feed.mjs --docs <entra-docs clone> --mslearn js/mslearn.js
//        [--out learn-feed.json] [--days 60] [--now 2026-09-23T05:00:00Z]
// ======================================================================
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

export const SCHEMA = "enca-learn-feed/1";
export const LEARN = "https://learn.microsoft.com/";
// Folders (under docs/) whose every change counts as Conditional Access news.
export const CA_PATHS = [
  "identity/conditional-access/",
  "id-protection/",
  "identity/authentication/concept-authentication-strength",
  "identity/authentication/concept-authentication-strengths",
  "external-id/authentication-conditional-access",
];
// Commits that touch hundreds of files for a rename or a metadata sweep say
// nothing about behaviour. Kept in the feed, flagged, hidden by default.
const BULK_RE = /\[BULK|\bbulk\b|rebrand|metadata|ms\.date|freshness|acrolinx|broken links?|link fix|\bfix(?:ed)? (?:the |a )?links?\b|repo_sync_working_branch/i;
// A change of a handful of lines is usually a typo or a link. Flagged, not hidden.
const MINOR_LINES = 4;
const BULK_FILES = 25;

// ---------- pure helpers (tested in tools/learn-feed.test.cjs) ----------

// https://learn.microsoft.com/entra/identity/x/y#frag → docs/identity/x/y.md
export function urlToDocPath(url) {
  const m = /^https:\/\/learn\.microsoft\.com\/(?:[a-z]{2}-[a-z]{2}\/)?entra\/([^#?]+?)\/?(?:[#?].*)?$/i.exec(url || "");
  if (!m) return null;
  return "docs/" + m[1] + ".md";
}
export function docPathToUrl(path) {
  const m = /^docs\/(.+)\.md$/.exec(path || "");
  return m ? LEARN + "entra/" + m[1].replace(/\/index$/, "/") : null;
}
export function isCaPath(path) {
  if (!path || !path.startsWith("docs/") || !path.endsWith(".md")) return false;
  const rest = path.slice(5);
  if (/(^|\/)(includes|media|toc)\b/i.test(rest)) return false;
  return CA_PATHS.some((p) => rest.startsWith(p));
}
export function frontTitle(md) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md || "");
  const t = fm && /^title:\s*(.+)$/m.exec(fm[1]);
  if (t) return t[1].trim().replace(/^["']|["']$/g, "");
  const h = /^#\s+(.+)$/m.exec(md || "");
  return h ? h[1].trim() : null;
}
export function docUrlsFrom(src) {
  const out = new Set();
  for (const m of String(src).matchAll(/docUrl:\s*"([^"]+)"/g)) out.add(m[1].split("#")[0]);
  return [...out].sort();
}
// "### Public Preview - Title" blocks under "## Month YYYY" headings.
export function parseWhatsNew(md, docsBase = "docs/fundamentals/") {
  const out = [];
  let month = null;
  const blocks = String(md).split(/\n(?=##\s)/);
  for (const b of blocks) {
    const mh = /^##\s+([A-Z][a-z]+ \d{4})\s*$/m.exec(b);
    if (mh && b.startsWith("## ")) month = mh[1];
    if (!month) continue;
    for (const e of b.split(/\n(?=###\s)/).filter((x) => x.startsWith("### "))) {
      const head = /^###\s+(.+)$/m.exec(e)[1].trim();
      const dash = head.split(/\s+-\s+/);
      const stage = dash.length > 1 ? dash[0].trim() : null;
      const title = (dash.length > 1 ? dash.slice(1).join(" - ").trim() : head).replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, "$1$2");
      const field = (k) => { const r = new RegExp("\\*\\*" + k + ":\\*\\*\\s*(.+)", "i").exec(e); return r ? r[1].trim() : null; };
      const body = e.replace(/^###.*$/m, "").replace(/\*\*[^*]+:\*\*.*$/gm, "").replace(/\n---\s*$/, "").trim();
      const category = field("Service category");
      const ca = /conditional access/i.test(category || "") || /conditional access/i.test(title + " " + body);
      if (!ca) continue;
      const links = [...body.matchAll(/\]\(([^)]+\.md)(#[^)]*)?\)/g)].map((l) => {
        const rel = l[1].startsWith("../") ? docsBase.replace(/[^/]+\/$/, "") + l[1].slice(3) : docsBase + l[1];
        return docPathToUrl(rel.replace(/\/\.\//g, "/")) + (l[2] || "");
      });
      out.push({
        month, stage, title,
        type: field("Type"), category,
        primary: /conditional access/i.test(category || ""),
        text: body.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "").replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:]|$)/g, "$1$2").replace(/\s+/g, " ").slice(0, 600),
        links,
      });
    }
  }
  return out;
}

// ---------- git ----------
function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
}
// One record per commit: sha, ISO date, subject, how many docs/ files it
// touched (for the bulk test), and each CA file with +/- lines and status.
// Two passes because the workflow clones with --filter=blob:none: a
// name-status walk needs trees only, and --numstat restricted to the CA
// pathspecs fetches just those blobs instead of all of entra-docs.
function commitsSince(repo, sinceIso) {
  const base = ["log", "--no-merges", "--no-renames", "--since=" + sinceIso];
  const status = git(repo, [...base, "--format=@@%H", "--name-status", "--", "docs/"]);
  const st = {}, width = {};
  let cur = null;
  for (const l of status.split("\n")) {
    if (l.startsWith("@@")) { cur = l.slice(2); st[cur] = {}; width[cur] = 0; continue; }
    const p = l.split("\t");
    if (cur && p.length >= 2) { st[cur][p[p.length - 1]] = p[0][0]; width[cur]++; }
  }
  const specs = CA_PATHS.map((p) => ":(glob)docs/" + p + (p.endsWith("/") ? "**" : "*"));
  const raw = git(repo, [...base, "--format=@@%H%x09%cI%x09%s", "--numstat", "--", ...specs]);
  const out = [];
  for (const chunk of raw.split(/\n?@@/)) {
    if (!chunk.trim()) continue;
    const [head, ...rows] = chunk.split("\n");
    const [sha, date, subject] = head.split("\t");
    const files = rows.filter(Boolean).map((r) => {
      const [a, d, path] = r.split("\t");
      return { path, add: +a || 0, del: +d || 0, status: (st[sha] || {})[path] || "M" };
    });
    out.push({ sha, date, subject, width: width[sha] || files.length, files });
  }
  return out;
}

export { BULK_RE };
export function build({ docsRepo, mslearnSrc, now = new Date(), days = 60, readFile }) {
  const since = new Date(now.getTime() - days * 864e5).toISOString();
  const commits = commitsSince(docsRepo, since);
  const head = git(docsRepo, ["rev-parse", "HEAD"]).trim();
  const show = readFile || ((p) => { try { return git(docsRepo, ["show", "HEAD:" + p]); } catch { return null; } });

  // docs: per CA article, the commits that touched it in the window
  const byPath = new Map();
  for (const c of commits) {
    const bulk = BULK_RE.test(c.subject) || c.width > BULK_FILES;
    for (const f of c.files) {
      if (!isCaPath(f.path)) continue;
      if (!byPath.has(f.path)) byPath.set(f.path, { path: f.path, commits: [], added: false, removed: false });
      const d = byPath.get(f.path);
      d.commits.push({ sha: c.sha.slice(0, 10), date: c.date, subject: c.subject.slice(0, 160), add: f.add, del: f.del, bulk });
      if (f.status === "A") d.added = true;
      if (f.status === "D") d.removed = true;
    }
  }
  const docs = [...byPath.values()].map((d) => {
    const md = d.removed ? null : show(d.path);
    const substantive = d.commits.filter((c) => !c.bulk);
    return {
      url: docPathToUrl(d.path),
      path: d.path,
      title: frontTitle(md) || d.path.split("/").pop().replace(/\.md$/, ""),
      kind: d.added ? "new" : d.removed ? "removed" : "changed",
      lastChange: d.commits[0].date,
      lines: d.commits.reduce((n, c) => n + c.add + c.del, 0),
      bulkOnly: substantive.length === 0,
      minor: substantive.reduce((n, c) => n + c.add + c.del, 0) <= MINOR_LINES,
      commits: d.commits.slice(0, 8),
    };
  }).sort((a, b) => b.lastChange.localeCompare(a.lastChange));

  // watched: every docUrl in js/mslearn.js
  const watched = {};
  for (const url of docUrlsFrom(mslearnSrc)) {
    const path = urlToDocPath(url);
    if (!path) { watched[url] = { watched: false, reason: "not in MicrosoftDocs/entra-docs" }; continue; }
    let last = "";
    try { last = git(docsRepo, ["log", "-1", "--no-merges", "--format=%H%x09%cI%x09%s", "--", path]).trim(); } catch { last = ""; }
    if (!last) {
      // The workflow clones a bounded history (--shallow-since). An article that
      // exists but has no commit inside it is watched and simply quiet.
      let exists = false;
      try { git(docsRepo, ["cat-file", "-e", "HEAD:" + path]); exists = true; } catch { exists = false; }
      watched[url] = exists ? { watched: true, path, last: null, lastSubstantive: null, quiet: true } : { watched: false, reason: "article not found at " + path };
      continue;
    }
    const [sha, date, subject] = last.split("\t");
    let lastSubstantive = null;
    try {
      const rows = git(docsRepo, ["log", "-40", "--no-merges", "--format=%H%x09%cI%x09%s", "--", path]).trim().split("\n");
      for (const r of rows) { const [s, d, subj] = r.split("\t"); if (!BULK_RE.test(subj)) { lastSubstantive = { sha: s.slice(0, 10), date: d, subject: subj.slice(0, 160) }; break; } }
    } catch { /* shallow clone ran out */ }
    watched[url] = { watched: true, path, title: frontTitle(show(path)), last: { sha: sha.slice(0, 10), date, subject: subject.slice(0, 160) }, lastSubstantive };
  }

  const wn = show("docs/fundamentals/whats-new.md");
  return {
    schema: SCHEMA,
    generated: now.toISOString(),
    windowDays: days,
    source: { repo: "MicrosoftDocs/entra-docs", head: head.slice(0, 10), paths: CA_PATHS },
    counts: {
      docs: docs.length,
      newDocs: docs.filter((d) => d.kind === "new").length,
      substantive: docs.filter((d) => !d.bulkOnly).length,
      watched: Object.values(watched).filter((w) => w.watched).length,
      unwatched: Object.values(watched).filter((w) => !w.watched).length,
    },
    docs,
    whatsNew: wn ? parseWhatsNew(wn) : [],
    watched,
  };
}

// ---------- open items: the SAME judgement the tab makes ----------
// js/learnfeed.js is a browser IIFE; load it (and the recorded decisions in
// js/learntriage.js) the way the tests load every module, so the issue and
// the tab can never disagree about what is open.
export function loadLib(libPath, triagePath) {
  const LearnFeed = new Function(readFileSync(libPath, "utf8") + "\n;return LearnFeed;")();
  let triage = { decisions: {} };
  if (triagePath && existsSync(triagePath)) triage = new Function(readFileSync(triagePath, "utf8") + "\n;return LEARN_TRIAGE;")();
  return { LearnFeed, triage };
}
export function withOpen(feed, mslearnSrc, lib) {
  const res = lib.LearnFeed.classify(feed, lib.LearnFeed.checksFrom(mslearnSrc), lib.triage, {});
  return { res, open: res.open.map((x) => ({ key: x.key, kind: x.kind, title: x.title, url: x.url || null, since: x.since || null, checks: (x.checks || []).map((c) => c.id) })) };
}

// ---------- CLI ----------
const isMain = process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href;
if (isMain) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
  if (!a.docs || !a.mslearn || !existsSync(a.docs)) { console.error("usage: learn-feed.mjs --docs <entra-docs clone> --mslearn js/mslearn.js [--lib js/learnfeed.js --triage js/learntriage.js --issue-dir dir] [--out f] [--days n]"); process.exit(2); }
  const mslearnSrc = readFileSync(a.mslearn, "utf8");
  const feed = build({ docsRepo: a.docs, mslearnSrc, days: +(a.days || 60), now: a.now ? new Date(a.now) : new Date() });
  const out = a.out || "learn-feed.json";
  let prev = null;
  try { prev = JSON.parse(readFileSync(out, "utf8")); } catch { /* first run */ }
  // open items + the GitHub issue text (32306)
  let res = null;
  if (a.lib) {
    const lib = loadLib(a.lib, a.triage);
    const w = withOpen(feed, mslearnSrc, lib);
    feed.open = w.open; res = w.res;
  }
  // Keep the file stable when nothing moved, so the workflow commits nothing.
  const strip = (f) => JSON.stringify({ ...f, generated: null });
  const unchanged = prev && strip(prev) === strip(feed);
  if (unchanged) feed.generated = prev.generated;
  if (a["issue-dir"] && res) {
    const lib = loadLib(a.lib, a.triage);
    res.generated = feed.generated;
    const fresh = lib.LearnFeed.newKeys(prev && prev.open, res.open);
    mkdirSync(a["issue-dir"], { recursive: true });
    writeFileSync(`${a["issue-dir"]}/count`, String(res.open.length));
    writeFileSync(`${a["issue-dir"]}/title`, `📰 Learn changes: ${res.open.length} to triage${res.alerts.some((x) => !x.decision) ? ` — ${res.alerts.filter((x) => !x.decision).length} touch a check` : ""}`);
    writeFileSync(`${a["issue-dir"]}/body.md`, lib.LearnFeed.issueMarkdown(res, new Set(fresh.map((x) => x.key))));
    writeFileSync(`${a["issue-dir"]}/new.md`, lib.LearnFeed.commentMarkdown(prev ? fresh : []));
  }
  if (unchanged) { console.log("learn-feed: no change since " + prev.generated); process.exit(0); }
  writeFileSync(out, JSON.stringify(feed, null, 1) + "\n");
  console.log(`learn-feed: ${feed.counts.docs} docs (${feed.counts.newDocs} new, ${feed.counts.substantive} substantive), ${feed.whatsNew.length} what's-new, ${feed.counts.watched}/${feed.counts.watched + feed.counts.unwatched} check URLs watched${feed.open ? `, ${feed.open.length} open` : ""}`);
}
