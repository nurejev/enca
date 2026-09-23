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

// ---- 25472: guests reached through an included group ----
const GG = (entries, partial) => ({ guestGroups: { ok: true, partial: !!partial, groups: new Map(entries) } });

test("a group of guests on a phishing-resistant policy is now seen by the guest checks", () => {
  const st = new Map([["pr", { id: "pr", displayName: "Phishing-resistant MFA", allowedCombinations: ["fido2", "windowsHelloForBusiness"] }]]);
  const p = pol("CA500 GuestAdmins", { users: { includeGroups: ["g-ga"] } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "pr" } });
  assert.equal(find(run([p], { strengths: st, ...CT({}) }), "guest-auth-strength-unsatisfiable").length, 0, "without the read it cannot know");
  const f = find(run([p], { strengths: st, ...CT({}), ...GG([["g-ga", { name: "CAB-SEC-U-Persona-GuestAdmins", guests: 3 }]]) }), "guest-auth-strength-unsatisfiable");
  assert.equal(f.length, 1);
  assert.match(f[0].result.detail, /CAB-SEC-U-Persona-GuestAdmins" \(3 members with userType Guest\)/);
});

test("a group of guests that is also excluded does not count, and a group with no guests never counts", () => {
  const st = new Map([["pr", { id: "pr", displayName: "PR", allowedCombinations: ["fido2"] }]]);
  const ex = pol("CA-x", { users: { includeGroups: ["g1"], excludeGroups: ["g1"] } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "pr" } });
  const none = pol("CA-y", { users: { includeGroups: ["g2"] } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "pr" } });
  const r = run([ex, none], { strengths: st, ...CT({}), ...GG([["g1", { name: "G1", guests: 2 }]]) });
  assert.equal(find(r, "guest-auth-strength-unsatisfiable").length, 0);
});

test("an MFA policy on a group of guests does not cover ALL guests in the no-MFA gap check", () => {
  const grp = pol("CA-grp-mfa", { users: { includeGroups: ["g1"] } }, { operator: "OR", builtInControls: ["mfa"] });
  const CA400b = pol("CA400b", { users: { includeUsers: [], includeGuestsOrExternalUsers: GUESTS("internalGuest", "b2bCollaborationMember", "serviceProvider") } }, { operator: "OR", builtInControls: ["mfa"] });
  const f = find(run([CA000, CA400b, grp], { ...CT({}), ...GG([["g1", { name: "G1", guests: 5 }]]) }), "ext-type-no-mfa")[0];
  assert.ok(f.result.addTypes.includes("b2bCollaborationGuest"), "five guests in a group are not every guest");
});

test("the summary says when some groups' guest membership could not be read", () => {
  const p = pol("CA-z", { users: { includeGroups: ["g1"] } }, { operator: "OR", builtInControls: ["mfa"] });
  const groups = M.group(run([p], GG([], true)));
  assert.match(M.renderSummary(groups, 30, false), /could not be read/);
});

// ---- 25475: a TAP is not a guest method; a block is coverage ----
test("a phishing-resistant + TAP strength is unsatisfiable for guests, and never read as Require MFA", () => {
  const st = new Map([["pt", { id: "pt", displayName: "Phishing-resistant MFA + TAP", allowedCombinations: ["windowsHelloForBusiness", "fido2", "temporaryAccessPassOneTime", "temporaryAccessPassMultiUse"] }]]);
  const p = pol("CA503", { users: { includeUsers: [], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "pt" } });
  const r = run([p], { strengths: st, ...CT({}) });
  const f = find(r, "guest-auth-strength-unsatisfiable");
  assert.equal(f.length, 1);
  assert.match(f[0].result.detail, /TAP does not work for guest users/);
  assert.equal(find(r, "guest-auth-strength-swap-for-mfa").length, 0, "PR + TAP is not the MFA strength");
  const m = M.guestMatrix([p], st, CT({}));
  assert.equal(m.cells.get("b2bCollaborationGuest|strength").v, "blocked");
});

