// 32439 — one promotion order per workspace (js/promote.js).
// Mihai: "split the work order of the beta to main for Conditional Access and
// PIM-buddy, so it can be checked and exported without mistakes that another
// workspace gets promoted". These tests hold the queue to that.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const load = () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js", "promote.js"), "utf8") + "\n;globalThis.__P = PROMOTE;", ctx);
  return ctx.__P;
};
const P = load();
const BUILD = { label: "v2.0.2-beta.39", build: 32439 };
const byWs = (ws) => P.items.filter((i) => i.ws === ws).map((i) => i.n);

test("every item and every staying entry names a known workspace", () => {
  const keys = Object.keys(P.workspaces);
  for (const i of P.items) assert.ok(keys.includes(i.ws), `item ${i.n} has ws ${i.ws}`);
  for (const s of P.staying) assert.ok(keys.includes(s.ws), `staying "${s.title}" has ws ${s.ws}`);
});

test("requires names queued numbers, never the item itself", () => {
  const ns = new Set(P.items.map((i) => i.n));
  for (const i of P.items) for (const r of i.requires || []) {
    assert.notStrictEqual(r, i.n, `item ${i.n} requires itself`);
    assert.ok(ns.has(r) || r < Math.min(...ns), `item ${i.n} requires ${r}, which is not queued`);
  }
});

test("an order never carries an item of the other workspace", () => {
  const ca = byWs("ca"), pim = byWs("pim");
  assert.ok(ca.length && pim.length, "both workspaces have queued items");
  const okCa = ca.filter((n) => !(P.items.find((i) => i.n === n).requires || []).some((r) => pim.includes(r)));
  assert.throws(() => P.buildOrder([okCa[0], pim[0]], BUILD, "ca"), /another workspace/);
  assert.throws(() => P.buildOrder([pim[0]], BUILD, "ca"), /another workspace/);
  const o = P.buildOrder(okCa.slice(0, 2), BUILD, "ca");
  const json = JSON.parse(o.text.split("```json\n")[1].split("\n```")[0]);
  assert.deepStrictEqual([...json.order], [...okCa.slice(0, 2)].sort((a, b) => a - b));
  assert.strictEqual(json.workspace, "ca");
  for (const n of json.order) assert.ok(ca.includes(n) || byWs("platform").includes(n));
});

