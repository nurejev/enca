// Product requirements are separate from consent, operator roles and source setup.
// SKU evidence establishes tenant products, not licensing compliance for each person.
const Capabilities = (() => {
  const labels = { p1: "Entra ID P1", p2: "Entra ID P2", workload: "Workload Identities Premium",
    intune: "Microsoft Intune", cloudApps: "Defender for Cloud Apps", governance: "Entra ID Governance", purview: "Purview Adaptive Protection" };
  const P1 = "41781fb2-bc02-4b7c-bd55-b576c07bb09d", P2 = "eec0eb4f-6444-4f95-aba0-50c24d67f998";
  function fromSkus(skus) {
    if (!Array.isArray(skus)) return Object.fromEntries(Object.keys(labels).map(k => [k, null]));
    const live = skus.filter(s => !["Suspended", "Deleted", "LockedOut"].includes(s.capabilityStatus));
    const plans = live.flatMap(s => (s.servicePlans || []).filter(p => !p.provisioningStatus || p.provisioningStatus === "Success"));
    const named = re => plans.some(p => re.test(p.servicePlanName || ""));
    const p2 = plans.some(p => p.servicePlanId === P2);
    return { p1: p2 || plans.some(p => p.servicePlanId === P1), p2,
      intune: named(/^INTUNE/),
      workload: live.some(s => /workload[ _-]?id/i.test(s.skuPartNumber || "")) || named(/workload[ _-]?id/i),
      // These products can be bought through several channels. No positive SKU
      // match is unknown, not proof that the product is unlicensed/unconfigured.
      cloudApps: named(/ADALLOM|MCAS|DEFENDER.*CLOUD.*APP/i) || null,
      governance: named(/ENTRA.*GOVERNANCE|AAD.*GOVERNANCE/i) || null,
      // 25491: no service plan is NAMED Adaptive Protection — it is part of
      // Insider Risk Management (Microsoft 365 E5, E5 Compliance, E5 Insider
      // Risk Management), whose plans are INSIDER_RISK and
      // INSIDER_RISK_MANAGEMENT. Matching only /ADAPTIVE.*PROTECTION/ left
      // this unknown in every tenant, so every write to a policy with an
      // insider-risk condition stopped with "could not be verified".
      purview: named(/INSIDER_RISK|ADAPTIVE.*PROTECTION/i) || null };
  }
  function requirements(raw) {
    const p = raw || {}, c = p.conditions || {}, grants = p.grantControls || {}, sessions = p.sessionControls || {};
    const need = new Set(c.clientApplications?.includeServicePrincipals?.length ? ["workload"] : ["p1"]);
    if (c.userRiskLevels?.length || c.signInRiskLevels?.length || grants.builtInControls?.includes("passwordChange")) need.add("p2");
    if (c.insiderRiskLevels?.length) need.add("purview");
    if (sessions.cloudAppSecurity?.isEnabled) need.add("cloudApps");
    if (grants.builtInControls?.includes("compliantApplication")) need.add("intune");
    return [...need];
  }
  // `already`: requirements the policy carried BEFORE this write (a PATCH).
  // Entra accepted those when the policy was made, so an edit that keeps them
  // — an exclusion added, a name changed — is not blocked on evidence this
  // tool cannot read; only a requirement the write ADDS must be proven.
  function check(raw, evidence, already) {
    const had = new Set(already || []);
    const required = requirements(raw);
    const missing = required.filter(k => !had.has(k) && evidence?.[k] !== true);
    return { ok: !missing.length, required, missing, reason: missing.map(k => `${labels[k]} ${evidence?.[k] === false ? "not present in active subscriptions" : "could not be verified"}`).join("; ") };
  }
  function plan(raws, evidence, existingCount) {
    const rows = raws.map(raw => ({ id: raw.id, name: raw.displayName, ...check(raw, evidence) }));
    const free = Number.isInteger(existingCount) ? Math.max(0, 240 - existingCount) : null;
    return { rows, free, ok: rows.every(r => r.ok) && free != null && raws.length <= free,
      capacity: free == null ? "Policy capacity could not be read" : raws.length > free ? `${raws.length} new policies need staging space; only ${free} of 240 slots are free. Existing policies are retained during replacement.` : "" };
  }
  function errorState(e) {
    const status = e?.status || Number(/\((\d{3})\)/.exec(e?.message || "")?.[1]);
    return status === 401 || status === 403 ? "permission-required" : status === 404 ? "unsupported-or-not-found" : "read-failed";
  }
  // Every permanent tool ID has a baseline and its independently optional sources.
  const tools = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, { core: "p1", optional: [] }]));
  for (const id of [3, 7, 8, 10, 11, 21, 31, 36, 37, 40]) tools[id].optional.push("p2");
  for (const id of [17, 18, 26, 36, 37]) tools[id].optional.push("hunting");
  tools[19].optional = ["intune", "governance", "azure", "m365"];
  tools[12].optional = ["pim"]; tools[27].optional = ["pim"]; tools[34].optional = ["governance"];
  tools[30] = { core: "intune", optional: [] }; tools[38].optional = ["cloudApps"];
  const endpoints = [
    { path: "/users", version: "v1.0", product: "p1", scope: "User.Read.All", paging: true },
    { path: "/groups", version: "v1.0", product: "p1", scope: "GroupMember.Read.All", paging: true },
    { path: "/subscribedSkus", version: "v1.0", product: "p1", scope: "LicenseAssignment.Read.All", paging: true },
    { path: "/auditLogs/signIns", version: "v1.0", product: "p1", scope: "AuditLog.Read.All", paging: true },
    { path: "/auditLogs/signIns (nonInteractiveUser)", version: "beta", product: "p1", scope: "AuditLog.Read.All", paging: true },
    { path: "/identityProtection/riskyUsers", version: "v1.0", product: "p2", scope: "IdentityRiskyUser.Read.All", paging: true },
    { path: "/identity/conditionalAccess/policies", version: "beta", product: "policy-specific", scope: "Policy.Read.All", paging: true },
    { path: "/deviceManagement", version: "endpoint-specific", product: "intune", scope: "DeviceManagementConfiguration.Read.All", paging: true },
    { path: "/security/runHuntingQuery", version: "v1.0", product: "table-specific", scope: "ThreatHunting.Read.All", paging: false },
    { path: "/auditLogs/signInEventsAppSummary", version: "beta", product: "p1-pending-contract-test", scope: "AuditLog.Read.All", paging: true }
  ];
  return { labels, fromSkus, requirements, check, plan, errorState, tools, endpoints };
})();
