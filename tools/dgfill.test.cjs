// 🌍 Fill deploy groups from regions (js/dgfill.js, beta 32432; generic, CSV region list, 32509).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const DG = require("../js/dgfill.js");

// The demo tenant opens the way a real one does after its import: the region
// list is a CSV (d.csv), matched to the tenant's groups by check().
const srcOf = (d) => DG.classifySources(DG.check(DG.parseCsv(d.csv).rows, d.groups, d.opts), d.groups, d.opts);
const run = (over, opts) => { const d = DG.demo(); return DG.plan({ sources: srcOf(d).rows.filter((r) => r.ticked), members: d.members, guests: d.guests, second: d.second, mains: d.mains, targets: d.targets, ...(over || {}) }, { ...d.opts, ...(opts || {}) }); };
const row = (p, id) => p.rows.find((r) => r.id === id);

test("nothing tenant-specific in the code: no prefix, no domains, no region list", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "dgfill.js"), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /perfetti|pvm/i);
  assert.equal(DG.DEFAULTS.prefix, ""); assert.equal(DG.DEFAULTS.mainDomain, ""); assert.deepEqual(DG.DEFAULTS.secondDomains, []);
  assert.equal(DG.REGIONS, undefined);
});

test("parseCsv: header, , or ;, quotes, ticked and mode, errors per line", () => {
  const a = DG.parseCsv("\uFEFFregion;group;label;ticked;mode\r\nEurope;\"SG; NL\";Netherlands;nee;\nEurope;SG-Unl-*;;yes;SA\n\n# note\nAsia;;x;;\nAsia;SG-IN;;maybe;\nAsia;SG-JP;;;delete");
  assert.deepEqual(a.rows.map((r) => [r.line, r.group, r.ticked, r.mode]), [[2, "SG; NL", false, ""], [3, "SG-Unl-*", true, "sa-only"]]);
  assert.deepEqual(a.errors.map((e) => e.line), [6, 7, 8]);
  assert.match(DG.parseCsv("name,where\nx,y").errors[0].why, /no “group” column/);
  assert.match(DG.parseCsv("").errors[0].why, /empty/);
  assert.equal(DG.parseCsv("group\nSG-A").rows[0].region, "Sources", "region and the rest are optional");
});

test("toCsv round-trips through parseCsv; the template parses clean", () => {
  const list = [{ region: "Europe, west", group: 'SG "NL"', label: "", ticked: false, mode: "ignore" }, { region: "Asia", group: "SG-IN", label: "India", ticked: true, mode: "" }];
  const back = DG.parseCsv(DG.toCsv(list)).rows.map(({ region, group, label, ticked, mode }) => ({ region, group, label, ticked, mode }));
  assert.deepEqual(back, list);
  const t = DG.parseCsv(DG.TEMPLATE); assert.equal(t.errors.length, 0); assert.ok(t.rows.length >= 5);
});

test("check(): by name any case, by object id, by trailing *; missing, ambiguous, duplicate and deploy groups", () => {
  const G = [{ id: "11111111-2222-3333-4444-555555555555", displayName: "SG-NL" }, { id: "b", displayName: "SG-Unl-A" }, { id: "c", displayName: "SG-Unl-B" },
    { id: "d", displayName: "Twin" }, { id: "e", displayName: "twin" }, { id: "f", displayName: "CAD-SEC-U-DG-INT" }, { id: "g", displayName: "My-INT" }];
  const L = [{ line: 2, group: "sg-nl" }, { line: 3, group: "11111111-2222-3333-4444-555555555555" }, { line: 4, group: "SG-Unl-*" }, { line: 5, group: "Gone" },
    { line: 6, group: "Twin" }, { line: 7, group: "CAD-SEC-U-DG-INT" }, { line: 8, group: "My-INT" }];
  const c = DG.check(L, G, {});
  assert.deepEqual(c.map((x) => x.status), ["ok", "duplicate", "ok", "missing", "ambiguous", "target", "ok"]);
  assert.equal(c[2].groups.length, 2);
  assert.equal(DG.check(L, G, { targetNames: { INT: "My-INT" } })[6].status, "target", "a renamed deploy group is a target too");
});

