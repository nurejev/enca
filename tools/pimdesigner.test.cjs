// 🧾 T50 Designer (js/pimdesigner.js), offline.
// Run: node --test tools/pimdesigner.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const PP = new Function(read("js/pimplan.js") + ";return PimPlan;")();
const PB = new Function(read("js/pimbaseline.js") + ";return PimBaseline;")();
const PD = new Function(read("js/pimdesigner.js") + ";return PimDesigner;")();
const CAT = new Function(read("js/pimBaselineData.js") + ";return PIM_BASELINE;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const LARGE = PB.profile(CAT, "large");

test("a variant holds only its differences; setting the framework's value removes the change", () => {
  let v = PD.blank(LARGE, "large");
  assert.ok(PD.isEmpty(v));
  v = PD.set(v, LARGE, "Tier1", "ActivationDuration", "PT4H");
  assert.deepEqual(v.templates, { Tier1: { ActivationDuration: "PT4H" } });
  v = PD.set(v, LARGE, "Tier1", "ActivationDuration", LARGE.templates.Tier1.ActivationDuration);
  assert.deepEqual(v.templates, {});
  v = PD.setRole(v, LARGE, "Exchange Administrator", "Tier0");
  assert.equal(PD.diff(LARGE, v)[0].to, "Tier0");
  assert.equal(PD.setRole(v, LARGE, "Exchange Administrator", "Tier1").roles["Exchange Administrator"], undefined);
});

test("validate: Entra's refusals are errors, weakening Tier 0 is a warning", () => {
  let v = PD.set(PD.blank(LARGE), LARGE, "Tier0", "ActivationRequirement", "MultiFactorAuthentication,Justification");
  assert.ok(PD.validate(v, LARGE).errors.some((e) => /MFA on activation together with an authentication context/.test(e)));
  v = PD.set(PD.blank(LARGE), LARGE, "Tier1", "ApprovalRequired", true);
  assert.ok(PD.validate(v, LARGE).errors.some((e) => /approval with no approver group/.test(e)));
  v = PD.set(PD.set(PD.blank(LARGE), LARGE, "Tier0", "ApprovalRequired", false), LARGE, "Tier0", "AuthenticationContext_Enabled", false);
  const r = PD.validate(v, LARGE);
  assert.deepEqual(r.errors, []); assert.ok(r.warnings.some((w) => /on MFA alone/.test(w)));
  assert.ok(PD.validate(Object.assign(PD.blank(LARGE), { templates: { Tier1: { ActivationDuration: "PT3H" } } }), LARGE).errors.length);
  assert.ok(PD.validate(Object.assign(PD.blank(LARGE), { mailbox: "soc; drop" }), LARGE).errors.length);
});

test("apply: T48 compares against the variant — the customer's hours match, the mailbox and approvers are theirs", () => {
  let v = PD.set(PD.blank(LARGE), LARGE, "Tier1", "ActivationDuration", "PT24H");
  v = Object.assign(v, { name: "Contoso", mailbox: "soc", approvers: { "PIM-SG-Approvers-Tier0": "PIM-SG-Contoso-Approvers" } });
  const cat = PD.apply(LARGE, v);
  assert.equal(cat.templates.Tier1.ActivationDuration, "PT24H");
  assert.deepEqual(cat.templates.Tier0.Approvers, ["PIM-SG-Contoso-Approvers"]);
  assert.deepEqual(cat.templates.Tier0.Notification_Activation_Alert.Recipients, ["soc"]);
  assert.equal(LARGE.templates.Tier1.ActivationDuration, "PT2H", "the framework itself is untouched");
  const d = DEMO.pim;
  const t = { roles: d.roleDefinitions, policies: d.policies, eligible: d.eligible, active: d.active, groups: d.groups, groupPolicies: d.groupPolicies, names: d.names, aus: d.aus, named: d.named, domain: "contoso.nl" };
  const ex = (c) => PB.compare(c, t).rows.find((r) => r.name === "Exchange Administrator");
  assert.ok(ex(LARGE).diffs.some((x) => x.key === "activation"), "24 h differs from the framework");
  assert.ok(!ex(cat).diffs.some((x) => x.key === "activation"), "24 h is what this customer wants");
  assert.equal(PB.compare(cat, t).catalog.variant.name, "Contoso");
});
