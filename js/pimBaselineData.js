// ======================================================================
// 🧬 PIM baseline — the CloudFellows PIM framework, release 2.1
// (js/pimBaselineData.js, T48, build 32408 → 32416, R68)
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
// THE ACTIVATION MODEL (2.1, 25 Sep 2026, after the reliability review).
// Microsoft offers two ways to make a group of people eligible for an Entra
// role: active membership of a group that is ELIGIBLE for the role, or
// eligible membership of a group that holds the role ACTIVE. 2.0 mixed the
// two (eligible membership AND eligible roles: two activations) while its
// notes promised one. 2.1 takes the first, which Microsoft recommends for
// the Exchange, SharePoint and Purview roles Ops, AppOps and SecOps carry:
//   * persona groups (PIM-SG-M365-*, PIM-SG-AZ-*, PIM-SG-<REG>-Helpdesk/Ops)
//     have ACTIVE members, assigned by an administrator with a justification
//     for at most a year (template GroupMember — the yearly review, by the
//     calendar); nobody is made an eligible member;
//   * each group is ELIGIBLE for its roles; a person activates the role they
//     need, under that role's tier (Tier0: context c1 and approval), so the
//     role's own settings are the gate — never a weaker group setting;
//   * nothing holds a role permanently active except Directory Readers and
//     the break-glass accounts.
// Intune has no PIM of its own, so its role assignments name separate access
// groups with ELIGIBLE membership (PIM-SG-INT-*, template GroupJIT): there
// the group activation is the gate. SecOpsReader is the deliberate exception:
// its active members hold the Read Only Operator assignment standing.
//
// PROTECTION (2.1). Role-assignable groups already protect themselves and
// their members: only Privileged Role Administrators, Global Administrators
// and owners change membership, and only Privileged Authentication
// Administrators reset a member's credentials. So no PIM-SG group and no
// adm- account is put in a restricted management AU — Microsoft blocks PIM,
// access reviews and lifecycle workflows on objects there, and a role-
// assignable group inside one can no longer have its membership changed.
// Restricted AUs stay for executives and sensitive groups that are not
// role-assignable (T27, by hand). Break-glass accounts are protected by
// explicit object id, never by a name pattern (the pattern only suggests).
//
// PROFILES AND REGIONS (build 32413, large in 32416). One framework, three
// sizes — the catalog carries PROFILES: `small` (four persona groups,
// approval only on the Global Administrator group, no administrative
// units), `large` (one region, teams instead of regions: Identity,
// Workplace, Collaboration, Apps, a service desk and a VIP desk, Audit;
// ticketing on Tier 0 and 1, approvers PIM-SG-Approvers-Tier0) and `multi`
// (the whole group set plus one REGION TEMPLATE instantiated per row of a
// customer's regions.csv: three administrative units, two persona groups and
// an approver group, AU-scoped eligibilities, two Intune access groups, the
// Intune scope groups, tag and role assignments). Regions are never in the
// catalog — the file is the customer's — only the template is.
// cloudfellows.dev carries every profile's objects and two demo regions
// (EU-NL, EU-DE) so each has a real reference.
//
// HOW IT IS READ AND WRITTEN. js/pimbaseline.js turns each role into
// expected settings (template + override), reads the tenant's
// roleManagementPolicies and compares setting by setting, matching by object
// id at tenant scope; groups are compared as a model — present,
// role-assignable, carrying the roles listed, their membership policy —
// never by members. The same module writes the catalog out as an
// EasyPIM.Orchestrator config (PolicyTemplates → EntraRoles.Policies →
// GroupRoles.Policies → Assignments.EntraRoles → ProtectedUsers) and one
// commented sample per profile (tools/pim/samples, made by
// tools/pim/generate.cjs). tools/pim/New-PimBaseline.ps1 and
// New-PimRegions.ps1 write it to a tenant: they plan from reads only, and
// apply exactly an approved plan file (tools/pim/PimCommon.psm1).
//
// PLAIN TEXT in every string here — the notes render escaped.
// ======================================================================
const PIM_BASELINE = {
  id: "cloudfellows-pim",
  label: "CloudFellows PIM framework",
  icon: "🧬",
  release: "2.1",
  revised: "2026-09-25",
  tenant: "cloudfellows.dev",
  source: "bundled",
  lineage: "Dovilo PIM framework v1.3 (25 Aug 2024) → CloudFellows PIM framework 2.0 (24 Sep 2026) → 2.1 (25 Sep 2026: active membership + eligible roles, Intune through eligible access groups, no PIM groups in restricted AUs)",
  // Names the framework depends on beside the groups. The approver group
  // is a plain security group (not role-assignable, not PIM-managed): its
  // members approve, they hold nothing. The mailbox is a shared mailbox in
  // the tenant's own domain.
  approvers: { name: "PIM-SG-Approvers", description: "Approves Tier 0 and SecOps activations. Plain security group, members from IT and Security; never role-assignable." },
  notifications: { mailbox: "pim-alerts", description: "Shared mailbox pim-alerts@<tenant domain> receives every PIM alert (eligible, active and activation), so the audit trail has one inbox." },
  authContext: { id: "c1", name: "PIM Tier 0 activation", description: "Authentication context c1 is required to activate a Tier 0 role. GroupMember and GroupJIT do not require c1. The Conditional Access policy that gates c1 (phishing-resistant MFA, compliant device) lives in Workspace 01." },
  // Exact-match naming contract. A tenant's group counts as the framework's
  // only under this exact name (no prefixes, no suffixes, no version).
  naming: { pattern: "^PIM-SG-(M365|AZ|INT)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$", example: "PIM-SG-M365-Ops · PIM-SG-AZ-Platform-Owner · PIM-SG-INT-Ops" },
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
    // PIM for Groups, the Member role. GroupMember is for the persona groups:
    // membership is ACTIVE, assigned by an administrator for at most a year;
    // the activation settings only guard against somebody being made an
    // eligible member anyway (approval, MFA, justification, one hour).
    GroupMember: {
      description: "Persona group membership: active, assigned by an administrator with a justification for at most a year (the yearly review); never permanent. Eligible membership is not used — should somebody be made eligible anyway, activation asks MFA, justification and approval by PIM-SG-Approvers, for one hour.",
      ActivationDuration: "PT1H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P365D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    // GroupJIT is for the Intune access groups (PIM-SG-INT-*): Intune has no
    // PIM, so membership is ELIGIBLE and the activation is the gate.
    GroupJIT: {
      description: "Intune access group: eligible membership for at most a year; activation for a shift (eight hours) with MFA and justification; an active assignment by an administrator lasts at most 30 days; nothing permanent.",
      ActivationDuration: "PT8H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: false, Approvers: [], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
  },
  // Entra roles under the framework, by their exact Microsoft display names
  // (2026). `templateId` is the built-in role's template id — what the
  // scripts and the comparison match on: Microsoft renames roles, the id
  // stays, and a tenant can still carry a former name (`formerNames`). `via` names the persona groups that carry the role — the model
  // the group comparison checks. `override` is the one exception to the
  // template, written the same way EasyPIM writes an inline setting.
  roles: [
    // ---- Tier 0 ----
    { name: "Global Administrator", templateId: "62e90394-69f5-4237-9190-012177145e10", template: "Tier0", via: ["PIM-SG-M365-GlobalAdmin"], override: { ActivationDuration: "PT1H" }, note: "One hour, as in 1.3. The break-glass accounts hold it permanently and are protected." },
    { name: "Privileged Role Administrator", templateId: "e8611ab8-c189-46e8-94e1-60213ab1f814", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "Moved out of SecOps in 2.0: it assigns roles, including Global Administrator." },
    { name: "Privileged Authentication Administrator", templateId: "7be44c8a-adaf-4e2a-84d6-ab2649e08a13", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "Moved out of Ops in 2.0: it resets a Global Administrator's authentication methods." },
    { name: "Conditional Access Administrator", templateId: "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "Can switch every Conditional Access policy off — approval, as in 1.3." },
    { name: "Security Administrator", templateId: "194ae4cb-b126-40b2-bd5b-6091b380977d", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "Manages Conditional Access and Defender — approval, as in 1.3." },
    // ---- Tier 1 ----
    { name: "Exchange Administrator", templateId: "29232cdf-9323-42fd-ade2-1d097af3e4de", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "SharePoint Administrator", templateId: "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Teams Administrator", templateId: "69091246-20e8-4a56-aa4d-066075b2a7a8", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Intune Administrator", templateId: "3a2c62db-5318-420d-8d74-23affee5d9d5", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Application Administrator", templateId: "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Cloud Application Administrator", templateId: "158c047a-c907-4556-b7ef-446551a6b5f7", template: "Tier1", via: ["PIM-SG-M365-AppOps"] },
    { name: "Application Developer", templateId: "cf1c38e5-3621-4004-a7cb-879624dced7c", template: "Tier1", via: ["PIM-SG-M365-AppOps"] },
    { name: "Power Platform Administrator", templateId: "11648597-926c-4cf3-9c36-bcebb0ba8dcc", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Authentication Administrator", templateId: "c4e39bd9-1100-46d3-8c65-fb160da0071f", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"] },
    { name: "Authentication Policy Administrator", templateId: "0526716b-113d-4c15-b2c8-68e3c22b9f80", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "User Administrator", templateId: "fe930be7-5e62-47db-91af-98c3a49a38b1", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"] },
    { name: "Groups Administrator", templateId: "fdd7a751-b60b-444a-984c-02652fe8fa1c", template: "Tier1", via: ["PIM-SG-M365-Helpdesk"] },
    { name: "License Administrator", templateId: "4d6ac14f-3453-41d0-bef9-a3e0c569773a", template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"] },
    { name: "Password Administrator", templateId: "966707d0-3269-4727-9be2-8c3a10f19b9d", template: "Tier1", via: ["PIM-SG-M365-Helpdesk"] },
    { name: "Cloud Device Administrator", templateId: "7698a772-787b-4ac8-901f-60d6b08affd2", template: "Tier1", via: ["PIM-SG-M365-Helpdesk"] },
    { name: "Microsoft Entra Joined Device Local Administrator", templateId: "9f06204d-73c1-4d4c-880a-6edb90606fd8", formerNames: ["Azure AD Joined Device Local Administrator"], template: "Tier1", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops"], note: "1.3 named it Azure AD Joined Device Local Administrator; Microsoft renamed it." },
    { name: "Hybrid Identity Administrator", templateId: "8ac3fc64-6eca-42ea-9e69-59f4c7b60eb2", template: "Tier1", via: [] },
    { name: "Directory Writers", templateId: "9360feb5-f418-4baa-8175-e2a00bac4301", template: "Tier1", via: [] },
    { name: "Identity Governance Administrator", templateId: "45d8d3c5-c802-45c6-b32a-1d70b5e1e86e", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Lifecycle Workflows Administrator", templateId: "59d46f88-662b-457b-bceb-5c3809e5908f", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Service Support Administrator", templateId: "f023fd81-a637-4b56-95fd-791ac0226033", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Edge Administrator", templateId: "3f1acade-1e04-4fbc-9b69-f0302cd84aef", template: "Tier1", via: ["PIM-SG-M365-Ops"] },
    { name: "Office Apps Administrator", templateId: "2b745bdf-0803-4d80-aa65-822c4493daac", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Guest Inviter", templateId: "95e79109-95c0-4d8e-aee3-d01accf2d47b", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Compliance Administrator", templateId: "17315797-102d-40b4-93e0-432062caca18", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    { name: "Compliance Data Administrator", templateId: "e6d1a23a-da11-4be4-9570-befc86d067a7", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    { name: "Cloud App Security Administrator", templateId: "892c5842-a9a6-463a-8041-72aa08ca3cf6", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    { name: "Security Operator", templateId: "5f2222b1-57c3-48ba-8ad5-d4759f1fde6f", template: "Tier1", via: ["PIM-SG-M365-SecOps"] },
    // ---- Tier 2 ----
    { name: "Helpdesk Administrator", templateId: "729827e3-9c14-49f7-bb1b-9608f156bbb8", template: "Tier2", via: ["PIM-SG-M365-Helpdesk"], note: "Eight hours, as in 1.3: a shift, not a task." },
    { name: "Message Center Reader", templateId: "790c1fb9-7f7d-4f88-86a1-ef1f95c05c1b", template: "Tier2", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops", "PIM-SG-M365-AppOps", "PIM-SG-M365-SecOps"] },
    // ---- Readers ----
    { name: "Global Reader", templateId: "f2ef992c-3afb-46b9-b7cf-a126ee74c451", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"] },
    { name: "Security Reader", templateId: "5d6b6bb7-de71-4623-b4af-96380a352509", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"] },
    { name: "Directory Readers", templateId: "88d8e3e3-8f55-4a1e-953a-9b9898b8876b", template: "Reader", via: [], override: { AllowPermanentActiveAssignment: true }, note: "Permanent active allowed, as 1.3's Perm for all of IT." },
  ],
  // The privileged access groups: role-assignable security groups, PIM for
  // Groups on the Member role, each carrying the roles named in `roles`
  // above (derived, not repeated here). Azure groups carry an Azure RBAC
  // role at a scope; T48 lists them and exports them but does not compare
  // them yet (Azure Resource Manager is a different read).
  groups: [
    { name: "PIM-SG-M365-GlobalAdmin", scope: "m365", persona: "GOD mode", template: "GroupMember", description: "Eligible for Global Administrator. The small model also maps Privileged Role Administrator and Privileged Authentication Administrator to this group. Activation uses each role's effective model policy; Global Administrator is two hours in small and one hour otherwise." },
    { name: "PIM-SG-M365-Tier0", scope: "m365", persona: "Tier 0", template: "GroupMember", description: "Privileged Role Administrator and Privileged Authentication Administrator — the roles that manage privileged role assignments and privileged authentication methods." },
    { name: "PIM-SG-M365-SecOps", scope: "m365", persona: "Security Operations", template: "GroupMember", description: "Manages the security configuration: Conditional Access, Defender, Purview, Cloud App Security, compliance." },
    { name: "PIM-SG-M365-SecOpsReader", scope: "m365", persona: "Security readers", template: "GroupMember", description: "Reads the security configuration and reports; changes nothing." },
    { name: "PIM-SG-M365-Ops", scope: "m365", persona: "IT Operations", template: "GroupMember", description: "Second line and system administration: users, groups, devices, Intune, the Microsoft 365 workloads." },
    { name: "PIM-SG-M365-Helpdesk", scope: "m365", persona: "Helpdesk", template: "GroupMember", description: "First line: supports people with their accounts and their workplace." },
    { name: "PIM-SG-M365-AppOps", scope: "m365", persona: "Application Operators", template: "GroupMember", description: "Keeps SharePoint, Exchange, Power Platform and the registered applications working." },
    // Intune access groups: eligible members, the group activation is the
    // gate (GroupJIT). The profiles' Intune assignments name them.
    { name: "PIM-SG-INT-Ops", scope: "intune", persona: "Intune operations", template: "GroupJIT", description: "Eligible members activate for a shift to act as Intune Policy and Profile Manager + Application Manager (central Workplace)." },
    { name: "PIM-SG-INT-HelpDesk", scope: "intune", persona: "Intune first line", template: "GroupJIT", description: "Eligible members activate to act as Intune Help Desk Operator." },
    { name: "PIM-SG-INT-SecOps", scope: "intune", persona: "Intune endpoint security", template: "GroupJIT", description: "Eligible members activate to act as Intune Endpoint Security Manager." },
    { name: "PIM-SG-AZ-Tenant-Owner", scope: "azure", persona: "Azure tenant root", template: "GroupMember", azure: { role: "Owner", scope: "Tenant Root Group" }, description: "Owner at the tenant root management group." },
    { name: "PIM-SG-AZ-Platform-Owner", scope: "azure", persona: "Platform", template: "GroupMember", azure: { role: "Owner", scope: "Platform subscription" } },
    { name: "PIM-SG-AZ-Platform-Contributor", scope: "azure", persona: "Platform", template: "GroupMember", azure: { role: "Contributor", scope: "Platform subscription" } },
    { name: "PIM-SG-AZ-Connectivity-Owner", scope: "azure", persona: "Connectivity", template: "GroupMember", azure: { role: "Owner", scope: "Connectivity subscription" } },
    { name: "PIM-SG-AZ-Connectivity-Contributor", scope: "azure", persona: "Connectivity", template: "GroupMember", azure: { role: "Contributor", scope: "Connectivity subscription" } },
    { name: "PIM-SG-AZ-Management-Owner", scope: "azure", persona: "Management", template: "GroupMember", azure: { role: "Owner", scope: "Management subscription" } },
    { name: "PIM-SG-AZ-Management-Contributor", scope: "azure", persona: "Management", template: "GroupMember", azure: { role: "Contributor", scope: "Management subscription" } },
    { name: "PIM-SG-AZ-LandingZone-Owner", scope: "azure", persona: "Landing zone", template: "GroupMember", azure: { role: "Owner", scope: "Landing zone management group" } },
    { name: "PIM-SG-AZ-LandingZone-Contributor", scope: "azure", persona: "Landing zone", template: "GroupMember", azure: { role: "Contributor", scope: "Landing zone management group" } },
    { name: "PIM-SG-AZ-Corp-Owner", scope: "azure", persona: "Corp landing zone", template: "GroupMember", azure: { role: "Owner", scope: "Corp subscription" } },
    { name: "PIM-SG-AZ-Corp-Contributor", scope: "azure", persona: "Corp landing zone", template: "GroupMember", azure: { role: "Contributor", scope: "Corp subscription" } },
    { name: "PIM-SG-AZ-Online-Owner", scope: "azure", persona: "Online landing zone", template: "GroupMember", azure: { role: "Owner", scope: "Online subscription" } },
    { name: "PIM-SG-AZ-Online-Contributor", scope: "azure", persona: "Online landing zone", template: "GroupMember", azure: { role: "Contributor", scope: "Online subscription" } },
  ],
  // Small-business Azure groups: one or two subscriptions, no landing zone.
  // Listed here so the baseline tenant carries them; only the small profile
  // compares them (profiles[].groups picks).
  groupsSmall: [
    { name: "PIM-SG-AZ-Sub-Owner", scope: "azure", persona: "Subscription owner", template: "GroupMember", azure: { role: "Owner", scope: "the subscription(s)" }, description: "Eligible for Owner on the business's subscription(s); the Azure role's own settings are the gate." },
    { name: "PIM-SG-AZ-Sub-Contributor", scope: "azure", persona: "Subscription contributor", template: "GroupMember", azure: { role: "Contributor", scope: "the subscription(s)" }, description: "Eligible for Contributor on the subscription(s)." },
  ],
  // Large one-region groups: Ops splits into the teams that own the
  // workloads, the desk gets a VIP variant, auditors their own readers.
  groupsLarge: [
    { name: "PIM-SG-M365-Identity", scope: "m365", persona: "Identity team", template: "GroupMember", description: "Users, groups, licences, authentication methods and policy, identity governance, lifecycle workflows." },
    { name: "PIM-SG-M365-Workplace", scope: "m365", persona: "Endpoint team", template: "GroupMember", description: "Intune, devices, the local administrator on joined devices, Edge." },
    { name: "PIM-SG-M365-Collab", scope: "m365", persona: "Messaging and collaboration", template: "GroupMember", description: "Exchange, SharePoint, Teams, Office apps, Power Platform, guest invitations." },
    { name: "PIM-SG-M365-Apps", scope: "m365", persona: "Applications", template: "GroupMember", description: "App registrations and enterprise applications only." },
    { name: "PIM-SG-M365-ServiceDesk", scope: "m365", persona: "Service desk", template: "GroupMember", description: "First line for everybody but admins and executives: passwords, authentication methods, licences." },
    { name: "PIM-SG-M365-ServiceDesk-VIP", scope: "m365", persona: "Service desk for executives", template: "GroupMember", description: "The named few who may help executives: the desk roles scoped to the optional AU-RM-Executives. Deploy can create the empty unit and scoped eligibilities; populate it only after testing the scoped administrators." },
    { name: "PIM-SG-M365-Audit", scope: "m365", persona: "Internal audit", template: "GroupMember", description: "Reads everything, changes nothing; its own review cadence." },
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
      description: "Four persona groups instead of seven; among Tier 0 roles, approval only on Global Administrator through customer-selected approvers; the other Tier 0 roles activate with justification, authentication context c1 and an alert; Tier 1 and Tier 2 activation alerts are Critical; assignment alerts remain All; Global Administrator for two hours; two Intune access groups; three Azure groups, made only when there is Azure.",
      groups: ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-SecOps", "PIM-SG-M365-Ops", "PIM-SG-M365-SecOpsReader", "PIM-SG-INT-Ops", "PIM-SG-INT-SecOps", "PIM-SG-AZ-Tenant-Owner", "PIM-SG-AZ-Sub-Owner", "PIM-SG-AZ-Sub-Contributor"],
      merge: { "PIM-SG-M365-Tier0": "PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-Helpdesk": "PIM-SG-M365-Ops", "PIM-SG-M365-AppOps": "PIM-SG-M365-Ops", "PIM-SG-INT-HelpDesk": "PIM-SG-INT-Ops" },
      templates: {
        Tier0: { ApprovalRequired: false, Approvers: [], description: "Two hours, justification, authentication context c1, alert on every activation — no approval, except on Global Administrator itself (its override)." },
        Tier1: { Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] } },
      },
      roles: { "Global Administrator": { override: { ActivationDuration: "PT2H", ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "Two hours and approval in the small profile: the GA does real work here; the gate is c1 plus approval by the other admins, not the clock." } },
      regions: false,
      rmau: [],
      intune: {
        assignments: [
          { name: "INT-RBAC-Ops-All", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: [] },
          { name: "INT-RBAC-HelpDesk-All", roles: ["Help Desk Operator"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: [] },
          { name: "INT-RBAC-SecOps-All", roles: ["Endpoint Security Manager"], members: ["PIM-SG-INT-SecOps"], scope: "all devices", tags: [] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: [], note: "Read only: standing through the readers' active membership, like Directory Readers." },
        ],
        customRoles: [],
        switches: ["Allow access to unlicensed admins"],
      },
    },
    large: {
      label: "Large · one region",
      size: "one country, several IT teams, a service desk, an ITSM tool",
      description: "The teams own their roles: Ops becomes Identity, Workplace and Collab, AppOps becomes Apps, the desk gets a VIP variant for executives, auditors their own readers. Ticketing on Tier 0 and Tier 1 activations; Tier 0 approval by a rota of three (PIM-SG-Approvers-Tier0); executives in the restricted AU AU-RM-Executives, filled by hand. No administrative units per region.",
      groups: ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-Tier0", "PIM-SG-M365-SecOps", "PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Audit", "PIM-SG-M365-Identity", "PIM-SG-M365-Workplace", "PIM-SG-M365-Collab", "PIM-SG-M365-Apps", "PIM-SG-M365-ServiceDesk", "PIM-SG-M365-ServiceDesk-VIP", "PIM-SG-INT-Ops", "PIM-SG-INT-HelpDesk", "PIM-SG-INT-SecOps", "PIM-SG-AZ-Tenant-Owner", "PIM-SG-AZ-Platform-Owner", "PIM-SG-AZ-Platform-Contributor", "PIM-SG-AZ-Connectivity-Owner", "PIM-SG-AZ-Connectivity-Contributor", "PIM-SG-AZ-Management-Owner", "PIM-SG-AZ-Management-Contributor", "PIM-SG-AZ-LandingZone-Owner", "PIM-SG-AZ-LandingZone-Contributor", "PIM-SG-AZ-Corp-Owner", "PIM-SG-AZ-Corp-Contributor", "PIM-SG-AZ-Online-Owner", "PIM-SG-AZ-Online-Contributor"],
      merge: {},
      approvers: "PIM-SG-Approvers-Tier0",
      templates: {
        Tier0: { ActivationRequirement: "Justification,Ticketing", Approvers: ["PIM-SG-Approvers-Tier0"], description: "Two hours (Global Administrator one), justification and a ticket, authentication context c1, approval by the Tier 0 rota." },
        Tier1: { ActivationRequirement: "MultiFactorAuthentication,Justification,Ticketing", description: "Two hours, MFA, justification and a ticket, no approval; ticket information is required but is not validated against an ITSM system." },
        GroupMember: { Approvers: ["PIM-SG-Approvers-Tier0"] },
      },
      // Where a role lands when Ops splits into teams (the rest keep `via`).
      roles: {
        "User Administrator": { via: ["PIM-SG-M365-Identity"] },
        "Groups Administrator": { via: ["PIM-SG-M365-Identity"] },
        "License Administrator": { via: ["PIM-SG-M365-Identity", "PIM-SG-M365-ServiceDesk"] },
        "Authentication Administrator": { via: ["PIM-SG-M365-Identity", "PIM-SG-M365-ServiceDesk"] },
        "Authentication Policy Administrator": { via: ["PIM-SG-M365-Identity"] },
        "Identity Governance Administrator": { via: ["PIM-SG-M365-Identity"] },
        "Lifecycle Workflows Administrator": { via: ["PIM-SG-M365-Identity"] },
        "Password Administrator": { via: ["PIM-SG-M365-ServiceDesk"] },
        "Helpdesk Administrator": { via: ["PIM-SG-M365-ServiceDesk"] },
        "Service Support Administrator": { via: ["PIM-SG-M365-ServiceDesk"] },
        "Intune Administrator": { via: ["PIM-SG-M365-Workplace"] },
        "Cloud Device Administrator": { via: ["PIM-SG-M365-Workplace"] },
        "Microsoft Entra Joined Device Local Administrator": { via: ["PIM-SG-M365-Workplace"] },
        "Edge Administrator": { via: ["PIM-SG-M365-Workplace"] },
        "Exchange Administrator": { via: ["PIM-SG-M365-Collab"] },
        "SharePoint Administrator": { via: ["PIM-SG-M365-Collab"] },
        "Teams Administrator": { via: ["PIM-SG-M365-Collab"] },
        "Office Apps Administrator": { via: ["PIM-SG-M365-Collab"] },
        "Power Platform Administrator": { via: ["PIM-SG-M365-Collab"] },
        "Guest Inviter": { via: ["PIM-SG-M365-Collab"] },
        "Application Administrator": { via: ["PIM-SG-M365-Apps"] },
        "Cloud Application Administrator": { via: ["PIM-SG-M365-Apps"] },
        "Application Developer": { via: ["PIM-SG-M365-Apps"] },
        "Message Center Reader": { via: ["PIM-SG-M365-ServiceDesk", "PIM-SG-M365-Identity", "PIM-SG-M365-Workplace", "PIM-SG-M365-Collab", "PIM-SG-M365-Apps", "PIM-SG-M365-SecOps"] },
        "Global Reader": { via: ["PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Audit"] },
      },
      regions: false,
      rmau: [{ name: "AU-RM-Executives", restricted: true, holds: "executives, their devices and sensitive groups that are not role-assignable — filled by hand in 🛡 Restricted AUs; PIM-SG-M365-ServiceDesk-VIP and Identity scoped on it" }],
      scoped: [
        { role: "Helpdesk Administrator", group: "PIM-SG-M365-ServiceDesk-VIP", au: "AU-RM-Executives" },
        { role: "Password Administrator", group: "PIM-SG-M365-ServiceDesk-VIP", au: "AU-RM-Executives" },
        { role: "Authentication Administrator", group: "PIM-SG-M365-ServiceDesk-VIP", au: "AU-RM-Executives" },
        { role: "User Administrator", group: "PIM-SG-M365-Identity", au: "AU-RM-Executives" },
      ],
      intune: {
        assignments: [
          { name: "INT-RBAC-Workplace", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: ["default", "INT-TAG-Workplace"] },
          { name: "INT-RBAC-HelpDesk", roles: ["Help Desk Operator"], members: ["PIM-SG-INT-HelpDesk"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-SecOps", roles: ["Endpoint Security Manager"], members: ["PIM-SG-INT-SecOps"], scope: "all devices", tags: ["default"] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: ["every"] },
        ],
        customRoles: [],
        switches: ["Allow access to unlicensed admins", "Scoped permissions (preview): run the Permissions Assessment Report first; the switch is one-way"],
      },
    },
    multi: {
      label: "Large · multi-region",
      size: "several regions, central IT plus local IT per region",
      description: "The whole group set at the centre (Tier 0, SecOps, Ops, AppOps, Helpdesk, the readers, the Azure landing-zone groups) and, per region from the customer's regions.csv: three administrative units, a Helpdesk and an Ops persona group with eligibilities scoped to the region's units, an approver group, two Intune access groups, and the Intune scope groups, tag and role assignments. No restricted management AU for admins or PIM-SG groups. This profile does not define AU-RM-Executives; executive protection is a separate customer extension.",
      groups: null,
      merge: {},
      templates: {},
      roles: {},
      regions: true,
      rmau: [],
      intune: {
        assignments: [
          { name: "INT-RBAC-PolicyProfile-Central", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-HelpDesk-Central", roles: ["Help Desk Operator"], members: ["PIM-SG-INT-HelpDesk"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-SecOps-Central", roles: ["Endpoint Security Manager"], members: ["PIM-SG-INT-SecOps"], scope: "all devices", tags: ["default"] },
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
    // What a row may carry. The attribute must exist on users AND devices
    // (the device unit reads it too), so only extensionAttribute1-15; values
    // land inside dynamic-membership rules, so a narrow character set — no
    // quotes, brackets or operators — instead of escaping. Violations exclude
    // the row; the rest of the file still loads.
    fields: {
      attribute: "^extensionAttribute([1-9]|1[0-5])$",
      value: "^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$",
      devicePrefix: "^[A-Za-z0-9][A-Za-z0-9-]{0,14}$",
      autopilotTag: "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$",
      name: "^[^\u0000-\u001f\"<>]{1,64}$",
      email: "^[^@\\s\"<>(),;]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
      timezone: "^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$",
    },
    maxRows: 250,
    maxBytes: 262144,
    template: {
      aus: [
        { name: "AU-<REG>-Users", kind: "dynamic", type: "user", rule: "(user.<attribute> -eq \"<value>\")", note: "P1 per member; one object type per dynamic unit" },
        { name: "AU-<REG>-Devices", kind: "dynamic", type: "device", rule: "(device.<attribute> -eq \"<value>\") -or (device.displayName -startsWith \"<devicePrefix>\")", note: "the naming prefix is the second rule for devices without the attribute" },
        { name: "AU-<REG>-Groups", kind: "assigned", type: "group", note: "dynamic units cannot hold groups; the region adds its own" },
      ],
      groups: [
        { name: "PIM-SG-<REG>-Helpdesk", persona: "Regional first line", template: "GroupMember", roleAssignable: true, description: "Active members are eligible for password, authentication and licence work on the region's people — never on an admin." },
        { name: "PIM-SG-<REG>-Ops", persona: "Regional second line", template: "GroupMember", roleAssignable: true, description: "Active members are eligible for the region's users, groups and devices." },
        { name: "PIM-SG-INT-HelpDesk-<REG>", persona: "Regional Intune first line", template: "GroupJIT", roleAssignable: true, intune: true, description: "Eligible members activate to act as Intune Help Desk Operator on the region's devices." },
        { name: "PIM-SG-INT-Ops-<REG>", persona: "Regional Intune second line", template: "GroupJIT", roleAssignable: true, intune: true, description: "Eligible members activate to act as INT-ROLE-Regional-Ops on the region's devices." },
        { name: "PIM-SG-<REG>-Approvers", persona: "Regional approvers", template: null, roleAssignable: false, members: "<approvers>", description: "Plain security group populated from the region's approver input. An optional regional approval gate must be configured explicitly; the default templates do not reference this group." },
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
          { name: "INT-RBAC-HelpDesk-<REG>", roles: ["Help Desk Operator"], members: ["PIM-SG-INT-HelpDesk-<REG>"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
          { name: "INT-RBAC-Ops-<REG>", roles: ["INT-ROLE-Regional-Ops"], members: ["PIM-SG-INT-Ops-<REG>"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
        ],
        autopilot: { profile: "Autopilot · <REG>", naming: "<devicePrefix>%SERIAL%", groupTag: "<autopilotTag>" },
      },
      review: { name: "Access review · <REG>", scope: "PIM-SG-<REG>-Helpdesk, PIM-SG-<REG>-Ops, PIM-SG-INT-HelpDesk-<REG>, PIM-SG-INT-Ops-<REG>", reviewer: "<itLead>", cadence: "yearly", manual: true },
    },
  },
  // ---- INTUNE RBAC: the one custom role -------------------------------
  // Policy and Profile Manager authors tenant-wide; a regional second line
  // acts on its devices and assigns central policies to its groups, and
  // cannot author. Each entry is an operation id as Intune names it
  // (deviceManagement/resourceOperations) or, where the id is not certain,
  // the permission as the admin center and Microsoft's built-in role tables
  // name it, "Resource/Action"; New-PimRegions.ps1 resolves it to the
  // tenant's id (resourceName/actionName) and creates or completes the role
  // only when every entry resolves. Mobile apps has no View reports action
  // (cloudfellows.dev, 28 Sep 2026: five ids of 2.0 were unknown there).
  intuneRoles: [
    { name: "INT-ROLE-Regional-Ops", description: "CloudFellows PIM framework: regional second line. Act on the region's devices, assign central policies and apps to the region's groups; never author a policy, never touch roles, tags or tenant settings.",
      allowed: [
        "Microsoft.Intune_ManagedDevices_Read", "Microsoft.Intune_ManagedDevices_Update", "Microsoft.Intune_ManagedDevices_Delete", "Microsoft.Intune_ManagedDevices_SetPrimaryUser", "Microsoft.Intune_ManagedDevices_ViewReports",
        "Microsoft.Intune_RemoteTasks_SyncDevice", "Microsoft.Intune_RemoteTasks_RebootNow", "Microsoft.Intune_RemoteTasks_SetDeviceName", "Remote tasks/Collect diagnostics", "Microsoft.Intune_RemoteTasks_Wipe", "Microsoft.Intune_RemoteTasks_Retire", "Microsoft.Intune_RemoteTasks_RotateBitLockerKeys", "Microsoft.Intune_RemoteTasks_RotateLocalAdminPassword", "Microsoft.Intune_RemoteTasks_RemoteLock", "Microsoft.Intune_RemoteTasks_LocateDevice", "Microsoft.Intune_RemoteTasks_EnableLostMode", "Microsoft.Intune_RemoteTasks_DisableLostMode",
        "Microsoft.Intune_DeviceConfigurations_Read", "Microsoft.Intune_DeviceConfigurations_ViewReports", "Microsoft.Intune_DeviceConfigurations_Assign",
        "Microsoft.Intune_DeviceCompliancePolices_Read", "Microsoft.Intune_DeviceCompliancePolices_ViewReports", "Microsoft.Intune_DeviceCompliancePolices_Assign",
        "Microsoft.Intune_MobileApps_Read", "Microsoft.Intune_MobileApps_Assign", "Microsoft.Intune_ManagedApps_Read",
        "Enrollment programs/Read device", "Enrollment programs/Sync device",
        "Audit data/Read", "Microsoft.Intune_Organization_Read", "Microsoft.Intune_TermsAndConditions_Read",
      ],
      notAllowed: ["create, update or delete any policy, profile, app, script, filter, compliance or endpoint security policy", "roles, scope tags, role assignments", "tenant settings: enrollment restrictions, MDM authority, connectors"] },
  ],
  // Never touched by a deploy, never counted as drift: the break-glass
  // accounts (permanent Global Administrator, by design — see 🔒 Protect
  // exclusions in Workspace 01) and the Global Administrator group itself.
  protected: { pattern: "^(BG-|BGA\\b|BreakGlass|Break-Glass|EmergencyAccess)", groups: ["PIM-SG-M365-GlobalAdmin"], description: "The name pattern only suggests emergency accounts. Record protection by explicit object ID and verify the intended controls. Baseline import does not remove existing assignments." },
  // Where each kind of privileged object is protected (2.1). No PIM-SG group
  // and no adm- account goes into a restricted management AU.
  protection: [
    { object: "Admin accounts (adm-) that are active members of a PIM-SG group", how: "Role-assignable group membership adds restrictions on credential and authentication-method management. Continue to govern owners, memberships and privileged administrator roles; verify the intended protection.", rmau: false },
    { object: "PIM-SG groups", how: "Role-assignable: only Privileged Role Administrators, Global Administrators and owners change membership. Never in a restricted management AU — PIM for Groups, access reviews and lifecycle workflows cannot manage objects there, and a role-assignable group inside one can no longer have its membership changed.", rmau: false },
    { object: "Executives, their devices, sensitive groups that are not role-assignable", how: "AU-RM-Executives, a restricted management AU, filled by hand through 🛡 Restricted AUs (T27) after its scoped administrators are named and tested. Objects there lose access reviews and lifecycle workflows.", rmau: true },
    { object: "Break-glass accounts", how: "Identify by explicit object ID and verify the approved Conditional Access treatment and recovery sign-in. Baseline import does not configure those exclusions or remove existing assignments.", rmau: false },
  ],
  // Outside PIM, still part of the framework — listed so the export and the
  // Help can say so, never compared.
  outside: [
    "Access reviews: review every eligible assignment and persona group yearly. Review schedules are not created by Deploy; assignment expiry is not an access review.",
    "Intune RBAC is part of the framework: Deploy plans supported roles, tags and assignments; T53 reads and compares them. Privileged access uses PIM-SG-INT groups; SecOpsReader has the explicit standing Read Only Operator exception. Defender XDR and Purview workload RBAC remain separate.",
    "People are never in the catalog: active persona members and eligible Intune members are added by an administrator (or an access package) and reviewed yearly.",
    "Azure RBAC: Deploy creates optional PIM-SG-AZ groups only. ARM assignments and Azure PIM policies at management group or subscription scopes are separate. Roles and assignments offers an Azure RBAC read; Baseline does not provision ARM assignments.",
  ],
};
