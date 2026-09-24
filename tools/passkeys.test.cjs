// js/passkeys.js — the 🔑 Passkeys tab of 🛡 Checks.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const PK = new Function(read("js/passkeys.js") + ";return Passkeys;")();

const G_ADM = "11111111-1111-1111-1111-111111111111";
const G_PIL = "22222222-2222-2222-2222-222222222222";
const G_BRK = "33333333-3333-3333-3333-333333333333";
const ROLE = "62e90394-69f5-4237-9190-012177145e10";
const U1 = "aaaaaaaa-0000-0000-0000-000000000001", U2 = "aaaaaaaa-0000-0000-0000-000000000002", U3 = "aaaaaaaa-0000-0000-0000-000000000003";
const PR = { id: "00000000-0000-0000-0000-000000000004", displayName: "Phishing-resistant MFA", allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor"] };
const FIDO_ONLY = { id: "s-fido", displayName: "Passkey only", allowedCombinations: ["fido2"] };
const AUTH_ONLY = { id: "s-auth", displayName: "Authenticator passkey", allowedCombinations: ["fido2"],
  combinationConfigurations: [{ "@odata.type": "#microsoft.graph.fido2CombinationConfiguration", appliesToCombinations: ["fido2"], allowedAAGUIDs: ["90a3ccdf-635c-4729-a248-9b709135078f", "de1e552d-db1d-4423-a619-566b625cdc84"] }] };
const MFA = { id: "00000000-0000-0000-0000-000000000002", displayName: "Multifactor authentication", allowedCombinations: ["password,sms", "fido2"] };
const pol = (id, users, strength, extra) => ({ id, displayName: id, state: "enabled", conditions: { users, applications: { includeApplications: ["All"] } },
  grantControls: { operator: "OR", builtInControls: [], authenticationStrength: { id: strength.id, displayName: strength.displayName } }, ...(extra || {}) });
const prof = (id, name, types, attest, kr) => ({ id, name, passkeyTypes: types, attestationEnforcement: attest ? "registrationOnly" : "disabled",
  keyRestrictions: kr || { isEnforced: false, enforcementType: "block", aaGuids: [] } });
const DEF = prof(PK.DEFAULT_PROFILE, "Default passkey profile", "deviceBound,synced", false);
const fido = (o) => ({ "@odata.type": PK.ODATA, id: "Fido2", state: "enabled", isSelfServiceRegistrationAllowed: true,
  includeTargets: [{ targetType: "group", id: "all_users", isRegistrationRequired: false, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] }],
  excludeTargets: [], passkeyProfiles: [DEF], ...(o || {}) });
const members = { groups: { [G_ADM]: { ids: [U1, U2], complete: true }, [G_PIL]: { ids: [U3], complete: true }, [G_BRK]: { ids: [U2], complete: true } }, roles: { [ROLE]: { ids: [U1], complete: true } } };
const run = (f, pols, extra) => PK.analyze({ fido2: f, strengths: [PR, FIDO_ONLY, AUTH_ONLY, MFA], members, names: { [G_ADM]: "Admins", [G_PIL]: "Pilot", [G_BRK]: "BreakGlass" }, ...(extra || {}) }, pols);
const keys = (m, sev) => m.findings.filter((x) => !sev || x.sev === sev).map((x) => x.key.split(":")[0]);

test("requires a passkey: only phishing-resistant combinations with fido2, and no OR way around", () => {
  const S = new Map([PR, FIDO_ONLY, MFA].map((s) => [s.id, s]));
  assert.ok(PK.requirement(pol("a", {}, PR), S));
  assert.ok(PK.requirement(pol("b", {}, FIDO_ONLY), S));
  assert.strictEqual(PK.requirement(pol("c", {}, MFA), S), null, "a weaker combination beside the passkey is not a requirement");
  const or = pol("d", {}, PR); or.grantControls.builtInControls = ["compliantDevice"];
  assert.strictEqual(PK.requirement(or, S), null, "OR compliant device is a way around");
  or.grantControls.operator = "AND";
  assert.ok(PK.requirement(or, S), "AND keeps it required");
  const off = pol("e", {}, PR); off.state = "disabled";
  assert.strictEqual(PK.requirement(off, S), null);
  const whfbOnly = { id: "w", allowedCombinations: ["windowsHelloForBusiness"] };
  assert.strictEqual(PK.requirement(pol("f", {}, whfbOnly), new Map([["w", whfbOnly]])), null, "no fido2, not a passkey requirement");
});

