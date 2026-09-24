// js/xtenant.js — the 🤝 Cross-tenant tab of 🛡 Checks.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const XT = new Function(read("js/xtenant.js") + ";return XTenant;")();

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";
const pol = (name, state, users, grant) => ({ displayName: name, state, conditions: { users }, grantControls: grant });
const guests = (types, members) => ({ guestOrExternalUserTypes: types, externalTenants: members ? { membershipKind: "enumerated", members } : { membershipKind: "all" } });
const MFA = { builtInControls: ["mfa"] };
const DEV = { builtInControls: ["compliantDevice"] };
const open = { usersAndGroups: { accessType: "allowed", targets: [{ target: "AllUsers" }] }, applications: { accessType: "allowed", targets: [{ target: "AllApplications" }] } };
const run = (input, pols) => XT.analyze({ defaultOk: true, partnersOk: true, ...input }, pols || []);
const find = (m, setting, id) => m.findings.filter((f) => f.setting === setting && (id === undefined || f.id === id));

test("default MFA trust is HIGH only when an enabled policy relies on it", () => {
  const def = { inboundTrust: { isMfaAccepted: true } };
  const relied = run({ def }, [pol("CA-guests-MFA", "enabled", { includeGuestsOrExternalUsers: guests("b2bCollaborationGuest") }, MFA)]);
  assert.strictEqual(find(relied, "inboundTrust.isMfaAccepted")[0].sev, "high");
  assert.deepStrictEqual(find(relied, "inboundTrust.isMfaAccepted")[0].policies, ["CA-guests-MFA"]);
  const nobody = run({ def }, [pol("CA-admins", "enabled", { includeRoles: ["x"] }, MFA)]);
  assert.strictEqual(find(nobody, "inboundTrust.isMfaAccepted")[0].sev, "medium");
  const reportOnly = run({ def }, [pol("CA-all", "enabledForReportingButNotEnforced", { includeUsers: ["All"] }, MFA)]);
  assert.strictEqual(find(reportOnly, "inboundTrust.isMfaAccepted")[0].sev, "medium", "report-only does not make it high");
  assert.match(find(reportOnly, "inboundTrust.isMfaAccepted")[0].text, /only report-only ones/);
  const off = run({ def: { inboundTrust: { isMfaAccepted: false } } }, [pol("CA-all", "enabled", { includeUsers: ["All"] }, MFA)]);
  assert.strictEqual(find(off, "inboundTrust.isMfaAccepted").length, 0);
});

test("an authentication strength counts as an MFA ask; disabled policies never count", () => {
  const def = { inboundTrust: { isMfaAccepted: true } };
  const m = run({ def }, [pol("S", "enabled", { includeUsers: ["All"] }, { authenticationStrength: { id: "x" } }), pol("Off", "disabled", { includeUsers: ["All"] }, MFA)]);
  assert.deepStrictEqual(m.def.reach.mfa.map((x) => x.name), ["S"]);
});

test("reach: exclusions of all tenants remove the type, exclusions naming tenants only those", () => {
  const p = pol("P", "enabled", { includeUsers: ["All"], excludeGuestsOrExternalUsers: guests("b2bCollaborationGuest,b2bCollaborationMember,b2bDirectConnectUser") }, MFA);
  assert.deepStrictEqual(XT.reachTypes(p, A, new Set()), []);
  const q = pol("Q", "enabled", { includeUsers: ["All"], excludeGuestsOrExternalUsers: guests("b2bCollaborationGuest,b2bCollaborationMember,b2bDirectConnectUser", [A]) }, MFA);
  assert.deepStrictEqual(XT.reachTypes(q, A, new Set([A])), []);
  assert.strictEqual(XT.reachTypes(q, B, new Set([A, B])).length, 3, "B is not named in the exclusion");
  assert.strictEqual(XT.reachTypes(q, null, new Set([A])).length, 3, "the default is not taken out by a named exclusion");
  const legacy = pol("L", "enabled", { includeUsers: ["All"], excludeUsers: ["GuestsOrExternalUsers"] }, MFA);
  assert.deepStrictEqual(XT.reachTypes(legacy, A, new Set()), []);
});

test("reach: an include naming tenants reaches only them; the default only through non-partners", () => {
  const p = pol("P", "enabled", { includeGuestsOrExternalUsers: guests("b2bCollaborationGuest", [A]) }, MFA);
  assert.deepStrictEqual(XT.reachTypes(p, A, new Set([A])), ["b2bCollaborationGuest"]);
  assert.deepStrictEqual(XT.reachTypes(p, B, new Set([A, B])), []);
  assert.deepStrictEqual(XT.reachTypes(p, null, new Set([A])), [], "A has its own entry, so the default does not decide for it");
  assert.deepStrictEqual(XT.reachTypes(p, null, new Set()), ["b2bCollaborationGuest"]);
  const localOnly = pol("G", "enabled", { includeGuestsOrExternalUsers: guests("internalGuest,serviceProvider") }, MFA);
  assert.deepStrictEqual(XT.reachTypes(localOnly, A, new Set()), [], "local guests and service providers are not what inbound trust decides");
});

