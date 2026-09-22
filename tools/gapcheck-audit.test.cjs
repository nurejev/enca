// T08 audit, build 25470 — each test is a defect the audit found in
// js/gapcheck.js. Run: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error,
  Render: { caGroup: (n) => { const m = /^CA(\d{3,4})/.exec(n || ""); if (!m) return null; const num = +m[1]; return { num, key: num < 100 ? 0 : Math.floor(num / 100) * 100 }; } },
  Brand: { generatedBy: () => "" }, toolHead: () => "" };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root, "js/gapcheck.js"), "utf8") + "\n;globalThis.G=GapCheck;", box);
const { G } = box;

const pol = (displayName, conditions, grantControls, state) => ({
  id: displayName, displayName, state: state || "enabled",
  conditions: { users: { includeUsers: ["All"], excludeGroups: ["bg"] }, applications: { includeApplications: ["All"] }, ...conditions },
  grantControls,
});
const run = (ps, ctx) => G.run(ps, ctx || {});
const titles = (r) => r.findings.map((f) => f.title);
const MFA_ALL = pol("MFA all", {}, { operator: "OR", builtInControls: ["mfa"] });
const LEGACY_ALL = pol("Legacy block", { clientAppTypes: ["exchangeActiveSync", "other"] }, { operator: "OR", builtInControls: ["block"] });

test("MFA for all users on ONE app does not count as MFA for all users", () => {
  const oneApp = pol("MFA one app", { applications: { includeApplications: ["00000002-0000-0ff1-ce00-000000000000"] } }, { operator: "OR", builtInControls: ["mfa"] });
  const r = run([oneApp, LEGACY_ALL]);
  assert.ok(titles(r).includes("MFA for all users exists only for selected resources"));
  const ok = run([MFA_ALL, LEGACY_ALL]);
  assert.ok(!ok.findings.some((f) => f.category === "MFA Coverage"));
});

test("a legacy block scoped to one group is reported as not tenant-wide", () => {
  const narrow = pol("Legacy block pilot", { users: { includeGroups: ["pilot"] }, clientAppTypes: ["exchangeActiveSync", "other"] }, { operator: "OR", builtInControls: ["block"] });
  const r = run([MFA_ALL, narrow]);
  const f = r.findings.find((x) => x.title === "Legacy authentication is blocked, but not tenant-wide");
  assert.ok(f);
  assert.match(f.description, /not all users/);
  assert.ok(!titles(run([MFA_ALL, LEGACY_ALL])).includes("Legacy authentication is blocked, but not tenant-wide"));
});

test("MFA OR compliant device is the Microsoft template — low, not high", () => {
  const p = pol("Template", {}, { operator: "OR", builtInControls: ["mfa", "compliantDevice", "domainJoinedDevice"] });
  const f = run([p, LEGACY_ALL]).findings.find((x) => x.category === "Swiss Cheese Model" && x.policyId === "Template");
  assert.equal(f.severity, "low");
  assert.match(f.title, /Microsoft template/);
});

test("MFA OR app protection is a real way around MFA", () => {
  const p = pol("MAM or MFA", {}, { operator: "OR", builtInControls: ["mfa", "compliantApplication"] });
  const f = run([p, LEGACY_ALL]).findings.find((x) => x.category === "Swiss Cheese Model" && x.policyId === "MAM or MFA");
  assert.equal(f.severity, "medium");
  assert.match(f.description, /without a second factor/);
});

test("guest MFA is not a finding — only a strength guests cannot complete here", () => {
  const guestMfa = pol("CA400", { users: { includeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest" } } }, { operator: "OR", builtInControls: ["mfa"] });
  assert.ok(!run([MFA_ALL, LEGACY_ALL, guestMfa]).findings.some((f) => f.category === "Guest Authentication Strength"));
  const strengths = new Map([["pr", { id: "pr", displayName: "Phishing-resistant MFA", allowedCombinations: ["fido2", "windowsHelloForBusiness"] }],
    ["mfa", { id: "mfa", displayName: "Multifactor authentication", allowedCombinations: ["password,sms", "fido2"] }]]);
  const pr = pol("CA500", { users: { includeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest" } } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "pr" } });
  const m = pol("CA401", { users: { includeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest" } } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "mfa" } });
  const r = run([MFA_ALL, LEGACY_ALL, pr, m], { strengths });
  const g = r.findings.filter((f) => f.category === "Guest Authentication Strength");
  assert.equal(g.length, 1);
  assert.equal(g[0].policyId, "CA500");
});

test("a guest-only policy is not asked to exclude the break-glass account", () => {
  const guestOnly = { id: "g", displayName: "Guests only", state: "enabled",
    conditions: { users: { includeUsers: ["GuestsOrExternalUsers"] }, applications: { includeApplications: ["All"] } },
    grantControls: { operator: "OR", builtInControls: ["mfa"] } };
  const r = run([MFA_ALL, LEGACY_ALL, guestOnly]);
  assert.ok(!r.findings.some((f) => f.category === "Break-Glass Coverage" && f.policyId === "g"));
});
