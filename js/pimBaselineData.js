// ======================================================================
// 🧬 PIM baseline — the CloudFellows PIM framework, release 2.0
// (js/pimBaselineData.js, T48, build 32408, R68)
//
// WHAT THIS IS. The reference for Workspace 02: which privileged access
// groups exist, which Entra roles each one carries, and the PIM role
// settings every role and group activates under. It is authored in the
// baseline tenant, cloudfellows.dev, and every other tenant is matched
// against it — the same idea as js/baselineData.js for Conditional Access,
// with a tenant instead of a policy catalog.
//
// LINEAGE. Privileged Identity Management Dovilo framework v1.3 (25 August
// 2024, Mihai Monte) — the persona groups PIM-SEC-U-M365-IT_Helpdesk,
// IT_Ops_M365, GL_Admin, SecOps_Admin, SecOps_Reader, AppOps_M365, the Azure
// subscription groups PIM-SEC-U-AZ-*, the approver list PIM-SEC-U-IT-AP and
// the Alerts.Notifications shared mailbox. Renamed CloudFellows PIM framework
// and revised to 2.0 on 2026-09-24. What changed, and why:
//
//   * NAMES. SG-PIM-<scope>-<persona or role> — the SG- prefix ENCA's other
//     groups use, PIM as the family, M365 or AZ as the scope. The old
//     PIM-SEC-U-M365-IT_Ops_M365 becomes SG-PIM-M365-Ops. Exact match: a
//     tenant carries the framework when it carries these names.
//   * TIERS INSTEAD OF A ROW PER ROLE. 1.3 kept a 24-row table of MFA /
//     notification / approval / duration per role and left a few rows
//     inconsistent (approval required, approver "None"). 2.0 keeps four
//     templates — Tier0, Tier1, Tier2, Reader — and each role names one; an
//     override on the role carries the one deliberate exception (Global
//     Administrator stays at one hour, as in 1.3). EasyPIM's PolicyTemplates
//     are the same idea, so the catalog exports straight into its config.
//   * "REQUIRE CONDITIONAL ACCESS" BECAME AN AUTHENTICATION CONTEXT. 1.3
//     ticked it for Global Administrator and every group; nothing said which
//     policy. 2.0 requires authentication context c1 on Tier 0 activation and
//     leaves the Conditional Access policy that gates c1 (phishing-resistant
//     MFA, compliant device) to Workspace 01, where it belongs. Entra refuses
//     MFA-on-activation together with a context, so Tier0 asks Justification
//     + context and lets the CA policy carry the MFA.
//   * PRIVILEGED AUTHENTICATION ADMINISTRATOR AND PRIVILEGED ROLE
//     ADMINISTRATOR ARE TIER 0. 1.3 had the first in IT Ops and the second
//     in SecOps. Either one can make a Global Administrator, so they sit in
//     SG-PIM-M365-Tier0 with Tier0 settings, beside the Global Administrator
//     group, and nowhere else.
//   * APPROVAL ONLY WHERE AN APPROVER IS NAMED. Tier0 roles and the two Tier
//     0 groups need SG-PIM-Approvers; SecOps (Security and Conditional
//     Access Administrator) too. The 1.3 rows that required approval with no
//     approver are Tier1: MFA + justification, no gate.
//   * ELIGIBILITY EXPIRES. 1.3 said nothing; 2.0 caps eligibility at one
//     year (P365D), which is the access-review cadence 1.3 already asked
//     for, and allows permanent eligibility only on Reader.
//   * PERMANENT ACTIVE IS NOT ALLOWED — except Directory Readers (1.3 marked
//     it "Perm" for all of IT), and the break-glass accounts, which are
//     ProtectedUsers and never touched.
//   * DEFENDER, INTUNE AND PURVIEW RBAC are outside Entra PIM and outside
//     this catalog. 1.3's Defender XDR role settings for Ops and Helpdesk are
//     still the intent; they are not something PIM policies can express.
//
// HOW IT IS READ. js/pimbaseline.js turns each role into expected settings
// (template + override), reads the tenant's roleManagementPolicies and
// compares setting by setting; groups are compared as a model — present,
// role-assignable, carrying the roles listed — never by members. The same
// module writes the catalog out as an EasyPIM.Orchestrator config
// (PolicyTemplates → EntraRoles.Policies → GroupRoles.Policies →
// Assignments.EntraRoles → ProtectedUsers), which is how the baseline is
// CREATED in cloudfellows.dev: tools/pim/New-PimBaseline.ps1 makes the groups
// and runs Invoke-EasyPIMOrchestrator -WhatIf, then delta.
//
// PLAIN TEXT in every string here — the notes render escaped.
// ======================================================================
const PIM_BASELINE = {
  id: "cloudfellows-pim",
  label: "CloudFellows PIM framework",
  icon: "🧬",
  release: "2.0",
  revised: "2026-09-24",
  tenant: "cloudfellows.dev",
  source: "bundled",
  lineage: "Dovilo PIM framework v1.3 (25 Aug 2024) → CloudFellows PIM framework 2.0 (24 Sep 2026)",
  // Names the framework depends on beside the groups. The approver group
  // is a plain security group (not role-assignable, not PIM-managed): its
  // members approve, they hold nothing. The mailbox is a shared mailbox in
  // the tenant's own domain.
  approvers: { name: "SG-PIM-Approvers", description: "Approves Tier 0 and SecOps activations. Plain security group, members from IT and Security; never role-assignable." },
  notifications: { mailbox: "pim-alerts", description: "Shared mailbox pim-alerts@<tenant domain> receives every PIM alert (eligible, active and activation), so the audit trail has one inbox." },
  authContext: { id: "c1", name: "PIM Tier 0 activation", description: "Authentication context c1 is required to activate a Tier 0 role or group. The Conditional Access policy that gates c1 (phishing-resistant MFA, compliant device) lives in Workspace 01." },
  // Exact-match naming contract. A tenant's group counts as the framework's
  // only under this exact name (no prefixes, no suffixes, no version).
  naming: { pattern: "^SG-PIM-(M365|AZ)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$", example: "SG-PIM-M365-Ops · SG-PIM-AZ-Platform-Owner" },
  // Templates: one set of PIM settings, named. Keys follow EasyPIM's
  // PolicyTemplates so the export is a copy, not a translation.
  templates: {
    Tier0: {
      description: "Can make or unmake a Global Administrator, or switch the tenant's security policy off. Two hours, justification, authentication context c1, approval by SG-PIM-Approvers, eligibility one year, nothing permanent.",
      ActivationDuration: "PT2H",
      ActivationRequirement: "Justification",
      AuthenticationContext_Enabled: true,
      AuthenticationContext_Value: "c1",
      ApprovalRequired: true,
      Approvers: ["SG-PIM-Approvers"],
      AllowPermanentEligibility: false,
      MaximumEligibilityDuration: "P365D",
      AllowPermanentActiveAssignment: false,
      MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    Tier1: {
      description: "Runs a workload or manages accounts. Two hours, MFA and justification, no approval, eligibility one year, nothing permanent.",
      ActivationDuration: "PT2H",
      ActivationRequirement: "MultiFactorAuthentication,Justification",
      AuthenticationContext_Enabled: false,
      ApprovalRequired: false,
      Approvers: [],
      AllowPermanentEligibility: false,
      MaximumEligibilityDuration: "P365D",
      AllowPermanentActiveAssignment: false,
      MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    Tier2: {
      description: "First-line work that lasts a shift. Eight hours, MFA and justification, no approval, eligibility one year, nothing permanent; alerts on critical events only.",
      ActivationDuration: "PT8H",
      ActivationRequirement: "MultiFactorAuthentication,Justification",
      AuthenticationContext_Enabled: false,
      ApprovalRequired: false,
      Approvers: [],
      AllowPermanentEligibility: false,
      MaximumEligibilityDuration: "P365D",
      AllowPermanentActiveAssignment: false,
      MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    Reader: {
      description: "Reads, changes nothing. Eight hours, MFA, no justification, no approval; permanent eligibility allowed, active still expires.",
      ActivationDuration: "PT8H",
      ActivationRequirement: "MultiFactorAuthentication",
      AuthenticationContext_Enabled: false,
      ApprovalRequired: false,
      Approvers: [],
      AllowPermanentEligibility: true,
      MaximumEligibilityDuration: "P365D",
      AllowPermanentActiveAssignment: false,
      MaximumActiveAssignmentDuration: "P90D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    // Group activation (PIM for Groups, the Member role). Activating a
    // persona group grants every role it carries at once, so the group's
    // own gate is the one that counts for people who work through personas.
    GroupTier0: {
      description: "The Global Administrator and Tier 0 groups: two hours, justification, authentication context c1, approval by SG-PIM-Approvers.",
      ActivationDuration: "PT2H", ActivationRequirement: "Justification", AuthenticationContext_Enabled: true, AuthenticationContext_Value: "c1",
      ApprovalRequired: true, Approvers: ["SG-PIM-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    GroupTier1: {
      description: "SecOps and the Azure Owner groups: four hours, MFA and justification, approval by SG-PIM-Approvers.",
      ActivationDuration: "PT4H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: true, Approvers: ["SG-PIM-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    GroupTier2: {
      description: "Helpdesk, Ops, AppOps, the readers and the Azure Contributor groups: eight hours, MFA and justification, no approval.",
      ActivationDuration: "PT8H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: false, Approvers: [], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
  },
  // Entra roles under the framework, by their exact Microsoft display names
  // (2026). `via` names the persona groups that carry the role — the model
  // the group comparison checks. `override` is the one exception to the
  // template, written the same way EasyPIM writes an inline setting.
  roles: [
    // ---- Tier 0 ----
    { name: "Global Administrator", template: "Tier0", via: ["SG-PIM-M365-GlobalAdmin"], override: { ActivationDuration: "PT1H" }, note: "One hour, as in 1.3. The break-glass accounts hold it permanently and are protected." },
    { name: "Privileged Role Administrator", template: "Tier0", via: ["SG-PIM-M365-Tier0"], note: "Moved out of SecOps in 2.0: it assigns roles, including Global Administrator." },
    { name: "Privileged Authentication Administrator", template: "Tier0", via: ["SG-PIM-M365-Tier0"], note: "Moved out of Ops in 2.0: it resets a Global Administrator's authentication methods." },
    { name: "Conditional Access Administrator", template: "Tier0", via: ["SG-PIM-M365-SecOps"], note: "Can switch every Conditional Access policy off — approval, as in 1.3." },
    { name: "Security Administrator", template: "Tier0", via: ["SG-PIM-M365-SecOps"], note: "Manages Conditional Access and Defender — approval, as in 1.3." },
    // ---- Tier 1 ----
    { name: "Exchange Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops", "SG-PIM-M365-AppOps"] },
    { name: "SharePoint Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops", "SG-PIM-M365-AppOps"] },
    { name: "Teams Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Intune Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Application Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Cloud Application Administrator", template: "Tier1", via: ["SG-PIM-M365-AppOps"] },
    { name: "Application Developer", template: "Tier1", via: ["SG-PIM-M365-AppOps"] },
    { name: "Power Platform Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops", "SG-PIM-M365-AppOps"] },
    { name: "Authentication Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk", "SG-PIM-M365-Ops"] },
    { name: "Authentication Policy Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "User Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk", "SG-PIM-M365-Ops"] },
    { name: "Groups Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk"] },
    { name: "License Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk", "SG-PIM-M365-Ops"] },
    { name: "Password Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk"] },
    { name: "Cloud Device Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk"] },
    { name: "Microsoft Entra Joined Device Local Administrator", template: "Tier1", via: ["SG-PIM-M365-Helpdesk", "SG-PIM-M365-Ops"], note: "1.3 named it Azure AD Joined Device Local Administrator; Microsoft renamed it." },
    { name: "Hybrid Identity Administrator", template: "Tier1", via: [] },
    { name: "Directory Writers", template: "Tier1", via: [] },
    { name: "Identity Governance Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Lifecycle Workflows Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Service Support Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Edge Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops"] },
    { name: "Office Apps Administrator", template: "Tier1", via: ["SG-PIM-M365-Ops", "SG-PIM-M365-AppOps"] },
    { name: "Guest Inviter", template: "Tier1", via: ["SG-PIM-M365-Ops", "SG-PIM-M365-AppOps"] },
    { name: "Compliance Administrator", template: "Tier1", via: ["SG-PIM-M365-SecOps"] },
    { name: "Compliance Data Administrator", template: "Tier1", via: ["SG-PIM-M365-SecOps"] },
    { name: "Cloud App Security Administrator", template: "Tier1", via: ["SG-PIM-M365-SecOps"] },
    { name: "Security Operator", template: "Tier1", via: ["SG-PIM-M365-SecOps"] },
    // ---- Tier 2 ----
    { name: "Helpdesk Administrator", template: "Tier2", via: ["SG-PIM-M365-Helpdesk"], note: "Eight hours, as in 1.3: a shift, not a task." },
    { name: "Message Center Reader", template: "Tier2", via: ["SG-PIM-M365-Helpdesk", "SG-PIM-M365-Ops", "SG-PIM-M365-AppOps", "SG-PIM-M365-SecOps"] },
    // ---- Readers ----
    { name: "Global Reader", template: "Reader", via: ["SG-PIM-M365-SecOpsReader"] },
    { name: "Security Reader", template: "Reader", via: ["SG-PIM-M365-SecOpsReader"] },
    { name: "Directory Readers", template: "Reader", via: [], override: { AllowPermanentActiveAssignment: true }, note: "Permanent active allowed, as 1.3's Perm for all of IT." },
  ],
  // The privileged access groups: role-assignable security groups, PIM for
  // Groups on the Member role, each carrying the roles named in `roles`
  // above (derived, not repeated here). Azure groups carry an Azure RBAC
  // role at a scope; T48 lists them and exports them but does not compare
  // them yet (Azure Resource Manager is a different read).
  groups: [
    { name: "SG-PIM-M365-GlobalAdmin", scope: "m365", persona: "GOD mode", template: "GroupTier0", description: "Global Administrator, and nothing else. Approval, authentication context c1, two hours." },
    { name: "SG-PIM-M365-Tier0", scope: "m365", persona: "Tier 0", template: "GroupTier0", description: "Privileged Role Administrator and Privileged Authentication Administrator — the two roles that can make a Global Administrator." },
    { name: "SG-PIM-M365-SecOps", scope: "m365", persona: "Security Operations", template: "GroupTier1", description: "Manages the security configuration: Conditional Access, Defender, Purview, Cloud App Security, compliance." },
    { name: "SG-PIM-M365-SecOpsReader", scope: "m365", persona: "Security readers", template: "GroupTier2", description: "Reads the security configuration and reports; changes nothing." },
    { name: "SG-PIM-M365-Ops", scope: "m365", persona: "IT Operations", template: "GroupTier2", description: "Second line and system administration: users, groups, devices, Intune, the Microsoft 365 workloads." },
    { name: "SG-PIM-M365-Helpdesk", scope: "m365", persona: "Helpdesk", template: "GroupTier2", description: "First line: supports people with their accounts and their workplace." },
    { name: "SG-PIM-M365-AppOps", scope: "m365", persona: "Application Operators", template: "GroupTier2", description: "Keeps SharePoint, Exchange, Power Platform and the registered applications working." },
    { name: "SG-PIM-AZ-Tenant-Owner", scope: "azure", persona: "Azure tenant root", template: "GroupTier0", azure: { role: "Owner", scope: "Tenant Root Group" }, description: "Owner at the tenant root management group." },
    { name: "SG-PIM-AZ-Platform-Owner", scope: "azure", persona: "Platform", template: "GroupTier1", azure: { role: "Owner", scope: "Platform subscription" } },
    { name: "SG-PIM-AZ-Platform-Contributor", scope: "azure", persona: "Platform", template: "GroupTier2", azure: { role: "Contributor", scope: "Platform subscription" } },
    { name: "SG-PIM-AZ-Connectivity-Owner", scope: "azure", persona: "Connectivity", template: "GroupTier1", azure: { role: "Owner", scope: "Connectivity subscription" } },
    { name: "SG-PIM-AZ-Connectivity-Contributor", scope: "azure", persona: "Connectivity", template: "GroupTier2", azure: { role: "Contributor", scope: "Connectivity subscription" } },
    { name: "SG-PIM-AZ-Management-Owner", scope: "azure", persona: "Management", template: "GroupTier1", azure: { role: "Owner", scope: "Management subscription" } },
    { name: "SG-PIM-AZ-Management-Contributor", scope: "azure", persona: "Management", template: "GroupTier2", azure: { role: "Contributor", scope: "Management subscription" } },
    { name: "SG-PIM-AZ-LandingZone-Owner", scope: "azure", persona: "Landing zone", template: "GroupTier1", azure: { role: "Owner", scope: "Landing zone management group" } },
    { name: "SG-PIM-AZ-LandingZone-Contributor", scope: "azure", persona: "Landing zone", template: "GroupTier2", azure: { role: "Contributor", scope: "Landing zone management group" } },
    { name: "SG-PIM-AZ-Corp-Owner", scope: "azure", persona: "Corp landing zone", template: "GroupTier1", azure: { role: "Owner", scope: "Corp subscription" } },
    { name: "SG-PIM-AZ-Corp-Contributor", scope: "azure", persona: "Corp landing zone", template: "GroupTier2", azure: { role: "Contributor", scope: "Corp subscription" } },
    { name: "SG-PIM-AZ-Online-Owner", scope: "azure", persona: "Online landing zone", template: "GroupTier1", azure: { role: "Owner", scope: "Online subscription" } },
    { name: "SG-PIM-AZ-Online-Contributor", scope: "azure", persona: "Online landing zone", template: "GroupTier2", azure: { role: "Contributor", scope: "Online subscription" } },
  ],
  // Never touched by a deploy, never counted as drift: the break-glass
  // accounts (permanent Global Administrator, by design — see 🔒 Protect
  // exclusions in Workspace 01) and the Global Administrator group itself.
  protected: { pattern: "^(BG-|BreakGlass|Break-Glass|EmergencyAccess)", groups: ["SG-PIM-M365-GlobalAdmin"], description: "Break-glass accounts and SG-PIM-M365-GlobalAdmin are ProtectedUsers in the EasyPIM config: a delta or initial run leaves them alone." },
  // Outside PIM, still part of the framework — listed so the export and the
  // Help can say so, never compared.
  outside: [
    "Access reviews: every eligible assignment and every persona group reviewed yearly (1.3 asked for it on every row).",
    "Defender XDR, Intune and Purview RBAC: the Ops and Helpdesk role settings from 1.3 are workload RBAC, not Entra PIM.",
    "Azure RBAC: the SG-PIM-AZ-* groups are exported as GroupRoles policies; their Owner and Contributor assignments at subscription scope are Azure Resource Manager, not compared here yet.",
  ],
};