test("sources: CSV order and regions, sa-only and ignore, prefix extras unticked, missing reported", () => {
  const d = DG.demo();
  const s = srcOf(d);
  const by = (n) => s.rows.find((r) => r.name === n);
  assert.deepEqual([...new Set(s.rows.map((r) => r.region))], ["Europe", "Italy", "Americas", "Asia", "No Intune licence", "Not in your region list", "Ignored"]);
  assert.equal(by("DEMO-USERS-NL").label, "Netherlands"); assert.ok(by("DEMO-USERS-NL").ticked);
  assert.equal(by("DEMO-USERS-Unlicensed-Q-T").kind, "unlicensed"); assert.ok(by("DEMO-USERS-Unlicensed-Q-T").ticked);
  assert.equal(by("DEMO-USERS-DISABLED").kind, "ignored"); assert.equal(by("DEMO-USERS-DISABLED").ticked, false);
  assert.equal(by("DEMO-USERS-SK").region, "Not in your region list"); assert.equal(by("DEMO-USERS-SK").ticked, false);
  assert.equal(srcOf({ ...d, opts: { ...d.opts, prefix: "" } }).rows.some((r) => r.name === "DEMO-USERS-SK"), false, "no prefix, no extras");
  const m = DG.classifySources(DG.check([{ line: 2, region: "X", group: "Nope" }], d.groups, d.opts), [], d.opts);
  assert.deepEqual(m.missing.map((x) => x.name), ["Nope"]);
});

test("settings: deploy group names per tenant", () => {
  const T = DG.targets({ targetNames: { SA: "My-SA" } });
  assert.equal(T.find((t) => t.key === "SA").name, "My-SA"); assert.equal(T.find((t) => t.key === "GLO").name, "CAD-SEC-U-DG-GLO");
  const d = DG.demo(); delete d.targets.SA;
  const p = run({ targets: d.targets }, { targetNames: { SA: "My-SA" } });
  assert.equal(p.refusals.find((r) => r.key === "SA").name, "My-SA");
});

test("settings: no second-account domains turns 0a/0b/5 off; empty external prefix turns rule 2 off; another attribute", () => {
  const off = run(null, { secondDomains: [] });
  assert.equal(row(off, "u-svc"), undefined, "second accounts are not read as such");
  assert.ok(!off.rows.some((r) => (r.add || []).includes("DevOps")));
  const noExt = run(null, { extPrefix: "" });
  assert.deepEqual(row(noExt, "u-marco").add.sort(), ["GLO", "INT"]);
  const d = DG.demo(); d.members.get("src-BE")[0].onPremisesExtensionAttributes = { extensionAttribute3: "Extern" };
  const a3 = run({ members: d.members }, { extAttr: "extensionAttribute3", extPrefix: "extern" });
  assert.deepEqual(row(a3, "u-pieter").add.sort(), ["EXT", "GLO"]);
});

test("rules 1–4: guest, External*, member; everybody of them into GLO", () => {
  const p = run();
  assert.deepEqual(row(p, "u-guest").add.sort(), ["GLO", "GUESTUSERS"], "guest wins over EXTERNAL");
  assert.deepEqual(row(p, "u-marco").add.sort(), ["EXT", "GLO"], "External - Supplier counts");
  assert.deepEqual(row(p, "u-pieter").add.sort(), ["GLO", "INT"]);
  assert.ok(p.extValues.some(([v]) => v === "External - Supplier"));
});

