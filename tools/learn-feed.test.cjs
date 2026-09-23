// tools/learn-feed.mjs — the daily Microsoft Learn watch (workflow learn-feed.yml).
// Pure helpers, the what's-new parser, and one build() over a throwaway git
// repo shaped like MicrosoftDocs/entra-docs.
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const load = () => import(path.join(__dirname, "learn-feed.mjs"));

test("URL ↔ article path", async () => {
  const F = await load();
  assert.strictEqual(F.urlToDocPath("https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#deployment"), "docs/identity/conditional-access/concept-token-protection.md");
  assert.strictEqual(F.urlToDocPath("https://learn.microsoft.com/en-us/entra/id-protection/concept-identity-protection-b2b"), "docs/id-protection/concept-identity-protection-b2b.md");
  assert.strictEqual(F.urlToDocPath("https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies"), null);
  assert.strictEqual(F.docPathToUrl("docs/identity/conditional-access/overview.md"), "https://learn.microsoft.com/entra/identity/conditional-access/overview");
});

test("CA scope: the folders, never includes / media / toc", async () => {
  const F = await load();
  assert.ok(F.isCaPath("docs/identity/conditional-access/concept-token-protection.md"));
  assert.ok(F.isCaPath("docs/identity/authentication/concept-authentication-strengths.md"));
  assert.ok(!F.isCaPath("docs/identity/conditional-access/includes/x.md"));
  assert.ok(!F.isCaPath("docs/identity/conditional-access/media/x.png"));
  assert.ok(!F.isCaPath("docs/identity/authentication/concept-mfa.md"));
});

test("docUrls read from js/mslearn.js, anchors dropped, unique", async () => {
  const F = await load();
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "mslearn.js"), "utf8");
  const urls = F.docUrlsFrom(src);
  assert.ok(urls.length >= 15);
  assert.ok(urls.every((u) => !u.includes("#")));
  assert.strictEqual(new Set(urls).size, urls.length);
});

test("what's new: Conditional Access entries only, stage split, links resolved", async () => {
  const F = await load();
  const md = [
    "---", "title: x", "---", "# Releases", "", "## June 2026", "",
    "### Public Preview - Extended protections for agents", "", "**Type:** New feature  ", "**Service category:** Conditional Access  ", "**Product capability:** X", "",
    "Agents can be targeted. See [Target agents](../identity/conditional-access/howto-target-agent-identities.md#prereq).", "", "---", "",
    "### General Availability - Kerberos keys", "", "**Service category:** Authentications (Logins)  ", "", "Nothing about policies.", "", "---", "",
    "## May 2026", "", "### General Availability - PIM activation", "", "**Service category:** PIM  ", "", "Enforce Conditional Access on every activation.", "",
  ].join("\n");
  const w = F.parseWhatsNew(md);
  assert.strictEqual(w.length, 2);
  assert.deepStrictEqual([w[0].month, w[0].stage, w[0].primary], ["June 2026", "Public Preview", true]);
  assert.strictEqual(w[0].links[0], "https://learn.microsoft.com/entra/identity/conditional-access/howto-target-agent-identities#prereq");
  assert.deepStrictEqual([w[1].month, w[1].primary], ["May 2026", false]);
});

test("bulk subjects are recognised", async () => {
  const F = await load();
  for (const s of ["[BULK cpcli] Rebrand Microsoft 365 Copilot", "Fix link.", "Fixed broken links", "Confirm merge from repo_sync_working_branch to main"]) assert.ok(F.BULK_RE.test(s), s);
  for (const s of ["Update Apple token protection guidance for GA", "Revise managed policies activation"]) assert.ok(!F.BULK_RE.test(s), s);
});

test("build(): new / changed / watched from a real git history", async () => {
  const F = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lf-"));
  const g = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", ...(g.date ? { GIT_AUTHOR_DATE: g.date, GIT_COMMITTER_DATE: g.date } : {}) } });
  const put = (p, s) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s); };
  g("init", "-q");
  put("docs/identity/conditional-access/concept-token-protection.md", "---\ntitle: Token protection\n---\nold\n");
  put("docs/fundamentals/whats-new.md", "# x\n");
  g("add", "."); g.date = "2020-01-01T00:00:00Z"; g("commit", "-q", "-m", "seed"); g.date = null;
  put("docs/identity/conditional-access/concept-token-protection.md", "---\ntitle: Token protection\n---\nnew line one\nnew line two\nthree\nfour\nfive\n");
  put("docs/identity/conditional-access/new-guide.md", "---\ntitle: A new guide\n---\nbody\n");
  g("add", "."); g("commit", "-q", "-m", "Update token protection for GA");
  const feed = F.build({ docsRepo: dir, mslearnSrc: 'docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#x", docUrl: "https://learn.microsoft.com/surface-hub/x"', days: 30 });
  assert.strictEqual(feed.schema, "enca-learn-feed/1");
  const byT = Object.fromEntries(feed.docs.map((d) => [d.title, d]));
  assert.strictEqual(byT["A new guide"].kind, "new");
  assert.strictEqual(byT["Token protection"].kind, "changed");
  assert.strictEqual(byT["Token protection"].bulkOnly, false);
  const w = feed.watched["https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection"];
  assert.ok(w.watched && w.lastSubstantive.subject.startsWith("Update token protection"));
  assert.strictEqual(feed.watched["https://learn.microsoft.com/surface-hub/x"].watched, false);
});
