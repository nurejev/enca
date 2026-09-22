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

test("with inbound MFA trust configured it is still raised, but as a trust dependency", () => {
  const st = strengths("s1", "Phishing-resistant MFA", ["fido2"]);
  const p = pol("CA210",
    { users: { includeUsers: ["All"] } },
    { authenticationStrength: { id: "s1" }, builtInControls: [], operator: "OR" });
  const f = find(run([p], { strengths: st, partners: PARTNER({ isMfaAccepted: true }) }), "guest-auth-strength-unsatisfiable");
  assert.ok(f);
  assert.match(f.result.detail, /Inbound MFA trust IS configured/);
  assert.match(f.result.detail, /confirm those tenants have actually deployed the method/);
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
  assert.ok(find(run([p], { partners: PARTNER() }), "guest-device-grant-needs-trust"));
  assert.ok(!find(run([p], { partners: PARTNER({ isCompliantDeviceAccepted: true }) }), "guest-device-grant-needs-trust"));
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
  assert.equal(matrix([p], { partners: PARTNER() }).trustRead, true);
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
