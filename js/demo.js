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
      id: "d7", displayName: "Require MFA for all users — staged", state: "enabledForReportingButNotEnforced", modifiedDateTime: "2026-07-15T09:00:00Z",
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
      },
    },
  ],
  names: {
    "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
    "u-break1": "breakglass-01", "u-break2": "breakglass-02", "u-svc": "svc-legacyapp", "g-hr": "HR-Department",
    "00000003-0000-0ff1-ce00-000000000000": "Office 365 SharePoint Online",
  },

  // ---- impact-analysis demo data (users + memberships) ----
  analyzeUsers: [
    { id: "u-admin", displayName: "Alex Admin", userPrincipalName: "alex.admin@contoso.com", userType: "Member", accountEnabled: true },
    { id: "u-break1", displayName: "breakglass-01", userPrincipalName: "breakglass-01@contoso.com", userType: "Member", accountEnabled: true },
    { id: "u-break2", displayName: "breakglass-02", userPrincipalName: "breakglass-02@contoso.com", userType: "Member", accountEnabled: true },
    { id: "u-svc", displayName: "svc-legacyapp", userPrincipalName: "svc-legacyapp@contoso.com", userType: "Member", accountEnabled: true },
    { id: "u-emp1", displayName: "Eva Employee", userPrincipalName: "eva@contoso.com", userType: "Member", accountEnabled: true },
    { id: "u-emp2", displayName: "Milan Medewerker", userPrincipalName: "milan@contoso.com", userType: "Member", accountEnabled: true },
    { id: "u-guest1", displayName: "Gary Guest", userPrincipalName: "gary_ext#EXT#@contoso.com", userType: "Guest", accountEnabled: true },
    { id: "u-old", displayName: "Olga Offboarded", userPrincipalName: "olga@contoso.com", userType: "Member", accountEnabled: false },
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
  serviceProviders: [
    { tenantId: "7f1a0c2e-4b55-4a3c-9d10-2f8e6b41c009", name: "Northwind Managed Services",
      inboundTrust: { isMfaAccepted: false, isCompliantDeviceAccepted: false, isHybridAzureADJoinedDeviceAccepted: false } },
  ],
  scopeGroups: {
    "CAB-SEC-U-BreakGlass": ["u-break1", "u-break2"],
    "CAB-SEC-U-Persona-Admins": ["u-admin"],
    "CAB-SEC-U-Persona-Internals": ["u-emp1", "u-emp2", "u-old"],
    "CAB-SEC-U-Persona-Guests": ["u-guest1"],
    "HR-Department": ["u-emp1", "u-emp2"],
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
  namedLocations: [
    { "@odata.type": "#microsoft.graph.ipNamedLocation", id: "loc-hq", displayName: "HQ egress", isTrusted: true, ipRanges: [{ cidrAddress: "203.0.113.0/24" }] },
    { "@odata.type": "#microsoft.graph.ipNamedLocation", id: "loc-branch", displayName: "Branch office (unmarked)", isTrusted: false, ipRanges: [{ cidrAddress: "198.51.100.0/24" }] },
    { "@odata.type": "#microsoft.graph.countryNamedLocation", id: "loc-empty", displayName: "Blocked countries (empty)", countriesAndRegions: [] },
  ],

  // Sample sign-in records (raw Graph shape) for the Sign-in failures tool.
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
      conditionalAccessStatus: "failure", riskLevelDuringSignIn: "medium",
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
      appliedConditionalAccessPolicies: [
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
      appliedConditionalAccessPolicies: [
        { id: "d7", displayName: "Require MFA for all users — staged", result: "reportOnlySuccess", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
        { id: "d5", displayName: "Block elevated insider risk", result: "reportOnlyNotApplied", enforcedGrantControls: [], enforcedSessionControls: [] },
      ],
    },
  ],
};
