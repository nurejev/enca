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
//   BASE  CA001–CA006  replaces security defaults (+ registration)
//   ADM   CA101–CA104  admins, stricter than security defaults
//   CN    CA201–CA204  Global Secure Access, per platform (as CA215–CA218)
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
  const S_FIDO = "5b5b0000-0000-4000-8000-0000000000f2";       // custom: SMB - FIDO2 security key (placeholder id)
  const L_COUNTRIES = "5b5b0000-0000-4000-8000-0000000000c1";  // SMB - Allowed countries (placeholder id)
  const BG = "CAB-SEC-U-BreakGlass";
  const excl = (num) => `CAB-SEC-U-SMB-CA${String(num).padStart(3, "0")}-Exclusion`;
  // placeholder group ids: one per name, never written into a tenant
  const gid = (n) => `5b5b0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const G_BG = gid(999999);

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
  const add = (num, kind, persona, words, entry, raw) => {
    const name = `CA${String(num).padStart(3, "0")}-${kind}-SMB-${persona}-${words}-v${RELEASE}`;
    P.push({ num, name, entry, raw });
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
  const internal = (num) => everyone(num, { excludeGuestsOrExternalUsers: ALL_EXTERNAL() });
  const ROLES_TXT = `${ADMIN_ROLES.length} directory roles (the security-defaults admin roles)`;
  const XG = "Guests & external users (all types, incl. service providers)";
  const cnPlatform = (p) => ({ platforms: { includePlatforms: [p], excludePlatforms: [] } });
  const cnLoc = { locations: { includeLocations: ["All"], excludeLocations: [CN_LOCATION] } };
  const cnApps = apps({ excludeApplications: [INTUNE, INTUNE_ENROLL] });

  // BASE — replaces security defaults
  add(1, "GRANT", "Global", "AnyApp-AnyPlatform-MFA",
    { persona: "🌐 Base", include: ["All users"], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Require multifactor authentication", block: false, session: "",
      replacesSd: true, description: "MFA for every user on every resource — security defaults' 'MFA when necessary', made explicit. Goes On at the ⇄ switch." },
    { conditions: cond(everyone(1)), grantControls: mfa });
  add(2, "BLOCK", "Global", "AnyApp-AnyPlatform-LegacyAuthentication",
    { persona: "🌐 Base", include: ["All users"], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Exchange ActiveSync clients, Other clients (legacy authentication)"], grant: "Block access", block: true, session: "",
      replacesSd: true, description: "Blocks every legacy-protocol sign-in (IMAP, POP, SMTP AUTH, Exchange ActiveSync basic), as security defaults does. Goes On at the ⇄ switch." },
    { conditions: cond(everyone(2), { clientAppTypes: ["exchangeActiveSync", "other"] }), grantControls: block });
  add(3, "BLOCK", "Global", "AnyApp-AnyPlatform-DeviceCodeFlow",
    { persona: "🌐 Base", include: ["All users"], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app", "Auth flows: Device code flow, Authentication transfer"], grant: "Block access", block: true, session: "",
      replacesSd: true, description: "Blocks the device code flow and authentication transfer, as security defaults does for new tenants since 1 July 2026. Goes On at the ⇄ switch." },
    { conditions: cond(everyone(3), { authenticationFlows: { transferMethods: "deviceCodeFlow,authenticationTransfer" } }), grantControls: block });
  add(4, "GRANT", "Admins", "AnyApp-AnyPlatform-MFA",
    { persona: "🌐 Base", include: [ROLES_TXT], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Require multifactor authentication", block: false, session: "",
      replacesSd: true, description: "MFA for the admin roles security defaults names, on every resource. Kept apart from CA001 so an admin is never only as safe as the all-users policy. Goes On at the ⇄ switch." },
    { conditions: cond(roles(4)), grantControls: mfa });
  add(5, "GRANT", "Global", "AzureManagement-AnyPlatform-MFA",
    { persona: "🌐 Base", include: ["All users"], resources: "Windows Azure Service Management API", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Require multifactor authentication", block: false, session: "",
      replacesSd: true, description: "MFA for Azure Resource Manager — the Azure portal, Azure PowerShell and Azure CLI — for every user, as security defaults does. Goes On at the ⇄ switch." },
    { conditions: { ...cond(everyone(5)), applications: apps({ includeApplications: [AZURE_MGMT] }) }, grantControls: mfa });
  add(6, "GRANT", "Global", "RegisterSecurityInfo-AnyPlatform-MFAorTAP",
    { persona: "🌐 Base", include: ["All users"], exclude: [XG], resources: "User action: register security information", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Authentication strength: Multifactor authentication", block: false, session: "",
      description: "Registering or changing a sign-in method needs MFA — or a Temporary Access Pass, which the built-in Multifactor authentication strength accepts, so a new user's first method is registered with a TAP. Stays Report-only at the switch." },
    { conditions: { ...cond(internal(6)), applications: apps({ includeApplications: [], includeUserActions: ["urn:user:registersecurityinfo"] }) }, grantControls: strength(S_MFA) });

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
      { persona: "🔒 Compliant network", include: ["All users"], exclude: [XG], resources: "All resources · − Microsoft Intune · − Microsoft Intune Enrollment", network: "Any network or location · − All Compliant Network locations", conditions: [`Platforms: ${label}`, "Client apps: Any client app"], grant: "Block access", block: true, session: "",
        landsOff: true, description: `Every user on ${label} only through the Global Secure Access client${/iOS|Android/.test(label) ? " (BYOD with app protection)" : ""}, so a stolen token is useless elsewhere. Admins are not excluded. Guests are: their device cannot carry this tenant's client. Lands Off until 🌐 Global Secure Access shows the chain green.` },
      { conditions: { ...cond(internal(num), { ...cnLoc, ...cnPlatform(plat) }), applications: cnApps }, grantControls: block });
  }

  // BG — the emergency accounts
  add(901, "GRANT", "BreakGlass", "AnyApp-AnyPlatform-FIDO2",
    { persona: "🚨 Break-glass", include: [`${BG} (group)`], exclude: [`${excl(901)} (group)`], resources: "All resources", network: "Any network or location", conditions: ["Client apps: Any client app"], grant: "Authentication strength: SMB - FIDO2 security key", block: false, session: "",
      description: "The break-glass accounts sign in with a FIDO2 security key and nothing else. Excluded from every other SMB policy. Keep it Report-only until both accounts have a key registered — a wrong key or no key locks the last way in." },
    { conditions: cond(users({ includeGroups: [G_BG] }, [gid(901)])), grantControls: strength(S_FIDO) });

  // ---- the catalog ----
  const cat = {
    id: "smb", label: "SMB Basic", icon: "🏢", source: "bundled",
    release: RELEASE, released: "19-10-2026", line: "Security defaults + Global Secure Access", author: "ENCA",
    url: null,
    breakGlassGroup: BG,
    // No CloudFellows E-Admins under this baseline (Mihai, mockup 19 Oct):
    // CA004, CA101–CA104 and CA901 cover the admins and the emergency accounts.
    sharedEAdmins: false,
    groupPrefixes: ["CAB-SEC"],
    groupFilterPrefix: "CAB-SEC-U-",
    defaultAuName: "CA-RMAU-SMB-BASE",
    exclusionShape: "CAB-SEC-U-SMB-CAnnn-Exclusion",
    unitNote: "SMB Basic has no personas: one restricted unit per section — CA-RMAU-SMB-BASE (CA001–CA006), CA-RMAU-SMB-ADM (CA101–CA104), CA-RMAU-SMB-CN (CA201–CA204) — plus CA-RMAU-BreakGlass, which also holds the break-glass accounts.",
    adminRoles: ADMIN_ROLES.map(([id, name]) => ({ id, name })),
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
    predefined: [BG],
    groups: [BG, "one CAB-SEC-U-SMB-CAnnn-Exclusion group per policy"],
    namedLocations: ["SMB - Allowed countries", "All Compliant Network locations"],
    note: "Needs Entra ID P1 (Microsoft 365 Business Premium includes it). CA103 and CA201–CA204 need Global Secure Access with Conditional Access signalling on — they land Off.",
    policies: P.map((p) => ({ num: p.num, name: p.name, version: RELEASE, tag: "NEW", ...p.entry,
      // the CloudFellows entry shape: groups first, then the other exclusions
      exclude: [`${excl(p.num)} (group)`, ...(p.num === 901 ? [] : [`${BG} (group)`]), ...((p.entry.exclude || []).filter((x) => !/\(group\)$/.test(x)))] })),
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
      description: "Break-glass (emergency access) accounts — excluded from every SMB Basic policy except CA901, which asks them for a FIDO2 key. Keep it to the two emergency accounts." }];
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
    ...P.map((p) => ({ id: gid(p.num), displayName: excl(p.num), mailNickname: nick(excl(p.num)),
      description: `Exclusion group for ${p.name} (SMB Basic ${RELEASE}). Members are exempt from that one policy.`, securityEnabled: true, mailEnabled: false, groupTypes: [] })),
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
        { id: S_FIDO, displayName: "SMB - FIDO2 security key", description: "Break-glass accounts: a FIDO2 security key only (SMB Basic CA901).", policyType: "custom", requirementsSatisfied: "mfa", allowedCombinations: ["fido2"] },
      ],
      authContexts: [], termsOfUse: [],
      // CA103 and CA201–CA204 land Off whatever the import's landing state:
      // they block, and wait for 🌐 Global Secure Access to be green
      forceOff: landsOff,
    }));
  };
  cat.landsOff = () => landsOff.slice();
  cat.replacing = () => P.filter((p) => p.entry.replacesSd).map((p) => p.name);
  cat.bundleLabel = `SMB Basic ${RELEASE} — ENCA's own copy`;
  return cat;
})();
