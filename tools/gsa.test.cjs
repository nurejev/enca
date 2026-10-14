// T56 🌐 Global Secure Access — js/gsa.js (pure). node --test tools/gsa.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const Gsa = require("../js/gsa.js");

const policy = (o) => ({ raw: Object.assign({ id: "p1", displayName: "CA215-BLOCK-Internals-CN", state: "enabledForReportingButNotEnforced", conditions: { users: { includeGroups: ["g-int"], excludeGroups: ["g-bg"] }, applications: { includeApplications: ["All"], excludeApplications: [Gsa.INTUNE_APP] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } }, grantControls: { builtInControls: ["block"] } }, o || {}) });

test("demo: the chain reads, the profile is partly on, the groups are the profile's and the policy's", () => {
  const m = Gsa.model(Gsa.demo(), [policy()]);
  assert.strictEqual(m.links.length, 8);
  const by = Object.fromEntries(m.links.map((l) => [l.k, l]));
  assert.strictEqual(by.licence.st, "ok");
  assert.strictEqual(by.tenant.st, "ok");
  assert.strictEqual(by.profile.st, "warn", "one traffic policy is off");
  assert.strictEqual(by.profile.fix, "profile");
  assert.strictEqual(by.location.st, "ok");
  assert.strictEqual(by.client.st, "bad");
  assert.strictEqual(by.client.fix, "winscript");
  assert.strictEqual(by.client.fix2, "macscript");
  assert.match(by.client.sub, /system extensions NOT ASSIGNED/, "devcf: the system extension policy has no assignment");
  assert.strictEqual(by.policy.st, "warn", "report-only");
  assert.deepStrictEqual(m.groupIds.sort(), ["g-gsa-pilot", "g-int"]);
  assert.ok(!m.groupIds.includes("g-bg"), "an excluded group is not a group GSA uses");
});

test("not onboarded: every link after the tenant waits, and the fix is activation", () => {
  const raw = Object.assign(Gsa.demo(), { status: { onboardingStatus: "offboarded" }, profile: null, signaling: null, locations: [] });
  const m = Gsa.model(raw, []);
  const by = Object.fromEntries(m.links.map((l) => [l.k, l]));
  assert.strictEqual(by.tenant.fix, "onboard");
  assert.strictEqual(by.profile.st, "wait");
  assert.strictEqual(by.signal.st, "wait");
  assert.strictEqual(by.location.fix, null, "no location before signalling");
  assert.strictEqual(m.verdict.cls, "bad");
});

test("cnPolicies: Intune and Enrollment exclusions and admin roles are reported, not judged away", () => {
  const ps = Gsa.cnPolicies([policy({ conditions: { users: { includeUsers: ["All"], excludeRoles: ["62e90394-69f5-4237-9190-012177145e10"] }, applications: { excludeApplications: [] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } } })], "loc-cn");
  assert.strictEqual(ps.length, 1);
  assert.strictEqual(ps[0].allUsers, true);
  assert.strictEqual(ps[0].intuneOut, false);
  assert.strictEqual(ps[0].excludeRoles.length, 1);
  assert.strictEqual(ps[0].shape, "block outside the compliant network");
  assert.strictEqual(Gsa.cnPolicies([policy()], "other-id").length, 0, "a policy naming another location is not one");
});

test("proof counts report-only results per policy and sign-ins through GSA", () => {
  const s = (r, gsa, u) => ({ userId: u, isThroughGlobalSecureAccess: gsa, appliedConditionalAccessPolicies: [{ id: "p1", result: r }] });
  const pr = Gsa.proof([s("reportOnlyFailure", false, "a"), s("reportOnlyFailure", false, "a"), s("reportOnlySuccess", true, "b"), s("notApplied", false, "c")], ["p1"]);
  assert.strictEqual(pr.total, 4);
  assert.strictEqual(pr.viaGsa, 1);
  assert.strictEqual(pr.per.p1.wouldBlock, 2);
  assert.strictEqual(pr.per.p1.usersBlock, 1);
  assert.strictEqual(pr.per.p1.wouldPass, 1);
});

