// ======================================================================
// Model: transform a raw Graph conditionalAccessPolicy into a view model.
// resolve(id, fallbackMap) -> display name
// ======================================================================
function buildViewModel(raw, resolve, index) {
  const c = raw.conditions || {};
  const L = LABELS;
  const name = (id, map) => resolve(id, map);

  // ---- users ----
  const u = c.users || {};
  const usersInc = [
    ...(u.includeUsers || []).map(id => name(id, L.users)),
    ...(u.includeGroups || []).map(id => name(id) + " (group)"),
    ...(u.includeRoles || []).map(id => name(id) + " (role)"),
  ];
  if (u.includeGuestsOrExternalUsers) {
    const g = u.includeGuestsOrExternalUsers;
    const types = (g.guestOrExternalUserTypes || "").split(",").map(t => L.guestTypes[t.trim()] || t.trim()).filter(Boolean);
    usersInc.push("Guests/external: " + (types.join(", ") || "all types"));
  }
  const usersExc = [
    ...(u.excludeUsers || []).map(id => name(id, L.users)),
    ...(u.excludeGroups || []).map(id => name(id) + " (group)"),
    ...(u.excludeRoles || []).map(id => name(id) + " (role)"),
  ];
  if (u.excludeGuestsOrExternalUsers) usersExc.push("Guests & external users");

  // ---- workload identities / agents ----
  const ca = c.clientApplications || {};
  const spLabel = (id) => {
    if (/agent/i.test(id)) return name(id, L.servicePrincipals) + " (agent)";
    return name(id, L.servicePrincipals) + " (workload identity)";
  };
  const spInc = (ca.includeServicePrincipals || []).map(spLabel);
  const spExc = (ca.excludeServicePrincipals || []).map(spLabel);
  if (spInc.length) usersInc.push(...spInc);
  if (spExc.length) usersExc.push(...spExc);
  if (ca.servicePrincipalFilter?.rule) {
    usersInc.push(`Service principal/agent filter (${ca.servicePrincipalFilter.mode}): ${ca.servicePrincipalFilter.rule}`);
  }

  // catch-all: surface targeting properties this app doesn't know yet (e.g. new
  // agent-identity settings) instead of silently showing "None"
  const KNOWN_USERS = ["includeUsers", "excludeUsers", "includeGroups", "excludeGroups", "includeRoles", "excludeRoles", "includeGuestsOrExternalUsers", "excludeGuestsOrExternalUsers"];
  const KNOWN_CLIENTAPPS = ["includeServicePrincipals", "excludeServicePrincipals", "servicePrincipalFilter"];
  const extraTargeting = [];
  const addExtra = (obj, known) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (known.includes(k) || k.includes("@odata") || v == null) continue;
      if (Array.isArray(v) && !v.length) continue;
      extraTargeting.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  };
  addExtra(u, KNOWN_USERS);
  addExtra(ca, KNOWN_CLIENTAPPS);
  usersInc.push(...extraTargeting);
  // unknown top-level conditions (e.g. agent risk levels) → shown under Conditions
  const KNOWN_CONDITIONS = ["users", "applications", "clientApplications", "platforms", "locations", "devices", "clientAppTypes", "signInRiskLevels", "userRiskLevels", "servicePrincipalRiskLevels", "insiderRiskLevels", "authenticationFlows", "deviceStates", "times", "signInRiskDetections"];
  const extraConditions = [];
  for (const [k, v] of Object.entries(c)) {
    if (KNOWN_CONDITIONS.includes(k) || k.includes("@odata") || v == null) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === "string" && (v === "none" || v === "")) continue;
    extraConditions.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
  // a lone "None" from includeUsers is noise when agents/SPs are targeted
  if (usersInc.length > 1) { const ni = usersInc.indexOf("None"); if (ni > -1) usersInc.splice(ni, 1); }

  // ---- target resources ----
  const a = c.applications || {};
  const appsInc = [
    ...(a.includeApplications || []).map(id => name(id, L.apps)),
    ...(a.includeUserActions || []).map(x => L.userActions[x] || x),
    ...(a.includeAuthenticationContextClassReferences || []).map(id => "Auth context: " + name(id)),
  ];
  const appsExc = (a.excludeApplications || []).map(id => name(id, L.apps));
  const appFilter = a.applicationFilter ? { mode: a.applicationFilter.mode, rule: a.applicationFilter.rule } : null;

  // ---- network ----
  const loc = c.locations || {};
  const netInc = (loc.includeLocations || []).map(id => name(id, L.locations));
  const netExc = (loc.excludeLocations || []).map(id => name(id, L.locations));

  // ---- conditions ----
  const risks = [];
  if ((c.userRiskLevels || []).length) risks.push("User risk: " + c.userRiskLevels.map(r => L.risk[r] || r).join(", "));
  if ((c.signInRiskLevels || []).length) risks.push("Sign-in risk: " + c.signInRiskLevels.map(r => L.risk[r] || r).join(", "));
  if ((c.servicePrincipalRiskLevels || []).length) risks.push("Service principal risk: " + c.servicePrincipalRiskLevels.map(r => L.risk[r] || r).join(", "));
  risks.push(...extraConditions);

  const insider = (c.insiderRiskLevels && c.insiderRiskLevels !== "none")
    ? String(c.insiderRiskLevels).split(",").map(r => L.insiderRisk[r.trim()] || r.trim()) : [];

  const authFlows = (c.authenticationFlows?.transferMethods && c.authenticationFlows.transferMethods !== "none")
    ? c.authenticationFlows.transferMethods.split(",").map(m => L.authFlows[m.trim()] || m.trim()) : [];

  const plat = c.platforms || {};
  const platforms = (plat.includePlatforms || []).map(p => L.platforms[p] || p);
  const platformsExc = (plat.excludePlatforms || []).map(p => L.platforms[p] || p);
  const clientApps = (c.clientAppTypes || []).map(t => L.clientAppTypes[t] || t);
  const devFilter = c.devices?.deviceFilter ? { mode: c.devices.deviceFilter.mode, rule: c.devices.deviceFilter.rule } : null;

  // ---- grant ----
  const g = raw.grantControls || {};
  const grantControls = (g.builtInControls || []).map(x => L.grantControls[x] || x);
  if (g.authenticationStrength) grantControls.push("Authentication strength: " + (g.authenticationStrength.displayName || name(g.authenticationStrength.id)));
  (g.termsOfUse || []).forEach(id => grantControls.push("Terms of use: " + name(id)));
  (g.customAuthenticationFactors || []).forEach(x => grantControls.push("Custom control: " + x));
  const isBlock = (g.builtInControls || []).includes("block");

  // ---- session ----
  const s = raw.sessionControls || {};
  const session = [];
  if (s.applicationEnforcedRestrictions?.isEnabled) session.push({ t: "Use app enforced restrictions" });
  if (s.cloudAppSecurity?.isEnabled) session.push({ t: "Conditional Access App Control: " + (LABELS.cloudAppSecurity[s.cloudAppSecurity.cloudAppSecurityType] || s.cloudAppSecurity.cloudAppSecurityType) });
  if (s.signInFrequency?.isEnabled) {
    session.push({ t: s.signInFrequency.frequencyInterval === "everyTime"
      ? "Sign-in frequency: Every time"
      : `Sign-in frequency: ${s.signInFrequency.value} ${LABELS.signInFrequencyType[s.signInFrequency.type] || s.signInFrequency.type}` });
  }
  if (s.persistentBrowser?.isEnabled) session.push({ t: "Persistent browser session: " + (LABELS.persistentBrowser[s.persistentBrowser.mode] || s.persistentBrowser.mode) });
  if (s.continuousAccessEvaluation?.mode) session.push({ t: "Continuous access evaluation: " + s.continuousAccessEvaluation.mode });
  if (s.disableResilienceDefaults) session.push({ t: "Resilience defaults: disabled" });
  if (s.secureSignInSession?.isEnabled) session.push({ t: "Token protection", isNew: true });
  if (s.globalSecureAccessFilteringProfile?.isEnabled) session.push({ t: "Global Secure Access security profile", isNew: true });

  // dependency references (clickable in the detail card to inspect their settings)
  const deps = [];
  const addDep = (type, id, label) => { if (id && !deps.some(d => d.type === type && d.id === id)) deps.push({ type, id, label }); };
  if (g.authenticationStrength) addDep("authStrength", g.authenticationStrength.id, g.authenticationStrength.displayName || name(g.authenticationStrength.id));
  (g.termsOfUse || []).forEach(id => addDep("termsOfUse", id, name(id)));
  [...(loc.includeLocations || []), ...(loc.excludeLocations || [])]
    .filter(id => id !== "All" && id !== "AllTrusted").forEach(id => addDep("namedLocation", id, name(id, L.locations)));
  (a.includeAuthenticationContextClassReferences || []).forEach(id => addDep("authContext", id, name(id)));
  [...(u.includeGroups || []), ...(u.excludeGroups || [])].forEach(id => addDep("group", id, name(id)));

  const state = LABELS.state[raw.state] || "off";
  const usesNew = !!(authFlows.length || insider.length || session.some(x => x.isNew) || extraTargeting.length || extraConditions.length);

  return {
    id: raw.id,
    seq: "CA" + String(index + 1).padStart(3, "0"),
    name: raw.displayName || "(unnamed policy)",
    state,
    modified: (raw.modifiedDateTime || raw.createdDateTime || "").slice(0, 10) || "—",
    users: { inc: usersInc.length ? usersInc : ["None"], exc: usersExc },
    apps: { inc: appsInc.length ? appsInc : ["None"], exc: appsExc, filter: appFilter },
    net: { inc: netInc.length ? netInc : ["Any network or location"], exc: netExc },
    cond: { platforms, platformsExc, clientApps, risks, devFilter, authFlows, insider },
    grant: { mode: isBlock ? "block" : "grant", controls: grantControls.length ? grantControls : ["No controls (grant)"], op: (g.builtInControls || []).length + (g.authenticationStrength ? 1 : 0) + (g.termsOfUse || []).length > 1 ? g.operator : null },
    session,
    usesNew,
    deps,
    raw,
  };
}