test("the order file says which workspace, fingerprints itself and names what it leaves out", () => {
  const n = byWs("ca").find((x) => !(P.items.find((i) => i.n === x).requires || []).length);
  const o = P.buildOrder([n], BUILD, "ca");
  assert.match(o.filename, /^enca-promotion-order-ca-\d{4}-\d{2}-\d{2}\.md$/);
  assert.match(o.text, /^# ENCA promotion order · WORKSPACE 01 Conditional Access/);
  assert.match(o.text, /\nworkspace: ca\n/);
  assert.match(o.text, new RegExp(`fingerprint: ${P.fingerprint("ca", [n])}`));
  for (const p of byWs("pim")) assert.match(o.text, new RegExp(`NOT in this order.*\\b${p}\\b`));
  assert.match(o.text, /## Never port[^\n]*\n- js\/pim\*\.js/);
  assert.match(o.text, /## After the port, on main/);
  assert.notStrictEqual(P.fingerprint("ca", [n]), P.fingerprint("pim", [n]));
});

test("a requires into the other workspace blocks the export (314 reads 301 and 302)", () => {
  const c = P.checkOrder([314], "ca");
  assert.ok(c.blocks.some((b) => /314 needs items 301, 302 of 02 PIM-buddy/.test(b)), c.blocks.join(" | "));
  assert.throws(() => P.buildOrder([314], BUILD, "ca"), /314 needs/);
});

test("an unticked requires in the same workspace warns, ticked it is quiet", () => {
  const c1 = P.checkOrder([299], "pim");
  assert.strictEqual(c1.blocks.length, 0, c1.blocks.join(" | "));
  assert.ok(c1.warns.some((w) => /299 needs item 298, not ticked/.test(w)));
  const c2 = P.checkOrder([298, 299], "pim");
  assert.ok(!c2.warns.some((w) => /needs item 298/.test(w)));
});

// The three tests below stand on their own items rather than on whatever is
// queued today: the queue empties with every promotion (32501 took 300 and
// the last platform items to production 324), and a test that needs item 300
// to exist would fail on the day it ships.
const withFixtures = () => {
  const Q = load();
  Q.items.push(
    { n: 90001, ws: "ca", title: "fixture ca", tools: ["Checks"], builds: [1], risk: "low", test: ["x"], files: ["js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"] },
    { n: 90002, ws: "pim", title: "fixture pim", tools: ["Checks"], builds: [2], risk: "low", test: ["x"], files: ["js/app.js", "js/version.js"] },
    { n: 90003, ws: "platform", title: "fixture platform", tools: ["Help"], builds: [3], risk: "low", test: ["x"], files: ["js/app.js"] },
  );
  return Q;
};

test("shared files and tools are named; bookkeeping files never count as shared", () => {
  const Q = withFixtures();
  const c = Q.checkOrder([90001], "ca");
  const files = c.shared.map((x) => x.file);
  assert.ok(files.includes("js/app.js"));
  for (const b of Q.BOOKKEEPING) assert.ok(!files.includes(b), `${b} reported as shared`);
  assert.ok(c.sameTool.some((x) => x.tool === "Checks" && x.theirs.includes(90002)));
});

test("platform items can be ticked from either workspace; a platform order holds platform only", () => {
  const Q = withFixtures();
  assert.strictEqual(Q.checkOrder([90003], "ca").blocks.length, 0);
  assert.strictEqual(Q.checkOrder([90003], "pim").blocks.length, 0);
  assert.ok(Q.checkOrder([90001], "platform").foreign.length === 1);
});

test("an unlabelled item stops every order", () => {
  const Q = withFixtures();
  Q.items.push({ n: 99999, title: "x", tools: [], builds: [], risk: "low", test: ["x"] });
  const c = Q.checkOrder([90003], "ca");
  assert.ok(c.blocks.some((b) => /99999 carries no workspace/.test(b)));
});

test("nothing ticked, or a shipped number, is refused rather than shrunk", () => {
  assert.throws(() => P.buildOrder([], BUILD, "ca"), /empty order/);
  assert.throws(() => P.buildOrder([1], BUILD, "ca"), /no longer queued/);
});

test("glob matching for owned files", () => {
  assert.ok(P.globMatch("js/pim*.js", "js/pimplan.js"));
  assert.ok(P.globMatch("js/pim*.js", "js/pimBaselineData.js"));
  assert.ok(!P.globMatch("js/pim*.js", "js/app.js"));
  assert.ok(P.globMatch("tools/pim/", "tools/pim/generate.cjs"));
  assert.ok(P.globMatch("js/app.js", "js/app.js (main)"));
});

test("the Help page no longer hosts the queue; the tool is a hidden tile with its own screen", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(!/id="helpPromote"/.test(html));
  assert.match(html, /<div class="tool tool-help" id="toolPromote" hidden>/);
  assert.match(html, /<section id="screen-promote" class="screen">[\s\S]*?id="pqBody"/);
  const tiles = [...html.matchAll(/id="(toolChangelog|toolRoadmap|toolPromote|toolPermissions)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(tiles, ["toolChangelog", "toolRoadmap", "toolPromote", "toolPermissions"]);
  const app = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(app, /const promoteShown = \(\) => typeof PROMOTE !== "undefined" && deploymentKind\(\) === "beta" && isPublisherTenant\(\);/);
  assert.ok(!/isCisTenant/.test(app));
});

// 32818 — the 19 Oct orders: items 336–353 list no files, so every shell file
// that only a PIM item declared came out under Never port (index.html, js/app.js,
// css/app.css …) while the carve-outs of 343 and 344 said to port hunks of them.
test("a shell file the other workspace changes is port-by-hunk, never Never port", () => {
  const Q = load();
  Q.items.push(
    { n: 90011, ws: "ca", title: "fixture ca, no files", tools: ["Baseline"], builds: [1], risk: "low", test: ["x"] },
    { n: 90012, ws: "pim", title: "fixture pim", tools: ["PIM"], builds: [2], risk: "low", test: ["x"], files: ["index.html", "js/app.js", "css/app.css", "js/pimfixture.js", "docs/only-pim.md"] },
  );
  const c = Q.checkOrder([90011], "ca");
  for (const f of ["index.html", "js/app.js", "css/app.css"]) {
    assert.ok(!c.neverPort.includes(f), `${f} listed under Never port`);
    assert.ok(c.byHunk.includes(f), `${f} not listed as port by hunk`);
  }
  assert.ok(c.neverPort.includes("docs/only-pim.md"), "a non-shell file only the other workspace touches is still Never port");
  assert.ok(c.neverPort.includes("js/pim*.js"));
  const o = Q.buildOrder([90011], BUILD, "ca");
  const hunk = o.text.split("## Shell files the other workspace also changes")[1].split("\n## ")[0];
  for (const f of ["index.html", "js/app.js", "css/app.css"]) assert.ok(hunk.includes(`\n- ${f}\n`), hunk);
  const never = o.text.split("## Never port")[1].split("\n## ")[0];
  assert.ok(!/\n- (index\.html|js\/app\.js|css\/app\.css)\n/.test(never), never);
});

test("after-port checks never expect a workspace that is on main to be absent", () => {
  for (const [ws, w] of Object.entries(P.workspaces)) {
    for (const c of w.mainChecks || []) {
      assert.ok(!/no workspace chip/.test(c), `${ws}: main has had the workspace chip since 326 — ${c}`);
      if (w.onMain) assert.ok(!/expect nothing\)$/.test(c) || /git diff/.test(c), `${ws} is on main since ${w.onMain} but a check expects it absent: ${c}`);
    }
  }
  assert.strictEqual(P.workspaces.entra.onMain, 326);
  const n = byWs("ca").find((x) => !(P.items.find((i) => i.n === x).requires || []).length);
  const o = P.buildOrder([n], BUILD, "ca");
  assert.ok(!/GsaTool\|toolGsa\|screen-gsa' js\/\*\.js index\.html  \(expect nothing\)/.test(o.text));
  assert.match(o.text, /03 Entra Tools in the workspace chip as before the port/);
});