test("all users targeted, nothing excluded: OK", () => {
  const m = run(fido(), [pol("CA101", { includeGroups: [G_ADM] }, PR)]);
  assert.deepStrictEqual(keys(m, "high"), []);
  assert.ok(keys(m).includes("ok"));
});

test("method disabled blocks every requiring policy; report-only is a warning", () => {
  const m = run(fido({ state: "disabled" }), [pol("CA101", { includeGroups: [G_ADM] }, PR)]);
  assert.deepStrictEqual(keys(m, "high"), ["disabled"]);
  assert.strictEqual(m.findings[0].fix.kind, "enable");
  const ro = pol("CA101", { includeGroups: [G_ADM] }, PR); ro.state = "enabledForReportingButNotEnforced";
  assert.strictEqual(run(fido({ state: "disabled" }), [ro]).findings.find((x) => x.key === "disabled").sev, "medium");
});

test("required but not targeted: counts the users outside every include group", () => {
  const f = fido({ includeTargets: [{ targetType: "group", id: G_PIL, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] }] });
  const m = run(f, [pol("CA101", { includeGroups: [G_ADM] }, PR)]);
  const x = m.findings.find((y) => y.key === "uncovered:CA101");
  assert.strictEqual(x.sev, "high");
  assert.deepStrictEqual(x.users.sort(), [U1, U2].sort());
  assert.deepStrictEqual(x.fix, { kind: "addTargets", groups: [G_ADM] });
  assert.match(x.text, /also accepts Windows Hello for Business and Certificate/);
  // a policy naming a role gets the role advice, and a targets fix, not an add-groups fix
  const r = run(f, [pol("CA100", { includeRoles: [ROLE] }, FIDO_ONLY)]).findings.find((y) => y.key === "uncovered:CA100");
  assert.match(r.text, /role cannot be a method target/);
  assert.match(r.text, /accepts nothing but a passkey/);
  assert.strictEqual(r.fix.kind, "editTargets");
});

test("All users required, groups targeted: named by group", () => {
  const f = fido({ includeTargets: [{ targetType: "group", id: G_PIL, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] }] });
  const m = run(f, [pol("CA001", { includeUsers: ["All"] }, PR)]);
  const x = m.findings.find((y) => y.key === "alluncovered:CA001");
  assert.ok(x); assert.match(x.text, /Pilot/); assert.strictEqual(x.fix.kind, "addAll");
});

test("an excluded group wins: required users in it are blocked, unless the policy excludes them too", () => {
  const f = fido({ excludeTargets: [{ targetType: "group", id: G_BRK }] });
  const m = run(f, [pol("CA101", { includeGroups: [G_ADM] }, PR)]);
  assert.deepStrictEqual(m.findings.find((y) => y.key === "excluded:CA101").users, [U2]);
  const m2 = run(f, [pol("CA101", { includeGroups: [G_ADM], excludeGroups: [G_BRK] }, PR)]);
  assert.strictEqual(m2.findings.find((y) => y.key.startsWith("excluded")), undefined);
  // All users policy: the group itself is named
  const m3 = run(f, [pol("CA001", { includeUsers: ["All"] }, PR)]);
  assert.ok(m3.findings.find((y) => y.key === `exclgroup:CA001:${G_BRK}`));
  const m4 = run(f, [pol("CA001", { includeUsers: ["All"], excludeGroups: [G_BRK] }, PR)]);
  assert.strictEqual(m4.findings.find((y) => y.key.startsWith("exclgroup")), undefined);
});

