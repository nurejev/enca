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
//   * NAMES. PIM-SG-<scope>-<persona or role> — solution first (PIM), then
//     the object kind (SG), then M365 or AZ as the scope; the same rule gives
//     AU-<region>-Users and INT-SG-<region>-Devices elsewhere in the
//     framework. The old PIM-SEC-U-M365-IT_Ops_M365 becomes PIM-SG-M365-Ops.
//     (The first cut of 2.0, 24 Sep, said SG-PIM-; renamed the next day.)
//     Exact match: a tenant carries the framework when it carries these names.
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
//     PIM-SG-M365-Tier0 with Tier0 settings, beside the Global Administrator
//     group, and nowhere else.
//   * APPROVAL ONLY WHERE AN APPROVER IS NAMED. Tier0 roles and the two Tier
//     0 groups need PIM-SG-Approvers; SecOps (Security and Conditional
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
// PROFILES AND REGIONS (build 32413). One framework, three sizes — the
// catalog carries PROFILES: `small` (four persona groups, approval only on
// the Global Administrator group, no administrative units) and `multi`
// (the whole group set plus one REGION TEMPLATE instantiated per row of a
// customer's regions.csv: three administrative units, two persona groups and
// an approver group, AU-scoped eligibilities, the Intune scope groups, tag and
// role assignments). Regions are never in the catalog — the file is the
// customer's — only the template is. `large` (one region, teams instead of
// regions) is designed and follows. cloudfellows.dev carries every profile's
// objects and two demo regions (EU-NL, EU-DE) so each has a real reference.
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
  revised: "2026-09-25",
  tenant: "cloudfellows.dev",
  source: "bundled",
  lineage: "Dovilo PIM framework v1.3 (25 Aug 2024) → CloudFellows PIM framework 2.0 (24 Sep 2026)",
  // Names the framework depends on beside the groups. The approver group
  // is a plain security group (not role-assignable, not PIM-managed): its
  // members approve, they hold nothing. The mailbox is a shared mailbox in
  // the tenant's own domain.
  approvers: { name: "PIM-SG-Approvers", description: "Approves Tier 0 and SecOps activations. Plain security group, members from IT and Security; never role-assignable." },
  notifications: { mailbox: "pim-alerts", description: "Shared mailbox pim-alerts@<tenant domain> receives every PIM alert (eligible, active and activation), so the audit trail has one inbox." },
  authContext: { id: "c1", name: "PIM Tier 0 activation", description: "Authentication context c1 is required to activate a Tier 0 role or group. The Conditional Access policy that gates c1 (phishing-resistant MFA, compliant device) lives in Workspace 01." },
  // Exact-match naming contract. A tenant's group counts as the framework's
  // only under this exact name (no prefixes, no suffixes, no version).
  naming: { pattern: "^PIM-SG-(M365|AZ)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$", example: "PIM-SG-M365-Ops · PIM-SG-AZ-Platform-Owner" },
  // Templates: one set of PIM settings, named. Keys follow EasyPIM's
  // PolicyTemplates so the export is a copy, not a translation.
  templates: {
    Tier0: {
      description: "Can make or unmake a Global Administrator, or switch the tenant's security policy off. Two hours, justification, authentication context c1, approval by PIM-SG-Approvers, eligibility one year, nothing permanent.",
      ActivationDuration: "PT2H",
      ActivationRequirement: "Justification",
      AuthenticationContext_Enabled: true,
      AuthenticationContext_Value: "c1",
      ApprovalRequired: true,
      Approvers: ["PIM-SG-Approvers"],
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
      description: "The Global Administrator and Tier 0 groups: two hours, justification, authentication context c1, approval by PIM-SG-Approvers.",
      ActivationDuration: "PT2H", ActivationRequirement: "Justification", AuthenticationContext_Enabled: true, AuthenticationContext_Value: "c1",
      ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    GroupTier1: {
      description: "SecOps and the Azure Owner groups: four hours, MFA and justification, approval by PIM-SG-Approvers.",
      ActivationDuration: "PT4H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
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
    { name: "Global Administrator", template: "Tier0", via: ["PIM-SG-M365-GlobalAdmin"], override: { ActivationDuration: "PT1H" }, note: "One hour, as in 1.3. The break-glass accounts hold it permanently and are protected." },
    { name: "Privileged Role Administrator", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "Moved out of SecOps in 2.0: it assigns roles, including Global Administrator." },
    { name: "Privileged Authentication Administrator", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "Moved out of Ops in 2.0: it resets a Global Administrator's authentication methods." },
    { name: "Conditional Access Administrator", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "Can switch every Conditional Access policy off — approval, as in 1.3." },
    { name: "Security Administrator", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "Manages Conditional Access and Defender — approval, as in 1.3." },
    // ---- Tier 1 ----
    { name: "Exchange Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "SharePoint Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Teams Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Intune Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Application Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Cloud Application Administrator", template: "Tier1", via: ["PIM-SG-M365-AppOps"] },
    { name: "Application Developer", template: "Tier1", via: ["PIM-SG-M365-AppOps"] },
    { name: "Power Platform Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Authentication Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"] },
    { name: "Authentication Policy Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "User Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"] },
    { name: "Groups Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk"] },
    { name: "License Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"] },
    { name: "Password Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk"] },
    { name: "Cloud Device Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk"] },
    { name: "Microsoft Entra Joined Device Local Administrator", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"], note: "1.3 named it Azure AD Joined Device Local Administrator; Microsoft renamed it." },
    { name: "Hybrid Identity Administrator", template: "Tier1", via: [] },
    { name: "Directory Writers", template: "Tier1", via: [] },
    { name: "Identity Governance Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Lifecycle Workflows Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Service Support Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Edge Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Office Apps Administrator", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Guest Inviter", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Compliance Administrator", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    { name: "Compliance Data Administrator", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    { name: "Cloud App Security Administrator", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    { name: "Security Operator", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    // ---- Tier 2 ----
    { name: "Helpdesk Administrator", template: "Tier2", via: ["PIM-SG-M365-Helpdesk"], note: "Eight hours, as in 1.3: a shift, not a task." },
    { name: "Message Center Reader", template: "Tier2", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops", "PIM-SG-M365-AppOps", "PIM-SG-M365-SecOps"] },
    // ---- Readers ----
    { name: "Global Reader", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"] },
    { name: "Security Reader", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"] },
    { name: "Directory Readers", template: "Reader", via: [], override: { AllowPermanentActiveAssignment: true }, note: "Permanent active allowed, as 1.3's Perm for all of IT." },
  ],
  // The privileged access groups: role-assignable security groups, PIM for
  // Groups on the Member role, each carrying the roles named in `roles`
  // above (derived, not repeated here). Azure groups carry an Azure RBAC
  // role at a scope; T48 lists them and exports them but does not compare
  // them yet (Azure Resource Manager is a different read).
  groups: [
    { name: "PIM-SG-M365-GlobalAdmin", scope: "m365", persona: "GOD mode", template: "GroupTier0", description: "Global Administrator, and nothing else. Approval, authentication context c1, two hours." },
    { name: "PIM-SG-M365-Tier0", scope: "m365", persona: "Tier 0", template: "GroupTier0", description: "Privileged Role Administrator and Privileged Authentication Administrator — the two roles that can make a Global Administrator." },
    { name: "PIM-SG-M365-SecOps", scope: "m365", persona: "Security Operations", template: "GroupTier1", description: "Manages the security configuration: Conditional Access, Defender, Purview, Cloud App Security, compliance." },
    { name: "PIM-SG-M365-SecOpsReader", scope: "m365", persona: "Security readers", template: "GroupTier2", description: "Reads the security configuration and reports; changes nothing." },
    { name: "PIM-SG-M365-Ops", scope: "m365", persona: "IT Operations", template: "GroupTier2", description: "Second line and system administration: users, groups, devices, Intune, the Microsoft 365 workloads." },
    { name: "PIM-SG-M365-Helpdesk", scope: "m365", persona: "Helpdesk", template: "GroupTier2", description: "First line: supports people with their accounts and their workplace." },
    { name: "PIM-SG-M365-AppOps", scope: "m365", persona: "Application Operators", template: "GroupTier2", description: "Keeps SharePoint, Exchange, Power Platform and the registered applications working." },
    { name: "PIM-SG-AZ-Tenant-Owner", scope: "azure", persona: "Azure tenant root", template: "GroupTier0", azure: { role: "Owner", scope: "Tenant Root Group" }, description: "Owner at the tenant root management group." },
    { name: "PIM-SG-AZ-Platform-Owner", scope: "azure", persona: "Platform", template: "GroupTier1", azure: { role: "Owner", scope: "Platform subscription" } },
    { name: "PIM-SG-AZ-Platform-Contributor", scope: "azure", persona: "Platform", template: "GroupTier2", azure: { role: "Contributor", scope: "Platform subscription" } },
    { name: "PIM-SG-AZ-Connectivity-Owner", scope: "azure", persona: "Connectivity", template: "GroupTier1", azure: { role: "Owner", scope: "Connectivity subscription" } },
    { name: "PIM-SG-AZ-Connectivity-Contributor", scope: "azure", persona: "Connectivity", template: "GroupTier2", azure: { role: "Contributor", scope: "Connectivity subscription" } },
    { name: "PIM-SG-AZ-Management-Owner", scope: "azure", persona: "Management", template: "GroupTier1", azure: { role: "Owner", scope: "Management subscription" } },
    { name: "PIM-SG-AZ-Management-Contributor", scope: "azure", persona: "Management", template: "GroupTier2", azure: { role: "Contributor", scope: "Management subscription" } },
    { name: "PIM-SG-AZ-LandingZone-Owner", scope: "azure", persona: "Landing zone", template: "GroupTier1", azure: { role: "Owner", scope: "Landing zone management group" } },
    { name: "PIM-SG-AZ-LandingZone-Contributor", scope: "azure", persona: "Landing zone", template: "GroupTier2", azure: { role: "Contributor", scope: "Landing zone management group" } },
    { name: "PIM-SG-AZ-Corp-Owner", scope: "azure", persona: "Corp landing zone", template: "GroupTier1", azure: { role: "Owner", scope: "Corp subscription" } },
    { name: "PIM-SG-AZ-Corp-Contributor", scope: "azure", persona: "Corp landing zone", template: "GroupTier2", azure: { role: "Contributor", scope: "Corp subscription" } },
    { name: "PIM-SG-AZ-Online-Owner", scope: "azure", persona: "Online landing zone", template: "GroupTier1", azure: { role: "Owner", scope: "Online subscription" } },
    { name: "PIM-SG-AZ-Online-Contributor", scope: "azure", persona: "Online landing zone", template: "GroupTier2", azure: { role: "Contributor", scope: "Online subscription" } },
  ],
  // Small-business Azure groups: one or two subscriptions, no landing zone.
  // Listed here so the baseline tenant carries them; only the small profile
  // compares them (profiles[].groups picks).
  groupsSmall: [
    { name: "PIM-SG-AZ-Sub-Owner", scope: "azure", persona: "Subscription owner", template: "GroupTier1", azure: { role: "Owner", scope: "the subscription(s)" }, description: "Owner on the business's subscription(s); approval, four hours." },
    { name: "PIM-SG-AZ-Sub-Contributor", scope: "azure", persona: "Subscription contributor", template: "GroupTier2", azure: { role: "Contributor", scope: "the subscription(s)" }, description: "Contributor on the subscription(s); eight hours, no approval." },
  ],
  // ---- PROFILES ------------------------------------------------------
  // The same tiers, roles and names; a profile picks the groups a tenant of
  // that size keeps, folds the others' roles into them (`merge`), and carries
  // the few template settings that change with size. PimBaseline.profile()
  // derives the catalog T48 compares against.
  profiles: {
    small: {
      label: "Small business",
      size: "25 to 250 people, two to six in IT",
      description: "Four persona groups instead of seven; approval only on the Global Administrator group, where two admins can always give it; Tier 0 roles activate with justification, authentication context c1 and an alert; Tier 1 and 2 alert on critical events only; three Azure groups, made only when there is Azure. Two hours on Global Administrator.",
      groups: ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-SecOps", "PIM-SG-M365-Ops", "PIM-SG-M365-SecOpsReader", "PIM-SG-AZ-Tenant-Owner", "PIM-SG-AZ-Sub-Owner", "PIM-SG-AZ-Sub-Contributor"],
      merge: { "PIM-SG-M365-Tier0": "PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-Helpdesk": "PIM-SG-M365-Ops", "PIM-SG-M365-AppOps": "PIM-SG-M365-Ops" },
      templates: {
        Tier0: { ApprovalRequired: false, Approvers: [], description: "Two hours, justification, authentication context c1, alert on every activation — no approval: the gate is the GlobalAdmin group's." },
        Tier1: { Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] } },
        GroupTier1: { ApprovalRequired: false, Approvers: [], description: "SecOps and the subscription Owner group: four hours, MFA and justification, no approval." },
      },
      roles: { "Global Administrator": { override: { ActivationDuration: "PT2H" }, note: "Two hours in the small profile: the GA does real work here, and the gate is c1 plus the group's approval, not the clock." } },
      regions: false,
      rmau: [],
      intune: {
        assignments: [
          { name: "INT-RBAC-Ops-All", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-M365-Ops"], scope: "all users and devices", tags: [] },
          { name: "INT-RBAC-HelpDesk-All", roles: ["Help Desk Operator"], members: ["PIM-SG-M365-Ops"], scope: "all users and devices", tags: [] },
          { name: "INT-RBAC-SecOps-All", roles: ["Endpoint Security Manager"], members: ["PIM-SG-M365-SecOps"], scope: "all devices", tags: [] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: [] },
        ],
        customRoles: [],
        switches: ["Allow access to unlicensed admins"],
      },
    },
    multi: {
      label: "Large · multi-region",
      size: "several regions, central IT plus local IT per region",
      description: "The whole group set at the centre (Tier 0, SecOps, Ops, AppOps, Helpdesk, the readers, the Azure landing-zone groups) and, per region from the customer's regions.csv: three administrative units, a Helpdesk and an Ops persona group with eligibilities scoped to the region's units, an approver group, and the Intune scope groups, tag and role assignments. Every adm- account and every PIM-SG group sits in the restricted management unit AU-RM-Admins.",
      groups: null,
      merge: {},
      templates: {},
      roles: {},
      regions: true,
      rmau: [{ name: "AU-RM-Admins", restricted: true, holds: "every adm- account and every PIM-SG group; Tier 0 (PIM-SG-M365-Tier0) User Administrator on it so they can still be managed" }],
      intune: {
        assignments: [
          { name: "INT-RBAC-PolicyProfile-Central", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-M365-Ops"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-SecOps-Central", roles: ["Endpoint Security Manager"], members: ["PIM-SG-M365-SecOps"], scope: "all devices", tags: ["default"] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: ["every"] },
        ],
        customRoles: ["INT-ROLE-Regional-Ops"],
        switches: ["Allow access to unlicensed admins", "Scoped permissions (preview): run the Permissions Assessment Report first; the switch is one-way"],
      },
    },
  },
  // ---- REGIONS: the template, never the regions ------------------------
  // <REG> is the row's code; <attribute>, <value>, <devicePrefix>,
  // <autopilotTag>, <itLead> and <approvers> come from the same row.
  regions: {
    file: "regions.csv",
    columns: ["code", "name", "attribute", "value", "devicePrefix", "autopilotTag", "itLead", "approvers", "timezone"],
    required: ["code", "name"],
    defaults: { attribute: "extensionAttribute1", value: "<code>", devicePrefix: "<last segment of code>-", autopilotTag: "<code>" },
    example: [
      "code,name,attribute,value,devicePrefix,autopilotTag,itLead,approvers,timezone",
      "EU-NL,Netherlands,extensionAttribute1,EU-NL,NL-,EU-NL,it-lead-nl@contoso.nl,\"a@contoso.nl;b@contoso.nl\",Europe/Amsterdam",
      "EU-DE,Germany,extensionAttribute1,EU-DE,DE-,EU-DE,it-lead-de@contoso.nl,\"c@contoso.nl;d@contoso.nl\",Europe/Berlin",
    ].join("\n"),
    codePattern: "^[A-Z]{2,5}(-[A-Z0-9]{2,6}){1,2}$",
    template: {
      aus: [
        { name: "AU-<REG>-Users", kind: "dynamic", type: "user", rule: "(user.<attribute> -eq \"<value>\")", note: "P1 per member; one object type per dynamic unit" },
        { name: "AU-<REG>-Devices", kind: "dynamic", type: "device", rule: "(device.<attribute> -eq \"<value>\") -or (device.displayName -startsWith \"<devicePrefix>\")", note: "the naming prefix is the second rule for devices without the attribute" },
        { name: "AU-<REG>-Groups", kind: "assigned", type: "group", note: "dynamic units cannot hold groups; the region adds its own" },
      ],
      groups: [
        { name: "PIM-SG-<REG>-Helpdesk", persona: "Regional first line", template: "GroupTier2", roleAssignable: true, description: "Password, authentication, licence for the region's people — never for an admin." },
        { name: "PIM-SG-<REG>-Ops", persona: "Regional second line", template: "GroupTier2", roleAssignable: true, description: "Users, groups and devices of the region; Intune through INT-ROLE-Regional-Ops." },
        { name: "PIM-SG-<REG>-Approvers", persona: "Regional approvers", template: null, roleAssignable: false, members: "<approvers>", description: "Plain group: the regional IT lead and one central Ops; approves the region's Ops activations when the customer wants a gate." },
      ],
      // Eligible role assignments at AU scope — only roles Entra can scope
      // to an administrative unit (Microsoft Learn, September 2026).
      eligibilities: [
        { role: "Helpdesk Administrator", group: "PIM-SG-<REG>-Helpdesk", au: "AU-<REG>-Users" },
        { role: "Password Administrator", group: "PIM-SG-<REG>-Helpdesk", au: "AU-<REG>-Users" },
        { role: "Authentication Administrator", group: "PIM-SG-<REG>-Helpdesk", au: "AU-<REG>-Users" },
        { role: "License Administrator", group: "PIM-SG-<REG>-Helpdesk", au: "AU-<REG>-Users" },
        { role: "User Administrator", group: "PIM-SG-<REG>-Ops", au: "AU-<REG>-Users" },
        { role: "Groups Administrator", group: "PIM-SG-<REG>-Ops", au: "AU-<REG>-Groups" },
        { role: "Teams Administrator", group: "PIM-SG-<REG>-Ops", au: "AU-<REG>-Groups" },
        { role: "Cloud Device Administrator", group: "PIM-SG-<REG>-Ops", au: "AU-<REG>-Devices" },
      ],
      intune: {
        tag: { name: "INT-TAG-<REG>", autoAssignFrom: "INT-SG-DEV-<REG>-All" },
        groups: [
          { name: "INT-SG-USR-<REG>-All", type: "user", rule: "(user.<attribute> -eq \"<value>\") -and (user.accountEnabled -eq true)" },
          { name: "INT-SG-DEV-<REG>-All", type: "device", rule: "(device.enrollmentProfileName -startsWith \"<autopilotTag>\") -or (device.displayName -startsWith \"<devicePrefix>\")" },
        ],
        assignments: [
          { name: "INT-RBAC-HelpDesk-<REG>", roles: ["Help Desk Operator"], members: ["PIM-SG-<REG>-Helpdesk"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
          { name: "INT-RBAC-Ops-<REG>", roles: ["INT-ROLE-Regional-Ops"], members: ["PIM-SG-<REG>-Ops"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
        ],
        autopilot: { profile: "Autopilot · <REG>", naming: "<devicePrefix>%SERIAL%", groupTag: "<autopilotTag>" },
      },
      review: { name: "Access review · <REG>", scope: "PIM-SG-<REG>-Helpdesk, PIM-SG-<REG>-Ops", reviewer: "<itLead>", cadence: "yearly" },
    },
  },
  // ---- INTUNE RBAC: the one custom role -------------------------------
  // Policy and Profile Manager authors tenant-wide; a regional second line
  // acts on its devices and assigns central policies to its groups, and
  // cannot author. Resource actions as Intune names them
  // (deviceManagement/resourceOperations); the script drops any the tenant
  // does not know and says so.
  intuneRoles: [
    { name: "INT-ROLE-Regional-Ops", description: "CloudFellows PIM framework: regional second line. Act on the region's devices, assign central policies and apps to the region's groups; never author a policy, never touch roles, tags or tenant settings.",
      allowed: [
        "Microsoft.Intune_ManagedDevices_Read", "Microsoft.Intune_ManagedDevices_Update", "Microsoft.Intune_ManagedDevices_Delete", "Microsoft.Intune_ManagedDevices_SetPrimaryUser", "Microsoft.Intune_ManagedDevices_ViewReports",
        "Microsoft.Intune_RemoteTasks_SyncDevice", "Microsoft.Intune_RemoteTasks_RebootNow", "Microsoft.Intune_RemoteTasks_SetDeviceName", "Microsoft.Intune_RemoteTasks_CollectDiagnostics", "Microsoft.Intune_RemoteTasks_Wipe", "Microsoft.Intune_RemoteTasks_Retire", "Microsoft.Intune_RemoteTasks_RotateBitLockerKeys", "Microsoft.Intune_RemoteTasks_RotateLocalAdminPassword", "Microsoft.Intune_RemoteTasks_RemoteLock", "Microsoft.Intune_RemoteTasks_LocateDevice", "Microsoft.Intune_RemoteTasks_EnableLostMode", "Microsoft.Intune_RemoteTasks_DisableLostMode",
        "Microsoft.Intune_DeviceConfigurations_Read", "Microsoft.Intune_DeviceConfigurations_ViewReports", "Microsoft.Intune_DeviceConfigurations_Assign",
        "Microsoft.Intune_DeviceCompliancePolices_Read", "Microsoft.Intune_DeviceCompliancePolices_ViewReports", "Microsoft.Intune_DeviceCompliancePolices_Assign",
        "Microsoft.Intune_MobileApps_Read", "Microsoft.Intune_MobileApps_ViewReports", "Microsoft.Intune_MobileApps_Assign", "Microsoft.Intune_ManagedApps_Read",
        "Microsoft.Intune_EnrollmentProgram_Read", "Microsoft.Intune_EnrollmentProgram_SyncDevice",
        "Microsoft.Intune_AuditData_Read", "Microsoft.Intune_Organization_Read", "Microsoft.Intune_TermsAndConditions_Read",
      ],
      notAllowed: ["create, update or delete any policy, profile, app, script, filter, compliance or endpoint security policy", "roles, scope tags, role assignments", "tenant settings: enrollment restrictions, MDM authority, connectors"] },
  ],
  // Never touched by a deploy, never counted as drift: the break-glass
  // accounts (permanent Global Administrator, by design — see 🔒 Protect
  // exclusions in Workspace 01) and the Global Administrator group itself.
  protected: { pattern: "^(BG-|BGA\\b|BreakGlass|Break-Glass|EmergencyAccess)", groups: ["PIM-SG-M365-GlobalAdmin"], description: "Break-glass accounts and PIM-SG-M365-GlobalAdmin are ProtectedUsers in the EasyPIM config: a delta or initial run leaves them alone." },
  // Outside PIM, still part of the framework — listed so the export and the
  // Help can say so, never compared.
  outside: [
    "Access reviews: every eligible assignment and every persona group reviewed yearly (1.3 asked for it on every row).",
    "Intune RBAC is part of the framework (the profiles' assignments, the region template's tags and scope groups, INT-ROLE-Regional-Ops) and is created by the scripts; T53 reads it. Defender XDR and Purview RBAC stay outside on purpose.",
    "Azure RBAC: the PIM-SG-AZ-* groups are exported as GroupRoles policies; their Owner and Contributor assignments at subscription scope are Azure Resource Manager, not compared here yet.",
  ],
};
