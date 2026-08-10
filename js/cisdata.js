// ======================================================================
// CIS Microsoft 365 Foundations Benchmark v7.0.0 (released 2026-05-20) —
// section 5.2.2 Conditional Access: the recommendations ENCA can assess
// automatically from the tenant's CA policies, named locations and
// authentication strengths.
//
// This file holds only recommendation NUMBERS, TITLES, profile levels and
// ENCA's own summaries of the machine-checkable audit criteria (expressed
// as code in cischeck.js). The benchmark's full description, rationale,
// impact and remediation text is NOT reproduced here — the CIS Benchmark
// is © Center for Internet Security, Inc. and its terms do not allow
// republishing the document. Consult the benchmark PDF (free from
// cisecurity.org) for the full text of each recommendation.
//
// Scope note: the benchmark covers all of Microsoft 365 (Exchange,
// SharePoint, Teams, Defender, Purview, …). ENCA is a Conditional Access
// tool, so this view assesses exactly the 17 automated recommendations of
// section 5.2.2 — a CA compliance slice, not a full M365 benchmark scan.
// ======================================================================
const CIS_BENCHMARK = {
  name: "CIS Microsoft 365 Foundations Benchmark",
  version: "7.0.0",
  released: "2026-05-20",
  // Catalog revision of THIS file — the CIS tool's own release track. Bump it
  // whenever the control set or the assessment criteria change (a new
  // benchmark version, an added control, a corrected criterion), independent
  // of the app build and of the other tools' versions. Shown in the tool
  // header and in the Markdown report so a reviewer can tell which catalog
  // produced a given assessment.
  revision: "2026-08-10 r3",
  section: "5.2.2 Conditional Access",
  copyright: "Recommendation numbers and titles referenced from the CIS Microsoft 365 Foundations Benchmark v7.0.0, © Center for Internet Security, Inc. Assessment logic is ENCA's own implementation of the benchmark's Graph audit procedures.",

  // The benchmark's minimum directory-role set for the administrator-scoped
  // policies (5.2.2.1 / .4 / .5). Role TEMPLATE ids are identical in every
  // tenant (learn.microsoft.com/entra/identity/role-based-access-control/permissions-reference).
  adminRoles: {
    "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3": "Application Administrator",
    "c4e39bd9-1100-46d3-8c65-fb160da0071f": "Authentication Administrator",
    "b0f54661-2d74-4c50-afa3-1ec803f12efe": "Billing Administrator",
    "158c047a-c907-4556-b7ef-446551a6b5f7": "Cloud Application Administrator",
    "b1be1c3e-b65d-4f19-8427-f6fa0d97feb9": "Conditional Access Administrator",
    "29232cdf-9323-42fd-ade2-1d097af3e4de": "Exchange Administrator",
    "62e90394-69f5-4237-9190-012177145e10": "Global Administrator",
    "f2ef992c-3afb-46b9-b7cf-a126ee74c451": "Global Reader",
    "729827e3-9c14-49f7-bb1b-9608f156bbb8": "Helpdesk Administrator",
    "966707d0-3269-4727-9be2-8c3a10f19b9d": "Password Administrator",
    "7be44c8a-adaf-4e2a-84d6-ab2649e08a13": "Privileged Authentication Administrator",
    "e8611ab8-c189-46e8-94e1-60213ab1f814": "Privileged Role Administrator",
    "194ae4cb-b126-40b2-bd5b-6091b380977d": "Security Administrator",
    "f28a1f50-f6e7-4571-818b-6a12f2af6b6c": "SharePoint Administrator",
    "fe930be7-5e62-47db-91af-98c3a49a38b1": "User Administrator",
  },

  // Well-known application ids used by the checks.
  apps: {
    intuneEnrollment: "d4ebce55-015a-49b5-a083-c84d1797ae8c",
    exchangeOnline: "00000002-0000-0ff1-ce00-000000000000",
    sharePointOnline: "00000003-0000-0ff1-ce00-000000000000",
    teamsServices: "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe",
  },

  // level: 1|2 (CIS profile). e5Only: needs Entra ID P2 / E5 (Identity
  // Protection risk conditions). what: ENCA's one-line summary of the goal.
  // checks: human-readable list of the machine criteria cischeck.js applies —
  // shown in the UI so a reviewer can see exactly what passed or failed.
  controls: [
    {
      id: "5.2.2.1", level: 1, e5Only: false,
      title: "Ensure multifactor authentication is enabled for all users in administrative roles",
      what: "An enabled policy that requires MFA (or an authentication strength) on all resources for the benchmark's 15 administrator directory roles.",
      checks: ["admin scope: includeRoles covers the 15 benchmark admin roles, OR an admin persona group (noted when used — the benchmark audit reads includeRoles)", "resources: All", "grant: mfa OR an authentication strength", "state: enabled"],
    },
    {
      id: "5.2.2.2", level: 1, e5Only: false,
      title: "Ensure multifactor authentication is enabled for all users",
      what: "An enabled policy that requires MFA (or an authentication strength) for All users on All resources.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "grant: mfa OR an authentication strength", "state: enabled"],
    },
    {
      id: "5.2.2.3", level: 1, e5Only: false,
      title: "Enable Conditional Access policies to block legacy authentication",
      what: "An enabled policy that blocks the legacy client app types (Exchange ActiveSync and Other clients) for All users on All resources.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "client app types: exchangeActiveSync AND other", "grant: block", "state: enabled"],
    },
    {
      id: "5.2.2.4", level: 1, e5Only: false,
      title: "Ensure Sign-in frequency is enabled and browser sessions are not persistent for Administrative users",
      what: "An enabled policy for the admin roles with sign-in frequency at most 4 hours (or every time) and persistent browser sessions set to never.",
      checks: ["admin scope: includeRoles covers the 15 benchmark admin roles, OR an admin persona group (noted when used)", "resources: All", "session: sign-in frequency everyTime or ≤ 4 hours", "session: persistent browser = never", "state: enabled"],
    },
    {
      id: "5.2.2.5", level: 2, e5Only: false,
      title: "Ensure 'Phishing-resistant MFA strength' is required for Administrators",
      what: "An enabled policy granting an authentication strength limited to phishing-resistant methods (FIDO2 / Windows Hello / certificate MFA) for the admin roles on All resources.",
      checks: ["admin scope: includeRoles covers the 15 benchmark admin roles, OR an admin persona group (noted when used)", "resources: All", "grant: authentication strength whose allowed combinations are only windowsHelloForBusiness / fido2 / x509CertificateMultiFactor", "state: enabled"],
    },
    {
      id: "5.2.2.6", level: 1, e5Only: true,
      title: "Enable Identity Protection user risk policies",
      what: "An enabled policy on user risk High (at least) for All users on All resources that requires MFA plus a password change, with sign-in frequency every time.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "condition: userRiskLevels includes high", "grant: passwordChange AND (mfa OR strength)", "session: sign-in frequency everyTime", "state: enabled"],
    },
    {
      id: "5.2.2.7", level: 1, e5Only: true,
      title: "Enable Identity Protection sign-in risk policies",
      what: "An enabled policy on sign-in risk High and Medium for All users on All resources that requires MFA (a block also satisfies), with sign-in frequency every time.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "condition: signInRiskLevels includes high AND medium", "grant: mfa OR strength (block satisfies grant+session)", "session: sign-in frequency everyTime", "state: enabled"],
    },
    {
      id: "5.2.2.8", level: 2, e5Only: true,
      title: "Ensure 'sign-in risk' is blocked for medium and high risk",
      what: "An enabled policy that blocks sign-in risk High and Medium for All users on All resources, with no resource exclusions.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All, no resource exclusions", "condition: signInRiskLevels includes high AND medium", "grant: block", "state: enabled"],
    },
    {
      id: "5.2.2.9", level: 1, e5Only: false,
      title: "Ensure a managed device is required for authentication",
      what: "An enabled policy for All users on All resources granting compliant device (optionally OR hybrid-joined) and nothing else, with the OR operator.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "grant: compliantDevice (optionally + domainJoinedDevice), no other controls", "operator: OR (a single control also satisfies)", "state: enabled"],
    },
    {
      id: "5.2.2.10", level: 1, e5Only: false,
      title: "Ensure a managed device is required to register security information",
      what: "An enabled policy on the Register security information user action for All users granting compliant device (optionally OR hybrid-joined) and nothing else.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "user action: urn:user:registersecurityinfo", "grant: compliantDevice (optionally + domainJoinedDevice), no other controls", "operator: OR (a single control also satisfies)", "state: enabled"],
    },
    {
      id: "5.2.2.11", level: 1, e5Only: false,
      title: "Ensure sign-in frequency for Intune Enrollment is set to 'Every time'",
      what: "An enabled policy on the Microsoft Intune Enrollment app for All users requiring MFA with sign-in frequency every time.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: include Microsoft Intune Enrollment (d4ebce55-…)", "grant: mfa OR strength", "session: sign-in frequency everyTime", "state: enabled"],
    },
    {
      id: "5.2.2.12", level: 1, e5Only: false,
      title: "Ensure the device code sign-in flow is blocked",
      what: "An enabled policy that blocks the device code authentication flow for All users on All resources.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "condition: authenticationFlows.transferMethods includes deviceCodeFlow", "grant: block", "state: enabled"],
    },
    {
      id: "5.2.2.13", level: 1, e5Only: false,
      title: "Ensure that periodic reauthentication is required for all users",
      what: "An enabled non-risk policy for All users on All resources with time-based sign-in frequency of 7 days or less.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "no risk conditions on the policy", "session: sign-in frequency ≤ 7 days (every time also satisfies)", "state: enabled"],
    },
    {
      id: "5.2.2.14", level: 2, e5Only: false,
      title: "Ensure trusted 'named locations' are defined",
      what: "At least one IP-range named location marked as trusted with at least one range defined. Assessed from named locations, not policies.",
      checks: ["named locations: at least one ipNamedLocation with isTrusted = true and ≥ 1 IP range"],
    },
    {
      id: "5.2.2.15", level: 2, e5Only: false,
      title: "Ensure exclusionary geographic access controls are utilized",
      what: "An enabled policy for All users on All resources that blocks at least one untrusted included location while excluding the trusted locations.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "network: include ≥ 1 untrusted location", "network: exclude AllTrusted or ≥ 1 trusted location", "grant: block", "state: enabled"],
    },
    {
      id: "5.2.2.16", level: 2, e5Only: false,
      title: "Ensure Token Protection is enforced for session tokens",
      what: "An enabled policy with token protection (secure sign-in session) on at least Exchange Online, SharePoint Online and Teams Services, Windows platform, mobile apps and desktop clients.",
      checks: ["users: not none", "resources: include EXO + SPO + Teams Services (or All)", "platforms: include windows", "client app types: mobileAppsAndDesktopClients only", "session: secureSignInSession enabled", "state: enabled"],
    },
    {
      id: "5.2.2.17", level: 1, e5Only: false,
      title: "Ensure authentication transfer is blocked",
      what: "An enabled policy that blocks the authentication transfer flow for All users on All resources.",
      checks: ["users: All (a CAD- pilot deployment group is accepted, noted when used)", "resources: All", "condition: authenticationFlows.transferMethods includes authenticationTransfer", "grant: block", "state: enabled"],
    },
  ],
};
