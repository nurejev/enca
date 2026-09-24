// js/learnfeed.js — 📰 Learn changes: classification, decisions, the issue
// text and the work order. The same file drives the tab and the nightly issue.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const LF = new Function(read("js/learnfeed.js") + ";return LearnFeed;")();
const TRIAGE = new Function(read("js/learntriage.js") + ";return LEARN_TRIAGE;")();

const U = "https://learn.microsoft.com/entra/identity/conditional-access/";
const CHECKS = [
  { id: "cae-disabled", title: "CAE", docUrl: U + "concept-continuous-access-evaluation", verified: "2026-09-11" },
  { id: "token-prot-apps", title: "TP", docUrl: U + "concept-token-protection#deployment", verified: "2026-09-11" },
];
const FEED = {
  schema: "enca-learn-feed/1", generated: "2026-09-23T04:17:00Z", windowDays: 60, source: { head: "8fcc223342" },
  docs: [
    { url: U + "concept-continuous-access-evaluation", path: "docs/identity/conditional-access/concept-continuous-access-evaluation.md", title: "CAE page", kind: "changed", lastChange: "2026-09-22T10:00:00Z", lines: 3, bulkOnly: false, minor: true, commits: [{ sha: "0ec2a02b41", subject: "Update CAE" }] },
    { url: U + "concept-token-protection", path: "docs/identity/conditional-access/concept-token-protection.md", title: "TP page", kind: "changed", lastChange: "2026-08-14T10:00:00Z", lines: 31, bulkOnly: false, minor: false, commits: [{ sha: "c13a041750", subject: "GA" }] },
    { url: U + "web-apps", path: "docs/identity/conditional-access/web-apps.md", title: "Web apps", kind: "new", lastChange: "2026-08-06T10:00:00Z", lines: 302, commits: [{ sha: "f95723be0d", subject: "Add" }] },
    { url: U + "network", path: "docs/identity/conditional-access/network.md", title: "Network", kind: "changed", lastChange: "2026-08-25T10:00:00Z", lines: 2, bulkOnly: true, minor: true, commits: [{ sha: "8d666f6b3e", subject: "Fix link." }] },
  ],
  whatsNew: [
    { month: "June 2026", stage: "Public Preview", title: "Agents", primary: true, links: ["https://learn.microsoft.com/entra/identity-platform/x", U + "howto-target-agent-identities"] },
    { month: "April 2026", stage: "GA", title: "PIM", primary: false, links: [] },
  ],
  watched: {
    [U + "concept-continuous-access-evaluation"]: { watched: true, path: "docs/identity/conditional-access/concept-continuous-access-evaluation.md", lastSubstantive: { sha: "0ec2a02b41", date: "2026-09-22T10:00:00Z", subject: "Update CAE" } },
    [U + "concept-token-protection"]: { watched: true, path: "docs/identity/conditional-access/concept-token-protection.md", lastSubstantive: { sha: "c13a041750", date: "2026-08-14T10:00:00Z", subject: "GA" } },
  },
};

test("every check in js/mslearn.js has a docUrl and a verified date", () => {
  const c = LF.checksFrom(read("js/mslearn.js"));
  assert.ok(c.length >= 30, `only ${c.length} checks parsed`);
  for (const x of c) assert.match(x.verified || "", /^\d{4}-\d{2}-\d{2}$/, `${x.id} has no verified date`);
});

test("classify: a check page changed after verification is an alert; before it is not", () => {
  const r = LF.classify(FEED, CHECKS, { decisions: {} }, {});
  assert.deepStrictEqual(r.alerts.map((x) => x.checks.map((c) => c.id)), [["cae-disabled"]]);
  assert.strictEqual(r.alerts[0].diff, "https://github.com/MicrosoftDocs/entra-docs/commit/0ec2a02b41");
  // the alert is not listed a second time among the changed pages
  assert.ok(!r.changed.concat(r.minor).some((x) => x.title === "CAE page"));
  assert.deepStrictEqual(r.changed.map((x) => x.title), ["TP page"]);
  assert.deepStrictEqual(r.minor.map((x) => x.title), ["Network"]);
  assert.deepStrictEqual(r.newDocs.map((x) => x.title), ["Web apps"]);
  assert.strictEqual(r.whatsNew[0].url, U + "howto-target-agent-identities", "the Conditional Access link wins over the first link");
  assert.strictEqual(r.mentions.length, 1);
  assert.deepStrictEqual(r.open.map((x) => x.kind), ["alert", "new", "whatsnew"]);
  assert.strictEqual(r.counts.alerts, 1);
});

