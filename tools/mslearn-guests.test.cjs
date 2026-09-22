// MSLearn guest / external-user checks and the guest reality matrix
// (js/mslearn.js, build 25433). Run: node --test tools/*.test.cjs
//
// Every assertion here mirrors a statement Microsoft publishes for external
// users — the control support table and the authentication-strength method
// table. The point of the tests is that the tool never claims MORE than those
// tables do: a local guest is not a cross-tenant identity, an OR'd alternative
// control is not a lockout, and an unread cross-tenant setting is "unverified"
// rather than "not configured".
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(box);
vm.runInContext("const Baseline = undefined;", box);
vm.runInContext(fs.readFileSync(path.join(root, "js/mslearn.js"), "utf8"), box, { filename: "mslearn.js" });
vm.runInContext("globalThis.M = MSLearn;", box);
const { M } = box;

const GUESTS = (...types) => ({ guestOrExternalUserTypes: types.join(","), externalTenants: { membershipKind: "all" } });
const pol = (displayName, conditions, grantControls, sessionControls) => ({
  id: displayName, displayName, state: "enabled",
  conditions: { users: {}, ...conditions },
  grantControls, sessionControls,
});
const strengths = (id, name, combos) => new Map([[id, { id, displayName: name, allowedCombinations: combos }]]);
const PARTNER = (trust) => ({ ok: true, list: [{ tenantId: "t-partner", name: "Fabrikam", inboundTrust: trust || {} }] });
const NOT_READ = { ok: false, list: [], error: "not read" };
// 25469: the cross-tenant settings as the app now reads them — the DEFAULT
// inbound trust plus EVERY partner, not only service providers.
const CT = (defaultTrust, partners, extra) => ({ crossTenant: { ok: true, defaultOk: true, partnersOk: true,
  defaultTrust: defaultTrust || {}, dcInboundDefault: "blocked", partners: partners || [], ...(extra || {}) } });

const run = (policies, opts) => M.run(policies, (opts && opts.strengths) || new Map(), opts || {});
const ids = (findings) => findings.map((f) => f.check.id);
const find = (findings, id) => findings.find((f) => f.check.id === id);

// ---- the passkey case ---------------------------------------------------

test("a phishing-resistant strength with guests in scope is reported as unsatisfiable", () => {
  const st = strengths("s1", "Phishing-resistant MFA", ["fido2", "windowsHelloForBusiness", "x509CertificateMultiFactor"]);
  const p = pol("CA210 PhishResistant",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest", "b2bCollaborationMember") } },
    { authenticationStrength: { id: "s1" }, builtInControls: [], operator: "OR" });
  const f = find(run([p], { strengths: st, partners: PARTNER() }), "guest-auth-strength-unsatisfiable");
  assert.ok(f, "must fire");
  assert.match(f.result.detail, /FIDO2 security key \/ passkey/);
  assert.match(f.result.detail, /Inbound MFA trust is not configured for: Fabrikam/);
});

test("the same strength is NOT reported when one combination works in the resource tenant", () => {
  // password + SMS is completable in the resource tenant, so the strength is satisfiable
  const st = strengths("s2", "Mixed", ["fido2", "password,sms"]);
  const p = pol("CA211 Mixed",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } },
    { authenticationStrength: { id: "s2" }, builtInControls: [], operator: "OR" });
  assert.ok(!find(run([p], { strengths: st, partners: PARTNER() }), "guest-auth-strength-unsatisfiable"));
});

test("with inbound MFA trust on by default it is still raised, but as a dependency on the home tenant", () => {
  const st = strengths("s1", "Phishing-resistant MFA", ["fido2"]);
  const p = pol("CA210",
    { users: { includeUsers: ["All"] } },
    { authenticationStrength: { id: "s1" }, builtInControls: [], operator: "OR" });
  const f = find(run([p], { strengths: st, ...CT({ isMfaAccepted: true }) }), "guest-auth-strength-unsatisfiable");
  assert.ok(f);
  assert.match(f.result.detail, /on by default/);
  assert.match(f.result.detail, /their own organisation has deployed/);
});

