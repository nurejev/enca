// Sample policies (raw Graph shape) for demo mode (?demo=1) and local testing.
const DEMO_DATA = {
  tenantName: "Contoso B.V. (demo)",
  policies: [
    {
      id: "d1", displayName: "Require MFA for all admins", state: "enabled", modifiedDateTime: "2026-06-28T09:00:00Z",
      conditions: {
        users: { includeRoles: ["62e90394-69f5-4237-9190-012177145e10"], excludeUsers: ["u-break1"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["browser", "mobileAppsAndDesktopClients"],
      },
      grantControls: { operator: "OR", builtInControls: [], authenticationStrength: { id: "s1", displayName: "Phishing-resistant MFA" } },
      sessionControls: { signInFrequency: { isEnabled: true, frequencyInterval: "timeBased", value: 12, type: "hours" } },
    },
    {
      id: "d2", displayName: "Block legacy authentication", state: "enabled", modifiedDateTime: "2026-05-11T09:00:00Z",
      conditions: {
        users: { includeUsers: ["All"], excludeUsers: ["u-svc"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["exchangeActiveSync", "other"],
      },
      grantControls: { operator: "OR", builtInControls: ["block"] },
    },
    {
      id: "d3", displayName: "Require compliant device for Office 365", state: "enabled", modifiedDateTime: "2026-06-02T09:00:00Z",
      conditions: {
        users: { includeUsers: ["All"], excludeGuestsOrExternalUsers: { guestOrExternalUserTypes: "b2bCollaborationGuest" } },
        applications: { includeApplications: ["Office365"] },
        platforms: { includePlatforms: ["windows", "macOS"] },
        clientAppTypes: ["browser", "mobileAppsAndDesktopClients"],
        devices: { deviceFilter: { mode: "exclude", rule: 'device.isCompliant -eq True' } },
      },
      grantControls: { operator: "OR", builtInControls: ["compliantDevice", "domainJoinedDevice"] },
    },
    {
      id: "d4", displayName: "Block device code flow & auth transfer", state: "enabled", modifiedDateTime: "2026-07-01T09:00:00Z",
      conditions: {
        users: { includeUsers: ["All"], excludeUsers: ["u-break1"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"],
        authenticationFlows: { transferMethods: "deviceCodeFlow,authenticationTransfer" },
      },
      grantControls: { operator: "OR", builtInControls: ["block"] },
    },
    {
      id: "d5", displayName: "Block elevated insider risk", state: "enabledForReportingButNotEnforced", modifiedDateTime: "2026-07-10T09:00:00Z",
      conditions: {
        users: { includeUsers: ["All"], excludeUsers: ["u-break1", "u-break2"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"],
        insiderRiskLevels: "elevated",
      },
      grantControls: { operator: "OR", builtInControls: ["block"] },
    },
    {
      id: "d11", displayName: "Require MFA for all users — staged", state: "enabledForReportingButNotEnforced", modifiedDateTime: "2026-07-15T09:00:00Z",
      conditions: {
        users: { includeUsers: ["All"], excludeUsers: ["u-break1", "u-break2"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"],
      },
      grantControls: { operator: "OR", builtInControls: ["mfa"] },
    },
    {
      id: "d6", displayName: "Unmanaged devices — limited web session", state: "disabled", modifiedDateTime: "2026-03-19T09:00:00Z",
      conditions: {
        users: { includeUsers: ["All"], excludeGroups: ["g-hr"] },
        applications: { includeApplications: ["00000003-0000-0ff1-ce00-000000000000"] },
        clientAppTypes: ["browser"],
        signInRiskLevels: ["medium", "high"],
        devices: { deviceFilter: { mode: "include", rule: 'device.trustType -ne "AzureAD"' } },
      },
      grantControls: { operator: "OR", builtInControls: ["mfa"] },
      sessionControls: {
        applicationEnforcedRestrictions: { isEnabled: true },
        persistentBrowser: { isEnabled: true, mode: "never" },
        signInFrequency: { isEnabled: true, frequencyInterval: "everyTime" },
        secureSignInSession: { isEnabled: true },
        cloudAppSecurity: { isEnabled: true, cloudAppSecurityType: "monitorOnly" },
      },
    },
    {
      id: "d10", displayName: "CA310-SESSION-Guests-DP-AllApps-AnyPlatform-BlockDownloadUnmanaged-v1.0",
      state: "enabled", modifiedDateTime: "2026-08-20T09:00:00Z",
      conditions: {
        users: { includeGroups: ["g-CAB-SEC-U-Persona-Guests"], excludeGroups: ["g-CAB-SEC-U-BreakGlass", "g-CAB-SEC-U-CA310-Exclusion"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["browser"],
        devices: { deviceFilter: { mode: "exclude", rule: "device.isCompliant -eq True" } },
      },
      // Routes guest browser sessions to Defender for Cloud Apps, where a
      // session policy blocks downloads — the 🛂 Session controls demo.
      sessionControls: { cloudAppSecurity: { isEnabled: true, cloudAppSecurityType: "mcasConfigured" } },
    },
    // Three baseline-numbered policies, so the demo can show what a tenant
    // deployed from the catalog looks like — and, between them, all three
    // states of the convention-exclusion check: one correct, one that has
    // lost the reference, and one whose group was never created.
    {
      id: "d7", displayName: "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0",
      state: "enabledForReportingButNotEnforced", modifiedDateTime: "2026-08-11T09:00:00Z",
      conditions: {
        users: { includeGroups: ["g-CAB-SEC-U-Persona-Internals"],
                 excludeGroups: ["g-CAB-SEC-U-CA200-Exclusion", "g-CAB-SEC-U-BreakGlass"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"],
      },
      grantControls: { operator: "OR", builtInControls: ["mfa"] },
    },
    {
      id: "d8", displayName: "CA201-GRANT-Internals-IP-AnyApp-AnyPlatform-MediumUserRisk-v3.0",
      state: "enabledForReportingButNotEnforced", modifiedDateTime: "2026-08-11T09:00:00Z",
      conditions: {
        // The exclusion group exists in the directory; the policy has lost the
        // reference to it. This is the drift the restore action repairs.
        users: { includeGroups: ["g-CAB-SEC-U-Persona-Internals"], excludeGroups: ["g-CAB-SEC-U-BreakGlass"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"],
        userRiskLevels: ["medium"],
      },
      grantControls: { operator: "OR", builtInControls: ["passwordChange"] },
    },
    {
      id: "d9", displayName: "CA204-BLOCK-Internals-ASR-AllApps-AnyPlatform-BlockUnknownPlatforms-v1.0",
      state: "disabled", modifiedDateTime: "2026-08-11T09:00:00Z",
      conditions: {
        // Its exclusion group was never created, so restoring the reference
        // has to create the group first.
        users: { includeGroups: ["g-CAB-SEC-U-Persona-Internals"], excludeGroups: ["g-CAB-SEC-U-BreakGlass"] },
        applications: { includeApplications: ["All"] },
        clientAppTypes: ["all"],
        platforms: { includePlatforms: ["all"], excludePlatforms: ["windows", "macOS", "iOS", "android", "linux"] },
      },
      grantControls: { operator: "OR", builtInControls: ["block"] },
    },
    {
      // 🕵 / 🌊 0.7: the retired "Require approved client app" control —
      // read-only since 30 June 2026; Eva satisfies it through Teams on an
      // unmanaged iPhone, Milan through a compliant laptop.
      id: "d12", displayName: "CA212-GRANT-Internals-DAP-AllApps-iOSorAndroid-ApprovedApp-v1.0",
      state: "enabled", modifiedDateTime: "2026-05-27T09:00:00Z",
      conditions: {
        users: { includeGroups: ["g-CAB-SEC-U-Persona-Internals"], excludeGroups: ["g-CAB-SEC-U-BreakGlass", "g-CAB-SEC-U-CA212-Exclusion"] },
        applications: { includeApplications: ["All"] },
        platforms: { includePlatforms: ["iOS", "android"] },
        clientAppTypes: ["mobileAppsAndDesktopClients", "exchangeActiveSync", "other"],
      },
      grantControls: { operator: "OR", builtInControls: ["compliantDevice", "approvedApplication"] },
    },
  ],
  names: {
    "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
    "u-break1": "breakglass-01", "u-break2": "breakglass-02", "u-svc": "svc-legacyapp", "g-hr": "HR-Department",
    "00000003-0000-0ff1-ce00-000000000000": "Office 365 SharePoint Online",
  },

  // ---- impact-analysis demo data (users + memberships) ----
  analyzeUsers: [
    { id: "u-admin", displayName: "Alex Admin", userPrincipalName: "alex.admin@contoso.com", userType: "Member", accountEnabled: true, assignedLicenses: [{ skuId: "sku-p2", disabledPlans: [] }], assignedPlans: [] },
    { id: "u-break1", displayName: "breakglass-01", userPrincipalName: "breakglass-01@contoso.com", userType: "Member", accountEnabled: true, assignedLicenses: [{ skuId: "sku-p1", disabledPlans: [] }], assignedPlans: [] },
    { id: "u-break2", displayName: "breakglass-02", userPrincipalName: "breakglass-02@contoso.com", userType: "Member", accountEnabled: true, assignedLicenses: [{ skuId: "sku-p1", disabledPlans: [] }], assignedPlans: [] },
    { id: "u-svc", displayName: "svc-legacyapp", userPrincipalName: "svc-legacyapp@contoso.com", userType: "Member", accountEnabled: true, assignedLicenses: [], assignedPlans: [] },
    { id: "u-emp1", displayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userType: "Member", accountEnabled: true, department: "Finance", assignedLicenses: [{ skuId: "sku-p1", disabledPlans: [] }], assignedPlans: [] },
    { id: "u-emp2", displayName: "Milan Medewerker", userPrincipalName: "milan@contoso.com", userType: "Member", accountEnabled: true, department: "HR", assignedLicenses: [], assignedPlans: [{ servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", capabilityStatus: "Enabled" }] },
    { id: "u-guest1", displayName: "Gary Guest", userPrincipalName: "gary_ext#EXT#@contoso.com", userType: "Guest", accountEnabled: true },
    { id: "u-old", displayName: "Olga Offboarded", userPrincipalName: "olga@contoso.com", userType: "Member", accountEnabled: false, assignedLicenses: [], assignedPlans: [] },
  ],
  // Subscribed SKUs for 🔍 Gap analyse's coverage flow and 🎫 Licence gap. The
  // per-user assignedLicenses / assignedPlans sit on analyzeUsers above,
  // exactly where Graph puts them, so LicGap.licenceOf runs on the demo
  // unchanged — including the cases worth seeing on screen: a user licensed
  // only through a SUSPENDED subscription (in grace, so not licensed), users
  // with no licences at all, and a guest carrying neither field so the funnel
  // has an unknown to report rather than quietly counting them as covered.
  skus: [
    { skuId: "sku-p2", skuPartNumber: "AAD_PREMIUM_P2", capabilityStatus: "Enabled",
      prepaidUnits: { enabled: 3 }, consumedUnits: 2,
      servicePlans: [{ servicePlanId: "eec0eb4f-6444-4f95-aba0-50c24d67f998", servicePlanName: "AAD_PREMIUM_P2" },
                     { servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", servicePlanName: "AAD_PREMIUM" }] },
    { skuId: "sku-p1", skuPartNumber: "EMS", capabilityStatus: "Enabled",
      prepaidUnits: { enabled: 4 }, consumedUnits: 3,
      servicePlans: [{ servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", servicePlanName: "AAD_PREMIUM" }] },
    { skuId: "sku-dead", skuPartNumber: "EMS_TRIAL", capabilityStatus: "Suspended",
      prepaidUnits: { enabled: 25 }, consumedUnits: 1,
      servicePlans: [{ servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", servicePlanName: "AAD_PREMIUM" }] },
  ],
  roleMembers: { "62e90394-69f5-4237-9190-012177145e10": ["u-admin"] },
  groupMembers: {},
  // settings shown in the dependency viewer (demo mode)
  depSettings: {
    "authStrength:s1": {
      id: "s1", displayName: "Phishing-resistant MFA", policyType: "builtIn",
      description: "Include authentication methods that are phishing-resistant",
      allowedCombinations: ["windowsHelloForBusiness", "fido2", "x509CertificateMultiFactor"],
    },
    "authStrength:s2": {
      id: "s2", displayName: "Company keys only", policyType: "custom",
      description: "Passkeys restricted to Microsoft Authenticator — company-issued only.",
      allowedCombinations: ["fido2", "x509CertificateMultiFactor"],
      combinationConfigurations: [
        { "@odata.type": "#microsoft.graph.fido2CombinationConfiguration", id: "cc-1",
          appliesToCombinations: ["fido2"],
          allowedAAGUIDs: ["de1e552d-db1d-4423-a619-566b625cdc84", "90a3ccdf-635c-4729-a248-9b709135078f"] },
        { "@odata.type": "#microsoft.graph.x509CertificateCombinationConfiguration", id: "cc-2",
          appliesToCombinations: ["x509CertificateMultiFactor"],
          allowedIssuerSkis: ["9A4248C6AC8C2931AB2A86537818E92E7B6C97B6"], allowedPolicyOIDs: ["1.2.3.4.6"] },
      ],
    },
    "group:g-hr": {
      id: "g-hr", displayName: "HR-Department", description: "All HR staff",
      securityEnabled: true, isAssignableToRole: false,
      _members: { count: 12, items: [
        { displayName: "Alex Admin", userPrincipalName: "alex.admin@contoso.com" },
        { displayName: "Eva Employee", userPrincipalName: "eva@contoso.com" },
        { displayName: "Milan Medewerker", userPrincipalName: "milan@contoso.com" },
        { displayName: "breakglass-01", userPrincipalName: "breakglass-01@contoso.com" },
        { displayName: "Gary Guest", userPrincipalName: "gary_ext#EXT#@contoso.com" },
      ] },
    },
  },
  // Cross-tenant access partners flagged isServiceProvider — the MS Learn
  // service provider checks read this to name the partner and to decide
  // whether they apply at all. Inbound trust is deliberately off, which is
  // the common real configuration and what makes the device check bite.
  // 25469: the default inbound cross-tenant settings — MFA trusted, device
  // claims not, B2B direct connect blocked (Microsoft's default for it).
  crossTenantDefault: { inboundTrust: { isMfaAccepted: true, isCompliantDeviceAccepted: false, isHybridAzureADJoinedDeviceAccepted: false }, dcInbound: "blocked" },
  // 🔑 Passkeys (32317): the Passkey (FIDO2) method as v1.0 returns it —
  // opted in to profiles, targeting only a pilot group, break-glass excluded,
  // and a pilot profile restricted to Authenticator WITHOUT attestation. Demo
  // policy d1 requires Phishing-resistant MFA of Global Administrators, whose
  // one active holder is not in the pilot — the blocking finding the tab is for.
  // 🤖 Workload identities (32406, R46): one demo-only workload identity
  // policy (kept here, NOT in the policy list — adding it there would change
  // every other tool's demo), the service principals and their sign-ins in
  // the Graph servicePrincipal / managedIdentity record shape.
  workload: {
    tenantId: "demo-tenant",
    policy: { id: "demo-wid-900", displayName: "CA900-WorkloadIDs-BlockOutsideTrusted-v1.0", state: "enabled",
      conditions: { clientApplications: { includeServicePrincipals: ["sp-payroll", "sp-backup", "sp-mi-func"] }, applications: { includeApplications: ["All"] }, locations: { includeLocations: ["All"], excludeLocations: ["AllTrusted"] } },
      grantControls: { operator: "OR", builtInControls: ["block"] } },
    policyRo: { id: "demo-wid-901", displayName: "CA901-WorkloadIDs-BlockHighRisk-v1.0", state: "enabledForReportingButNotEnforced",
      conditions: { clientApplications: { includeServicePrincipals: ["ServicePrincipalsInMyTenant"] }, applications: { includeApplications: ["All"] }, servicePrincipalRiskLevels: ["high"] },
      grantControls: { operator: "OR", builtInControls: ["block"] } },
    servicePrincipals: {
      "sp-payroll": { id: "sp-payroll", appId: "a0000000-0000-0000-0000-000000000001", displayName: "svc-payroll-export", servicePrincipalType: "Application", appOwnerOrganizationId: "demo-tenant", signInAudience: "AzureADMyOrg" },
      "sp-backup": { id: "sp-backup", appId: "a0000000-0000-0000-0000-000000000002", displayName: "svc-backup-graph", servicePrincipalType: "Application", appOwnerOrganizationId: "demo-tenant", signInAudience: "AzureADMyOrg" },
      "sp-hrsync": { id: "sp-hrsync", appId: "a0000000-0000-0000-0000-000000000003", displayName: "app-hr-sync", servicePrincipalType: "Application", appOwnerOrganizationId: "demo-tenant", signInAudience: "AzureADMyOrg" },
      "sp-mi-func": { id: "sp-mi-func", appId: "a0000000-0000-0000-0000-000000000004", displayName: "mi-func-invoices", servicePrincipalType: "ManagedIdentity", appOwnerOrganizationId: null },
      "sp-ticket": { id: "sp-ticket", appId: "a0000000-0000-0000-0000-000000000005", displayName: "Contoso Ticketing", servicePrincipalType: "Application", appOwnerOrganizationId: "e5d0c1b2-0000-4000-8000-00000000abcd" },
    },
    signIns: [
      { createdDateTime: "2026-07-21T06:00:00Z", servicePrincipalId: "sp-payroll", servicePrincipalName: "svc-payroll-export", appId: "a0000000-0000-0000-0000-000000000001", ipAddress: "203.0.113.40", location: { countryOrRegion: "NL" }, status: { errorCode: 0 }, conditionalAccessStatus: "notApplied", signInEventTypes: ["servicePrincipal"], resourceDisplayName: "Microsoft Graph",
        appliedConditionalAccessPolicies: [{ id: "demo-wid-900", result: "notApplied" }, { id: "demo-wid-901", result: "reportOnlyNotApplied" }] },
      { createdDateTime: "2026-07-21T07:00:00Z", servicePrincipalId: "sp-payroll", servicePrincipalName: "svc-payroll-export", appId: "a0000000-0000-0000-0000-000000000001", ipAddress: "203.0.113.40", location: { countryOrRegion: "NL" }, status: { errorCode: 0 }, conditionalAccessStatus: "notApplied", signInEventTypes: ["servicePrincipal"], resourceDisplayName: "Microsoft Graph",
        appliedConditionalAccessPolicies: [{ id: "demo-wid-900", result: "notApplied" }, { id: "demo-wid-901", result: "reportOnlyNotApplied" }] },
      { createdDateTime: "2026-07-21T08:10:00Z", servicePrincipalId: "sp-backup", servicePrincipalName: "svc-backup-graph", appId: "a0000000-0000-0000-0000-000000000002", ipAddress: "192.0.2.80", location: { countryOrRegion: "US" }, status: { errorCode: 53003 }, conditionalAccessStatus: "failure", signInEventTypes: ["servicePrincipal"], resourceDisplayName: "Microsoft Graph",
        appliedConditionalAccessPolicies: [{ id: "demo-wid-900", result: "failure" }, { id: "demo-wid-901", result: "reportOnlyNotApplied" }] },
      { createdDateTime: "2026-07-21T09:00:00Z", servicePrincipalId: "sp-hrsync", servicePrincipalName: "app-hr-sync", appId: "a0000000-0000-0000-0000-000000000003", ipAddress: "192.0.2.81", location: { countryOrRegion: "US" }, status: { errorCode: 0 }, conditionalAccessStatus: "notApplied", signInEventTypes: ["servicePrincipal"], resourceDisplayName: "Office 365 Exchange Online",
        appliedConditionalAccessPolicies: [{ id: "demo-wid-901", result: "reportOnlyNotApplied" }] },
      { createdDateTime: "2026-07-21T09:05:00Z", servicePrincipalId: "sp-mi-func", servicePrincipalName: "mi-func-invoices", appId: "a0000000-0000-0000-0000-000000000004", ipAddress: "192.0.2.90", location: { countryOrRegion: "IE" }, status: { errorCode: 0 }, conditionalAccessStatus: "notApplied", signInEventTypes: ["managedIdentity"], resourceDisplayName: "Azure Key Vault", appliedConditionalAccessPolicies: [] },
      { createdDateTime: "2026-07-21T10:00:00Z", servicePrincipalId: "sp-ticket", servicePrincipalName: "Contoso Ticketing", appId: "a0000000-0000-0000-0000-000000000005", ipAddress: "192.0.2.99", location: { countryOrRegion: "US" }, status: { errorCode: 0 }, conditionalAccessStatus: "notApplied", signInEventTypes: ["servicePrincipal"], resourceDisplayName: "Microsoft Graph", appliedConditionalAccessPolicies: [] },
    ],
  },
  passkeys: {
    fido2: { "@odata.type": "#microsoft.graph.fido2AuthenticationMethodConfiguration", id: "Fido2", state: "enabled", isSelfServiceRegistrationAllowed: true,
      includeTargets: [{ targetType: "group", id: "g-passkey-pilot", isRegistrationRequired: false, allowedPasskeyProfiles: ["00000000-0000-0000-0000-000000000001", "p-pilot-auth"] }],
      excludeTargets: [{ targetType: "group", id: "g-breakglass" }],
      passkeyProfiles: [
        { id: "00000000-0000-0000-0000-000000000001", name: "Default passkey profile", passkeyTypes: "deviceBound,synced", attestationEnforcement: "disabled",
          keyRestrictions: { isEnforced: false, enforcementType: "block", aaGuids: [] } },
        { id: "p-pilot-auth", name: "Pilot — Authenticator only", passkeyTypes: "deviceBound", attestationEnforcement: "disabled",
          keyRestrictions: { isEnforced: true, enforcementType: "allow", aaGuids: ["90a3ccdf-635c-4729-a248-9b709135078f", "de1e552d-db1d-4423-a619-566b625cdc84"] } },
      ] },
    members: { groups: { "g-passkey-pilot": { ids: ["u-eva", "u-milan"], complete: true }, "g-breakglass": { ids: ["u-break1", "u-break2"], complete: true },
      "g-it-admins": { ids: ["u-admin"], complete: true } },
      roles: { "62e90394-69f5-4237-9190-012177145e10": { ids: ["u-admin"], complete: true } } },
    names: { "g-passkey-pilot": "CAB-SEC-U-Passkey-Pilot", "g-breakglass": "CAB-SEC-U-BreakGlass", "g-it-admins": "CAB-SEC-U-Persona-Admins",
      "u-admin": "Alex Admin", "u-eva": "Eva Employee", "u-milan": "Milan Medewerker", "u-break1": "Break Glass 1", "u-break2": "Break Glass 2" },
  },
  // 🤝 Cross-tenant access (32316): what /policies/crossTenantAccessPolicy
  // returns, plus the per-partner sync, exists and name reads — example
  // tenants. Northwind is the service provider above; one tenant is gone.
  xtenant: {
    default: { inboundTrust: { isMfaAccepted: true, isCompliantDeviceAccepted: false, isHybridAzureADJoinedDeviceAccepted: false },
      b2bCollaborationInbound: { usersAndGroups: { accessType: "allowed", targets: [{ target: "AllUsers", targetType: "user" }] }, applications: { accessType: "allowed", targets: [{ target: "AllApplications", targetType: "application" }] } },
      b2bDirectConnectInbound: { usersAndGroups: { accessType: "blocked", targets: [{ target: "AllUsers", targetType: "user" }] }, applications: { accessType: "blocked", targets: [{ target: "AllApplications", targetType: "application" }] } } },
    partners: [
      { tenantId: "a3c1e7d2-5b8f-4e21-9c44-0d6b2f8e1a37", isServiceProvider: false, isInMultiTenantOrganization: false,
        inboundTrust: { isMfaAccepted: true, isCompliantDeviceAccepted: true, isHybridAzureADJoinedDeviceAccepted: false } },
      { tenantId: "b8e24f10-3c6a-4d9e-a217-6f5c0b9d3e82", isServiceProvider: false, isInMultiTenantOrganization: true,
        automaticUserConsentSettings: { inboundAllowed: true, outboundAllowed: true },
        b2bCollaborationInbound: { usersAndGroups: { accessType: "allowed", targets: [{ target: "grp-fab-1", targetType: "group" }, { target: "grp-fab-2", targetType: "group" }] }, applications: { accessType: "allowed", targets: [{ target: "AllApplications", targetType: "application" }] } } },
      { tenantId: "c4f9a1b0-6e2d-4c7a-8b13-5a0e9d7f2c64", isServiceProvider: false, isInMultiTenantOrganization: false },
      { tenantId: "7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009", isServiceProvider: true, isInMultiTenantOrganization: false,
        inboundTrust: { isMfaAccepted: false, isCompliantDeviceAccepted: false, isHybridAzureADJoinedDeviceAccepted: false } },
    ],
    sync: { "a3c1e7d2-5b8f-4e21-9c44-0d6b2f8e1a37": null, "b8e24f10-3c6a-4d9e-a217-6f5c0b9d3e82": { displayName: "Fabrikam Holding", userSyncInbound: { isSyncAllowed: true } },
      "c4f9a1b0-6e2d-4c7a-8b13-5a0e9d7f2c64": null, "7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009": null },
    exists: { "a3c1e7d2-5b8f-4e21-9c44-0d6b2f8e1a37": true, "b8e24f10-3c6a-4d9e-a217-6f5c0b9d3e82": true, "c4f9a1b0-6e2d-4c7a-8b13-5a0e9d7f2c64": false, "7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009": true },
    info: { "a3c1e7d2-5b8f-4e21-9c44-0d6b2f8e1a37": { displayName: "Contoso Partner BV", defaultDomainName: "contoso-partner.example" },
      "b8e24f10-3c6a-4d9e-a217-6f5c0b9d3e82": { displayName: "Fabrikam Holding", defaultDomainName: "fabrikam.example" },
      "7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009": { displayName: "Northwind Managed Services", defaultDomainName: "northwind-ms.example" } },
  },
  serviceProviders: [
    { tenantId: "7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009", name: "Northwind Managed Services",
      inboundTrust: { isMfaAccepted: false, isCompliantDeviceAccepted: false, isHybridAzureADJoinedDeviceAccepted: false } },
  ],
  scopeGroups: {
    "CAB-SEC-U-BreakGlass": ["u-break1", "u-break2"],
    // CA200's exclusion group exists and is referenced; CA201's exists but the
    // policy has lost the reference. CA204's is deliberately absent.
    // 25343: Eva sits in THREE exclusion groups so the 🌊 Flags cell has
    // something to wrap — one on a report-only policy (not On) and two on
    // enforced ones (a live bypass each), which is exactly the mix the chip
    // colours and the count line exist to tell apart. Milan has one.
    "CAB-SEC-U-CA200-Exclusion": ["u-emp1"],
    "CAB-SEC-U-CA201-Exclusion": ["u-old"],
    "CAB-SEC-U-CA212-Exclusion": ["u-emp1", "u-emp2"],
    "CAB-SEC-U-CA310-Exclusion": ["u-emp1"],
    "CAB-SEC-U-Persona-Admins": ["u-admin"],
    "CAB-SEC-U-Persona-Internals": ["u-emp1", "u-emp2", "u-old"],
    "CAB-SEC-U-Persona-Guests": ["u-guest1"],
    "HR-Department": ["u-emp1", "u-emp2"],
    // Deploy (wave) groups for 🕵 Who is Anna to CA: Eva and Milan are in
    // the Internals wave, Alex in the Admins wave, everyone human in Global.
    "CAD-SEC-U-DG-GLO": ["u-admin", "u-emp1", "u-emp2", "u-guest1"],
    "CAD-SEC-U-DG-INT": ["u-emp1", "u-emp2"],
    "CAD-SEC-U-DG-ADM": ["u-admin"],
  },

  // Named locations for the best-practice location checks.
  adminUnits: [
    { id: "au-1", displayName: "RMAU — CA exclusion groups", description: "Restricted management administrative unit protecting Conditional Access exclusion groups.", isMemberManagementRestricted: true, visibility: null },
    { id: "au-2", displayName: "Helpdesk NL", description: "Standard administrative unit for the Dutch helpdesk scope.", isMemberManagementRestricted: false, visibility: null },
  ],
  adminUnitDetails: {
    "au-1": {
      members: [
        { id: "g-hr", displayName: "HR-Department", "@odata.type": "#microsoft.graph.group" },
        { id: "u-break1", displayName: "breakglass-01", userPrincipalName: "breakglass-01@contoso.com", "@odata.type": "#microsoft.graph.user" },
      ],
      scoped: [
        { id: "srm-1", roleId: "role-ga", _roleName: "Groups Administrator", _principal: "Alex Admin", roleMemberInfo: { id: "u-admin", displayName: "Alex Admin" } },
      ],
    },
    "au-2": { members: [], scoped: [] },
  },
  // Baseline scopes setting as the portal API returns it when nothing was ever
  // selected — Microsoft's default, which since June 2026 means enforced.
  // Authentication methods policy, trimmed to what the checks read: state per
  // method. Passkeys on, no external authentication method.
  authMethodsPolicy: { authenticationMethodConfigurations: [
    { "@odata.type": "#microsoft.graph.fido2AuthenticationMethodConfiguration", id: "Fido2", state: "enabled" },
    { "@odata.type": "#microsoft.graph.microsoftAuthenticatorAuthenticationMethodConfiguration", id: "MicrosoftAuthenticator", state: "enabled" },
    { "@odata.type": "#microsoft.graph.smsAuthenticationMethodConfiguration", id: "Sms", state: "disabled" },
  ] },
  // 30-day app summary (signInEventsAppSummary) and the app ids that have a
  // service principal here — two of the summary rows do not: a Microsoft
  // first-party client nobody registered, and an unknown multi-tenant app.
  signInAppSummary: [
    { appId: "00000002-0000-0ff1-ce00-000000000000", signInCount: 4120 },
    { appId: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe", signInCount: 2210 },
    { appId: "29d9ed98-a469-4536-ade2-f981bc1d605e", signInCount: 37 },
    { appId: "7f3a1c2e-5b8d-4e6f-9a0b-1c2d3e4f5a6b", signInCount: 12 },
    { appId: "00000000-0000-0000-0000-000000000000", signInCount: 3 },
  ],
  servicePrincipalAppIds: ["00000002-0000-0ff1-ce00-000000000000", "00000003-0000-0ff1-ce00-000000000000", "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe", "797f4846-ba00-4fd7-ba43-dac1f8f63013"],
  // 🏅 Identity Secure Score (32308): the score history and recommendations
  // /directory/recommendations would return — example values, marked as demo.
  idScores: [{"tenantScore": 34, "tenantMaxScore": 71, "createDateTime": "2026-09-23T00:00:00Z"}, {"tenantScore": 34, "tenantMaxScore": 71, "createDateTime": "2026-09-22T00:00:00Z"}, {"tenantScore": 34, "tenantMaxScore": 71, "createDateTime": "2026-09-21T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-20T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-19T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-18T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-17T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-16T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-15T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-14T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-13T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-12T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-11T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-10T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-09T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-08T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-07T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-06T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-05T00:00:00Z"}, {"tenantScore": 31, "tenantMaxScore": 71, "createDateTime": "2026-09-04T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-09-03T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-09-02T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-09-01T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-31T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-30T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-29T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-28T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-27T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-26T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-25T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-24T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-23T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-22T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-21T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-20T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-19T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-18T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-17T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-16T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-15T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-14T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-13T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-12T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-11T00:00:00Z"}, {"tenantScore": 27, "tenantMaxScore": 71, "createDateTime": "2026-08-10T00:00:00Z"}],
  idRecommendations: [{"id": "00000000-0000-0000-0000-00000000demo_adminMFAV2", "recommendationType": "adminMFAV2", "displayName": "Require multifactor authentication for administrative roles", "category": "identitySecureScore", "status": "active", "priority": "high", "impactType": "users", "insights": "Some users in administrative roles can sign in without multifactor authentication.", "benefits": "Requiring MFA for admin roles makes it much harder for an attacker to use a compromised admin account.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 10, "currentScore": 4}, {"id": "00000000-0000-0000-0000-00000000demo_blockLegacyAuthentication", "recommendationType": "blockLegacyAuthentication", "displayName": "Enable policy to block legacy authentication", "category": "identitySecureScore", "status": "active", "priority": "high", "impactType": "users", "insights": "Legacy authentication sign-ins were seen in the last 30 days, and no enabled policy blocks them.", "benefits": "Legacy protocols cannot do MFA; blocking them closes the most used password-spray path.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 8, "currentScore": 0}, {"id": "00000000-0000-0000-0000-00000000demo_signinRiskPolicy", "recommendationType": "signinRiskPolicy", "displayName": "Protect all users with a sign-in risk policy", "category": "identitySecureScore", "status": "active", "priority": "medium", "impactType": "users", "insights": "No enabled Conditional Access policy responds to sign-in risk for all users.", "benefits": "A sign-in risk policy challenges or blocks sign-ins Microsoft judges likely to be malicious.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 7, "currentScore": 0}, {"id": "00000000-0000-0000-0000-00000000demo_userRiskPolicy", "recommendationType": "userRiskPolicy", "displayName": "Protect all users with a user risk policy", "category": "identitySecureScore", "status": "active", "priority": "medium", "impactType": "users", "insights": "No enabled Conditional Access policy responds to user risk for all users.", "benefits": "A user risk policy forces remediation for accounts that are likely compromised.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 7, "currentScore": 0}, {"id": "00000000-0000-0000-0000-00000000demo_mfaRegistrationV2", "recommendationType": "mfaRegistrationV2", "displayName": "Ensure all users can complete multifactor authentication", "category": "identitySecureScore", "status": "active", "priority": "high", "impactType": "users", "insights": "Some users have not registered a method they can use for MFA.", "benefits": "Users who can complete MFA can be protected by every MFA policy.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 9, "currentScore": 6}, {"id": "00000000-0000-0000-0000-00000000demo_oneAdmin", "recommendationType": "oneAdmin", "displayName": "Designate more than one Global Administrator", "category": "identitySecureScore", "status": "completedBySystem", "priority": "low", "impactType": "tenantLevel", "insights": "More than one Global Administrator is designated.", "benefits": "A second Global Administrator avoids a single point of failure.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 1, "currentScore": 1}, {"id": "00000000-0000-0000-0000-00000000demo_roleOverlap", "recommendationType": "roleOverlap", "displayName": "Use least privileged administrative roles", "category": "identitySecureScore", "status": "active", "priority": "medium", "impactType": "users", "insights": "Some users hold more privileged roles than their activity needs.", "benefits": "Fewer privileged role holders means a smaller attack surface.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 1, "currentScore": 0}, {"id": "00000000-0000-0000-0000-00000000demo_pwagePolicyNew", "recommendationType": "pwagePolicyNew", "displayName": "Do not expire passwords", "category": "identitySecureScore", "status": "riskAccepted", "priority": "low", "impactType": "tenantLevel", "insights": "Password expiry is enabled for the tenant.", "benefits": "Expiry pushes users to predictable passwords.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 8, "currentScore": 0}, {"id": "00000000-0000-0000-0000-00000000demo_selfServicePasswordReset", "recommendationType": "selfServicePasswordReset", "displayName": "Enable self-service password reset", "category": "identitySecureScore", "status": "completedBySystem", "priority": "low", "impactType": "tenantLevel", "insights": "SSPR is enabled.", "benefits": "Users can reset their own password without the helpdesk.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}], "maxScore": 1, "currentScore": 1}, {"id": "00000000-0000-0000-0000-00000000demo_staleApps", "recommendationType": "staleApps", "displayName": "Remove unused applications", "category": "identityBestPractice", "status": "active", "priority": "low", "impactType": "apps", "insights": "4 applications have had no sign-ins for 30 days.", "benefits": "Unused apps are attack surface with nobody watching them.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}]}, {"id": "00000000-0000-0000-0000-00000000demo_applicationCredentialExpiry", "recommendationType": "applicationCredentialExpiry", "displayName": "Renew expiring application credentials", "category": "identityBestPractice", "status": "active", "priority": "medium", "impactType": "apps", "insights": "2 application credentials expire within 30 days.", "benefits": "Renewing before expiry avoids an outage.", "lastCheckedDateTime": "2026-09-23T03:12:00Z", "releaseType": "generallyAvailable", "actionSteps": [{"stepNumber": 1, "text": "Review the recommendation in the Microsoft Entra admin center.", "actionUrl": {"displayName": "Identity Secure Score", "url": "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/IdentitySecureScore.ReactView"}}]}],
  caSettings: { "@odata.context": "https://graph.microsoft.com/beta/$metadata#identity/conditionalAccess/settings/$entity", advancedSettings: null },
  namedLocations: [
    { "@odata.type": "#microsoft.graph.ipNamedLocation", id: "loc-hq", displayName: "HQ egress", isTrusted: true, ipRanges: [{ cidrAddress: "203.0.113.0/24" }] },
    { "@odata.type": "#microsoft.graph.ipNamedLocation", id: "loc-branch", displayName: "Branch office (unmarked)", isTrusted: false, ipRanges: [{ cidrAddress: "198.51.100.0/24" }] },
    { "@odata.type": "#microsoft.graph.countryNamedLocation", id: "loc-empty", displayName: "Blocked countries (empty)", countriesAndRegions: [] },
  ],

  // Sample sign-in records (raw Graph shape) for the Sign-in failures tool.
  // Identity Protection, for 🕵 Who is Anna to CA: Alex is at risk (the
  // medium-risk sign-in from Boston below is his), Eva was remediated.
  riskyUsers: {
    "u-admin": { level: "medium", state: "atRisk", detail: "none", updated: "2026-07-20T19:05:00Z", detWindow: 30, detections: [
      { when: "2026-07-20T19:03:12Z", type: "unfamiliarFeatures", level: "medium", state: "atRisk", detail: "none", activity: "signin", source: "IdentityProtection", ip: "192.0.2.199", city: "Boston", country: "US", info: "" },
      { when: "2026-07-20T19:03:12Z", type: "anonymizedIPAddress", level: "medium", state: "atRisk", detail: "none", activity: "signin", source: "IdentityProtection", ip: "192.0.2.199", city: "Boston", country: "US", info: "" },
    ] },
    "u-emp1": { level: "low", state: "remediated", detail: "userPerformedSecuredPasswordReset", updated: "2026-07-02T08:10:00Z", detWindow: 30, detections: [
      { when: "2026-07-01T22:41:00Z", type: "leakedCredentials", level: "high", state: "remediated", detail: "userPerformedSecuredPasswordReset", activity: "user", source: "IdentityProtection", ip: "", city: "", country: "", info: "" },
    ] },
  },
  signIns: [
    {
      id: "si-1", createdDateTime: "2026-07-21T14:12:03Z",
      userDisplayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userId: "u-emp1",
      appDisplayName: "Office 365 Exchange Online", appId: "00000002-0000-0ff1-ce00-000000000000",
      resourceDisplayName: "Office 365 Exchange Online",
      ipAddress: "203.0.113.24", location: { city: "Amsterdam", countryOrRegion: "NL" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "Windows 11", browser: "Edge 126", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 53000, failureReason: "Device is not in required device state: compliant." },
      conditionalAccessStatus: "failure", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d3", displayName: "Require compliant device for Office 365", result: "failure", enforcedGrantControls: ["RequireCompliantDevice"], enforcedSessionControls: [] },
        { id: "d2", displayName: "Block legacy authentication", result: "notApplied", enforcedGrantControls: [], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-2", createdDateTime: "2026-07-21T09:41:55Z",
      userDisplayName: "svc-legacyapp", userPrincipalName: "svc-legacyapp@contoso.com", userId: "u-svc",
      appDisplayName: "Office 365 Exchange Online", appId: "00000002-0000-0ff1-ce00-000000000000",
      resourceDisplayName: "Office 365 Exchange Online",
      ipAddress: "198.51.100.7", location: { city: "Rotterdam", countryOrRegion: "NL" },
      clientAppUsed: "IMAP4",
      deviceDetail: { operatingSystem: "", browser: "", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 53003, failureReason: "Access has been blocked by Conditional Access policies." },
      conditionalAccessStatus: "failure", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d2", displayName: "Block legacy authentication", result: "failure", enforcedGrantControls: ["Block"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-3", createdDateTime: "2026-07-20T19:03:12Z",
      userDisplayName: "Alex Admin", userPrincipalName: "alex.admin@contoso.com", userId: "u-admin",
      appDisplayName: "Microsoft Azure Management", appId: "797f4846-ba00-4fd7-ba43-dac1f8f63013",
      resourceDisplayName: "Windows Azure Service Management API",
      ipAddress: "192.0.2.199", location: { city: "Boston", countryOrRegion: "US" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "MacOs", browser: "Safari 18", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 50074, failureReason: "Strong Authentication is required." },
      conditionalAccessStatus: "failure", riskLevelDuringSignIn: "medium", riskLevelAggregated: "medium", riskState: "atRisk", riskDetail: "none", riskEventTypes_v2: ["unfamiliarFeatures", "anonymizedIPAddress"],
      // 🚦 2.6 / 🕵 1.4: the portal's Authentication Details tab — a correct
      // password, then the phishing-resistant step that never came. The
      // policy failed him; the METHOD is why.
      authenticationRequirement: "multiFactorAuthentication",
      authenticationRequirementPolicies: [{ requirementProvider: "conditionalAccess", detail: "Require MFA for all admins" }],
      authenticationDetails: [
        { authenticationStepDateTime: "2026-07-20T19:03:10Z", authenticationMethod: "Password", authenticationMethodDetail: "Password in the cloud", succeeded: true, authenticationStepResultDetail: "Correct password", authenticationStepRequirement: "Phishing-resistant MFA" },
        { authenticationStepDateTime: "2026-07-20T19:03:12Z", authenticationMethod: "", authenticationMethodDetail: "", succeeded: false, authenticationStepResultDetail: "MFA required in Azure AD", authenticationStepRequirement: "Phishing-resistant MFA" },
      ],
      appliedConditionalAccessPolicies: [
        { id: "d1", displayName: "Require MFA for all admins", result: "failure", enforcedGrantControls: ["RequireAuthenticationStrength:Phishing-resistant MFA"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-4", createdDateTime: "2026-07-19T08:22:40Z",
      userDisplayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userId: "u-emp1",
      appDisplayName: "Microsoft Teams", appId: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe",
      resourceDisplayName: "Microsoft Teams",
      ipAddress: "203.0.113.24", location: { city: "Amsterdam", countryOrRegion: "NL" },
      clientAppUsed: "Mobile Apps and Desktop clients",
      deviceDetail: { operatingSystem: "Ios 17", browser: "", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 53000, failureReason: "Device is not in required device state: compliant." },
      conditionalAccessStatus: "failure", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d3", displayName: "Require compliant device for Office 365", result: "failure", enforcedGrantControls: ["RequireCompliantDevice"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-5", createdDateTime: "2026-07-18T11:47:29Z",
      userDisplayName: "Gary Guest", userPrincipalName: "gary_gmail.com#EXT#@contoso.com", userId: "u-guest1",
      appDisplayName: "Microsoft Teams", appId: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe",
      resourceDisplayName: "Microsoft Teams",
      ipAddress: "198.51.100.201", location: { city: "Lyon", countryOrRegion: "FR" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "Windows 10", browser: "Chrome 127", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "low",
      appliedConditionalAccessPolicies: [
        { id: "d5", displayName: "Block elevated insider risk", result: "reportOnlyFailure", enforcedGrantControls: ["Block"], enforcedSessionControls: [] },
      ],
    },
    // ---- report-only richness for the Report-only impact tool ----------
    // d7 (Require MFA — staged): Eva satisfies MFA already, Milan would be
    // interrupted, the legacy IMAP service account would be DENIED (cannot
    // do MFA), the guest is out of scope on this app.
    {
      id: "si-6", createdDateTime: "2026-07-21T10:02:11Z",
      userDisplayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userId: "u-emp1",
      appDisplayName: "Microsoft Teams", appId: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe",
      resourceDisplayName: "Microsoft Teams",
      ipAddress: "203.0.113.24", location: { city: "Amsterdam", countryOrRegion: "NL" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "Windows 11", browser: "Edge 126", isCompliant: true, isManaged: true, trustType: "AzureAd" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      // 🕵 0.7 MFA card: a FRESH Authenticator prompt for Eva on Teams
      authenticationRequirement: "multiFactorAuthentication",
      authenticationDetails: [
        { authenticationStepDateTime: "2026-07-21T10:02:05Z", authenticationMethod: "Password", authenticationMethodDetail: "Password in the cloud", succeeded: true, authenticationStepResultDetail: "Correct password", authenticationStepRequirement: "Primary authentication" },
        { authenticationStepDateTime: "2026-07-21T10:02:11Z", authenticationMethod: "Microsoft Authenticator", authenticationMethodDetail: "Microsoft Authenticator (mobile app notification)", succeeded: true, authenticationStepResultDetail: "MFA successfully completed", authenticationStepRequirement: "Multi-factor authentication" },
      ],
      appliedConditionalAccessPolicies: [
        { id: "d7", displayName: "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", result: "success", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlySuccess", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
        { id: "d5", displayName: "Block elevated insider risk", result: "reportOnlyNotApplied", enforcedGrantControls: [], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-7", createdDateTime: "2026-07-21T08:15:44Z",
      userDisplayName: "Milan Medewerker", userPrincipalName: "milan@contoso.com", userId: "u-emp2",
      appDisplayName: "Office 365 SharePoint Online", appId: "00000003-0000-0ff1-ce00-000000000000",
      resourceDisplayName: "Office 365 SharePoint Online",
      ipAddress: "198.51.100.31", location: { city: "Utrecht", countryOrRegion: "NL" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "Windows 10", browser: "Chrome 127", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlyInterrupted", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-8", createdDateTime: "2026-07-20T22:40:09Z",
      userDisplayName: "Milan Medewerker", userPrincipalName: "milan@contoso.com", userId: "u-emp2",
      appDisplayName: "Microsoft Teams", appId: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe",
      resourceDisplayName: "Microsoft Teams",
      ipAddress: "198.51.100.31", location: { city: "Utrecht", countryOrRegion: "NL" },
      clientAppUsed: "Mobile Apps and Desktop clients",
      deviceDetail: { operatingSystem: "Android 15", browser: "", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlyInterrupted", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-9", createdDateTime: "2026-07-21T03:12:58Z",
      userDisplayName: "svc-legacyapp", userPrincipalName: "svc-legacyapp@contoso.com", userId: "u-svc",
      appDisplayName: "Office 365 Exchange Online", appId: "00000002-0000-0ff1-ce00-000000000000",
      resourceDisplayName: "Office 365 Exchange Online",
      ipAddress: "198.51.100.7", location: { city: "Rotterdam", countryOrRegion: "NL" },
      clientAppUsed: "IMAP4",
      deviceDetail: { operatingSystem: "", browser: "", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlyFailure", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-10", createdDateTime: "2026-07-19T16:55:37Z",
      userDisplayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userId: "u-emp1",
      appDisplayName: "Office 365 Exchange Online", appId: "00000002-0000-0ff1-ce00-000000000000",
      resourceDisplayName: "Office 365 Exchange Online",
      ipAddress: "203.0.113.24", location: { city: "Amsterdam", countryOrRegion: "NL" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "Windows 11", browser: "Edge 126", isCompliant: true, isManaged: true, trustType: "AzureAd" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      // 🕵 0.7 MFA card: MFA required but satisfied by the claim in the token
      authenticationRequirement: "multiFactorAuthentication",
      authenticationDetails: [
        { authenticationStepDateTime: "2026-07-19T16:55:37Z", authenticationMethod: "Previously satisfied", authenticationMethodDetail: "", succeeded: true, authenticationStepResultDetail: "MFA requirement satisfied by claim in the token", authenticationStepRequirement: "Multi-factor authentication" },
      ],
      appliedConditionalAccessPolicies: [
        { id: "d7", displayName: "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", result: "success", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlySuccess", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
        { id: "d5", displayName: "Block elevated insider risk", result: "reportOnlyNotApplied", enforcedGrantControls: [], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-11", createdDateTime: "2026-07-21T08:12:40Z",
      userDisplayName: "Gary Guest", userPrincipalName: "gary_ext#EXT#@contoso.com", userId: "u-guest1",
      appDisplayName: "Office 365 SharePoint Online", appId: "00000003-0000-0ff1-ce00-000000000000",
      resourceDisplayName: "Office 365 SharePoint Online",
      ipAddress: "198.51.100.77", location: { city: "Lisbon", countryOrRegion: "PT" },
      clientAppUsed: "Browser",
      deviceDetail: { operatingSystem: "Windows 10", browser: "Chrome 127", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d10", displayName: "CA310-SESSION-Guests-DP-AllApps-AnyPlatform-BlockDownloadUnmanaged-v1.0", result: "success", enforcedGrantControls: [], enforcedSessionControls: ["CloudAppSecurity"] },
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlyInterrupted", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
      ],
    },
    {
      id: "si-14", createdDateTime: "2026-07-21T07:40:12Z",
      userDisplayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userId: "u-emp1",
      appDisplayName: "Microsoft Teams", appId: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe",
      resourceDisplayName: "Microsoft Teams",
      ipAddress: "203.0.113.24", location: { city: "Amsterdam", countryOrRegion: "NL" },
      clientAppUsed: "Mobile Apps and Desktop clients",
      deviceDetail: { operatingSystem: "Ios 17", browser: "", isCompliant: false, isManaged: false, trustType: "Workplace", displayName: "Eva's iPhone" },
      status: { errorCode: 0, failureReason: "" },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      appliedConditionalAccessPolicies: [
        { id: "d12", displayName: "CA212-GRANT-Internals-DAP-AllApps-iOSorAndroid-ApprovedApp-v1.0", result: "success", enforcedGrantControls: ["RequireApprovedApp"], enforcedSessionControls: [] },
        { id: "d7", displayName: "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", result: "success", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
      ],
    },
  ],

  // ---- a NON-INTERACTIVE sign-in (a token refresh the Graph list never
  // returns) — what the Defender hunting source adds ----
  demoNonInteractive: [
    {
      id: "si-12", createdDateTime: "2026-07-21T03:14:09Z",
      userDisplayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userId: "u-emp1",
      appDisplayName: "Microsoft Office", appId: "d3590ed6-52b3-4102-aeff-aad2292ab01c",
      resourceDisplayName: "Office 365 Exchange Online",
      ipAddress: "203.0.113.24", location: { city: "Amsterdam", countryOrRegion: "NL" },
      clientAppUsed: "Mobile Apps and Desktop clients",
      deviceDetail: { operatingSystem: "iOS", browser: "", isCompliant: false, isManaged: false, trustType: "" },
      status: { errorCode: 50074, failureReason: "Strong Authentication is required." },
      conditionalAccessStatus: "success", riskLevelDuringSignIn: "none",
      signInEventTypes: ["nonInteractiveUser"],
      appliedConditionalAccessPolicies: [
        { id: "d1", displayName: "Require MFA for all admins", result: "notApplied", enforcedGrantControls: [], enforcedSessionControls: [] },
        { id: "d6", displayName: "Unmanaged devices — limited web session", result: "success", enforcedGrantControls: ["Mfa"], enforcedSessionControls: ["SignInFrequency"] },
      ],
    },
  ],

  // ---- 🛂 Session controls: Defender advanced hunting rows (CloudAppEvents,
  // session-control audit source) as runHuntingQuery returns them ----
  sessionEvents: [
    { Timestamp: "2026-07-21T08:12:44Z", ActionType: "Log on", ActivityType: "Logon", Application: "Microsoft SharePoint Online", ApplicationId: 20892, AccountObjectId: "u-guest1", AccountDisplayName: "Gary Guest", AccountId: "gary_ext#EXT#@contoso.com", ObjectName: "", ObjectType: "", IPAddress: "198.51.100.77", DeviceType: "Desktop", OSPlatform: "Windows", UserAgent: "Chrome/127", IsExternalUser: true, AccountType: "Regular", AuditSource: "Defender for Cloud Apps session control", SessionData: { InLineSessionId: "sess-4411" }, RawEventData: { PolicyName: "Monitor sessions – guests", DeviceTag: "Unmanaged" }, AdditionalFields: {} },
    { Timestamp: "2026-07-21T08:19:02Z", ActionType: "Download file blocked", ActivityType: "Download", Application: "Microsoft SharePoint Online", ApplicationId: 20892, AccountObjectId: "u-guest1", AccountDisplayName: "Gary Guest", AccountId: "gary_ext#EXT#@contoso.com", ObjectName: "Q3-forecast.xlsx", ObjectType: "File", IPAddress: "198.51.100.77", DeviceType: "Desktop", OSPlatform: "Windows", UserAgent: "Chrome/127", IsExternalUser: true, AccountType: "Regular", AuditSource: "Defender for Cloud Apps session control", SessionData: { InLineSessionId: "sess-4411" }, RawEventData: { PolicyName: "Block download – unmanaged (guests)", ActionResult: "Blocked", FileSize: 2201344, DeviceTag: "Unmanaged" }, AdditionalFields: {} },
    { Timestamp: "2026-07-21T08:21:15Z", ActionType: "Download file protected", ActivityType: "Download", Application: "Microsoft SharePoint Online", ApplicationId: 20892, AccountObjectId: "u-guest1", AccountDisplayName: "Gary Guest", AccountId: "gary_ext#EXT#@contoso.com", ObjectName: "Contract-final.pdf", ObjectType: "File", IPAddress: "198.51.100.77", DeviceType: "Desktop", OSPlatform: "Windows", UserAgent: "Chrome/127", IsExternalUser: true, AccountType: "Regular", AuditSource: "Defender for Cloud Apps session control", SessionData: { InLineSessionId: "sess-4411" }, RawEventData: { PolicyName: "Protect on download – Confidential", ActionResult: "Protected", SensitivityLabel: "Confidential" }, AdditionalFields: {} },
    { Timestamp: "2026-07-21T14:03:30Z", ActionType: "Download file blocked", ActivityType: "Download", Application: "Microsoft SharePoint Online", ApplicationId: 20892, AccountObjectId: "u-emp1", AccountDisplayName: "Eva Employee", AccountId: "eva@contoso.com", ObjectName: "Salaries-2026.xlsx", ObjectType: "File", IPAddress: "203.0.113.24", DeviceType: "Desktop", OSPlatform: "Windows", UserAgent: "Edge/126", IsExternalUser: false, AccountType: "Regular", AuditSource: "Defender for Cloud Apps session control", SessionData: { InLineSessionId: "sess-4590" }, RawEventData: { PolicyName: "Block download – unmanaged (guests)", ActionResult: "Blocked" }, AdditionalFields: {} },
  ],
};

// ---- 🧬 PIM baseline (T48, 32408): the demo tenant's PIM, in the shapes
// Graph returns them — roleDefinitions, roleManagementPolicy rules per role,
// eligibility and assignment schedule instances, role-assignable groups.
// Built from a short spec so the rules look exactly like the tenant's do.
// The demo carries the framework halfway: five of the seven persona groups,
// three roles set right, the rest on Entra's defaults, two roles wrong on
// purpose (Exchange 24 hours, Privileged Role Administrator without
// approval), one permanent Global Administrator outside the break-glass
// pair, and one legacy role-assignable group the framework does not know.
DEMO_DATA.pim = (() => {
  const rules = (s) => [
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule", id: "Expiration_EndUser_Assignment", isExpirationRequired: true, maximumDuration: s.activation || "PT8H" },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyEnablementRule", id: "Enablement_EndUser_Assignment", enabledRules: s.enablement || ["MultiFactorAuthentication", "Justification"] },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyAuthenticationContextRule", id: "AuthenticationContext_EndUser_Assignment", isEnabled: !!s.ctx, claimValue: s.ctx || null },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyApprovalRule", id: "Approval_EndUser_Assignment", setting: { isApprovalRequired: !!s.approval, isApprovalRequiredForExtension: false, isRequestorJustificationRequired: true, approvalMode: "SingleStage", approvalStages: [{ approvalStageTimeOutInDays: 1, isApproverJustificationRequired: true, escalationTimeInMinutes: 0, primaryApprovers: (s.approvers || []).map((id) => ({ "@odata.type": "#microsoft.graph.groupMembers", groupId: id })), isEscalationEnabled: false, escalationApprovers: [] }] } },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule", id: "Expiration_Admin_Eligibility", isExpirationRequired: s.permEligible === false, maximumDuration: s.maxEligible || "P365D" },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyExpirationRule", id: "Expiration_Admin_Assignment", isExpirationRequired: s.permActive === false, maximumDuration: s.maxActive || "P180D" },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyEnablementRule", id: "Enablement_Admin_Assignment", enabledRules: ["Justification"] },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyNotificationRule", id: "Notification_Admin_Admin_Eligibility", notificationType: "Email", recipientType: "Admin", notificationLevel: s.alertEligible || "All", isDefaultRecipientsEnabled: true, notificationRecipients: s.recipients || [] },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyNotificationRule", id: "Notification_Admin_Admin_Assignment", notificationType: "Email", recipientType: "Admin", notificationLevel: s.alertActive || "All", isDefaultRecipientsEnabled: true, notificationRecipients: s.recipients || [] },
    { "@odata.type": "#microsoft.graph.unifiedRoleManagementPolicyNotificationRule", id: "Notification_Admin_EndUser_Assignment", notificationType: "Email", recipientType: "Admin", notificationLevel: s.alertActivation || "All", isDefaultRecipientsEnabled: true, notificationRecipients: s.recipients || [] },
  ];
  const G = { approvers: "g-PIM-SG-Approvers", ga: "g-PIM-SG-M365-GlobalAdmin", t0: "g-PIM-SG-M365-Tier0", sec: "g-PIM-SG-M365-SecOps", ops: "g-PIM-SG-M365-Ops", hd: "g-PIM-SG-M365-Helpdesk", legacy: "g-CAB-SEC-U-Admins-Legacy", bg: "g-CAB-SEC-U-BreakGlass" };
  const names = { [G.approvers]: "PIM-SG-Approvers", [G.ga]: "PIM-SG-M365-GlobalAdmin", [G.t0]: "PIM-SG-M365-Tier0", [G.sec]: "PIM-SG-M365-SecOps", [G.ops]: "PIM-SG-M365-Ops", [G.hd]: "PIM-SG-M365-Helpdesk", [G.legacy]: "CAB-SEC-U-Admins-Legacy", "u-bg1": "BG-Admin-01", "u-bg2": "BG-Admin-02", "u-joey": "Joey Bakker", "u-anna": "Anna de Vries", "u-mihai": "Mihai Monte" };
  const roles = ["Global Administrator", "Privileged Role Administrator", "Privileged Authentication Administrator", "Conditional Access Administrator", "Security Administrator", "Exchange Administrator", "SharePoint Administrator", "Teams Administrator", "Intune Administrator", "Application Administrator", "Cloud Application Administrator", "Application Developer", "Power Platform Administrator", "Authentication Administrator", "Authentication Policy Administrator", "User Administrator", "Groups Administrator", "License Administrator", "Password Administrator", "Cloud Device Administrator", "Microsoft Entra Joined Device Local Administrator", "Hybrid Identity Administrator", "Directory Writers", "Identity Governance Administrator", "Lifecycle Workflows Administrator", "Service Support Administrator", "Edge Administrator", "Office Apps Administrator", "Guest Inviter", "Compliance Administrator", "Compliance Data Administrator", "Cloud App Security Administrator", "Security Operator", "Helpdesk Administrator", "Message Center Reader", "Global Reader", "Security Reader", "Directory Readers", "Billing Administrator", "Attribute Definition Administrator"];
  const roleDefinitions = roles.map((n, i) => ({ id: `rd-${i + 1}`, displayName: n, isBuiltIn: true, isPrivileged: i < 24 }));
  // Entra's tenant default for every role, then the ones this tenant set.
  const dflt = { activation: "PT8H", enablement: ["MultiFactorAuthentication", "Justification"], permEligible: true, permActive: true, maxEligible: "P365D", maxActive: "P180D", alertEligible: "All", alertActive: "All", alertActivation: "All", recipients: [] };
  const right = (t) => Object.assign({}, dflt, { permEligible: false, permActive: false, maxActive: "P30D", recipients: ["pim-alerts@contoso.nl"] }, t);
  const tier0 = () => right({ activation: "PT2H", enablement: ["Justification"], ctx: "c1", approval: true, approvers: [G.approvers] });
  const tier1 = () => right({ activation: "PT2H" });
  const tier2 = () => right({ activation: "PT8H", alertActivation: "Critical" });
  const reader = () => right({ activation: "PT8H", enablement: ["MultiFactorAuthentication"], permEligible: true, maxActive: "P90D", alertActivation: "Critical", alertEligible: "Critical" });
  const set = {};
  // Set right, per tier — the tenant deployed the framework once…
  ["Conditional Access Administrator", "Security Administrator"].forEach((n) => { set[n] = tier0(); });
  ["Application Administrator", "Cloud Application Administrator", "Power Platform Administrator", "Authentication Administrator", "Authentication Policy Administrator", "User Administrator", "Groups Administrator", "License Administrator", "Password Administrator", "Cloud Device Administrator", "Microsoft Entra Joined Device Local Administrator", "Identity Governance Administrator", "Lifecycle Workflows Administrator", "Service Support Administrator", "Edge Administrator", "Office Apps Administrator", "Guest Inviter", "Compliance Administrator", "Cloud App Security Administrator"].forEach((n) => { set[n] = tier1(); });
  ["Helpdesk Administrator"].forEach((n) => { set[n] = tier2(); });
  ["Global Reader", "Security Reader"].forEach((n) => { set[n] = reader(); });
  set["Directory Readers"] = right({ activation: "PT8H", enablement: ["MultiFactorAuthentication"], permEligible: true, permActive: true, maxActive: "P90D", alertActivation: "Critical", alertEligible: "Critical" });
  // …and then drifted, or never finished. Everything not named above sits on
  // Entra's tenant default (8 hours, MFA + justification, permanent allowed).
  Object.assign(set, {
    "Global Administrator": right({ activation: "PT1H", enablement: ["Justification"], ctx: "c1", approval: true, approvers: [G.approvers] }),
    "Conditional Access Administrator": right({ activation: "PT2H", enablement: ["Justification"], ctx: "c1", approval: true, approvers: [G.approvers] }),
    "Security Administrator": right({ activation: "PT2H", enablement: ["Justification"], ctx: "c1", approval: true, approvers: [G.approvers] }),
    "Privileged Role Administrator": right({ activation: "PT2H", enablement: ["Justification"], ctx: "c1", approval: false }),
    "Exchange Administrator": right({ activation: "PT24H", enablement: ["MultiFactorAuthentication", "Justification"] }),
    "Intune Administrator": right({ activation: "PT2H", enablement: ["MultiFactorAuthentication"] }),
  });
  const policies = {};
  roles.forEach((n) => { policies[n] = rules(set[n] || dflt); });
  // Two regions (32413): EU-NL complete but for one rule, EU-DE half built.
  Object.assign(G, { nlHd: "g-PIM-SG-EU-NL-Helpdesk", nlOps: "g-PIM-SG-EU-NL-Ops", nlAp: "g-PIM-SG-EU-NL-Approvers", nlUsr: "g-INT-SG-USR-EU-NL-All", nlDev: "g-INT-SG-DEV-EU-NL-All", deOps: "g-PIM-SG-EU-DE-Ops" });
  Object.assign(names, { [G.nlHd]: "PIM-SG-EU-NL-Helpdesk", [G.nlOps]: "PIM-SG-EU-NL-Ops", [G.nlAp]: "PIM-SG-EU-NL-Approvers", [G.nlUsr]: "INT-SG-USR-EU-NL-All", [G.nlDev]: "INT-SG-DEV-EU-NL-All", [G.deOps]: "PIM-SG-EU-DE-Ops" });
  const AU = { nlU: "au-eu-nl-users", nlD: "au-eu-nl-devices", nlG: "au-eu-nl-groups", deU: "au-eu-de-users", rm: "au-rm-admins" };
  const aus = [
    { id: AU.nlU, displayName: "AU-EU-NL-Users", membershipType: "Dynamic", membershipRule: '(user.extensionAttribute1 -eq "EU-NL")', membershipRuleProcessingState: "On", isMemberManagementRestricted: false },
    { id: AU.nlD, displayName: "AU-EU-NL-Devices", membershipType: "Dynamic", membershipRule: '(device.displayName -startsWith "NL-")', membershipRuleProcessingState: "On", isMemberManagementRestricted: false },
    { id: AU.nlG, displayName: "AU-EU-NL-Groups", membershipType: "Assigned", membershipRule: null, isMemberManagementRestricted: false },
    { id: AU.deU, displayName: "AU-EU-DE-Users", membershipType: "Dynamic", membershipRule: '(user.extensionAttribute1 -eq "EU-DE")', membershipRuleProcessingState: "On", isMemberManagementRestricted: false },
    { id: AU.rm, displayName: "AU-RM-Admins", membershipType: "Assigned", membershipRule: null, isMemberManagementRestricted: true },
    { id: "au-nl-office", displayName: "Amsterdam office", membershipType: "Assigned", membershipRule: null, isMemberManagementRestricted: false },
  ];
  const named = [
    { id: G.nlAp, displayName: "PIM-SG-EU-NL-Approvers", isAssignableToRole: false, membershipRule: null },
    { id: G.nlUsr, displayName: "INT-SG-USR-EU-NL-All", isAssignableToRole: false, membershipRule: '(user.extensionAttribute1 -eq "EU-NL") -and (user.accountEnabled -eq true)' },
    { id: G.nlDev, displayName: "INT-SG-DEV-EU-NL-All", isAssignableToRole: false, membershipRule: '(device.enrollmentProfileName -startsWith "EU-NL") -or (device.displayName -startsWith "NL-")' },
  ];
  const regionsCsv = ["code,name,attribute,value,devicePrefix,autopilotTag,itLead,approvers,timezone", "EU-NL,Netherlands,extensionAttribute1,EU-NL,NL-,EU-NL,it-lead-nl@contoso.nl,\"anna@contoso.nl;mihai@contoso.nl\",Europe/Amsterdam", "EU-DE,Germany,extensionAttribute1,EU-DE,DE-,EU-DE,it-lead-de@contoso.nl,\"joey@contoso.nl;mihai@contoso.nl\",Europe/Berlin"].join("\n");
  const inst = (roleName, principalId, principalType, endDateTime, assignmentType, directoryScopeId) => ({ roleName, principalId, principalName: names[principalId] || principalId, principalType, endDateTime, assignmentType, directoryScopeId: directoryScopeId || "/" });
  const far = "2027-09-01T00:00:00Z";
  const eligible = [
    inst("Global Administrator", G.ga, "Group", far), inst("Global Administrator", "u-anna", "User", far), inst("Global Administrator", "u-joey", "User", far),
    inst("Privileged Role Administrator", G.t0, "Group", far), inst("Privileged Authentication Administrator", G.t0, "Group", far),
    inst("Conditional Access Administrator", G.sec, "Group", far), inst("Security Administrator", G.sec, "Group", far), inst("Compliance Administrator", G.sec, "Group", far), inst("Cloud App Security Administrator", G.sec, "Group", far), inst("Security Operator", G.sec, "Group", far),
    inst("Exchange Administrator", G.ops, "Group", far), inst("SharePoint Administrator", G.ops, "Group", far), inst("Teams Administrator", G.ops, "Group", far), inst("Intune Administrator", G.ops, "Group", far), inst("Application Administrator", G.ops, "Group", far), inst("User Administrator", G.ops, "Group", far), inst("License Administrator", G.ops, "Group", far), inst("Authentication Administrator", G.ops, "Group", far), inst("Authentication Policy Administrator", G.ops, "Group", far), inst("Power Platform Administrator", G.ops, "Group", far), inst("Identity Governance Administrator", G.ops, "Group", far), inst("Lifecycle Workflows Administrator", G.ops, "Group", far), inst("Service Support Administrator", G.ops, "Group", far), inst("Message Center Reader", G.ops, "Group", far),
    inst("Helpdesk Administrator", G.hd, "Group", far), inst("Groups Administrator", G.hd, "Group", far), inst("User Administrator", G.hd, "Group", far), inst("Password Administrator", G.hd, "Group", far), inst("License Administrator", G.hd, "Group", far), inst("Authentication Administrator", G.hd, "Group", far), inst("Cloud Device Administrator", G.hd, "Group", far), inst("Message Center Reader", G.hd, "Group", far),
    inst("Exchange Administrator", "u-joey", "User", null), inst("Global Reader", "u-anna", "User", null), inst("Security Reader", "u-mihai", "User", null),
    // EU-NL: the first line scoped right, the second line missing Groups Administrator and holding User Administrator tenant-wide
    inst("Helpdesk Administrator", G.nlHd, "Group", far, undefined, `/administrativeUnits/${AU.nlU}`), inst("Password Administrator", G.nlHd, "Group", far, undefined, `/administrativeUnits/${AU.nlU}`), inst("Authentication Administrator", G.nlHd, "Group", far, undefined, `/administrativeUnits/${AU.nlU}`), inst("License Administrator", G.nlHd, "Group", far, undefined, `/administrativeUnits/${AU.nlU}`),
    inst("User Administrator", G.nlOps, "Group", far), inst("Teams Administrator", G.nlOps, "Group", far, undefined, `/administrativeUnits/${AU.nlG}`), inst("Cloud Device Administrator", G.nlOps, "Group", far, undefined, `/administrativeUnits/${AU.nlD}`),
  ];
  const active = [
    inst("Global Administrator", "u-bg1", "User", null, "Assigned"), inst("Global Administrator", "u-bg2", "User", null, "Assigned"), inst("Global Administrator", "u-joey", "User", null, "Assigned"),
    inst("User Administrator", G.legacy, "Group", null, "Assigned"), inst("Exchange Administrator", G.legacy, "Group", null, "Assigned"),
    inst("Directory Readers", G.ops, "Group", null, "Assigned"),
    inst("Intune Administrator", "u-joey", "User", "2026-09-24T18:00:00Z", "Activated"),
  ];
  const groups = [
    { id: G.ga, displayName: "PIM-SG-M365-GlobalAdmin", isAssignableToRole: true }, { id: G.t0, displayName: "PIM-SG-M365-Tier0", isAssignableToRole: true }, { id: G.sec, displayName: "PIM-SG-M365-SecOps", isAssignableToRole: true }, { id: G.ops, displayName: "PIM-SG-M365-Ops", isAssignableToRole: true }, { id: G.hd, displayName: "PIM-SG-M365-Helpdesk", isAssignableToRole: false },
    { id: G.legacy, displayName: "CAB-SEC-U-Admins-Legacy", isAssignableToRole: true },
    { id: G.nlHd, displayName: "PIM-SG-EU-NL-Helpdesk", isAssignableToRole: true }, { id: G.nlOps, displayName: "PIM-SG-EU-NL-Ops", isAssignableToRole: true }, { id: G.deOps, displayName: "PIM-SG-EU-DE-Ops", isAssignableToRole: true },
  ];
  const groupPolicies = {
    "PIM-SG-M365-GlobalAdmin": rules(right({ activation: "PT2H", enablement: ["Justification"], ctx: "c1", approval: true, approvers: [G.approvers] })),
    "PIM-SG-M365-Tier0": rules(right({ activation: "PT2H", enablement: ["Justification"], ctx: "c1", approval: true, approvers: [G.approvers] })),
    "PIM-SG-M365-SecOps": rules(right({ activation: "PT4H", approval: false })),
    "PIM-SG-M365-Ops": rules(right({ activation: "PT8H", alertActivation: "Critical" })),
    "PIM-SG-M365-Helpdesk": rules(right({ activation: "PT8H", alertActivation: "Critical" })),
  };
  return { roleDefinitions, policies, eligible, active, groups, groupPolicies, names, aus, named, regionsCsv };
})();
