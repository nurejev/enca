// ======================================================================
// Baseline catalog — Conditional Access Baseline by Joey Verlinden.
//   https://github.com/j0eyv/ConditionalAccessBaseline
// Release 2026.6.1 (12-06-2026). Based on the Microsoft Conditional Access
// framework by Claus Jespersen, deliberately minimised.
//
// Built from the repository README at that release. Joey's personas are
// Global / Admins / Internals / ServiceAccounts / Guests / Agents, which do
// NOT map onto the Limon-IT CA-number ranges (his CA300 block is service
// accounts, not externals), so each policy carries its own persona label.
//
// Naming convention in this baseline: every policy has a matching exclusion
// group "<policy name> - Exclude", and the break-glass group is
// "CA-BreakGlassAccounts - Exclude".
// ======================================================================
const BASELINE_JOEY = {
  id: "joey",
  label: "Joey Verlinden",
  release: "2026.6.1",
  released: "12-06-2026",
  line: "Conditional Access Baseline",
  author: "Joey Verlinden",
  url: "https://github.com/j0eyv/ConditionalAccessBaseline",
  breakGlassGroup: "CA-BreakGlassAccounts - Exclude",
  importerUrl: "https://conditionalaccess.joeyverlinden.com/",
  note: "Conditional Access for agents requires Entra ID P1/P2 and a Microsoft Agent 365 license per user.",
  policies: [
    { num: 0, persona: "🌐 Global", name: "CA000-Global-IdentityProtection-AnyApp-AnyPlatform-MFA",
      grant: "Require MFA", resources: "All cloud apps", platform: "Any platform",
      description: "Requires MFA for all cloud apps from every platform. Catches every authentication in scope that no other MFA policy covers." },
    { num: 1, persona: "🌐 Global", name: "CA001-Global-AttackSurfaceReduction-AnyApp-AnyPlatform-BLOCK-CountryWhitelist",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform", network: "All countries except the named location ALLOWED COUNTRIES",
      description: "Blocks every country except those in the ALLOWED COUNTRIES named location (Belgium, Luxembourg and the Netherlands by default — adjust to your own list)." },
    { num: 2, persona: "🌐 Global", name: "CA002-Global-IdentityProtection-AnyApp-AnyPlatform-Block-LegacyAuthentication",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform",
      description: "Blocks legacy authentication for all users, to all cloud apps, from any platform." },
    { num: 3, persona: "🌐 Global", name: "CA003-Global-BaseProtection-RegisterOrJoin-AnyPlatform-MFA",
      grant: "Require MFA", resources: "Register or join devices", platform: "Any platform",
      description: "Requires MFA to register or join a device. Disable \"Require MFA to register or join devices\" in Entra device settings when using this." },
    { num: 4, persona: "🌐 Global", name: "CA004-Global-IdentityProtection-AnyApp-AnyPlatform-AuthenticationFlows",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform",
      description: "Prevents transferring authentication flows (e.g. PC to mobile). Currently a preview feature." },
    { num: 5, persona: "🌐 Global", name: "CA005-Global-DataProtection-Office365-iOSenAndroid-ClientApps-Unmanaged-AppEnforcedRestrictions",
      grant: "Session: app enforced restrictions", resources: "Office 365", platform: "iOS and Android (unmanaged)",
      description: "Requires app enforced restrictions on unmanaged devices. Renamed and re-scoped in 2026.6.1; 2026.2.1 had moved it off the retiring 'Require approved client app' control." },
    { num: 6, persona: "🌐 Global", name: "CA006-Global-DataProtection-Office365-iOSenAndroid-RequireAppProtection",
      grant: "Require app protection policy", resources: "Office 365", platform: "iOS and Android",
      description: "Requires app protection policies for Office 365 on iOS and Android. Admin roles are excluded so the M365 apps keep working — assumes admin roles live on admin accounts only. Overlaps with CA005 and may be removed." },

    { num: 100, persona: "🛡 Admins", name: "CA100-Admins-IdentityProtection-AdminPortals-AnyPlatform-MFA",
      grant: "Require MFA", resources: "Microsoft Admin Portals", platform: "Any platform",
      description: "Requires MFA for selected admin roles when accessing the admin portals. 2026.6.1 added Agent ID Administrator, Agent Registry Administrator, AI Administrator, Entra Backup Admin, Windows 365 Administrator, Microsoft 365 Backup Admin and Dragon Admin. Review the role selection for your tenant." },
    { num: 101, persona: "🛡 Admins", name: "CA101-Admins-IdentityProtection-AnyApp-AnyPlatform-MFA",
      grant: "Require MFA", resources: "All cloud apps", platform: "Any platform",
      description: "Requires MFA for selected admin roles on any cloud app." },
    { num: 102, persona: "🛡 Admins", name: "CA102-Admins-IdentityProtection-AllApps-AnyPlatform-SigninFrequency",
      grant: "Session: sign-in frequency 12 hours", resources: "All cloud apps", platform: "Any platform",
      description: "Sign-in frequency of 12 hours for admin roles — admins must re-authenticate after 12 hours." },
    { num: 103, persona: "🛡 Admins", name: "CA103-Admins-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser",
      grant: "Session: never persistent browser", resources: "All cloud apps", platform: "Any platform",
      description: "Prevents persistent browser sessions for admins on every device." },
    { num: 104, persona: "🛡 Admins", name: "CA104-Admins-IdentityProtection-AllApps-AnyPlatform-ContinuousAccessEvaluation",
      grant: "Session: continuous access evaluation", resources: "All cloud apps", platform: "Any platform",
      description: "Enables near-real-time re-evaluation of admin access instead of waiting for token expiry. Cannot be created in report-only — On or Off only." },
    { num: 105, persona: "🛡 Admins", name: "CA105-Admins-IdentityProtection-AnyApp-AnyPlatform-PhishingResistantMFA",
      grant: "Authentication strength: phishing-resistant MFA", resources: "All cloud apps", platform: "Any platform",
      description: "Requires phishing-resistant MFA for admins. Excludes Microsoft Graph Command Line Tools; includes Global Reader and Intune Administrator. 2026.6.1 added Agent ID Administrator, Agent Registry Administrator, AI Administrator, Entra Backup Admin, Windows 365 Administrator, Microsoft 365 Backup Admin and Dragon Admin." },

    { num: 200, persona: "👤 Internals", name: "CA200-Internals-IdentityProtection-AnyApp-AnyPlatform-MFA",
      grant: "Require MFA", resources: "All cloud apps", platform: "Any platform",
      description: "Requires MFA for all internal identities on all cloud apps. Verify the included group — APP_Microsoft365_E5 ships as the example." },
    { num: 201, persona: "👤 Internals", name: "CA201-Internals-IdentityProtection-AnyApp-AnyPlatform-BLOCK-HighRiskUser",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform", conditions: "User risk: high",
      description: "Blocks internal users at high user risk. Split from the combined risk policy in 2025.2.3." },
    { num: 202, persona: "👤 Internals", name: "CA202-Internals-IdentityProtection-AllApps-WindowsMacOS-SigninFrequency-UnmanagedDevices",
      grant: "Session: sign-in frequency 12 hours", resources: "All cloud apps", platform: "Windows and macOS (unmanaged)",
      description: "Sign-in frequency of 12 hours for internals on unmanaged Windows or macOS devices." },
    { num: 203, persona: "👤 Internals", name: "CA203-Internals-AppProtection-MicrosoftIntuneEnrollment-AnyPlatform-MFA",
      grant: "Require MFA", resources: "Microsoft Intune Enrollment", platform: "Any platform",
      description: "Requires MFA for internals enrolling devices in Intune. Autopilot Device Preparation (v2) can stall at OOBE under this policy — exclude those users." },
    { num: 204, persona: "👤 Internals", name: "CA204-Internals-AttackSurfaceReduction-AllApps-AnyPlatform-BlockUnknownPlatforms",
      grant: "Block access", resources: "All cloud apps", platform: "Anything other than Windows, macOS, Android, iOS",
      description: "Blocks unknown or unsupported device platforms for internals. Modify if Linux or another platform is allowed." },
    { num: 205, persona: "👤 Internals", name: "CA205-Internals-BaseProtection-AnyApp-Windows-CompliantorAADHJ",
      grant: "Require compliant device OR Entra hybrid joined", resources: "All cloud apps", platform: "Windows",
      description: "Requires internals to use a compliant or Entra hybrid joined Windows device. Windows first sign-in restore may need an exclusion for Microsoft Activity Feed Service." },
    { num: 206, persona: "👤 Internals", name: "CA206-Internals-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser",
      grant: "Session: never persistent browser", resources: "All cloud apps", platform: "Unmanaged devices",
      description: "Prevents persistent browser sessions for internals on unmanaged devices; managed and compliant devices are excluded." },
    { num: 207, persona: "👤 Internals", name: "CA207-Internals-AttackSurfaceReduction-SelectedApps-AnyPlatform-BLOCK",
      grant: "Block access", resources: "Selected apps", platform: "Any platform",
      description: "Blocks internals from specific apps. Shipped with an example app — review the included and excluded apps before use." },
    { num: 208, persona: "👤 Internals", name: "CA208-Internals-BaseProtection-AnyApp-MacOS-Compliant",
      grant: "Require compliant device", resources: "All cloud apps", platform: "macOS",
      description: "Requires macOS devices to be compliant for internals." },
    { num: 209, persona: "👤 Internals", name: "CA209-Internals-IdentityProtection-AllApps-AnyPlatform-ContinuousAccessEvaluation",
      grant: "Session: continuous access evaluation", resources: "All cloud apps", platform: "Any platform",
      description: "Near-real-time re-evaluation of internal user access. Cannot be created in report-only — On or Off only." },
    { num: 210, persona: "👤 Internals", name: "CA210-Internals-IdentityProtection-AnyApp-AnyPlatform-BLOCK-HighRiskSignIn",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform", conditions: "Sign-in risk: high",
      description: "Blocks internal users at high sign-in risk. Added in 2025.2.3 when CA201 was split." },

    { num: 300, persona: "⚙ Service accounts", name: "CA300-ServiceAccounts-IdentityProtection-AnyApp-AnyPlatform-MFA",
      grant: "Require MFA", resources: "All cloud apps", platform: "Any platform",
      description: "Requires MFA for service accounts on any cloud app. Documented in the README; no policy JSON ships in the repository." },
    { num: 301, persona: "⚙ Service accounts", name: "CA301-ServiceAccounts-AttackSurfaceReduction-AllApps-AnyPlatform-BlockUntrustedLocations",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform", network: "ALLOWED COUNTRIES - SERVICE ACCOUNTS named location",
      description: "Prevents service accounts signing in from untrusted countries. Documented in the README; no policy JSON ships in the repository." },

    { num: 400, persona: "🙋 Guests", name: "CA400-GuestUsers-IdentityProtection-AnyApp-AnyPlatform-MFA",
      grant: "Require MFA", resources: "All cloud apps", platform: "Any platform",
      description: "Requires MFA for guests on any cloud app, from any platform." },
    { num: 401, persona: "🙋 Guests", name: "CA401-GuestUsers-AttackSurfaceReduction-AllApps-AnyPlatform-BlockNonGuestAppAccess",
      grant: "Block access", resources: "All cloud apps except those excluded", platform: "Any platform",
      description: "Blocks guests from every cloud app except the excluded ones. Exclude any app your guests genuinely need; Service Provider Users can also be blocked if you work with no MSP." },
    { num: 402, persona: "🙋 Guests", name: "CA402-GuestUsers-IdentityProtection-AllApps-AnyPlatform-SigninFrequency",
      grant: "Session: sign-in frequency 12 hours", resources: "All cloud apps", platform: "Any platform",
      description: "Sign-in frequency of 12 hours for guests, on any device." },
    { num: 403, persona: "🙋 Guests", name: "CA403-Guests-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser",
      grant: "Session: never persistent browser", resources: "All cloud apps", platform: "Any platform",
      description: "Prevents persistent browser sessions for guests." },
    { num: 404, persona: "🙋 Guests", name: "CA404-Guests-AttackSurfaceReduction-SelectedApps-AnyPlatform-BLOCK",
      grant: "Block access", resources: "Selected apps", platform: "Any platform",
      description: "Blocks guests from specific apps. Shipped with an example app — review the included and excluded apps before use." },

    { num: 501, persona: "🤖 Agents", name: "CA501-Agents-IdentityProtection-AnyApp-AnyPlatform-BLOCK-HighRiskAgent",
      grant: "Block access", resources: "All cloud apps", platform: "Any platform", conditions: "Agent risk: high",
      learn: "https://learn.microsoft.com/entra/identity/conditional-access/policy-autonomous-agents#block-high-risk-agents-from-accessing-organizational-resources",
      description: "Blocks agent identities at a high risk level from reaching tenant resources. Adopted from the Microsoft template policy in 2026.2.1." },
    { num: 502, persona: "🤖 Agents", name: "CA502-Agents-AttackSurfaceReduction-AllAgentIdentities-AllAgentResources-BLOCK",
      grant: "Block access", resources: "All agent resources", platform: "Any platform",
      learn: "https://learn.microsoft.com/entra/identity/conditional-access/policy-autonomous-agents#create-conditional-access-policy-using-the-enhanced-object-picker",
      description: "New in 2026.6.1. Blocks every agent identity by default — only agents explicitly excluded (approved) may be used." },
    { num: 503, persona: "🤖 Agents", name: "CA503-Agents-BaseProtection-AllAgentUsers-AllResources-RequireCompliantDevice",
      grant: "Require device to be marked compliant", resources: "All resources", platform: "Any platform",
      learn: "https://learn.microsoft.com/entra/identity/conditional-access/policy-autonomous-agents#require-a-compliant-device-for-agents-user-accounts",
      description: "New in 2026.6.1. Computer-based autonomous agents work inside a desktop session like a human user, so the device must meet compliance." },
    { num: 504, persona: "🤖 Agents", name: "CA504-Agents-IdentityProtection-AllAgentUsers-AllResources-BlockRiskyAgents",
      grant: "Block access", resources: "All resources", platform: "Any platform", conditions: "Agent user risk: medium or high",
      learn: "https://learn.microsoft.com/entra/identity/conditional-access/policy-autonomous-agents#block-risky-agents-user-accounts",
      description: "New in 2026.6.1. Blocks autonomous agents operating as users when Entra ID Protection flags medium or high risk." },
    { num: 505, persona: "🤖 Agents", name: "CA505-Agents-AttackSurfaceReduction-AllAgentUsers-AllResources-RequireCompliantNetWork",
      grant: "Block access", resources: "All resources", platform: "Any platform", network: "Everywhere except the Global Secure Access compliant network",
      learn: "https://learn.microsoft.com/entra/identity/conditional-access/policy-autonomous-agents#require-a-compliant-network-for-agents-user-accounts",
      description: "New in 2026.6.1. Blocks agent user sessions from every location except a Global Secure Access compliant network — check this is feasible in your environment." },
  ],
};

// Every policy carries its own exclusion group, named after the policy.
BASELINE_JOEY.policies.forEach((p) => {
  p.exclude = [`${p.name} - Exclude (group)`, `${BASELINE_JOEY.breakGlassGroup} (group)`];
  p.include = [p.persona.replace(/^\S+\s*/, "")];
  p.docUrl = p.learn || `${BASELINE_JOEY.url}#${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
});