test("the Windows script: both architectures, the lock-down keys, IPv4 only when asked", () => {
  const t = Gsa.windowsScript({});
  assert.match(t, /GlobalSecureAccess-WindowsOnArm/);
  assert.match(t, /GlobalSecureAccess-windows/);
  assert.match(t, /RestrictNonPrivilegedUsers/);
  assert.match(t, /-Value 1 -Type DWord/);
  assert.doesNotMatch(t, /DisabledComponents/);
  assert.match(Gsa.windowsScript({ ipv4: true, lock: false }), /DisabledComponents[\s\S]*0x20/);
  assert.match(Gsa.windowsScript({ lock: false }), /-Value 0 -Type DWord/);
  const b = Gsa.windowsScriptBody({});
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(Buffer.from(b.scriptContent, "base64").toString("utf8"), Gsa.windowsScript({}));
});

test("every fix names its impact and its way back before its commands", () => {
  for (const [k, f] of Object.entries(Gsa.FIXES)) {
    assert.ok(f.impact && f.recovery && f.changes.length && f.scopes.length, k);
  }
});

test("render: the board, the policy table and no HTML from tenant names unescaped", () => {
  const raw = Gsa.demo(); raw.assigned[0].principalDisplayName = "<script>x</script>";
  const html = Gsa.render(Gsa.model(raw, [policy()]), {});
  assert.match(html, /gsa-chain/);
  assert.match(html, /CA215-BLOCK-Internals-CN/);
  assert.doesNotMatch(html, /<script>x/);
});

test("names follow the CloudFellows Intune convention read from devcf", () => {
  const n = Gsa.names({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(n.win, "Win - PSH - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0");
  assert.strictEqual(n.mac, "MACOS - SH - Software Installation - D - Install Global Secure Access Client - R26.10 - v1.0");
  assert.strictEqual(Gsa.relTag(new Date(2026, 9, 14)), "R26.10");
  assert.strictEqual(Gsa.GROUPS.mac, "INT-SEC-D-GSA-MAC-M365");
  assert.match(Gsa.MAC_FILE, /^scr-app-1\d\d-.*\.zsh$/);
});

test("the macOS shell script body: root, once, retries, the client installer from aka.ms", () => {
  const b = Gsa.macScriptBody({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(b["@odata.type"], "#microsoft.graph.deviceShellScript");
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(b.executionFrequency, "PT0S");
  assert.strictEqual(b.retryCount, 3);
  const t = Buffer.from(b.scriptContent, "base64").toString("utf8");
  assert.match(t, /^#!\/bin\/zsh/);
  assert.match(t, /aka\.ms\/GlobalSecureAccess-macOS/);
  assert.match(t, /installer -pkg/);
});

test("macProfiles recognises the devcf GSA profiles and their assignment", () => {
  const mp = Gsa.macProfiles(
    [{ id: "c1", name: "[OPTIONAL] MACOS - DCP - Device Configuration - D - Allow GSA System extensions- R26.6 - v3.0", assignments: [] }],
    [{ "@odata.type": "#microsoft.graph.macOSCustomConfiguration", id: "p1", displayName: "[OPTIONAL] MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - R26.6 - v3.0", assignments: [{ id: "a" }] },
     { "@odata.type": "#microsoft.graph.macOSCustomAppConfiguration", id: "s1", displayName: "[OPTIONAL] MACOS - DCP - Device Configuration - U - GSA System settings - R26.6 - v3.0", bundleId: "com.microsoft.globalsecureaccess.plist", assignments: [{ id: "b" }] }]);
  assert.strictEqual(mp.sysext.assigned, false);
  assert.strictEqual(mp.proxy.assigned, true);
  assert.strictEqual(mp.settings.assigned, true);
});
