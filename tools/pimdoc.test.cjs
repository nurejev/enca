// 📄 PIM documentation (T58) — the handover generated from the catalog,
// offline: every profile builds, the chapters follow the profile, the page
// and the Markdown carry the same chapters and diagrams, names are escaped.
// Run: node --test tools/pimdoc.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const PD = new Function(read("js/pimdoc.js") + ";return PimDoc;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const tenant = () => { const d = clone(DEMO.pim); return { roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, aus: d.aus, named: d.named, domain: "contoso.nl" }; };
const who = { name: "Contoso", domain: "contoso.nl", id: "demo" };
const build = (id, extra = {}) => PD.build(Object.assign({ cat: PB.profile(CAT, id, { modules: extra.modules || [] }), PB, tenant: who, regions: null, res: null, demo: true, build: "test" }, extra));

test("every profile builds; the chapters follow the profile and number up from 1", () => {
  for (const id of PB.profileIds(CAT)) {
    const doc = build(id);
    assert.ok(doc.chapters.length >= 10, `${id}: ${doc.chapters.length} chapters`);
    doc.chapters.forEach((c, i) => { assert.equal(c.n, i + 1); assert.ok(c.blocks.length, `${id} ${c.id}: empty`); });
    assert.equal(doc.chapters.some((c) => c.id === "regions"), !!PB.profile(CAT, id).profile.regions, `${id}: Regions only in a multi-region profile`);
    assert.equal(doc.meta.source, "as designed");
  }
});

test("ticked chapters: only those, the numbering closes up; none ticked → no chapters", () => {
  const doc = build("multi", { chapters: new Set(["tiers", "outside"]) });
  assert.deepEqual(doc.chapters.map((c) => `${c.n}:${c.id}`), ["1:tiers", "2:outside"]);
  assert.equal(build("multi", { chapters: new Set() }).chapters.length, 0);
  assert.equal(build("small", { chapters: new Set(["regions", "model"]) }).chapters.length, 1, "a chapter the profile has not got is not drawn even when ticked");
});

