// 🏗 Policy builder (T41, build 25437) — the pure half, in node.
//   node --test tools/builder.test.cjs
// Loads js/builder.js, js/whatifeval.js and js/cascope.js the way the page
// does (classic scripts sharing one scope), with no DOM.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const ctx = { console };
vm.createContext(ctx);
for (const f of ["js/cascope.js", "js/whatifeval.js", "js/builder.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
vm.runInContext("this.Builder = Builder; this.WhatIfEval = WhatIfEval;", ctx);
const { Builder } = ctx;
// values built inside the vm carry that realm's prototypes, which strict
// deepEqual refuses as "same structure, not reference-equal" — compare plain copies
const plain = (v) => JSON.parse(JSON.stringify(v));
const eq = (actual, expected, msg) => assert.deepEqual(plain(actual), plain(expected), msg);

const raws = [
  { id: "p200", displayName: "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", state: "enabled",
    conditions: { users: { includeUsers: [], excludeUsers: [], includeGroups: ["g-int"], excludeGroups: ["g-bg"], includeRoles: [], excludeRoles: [] }, applications: { includeApplications: ["All"], excludeApplications: [], includeUserActions: [], includeAuthenticationContextClassReferences: [] }, clientAppTypes: ["all"], signInRiskLevels: [], userRiskLevels: [], platforms: null, locations: null },
    grantControls: { operator: "OR", builtInControls: ["mfa"], customAuthenticationFactors: [], termsOfUse: [] }, sessionControls: null },
  { id: "p201", displayName: "CA201-BLOCK-Internals-IP-AnyApp-AnyPlatform-LegacyAuthentication-v1.0", state: "enabled",
    conditions: { users: { includeUsers: ["All"], excludeUsers: [], includeGroups: [], excludeGroups: ["g-bg"], includeRoles: [], excludeRoles: [] }, applications: { includeApplications: ["All"], excludeApplications: [] }, clientAppTypes: ["exchangeActiveSync", "other"] },
    grantControls: { operator: "OR", builtInControls: ["block"] }, sessionControls: null },
  { id: "p300", displayName: "(NEW)CA300-GRANT-Externals-DP-Office365-AnyPlatform-AuthStrength-v2.1", state: "enabledForReportingButNotEnforced",
    conditions: { users: { includeUsers: [], includeGroups: ["g-ext"], excludeGroups: [], includeRoles: [], excludeRoles: [], includeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" } } }, applications: { includeApplications: ["Office365"], excludeApplications: [] }, clientAppTypes: ["browser", "mobileAppsAndDesktopClients"], locations: { includeLocations: ["All"], excludeLocations: ["AllTrusted"] }, platforms: { includePlatforms: ["windows", "macOS"], excludePlatforms: [] }, signInRiskLevels: ["high"], userRiskLevels: [] },
    grantControls: { operator: "AND", builtInControls: ["compliantDevice"], customAuthenticationFactors: [], termsOfUse: ["tou-1"], authenticationStrength: { id: "s-pr", displayName: "Phishing-resistant MFA", policyType: "builtIn", requirementsSatisfied: "mfa", allowedCombinations: ["fido2"] } },
    sessionControls: { signInFrequency: { isEnabled: true, frequencyInterval: "timeBased", type: "hours", value: 12, authenticationType: "primaryAndSecondaryAuthentication" }, persistentBrowser: { isEnabled: true, mode: "never" }, continuousAccessEvaluation: { mode: "strictLocation" } } },
];
const groups = [{ id: "g-int", name: "CAB-SEC-U-Persona-Internals" }, { id: "g-bg", name: "CAB-SEC-U-BreakGlass" }, { id: "g-ext", name: "CAB-SEC-U-Persona-Externals" }];
const names = (id) => (groups.find((g) => g.id === id) || {}).name || (id === "s-pr" ? "Phishing-resistant MFA" : id);
const locations = [
  { id: "l-hq", "@odata.type": "#microsoft.graph.ipNamedLocation", displayName: "HQ egress", isTrusted: true, ipRanges: [{ cidrAddress: "203.0.113.0/24" }] },
  { id: "l-branch", "@odata.type": "#microsoft.graph.ipNamedLocation", displayName: "Branch office", isTrusted: false, ipRanges: [{ cidrAddress: "198.51.100.0/24" }] },
  { id: "l-empty", "@odata.type": "#microsoft.graph.countryNamedLocation", displayName: "Blocked countries (empty)", countriesAndRegions: [] },
];
const CTX = { raws, names, groups, locations };

test("the next free number is the smallest unused one in the persona's range", () => {
  assert.equal(Builder.nextNumber("internals", raws).num, 202);
  assert.equal(Builder.nextNumber("externals", raws).num, 301);   // (NEW) prefix skipped, number still taken
  assert.equal(Builder.nextNumber("admins", raws).num, 100);
  assert.equal(Builder.nextNumber("internals", raws, null, "p200").num, 200); // the policy being edited keeps its own
  eq(Builder.nextNumber("internals", raws).taken.map((t) => t[0]), [200, 201]);
});

test("the name follows the convention and the kind follows the controls", () => {
  const d = Builder.blank(); d.persona = "internals"; d.number = 216; d.users.includeGroups = ["g-int"];
  assert.equal(Builder.nameOf(d), "CA216-GRANT-Internals-AnyApp-AnyPlatform-Grant-v1.0");
  d.grant.controls = ["mfa"]; d.apps.target = "selected"; d.apps.includeApplications = ["Office365"];
  assert.equal(Builder.nameOf(d), "CA216-GRANT-Internals-Office365-AnyPlatform-MFA-v1.0");
  d.grant.mode = "block"; d.cond.clientApps = ["other"];
  assert.equal(Builder.kindOf(d), "BLOCK");
  assert.match(Builder.nameOf(d), /^CA216-BLOCK-Internals-Office365-AnyPlatform-LegacyAuthentication-v1\.0$/);
  d.grant.mode = "grant"; d.grant.controls = []; d.session.sif = { everyTime: true };
  assert.equal(Builder.kindOf(d), "SESSION");
  d.words = "Custom-Words"; d.version = "2.3";
  assert.equal(Builder.nameOf(d), "CA216-SESSION-Internals-Custom-Words-v2.3");
  d.customName = "My own name"; assert.equal(Builder.nameOf(d), "My own name");
});

test("the Graph body carries whole sections, the guest clause whole, and nothing a create refuses", () => {
  const d = Builder.blank(); d.persona = "externals"; d.number = 301;
  d.users.includeGroups = ["g-ext"]; d.users.excludeGroups = ["g-bg"];
  d.users.includeGuests = { guestOrExternalUserTypes: "b2bCollaborationGuest,serviceProvider", externalTenants: { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" } };
  d.apps.target = "selected"; d.apps.includeApplications = ["Office365"];
  d.cond.locations = { mode: "any", include: [], exclude: ["l-branch"], excludeTrusted: true };
  d.cond.platforms = { mode: "selected", include: ["windows"], exclude: [] };
  d.cond.clientApps = ["browser"]; d.cond.signInRisk = ["high"]; d.cond.deviceFilter = { mode: "exclude", rule: 'device.trustType -eq "AzureAD"' };
  d.grant.controls = ["compliantDevice"]; d.grant.strength = "s-pr"; d.grant.termsOfUse = ["tou-1"]; d.grant.operator = "AND";
  d.session.sif = { value: 12, type: "hours" }; d.session.persistent = "never"; d.session.tokenProtection = true;
  const raw = Builder.toRaw(d);
  assert.equal(raw.state, "enabledForReportingButNotEnforced");
  eq(raw.conditions.users.includeGroups, ["g-ext"]);
  eq(raw.conditions.users.excludeGroups, ["g-bg"]);
  assert.equal(raw.conditions.users.includeGuestsOrExternalUsers.externalTenants["@odata.type"], "#microsoft.graph.conditionalAccessAllExternalTenants");
  assert.equal("excludeGuestsOrExternalUsers" in raw.conditions.users, false);
  eq(raw.conditions.locations, { includeLocations: ["All"], excludeLocations: ["AllTrusted", "l-branch"] });
  eq(raw.conditions.platforms, { includePlatforms: ["windows"], excludePlatforms: [] });
  eq(raw.conditions.clientAppTypes, ["browser"]);
  assert.equal(raw.conditions.devices.deviceFilter.rule, 'device.trustType -eq "AzureAD"');
  eq(raw.grantControls, { operator: "AND", builtInControls: ["compliantDevice"], customAuthenticationFactors: [], termsOfUse: ["tou-1"], authenticationStrength: { id: "s-pr" } });
  assert.equal(raw.sessionControls.signInFrequency.value, 12);
  assert.equal(raw.sessionControls.persistentBrowser.mode, "never");
  assert.equal(raw.sessionControls.secureSignInSession.isEnabled, true);
  // every client app ticked is what the portal stores as ["all"]
  d.cond.clientApps = Builder.CLIENT_APPS.map((x) => x[0]);
  eq(Builder.toRaw(d).conditions.clientAppTypes, ["all"]);
  // a block is a block and nothing else
  d.grant.mode = "block";
  eq(Builder.toRaw(d).grantControls, { operator: "OR", builtInControls: ["block"] });
  // a clause with no type is not written at all
  d.users.includeGuests = null; d.users.excludeGuests = { guestOrExternalUserTypes: "" };
  const u2 = Builder.toRaw(d).conditions.users;
  assert.equal("includeGuestsOrExternalUsers" in u2, false); assert.equal("excludeGuestsOrExternalUsers" in u2, false);
});

test("a policy selected elsewhere round-trips: fromRaw then toRaw is a no-op edit", () => {
  for (const r of raws) {
    const d = Builder.fromRaw(r);
    assert.equal(d.sourceId, r.id);
    const body = Builder.patchBody(r, d);
    eq(body, {}, `${r.displayName} should need no PATCH: ${JSON.stringify(body)}`);
    assert.equal(Builder.diff(Builder.canon({ displayName: r.displayName, state: r.state, conditions: r.conditions, grantControls: r.grantControls, sessionControls: r.sessionControls }), Builder.canon(Builder.toRaw(d))).length, 0);
  }
  const d = Builder.fromRaw(raws[2]);
  assert.equal(d.persona, "externals"); assert.equal(d.number, 300); assert.equal(d.version, "2.1");
  assert.equal(d.words, "DP-Office365-AnyPlatform-AuthStrength");
  assert.equal(d.grant.strength, "s-pr"); assert.equal(d.names["s-pr"], "Phishing-resistant MFA");
  assert.equal(d.cond.locations.excludeTrusted, true);
  eq(d.session.sif, { value: 12, type: "hours", authenticationType: "primaryAndSecondaryAuthentication" });
});

test("an edit PATCHes whole sections, only the ones that changed", () => {
  const d = Builder.fromRaw(raws[0]);
  d.state = "enabledForReportingButNotEnforced";
  eq(Object.keys(Builder.patchBody(raws[0], d)), ["state"]);
  d.users.excludeUsers = ["u-svc"];
  const body = Builder.patchBody(raws[0], d);
  eq(Object.keys(body).sort(), ["conditions", "state"]);
  // the whole users block travels, the exclusion group it already had included (the 25430 rule)
  eq(body.conditions.users.excludeGroups, ["g-bg"]);
  eq(body.conditions.users.includeGroups, ["g-int"]);
  assert.equal("grantControls" in body, false);
  const rows = Builder.diff(Builder.canon(raws[0]), Builder.canon(Builder.toRaw(d)));
  assert.ok(rows.some((x) => x.path === "conditions.users.excludeUsers" && x.after === "u-svc"));
  assert.ok(rows.some((x) => x.path === "state"));
});

test("a clone is a new policy with the next free number, report-only, no source", () => {
  const d = Builder.cloneOf(raws[0], raws);
  assert.equal(d.mode, "clone"); assert.equal(d.sourceId, null); assert.equal(d.number, 202);
  assert.equal(d.state, "enabledForReportingButNotEnforced");
  assert.equal(Builder.nameOf(d), "CA202-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0");
  assert.equal(d.sourceName, raws[0].displayName);
});

test("validation refuses what Graph would refuse, and warns about the rest", () => {
  const d = Builder.blank();
  let v = Builder.validate(d);
  assert.equal(v.ok, false);
  assert.ok(v.bad.some((b) => /Nobody is included/.test(b)));
  assert.ok(v.bad.some((b) => /Nothing is enforced/.test(b)));
  d.number = 216; d.users.includeGroups = ["g-int"]; d.grant.controls = ["approvedApplication"];
  v = Builder.validate(d);
  assert.ok(v.bad.some((b) => /retired on 30 June 2026/.test(b)));
  // two built-in controls, not mfa + a strength: since 25465 that pair is
  // itself invalid (Entra refuses it, and the portal will not even offer it),
  // so it can no longer stand in for "more than one control"
  d.grant.controls = ["mfa", "compliantDevice"]; d.grant.strength = null; d.grant.operator = "XOR";
  assert.ok(Builder.validate(d).bad.some((b) => /AND or OR/.test(b)));
  d.grant.operator = "AND"; assert.equal(Builder.validate(d).ok, true);
  d.users.includeAll = true; d.users.excludeGroups = [];
  assert.ok(Builder.validate(d).warn.some((w) => /break-glass/.test(w)));
  d.state = "enabled"; assert.ok(Builder.validate(d).warn.some((w) => /Creating it ON/.test(w)));
  d.grant.mode = "block"; d.session.sif = { everyTime: true };
  assert.ok(Builder.validate(d).warn.some((w) => /block policy with session controls/.test(w)));
});

test("hints read the loaded policies and the blocks: break-glass, legacy auth, trusted locations, overlap, the number", () => {
  const d = Builder.blank(); d.persona = "internals"; d.number = 200; d.users.includeGroups = ["g-int"]; d.grant.controls = ["mfa"];
  d.cond.clientApps = ["browser", "other"]; d.cond.locations.excludeTrusted = true; d.cond.locations.include = ["l-empty"];
  const hs = Builder.hints(d, CTX);
  const at = (n) => hs.filter((h) => h.step === n).map((h) => h.text).join(" | ");
  assert.match(at(1), /CA200 is already held by CA200-GRANT/);
  assert.match(at(2), /CAB-SEC-U-BreakGlass is not excluded/);
  assert.match(at(4), /already blocked tenant-wide by CA201-BLOCK/);
  assert.match(at(4), /Branch office .*not marked trusted/);
  assert.match(at(4), /Blocked countries \(empty\) is a country location with no countries/);
  assert.match(at(7), /1 enabled policy already targets the same people and resources: CA200/);
  assert.match(at(7), /Report-only: nothing changes/);
  d.users.excludeGroups = ["g-bg"]; d.cond.clientApps = ["browser"];
  const hs2 = Builder.hints(d, CTX);
  assert.equal(hs2.some((h) => /BreakGlass is not excluded/.test(h.text)), false);
  assert.equal(hs2.some((h) => /already blocked tenant-wide/.test(h.text)), false);
});

test("preflight evaluates the draft with the loaded policies through WhatIfEval", () => {
  const d = Builder.blank(); d.persona = "internals"; d.number = 216; d.users.includeGroups = ["g-int"]; d.users.excludeGroups = ["g-bg"];
  d.grant.controls = ["mfa"]; d.cond.locations.excludeTrusted = true;
  const pf = Builder.preflight(d, CTX);
  const who = pf.rows.map((r) => r.who);
  assert.ok(who[0].includes("CAB-SEC-U-Persona-Internals"));
  assert.equal(pf.rows[0].applies, true); assert.match(pf.rows[0].verdict, /MFA/);
  assert.ok(pf.rows[0].others.some((n) => /^CA200-GRANT/.test(n)), "the enabled CA200 also applies to that member");
  const trusted = pf.rows.find((r) => /HQ egress/.test(r.what)); assert.ok(trusted); assert.equal(trusted.applies, false);
  const excluded = pf.rows.find((r) => /excluded/.test(r.who)); assert.ok(excluded); assert.equal(excluded.applies, false);
  const guest = pf.rows.find((r) => /guest/.test(r.who)); assert.ok(guest); assert.equal(guest.applies, false);
  d.grant.mode = "block";
  assert.equal(Builder.preflight(d, CTX).rows[0].blocks, true);
});

test("a catalog template seeds what is structured and keeps its own words", () => {
  const entry = { num: 201, name: "CA201-GRANT-Internals-IP-AnyApp-AnyPlatform-MediumUserRisk-v3.0", include: ["CAB-SEC-U-Persona-Internals (group)"], exclude: ["CAB-SEC-U-BreakGlass (group)", "CAB-SEC-U-CA201-Exclusion (group)"], resources: "All resources", network: "Any network or location", conditions: ["Platforms: Any device", "Client apps: Any client app", "User risk: Medium"], grant: "Require risk remediation<br>Authentication strength: Multifactor authentication<br>_Require all of the selected controls_", block: false, session: "Sign-in frequency: Every time" };
  const byName = { "cab-sec-u-persona-internals": "g-int", "cab-sec-u-breakglass": "g-bg" };
  const d = Builder.fromTemplate(entry, byName);
  assert.equal(d.number, 201); assert.equal(d.persona, "internals"); assert.equal(d.version, "3.0");
  eq(d.users.includeGroups, ["g-int"]); eq(d.users.excludeGroups, ["g-bg"]);
  eq(d.template.missing, ["CAB-SEC-U-CA201-Exclusion"]);
  eq(d.cond.userRisk, ["medium", "high"]);
  assert.ok(d.grant.controls.includes("passwordChange")); assert.equal(d.grant.operator, "AND");
  eq(d.session.sif, { everyTime: true });
  assert.ok(d.template.notes.some((n) => /Authentication strength: Multifactor authentication/.test(n)));
  assert.equal(Builder.nameOf(d), entry.name);
});

test("what will happen names the group first, then the policy, and an edit is a PATCH", () => {
  const d = Builder.blank(); d.number = 216; d.persona = "internals";
  let ops = Builder.willDo(d, CTX);
  eq(ops.map((o) => o.op), ["CREATE", "CREATE", "OPEN"]);
  assert.match(ops[0].what, /CAB-SEC-U-CA216-Exclusion/);
  d.createExclusionGroup = false;
  eq(Builder.willDo(d, CTX).map((o) => o.op), ["CREATE", "OPEN"]);
  const e = Builder.fromRaw(raws[0]); e.mode = "edit";
  eq(Builder.willDo(e, CTX).map((o) => o.op), ["PATCH", "OPEN"]);
});

test("summaries and step rows render without markup leaks", () => {
  const d = Builder.fromRaw(raws[2]);
  const html = Builder.stepsHtml(d, 4, { ...CTX, hints: Builder.hints(d, CTX) }, "<p>form</p>");
  assert.ok(html.includes('data-pbstep="4"')); assert.ok(html.includes('data-pbform="4"'));
  assert.ok(Builder.summary(d, 2, CTX).includes("CAB-SEC-U-Persona-Externals (group)"));
  assert.ok(Builder.summary(d, 5, CTX).includes("Phishing-resistant MFA"));
  assert.ok(Builder.summary(d, 4, CTX).includes("outside trusted locations"));
  assert.ok(!Builder.summary(d, 2, { ...CTX, names: () => "<b>x</b>" }).includes("<b>x</b>"));
});

const B = ctx.Builder;

// ---- taking an authentication strength off (25464) -----------------------
// Mihai on CA400: "No strength" + Require multifactor authentication, Save →
// Graph 400 BadRequest, section "grant". toRaw omits authenticationStrength
// when none is chosen, and a PATCH that omits it leaves the old one in place;
// the policy then holds a strength AND the MFA control, which Entra refuses.
// Exactly the swap the 25459 MS Learn check tells you to make.

const withStrength = (id) => ({
  displayName: "CA400-GRANT-GuestUsers-IP-AnyApp-AnyPlatform-MFA-v1.0.2",
  state: "disabled",
  conditions: { users: { includeUsers: ["None"], includeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: { membershipKind: "all" } } }, applications: { includeApplications: ["All"] }, clientAppTypes: ["all"] },
  grantControls: { operator: "OR", builtInControls: [], authenticationStrength: { id, displayName: "Multifactor authentication", allowedCombinations: ["password,sms"] } },
  sessionControls: null,
});

test("dropping the strength for the plain control sends an explicit null", () => {
  const before = withStrength("s-mfa");
  const d = B.fromRaw(before, null);
  d.grant.strength = null;                 // "No strength"
  d.grant.controls = ["mfa"];              // Require multifactor authentication
  const body = B.patchBody(before, d, null);
  assert.ok(body.grantControls, "the grant section is in the body");
  eq(body.grantControls.builtInControls, ["mfa"]);
  assert.ok("authenticationStrength" in body.grantControls, "the key must be PRESENT");
  assert.equal(body.grantControls.authenticationStrength, null, "and explicitly null, or Graph keeps the old strength and refuses the pair");
});

test("a policy that never had a strength is not given a null for one", () => {
  const before = withStrength("s-mfa");
  delete before.grantControls.authenticationStrength;
  before.grantControls.builtInControls = ["mfa"];
  const d = B.fromRaw(before, null);
  d.grant.controls = ["mfa", "compliantDevice"];
  const body = B.patchBody(before, d, null);
  assert.ok(!("authenticationStrength" in (body.grantControls || {})), "nothing to clear, nothing sent");
});

test("keeping a strength still writes it as a bare reference", () => {
  const before = withStrength("s-mfa");
  const d = B.fromRaw(before, null);
  d.state = "enabledForReportingButNotEnforced";
  d.grant.controls = [];                   // unchanged grant otherwise
  const body = B.patchBody(before, d, null);
  if (body.grantControls) {
    eq(Object.keys(body.grantControls.authenticationStrength || {}), ["id"],
      "a write takes the id only — never the expanded strength Graph returns on a read");
  }
});

// ---- the guest clause is named, not echoed (25464 hardening) -------------
test("a guest clause names its external-tenant type on every write", () => {
  const c = B.guestClause({ guestOrExternalUserTypes: "b2bCollaborationGuest", externalTenants: { membershipKind: "all" } });
  assert.equal(c.externalTenants["@odata.type"], "#microsoft.graph.conditionalAccessAllExternalTenants");
});

test("an enumerated guest clause stays enumerated and never silently widens", () => {
  const c = B.guestClause({ guestOrExternalUserTypes: "serviceProvider", externalTenants: { membershipKind: "enumerated", members: ["t1", "t2"] } });
  assert.equal(c.externalTenants["@odata.type"], "#microsoft.graph.conditionalAccessEnumeratedExternalTenants");
  eq(c.externalTenants.members, ["t1", "t2"]);
  const empty = B.guestClause({ guestOrExternalUserTypes: "serviceProvider", externalTenants: { membershipKind: "enumerated", members: [] } });
  assert.equal(empty.externalTenants.membershipKind, "enumerated",
    "an empty enumerated list must NOT fall back to all tenants — that would widen the policy to every tenant on earth");
});

test("annotations from the read never travel into the write", () => {
  const c = B.guestClause({ guestOrExternalUserTypes: "b2bCollaborationGuest", "@odata.context": "x", externalTenants: { "@odata.context": "y", membershipKind: "all" } });
  eq(Object.keys(c).sort(), ["externalTenants", "guestOrExternalUserTypes"]);
  eq(Object.keys(c.externalTenants).sort(), ["@odata.type", "membershipKind"]);
});

// ---- the pair Entra refuses (25465) --------------------------------------
// Mihai, from the portal: "in the entra portal, its not possible when
// selecting. its one or the other." The portal greys the other control and
// says why; ENCA let you tick both and only found out at the save, as a bare
// 400 naming no field. Refuse it where the choice is made.

test("a strength together with Require multifactor authentication is refused before the save", () => {
  const raw = withStrength("s-mfa");
  const d = B.fromRaw(raw, null);
  d.grant.controls = ["mfa"];              // strength still selected
  const v = B.validate(d);
  assert.equal(v.ok, false, "Save must be blocked");
  assert.ok(v.bad.some((m) => /cannot be used with/i.test(m)), "and say so in Entra's words: " + v.bad.join(" | "));
});

test("either one alone is fine", () => {
  const raw = withStrength("s-mfa");
  const onlyStrength = B.fromRaw(raw, null);
  onlyStrength.grant.controls = [];
  assert.ok(!B.validate(onlyStrength).bad.some((m) => /cannot be used with/i.test(m)), "strength alone");
  const onlyMfa = B.fromRaw(raw, null);
  onlyMfa.grant.strength = null;
  onlyMfa.grant.controls = ["mfa"];
  assert.ok(!B.validate(onlyMfa).bad.some((m) => /cannot be used with/i.test(m)), "control alone");
});

test("a block policy is not caught by the rule", () => {
  const raw = withStrength("s-mfa");
  const d = B.fromRaw(raw, null);
  d.grant.mode = "block";
  d.grant.controls = ["mfa"];
  assert.ok(!B.validate(d).bad.some((m) => /cannot be used with/i.test(m)));
});

// ---- 25478: guest clauses limited to chosen tenants ----
test("an enumerated guest clause is written with its tenants, and an empty one is refused", () => {
  const d = Builder.fromRaw(raws.find((r) => r.id === "p300"));
  d.users.excludeGuests = { guestOrExternalUserTypes: "serviceProvider", externalTenants: { membershipKind: "enumerated", members: ["7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009"] } };
  const et = plain(Builder.toRaw(d)).conditions.users.excludeGuestsOrExternalUsers.externalTenants;
  assert.equal(et["@odata.type"], "#microsoft.graph.conditionalAccessEnumeratedExternalTenants");
  eq(et.members, ["7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009"]);
  d.users.excludeGuests.externalTenants.members = [];
  assert.ok(Builder.validate(d).bad.some((x) => /none is chosen/.test(x)));
});

// ---- 25479: the OR judgement from 🛡 Checks, as a builder hint ----
test("Require one (OR) gets the same verdict as Checks: template info, app-protection warn, AND silent", () => {
  const d = Builder.fromRaw(raws.find((r) => r.id === "p200"));
  const orHint = () => Builder.hints(d, { raws }).filter((h) => h.step === 5 && /Require one \(OR\)/.test(h.text));
  d.grant.operator = "OR"; d.grant.controls = ["mfa", "compliantDevice"];
  let h = orHint(); assert.equal(h.length, 1); assert.equal(h[0].level, "info"); assert.match(h[0].text, /Microsoft's template/);
  d.grant.controls = ["mfa", "compliantApplication"];
  h = orHint(); assert.equal(h[0].level, "warn"); assert.match(h[0].text, /without a second factor/);
  d.grant.controls = ["mfa"]; d.grant.termsOfUse = ["tou-1"];
  h = orHint(); assert.equal(h[0].level, "warn"); assert.match(h[0].text, /terms of use/); assert.match(h[0].text, /High/);
  d.grant.termsOfUse = []; d.grant.controls = ["compliantDevice", "compliantApplication"];
  h = orHint(); assert.equal(h[0].level, "info"); assert.match(h[0].text, /same tier/);
  d.grant.operator = "AND"; d.grant.controls = ["mfa", "compliantApplication"];
  assert.equal(orHint().length, 0);
  d.grant.operator = "OR"; d.grant.controls = ["mfa"];
  assert.equal(orHint().length, 0, "one control has no OR to judge");
});