test("rule 0a/0b/5: paired second account → ADM only, unpaired → SA only, the main account → DevOps", () => {
  const p = run();
  assert.deepEqual(row(p, "u-anna-adm").add, [], "already in ADM — not added again");
  assert.deepEqual(row(p, "u-anna-adm").keep, ["ADM"]);
  assert.deepEqual(row(p, "u-svc").add, ["SA"]);
  assert.deepEqual(row(p, "u-raj-adm").add, ["ADM"], "a second account in the other second domain pairs on the part before the @");
  assert.ok(row(p, "u-anna").add.includes("DevOps"));
  assert.ok(row(p, "u-raj").add.includes("DevOps"));
  assert.ok(!row(p, "u-svc").add.includes("GLO"), "second accounts get nothing else");
  assert.deepEqual(p.unpaired, ["svc-build@contoso-adm.com"]);
});

test("32513: a second account read from a ticked source is paired even with the Second accounts tick off", () => {
  const d = DG.demo();
  // raj's admin account sits in the sa-only Unlicensed source; the tick is off (second: null)
  const members = new Map(d.members); members.set("src-UNL-Q-T", [...members.get("src-UNL-Q-T"), d.second.find((u) => u.id === "u-raj-adm")]);
  const p = run({ members, second: null, targets: { ...d.targets, ADM: { ...d.targets.ADM, direct: new Set(["u-raj-adm"]) } } });
  const adm = row(p, "u-raj-adm");
  assert.equal(adm.rule, "0a", "paired with raj.kumar@contoso.com, not rule 0b");
  assert.deepEqual(adm.remove, [], "Fix must not take it out of ADM");
  assert.ok(!adm.add.includes("SA"));
  assert.ok(row(p, "u-raj").add.includes("DevOps"), "rule 5 follows from the pairing");
});