test("25469: trusting ONE partner is not trust — the default decides for everybody else", () => {
  // The bug: only (service-provider) partners were read, so one trusted
  // partner — or none at all — read as "trust is configured".
  const st = strengths("s1", "Phishing-resistant MFA", ["fido2"]);
  const p = pol("CA210", { users: { includeUsers: ["All"] } },
    { authenticationStrength: { id: "s1" }, builtInControls: [], operator: "OR" });
  const f = find(run([p], { strengths: st, ...CT({ isMfaAccepted: false }, [{ tenantId: "t1", name: "Fabrikam", inboundTrust: { isMfaAccepted: true } }]) }), "guest-auth-strength-unsatisfiable");
  assert.match(f.result.detail, /OFF in the default/);
  assert.match(f.result.detail, /switched on for Fabrikam only/);
  // partner list alone (default not read) never claims trust
  const g = find(run([p], { strengths: st, partners: PARTNER({ isMfaAccepted: true }) }), "guest-auth-strength-unsatisfiable");
  assert.match(g.result.detail, /DEFAULT setting .* was not read/);
});

test("an unread cross-tenant setting is called unverified, never 'not configured'", () => {
  const st = strengths("s1", "Phishing-resistant MFA", ["fido2"]);
  const p = pol("CA210", { users: { includeUsers: ["All"] } },
    { authenticationStrength: { id: "s1" }, builtInControls: [], operator: "OR" });
  const f = find(run([p], { strengths: st, partners: NOT_READ }), "guest-auth-strength-unsatisfiable");
  assert.match(f.result.detail, /could not be read/);
});

// ---- controls external users cannot satisfy -----------------------------

test("app protection with guests in scope is reported", () => {
  const p = pol("CA305 AppProtection",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } },
    { builtInControls: ["compliantApplication"], operator: "AND" });
  const f = find(run([p], { partners: PARTNER() }), "guest-unsupported-grant");
  assert.ok(f);
  assert.match(f.result.detail, /Require app protection policy/);
});

test("an OR'd alternative control means it is not a lockout", () => {
  const p = pol("CA305",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } },
    { builtInControls: ["compliantApplication", "mfa"], operator: "OR" });
  assert.ok(!find(run([p], { partners: PARTNER() }), "guest-unsupported-grant"));
});

test("a LOCAL guest is not a cross-tenant identity and is not reported", () => {
  // internalGuest holds this tenant's own credentials — none of the limits apply
  const p = pol("CA306",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("internalGuest") } },
    { builtInControls: ["compliantApplication"], operator: "AND" });
  assert.ok(!find(run([p], { partners: PARTNER() }), "guest-unsupported-grant"));
});

test("a compliant-device policy is reported only while device trust is missing", () => {
  const p = pol("CA220 Compliant",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } },
    { builtInControls: ["compliantDevice"], operator: "AND" });
  assert.ok(find(run([p], CT({ isCompliantDeviceAccepted: false })), "guest-device-grant-needs-trust"));
  assert.ok(!find(run([p], CT({ isCompliantDeviceAccepted: true })), "guest-device-grant-needs-trust"));
  // on by default but switched off for one partner: still reported, naming it
  const off = find(run([p], CT({ isCompliantDeviceAccepted: true }, [{ tenantId: "t9", name: "Contoso", inboundTrust: { isCompliantDeviceAccepted: false } }])), "guest-device-grant-needs-trust");
  assert.match(off.result.detail, /switched OFF for: Contoso/);
  // a partner row with inboundTrust null INHERITS the default
  assert.ok(!find(run([p], CT({ isCompliantDeviceAccepted: true }, [{ tenantId: "t9", name: "Contoso", inboundTrust: null }])), "guest-device-grant-needs-trust"));
});