test("decisions: recorded closes, pending does not, a newer change reopens", () => {
  const key = "doc:docs/identity/conditional-access/concept-continuous-access-evaluation.md";
  const rec = { decisions: { [key]: { d: "reverified", at: "2026-09-23", upTo: "2026-09-22T10:00:00Z" } } };
  assert.strictEqual(LF.classify(FEED, CHECKS, rec, {}).open.some((x) => x.key === key), false);
  const pend = LF.classify(FEED, CHECKS, { decisions: {} }, { [key]: { d: "reverified", upTo: "2026-09-22T10:00:00Z" } });
  assert.strictEqual(pend.open.some((x) => x.key === key), true, "pending is still open for the issue");
  assert.strictEqual(pend.pending.length, 1);
  assert.strictEqual(pend.counts.alerts, 0, "but the tab no longer counts it as undecided");
  const later = JSON.parse(JSON.stringify(FEED));
  later.watched[U + "concept-continuous-access-evaluation"].lastSubstantive.date = "2026-10-02T10:00:00Z";
  assert.strictEqual(LF.classify(later, CHECKS, rec, {}).open.some((x) => x.key === key), true, "changed again after re-verification");
});

test("newKeys: only what was not open last night", () => {
  const r = LF.classify(FEED, CHECKS, { decisions: {} }, {});
  const prev = r.open.slice(1).map((x) => ({ key: x.key }));
  assert.deepStrictEqual(LF.newKeys(prev, r.open).map((x) => x.kind), ["alert"]);
  assert.strictEqual(LF.newKeys(null, r.open).length, r.open.length);
});

test("issue text and work order", () => {
  const key = "wn:June 2026|Agents";
  const r = LF.classify(FEED, CHECKS, { decisions: {} }, { [key]: { d: "new-check", why: "agent targeting", at: "2026-09-23" } });
  const md = LF.issueMarkdown(r, new Set());
  assert.match(md, /Pages a check relies on changed/);
  assert.match(md, /cae-disabled \(verified 2026-09-11\)/);
  const wo = LF.workOrder(r, { date: "2026-09-23" });
  assert.match(wo, /## 1\. Record these decisions in js\/learntriage\.js \(1\)/);
  assert.match(wo, /"wn:June 2026\|Agents": \{"d":"new-check"/);
  assert.match(wo, /## 2\. Work to build \(1\)/);
  assert.match(wo, /## 3\. Still open, not decided \(2\)/);
  assert.strictEqual(LF.commentMarkdown([]), "");
});

test("render: no markup leaks from feed text, and the drift line names the check", () => {
  const evil = JSON.parse(JSON.stringify(FEED));
  evil.docs[2].title = "<img src=x onerror=alert(1)>";
  const html = LF.render(LF.classify(evil, CHECKS, { decisions: {} }, {}), { filter: "all", source: "live" });
  assert.ok(!html.includes("<img src=x"));
  const d = LF.driftFor(LF.classify(FEED, CHECKS, { decisions: {} }, {}), "cae-disabled");
  assert.match(d.html, /after this check was verified \(2026-09-11\)/);
  assert.strictEqual(LF.driftFor(LF.classify(FEED, CHECKS, { decisions: {} }, {}), "token-prot-apps"), null);
});

test("js/learntriage.js keys are well-formed", () => {
  for (const [k, v] of Object.entries(TRIAGE.decisions || {})) {
    assert.match(k, /^(doc:docs\/.+\.md|wn:[A-Z][a-z]+ \d{4}\|.+)$/);
    assert.ok(LF.DECISIONS[v.d], `${k}: unknown decision ${v.d}`);
  }
});

test("32311: the tab explains itself — steps, status bar, a question per item, plain button names", () => {
  const key = "doc:docs/identity/conditional-access/concept-continuous-access-evaluation.md";
  const r = LF.classify(FEED, CHECKS, { decisions: {} }, { [key]: { d: "reverified", upTo: "2026-09-22T10:00:00Z", at: "2026-09-24" } });
  const html = LF.render(r, { filter: "all", source: "live", howOpen: true });
  assert.match(html, /<details class="lf-how" data-lfhow open>/);
  assert.match(html, /1<\/span><b>Read<\/b>[\s\S]*2<\/span><b>Decide<\/b>[\s\S]*3<\/span><b>Hand over<\/b>/);
  assert.match(html, /decided, not handed over yet/);
  assert.match(html, /data-lfwo>📋 Make work order \(1\)/);
  assert.match(html, /answer needed/);
  assert.match(html, /for reading/);
  assert.match(html, /Should ENCA do something with this new page\?/);
  assert.match(html, /Decided: ✓ Still correct/);
  assert.match(html, /＋ Make it a new check/);
  assert.ok(!/Re-verified|Not for ENCA/.test(html), "old button names gone");
  assert.doesNotMatch(LF.render(r, { howOpen: false }), /data-lfhow open/);
  assert.strictEqual(r.counts.undecided, 2);
  assert.strictEqual(r.counts.pending, 1);
  assert.strictEqual(LF.STALE_DAYS, 8, "weekly feed");
});