test("strength AAGUIDs vs profile key restrictions: no common key is blocking", () => {
  const blockAuth = prof(PK.DEFAULT_PROFILE, "Default passkey profile", "deviceBound,synced", false,
    { isEnforced: true, enforcementType: "block", aaGuids: ["90A3CCDF-635C-4729-A248-9B709135078F", "de1e552d-db1d-4423-a619-566b625cdc84"] });
  const m = run(fido({ passkeyProfiles: [blockAuth] }), [pol("CA504", { includeGroups: [G_ADM] }, AUTH_ONLY)]);
  assert.deepStrictEqual(m.findings.find((y) => y.key === "nokey:CA504").users.sort(), [U1, U2].sort());
  // a second profile on a group target that allows them rescues its members only
  const pilot = prof("p-2", "Pilot", "deviceBound", true, { isEnforced: true, enforcementType: "allow", aaGuids: ["90a3ccdf-635c-4729-a248-9b709135078f"] });
  const f2 = fido({ passkeyProfiles: [blockAuth, pilot], includeTargets: [
    { targetType: "group", id: "all_users", allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] },
    { targetType: "group", id: G_ADM, allowedPasskeyProfiles: ["p-2"] }] });
  assert.strictEqual(run(f2, [pol("CA504", { includeGroups: [G_ADM] }, AUTH_ONLY)]).findings.find((y) => y.key === "nokey:CA504"), undefined);
  // All users policy on the all-users profile
  assert.ok(run(fido({ passkeyProfiles: [blockAuth] }), [pol("CA504", { includeUsers: ["All"] }, AUTH_ONLY)]).findings.find((y) => y.key === "nokey:CA504"));
});

test("keyAllows and profileMeets", () => {
  const allow = { on: true, type: "allow", aaguids: ["a"] }, block = { on: true, type: "block", aaguids: ["a"] };
  assert.ok(PK.keyAllows(allow, "A")); assert.ok(!PK.keyAllows(allow, "b"));
  assert.ok(!PK.keyAllows(block, "a")); assert.ok(PK.keyAllows(block, "b"));
  assert.ok(PK.keyAllows({ on: false, type: "allow", aaguids: [] }, "x"));
  assert.ok(!PK.profileMeets({ types: ["deviceBound"], kr: { on: true, type: "allow", aaguids: [] } }, null), "empty allow list lets nothing through");
  assert.ok(!PK.profileMeets({ types: [], kr: { on: false, type: "block", aaguids: [] } }, null), "no type ticked lets nothing through");
});

test("self-service off, key restrictions without attestation, empty allow list", () => {
  const weak = prof(PK.DEFAULT_PROFILE, "Default passkey profile", "deviceBound", false, { isEnforced: true, enforcementType: "allow", aaGuids: [] });
  const m = run(fido({ isSelfServiceRegistrationAllowed: false, passkeyProfiles: [weak] }), [pol("CA101", { includeGroups: [G_ADM] }, PR)]);
  const k = keys(m);
  assert.ok(k.includes("selfservice")); assert.ok(k.includes("weak")); assert.ok(k.includes("emptyallow"));
  assert.strictEqual(m.findings.find((x) => x.key === "selfservice").fix.kind, "selfService");
});

test("legacy (not opted in) method reads as one tenant-wide profile and is flagged info", () => {
  const legacy = { "@odata.type": PK.ODATA, id: "Fido2", state: "enabled", isSelfServiceRegistrationAllowed: true, isAttestationEnforced: true,
    keyRestrictions: { isEnforced: true, enforcementType: "allow", aaGuids: ["90a3ccdf-635c-4729-a248-9b709135078f"] },
    includeTargets: [{ targetType: "group", id: "all_users" }], excludeTargets: [] };
  const p = PK.profilesOf(legacy);
  assert.strictEqual(p.optedIn, false);
  assert.deepStrictEqual(p.list[0].types, ["deviceBound"], "attestation on: device-bound only");
  const m = run(legacy, [pol("CA504", { includeGroups: [G_ADM] }, AUTH_ONLY)]);
  assert.ok(keys(m, "info").includes("legacy"));
  assert.strictEqual(m.findings.find((x) => x.key.startsWith("nokey")), undefined, "Authenticator iOS is on the allow list");
});