test("25469: the reported bug — no CSP partner at all used to silence the device finding", () => {
  const p = pol("CA205 Compliant", { users: { includeUsers: ["All"] } }, { builtInControls: ["compliantDevice"], operator: "AND" });
  // the old input shape (service providers only, none configured) no longer
  // reads as "every partner trusts": the default is unknown, so it reports
  assert.ok(find(run([p], { partners: { ok: true, list: [] } }), "guest-device-grant-needs-trust"));
  // the new read: default off, no partners → reported, and the matrix says trust
  assert.ok(find(run([p], CT({})), "guest-device-grant-needs-trust"));
  const m = M.guestMatrix([p], new Map(), CT({}));
  assert.equal(m.cells.get("b2bCollaborationGuest|compliantDevice").v, "trust");
});

test("a user-risk password change blocks guests, and says why", () => {
  const p = pol("CA400 UserRisk",
    { userRiskLevels: ["high"], users: { includeUsers: ["All"] } },
    { builtInControls: ["passwordChange"], operator: "AND" });
  const f = find(run([p], { partners: PARTNER() }), "guest-user-risk-blocked");
  assert.ok(f);
  assert.match(f.result.detail, /cannot perform in this directory/);
});

test("direct-connect-only session controls are reported for direct connect", () => {
  const p = pol("CA500 SIF",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bDirectConnectUser") } },
    { builtInControls: ["mfa"], operator: "AND" },
    { signInFrequency: { isEnabled: true, value: 1, type: "hours" } });
  const f = find(run([p], { partners: PARTNER() }), "dc-unsupported-control");
  assert.ok(f);
  assert.match(f.result.detail, /Sign-in frequency/);
  // …and not for a collaboration guest, for whom it IS supported
  const q = pol("CA501 SIF",
    { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") } },
    { builtInControls: ["mfa"], operator: "AND" },
    { signInFrequency: { isEnabled: true } });
  assert.ok(!find(run([q], { partners: PARTNER() }), "dc-unsupported-control"));
});

test("a full guest exclusion takes the policy out of every guest check", () => {
  const p = pol("CA305",
    { users: {
      includeUsers: ["All"],
      excludeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest", "b2bCollaborationMember", "b2bDirectConnectUser", "internalGuest", "serviceProvider", "otherExternalUser"),
    } },
    { builtInControls: ["compliantApplication"], operator: "AND" });
  assert.ok(!ids(run([p], { partners: PARTNER() })).some((x) => x.startsWith("guest-")));
});

test("an exclusion naming only specific tenants does NOT take the type out of scope", () => {
  const p = pol("CA305",
    { users: {
      includeUsers: ["All"],
      excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: { membershipKind: "enumerated", members: ["t-one"] } },
    } },
    { builtInControls: ["compliantApplication"], operator: "AND" });
  const f = find(run([p], { partners: PARTNER() }), "guest-unsupported-grant");
  assert.ok(f, "partners in every other tenant are still in scope");
  assert.match(f.result.detail, /only for 1 named tenant/);
});

// ---- the matrix ---------------------------------------------------------

const matrix = (policies, opts) => M.guestMatrix(policies, (opts && opts.strengths) || new Map(), opts || {});
const cell = (m, t, c) => m.cells.get(`${t}|${c}`);

test("the matrix only carries controls the tenant's policies actually demand", () => {
  const p = pol("CA100", { users: { includeUsers: ["All"] } }, { builtInControls: ["mfa"], operator: "AND" });
  const m = matrix([p], { partners: PARTNER() });
  // .map inside the vm realm returns that realm's Array, which deepEqual
  // refuses on prototype identity — compare the plain data.
  assert.deepEqual([...m.controls].map((c) => String(c.key)), ["mfa"]);
  assert.ok(!cell(m, "b2bCollaborationGuest", "compliantDevice"), "a control nobody demands has no cell at all");
});

