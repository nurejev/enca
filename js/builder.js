// ======================================================================
// 🏗 Policy builder (T41, build 25437) — R23 built on R17.
//
// ONE SCREEN, THREE STARTS. A policy is assembled step by step — who, what,
// when, then, session, state — from a BLANK draft, from a BASELINE TEMPLATE,
// or from a POLICY SELECTED ELSEWHERE (🗂 Policies' selection bar, a 🧩
// building block's detail pane). The selected-elsewhere start is R17's
// half: the same draft PATCHes the policy it came from, with a field-level
// diff of exactly what will change, or is cloned into a new one.
//
// WHAT THIS MODULE IS. Pure: the draft model, the naming convention, the
// next free CA number, the Graph body a draft becomes (and the reverse),
// the validation, the best-practice hints, the preflight over WhatIfEval,
// and the HTML of the steps and the preview. It reads nothing and writes
// nothing — js/app.js owns the DOM events, the tenant reads and the two
// writes (POST / PATCH). That split is what makes it testable in node
// (tools/builder.test.cjs) and portable (R32 / R34).
//
// TWO RULES CARRIED IN FROM ELSEWHERE:
//   * conditions.users is PATCHed WHOLE, never in part — a block left out of
//     the object is deleted from the policy (assign.js newUsersBlock; the
//     25430 regression that dropped a guest clause). The same is true of
//     conditions, grantControls and sessionControls, so an edit sends the
//     whole section it touched, built by toRaw() from the whole draft.
//   * a new policy is born REPORT-ONLY. It can be created Off; creating it
//     On needs a typed ON in the UI — 🎚 Report-only impact is the evidence
//     trail R23 exists to feed, and a policy that skips it skips the point.
//
// A CATALOG TEMPLATE IS PROSE. js/baselineData.js carries the include /
// exclude lists as names and the rest as sentences, not as Graph fields.
// So "start from a template" seeds what is structured — number, persona,
// kind, version, the group NAMES (resolved against the tenant's groups when
// they exist) — and carries the sentences into the step summaries as the
// template's own words, for the person to set. When the tenant already
// holds that CA number, app.js starts from the tenant's policy instead,
// which IS structured.
// ======================================================================
const Builder = (() => {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uniq = (a) => [...new Set((a || []).filter(Boolean))];

  // ---- the convention --------------------------------------------------
  // The CA-number ranges every tool assumes (js/rmau.js CLOUDFELLOWS_AUS) and
  // the persona word the name carries. `group` is the CloudFellows persona
  // group; the active baseline's own list wins at run time (personas(cat)).
  const PERSONAS = [
    { key: "global",          code: "GLO",         word: "Global",           label: "🌐 Global",              lo: 0,    hi: 99,   group: null },
    { key: "admins",          code: "ADM",         word: "Admins",           label: "🛡 Admins",              lo: 100,  hi: 199,  group: "CAB-SEC-U-Persona-Admins" },
    { key: "internals",       code: "INT",         word: "Internals",        label: "👤 Internals",           lo: 200,  hi: 299,  group: "CAB-SEC-U-Persona-Internals" },
    { key: "externals",       code: "EXT",         word: "Externals",        label: "🤝 Externals",           lo: 300,  hi: 399,  group: "CAB-SEC-U-Persona-Externals" },
    { key: "guestusers",      code: "GUESTUSERS",  word: "GuestUsers",       label: "👥 Guest users",         lo: 400,  hi: 499,  group: "CAB-SEC-U-Persona-GuestUsers" },
    { key: "guestadmins",     code: "GUESTAdmins", word: "GuestAdmins",      label: "🔑 Guest admins",        lo: 500,  hi: 599,  group: "CAB-SEC-U-Persona-GuestAdmins" },
    { key: "serviceaccounts", code: "SA",          word: "ServiceAccounts",  label: "⚙ Service accounts",     lo: 600,  hi: 899,  group: "CAB-SEC-U-Persona-Microsoft365ServiceAccounts" },
    { key: "workload",        code: "WLI",         word: "WorkloadIdentities", label: "🤖 Workload identities", lo: 900, hi: 999,  group: null },
    { key: "devops",          code: "DevOps",      word: "DevOps",           label: "🧰 DevOps",              lo: 1000, hi: 1099, group: "CAB-SEC-U-Persona-DevOps" },
  ];
  const BREAK_GLASS_RE = /break[\s-]?glass|emergency[\s-]?access|emergency_access/i;
  const KINDS = ["GRANT", "BLOCK", "SESSION"];
  const PLATFORMS = [["android", "Android"], ["iOS", "iOS"], ["windows", "Windows"], ["macOS", "macOS"], ["linux", "Linux"], ["windowsPhone", "Windows Phone"]];
  const CLIENT_APPS = [["browser", "Browser"], ["mobileAppsAndDesktopClients", "Mobile apps and desktop clients"], ["exchangeActiveSync", "Exchange ActiveSync clients"], ["other", "Other clients (legacy authentication)"]];
  const RISK = ["low", "medium", "high"];
  const INSIDER = ["minor", "moderate", "elevated"];
  const FLOWS = [["deviceCodeFlow", "Device code flow"], ["authenticationTransfer", "Authentication transfer"]];
  const USER_ACTIONS = [["urn:user:registersecurityinfo", "Register security information"], ["urn:user:registerdevice", "Register or join devices"]];
  // The grant controls a body can carry. "approvedApplication" was retired on
  // 30 June 2026 (see enca-retired-approved-app): it is listed so a policy that
  // still carries it can be read back honestly, and refused on a write.
  const GRANTS = [
    ["mfa", "Require multifactor authentication"],
    ["compliantDevice", "Require device to be marked as compliant"],
    ["domainJoinedDevice", "Require Microsoft Entra hybrid joined device"],
    ["compliantApplication", "Require app protection policy"],
    ["passwordChange", "Require password change"],
    ["approvedApplication", "Require approved client app (retired 30 June 2026)"],
  ];
  const APP_GROUPS = [["All", "All resources (cloud apps)"], ["Office365", "Office 365"], ["MicrosoftAdminPortals", "Microsoft Admin Portals"]];
  // well-known role templates — the demo's roles picker and the fallback when
  // /directoryRoleTemplates was not read
  const ROLES = [
    ["62e90394-69f5-4237-9190-012177145e10", "Global Administrator"], ["e8611ab8-c189-46e8-94e1-60213ab1f814", "Privileged Role Administrator"],
    ["b1be1c3e-b65d-4f19-8427-f6fa0d97feb9", "Conditional Access Administrator"], ["194ae4cb-b126-40b2-bd5b-6091b380977d", "Security Administrator"],
    ["9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3", "Application Administrator"], ["158c047a-c907-4556-b7ef-446551a6b5f7", "Cloud Application Administrator"],
    ["fe930be7-5e62-47db-91af-98c3a49a38b1", "User Administrator"], ["729827e3-9c14-49f7-bb1b-9608f156bbb8", "Helpdesk Administrator"],
    ["3a2c62db-5318-420d-8d74-23affee5d9d5", "Intune Administrator"], ["29232cdf-9323-42fd-ade2-1d097af3e4de", "Exchange Administrator"],
    ["f28a1f50-f6e7-4571-818b-6a12f2af6b6c", "SharePoint Administrator"], ["7be44c8a-adaf-4e2a-84d6-ab2649e08a13", "Privileged Authentication Administrator"],
  ];
  const STATES = [["enabledForReportingButNotEnforced", "Report-only"], ["disabled", "Off"], ["enabled", "On"]];

  // The active baseline's personas when there is one (its group names differ
  // per catalog — Joey's are CA-Persona-…); the table above otherwise.
  function personas(cat) {
    const out = PERSONAS.map((p) => ({ ...p }));
    const pg = cat && Array.isArray(cat.personaGroups) ? cat.personaGroups : null;
    if (pg) out.forEach((p) => { const m = pg.find((g) => g.key === p.key); if (m && "group" in m) p.group = m.group; });
    return out;
  }
  const personaOf = (key, cat) => personas(cat).find((p) => p.key === key) || null;
  // "CA216-…" → 216; anything else → null. The staging prefixes are skipped.
  const caNum = (name) => { const m = /^(?:\((?:NEW|UP)\))?\s*CA(\d{3,4})\b/i.exec(String(name || "")); return m ? +m[1] : null; };
  // the smallest unused number in the persona's range, and who holds the taken ones
  function nextNumber(personaKey, raws, cat, skipId) {
    const p = personaOf(personaKey, cat); if (!p) return { num: null, taken: [] };
    const taken = new Map();
    (raws || []).forEach((r) => { if (r && r.id === skipId) return; const n = caNum(r && r.displayName); if (n != null && n >= p.lo && n <= p.hi) taken.set(n, r.displayName); });
    let n = p.lo; while (taken.has(n) && n <= p.hi) n++;
    return { num: n <= p.hi ? n : null, taken: [...taken.entries()].sort((a, b) => a[0] - b[0]) };
  }

  // ---- the draft ---------------------------------------------------------
  function blank() {
    return {
      mode: "new", sourceId: null, sourceName: "", sourceState: null, template: null,
      persona: "internals", number: null, words: "", version: "1.0", customName: "",
      users: { includeAll: false, includeGroups: [], includeUsers: [], includeRoles: [], excludeGroups: [], excludeUsers: [], excludeRoles: [], includeGuests: null, excludeGuests: null },
      apps: { target: "all", includeApplications: [], excludeApplications: [], userActions: [], authContexts: [], filter: null },
      cond: {
        platforms: { mode: "any", include: [], exclude: [] },
        locations: { mode: "any", include: [], exclude: [], excludeTrusted: false },
        clientApps: ["browser", "mobileAppsAndDesktopClients"],
        signInRisk: [], userRisk: [], insiderRisk: [], authFlows: [],
        deviceFilter: { mode: "exclude", rule: "" },
      },
      grant: { mode: "grant", controls: [], strength: null, termsOfUse: [], operator: "OR" },
      session: { sif: null, persistent: null, appEnforced: false, cae: null, tokenProtection: false, mdca: null, resilience: false },
      state: "enabledForReportingButNotEnforced",
      createExclusionGroup: true, exclusionGroupName: "",
      names: {}, // id → display name the draft learnt on the way (pickers, the source policy)
    };
  }

  // ---- naming ------------------------------------------------------------
  // CAnnn-KIND-Persona-<words>-vX.Y. The kind follows the controls: block →
  // BLOCK, grant controls → GRANT, session controls only → SESSION.
  function kindOf(d) {
    if (d.grant.mode === "block") return "BLOCK";
    const grants = d.grant.controls.length + (d.grant.strength ? 1 : 0) + d.grant.termsOfUse.length;
    return grants ? "GRANT" : (sessionCount(d) ? "SESSION" : "GRANT");
  }
  function sessionCount(d) {
    const s = d.session || {};
    return (s.sif ? 1 : 0) + (s.persistent ? 1 : 0) + (s.appEnforced ? 1 : 0) + (s.cae ? 1 : 0) + (s.tokenProtection ? 1 : 0) + (s.mdca ? 1 : 0) + (s.resilience ? 1 : 0);
  }
  // Two or three words the baseline's names carry between the persona and the
  // control: resource, platform, control. Suggested, then editable.
  function suggestWords(d) {
    const a = d.apps, c = d.cond, g = d.grant;
    const res = a.target === "actions" ? (a.userActions.length === 1 && /registersecurityinfo/i.test(a.userActions[0]) ? "RegisterSecurityInfo" : "UserAction")
      : a.target === "contexts" ? "AuthContext"
      : a.target === "all" ? "AnyApp"
      : a.includeApplications.length === 1 ? (a.includeApplications[0] === "Office365" ? "Office365" : a.includeApplications[0] === "MicrosoftAdminPortals" ? "AdminPortals" : "SelectedApp")
      : "SelectedApps";
    const plat = c.platforms.mode === "any" || !c.platforms.include.length ? "AnyPlatform"
      : c.platforms.include.map((p) => (PLATFORMS.find((x) => x[0] === p) || [p, p])[1].replace(/\s/g, "")).join("Or");
    const ctl = g.mode === "block" ? (c.clientApps.includes("other") && !c.clientApps.includes("browser") ? "LegacyAuthentication" : c.authFlows.includes("deviceCodeFlow") ? "DeviceCode" : "Block")
      : g.strength ? "AuthStrength" : g.controls.includes("mfa") ? "MFA" : g.controls.includes("compliantDevice") ? "CompliantDevice" : g.controls.includes("domainJoinedDevice") ? "HybridJoined"
      : g.controls.includes("compliantApplication") ? "AppProtection" : g.controls.includes("passwordChange") ? "PasswordChange" : g.termsOfUse.length ? "TermsOfUse"
      : d.session.sif ? "SignInFrequency" : d.session.persistent ? "PersistentBrowser" : d.session.appEnforced ? "AppEnforcedRestrictions" : "Grant";
    const risk = c.userRisk.length ? "UserRisk" : c.signInRisk.length ? "SignInRisk" : "";
    return [res, plat, risk, ctl].filter(Boolean).join("-");
  }
  function nameOf(d, cat) {
    if (d.customName) return d.customName;
    const p = personaOf(d.persona, cat);
    const n = d.number == null ? "nnn" : String(d.number).padStart(3, "0");
    return `${d.prefix || ""}CA${n}-${kindOf(d)}-${p ? p.word : "Persona"}-${d.words || suggestWords(d)}-v${d.version || "1.0"}`;
  }
  // The convention's exclusion group for a policy — CloudFellows' shape; the
  // active baseline's own rule (Joey: "<policy> - Exclude") comes through
  // cat.exclusionGroupFor when it has one.
  function exclusionGroupName(d, cat) {
    if (d.exclusionGroupName) return d.exclusionGroupName;
    // the contract returns { name, source } (js/baseline.js) — the name is what a group is called
    if (cat && typeof cat.exclusionGroupFor === "function") { try { const n = cat.exclusionGroupFor(nameOf(d, cat)); if (n && n.name) return String(n.name); if (typeof n === "string" && n) return n; } catch { /* fall through */ } }
    return d.number == null ? "" : `CAB-SEC-U-CA${String(d.number).padStart(3, "0")}-Exclusion`;
  }

  // ---- draft → Graph body ------------------------------------------------
  const EXT_ALL = "#microsoft.graph.conditionalAccessAllExternalTenants";
  const EXT_SOME = "#microsoft.graph.conditionalAccessEnumeratedExternalTenants";
  function guestClause(g) {
    if (!g || !g.guestOrExternalUserTypes) return null;
    const t = g.externalTenants || {};
    const kind = String(t.membershipKind || "all").toLowerCase();
    const externalTenants = kind === "enumerated"
      ? { "@odata.type": EXT_SOME, membershipKind: "enumerated", members: uniq(t.members || []) }
      : { "@odata.type": EXT_ALL, membershipKind: "all" };
    return { guestOrExternalUserTypes: String(g.guestOrExternalUserTypes), externalTenants };
  }

  function toRaw(d, cat) {
    const u = d.users, a = d.apps, c = d.cond, g = d.grant, s = d.session;
    const users = {
      includeUsers: u.includeAll ? ["All"] : uniq(u.includeUsers),
      excludeUsers: uniq(u.excludeUsers),
      includeGroups: u.includeAll ? [] : uniq(u.includeGroups),
      excludeGroups: uniq(u.excludeGroups),
      includeRoles: u.includeAll ? [] : uniq(u.includeRoles),
      excludeRoles: uniq(u.excludeRoles),
    };
    // the guest clause: one object per side, carried whole (25430)
    // THE GUEST CLAUSE IS THE ONE PART OF conditions CARRIED THROUGH FROM THE
    // READ rather than rebuilt from the draft — so it is the one that can
    // still hold whatever Graph returned. externalTenants is an ABSTRACT
    // type: a write must name the derived one, and a GET does not always
    // include it. PATCHing back what was read therefore fails with a bare
    // 400 BadRequest — which is what CA400 did on save (Mihai, 25464), a
    // policy nobody had mistyped. guestClause() states the type every time
    // and drops any annotation a read added.
    //
    // An enumerated clause STAYS enumerated even with no members: falling
    // back to "all" would silently widen a policy from three named partner
    // tenants to every tenant on earth, which is a worse outcome than the
    // rejection it would be papering over.
    if (u.includeGuests && u.includeGuests.guestOrExternalUserTypes) users.includeGuestsOrExternalUsers = guestClause(u.includeGuests);
    if (u.excludeGuests && u.excludeGuests.guestOrExternalUserTypes) users.excludeGuestsOrExternalUsers = guestClause(u.excludeGuests);
    const apps = { includeApplications: [], excludeApplications: [], includeUserActions: [], includeAuthenticationContextClassReferences: [] };
    if (a.target === "actions") apps.includeUserActions = uniq(a.userActions);
    else if (a.target === "contexts") apps.includeAuthenticationContextClassReferences = uniq(a.authContexts);
    else { apps.includeApplications = a.target === "all" ? ["All"] : uniq(a.includeApplications); apps.excludeApplications = uniq(a.excludeApplications); }
    if (a.filter && a.filter.rule) apps.applicationFilter = { mode: a.filter.mode || "include", rule: a.filter.rule };
    const conditions = {
      users, applications: apps,
      // every type ticked is what the portal stores as ["all"]; writing the four
      // names instead would make a no-op edit read as a change in the diff
      clientAppTypes: !c.clientApps.length || CLIENT_APPS.every((x) => c.clientApps.includes(x[0])) ? ["all"] : uniq(c.clientApps),
      signInRiskLevels: uniq(c.signInRisk), userRiskLevels: uniq(c.userRisk),
    };
    if (c.insiderRisk.length) conditions.insiderRiskLevels = uniq(c.insiderRisk).join(",");
    if (c.platforms.mode === "selected" && c.platforms.include.length) conditions.platforms = { includePlatforms: uniq(c.platforms.include), excludePlatforms: uniq(c.platforms.exclude) };
    if (c.locations.mode !== "any" || c.locations.excludeTrusted || c.locations.exclude.length) {
      conditions.locations = {
        includeLocations: c.locations.mode === "selected" && c.locations.include.length ? uniq(c.locations.include) : c.locations.mode === "trusted" ? ["AllTrusted"] : ["All"],
        excludeLocations: uniq([...(c.locations.excludeTrusted ? ["AllTrusted"] : []), ...c.locations.exclude]),
      };
    }
    if (c.deviceFilter && c.deviceFilter.rule) conditions.devices = { deviceFilter: { mode: c.deviceFilter.mode || "exclude", rule: c.deviceFilter.rule } };
    if (c.authFlows.length) conditions.authenticationFlows = { transferMethods: uniq(c.authFlows).join(",") };

    let grantControls = null;
    if (g.mode === "block") grantControls = { operator: "OR", builtInControls: ["block"] };
    else if (g.controls.length || g.strength || g.termsOfUse.length) {
      grantControls = { operator: g.operator === "AND" ? "AND" : "OR", builtInControls: uniq(g.controls), customAuthenticationFactors: [], termsOfUse: uniq(g.termsOfUse) };
      if (g.strength) grantControls.authenticationStrength = { id: g.strength };
    }
    let sessionControls = null;
    if (sessionCount(d)) {
      sessionControls = {};
      if (s.sif) sessionControls.signInFrequency = s.sif.everyTime
        ? { isEnabled: true, frequencyInterval: "everyTime", authenticationType: s.sif.authenticationType || "primaryAndSecondaryAuthentication" }
        : { isEnabled: true, frequencyInterval: "timeBased", type: s.sif.type || "hours", value: +s.sif.value || 1, authenticationType: s.sif.authenticationType || "primaryAndSecondaryAuthentication" };
      if (s.persistent) sessionControls.persistentBrowser = { isEnabled: true, mode: s.persistent };
      if (s.appEnforced) sessionControls.applicationEnforcedRestrictions = { isEnabled: true };
      if (s.cae) sessionControls.continuousAccessEvaluation = { mode: s.cae };
      if (s.tokenProtection) sessionControls.secureSignInSession = { isEnabled: true };
      if (s.mdca) sessionControls.cloudAppSecurity = { isEnabled: true, cloudAppSecurityType: s.mdca };
      if (s.resilience) sessionControls.disableResilienceDefaults = true;
    }
    return { displayName: nameOf(d, cat), state: d.state, conditions, grantControls, sessionControls };
  }

  // ---- Graph body → draft (a policy selected elsewhere) --------------------
  function fromRaw(raw, cat) {
    const d = blank();
    const c = raw.conditions || {}, u = c.users || {}, a = c.applications || {}, g = raw.grantControls || {}, s = raw.sessionControls || {};
    d.sourceId = raw.id || null; d.sourceName = raw.displayName || ""; d.sourceState = raw.state || null;
    const n = caNum(raw.displayName);
    const p = n == null ? null : personas(cat).find((x) => n >= x.lo && n <= x.hi);
    d.persona = p ? p.key : "internals"; d.number = n;
    const m = /^(\((?:NEW|UP)\)\s*)?CA\d+-(?:GRANT|BLOCK|SESSION)-[^-]+-(.*?)-v(\d+(?:\.\d+)*)\s*$/i.exec(raw.displayName || "");
    // a staging prefix — (NEW), (UP) — stays on an edit: dropping it would
    // rename the policy in what looks like a no-op save
    if (m) { d.prefix = m[1] || ""; d.words = m[2]; d.version = m[3]; } else d.customName = raw.displayName || "";
    d.users = {
      includeAll: (u.includeUsers || []).includes("All"),
      includeUsers: (u.includeUsers || []).filter((x) => x !== "All" && x !== "None" && x !== "GuestsOrExternalUsers"), excludeUsers: (u.excludeUsers || []).filter((x) => x !== "GuestsOrExternalUsers"),
      includeGroups: u.includeGroups || [], excludeGroups: u.excludeGroups || [], includeRoles: u.includeRoles || [], excludeRoles: u.excludeRoles || [],
      includeGuests: u.includeGuestsOrExternalUsers || null, excludeGuests: u.excludeGuestsOrExternalUsers || null,
    };
    const ua = a.includeUserActions || [], ac = a.includeAuthenticationContextClassReferences || [];
    d.apps = ua.length ? { ...d.apps, target: "actions", userActions: ua }
      : ac.length ? { ...d.apps, target: "contexts", authContexts: ac }
      : { ...d.apps, target: (a.includeApplications || []).includes("All") ? "all" : "selected", includeApplications: (a.includeApplications || []).filter((x) => x !== "All" && x !== "None"), excludeApplications: a.excludeApplications || [] };
    if (a.applicationFilter && a.applicationFilter.rule) d.apps.filter = { mode: a.applicationFilter.mode || "include", rule: a.applicationFilter.rule };
    const pl = c.platforms || {}, lo = c.locations || {};
    d.cond.platforms = (pl.includePlatforms || []).length && !(pl.includePlatforms || []).includes("all") ? { mode: "selected", include: pl.includePlatforms, exclude: pl.excludePlatforms || [] } : { mode: "any", include: [], exclude: pl.excludePlatforms || [] };
    const inc = lo.includeLocations || [], exc = lo.excludeLocations || [];
    d.cond.locations = { mode: inc.includes("AllTrusted") ? "trusted" : inc.length && !inc.includes("All") ? "selected" : "any", include: inc.filter((x) => x !== "All" && x !== "AllTrusted"), exclude: exc.filter((x) => x !== "AllTrusted"), excludeTrusted: exc.includes("AllTrusted") };
    const cat2 = c.clientAppTypes || [];
    d.cond.clientApps = cat2.includes("all") || !cat2.length ? CLIENT_APPS.map((x) => x[0]) : cat2.slice();
    d.cond.signInRisk = c.signInRiskLevels || []; d.cond.userRisk = c.userRiskLevels || [];
    d.cond.insiderRisk = c.insiderRiskLevels ? String(c.insiderRiskLevels).split(",").map((x) => x.trim()).filter(Boolean) : [];
    d.cond.authFlows = c.authenticationFlows && c.authenticationFlows.transferMethods ? String(c.authenticationFlows.transferMethods).split(",").map((x) => x.trim()).filter((x) => x && x !== "none") : [];
    const df = c.devices && c.devices.deviceFilter; d.cond.deviceFilter = df && df.rule ? { mode: df.mode || "exclude", rule: df.rule } : { mode: "exclude", rule: "" };
    const bic = g.builtInControls || [];
    d.grant = bic.includes("block") ? { mode: "block", controls: [], strength: null, termsOfUse: [], operator: "OR" }
      : { mode: "grant", controls: bic.slice(), strength: g.authenticationStrength ? g.authenticationStrength.id : null, termsOfUse: g.termsOfUse || [], operator: g.operator === "AND" ? "AND" : "OR" };
    if (g.authenticationStrength && g.authenticationStrength.displayName) d.names[g.authenticationStrength.id] = g.authenticationStrength.displayName;
    const sf = s.signInFrequency;
    d.session = {
      sif: sf && sf.isEnabled ? (sf.frequencyInterval === "everyTime" ? { everyTime: true, authenticationType: sf.authenticationType } : { value: sf.value, type: sf.type, authenticationType: sf.authenticationType }) : null,
      persistent: s.persistentBrowser && s.persistentBrowser.isEnabled ? s.persistentBrowser.mode : null,
      appEnforced: !!(s.applicationEnforcedRestrictions && s.applicationEnforcedRestrictions.isEnabled),
      cae: s.continuousAccessEvaluation && s.continuousAccessEvaluation.mode ? s.continuousAccessEvaluation.mode : null,
      tokenProtection: !!(s.secureSignInSession && s.secureSignInSession.isEnabled),
      mdca: s.cloudAppSecurity && s.cloudAppSecurity.isEnabled ? s.cloudAppSecurity.cloudAppSecurityType : null,
      resilience: s.disableResilienceDefaults === true,
    };
    d.state = raw.state || "enabledForReportingButNotEnforced";
    d.createExclusionGroup = false;
    return d;
  }
  // A clone is a new policy: the number is re-issued in the range, the
  // source is remembered for the head line only, the state falls back to
  // report-only. Nothing else moves — that is what a clone is for.
  function cloneOf(raw, raws, cat) {
    const d = fromRaw(raw, cat); d.mode = "clone"; d.sourceId = null; d.prefix = "";
    d.number = nextNumber(d.persona, raws, cat).num; d.state = "enabledForReportingButNotEnforced";
    if (d.customName) d.customName = ""; // the composed name, with the new number
    d.createExclusionGroup = true;
    return d;
  }
  // From a catalog entry: what is structured, plus the entry's own sentences.
  function fromTemplate(entry, groupsByName, cat) {
    const d = blank(); d.mode = "new"; d.template = { num: entry.num, name: entry.name, missing: [], notes: [] };
    const n = caNum(entry.name); d.number = n;
    const p = n == null ? null : personas(cat).find((x) => n >= x.lo && n <= x.hi); if (p) d.persona = p.key;
    const m = /^CA\d+-(GRANT|BLOCK|SESSION)-[^-]+-(.*?)-v(\d+(?:\.\d+)*)\s*$/i.exec(entry.name || "");
    if (m) { d.words = m[2]; d.version = m[3]; if (m[1].toUpperCase() === "BLOCK") d.grant.mode = "block"; }
    const gname = (x) => String(x || "").replace(/\s*\((group|role|user)\)\s*$/i, "");
    const resolve = (list, into) => (list || []).forEach((x) => {
      if (/^All users$/i.test(x)) { d.users.includeAll = true; return; }
      const name = gname(x), id = groupsByName && groupsByName[name.toLowerCase()];
      if (id) { d.users[into].push(id); d.names[id] = name; } else d.template.missing.push(name);
    });
    resolve(entry.include, "includeGroups"); resolve(entry.exclude, "excludeGroups");
    const strip = (t) => String(t || "").replace(/<br\s*\/?>/gi, " · ").replace(/[_*]/g, "").trim();
    if (entry.resources) d.template.notes.push(`Target resources: ${strip(entry.resources)}`);
    if (entry.network) d.template.notes.push(`Network: ${strip(entry.network)}`);
    (entry.conditions || []).forEach((x) => d.template.notes.push(strip(x)));
    if (entry.grant) d.template.notes.push(`Grant: ${strip(entry.grant)}`);
    if (entry.session) d.template.notes.push(`Session: ${strip(entry.session)}`);
    if (/All resources/i.test(entry.resources || "")) d.apps.target = "all";
    else if (/Office 365/i.test(entry.resources || "")) { d.apps.target = "selected"; d.apps.includeApplications = ["Office365"]; }
    if (/multifactor/i.test(entry.grant || "") && !/strength/i.test(entry.grant || "")) d.grant.controls.push("mfa");
    if (/risk remediation|password change/i.test(entry.grant || "")) d.grant.controls.push("passwordChange");
    if (/Require all of/i.test(entry.grant || "")) d.grant.operator = "AND";
    const ur = /User risk: (\w+)/i.exec((entry.conditions || []).join(" ")); if (ur) d.cond.userRisk = RISK.slice(RISK.indexOf(ur[1].toLowerCase())).filter((x, i, a) => i >= 0 && a.indexOf(x) >= 0);
    const sr = /Sign-in risk: (\w+)/i.exec((entry.conditions || []).join(" ")); if (sr) d.cond.signInRisk = RISK.slice(Math.max(0, RISK.indexOf(sr[1].toLowerCase())));
    if (/Sign-in frequency: Every time/i.test(entry.session || "")) d.session.sif = { everyTime: true };
    if (/Client apps: Any client app/i.test((entry.conditions || []).join(" "))) d.cond.clientApps = CLIENT_APPS.map((x) => x[0]);
    return d;
  }

  // ---- validation ----------------------------------------------------------
  // Refusals stop the write; warnings are said and allowed.
  function validate(d) {
    const bad = [], warn = [];
    const u = d.users, a = d.apps, g = d.grant;
    if (!u.includeAll && !u.includeGroups.length && !u.includeUsers.length && !u.includeRoles.length && !(u.includeGuests && u.includeGuests.guestOrExternalUserTypes)) bad.push("Nobody is included — a policy needs at least one user, group, role, guest type, or All users.");
    if (a.target === "selected" && !a.includeApplications.length) bad.push("No target resource is selected — pick apps, or All resources.");
    if (a.target === "actions" && !a.userActions.length) bad.push("No user action is selected.");
    if (a.target === "contexts" && !a.authContexts.length) bad.push("No authentication context is selected.");
    if (g.mode === "grant" && !g.controls.length && !g.strength && !g.termsOfUse.length && !sessionCount(d)) bad.push("Nothing is enforced — choose a grant control, a strength, terms of use, a session control, or Block.");
    // The portal will not let you select both — ticking one greys the other
    // and says so. Nothing here stopped it, and the pair is only refused at
    // the end, by Graph, as a bare 400 naming no field (25464). Refuse it
    // where the choice is made, in Entra's own words.
    if (g.mode === "grant" && g.strength && g.controls.includes("mfa")) {
      bad.push("“Require authentication strength” cannot be used with “Require multifactor authentication” — Entra allows one or the other. The built-in Multifactor authentication strength is the same set of combinations as the control, so pick the strength, or pick the control and set the strength to none.");
    }
    if (g.controls.includes("approvedApplication")) bad.push("“Require approved client app” was retired on 30 June 2026 and Entra refuses to write it — use “Require app protection policy”.");
    if (g.mode === "grant" && (g.controls.length + (g.strength ? 1 : 0) + g.termsOfUse.length) > 1 && !["AND", "OR"].includes(g.operator)) bad.push("With more than one control, choose AND or OR.");
    if (d.number == null && !d.customName) bad.push("The policy has no CA number — pick a persona, or type a name.");
    if (u.includeAll && !u.excludeGroups.length && !u.excludeUsers.length) warn.push("All users with no exclusion at all: the break-glass account is inside this policy.");
    if (g.mode === "block" && sessionCount(d)) warn.push("A block policy with session controls — the session controls never take effect, because nobody gets a session.");
    if (d.cond.clientApps.length === 1 && d.cond.clientApps[0] === "other" && g.mode !== "block") warn.push("A grant policy on legacy clients only: legacy protocols cannot satisfy MFA, so this behaves like a block with a worse sign-in error.");
    if (d.state === "enabled") warn.push("Creating it ON enforces at once, with no report-only evidence — 🎚 Report-only impact will have nothing to show.");
    return { ok: !bad.length, bad, warn };
  }

  // ---- best-practice hints --------------------------------------------------
  // ctx = { raws, names(id), groups: [{id,name}], locations: [{id,displayName,isTrusted}], catalog }
  function hints(d, ctx) {
    const out = [];
    const c = ctx || {}, raws = c.raws || [], name = c.names || ((id) => id);
    const push = (step, level, text) => out.push({ step, level, text });
    // 1 · the number
    if (d.number != null) {
      const holder = raws.find((r) => r.id !== d.sourceId && caNum(r.displayName) === d.number);
      if (holder) push(1, "warn", `CA${String(d.number).padStart(3, "0")} is already held by ${holder.displayName} — the same number under two names is a clash 🧬 Baseline reports.`);
    }
    // 2 · break-glass
    const bg = (c.groups || []).find((g) => BREAK_GLASS_RE.test(g.name || ""));
    if (bg && !d.users.excludeGroups.includes(bg.id) && (d.users.includeAll || d.users.includeGroups.length || d.users.includeRoles.length)) {
      push(2, "warn", `${bg.name} is not excluded. Every baseline policy excludes the break-glass group — a lock-out policy is the one policy you cannot fix from the inside.`);
    }
    if (d.users.includeAll) push(2, "info", "All users reaches guests, service accounts and admins alike. The baseline scopes each persona with its own group so a policy can be judged per persona.");
    // 4 · legacy auth already covered
    if (d.cond.clientApps.includes("other")) {
      const legacy = raws.find((r) => r.id !== d.sourceId && r.state === "enabled" && (r.grantControls?.builtInControls || []).includes("block") && (r.conditions?.clientAppTypes || []).includes("other") && (r.conditions?.users?.includeUsers || []).includes("All"));
      if (legacy) push(4, d.grant.mode === "block" ? "info" : "warn", `Legacy authentication is already blocked tenant-wide by ${legacy.displayName} (On). ${d.grant.mode === "block" ? "This policy would block it a second time." : "Leaving “Other clients” off keeps this policy about modern clients only."}`);
    }
    // 4 · trusted locations
    const locs = c.locations || [];
    if (d.cond.locations.excludeTrusted) {
      const untrusted = locs.filter((l) => l["@odata.type"] === "#microsoft.graph.ipNamedLocation" && !l.isTrusted);
      if (untrusted.length) push(4, "info", `“All trusted locations” covers only locations marked trusted. ${untrusted.slice(0, 3).map((l) => l.displayName).join(", ")} ${untrusted.length === 1 ? "is" : "are"} IP location${untrusted.length === 1 ? "" : "s"} not marked trusted, so a sign-in from there is treated as outside — pick ${untrusted.length === 1 ? "it" : "them"} explicitly, or mark ${untrusted.length === 1 ? "it" : "them"} in the 🌐 Locations tab.`);
    }
    d.cond.locations.include.concat(d.cond.locations.exclude).forEach((id) => {
      const l = locs.find((x) => x.id === id);
      if (l && l["@odata.type"] === "#microsoft.graph.countryNamedLocation" && !(l.countriesAndRegions || []).length) push(4, "warn", `${l.displayName} is a country location with no countries in it — it matches no sign-in at all.`);
    });
    // 5 · the control
    if (d.grant.mode === "grant" && d.grant.controls.includes("mfa") && d.grant.strength) push(5, "info", "MFA and an authentication strength together: the strength already implies MFA. One of the two is enough, and the strength says which methods.");
    if (d.grant.mode === "grant" && d.grant.controls.includes("compliantDevice") && (d.users.includeGuests || d.persona === "guestusers" || d.persona === "externals")) push(5, "warn", "Requiring a compliant device of external users needs inbound device trust with their home tenant (cross-tenant access settings) — without it the policy is a block. 📘 MS Learn checks lists the exact rule.");
    if (d.grant.mode === "grant" && d.grant.strength && (d.persona === "guestusers" || d.persona === "externals" || d.users.includeGuests)) push(5, "warn", "A phishing-resistant or passwordless strength is unsatisfiable for a B2B guest unless inbound MFA trust is on and their home tenant deployed the method. Check 📘 MS Learn checks → guests before enforcing.");
    // 7 · overlap — same persona group(s), same resource, enabled
    const incG = new Set(d.users.includeGroups);
    if (incG.size || d.users.includeAll) {
      const same = raws.filter((r) => {
        if (r.id === d.sourceId || r.state !== "enabled") return false;
        const ru = r.conditions?.users || {}, ra = r.conditions?.applications || {};
        const sameUsers = d.users.includeAll ? (ru.includeUsers || []).includes("All") : (ru.includeGroups || []).some((g) => incG.has(g));
        const sameApps = d.apps.target === "all" ? (ra.includeApplications || []).includes("All") : d.apps.target === "selected" ? (ra.includeApplications || []).some((x) => d.apps.includeApplications.includes(x)) : false;
        return sameUsers && sameApps;
      });
      if (same.length) push(7, "info", `${same.length} enabled polic${same.length === 1 ? "y" : "ies"} already target${same.length === 1 ? "s" : ""} the same people and resources: ${same.slice(0, 3).map((r) => r.displayName).join("; ")}${same.length > 3 ? "; …" : ""}. Both apply to a sign-in — controls add up, they never cancel.`);
    }
    if (d.state === "enabledForReportingButNotEnforced") push(7, "info", "Report-only: nothing changes for anyone yet. Give it a week of traffic, then read it in 🎚 Report-only impact before switching it On.");
    return out;
  }

  // ---- preflight over WhatIfEval --------------------------------------------
  // Synthetic subjects built from the draft itself — a member of what it
  // includes, a member of what it excludes, a B2B guest — evaluated against
  // the draft AND the loaded policies, so the row says what else applies.
  function preflight(d, ctx) {
    if (typeof WhatIfEval === "undefined") return { rows: [], note: "What-If is not loaded." };
    const c = ctx || {}, cat = c.catalog, raws = c.raws || [], locs = c.locations || [];
    const draftRaw = { ...toRaw(d, cat), id: "__draft__", state: d.state === "disabled" ? "enabledForReportingButNotEnforced" : d.state };
    const nameFn = c.names || ((id) => id);
    const names = {}; [...d.users.includeGroups, ...d.users.excludeGroups].forEach((id) => names[id] = nameFn(id));
    const appId = d.apps.target === "selected" && d.apps.includeApplications.length && !APP_GROUPS.some((x) => x[0] === d.apps.includeApplications[0]) ? d.apps.includeApplications[0] : "00000003-0000-0ff1-ce00-000000000000";
    const appName = d.apps.target === "selected" && d.apps.includeApplications.length ? nameFn(d.apps.includeApplications[0]) : "SharePoint Online";
    const platform = d.cond.platforms.mode === "selected" && d.cond.platforms.include.length ? d.cond.platforms.include[0] : "windows";
    const trusted = locs.find((l) => l.isTrusted && l["@odata.type"] === "#microsoft.graph.ipNamedLocation" && (l.ipRanges || []).length);
    const trustedIp = trusted ? String((trusted.ipRanges[0] || {}).cidrAddress || "").split("/")[0] : null;
    // an address inside no named location, so a location condition can be
    // decided rather than reported indeterminate — the first TEST-NET / benchmark
    // address none of the tenant's ranges covers
    const inAny = (ip) => locs.some((l) => (l.ipRanges || []).some((r) => { try { return WhatIfEval.ipInCidr(ip, r.cidrAddress); } catch { return false; } }));
    const outsideIp = ["192.0.2.1", "198.18.0.1", "100.64.0.1", "203.0.113.250"].find((ip) => !inAny(ip)) || null;
    const base = { userId: "u-preflight", isGuest: false, groupIds: new Set(d.users.includeGroups), roleIds: new Set(d.users.includeRoles), names, appId, appName, platform, clientApp: d.cond.clientApps.includes("browser") ? "browser" : (d.cond.clientApps[0] || "browser"), ip: outsideIp, country: null, deviceState: null, signInRisk: d.cond.signInRisk[0] || null, userRisk: d.cond.userRisk[0] || null };
    if (d.users.includeAll) base.groupIds = new Set();
    const who = d.users.includeAll ? "any member" : d.users.includeGroups.length ? `a member of ${nameFn(d.users.includeGroups[0])}` : d.users.includeRoles.length ? `a holder of ${nameFn(d.users.includeRoles[0])}` : "the included user";
    const scenarios = [
      { who, what: `${appName} · ${platform} · ${base.clientApp} · outside any named location`, sc: base },
    ];
    if (trustedIp) scenarios.push({ who, what: `same sign-in, from ${trusted.displayName} (trusted, ${trustedIp})`, sc: { ...base, ip: trustedIp } });
    if (d.users.excludeGroups.length) scenarios.push({ who: `a member of ${nameFn(d.users.excludeGroups[0])} (excluded)`, what: `${appName} · ${platform}`, sc: { ...base, groupIds: new Set([...d.users.includeGroups, d.users.excludeGroups[0]]) } });
    scenarios.push({ who: "a B2B collaboration guest", what: `${appName} · ${platform}`, sc: { ...base, userId: "u-guest", isGuest: true, guestType: "b2bCollaborationGuest", groupIds: new Set() } });
    const rows = scenarios.map((s) => {
      const r = WhatIfEval.evaluate([draftRaw, ...raws.filter((x) => x.id !== d.sourceId)], s.sc, { namedLocations: locs, names: c.names ? Object.fromEntries((raws || []).map((x) => [x.id, x.displayName])) : {} });
      const mine = r.applied.find((x) => x.id === "__draft__");
      const why = r.notApplied.find((x) => x.id === "__draft__");
      const others = r.applied.filter((x) => x.id !== "__draft__").map((x) => x.name);
      const word = (g) => /^block$/i.test(g) ? "Block" : g === "mfa" ? "MFA" : g === "compliantDevice" ? "compliant device" : g === "domainJoinedDevice" ? "hybrid joined device" : g === "compliantApplication" ? "app protection policy" : g === "passwordChange" ? "password change" : g === "approvedApplication" ? "approved client app" : /^authenticationStrength:/.test(g) ? "strength " + g.slice(23) : /^termsOfUse:/.test(g) ? "terms " + g.slice(11) : g;
      const blocks = !!(mine && mine.grant.some((g) => /^block$/i.test(g)));
      return { who: s.who, what: s.what, applies: !!mine, verdict: mine ? (mine.grant.length ? mine.grant.map(word).join(mine.operator === "AND" ? " AND " : " OR ") : (mine.session.length ? "session: " + mine.session.join(", ") : "grant")) : (why ? why.reason : "does not apply"), others, blocks };
    });
    return { rows, complete: true };
  }

  // ---- what the write will do ----------------------------------------------
  function willDo(d, ctx) {
    const cat = ctx && ctx.catalog, ops = [];
    const name = nameOf(d, cat), grp = exclusionGroupName(d, cat);
    const groupExists = ctx && ctx.groups && grp && ctx.groups.some((g) => (g.name || "").toLowerCase() === grp.toLowerCase());
    if (d.mode !== "edit" && d.createExclusionGroup && grp && !groupExists) ops.push({ op: "CREATE", what: `group ${grp}`, sub: "the policy's own exclusion group, excluded from it — empty, from the baseline's group template where one exists" });
    if (d.mode === "edit") ops.push({ op: "PATCH", what: `policy ${d.sourceName || name}`, sub: "whole sections — conditions, grant controls, session controls, name, state — read back after the write" });
    else ops.push({ op: "CREATE", what: `policy ${name}`, sub: (STATES.find((s) => s[0] === d.state) || ["", d.state])[1] + " · read back after the write" });
    ops.push({ op: "OPEN", what: "in 🗂 Policies", sub: d.state === "enabledForReportingButNotEnforced" ? "and in 🎚 Report-only impact once it has traffic" : "" });
    return ops;
  }
  // ---- field-level diff for an edit -------------------------------------------
  // Whole-section shape by design: what a PATCH sends is what the diff shows.
  function diff(before, after) {
    const rows = [];
    const flat = (o, p, into) => {
      if (o === null || o === undefined) { into[p] = o; return; }
      if (Array.isArray(o)) { into[p] = o.slice().sort().join(", ") || "(empty)"; return; }
      if (typeof o === "object") { Object.keys(o).sort().forEach((k) => { if (!/^@odata|^id$|Date/.test(k)) flat(o[k], p ? p + "." + k : k, into); }); return; }
      into[p] = String(o);
    };
    const A = {}, B = {}; flat(before || {}, "", A); flat(after || {}, "", B);
    uniq([...Object.keys(A), ...Object.keys(B)]).sort().forEach((k) => { const a = A[k], b = B[k]; if (String(a ?? "—") !== String(b ?? "—")) rows.push({ path: k, before: a ?? "—", after: b ?? "—" }); });
    return rows;
  }
  // The PATCH body for an edit: whole sections, only the ones that changed.
  function patchBody(before, d, cat) {
    const after = toRaw(d, cat), body = {};
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (after.displayName !== before.displayName) body.displayName = after.displayName;
    if (after.state !== before.state) body.state = after.state;
    if (!same(canon(after.conditions), canon(before.conditions))) body.conditions = after.conditions;
    if (!same(canon(after.grantControls), canon(before.grantControls))) {
      body.grantControls = after.grantControls;
      // TAKING AN AUTHENTICATION STRENGTH OFF NEEDS AN EXPLICIT NULL.
      // toRaw simply omits the key when no strength is chosen, and a PATCH
      // that omits it LEAVES THE STRENGTH IN PLACE. The policy is then asked
      // to hold a strength AND Require multifactor authentication at once —
      // a combination Entra refuses outright ("You can't use the Require
      // multifactor authentication and Require authentication strength grant
      // controls together in the same Conditional Access policy") — so the
      // write comes back 400 BadRequest with nothing to say which field was
      // wrong. Mihai hit it on CA400 (25464) doing exactly the swap the
      // 25459 check recommends: No strength, tick Require multifactor
      // authentication, Save.
      if (body.grantControls && !body.grantControls.authenticationStrength
        && before.grantControls && before.grantControls.authenticationStrength) {
        body.grantControls.authenticationStrength = null;
      }
    }
    if (!same(canon(after.sessionControls), canon(before.sessionControls))) body.sessionControls = after.sessionControls;
    return body;
  }
  // order-insensitive, annotation-free view of a section, for comparing
  function canon(o) {
    if (o === null || o === undefined) return null;
    if (Array.isArray(o)) return o.map(canon).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (typeof o === "object") {
      const ref = "id" in o; // a reference (an authentication strength) — Graph decorates it on a read; only the id is written
      const out = {};
      Object.keys(o).sort().forEach((k) => {
        if (/^@odata/.test(k) || /^(createdDateTime|modifiedDateTime|policyType|requirementsSatisfied|allowedCombinations|combinationConfigurations)$/.test(k) || (ref && /^(displayName|description)$/.test(k))) return;
        const v = canon(o[k]); if (v === null || (Array.isArray(v) && !v.length)) return; out[k] = v;
      });
      return out;
    }
    return o;
  }

  // ---- HTML ---------------------------------------------------------------------
  const chip = (t, cls) => `<span class="tag${cls ? " " + cls : ""}">${esc(t)}</span>`;
  function summary(d, step, ctx) {
    const cat = ctx && ctx.catalog, name = (ctx && ctx.names) || ((id) => id), p = personaOf(d.persona, cat);
    const list = (ids, kind) => ids.map((id) => esc(name(id)) + (kind ? ` (${kind})` : "")).join(", ");
    switch (step) {
      case 1: return `${d.number == null ? "no number yet" : "CA" + String(d.number).padStart(3, "0")} · ${kindOf(d)} · ${p ? esc(p.label) : "—"} · v${esc(d.version)}${d.customName ? " · custom name" : ""}`;
      case 2: {
        const inc = d.users.includeAll ? "All users" : [list(d.users.includeGroups, "group"), list(d.users.includeUsers, "user"), list(d.users.includeRoles, "role"), d.users.includeGuests ? "guests & external: " + esc(d.users.includeGuests.guestOrExternalUserTypes) : ""].filter(Boolean).join(", ") || "nobody";
        const exc = [list(d.users.excludeGroups, "group"), list(d.users.excludeUsers, "user"), list(d.users.excludeRoles, "role"), d.users.excludeGuests ? "guests & external: " + esc(d.users.excludeGuests.guestOrExternalUserTypes) : ""].filter(Boolean).join(", ");
        return `Include ${inc}${exc ? " · Exclude " + exc : ""}${d.mode !== "edit" && d.createExclusionGroup && exclusionGroupName(d, cat) ? ` · ${esc(exclusionGroupName(d, cat))} (will be created)` : ""}`;
      }
      case 3: return d.apps.target === "all" ? `All resources${d.apps.excludeApplications.length ? " · excluding " + list(d.apps.excludeApplications) : ""}` : d.apps.target === "actions" ? "User actions: " + d.apps.userActions.map((u) => (USER_ACTIONS.find((x) => x[0] === u) || [u, u])[1]).join(", ") : d.apps.target === "contexts" ? "Authentication contexts: " + list(d.apps.authContexts) : (d.apps.includeApplications.map((id) => esc((APP_GROUPS.find((x) => x[0] === id) || [id, name(id)])[1])).join(", ") || "no resource yet") + (d.apps.excludeApplications.length ? " · excluding " + list(d.apps.excludeApplications) : "");
      case 4: {
        const c = d.cond, parts = [];
        parts.push(c.platforms.mode === "selected" && c.platforms.include.length ? c.platforms.include.map((x) => (PLATFORMS.find((y) => y[0] === x) || [x, x])[1]).join(", ") : "any platform");
        parts.push(c.locations.mode === "trusted" ? "trusted locations only" : c.locations.mode === "selected" ? "from " + list(c.locations.include) : "any location");
        if (c.locations.excludeTrusted) parts.push("outside trusted locations");
        if (c.locations.exclude.length) parts.push("not from " + list(c.locations.exclude));
        parts.push(c.clientApps.length === CLIENT_APPS.length ? "any client app" : c.clientApps.map((x) => (CLIENT_APPS.find((y) => y[0] === x) || [x, x])[1].replace(/ \(.*\)/, "")).join(" + "));
        if (c.signInRisk.length) parts.push("sign-in risk " + c.signInRisk.join("/")); if (c.userRisk.length) parts.push("user risk " + c.userRisk.join("/")); if (c.insiderRisk.length) parts.push("insider risk " + c.insiderRisk.join("/"));
        if (c.authFlows.length) parts.push(c.authFlows.map((f) => (FLOWS.find((x) => x[0] === f) || [f, f])[1]).join(", ")); if (c.deviceFilter.rule) parts.push(`device filter (${c.deviceFilter.mode})`);
        return parts.join(" · ");
      }
      case 5: {
        if (d.grant.mode === "block") return "Block access";
        const g = d.grant, ctl = [...g.controls.map((x) => (GRANTS.find((y) => y[0] === x) || [x, x])[1].replace(/^Require /, "")), g.strength ? "strength " + esc(name(g.strength)) : "", g.termsOfUse.length ? "terms of use: " + list(g.termsOfUse) : ""].filter(Boolean);
        return ctl.length ? "Grant · require " + ctl.join(ctl.length > 1 ? ` ${g.operator} ` : "") : (sessionCount(d) ? "Grant · session controls only" : "Grant · no control yet");
      }
      case 6: {
        const s = d.session, parts = [];
        if (s.sif) parts.push("sign-in frequency " + (s.sif.everyTime ? "every time" : `${s.sif.value} ${s.sif.type}`)); if (s.persistent) parts.push("persistent browser " + s.persistent); if (s.appEnforced) parts.push("app-enforced restrictions");
        if (s.cae) parts.push("CAE " + s.cae); if (s.tokenProtection) parts.push("token protection"); if (s.mdca) parts.push("Defender for Cloud Apps " + s.mdca); if (s.resilience) parts.push("resilience defaults off");
        return parts.join(" · ") || "nothing set — sign-in frequency, persistent browser, CAE, token protection";
      }
      case 7: {
        const st = (STATES.find((s) => s[0] === d.state) || ["", d.state])[1];
        if (d.mode === "edit") return `${st} · Save writes the changed sections of this policy — nothing until then`;
        return `${st}${d.state === "enabled" ? " · needs a typed ON" : d.state === "enabledForReportingButNotEnforced" ? " (default)" : ""}`;
      }
    }
    return "";
  }
  const STEPS = [[1, "Name & persona"], [2, "Who"], [3, "What"], [4, "When — conditions"], [5, "Then — grant or block"], [6, "Session"], [7, "State & go"]];
  function stepsHtml(d, active, ctx, formHtml) {
    const edit = d.mode === "edit";
    return STEPS.map(([n, label]) => {
      if (edit && n === 7) label = "State & save";
      if (edit && n === 1) label = "Name";
      // an edit starts with every step filled in from the policy, so nothing
      // is "to do" — only the open step is highlighted
      const cls = n === active ? "now" : (edit || n < active) ? "done" : "todo";
      const h = (ctx && ctx.hints || []).filter((x) => x.step === n && x.level === "warn").length;
      return `<button class="ld-row pb-step ${cls}" type="button" data-pbstep="${n}" aria-pressed="${n === active}"><strong><span class="pb-n">${cls === "done" ? "✓" : n}</span>${n} · ${esc(label)}${h ? ` <span class="sev medium pb-hn" title="${h} thing${h === 1 ? "" : "s"} worth reading in this step">${h}</span>` : ""}</strong><span class="mini muted">${summary(d, n, ctx)}</span></button>`
        + (n === active ? `<div class="list-card pb-form" data-pbform="${n}">${formHtml || ""}</div>` : "");
    }).join("");
  }
  function hintsHtml(hs) {
    return (hs || []).map((h) => `<div class="pb-hint ${h.level}">${h.level === "warn" ? "⚠" : "💡"} <span>${esc(h.text)}</span></div>`).join("");
  }
  function preflightHtml(pf) {
    if (!pf || !pf.rows.length) return `<p class="mini muted">${esc(pf && pf.note || "Nothing to evaluate yet — include somebody first.")}</p>`;
    return `<div class="pb-pf">${pf.rows.map((r) => `<div class="pb-pf-row"><span><b>${esc(r.who)}</b> <span class="who">${esc(r.what)}</span></span><span class="v ${r.applies ? (r.blocks ? "wi-w" : "wi-g") : "muted"}">${r.applies ? "applies — " + esc(r.verdict) : esc(r.verdict)}</span>${r.others.length ? `<span class="mini muted pb-others">also: ${esc(r.others.slice(0, 4).join("; "))}${r.others.length > 4 ? "; …" : ""}</span>` : ""}</div>`).join("")}</div>`;
  }
  function willHtml(ops) {
    return `<div class="pb-will">${ops.map((o) => `<div class="ml-apply-row"><span class="ml-op ${o.op === "CREATE" ? "create" : o.op === "DELETE" ? "delete" : ""}">${esc(o.op)}</span> ${esc(o.what)}${o.sub ? ` <span class="mini">· ${esc(o.sub)}</span>` : ""}</div>`).join("")}</div>`;
  }
  function diffHtml(rows) {
    if (!rows.length) return `<p class="mini muted">No difference from the policy as it is in the tenant.</p>`;
    return `<table class="pb-diff"><thead><tr><th>Setting</th><th>In the tenant</th><th>Draft</th></tr></thead><tbody>${rows.map((r) => `<tr><td><code>${esc(r.path)}</code></td><td>${esc(r.before)}</td><td><b>${esc(r.after)}</b></td></tr>`).join("")}</tbody></table>`;
  }

  return { PERSONAS, PLATFORMS, CLIENT_APPS, RISK, INSIDER, FLOWS, USER_ACTIONS, GRANTS, APP_GROUPS, ROLES, STATES, STEPS, KINDS, BREAK_GLASS_RE,
    personas, personaOf, caNum, nextNumber, blank, kindOf, sessionCount, suggestWords, nameOf, exclusionGroupName,
    toRaw, fromRaw, guestClause, cloneOf, fromTemplate, validate, hints, preflight, willDo, diff, patchBody, canon,
    summary, stepsHtml, hintsHtml, preflightHtml, willHtml, diffHtml };
})();