test("bootstrap: a registration policy requiring a passkey with TAP off", () => {
  const reg = pol("CA104", { includeGroups: [G_ADM] }, PR);
  reg.conditions.applications = { includeUserActions: ["urn:user:registersecurityinfo"] };
  const off = run(fido(), [reg], { methods: { authenticationMethodConfigurations: [{ id: "TemporaryAccessPass", state: "disabled" }] } });
  assert.ok(keys(off, "medium").includes("bootstrap"));
  const on = run(fido(), [reg], { methods: { authenticationMethodConfigurations: [{ id: "TemporaryAccessPass", state: "enabled" }] } });
  assert.ok(!keys(on).includes("bootstrap"));
});

test("unresolved groups are said, not guessed", () => {
  const f = fido({ includeTargets: [{ targetType: "group", id: G_PIL, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] }] });
  const m = PK.analyze({ fido2: f, strengths: [PR], members: { groups: { [G_PIL]: { ids: [], complete: true } }, roles: {} } }, [pol("CA9", { includeGroups: ["44444444-4444-4444-4444-444444444444"] }, PR)]);
  assert.ok(keys(m, "medium").includes("unresolved"));
});

test("wanted: groups of targets and of requiring policies, roles of requiring policies", () => {
  const f = fido({ includeTargets: [{ id: "all_users" }, { id: G_PIL }], excludeTargets: [{ id: G_BRK }] });
  const w = PK.wanted(f, [pol("a", { includeGroups: [G_ADM], includeRoles: [ROLE] }, PR), pol("b", { includeGroups: ["55555555-5555-5555-5555-555555555555"] }, MFA)], [PR, MFA]);
  assert.deepStrictEqual(w.groups.sort(), [G_PIL, G_BRK, G_ADM].sort());
  assert.deepStrictEqual(w.roles, [ROLE]);
});

test("toBody sends only what changed, collections whole", () => {
  const before = fido();
  const d = PK.draftFrom(before);
  assert.ok(!PK.changed(PK.toBody(before, d)), "no change, empty body");
  d.selfService = false;
  d.include.push({ id: G_ADM, reg: false, profiles: [PK.DEFAULT_PROFILE] });
  const body = PK.toBody(before, d);
  assert.strictEqual(body["@odata.type"], PK.ODATA);
  assert.strictEqual(body.isSelfServiceRegistrationAllowed, false);
  assert.strictEqual(body.includeTargets.length, 2);
  assert.deepStrictEqual(body.includeTargets[1], { targetType: "group", id: G_ADM, isRegistrationRequired: false, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] });
  assert.ok(!("passkeyProfiles" in body) && !("excludeTargets" in body) && !("state" in body));
  d.profiles.push({ id: "p-new", name: "Admins", types: ["deviceBound"], attest: true, kr: { on: true, type: "allow", aaguids: ["90a3ccdf-635c-4729-a248-9b709135078f"] } });
  const b2 = PK.toBody(before, d);
  assert.deepStrictEqual(b2.passkeyProfiles[1], { id: "p-new", name: "Admins", passkeyTypes: "deviceBound", attestationEnforcement: "registrationOnly",
    keyRestrictions: { isEnforced: true, enforcementType: "allow", aaGuids: ["90a3ccdf-635c-4729-a248-9b709135078f"] } });
});

test("legacy method: toBody writes the deprecated fields until opted in, then the Default profile", () => {
  const legacy = { "@odata.type": PK.ODATA, id: "Fido2", state: "enabled", isSelfServiceRegistrationAllowed: true, isAttestationEnforced: false,
    keyRestrictions: { isEnforced: false, enforcementType: "block", aaGuids: [] }, includeTargets: [{ targetType: "group", id: "all_users", isRegistrationRequired: false }], excludeTargets: [] };
  const d = PK.draftFrom(legacy);
  d.profiles[0].attest = true;
  const b = PK.toBody(legacy, d);
  assert.strictEqual(b.isAttestationEnforced, true);
  assert.ok(!("passkeyProfiles" in b) && !("includeTargets" in b));
  const o = PK.applyOptIn(PK.draftFrom(legacy));
  const bo = PK.toBody(legacy, o);
  assert.strictEqual(bo.passkeyProfiles[0].id, PK.DEFAULT_PROFILE);
  assert.deepStrictEqual(bo.includeTargets[0].allowedPasskeyProfiles, [PK.DEFAULT_PROFILE]);
  assert.ok(PK.diff(legacy, o, {}).some((l) => l.s === "!" && /cannot be undone/.test(l.t)));
});