test("the model chapter names the profile, the variant and the modules; the tiers table carries every setting", () => {
  const cat = PB.profile(CAT, "large", { modules: ["rh", "w365"] });
  cat.variant = { name: "Contoso v2", changes: 3 };
  const doc = PD.build({ cat, PB, tenant: who, regions: null, res: null, demo: true });
  const model = doc.chapters.find((c) => c.id === "model");
  const first = model.blocks.find((b) => b.t === "p").text;
  assert.match(first, /Large · one region/); assert.match(first, /Contoso v2 \(3 changes/); assert.match(first, /Remote Help, Windows 365/);
  assert.deepEqual(doc.meta.modules, ["Remote Help", "Windows 365"]);
  const tiers = doc.chapters.find((c) => c.id === "tiers");
  const tbl = tiers.blocks.find((b) => b.t === "table");
  assert.deepEqual(tbl.head, ["Setting", "Tier 0", "Tier 1", "Tier 2", "Readers"]);
  assert.equal(tbl.rows.length, 13);
  const act = tbl.rows.find((r) => r[0] === "Activation lasts");
  assert.equal(act[1], "2 h");
  const appr = tbl.rows.find((r) => r[0] === "Approval");
  assert.equal(appr[1], "yes"); assert.equal(appr[2], "no");
  const intune = doc.chapters.find((c) => c.id === "intune");
  assert.ok(intune.blocks.some((b) => b.t === "table" && b.rows.some((r) => /INT-RBAC-/.test(r[0]))));
  assert.ok(intune.blocks.some((b) => b.t === "h" && /Modules switched on/.test(b.text)));
});

test("+ as found: an In this tenant column on the role and group tables, with the verdict and the differences", () => {
  const cat = PB.profile(CAT, "multi");
  const res = PB.compare(cat, tenant());
  const doc = PD.build({ cat, PB, tenant: who, regions: null, res, demo: true });
  assert.equal(doc.meta.source, "as designed + as found");
  const tiers = doc.chapters.find((c) => c.id === "tiers");
  const t0 = tiers.blocks.filter((b) => b.t === "table")[1];
  assert.equal(t0.head[t0.head.length - 1], "In this tenant");
  const ga = t0.rows.find((r) => r[0] === "Global Administrator");
  assert.ok(ga, "Global Administrator is a Tier 0 row");
  assert.match(ga[ga.length - 1], /as designed|differs|missing|not read|conflict/);
  const groups = doc.chapters.find((c) => c.id === "groups").blocks.find((b) => b.t === "table");
  assert.equal(groups.head[groups.head.length - 1], "In this tenant");
  const missing = res.groups.find((g) => !g.present);
  if (missing) { const row = groups.rows.find((r) => r[0] === missing.name); assert.match(row[row.length - 1], /missing — not in the tenant/); }
  // without a read there is no such column
  const plain = build("multi");
  assert.ok(!plain.chapters.find((c) => c.id === "groups").blocks.find((b) => b.t === "table").head.includes("In this tenant"));
});

test("regions: the template, and the customer's rows when a file is loaded", () => {
  const rows = PB.parseRegions(CAT.regions.example, CAT).rows;
  assert.equal(rows.length, 2);
  const doc = build("multi", { regions: rows });
  const reg = doc.chapters.find((c) => c.id === "regions");
  assert.ok(reg.blocks.some((b) => b.t === "h" && /Your regions · 2/.test(b.text)));
  const yours = reg.blocks.filter((b) => b.t === "table").pop();
  assert.deepEqual(yours.rows.map((r) => r[0]), ["EURO", "AMER"]); assert.match(yours.rows[0][2], /usageLocation GB, BE/);
  assert.match(yours.rows[0][yours.rows[0].length - 1], /^3 · \d+ · 8$/, "units · groups · eligibilities");
  assert.ok(reg.blocks.some((b) => b.t === "svg" && /EURO/.test(b.svg)), "the diagram draws the first region");
  assert.equal(doc.meta.regions, 2);
  const none = build("multi");
  assert.ok(none.chapters.find((c) => c.id === "regions").blocks.some((b) => b.t === "note" && /No regions file/.test(b.text)));
});

test("render: contents list, one section per chapter, the diagrams inline, a hostile name escaped", () => {
  const cat = PB.profile(CAT, "multi");
  cat.groups = cat.groups.map((g) => (g.name === "PIM-SG-M365-Ops" ? Object.assign({}, g, { description: "<img src=x onerror=alert(1)> & co" }) : g));
  const doc = PD.build({ cat, PB, tenant: who, regions: null, res: null, demo: true });
  const html = PD.render(doc);
  assert.equal((html.match(/<section class="pdoc-ch"/g) || []).length, doc.chapters.length);
  // 32617: the rail and the narrow-window bar each carry one jump per chapter;
  // every chapter but the last ends on Next, and every one on Back to the top.
  assert.equal((html.match(/class="pdoc-rl[ "]/g) || []).length, doc.chapters.length);
  assert.equal((html.match(/class="pdoc-bl"/g) || []).length, doc.chapters.length);
  assert.equal((html.match(/data-pdcjump=/g) || []).length, 2 * doc.chapters.length);
  assert.equal((html.match(/data-pdcto="top"/g) || []).length, doc.chapters.length);
  assert.equal((html.match(/data-pdcto="(?!top)/g) || []).length, doc.chapters.length - 1);
  assert.equal((html.match(/ class="pdoc-rl on"/g) || []).length, 1, "the first chapter is marked before any scroll");
  assert.ok(!/PIM documentation —/.test(html), "the sheet opens on the tenant, not a second tool title");
  assert.ok(html.includes('<h2 class="pdoc-title">'));
  assert.equal((html.match(/<svg /g) || []).length, 3, "how access flows, the four tiers, one region");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt; &amp; co"));
  assert.ok(!html.includes("<img src=x"));
});

test("toMd: document control, a contents page of every chapter, every diagram embedded, tables with a pipe escaped", () => {
  const rows = PB.parseRegions(CAT.regions.example, CAT).rows;
  const cat = PB.profile(CAT, "multi");
  cat.roles = cat.roles.map((r) => (r.name === "Exchange Administrator" ? Object.assign({}, r, { note: "a | pipe" }) : r));
  const res = PB.compare(cat, tenant()); res.readAt = Date.UTC(2026, 9, 14, 12, 40);
  const doc = PD.build({ cat, PB, tenant: who, regions: rows, res, demo: true, build: "v2.0.4-beta.9" });
  const md = PD.toMd(doc);
  assert.match(md, /^# 📄 PimBuddy PIM documentation — Contoso · Large · multi-region/);
  assert.match(md, /\| Source \| as designed \+ as found, tenant read 2026-10-14 12:40 UTC \|/);
  assert.match(md, /\| Generated \| .* by ENCA v2\.0\.4-beta\.9 T58 · demo data \|/);
  assert.match(md, /## Contents\n\n1\. \[The model\]\(#1-the-model\)\n2\. \[Tiers and role settings\]\(#2-tiers-and-role-settings\)/);
  assert.equal((md.match(/!\[[^\]]*\]\(data:image\/svg\+xml;base64,/g) || []).length, 3);
  doc.chapters.forEach((c) => assert.ok(md.includes(`\n# ${c.n} ${c.title}\n`), c.title));
  assert.ok(md.includes("a \\| pipe"));
  assert.ok(!/<(b|i|code|br)>/.test(md.replace(/data:image[^)]*/g, "")), "no HTML in the Markdown");
});

test("human and settingText read like the screen", () => {
  assert.equal(PD.human("PT2H"), "2 h"); assert.equal(PD.human("P365D"), "365 days"); assert.equal(PD.human(true), "yes"); assert.equal(PD.human([]), "none");
  assert.equal(PD.settingText("enablement", ["MultiFactorAuthentication", "Justification"]), "MFA + justification");
  assert.equal(PD.settingText("enablement", []), "nothing");
  assert.equal(PD.settingText("authContext", null), "none");
});

test("flowSvg (32617): the Administrator spans both lanes and each path leaves it straight, its label above the line", () => {
  const svg = PD.flowSvg(PB.profile(CAT, "multi"), null);
  assert.ok(svg.includes('<rect x="16" y="44" width="150" height="248"'), "one Administrator box for both lanes");
  assert.ok(svg.includes('M166 82 C 208 82, 208 82, 250 82'), "active member: a straight line");
  assert.ok(/<text x="208" y="76"[^>]*>active member</.test(svg), "its label sits above the line");
  assert.ok(/M166 254 C 208 254, 208 254, 250 254" fill="none" stroke="[^"]+" stroke-width="1.5" stroke-dasharray="5 4"/.test(svg), "eligible member: dashed, the slow path");
  assert.ok(/<text x="208" y="248"[^>]*>eligible member</.test(svg));
});