test("32513: ℹ How it works is in ① and ②, names the rules and keeps its open state", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  const how = app.slice(app.indexOf("function dgHowHtml"), app.indexOf("function dgSourcesHtml"));
  for (const r of ["skip", "0a", "0b", "0c", "1", "2", "3", "+5"]) assert.ok(how.includes(`r("${r}"`), r);
  assert.match(how, /Add only[^]*Add \+ fix/);
  assert.match(app, /\$\{bar\}\s*\$\{dgHowHtml\(\)\}/);
  assert.match(app, /return `\$\{dgHowHtml\(\)\}<div class="dg-tiles">/);
  assert.match(app, /\.dg-how > summary"\); if \(how && dg\) \{ dg\.howOpen/);
});

test("a guest whose UPN ends in the onmicrosoft.com domain is a guest, not a second account", () => {
  const d = DG.demo();
  const p = run({ second: [...d.second, d.guests[0]] });
  assert.deepEqual(row(p, "u-guest").add.sort(), ["GLO", "GUESTUSERS"]);
  assert.ok(!p.unpaired.some((u) => /#EXT#/.test(u)));
});

test("rule 0c: a user only in an sa-only source goes to SA and is FIXED out of GLO and INT", () => {
  const p = run();
  const r = row(p, "u-rtan");
  assert.deepEqual(r.add, ["SA"]);
  assert.deepEqual(r.remove.sort(), ["GLO", "INT"]);
  assert.equal(r.rule, "0c");
});

test("a user in an Unlicensed group AND a region-list group follows the region rules", () => {
  const d = DG.demo();
  d.members.get("src-UNL-Q-T").push(d.members.get("src-NL")[0]);
  const p = run({ members: d.members });
  assert.ok(row(p, "u-anna").add.includes("INT"));
});

test("fix: INT → EXT moves; the add comes before the remove in ops()", () => {
  const p = run();
  const r = row(p, "u-paula");
  assert.deepEqual(r.add, ["EXT"]); assert.deepEqual(r.remove, ["INT"]); assert.deepEqual(r.keep, ["GLO"]);
  const o = DG.ops(p, DG.demo().targets);
  const lastAdd = o.map((x) => x.op).lastIndexOf("add"), firstRemove = o.findIndex((x) => x.op === "remove");
  assert.ok(lastAdd < firstRemove, "every add before any removal");
});

test("add only: nothing is removed", () => {
  const p = run(null, { fix: false });
  assert.equal(p.removeTotal, 0);
  assert.deepEqual(row(p, "u-paula").remove, []);
});

test("DevOps is never fixed; somebody in no ticked source is never touched", () => {
  const d = DG.demo();
  d.targets.DevOps.direct.add("u-pieter");        // in DevOps by hand, no second account
  d.targets.GLO.direct.add("u-outsider");          // in no source at all
  const p = run({ targets: d.targets });
  assert.ok(!row(p, "u-pieter").remove.includes("DevOps"));
  assert.equal(p.removes.GLO.includes("u-outsider"), false);
});

test("disabled accounts are skipped entirely — no add, no remove", () => {
  const p = run();
  const r = row(p, "u-sam");
  assert.equal(r.rule, "skip"); assert.deepEqual(r.add, []); assert.deepEqual(r.remove, []);
});

test("a user in two ticked groups counts once", () => {
  const p = run();
  assert.equal(p.rows.filter((r) => r.id === "u-jan").length, 1);
  assert.equal(p.adds.INT.filter((x) => x === "u-jan").length, 1);
});

test("a dynamic or missing target group is refused, never written", () => {
  const d = DG.demo();
  d.targets.EXT.dynamic = true; delete d.targets.SA;
  const p = run({ targets: d.targets });
  assert.deepEqual(p.refusals.map((r) => r.key).sort(), ["EXT", "SA"]);
  assert.equal(p.adds.EXT.length, 0); assert.equal(p.adds.SA.length, 0);
});

test("nested members cannot be removed and are reported", () => {
  const d = DG.demo();
  d.targets.INT.nested.add("u-marco");
  const p = run({ targets: d.targets });
  assert.ok(p.nestedOnly.some((n) => n.id === "u-marco" && n.key === "INT"));
  assert.ok(!p.removes.INT.includes("u-marco"));
});

test("settled(): already a member / not a member count as done", () => {
  assert.ok(DG.settled({ op: "add" }, { error: "One or more added object references already exist for the following modified properties: 'members'.", status: 400 }).already);
  assert.ok(DG.settled({ op: "remove" }, { error: "Resource does not exist", status: 404 }).already);
  assert.equal(DG.settled({ op: "add" }, { error: "Insufficient privileges", status: 403 }).ok, false);
});

test("undo reverses only what this run changed: re-adds first, then removes the adds", () => {
  const u = DG.undoOps([{ op: "add", key: "EXT", group: "g1", user: "a", ok: true }, { op: "remove", key: "INT", group: "g2", user: "a", ok: true }, { op: "add", key: "GLO", group: "g3", user: "b", ok: true, already: true }, { op: "add", key: "SA", group: "g4", user: "c", ok: false }]);
  assert.deepEqual(u.map((x) => `${x.op}:${x.key}`), ["add:INT", "remove:EXT"]);
});

test("request(): POST $ref for adds, DELETE $ref for removals", () => {
  assert.equal(DG.request({ op: "add", group: "g", user: "u" }, 0).method, "POST");
  assert.match(DG.request({ op: "add", group: "g", user: "u" }, 0).body["@odata.id"], /directoryObjects\/u$/);
  assert.equal(DG.request({ op: "remove", group: "g", user: "u" }, 1).url, "/groups/g/members/u/$ref");
});

test("report and CSV carry every change; the report is plain Markdown", () => {
  const d = DG.demo(); const p = run();
  const md = DG.report({ tenant: "Contoso" }, p, d.targets);
  assert.match(md, /CAD-SEC-U-DG-SA/); assert.match(md, /svc-build@contoso-adm.com/);
  const c = DG.csv(p);
  assert.match(c, /r\.tan@contoso\.com/);
  assert.equal(c.split("\r\n").length, p.rows.length + 1);
});

test("wired: script tag, button, modal", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /<script src="js\/dgfill\.js\?v=\d+"><\/script>/);
  assert.match(html, /id="cgDgFill"/);
  assert.match(html, /id="dgModal"/);
});
