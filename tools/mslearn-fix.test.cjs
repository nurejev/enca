// T07 🧰 Fix in the baseline tenant, build 32303 — Mihai: "these issues found
// may be fixed with a fix button … then it can be set ready for updating the
// baseline for CloudFellows; now it's too much manual work". He chose PATCH IN
// PLACE, removing the control from the devices' own policy when the group is
// its only include, and Accept-with-a-reason for findings with no fix.
// Run: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(box);
vm.runInContext("const Baseline = undefined; function toolHead(){ return ''; }", box);
vm.runInContext(fs.readFileSync(path.join(root, "js/mslearn.js"), "utf8"), box, { filename: "mslearn.js" });
vm.runInContext("globalThis.M = MSLearn;", box);
const { M } = box;

const SD = { id: "sd-group", name: "CAB-SEC-U-TeamsSharedDevices" };
const pol = (displayName, users, grantControls, sessionControls, extra) => ({
  id: displayName, displayName, state: "disabled",
  conditions: { users, applications: { includeApplications: ["All"] }, ...(extra || {}) },
  grantControls: grantControls || null, sessionControls: sessionControls || null,
});
const run = (ps) => M.run(ps, new Map(), { includeDisabled: true, groups: { sharedDevices: SD } });
const sd = (fs_) => fs_.filter((f) => f.check.id === "shared-device-unsupported");

const TOU = pol("CA017-SESSION-Global-COMP-AllApps-AnyPlatform-Require TOU-v3.0.1",
  { includeUsers: ["All"], excludeGroups: ["bg"] }, { operator: "OR", builtInControls: [], termsOfUse: ["tou-1"] });
const PB = pol("CA009-SESSION-Global-IP-AllApps-AnyPlatform-NeverPersistentBrowser-v3.0.1",
  { includeUsers: ["All"], excludeGroups: ["bg"] }, null, { persistentBrowser: { isEnabled: true, mode: "never" }, signInFrequency: null });
const OWN = pol("CA090-GRANT-Global-IP-AllApps-AnyPlatform-SharedDevices-v1.0",
  { includeGroups: ["sd-group"] }, { operator: "AND", builtInControls: ["compliantDevice"], termsOfUse: ["tou-1"] });

test("All users: the Fix excludes the shared-device group, and the in-place body carries only users + the bumped name", () => {
  const f = sd(run([TOU]));
  assert.equal(f.length, 1);
  const res = M.buildFixes(f, [TOU], { sharedDevices: SD });
  assert.equal(res.fixes.length, 1);
  const fx = res.fixes[0];
  assert.equal(fx.newName, "CA017-SESSION-Global-COMP-AllApps-AnyPlatform-Require TOU-v3.0.2");
  const body = M.patchBody(fx.raw, fx.draft);
  assert.deepEqual(Object.keys(body).sort(), ["conditions", "displayName"]);
  assert.ok(body.conditions.users.excludeGroups.includes("sd-group"));
  assert.ok(!("state" in body), "an in-place fix never changes the state");
});

test("the devices' own policy (group is its only include): the unsupported control comes OUT, not an exclusion", () => {
  const f = sd(run([OWN]));
  assert.equal(f.length, 1);
  assert.equal(f[0].result.viaGroup, true);
  assert.ok(f[0].result.blockedControls.includes("termsOfUse"));
  const res = M.buildFixes(f, [OWN], { sharedDevices: SD });
  assert.equal(res.fixes.length, 1);
  const g = res.fixes[0].draft.grantControls;
  assert.deepEqual([...g.builtInControls], ["compliantDevice"]);
  assert.equal(g.termsOfUse.length, 0);
  assert.ok(!(res.fixes[0].draft.conditions.users.excludeGroups || []).includes("sd-group"), "never excluded from their own policy");
  // Surface Hub cannot be compliant, but compliant device IS this policy — it is named, not removed
  assert.match(res.fixes[0].changes[0], /Left as it is: Compliant device/);
});

test("own policy with other people in it too: no fix — removing the control would weaken it for them", () => {
  const mixed = pol("CA091-GRANT-Global-IP-AllApps-AnyPlatform-SharedAndStaff-v1.0",
    { includeGroups: ["sd-group", "staff"] }, { operator: "AND", builtInControls: ["compliantDevice"], termsOfUse: ["tou-1"] });
  const f = sd(run([mixed]));
  assert.equal(f.length, 1);
  const res = M.buildFixes(f, [mixed], { sharedDevices: SD });
  assert.equal(res.fixes.length, 0);
  assert.equal(res.skipped.length, 1);
});

test("a removed session control is written as an explicit null — a PATCH that omits it keeps it", () => {
  const own = pol("CA092-SESSION-Global-IP-AllApps-AnyPlatform-SharedDevices-v1.0",
    { includeGroups: ["sd-group"] }, { operator: "OR", builtInControls: ["compliantDevice"] }, { persistentBrowser: { isEnabled: true, mode: "never" } });
  const res = M.buildFixes(sd(run([own])), [own], { sharedDevices: SD });
  assert.equal(res.fixes.length, 1);
  const body = M.patchBody(res.fixes[0].raw, res.fixes[0].draft);
  assert.ok("sessionControls" in body);
  assert.ok(body.sessionControls === null || body.sessionControls.persistentBrowser === null);
  assert.ok(!("grantControls" in body), "an untouched section is not sent");
});

test("a strength taken off goes as authenticationStrength: null", () => {
  const raw = pol("CA500-GRANT-X-v1.0", { includeUsers: ["All"] }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "s1", displayName: "x" } });
  const draft = JSON.parse(JSON.stringify(raw));
  delete draft.id;
  draft.grantControls = { operator: "OR", builtInControls: ["mfa"] };
  const body = M.patchBody(raw, draft);
  assert.equal(body.grantControls.authenticationStrength, null);
  assert.deepEqual(body.grantControls.builtInControls, ["mfa"]);
});

test("acceptSig: the same check on the same policies matches in any order; another policy set does not", () => {
  const g = (ids) => ({ check: { id: "all-resources-exclusion-change" }, policies: ids.map((id) => ({ id })) });
  assert.equal(M.acceptSig(g(["b", "a"])), M.acceptSig(g(["a", "b"])));
  assert.notEqual(M.acceptSig(g(["a", "b"])), M.acceptSig(g(["a", "b", "c"])));
});

test("the shared-device band offers its Fix only with a count, and the accepted list escapes the reason", () => {
  const m = M.deviceMatrix([TOU, PB], { includeDisabled: true, groups: { sharedDevices: SD } });
  assert.match(M.renderDeviceMatrix(m, { fixN: 2 }), /data-mlapply="@devices"/);
  assert.doesNotMatch(M.renderDeviceMatrix(m, {}), /data-mlapply/);
  const html = M.renderAccepted([{ g: { check: { id: "x", title: "T" }, policies: [{ id: "a" }] }, a: { reason: "<b>kept</b>", at: "2026-09-23T10:00:00Z" } }]);
  assert.match(html, /&lt;b&gt;kept/);
});

test("a finding with a fix gets 🧰 Fix N on its head in the baseline tenant only", () => {
  const groups = M.group(sd(run([TOU, PB])));
  const on = M.renderGroups(groups, "all", new Set(), { canApply: true, fixable: new Map([["shared-device-unsupported", 2]]) });
  assert.match(on, /data-mlapply="shared-device-unsupported"[^>]*>🧰 Fix 2/);
  const off = M.renderGroups(groups, "all", new Set(), { canApply: false, fixable: new Map([["shared-device-unsupported", 2]]) });
  assert.doesNotMatch(off, /data-mlapply/);
});