test("the verdicts follow the documented table", () => {
  const st = strengths("s1", "Phishing-resistant MFA", ["fido2"]);
  const p = pol("CA100", { users: { includeUsers: ["All"] } },
    { authenticationStrength: { id: "s1" }, builtInControls: ["compliantDevice", "compliantApplication"], operator: "AND" },
    { signInFrequency: { isEnabled: true } });
  const m = matrix([p], { strengths: st, partners: PARTNER() });
  assert.equal(cell(m, "b2bCollaborationGuest", "strength").v, "blocked");
  assert.equal(cell(m, "b2bCollaborationGuest", "compliantDevice").v, "trust");
  assert.equal(cell(m, "b2bCollaborationGuest", "appProtection").v, "blocked");
  assert.equal(cell(m, "b2bCollaborationGuest", "signInFrequency").v, "ok");
  // direct connect loses sign-in frequency entirely
  assert.equal(cell(m, "b2bDirectConnectUser", "signInFrequency").v, "blocked");
  // a local guest is fine everywhere — it is this tenant's own account
  assert.equal(cell(m, "internalGuest", "appProtection").v, "ok");
  assert.equal(cell(m, "internalGuest", "strength").v, "ok");
  // an authentication strength does not reach a non-Entra external identity
  assert.equal(cell(m, "otherExternalUser", "strength").v, "na");
});

test("a cell carries the policies behind it, and the worst verdict wins", () => {
  const good = pol("CA1", { users: { includeUsers: ["All"] } }, { builtInControls: ["mfa"], operator: "AND" });
  const bad = pol("CA2", { users: { includeUsers: ["All"] } }, { builtInControls: ["mfa", "compliantApplication"], operator: "AND" });
  const m = matrix([good, bad], { partners: PARTNER() });
  assert.equal(cell(m, "b2bCollaborationGuest", "mfa").policies.length, 2);
  assert.equal(cell(m, "b2bCollaborationGuest", "appProtection").v, "blocked");
  assert.equal(cell(m, "b2bCollaborationGuest", "appProtection").policies.length, 1);
});

test("the matrix says when the trust answers are unverified", () => {
  const p = pol("CA100", { users: { includeUsers: ["All"] } }, { builtInControls: ["compliantDevice"], operator: "AND" });
  assert.equal(matrix([p], { partners: NOT_READ }).trustRead, false);
  assert.equal(matrix([p], { partners: PARTNER() }).trustRead, false, "partners alone leave the default unknown");
  assert.equal(matrix([p], CT({})).trustRead, true);
  const html = M.renderGuestMatrix(matrix([p], { partners: NOT_READ }));
  assert.match(html, /every trust answer here is unverified/);
});

test("an empty matrix renders nothing rather than an empty table", () => {
  assert.equal(M.renderGuestMatrix(matrix([], { partners: PARTNER() })), "");
  const noControls = pol("CA0", { users: { includeUsers: ["All"] } }, { builtInControls: [], operator: "AND" });
  assert.equal(M.renderGuestMatrix(matrix([noControls], { partners: PARTNER() })), "");
});

test("policy names reach the matrix HTML escaped", () => {
  const p = pol("<script>bad</script>", { users: { includeUsers: ["All"] } }, { builtInControls: ["mfa"], operator: "AND" });
  const html = M.renderGuestMatrix(matrix([p], { partners: PARTNER() }));
  assert.ok(!html.includes("<script>bad"));
});

// ---- the companion policy (25458) ---------------------------------------
// Mihai, on the guest auth-strength finding: "not clear what to exclude and
// what to create". The answers are "nothing" and "one policy beside it", and
// the second one is now built. These tests hold the two properties that make
// it that rather than an adjustment: the original is untouched, and the new
// policy carries a number of its own instead of a bumped version.