test("validate: Default cannot go, at most three, a profile on a target cannot be removed, empty allow list", () => {
  const d = PK.draftFrom(fido());
  d.profiles = d.profiles.filter((p) => p.id !== PK.DEFAULT_PROFILE);
  let v = PK.validate(d);
  assert.ok(!v.ok && v.errors.some((e) => /Default/.test(e)));
  const d2 = PK.draftFrom(fido());
  d2.profiles.push({ id: "a", name: "A", types: ["synced"], attest: false, kr: { on: false, type: "block", aaguids: [] } },
    { id: "b", name: "B", types: ["synced"], attest: false, kr: { on: false, type: "block", aaguids: [] } },
    { id: "c", name: "C", types: ["synced"], attest: false, kr: { on: true, type: "allow", aaguids: [] } });
  v = PK.validate(d2);
  assert.ok(v.errors.some((e) => /At most 3/.test(e)));
  assert.ok(v.errors.some((e) => /empty list/.test(e)));
  const d3 = PK.draftFrom(fido());
  d3.include[0].profiles = ["gone"];
  assert.ok(PK.validate(d3).errors.some((e) => /being removed/.test(e)));
});

test("impact names what stops working first, and re-analysis says what the save clears", () => {
  const before = fido({ passkeyProfiles: [prof(PK.DEFAULT_PROFILE, "Default passkey profile", "deviceBound,synced", false, { isEnforced: true, enforcementType: "allow", aaGuids: ["90a3ccdf-635c-4729-a248-9b709135078f", "cb69481e-8ff7-4039-93ec-0a2729a154a8"] })] });
  const d = PK.draftFrom(before);
  d.profiles[0].types = ["deviceBound"];
  d.profiles[0].kr.aaguids = ["90a3ccdf-635c-4729-a248-9b709135078f"];
  const im = PK.impact(before, d, {});
  assert.ok(im.lose.some((l) => /Synced passkeys stop working/.test(l)));
  assert.ok(im.lose.some((l) => /YubiKey 5 \(USB-A, No NFC\)/.test(l) && /stop signing in/.test(l)));
  // the save that adds the missing target clears the blocking finding
  const narrow = fido({ includeTargets: [{ targetType: "group", id: G_PIL, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] }] });
  const pols = [pol("CA101", { includeGroups: [G_ADM] }, PR)];
  const d2 = PK.draftFrom(narrow);
  d2.include.push({ id: G_ADM, reg: false, profiles: [PK.DEFAULT_PROFILE] });
  const after = PK.applyBody(narrow, PK.toBody(narrow, d2));
  const im2 = PK.impact(narrow, d2, {}, run(narrow, pols), run(after, pols));
  assert.ok(im2.gain.some((g) => /Clears: Required, but not targeted/.test(g)));
});

test("render and export do not throw and escape names", () => {
  const f = fido({ includeTargets: [{ targetType: "group", id: G_PIL, allowedPasskeyProfiles: [PK.DEFAULT_PROFILE] }] });
  const p = pol("<b>x</b>", { includeGroups: [G_ADM] }, PR);
  const m = run(f, [p]);
  const h = PK.render(m, { filter: "all" });
  assert.ok(!h.includes("<b>x</b>") && h.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.match(PK.chips(m, "all"), /Blocks \(1\)/);
  assert.match(PK.toMd(m, "T"), /# Passkeys — T/);
  const n = PK.analyze({ fido2: null, error: "403" }, []);
  assert.ok(PK.render(n, {}).includes("could not be read"));
});