test("partner trust inherits the default PER FLAG", () => {
  const t = XT.effTrust({ isMfaAccepted: true, isCompliantDeviceAccepted: false }, { isMfaAccepted: null, isCompliantDeviceAccepted: true });
  assert.strictEqual(t.mfa, true); assert.strictEqual(t.inherited.mfa, true);
  assert.strictEqual(t.compliant, true); assert.strictEqual(t.inherited.compliant, false);
  assert.strictEqual(XT.effTrust({ isMfaAccepted: true }, null).mfa, true);
});

test("partner findings: gone, sync, auto-redeem, device, MFA, direct connect, CSP, empty entry", () => {
  const m = run({
    def: { inboundTrust: {} },
    partners: [
      { tenantId: A, inboundTrust: { isCompliantDeviceAccepted: true, isMfaAccepted: true }, automaticUserConsentSettings: { inboundAllowed: true }, b2bDirectConnectInbound: open },
      { tenantId: B },
      { tenantId: C, isServiceProvider: true },
    ],
    sync: { [A]: { displayName: "Contoso", userSyncInbound: { isSyncAllowed: true } }, [B]: null },
    exists: { [A]: true, [B]: false, [C]: null }, existsChecked: true,
  }, [pol("CA-guests-device", "enabled", { includeGuestsOrExternalUsers: guests("b2bCollaborationGuest") }, DEV)]);
  assert.strictEqual(find(m, "tenant", B)[0].sev, "high");
  assert.strictEqual(find(m, "tenant", C).length, 0, "not checked is never gone");
  assert.strictEqual(find(m, "identitySynchronization.userSyncInbound", A)[0].sev, "medium");
  assert.strictEqual(find(m, "automaticUserConsentSettings.inboundAllowed", A).length, 1);
  assert.match(find(m, "inboundTrust (device)", A)[0].text, /satisfies the device requirement of 1/);
  assert.strictEqual(find(m, "inboundTrust.isMfaAccepted", A)[0].sev, "info");
  assert.strictEqual(find(m, "b2bDirectConnectInbound", A)[0].sev, "medium");
  assert.strictEqual(find(m, "isServiceProvider", C).length, 1);
  assert.strictEqual(find(m, "entry", C).length, 0, "a CSP entry is not flagged as empty");
  assert.strictEqual(find(m, "entry", B).length, 0, "a gone tenant is flagged as gone, not as empty");
  assert.strictEqual(m.partners[0].name, "Contoso", "the sync display name names the partner when names were not read");
  assert.strictEqual(m.partners[0].reachN, 1);
  assert.strictEqual(m.findings[0].sev, "high", "high first");
});

test("an entry that overrides nothing is info; unread sync is unknown, not off", () => {
  const m = run({ def: {}, partners: [{ tenantId: A }], exists: { [A]: true } });
  assert.strictEqual(find(m, "entry", A)[0].sev, "info");
  assert.strictEqual(m.partners[0].syncIn, null);
});

test("default guest inbound open is INFO (Microsoft default), direct connect allowed is MEDIUM", () => {
  const m = run({ def: { b2bCollaborationInbound: open, b2bDirectConnectInbound: open } });
  assert.strictEqual(find(m, "b2bCollaborationInbound")[0].sev, "info");
  assert.strictEqual(find(m, "b2bDirectConnectInbound")[0].sev, "medium");
  assert.strictEqual(XT.fmtAccess(open), "allowed: all users / all apps");
  assert.strictEqual(XT.fmtAccess(null), "inherits default");
});

test("unread default and partners render a message, not a crash; names are escaped", () => {
  const m = XT.analyze({ defaultOk: false, partnersOk: false, error: "403 <b>" }, []);
  const html = XT.render(m, {});
  assert.match(html, /Could not be read/);
  assert.ok(!html.includes("403 <b>") && html.includes("403 &lt;b&gt;"), "the error is escaped");
  const n = run({ def: {}, partners: [{ tenantId: A }], info: { [A]: { displayName: "<script>x</script>", defaultDomainName: "a.example" } }, namesRead: true });
  assert.ok(!XT.render(n, {}).includes("<script>"));
  assert.match(XT.toMd(n, "T"), /Partners/);
  assert.match(XT.toCsv(run({ def: { b2bDirectConnectInbound: open } })), /^"?severity/);
});

test("rows with a malformed tenant id are dropped, not used in a URL", () => {
  const m = run({ def: {}, partners: [{ tenantId: "../../x" }, { tenantId: A }] });
  assert.deepStrictEqual(m.partners.map((p) => p.id), [A]);
});
