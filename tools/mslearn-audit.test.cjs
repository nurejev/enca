// T07 audit, build 25469 — each test is a defect the audit found, pinned so it
// cannot come back. Run: node --test tools/*.test.cjs
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

const pol = (displayName, conditions, grantControls, sessionControls, state) => ({
  id: displayName, displayName, state: state || "enabled",
  conditions: { users: {}, applications: { includeApplications: ["All"] }, ...conditions },
  grantControls, sessionControls,
});
const GUESTS = (...types) => ({ guestOrExternalUserTypes: types.join(","), externalTenants: { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" } });
const ALL6 = GUESTS("internalGuest", "b2bCollaborationGuest", "b2bCollaborationMember", "b2bDirectConnectUser", "otherExternalUser", "serviceProvider");
const CT = (defaultTrust, partners, dc) => ({ crossTenant: { ok: true, defaultOk: true, partnersOk: true, defaultTrust: defaultTrust || {}, dcInboundDefault: dc || "blocked", partners: partners || [] } });
const run = (ps, opts) => M.run(ps, (opts && opts.strengths) || new Map(), opts || {});
const find = (fs_, id) => fs_.filter((f) => f.check.id === id);

// The CloudFellows catalog after 25468, in Graph shape.
const CA000 = pol("CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.3",
  { users: { includeUsers: ["All"], excludeGroups: ["bg"], excludeGuestsOrExternalUsers: ALL6 } },
  { operator: "OR", builtInControls: [], authenticationStrength: { id: "00000000-0000-0000-0000-000000000002" } });
const CA400 = pol("CA400-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-v1.0.3",
  { users: { includeUsers: [], includeGuestsOrExternalUsers: GUESTS("internalGuest", "b2bCollaborationGuest", "b2bCollaborationMember", "serviceProvider"), excludeGroups: ["bg"] } },
  { operator: "OR", builtInControls: ["mfa"] });

test("the catalog gap: other external users are reached by no MFA policy, and the finding sits on the guest MFA policy", () => {
  const f = find(run([CA000, CA400], CT({})), "ext-type-no-mfa");
  assert.equal(f.length, 1);
  assert.equal(f[0].policyId, CA400.id);
  assert.deepEqual([...f[0].result.addTypes], ["otherExternalUser"]);
  assert.match(f[0].result.detail, /CA000.*exclude/);
  assert.match(f[0].result.detail, /blocked inbound/, "direct connect is left out while it is blocked inbound");
});

test("with B2B direct connect enabled inbound, the gap includes it and says it needs MFA trust", () => {
  const f = find(run([CA000, CA400], CT({}, [], "allowed")), "ext-type-no-mfa")[0];
  assert.ok(f.result.addTypes.includes("b2bDirectConnectUser"));
  assert.match(f.result.detail, /only meet MFA through inbound MFA trust/);
});

test("no gap when an All-users MFA policy still reaches the types", () => {
  const CA000open = { ...CA000, conditions: { ...CA000.conditions, users: { includeUsers: ["All"] } } };
  assert.equal(find(run([CA000open, CA400], CT({})), "ext-type-no-mfa").length, 0);
});

test("the fix adds exactly the missing types, and nothing else", () => {
  const findings = run([CA000, CA400], CT({}));
  const res = M.buildFixes(findings, [CA000, CA400], {});
  const fx = res.fixes.find((x) => x.policyId === CA400.id);
  assert.ok(fx, "a fix is built for CA400");
  const types = fx.draft.conditions.users.includeGuestsOrExternalUsers.guestOrExternalUserTypes.split(",");
  assert.ok(types.includes("otherExternalUser"));
  assert.ok(!types.includes("b2bDirectConnectUser"));
});

test("Windows Cloud Login is the SSO app 270efc09, and a policy on it is supported for token protection", () => {
  const tp = pol("CA-TP", { users: { includeUsers: ["All"] }, applications: { includeApplications: [
    "00000002-0000-0ff1-ce00-000000000000", "270efc09-cd0d-444b-a71f-39af4910ec45"] },
    platforms: { includePlatforms: ["windows"] }, clientAppTypes: ["mobileAppsAndDesktopClients"] },
    null, { secureSignInSession: { isEnabled: true } });
  assert.equal(find(run([tp]), "token-prot-apps").length, 0);
  // and the VM sign-in app is NOT on the supported list
  const vmPol = { ...tp, conditions: { ...tp.conditions, applications: { includeApplications: ["372140e0-b3b7-4226-8ef9-d57986796201"] } } };
  assert.equal(find(run([vmPol]), "token-prot-apps").length, 1);
});

test("the approved-client-app transition pattern is reported too — it is read-only since 30 June 2026", () => {
  const p = pol("CA212", { users: { includeUsers: ["All"] } }, { operator: "OR", builtInControls: ["approvedApplication", "compliantApplication"] });
  const f = find(run([p]), "approved-client-app-retirement");
  assert.equal(f.length, 1);
  assert.match(f[0].result.detail, /read-only/);
  assert.doesNotMatch(f[0].check.requirement, /March 2026/);
});

test("a user-risk policy that only asks guests for MFA is not called a lockout", () => {
  const mfa = pol("CA-UR-MFA", { userRiskLevels: ["high"], users: { includeUsers: ["All"] } }, { operator: "OR", builtInControls: ["mfa"] });
  assert.equal(find(run([mfa]), "guest-user-risk-blocked").length, 0);
  const rem = pol("CA-UR-REM", { userRiskLevels: ["high"], users: { includeUsers: ["All"] } }, { operator: "AND", builtInControls: ["riskRemediation"] });
  const f = find(run([rem]), "guest-user-risk-blocked");
  assert.equal(f.length, 1);
  assert.match(f[0].result.detail, /not supported for external and guest users/);
});

test("the Defender mobile exclusion is not asked of a legacy-auth block", () => {
  const legacy = pol("CA-LEG", { users: { includeUsers: ["All"] }, clientAppTypes: ["exchangeActiveSync", "other"] }, { operator: "OR", builtInControls: ["block"] });
  assert.equal(find(run([legacy]), "defender-mobile-exclusion").length, 0);
  const geo = pol("CA-GEO", { users: { includeUsers: ["All"] }, locations: { includeLocations: ["All"], excludeLocations: ["x"] } }, { operator: "OR", builtInControls: ["block"] });
  assert.equal(find(run([geo]), "defender-mobile-exclusion").length, 1);
  const desk = pol("CA-DESK", { users: { includeUsers: ["All"] }, platforms: { includePlatforms: ["windows", "macOS"] } }, { operator: "OR", builtInControls: ["block"] });
  assert.equal(find(run([desk]), "defender-mobile-exclusion").length, 0);
});

test("severity Low sorts, labels and counts like the others", () => {
  const st = new Map([["m", { id: "m", displayName: "Multifactor authentication", allowedCombinations: ["password,sms", "fido2"] }]]);
  const p = pol("CA400 strength", { users: { includeUsers: [], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "m" } });
  const q = pol("CA-TP-browser", { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] } }, null, { secureSignInSession: { isEnabled: true } });
  const groups = M.group(run([p, q], { strengths: st, ...CT({}) }));
  const sevs = groups.map((g) => g.check.severity);
  assert.ok(sevs.includes("low"));
  assert.ok(sevs.indexOf("low") > sevs.indexOf("high"), "low sorts after high");
  const html = M.renderSummary(groups, 30, false);
  assert.match(html, /1 Low/);
});

// ---- 25471: token protection excludes only the Entra-JOINED devices ----
const TP = (filter) => pol("CA-TP-dev", { users: { includeUsers: ["All"] }, applications: { includeApplications: ["00000002-0000-0ff1-ce00-000000000000"] },
  platforms: { includePlatforms: ["windows"] }, clientAppTypes: ["mobileAppsAndDesktopClients"], devices: filter ? { deviceFilter: filter } : undefined },
  null, { secureSignInSession: { isEnabled: true } });

test("the token-protection fix pairs every excluded device type with trustType AzureAD", () => {
  const findings = run([TP(null)]);
  const res = M.buildFixes(findings, [TP(null)], {});
  const rule = res.fixes[0].draft.conditions.devices.deviceFilter.rule;
  for (const label of ["CloudPC", "AzureVirtualDesktop", "MicrosoftPowerAutomate", "SecureVM"]) assert.ok(rule.includes(label), label);
  assert.equal((rule.match(/trustType -eq "AzureAD"/g) || []).length, 4);
});

test("a filter that excludes Cloud PCs whatever their join type is reported as over-broad", () => {
  const broad = TP({ mode: "exclude", rule: 'device.systemLabels -contains "CloudPC" -or device.systemLabels -contains "AzureVirtualDesktop" -or device.profileType -eq "SecureVM"' });
  const f = find(run([broad]), "token-prot-devices");
  assert.equal(f.length, 1);
  assert.match(f[0].result.detail, /hybrid-joined/);
  const right = TP({ mode: "exclude", rule: '(device.systemLabels -contains "CloudPC" -and device.trustType -eq "AzureAD") -or (device.systemLabels -contains "AzureVirtualDesktop" -and device.trustType -eq "AzureAD") -or (device.profileType -eq "SecureVM" -and device.trustType -eq "AzureAD")' });
  assert.equal(find(run([right]), "token-prot-devices").length, 0);
});
