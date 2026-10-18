// ======================================================================
// 🚨 The shared E-Admins policies (CA1100–CA1105), bundled (beta 32706).
//
// Emergency access is expected under EVERY baseline, and until now only a
// CloudFellows backup ZIP shipped these six — so a tenant that chose Joey
// Verlinden's baseline had to find that ZIP before its break-glass accounts
// had any policy at all (Mihai, 18 Oct: "for the joey baseline we also deploy
// the E-admins. Those need to be created when choosing joey. Read those
// configs and add a create button for those instead of import").
//
// READ FROM cloudfellows.dev ON 2026-10-18 (Graph v1.0, the six policies as
// the baseline tenant holds them, staging prefix "(UP)" dropped from the
// names). Only what a create needs is kept: no ids of the policies
// themselves, no timestamps, no OData annotations. The group and strength
// ids are cloudfellows.dev's and are NEVER written into a tenant — the
// import turns them into names (Importer.prepareBundle) and attaches this
// tenant's own groups and strength, created when missing.
//
// The shape is a raw backup bundle (Importer.parseEntries), so the very same
// Importer.mergeShared() that took them from a ZIP takes them from here:
// the break-glass group becomes the target baseline's, and they land OFF.
// When the catalog's E-Admins entries in js/baselineData.js move to a new
// version, re-read the six from cloudfellows.dev and replace this file —
// tools/eadmins.test.cjs fails when the two disagree on a name.
// ======================================================================
const E_ADMINS = (() => {
  const G_EA1 = "23eac277-a6f3-452b-a5cf-b84895f3804b";   // Emergency_Access1
  const G_EA2 = "4a3fdae4-4cd5-496b-82a9-3cf3149d1f7e";   // Emergency_Access2
  const G_BG = "5d93cea0-9806-4136-b0b2-c25a46fe3dd5";    // CAB-SEC-U-BreakGlass
  const S_PR = "6cca7670-6b46-4d63-91df-8faf0c8253a6";    // Phishing-resistant MFA + TAP (custom)
  const users = (o) => ({ includeUsers: [], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [], ...o });
  const apps = { includeApplications: ["All"], excludeApplications: [], includeUserActions: [], includeAuthenticationContextClassReferences: [] };
  const cond = (u, extra) => ({ userRiskLevels: [], signInRiskLevels: [], clientAppTypes: ["all"], servicePrincipalRiskLevels: [], applications: apps, users: users(u), ...(extra || {}) });
  const strength = { operator: "OR", builtInControls: [], customAuthenticationFactors: [], termsOfUse: [], authenticationStrength: { id: S_PR } };
  const block = { operator: "OR", builtInControls: ["block"], customAuthenticationFactors: [], termsOfUse: [] };
  const policies = [
    { displayName: "CA1100-GRANT-E-Admins-IP-AllApps-AnyPlatform-Emergency_access1-v3.0", state: "disabled",
      conditions: cond({ includeUsers: ["None"], includeGroups: [G_EA1] }), grantControls: strength, sessionControls: null },
    { displayName: "CA1101-GRANT-E-Admins-IP-AllApps-AnyPlatform-Emergency_access2-v3.0", state: "disabled",
      conditions: cond({ includeUsers: ["None"], includeGroups: [G_EA2] }), grantControls: strength, sessionControls: null },
    { displayName: "CA1102-BLOCK-E-Admins-ASR-AllApps-AnyPlatform-Nontrustedlocations-v3.0", state: "disabled",
      conditions: cond({ includeGroups: [G_BG] }, { locations: { includeLocations: ["All"], excludeLocations: ["AllTrusted"] } }), grantControls: block, sessionControls: null },
    { displayName: "CA1103-BLOCK-E-Admins-BP-AnyApp-NonWindowsPlatform-v3.0", state: "disabled",
      conditions: cond({ includeGroups: [G_BG] }, { platforms: { includePlatforms: ["all"], excludePlatforms: ["windows"] } }), grantControls: block, sessionControls: null },
    { displayName: "CA1104-BLOCK-E-Admins-ASR-AnyApp-NonBrowserClients-v3.0", state: "disabled",
      conditions: { ...cond({ includeGroups: [G_BG] }), clientAppTypes: ["exchangeActiveSync", "mobileAppsAndDesktopClients", "other"] }, grantControls: block, sessionControls: null },
    { displayName: "CA1105-SESSION-E-Admins-ASR-AllApps-SIF3h-NeverPersistent-v3.0", state: "disabled",
      conditions: cond({ includeGroups: [G_BG] }), grantControls: null,
      sessionControls: { signInFrequency: { value: 3, type: "hours", authenticationType: "primaryAndSecondaryAuthentication", frequencyInterval: "timeBased", isEnabled: true }, persistentBrowser: { mode: "never", isEnabled: true } } },
  ];
  const group = (id, displayName, mailNickname) => ({ id, displayName, mailNickname, description: "Conditional Access target group. Created by ENCA — Conditional Access Baseline Tools.", securityEnabled: true, mailEnabled: false, groupTypes: [] });
  const groups = [group(G_EA1, "Emergency_Access1", "EmergencyAccess1"), group(G_EA2, "Emergency_Access2", "EmergencyAccess2"), group(G_BG, "CAB-SEC-U-BreakGlass", "CABSECUBreakGlass")];
  const authStrengths = [{ id: S_PR, displayName: "Phishing-resistant MFA + TAP", description: "", policyType: "custom", requirementsSatisfied: "mfa",
    allowedCombinations: ["windowsHelloForBusiness", "fido2", "temporaryAccessPassOneTime", "temporaryAccessPassMultiUse"] }];
  const source = { tenant: "cloudfellows.dev", read: "2026-10-18", label: "ENCA's own copy of the E-Admins (read from cloudfellows.dev 2026-10-18)" };
  // A fresh copy every time: the importer mutates what it is given.
  const bundle = () => JSON.parse(JSON.stringify({ policies, groups, namedLocations: [], authStrengths, authContexts: [], termsOfUse: [] }));
  const names = () => policies.map((p) => p.displayName);
  return { bundle, names, source, count: policies.length };
})();
