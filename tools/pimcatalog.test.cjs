// 🧱 Update the catalog from cloudfellows.dev (js/pimcatalog.js), offline:
// the proposal puts each value where the catalog keeps it, and the edit of
// js/pimBaselineData.js changes exactly those values and nothing else.
// Run: node --test tools/pimcatalog.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const PC = new Function(read("js/pimcatalog.js") + ";return PimCatalog;")();
const SRC = read("js/pimBaselineData.js");
const load = (t) => new Function(t + ";return PIM_BASELINE;")();
const CAT = load(SRC);
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const clone = (o) => JSON.parse(JSON.stringify(o));
const tenant = (mut) => { const d = clone(DEMO.pim); const t = { roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, names: d.names, aus: d.aus, named: d.named, domain: "contoso.nl" }; if (mut) mut(t); return t; };
const setRule = (rules, id, f) => { const r = rules.find((x) => x.id === id); f(r); };

test("one role differs → an override on that role; the file edit changes exactly that value", () => {
  const cat = PB.profile(CAT, "multi");
  const res = PB.compare(cat, tenant());
  const p = PC.propose(CAT, res, "multi");
  const ex = p.changes.find((c) => c.role === "Exchange Administrator" && c.key === "ActivationDuration");
  assert.ok(ex, "Exchange's 24 hours is proposed");
  assert.equal(ex.path, 'roles["Exchange Administrator"].override'); assert.equal(ex.to, "PT24H"); assert.equal(ex.from, "PT2H");
  const out = PC.applyRevision(SRC, [ex], "2026-09-28");
  const cat2 = load(out);
  assert.deepEqual(cat2.roles.find((r) => r.name === "Exchange Administrator").override, { ActivationDuration: "PT24H" });
  assert.equal(cat2.revised, "2026-09-28");
  // Nothing else moved: the files differ in exactly two lines.
  const a = SRC.split("\n"), b = out.split("\n");
  assert.equal(a.length, b.length);
  assert.equal(a.filter((l, i) => l !== b[i]).length, 2);
});

test("every role of a tier agrees → the template changes, in the profile when the profile keeps that key", () => {
  const cat = PB.profile(CAT, "large");
  const t = tenant((x) => { cat.roles.filter((r) => r.template === "Tier2").forEach((r) => { if (x.policies[r.name]) setRule(x.policies[r.name], "Notification_Admin_EndUser_Assignment", (rr) => { rr.notificationLevel = "All"; }); }); cat.roles.filter((r) => r.template === "Tier0").forEach((r) => { if (x.policies[r.name]) setRule(x.policies[r.name], "Enablement_EndUser_Assignment", (rr) => { rr.enabledRules = ["Justification"]; }); }); });
  const res = PB.compare(cat, t);
  const p = PC.propose(CAT, res, "large");
  const t2 = p.changes.find((c) => c.path === "templates.Tier2" && c.key === "Notification_Activation_Alert.notificationLevel");
  assert.ok(t2, "Tier2 alert level in the base template"); assert.equal(t2.to, "All");
  const t0 = p.changes.find((c) => c.key === "ActivationRequirement" && c.tier === "Tier0");
  assert.equal(t0.path, "profiles.large.templates.Tier0", "large overrides Tier0's ActivationRequirement, so the edit goes there");
  assert.equal(t0.to, "Justification");
  const out = PC.applyRevision(SRC, [t2, t0]);
  const c2 = load(out);
  assert.equal(c2.templates.Tier2.Notification_Activation_Alert.notificationLevel, "All");
  assert.equal(c2.templates.Tier2.Notification_Activation_Alert.Recipients[0], "pim-alerts", "the rest of the object kept");
  assert.equal(c2.profiles.large.templates.Tier0.ActivationRequirement, "Justification");
  assert.equal(c2.templates.Tier0.ActivationRequirement, CAT.templates.Tier0.ActivationRequirement, "the base template untouched");
});

test("a key absent from a block is added; recipients and absent rules are never proposed", () => {
  const out = PC.applyRevision(SRC, [{ path: "templates.Reader", key: "ApprovalRequired", to: true }, { path: 'roles["Teams Administrator"].override', key: "ActivationDuration", to: "PT4H" }]);
  const c = load(out);
  assert.equal(c.templates.Reader.ApprovalRequired, true);
  assert.deepEqual(c.roles.find((r) => r.name === "Teams Administrator").override, { ActivationDuration: "PT4H" });
  const res = PB.compare(PB.profile(CAT, "multi"), tenant((x) => { x.policies["Global Reader"] = x.policies["Global Reader"].filter((r) => r.id !== "Expiration_EndUser_Assignment"); }));
  const p = PC.propose(CAT, res, "multi");
  assert.ok(!p.changes.some((c) => /Recipients/.test(c.key)));
  assert.ok(!p.changes.some((c) => c.role === "Global Reader" && c.key === "ActivationDuration"));
});
