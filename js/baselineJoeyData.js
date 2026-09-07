// ======================================================================
// Baseline catalog — Conditional Access Baseline by Joey Verlinden.
//   https://github.com/j0eyv/ConditionalAccessBaseline
// Release 2026.6.1 (12-06-2026). Based on the Microsoft Conditional Access
// framework by Claus Jespersen, deliberately minimised.
//
// Verified against the repository at commit 38469a4 (Config/), which is the
// authoritative file listing for this release: all 36 policies ship a JSON in
// Config/ConditionalAccess, and two names differ from the README prose —
// CA006 and CA503 follow the file names here. Joey's personas are
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
  commit: "38469a4faf26bbe013344c57c00fbfc922086950",
  configPath: "Config/ConditionalAccess",
  namedLocations: ["ALLOWED COUNTRIES", "ALLOWED COUNTRIES - SERVICE ACCOUNTS", "All Compliant Network locations"],
  groups: ["CA-BreakGlassAccounts - Exclude", "CA-ServiceAccounts", "APP_Microsoft365_E5", "one <policy name> - Exclude group per policy"],
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
    { num: 6, persona: "🌐 Global", name: "CA006-Global-DataProtection-Office365-AnyPlatform-Browser-Unmanaged-AppEnforceRestrictions",
      grant: "Session: app enforced restrictions", resources: "Office 365", platform: "Any platform (browser, unmanaged)",
      description: "Applies app enforced restrictions to browser sessions on unmanaged devices. The repository README still describes the older iOS/Android app-protection form of this policy; the shipped file is this one." },

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
    { num: 403, persona: "🙋 Guests", name: "CA403-GuestUsers-IdentityProtection-AllApps-AnyPlatform-PersistentBrowser",
      grant: "Session: never persistent browser", resources: "All cloud apps", platform: "Any platform",
      description: "Prevents persistent browser sessions for guests." },
    { num: 404, persona: "🙋 Guests", name: "CA404-GuestUsers-AttackSurfaceReduction-SelectedApps-AnyPlatform-BLOCK",
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
    { num: 503, persona: "🤖 Agents", name: "CA503-Agents-BaseProtection-AllAgentUsers-RequireCompliantDevice",
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

// ======================================================================
// R36 — THE CONTRACT. Everything below is what makes this a first-class
// baseline rather than a comparison table: the answers every downstream
// tool needs (which groups to expect, which persona a group belongs to,
// which restricted unit that persona's vault is) stated for THIS baseline.
// Each function takes the catalog as its first argument on purpose — the
// live-fetched catalog (js/baselineLive.js) is a spread of this object with
// a fresh `policies` list, and it inherits the rules unchanged.
//
// Personas. Joey's are Global / Admins / Internals / ServiceAccounts /
// GuestUsers / Agents. Where a persona means the same thing as a CloudFellows
// one it carries the SAME code (GLO, ADM, INT, SA, GUESTUSERS, BreakGlass),
// so a tenant's stated group → persona mapping (R28) reads the same in both
// worlds; AGENTS is his alone. There is no Externals, no Guest admins, no
// DevOps, no Workload identities and no Factory workers here, and inventing
// them would be inventing a baseline.
//
// Restricted units. His baseline defines no administrative units — the
// per-persona vault is ENCA's own hardening on top of it — so the names are
// ENCA's convention under his prefix: CA-RMAU-<Persona>-Exclusions, and
// CA-RMAU-BreakGlass for the emergency-access group, mirroring the shape the
// CloudFellows units take (CAB-SEC-RMAU-<CODE>-Exclusions).
//
// Naming. Exclusion groups are named after the POLICY, not the CA number:
// "<policy name> - Exclude". So the routing rule is an EXACT match against a
// policy name this catalog knows, case-insensitive, and nothing else — no
// number parsed out of the middle of a name, no prefix guess. A group that
// matches nothing stays visible as unmapped (R28's second rule), and the
// tenant's own mapping can place it.
// ======================================================================
BASELINE_JOEY.icon = "🧩";
BASELINE_JOEY.source = "bundled";
// The bounded prefix scans (＋ Bulk add, persona chips, the guide's group
// read). Every group this baseline names starts with "CA" — CA000…CA505 for
// the exclusions, CA- for break-glass and service accounts.
BASELINE_JOEY.groupPrefixes = ["CA"];
BASELINE_JOEY.groupFilterPrefix = "CA";
BASELINE_JOEY.defaultAuName = "CA-RMAU-CA-Exclusions";
BASELINE_JOEY.personas = [
  { code: "GLO",        token: "Global",          emoji: "🌐", label: "Global",           caRange: "CA000–CA099", name: "CA-RMAU-Global-Exclusions" },
  { code: "ADM",        token: "Admins",          emoji: "🛡", label: "Admins",           caRange: "CA100–CA199", name: "CA-RMAU-Admins-Exclusions" },
  { code: "INT",        token: "Internals",       emoji: "👤", label: "Internals",        caRange: "CA200–CA299", name: "CA-RMAU-Internals-Exclusions" },
  { code: "SA",         token: "ServiceAccounts", emoji: "⚙",  label: "Service accounts", caRange: "CA300–CA399", name: "CA-RMAU-ServiceAccounts-Exclusions" },
  { code: "GUESTUSERS", token: "GuestUsers",      emoji: "🙋", label: "Guests",           caRange: "CA400–CA499", name: "CA-RMAU-Guests-Exclusions" },
  { code: "AGENTS",     token: "Agents",          emoji: "🤖", label: "Agents",           caRange: "CA500–CA599", name: "CA-RMAU-Agents-Exclusions" },
  { code: "BreakGlass", token: null,              emoji: "🚨", label: "Break-glass",      caRange: "",            name: "CA-RMAU-BreakGlass",
    description: "Restricted management administrative unit for the break-glass emergency access group (CA-BreakGlassAccounts - Exclude), which is excluded from every policy in the Conditional Access Baseline by Joey Verlinden. Membership changes require a role scoped to this administrative unit — keep the list of scoped administrators shorter than for any other unit." },
];
// The persona groups the wizard can pick by persona. His baseline has two
// real ones — the service-accounts group and the break-glass group. The
// internals include group ships as an EXAMPLE (APP_Microsoft365_E5) that a
// tenant is expected to replace with its own, so it is offered but labelled.
BASELINE_JOEY.personaGroups = [
  { key: "global", label: "🌐 Global", group: null },
  { key: "internals", label: "👤 Internals", group: "APP_Microsoft365_E5", example: true },
  { key: "serviceaccounts", label: "⚙ Service accounts", group: "CA-ServiceAccounts" },
  { key: "breakglass", label: "🚨 Break-glass", group: "CA-BreakGlassAccounts - Exclude" },
];
BASELINE_JOEY.predefined = ["CA-BreakGlassAccounts - Exclude", "CA-ServiceAccounts", "APP_Microsoft365_E5"];
// The groups the baseline names that are not one policy's exclusion group.
// APP_Microsoft365_E5 is deliberately NOT here: it is the example include
// group, and expecting every tenant to have a group by that name would report
// a missing group nobody should create.
BASELINE_JOEY.groups = ["CA-BreakGlassAccounts - Exclude", "CA-ServiceAccounts", "one <policy name> - Exclude group per policy"];
BASELINE_JOEY.EXCLUDE_SUFFIX = " - Exclude";

(function joeyContract(J) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const personaByToken = (cat, tok) => (cat.personas || []).find((p) => p.token && p.token.toLowerCase() === String(tok || "").toLowerCase()) || null;
  const personaByCode = (cat, code) => (cat.personas || []).find((p) => p.code === code) || null;

  // "CA204-Internals-…" — the persona is the SECOND segment of the name, and
  // that is the authority: his CA300 block is service accounts, and a range
  // table would file it under Externals. The number is only a fallback for a
  // name that lost its persona segment.
  J.personaOfPolicy = function (cat, name) {
    const m = /^CA(\d{3,4})-([A-Za-z]+)/.exec(String(name || "").replace(/^\(?(NEW|UP)\)\s*/i, "").trim());
    if (!m) return null;
    const p = personaByToken(cat, m[2]);
    if (p) return p.code;
    const base = Math.floor(+m[1] / 100) * 100;
    const byRange = (cat.personas || []).find((x) => x.caRange && +(/CA(\d+)/.exec(x.caRange) || [])[1] === base);
    return byRange ? byRange.code : null;
  };
  J.personaLabel = function (cat, code) {
    const p = personaByCode(cat, code);
    return p ? `${p.emoji ? p.emoji + " " : ""}${p.label}` : (code || "Other");
  };
  J.exclusionName = (name) => `${String(name || "").trim()}${J.EXCLUDE_SUFFIX}`;
  J.isExclusionGroup = (name) => /\s-\sExclude$/i.test(String(name || "").trim());

  // Group name → persona code. EXACT, case-insensitive, against the names
  // this catalog defines. Returns null for everything else.
  J.codeForGroup = function (cat, name) {
    const n = norm(name);
    if (!n) return null;
    if (n === norm(cat.breakGlassGroup)) return "BreakGlass";
    if (n === "ca-serviceaccounts") return "SA";
    for (const p of cat.policies || []) {
      if (n === norm(J.exclusionName(p.name))) return J.personaOfPolicy(cat, p.name);
    }
    return null;
  };

  // What a policy should exclude, and on whose authority — the same two
  // answers Assign.conventionExclusionFor gives for CloudFellows.
  J.exclusionGroupFor = function (cat, policyName) {
    const clean = String(policyName || "").replace(/^\(?(NEW|UP)\)\s*/i, "").trim();
    if (!clean) return null;
    const hit = (cat.policies || []).find((p) => norm(p.name) === norm(clean));
    if (hit) return { name: J.exclusionName(hit.name), source: "catalog" };
    // A policy shaped like his (CAnnn-Persona-…) that this release does not
    // list — an older release's name, or the tenant's own numbering under his
    // convention. The rule still applies; the answer is labelled as inferred.
    if (J.personaOfPolicy(cat, clean)) return { name: J.exclusionName(clean), source: "derived" };
    return null;
  };

  // Group templates, derived from the policy list so the live catalog gets
  // fresh ones for free: one exclusion group per policy, plus the two named
  // groups. Plain security groups — nothing here is dynamic.
  const nick = (s) => String(s || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 60) || "CAGroup";
  J.templates = function (cat) {
    const out = [];
    const seen = new Set();
    const add = (displayName, description, extra) => {
      const k = norm(displayName);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ displayName, description, mailNickname: nick(displayName), ...(extra || {}) });
    };
    add(cat.breakGlassGroup, "Break-glass (emergency access) accounts — excluded from every policy in the Conditional Access Baseline by Joey Verlinden. Keep it to the emergency accounts only.", { persona: "BreakGlass" });
    add("CA-ServiceAccounts", "Service accounts targeted by the CA300 block of the Conditional Access Baseline by Joey Verlinden (CA300 MFA, CA301 trusted locations).", { persona: "SA" });
    for (const p of cat.policies || []) {
      add(J.exclusionName(p.name), `Exclusion group for ${p.name} (Conditional Access Baseline by Joey Verlinden${cat.release ? ` ${cat.release}` : ""}). Members are exempt from that one policy.`,
        { persona: J.personaOfPolicy(cat, p.name), policy: p.name });
    }
    return out;
  };
  J.auName = function (cat, code) {
    const p = personaByCode(cat, code);
    return (p && p.name) || `CA-RMAU-${code}-Exclusions`;
  };
})(BASELINE_JOEY);

// Every policy carries its own exclusion group, named after the policy.
// decorate() is exported so the live catalog can run the same pass over the
// policies it read from the repository.
BASELINE_JOEY.decorate = function (cat) {
  (cat.policies || []).forEach((p) => {
    if (!p.persona) p.persona = BASELINE_JOEY.personaLabel(cat, BASELINE_JOEY.personaOfPolicy(cat, p.name));
    p.exclude = [`${BASELINE_JOEY.exclusionName(p.name)} (group)`, `${cat.breakGlassGroup} (group)`];
    p.include = [p.persona.replace(/^\S+\s*/, "")];
    p.docUrl = p.learn || `${cat.url}#${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    // the exact policy JSON at the commit this catalog was read from
    p.fileUrl = `${cat.url}/blob/${cat.commit}/${cat.configPath}/${encodeURIComponent(p.name)}.json`;
  });
  return cat;
};
BASELINE_JOEY.decorate(BASELINE_JOEY);