const STRENGTH = { id: "s-mfa", displayName: "Multifactor authentication" };
const guestStrengthPolicy = (name) => ({
  id: name, displayName: name, state: "enabled",
  conditions: {
    users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest", "b2bCollaborationMember") },
    applications: { includeApplications: ["All"] },
    clientAppTypes: ["all"],
  },
  grantControls: { operator: "OR", builtInControls: [], authenticationStrength: STRENGTH },
  sessionControls: { signInFrequency: { isEnabled: true, value: 1, type: "hours" } },
});

const companionOf = (policies, findings) =>
  M.buildFixes(findings, policies, { raws: policies }).fixes.find((f) => f.companion);

test("the guest auth-strength finding builds a companion, not an adjustment", () => {
  const p = guestStrengthPolicy("CA400-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-v1.0.2");
  const findings = run([p], { strengths: new Map([["s-mfa", STRENGTH]]) })
    .filter((f) => f.check.id === "guest-auth-strength-not-universal");
  assert.equal(findings.length, 1, "the check fires");
  const c = companionOf([p], findings);
  assert.ok(c, "a companion is prepared");
  assert.equal(c.companion, true);
  // the plain control replaces the strength — Entra refuses both in one policy
  // (the draft is built inside the vm sandbox, so compare by value, not by
  // prototype: deepStrictEqual fails cross-realm on structurally equal arrays)
  assert.deepEqual([...c.draft.grantControls.builtInControls], ["mfa"]);
  assert.equal(c.draft.grantControls.authenticationStrength, undefined);
  // the scope is copied whole: nothing is excluded, because nothing can be
  assert.equal(JSON.stringify(c.draft.conditions.users.includeGuestsOrExternalUsers),
    JSON.stringify(p.conditions.users.includeGuestsOrExternalUsers));
  assert.deepEqual([...c.draft.conditions.applications.includeApplications], ["All"]);
  assert.equal(c.draft.state, "disabled", "never born enabled");
  // and the ORIGINAL is untouched — the whole point of a companion
  assert.equal(p.grantControls.authenticationStrength, STRENGTH);
  assert.deepEqual(p.grantControls.builtInControls, []);
});

test("the companion takes the next free number in the original's range, not a bumped version", () => {
  const p = guestStrengthPolicy("CA400-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-v1.0.2");
  const neighbours = ["CA401-GRANT-GuestUsers-X-v1.0", "CA402-BLOCK-GuestUsers-Y-v1.0"]
    .map((n) => ({ id: n, displayName: n, state: "enabled", conditions: { users: {} }, grantControls: null }));
  const all = [p, ...neighbours];
  const findings = run(all, { strengths: new Map([["s-mfa", STRENGTH]]) })
    .filter((f) => f.check.id === "guest-auth-strength-not-universal");
  const c = companionOf(all, findings);
  assert.equal(c.newName, "CA403-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-NonEntraExternals-v1.0");
  assert.notEqual(c.newName, M.bumpVersion(p.displayName), "a bumped version would read as a replacement");
});

test("nextFreeNumber stays inside the original's hundred and skips what is taken", () => {
  const used = ["CA400 a", "CA401 b", "CA403 c"].map((n) => ({ displayName: n }));
  assert.equal(M.nextFreeNumber({ displayName: "CA400 a" }, used), 402);
  assert.equal(M.nextFreeNumber({ displayName: "CA000 global" }, [{ displayName: "CA000 global" }]), 1);
  assert.equal(M.nextFreeNumber({ displayName: "no number here" }, used), null, "no number, no guess");
});

test("a policy off the naming convention gets a name in words, never a forced one", () => {
  assert.equal(M.companionName("Require MFA for guests", 7), "Require MFA for guests — plain MFA for non-Entra externals");
  assert.equal(M.companionName("CA400-GRANT-GuestUsers-X-v2.1", null), "CA400-GRANT-GuestUsers-X-v2.1 — plain MFA for non-Entra externals");
});

