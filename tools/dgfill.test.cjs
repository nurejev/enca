// 🌍 Fill deploy groups from regions (js/dgfill.js, beta 32432).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const DG = require("../js/dgfill.js");

const run = (over, opts) => { const d = DG.demo(); return DG.plan({ sources: DG.classifySources(d.groups).rows.filter((r) => r.ticked), members: d.members, guests: d.guests, second: d.second, mains: d.mains, targets: d.targets, ...(over || {}) }, opts); };
const row = (p, id) => p.rows.find((r) => r.id === id);

test("sources: country groups found by rule, region list ticked, Unlicensed ticked, DISABELD/TEST ignored", () => {
  const P = DG.DEFAULTS.prefix;
  const rule = (cc) => `(user.usageLocation -eq "${cc}") and (user.assignedPlans -any (assignedPlan.servicePlanId -eq "x"))`;
  const { rows, missing } = DG.classifySources([
    { id: "1", displayName: P + "UAE", membershipRule: rule("AE") },
    { id: "2", displayName: P + "SK", membershipRule: rule("SK") },
    { id: "3", displayName: P + "NL-Breda", membershipRule: '(user.usageLocation -eq "NL") and (user.city -eq "Breda")' },
    { id: "4", displayName: P + "Unlicensed-L-P", membershipRule: '(user.userType -ne "Guest") and (user.accountEnabled -eq true)' },
    { id: "5", displayName: P + "DISABELD", membershipRule: "(user.accountEnabled -eq false)" },
    { id: "6", displayName: P + "TEST", membershipRule: '(user.displayName -match "^a")' },
    { id: "7", displayName: P + "POL-SKARB", membershipRule: '(user.city -eq "Skarbimierz Osiedle")' },
    { id: "8", displayName: "Other-group", membershipRule: "" },
  ]);
  const by = (n) => rows.find((r) => r.suffix === n);
  assert.equal(by("UAE").kind, "country"); assert.equal(by("UAE").country, "AE"); assert.equal(by("UAE").region, "BAMSCA"); assert.ok(by("UAE").ticked);
  assert.equal(by("SK").region, "Not in your region list"); assert.equal(by("SK").ticked, false);
  assert.equal(by("NL-Breda").kind, "site"); assert.equal(by("NL-Breda").ticked, false);
  assert.equal(by("Unlicensed-L-P").kind, "unlicensed"); assert.ok(by("Unlicensed-L-P").ticked);
  assert.equal(by("DISABELD").kind, "ignored"); assert.equal(by("TEST").kind, "ignored");
  assert.equal(by("POL-SKARB").kind, "site"); assert.ok(by("POL-SKARB").ticked, "on Mihai's list");
  assert.ok(!rows.some((r) => r.name === "Other-group"));
  assert.ok(missing.some((m) => m.name === P + "NL"), "a listed group the tenant lacks is reported");
  assert.equal(rows.find((r) => r.suffix === "BE"), undefined);
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
  assert.deepEqual(row(p, "u-raj-adm").add, ["ADM"], "onmicrosoft.com second account pairs on the part before the @");
  assert.ok(row(p, "u-anna").add.includes("DevOps"));
  assert.ok(row(p, "u-raj").add.includes("DevOps"));
  assert.ok(!row(p, "u-svc").add.includes("GLO"), "second accounts get nothing else");
  assert.deepEqual(p.unpaired, ["svc-build@pvmict.com"]);
});

test("a guest whose UPN ends in the onmicrosoft.com domain is a guest, not a second account", () => {
  const d = DG.demo();
  const p = run({ second: [...d.second, d.guests[0]] });
  assert.deepEqual(row(p, "u-guest").add.sort(), ["GLO", "GUESTUSERS"]);
  assert.ok(!p.unpaired.some((u) => /#EXT#/.test(u)));
});

test("rule 0c: a user only in an Unlicensed group goes to SA and is FIXED out of GLO and INT", () => {
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

test("a Pole in both -PL and POL-SKARB counts once", () => {
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
  assert.match(md, /CAD-SEC-U-DG-SA/); assert.match(md, /svc-build@pvmict.com/);
  const c = DG.csv(p);
  assert.match(c, /r\.tan@perfettivanmelle\.com/);
  assert.equal(c.split("\r\n").length, p.rows.length + 1);
});

test("wired: script tag, button, modal", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /<script src="js\/dgfill\.js\?v=\d+"><\/script>/);
  assert.match(html, /id="cgDgFill"/);
  assert.match(html, /id="dgModal"/);
});
