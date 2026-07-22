// ======================================================================
// What-If — a re-implementation of the Microsoft Entra Conditional Access
// "What If" policy tool:
//   https://learn.microsoft.com/entra/identity/conditional-access/what-if-tool
//
// You describe a sign-in (identity, target resource, device platform, client
// app, and optionally location, device state and risk) and every enabled or
// report-only policy is evaluated against it. The result is two lists:
//   • policies that APPLY  — with the grant and session controls to satisfy
//   • policies that DO NOT — each with the FIRST condition that wasn't met
//
// Matching the current What-If evaluation API: disabled policies are never
// evaluated, and a policy that scopes a condition the scenario doesn't specify
// cannot be evaluated, so it does not apply.
//
// Not covered (same caveat as the Microsoft tool): Conditional Access service
// dependencies — a policy on a downstream service is not pulled in.
// ======================================================================
const WhatIfEval = (() => {
  const RISK = ["none", "low", "medium", "high"];
  const PLATFORMS = ["android", "iOS", "windows", "macOS", "linux", "windowsPhone"];
  const CLIENT_APPS = ["browser", "mobileAppsAndDesktopClients", "exchangeActiveSync", "other"];
  const DEVICE_STATES = ["compliant", "hybrid", "unmanaged"];

  const LABEL = {
    browser: "Browser", mobileAppsAndDesktopClients: "Mobile apps and desktop clients",
    exchangeActiveSync: "Exchange ActiveSync clients", other: "Other clients (legacy)",
    compliant: "Compliant device", hybrid: "Hybrid Entra joined device", unmanaged: "Unmanaged / neither",
    android: "Android", iOS: "iOS", windows: "Windows", macOS: "macOS", linux: "Linux", windowsPhone: "Windows Phone",
  };

  // ---- IPv4 CIDR containment (named-location matching) ----
  const ip4ToInt = (ip) => {
    const p = String(ip).trim().split(".");
    if (p.length !== 4 || p.some((x) => x === "" || isNaN(x) || +x < 0 || +x > 255)) return null;
    return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + (+p[3]);
  };
  function ipInCidr(ip, cidr) {
    const [net, bitsRaw] = String(cidr).split("/");
    const a = ip4ToInt(ip), b = ip4ToInt(net);
    if (a == null || b == null) return false;           // IPv6 not evaluated
    const bits = bitsRaw == null ? 32 : parseInt(bitsRaw, 10);
    if (isNaN(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((a & mask) >>> 0) === ((b & mask) >>> 0);
  }

  // Does the scenario's IP / country fall inside this named location?
  function matchesLocation(loc, sc) {
    if (!loc) return false;
    const t = (loc["@odata.type"] || "").toLowerCase();
    if (t.includes("country")) {
      if (!sc.country) return false;
      return (loc.countriesAndRegions || []).some((c) => String(c).toUpperCase() === String(sc.country).toUpperCase());
    }
    if (!sc.ip) return false;
    return (loc.ipRanges || []).some((r) => r.cidrAddress && ipInCidr(sc.ip, r.cidrAddress));
  }
  // Which named locations does this sign-in sit in?
  function locationsFor(sc, namedLocations) {
    const hits = (namedLocations || []).filter((l) => matchesLocation(l, sc));
    return { ids: new Set(hits.map((l) => l.id)), trusted: hits.some((l) => l.isTrusted), hits };
  }

  // Best-effort read of a device filter rule for the common cases the portal
  // generates. Anything else is reported as not evaluatable.
  function deviceFilterVerdict(rule, sc) {
    const r = String(rule || "").toLowerCase();
    if (!r) return { known: true, match: false };
    if (!sc.deviceState) return { known: false };
    const compliant = sc.deviceState === "compliant";
    const hybrid = sc.deviceState === "hybrid";
    if (/device\.iscompliant\s*-eq\s*true/.test(r)) return { known: true, match: compliant };
    if (/device\.iscompliant\s*-ne\s*true/.test(r)) return { known: true, match: !compliant };
    if (/device\.trusttype\s*-eq\s*"?serverad"?/.test(r)) return { known: true, match: hybrid };
    if (/device\.trusttype\s*-ne\s*"?serverad"?/.test(r)) return { known: true, match: !hybrid };
    return { known: false };
  }

  const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
  const nonEmpty = (a) => Array.isArray(a) && a.length > 0;

  // ---- evaluate ONE policy; returns {applies:true, grant, session} or {applies:false, reason} ----
  function evalPolicy(p, sc, ctx) {
    const c = p.conditions || {};
    const u = c.users || {}, a = c.applications || {};

    // 1. users -------------------------------------------------------------
    const gids = sc.groupIds || new Set(), rids = sc.roleIds || new Set();
    const incAll = has(u.includeUsers, "All");
    const incMe = has(u.includeUsers, sc.userId);
    const incGrp = (u.includeGroups || []).some((g) => gids.has(g));
    const incRole = (u.includeRoles || []).some((r) => rids.has(r));
    const incGuest = !!u.includeGuestsOrExternalUsers && !!sc.isGuest;
    if (!(incAll || incMe || incGrp || incRole || incGuest)) return { applies: false, reason: "User is not in scope of this policy" };
    if (has(u.excludeUsers, sc.userId)) return { applies: false, reason: "User is excluded" };
    const exGrp = (u.excludeGroups || []).find((g) => gids.has(g));
    if (exGrp) return { applies: false, reason: `User is excluded via group ${ctx.name(exGrp)}` };
    const exRole = (u.excludeRoles || []).find((r) => rids.has(r));
    if (exRole) return { applies: false, reason: `User is excluded via role ${ctx.name(exRole)}` };
    if (u.excludeGuestsOrExternalUsers && sc.isGuest) return { applies: false, reason: "Guest / external users are excluded" };

    // 2. target resource ---------------------------------------------------
    const userActions = a.includeUserActions || [], authCtx = a.includeAuthenticationContextClassReferences || [];
    if (sc.userAction) {
      if (!has(userActions, sc.userAction)) return { applies: false, reason: "This user action is not in scope" };
    } else if (sc.authContext) {
      if (!has(authCtx, sc.authContext)) return { applies: false, reason: "This authentication context is not in scope" };
    } else {
      if (nonEmpty(userActions) || nonEmpty(authCtx)) return { applies: false, reason: "Policy targets a user action / authentication context, not a cloud app" };
      const inc = a.includeApplications || [];
      // Per the What-If API: app *groups* (Office365, MicrosoftAdminPortals) do
      // not match — only "All" or the specific app id.
      if (!(has(inc, "All") || has(inc, sc.appId))) {
        return { applies: false, reason: has(inc, "Office365") || has(inc, "MicrosoftAdminPortals")
          ? "Cloud app not in scope (policy targets an app group, which does not match by design)"
          : "Cloud app is not in scope of this policy" };
      }
      if (has(a.excludeApplications, sc.appId)) return { applies: false, reason: "Cloud app is excluded" };
    }

    // 3. client app --------------------------------------------------------
    const cat = c.clientAppTypes || [];
    if (nonEmpty(cat) && !has(cat, "all") && !has(cat, sc.clientApp)) {
      return { applies: false, reason: `Client app ${LABEL[sc.clientApp] || sc.clientApp} is not in scope` };
    }

    // 4. device platform ---------------------------------------------------
    const pl = c.platforms || {};
    if (nonEmpty(pl.includePlatforms)) {
      if (!(has(pl.includePlatforms, "all") || has(pl.includePlatforms, sc.platform))) {
        return { applies: false, reason: `Device platform ${LABEL[sc.platform] || sc.platform} is not in scope` };
      }
    }
    if (has(pl.excludePlatforms, sc.platform)) return { applies: false, reason: `Device platform ${LABEL[sc.platform] || sc.platform} is excluded` };

    // 5. location ----------------------------------------------------------
    const loc = c.locations || {};
    if (nonEmpty(loc.includeLocations) || nonEmpty(loc.excludeLocations)) {
      if (!sc.ip && !sc.country) return { applies: false, reason: "Policy has a location condition, but no IP address or country was supplied" };
      const here = locationsFor(sc, ctx.namedLocations);
      const incL = loc.includeLocations || [];
      const inIncluded = has(incL, "All") || (has(incL, "AllTrusted") && here.trusted) || incL.some((id) => here.ids.has(id));
      if (nonEmpty(incL) && !inIncluded) return { applies: false, reason: "Sign-in location is not in scope" };
      const excL = loc.excludeLocations || [];
      const inExcluded = (has(excL, "AllTrusted") && here.trusted) || excL.some((id) => here.ids.has(id));
      if (inExcluded) return { applies: false, reason: "Sign-in location is excluded" };
    }

    // 6. sign-in / user risk ----------------------------------------------
    if (nonEmpty(c.signInRiskLevels)) {
      if (!sc.signInRisk) return { applies: false, reason: "Policy has a sign-in risk condition, but no sign-in risk was supplied" };
      if (!has(c.signInRiskLevels, sc.signInRisk)) return { applies: false, reason: `Sign-in risk ${sc.signInRisk} is not in scope` };
    }
    if (nonEmpty(c.userRiskLevels)) {
      if (!sc.userRisk) return { applies: false, reason: "Policy has a user risk condition, but no user risk was supplied" };
      if (!has(c.userRiskLevels, sc.userRisk)) return { applies: false, reason: `User risk ${sc.userRisk} is not in scope` };
    }
    if (nonEmpty(c.insiderRiskLevels)) {
      if (!sc.insiderRisk) return { applies: false, reason: "Policy has an insider risk condition, but no insider risk was supplied" };
      if (!has(c.insiderRiskLevels, sc.insiderRisk)) return { applies: false, reason: `Insider risk ${sc.insiderRisk} is not in scope` };
    }

    // 7. authentication flow (device code / auth transfer) -----------------
    const flows = c.authenticationFlows && c.authenticationFlows.transferMethods;
    if (flows) {
      const list = String(flows).split(",").map((x) => x.trim()).filter(Boolean);
      if (!sc.authFlow) return { applies: false, reason: "Policy has an authentication flow condition, but no flow was supplied" };
      if (!list.includes(sc.authFlow)) return { applies: false, reason: `Authentication flow ${sc.authFlow} is not in scope` };
    }

    // 8. device filter -----------------------------------------------------
    const warnings = [];
    const df = c.devices && c.devices.deviceFilter;
    if (df && df.rule) {
      const v = deviceFilterVerdict(df.rule, sc);
      if (!v.known) warnings.push(`device filter not evaluated: ${df.rule}`);
      else {
        const isInclude = (df.mode || "include") === "include";
        const inScope = isInclude ? v.match : !v.match;
        if (!inScope) return { applies: false, reason: "Device does not match the policy's device filter" };
      }
    }

    // ---- applies: collect the controls that must be satisfied ----
    const g = p.grantControls || {};
    const grant = [];
    (g.builtInControls || []).forEach((x) => grant.push(x));
    if (g.authenticationStrength) grant.push("authenticationStrength:" + (g.authenticationStrength.displayName || g.authenticationStrength.id || ""));
    (g.termsOfUse || []).forEach((id) => grant.push("termsOfUse:" + ctx.name(id)));
    const s = p.sessionControls || {};
    const session = [];
    if (s.applicationEnforcedRestrictions?.isEnabled) session.push("App enforced restrictions");
    if (s.cloudAppSecurity?.isEnabled) session.push("Conditional Access App Control");
    if (s.signInFrequency?.isEnabled) session.push("Sign-in frequency" + (s.signInFrequency.frequencyInterval === "everyTime" ? ": every time" : `: ${s.signInFrequency.value ?? ""} ${s.signInFrequency.type ?? ""}`.trimEnd()));
    if (s.persistentBrowser?.isEnabled) session.push("Persistent browser: " + s.persistentBrowser.mode);
    if (s.continuousAccessEvaluation?.mode) session.push("Continuous access evaluation: " + s.continuousAccessEvaluation.mode);
    if (s.secureSignInSession?.isEnabled) session.push("Token protection");
    if (s.disableResilienceDefaults) session.push("Resilience defaults disabled");
    return { applies: true, grant, session, operator: g.operator || null, warnings };
  }

  // ---- evaluate every policy ----
  function evaluate(raws, sc, ctx = {}) {
    const c = {
      namedLocations: ctx.namedLocations || [],
      name: (id) => (ctx.names && ctx.names[id]) || id,
    };
    const applied = [], notApplied = [], notEvaluated = [];
    for (const p of (raws || []).slice().sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""))) {
      // only enabled or report-only policies take part in an evaluation run
      if (p.state !== "enabled" && p.state !== "enabledForReportingButNotEnforced") {
        notEvaluated.push({ id: p.id, name: p.displayName, state: p.state });
        continue;
      }
      const r = evalPolicy(p, sc, c);
      const base = { id: p.id, name: p.displayName, state: p.state };
      if (r.applies) applied.push({ ...base, grant: r.grant, session: r.session, operator: r.operator, warnings: r.warnings });
      else notApplied.push({ ...base, reason: r.reason });
    }
    return {
      applied, notApplied, notEvaluated,
      total: (raws || []).length,
      evaluated: applied.length + notApplied.length,
      // a block wins over everything else
      blocked: applied.some((x) => (x.grant || []).includes("block")),
    };
  }

  return { evaluate, evalPolicy, ipInCidr, matchesLocation, RISK, PLATFORMS, CLIENT_APPS, DEVICE_STATES, LABEL };
})();
