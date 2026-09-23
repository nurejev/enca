// Capabilities.check on writes (build 25491).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const box = {}; vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "capabilities.js"), "utf8") + ";globalThis.C=Capabilities;", box);
const { C } = box;
const sku = (plans) => [{ capabilityStatus: "Enabled", skuPartNumber: "SPB", servicePlans: plans.map((n) => ({ servicePlanName: n, servicePlanId: n === "AAD_PREMIUM_P2" ? "eec0eb4f-6444-4f95-aba0-50c24d67f998" : n === "AAD_PREMIUM" ? "41781fb2-bc02-4b7c-bd55-b576c07bb09d" : n, provisioningStatus: "Success" })) }];
const ir = { conditions: { insiderRiskLevels: "moderate", users: { includeUsers: ["All"] } } };

test("Adaptive Protection is recognised from the Insider Risk Management plans", () => {
  assert.equal(C.fromSkus(sku(["AAD_PREMIUM", "AAD_PREMIUM_P2", "INSIDER_RISK"])).purview, true);
  assert.equal(C.fromSkus(sku(["AAD_PREMIUM", "INSIDER_RISK_MANAGEMENT"])).purview, true);
  assert.equal(C.fromSkus(sku(["AAD_PREMIUM"])).purview, null, "no match is unknown, not false");
});

test("editing a policy that already carries insider risk is not blocked on unknown evidence", () => {
  const ev = C.fromSkus(sku(["AAD_PREMIUM"]));             // purview unknown
  assert.equal(C.check(ir, ev).ok, false, "a NEW insider-risk policy still needs proof");
  const already = C.requirements(ir);
  assert.equal(C.check(ir, ev, already).ok, true, "the same requirement, kept by an edit, passes");
  // but ADDING a requirement the tenant cannot be shown to have is still stopped
  const withRisk = { conditions: { ...ir.conditions, userRiskLevels: ["high"] } };
  const r = C.check(withRisk, ev, already);
  assert.equal(r.ok, false);
  assert.deepEqual(JSON.parse(JSON.stringify(r.missing)), ["p2"]);
});

test("25492: the Purview Suite for Business Premium SKU counts, whatever its plans are called", () => {
  const skus = [{ capabilityStatus: "Enabled", skuPartNumber: "Microsoft_Purview_Suite_for_Business_Premium", servicePlans: [{ servicePlanName: "SOMETHING_NEW", servicePlanId: "x", provisioningStatus: "Success" }] }];
  assert.equal(C.fromSkus(skus).purview, true);
  assert.equal(C.fromSkus([{ capabilityStatus: "Enabled", skuPartNumber: "SPE_E5", servicePlans: [] }]).purview, true);
  assert.equal(C.fromSkus([{ capabilityStatus: "Enabled", skuPartNumber: "ENTERPRISEPREMIUM", servicePlans: [] }]).purview, null, "Office 365 E5 does not carry Insider Risk Management");
});

test("25492: an unverified requirement names the subscriptions that were read", () => {
  const ev = C.fromSkus([{ capabilityStatus: "Enabled", skuPartNumber: "SPB", servicePlans: [{ servicePlanName: "AAD_PREMIUM", servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", provisioningStatus: "Success" }] }]);
  const r = C.check({ conditions: { insiderRiskLevels: "moderate" } }, ev);
  assert.match(r.reason, /Purview Adaptive Protection could not be verified from the active subscriptions \(SPB\)/);
  assert.match(C.check({ conditions: { insiderRiskLevels: "moderate" } }, C.fromSkus(null)).reason, /could not be read/);
});
