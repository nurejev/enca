// ======================================================================
// ➕ Joey Verlinden+ — the additions ENCA ships beside Joey's release
// (beta 33109, Mihai 3 Nov: "update enca direct — ik neem aan dat dit net
// zoals de e-admins dan toegevoegd worden als Joey+").
//
// Joey's baseline has no compliant network, no app-protection grant on
// phones and no office-only Intune enrollment. The Joey Verlinden+ release
// (R26.11, decisions of 30 Oct) adds them, the same way the E-Admins
// (js/eadminsData.js) are added: a bundle in the raw backup shape, merged
// into a Joey import by Importer.mergeShared, expected by 🧬 Baseline under
// the Joey catalog as a ➕ Joey+ section (Baseline.sharedPolicies), and never
// removed by a new import of Joey's repository. If Joey ever publishes his
// own policy on one of these numbers, the name decides (as for the E-Admins):
// the collision is reported, nothing is overwritten.
//
//   CA018  Windows Intune enrollment only from a trusted location (the
//          office) — docs/WORKFILE-CA018-IntuneEnrollment-Office-2026-10-30.md;
//          lands as the run lands (Report-only)
//   CA019  phones and tablets only through apps under an app protection
//          policy — as SMB CA009; lands as the run lands (Report-only)
//   CA020–CA023  users AND admins only through the Global Secure Access
//          client, one policy per platform (Windows, macOS, iOS, Android) —
//          as SMB CA201–CA204 before 1.0.9 and CloudFellows CA215–CA218
//          (decision 30 Oct: every admin through GSA, external admins
//          exempt); land Off until 🌐 Global Secure Access shows the chain
//          green (forceOff)
//
// Names follow Joey's convention: CAnnn-Persona-Goal-App-Platform-Action,
// no version, persona Global (CA000–CA099), exclusion group
// "<policy name> - Exclude" in CA-RMAU-Global-Exclusions. Externals left out
// of CA020–CA023: guests and service providers (GDAP) by user type, the
// external admins by CAB-SEC-U-ExternalAdmins (filled by hand, reviewed every
// quarter, in CA-RMAU-Global-Exclusions), and CA-ServiceAccounts.
//
// The group ids are placeholders, never written into a tenant: the import
// turns them into names (Importer.prepareBundle) and creates or finds this
// tenant's own groups.
// ======================================================================
const JOEY_PLUS = (() => {
  const INTUNE = "0000000a-0000-0000-c000-000000000000";        // Microsoft Intune
  const INTUNE_ENROLL = "d4ebce55-015a-49b5-a083-c84d1797ae8c"; // Microsoft Intune Enrollment
  const DRS = "01cb2876-7ebd-4aa4-9cc9-d28bd4d359a9";           // Device Registration Service
  const DEFENDER_XPLAT = "a0e84e36-b067-4d5c-ab4a-3db38e598ae2";// MicrosoftDefenderATP XPlat
  const DEFENDER_TVM = "e724aa31-0f56-4018-b8be-f8cb82ca1196";  // Microsoft Defender for Mobile TVM
  const CRED_CONFIG = "ea890292-c8c8-4433-b5ea-b09d0668e1a6";   // Azure Credential Configuration Endpoint Service
  const CN_LOCATION = "3d46dbda-8382-466a-856d-eb00cbc6b910";   // All Compliant Network locations (Microsoft's, every tenant)
  // the two roles the directory sync accounts hold — out of every all-users
  // all-resources policy, as security defaults and SMB Basic leave them out
  const SYNC_ROLES = ["d29b2b05-8046-44ba-8758-1e26182fcf32", "a92aed5d-d78a-4d16-b381-09adb37eb3b0"];
  const SYNC_TXT = ["Directory Synchronization Accounts (role)", "On Premises Directory Sync Account (role)"];
  const XG = "Guests and external users (all types, incl. service providers)";
  const BG = "CA-BreakGlassAccounts - Exclude";      // Joey's break-glass group
  const SA = "CA-ServiceAccounts";                   // Joey's service-accounts group
  const XA = "CAB-SEC-U-ExternalAdmins";             // external admins (Joey+ 1.2)
  const gid = (n) => `7a7a0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const G_BG = gid(999999), G_SA = gid(999998), G_XA = gid(999997);
  const EXT = () => ({
    guestOrExternalUserTypes: "internalGuest,b2bCollaborationGuest,b2bCollaborationMember,b2bDirectConnectUser,otherExternalUser,serviceProvider",
    externalTenants: { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" },
  });
  const users = (num, extraGroups) => ({ includeUsers: ["All"], excludeUsers: [], includeGroups: [], includeRoles: [],
    excludeRoles: SYNC_ROLES.slice(), excludeGroups: [gid(num), G_BG, ...(extraGroups || [])], excludeGuestsOrExternalUsers: EXT() });
  const apps = (o) => ({ includeApplications: ["All"], excludeApplications: [], includeUserActions: [], includeAuthenticationContextClassReferences: [], ...(o || {}) });
  const cond = (u, extra) => ({ clientAppTypes: ["all"], userRiskLevels: [], signInRiskLevels: [], servicePrincipalRiskLevels: [], applications: apps(), users: u, ...(extra || {}) });
  const block = { operator: "OR", builtInControls: ["block"], customAuthenticationFactors: [], termsOfUse: [] };
  const appProtection = { operator: "OR", builtInControls: ["compliantApplication"], customAuthenticationFactors: [], termsOfUse: [] };
  const excl = (name) => `${name} - Exclude`;

  const P = [];   // { num, name, entry, raw, landsOff }
  const add = (num, name, entry, raw, landsOff) => {
    P.push({ num, name, landsOff: !!landsOff,
      entry: { num, persona: "➕ Joey+", name, include: ["All users"], addition: "Joey+", ...entry,
        exclude: [`${excl(name)} (group)`, `${BG} (group)`, ...(entry.exclude || [])] },
      raw: { displayName: name, state: "disabled", sessionControls: null, ...raw } });
  };

  add(18, "CA018-Global-AttackSurfaceReduction-MicrosoftIntuneEnrollment-Windows-BLOCK-NonTrustedLocations",
    { grant: "Block access", resources: "Microsoft Intune Enrollment", platform: "Windows", network: "Any network or location · − All trusted networks and locations",
      exclude: [XG, ...SYNC_TXT],
      description: "Joey+ addition: blocks Windows Intune enrollment outside the trusted locations (the office). Autopilot v2 (also for personal laptops), Company Portal and 'Add work account' on Windows then only work in the office; macOS, iOS and Android are not affected. Already enrolled devices keep working — check-ins use Microsoft Intune, not Microsoft Intune Enrollment. Needs at least one trusted named location (the office IP); keep it Report-only until there is one." },
    { conditions: cond(users(18), { applications: apps({ includeApplications: [INTUNE_ENROLL] }),
      platforms: { includePlatforms: ["windows"], excludePlatforms: [] },
      locations: { includeLocations: ["All"], excludeLocations: ["AllTrusted"] } }), grantControls: block });

  add(19, "CA019-Global-DataProtection-AllApps-iOSenAndroid-GRANT-RequireAppProtection",
    { grant: "Require app protection policy", resources: "All cloud apps · − MicrosoftDefenderATP XPlat · − Microsoft Defender for Mobile TVM · − Azure Credential Configuration Endpoint Service",
      platform: "iOS, Android", exclude: [XG, ...SYNC_TXT],
      description: "Joey+ addition (as SMB CA009): on a phone or tablet only apps under an Intune app protection policy reach company data — Outlook, Teams, Edge, the Office apps; the built-in mail app, Safari and Chrome are refused. The Defender apps (they carry the Global Secure Access client) and Azure Credential Configuration Endpoint Service (where Authenticator creates a passkey) are left out. Needs the iOS and Android app protection policies assigned (the BYOD release); Joey's CA005 stays beside it." },
    { conditions: cond(users(19), { applications: apps({ excludeApplications: [DEFENDER_XPLAT, DEFENDER_TVM, CRED_CONFIG] }),
      platforms: { includePlatforms: ["iOS", "android"], excludePlatforms: [] } }), grantControls: appProtection });

  for (const [num, label, plat, mobile] of [[20, "Windows", "windows", false], [21, "macOS", "macOS", false], [22, "iOS", "iOS", true], [23, "Android", "android", true]]) {
    const ex = [INTUNE, INTUNE_ENROLL, ...(mobile ? [DEFENDER_XPLAT, DEFENDER_TVM, CRED_CONFIG] : []), DRS];
    add(num, `CA0${num}-Global-AttackSurfaceReduction-AllApps-${label}-BLOCK-OutsideCompliantNetwork`,
      { grant: "Block access", platform: label, network: "Any network or location · − All Compliant Network locations",
        resources: `All cloud apps · − Microsoft Intune · − Microsoft Intune Enrollment${mobile ? " · − MicrosoftDefenderATP XPlat · − Microsoft Defender for Mobile TVM · − Azure Credential Configuration Endpoint Service" : ""} · − Device Registration Service`,
        exclude: [`${XA} (group)`, `${SA} (group)`, XG, ...SYNC_TXT], landsOff: true,
        description: `Joey+ addition: users and admins on ${label} only through the Global Secure Access client of this tenant${mobile ? " (in the Defender app, also BYOD with app protection)" : ""}, so a stolen token is useless elsewhere. External admins (${XA}, filled by hand and reviewed every quarter), guests, GDAP technicians and ${SA} are left out — their devices cannot carry this tenant's client. Intune, Intune Enrollment and Device Registration Service stay reachable so a new device can get the client${mobile ? "; the Defender apps carry it" : ""}. Lands Off until 🌐 Global Secure Access shows the chain green, then Report-only.` },
      { conditions: cond(users(num, [G_XA, G_SA]), { applications: apps({ excludeApplications: ex }),
        platforms: { includePlatforms: [plat], excludePlatforms: [] },
        locations: { includeLocations: ["All"], excludeLocations: [CN_LOCATION] } }), grantControls: block }, true);
  }

  const group = (id, displayName, description) => ({ id, displayName, mailNickname: displayName.replace(/[^A-Za-z0-9]/g, "").slice(0, 60),
    description, securityEnabled: true, mailEnabled: false, groupTypes: [] });
  const groups = [
    group(G_BG, BG, "Break-glass (emergency access) accounts — excluded from every policy in the Conditional Access Baseline by Joey Verlinden. Keep it to the emergency accounts only."),
    group(G_SA, SA, "Service accounts targeted by the CA300 block of the Conditional Access Baseline by Joey Verlinden."),
    group(G_XA, XA, "External admins who cannot run this tenant's Global Secure Access client — left out of CA020–CA023 (Joey+). Filled by hand; review every quarter."),
    ...P.map((p) => group(gid(p.num), excl(p.name), `Exclusion group for ${p.name} (Joey Verlinden+ addition). Members are exempt from that one policy.`)),
  ];
  const source = { label: "ENCA's Joey+ additions (CA018–CA023)", release: "R26.11", read: "2026-11-03" };
  const NAMES = P.map((p) => p.name);
  const lc = (s) => String(s || "").replace(/^\(?(NEW|UP)\)\s*/i, "").trim().toLowerCase();
  const isPlus = (name) => NAMES.some((n) => n.toLowerCase() === lc(name));
  // A fresh copy every time: the importer mutates what it is given.
  const bundle = () => JSON.parse(JSON.stringify({ policies: P.map((p) => p.raw), groups, namedLocations: [], authStrengths: [], authContexts: [], termsOfUse: [] }));
  const entries = () => P.map((p) => JSON.parse(JSON.stringify(p.entry)));
  return {
    bundle, entries, isPlus, source,
    names: () => NAMES.slice(),
    forceOff: P.filter((p) => p.landsOff).map((p) => p.name),
    groupNames: () => groups.map((g) => g.displayName),
    externalAdminsGroup: XA,
    count: P.length,
  };
})();
