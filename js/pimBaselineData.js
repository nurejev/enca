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
//   * INTUNE AND DEFENDER XDR RBAC are outside Entra PIM, so the catalog
//     carries their ENTRA SIDE only: access groups with eligible members
//     (PIM-SG-INT-* since 2.1, PIM-SG-XDR-* since 2.2) that the product's own
//     role assignments name. Intune's assignments are in the catalog too (T53
//     reads them, Deploy writes them); Defender's roles and assignments are
//     made in the Defender portal and never read or written here. Purview
//     RBAC stays outside.
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
// DEFENDER XDR, THE ENTRA SIDE (2.2, 2 Oct 2026). The M365 RBAC Baseline
// V2.0 (the 1.3 lineage; its version 1.4 added the XDR groups) defines five
// Defender XDR roles — Administrator, Reader, Operator T1, T2 and T3 — each
// assigned at scope All to a PIM group of the same name. 2.2 carries those
// five groups as PIM-SG-XDR-* access groups with ELIGIBLE members, as the
// Intune groups: T1 is the desk, T3 the second line (the document's own
// numbers, kept because the portal roles carry them), Reader for the
// readers, Admin for SecOps. Operators and Reader activate under GroupJIT
// (eight hours, the framework's shift, not the document's ten); Admin — the
// role that can hand out the other four — under GroupJITTier0, Tier 0's
// gate on a group: two hours, justification and context c1, approval. The
// small profile keeps Admin, Operator-T3 and Reader (T1 and T2 fold into T3
// as the desk folds into Ops); the large profiles keep all five, the
// multi-region profile centrally — no regional XDR groups. The roles, their
// permissions, the assignments and the data sources live in the Defender
// portal and are made there, separately: Deploy lists that work under By
// hand and nothing reads the portal back (Mihai, 2 Oct 2026: "we only need
// the entra side to be included. the xdr side is done separately").
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
  release: "5.1",
  revised: "2026-10-28",
  tenant: "cloudfellows.dev",
  source: "bundled",
  lineage: "Dovilo PIM framework v1.3 (25 Aug 2024) → CloudFellows PIM framework 2.0 (24 Sep 2026) → 2.1 (25 Sep 2026: active membership + eligible roles, Intune through eligible access groups, no PIM groups in restricted AUs) → 2.2 (2 Oct 2026: the five Defender XDR access groups PIM-SG-XDR-* on the Entra side; the portal roles and assignments stay separate) → 3.0 (5 Oct 2026: job groups — eligible members, the group active in every role of the job, one activation of four hours; direct groups for Tier 0, Exchange, SharePoint, Purview and the readers, as Microsoft recommends; Exchange RBAC through PIM-SG-EXO access groups) → 4.0 (12 Oct 2026: optional modules Remote Help, Remote Help unattended and Windows 365; INT-ROLE-HelpDesk replaces the built-in Help Desk Operator) → 4.1 (13 Oct 2026: Global Secure Access in every design; Teams, backup, billing, Copilot, Fabric and Power Platform roles with the Teams, Backup-Direct, Billing and Data-Direct groups; Purview access groups PIM-SG-PUR-*; regional Exchange groups in the region template; Azure out of the multi-region profile; where no API exists Deploy generates the script) → 5.0 (14 Oct 2026: role activation first — every Entra role group has ACTIVE members for at most a year and is ELIGIBLE per role, so a person activates the one role the task needs and the role policy is the gate; the job groups keep their names as team rosters; SecOps-, Ops-, AppOps- and Collab-Direct are folded into their job group; GroupJITTier1 is kept only to read 4.1 tenants) → 5.1 (28 Oct 2026: a region is a list of countries — the units match usageLocation, devices the Autopilot group tag; region units and Intune user groups hold members only, never adm- accounts; region codes may be plain, EURO or APAC)",
  // Names the framework depends on beside the groups. The approver group
  // is a plain security group (not role-assignable, not PIM-managed): its
  // members approve, they hold nothing. The mailbox is a shared mailbox in
  // the tenant's own domain.
  approvers: { name: "PIM-SG-Approvers", description: "Approves Tier 0 and SecOps activations. Plain security group, members from IT and Security; never role-assignable." },
  notifications: { mailbox: "pim-alerts", description: "Shared mailbox pim-alerts@<tenant domain> receives every PIM alert (eligible, active and activation), so the audit trail has one inbox." },
  authContext: { id: "c1", name: "PIM Tier 0 activation", description: "Authentication context c1 is required to activate a Tier 0 role. GroupMember and GroupJIT do not require c1; GroupJITTier0 (the Defender XDR administrator group) does. The Conditional Access policy that gates c1 (phishing-resistant MFA, compliant device) lives in Workspace 01." },
  // Exact-match naming contract. A tenant's group counts as the framework's
  // only under this exact name (no prefixes, no suffixes, no version).
  naming: { pattern: "^PIM-SG-(M365|AZ|INT|XDR|EXO|PUR|SPO|FAB|PP)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$", example: "PIM-SG-M365-Ops · PIM-SG-M365-Backup-Direct · PIM-SG-AZ-Platform-Owner · PIM-SG-INT-Ops · PIM-SG-XDR-Operator-T1 · PIM-SG-EXO-Recipients · PIM-SG-PUR-eDiscovery" },
  // 5.0 (14 Oct 2026): groups the framework no longer uses. A tenant group under
  // one of these names is reported as retired, with the group its roles moved
  // to, never as a group outside the framework. Deploy removes their role
  // assignments only once the new group holds the same role; deleting the
  // group itself stays a decision for a person (a role-assignable group cannot
  // be restored once deleted).
  retired: [
    { name: "PIM-SG-M365-SecOps-Direct", into: "PIM-SG-M365-SecOps", release: "5.0", note: "Folded into SecOps: every role group is eligible per role in 5.0, so the direct twin has no purpose." },
    { name: "PIM-SG-M365-Ops-Direct", into: "PIM-SG-M365-Ops", release: "5.0", note: "Folded into Ops." },
    { name: "PIM-SG-M365-AppOps-Direct", into: "PIM-SG-M365-AppOps", release: "5.0", note: "Folded into AppOps (into Ops in the small profile)." },
    { name: "PIM-SG-M365-Collab-Direct", into: "PIM-SG-M365-Collab", release: "5.0", note: "Folded into Collab." },
  ],
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
    // GroupJITTier1 (3.0 to 4.1) was the job group: eligible members, the group
    // ACTIVE in every role of the job, one activation of four hours. RETIRED in
    // 5.0 for Entra roles: membership activation has to reach every workload
    // (minutes, sometimes hours), role activation takes seconds. No 5.0 group
    // uses it; it stays so that a 4.1 tenant can still be read and compared.
    GroupJITTier1: {
      description: "Job group: eligible membership for at most a year; one activation of four hours with MFA and justification gives every role of the job; an active assignment by an administrator lasts at most 30 days; nothing permanent for people.",
      ActivationDuration: "PT4H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: false, Approvers: [], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    // GroupJITTier0 (2.2) is for the one Defender XDR access group that can
    // hand out every other Defender role, PIM-SG-XDR-Admin: eligible
    // membership like GroupJIT, with the Tier 0 gate on the activation — two
    // hours, justification and context c1, approval by the approver group.
    // Defender has no PIM of its own, so the group activation is the gate.
    GroupJITTier0: {
      description: "Defender XDR administrator group: eligible membership for at most a year; activation for two hours with justification, authentication context c1 and approval by PIM-SG-Approvers; an active assignment by an administrator lasts at most 30 days; nothing permanent; every alert.",
      ActivationDuration: "PT2H", ActivationRequirement: "Justification", AuthenticationContext_Enabled: true, AuthenticationContext_Value: "c1",
      ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
    // GroupJITApproval (4.0) is for the Remote Help groups that hand out a
    // capability the first line must not hold standing: Elevation (UAC on the
    // sharer device) and Android unattended control. Eligible like GroupJIT,
    // four hours, MFA and justification, and approval by PIM-SG-Approvers. The
    // small profile switches the approval off (one approver cannot approve).
    GroupJITApproval: {
      description: "Remote Help Elevation and Android unattended access group: eligible membership for at most a year; activation for four hours with MFA, justification and approval by PIM-SG-Approvers; an active assignment by an administrator lasts at most 30 days; nothing permanent; every alert.",
      ActivationDuration: "PT4H", ActivationRequirement: "MultiFactorAuthentication,Justification", AuthenticationContext_Enabled: false,
      ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"], AllowPermanentEligibility: false, MaximumEligibilityDuration: "P365D", AllowPermanentActiveAssignment: false, MaximumActiveAssignmentDuration: "P30D",
      Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_EligibleAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
      Notification_ActiveAssignment_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "All", Recipients: ["pim-alerts"] },
    },
  },
  // Entra roles under the framework, by their exact Microsoft display names
  // (2026). `templateId` is the built-in role's template id — what the
  // scripts and the comparison match on: Microsoft renames roles, the id
  // stays, and a tenant can still carry a former name (`formerNames`). `via` names the persona groups that carry the role — the model
  // the group comparison checks. Since 5.0 every role group (path direct) is
  // ELIGIBLE for the role and its members are ACTIVE; path job (a group ACTIVE in
  // the role) is read for 4.1 tenants only. `override` is the one exception to the
  // template, written the same way EasyPIM writes an inline setting.
  roles: [
    // ---- Tier 0 ----
    { name: "Global Administrator", templateId: "62e90394-69f5-4237-9190-012177145e10", template: "Tier0", via: ["PIM-SG-M365-GlobalAdmin"], override: { ActivationDuration: "PT1H" }, note: "One hour, as in 1.3. The break-glass accounts hold it permanently and are protected." },
    { name: "Privileged Role Administrator", templateId: "e8611ab8-c189-46e8-94e1-60213ab1f814", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "Moved out of SecOps in 2.0: it assigns roles, including Global Administrator." },
    { name: "Privileged Authentication Administrator", templateId: "7be44c8a-adaf-4e2a-84d6-ab2649e08a13", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "Moved out of Ops in 2.0: it resets a Global Administrator's authentication methods." },
    { name: "Conditional Access Administrator", templateId: "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "Can switch every Conditional Access policy off. Activates under Tier0: in the small profile without approval, in the large profiles with the Tier 0 approvers." },
    { name: "Security Administrator", templateId: "194ae4cb-b126-40b2-bd5b-6091b380977d", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "Manages Conditional Access and Defender. Activates under Tier0: in the small profile without approval, in the large profiles with the Tier 0 approvers." },
    // ---- Tier 1 ----
    { name: "Exchange Administrator", templateId: "29232cdf-9323-42fd-ade2-1d097af3e4de", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "SharePoint Administrator", templateId: "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-AppOps"] },
    { name: "Teams Administrator", templateId: "69091246-20e8-4a56-aa4d-066075b2a7a8", template: "Tier1", via: ["PIM-SG-M365-Ops", "PIM-SG-M365-Teams"], note: "4.1: also on the Teams job group, for the team or outside partner that runs Teams; Ops keeps it for internal IT." },
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
    // ---- 4.1 (13 Oct 2026): the workload roles. Template ids read from cloudfellows.dev on 13 Oct 2026 — never written from memory. ----
    { name: "Teams Communications Administrator", templateId: "baf37b3a-610e-45da-9e62-d9d1e5e8914b", template: "Tier1", via: ["PIM-SG-M365-Teams"], note: "Calling and meetings. On the Teams job group, which is often an outside partner." },
    { name: "Teams Telephony Administrator", templateId: "aa38014f-0993-46e9-9b45-30501a20909d", template: "Tier1", via: ["PIM-SG-M365-Teams"], note: "Numbers, calling policies, voice apps; resource accounts also need User Administrator." },
    { name: "Teams Devices Administrator", templateId: "3d762c5a-1b6c-493f-843e-55a3b42923d4", template: "Tier1", via: ["PIM-SG-M365-Teams"], note: "Teams Rooms, phones and displays." },
    { name: "Teams Communications Support Engineer", templateId: "f70938a0-fc10-4177-9e90-2178f8765737", template: "Tier2", via: ["PIM-SG-M365-Teams"], note: "Call quality with full call records." },
    { name: "Teams Communications Support Specialist", templateId: "fcf91098-03e3-41a9-b5ba-6f0ec8188a12", template: "Tier2", via: ["PIM-SG-M365-Helpdesk"], note: "Call quality for the first line; stays with the desk." },
    { name: "SharePoint Backup Administrator", templateId: "9d3e04ba-3ee4-4d1b-a3a7-9aef423a09be", template: "Tier1", via: ["PIM-SG-M365-Backup-Direct"], override: { ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "A restore can overwrite live content: per role, with approval (decided 12 Oct 2026)." },
    { name: "Exchange Backup Administrator", templateId: "49eb8f75-97e9-4e37-9b2b-6c3ebfcffa31", template: "Tier1", via: ["PIM-SG-M365-Backup-Direct"], override: { ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "A restore can overwrite live mailboxes: per role, with approval." },
    { name: "Microsoft 365 Backup Administrator", templateId: "1707125e-0aa2-4d4d-8655-a7c786c76a25", template: "Tier1", via: ["PIM-SG-M365-Backup-Direct"], override: { ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "Backup policies and restore across Exchange, SharePoint and OneDrive: per role, with approval." },
    { name: "Billing Administrator", templateId: "b0f54661-2d74-4c50-afa3-1ec803f12efe", template: "Tier1", via: ["PIM-SG-M365-Billing"], note: "Purchases and subscriptions: a finance persona, its own direct group in the large profiles; Ops in the small one (the Billing group folds into Ops there)." },
    { name: "Reports Reader", templateId: "4a5d8f65-41da-4de4-8968-e035b65339cf", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"], note: "Usage reports." },
    { name: "Domain Name Administrator", templateId: "8329153b-31d0-4727-b945-745eb3bc5f31", template: "Tier0", via: ["PIM-SG-M365-Tier0"], note: "A domain change can redirect sign-in or mail: Tier 0, on the Tier0 group (GlobalAdmin in the small profile, where Tier0 folds into it)." },
    { name: "Printer Administrator", templateId: "644ef478-e28f-4e28-b9dc-3fdde9aa0b1f", template: "Tier1", via: ["PIM-SG-M365-Ops"], note: "Universal Print." },
    { name: "Attribute Definition Administrator", templateId: "8424c6f0-a189-499e-bbd0-26c1753c96d4", template: "Tier0", via: ["PIM-SG-M365-SecOps"], override: { ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "Custom security attributes can decide which apps a Conditional Access policy hits: Tier 0 with approval in every profile (decided 12 Oct 2026)." },
    { name: "Attribute Assignment Administrator", templateId: "58a13ea3-c632-46ae-9ee0-9c0d43cd7f3d", template: "Tier0", via: ["PIM-SG-M365-SecOps"], override: { ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "Assigns those attributes: Tier 0 with approval in every profile." },
    { name: "AI Administrator", templateId: "d2562ede-74db-457e-a7b6-544e236ebb61", template: "Tier1", via: ["PIM-SG-M365-AppOps"], note: "Microsoft 365 Copilot and the AI services; Purview maps it to Compliance Manager Administrators and the Data Security AI role groups." },
    { name: "AI Reader", templateId: "1fe13547-53f6-408d-ac04-7f8eed167b38", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"], note: "Read-only Copilot settings." },
    { name: "Fabric Administrator", templateId: "a9ea8996-122f-4c74-9520-8edcd192826c", template: "Tier1", via: ["PIM-SG-M365-AppOps"], note: "Tenant settings of Fabric and Power BI. Eligible per role like every role since 5.0; on the Data-Direct group in the large one-region profile." },
    { name: "Dynamics 365 Administrator", templateId: "44367163-eba1-44c3-98af-f5787879f96a", template: "Tier1", via: ["PIM-SG-M365-AppOps"], note: "Beside Power Platform Administrator, which the same groups hold." },
    { name: "Global Secure Access Administrator", templateId: "ac434307-12b9-4fa1-a708-88bf58caabc1", template: "Tier0", via: ["PIM-SG-M365-SecOps"], note: "In every design: the Microsoft 365 traffic profile is available to every tenant. It can switch traffic forwarding, tenant restrictions and GSA signaling off, so Tier 0, activated per role (decided 12 Oct 2026)." },
    { name: "Global Secure Access Log Reader", templateId: "843318fb-79a6-4168-9e6f-aa9a07481cc4", template: "Reader", via: ["PIM-SG-M365-SecOps"], note: "Traffic logs show who went where: on the SecOps job, not on the readers (Global Reader and Security Reader see every GSA setting except the logs)." },
    // ---- Tier 2 ----
    { name: "Helpdesk Administrator", templateId: "729827e3-9c14-49f7-bb1b-9608f156bbb8", template: "Tier2", via: ["PIM-SG-M365-Helpdesk"], note: "Eight hours, as in 1.3: a shift, not a task." },
    { name: "Message Center Reader", templateId: "790c1fb9-7f7d-4f88-86a1-ef1f95c05c1b", template: "Tier2", via: ["PIM-SG-M365-Helpdesk", "PIM-SG-M365-Ops", "PIM-SG-M365-AppOps", "PIM-SG-M365-SecOps"] },
    // ---- Readers ----
    { name: "Global Reader", templateId: "f2ef992c-3afb-46b9-b7cf-a126ee74c451", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"] },
    { name: "Security Reader", templateId: "5d6b6bb7-de71-4623-b4af-96380a352509", template: "Reader", via: ["PIM-SG-M365-SecOpsReader"] },
    { name: "Directory Readers", templateId: "88d8e3e3-8f55-4a1e-953a-9b9898b8876b", template: "Reader", via: [], override: { AllowPermanentActiveAssignment: true }, note: "No group carries it: every member of the tenant reads the directory already, and every other role inherits it. The template allows a permanent active assignment for the few service accounts that need the role by name." },
  ],
  // The privileged access groups: role-assignable security groups, PIM for
  // Groups on the Member role, each carrying the roles named in `roles`
  // above (derived, not repeated here). Azure groups carry an Azure RBAC
  // role at a scope; T48 lists them and exports them but does not compare
  // them yet (Azure Resource Manager is a different read).
  groups: [
    { name: "PIM-SG-M365-GlobalAdmin", scope: "m365", path: "direct", persona: "GOD mode", template: "GroupMember", description: "Eligible for Global Administrator. The small model also maps Privileged Role Administrator and Privileged Authentication Administrator to this group. Activation uses each role's effective model policy; Global Administrator is two hours in small and one hour otherwise." },
    { name: "PIM-SG-M365-Tier0", scope: "m365", path: "direct", persona: "Tier 0", template: "GroupMember", description: "Privileged Role Administrator and Privileged Authentication Administrator — the roles that manage privileged role assignments and privileged authentication methods." },
    { name: "PIM-SG-M365-SecOps", scope: "m365", path: "direct", persona: "Security Operations", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role; a member activates the one role the task needs. Manages the security configuration: Conditional Access, Defender, Purview, Cloud App Security, compliance, Global Secure Access. Holds the Tier 0 security roles since SecOps-Direct was folded in (5.0), so review its members quarterly." },
    { name: "PIM-SG-M365-SecOpsReader", scope: "m365", path: "direct", persona: "Security readers", template: "GroupMember", description: "Reads the security configuration and reports; changes nothing." },
    { name: "PIM-SG-M365-Ops", scope: "m365", path: "direct", persona: "IT Operations", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role; a member activates the one role the task needs. Second line and system administration: users, groups, devices, Intune, the Microsoft 365 workloads, Exchange and SharePoint (Ops-Direct folded in)." },
    { name: "PIM-SG-M365-Helpdesk", scope: "m365", path: "direct", persona: "Helpdesk", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role; a member activates the one role the task needs. First line: supports people with their accounts and their workplace." },
    { name: "PIM-SG-M365-AppOps", scope: "m365", path: "direct", persona: "Application Operators", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role; a member activates the one role the task needs. Keeps SharePoint, Exchange, Power Platform, Fabric and the registered applications working (AppOps-Direct folded in)." },
    // 4.1 (13 Oct 2026): the groups the workload roles needed. Teams is a job
    // group because the team that runs Teams telephony and devices is often an
    // outside partner; Backup-Direct is a direct group whose three roles each
    // activate with approval; Billing is a finance persona; Data-Direct (large
    // one-region) carries Fabric Administrator.
    { name: "PIM-SG-M365-Teams", scope: "m365", path: "direct", persona: "Teams telephony and devices", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role — Teams, Communications, Telephony and Devices Administrator and Communications Support Engineer. Often an outside partner; Ops keeps Teams Administrator for internal IT." },
    { name: "PIM-SG-M365-Backup-Direct", scope: "m365", path: "direct", persona: "Backup and restore", template: "GroupMember", description: "Direct group: active members, eligible per role for the SharePoint, Exchange and Microsoft 365 Backup Administrator roles, each with approval — a restore can overwrite live content." },
    { name: "PIM-SG-M365-Billing", scope: "m365", path: "direct", persona: "Finance", template: "GroupMember", description: "Direct group: active members, eligible for Billing Administrator — purchases and subscriptions; a finance persona, not IT. Folds into Ops in the small profile." },
    // Intune access groups: eligible members, the group activation is the
    // gate (GroupJIT). The profiles' Intune assignments name them.
    { name: "PIM-SG-INT-Ops", scope: "intune", persona: "Intune operations", template: "GroupJIT", description: "Eligible members activate for a shift to act as Intune Policy and Profile Manager + Application Manager (central Workplace)." },
    { name: "PIM-SG-INT-HelpDesk", scope: "intune", persona: "Intune first line", template: "GroupJIT", description: "Eligible members activate to act as the Intune first line (INT-ROLE-HelpDesk: everything the built-in Help Desk Operator does except Elevation and unattended control)." },
    { name: "PIM-SG-INT-SecOps", scope: "intune", persona: "Intune endpoint security", template: "GroupJIT", description: "Eligible members activate to act as Intune Endpoint Security Manager." },
    // Defender XDR access groups (2.2): eligible members, the group
    // activation is the gate — Defender has no PIM of its own. `xdr` names
    // the portal role the group is meant for; that role, its permissions and
    // the assignment that names the group are made in the Defender portal,
    // never here (nothing reads the portal back).
    { name: "PIM-SG-XDR-Admin", scope: "xdr", persona: "Security Operations", template: "GroupJITTier0", xdr: { role: "Defender XDR Administrator", scope: "All" }, description: "Eligible members activate for two hours, with approval and context c1, to act as Defender XDR Administrator: every read and manage permission in Security operations, Security posture and Authorization and settings — the role that can hand out the other four. Made in the Defender portal; the group is the framework's." },
    { name: "PIM-SG-XDR-Operator-T3", scope: "xdr", persona: "IT Operations", template: "GroupJIT", xdr: { role: "Defender XDR Operator T3", scope: "All" }, description: "Eligible members activate for a shift to act as Defender XDR Operator T3, the second line: alerts, response, basic and advanced live response, file collection and the email actions; vulnerability management read with exception, remediation and application handling, security baselines assessment, Secure Score read and manage; authorization read-only." },
    { name: "PIM-SG-XDR-Operator-T2", scope: "xdr", persona: "Second line", template: "GroupJIT", xdr: { role: "Defender XDR Operator T2", scope: "All" }, description: "Eligible members activate for a shift to act as Defender XDR Operator T2: the T1 permissions plus vulnerability management read, exception and remediation handling and Secure Score read and manage; authorization read-only. The framework document names no persona for it — the tier between the desk and Ops." },
    { name: "PIM-SG-XDR-Operator-T1", scope: "xdr", persona: "Helpdesk", template: "GroupJIT", xdr: { role: "Defender XDR Operator T1", scope: "All" }, description: "Eligible members activate for a shift to act as Defender XDR Operator T1, the desk: security data basics read; alerts, response, basic live response, file collection, email quarantine and email advanced actions manage; email content and headers read; posture and authorization read-only." },
    { name: "PIM-SG-XDR-Reader", scope: "xdr", persona: "Security readers", template: "GroupJIT", xdr: { role: "Defender XDR Reader", scope: "All" }, description: "Eligible members activate for a shift to act as Defender XDR Reader: Security operations, Security posture and Authorization and settings, all read-only." },
    // Exchange RBAC access groups (3.0): eligible members, the group is a
    // member of an Exchange Online role group (Exchange accepts a
    // role-assignable Entra group there, tested on cloudfellows.dev, 5 Oct
    // 2026). The role group membership is made in Exchange, not by Graph:
    // Graph lists the role groups and the roles each holds through
    // /roleManagement/exchange/roleAssignments (checked 13 Oct 2026 on
    // cloudfellows.dev) but never their members, and a role-assignable group
    // is not a principal that provider resolves. So Deploy generates the
    // Exchange PowerShell script (Add-RoleGroupMember) with the group ids
    // filled in and reads its outcome file back (4.1). `roles` lists what the
    // role group holds (Microsoft Learn, Permissions in Exchange Online).
    { name: "PIM-SG-EXO-Recipients", scope: "exchange", persona: "Recipients", template: "GroupJIT", exchange: { roleGroup: "Recipient Management", roles: ["Distribution Groups", "Mail Recipient Creation", "Mail Recipients", "Message Tracking", "Migration", "Move Mailboxes", "Recipient Policies", "Reset Password"] }, description: "Eligible members activate for mailboxes, contacts, distribution groups and mailbox permissions — without Exchange Administrator." },
    { name: "PIM-SG-EXO-HelpDesk", scope: "exchange", persona: "Exchange first line", template: "GroupJIT", exchange: { roleGroup: "Help Desk", roles: ["Reset Password", "User Options", "View-Only Recipients"] }, description: "Eligible members activate to view and change recipient properties. The Entra first line reaches the same role group through Helpdesk Administrator; this group is for Exchange-only staff without an Entra role." },
    { name: "PIM-SG-EXO-Hygiene", scope: "exchange", persona: "Mail hygiene", template: "GroupJIT", exchange: { roleGroup: "Hygiene Management", roles: ["Transport Hygiene", "View-Only Configuration", "View-Only Recipients"] }, description: "Eligible members activate for anti-spam, anti-malware and connection filtering." },
    { name: "PIM-SG-EXO-Reader", scope: "exchange", persona: "Exchange readers", template: "GroupJIT", exchange: { roleGroup: "View-Only Organization Management", roles: ["View-Only Configuration", "View-Only Recipients"] }, description: "Eligible members activate to read the whole Exchange configuration." },
    // Purview access groups (4.1, 13 Oct 2026): eligible members, the group is
    // a member of a Purview role group. Microsoft documents exactly this (an
    // Entra security group in a role group, PIM for Groups for just-in-time
    // membership); a person assigned directly to a role group cannot be made
    // just-in-time. Graph has no Purview provider — the role groups show up
    // under the Exchange provider with their roles, never their members — so
    // Deploy generates the Security and Compliance PowerShell script and reads
    // its outcome back, as for Exchange. Organization Management and Role
    // Management are never handed out through an access group; eDiscovery
    // Administrator is held by nobody standing (named people by exception,
    // reviewed quarterly).
    { name: "PIM-SG-PUR-InfoProtection", scope: "purview", persona: "Information protection", template: "GroupJIT", purview: { roleGroup: "Information Protection Admins" }, description: "Eligible members activate for a shift to manage sensitivity labels and their policies — without Compliance Administrator." },
    { name: "PIM-SG-PUR-Records", scope: "purview", persona: "Records management", template: "GroupJIT", purview: { roleGroup: "Records Management" }, description: "Eligible members activate for a shift for retention labels, the file plan and disposition." },
    { name: "PIM-SG-PUR-eDiscovery", scope: "purview", persona: "eDiscovery", template: "GroupJITTier0", purview: { roleGroup: "eDiscovery Manager" }, description: "Eligible members activate for two hours, with context c1 and approval, to search and hold everybody's mail and files. Microsoft documents a mail-enabled security group in the eDiscovery Managers subgroup and no group in eDiscovery Administrators — whether this role-assignable group is accepted is checked by the script's outcome." },
    { name: "PIM-SG-PUR-InsiderRisk", scope: "purview", persona: "Insider risk", template: "GroupJITApproval", purview: { roleGroup: "Insider Risk Management" }, description: "Eligible members activate for four hours, with approval by PIM-SG-Approvers, to see who did what with data." },
    { name: "PIM-SG-PUR-CommCompliance", scope: "purview", persona: "Communication compliance", template: "GroupJITApproval", purview: { roleGroup: "Communication Compliance" }, description: "Eligible members activate for four hours, with approval by PIM-SG-Approvers, to read flagged messages." },
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
    { name: "PIM-SG-M365-Identity", scope: "m365", path: "direct", persona: "Identity team", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role. Users, groups, licences, authentication methods and policy, identity governance, lifecycle workflows." },
    { name: "PIM-SG-M365-Workplace", scope: "m365", path: "direct", persona: "Endpoint team", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role. Intune, devices, the local administrator on joined devices, Edge." },
    { name: "PIM-SG-M365-Collab", scope: "m365", path: "direct", persona: "Messaging and collaboration", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role. Exchange, SharePoint, Teams, Office apps, Power Platform, guest invitations (Collab-Direct folded in)." },
    { name: "PIM-SG-M365-Apps", scope: "m365", path: "direct", persona: "Applications", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role. App registrations and enterprise applications only." },
    { name: "PIM-SG-M365-ServiceDesk", scope: "m365", path: "direct", persona: "Service desk", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible per role. First line for everybody but admins and executives: passwords, authentication methods, licences." },
    { name: "PIM-SG-M365-ServiceDesk-VIP", scope: "m365", path: "direct", persona: "Service desk for executives", template: "GroupMember", description: "Role group (5.0): active members for at most a year, the group eligible for the desk roles scoped to the optional AU-RM-Executives. The named few who may help executives. Deploy can create the empty unit and scoped eligibilities; populate it only after testing the scoped administrators." },
    { name: "PIM-SG-M365-Audit", scope: "m365", path: "direct", persona: "Internal audit", template: "GroupMember", description: "Reads everything, changes nothing; its own review cadence." },
    { name: "PIM-SG-M365-Data-Direct", scope: "m365", path: "direct", persona: "Data platform", template: "GroupMember", description: "Direct group: active members, eligible for Fabric Administrator — the data platform team (4.1)." },
  ],
  // ---- PROFILES ------------------------------------------------------
  // The same tiers, roles and names; a profile picks the groups a tenant of
  // that size keeps, folds the others' roles into them (`merge`), and carries
  // the few template settings that change with size. PimBaseline.profile()
  // derives the catalog T48 compares against.
  // ---- MODULES (4.0, 12 Oct 2026): optional parts of the framework --------
  // A module is switched on per tenant (🚀 Deploy, Pick) and is part of a
  // profile only while it is on; the base catalog above never changes with
  // it. Offered by licence: see js/pimmodules.js. Validated read-only on
  // cloudfellows.dev and gimi, 12 Oct 2026.
  //   rh   Remote Help: view, full control, elevation (Intune custom roles).
  //   rhu  Remote Help unattended: Windows remote sign-in and Android. Needs rh.
  //   w365 Windows 365: Cloud PC access groups and the Windows 365 Administrator
  //        Entra role. The Cloud PC roles live in their own provider
  //        (/roleManagement/cloudPC), so their assignments are made by hand
  //        until a write test shows what scope that provider accepts.
  modules: {
    rh: {
      label: "Remote Help",
      description: "Remote Help for the support desk: view screen, full control and Elevation as three Intune custom roles on three access groups. Elevation sits behind approval.",
      groups: [
        { name: "PIM-SG-INT-RH-View", scope: "rh", persona: "Remote Help view", template: "GroupJIT", description: "Eligible members activate for a shift to view a sharer's screen with Remote Help." },
        { name: "PIM-SG-INT-RH-Full", scope: "rh", persona: "Remote Help full control", template: "GroupJIT", description: "Eligible members activate for a shift to view and take full control of a sharer's device with Remote Help." },
        { name: "PIM-SG-INT-RH-Elevation", scope: "rh", persona: "Remote Help elevation", template: "GroupJITApproval", description: "Eligible members activate, with approval, for four hours to enter UAC credentials on a sharer's Windows device during Remote Help." },
      ],
      roleDefs: [
        { name: "INT-ROLE-RH-View", description: "CloudFellows PIM framework: Remote Help, view the sharer's screen.", allowed: ["Microsoft.Intune_RemoteTasks_RequestRemoteAssistance", "Microsoft.Intune_RemoteAssistance_Read", "Microsoft.Intune_RemoteAssistanceApp_ViewScreen", "Microsoft.Intune_RemoteAssistance_ViewReports"], notAllowed: ["take full control", "Elevation", "unattended control"] },
        { name: "INT-ROLE-RH-Full", description: "CloudFellows PIM framework: Remote Help, view and take full control.", allowed: ["Microsoft.Intune_RemoteTasks_RequestRemoteAssistance", "Microsoft.Intune_RemoteAssistance_Read", "Microsoft.Intune_RemoteAssistanceApp_ViewScreen", "Microsoft.Intune_RemoteAssistanceApp_TakeFullControl", "Microsoft.Intune_RemoteAssistance_ViewReports"], notAllowed: ["Elevation", "unattended control"] },
        { name: "INT-ROLE-RH-Elevation", description: "CloudFellows PIM framework: Remote Help Elevation, UAC credentials on the sharer's Windows device. Behind approval.", allowed: ["Microsoft.Intune_RemoteTasks_RequestRemoteAssistance", "Microsoft.Intune_RemoteAssistance_Read", "Microsoft.Intune_RemoteAssistanceApp_Elevation"], notAllowed: ["unattended control"] },
      ],
      byProfile: {
        small: {
          groups: ["PIM-SG-INT-RH-Full", "PIM-SG-INT-RH-Elevation"],
          templates: { GroupJITApproval: { ApprovalRequired: false, Approvers: [], description: "Small profile: four hours, MFA and justification, no approval — one approver cannot approve; add a second and the next Preview switches approval on." } },
          assignments: [
            { name: "INT-RBAC-RH-Full-All", roles: ["INT-ROLE-RH-Full"], members: ["PIM-SG-INT-RH-Full"], scope: "all devices", tags: [] },
            { name: "INT-RBAC-RH-Elevation-All", roles: ["INT-ROLE-RH-Elevation"], members: ["PIM-SG-INT-RH-Elevation"], scope: "all devices", tags: [] },
          ],
          customRoles: ["INT-ROLE-RH-Full", "INT-ROLE-RH-Elevation"],
        },
        large: {
          groups: ["PIM-SG-INT-RH-View", "PIM-SG-INT-RH-Full", "PIM-SG-INT-RH-Elevation"],
          assignments: [
            { name: "INT-RBAC-RH-View", roles: ["INT-ROLE-RH-View"], members: ["PIM-SG-INT-RH-View"], scope: "all devices", tags: ["default"] },
            { name: "INT-RBAC-RH-Full", roles: ["INT-ROLE-RH-Full"], members: ["PIM-SG-INT-RH-Full"], scope: "all devices", tags: ["default"] },
            { name: "INT-RBAC-RH-Elevation", roles: ["INT-ROLE-RH-Elevation"], members: ["PIM-SG-INT-RH-Elevation"], scope: "all devices", tags: ["default"] },
          ],
          customRoles: ["INT-ROLE-RH-View", "INT-ROLE-RH-Full", "INT-ROLE-RH-Elevation"],
        },
        multi: {
          groups: ["PIM-SG-INT-RH-View", "PIM-SG-INT-RH-Full", "PIM-SG-INT-RH-Elevation"],
          assignments: [
            { name: "INT-RBAC-RH-View-Central", roles: ["INT-ROLE-RH-View"], members: ["PIM-SG-INT-RH-View"], scope: "all devices", tags: ["default"] },
            { name: "INT-RBAC-RH-Full-Central", roles: ["INT-ROLE-RH-Full"], members: ["PIM-SG-INT-RH-Full"], scope: "all devices", tags: ["default"] },
            { name: "INT-RBAC-RH-Elevation-Central", roles: ["INT-ROLE-RH-Elevation"], members: ["PIM-SG-INT-RH-Elevation"], scope: "all devices", tags: ["default"] },
          ],
          customRoles: ["INT-ROLE-RH-View", "INT-ROLE-RH-Full", "INT-ROLE-RH-Elevation"],
        },
      },
      // Regional IT: view and full control on the devices of the region only.
      // Elevation and unattended control stay with central IT.
      region: {
        groups: [
          { name: "PIM-SG-INT-RH-View-<REG>", persona: "Regional Remote Help view", template: "GroupJIT", roleAssignable: true, intune: true, description: "Eligible members activate for a shift to view a sharer's screen on the region's devices." },
          { name: "PIM-SG-INT-RH-Full-<REG>", persona: "Regional Remote Help full control", template: "GroupJIT", roleAssignable: true, intune: true, description: "Eligible members activate for a shift to take full control on the region's devices." },
        ],
        assignments: [
          { name: "INT-RBAC-RH-View-<REG>", roles: ["INT-ROLE-RH-View"], members: ["PIM-SG-INT-RH-View-<REG>"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
          { name: "INT-RBAC-RH-Full-<REG>", roles: ["INT-ROLE-RH-Full"], members: ["PIM-SG-INT-RH-Full-<REG>"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
        ],
      },
    },
    rhu: {
      label: "Remote Help unattended",
      requires: "rh",
      description: "Unattended Remote Help: Windows remote sign-in on physical corporate devices (the helper signs in with their own credentials, started from the device page) and, only on request, Android dedicated devices. Both behind approval. Large profiles only.",
      groups: [
        { name: "PIM-SG-INT-RH-Unattended-Win", scope: "rh", persona: "Remote Help Windows unattended", template: "GroupJITTier0", description: "Eligible members activate, with approval and context c1, for two hours to sign in to a physical corporate Windows device with their own credentials through Remote Help. Needs a Remote Desktop policy and Windows LAPS." },
        { name: "PIM-SG-INT-RH-Unattended-Android", scope: "rh", persona: "Remote Help Android unattended", template: "GroupJITApproval", description: "Eligible members activate, with approval, for four hours to start Remote Help on Android Enterprise dedicated devices without the sharer. Use sparingly." },
      ],
      roleDefs: [
        { name: "INT-ROLE-RH-Unattended-Win", description: "CloudFellows PIM framework: Remote Help Windows unattended control remote sign-in (physical corporate devices). Behind approval and context c1.", allowed: ["Microsoft.Intune_RemoteTasks_RequestRemoteAssistance", "Microsoft.Intune_RemoteAssistance_Read", "Microsoft.Intune_ManagedDevices_Read", "Microsoft.Intune_RemoteAssistanceApp_WindowsUnattended"], notAllowed: ["Elevation", "Android unattended control"] },
        { name: "INT-ROLE-RH-Unattended-Android", description: "CloudFellows PIM framework: Remote Help Android unattended control (dedicated devices). Behind approval.", allowed: ["Microsoft.Intune_RemoteTasks_RequestRemoteAssistance", "Microsoft.Intune_RemoteAssistance_Read", "Microsoft.Intune_ManagedDevices_Read", "Microsoft.Intune_RemoteAssistanceApp_Unattended"], notAllowed: ["Elevation", "Windows unattended control"] },
      ],
      byProfile: {
        large: {
          groups: ["PIM-SG-INT-RH-Unattended-Win", "PIM-SG-INT-RH-Unattended-Android"],
          assignments: [
            { name: "INT-RBAC-RH-Unattended-Win", roles: ["INT-ROLE-RH-Unattended-Win"], members: ["PIM-SG-INT-RH-Unattended-Win"], scope: "all devices", tags: ["default"] },
            { name: "INT-RBAC-RH-Unattended-Android", roles: ["INT-ROLE-RH-Unattended-Android"], members: ["PIM-SG-INT-RH-Unattended-Android"], scope: "all devices", tags: ["default"] },
          ],
          customRoles: ["INT-ROLE-RH-Unattended-Win", "INT-ROLE-RH-Unattended-Android"],
        },
        multi: {
          groups: ["PIM-SG-INT-RH-Unattended-Win", "PIM-SG-INT-RH-Unattended-Android"],
          assignments: [
            { name: "INT-RBAC-RH-Unattended-Win-Central", roles: ["INT-ROLE-RH-Unattended-Win"], members: ["PIM-SG-INT-RH-Unattended-Win"], scope: "all devices", tags: ["default"] },
            { name: "INT-RBAC-RH-Unattended-Android-Central", roles: ["INT-ROLE-RH-Unattended-Android"], members: ["PIM-SG-INT-RH-Unattended-Android"], scope: "all devices", tags: ["default"] },
          ],
          customRoles: ["INT-ROLE-RH-Unattended-Win", "INT-ROLE-RH-Unattended-Android"],
        },
      },
    },
    w365: {
      label: "Windows 365",
      description: "Windows 365 Cloud PC support: Reader and Operator access groups for the Cloud PC roles, and a direct group for the Windows 365 Administrator Entra role. Global only: regional Windows 365 is not offered until its scope has been tested.",
      groups: [
        { name: "PIM-SG-INT-W365-Reader", scope: "w365", persona: "Cloud PC reader", template: "GroupJIT", description: "Eligible members activate for a shift to act as Cloud PC Reader. The assignment is made in the Intune admin center (the Cloud PC roles are their own provider)." },
        { name: "PIM-SG-INT-W365-Operator", scope: "w365", persona: "Cloud PC operator", template: "GroupJIT", description: "Eligible members activate for a shift to act as Cloud PC Administrator. The assignment is made in the Intune admin center." },
        { name: "PIM-SG-M365-W365Admin", scope: "w365", path: "direct", persona: "Windows 365 administrator", template: "GroupMember", description: "Direct group: active members, eligible for the Windows 365 Administrator Entra role (provisioning policies, images, network connections)." },
      ],
      entraRoles: [
        { name: "Windows 365 Administrator", templateId: "11451d60-acb2-45eb-a7d6-43d0f0125c13", template: "Tier1", via: ["PIM-SG-M365-W365Admin"], note: "Manages all of Windows 365. Tenant-level objects: central IT only." },
      ],
      cloudPc: [
        { role: "Cloud PC Reader", group: "PIM-SG-INT-W365-Reader" },
        { role: "Cloud PC Administrator", group: "PIM-SG-INT-W365-Operator" },
      ],
      byProfile: {
        small: { groups: ["PIM-SG-INT-W365-Operator"], cloudPc: [{ role: "Cloud PC Administrator", group: "PIM-SG-INT-W365-Operator" }] },
        large: { groups: ["PIM-SG-INT-W365-Reader", "PIM-SG-INT-W365-Operator", "PIM-SG-M365-W365Admin"] },
        multi: { groups: ["PIM-SG-INT-W365-Reader", "PIM-SG-INT-W365-Operator", "PIM-SG-M365-W365Admin"] },
      },
    },
  },
  profiles: {
    small: {
      label: "Small business",
      size: "25 to 250 people, two to six in IT",
      description: "Four persona groups instead of seven; among Tier 0 roles, approval only on Global Administrator through customer-selected approvers; the other Tier 0 roles activate with justification, authentication context c1 and an alert; Tier 1 and Tier 2 activation alerts are Critical; assignment alerts remain All; Global Administrator for two hours; two Intune access groups; three Defender XDR access groups (Admin on the Tier 0 gate, Operator-T3 for all of IT, Reader — T1 and T2 fold into T3 as the desk folds into Ops); three Azure groups, made only when there is Azure.",
      groups: ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-SecOps", "PIM-SG-M365-Ops", "PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Teams", "PIM-SG-M365-Backup-Direct", "PIM-SG-EXO-Recipients", "PIM-SG-PUR-InfoProtection", "PIM-SG-PUR-eDiscovery", "PIM-SG-INT-Ops", "PIM-SG-INT-SecOps", "PIM-SG-XDR-Admin", "PIM-SG-XDR-Operator-T3", "PIM-SG-XDR-Reader", "PIM-SG-AZ-Tenant-Owner", "PIM-SG-AZ-Sub-Owner", "PIM-SG-AZ-Sub-Contributor"],
      merge: { "PIM-SG-M365-Tier0": "PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-Helpdesk": "PIM-SG-M365-Ops", "PIM-SG-M365-AppOps": "PIM-SG-M365-Ops", "PIM-SG-M365-Billing": "PIM-SG-M365-Ops", "PIM-SG-INT-HelpDesk": "PIM-SG-INT-Ops", "PIM-SG-XDR-Operator-T1": "PIM-SG-XDR-Operator-T3", "PIM-SG-XDR-Operator-T2": "PIM-SG-XDR-Operator-T3" },
      templates: {
        Tier0: { ApprovalRequired: false, Approvers: [], description: "Two hours, justification, authentication context c1, alert on every activation — no approval, except on Global Administrator itself (its override)." },
        Tier1: { Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] } },
        GroupJITTier1: { Notification_Activation_Alert: { isDefaultRecipientEnabled: true, notificationLevel: "Critical", Recipients: ["pim-alerts"] } },
      },
      roles: { "Global Administrator": { override: { ActivationDuration: "PT2H", ApprovalRequired: true, Approvers: ["PIM-SG-Approvers"] }, note: "Two hours and approval in the small profile: the GA does real work here; the gate is c1 plus approval by the other admins, not the clock." } },
      regions: false,
      rmau: [],
      intune: {
        assignments: [
          { name: "INT-RBAC-Ops-All", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: [] },
          { name: "INT-RBAC-HelpDesk-All", roles: ["INT-ROLE-HelpDesk"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: [] },
          { name: "INT-RBAC-SecOps-All", roles: ["Endpoint Security Manager"], members: ["PIM-SG-INT-SecOps"], scope: "all devices", tags: [] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: [], note: "Read only: standing through the readers' active membership, like Directory Readers." },
        ],
        customRoles: ["INT-ROLE-HelpDesk"],
        switches: ["Allow access to unlicensed admins"],
      },
    },
    large: {
      label: "Large · one region",
      size: "one country, several IT teams, a service desk, an ITSM tool",
      description: "The teams own their roles: Ops becomes Identity, Workplace and Collab, AppOps becomes Apps, the desk gets a VIP variant for executives, auditors their own readers. Ticketing on Tier 0 and Tier 1 activations; Tier 0 approval by a rota of three (PIM-SG-Approvers-Tier0); executives in the restricted AU AU-RM-Executives, filled by hand. No administrative units per region. All five Defender XDR access groups, Admin on the Tier 0 rota. 4.1: the Teams job group, Backup-Direct, Billing and Data-Direct, the five Purview access groups, Global Secure Access on SecOps.",
      groups: ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-Tier0", "PIM-SG-M365-SecOps", "PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Audit", "PIM-SG-M365-Identity", "PIM-SG-M365-Workplace", "PIM-SG-M365-Collab", "PIM-SG-EXO-Recipients", "PIM-SG-EXO-HelpDesk", "PIM-SG-EXO-Hygiene", "PIM-SG-EXO-Reader", "PIM-SG-PUR-InfoProtection", "PIM-SG-PUR-Records", "PIM-SG-PUR-eDiscovery", "PIM-SG-PUR-InsiderRisk", "PIM-SG-PUR-CommCompliance", "PIM-SG-M365-Teams", "PIM-SG-M365-Backup-Direct", "PIM-SG-M365-Billing", "PIM-SG-M365-Data-Direct", "PIM-SG-M365-Apps", "PIM-SG-M365-ServiceDesk", "PIM-SG-M365-ServiceDesk-VIP", "PIM-SG-INT-Ops", "PIM-SG-INT-HelpDesk", "PIM-SG-INT-SecOps", "PIM-SG-XDR-Admin", "PIM-SG-XDR-Operator-T3", "PIM-SG-XDR-Operator-T2", "PIM-SG-XDR-Operator-T1", "PIM-SG-XDR-Reader", "PIM-SG-AZ-Tenant-Owner", "PIM-SG-AZ-Platform-Owner", "PIM-SG-AZ-Platform-Contributor", "PIM-SG-AZ-Connectivity-Owner", "PIM-SG-AZ-Connectivity-Contributor", "PIM-SG-AZ-Management-Owner", "PIM-SG-AZ-Management-Contributor", "PIM-SG-AZ-LandingZone-Owner", "PIM-SG-AZ-LandingZone-Contributor", "PIM-SG-AZ-Corp-Owner", "PIM-SG-AZ-Corp-Contributor", "PIM-SG-AZ-Online-Owner", "PIM-SG-AZ-Online-Contributor"],
      merge: {},
      approvers: "PIM-SG-Approvers-Tier0",
      templates: {
        Tier0: { ActivationRequirement: "Justification,Ticketing", Approvers: ["PIM-SG-Approvers-Tier0"], description: "Two hours (Global Administrator one), justification and a ticket, authentication context c1, approval by the Tier 0 rota." },
        Tier1: { ActivationRequirement: "MultiFactorAuthentication,Justification,Ticketing", description: "Two hours, MFA, justification and a ticket, no approval; ticket information is required but is not validated against an ITSM system." },
        GroupMember: { Approvers: ["PIM-SG-Approvers-Tier0"] },
        GroupJITTier0: { ActivationRequirement: "Justification,Ticketing", Approvers: ["PIM-SG-Approvers-Tier0"], description: "Two hours, justification and a ticket, authentication context c1, approval by the Tier 0 rota — the Defender XDR administrator group." },
        GroupJITTier1: { ActivationRequirement: "MultiFactorAuthentication,Justification,Ticketing", description: "Job group: four hours, MFA, justification and a ticket; the ticket is required but not validated." },
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
        // 4.1: where the workload roles land when Ops is split into teams.
        "Teams Communications Support Specialist": { via: ["PIM-SG-M365-ServiceDesk"] },
        "Printer Administrator": { via: ["PIM-SG-M365-Workplace"] },
        "Reports Reader": { via: ["PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Audit"] },
        "AI Administrator": { via: ["PIM-SG-M365-Collab"] },
        "AI Reader": { via: ["PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Audit"] },
        "Fabric Administrator": { via: ["PIM-SG-M365-Data-Direct"] },
        "Dynamics 365 Administrator": { via: ["PIM-SG-M365-Collab"] },
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
          { name: "INT-RBAC-HelpDesk", roles: ["INT-ROLE-HelpDesk"], members: ["PIM-SG-INT-HelpDesk"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-SecOps", roles: ["Endpoint Security Manager"], members: ["PIM-SG-INT-SecOps"], scope: "all devices", tags: ["default"] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: ["every"] },
        ],
        customRoles: ["INT-ROLE-HelpDesk"],
        switches: ["Allow access to unlicensed admins", "Scoped permissions (preview): run the Permissions Assessment Report first; the switch is one-way"],
      },
    },
    multi: {
      label: "Large · multi-region",
      size: "several regions: central IT first, then regional IT — no local IT below a region",
      description: "The whole group set at the centre (Tier 0, SecOps, Ops, AppOps, Helpdesk, the readers, the Teams, Backup-Direct and Billing groups, the Intune, Defender XDR, Exchange and Purview access groups) and, per region from the customer's regions.csv: three administrative units, a Helpdesk and an Ops persona group with eligibilities scoped to the region's units, an approver group, two Intune access groups, two Exchange access groups scoped to the region's users, and the Intune scope groups, tag and role assignments. No restricted management AU for admins or PIM-SG groups. Azure is out of scope for this design (12 Oct 2026): no PIM-SG-AZ groups, no Azure section in Deploy.",
      // 4.1: explicit, so that the Azure groups stay out (groups: null meant every group, Azure included).
      groups: ["PIM-SG-M365-GlobalAdmin", "PIM-SG-M365-Tier0", "PIM-SG-M365-SecOps", "PIM-SG-M365-SecOpsReader", "PIM-SG-M365-Ops", "PIM-SG-M365-Helpdesk", "PIM-SG-M365-AppOps", "PIM-SG-M365-Teams", "PIM-SG-M365-Backup-Direct", "PIM-SG-M365-Billing", "PIM-SG-INT-Ops", "PIM-SG-INT-HelpDesk", "PIM-SG-INT-SecOps", "PIM-SG-XDR-Admin", "PIM-SG-XDR-Operator-T3", "PIM-SG-XDR-Operator-T2", "PIM-SG-XDR-Operator-T1", "PIM-SG-XDR-Reader", "PIM-SG-EXO-Recipients", "PIM-SG-EXO-HelpDesk", "PIM-SG-EXO-Hygiene", "PIM-SG-EXO-Reader", "PIM-SG-PUR-InfoProtection", "PIM-SG-PUR-Records", "PIM-SG-PUR-eDiscovery", "PIM-SG-PUR-InsiderRisk", "PIM-SG-PUR-CommCompliance"],
      merge: {},
      templates: {},
      roles: {},
      regions: true,
      rmau: [],
      intune: {
        assignments: [
          { name: "INT-RBAC-PolicyProfile-Central", roles: ["Policy and Profile Manager", "Application Manager"], members: ["PIM-SG-INT-Ops"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-HelpDesk-Central", roles: ["INT-ROLE-HelpDesk"], members: ["PIM-SG-INT-HelpDesk"], scope: "all users and devices", tags: ["default"] },
          { name: "INT-RBAC-SecOps-Central", roles: ["Endpoint Security Manager"], members: ["PIM-SG-INT-SecOps"], scope: "all devices", tags: ["default"] },
          { name: "INT-RBAC-Reader-All", roles: ["Read Only Operator"], members: ["PIM-SG-M365-SecOpsReader"], scope: "all users and devices", tags: ["every"] },
        ],
        customRoles: ["INT-ROLE-Regional-Ops", "INT-ROLE-HelpDesk"],
        switches: ["Allow access to unlicensed admins", "Scoped permissions (preview): run the Permissions Assessment Report first; the switch is one-way"],
      },
    },
  },
  // ---- REGIONS: the template, never the regions ------------------------
  // <REG> is the row's code; <itLead> and <approvers> come from the same row.
  // 5.1 (28 Oct 2026): a region is a list of countries. <userMatch> is
  // user.usageLocation -in [the row's countries] (or attribute -eq value for a
  // row without countries, the 5.0 shape); <deviceTagMatch> is the row's
  // Autopilot group tags ([OrderID]:<tag> in devicePhysicalIds — the deployment
  // profile name in enrollmentProfileName never starts with the tag) OR'ed with
  // its device-name prefixes; <deviceMatch> adds attribute -eq value first for
  // a row without countries. Built by PimBaseline.matches().
  regions: {
    file: "regions.csv",
    columns: ["code", "name", "countries", "attribute", "value", "devicePrefix", "autopilotTag", "itLead", "approvers", "timezone"],
    required: ["code", "name"],
    defaults: { attribute: "extensionAttribute1", value: "<code>", devicePrefix: "<last segment of code>- (none for a row with countries)", autopilotTag: "<code>" },
    example: [
      "code,name,countries,autopilotTag,itLead,approvers,timezone",
      "EURO,Europe,GB;BE;NL;LU;DE;FR,EURO,it-lead-eu@contoso.nl,\"a@contoso.nl;b@contoso.nl\",Europe/Amsterdam",
      "AMER,Americas,US;MX;CA,AMER,it-lead-am@contoso.nl,\"c@contoso.nl;d@contoso.nl\",America/New_York",
    ].join("\n"),
    codePattern: "^[A-Z]{2,8}(-[A-Z0-9]{2,6}){0,2}$",
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
      country: "^[A-Z]{2}$",
      name: "^[^\u0000-\u001f\"<>]{1,64}$",
      email: "^[^@\\s\"<>(),;]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
      timezone: "^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$",
    },
    maxRows: 250,
    maxBytes: 262144,
    template: {
      aus: [
        { name: "AU-<REG>-Users", kind: "dynamic", type: "user", rule: "(<userMatch>) -and (user.userType -eq \"Member\") -and (user.userPrincipalName -notStartsWith \"adm-\")", note: "P1 per member; one object type per dynamic unit; members only, never an adm- account (5.1, as cloudfellows.dev has it)" },
        { name: "AU-<REG>-Devices", kind: "dynamic", type: "device", rule: "<deviceMatch>", note: "devices have no usageLocation: the Autopilot group tag, then the name prefixes" },
        { name: "AU-<REG>-Groups", kind: "assigned", type: "group", note: "dynamic units cannot hold groups; the region adds its own" },
      ],
      groups: [
        { name: "PIM-SG-<REG>-Helpdesk", persona: "Regional first line", path: "direct", template: "GroupMember", roleAssignable: true, description: "Regional role group (5.0): active members, the group eligible at the region's units per role; a member activates password, authentication or licence work on the region's people — never on an admin." },
        { name: "PIM-SG-<REG>-Ops", persona: "Regional second line", path: "direct", template: "GroupMember", roleAssignable: true, description: "Regional role group (5.0): active members, the group eligible at the region's units per role for the region's users, groups and devices." },
        { name: "PIM-SG-INT-HelpDesk-<REG>", persona: "Regional Intune first line", template: "GroupJIT", roleAssignable: true, intune: true, description: "Eligible members activate to act as the Intune first line (INT-ROLE-HelpDesk) on the region's devices." },
        { name: "PIM-SG-INT-Ops-<REG>", persona: "Regional Intune second line", template: "GroupJIT", roleAssignable: true, intune: true, description: "Eligible members activate to act as INT-ROLE-Regional-Ops on the region's devices." },
        { name: "PIM-SG-<REG>-Approvers", persona: "Regional approvers", template: null, roleAssignable: false, members: "<approvers>", description: "Plain security group populated from the region's approver input. An optional regional approval gate must be configured explicitly; the default templates do not reference this group." },
        // 4.1 (13 Oct 2026): regional Exchange — global IT first, then regional
        // IT. A role group cannot be scoped per member, so each regional group
        // gets DIRECT Exchange role assignments scoped to the user unit of the region
        // (Graph beta, Exchange provider, directoryScopeId = the unit; needs
        // RoleManagement.ReadWrite.Exchange). Hygiene and Reader stay central.
        { name: "PIM-SG-EXO-Recipients-<REG>", persona: "Regional recipients", template: "GroupJIT", roleAssignable: true, exchange: { roles: ["Distribution Groups", "Mail Recipient Creation", "Mail Recipients", "Message Tracking", "Migration", "Move Mailboxes", "Recipient Policies", "Reset Password"], au: "AU-<REG>-Users" }, description: "Eligible members activate for a shift for the mailboxes, contacts and groups of the region only: the Recipient Management roles, scoped to AU-<REG>-Users." },
        { name: "PIM-SG-EXO-HelpDesk-<REG>", persona: "Regional Exchange first line", template: "GroupJIT", roleAssignable: true, exchange: { roles: ["Reset Password", "User Options", "View-Only Recipients"], au: "AU-<REG>-Users" }, description: "Eligible members activate for a shift to view and change recipient properties of the region only: the Help Desk roles, scoped to AU-<REG>-Users." },
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
          { name: "INT-SG-USR-<REG>-All", type: "user", rule: "(<userMatch>) -and (user.accountEnabled -eq true) -and (user.userType -eq \"Member\") -and (user.userPrincipalName -notStartsWith \"adm-\")" },
          { name: "INT-SG-DEV-<REG>-All", type: "device", rule: "<deviceTagMatch>" },
        ],
        assignments: [
          { name: "INT-RBAC-HelpDesk-<REG>", roles: ["INT-ROLE-HelpDesk"], members: ["PIM-SG-INT-HelpDesk-<REG>"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
          { name: "INT-RBAC-Ops-<REG>", roles: ["INT-ROLE-Regional-Ops"], members: ["PIM-SG-INT-Ops-<REG>"], scopeGroups: ["INT-SG-USR-<REG>-All", "INT-SG-DEV-<REG>-All"], tags: ["INT-TAG-<REG>"] },
        ],
        autopilot: { profile: "Autopilot · <REG>", groupTag: "<autopilotTag>", naming: "the customer's own (a prefix in devicePrefix is matched too)" },
      },
      review: { name: "Access review · <REG>", scope: "PIM-SG-<REG>-Helpdesk, PIM-SG-<REG>-Ops, PIM-SG-INT-HelpDesk-<REG>, PIM-SG-INT-Ops-<REG>, PIM-SG-EXO-Recipients-<REG>, PIM-SG-EXO-HelpDesk-<REG>", reviewer: "<itLead>", cadence: "yearly", manual: true },
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
    // 4.0 (12 Oct 2026): the built-in Help Desk Operator also carries Remote Help Elevation and Android unattended control
    // (read on cloudfellows.dev and gimi), so the first line held them with no approval. The first line of the framework is this
    // role: every permission of the built-in role (95 on cloudfellows.dev, 12 Oct 2026) except those two. Elevation and
    // unattended control are roles of the Remote Help module, behind approval.
    { name: "INT-ROLE-HelpDesk", description: "CloudFellows PIM framework: first line. Everything the built-in Help Desk Operator does except Remote Help Elevation and Android unattended control, which are separate roles behind approval.",
      allowed: [
        "Microsoft.Intune_MobileApps_Read", "Microsoft.Intune_MobileApps_Assign", "Microsoft.Intune_DeploymentPlans_Read",
        "Microsoft.Intune_ManagedApps_Read", "Microsoft.Intune_ManagedApps_Assign", "Microsoft.Intune_ManagedApps_Wipe",
        "Microsoft.Intune_ManagedDevices_Read", "Microsoft.Intune_ManagedDevices_Update", "Microsoft.Intune_ManagedDevices_SetPrimaryUser",
        "Microsoft.Intune_ManagedDevices_ViewReports", "Microsoft.Intune_RemoteTasks_Wipe", "Microsoft.Intune_RemoteTasks_TemporarilySuspendManagedHomeScreen",
        "Microsoft.Intune_RemoteTasks_RestoreManagedHomeScreen", "Microsoft.Intune_RemoteTasks_Retire", "Microsoft.Intune_RemoteTasks_RemoteLock",
        "Microsoft.Intune_RemoteTasks_ResetPasscode", "Microsoft.Intune_RemoteTasks_EnableLostMode", "Microsoft.Intune_RemoteTasks_DisableLostMode",
        "Microsoft.Intune_RemoteTasks_LocateDevice", "Microsoft.Intune_RemoteTasks_PlayLostModeSound", "Microsoft.Intune_RemoteTasks_SetDeviceName",
        "Microsoft.Intune_RemoteTasks_RebootNow", "Microsoft.Intune_RemoteTasks_ShutDown", "Microsoft.Intune_RemoteTasks_RequestRemoteAssistance",
        "Microsoft.Intune_RemoteTasks_EnableWindowsIntuneAgent", "Microsoft.Intune_RemoteTasks_CleanPC", "Microsoft.Intune_RemoteTasks_ManageSharedDeviceUsers",
        "Microsoft.Intune_RemoteTasks_SyncDevice", "Microsoft.Intune_RemoteTasks_WindowsDefender", "Microsoft.Intune_RemoteTasks_RotateBitLockerKeys",
        "Microsoft.Intune_RemoteTasks_UpdateDeviceAccount", "Microsoft.Intune_RemoteTasks_RevokeAppleVppLicenses", "Microsoft.Intune_RemoteTasks_CustomNotification",
        "Microsoft.Intune_RemoteTasks_ActivateDeviceEsim", "Microsoft.Intune_RemoteTasks_RemoveDeviceEsim", "Microsoft.Intune_RemoteTasks_InitiateMDMKeyRecovery",
        "Microsoft.Intune_RemoteTasks_InitiateDeviceAttestation", "Microsoft.Intune_RemoteTasks_OnDemandProactiveRemediation", "Microsoft.Intune_RemoteTasks_ChangeAssignments",
        "Microsoft.Intune_DeviceConfigurations_Read", "Microsoft.Intune_DeviceConfigurations_ViewReports", "Microsoft.Intune_DeviceCompliancePolices_Read",
        "Microsoft.Intune_DeviceCompliancePolices_ViewReports", "Microsoft.Intune_TelecomExpenses_Read", "Microsoft.Intune_RemoteAssistance_Read",
        "Microsoft.Intune_RemoteAssistanceApp_ViewScreen", "Microsoft.Intune_RemoteAssistanceApp_TakeFullControl", "Microsoft.Intune_Organization_Read",
        "Microsoft.Intune_EndpointProtection_Read", "Microsoft.Intune_EnrollmentProgramToken_Read", "Microsoft.Intune_AppleEnrollmentProfiles_Read",
        "Microsoft.Intune_AppleDeviceSerialNumbers_Read", "Microsoft.Intune_DeviceEnrollmentManagers_Read", "Microsoft.Intune_CorporateDeviceIdentifiers_Read",
        "Microsoft.Intune_TermsAndConditions_Read", "Microsoft.Intune_Roles_Read", "Microsoft.Intune_AndroidSync_Read",
        "Microsoft.Intune_Audit_Read", "Microsoft.Intune_RemoteTasks_GetFileVaultKey", "Microsoft.Intune_RemoteTasks_RotateFileVaultKey",
        "Microsoft.Intune_SecurityBaselines_Read", "Microsoft.Intune_ASRPolicy_Read", "Microsoft.Intune_EDRPolicy_Read",
        "Microsoft.Intune_AppControlPolicy_Read", "Microsoft.Intune_PolicySets_Read", "Microsoft.Intune_RemoteTasks_ConfigurationManagerAction",
        "Microsoft.Intune_RemoteTasks_DeviceLogs", "Microsoft.Intune_RemoteTasks_TriggerEnhancedLogCollection", "Microsoft.Intune_RemoteTasks_CancelEnhancedLogCollection",
        "Microsoft.Intune_AssignmentFilter_Read", "Microsoft.Intune_EndpointAnalytics_Read", "Microsoft.Intune_MicrosoftDefenderATP_Read",
        "Microsoft.Intune_MicrosoftStoreForBusiness_Read", "Microsoft.Intune_WindowsEnterpriseCertificate_Read", "Microsoft.Intune_PartnerDeviceManagement_Read",
        "Microsoft.Intune_MobileThreatDefense_Read", "Microsoft.Intune_CertificateConnector_Read", "Microsoft.Intune_DerivedCredentials_Read",
        "Microsoft.Intune_Customization_Read", "Microsoft.Intune_AndroidFota_Read", "Microsoft.Intune_CloudAttach_ResourceExplorer",
        "Microsoft.Intune_CloudAttach_ClientDetails", "Microsoft.Intune_CloudAttach_Timeline", "Microsoft.Intune_CloudAttach_Collections",
        "Microsoft.Intune_CloudAttach_Applications", "Microsoft.Intune_CloudAttach_ApplicationActions", "Microsoft.Intune_CloudAttach_CMPivot",
        "Microsoft.Intune_CloudAttach_Scripts", "Microsoft.Intune_CloudAttach_ScriptActions", "Microsoft.Intune_CloudAttach_SoftwareUpdates",
        "Microsoft.Intune_CloudAttach_EnrollNow", "Microsoft.Intune_ServiceNow_ViewIncidents", "Microsoft.Intune_AdminTasks_Read",
      ],
      notAllowed: ["Remote Help Elevation", "Remote Help Android unattended control", "Remote Help Windows unattended control remote sign-in"] },
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
    "Intune RBAC is part of the framework: Deploy plans supported roles, tags and assignments; T53 reads and compares them. Privileged access uses PIM-SG-INT groups; SecOpsReader has the explicit standing Read Only Operator exception. Defender XDR (2.2): the five PIM-SG-XDR access groups are the framework's Entra side — Deploy creates them and their membership policies, T48 compares them; the Defender XDR roles, their permissions, the assignments that name the groups and the data sources are made in the Defender portal, separately, and are never read or written here. Purview workload RBAC remains separate.",
    "People are never in the catalog: active persona members and eligible Intune and Defender XDR members are added by an administrator (or an access package) and reviewed yearly.",
    "Azure RBAC: Deploy creates optional PIM-SG-AZ groups only (small and large one-region; out of scope for multi-region). ARM assignments and Azure PIM policies at management group or subscription scopes are separate. Roles and assignments offers an Azure RBAC read; Baseline does not provision ARM assignments.",
    "Where no API exists, Deploy generates the script (4.1): Exchange and Purview role group membership, the regional Exchange scopes until the Exchange provider write is consented, and the per-customer bindings of a SharePoint site, a Fabric workspace or a Dataverse environment to a PIM-SG-SPO, PIM-SG-FAB or PIM-SG-PP access group. The script carries the object ids, performs the actions and writes an outcome file that Deploy reads back; nothing is typed by hand.",
    "Global Secure Access (4.1) is in every design: Global Secure Access Administrator at Tier 0 and the Log Reader on SecOps (SecOps-Direct folded in, 5.0). Private Access stays with Application Administrator, GSA-based Conditional Access with Conditional Access Administrator on SecOps.",
  ],
};
