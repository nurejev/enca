// ======================================================================
// MS Learn — documented exclusion checks.
// Maps CA policy patterns to exclusions, limitations and configuration
// requirements documented on learn.microsoft.com. When a policy matches
// a pattern but misses a documented exclusion (or is misconfigured),
// it is flagged with severity, impact, requirement and remediation.
// Read-only: works entirely on the already-loaded policy JSON (plus one
// read of the authentication strength policies for the EAM check).
// Check set inspired by github.com/Jhope188/ca-policy-analyzer.
// ======================================================================
const MSLearn = (() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---- well-known app IDs ----
  const EXCHANGE_ONLINE = "00000002-0000-0ff1-ce00-000000000000";
  const SHAREPOINT_ONLINE = "00000003-0000-0ff1-ce00-000000000000";
  const TEAMS_SERVICE = "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe";
  const AZURE_VIRTUAL_DESKTOP = "9cdead84-a844-4324-93f2-b2e6bb768d07";
  const WINDOWS_365 = "0af06dc6-e4b5-4f28-818e-e78e62d137a5";
  // TWO DIFFERENT APPS, confused until 25469: 372140e0 is Azure Windows VM
  // Sign-In (RDP to Entra-joined VMs); 270efc09 is Windows Cloud Login (SSO to
  // Cloud PCs / AVD session hosts). The token-protection list named the first
  // under the second's name, so a correct policy targeting Windows Cloud Login
  // was flagged as unsupported and the fix wrote the VM sign-in app instead.
  const AZURE_VM_SIGNIN = "372140e0-b3b7-4226-8ef9-d57986796201";
  const WINDOWS_CLOUD_LOGIN = "270efc09-cd0d-444b-a71f-39af4910ec45";
  const DEFENDER_ATP_XPLAT = "a0e84e36-b067-4d5c-ab4a-3db38e598ae2";
  const DEFENDER_TVM = "e724aa31-0f56-4018-b8be-f8cb82ca1196";
  const DIRSYNC_ROLE = "d29b2b05-8046-44ba-8758-1e26182fcf32";
  // ---- baseline naming conventions ----
  // The CloudFellows baseline names its exclusion groups predictably, so a fix can
  // resolve the right group instead of guessing. Looked up by the caller and
  // handed in through ctx; when a group does not exist, the fix declines.
  // The first entry is canonical: it is what gets created when the tenant has
  // none of them. The rest are accepted aliases.
  // R36: the canonical break-glass name is the ACTIVE baseline's
  // (CAB-SEC-U-BreakGlass, or CA-BreakGlassAccounts - Exclude for Joey
  // Verlinden's); the other stays as an accepted alias, because a tenant that
  // switched baselines still has the group it made under the previous name.
  const CONVENTION_STATIC = {
    breakGlass: ["CAB-SEC-U-BreakGlass", "CA-BreakGlassAccounts - Exclude"],
    // CAB-SEC-U-TeamsSharedDevices is canonical because it is the name this app
    // already ships: it is the displayName in js/groupTemplates.js and the one
    // every exclusion in the R26.6 catalog (CA000, CA004, CA007, CA008, CA014,
    // CA015, CA016) actually names. It was missing from this list, so the tool
    // asked people to create a group it already had a template for, under a
    // name the baseline never references. Keep the others as aliases.
    sharedDevices: ["CAB-SEC-U-TeamsSharedDevices", "CAB-SEC-U-SharedDevices",
                    "CAB-SEC-U-Persona-SharedDevices", "CAB-SEC-U-TeamsDevices",
                    "CAB-SEC-U-Persona-Microsoft365ServiceAccounts"],
  };
  const CONVENTION = new Proxy(CONVENTION_STATIC, {
    get(t, k) {
      if (k !== "breakGlass") return t[k];
      let bg = null;
      try { bg = (typeof Baseline !== "undefined" && Baseline.active) ? Baseline.active().breakGlassGroup : null; } catch { bg = null; }
      if (!bg) return t.breakGlass;
      return [bg, ...t.breakGlass.filter((n) => n.toLowerCase() !== bg.toLowerCase())];
    },
  });
  const GROUP_PURPOSE = {
    sharedDevices: "Teams Rooms, Teams panels, Teams phones and Surface Hub resource accounts — excluded from controls these devices cannot satisfy",
    breakGlass: "Emergency access (break-glass) accounts — excluded from every Conditional Access policy",
  };

  const TOKEN_PROT_APPS = [EXCHANGE_ONLINE, SHAREPOINT_ONLINE, TEAMS_SERVICE, AZURE_VIRTUAL_DESKTOP, WINDOWS_365, WINDOWS_CLOUD_LOGIN];
  // Device filter excluding every registration type token protection cannot support.
  // Device filter matching the registration types token protection cannot
  // support. Two things matter here and both are easy to get wrong:
  //   * mode "exclude" means the rule identifies the devices to EXCLUDE, so
  //     the conditions must be positive and joined with -or.
  //   * systemLabels is multi-valued: Entra only accepts -contains /
  //     -notContains on it. Using -ne is invalid grammar and Graph rejects
  //     the whole policy with a bare 400.
  // Device filter matching the registration types token protection cannot
  // support. Entra is strict here and gives nothing back but a bare 400:
  //   * mode "exclude" means the rule identifies the devices to EXCLUDE, so
  //     the conditions must be positive and joined with -or.
  //   * systemLabels is multi-valued: only -contains / -notContains are legal.
  //   * profileType is an enum — "RegisteredDevice", "SecureVM", "Printer",
  //     "Shared", "IoT". Anything else (Autopilot self-deploying is NOT a
  //     profileType) is rejected outright.
  // Because the accepted systemLabels values are not contractual, the apply
  // step falls back through simpler rules if Entra refuses this one.
  // 25471: ONLY THE ENTRA-JOINED ONES. Learn's known-limitations list is
  // Entra-joined Cloud PCs, Entra-joined AVD session hosts, Entra-joined Power
  // Automate hosted machines and Entra-joined Azure VMs; its own example rules
  // pair each label with trustType -eq "AzureAD". The rule before 25471 left
  // the trustType out, so it also excluded HYBRID-joined Cloud PCs and session
  // hosts — devices token protection does support — and took them out of the
  // protection for nothing. systemLabels stays on -contains (multi-valued);
  // the pairs are parenthesised so -and binds inside each one.
  const TP_AAD = 'device.trustType -eq "AzureAD"';
  const TOKEN_PROT_DEVICE_RULE =
    `(device.systemLabels -contains "CloudPC" -and ${TP_AAD})`
    + ` -or (device.systemLabels -contains "AzureVirtualDesktop" -and ${TP_AAD})`
    + ` -or (device.systemLabels -contains "MicrosoftPowerAutomate" -and ${TP_AAD})`
    + ` -or (device.profileType -eq "SecureVM" -and ${TP_AAD})`;
  // progressively simpler, tried in order when Entra rejects a create: the
  // pre-25471 rule (broader, but known to be accepted), then SecureVM alone
  const TOKEN_PROT_DEVICE_FALLBACKS = [
    'device.systemLabels -contains "CloudPC" -or device.systemLabels -contains "AzureVirtualDesktop" -or device.profileType -eq "SecureVM"',
    'device.profileType -eq "SecureVM"',
  ];

  // Add a group exclusion from ctx, or decline (null) when the tenant has no
  // group matching the convention — an invented exclusion is worse than none.
  // The remediation for every needsGroup check is "exclude this group". A
  // policy that already does is not broken, and saying so anyway is how a tool
  // trains people to ignore it. Suppressed rather than downgraded: the finding
  // is not a lesser problem, it is not a problem.
  function alreadyExcluded(p, key, ctx) {
    const g = ctx && ctx[key];
    if (!g || !g.id) return false;
    return (p.conditions?.users?.excludeGroups || []).includes(g.id);
  }

  function excludeGroupFix(ctxKey, what) {
    const fn = (d, ctx) => {
      const g = ctx && ctx[ctxKey];
      if (!g) return null;
      const u = d.conditions.users || (d.conditions.users = {});
      const list = u.excludeGroups || (u.excludeGroups = []);
      if (list.includes(g.id)) return [];
      list.push(g.id);
      return [`Excluded ${g.name} — the ${what} group`];
    };
    fn.needsGroup = ctxKey;   // which convention group this fix depends on
    return fn;
  }

  // 32303 — the shared devices' OWN policy (it includes the shared-device
  // group). Excluding them from it would leave them with nothing, so the fix
  // takes the unsupported CONTROLS out instead — but only where the group is
  // the policy's only include: with other people in it, dropping a control
  // weakens it for them too, and that stays a decision (null = no fix).
  // Conditions are never removed: insider risk and the device-code block are
  // CONDITIONS of a block, and dropping the condition would block always.
  const OWN_REMOVABLE = {
    mfa: (g) => { g.builtInControls = (g.builtInControls || []).filter((x) => x !== "mfa"); },
    strength: (g) => { delete g.authenticationStrength; },
    appProtection: (g) => { g.builtInControls = (g.builtInControls || []).filter((x) => x !== "approvedApplication" && x !== "compliantApplication"); },
    passwordChange: (g) => { g.builtInControls = (g.builtInControls || []).filter((x) => x !== "passwordChange"); },
    domainJoinedDevice: (g) => { g.builtInControls = (g.builtInControls || []).filter((x) => x !== "domainJoinedDevice"); },
    riskRemediation: (g) => { g.builtInControls = (g.builtInControls || []).filter((x) => x !== "riskRemediation"); },
    termsOfUse: (g) => { g.termsOfUse = []; },
  };
  const OWN_SESSION = { signInFrequency: "signInFrequency", persistentBrowser: "persistentBrowser", appEnforced: "applicationEnforcedRestrictions",
    cloudAppSecurity: "cloudAppSecurity", tokenProtection: "secureSignInSession", cae: "continuousAccessEvaluation", disableResilience: "disableResilienceDefaults" };
  function ownDeviceFix(d, ctx, res) {
    const g = ctx && ctx.sharedDevices;
    if (!g) return null;
    const u = d.conditions?.users || {};
    const only = (u.includeGroups || []).length === 1 && u.includeGroups[0] === g.id
      && !(u.includeUsers || []).filter((x) => x && x !== "None").length && !(u.includeRoles || []).length && !u.includeGuestsOrExternalUsers;
    if (!only) return null;
    const all = (res && res.blockedControls) || [];
    // what can be taken out; the rest (compliant device for Surface Hub, the
    // conditions of a block) is named and left — a platform exclusion or a
    // policy of its own is a design decision, not an edit
    const keys = all.filter((k) => OWN_REMOVABLE[k] || OWN_SESSION[k]);
    const left = all.filter((k) => !keys.includes(k)).map((k) => (DEVICE_CONTROLS.find((c) => c.key === k) || {}).label || k);
    if (!keys.length) return null;
    const gc = d.grantControls || null, sc = d.sessionControls || null;
    const labels = [];
    for (const k of keys) {
      if (OWN_REMOVABLE[k] && gc) OWN_REMOVABLE[k](gc);
      if (OWN_SESSION[k] && sc) delete sc[OWN_SESSION[k]];
      labels.push((DEVICE_CONTROLS.find((c) => c.key === k) || {}).label || k);
    }
    // a grant policy left asking nothing is not a fix — say so instead
    if (gc && !(gc.builtInControls || []).length && !gc.authenticationStrength && !(gc.termsOfUse || []).length
        && !(sc && Object.keys(sc).some((k) => sc[k]))) return null;
    return [`Removed ${labels.join(", ")} — this is the shared devices' own policy (it includes ${g.name} and no one else), and their resource accounts cannot meet ${labels.length === 1 ? "it" : "them"}`
      + (left.length ? `. Left as it is: ${left.join(", ")} — not supported on one of the device families, but taking it out would change what the policy is; give that family its own policy or a platform exclusion` : "")];
  }

  // ---- helpers on the raw Graph policy shape (fields may be missing) ----
  const U = (p) => p.conditions?.users || {};
  const A = (p) => p.conditions?.applications || {};
  const G = (p) => p.grantControls || {};
  const S = (p) => p.sessionControls || {};
  const grants = (p) => G(p).builtInControls || [];
  const appsInc = (p) => A(p).includeApplications || [];
  const appsExcLower = (p) => (A(p).excludeApplications || []).map((a) => String(a).toLowerCase());
  // When INCLUDE_DISABLED is set (e.g. a baseline tenant where the persona
  // policies are staged Off before enforcement) disabled policies are checked
  // too, as if they were switched on.
  let INCLUDE_DISABLED = false;
  const isActive = (p) => p.state === "enabled" || p.state === "enabledForReportingButNotEnforced" || (INCLUDE_DISABLED && p.state === "disabled");
  const allUsers = (p) => (U(p).includeUsers || []).includes("All");
  // The tenant's authentication methods policy (ctx.authMethods): which
  // passwordless methods are on, and which external authentication methods.
  const methodCfgs = (am) => (am && am.authenticationMethodConfigurations) || [];
  const cfgOn = (c) => String(c.state || "").toLowerCase() === "enabled";
  const passwordlessMethods = (am) => {
    const on = [];
    for (const c of methodCfgs(am)) {
      if (!cfgOn(c)) continue;
      const t = String(c["@odata.type"] || c.id || "").toLowerCase();
      if (t.includes("fido2")) on.push("passkey / FIDO2");
      else if (t.includes("x509certificate")) on.push("certificate-based authentication");
      else if (t.includes("microsoftauthenticator")) on.push("Microsoft Authenticator (phone sign-in)");
    }
    return on;
  };
  const eamMethods = (am) => methodCfgs(am)
    .filter((c) => cfgOn(c) && String(c["@odata.type"] || "").toLowerCase().includes("externalauthenticationmethod"))
    .map((c) => c.displayName || c.id || "external method");
  const allApps = (p) => appsInc(p).includes("All");
  const hasMfa = (p) => grants(p).includes("mfa") || G(p).authenticationStrength != null;
  const hasBlock = (p) => grants(p).includes("block");
  const hasCompliance = (p) => grants(p).includes("compliantDevice");
  const hasAdminRoles = (p) => (U(p).includeRoles || []).length > 0;
  const noUserExclusions = (p) => {
    const u = U(p);
    return !(u.excludeUsers || []).length && !(u.excludeGroups || []).length && !(u.excludeRoles || []).length;
  };
  const hasTokenProtection = (p) => {
    const s = S(p);
    return !!(s.secureSignInSession?.isEnabled || s.tokenProtection?.signInSessionTokenProtection?.isEnabled);
  };


  // ---- guest / external user types ------------------------------------
  // Six documented external user types. "GuestsOrExternalUsers" in
  // includeUsers/excludeUsers is the legacy "All guest and external users"
  // selection, which Entra now treats as all six sub-types.
  // "Service provider users" are the ones that matter for a CSP: partner
  // admins reaching this tenant through delegated admin privileges (GDAP).
  // They are NOT ordinary B2B guests, they are not in your directory, and no
  // group exclusion reaches them — the only lever is this user type.
  const SP = "serviceProvider";
  const EXT_TYPE_LABEL = {
    b2bCollaborationGuest: "B2B collaboration guest users",
    b2bCollaborationMember: "B2B collaboration member users",
    b2bDirectConnectUser: "B2B direct connect users",
    internalGuest: "Local guest users",
    serviceProvider: "Service provider users",
    otherExternalUser: "Other external users",
  };
  const extLabel = (t) => EXT_TYPE_LABEL[t] || t;
  // externalTenants.membershipKind is "all" or "enumerated"; an enumerated
  // selection only reaches the tenants it names, so an exclusion listing
  // Service provider users for two tenants still leaves every other partner
  // tenant in scope. That distinction is the whole point of reading it.
  function extSel(sel) {
    if (!sel) return null;
    const et = sel.externalTenants || {};
    return {
      types: String(sel.guestOrExternalUserTypes || "").split(",").map((s) => s.trim()).filter(Boolean),
      allTenants: (et.membershipKind || "all") !== "enumerated",
      tenants: et.members || [],
    };
  }
  const incExt = (p) => extSel(U(p).includeGuestsOrExternalUsers);
  const excExt = (p) => extSel(U(p).excludeGuestsOrExternalUsers);
  const legacyIncExt = (p) => (U(p).includeUsers || []).includes("GuestsOrExternalUsers");
  const legacyExcExt = (p) => (U(p).excludeUsers || []).includes("GuestsOrExternalUsers");
  // Does this policy enforce anything? An exclusion gap on a policy with no
  // controls at all is not worth anybody's attention.
  const enforces = (p) => grants(p).length > 0 || G(p).authenticationStrength != null
    || (G(p).customAuthenticationFactors || []).length > 0 || (G(p).termsOfUse || []).length > 0;

  // Is a service provider admin inside this policy's scope, and how?
  // null when they are out of scope. `partial` records an exclusion that
  // names Service provider users but only for specific tenants.
  function spScope(p) {
    const inc = incExt(p), exc = excExt(p);
    let via = null;
    if (allUsers(p)) via = "All users";
    else if (legacyIncExt(p)) via = "Guests and external users (the legacy all-types selection)";
    else if (inc && inc.types.includes(SP)) {
      via = inc.allTenants ? "Service provider users, all tenants"
        : `Service provider users from ${inc.tenants.length} named tenant${inc.tenants.length === 1 ? "" : "s"}`;
    }
    if (!via) return null;
    if (legacyExcExt(p)) return null;                                  // all six types excluded
    if (exc && exc.types.includes(SP) && exc.allTenants) return null;  // fully carved out
    const partial = exc && exc.types.includes(SP) ? exc : null;
    return { via, exc, partial };
  }

  // Add the service provider type to an existing include/exclude selection.
  function addSpType(sel) {
    const types = String(sel.guestOrExternalUserTypes || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (types.includes(SP)) return false;
    types.push(SP);
    sel.guestOrExternalUserTypes = types.join(",");
    return true;
  }

  // ---- what an external identity can actually do here (25433) ----------
  // Microsoft publishes two tables for external users, and every check below
  // reads from them rather than from inference:
  //
  // 1. The CONTROL table — which grant and session controls are supported for
  //    B2B collaboration and for B2B direct connect.
  //    learn.microsoft.com/entra/external-id/authentication-conditional-access
  // 2. The METHOD table — which authentication methods can fulfil an
  //    authentication strength, split by the tenant the user completes MFA in.
  //    Home-tenant methods are reachable ONLY when inbound MFA trust is on.
  //
  // The five non-service-provider types are what these checks look at: a
  // policy whose only external type is serviceProvider is already covered by
  // the sp-* checks above, which know about the partner list and say more.
  const EXT_TYPES = ["b2bCollaborationGuest", "b2bCollaborationMember", "b2bDirectConnectUser", "internalGuest", "serviceProvider", "otherExternalUser"];
  const DIRECT_CONNECT = "b2bDirectConnectUser";
  // A local guest is an account in THIS directory with UserType Guest. It has
  // this tenant's credentials and can be managed here, so none of the
  // cross-tenant limits apply to it — treating it as an external identity is
  // the mistake that makes a guest finding wrong.
  const LOCAL_GUEST = "internalGuest";

  // Methods that can only be completed in the user's HOME tenant. The names
  // are the authenticationMethodModes Graph uses in allowedCombinations.
  const HOME_ONLY_METHODS = {
    fido2: "FIDO2 security key / passkey",
    windowsHelloForBusiness: "Windows Hello for Business",
    x509CertificateSingleFactor: "Certificate-based authentication",
    x509CertificateMultiFactor: "Certificate-based authentication",
    deviceBasedPush: "Microsoft Authenticator phone sign-in",
    hardwareOath: "OATH hardware token",
  };
  // …and the ones an external user CAN complete in the resource tenant.
  const RESOURCE_OK_METHODS = ["sms", "voice", "push", "softwareOath", "password"];
  // 25475: A TEMPORARY ACCESS PASS IS NEITHER. Microsoft's external-users
  // table lists it in neither column, and the security-info registration
  // template says it outright: a Temporary Access Pass does not work for
  // guest users. Until 25475 it sat on the resource-tenant list above, so a
  // strength like "Phishing-resistant MFA + TAP" looked satisfiable by any
  // guest and the guest checks stayed silent on the guest-admin policies
  // that use it.
  const isNeverForGuests = (m) => /^temporaryAccessPass/i.test(m);
  // A combination is satisfiable in the resource tenant when every method in
  // it is. allowedCombinations are compound ("fido2", "password,sms").
  const comboMethods = (c) => String(c || "").split(",").map((x) => x.trim()).filter(Boolean);
  const comboIsHomeOnly = (c) => comboMethods(c).some((m) => HOME_ONLY_METHODS[m]);
  // can a guest complete this combination in THIS tenant? at home (trust on)?
  const comboUsableHere = (c) => { const m = comboMethods(c); return m.length > 0 && !m.some((x) => HOME_ONLY_METHODS[x] || isNeverForGuests(x)); };
  const comboUsableAtHome = (c) => { const m = comboMethods(c); return m.length > 0 && !m.some(isNeverForGuests); };
  // IS THIS STRENGTH JUST "REQUIRE MFA" WEARING A DIFFERENT HAT?
  // Microsoft's built-in strengths table says of the MFA strength: "The same
  // set of combinations that can be used to satisfy the Require multifactor
  // authentication setting", and the Limitations section says the two cannot
  // be used in one policy BECAUSE they are equivalent. That equivalence is
  // what decides the advice: where the strength already asks no more than the
  // grant control does, swapping to the grant control costs nothing and
  // reaches the externals the strength never applies to — one policy, not two.
  //
  // The signature is the rows Microsoft lists under MFA strength and under no
  // other built-in: a password plus a second factor, the federated
  // combinations, a Temporary Access Pass. Passwordless MFA and
  // phishing-resistant MFA have none of them, and a custom strength that
  // admits a password is, by the same table, no stronger than Require MFA.
  const MFA_EQUIV_SIGNATURE = (c) => {
    const m = comboMethods(c);
    if (m.length > 1 && m.includes("password")) return true;          // password + something you have
    if (m.some((x) => /^federated(SingleFactor|MultiFactor)$/i.test(x))) return true;
    // 25475: NOT a TAP. It is in the built-in MFA strength, but it is just as
    // often the escape hatch of a custom phishing-resistant strength
    // ("Phishing-resistant MFA + TAP"), and reading it as the MFA signature
    // told such a policy to swap to Require MFA — a downgrade.
    return false;
  };
  const isMfaEquivalent = (asp) => (asp && asp.allowedCombinations || []).some(MFA_EQUIV_SIGNATURE);

  // WHICH WAY IS THE POLICY WRONG? (25460)
  //
  // Mihai: "but the check clearly says to exclude these users. i am
  // confused." Four external-identity findings open with "Exclude the guest
  // and external user types" and two now say "Exclude nothing" — read as six
  // instructions about guests they contradict each other, and nothing on the
  // screen said which was which.
  //
  // They are two different failures. A control the identity CANNOT SATISFY
  // denies them access: the policy is too strict, and the fix takes them out
  // of scope and covers them with something they can meet. A control that is
  // NOT APPLIED to them lets them straight through: the policy is too loose,
  // and the fix brings a requirement that reaches them — excluding people a
  // policy already asks nothing of changes nothing at all.
  //
  // Kept as one table rather than a field on each check, so the two families
  // can be read in one place and a new check cannot quietly join neither.
  // A check that is NOT here renders no badge, deliberately: dc-unsupported-
  // control ends in "decide deliberately" and sp-exclusion-incomplete is
  // neither — it covers identities you meant to exclude, which is a third
  // thing. Claiming a verdict we cannot support is the one thing this file
  // does not do.
  const EFFECT = {
    // too strict — the control cannot be met, so access is denied
    "guest-auth-strength-unsatisfiable": "denies",
    "guest-unsupported-grant": "denies",
    "guest-device-grant-needs-trust": "denies",
    "guest-user-risk-blocked": "denies",
    "sp-blocked": "denies",
    "sp-device-grant-needs-trust": "denies",
    "sp-unsupported-grant": "denies",
    "eam-external-user-impact": "denies",
    // too loose — the control is not applied, so nothing is asked of them
    "guest-auth-strength-not-universal": "misses",
    "guest-auth-strength-swap-for-mfa": "misses",
    "sp-not-in-external-mfa": "misses",
    "ext-type-no-mfa": "misses",
    "dc-mfa-needs-trust": "denies",
    "shared-device-unsupported": "denies",
  };
  const EFFECT_TEXT = {
    denies: ["🚫", "Blocks them", "These identities are DENIED access — the control cannot be met by an identity this tenant does not manage. The fix takes them out of this policy's scope and covers them with something they can satisfy."],
    misses: ["🕳", "Misses them", "These identities are neither blocked nor challenged — the control is not applied to them, so this policy asks them for nothing. The fix brings a requirement that does reach them; excluding them would change nothing, because the policy already asks them for nothing."],
  };

  // Controls documented as NOT SUPPORTED for external users at all.
  const EXT_UNSUPPORTED_GRANT = {
    approvedApplication: "Require approved client app",
    compliantApplication: "Require app protection policy",
    passwordChange: "Require password change",
  };
  // Supported for B2B collaboration, NOT for B2B direct connect.
  const DC_UNSUPPORTED = {
    termsOfUse: "Terms of use",
    signInFrequency: "Sign-in frequency",
    persistentBrowser: "Persistent browser session",
    applicationEnforcedRestrictions: "App enforced restrictions",
    cloudAppSecurity: "Conditional Access App Control",
  };

  // WHICH external types this policy reaches, after its own exclusions.
  // Returns null when none — the same shape spScope uses, generalised.
  // `want` narrows it to the types a check cares about.
  // 25472: GUESTS REACHED THROUGH A GROUP. A B2B guest is a directory object
  // and can be a member of any group, so a policy that includes a group of
  // guests reaches them exactly as if it named the type — and until 25472
  // every guest check skipped such a policy, because it only read the user
  // TYPE selection. GUEST_GROUPS (set per run from the app's read) maps group
  // id -> { name, guests }: the transitive members with userType Guest. That
  // count cannot tell a B2B guest from a local guest created as userType
  // Guest, so the reach is reported as "members with userType Guest".
  // `noGroups` asks the question without it — a group of guests is not ALL
  // guests, so it can never be what covers the type tenant-wide.
  let GUEST_GROUPS = null;
  function guestGroupsOf(p) {
    if (!GUEST_GROUPS || !GUEST_GROUPS.ok) return [];
    const excl = new Set(U(p).excludeGroups || []);
    return (U(p).includeGroups || []).filter((id) => !excl.has(id))
      .map((id) => ({ id, ...(GUEST_GROUPS.groups.get(id) || {}) })).filter((g) => g.guests > 0);
  }
  function extScope(p, want, noGroups) {
    const inc = incExt(p), exc = excExt(p);
    let types = null, via = null;
    if (allUsers(p)) { types = EXT_TYPES.slice(); via = "All users"; }
    else if (legacyIncExt(p)) { types = EXT_TYPES.slice(); via = "Guests and external users (the legacy all-types selection)"; }
    else if (inc && inc.types.length) { types = inc.types.slice(); via = `${inc.types.map(extLabel).join(", ")}`; }
    if (!allUsers(p) && !legacyIncExt(p) && !noGroups) {
      const gg = guestGroupsOf(p);
      if (gg.length) {
        const gv = gg.map((g) => `group "${g.name || g.id}" (${g.guests} member${g.guests === 1 ? "" : "s"} with userType Guest)`).join(", ");
        if (!types) { types = []; via = gv; } else via = `${via}; and ${gv}`;
        if (!types.includes("b2bCollaborationGuest")) types.push("b2bCollaborationGuest");
      }
    }
    if (!types || !types.length) return null;
    if (legacyExcExt(p)) return null;                                   // all six carved out
    // An exclusion naming specific tenants does NOT take the type out of
    // scope — it only reaches the partners it names, so the rest stay in.
    if (exc && exc.allTenants) types = types.filter((t) => !exc.types.includes(t));
    const hit = want ? types.filter((t) => want.includes(t)) : types;
    if (!hit.length) return null;
    return { types: hit, via, partial: exc && !exc.allTenants ? exc : null };
  }
  // The types these checks own: everything but the local guests (managed
  // here, so unaffected) and the service providers (their own checks).
  const CROSS_TENANT_TYPES = EXT_TYPES.filter((t) => t !== LOCAL_GUEST && t !== SP);
  // ---- inbound cross-tenant trust (rebuilt 25469) ----------------------
  //
  // TRUST HAS TWO LAYERS. The DEFAULT inbound trust decides for every
  // organisation without a configuration of its own; a partner row overrides
  // it, and a partner whose inboundTrust (or a single flag in it) is null
  // INHERITS the default. Until 25469 these checks read the partner list only
  // — and that list was filtered to service providers — so in a tenant with
  // no CSP the list was empty, "every partner trusts" was vacuously true, and
  // a compliant-device policy reaching every B2B guest was reported as fine.
  //
  // ctx.crossTenant is Graph.crossTenantTrust(): { defaultOk, partnersOk,
  // defaultTrust, dcInboundDefault, partners:[{tenantId, name,
  // isServiceProvider, inboundTrust, dcInbound}] }. ctx.partners ({ok, list}
  // of service providers) is still accepted on its own — older callers and
  // the tests — and then the default is simply UNKNOWN, never assumed.
  function ctView(ctx) {
    const ct = ctx && ctx.crossTenant;
    if (ct) return { legacy: false, defaultOk: !!ct.defaultOk, partnersOk: !!ct.partnersOk,
      def: ct.defaultTrust || {}, dcDefault: ct.dcInboundDefault || null, partners: ct.partners || [] };
    const p = ctx && ctx.partners;
    return { legacy: true, defaultOk: false, partnersOk: !!(p && p.ok), def: {}, dcDefault: null,
      partners: p && p.ok ? (p.list || []).map((x) => ({ ...x, isServiceProvider: x.isServiceProvider !== false })) : [] };
  }
  // What the tenant trusts for one claim. byDefault: true | false | null (not
  // read). Each partner is judged by its EFFECTIVE setting.
  function inboundTrust(ctx, key, onlySp) {
    const v = ctView(ctx);
    const byDefault = v.defaultOk ? v.def[key] === true : null;
    const trusted = [], untrusted = [], unknown = [];
    for (const x of v.partners) {
      if (onlySp && !x.isServiceProvider) continue;
      const own = x.inboundTrust ? x.inboundTrust[key] : null;
      // legacy input has no default to inherit from: a missing flag was
      // always read as off there, and the tests pin that
      const eff = own === true || own === false ? own : v.legacy ? false : byDefault;
      const name = x.name || x.tenantId;
      (eff === true ? trusted : eff === false ? untrusted : unknown).push(name);
    }
    return { v, byDefault, trusted, untrusted, unknown };
  }
  const TRUST_WORD = { isMfaAccepted: "MFA", isCompliantDeviceAccepted: "compliant-device", isHybridAzureADJoinedDeviceAccepted: "hybrid-joined-device" };
  // For a guest from ANY organisation: true = every tenant's claim is
  // trusted, false = at least some organisations' claims are not, null = not
  // known. The sentence says which, in the reader's terms.
  function guestTrust(ctx, key) {
    const t = inboundTrust(ctx, key, false), w = TRUST_WORD[key] || key, v = t.v;
    const names = (a) => a.slice(0, 6).join(", ") + (a.length > 6 ? ` and ${a.length - 6} more` : "");
    if (!v.defaultOk && !v.partnersOk) return { ok: null, text: "Cross-tenant access settings could not be read, so inbound " + w + " trust was not verified." };
    if (v.legacy || !v.defaultOk) {
      // only the partner list is known
      if (t.untrusted.length) return { ok: false, text: `Inbound ${w} trust is not configured for: ${names(t.untrusted)}.` };
      return { ok: null, text: `Inbound ${w} trust IS configured for the partners listed in cross-tenant access settings, but the DEFAULT setting — which decides for every other organisation — was not read.` };
    }
    if (t.byDefault === false) {
      return { ok: false, text: `Inbound ${w} trust is OFF in the default cross-tenant access settings, so a guest from any organisation without its own configuration cannot bring the claim from home.`
        + (t.trusted.length ? ` It is switched on for ${names(t.trusted)} only.` : " No partner organisation has it switched on either.") };
    }
    if (t.untrusted.length) return { ok: false, text: `Inbound ${w} trust is on by default, but switched OFF for: ${names(t.untrusted)}.` };
    return { ok: true, text: `Inbound ${w} trust is on by default and not switched off for any partner.` };
  }
  // Service providers are a known list, so the question is simply whether
  // each of them trusts. null = cannot tell.
  function spWithoutTrust(ctx, key) {
    const t = inboundTrust(ctx, key, true);
    if (!t.v.partnersOk) return null;
    if (t.unknown.length) return null;
    return t.untrusted.map((name) => ({ name }));
  }
  const spPartners = (ctx) => { const v = ctView(ctx); return v.partnersOk ? v.partners.filter((x) => x.isServiceProvider) : null; };
  const spNames = (ctx) => (spPartners(ctx) || []).map((x) => x.name || x.tenantId);
  // Is B2B direct connect switched on inbound at all? false only when the
  // default blocks it AND no partner allows it — then no direct connect user
  // can arrive, and a gap for that type is theoretical today.
  function dcInboundOpen(ctx) {
    const v = ctView(ctx);
    if (v.legacy || !v.defaultOk || !v.partnersOk) return null;
    if (v.dcDefault === "allowed") return true;
    if (v.partners.some((x) => x.dcInbound === "allowed")) return true;
    return v.dcDefault === "blocked" ? false : null;
  }
  const partialNote = (sc) => sc.partial
    ? ` The policy does carve out ${sc.partial.types.map(extLabel).join(", ")}, but only for ${sc.partial.tenants.length} named tenant${sc.partial.tenants.length === 1 ? "" : "s"} — identities from any other tenant stay in scope.`
    : "";

  // ---- which external types does a guest MFA policy leave uncovered? ----
  // Types this include-clause MFA policy does not name AND no other active
  // policy requiring MFA (or a strength) on All resources reaches. Service
  // providers are the sp-* checks' case and stay out.
  function mfaReaches(type, ctx, exceptId) {
    return ((ctx && ctx.raws) || []).some((q) => q.id !== exceptId && isActive(q) && hasMfa(q) && !grants(q).includes("block")
      && appsInc(q).includes("All") && extScope(q, [type], true));
  }
  // 25475: A BLOCK IS COVERAGE TOO. A type that an unconditional block on All
  // resources shuts out (the CloudFellows CA099 "block everyone outside a
  // persona") cannot sign in at all, so there is no MFA gap for it — the
  // 25469 check named Other external users on CA400 while CA099 blocks them.
  // Unconditional means no location, platform, client-app, risk, device or
  // authentication-flow condition: any of those lets part of the type through.
  function fullBlock(q) {
    if (!isActive(q) || !grants(q).includes("block") || !appsInc(q).includes("All")) return false;
    const c = q.conditions || {};
    const loc = c.locations || {}, pl = c.platforms || {}, cat = c.clientAppTypes || [];
    if ((loc.includeLocations || []).length || (loc.excludeLocations || []).length) return false;
    if ((pl.includePlatforms || []).length || (pl.excludePlatforms || []).length) return false;
    if (cat.length && !cat.includes("all")) return false;
    if ((c.signInRiskLevels || []).length || (c.userRiskLevels || []).length || (c.servicePrincipalRiskLevels || []).length) return false;
    if (c.devices?.deviceFilter || c.authenticationFlows?.transferMethods || (c.insiderRiskLevels && String(c.insiderRiskLevels) !== "")) return false;
    return true;
  }
  function blockedBy(type, ctx) {
    return ((ctx && ctx.raws) || []).find((q) => fullBlock(q) && extScope(q, [type], true)) || null;
  }
  function extMfaGap(p, ctx) {
    const none = { types: [], allUsersExcl: [], dcSkipped: false, blocked: [] };
    if (!hasMfa(p) || grants(p).includes("block") || allUsers(p) || legacyIncExt(p)) return none;
    if (!appsInc(p).includes("All")) return none;
    const inc = incExt(p);
    if (!inc || !inc.types.length) return none;
    let types = EXT_TYPES.filter((t) => t !== SP && !inc.types.includes(t) && !mfaReaches(t, ctx, p.id));
    const blocked = [];
    types = types.filter((t) => { const b = blockedBy(t, ctx); if (b) blocked.push({ type: t, by: b.displayName || "(unnamed policy)" }); return !b; });
    let dcSkipped = false;
    if (types.includes(DIRECT_CONNECT) && dcInboundOpen(ctx) === false) { types = types.filter((t) => t !== DIRECT_CONNECT); dcSkipped = true; }
    const allUsersExcl = ((ctx && ctx.raws) || [])
      .filter((q) => isActive(q) && allUsers(q) && hasMfa(q) && appsInc(q).includes("All") && (legacyExcExt(q) || (excExt(q) && excExt(q).allTenants)))
      .map((q) => q.displayName || "(unnamed policy)");
    return { types, allUsersExcl, dcSkipped, blocked };
  }

  // ---- checks database ----
  const CHECKS = [
    // ── Emergency access / break-glass ────────────────────────────────
    {
      id: "break-glass-missing",
      title: "Break-glass accounts: no user exclusions on broad policy",
      appliesWhen: "Policy targets All users with MFA, block or device compliance controls",
      requirement: "Microsoft recommends excluding at least two emergency access (break-glass) accounts from every CA policy, so a misconfiguration or outage can never lock every administrator out of the tenant.",
      severity: "critical",
      docUrl: "https://learn.microsoft.com/entra/identity/role-based-access-control/security-emergency-access",
      remediation: "Exclude at least 2 emergency access (break-glass) accounts from this policy. Keep them cloud-only, with strong credentials, and alert on every sign-in.",
      // prefers the conventional break-glass group (CAB-SEC-U-BreakGlass),
      // falling back to whatever the exclusion patterns pointed at
      fix: (d, ctx) => {
        const bg = ctx && ctx.breakGlass;
        if (!bg) return null;
        const u = d.conditions.users || (d.conditions.users = {});
        const key = bg.type === "group" ? "excludeGroups" : "excludeUsers";
        const list = u[key] || (u[key] = []);
        if (list.includes(bg.id)) return [];
        list.push(bg.id);
        return [`Excluded the detected break-glass ${bg.type} ${bg.name || bg.id}`];
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p)) return null;
        if (!hasMfa(p) && !hasBlock(p) && !hasCompliance(p)) return null;
        if (!noUserExclusions(p)) return null;
        return {
          detail: `Policy "${p.displayName}" targets All users with enforcement controls but has NO user exclusions. If it is misconfigured or an outage occurs, all users — including every admin — can be locked out.`,
          impactedResources: ["All administrators", "Emergency access accounts"],
        };
      },
    },
    {
      id: "approved-client-app-retirement",
      title: "Policy frozen by the approved client app retirement — rebuild it on app protection",
      appliesWhen: "Policy includes the retired grant control 'Require approved client app'",
      requirement: "Require approved client app retired on 30 June 2026. Every policy that includes it is now READ-ONLY: it keeps being enforced while it is On, it can be switched off or deleted, and it can no longer be edited — not its users, not its apps, not its exclusions — and no new policy can use the control. The replacement is Require app protection policy, which only works for users who have an Intune app protection policy assigned; an app that does not support app protection is blocked by it.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/migrate-approved-client-app",
      remediation: "This policy cannot be changed in place any more — Entra refuses every edit. Build a replacement with Require app protection policy instead of the retired control, keep everything else the same, run it report-only, switch it On, then switch the old one Off and delete it.",
      remediationParts: [
        ["Why not edit", "Entra has made this policy read-only since 30 June 2026 because it includes the retired control. It is still enforced while On — nothing is broken today — but you can no longer add an exclusion, a group or an app to it."],
        ["Create", "A copy of this policy with Require app protection policy in place of Require approved client app (the Fix button builds it, state Off, version bumped). Same users, apps, platforms and conditions."],
        ["Before you switch it on", "Check that the people it reaches have an Intune app protection policy ASSIGNED for the apps they use. Report-only cannot evaluate app protection — every sign-in shows Report-only: Failure there — so use a pilot group instead of reading the report-only results."],
        ["Then", "Switch the new policy On, switch this one Off, and delete it once nobody signs in through it."],
      ],
      fix: (d) => {
        const g = d.grantControls || (d.grantControls = {});
        const b = g.builtInControls || [];
        const ch = [];
        if (!b.includes("compliantApplication")) { b.push("compliantApplication"); ch.push('Added grant control "Require app protection policy"'); }
        if (b.includes("approvedApplication")) {
          g.builtInControls = b.filter((x) => x !== "approvedApplication");
          ch.push('Removed the retired grant control "Require approved client app" — a policy that still carries it cannot be created any more');
        } else { g.builtInControls = b; }
        if (g.builtInControls.length > 1 && !g.operator) g.operator = "OR";
        return ch;
      },
      detect: (p) => {
        if (!isActive(p) || !grants(p).includes("approvedApplication")) return null;
        const hasAppProt = grants(p).includes("compliantApplication");
        const or = G(p).operator === "OR";
        return {
          detail: hasAppProt && or
            ? `Policy "${p.displayName}" is on the transition pattern (approved client app OR app protection policy). That was the right move before 30 June 2026, but the policy still INCLUDES the retired control, so it is now read-only: enforced as it stands, and impossible to edit. Rebuild it with app protection only.`
            : hasAppProt
              ? `Policy "${p.displayName}" requires approved client app AND app protection policy. It is read-only since 30 June 2026 and cannot be edited; the replacement should require app protection only.`
              : `Policy "${p.displayName}" relies on Require approved client app alone. It is still enforced while On, but it is read-only since 30 June 2026: no exclusion, no group and no app can be added to it any more, and when it is eventually switched off nothing replaces it unless you build the app protection version first.`,
          impactedResources: ["Mobile users on iOS and Android", "Anyone who needs an exclusion or scope change on this policy", ...(hasAppProt ? [] : ["Unmanaged BYOD devices once the policy is replaced"])],
        };
      },
    },

    // ── Token protection ──────────────────────────────────────────────
    {
      id: "token-prot-apps",
      title: "Token protection: only supported for specific apps",
      appliesWhen: "Policy uses the token protection session control",
      requirement: "Token protection policies must target only Exchange Online, SharePoint Online, Teams Services, Azure Virtual Desktop, Windows 365 and Windows Cloud Login. Targeting All resources or the Office 365 app group causes failures in unsupported clients.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#deployment",
      remediation: "Target only: Office 365 Exchange Online, Office 365 SharePoint Online, Microsoft Teams Services (plus AVD / Windows 365 if deployed). Do not use the Office 365 application group or All resources.",
      fix: (d) => {
        const a = d.conditions.applications || (d.conditions.applications = {});
        a.includeApplications = TOKEN_PROT_APPS.slice();
        return ["Target resources narrowed to the six token-protection supported apps (Exchange Online, SharePoint Online, Teams Services, AVD, Windows 365, Windows Cloud Login)"];
      },
      detect: (p) => {
        if (!isActive(p) || !hasTokenProtection(p)) return null;
        const inc = appsInc(p);
        if (inc.includes("All")) {
          return {
            detail: 'Token protection policy targets "All resources" instead of the specific supported applications — unsupported clients (PowerQuery, VS Code extensions, Office perpetual, PowerShell modules) will be blocked.',
            impactedResources: ["PowerShell modules accessing SharePoint", "PowerQuery for Excel", "VS Code extensions", "Office perpetual clients"],
          };
        }
        if (inc.some((a) => String(a).toLowerCase() === "office365")) {
          return {
            detail: "Token protection policy targets the Office 365 application group. Microsoft warns this may cause unintended failures — target Exchange Online, SharePoint Online and Teams Services individually.",
            impactedResources: ["Office 365 application group members"],
          };
        }
        const unsupported = inc.filter((a) => !TOKEN_PROT_APPS.includes(a));
        if (unsupported.length) {
          return {
            detail: `Token protection policy targets ${unsupported.length} application(s) that may not support token protection — only Exchange Online, SharePoint Online, Teams, AVD, Windows 365 and Windows Cloud Login are supported.`,
            impactedResources: unsupported,
          };
        }
        return null;
      },
    },
    {
      id: "token-prot-platform",
      title: "Token protection: supported platforms and desktop clients only",
      appliesWhen: "Policy uses the token protection session control",
      requirement: "Token protection works for native apps on Windows, and on macOS 14+ and iOS / iPadOS 16+ devices that are MDM-managed with the Microsoft Enterprise SSO plug-in; Android is not supported, and Azure Virtual Desktop / Windows 365 are protected on Windows only. The policy must name its platforms and target only 'Mobile apps and desktop clients' — including Browser blocks MSAL.js apps such as Teams Web (browser support is a preview for Azure Resource Manager web apps only).",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-token-protection#supported-resources",
      remediation: "Set Device platforms → Include → Windows (add macOS / iOS only for MDM-managed Apple devices with the Enterprise SSO plug-in, preview), and Client apps → Mobile apps and desktop clients only (leave Browser unchecked).",
      fix: (d) => {
        const ch = [];
        const plat = d.conditions.platforms || (d.conditions.platforms = { includePlatforms: [], excludePlatforms: [] });
        if (!(plat.includePlatforms || []).includes("windows")) { plat.includePlatforms = ["windows"]; ch.push("Device platforms set to Windows only"); }
        const cat = d.conditions.clientAppTypes || [];
        if (!cat.length || cat.includes("browser") || cat.includes("all")) {
          d.conditions.clientAppTypes = ["mobileAppsAndDesktopClients"];
          ch.push("Client apps set to mobile apps and desktop clients only (Browser removed)");
        }
        return ch;
      },
      detect: (p) => {
        if (!isActive(p) || !hasTokenProtection(p)) return null;
        const issues = [];
        const plat = p.conditions?.platforms;
        const SUPPORTED = ["windows", "macos", "ios"];   // Apple in preview, MDM-managed only
        const inc = (plat?.includePlatforms || []).map((x) => String(x).toLowerCase());
        if (!plat || !inc.length || inc.includes("all"))
          issues.push("The policy does not name its device platforms — token protection is supported on Windows, and in preview on MDM-managed macOS / iOS; every other platform is blocked.");
        else {
          const other = inc.filter((x) => !SUPPORTED.includes(x));
          if (other.length) issues.push(`The policy targets ${other.join(", ")} — token protection is not supported there and those users are blocked.`);
          if (inc.some((x) => x === "macos" || x === "ios")) issues.push("Apple platforms are included: token protection there requires MDM-managed devices with the Microsoft Enterprise SSO plug-in (or Platform SSO on macOS) — unmanaged Macs and iPhones are blocked.");
        }
        const cat = p.conditions?.clientAppTypes || [];
        if (!cat.length || cat.includes("browser") || cat.includes("all"))
          issues.push('The policy includes "Browser" client apps (or has no client apps condition) — MSAL.js-based apps like Teams Web will be blocked.');
        if (!issues.length) return null;
        return {
          detail: issues.join(" "),
          impactedResources: ["macOS / iOS / Android / Linux users", "Teams Web (MSAL.js)", "Browser-based applications"],
        };
      },
    },
    {
      id: "token-prot-devices",
      title: "Token protection: unsupported device types must be excluded",
      appliesWhen: "Policy uses the token protection session control",
      requirement: "Unsupported registration types must be excluded via device filters: Surface Hub, Teams Rooms, Entra-joined AVD hosts and Cloud PCs, Autopilot self-deploying, bulk-enrolled devices and Azure VMs.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/deployment-guide-token-protection-windows#known-limitations",
      remediation: 'Add a device filter in EXCLUDE mode that matches only the Entra-JOINED Cloud PCs, AVD session hosts, Power Automate hosted machines and Azure VMs — hybrid-joined ones are supported and should stay protected. For example: (device.systemLabels -contains "CloudPC" -and device.trustType -eq "AzureAD") -or (device.systemLabels -contains "AzureVirtualDesktop" -and device.trustType -eq "AzureAD") -or (device.systemLabels -contains "MicrosoftPowerAutomate" -and device.trustType -eq "AzureAD") -or (device.profileType -eq "SecureVM" -and device.trustType -eq "AzureAD"). Autopilot self-deploying devices cannot be matched by type: filter on the enrollmentProfileName of their Intune profile. Surface Hub and Teams Rooms on Windows cannot be excluded by a device filter — exclude their resource accounts.',
      remediationParts: [
        ["Change", "On this policy: Conditions → Filter for devices → Exclude filtered devices, with the rule in the Fix (it pairs each device type with trustType AzureAD). The Fix button builds it."],
        ["Only Entra-joined", "Learn lists Entra-JOINED Cloud PCs, AVD hosts, Power Automate hosted machines and Azure VMs as unsupported. The same devices hybrid-joined are supported, so a rule without the trustType takes them out of the protection for nothing."],
        ["By hand", "Autopilot self-deploying devices: add -or device.enrollmentProfileName -eq \"<your self-deploying profile name>\". Surface Hub and Teams Rooms on Windows: exclude their resource accounts (the shared-device group) — no filter can name them."],
      ],
      fix: (d) => {
        const dev = d.conditions.devices || (d.conditions.devices = {});
        dev.deviceFilter = { mode: "exclude", rule: TOKEN_PROT_DEVICE_RULE };
        // Note only names what the rule can actually express. Autopilot
        // self-deploying is NOT a profileType value, so it cannot be matched
        // here — the check's remediation text says how to handle those.
        return ['Device filter set to exclude the unsupported device types — mode "exclude" matching Entra-JOINED Cloud PCs, Azure Virtual Desktop hosts, Power Automate hosted machines and Azure VMs; hybrid-joined ones stay protected. Autopilot self-deploying devices need their enrollment profile name added by hand.'];
      },
      detect: (p) => {
        if (!isActive(p) || !hasTokenProtection(p)) return null;
        const filter = p.conditions?.devices?.deviceFilter;
        if (!filter) {
          return {
            detail: "Token protection policy has no device filter excluding unsupported device types — Surface Hub, Teams Rooms, Entra-joined Cloud PCs / AVD hosts, Autopilot self-deploying, bulk-enrolled devices and Azure VMs will be blocked with unclear errors.",
            impactedResources: ["Surface Hub", "Teams Rooms (Windows)", "Cloud PCs (Entra joined)", "AVD session hosts (Entra joined)", "Autopilot self-deploying devices", "Bulk-enrolled Windows devices", "Azure VMs with Entra ID auth"],
          };
        }
        const rule = String(filter.rule || "").toLowerCase();
        // Only the types a device filter can actually express are checked here.
        // Autopilot self-deploying, Surface Hub and Teams Rooms are NOT valid
        // profileType / systemLabels values, so they cannot be excluded via the
        // filter — requiring them would make this finding impossible to clear
        // even after a correct fix. Their impact is covered by the dedicated
        // Surface Hub / Teams Rooms findings instead.
        const known = [
          { pat: "cloudpc", label: "Cloud PCs" },
          { pat: "azurevirtualdesktop", label: "Azure Virtual Desktop" },
          { pat: "securevm", label: "Azure VMs (SecureVM)" },
        ];
        const missing = known.filter((k) => !rule.includes(k.pat));
        // 25471: the other direction — a rule that excludes the VM / Cloud PC
        // labels without trustType also removes hybrid-joined devices, which
        // ARE supported.
        if (filter.mode === "exclude" && !missing.length && !rule.includes("trusttype")) {
          return {
            detail: "The device filter excludes Cloud PCs, AVD hosts and Azure VMs whatever their join type. Only the Entra-JOINED ones are unsupported — the rule also takes hybrid-joined Cloud PCs and session hosts out of token protection, where they would have been protected.",
            impactedResources: ["Hybrid-joined Cloud PCs", "Hybrid-joined AVD session hosts"],
          };
        }
        if (missing.length && filter.mode === "exclude") {
          return {
            detail: `The device filter may not cover every device type a filter can exclude — potentially missing: ${missing.map((m) => m.label).join(", ")}. (Surface Hub, Teams Rooms and Autopilot self-deploying cannot be excluded by a device filter and are flagged separately.)`,
            impactedResources: missing.map((m) => m.label),
          };
        }
        return null;
      },
    },

    // ── Continuous access evaluation / resilience ─────────────────────
    {
      id: "cae-disabled",
      title: "Continuous access evaluation disabled",
      appliesWhen: "Policy explicitly disables continuous access evaluation (CAE)",
      requirement: "CAE enables near-real-time token revocation. With CAE disabled, revocation falls back to token expiry (up to 1 hour) — a vulnerability window after security events such as account disablement or password change.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-continuous-access-evaluation",
      remediation: "Remove the CAE-disable setting unless strict evaluation demonstrably breaks a workload; CAE is on by default and should stay active.",
      fix: (d) => {
        if (d.sessionControls) delete d.sessionControls.continuousAccessEvaluation;
        return ["Removed the CAE-disable session control — continuous access evaluation returns to its default (on)"];
      },
      detect: (p) => {
        if (!isActive(p)) return null;
        if (S(p).continuousAccessEvaluation?.mode !== "disabled") return null;
        return {
          detail: "Policy explicitly disables continuous access evaluation — access tokens stay valid up to 1 hour after a security event (user disabled, password change, location change).",
          impactedResources: ["Real-time session revocation", "Location-based enforcement", "Risk-based session termination"],
        };
      },
    },
    {
      id: "resilience-disabled-impact",
      title: "Resilience defaults disabled: users blocked during outages",
      appliesWhen: "Policy disables resilience defaults",
      requirement: "With resilience defaults disabled, users whose sessions expire during an Entra ID outage are denied access until the service recovers. Only intended for high-security scenarios.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/resilience-defaults",
      remediation: "Keep resilience defaults enabled unless your organization requires strict real-time policy evaluation (e.g. regulated industries).",
      fix: (d) => {
        if (d.sessionControls) d.sessionControls.disableResilienceDefaults = false;
        return ["Resilience defaults re-enabled (disableResilienceDefaults: false)"];
      },
      detect: (p) => {
        if (!isActive(p) || !S(p).disableResilienceDefaults) return null;
        return {
          detail: `Policy disables resilience defaults for ${allUsers(p) ? "ALL users" : "the targeted users"} — during an Entra ID outage, expiring sessions are denied access until the service recovers.`,
          impactedResources: ["Covered users during Entra ID outages", "Business continuity"],
        };
      },
    },

    // ── Shared devices: Surface Hub / Teams Rooms ─────────────────────
    {
      id: "surface-hub-mfa",
      title: "Surface Hub: cannot satisfy MFA or compliance requirements",
      appliesWhen: "Broad policy requires MFA, compliance, hybrid join, approved app or app protection",
      requirement: "Surface Hub device accounts are incompatible with MFA, authentication strength, device compliance, hybrid join, approved client app, app protection and password change controls — they must be excluded from such policies.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/surface-hub/conditional-access-for-surface-hub",
      remediation: "Exclude Surface Hub device accounts (or a group containing them) from this policy — select the user object, not the device object.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        const bad = grants(p).filter((c) => ["mfa", "compliantDevice", "domainJoinedDevice", "approvedApplication", "compliantApplication", "passwordChange"].includes(c));
        const strength = G(p).authenticationStrength != null;
        if (!bad.length && !strength) return null;
        return {
          detail: `Policy requires ${[...bad, ...(strength ? ["authentication strength"] : [])].join(", ")} for all users — Surface Hub device accounts cannot satisfy these controls and will fail to sign in. Verify they are excluded (this check cannot see which excluded accounts are Surface Hubs).`,
          impactedResources: ["Surface Hub calendar sync", "Surface Hub Teams meetings", "Surface Hub whiteboard"],
        };
      },
    },
    {
      id: "teams-rooms-mfa",
      title: "Teams Rooms: MFA / authentication strength not supported",
      appliesWhen: "Policy requires MFA or authentication strength for all users",
      requirement: "Teams Rooms on Windows supports neither MFA nor authentication strength; Teams Rooms on Android supports MFA but not authentication strength. Room resource accounts must be excluded from MFA-enforcing policies.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Exclude Teams Rooms resource accounts (or a shared-device group) from MFA-enforcing policies; use device compliance as the control for these devices instead.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        if (!hasMfa(p)) return null;
        return {
          detail: "Policy requires MFA / authentication strength for all users and all resources. Teams Rooms on Windows supports neither; Teams Rooms on Android supports MFA but no authentication strength — room resource accounts will be blocked from signing in unless excluded.",
          impactedResources: ["Teams Rooms on Windows", "Teams Rooms on Android (auth strength)", "Teams Panels"],
        };
      },
    },
    {
      id: "device-code-teams-android",
      title: "Device code block: breaks Teams Android remote sign-in",
      appliesWhen: "Policy blocks the device code authentication flow",
      requirement: "Blocking device code flow prevents remote sign-in via microsoft.com/devicelogin, which Teams Android devices (phones, panels, rooms) rely on for setup. Their resource accounts need an exclusion or an alternative sign-in method.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Exclude Teams device resource accounts from the device-code-flow block policy, or add a device filter excluding Teams Android devices.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !hasBlock(p)) return null;
        const tm = p.conditions?.authenticationFlows?.transferMethods;
        if (!tm || tm === "none" || !String(tm).includes("deviceCodeFlow")) return null;
        return {
          detail: "Policy blocks the device code authentication flow — remote sign-in (microsoft.com/devicelogin) for Teams Android devices, Teams phones and Teams panels stops working; these devices use device code flow for initial setup.",
          impactedResources: ["Teams Rooms on Android", "Teams phones", "Teams panels", "Remote device sign-in"],
        };
      },
    },
    {
      id: "signin-freq-teams-rooms",
      title: "Sign-in frequency: causes Teams Rooms periodic sign-out",
      appliesWhen: "Policy enforces sign-in frequency for all users and all resources",
      requirement: "Teams Rooms, phones and panels do not support the sign-in frequency session control — it makes them periodically sign out, disrupting meetings and room availability.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Exclude Teams Rooms / shared-device resource accounts from sign-in frequency policies, or scope the frequency requirement to admin roles instead of all users.",
      needsGroup: "sharedDevices",
      fix: excludeGroupFix("sharedDevices", "shared-device / resource account"),
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        const sif = S(p).signInFrequency;
        if (!sif?.isEnabled) return null;
        const val = sif.frequencyInterval === "everyTime" ? "every time" : `${sif.value} ${sif.type}`;
        return {
          detail: `Policy enforces sign-in frequency (${val}) for all users — Teams Rooms, Teams phones and Teams panels do not support this and will periodically sign out, disrupting scheduled meetings.`,
          impactedResources: ["Teams Rooms on Windows", "Teams Rooms on Android", "Teams phones", "Teams panels"],
        };
      },
    },
    {
      id: "signin-freq-individual-services",
      title: "Sign-in frequency on individual M365 services breaks Teams",
      appliesWhen: "Sign-in frequency targets specific M365 services instead of all resources",
      requirement: "Applying sign-in frequency to individual Microsoft 365 services (Exchange, SharePoint, Teams) can interrupt or stop the Teams device sign-in flow and is not supported.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "Target all resources (or Microsoft Admin Portals) with the sign-in frequency policy instead of individual M365 services.",
      detect: (p) => {
        if (!isActive(p)) return null;
        if (!S(p).signInFrequency?.isEnabled) return null;
        const inc = appsInc(p);
        if (inc.includes("All")) return null;
        if (!inc.some((a) => [EXCHANGE_ONLINE, SHAREPOINT_ONLINE, TEAMS_SERVICE].includes(a))) return null;
        return {
          detail: "Sign-in frequency is configured on individual Microsoft 365 services rather than all resources — Microsoft documents that this can interrupt or stop the Teams (device) sign-in flow.",
          impactedResources: ["Teams sign-in flow", "Teams Rooms devices", "Teams desktop/mobile clients"],
        };
      },
    },

    // ── App exclusions required by other Microsoft services ──────────
    {
      id: "defender-mobile-exclusion",
      title: "Defender mobile apps must be excluded from restrictive policies",
      appliesWhen: "Broad block policy targets all users and all resources",
      requirement: "The Microsoft Defender mobile app must run continuously in the background to report device posture. Restrictive CA policies that do not exclude the Defender apps can stop that reporting, making devices appear non-compliant (a compliance loop).",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/defender-endpoint/mobile-resources-defender-endpoint#microsoft-defender-mobile-app-exclusion-from-conditional-access-ca-policies",
      remediation: `Exclude MicrosoftDefenderATP XPlat (${DEFENDER_ATP_XPLAT}) and Microsoft Defender for Mobile TVM (${DEFENDER_TVM}) from this policy — create their service principals first if they do not exist.`,
      fix: (d) => {
        const a = d.conditions.applications || (d.conditions.applications = {});
        const exc = a.excludeApplications || (a.excludeApplications = []);
        const ch = [];
        for (const [id, label] of [[DEFENDER_ATP_XPLAT, "MicrosoftDefenderATP XPlat"], [DEFENDER_TVM, "Defender for Mobile TVM"]]) {
          if (!exc.some((x) => String(x).toLowerCase() === id)) { exc.push(id); ch.push(`Excluded ${label} (${id})`); }
        }
        return ch;
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p) || !hasBlock(p)) return null;
        const exc = appsExcLower(p);
        if (exc.includes(DEFENDER_ATP_XPLAT) && exc.includes(DEFENDER_TVM)) return null;
        // 25469: only a block the Defender app can actually run into. It is a
        // modern-auth mobile app, so a legacy-protocol block, a device-code /
        // authentication-transfer block, or a block whose platforms leave out
        // both Android and iOS never reaches it.
        const cat = p.conditions?.clientAppTypes || [];
        if (cat.length && !cat.includes("all") && !cat.includes("mobileAppsAndDesktopClients")) return null;
        if (p.conditions?.authenticationFlows?.transferMethods) return null;
        const pl = p.conditions?.platforms;
        if (pl) {
          const inc = (pl.includePlatforms || []).map((x) => String(x).toLowerCase());
          const exl = (pl.excludePlatforms || []).map((x) => String(x).toLowerCase());
          const mobile = (x) => (inc.includes("all") || inc.includes(x)) && !exl.includes(x);
          if (inc.length && !mobile("android") && !mobile("ios")) return null;
        }
        return {
          detail: "Restrictive block policy targets all resources without excluding the Microsoft Defender for Endpoint mobile apps — Defender can be prevented from reporting device posture, so devices appear non-compliant because Defender cannot reach its backend.",
          impactedResources: [`MicrosoftDefenderATP XPlat (${DEFENDER_ATP_XPLAT})`, `Defender for Mobile TVM (${DEFENDER_TVM})`, "Mobile device compliance reporting"],
        };
      },
    },
    {
      id: "azure-vm-signin-mfa",
      title: "Azure VM sign-in: MFA over RDP needs special client support",
      appliesWhen: "Policy requires MFA or device compliance for all users and all resources",
      requirement: `The Microsoft Azure Windows Virtual Machine Sign-In app (${AZURE_VM_SIGNIN}) requires the RDP client to supply the MFA claim; without Windows Hello for Business or FIDO2 that is impossible, and Windows Server RDP clients cannot satisfy device compliance at all. Microsoft recommends excluding the app when WHfB is not deployed.`,
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/devices/howto-vm-sign-in-azure-ad-windows#mfa-sign-in-method-required",
      remediation: `If Windows Hello for Business is not deployed, exclude the Azure Windows VM Sign-In app (${AZURE_VM_SIGNIN}) from MFA / compliance policies — or ensure all RDP clients support WHfB or FIDO2.`,
      fix: (d) => {
        const a = d.conditions.applications || (d.conditions.applications = {});
        const exc = a.excludeApplications || (a.excludeApplications = []);
        if (exc.some((x) => String(x).toLowerCase() === AZURE_VM_SIGNIN)) return [];
        exc.push(AZURE_VM_SIGNIN);
        return [`Excluded Azure Windows VM Sign-In (${AZURE_VM_SIGNIN})`];
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !allApps(p)) return null;
        if (!hasMfa(p) && !hasCompliance(p)) return null;
        if (appsExcLower(p).includes(AZURE_VM_SIGNIN)) return null;
        return {
          detail: "Policy requires MFA or device compliance for all users and all resources without excluding the Azure Windows VM Sign-In app — RDP connections to Azure VMs / Arc-enabled servers must supply the MFA claim from the connecting device, which fails without Windows Hello for Business or FIDO2; Windows Server RDP clients cannot satisfy device compliance.",
          impactedResources: [`Azure Windows VM Sign-In (${AZURE_VM_SIGNIN})`, "RDP to Azure VMs", "RDP to Arc-enabled Windows Servers", "Windows Server RDP client devices"],
        };
      },
    },

    // ── Behavior changes & hybrid identity ────────────────────────────
    {
      id: "all-resources-exclusion-change",
      title: "All resources with app exclusions: baseline scopes are enforced against Windows Azure Active Directory",
      appliesWhen: 'Policy targets "All resources" and has app exclusions',
      requirement: "Until the rollout that began 15 June 2026, an All-resources policy with ANY app exclusion silently exempted sign-ins that requested only the baseline scopes (openid, profile, email, offline_access, User.Read, User.Read.All, User.ReadBasic.All, People.Read, People.Read.All, GroupMember.Read.All, Member.Read.Hidden). Those sign-ins are now evaluated against Windows Azure Active Directory (00000002-0000-0000-c000-000000000000) as the audience and get the policy's controls — unless the tenant's Baseline scopes setting keeps the legacy behaviour (Customize behavior for a placeholder app the policy excludes, or Disable enforcement, which Microsoft advises against).",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/concept-enforcement-resource-exclusions",
      remediation: "Prefer All-resources policies with NO app exclusions — give an exempted app its own targeted policy instead. Where an exclusion must stay, check whether the app requests only baseline scopes (Learn shows the sign-in log query on conditionalAccessAudiences) and whether it can take a Conditional Access challenge; if it cannot, keep the legacy behaviour for that ONE policy with Customize behavior, never with Disable enforcement.",
      detect: (p, ctx) => {
        if (!isActive(p) || !allApps(p)) return null;
        const excl = A(p).excludeApplications || [];
        if (!excl.length) return null;
        const bs = (typeof GapCheck !== "undefined" && GapCheck.baselineScopes) ? GapCheck.baselineScopes(ctx?.caSettings) : { mode: "unread", scope: null };
        const custom = bs.mode === "custom" && excl.some((a) => String(a).toLowerCase() === String(bs.scope).toLowerCase());
        const tenant = bs.mode === "disabled" ? " This tenant has Disable enforcement set, so the exclusions on this policy leak the baseline scopes TODAY."
          : custom ? " This policy excludes the tenant's placeholder app (Customize behavior), so the legacy exemption still applies to it by design — a documented exception, not an accident, as long as somebody owns it."
          : bs.mode === "custom" ? " The tenant uses Customize behavior, but this policy does not exclude the placeholder app, so it enforces."
          : bs.mode === "unread" ? " The tenant's Baseline scopes setting was not read; check it in the Entra admin center."
          : " The tenant enforces (Microsoft default or Enable enforcement).";
        return {
          detail: `Policy targets "All resources" with ${excl.length} app exclusion(s). Since the June-2026 rollout a sign-in that requests only the baseline scopes is evaluated against Windows Azure Active Directory and receives this policy's controls even for an excluded app — the directory-enumeration path the old exemption opened is closed, and an excluded app that cannot take a CA challenge is the thing that breaks.${tenant}`,
          impactedResources: ["Windows Azure Active Directory (00000002-0000-0000-c000-000000000000)", "Excluded apps that request only baseline scopes", "Public clients (desktop CLIs, VS Code, Azure CLI) requesting only User.Read or openid/profile"],
        };
      },
    },
    // ── User risk remediation ──────────────────────────────────────────
    // Learn (id-protection/concept-identity-protection-policies): Require
    // risk remediation covers password-based AND passwordless users, overrides
    // Require password change when a user is in both, is not supported for
    // guests, and carries an authentication strength + sign-in frequency
    // every time by itself. Microsoft has NOT deprecated password change —
    // these checks say what each control can and cannot do, nothing more.
    {
      id: "user-risk-password-change-only",
      title: "User risk: Require password change cannot remediate a passwordless user",
      appliesWhen: "User-risk policy grants Require password change and not Require risk remediation",
      requirement: "Require password change remediates user risk by having the user complete MFA and change their password. A user who signs in without a password — passkey / FIDO2, Windows Hello for Business, certificate, Authenticator phone sign-in — has no password to change and cannot complete that flow; at high risk they stay blocked until an administrator dismisses the risk. Require risk remediation chooses the flow per user (secure password change, or session revocation and a fresh strong sign-in) and overrides password change when a user is in both.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/id-protection/concept-identity-protection-policies#require-risk-remediation-control",
      remediation: "Move the user-risk policy to Require risk remediation (an authentication strength and sign-in frequency every time are applied with it), keeping the same users, All resources and the risk level. Not supported for guests and external users — keep them on a separate policy or exclude them. Legacy ID Protection risk policies retire on 1 October 2026; a Conditional Access policy is the place for this either way.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        if (!((p.conditions?.userRiskLevels) || []).length) return null;
        const g = grants(p);
        if (!g.includes("passwordChange") || g.includes("riskRemediation")) return null;
        const am = ctx?.authMethods;
        const on = am ? passwordlessMethods(am) : null;
        const tenant = on === null ? " The tenant's authentication methods policy was not read, so whether passwordless sign-in is enabled here is unknown."
          : on.length ? ` Passwordless methods enabled in this tenant: ${on.join(", ")} — users signing in with them cannot complete a password change.`
          : " No passwordless method is enabled in the authentication methods policy today, so the gap is latent — it opens with the first passkey or certificate rollout.";
        return {
          detail: `Policy "${p.displayName}" remediates user risk with Require password change only.${tenant}`,
          impactedResources: ["Passkey / FIDO2 and certificate users", "Windows Hello for Business sign-ins", "Authenticator phone sign-in users", "High-risk users left blocked until an admin dismisses the risk"],
        };
      },
    },
    {
      id: "user-risk-remediation-eam",
      title: "User risk: Require risk remediation cannot be satisfied by an external authentication method",
      appliesWhen: "User-risk policy grants Require risk remediation and the tenant has an external authentication method (Duo, Okta, Ping …) enabled",
      requirement: "Require risk remediation always carries an authentication strength, and external authentication methods are incompatible with authentication strengths (Learn: use the Require multifactor authentication grant control for EAM). A user whose only MFA method is the external one cannot pass the remediation challenge and stays blocked.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/policy-guests-mfa-strength#create-a-conditional-access-policy",
      remediation: "Keep users whose MFA is the external method on a separate user-risk policy that uses the built-in Require multifactor authentication control (with Require password change, or Block), and exclude that group from the risk-remediation policy; or register a Microsoft method (Authenticator, passkey) for them so the strength can be met. Verify on the tenant which combination the portal accepts before rolling it out.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        if (!((p.conditions?.userRiskLevels) || []).length) return null;
        if (!grants(p).includes("riskRemediation")) return null;
        const eam = ctx?.authMethods ? eamMethods(ctx.authMethods) : [];
        if (!eam.length) return null;   // no EAM enabled, or the policy was not read: nothing to say
        return {
          detail: `Policy "${p.displayName}" grants Require risk remediation, which carries an authentication strength. External authentication method(s) enabled in this tenant: ${eam.join(", ")} — a strength cannot be satisfied by them, so a high-risk user whose MFA is only the external method cannot self-remediate.`,
          impactedResources: eam.map((m) => `${m} users`).concat(["High-risk users blocked until an admin dismisses the risk"]),
        };
      },
    },
    {
      id: "dirsync-account-mfa",
      title: "Directory sync exclusion: Entra Connect v2.5.76.0+ removes the need",
      appliesWhen: "MFA policy for All users excludes the Directory Synchronization Accounts role",
      requirement: "The Directory Synchronization Accounts exclusion existed because the sync engine's service account could not perform MFA. Entra Connect v2.5.76.0+ supports application-based authentication, removing the need for this MFA gap.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/hybrid/connect/reference-connect-version-history",
      remediation: "Check your Entra Connect version; if v2.5.76.0 or later, migrate the sync engine to application-based authentication and remove the Directory Synchronization Accounts exclusion from MFA policies.",
      fix: (d) => {
        const u = d.conditions.users || (d.conditions.users = {});
        u.excludeRoles = (u.excludeRoles || []).filter((r) => r !== DIRSYNC_ROLE);
        return ["Removed the Directory Synchronization Accounts role exclusion — only apply this after confirming Entra Connect is v2.5.76.0 or later with application-based authentication"];
      },
      detect: (p) => {
        if (!isActive(p) || !allUsers(p) || !hasMfa(p)) return null;
        if (!(U(p).excludeRoles || []).includes(DIRSYNC_ROLE)) return null;
        return {
          detail: "This MFA policy excludes the Directory Synchronization Accounts role. If the tenant runs Entra Connect v2.5.76.0 or later, application-based authentication makes this exclusion unnecessary — review the Entra Connect version and close the MFA gap.",
          impactedResources: ["Directory Synchronization Accounts role", "Entra Connect sync service account", "Hybrid identity sync pipeline"],
        };
      },
    },

    // ── External authentication methods (third-party MFA) ─────────────
    {
      id: "eam-external-user-impact",
      title: "External authentication method (EAM) may block guests and vendors",
      appliesWhen: "Broad MFA policy requires a third-party MFA provider (custom controls or an authentication strength with EAM combinations)",
      requirement: "Guests, B2B collaborators and external service providers are not enrolled in your third-party MFA provider (Duo, RSA, …) and cannot satisfy an EAM requirement — a policy demanding it for All users effectively blocks external access.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/authentication/how-to-authentication-external-method-manage",
      remediation: "Exclude guest/external user types and give them a separate policy with Entra ID native MFA; or use an authentication strength that accepts both the EAM and native MFA methods; or scope the EAM requirement to a group of enrolled internal users.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        if (!allUsers(p) && !hasAdminRoles(p)) return null;
        const customFactors = (G(p).customAuthenticationFactors || []).length > 0;
        let eamStrength = false, strengthName = "", eamCombos = [];
        const ref = G(p).authenticationStrength;
        if (ref?.id && ctx?.strengths) {
          const asp = ctx.strengths.get(ref.id);
          if (asp) {
            eamCombos = (asp.allowedCombinations || []).filter((c) => String(c).toLowerCase().includes("externalauthenticationmethod"));
            if (eamCombos.length) { eamStrength = true; strengthName = asp.displayName || ref.displayName || "Unknown"; }
          }
        }
        if (!customFactors && !eamStrength) return null;
        const excludesGuests = p.conditions?.users?.excludeGuestsOrExternalUsers != null;
        const src = eamStrength
          ? `an authentication strength ("${strengthName}") containing external authentication method combinations`
          : "custom authentication factors (legacy custom controls)";
        return {
          detail: excludesGuests
            ? `Policy requires ${src}. Guests appear to be excluded, but verify ALL external identities are covered — B2B direct connect, service provider and cross-tenant sync accounts may still be impacted.`
            : `Policy requires ${src} for a broad scope without excluding guests or external users — external identities cannot enroll in your third-party MFA provider and will be blocked.`,
          impactedResources: [
            "B2B guest users", "External service providers / vendors", "Cross-tenant collaboration partners", "MSP accounts",
            ...(eamStrength ? [`Auth strength "${strengthName}": ${eamCombos.length} EAM combination(s)`] : []),
          ],
        };
      },
    },
    // ── Guests and external users (25433) ─────────────────────────────
    // Everything here is read off the two Microsoft tables quoted above the
    // helpers. The service-provider checks below say more about a CSP, so
    // these skip a policy whose only external type is serviceProvider.
    {
      id: "guest-auth-strength-unsatisfiable",
      title: "Authentication strength guests cannot complete in this tenant",
      appliesWhen: "Policy requires an authentication strength whose methods are home-tenant only, with guests or external users in scope",
      requirement: "An external user completes MFA either in their home tenant or in yours. FIDO2 / passkey, Windows Hello for Business, certificate-based authentication, Authenticator phone sign-in and OATH hardware tokens are accepted ONLY when completed in the home tenant, and only when your cross-tenant access settings trust MFA claims from it. In your own tenant an external user can complete SMS, voice call, Authenticator push and OATH software tokens — nothing else. A strength built only from home-tenant methods (the built-in Phishing-resistant MFA and Passwordless MFA strengths are) therefore cannot be satisfied by a guest unless inbound MFA trust is on AND their home tenant has deployed that method.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/identity/authentication/concept-authentication-strength-external-users",
      remediation: "Exclude the guest and external user types from this policy and give them their own with the Multifactor authentication strength, which they can satisfy here. Or turn on inbound MFA trust for the partner tenants — having confirmed with them that the method is actually deployed, since trust alone does not create a credential.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        const ref = G(p).authenticationStrength;
        if (!ref?.id || !ctx?.strengths) return null;
        const asp = ctx.strengths.get(ref.id);
        if (!asp) return null;
        const combos = asp.allowedCombinations || [];
        if (!combos.length) return null;
        // Satisfiable here if ANY combination a guest can complete here.
        if (combos.some(comboUsableHere)) return null;
        const sc = extScope(p, CROSS_TENANT_TYPES);
        if (!sc) return null;
        const methods = [...new Set(combos.flatMap(comboMethods).map((m) => HOME_ONLY_METHODS[m]).filter(Boolean))];
        const tap = combos.some((c) => comboMethods(c).some(isNeverForGuests));
        const atHome = combos.some(comboUsableAtHome) && methods.length;
        const gt = guestTrust(ctx, "isMfaAccepted");
        const trust = !atHome
          ? "No combination of it can be met by a guest at all — not here and not through trust."
          : gt.ok === true
            ? gt.text + " So a guest CAN meet it — but only if their own organisation has deployed one of these methods; trust passes a claim through, it does not create a credential."
            : gt.text;
        const tapNote = tap ? " The strength also allows a Temporary Access Pass, but a TAP does not work for guest users — it helps your own accounts only." : "";
        return {
          detail: `Policy "${p.displayName}" requires the authentication strength "${esc(asp.displayName || ref.displayName || ref.id)}" and its scope reaches ${sc.types.map(extLabel).join(", ")} (via ${sc.via}). Every combination that strength allows needs ${methods.join(" or ")}, which an external user can only complete in their home tenant.${tapNote} ${trust}${partialNote(sc)}`,
          impactedResources: [
            ...sc.types.map(extLabel),
            `Strength "${asp.displayName || ref.id}": ${combos.length} combination${combos.length === 1 ? "" : "s"}, none a guest can complete here`,
            ...methods.map((m) => `Home tenant only: ${m}`),
          ],
        };
      },
    },
    {
      id: "guest-auth-strength-not-universal",
      title: "Authentication strength does not reach every external identity",
      appliesWhen: "Policy requires an authentication strength with guests or external users in scope",
      requirement: "Authentication strength policies apply only to external users who authenticate with Microsoft Entra ID. For email one-time passcode, SAML/WS-Fed federated, Google-federated and Microsoft personal account users the strength does not apply at all — Microsoft's guidance is to use the Require multifactor authentication grant control for those identities instead.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/identity/conditional-access/policy-guests-mfa-strength",
      remediation: "Exclude nothing and add one policy beside this one. The four identities are not blocked by this policy, the strength is simply not applied to them — and no Conditional Access condition names the identity provider a guest signed in with, so they cannot be carved out of its scope even if you wanted to. The second policy carries the same scope and the plain Require multifactor authentication grant control; Entra refuses both controls in one policy, which is why it has to be its own.",
      // Two answers, because the one-paragraph version was read as an
      // instruction to carve the four identities out of this policy (Mihai,
      // 25458: "not clear what to exclude and what to create") — and that
      // carve-out cannot be written.
      remediationParts: [
        ["Exclude", "Nothing — and this is one of the two external findings here that does NOT ask for an exclusion, because it is one of the two where the policy is too loose rather than too strict. Leave this policy as it is. Conditional Access has no condition for the identity provider a guest used — the six external user types do not separate an Entra-authenticated guest from a Google-federated one — so these four identities cannot be taken out of its scope. They also do not need to be: the strength is not applied to them, it does not block them."],
        ["Create", "One policy beside this one, at the next free CA number in the same range: the same users, the same external user types, the same resources and conditions, and the grant control Require multifactor authentication instead of the authentication strength. Born report-only."],
        ["Why two", "Microsoft does not allow Require multifactor authentication and Require authentication strength in the same policy, so the plain requirement has to live in its own. Every policy that applies must be satisfied, so both reach every guest: an Entra-authenticated external meets the strength, which already implies MFA, and an email one-time passcode, SAML/WS-Fed, Google or Microsoft account external meets the plain requirement — the only one of the two that reaches them."],
      ],
      detect: (p, ctx) => {
        if (!isActive(p) || !G(p).authenticationStrength) return null;
        if (grants(p).includes("mfa")) return null;      // the grant control is there as well
        // A strength no stronger than Require MFA is the OTHER check's case —
        // there the answer is to swap this policy's control, not to add one.
        const asp = ctx && ctx.strengths && ctx.strengths.get(G(p).authenticationStrength.id);
        if (isMfaEquivalent(asp)) return null;
        const sc = extScope(p, CROSS_TENANT_TYPES);
        if (!sc) return null;
        const nm = (asp && asp.displayName) || "an authentication strength";
        return {
          detail: `Policy "${p.displayName}" enforces its MFA requirement through ${nm}, and its scope reaches ${sc.types.map(extLabel).join(", ")}. Guests who sign in with an email one-time passcode, a SAML/WS-Fed identity provider, a Google account or a Microsoft account are not covered by an authentication strength at all — for them this policy imposes no MFA requirement. This strength asks for more than Require multifactor authentication does, so swapping the control would weaken it for everybody else: the requirement has to be added beside it rather than exchanged.`,
          impactedResources: ["Email one-time passcode guests", "SAML / WS-Fed federated guests", "Google-federated guests", "Microsoft account (MSA) guests"],
        };
      },
      // A COMPANION, not an adjustment (see buildFixes). Every other fix edits
      // the offending policy; this one must not touch it — taking the strength
      // off would be the opposite of the advice. What is missing is a SECOND
      // policy, so that is what this returns: the same scope, the plain
      // control, its own number.
      companion: (raw, ctx) => {
        const d = draftFrom(raw);
        // Only the MFA requirement moves. The original keeps its other grant
        // and session controls and still applies to these users, so repeating
        // them here would be a second opinion on settings nobody asked about.
        d.grantControls = { operator: "OR", builtInControls: ["mfa"], customAuthenticationFactors: [], termsOfUse: [] };
        d.sessionControls = null;
        const num = nextFreeNumber(raw, (ctx && ctx.raws) || []);
        return {
          name: companionName(raw.displayName, num),
          draft: d,
          changes: [
            "Grant control: Require multifactor authentication, in place of the authentication strength — the control Microsoft names for email one-time passcode, SAML/WS-Fed, Google and Microsoft account externals",
            "Scope copied unchanged: the same users, external user types, resources and conditions as the original",
            "The original policy is NOT modified — nothing is excluded from it, because no condition can name these identities",
            num == null ? "No free number was found in the original's range, so the name says what it is instead" : `Numbered CA${String(num).padStart(3, "0")} — the next free number in the original's range, not a version bump: this policy lives beside the original rather than replacing it`,
          ],
        };
      },
    },
    {
      // Mihai, 25459, looking at a policy on the built-in Multifactor
      // authentication strength: "the strength is allowing more, so the
      // conclusion of the check is wrong". It was: the old check gave one
      // verdict for every strength, and told you to add a second policy even
      // where the strength asks no more than the grant control does. There the
      // answer is one swap, not two policies.
      id: "guest-auth-strength-swap-for-mfa",
      title: "This strength is Require MFA already, and it misses the non-Entra externals",
      appliesWhen: "Policy requires an authentication strength no stronger than Require multifactor authentication, with guests or external users in scope",
      requirement: "Microsoft's built-in strengths table describes the Multifactor authentication strength as the same set of combinations that satisfies the Require multifactor authentication setting, and the Limitations section says the two controls cannot be used in one policy because they are equivalent. A strength is not applied to externals who authenticate with an email one-time passcode, a SAML/WS-Fed provider, Google or a Microsoft account; the grant control is. So where the strength asks no more than the grant control, the grant control does the same job and reaches more identities.",
      severity: "low",
      docUrl: "https://learn.microsoft.com/entra/identity/authentication/concept-authentication-strengths#limitations",
      remediation: "Change the grant control on this policy from the authentication strength to Require multifactor authentication. Nothing changes for the users it already reaches — Microsoft documents the two as equivalent — and the four identities a strength is never applied to come into scope of the requirement. One policy, one control, nothing added.",
      remediationParts: [
        ["Exclude", "Nothing. This policy's scope is right; only its control is the wrong one of two equivalent ones."],
        ["Change", "On this policy, replace Require authentication strength with Require multifactor authentication. Keep everything else. It is the one case here where a second policy is not needed, because the strength is asking for nothing the grant control does not."],
        ["What it costs", "For every user this policy already reaches, nothing: the strength's allowed combinations are the set that satisfies Require multifactor authentication. What changes is that email one-time passcode, SAML/WS-Fed, Google and Microsoft account externals now face the requirement too, where the strength was silently not applied to them."],
      ],
      detect: (p, ctx) => {
        if (!isActive(p) || !G(p).authenticationStrength) return null;
        if (grants(p).includes("mfa")) return null;
        const asp = ctx && ctx.strengths && ctx.strengths.get(G(p).authenticationStrength.id);
        if (!asp) return null;                            // strengths not read — say nothing rather than guess
        if (!isMfaEquivalent(asp)) return null;           // a stricter strength is the other check's case
        const sc = extScope(p, CROSS_TENANT_TYPES);
        if (!sc) return null;
        return {
          detail: `Policy "${p.displayName}" requires the ${asp.displayName} authentication strength, whose allowed combinations are the same set that satisfies Require multifactor authentication — Microsoft documents the two as equivalent, which is why they cannot both be used in one policy. Its scope reaches ${sc.types.map(extLabel).join(", ")}. A strength is only applied to externals who authenticate with Microsoft Entra ID, so for an email one-time passcode, SAML/WS-Fed, Google or Microsoft account guest this policy asks nothing — while the equivalent grant control would ask them for MFA. Swapping the control on this policy closes that gap and takes nothing away from anyone.`,
          impactedResources: ["Email one-time passcode guests", "SAML / WS-Fed federated guests", "Google-federated guests", "Microsoft account (MSA) guests"],
        };
      },
      // An ordinary adjustment: one policy in, one policy out. The equivalence
      // is what makes it safe to do in place rather than beside.
      fix: (d) => {
        const g = d.grantControls; if (!g || !g.authenticationStrength) return null;
        const name = g.authenticationStrength.displayName || "the authentication strength";
        delete g.authenticationStrength;
        g.builtInControls = [...new Set([...(g.builtInControls || []), "mfa"])];
        if (!g.operator) g.operator = "OR";
        return [`Grant control: Require multifactor authentication in place of ${name} — the same combinations, and it also reaches email one-time passcode, SAML/WS-Fed, Google and Microsoft account externals, which a strength is never applied to`];
      },
    },
    {
      id: "guest-unsupported-grant",
      title: "Grant control guests cannot satisfy is in scope of external users",
      appliesWhen: "Policy requires an approved client app, an app protection policy or a password change, with guests or external users in scope",
      requirement: "Require approved client app, Require app protection policy and Require password change are documented as not supported for B2B collaboration and B2B direct connect users. The first two need the device registered in THIS tenant, and a device is managed only by its owner's home tenant; the third cannot complete because an external user has no password to change in your directory. The control cannot be met, so access is denied rather than challenged.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/external-id/authentication-conditional-access#conditional-access-for-external-users",
      remediation: "Exclude the guest and external user types from this policy and cover your own users with it. These controls are for identities managed in this tenant.",
      detect: (p) => {
        if (!isActive(p)) return null;
        const hit = grants(p).filter((g) => EXT_UNSUPPORTED_GRANT[g]);
        if (!hit.length) return null;
        if (G(p).operator === "OR" && grants(p).length > hit.length) return null;   // something else can satisfy it
        const sc = extScope(p, CROSS_TENANT_TYPES);
        if (!sc) return null;
        return {
          detail: `Policy "${p.displayName}" requires ${hit.map((g) => `"${EXT_UNSUPPORTED_GRANT[g]}"`).join(" and ")} and its scope reaches ${sc.types.map(extLabel).join(", ")} (via ${sc.via}). External identities cannot satisfy ${hit.length === 1 ? "that control" : "those controls"} at all.${partialNote(sc)}`,
          impactedResources: [...sc.types.map(extLabel), ...hit.map((g) => `Not supported for external users: ${EXT_UNSUPPORTED_GRANT[g]}`)],
        };
      },
    },
    {
      id: "guest-device-grant-needs-trust",
      title: "Device control in scope of guests without inbound device trust",
      appliesWhen: "Policy requires a compliant or Microsoft Entra hybrid joined device and its scope reaches guests or external users, with no alternative control",
      requirement: "A device can only be managed by its owner's home tenant, so an external user cannot register one with your organization. The control works for them only when your cross-tenant access settings trust device claims from their tenant. Microsoft: unless you are willing to trust claims about device compliance or hybrid joined status from an external user's home tenant, applying policies that require external users to use managed devices is not recommended.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/external-id/authentication-conditional-access#device-compliance-and-microsoft-entra-hybrid-joined-device-policies",
      remediation: "Either trust compliant-device and hybrid-join claims from the partner tenants in cross-tenant access settings, or exclude the guest and external user types, or add an alternative control with the OR operator so MFA satisfies the policy instead.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        const wantsCompliant = hasCompliance(p), wantsHybrid = grants(p).includes("domainJoinedDevice");
        if (!wantsCompliant && !wantsHybrid) return null;
        if (G(p).operator === "OR" && grants(p).length > (wantsCompliant && wantsHybrid ? 2 : 1)) return null;
        const sc = extScope(p, CROSS_TENANT_TYPES);
        if (!sc) return null;
        const tc = wantsCompliant ? guestTrust(ctx, "isCompliantDeviceAccepted") : { ok: true, text: "" };
        const th = wantsHybrid ? guestTrust(ctx, "isHybridAzureADJoinedDeviceAccepted") : { ok: true, text: "" };
        // With either claim on, OR'd device controls are met by it.
        if (wantsCompliant && wantsHybrid && G(p).operator === "OR" ? (tc.ok === true || th.ok === true) : (tc.ok === true && th.ok === true)) return null;
        const trustText = [tc, th].filter((x) => x.ok !== true && x.text).map((x) => x.text).join(" ");
        const control = wantsCompliant && wantsHybrid ? "a compliant or Microsoft Entra hybrid joined device"
          : wantsCompliant ? "a compliant device" : "a Microsoft Entra hybrid joined device";
        return {
          detail: `Policy "${p.displayName}" requires ${control} and its scope reaches ${sc.types.map(extLabel).join(", ")} (via ${sc.via}). Their devices are managed in their own tenant, so the requirement can only be met if this tenant trusts device claims from theirs. ${trustText}`
            + partialNote(sc),
          impactedResources: [...sc.types.map(extLabel), "AADSTS530004 — AcceptCompliantDevice not configured"],
        };
      },
    },
    {
      id: "guest-user-risk-blocked",
      title: "User-risk policy blocks guests it can never remediate",
      appliesWhen: "User-risk policy whose grant a guest cannot meet (password change, risk remediation or block), with guests or external users in scope",
      requirement: "An external user's user risk is evaluated in their HOME directory, and nobody here can clear it. Require password change blocks them outright — they cannot reset a password in your directory — and Require risk remediation is documented as not supported for external and guest users. A Block on user risk shuts them out until their own organisation remediates. (A user-risk policy that only asks for MFA is not a lockout — they meet it — and is not reported here.) Microsoft's guidance is to exclude external users from risk-based policies and require MFA of them always instead.",
      severity: "high",
      docUrl: "https://learn.microsoft.com/entra/id-protection/concept-identity-protection-b2b",
      remediation: "Exclude the guest and external user types from this policy, and make sure an always-on MFA policy reaches them instead of a risk-based one.",
      remediationParts: [
        ["Exclude", "The guest and external user types (all six, all tenants) from this policy. Nothing else changes for your own users."],
        ["Make sure", "An MFA policy that is always on reaches those types — for example the guest MFA policy — so they are not left with no requirement at all."],
        ["Why", "Their risk lives in their home directory. Here nobody can dismiss it, they cannot change a password in your directory, and risk remediation is not supported for guests — so this policy can only ever block them."],
      ],
      detect: (p) => {
        if (!isActive(p)) return null;
        const risky = (p.conditions?.userRiskLevels || []).length > 0;
        if (!risky) return null;
        const g = grants(p);
        const lockout = g.includes("passwordChange") || g.includes("riskRemediation") || g.includes("block");
        if (!lockout) return null;   // MFA on user risk: a guest meets it
        const sc = extScope(p, CROSS_TENANT_TYPES);
        if (!sc) return null;
        const forcesPassword = grants(p).includes("passwordChange");
        return {
          detail: `Policy "${p.displayName}" acts on user risk and its scope reaches ${sc.types.map(extLabel).join(", ")} (via ${sc.via}). `
            + (forcesPassword
              ? "It requires a password change, which an external user cannot perform in this directory — they are blocked, with no way out that your administrators can open."
              : g.includes("riskRemediation")
                ? "It requires risk remediation, which Microsoft documents as not supported for external and guest users — they are blocked while the risk stands."
                : "It blocks on user risk, and that risk is evaluated in their home directory where your administrators cannot dismiss it — they stay blocked until their own organisation clears it.")
            + partialNote(sc),
          impactedResources: [...sc.types.map(extLabel), "Risky users report does not cover external identities", ...(forcesPassword ? ["Password reset is impossible in the resource directory"] : [])],
        };
      },
    },
    {
      id: "dc-unsupported-control",
      title: "Control unsupported for B2B direct connect is in their scope",
      appliesWhen: "Policy uses terms of use, sign-in frequency, persistent browser, app enforced restrictions or Conditional Access App Control, with B2B direct connect users in scope",
      requirement: "Terms of use, sign-in frequency, persistent browser session, app enforced restrictions and Conditional Access App Control are all documented as supported for B2B collaboration users and NOT supported for B2B direct connect users — the Teams shared-channel identities that hold no account in your directory. A policy relying on one of them does not do for those users what it does for everyone else.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/external-id/authentication-conditional-access#conditional-access-for-external-users",
      remediation: "Decide deliberately: exclude B2B direct connect users from this policy if the control is the point of it, or accept that they are covered by whatever else the policy requires. Either way it should not be an accident.",
      detect: (p) => {
        if (!isActive(p)) return null;
        const sess = S(p), g = G(p);
        const used = [];
        if ((g.termsOfUse || []).length) used.push("termsOfUse");
        if (sess.signInFrequency?.isEnabled) used.push("signInFrequency");
        if (sess.persistentBrowser?.isEnabled) used.push("persistentBrowser");
        if (sess.applicationEnforcedRestrictions?.isEnabled) used.push("applicationEnforcedRestrictions");
        if (sess.cloudAppSecurity?.isEnabled) used.push("cloudAppSecurity");
        if (!used.length) return null;
        const sc = extScope(p, [DIRECT_CONNECT]);
        if (!sc) return null;
        return {
          detail: `Policy "${p.displayName}" relies on ${used.map((k) => `"${DC_UNSUPPORTED[k]}"`).join(", ")} and its scope reaches B2B direct connect users (via ${sc.via}). Those controls are not supported for direct connect identities, so for them the policy behaves differently from the way it reads.${partialNote(sc)}`,
          impactedResources: ["B2B direct connect users", "Teams Connect shared channels", ...used.map((k) => `Not supported for direct connect: ${DC_UNSUPPORTED[k]}`)],
        };
      },
    },

    // ── Service providers (CSP / GDAP partner admins) ─────────────────
    // A partner reaching this tenant through delegated admin privileges is
    // matched by the "Service provider users" external user type and by
    // nothing else: they hold no account and no device here, so excluding a
    // group or naming a break-glass account does not reach them. Every check
    // below is about that one lever.
    {
      id: "sp-exclusion-incomplete",
      title: "External-user exclusion leaves service provider admins in scope",
      appliesWhen: "Policy carves guests and external users out of scope, but the carve-out does not list Service provider users",
      requirement: "When guests and external users are excluded from a policy, Microsoft's guidance is to select every external user type — B2B collaboration guest and member, B2B direct connect, local guest, service provider and other external users. Leaving Service provider users out of an otherwise complete exclusion keeps your CSP partner's delegated admins in scope of a policy the rest of your external identities were deliberately taken out of.",
      severity: "high",
      needsServiceProvider: true,
      docUrl: "https://learn.microsoft.com/security/zero-trust/zero-trust-identity-device-access-policies-guest-access",
      remediation: "Add Service provider users to the Guest or external users exclusion. Choose all tenants unless you deliberately want the carve-out limited to named partner tenants.",
      fix: (d) => {
        const sel = d.conditions?.users?.excludeGuestsOrExternalUsers;
        if (!sel) return null;
        if (!addSpType(sel)) return [];
        const enumerated = (sel.externalTenants?.membershipKind || "all") === "enumerated";
        return [`Added "Service provider users" to the guest/external exclusion`
          + (enumerated ? " — the exclusion names specific tenants, so it still only reaches partners in those tenants" : "")];
      },
      detect: (p, ctx) => {
        if (!isActive(p) || !enforces(p)) return null;
        const exc = excExt(p);
        if (!exc || !exc.types.length || exc.types.includes(SP)) return null;
        const sc = spScope(p);
        if (!sc) return null;
        const names = spNames(ctx);
        return {
          detail: `Policy "${p.displayName}" excludes ${exc.types.length} external user type${exc.types.length === 1 ? "" : "s"} (${exc.types.map(extLabel).join(", ")}) but not Service provider users, while its scope is ${sc.via}. Delegated admins from your CSP partner are still evaluated by this policy — the one category of external identity that cannot fix the problem from their side.`,
          impactedResources: [
            "CSP / partner delegated admins (GDAP)",
            ...(names.length ? names.map((n) => `Service provider tenant: ${n}`) : []),
            "Admin-on-behalf-of support sessions",
          ],
        };
      },
    },
    {
      id: "sp-blocked",
      title: "Access blocked for service provider (CSP / GDAP) admins",
      appliesWhen: "Policy grants Block and its user scope reaches Service provider users",
      requirement: "A Block policy whose scope covers external users also blocks a Cloud Solution Provider's delegated admins, which is the documented cause of partners losing admin-on-behalf-of access to a customer tenant. Microsoft's remedy is to exclude the CSP using the Service provider user external user type.",
      severity: "high",
      needsServiceProvider: true,
      docUrl: "https://learn.microsoft.com/partner-center/customers/gdap-faq",
      remediation: "If you use a CSP or delegated-administration partner, exclude Service provider users — for all tenants, or for your partner's tenant ID specifically. If you have no partner and want them blocked, this is working as intended.",
      detect: (p, ctx) => {
        if (!isActive(p) || !hasBlock(p)) return null;
        const sc = spScope(p);
        if (!sc) return null;
        const names = spNames(ctx);
        const partial = sc.partial
          ? ` The policy does exclude Service provider users, but only for ${sc.partial.tenants.length} named tenant${sc.partial.tenants.length === 1 ? "" : "s"} — partners in any other tenant are still blocked.`
          : "";
        return {
          detail: `Policy "${p.displayName}" blocks access and its scope is ${sc.via}, so a partner signing in through delegated admin privileges is denied.${partial}`
            + (names.length ? ` This tenant has ${names.length} service provider partner${names.length === 1 ? "" : "s"} configured (${names.join(", ")}).` : ""),
          impactedResources: [
            "CSP / partner delegated admins (GDAP)",
            ...(names.length ? names.map((n) => `Service provider tenant: ${n}`) : []),
            "Admin-on-behalf-of support sessions",
          ],
        };
      },
    },
    {
      id: "sp-device-grant-needs-trust",
      title: "Device control in scope of service providers without inbound device trust",
      appliesWhen: "Policy requires a compliant or Microsoft Entra hybrid joined device and its scope reaches Service provider users, with no alternative control",
      requirement: "A device can only be managed by its owner's home tenant, so an external user cannot register a device with your organization. Requiring a compliant or hybrid joined device works for them only when your cross-tenant access settings trust device claims from their tenant — without that, sign-in fails with AADSTS530004. Microsoft does not recommend requiring managed devices of external users unless you are willing to trust those claims.",
      severity: "high",
      needsServiceProvider: true,
      docUrl: "https://learn.microsoft.com/entra/external-id/authentication-conditional-access#device-compliance-and-microsoft-entra-hybrid-joined-device-policies",
      remediation: "Either trust compliant-device and hybrid-join claims from the partner tenant in cross-tenant access settings, or exclude Service provider users from this policy, or add an alternative control with the OR operator so MFA satisfies it instead.",
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        const wantsCompliant = hasCompliance(p), wantsHybrid = grants(p).includes("domainJoinedDevice");
        if (!wantsCompliant && !wantsHybrid) return null;
        // "compliant device OR MFA" is satisfiable without a device — not a lockout
        if (G(p).operator === "OR" && (hasMfa(p) || grants(p).length > (wantsCompliant && wantsHybrid ? 2 : 1))) return null;
        const sc = spScope(p);
        if (!sc) return null;
        // If every service provider partner already has the matching inbound
        // trust configured, the control IS satisfiable and there is nothing to
        // report. Only claim that when the partner list was actually read.
        const noCompliantTrust = wantsCompliant ? spWithoutTrust(ctx, "isCompliantDeviceAccepted") : [];
        const noHybridTrust = wantsHybrid ? spWithoutTrust(ctx, "isHybridAzureADJoinedDeviceAccepted") : [];
        if (noCompliantTrust !== null && noHybridTrust !== null
            && !noCompliantTrust.length && !noHybridTrust.length) return null;
        const untrusted = [...new Set([...(noCompliantTrust || []), ...(noHybridTrust || [])].map((x) => x.name || x.tenantId))];
        const control = wantsCompliant && wantsHybrid ? "a compliant or Microsoft Entra hybrid joined device"
          : wantsCompliant ? "a compliant device" : "a Microsoft Entra hybrid joined device";
        return {
          detail: `Policy "${p.displayName}" requires ${control} and its scope is ${sc.via}. A partner's device is managed in their own tenant, so the requirement can only be met if this tenant trusts device claims from theirs.`
            + (untrusted.length ? ` Inbound device trust is not configured for: ${untrusted.join(", ")}.`
              : " Cross-tenant access settings could not be read, so the trust configuration was not verified."),
          impactedResources: [
            "CSP / partner delegated admins (GDAP)",
            ...untrusted.map((n) => `No device trust from: ${n}`),
            "AADSTS530004 — AcceptCompliantDevice not configured",
          ],
        };
      },
    },
    {
      id: "sp-unsupported-grant",
      title: "Grant control external users cannot satisfy is in scope of service providers",
      appliesWhen: "Policy requires an approved client app, an app protection policy or a password change, with Service provider users in scope",
      requirement: "Require approved client app, Require app protection policy and Require password change are documented as not supported for B2B collaboration and B2B direct connect users. They depend on an app registration or a credential in this tenant, which a service provider's admins reaching it through delegated privileges do not have — the control cannot be satisfied, so access is denied.",
      severity: "high",
      needsServiceProvider: true,
      docUrl: "https://learn.microsoft.com/entra/external-id/authentication-conditional-access#conditional-access-for-external-users",
      remediation: "Exclude Service provider users (and the other external user types) from this policy and cover internal users with it instead. These controls are for identities managed in this tenant.",
      detect: (p) => {
        if (!isActive(p)) return null;
        const UNSUPPORTED = { approvedApplication: "Require approved client app", compliantApplication: "Require app protection policy", passwordChange: "Require password change" };
        const hit = grants(p).filter((g) => UNSUPPORTED[g]);
        if (!hit.length) return null;
        if (G(p).operator === "OR" && grants(p).length > hit.length) return null;   // another control can satisfy it
        const sc = spScope(p);
        if (!sc) return null;
        return {
          detail: `Policy "${p.displayName}" requires ${hit.map((g) => `"${UNSUPPORTED[g]}"`).join(" and ")} and its scope is ${sc.via}. External identities cannot satisfy ${hit.length === 1 ? "that control" : "those controls"}, so a partner's delegated admins are denied rather than challenged.`,
          impactedResources: ["CSP / partner delegated admins (GDAP)", "B2B collaboration users", "B2B direct connect users"],
        };
      },
    },
    {
      id: "sp-not-in-external-mfa",
      title: "MFA policy for external users skips service provider admins",
      appliesWhen: "Policy requires MFA for selected guest or external user types, and Service provider users is not one of them",
      requirement: "Microsoft's starting-point guidance for guest and external access is to require MFA for all six external user types, Service provider users included. Partner admins reaching this tenant through delegated privileges hold administrative roles here — leaving them out of the MFA policy protecting every other external identity inverts the risk.",
      severity: "medium",
      needsServiceProvider: true,
      docUrl: "https://learn.microsoft.com/security/zero-trust/zero-trust-identity-device-access-policies-guest-access",
      remediation: "Add Service provider users to the Guest or external users selection, so partner delegated admins face the same authentication requirement as your other external identities.",
      fix: (d) => {
        const sel = d.conditions?.users?.includeGuestsOrExternalUsers;
        if (!sel) return null;
        if (!addSpType(sel)) return [];
        return [`Added "Service provider users" to the guest/external user types this policy applies to`];
      },
      detect: (p, ctx) => {
        if (!isActive(p) || !hasMfa(p) || hasBlock(p)) return null;
        if (allUsers(p) || legacyIncExt(p)) return null;
        const inc = incExt(p);
        if (!inc || !inc.types.length || inc.types.includes(SP)) return null;
        const names = spNames(ctx);
        return {
          detail: `Policy "${p.displayName}" requires multifactor authentication for ${inc.types.map(extLabel).join(", ")} but not for Service provider users. Delegated admins from a partner tenant sign in without the requirement this policy exists to impose — while holding more privilege here than the guests it does cover.`,
          impactedResources: [
            "CSP / partner delegated admins (GDAP)",
            ...(names.length ? names.map((n) => `Service provider tenant: ${n}`) : []),
          ],
        };
      },
    },

    // ── Every "blocked" / "trust" matrix cell has a finding (25489) ────
    // Mihai, on the shared-device matrix: "shouldn't those blocked ones be
    // mentioned below, with a why and how to fix — also for guests?" For
    // guests every cell already had one except MFA for B2B direct connect;
    // for shared devices only MFA, sign-in frequency, the device-code block
    // and Surface Hub's grants did, and only on All-users-All-resources
    // policies. These two close the gap, in the same words as the matrix.
    {
      id: "dc-mfa-needs-trust",
      title: "MFA for B2B direct connect users without inbound MFA trust",
      appliesWhen: "Policy requires MFA or an authentication strength, reaches B2B direct connect users, and inbound MFA trust is not on for every tenant",
      requirement: "A B2B direct connect user has no account in your directory, so they cannot register MFA here — they can only meet an MFA requirement with the claim their HOME tenant issued, and that claim is accepted only when inbound MFA trust is on. Without it, Microsoft documents that direct connect users are blocked from the resource (Teams shared channels).",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/entra/external-id/authentication-conditional-access",
      remediation: "Either turn on inbound MFA trust for the organisations you share Teams channels with (Cross-tenant access settings → the organisation → Inbound → Trust settings), or, if they should not require MFA from this policy, exclude B2B direct connect users here. If you do not use shared channels at all, keep B2B direct connect blocked inbound and this does not arise.",
      remediationParts: [
        ["Fix, usually", "Cross-tenant access settings → Organizational settings → the partner → Inbound access → Trust settings → Trust multifactor authentication from Microsoft Entra tenants. Their users' MFA at home then satisfies this policy."],
        ["Or exclude", "B2B direct connect users on this policy (Users → Exclude → Guest or external users) — they then face no MFA from it."],
        ["Why", "A direct connect user is not in your directory; there is nowhere here for them to register MFA."],
      ],
      detect: (p, ctx) => {
        if (!isActive(p) || !hasMfa(p) || grants(p).includes("block")) return null;
        if (dcInboundOpen(ctx) === false) return null;
        const sc = extScope(p, [DIRECT_CONNECT]);
        if (!sc) return null;
        const gt = guestTrust(ctx, "isMfaAccepted");
        if (gt.ok === true) return null;
        return {
          detail: `Policy "${p.displayName}" requires ${grants(p).includes("mfa") ? "MFA" : "an authentication strength"} and reaches B2B direct connect users (via ${sc.via}). ${gt.text} Direct connect users from those organisations cannot meet it and are blocked from what this policy covers.`,
          impactedResources: ["B2B direct connect users", "Teams shared channels"],
        };
      },
    },
    {
      id: "shared-device-unsupported",
      title: "Shared devices: controls their resource accounts cannot meet",
      appliesWhen: "Policy reaches the resource accounts of Teams Rooms, Teams phones / panels or Surface Hub and demands a control Microsoft documents as not supported there",
      requirement: "Teams Rooms, Teams phones and panels and Surface Hub sign in with a resource account and nobody sits at the device to answer a prompt. Microsoft's support tables list, per device, the grant and session controls those accounts cannot meet — terms of use, persistent browser, app enforced restrictions, Conditional Access App Control, token protection, customised continuous access evaluation, risk remediation, app protection, password change, hybrid join, insider risk, and more. A policy that demands one of them makes the device fail to sign in or sign out on its own. Microsoft's pattern: exclude the resource accounts from every other policy and give them one policy of their own — compliant device plus a known location.",
      severity: "medium",
      docUrl: "https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies",
      remediation: "When the policy reaches the devices through All users: exclude the shared-device group. When it is the devices' own policy (it includes that group): take the unsupported control out of it.",
      remediationParts: [
        ["Exclude", "The shared-device group (CAB-SEC-U-TeamsSharedDevices or your equivalent) from this policy — when it reaches the devices only because it targets All users. The Fix button adds that exclusion."],
        ["Or remove", "The listed controls from this policy — when it is the policy you made FOR the devices (it includes the shared-device group). Excluding them from their own policy would leave them with none. The Fix removes them when that group is the policy's ONLY include; with other people in it too, removing a control weakens it for them, so that stays your decision."],
        ["What they can have", "Require device to be marked as compliant, a known named location, and block for everything else. No sign-in frequency, no authentication strength, and do not block device code flow for Android devices."],
      ],
      needsGroup: "sharedDevices",
      fix: (d, ctx, res) => (res && res.viaGroup ? ownDeviceFix(d, ctx, res) : excludeGroupFix("sharedDevices", "shared-device / resource account")(d, ctx)),
      detect: (p, ctx) => {
        if (!isActive(p) || !reachesDevices(p, ctx)) return null;
        const g = ctx && ctx.sharedDevices && ctx.sharedDevices.id;
        const viaGroup = !!(g && (U(p).includeGroups || []).includes(g));
        // what the older, narrower checks already say about this policy
        const broad = allUsers(p) && allApps(p);
        const covered = new Set(broad ? ["mfa", "strength", "signInFrequency"] : []);
        covered.add("deviceCodeBlock");
        const demands = deviceDemands(p).filter((c) => !covered.has(c));
        const lines = [], blockedControls = new Set();
        for (const row of DEVICE_ROWS) {
          if (!reachesPlatform(p, row.platform)) continue;
          if (row.key === "surfaceHub" && broad) continue;   // surface-hub-mfa owns these
          const bad = demands.filter((c) => (DEVICE_SUPPORT[row.key] || {})[c] === "blocked");
          bad.forEach((c) => blockedControls.add(c));
          if (bad.length) lines.push(`${row.label}: ${bad.map((c) => (DEVICE_CONTROLS.find((x) => x.key === c) || {}).label || c).join(", ")}`);
        }
        if (!lines.length) return null;
        return {
          detail: `Policy "${p.displayName}" reaches the shared-device resource accounts ${viaGroup ? "because it INCLUDES the shared-device group — it is their own policy, so take these controls out of it rather than excluding them" : "through All users"} and demands what they cannot meet — ${lines.join("; ")}. Those devices fail to sign in, or sign themselves out, while it applies.`,
          impactedResources: lines.map((l) => l.split(":")[0]),
          viaGroup, blockedControls: [...blockedControls],
        };
      },
    },

    // ── External types no MFA policy reaches (25469) ───────────────────
    // What the catalog revision of 25468 exposed and no check could see: an
    // All-users MFA policy that excludes every external type, a guest MFA
    // policy that names only some of them, and the rest falling between the
    // two with no MFA requirement anywhere. Every other check looks at ONE
    // policy; this one asks the tenant-wide question for each type, and
    // anchors the finding on the policy where the fix belongs.
    {
      id: "ext-type-no-mfa",
      title: "External user types that no MFA policy reaches",
      appliesWhen: "A guest MFA policy names some external user types, and the types it leaves out are reached by no other MFA policy on All resources",
      requirement: "Microsoft's starting point for guest and external access is to require MFA of guests and external users always. A type left out of the guest MFA policy, and excluded from the All-users MFA policy as well, signs in with whatever its home organisation did and nothing more — no policy here asks it for MFA. B2B direct connect is a special case: it can only satisfy MFA through inbound MFA trust, so requiring MFA of it without that trust BLOCKS it, and it only arrives at all when B2B direct connect is enabled inbound (it is blocked by default).",
      severity: "high",
      docUrl: "https://learn.microsoft.com/security/zero-trust/zero-trust-identity-device-access-policies-guest-access",
      remediation: "Add the missing types to this policy's guest and external user selection. For B2B direct connect, first decide whether you want those users at all: if yes, turn on inbound MFA trust for the organisations you share channels with, then add the type; if no, keep B2B direct connect blocked inbound in cross-tenant access settings, and this finding goes away.",
      remediationParts: [
        ["Change", "On this policy, add the types listed in the assessment to Users → Include → Guest or external users. The Fix button builds that version (state Off, version bumped)."],
        ["Exclude", "Nothing. These types are not blocked by anything here; they are simply never asked for MFA."],
        ["B2B direct connect", "Only if it is listed. Direct connect users can meet MFA ONLY through inbound MFA trust — without it, adding them here blocks them from Teams shared channels. Turn on inbound MFA trust for the partners you share channels with first, or keep direct connect blocked inbound (the default) and leave them out."],
        ["Why here", "This is the policy that already requires MFA of your guests, so it is the one place where adding a type changes nothing else."],
      ],
      // the finding carries the types to add: the gap is a tenant-wide
      // question, and the fix only sees one draft
      fix: (d, ctx, res) => {
        const sel = d.conditions?.users?.includeGuestsOrExternalUsers;
        if (!sel) return null;
        const add = (res && res.addTypes) || [];
        if (!add.length) return [];
        const types = String(sel.guestOrExternalUserTypes || "").split(",").map((x) => x.trim()).filter(Boolean);
        for (const t of add) if (!types.includes(t)) types.push(t);
        sel.guestOrExternalUserTypes = types.join(",");
        return [`Added ${add.map(extLabel).join(", ")} to the guest and external user types this policy requires MFA of`];
      },
      detect: (p, ctx) => {
        if (!isActive(p)) return null;
        const g = extMfaGap(p, ctx);
        if (!g.types.length) return null;
        return {
          detail: `Policy "${p.displayName}" requires MFA of ${incExt(p).types.map(extLabel).join(", ")}, but not of ${g.types.map(extLabel).join(", ")} — and no other enabled or report-only policy requires MFA of ${g.types.length === 1 ? "that type" : "those types"} on All resources${g.allUsersExcl.length ? ` (${g.allUsersExcl.map((q) => `"${q}"`).join(", ")} require${g.allUsersExcl.length === 1 ? "s" : ""} MFA of All users but exclude${g.allUsersExcl.length === 1 ? "s" : ""} them)` : ""}. They reach your resources asking nothing of them here.`
            + (g.types.includes(DIRECT_CONNECT) ? ` B2B direct connect is enabled inbound in this tenant, so direct connect users do arrive — and they can only meet MFA through inbound MFA trust.` : "")
            + (g.dcSkipped ? " B2B direct connect is left out of this finding: it is blocked inbound in cross-tenant access settings, so no direct connect user can arrive today." : "")
            + (g.blocked.length ? ` Left out as well, because an unconditional block stops them signing in at all: ${g.blocked.map((x) => `${extLabel(x.type)} ("${x.by}")`).join(", ")}.` : "")
            + " Guests who are ALSO members of a group an MFA policy includes are covered by that policy; the rest are not.",
          impactedResources: g.types.map(extLabel),
          addTypes: g.types.slice(),
        };
      },
    },
  ];

  // ---- run every check against every policy ----
  // rawPolicies: raw Graph policy objects; strengths: Map<id, authStrengthPolicy>
  // opts.includeDisabled: also evaluate policies in the Off (disabled) state.
  // opts.groups: the convention groups already resolved in the tenant
  // ({ breakGlass, sharedDevices }). Without them every needsGroup check fires
  // even on policies that already carry the exclusion it would add.
  // opts.partners: { ok, list } from cross-tenant access settings. When the
  // read succeeded and the tenant has no service provider partner at all, the
  // CSP checks are skipped rather than answered — there is no partner to lock
  // out, and a page of findings about one is how a tool loses its reader.
  const SP_CHECKS = CHECKS.filter((c) => c.needsServiceProvider).length;
  let LAST_SUPPRESSED = 0, LAST_NO_SP = 0;
  function run(rawPolicies, strengths, opts = {}) {
    INCLUDE_DISABLED = !!opts.includeDisabled;
    GUEST_GROUPS = opts.guestGroups || null;
    const findings = [];
    const ctx = { strengths: strengths || new Map(), partners: opts.partners || null, crossTenant: opts.crossTenant || null, raws: rawPolicies, ...(opts.groups || {}) };
    const spl = spPartners(ctx);
    const noServiceProvider = !!(spl && !spl.length);
    let suppressed = 0, skippedSp = 0;
    for (const p of rawPolicies) {
      for (const chk of CHECKS) {
        if (chk.needsServiceProvider && noServiceProvider) { skippedSp++; continue; }
        let res = null;
        try { res = chk.detect(p, ctx); } catch (e) { console.warn(`MS Learn check ${chk.id} failed on ${p.displayName}:`, e); }
        if (!res) continue;
        if (chk.needsGroup && alreadyExcluded(p, chk.needsGroup, ctx)) { suppressed++; continue; }
        findings.push({ check: chk, result: res, policyId: p.id, policyName: p.displayName || "(unnamed policy)", policyState: p.state });
      }
    }
    LAST_SUPPRESSED = suppressed;
    LAST_NO_SP = noServiceProvider ? SP_CHECKS : 0;
    return findings;
  }
  const suppressedCount = () => LAST_SUPPRESSED;

  // ---- the guest reality matrix (25433) --------------------------------
  // The six external user types against the controls THIS tenant's policies
  // actually demand. Derived from the policies already loaded plus the
  // cross-tenant access settings the service-provider checks already read —
  // no extra tenant read, no extra permission.
  //
  // A cell is a summary of several policies, so it must never claim more than
  // it knows. Four verdicts and nothing in between:
  //   ok      — satisfiable as configured
  //   trust   — satisfiable ONLY with inbound cross-tenant trust, which is
  //             not configured (or could not be read, and then it says so)
  //   blocked — documented as not supported for this type: an exclusion is
  //             the only remedy
  //   na      — the control does not reach this type at all
  // A control no policy demands of a type gets no verdict: an empty cell is
  // "nothing asks this of them", which is not the same as "fine".
  const MATRIX_CONTROLS = [
    { key: "mfa", label: "MFA" },
    { key: "strength", label: "Auth strength" },
    { key: "compliantDevice", label: "Compliant device" },
    { key: "domainJoinedDevice", label: "Hybrid joined" },
    { key: "appProtection", label: "App protection / approved app" },
    { key: "passwordChange", label: "Password change" },
    { key: "termsOfUse", label: "Terms of use" },
    { key: "signInFrequency", label: "Sign-in frequency" },
    { key: "persistentBrowser", label: "Persistent browser" },
    { key: "appEnforced", label: "App enforced restrictions" },
    { key: "cloudAppSecurity", label: "CA App Control" },
  ];
  const RANK = { blocked: 3, trust: 2, na: 1, ok: 0 };

  // What a policy demands, as matrix control keys.
  function demandsOf(p) {
    const g = G(p), sess = S(p), b = grants(p), out = [];
    if (b.includes("mfa")) out.push("mfa");
    if (g.authenticationStrength) out.push("strength");
    if (b.includes("compliantDevice")) out.push("compliantDevice");
    if (b.includes("domainJoinedDevice")) out.push("domainJoinedDevice");
    if (b.includes("approvedApplication") || b.includes("compliantApplication")) out.push("appProtection");
    if (b.includes("passwordChange")) out.push("passwordChange");
    if ((g.termsOfUse || []).length) out.push("termsOfUse");
    if (sess.signInFrequency?.isEnabled) out.push("signInFrequency");
    if (sess.persistentBrowser?.isEnabled) out.push("persistentBrowser");
    if (sess.applicationEnforcedRestrictions?.isEnabled) out.push("appEnforced");
    if (sess.cloudAppSecurity?.isEnabled) out.push("cloudAppSecurity");
    return out;
  }

  // The verdict for one type × one control on one policy.
  function verdict(type, control, p, ctx) {
    // A local guest holds this tenant's own credentials and can be managed
    // here — none of the cross-tenant limits apply.
    if (type === LOCAL_GUEST) return { v: "ok" };
    const dc = type === DIRECT_CONNECT;
    switch (control) {
      case "mfa":
        return dc && guestTrust(ctx, "isMfaAccepted").ok !== true
          ? { v: "trust", why: "B2B direct connect needs inbound MFA trust" } : { v: "ok" };
      case "strength": {
        // Not an Entra identity, no authentication strength.
        if (type === "otherExternalUser") return { v: "na", why: "authentication strength applies only to Entra-authenticated externals" };
        const ref = G(p).authenticationStrength;
        const asp = ref?.id && ctx?.strengths ? ctx.strengths.get(ref.id) : null;
        if (!asp) return { v: "ok" };
        const combos = asp.allowedCombinations || [];
        if (!combos.length || combos.some(comboUsableHere)) return { v: "ok" };
        if (!combos.some(comboUsableAtHome)) return { v: "blocked", why: `"${asp.displayName || ref.id}" has no combination a guest can complete, here or at home` };
        const t = guestTrust(ctx, "isMfaAccepted").ok;
        return t === true
          ? { v: "trust", why: `"${asp.displayName || ref.id}" is home-tenant methods only; MFA trust is on, so it depends on the home tenant deploying them` }
          : { v: "blocked", why: `"${asp.displayName || ref.id}" allows only home-tenant methods and inbound MFA trust is ${t === null ? "unverified" : "not configured"}` };
      }
      case "compliantDevice":
        return guestTrust(ctx, "isCompliantDeviceAccepted").ok === true
          ? { v: "ok" } : { v: "trust", why: "a device is managed only by its home tenant" };
      case "domainJoinedDevice":
        return guestTrust(ctx, "isHybridAzureADJoinedDeviceAccepted").ok === true
          ? { v: "ok" } : { v: "trust", why: "a device is managed only by its home tenant" };
      case "appProtection": case "passwordChange":
        return { v: "blocked", why: "documented as not supported for external users" };
      case "termsOfUse": case "signInFrequency": case "persistentBrowser":
      case "appEnforced": case "cloudAppSecurity":
        return dc ? { v: "blocked", why: "not supported for B2B direct connect" } : { v: "ok" };
      default: return { v: "ok" };
    }
  }
  // rawPolicies + the same ctx run() takes. opts.includeDisabled as there.
  function guestMatrix(rawPolicies, strengths, opts = {}) {
    INCLUDE_DISABLED = !!opts.includeDisabled;
    GUEST_GROUPS = opts.guestGroups || null;
    const ctx = { strengths: strengths || new Map(), partners: opts.partners || null, crossTenant: opts.crossTenant || null, ...(opts.groups || {}) };
    const cells = new Map();          // `${type}|${control}` -> { v, why, policies:[] }
    const controlsSeen = new Set();
    for (const p of rawPolicies) {
      if (!isActive(p)) continue;
      const demands = demandsOf(p);
      if (!demands.length) continue;
      const sc = extScope(p, null);
      if (!sc) continue;
      for (const type of sc.types) {
        for (const control of demands) {
          controlsSeen.add(control);
          const r = verdict(type, control, p, ctx);
          const k = `${type}|${control}`;
          let cell = cells.get(k);
          if (!cell) { cell = { v: r.v, why: r.why || "", policies: [] }; cells.set(k, cell); }
          if (RANK[r.v] > RANK[cell.v]) { cell.v = r.v; cell.why = r.why || ""; }
          cell.policies.push({ id: p.id, name: p.displayName || "(unnamed policy)", state: p.state });
        }
      }
    }
    const controls = MATRIX_CONTROLS.filter((c) => controlsSeen.has(c.key));
    const types = EXT_TYPES.filter((t) => controls.some((c) => cells.has(`${t}|${c.key}`)));
    const v = ctView(ctx);
    const trustRead = v.defaultOk && v.partnersOk;
    return { types, controls, cells, trustRead, partners: v.partners };
  }

  const V_LABEL = { ok: "ok", trust: "trust", blocked: "blocked", na: "n/a" };
  function renderGuestMatrix(m) {
    if (!m || !m.types.length || !m.controls.length) return "";
    const counts = { blocked: 0, trust: 0 };
    for (const c of m.cells.values()) if (counts[c.v] != null) counts[c.v]++;
    const head = m.controls.map((c) => `<th class="gm-c">${esc(c.label)}</th>`).join("");
    const rows = m.types.map((t) => {
      const tds = m.controls.map((c) => {
        const cell = m.cells.get(`${t}|${c.key}`);
        if (!cell) return `<td class="gm-cell gm-none" title="No policy in scope of this type asks for it">·</td>`;
        const n = cell.policies.length;
        return `<td class="gm-cell gm-${cell.v}"><button type="button" data-gmcell="${esc(t)}|${esc(c.key)}" title="${esc(cell.why || "")} — ${n} polic${n === 1 ? "y" : "ies"}">${V_LABEL[cell.v]}</button></td>`;
      }).join("");
      return `<tr><th class="gm-t" scope="row">${esc(extLabel(t))}</th>${tds}</tr>`;
    }).join("");
    return `<div class="list-card gm-card"><div class="fx-body">
      <div class="gm-head">
        <h5>Guests against the controls this tenant demands</h5>
        <span class="mini muted">from the loaded policies — no extra read${m.trustRead ? "" : " · cross-tenant access settings were not read, so every trust answer here is unverified"}</span>
      </div>
      <div class="gm-scroll"><table class="gm"><thead><tr><th class="gm-t"></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="mini gm-legend">
        <b class="gm-k gm-ok">ok</b> satisfiable as configured ·
        <b class="gm-k gm-trust">trust</b> only with inbound cross-tenant trust ·
        <b class="gm-k gm-blocked">blocked</b> documented as unsatisfiable — exclusion required ·
        <b class="gm-k gm-na">n/a</b> the control does not reach this type ·
        <b>·</b> nothing in scope asks it of them
      </p>
      ${counts.blocked || counts.trust ? `<p class="mini" style="margin:6px 0 0">${counts.blocked ? `<b>${counts.blocked}</b> combination${counts.blocked === 1 ? "" : "s"} cannot be satisfied at all. ` : ""}${counts.trust ? `<b>${counts.trust}</b> depend${counts.trust === 1 ? "s" : ""} on cross-tenant trust that is not in place. ` : ""}Each blocked or trust cell is explained below, per policy, with the fix; a cell opens the policies behind it.</p>` : ""}
    </div></div>`;
  }

  // ---- 🖥 shared devices against the controls this tenant demands (25485) ----
  // Mihai: the guest matrix only covers guests — "yes build that one also".
  // Microsoft publishes a support table for Teams devices too (Supported
  // Conditional Access and Intune device compliance policies for Microsoft
  // Teams Rooms and Teams Android Devices, updated 6 Jul 2026) and a list for
  // Surface Hub. The same idea as the guest matrix: which controls the LOADED
  // policies demand of the resource accounts these devices sign in with, and
  // whether the device can meet them at all. A resource account is a directory
  // user, so a policy reaches it through All users (unless it excludes the
  // shared-device group) or by including that group; a platform condition
  // decides which device family it reaches.
  const DEVICE_ROWS = [
    { key: "mtrWindows", label: "Teams Rooms on Windows", platform: "windows" },
    { key: "mtrAndroid", label: "Teams Rooms on Android, phones, panels", platform: "android" },
    { key: "surfaceHub", label: "Surface Hub", platform: "windows" },
  ];
  const DEVICE_CONTROLS = [
    ...MATRIX_CONTROLS,
    { key: "riskRemediation", label: "Risk remediation" },
    { key: "tokenProtection", label: "Token protection" },
    { key: "cae", label: "Customised CAE" },
    { key: "disableResilience", label: "No resilience defaults" },
    { key: "insiderRisk", label: "Insider risk" },
    { key: "deviceCodeBlock", label: "Device code blocked" },
  ];
  // Learn's table, column by column. ok = Supported; blocked = Not supported;
  // caution = supported, but a person has to be there (Android MFA: "to enable
  // seamless sign-on, don't enforce this policy"). Surface Hub: only what its
  // own page documents — anything else reads "not documented", not ok.
  const DEVICE_SUPPORT = {
    mtrWindows: { mfa: "blocked", strength: "blocked", compliantDevice: "ok", domainJoinedDevice: "blocked", appProtection: "blocked", passwordChange: "blocked", riskRemediation: "blocked", termsOfUse: "blocked",
      appEnforced: "blocked", cloudAppSecurity: "blocked", signInFrequency: "blocked", persistentBrowser: "blocked", cae: "blocked", disableResilience: "blocked", tokenProtection: "blocked", insiderRisk: "blocked", deviceCodeBlock: "ok" },
    mtrAndroid: { mfa: "caution", strength: "blocked", compliantDevice: "ok", domainJoinedDevice: "blocked", appProtection: "blocked", passwordChange: "blocked", riskRemediation: "blocked", termsOfUse: "blocked",
      appEnforced: "blocked", cloudAppSecurity: "blocked", signInFrequency: "blocked", persistentBrowser: "blocked", cae: "blocked", disableResilience: "blocked", tokenProtection: "blocked", insiderRisk: "blocked", deviceCodeBlock: "blocked" },
    surfaceHub: { mfa: "blocked", strength: "blocked", compliantDevice: "blocked", domainJoinedDevice: "blocked", appProtection: "blocked", passwordChange: "blocked" },
  };
  const DEVICE_WHY = {
    blocked: "not supported for this device — its resource account cannot meet it and stops signing in; exclude the shared-device group",
    caution: "supported, but it prompts on the device: a room signs out until someone completes it — Microsoft advises another factor (location, compliant device)",
    ok: "supported",
    unknown: "not in the device's documentation — test it on one device first",
  };
  const TEAMS_APPS = ["office365", "00000002-0000-0ff1-ce00-000000000000", "00000003-0000-0ff1-ce00-000000000000", "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe", "d4ebce55-015a-49b5-a083-c84d1797ae8c", "01cb2876-7ebd-4aa4-9cc9-d28bd4d359a9"];
  function reachesDevices(p, ctx) {
    const g = ctx && ctx.sharedDevices && ctx.sharedDevices.id;
    const u = U(p);
    const byGroup = g && (u.includeGroups || []).includes(g);
    const byAll = allUsers(p) && !(g && (u.excludeGroups || []).includes(g));
    if (!byGroup && !byAll) return false;
    const inc = appsInc(p).map((x) => String(x).toLowerCase());
    return inc.includes("all") || inc.some((x) => TEAMS_APPS.includes(x));
  }
  function reachesPlatform(p, plat) {
    const pl = p.conditions?.platforms;
    if (!pl) return true;
    const inc = (pl.includePlatforms || []).map((x) => String(x).toLowerCase()), exc = (pl.excludePlatforms || []).map((x) => String(x).toLowerCase());
    return (!inc.length || inc.includes("all") || inc.includes(plat)) && !exc.includes(plat);
  }
  function deviceDemands(p) {
    const out = demandsOf(p), g = G(p), sess = S(p), c = p.conditions || {};
    if (grants(p).includes("riskRemediation")) out.push("riskRemediation");
    if (sess.secureSignInSession?.isEnabled) out.push("tokenProtection");
    if (sess.continuousAccessEvaluation && sess.continuousAccessEvaluation.mode && sess.continuousAccessEvaluation.mode !== "disabled") out.push("cae");
    if (sess.disableResilienceDefaults) out.push("disableResilience");
    if (c.insiderRiskLevels && String(c.insiderRiskLevels) !== "") out.push("insiderRisk");
    if (grants(p).includes("block") && /deviceCodeFlow/i.test(String(c.authenticationFlows?.transferMethods || ""))) out.push("deviceCodeBlock");
    return out;
  }
  function deviceMatrix(rawPolicies, opts = {}) {
    INCLUDE_DISABLED = !!opts.includeDisabled;
    const ctx = { ...(opts.groups || {}) };
    const cells = new Map(), seen = new Set();
    for (const p of rawPolicies || []) {
      if (!isActive(p) || !reachesDevices(p, ctx)) continue;
      const demands = deviceDemands(p);
      for (const row of DEVICE_ROWS) {
        if (!reachesPlatform(p, row.platform)) continue;
        for (const control of demands) {
          seen.add(control);
          const v = (DEVICE_SUPPORT[row.key] || {})[control] || "unknown";
          const k = `${row.key}|${control}`;
          let cell = cells.get(k);
          if (!cell) { cell = { v, why: DEVICE_WHY[v], policies: [] }; cells.set(k, cell); }
          cell.policies.push({ id: p.id, name: p.displayName || "(unnamed policy)", state: p.state });
        }
      }
    }
    const controls = DEVICE_CONTROLS.filter((c) => seen.has(c.key));
    const types = DEVICE_ROWS.filter((r) => controls.some((c) => cells.has(`${r.key}|${c.key}`)));
    return { types, controls, cells, groupKnown: !!(ctx.sharedDevices && ctx.sharedDevices.id), groupName: ctx.sharedDevices && ctx.sharedDevices.name };
  }
  const DV_LABEL = { ok: "ok", caution: "prompts", blocked: "blocked", unknown: "?" };
  function renderDeviceMatrix(m, opts = {}) {
    if (!m || !m.types.length || !m.controls.length) return "";
    const blocked = [...m.cells.values()].filter((c) => c.v === "blocked").length;
    const head = m.controls.map((c) => `<th class="gm-c">${esc(c.label)}</th>`).join("");
    const rows = m.types.map((r) => `<tr><th class="gm-t" scope="row">${esc(r.label)}</th>${m.controls.map((c) => {
      const cell = m.cells.get(`${r.key}|${c.key}`);
      if (!cell) return `<td class="gm-cell gm-none" title="No policy that reaches these accounts asks for it">·</td>`;
      const cls = cell.v === "caution" ? "trust" : cell.v === "unknown" ? "na" : cell.v;
      const n = cell.policies.length;
      return `<td class="gm-cell gm-${cls}"><button type="button" data-dmcell="${esc(r.key)}|${esc(c.key)}" title="${esc(cell.why)} — ${n} polic${n === 1 ? "y" : "ies"}">${DV_LABEL[cell.v]}</button></td>`;
    }).join("")}</tr>`).join("");
    return `<div class="list-card gm-card"><div class="fx-body">
      <div class="gm-head">
        <h5>Shared devices against the controls this tenant demands</h5>
        <span class="mini muted">${m.groupKnown ? `resource accounts in ${esc(m.groupName || "the shared-device group")} — policies that exclude it are left out` : "no shared-device group found (CAB-SEC-U-TeamsSharedDevices or similar), so every policy on All users counts as reaching them"}</span>
      </div>
      <div class="gm-scroll"><table class="gm"><thead><tr><th class="gm-t"></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="mini gm-legend">
        <b class="gm-k gm-ok">ok</b> supported ·
        <b class="gm-k gm-trust">prompts</b> supported, but someone has to complete it on the device ·
        <b class="gm-k gm-blocked">blocked</b> not supported — the device stops signing in; exclude its resource account ·
        <b class="gm-k gm-na">?</b> not in the device's documentation ·
        <b>·</b> nothing that reaches these accounts asks for it
      </p>
      ${blocked ? `<p class="mini" style="margin:6px 0 0"><b>${blocked}</b> combination${blocked === 1 ? "" : "s"} these devices cannot meet. Microsoft's advice: exclude the resource accounts from every other policy and give them one of their own — compliant device plus a known location, no sign-in frequency, device code flow not blocked. Each blocked cell is explained below, per policy, with the fix; a cell opens the policies behind it.</p>` : ""}
      ${blocked && opts.fixN ? `<p style="margin:8px 0 0"><button class="btn lemon sm" data-mlapply="@devices">🧰 Fix these — ${opts.fixN} polic${opts.fixN === 1 ? "y" : "ies"} in this tenant <span class="tag block">writes</span></button>
        <span class="mini muted" style="margin-left:6px">every shared-device finding at once: the group excluded where a policy reaches them through All users, the control removed from their own policy — you confirm the list first</span></p>` : ""}
    </div></div>`;
  }

  // group findings per check so one issue hitting many policies is one card
  function group(findings) {
    const map = new Map();
    for (const f of findings) {
      if (!map.has(f.check.id)) map.set(f.check.id, { check: f.check, policies: [] });
      map.get(f.check.id).policies.push({ id: f.policyId, name: f.policyName, state: f.policyState, result: f.result });
    }
    // "low" was missing (25469): the swap-for-MFA finding is low, and sorted as
    // NaN, rendered an unlabelled badge and could not be filtered to.
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return [...map.values()].sort((a, b) => order[a.check.severity] - order[b.check.severity] || b.policies.length - a.policies.length);
  }

  const SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
  const sevBadge = (s) => `<span class="sev ${s}">${SEV_LABEL[s] || s}</span>`;

  // ---- rendering ----
  function renderSummary(groups, checksTotal, includeDisabled) {
    const nPol = groups.reduce((s, g) => s + g.policies.length, 0);
    const bySev = (s) => groups.filter((g) => g.check.severity === s).length;
    const chips = ["critical", "high", "medium", "low", "info"].filter((s) => bySev(s))
      .map((s) => `<span class="sev ${s}">${bySev(s)} ${SEV_LABEL[s]}</span>`).join(" ");
    const scope = includeDisabled ? "enabled, report-only and Off (disabled)" : "enabled and report-only";
    return `<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        ${toolHead("toolMsLearn")}
        <p style="margin-bottom:0">Your policies, checked against exclusions, limitations and upcoming behavior changes documented on learn.microsoft.com —
        missing break-glass exclusions, token protection limits, Teams Rooms / Surface Hub impact, service provider (CSP / GDAP) exclusions, required app exclusions and control retirements.
        ${checksTotal - LAST_NO_SP} checks ran against your ${scope} policies.${GUEST_GROUPS && GUEST_GROUPS.partial ? " The guest membership of some included groups could not be read, so guests reached only through those groups are not evaluated." : ""}${GUEST_GROUPS && GUEST_GROUPS.ok && GUEST_GROUPS.groups.size ? ` Guests are also followed through ${GUEST_GROUPS.groups.size} included group${GUEST_GROUPS.groups.size === 1 ? "" : "s"} that hold${GUEST_GROUPS.groups.size === 1 ? "s" : ""} members with userType Guest.` : ""}${LAST_NO_SP ? ` The ${LAST_NO_SP} service provider checks were skipped: cross-tenant access settings list no CSP or delegated-administration partner for this tenant.` : ""}</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:26px;font-weight:700">${groups.length}<span class="mini" style="font-weight:400"> finding${groups.length === 1 ? "" : "s"}</span></div>
        <div class="mini">across ${nPol} ${nPol === 1 ? "policy match" : "policy matches"}</div>
        ${LAST_SUPPRESSED ? `<div class="mini" style="color:var(--on);margin-top:4px">${LAST_SUPPRESSED} already handled by an existing exclusion</div>` : ""}
        <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${chips}</div>
      </div>
    </div>`;
  }

  function renderEmpty() {
    return `<div class="list-card" style="padding:40px;text-align:center">
      <div style="font-size:34px;margin-bottom:10px">✅</div>
      <h3 style="margin-bottom:6px">No impact issues found</h3>
      <p class="mini" style="max-width:420px;margin:0 auto">All enabled and report-only policies pass the documented Microsoft Learn exclusion checks — no missing exclusions or flagged misconfigurations.</p>
    </div>`;
  }

  function renderGroups(groups, filter, expanded, opts = {}) {
    const canApply = !!opts.canApply, fixable = opts.fixable || new Map();
    const shown = filter === "all" ? groups : groups.filter((g) => g.check.severity === filter);
    if (!shown.length) return `<p class="mini" style="padding:20px">No findings match the current filter.</p>`;
    return shown.map((g) => {
      const c = g.check, open = expanded.has(c.id);
      const n = g.policies.length;
      const uniform = new Set(g.policies.map((p) => p.result.detail)).size === 1;
      const resources = [...new Set(g.policies.flatMap((p) => p.result.impactedResources || []))];
      const nFix = fixable.get(c.id) || 0;
      const fixBtn = canApply && nFix ? `<button class="btn lemon sm ml-headfix" data-mlapply="${esc(c.id)}" title="Change the ${nFix === 1 ? "policy" : `${nFix} policies`} in place in this tenant — version bumped, state kept">🧰 Fix ${nFix}</button>` : "";
      return `<div class="list-card ml-card">
        <div class="ml-headrow"><button class="ml-head ${open ? "open" : ""}" data-mltoggle="${esc(c.id)}">
          <span class="caret">▶</span>
          ${sevBadge(c.severity)}
          ${EFFECT[c.id] ? `<span class="ml-eff eff-${EFFECT[c.id]}">${EFFECT_TEXT[EFFECT[c.id]][0]} ${esc(EFFECT_TEXT[EFFECT[c.id]][1])}</span>` : ""}
          <span class="ml-title">${esc(c.title)}</span>
          <span class="mini">${n === 1 ? esc(g.policies[0].name) : `${n} policies affected`}</span>
        </button>${fixBtn}</div>
        ${open ? `<div class="ml-detail">
          ${EFFECT[c.id] ? `<p class="ml-effect eff-${EFFECT[c.id]}"><b>${EFFECT_TEXT[EFFECT[c.id]][0]} ${esc(EFFECT_TEXT[EFFECT[c.id]][1])}.</b> ${esc(EFFECT_TEXT[EFFECT[c.id]][2])}</p>` : ""}
          ${uniform ? `<h5>Assessment</h5><p>${esc(g.policies[0].result.detail)}</p>` : ""}
          <h5>🛡 Affected ${n === 1 ? "policy" : `policies (${n})`}</h5>
          <ul class="plist2 ml-pols">${g.policies.map((p) => `<li><span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>${p.state === "enabledForReportingButNotEnforced" ? ' <span class="state report">Report-only</span>' : ""}${!uniform ? `<div class="mini" style="margin-top:3px">${esc(p.result.detail)}</div>` : ""}</li>`).join("")}</ul>
          ${resources.length ? `<h5 class="ml-red">Impacted resources</h5><ul class="ml-res">${resources.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
          <h5 class="ml-blue">MS Learn requirement</h5><p>${esc(c.requirement)}</p>
          <h5 class="ml-green">Remediation</h5>
          ${Array.isArray(c.remediationParts)
            ? `<dl class="ml-rem">${c.remediationParts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
            : `<p>${esc(c.remediation)}</p>`}
          ${canApply && nFix ? `<p style="margin-top:10px"><button class="btn lemon" data-mlapply="${esc(c.id)}">🧰 Fix ${nFix === 1 ? "this policy" : `these ${nFix} policies`} in this tenant <span class="tag block">writes</span></button>
            <span class="mini" style="margin-left:8px">${typeof c.companion === "function" ? "creates the companion policy beside it, state Off" : "changed in place — same policy, version bumped in the name, state kept"}; you confirm the list first, and they are marked ready for 🧱 Update the catalog</span></p>` : ""}
          ${!nFix && opts.accept ? `<div class="ml-accept"><input type="text" class="bl-why" data-mlwhy="${esc(c.id)}" aria-label="Why this is accepted" placeholder="no mechanical fix — accept it, and say why (kept for this tenant)">
            <button class="btn sm" data-mlaccept="${esc(c.id)}">✓ Accept with this reason</button></div>` : ""}
          ${typeof c.companion === "function"
            ? `<p style="margin-top:10px"><button class="btn${canApply && nFix ? "" : " lemon"}" data-mlfix="${esc(c.id)}">🧰 Fix — build the companion policy</button>
            <span class="mini" style="margin-left:8px">prepares the SECOND policy to download (state Off) — this policy is not touched and your tenant is not changed</span></p>`
            : typeof c.fix === "function" ? `<p style="margin-top:10px"><button class="btn${canApply && nFix ? "" : " lemon"}" data-mlfix="${esc(c.id)}">🧰 Fix — build the adjusted policy</button>
            <span class="mini" style="margin-left:8px">creates a new policy (version bumped, state Off) to download — your tenant is not changed</span></p>` : ""}
          <a class="ml-doc" href="${esc(c.docUrl)}" target="_blank" rel="noopener noreferrer">↗ View the Microsoft Learn documentation</a>
        </div>` : ""}
      </div>`;
    }).join("");
  }


  // 32303 — findings accepted with a reason, folded under the list. The
  // reason is the record; Reopen puts the finding back.
  function renderAccepted(list) {
    if (!list || !list.length) return "";
    return `<details class="list-card ml-accepted"><summary class="mini"><b>✓ Accepted (${list.length})</b> — findings with no mechanical fix, accepted with a reason for this tenant</summary>
      ${list.map(({ g, a }) => `<div class="ml-acc-row"><div><b>${esc(g.check.title)}</b> <span class="mini muted">· ${g.policies.length} polic${g.policies.length === 1 ? "y" : "ies"}${a.at ? ` · ${esc(String(a.at).slice(0, 10))}` : ""}</span>
        <div class="mini">${esc(a.reason)}</div></div><button class="btn sm" data-mlreopen="${esc(g.check.id)}">Reopen</button></div>`).join("")}
    </details>`;
  }

  // ======================================================================
  // Suggested fixes — build a NEW policy from an affected one with the
  // documented adjustment applied. Nothing is written to the tenant: the
  // result is a downloadable Graph JSON body, always with state "disabled"
  // and the version in the name bumped, so it can be reviewed, imported
  // and switched on deliberately.
  // ======================================================================

  // Bump the trailing version in a policy name: v1.0 -> v1.0.1, v1.0.1 -> v1.0.2.
  // A name without a version gets one, so the fix never overwrites the original.
  function bumpVersion(name) {
    const m = /^(.*?)(v\s?)(\d+(?:\.\d+)*)(\s*)$/i.exec(String(name || "").trim());
    if (!m) return `${String(name || "policy").trim()}-v1.1`;
    const parts = m[3].split(".").map(Number);
    if (parts.length < 3) parts.push(0);
    parts[parts.length - 1] += 1;
    return `${m[1]}${m[2]}${parts.join(".")}`;
  }

  // The next free CA number in the ORIGINAL's own hundred (CA400 -> 400..499),
  // which is how the personas are ranged. A companion needs a number of its
  // own: two policies on one number is a clash every other tool here reports,
  // and a bumped version would read as a replacement — 🧹 Housekeeping treats
  // a newer version of the same name as superseding the old one, and 👯
  // Duplicates as a copy to merge. This policy is neither; it lives beside the
  // original for good. Returns null when the range is full or the name carries
  // no number, and the caller says so rather than inventing one.
  function nextFreeNumber(raw, raws) {
    const num = (n) => { const m = /CA(\d{1,4})/i.exec(String(n || "")); return m ? parseInt(m[1], 10) : NaN; };
    const n = num(raw && raw.displayName);
    if (isNaN(n)) return null;
    const used = new Set((raws || []).map((p) => num(p.displayName)).filter((x) => !isNaN(x)));
    const lo = Math.floor(n / 100) * 100;
    for (let i = lo; i <= lo + 99; i++) if (!used.has(i)) return i;
    return null;
  }

  // CA000-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-v1.0.2
  //   -> CA001-GRANT-Global-IP-AnyApp-AnyPlatform-MFA-NonEntraExternals-v1.0
  // The version restarts at v1.0 because this is a new policy, not a revision
  // of the one it was derived from. A name off the convention keeps itself and
  // says in words what it is, rather than being forced into a shape it never had.
  function companionName(name, num) {
    const orig = String(name || "").trim();
    const m = /^(\((?:NEW|UP)\)\s*)?CA(\d{1,4})-(GRANT|BLOCK|SESSION)-([^-]+)-(.*?)-v\d+(?:\.\d+)*\s*$/i.exec(orig);
    if (!m || num == null) return `${orig || "policy"} — plain MFA for non-Entra externals`;
    return `CA${String(num).padStart(3, "0")}-${m[3].toUpperCase()}-${m[4]}-${m[5]}-NonEntraExternals-v1.0`;
  }

  // ---- turning a policy read from Graph into something Graph will accept ----
  // A GET on the beta endpoint returns far more than a POST will take:
  //   * read-only fields (id, createdDateTime, modifiedDateTime, templateId…)
  //   * OData annotations — both links (@odata.context / editLink /
  //     associationLink / navigationLink) and the sibling type hints Graph adds
  //     next to collections ("includeUsers@odata.type": "#Collection(String)")
  //   * grantControls.authenticationStrength expanded to the whole strength
  //     object, where a create only accepts a reference
  // Posting any of those back is a 400 "malformed or incorrect".

  const STRIP = ["id", "createdDateTime", "modifiedDateTime", "templateId", "deletedDateTime", "partialEnablementStrategy"];

  // Keep a genuine type discriminator ("@odata.type": "#microsoft.graph.…"),
  // which derived types such as conditionalAccessEnumeratedExternalTenants
  // need; drop every other annotation and every action key ("#microsoft…").
  function stripOdata(o) {
    if (Array.isArray(o)) return o.map(stripOdata);
    if (o && typeof o === "object") {
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith("#")) continue;                       // action/function bindings
        if (k.includes("@odata")) {
          const keep = k === "@odata.type" && typeof v === "string" && v.startsWith("#microsoft.graph.");
          if (!keep) continue;
        }
        out[k] = stripOdata(v);
      }
      return out;
    }
    return o;
  }

  function draftFrom(raw) {
    const d = stripOdata(JSON.parse(JSON.stringify(raw)));
    STRIP.forEach((k) => delete d[k]);
    // a create takes a reference to the authentication strength, not the policy
    const as = d.grantControls?.authenticationStrength;
    if (as) d.grantControls.authenticationStrength = { id: as.id };
    d.conditions = d.conditions || {};
    return d;
  }

  // Graph rejects an empty controls object — a fix that removes the last
  // session control has to leave null behind, not {}.
  function tidy(d) {
    const empty = (o) => !o || Object.keys(o).filter((k) => o[k] !== null && o[k] !== undefined).length === 0;
    if (empty(d.sessionControls)) d.sessionControls = null;
    const g = d.grantControls;
    if (g && !(g.builtInControls || []).length && !g.authenticationStrength
        && !(g.termsOfUse || []).length && !(g.customAuthenticationFactors || []).length) {
      d.grantControls = null;
    }
    return d;
  }

  // 32303 — a fix written IN PLACE (the baseline tenant). Only the sections
  // that differ from the policy as read go in the body, whole. A PATCH that
  // OMITS a nested key keeps the old value (the 25464 lesson: a strength left
  // out stays on the policy), so whatever the fix took out of a section is
  // written as an explicit null. The name always goes: the version bump in it
  // is what 🧱 Update the catalog reads as newer. State is never sent — the
  // policy keeps the state it had.
  function patchBody(raw, draft) {
    const before = tidy(draftFrom(raw));
    const out = { displayName: draft.displayName };
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    for (const k of ["conditions", "grantControls", "sessionControls"]) {
      const a = before[k] ?? null, b = draft[k] ?? null;
      if (same(a, b)) continue;
      if (a && b && typeof a === "object" && typeof b === "object") {
        const v = JSON.parse(JSON.stringify(b));
        for (const kk of Object.keys(a)) if (!(kk in v) && a[kk] != null) v[kk] = null;
        out[k] = v;
      } else out[k] = b;
    }
    return out;
  }

  // 32303 — what a finding group was accepted ABOUT: the check and the exact
  // policies. A later run that reaches a different set reopens it by itself.
  function acceptSig(g) {
    return `${g.check.id}:${g.policies.map((p) => p.id).sort().join(",")}`;
  }

  // findings: the flat list from run(); raws: the raw policies keyed by id.
  // ctx may carry { breakGlass: {id, type, name} } for the break-glass fix.
  function buildFixes(findings, raws, ctx = {}) {
    const byPolicy = new Map();   // policyId -> { raw, draft, changes[], checks[] }
    const rawById = new Map(raws.map((p) => [p.id, p]));
    const skipped = [];

    for (const f of findings) {
      if (typeof f.check.fix !== "function") continue;
      const raw = rawById.get(f.policyId);
      if (!raw) continue;
      let entry = byPolicy.get(f.policyId);
      if (!entry) {
        entry = {
          policyId: f.policyId, originalName: raw.displayName || "(unnamed policy)", originalState: raw.state, raw,
          // what the live policy targets: by definition those apps resolve in
          // this tenant, so it is the safe fallback if a narrowing fix cannot apply
          originalApps: (raw.conditions?.applications?.includeApplications || []).slice(),
          draft: draftFrom(raw), changes: [], checks: [],
        };
        byPolicy.set(f.policyId, entry);
      }
      let ch = null;
      try { ch = f.check.fix(entry.draft, ctx, f.result); } catch (e) { console.warn(`MS Learn fix ${f.check.id} failed:`, e); }
      if (ch === null) {
        skipped.push({ policyName: entry.originalName, check: f.check, needs: f.check.needsGroup || null });
        continue;
      }
      if (!ch.length) continue;               // already satisfied by an earlier fix
      entry.changes.push(...ch);
      entry.checks.push(f.check);
    }

    // COMPANIONS. A companion check does not edit the offending policy — it
    // asks for a SECOND one beside it — so it gets its own entry built from
    // the raw policy, never from the shared draft above. Sharing that draft
    // would let this check undo an adjustment another one made to the same
    // policy, in the one case where both must survive.
    const companions = [];
    for (const f of findings) {
      if (typeof f.check.companion !== "function") continue;
      const raw = rawById.get(f.policyId);
      if (!raw) continue;
      let c = null;
      try { c = f.check.companion(raw, { ...ctx, raws }); } catch (e) { console.warn(`MS Learn companion ${f.check.id} failed:`, e); }
      if (!c || !c.draft) { skipped.push({ policyName: raw.displayName || "(unnamed policy)", check: f.check, needs: f.check.needsGroup || null }); continue; }
      tidy(c.draft);
      c.draft.displayName = c.name;
      c.draft.state = "disabled";
      companions.push({
        policyId: f.policyId, originalName: raw.displayName || "(unnamed policy)", originalState: raw.state,
        originalApps: (raw.conditions?.applications?.includeApplications || []).slice(),
        draft: c.draft, changes: c.changes || [], checks: [f.check],
        companion: true, newName: c.name, json: JSON.stringify(c.draft, null, 2),
      });
    }

    const fixes = [];
    for (const e of byPolicy.values()) {
      if (!e.changes.length) continue;
      tidy(e.draft);
      e.draft.displayName = bumpVersion(e.originalName);
      e.draft.state = "disabled";             // never auto-enable a generated policy
      e.newName = e.draft.displayName;
      e.json = JSON.stringify(e.draft, null, 2);
      fixes.push(e);
    }
    fixes.push(...companions);
    fixes.sort((a, b) => a.newName.localeCompare(b.newName));
    return { fixes, skipped };
  }

  // ---- app references must exist in the tenant --------------------------
  // Several fixes add or narrow application references (the Defender mobile
  // apps, the six token-protection apps, Azure VM Sign-In). Entra rejects a
  // policy that names a service principal the tenant does not have — with a
  // generic 400 that names nothing — so drop unknown ones before writing, and
  // say so rather than letting the create fail.
  const APP_LABEL = {
    [EXCHANGE_ONLINE]: "Office 365 Exchange Online",
    [SHAREPOINT_ONLINE]: "Office 365 SharePoint Online",
    [TEAMS_SERVICE]: "Microsoft Teams Services",
    [AZURE_VIRTUAL_DESKTOP]: "Azure Virtual Desktop",
    [WINDOWS_365]: "Windows 365",
    [WINDOWS_CLOUD_LOGIN]: "Windows Cloud Login",
    [AZURE_VM_SIGNIN]: "Azure Windows VM Sign-In",
    [DEFENDER_ATP_XPLAT]: "MicrosoftDefenderATP XPlat",
    [DEFENDER_TVM]: "Defender for Mobile TVM",
  };

  // every appId our fixes could introduce, so the caller can look them up once
  function referencedAppIds(res) {
    const ids = new Set();
    for (const f of res.fixes) {
      const a = f.draft.conditions?.applications || {};
      [...(a.includeApplications || []), ...(a.excludeApplications || [])]
        .forEach((x) => { if (/^[0-9a-f-]{36}$/i.test(x)) ids.add(String(x).toLowerCase()); });
    }
    return [...ids];
  }

  // Record which referenced apps have no service principal yet. They are NOT
  // removed: for Microsoft first-party apps the right answer is to create the
  // service principal from the well-known appId and keep the reference, which
  // the apply step does. Downloading the JSON instead? Then the note tells you
  // which service principals to create first.
  function markUnknownApps(res, existing) {
    res.missingApps = [];
    if (!existing) return res;
    const seen = new Set();
    for (const f of res.fixes) {
      const a = f.draft.conditions?.applications || {};
      const refs = [...(a.includeApplications || []), ...(a.excludeApplications || [])]
        .filter((x) => /^[0-9a-f-]{36}$/i.test(x) && !existing.has(String(x).toLowerCase()));
      f.missing = [...new Set(refs.map((x) => String(x).toLowerCase()))];
      f.missing.forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        res.missingApps.push({ appId: id, label: APP_LABEL[id] || "application" });
      });
      if (f.missing.length) {
        f.changes.push(`Needs ${f.missing.length} Microsoft service principal${f.missing.length === 1 ? "" : "s"} that this tenant does not have yet: `
          + f.missing.map((id) => `${APP_LABEL[id] || "app"} (${id})`).join(", ")
          + " — these are created from their well-known app IDs when the fix is applied.");
      }
    }
    return res;
  }

  // Fallback when a service principal could not be created after all: take the
  // reference out so the policy itself can still be written.
  function dropApps(res, appIds) {
    const gone = new Set([...(appIds || [])].map((x) => String(x).toLowerCase()));
    if (!gone.size) return res;
    for (const f of res.fixes) {
      const a = f.draft.conditions?.applications;
      if (!a) continue;
      const filter = (list) => (list || []).filter((x) => !gone.has(String(x).toLowerCase()));
      const incBefore = (a.includeApplications || []).slice();
      const removed = [...(a.includeApplications || []), ...(a.excludeApplications || [])]
        .filter((x) => gone.has(String(x).toLowerCase()));
      if (!removed.length) continue;
      a.excludeApplications = filter(a.excludeApplications);
      a.includeApplications = filter(a.includeApplications);
      if (!a.includeApplications.length && (f.originalApps || []).length) {
        a.includeApplications = f.originalApps.slice();
        f.changes.push(`Kept the original target resources (${f.originalApps.join(", ")}) — the supported apps could not be created`);
      } else if (!a.includeApplications.length) {
        a.includeApplications = incBefore;
      }
      f.changes.push(`Dropped ${removed.length} app reference${removed.length === 1 ? "" : "s"} whose service principal could not be created: `
        + [...new Set(removed)].map((id) => `${APP_LABEL[id] || "app"} (${id})`).join(", "));
      f.json = JSON.stringify(f.draft, null, 2);
    }
    return res;
  }

  // existing: Set of lowercase appIds that DO resolve in the tenant
  function pruneUnknownApps(res, existing) {
    if (!existing) return res;
    const known = (id) => existing.has(String(id).toLowerCase());
    for (const f of res.fixes) {
      const a = f.draft.conditions?.applications;
      if (!a) continue;
      const drop = (list, where) => {
        if (!Array.isArray(list)) return list;
        const gone = list.filter((x) => /^[0-9a-f-]{36}$/i.test(x) && !known(x));
        if (!gone.length) return list;
        const kept = list.filter((x) => !gone.includes(x));
        f.changes.push(`Skipped ${gone.length} ${where} app reference${gone.length === 1 ? "" : "s"} — no service principal in this tenant: `
          + gone.map((id) => `${APP_LABEL[id] || "app"} (${id})`).join(", "));
        return kept;
      };
      a.excludeApplications = drop(a.excludeApplications, "excluded");
      a.includeApplications = drop(a.includeApplications, "targeted");
      // never leave a policy targeting nothing — fall back to what the live
      // policy targeted, which is known to resolve in this tenant
      if (!(a.includeApplications || []).length && (f.originalApps || []).length) {
        a.includeApplications = f.originalApps.slice();
        f.changes.push(`Kept the original target resources (${f.originalApps.join(", ")}): narrowing them would have left `
          + "the policy targeting nothing, because none of the supported apps has a service principal in this tenant");
      }
      f.json = JSON.stringify(f.draft, null, 2);
    }
    return res;
  }

  // Entra will reject a policy without saying which property offended. Rather
  // than fail the whole fix, offer progressively simpler payloads: the full
  // one first, then the same policy with a reduced device filter, then with no
  // device filter at all. The caller reports which variant actually landed.
  function createVariants(f) {
    const out = [{ json: f.json, note: null }];
    let d;
    try { d = JSON.parse(f.json); } catch { return out; }
    if (d.conditions?.devices?.deviceFilter) {
      for (const rule of TOKEN_PROT_DEVICE_FALLBACKS) {
        const v = JSON.parse(f.json);
        v.conditions.devices.deviceFilter = { mode: "exclude", rule };
        out.push({ json: JSON.stringify(v, null, 2), note: `Device filter reduced to \`${rule}\` — Entra rejected the fuller rule` });
      }
      const bare = JSON.parse(f.json);
      delete bare.conditions.devices;
      out.push({ json: JSON.stringify(bare, null, 2),
        note: "Device filter omitted — Entra rejected every variant. Add the unsupported-device exclusions by hand; see the remediation on the finding." });
    }
    return out;
  }

  function renderFixes(res) {
    if (!res.fixes.length) {
      return `<div class="list-card" style="padding:40px;text-align:center">
        <div style="font-size:34px;margin-bottom:10px">🧰</div>
        <h3 style="margin-bottom:6px">No automatic fixes available</h3>
        <p class="mini" style="max-width:460px;margin:0 auto">None of the current findings can be turned into a policy change mechanically —
        they need a decision (which app to target, which accounts to exclude) rather than an edit. Follow the remediation text on each finding instead.</p>
      </div>`;
    }
    const cards = res.fixes.map((f, i) => `<div class="list-card fx-card">
      <div class="fx-head">
        <div>
          <div class="fx-new">${esc(f.newName)}${f.companion ? ' <span class="tag">companion</span>' : ""}</div>
          <div class="mini">${f.companion ? "beside" : "from"} <span class="pol-link" data-polid="${esc(f.policyId)}">${esc(f.originalName)}</span> · created as <b>Off</b>${f.companion ? " · the original is not changed" : ""}</div>
        </div>
        <div class="spacer"></div>
        <button class="btn" data-fxjson="${i}">⤓ Download JSON</button>
      </div>
      <div class="fx-body">
        <h5 class="ml-green">${f.companion ? `What this policy adds (${f.changes.length})` : `Applied adjustments (${f.changes.length})`}</h5>
        <ul class="ml-res">${f.changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
        <h5 class="ml-blue">Based on</h5>
        <ul class="plist2">${f.checks.map((c) => `<li>${esc(c.title)} <a class="ml-doc" href="${esc(c.docUrl)}" target="_blank" rel="noopener noreferrer">↗ MS Learn</a></li>`).join("")}</ul>
      </div>
    </div>`).join("");
    const missing = (res.missingApps || []).length ? `<div class="list-card fx-card"><div class="fx-body">
        <h5 class="ml-blue">${res.missingApps.length} Microsoft service principal${res.missingApps.length === 1 ? "" : "s"} will be created first</h5>
        <p class="mini">A Conditional Access policy can only reference an application that exists in the tenant. These are Microsoft
        first-party apps that have never been instantiated here; applying the fixes creates them from their well-known app IDs
        (no permissions are consented by doing so), then references them.</p>
        <ul class="ml-res">${res.missingApps.map((m) => `<li>${esc(m.label)} — <code>${esc(m.appId)}</code></li>`).join("")}</ul>
        <p class="mini">Downloading the JSON instead? Create these service principals first, or the import will be rejected.</p>
      </div></div>` : "";
    const note = res.skipped.length
      ? (() => {
        const needs = [...new Set(res.skipped.map((x) => x.needs).filter(Boolean))];
        const titles = [...new Set(res.skipped.map((x) => x.check.title))].join("; ");
        const create = needs.map((k) => `<button class="btn" data-mkgroup="${esc(k)}">➕ Create ${esc(CONVENTION[k][0])} <span class="tag block">writes</span></button>`).join(" ");
        return `<div class="list-card fx-card"><div class="fx-body">
          <h5 class="ml-blue">${res.skipped.length} finding${res.skipped.length === 1 ? "" : "s"} need a group that does not exist yet</h5>
          <p class="mini">${esc(titles)}</p>
          ${needs.map((k) => `<p class="mini" style="margin-top:8px">These fixes exclude <b>${esc(CONVENTION[k][0])}</b> — ${esc(GROUP_PURPOSE[k] || "")}. The tenant has no group by that name (or an accepted alias: ${esc(CONVENTION[k].slice(1).join(", ") || "none")}), so the exclusion cannot be guessed.</p>`).join("")}
          ${create ? `<p style="margin-top:10px">${create} <span class="mini">created from the bundled group template where there is one — the shared-devices group is <b>dynamic</b>, so it populates itself from the Teams Rooms service plans rather than needing the accounts added by hand</span></p>` : ""}
        </div></div>`;
      })()
      : "";
    const nComp = res.fixes.filter((f) => f.companion).length;
    return `<p class="mini" style="margin:0 0 12px">${res.fixes.length} new polic${res.fixes.length === 1 ? "y" : "ies"} prepared from ${res.fixes.length === 1 ? "1 affected policy" : `${res.fixes.length} affected policies`}.
      ${nComp ? `${nComp} of them ${nComp === 1 ? "is a companion: it goes BESIDE" : "are companions: they go BESIDE"} the policy ${nComp === 1 ? "it was" : "they were"} derived from, which stays exactly as it is. The rest replace theirs. ` : ""}Nothing is written to your tenant — download the JSON, review it, then bring it in through the Import tool.</p>${missing}${cards}${note}`;
  }

  // 25472: the include groups whose guest membership the guest checks need —
  // groups of policies that do not already reach every user.
  function guestGroupIds(rawPolicies, includeDisabled) {
    const ids = new Set();
    for (const p of rawPolicies || []) {
      const on = p.state === "enabled" || p.state === "enabledForReportingButNotEnforced" || (includeDisabled && p.state === "disabled");
      if (!on || allUsers(p) || legacyIncExt(p)) continue;
      for (const id of U(p).includeGroups || []) ids.add(id);
    }
    return [...ids];
  }

  return { patchBody, acceptSig, renderAccepted, deviceMatrix, renderDeviceMatrix, DEVICE_ROWS, guestGroupIds, run, suppressedCount, group, guestMatrix, renderGuestMatrix, extLabel, renderSummary, renderGroups, renderEmpty, buildFixes, renderFixes, bumpVersion, nextFreeNumber, companionName, EFFECT, EFFECT_TEXT, createVariants, referencedAppIds, markUnknownApps, dropApps, pruneUnknownApps, APP_LABEL, CONVENTION, GROUP_PURPOSE, checksCount: CHECKS.length };
})();