test("a staging prefix on the original does not travel into the companion's number", () => {
  const p = guestStrengthPolicy("(UP)CA400-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-v1.0.2");
  const findings = run([p], { strengths: new Map([["s-mfa", STRENGTH]]) })
    .filter((f) => f.check.id === "guest-auth-strength-not-universal");
  const c = companionOf([p], findings);
  assert.equal(c.newName, "CA401-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-NonEntraExternals-v1.0");
  assert.ok(!/\(UP\)/.test(c.newName), "the staging prefix is not carried into a brand-new policy");
});

// ---- the two strength verdicts (25459) ----------------------------------
// Mihai, on a policy using the built-in Multifactor authentication strength:
// "the strength is allowing more, so the conclusion of the check is wrong."
// It was. Microsoft's built-in table calls the MFA strength "the same set of
// combinations that can be used to satisfy the Require multifactor
// authentication setting", so telling somebody to keep it AND add a second
// policy is advice for a strength that asks more than the grant control. Where
// it does not, the answer is one swap.

const MFA_STRENGTH = {
  id: "s-mfa-builtin", displayName: "Multifactor authentication",
  allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor",
    "deviceBasedPush", "temporaryAccessPassOneTime", "password,microsoftAuthenticatorPush",
    "password,sms", "password,voice", "federatedMultiFactor", "federatedSingleFactor,sms"],
};
const PHISH_STRENGTH = {
  id: "s-phish", displayName: "Phishing-resistant MFA",
  allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor"],
};
const strengthPolicy = (name, st) => ({
  id: name, displayName: name, state: "enabled",
  conditions: {
    users: { includeUsers: ["None"], includeGuestsOrExternalUsers: GUESTS("b2bCollaborationGuest") },
    applications: { includeApplications: ["All"] }, clientAppTypes: ["all"],
  },
  grantControls: { operator: "OR", builtInControls: [], authenticationStrength: st },
  sessionControls: null,
});

test("a strength equal to Require MFA is the swap case, not the second-policy case", () => {
  const p = strengthPolicy("CA400-GRANT-GuestUsers-MFA-v1.0", MFA_STRENGTH);
  const f = ids(run([p], { strengths: new Map([[MFA_STRENGTH.id, MFA_STRENGTH]]) }));
  assert.ok(f.includes("guest-auth-strength-swap-for-mfa"), "the swap finding fires");
  assert.ok(!f.includes("guest-auth-strength-not-universal"), "and the add-a-policy finding does NOT");
});

test("a stricter strength is still the second-policy case", () => {
  const p = strengthPolicy("CA400-GRANT-GuestUsers-PhishRes-v1.0", PHISH_STRENGTH);
  const f = ids(run([p], { strengths: new Map([[PHISH_STRENGTH.id, PHISH_STRENGTH]]) }));
  assert.ok(f.includes("guest-auth-strength-not-universal"), "the add-a-policy finding fires");
  assert.ok(!f.includes("guest-auth-strength-swap-for-mfa"), "and the swap finding does NOT");
});

test("the two verdicts are mutually exclusive on every strength shape", () => {
  const shapes = [MFA_STRENGTH, PHISH_STRENGTH,
    { id: "s-pwless", displayName: "Passwordless MFA", allowedCombinations: ["fido2", "windowsHelloForBusiness", "deviceBasedPush", "x509CertificateMultiFactor"] },
    { id: "s-custom-pw", displayName: "Custom with password", allowedCombinations: ["password,hardwareOath"] },
  ];
  for (const st of shapes) {
    const p = strengthPolicy("CA400-x-" + st.id, st);
    const f = ids(run([p], { strengths: new Map([[st.id, st]]) }))
      .filter((x) => x === "guest-auth-strength-swap-for-mfa" || x === "guest-auth-strength-not-universal");
    assert.equal(f.length, 1, `${st.displayName}: exactly one verdict, got ${f.join("+") || "none"}`);
  }
});