test("a TAP-only strength cannot be met by a guest even with MFA trust on", () => {
  const st = new Map([["t", { id: "t", displayName: "TAP only", allowedCombinations: ["temporaryAccessPassOneTime"] }]]);
  const p = pol("CA-tap", { users: { includeUsers: ["All"] } }, { operator: "OR", builtInControls: [], authenticationStrength: { id: "t" } });
  const f = find(run([p], { strengths: st, ...CT({ isMfaAccepted: true }) }), "guest-auth-strength-unsatisfiable")[0];
  assert.match(f.result.detail, /not here and not through trust/);
});

test("types an unconditional All-resources block shuts out are not an MFA gap", () => {
  const CA099 = pol("CA099-BLOCK-Global-Block-Non-persona", { users: { includeUsers: ["All"], excludeGroups: ["g1", "g2", "g3"] },
    applications: { includeApplications: ["All"], excludeApplications: ["a0e84e36-b067-4d5c-ab4a-3db38e598ae2"] } }, { operator: "OR", builtInControls: ["block"] });
  assert.equal(find(run([CA000, CA400, CA099], CT({})), "ext-type-no-mfa").length, 0);
  // a conditional block (country) lets part of the type through — still a gap
  const geo = { ...CA099, conditions: { ...CA099.conditions, locations: { includeLocations: ["All"], excludeLocations: ["nl"] } } };
  assert.equal(find(run([CA000, CA400, geo], CT({})), "ext-type-no-mfa").length, 1);
});

// ---- 25485: shared devices against the controls this tenant demands ----
const DEV = { groups: { sharedDevices: { id: "rooms", name: "CAB-SEC-U-TeamsSharedDevices" } } };
test("the device matrix reads Learn's table: MFA blocked on Windows rooms, prompts on Android, SIF blocked on both", () => {
  const mfa = pol("CA-MFA-all", { users: { includeUsers: ["All"] } }, { operator: "OR", builtInControls: ["mfa"] });
  const sif = pol("CA-SIF", { users: { includeUsers: ["All"] } }, null, { signInFrequency: { isEnabled: true, value: 4, type: "hours" } });
  const m = M.deviceMatrix([mfa, sif], DEV);
  assert.equal(m.cells.get("mtrWindows|mfa").v, "blocked");
  assert.equal(m.cells.get("mtrAndroid|mfa").v, "caution");
  assert.equal(m.cells.get("surfaceHub|mfa").v, "blocked");
  assert.equal(m.cells.get("mtrWindows|signInFrequency").v, "blocked");
  assert.equal(m.cells.get("surfaceHub|signInFrequency").v, "unknown", "Surface Hub's page does not document sign-in frequency");
  assert.match(M.renderDeviceMatrix(m), /data-dmcell="mtrWindows\|mfa"/);
});

test("a policy that excludes the shared-device group, or targets Azure management only, does not reach the devices", () => {
  const ex = pol("CA000", { users: { includeUsers: ["All"], excludeGroups: ["rooms"] } }, { operator: "OR", builtInControls: ["mfa"] });
  const arm = pol("CA111", { users: { includeUsers: ["All"] }, applications: { includeApplications: ["797f4846-ba00-4fd7-ba43-dac1f8f63013"] } }, { operator: "OR", builtInControls: ["mfa"] });
  assert.equal(M.deviceMatrix([ex, arm], DEV).types.length, 0);
  assert.equal(M.renderDeviceMatrix(M.deviceMatrix([ex, arm], DEV)), "");
});

