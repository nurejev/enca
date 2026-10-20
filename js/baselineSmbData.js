// ======================================================================
// Baseline catalog — SMB Basic (beta 32816, roadmap R91).
//
// Mihai, 19 Oct: "Need a third ca baseline. SMB basic. Security defaults
// with extra like gsa policies and extra requirements for Admins and
// something for the break glass." Mockup approved the same day (canvas
// "ENCA — SMB Basic baseline (mockup)"), with these decisions:
//   * no personas and no PIM: admins are targeted by the directory roles
//     security defaults itself asks MFA of (16, Microsoft Learn, security
//     defaults → Require administrators to do multifactor authentication);
//   * SMB tenants do not enrol admin devices — no compliant-device policy,
//     a compliant network (Global Secure Access) for the admins instead;
//   * security-info registration protected (MFA or a Temporary Access Pass);
//   * an exclusion group per policy and a restricted unit per section; the
//     break-glass unit also holds the break-glass ACCOUNTS (T20 places them);
//   * break-glass sign-in alert: left for later;
//   * no E-Admins and no deploy groups — SMB004, CA101–CA104 and CA901
//     cover the admins and the emergency accounts.
//
// NAMING. The mockup showed SMB001…SMB901. Every ENCA tool identifies a
// policy by the CA number in its name (/CA(\d{3,4})/ — compare, import,
// housekeeping, duplicates, the policy list), so the numbering is kept and
// written the CloudFellows way: CAnnn-KIND-SMB-Persona-…-vX.Y. "SMB" is the
// marker this catalog claims a name by — a CA001 without it is someone
// else's CA001.
//   BASE  CA001–CA009  replaces security defaults (+ registration, device
//                      join, unmanaged desktop sessions — 1.0.2)
//   ADM   CA101–CA104  admins, stricter than security defaults
//   CN    CA201–CA205  Global Secure Access, per platform (as CA215–CA218),
//                      and the unknown platforms (1.0.3)
//   BG    CA901        the break-glass accounts themselves
// Exclusion groups: CAB-SEC-U-SMB-CAnnn-Exclusion, one per policy.
// Restricted units: CA-RMAU-SMB-BASE / -ADM / -CN, and the shared
// CA-RMAU-BreakGlass (also Joey Verlinden's name for it).
//
// The bundle below is what 📥 Import creates from — a raw backup bundle,
// the same shape as js/eadminsData.js, so Importer.prepareBundle turns the
// group ids into names and creates them here. The ids are placeholders and
// are never written into a tenant.
// ======================================================================
const BASELINE_SMB = (() => {
  const RELEASE = "1.0";
  // The 16 roles security defaults asks for MFA on every sign-in
  // (Learn, read 19 Oct 2026). Role TEMPLATE ids — the same in every tenant.
  const ADMIN_ROLES = [
    ["62e90394-69f5-4237-9190-012177145e10", "Global Administrator"],
    ["9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", "Application Administrator"],
    ["c4e39bd9-1100-46d3-8c65-fb160da0071f", "Authentication Administrator"],
    ["b0f54661-2d74-4c50-afa3-1ec803f12efe", "Billing Administrator"],
    ["158c047a-c907-4556-b7ef-446551a6b5f7", "Cloud Application Administrator"],
    ["b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", "Conditional Access Administrator"],
    ["29232cdf-9323-42fd-ade2-1d097af3e4de", "Exchange Administrator"],
    ["729827e3-9c14-49f7-bb1b-9608f156bbb8", "Helpdesk Administrator"],
    ["966707d0-3269-4727-9be2-8c3a10f19b9d", "Password Administrator"],
    ["7be44c8a-adaf-4e2a-84d6-ab2649e08a13", "Privileged Authentication Administrator"],
    ["e8611ab8-c189-46e8-94e1-60213ab1f814", "Privileged Role Administrator"],
    ["194ae4cb-b126-40b2-bd5b-6091b380977d", "Security Administrator"],
    ["f28a1f50-f6e7-4571-818b-6a12f2af6b6c", "SharePoint Administrator"],
    ["fe930be7-5e62-47db-91af-98c3a49a38b1", "User Administrator"],
    ["0526716b-113d-4c15-b2c8-68e3c22b9f80", "Authentication Policy Administrator"],
    ["45d8d3c5-c802-45c6-b32a-1d70b5e1e86e", "Identity Governance Administrator"],
  ];
  const ROLE_IDS = ADMIN_ROLES.map((r) => r[0]);
  const AZURE_MGMT = "797f4846-ba00-4fd7-ba43-dac1f8f63013";   // Windows Azure Service Management API
  const INTUNE = "0000000a-0000-0000-c000-000000000000";       // Microsoft Intune
  const INTUNE_ENROLL = "d4ebce55-015a-49b5-a083-c84d1797ae8c"; // Microsoft Intune Enrollment
  const CN_LOCATION = "3d46dbda-8382-466a-856d-eb00cbc6b910";  // All Compliant Network locations (Microsoft's, every tenant)
  const S_MFA = "00000000-0000-0000-0000-000000000002";        // built-in: Multifactor authentication (TAP included)
  const S_PR = "00000000-0000-0000-0000-000000000004";         // built-in: Phishing-resistant MFA
  const S_PASSKEY = "5b5b0000-0000-4000-8000-0000000000f2";    // custom: SMB - Passkey (FIDO2) (placeholder id)
  // The two roles the directory sync accounts hold (Entra Connect / Cloud
  // Sync). Security defaults leaves them out, so the all-users policies that
  // reach every resource do too — a block outside the compliant network would
  // otherwise stop the sync server, which runs no Global Secure Access client.
  const SYNC_ROLES = [
    ["d29b2b05-8046-44ba-8758-1e26182fcf32", "Directory Synchronization Accounts"],
    ["a92aed5d-d78a-4d16-b381-09adb37eb3b0", "On Premises Directory Sync Account"],
  ];
  const SYNC_IDS = SYNC_ROLES.map((r) => r[0]);
  const SYNC_TXT = SYNC_ROLES.map((r) => `${r[1]} (role)`);
  const L_COUNTRIES = "5b5b0000-0000-4000-8000-0000000000c1";  // SMB - Allowed countries (placeholder id)
  const BG = "CAB-SEC-U-BreakGlass";
  const excl = (num) => `CAB-SEC-U-SMB-CA${String(num).padStart(3, "0")}-Exclusion`;
  // placeholder group ids: one per name, never written into a tenant
  const gid = (n) => `5b5b0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const G_BG = gid(999999);
  // 1.0.3: Teams Rooms, Teams phones and panels and Surface Hub sign in with
  // a resource account nobody sits at — the CloudFellows convention's group,
  // created empty here and filled by 📞 Teams devices (its dynamic rule).
  const TSD = "CAB-SEC-U-TeamsSharedDevices";
  const G_TSD = gid(888888);
  const AZURE_VM_SIGNIN = "372140e0-b3b7-4226-8ef9-d57986796201";   // Azure Windows VM Sign-In
  const DEFENDER_XPLAT = "a0e84e36-b067-4d5c-ab4a-3db38e598ae2";    // MicrosoftDefenderATP XPlat
  const DEFENDER_TVM = "e724aa31-0f56-4018-b8be-f8cb82ca1196";      // Microsoft Defender for Mobile TVM

  // The guest-and-external clause: every type, every tenant. Written with
  // the derived type Graph needs on a create (see js/builder.js guestClause).
  const ALL_EXTERNAL = () => ({
    guestOrExternalUserTypes: "internalGuest,b2bCollaborationGuest,b2bCollaborationMember,b2bDirectConnectUser,otherExternalUser,serviceProvider",
    externalTenants: { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" },
  });

  // ---- the policies: catalog entry (what the tables show) + raw create ----
  // `entry` is the catalog's descriptive half (the CloudFellows entry shape);
  // `raw` is the Graph v1.0 create body before the import maps its groups.
  const P = [];
  // 32817: a policy whose definition changed after 1.0 carries its own
  // version, so a tenant that imported 1.0 sees it as Outdated in 🧬 Baseline
  // and the import can replace it in place.
  const VERSION = { 1: "1.0.1", 2: "1.0.1", 3: "1.0.1", 201: "1.0.1", 202: "1.0.1", 203: "1.0.1", 204: "1.0.1", 901: "1.0.1",
    // 32903 (1.0.2, Mihai 19 Oct, against the guide's Appendix 1 — mockup
    // "ENCA — SMB Basic 1.0.2"): CA005 adds Microsoft Admin Portals; CA007
    // MFA to register or join devices; CA008 unmanaged Windows and Mac
    5: "1.0.2", 7: "1.0.2", 8: "1.0.2",
    // 1.0.3 (Mihai 19 Oct: "make sure every policy has the right exclusions —
    // see the cheese model and the MS Learn modules in ENCA"): the exclusions
    // matrix below, and CA205 for the unknown platforms
    1: "1.0.3", 3: "1.0.3", 8: "1.0.3", 103: "1.0.3", 201: "1.0.3", 202: "1.0.3", 203: "1.0.3", 204: "1.0.3", 205: "1.0.3",
    // 1.0.4 (Mihai 20 Oct: "also make sure the app protection is there with
    // the right exclusions") — CA009
    9: "1.0.4" };
  // the catalog's own release: the newest policy version in it
  const CATALOG_RELEASE = "1.0.4";
  const ADDED_IN = { 7: "1.0.2", 8: "1.0.2", 9: "1.0.4", 205: "1.0.3" };
  const add = (num, kind, persona, words, entry, raw) => {
    const version = VERSION[num] || RELEASE;
    const name = `CA${String(num).padStart(3, "0")}-${kind}-SMB-${persona}-${words}-v${version}`;
    P.push({ num, name, version, entry, raw });
  };
  const users = (o, ex) => ({ includeUsers: [], excludeUsers: [], includeGroups: [], includeRoles: [], excludeRoles: [], excludeGroups: ex, ...o });
  const apps = (o) => ({ includeApplications: ["All"], excludeApplications: [], includeUserActions: [], includeAuthenticationContextClassReferences: [], ...(o || {}) });
  const cond = (u, extra) => ({ clientAppTypes: ["all"], userRiskLevels: [], signInRiskLevels: [], servicePrincipalRiskLevels: [], applications: apps(), users: u, ...(extra || {}) });
  const mfa = { operator: "OR", builtInControls: ["mfa"], customAuthenticationFactors: [], termsOfUse: [] };
  const block = { operator: "OR", builtInControls: ["block"], customAuthenticationFactors: [], termsOfUse: [] };
  const strength = (id) => ({ operator: "OR", builtInControls: [], customAuthenticationFactors: [], termsOfUse: [], authenticationStrength: { id } });
  const ex2 = (num) => [gid(num), G_BG];
  const roles = (num, extra) => users({ includeRoles: ROLE_IDS.slice(), ...(extra || {}) }, ex2(num));
  const everyone = (num, extra) => users({ includeUsers: ["All"], ...(extra || {}) }, ex2(num));
  // all users on all resources: the sync accounts are left out as security defaults leaves them out
  const everyoneButSync = (num, extra) => everyone(num, { excludeRoles: SYNC_IDS.slice(), ...(extra || {}) });
  const internal = (num) => everyone(num, { excludeGuestsOrExternalUsers: ALL_EXTERNAL() });
  const internalButSync = (num) => everyoneButSync(num, { excludeGuestsOrExternalUsers: ALL_EXTERNAL() });
  const ROLES_TXT = `${ADMIN_ROLES.length} directory roles (the security-defaults admin roles)`;
  const XG = "Guests & external users (all types, incl. service providers)";
  const cnPlatform = (p) => ({ platforms: { includePlatforms: [p], excludePlatforms: [] } });
  const cnLoc = { locations: { includeLocations: ["All"], excludeLocations: [CN_LOCATION] } };
  const cnApps = apps({ excludeApplications: [INTUNE, INTUNE_ENROLL] });

  // BASE — replaces security defaults
  add(1, "GRANT", "Global", "AnyApp-AnyPlatform-MFA",
    { persona: "🌐 Base", include: ["All users"], exclude: SYNC_TXT, resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Require multifactor authentication", block: false, session: "",
      replacesSd: true, description: "MFA for every user on every resource — security defaults' 'MFA when necessary', made explicit. Goes On at the ⇄ switch." },
    { conditions: cond(everyoneButSync(1)), grantControls: mfa });
  add(2, "BLOCK", "Global", "AnyApp-AnyPlatform-LegacyAuthentication",
    { persona: "🌐 Base", include: ["All users"], exclude: SYNC_TXT, resources: "All resources", network: "Any network or location", conditions: ["Client apps: Exchange ActiveSync clients, Other clients (legacy authentication)"], grant: "Block access", block: true, session: "",
      replacesSd: true, description: "Blocks every legacy-protocol sign-in (IMAP, POP, SMTP AUTH, Exchange ActiveSync basic), as security defaults does. Goes On at the ⇄ switch." },
    { conditions: cond(everyoneButSync(2), { clientAppTypes: ["exchangeActiveSync", "other"] }), grantControls: block });
  add(3, "BLOCK", "Global", "AnyApp-AnyPlatform-DeviceCodeFlow",
    { persona: "🌐 Base", include: ["All users"], exclude: SYNC_TXT, resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app", "Auth flows: Device code flow, Authentication transfer"], grant: "Block access", block: true, session: "",
      replacesSd: true, description: "Blocks the device code flow and authentication transfer, as security defaults does for new tenants since 1 July 2026. Goes On at the ⇄ switch." },
    { conditions: cond(everyoneButSync(3), { authenticationFlows: { transferMethods: "deviceCodeFlow,authenticationTransfer" } }), grantControls: block });
  add(4, "GRANT", "Admins", "AnyApp-AnyPlatform-MFA",
    { persona: "🌐 Base", include: [ROLES_TXT], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Require multifactor authentication", block: false, session: "",
      replacesSd: true, description: "MFA for the admin roles security defaults names, on every resource. Kept apart from CA001 so an admin is never only as safe as the all-users policy. Goes On at the ⇄ switch." },
    { conditions: cond(roles(4)), grantControls: mfa });
  add(5, "GRANT", "Global", "AdminPortalsAndAzureMgmt-AnyPlatform-MFA",
    { persona: "🌐 Base", include: ["All users"], exclude: SYNC_TXT, resources: "Microsoft Admin Portals · Windows Azure Service Management API", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Require multifactor authentication", block: false, session: "",
      replacesSd: true, description: "MFA for management — the Microsoft admin portals, and Azure Resource Manager (the Azure portal, Azure PowerShell, Azure CLI) — for every user, as security defaults does for Azure and the guide's Appendix 1 asks for both. Goes On at the ⇄ switch." },
    { conditions: { ...cond(everyoneButSync(5)), applications: apps({ includeApplications: ["MicrosoftAdminPortals", AZURE_MGMT] }) }, grantControls: mfa });
  add(6, "GRANT", "Global", "RegisterSecurityInfo-AnyPlatform-MFAorTAP",
    { persona: "🌐 Base", include: ["All users"], exclude: [XG], resources: "User action: register security information", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Authentication strength: Multifactor authentication", block: false, session: "",
      description: "Registering or changing a sign-in method needs MFA — or a Temporary Access Pass, which the built-in Multifactor authentication strength accepts, so a new user's first method is registered with a TAP. Stays Report-only at the switch." },
    { conditions: { ...cond(internal(6)), applications: apps({ includeApplications: [], includeUserActions: ["urn:user:registersecurityinfo"] }) }, grantControls: strength(S_MFA) });
  // 1.0.2: joining a device to Entra needs MFA (or a TAP). Learn: with this
  // user action only MFA or an authentication strength may be granted, no
  // device filter or device state, and the device setting "Require MFA to
  // register or join devices" must be No or the policy is not enforced —
  // the import's pre-flight reads that setting.
  add(7, "GRANT", "Global", "RegisterOrJoinDevices-AnyPlatform-MFA",
    { persona: "🌐 Base", include: ["All users"], exclude: [XG], resources: "User action: register or join devices", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Authentication strength: Multifactor authentication", block: false, session: "",
      description: "Registering or Entra-joining a device needs MFA — or a Temporary Access Pass, so a new laptop is joined with a TAP. Needs Entra ID → Devices → Device settings, Require MFA to register or join devices, set to No." },
    { conditions: { ...cond(internal(7)), applications: apps({ includeApplications: [], includeUserActions: ["urn:user:registerdevice"] }) }, grantControls: strength(S_MFA) });
  // 1.0.2: Windows and Macs that are not Entra joined are unmanaged — hybrid
  // joined, Entra registered and unregistered alike (Mihai: "hybrid is
  // unmanaged in SMB; Mac should be joined just as Windows"). A negative
  // operator also matches a device Entra does not know (Learn, filter for
  // devices). Mobiles stay out: BYOD with app protection, CA203/CA204.
  add(8, "SESSION", "Global", "AnyApp-WindowsOrMacOS-Unmanaged-SIF4h-NeverPersistent",
    { persona: "🌐 Base", include: ["All users"], exclude: SYNC_TXT, resources: "All resources", network: "Any network or location", conditions: ["Platforms: Windows, macOS", "Client apps: Any client app", 'Filter for devices: include device.trustType -ne "AzureAD" (not Entra joined)'], grant: "No controls (grant)", block: false, session: "Sign-in frequency: 4 hours · Persistent browser: never",
      description: "On a Windows PC or Mac that is not Entra joined — hybrid joined, only registered, or unknown — a session lasts 4 hours and is never kept in the browser. Macs count as joined once Platform SSO has registered them. The pre-flight counts the devices that would get it." },
    { conditions: cond(everyoneButSync(8), { platforms: { includePlatforms: ["windows", "macOS"], excludePlatforms: [] }, devices: { deviceFilter: { mode: "include", rule: 'device.trustType -ne "AzureAD"' } } }), grantControls: null,
      sessionControls: { signInFrequency: { value: 4, type: "hours", authenticationType: "primaryAndSecondaryAuthentication", frequencyInterval: "timeBased", isEnabled: true }, persistentBrowser: { mode: "never", isEnabled: true } } });

  // 1.0.4: mobile is BYOD with app protection (Mihai, Oct 2026) — the
  // Conditional Access half of it. Learn ("Require approved client apps or
  // app protection policy with mobile devices"): All users, All resources,
  // iOS and Android, the grant. "Require approved client app" retired on
  // 30 June 2026 (a policy carrying it is read-only), so the grant is
  // "Require app protection policy" alone. Exclusions, each from a check:
  //   guests        — their phone's apps are protected by their own tenant,
  //                   not this one; app protection cannot be met for them
  //   shared devices — Teams Rooms / phones / panels on Android run no app
  //                   protection (surface-hub-mfa, shared-device-unsupported)
  //   Defender mobile apps — they report device posture and carry the Global
  //                   Secure Access client; they are not app-protection apps
  //                   (Learn, Defender for Endpoint mobile, CA exclusions)
  //   sync roles    — the all-users all-resources rule of this catalog
  // NOT excluded: Microsoft Intune / Intune Enrollment (BYOD here is not
  // enrolled; the app protection service itself is immune to Conditional
  // Access) — every extra app exclusion is a hole.
  add(9, "GRANT", "Global", "AnyApp-iOSorAndroid-AppProtection",
    { persona: "🌐 Base", include: ["All users"], exclude: [XG, ...SYNC_TXT], resources: "All resources", network: "Any network or location", conditions: ["Platforms: iOS, Android", "Client apps: Any client app"], grant: "Require app protection policy", block: false, session: "",
      description: "On a phone or tablet only apps under an Intune app protection policy reach company data — Outlook, Teams, Edge, the Office apps; the built-in mail app, Safari and Chrome are refused. Needs app protection policies for iOS and Android assigned to the users (the import's pre-flight checks they exist), Microsoft Authenticator on iOS and Company Portal on Android as the broker." },
    { conditions: cond(internalButSync(9), { platforms: { includePlatforms: ["iOS", "android"], excludePlatforms: [] } }), grantControls: { operator: "OR", builtInControls: ["compliantApplication"], customAuthenticationFactors: [], termsOfUse: [] } });

  // ADM — admins, stricter than security defaults
  add(101, "GRANT", "Admins", "AnyApp-AnyPlatform-PhishingResistantMFA",
    { persona: "🛡 Admins", include: [ROLES_TXT], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Authentication strength: Phishing-resistant MFA", block: false, session: "",
      description: "A passkey, FIDO2 key or Windows Hello for Business for every admin role. Check that every admin — the operator too — has one before it goes On." },
    { conditions: cond(roles(101)), grantControls: strength(S_PR) });
  add(102, "SESSION", "Admins", "AnyApp-AnyPlatform-SIF4h-NeverPersistent",
    { persona: "🛡 Admins", include: [ROLES_TXT], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "No controls (grant)", block: false, session: "Sign-in frequency: 4 hours · Persistent browser: never",
      description: "Admin sessions end after 4 hours and are never kept in the browser." },
    { conditions: cond(roles(102)), grantControls: null,
      sessionControls: { signInFrequency: { value: 4, type: "hours", authenticationType: "primaryAndSecondaryAuthentication", frequencyInterval: "timeBased", isEnabled: true }, persistentBrowser: { mode: "never", isEnabled: true } } });
  add(103, "BLOCK", "Admins", "AnyApp-AnyPlatform-OutsideCompliantNetwork",
    { persona: "🛡 Admins", include: [ROLES_TXT], resources: "All resources · − Microsoft Intune · − Microsoft Intune Enrollment", network: "Any network or location · − All Compliant Network locations", conditions: ["Client apps: Any client app"], grant: "Block access", block: true, session: "",
      landsOff: true, description: "Admins only from a device running the Global Secure Access client — the compliant network, instead of a compliant device (SMB tenants do not enrol admin devices). Lands Off: switch it on once 🌐 Global Secure Access shows the chain green for the admins' devices, before CA201–CA204 reach everyone." },
    { conditions: { ...cond(roles(103), cnLoc), applications: cnApps }, grantControls: block });
  add(104, "BLOCK", "Admins", "AnyApp-AnyPlatform-OutsideAllowedCountries",
    { persona: "🛡 Admins", include: [ROLES_TXT], resources: "All resources", network: "Any network or location · − SMB - Allowed countries", conditions: ["Client apps: Any client app"], grant: "Block access", block: true, session: "",
      description: "Admins are blocked outside the countries in the named location SMB - Allowed countries (the Netherlands by default — adjust it in 📍 Locations)." },
    { conditions: cond(roles(104), { locations: { includeLocations: ["All"], excludeLocations: [L_COUNTRIES] } }), grantControls: block });

  // CN — Global Secure Access, per platform
  const PLAT = [[201, "Windows", "windows"], [202, "macOS", "macOS"], [203, "iOS", "iOS"], [204, "Android", "android"]];
  for (const [num, label, plat] of PLAT) {
    add(num, "BLOCK", "Users", `AnyApp-${label}-OutsideCompliantNetwork`,
      { persona: "🔒 Compliant network", include: ["All users"], exclude: [XG, ...SYNC_TXT], resources: "All resources · − Microsoft Intune · − Microsoft Intune Enrollment", network: "Any network or location · − All Compliant Network locations", conditions: [`Platforms: ${label}`, "Client apps: Any client app"], grant: "Block access", block: true, session: "",
        landsOff: true, description: `Every user on ${label} only through the Global Secure Access client${/iOS|Android/.test(label) ? " (BYOD with app protection)" : ""}, so a stolen token is useless elsewhere. Admins are not excluded. Guests are: their device cannot carry this tenant's client. Lands Off until 🌐 Global Secure Access shows the chain green.` },
      { conditions: { ...cond(internalButSync(num), { ...cnLoc, ...cnPlatform(plat) }), applications: cnApps }, grantControls: block });
  }

  // 1.0.3 — CA205: the Swiss-cheese hole the per-platform policies leave.
  // CA201–CA204 (and CA008) are scoped to platforms; a sign-in whose platform
  // Entra cannot tell (a spoofed or unknown user agent, Linux, ChromeOS) is in
  // none of them. 🛡 Bypass & Swiss cheese: "platform-scoped policies with no
  // unknown-platform block". The CloudFellows answer (CA107, CA204, CA1004):
  // any device except Android, iOS, Windows and macOS is blocked. Lands as
  // the run lands — it waits for nothing.
  add(205, "BLOCK", "Users", "AnyApp-UnknownPlatforms",
    { persona: "🔒 Compliant network", include: ["All users"], exclude: [XG, ...SYNC_TXT], resources: "All resources", network: "Any network or location", conditions: ["Platforms: Any device (excl. Android, iOS, Windows, macOS)", "Client apps: Any client app"], grant: "Block access", block: true, session: "",
      description: "Blocks every sign-in from a platform that is not Android, iOS, Windows or macOS — Linux, ChromeOS and an unknown or spoofed platform — so nobody steps around CA201–CA204 and CA008 by being none of the platforms they name. Check the Report-only results for Linux users before it goes On." },
    { conditions: cond(internalButSync(205), { platforms: { includePlatforms: ["all"], excludePlatforms: ["android", "iOS", "windows", "macOS"] } }), grantControls: block });

  // BG — the emergency accounts
  // Mihai, 19 Oct (on the beta site): "the ca901 change to a passkey. may also
  // be sync passkey". A strength allows METHODS; whether a synced passkey
  // (iCloud Keychain, Google Password Manager) counts is the Passkey (FIDO2)
  // method's passkey profile, not the strength — so the strength is the
  // passkey combination, and the profile decides device-bound or synced.
  add(901, "GRANT", "BreakGlass", "AnyApp-AnyPlatform-Passkey",
    { persona: "🚨 Break-glass", include: [`${BG} (group)`], exclude: [`${excl(901)} (group)`], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Authentication strength: SMB - Passkey (FIDO2)", block: false, session: "",
      description: "The break-glass accounts sign in with a passkey and nothing else — a security key, a passkey in Microsoft Authenticator, or a synced passkey when the Passkey (FIDO2) profile that targets them allows synced passkeys. Excluded from every other SMB policy. Keep it Report-only until both accounts have a passkey registered — no passkey locks the last way in." },
    { conditions: cond(users({ includeGroups: [G_BG] }, [gid(901)])), grantControls: strength(S_PASSKEY) });

  // ---- 1.0.3: the exclusions matrix ----
  // One place that says who and what each policy leaves out beyond its own
  // exclusion group and the break-glass group, each line from a check in
  // ENCA (📘 MS Learn, 🛡 Bypass & Swiss cheese) or a Microsoft Learn page:
  //   SHARED   Teams Rooms / phones / panels / Surface Hub resource accounts
  //            cannot do MFA, a sign-in frequency, a persistent-browser
  //            setting, a device-code block (Teams Android remote sign-in) or
  //            run the Global Secure Access client (teams-rooms-mfa,
  //            surface-hub-mfa, device-code-teams-android,
  //            signin-freq-teams-rooms, shared-device-unsupported)
  //   VM       Azure Windows VM Sign-In: MFA over RDP needs WHfB or FIDO2 on
  //            the connecting client (azure-vm-signin-mfa; CloudFellows CA000)
  //   DEFENDER the Defender mobile app carries the Global Secure Access client
  //            on iOS and Android and must reach its service from anywhere
  //            (defender-mobile-exclusion; Learn, compliant network, Mobile
  //            app support) — the admins' CA103 too, it is any platform
  //   DC       B2B direct connect users: sign-in frequency and persistent
  //            browser are not supported for them (dc-unsupported-control;
  //            CloudFellows CA008, CA009)
  // Not taken over from the CloudFellows CA215–CA218: their extra app
  // exclusions (Windows Azure Active Directory, My Apps, My Profile …) — Learn
  // asks only Intune and Intune Enrollment of a compliant-network policy, and
  // every extra app exclusion is a hole.
  const EXCLUDE = {
    shared: [1, 3, 8, 9, 201, 202, 203, 204],
    vm: [1],
    defender: [9, 103, 203, 204],
    directConnect: [8],
  };
  for (const p of P) {
    // cnApps and friends are shared objects: each policy gets its own copy
    // before anything is pushed into it
    p.raw.conditions.applications = JSON.parse(JSON.stringify(p.raw.conditions.applications));
    const u = p.raw.conditions.users, a = p.raw.conditions.applications;
    const why = [];
    if (EXCLUDE.shared.includes(p.num)) { u.excludeGroups.push(G_TSD); p.entry.sharedDevices = true; }
    if (EXCLUDE.vm.includes(p.num)) { a.excludeApplications.push(AZURE_VM_SIGNIN); why.push("Azure Windows VM Sign-In"); }
    if (EXCLUDE.defender.includes(p.num)) { a.excludeApplications.push(DEFENDER_XPLAT, DEFENDER_TVM); why.push("MicrosoftDefenderATP XPlat", "Microsoft Defender for Mobile TVM"); }
    if (EXCLUDE.directConnect.includes(p.num)) {
      u.excludeGuestsOrExternalUsers = { guestOrExternalUserTypes: "b2bDirectConnectUser", externalTenants: { "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants", membershipKind: "all" } };
      p.entry.exclude = [...(p.entry.exclude || []), "Guests & external users: B2B direct connect"];
    }
    if (why.length) p.entry.resources = `${p.entry.resources}${why.map((x) => ` · − ${x}`).join("")}`;
  }

  // ---- the catalog ----
  const cat = {
    id: "smb", label: "SMB Basic", icon: "🏢", source: "bundled",
    release: CATALOG_RELEASE, released: "19-10-2026", line: "Security defaults + Global Secure Access", author: "ENCA",
    url: null,
    breakGlassGroup: BG,
    // No CloudFellows E-Admins under this baseline (Mihai, mockup 19 Oct):
    // CA004, CA101–CA104 and CA901 cover the admins and the emergency accounts.
    sharedEAdmins: false,
    groupPrefixes: ["CAB-SEC"],
    groupFilterPrefix: "CAB-SEC-U-",
    defaultAuName: "CA-RMAU-SMB-BASE",
    exclusionShape: "CAB-SEC-U-SMB-CAnnn-Exclusion",
    unitNote: "SMB Basic has no personas: one restricted unit per section — CA-RMAU-SMB-BASE (CA001–CA009), CA-RMAU-SMB-ADM (CA101–CA104), CA-RMAU-SMB-CN (CA201–CA205) — plus CA-RMAU-BreakGlass, which also holds the break-glass accounts.",
    adminRoles: ADMIN_ROLES.map(([id, name]) => ({ id, name })),
    syncRoles: SYNC_ROLES.map(([id, name]) => ({ id, name })),
    personas: [
      { code: "GLO",        token: "BASE", emoji: "🌐", label: "Base",              caRange: "CA001–CA099", lo: 0,   hi: 99,  name: "CA-RMAU-SMB-BASE" },
      { code: "ADM",        token: "ADM",  emoji: "🛡", label: "Admins",            caRange: "CA100–CA199", lo: 100, hi: 199, name: "CA-RMAU-SMB-ADM" },
      { code: "CN",         token: "CN",   emoji: "🔒", label: "Compliant network", caRange: "CA200–CA299", lo: 200, hi: 299, name: "CA-RMAU-SMB-CN" },
      { code: "BreakGlass", token: null,   emoji: "🚨", label: "Break-glass",       caRange: "CA900–CA999", lo: 900, hi: 999, name: "CA-RMAU-BreakGlass" },
    ],
    personaGroups: [
      { key: "global", label: "🌐 All users", group: null },
      { key: "breakglass", label: "🚨 Break-glass", group: BG },
    ],
    predefined: [BG, TSD],
    sharedDevicesGroup: TSD,
    groups: [BG, TSD, "one CAB-SEC-U-SMB-CAnnn-Exclusion group per policy"],
    namedLocations: ["SMB - Allowed countries", "All Compliant Network locations"],
    note: "Needs Entra ID P1 (Microsoft 365 Business Premium includes it). CA103 and CA201–CA204 need Global Secure Access with Conditional Access signalling on — they land Off. CA901 needs the Passkey (FIDO2) method on for the break-glass accounts; allow synced passkeys in its profile if they use one.",
    policies: P.map((p) => ({ num: p.num, name: p.name, version: p.version, tag: p.version === RELEASE || ADDED_IN[p.num] ? "NEW" : "UP", ...p.entry,
      // the CloudFellows entry shape: groups first, then the other exclusions
      exclude: [`${excl(p.num)} (group)`, ...(p.num === 901 ? [] : [`${BG} (group)`]), ...(p.entry.sharedDevices ? [`${TSD} (group)`] : []), ...((p.entry.exclude || []).filter((x) => !/\(group\)$/.test(x)))] })),
  };

  // ---- the contract (same shape as Joey Verlinden's: catalog first) ----
  const norm = (s) => String(s || "").trim().toLowerCase();
  const clean = (s) => String(s || "").replace(/^\(?(NEW|UP)\)\s*/i, "").trim();
  const SMB_RE = /^CA(\d{3,4})-[A-Z]+-SMB-/i;
  const EXCL_RE = /^CAB-SEC-U-SMB-CA(\d{3,4})-Exclusion$/i;
  const byNum = (c, num) => (c.personas || []).find((p) => num >= p.lo && num <= p.hi) || null;
  cat.personaOfPolicy = function (c, name) {
    const m = SMB_RE.exec(clean(name));
    if (!m) return null;
    const p = byNum(c, +m[1]);
    return p ? p.code : null;
  };
  cat.personaLabel = function (c, code) {
    const p = (c.personas || []).find((x) => x.code === code);
    return p ? `${p.emoji ? p.emoji + " " : ""}${p.label}` : (code || "Other");
  };
  cat.exclusionName = (name) => { const m = /CA(\d{3,4})/i.exec(String(name || "")); return m ? excl(+m[1]) : null; };
  cat.isExclusionGroup = (name) => EXCL_RE.test(String(name || "").trim());
  cat.codeForGroup = function (c, name) {
    const n = norm(name);
    if (!n) return null;
    if (n === norm(c.breakGlassGroup)) return "BreakGlass";
    // the shared-device group is excluded across sections: filed with Base
    if (n === norm(TSD)) return "GLO";
    const m = EXCL_RE.exec(String(name || "").trim());
    if (!m) return null;
    // only a group this catalog defines — not every number in a range
    if (!(c.policies || []).some((p) => p.num === +m[1])) return null;
    const p = byNum(c, +m[1]);
    return p ? p.code : null;
  };
  cat.exclusionGroupFor = function (c, policyName) {
    const nm = clean(policyName);
    if (!nm) return null;
    const hit = (c.policies || []).find((p) => norm(p.name) === norm(nm));
    if (hit) return { name: excl(hit.num), source: "catalog" };
    const m = SMB_RE.exec(nm);
    return m ? { name: excl(+m[1]), source: "derived" } : null;
  };
  const nick = (s) => String(s || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 60) || "CAGroup";
  cat.templates = function (c) {
    const out = [{ displayName: c.breakGlassGroup, mailNickname: nick(c.breakGlassGroup), persona: "BreakGlass",
      description: "Break-glass (emergency access) accounts — excluded from every SMB Basic policy except CA901, which asks them for a passkey. Keep it to the two emergency accounts." },
      { displayName: TSD, mailNickname: nick(TSD), persona: "GLO",
        description: "Teams Rooms, Teams phones and panels and Surface Hub resource accounts — excluded from the SMB Basic controls they cannot meet (MFA, device-code block, sign-in frequency, persistent browser, the compliant network). Fill it with 📞 Teams devices." }];
    for (const p of c.policies || []) {
      out.push({ displayName: excl(p.num), mailNickname: nick(excl(p.num)), persona: c.personaOfPolicy(c, p.name), policy: p.name,
        description: `Exclusion group for ${p.name} (SMB Basic ${c.release}). Members are exempt from that one policy.` });
    }
    return out;
  };
  cat.auName = function (c, code) {
    const p = (c.personas || []).find((x) => x.code === code);
    return (p && p.name) || `CA-RMAU-SMB-${code}`;
  };

  // ---- the create bundle ----
  const groupsOf = () => [
    { id: G_BG, displayName: BG, mailNickname: nick(BG), description: cat.templates(cat)[0].description, securityEnabled: true, mailEnabled: false, groupTypes: [] },
    { id: G_TSD, displayName: TSD, mailNickname: nick(TSD), description: cat.templates(cat)[1].description, securityEnabled: true, mailEnabled: false, groupTypes: [] },
    ...P.map((p) => ({ id: gid(p.num), displayName: excl(p.num), mailNickname: nick(excl(p.num)),
      description: `Exclusion group for ${p.name} (SMB Basic ${CATALOG_RELEASE}). Members are exempt from that one policy.`, securityEnabled: true, mailEnabled: false, groupTypes: [] })),
  ];
  const landsOff = P.filter((p) => p.entry.landsOff).map((p) => p.name);
  cat.bundle = function () {
    const policies = P.map((p) => ({ displayName: p.name, state: "disabled", sessionControls: null, ...p.raw }));
    return JSON.parse(JSON.stringify({
      catalogId: "smb",
      policies,
      groups: groupsOf(),
      namedLocations: [{ id: L_COUNTRIES, "@odata.type": "#microsoft.graph.countryNamedLocation", displayName: "SMB - Allowed countries", countriesAndRegions: ["NL"], includeUnknownCountriesAndRegions: false, countryLookupMethod: "clientIpAddress" }],
      authStrengths: [
        { id: S_MFA, displayName: "Multifactor authentication", policyType: "builtIn" },
        { id: S_PR, displayName: "Phishing-resistant MFA", policyType: "builtIn" },
        { id: S_PASSKEY, displayName: "SMB - Passkey (FIDO2)", description: "Break-glass accounts: a passkey only — device-bound or synced, as the Passkey (FIDO2) profile allows (SMB Basic CA901).", policyType: "custom", requirementsSatisfied: "mfa", allowedCombinations: ["fido2"] },
      ],
      authContexts: [], termsOfUse: [],
      // CA103 and CA201–CA204 land Off whatever the import's landing state:
      // they block, and wait for 🌐 Global Secure Access to be green
      forceOff: landsOff,
    }));
  };
  cat.landsOff = () => landsOff.slice();
  cat.replacing = () => P.filter((p) => p.entry.replacesSd).map((p) => p.name);
  cat.bundleLabel = `SMB Basic ${CATALOG_RELEASE} — ENCA's own copy`;
  return cat;
})();