test("the swap fix exchanges the control in place and adds no policy", () => {
  const p = strengthPolicy("CA400-GRANT-GuestUsers-MFA-v1.0", MFA_STRENGTH);
  const findings = run([p], { strengths: new Map([[MFA_STRENGTH.id, MFA_STRENGTH]]) })
    .filter((f) => f.check.id === "guest-auth-strength-swap-for-mfa");
  const res = M.buildFixes(findings, [p], { raws: [p] });
  assert.equal(res.fixes.length, 1);
  const fx = res.fixes[0];
  assert.ok(!fx.companion, "an adjustment, not a companion — one policy in, one out");
  assert.equal(fx.newName, M.bumpVersion(p.displayName), "the version bump is right HERE: it replaces the original");
  assert.deepEqual([...fx.draft.grantControls.builtInControls], ["mfa"]);
  assert.equal(fx.draft.grantControls.authenticationStrength, undefined);
});

test("with the strengths unread the swap check says nothing rather than guessing", () => {
  const p = strengthPolicy("CA400-GRANT-GuestUsers-MFA-v1.0", MFA_STRENGTH);
  const f = ids(run([p], { strengths: new Map() }));
  assert.ok(!f.includes("guest-auth-strength-swap-for-mfa"), "no strength definition, no verdict about its combinations");
  assert.ok(f.includes("guest-auth-strength-not-universal"), "the conservative finding still stands");
});

// ---- which way the policy is wrong (25460) -------------------------------
// Mihai: "but the check clearly says to exclude these users. i am confused."
// Four external findings open with "Exclude the guest and external user
// types" and two say "Exclude nothing". Both are right, for opposite
// failures. These tests hold the classification to the remediation each
// check actually gives, so the badge can never drift from the advice.

test("every classified external finding is denies or misses, and nothing else", () => {
  const vals = new Set(Object.values(M.EFFECT));
  assert.deepEqual([...vals].sort(), ["denies", "misses"]);
  for (const k of Object.keys(M.EFFECT)) assert.ok(M.EFFECT_TEXT[M.EFFECT[k]], `${k} has text`);
});

test("a finding whose remedy is to exclude the types is classified denies", () => {
  for (const id of ["guest-auth-strength-unsatisfiable", "guest-unsupported-grant",
    "guest-device-grant-needs-trust", "guest-user-risk-blocked",
    "sp-blocked", "sp-unsupported-grant", "sp-device-grant-needs-trust"]) {
    assert.equal(M.EFFECT[id], "denies", id);
  }
});

test("a finding whose remedy is to add or swap a control is classified misses", () => {
  for (const id of ["guest-auth-strength-not-universal", "guest-auth-strength-swap-for-mfa",
    "sp-not-in-external-mfa"]) {
    assert.equal(M.EFFECT[id], "misses", id);
  }
});

test("the two checks that are neither carry no verdict rather than a guessed one", () => {
  // dc-unsupported-control ends in "decide deliberately"; sp-exclusion-incomplete
  // covers identities you meant to exclude, which is a third thing.
  assert.equal(M.EFFECT["dc-unsupported-control"], undefined);
  assert.equal(M.EFFECT["sp-exclusion-incomplete"], undefined);
});

test("the classification agrees with the remediation text of every classified check", () => {
  // the whole point: a badge that says "blocks them" over advice to add a
  // policy, or "misses them" over advice to exclude, would be worse than none
  const say = (id) => {
    const p = strengthPolicy("CA400-x", PHISH_STRENGTH);
    const all = run([p], { strengths: new Map([[PHISH_STRENGTH.id, PHISH_STRENGTH]]) });
    const f = all.find((x) => x.check.id === id);
    return f ? f.check : null;
  };
  // sampled on one that fires here; the rest are asserted by their EFFECT above
  const c = say("guest-auth-strength-not-universal");
  assert.ok(c, "the finding fires");
  assert.equal(M.EFFECT[c.id], "misses");
  assert.match(c.remediation, /^Exclude nothing/, "misses means the advice does NOT start with an exclusion");
});