test("the device-code block is fine for Windows rooms and blocks Android devices; a platform condition picks the family", () => {
  const dcf = pol("CA004", { users: { includeUsers: ["All"] }, authenticationFlows: { transferMethods: "deviceCodeFlow" } }, { operator: "OR", builtInControls: ["block"] });
  const m = M.deviceMatrix([dcf], DEV);
  assert.equal(m.cells.get("mtrWindows|deviceCodeBlock").v, "ok");
  assert.equal(m.cells.get("mtrAndroid|deviceCodeBlock").v, "blocked");
  const mob = pol("CA-mob", { users: { includeUsers: ["All"] }, platforms: { includePlatforms: ["android", "iOS"] } }, { operator: "OR", builtInControls: ["compliantDevice"] });
  const m2 = M.deviceMatrix([mob], DEV);
  assert.ok(m2.cells.has("mtrAndroid|compliantDevice"));
  assert.ok(!m2.cells.has("mtrWindows|compliantDevice"));
});

test("a policy aimed at the shared-device group itself is read too", () => {
  const own = pol("CA-rooms", { users: { includeUsers: [], includeGroups: ["rooms"] } }, { operator: "OR", builtInControls: ["compliantDevice"] });
  const m = M.deviceMatrix([own], DEV);
  assert.equal(m.cells.get("mtrWindows|compliantDevice").v, "ok");
  assert.equal(m.cells.get("surfaceHub|compliantDevice").v, "blocked");
});

// ---- 25489: every blocked / trust matrix cell has a finding ----
test("an All-users terms of use reaching the rooms is a finding with an exclusion fix", () => {
  const tou = pol("CA017-ToU", { users: { includeUsers: ["All"] } }, { operator: "OR", builtInControls: [], termsOfUse: ["t1"] });
  const f = find(run([tou], DEV), "shared-device-unsupported");
  assert.equal(f.length, 1);
  assert.match(f[0].result.detail, /Teams Rooms on Windows: Terms of use/);
  assert.match(f[0].result.detail, /through All users/);
  const res = M.buildFixes(run([tou], DEV), [tou], DEV.groups);
  assert.ok(res.fixes[0].draft.conditions.users.excludeGroups.includes("rooms"));
});

test("the devices' own policy is told to drop the control, not to exclude them", () => {
  const own = pol("CA-rooms", { users: { includeUsers: [], includeGroups: ["rooms"] } }, { operator: "OR", builtInControls: ["compliantDevice"] }, { persistentBrowser: { isEnabled: true, mode: "never" } });
  const findings = run([own], DEV);
  const f = find(findings, "shared-device-unsupported")[0];
  assert.match(f.result.detail, /INCLUDES the shared-device group/);
  const res = M.buildFixes(findings, [own], DEV.groups);
  // 32303 (Mihai chose it): the Fix takes the control OUT of their own policy
  // when the group is its only include — still never an exclusion
  assert.equal((res.fixes || []).length, 1);
  assert.ok(!(res.fixes[0].draft.conditions.users.excludeGroups || []).length, "no exclusion is proposed for the devices' own policy");
  assert.match(res.fixes[0].changes[0], /Removed Persistent browser/);
});

test("no double report: MFA on All users / All resources stays teams-rooms-mfa's", () => {
  const mfa = pol("CA-MFA", { users: { includeUsers: ["All"] } }, { operator: "OR", builtInControls: ["mfa"] });
  assert.equal(find(run([mfa], DEV), "shared-device-unsupported").length, 0);
  assert.equal(find(run([mfa], DEV), "teams-rooms-mfa").length, 1);
});

test("MFA reaching B2B direct connect without inbound MFA trust is a finding; with trust or direct connect blocked it is not", () => {
  const p = pol("CA400", { users: { includeUsers: [], includeGuestsOrExternalUsers: GUESTS("b2bDirectConnectUser") } }, { operator: "OR", builtInControls: ["mfa"] });
  assert.equal(find(run([p], CT({}, [], "allowed")), "dc-mfa-needs-trust").length, 1);
  assert.equal(find(run([p], CT({ isMfaAccepted: true }, [], "allowed")), "dc-mfa-needs-trust").length, 0);
  assert.equal(find(run([p], CT({}, [], "blocked")), "dc-mfa-needs-trust").length, 0);
});
