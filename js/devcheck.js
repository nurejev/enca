// ======================================================================
// Compliant-device reality check (roadmap R11) — the other half of the
// "require compliant device" grant.
//
// A Conditional Access policy demanding a compliant device is only worth
// what Intune's compliance policies are worth: the CA side names WHO must
// present a compliant device, the Intune side decides WHICH devices can
// ever be one — and nothing in either portal checks that the two halves
// actually meet. A persona covered by CA but by no compliance policy is
// not "extra secure": what happens to it is decided by a tenant-wide
// Intune default almost nobody has read (see secureByDefault below).
// The same blind spot exists for app-protection policies behind
// "require approved client app / app protection policy".
//
// This module is pure analysis over a ctx the wiring fills from Graph
// (or demo data):
//   ctx = {
//     policies:  [conditionalAccessPolicy raws],
//     comp:      [deviceCompliancePolicy raws, $expand=assignments],
//     compSC:    [settings-catalog compliancePolicies raws, $expand=assignments],
//     appPols:   [{ platform:"iOS"|"android"|"windows", name, assignments }],
//     settings:  deviceManagementSettings | null   (null = not read),
//     names:     { id → displayName } for every group id involved,
//   }
// Nothing here talks to Graph and nothing writes — matching the house
// pattern (rmau.js, guide.js): logic testable on its own, wiring thin.
// ======================================================================
const DevCheck = (() => {
  // CA platform tokens as Graph spells them in includePlatforms.
  const ALL_PLATFORMS = ["windows", "macOS", "iOS", "android", "linux", "windowsPhone"];
  const PLAT = { windows: "Windows", macOS: "macOS", iOS: "iOS", android: "Android",
    linux: "Linux", windowsPhone: "Windows Phone" };

  // Classic compliance policies carry their platform in the @odata.type;
  // settings-catalog policies carry it in `platforms` (Linux exists ONLY
  // there — a tenant can be fully covered with zero classic policies).
  const COMP_TYPE = {
    windows10compliancepolicy: "windows", windows81compliancepolicy: "windows",
    windowsphone81compliancepolicy: "windowsPhone",
    macoscompliancepolicy: "macOS", ioscompliancepolicy: "iOS",
    androidcompliancepolicy: "android", androidworkprofilecompliancepolicy: "android",
    androiddeviceownercompliancepolicy: "android", aospdeviceownercompliancepolicy: "android",
  };
  const SC_PLAT = { windows10: "windows", macos: "macOS", ios: "iOS", android: "android",
    androidenterprise: "android", linux: "linux" };

  const platformOf = (p) => {
    const t = String(p["@odata.type"] || "").replace("#microsoft.graph.", "").toLowerCase();
    if (COMP_TYPE[t]) return COMP_TYPE[t];
    const sc = String(p.platforms || "").toLowerCase();
    for (const k of Object.keys(SC_PLAT)) if (sc.includes(k)) return SC_PLAT[k];
    return null;
  };

  // Assignment targets. Exclusion is tested FIRST because
  // "#…exclusionGroupAssignmentTarget" contains "groupAssignmentTarget".
  function targetsOf(assignments) {
    const t = { allDevices: false, allUsers: false, groups: [], exclude: [] };
    for (const a of assignments || []) {
      const ty = String((a.target || {})["@odata.type"] || "");
      if (ty.includes("allDevicesAssignmentTarget")) t.allDevices = true;
      else if (ty.includes("allLicensedUsersAssignmentTarget")) t.allUsers = true;
      else if (ty.includes("exclusionGroupAssignmentTarget")) t.exclude.push(a.target.groupId);
      else if (ty.includes("groupAssignmentTarget")) t.groups.push(a.target.groupId);
    }
    return t;
  }

  // One normalised list out of both compliance families.
  function compliancePolicies(ctx) {
    const out = [];
    for (const p of ctx.comp || []) {
      const plat = platformOf(p);
      if (plat) out.push({ name: p.displayName || p.name || "(unnamed)", platform: plat, t: targetsOf(p.assignments) });
    }
    for (const p of ctx.compSC || []) {
      const plat = platformOf(p);
      if (plat) out.push({ name: p.name || p.displayName || "(unnamed)", platform: plat, t: targetsOf(p.assignments) });
    }
    return out;
  }

  // ---- what a CA policy asks for ---------------------------------------
  const wantsCompliance = (raw) => ((raw.grantControls || {}).builtInControls || []).includes("compliantDevice");
  const wantsAppProtection = (raw) => {
    const c = (raw.grantControls || {}).builtInControls || [];
    return c.includes("approvedApplication") || c.includes("compliantApplication");
  };

  // In OR mode every other control is an escape hatch: a user on an
  // uncovered device is not protected by the device check — they simply
  // satisfy the policy some other way. That is not a gap in availability,
  // but it IS a gap in what the policy name promises.
  function alternatives(raw) {
    const g = raw.grantControls || {};
    if ((g.operator || "OR") !== "OR") return [];
    const DEVICE = new Set(["compliantDevice", "domainJoinedDevice", "approvedApplication", "compliantApplication"]);
    const alt = (g.builtInControls || []).filter((c) => !DEVICE.has(c));
    if (g.authenticationStrength && g.authenticationStrength.id) alt.push("authenticationStrength");
    return alt;
  }

  function caPlatforms(raw) {
    const p = (raw.conditions || {}).platforms || {};
    const inc = p.includePlatforms && p.includePlatforms.length ? p.includePlatforms : ["all"];
    const exc = new Set(p.excludePlatforms || []);
    const base = inc.includes("all") ? ALL_PLATFORMS : inc.filter((x) => ALL_PLATFORMS.includes(x));
    return base.filter((x) => !exc.has(x));
  }

  function caScope(raw) {
    const u = (raw.conditions || {}).users || {};
    return {
      all: (u.includeUsers || []).includes("All"),
      users: (u.includeUsers || []).filter((x) => x !== "All" && x !== "None"),
      groups: u.includeGroups || [],
      roles: u.includeRoles || [],
      guests: !!u.includeGuestsOrExternalUsers,
    };
  }

  // ---- the verdict for one platform of one leg -------------------------
  // covered   — an assignment provably reaches everyone the CA policy names
  // partial   — policies exist but only group-assigned; overlap with the CA
  //             scope cannot be proven from assignments alone
  // uncovered — no Intune policy for this platform at all, or none of the
  //             CA policy's include groups is assigned one
  function platformVerdict(pols, plat, scope, names) {
    const nm = (id) => (names || {})[id] || id;
    const onPlat = pols.filter((p) => p.platform === plat);
    if (!onPlat.length) return { plat, verdict: "uncovered", via: [], detail: `no Intune policy exists for ${PLAT[plat]}` };
    const broad = onPlat.filter((p) => p.t.allDevices || p.t.allUsers);
    if (broad.length) return { plat, verdict: "covered", via: broad.map((p) => p.name),
      detail: `assigned to ${broad[0].t.allDevices ? "All devices" : "All users"}` };
    const assigned = new Set(onPlat.flatMap((p) => p.t.groups));
    if (scope.all || scope.guests || scope.roles.length || scope.users.length) {
      // "All users" (or roles / named users / guests) against group-assigned
      // Intune policies: whoever is outside those groups falls through to
      // the tenant default. Provable only as "not proven".
      return { plat, verdict: "partial", via: onPlat.map((p) => p.name),
        detail: `only group-assigned (${onPlat.length} polic${onPlat.length === 1 ? "y" : "ies"}) — anyone outside those groups falls through to the tenant default` };
    }
    const matched = scope.groups.filter((g) => assigned.has(g));
    const unmatched = scope.groups.filter((g) => !assigned.has(g));
    if (scope.groups.length && !unmatched.length)
      return { plat, verdict: "covered", via: onPlat.filter((p) => p.t.groups.some((g) => scope.groups.includes(g))).map((p) => p.name),
        detail: "every included group is directly assigned a policy" };
    if (matched.length)
      return { plat, verdict: "partial", via: onPlat.map((p) => p.name),
        detail: `assigned for ${matched.map(nm).join(", ")} — NOT for ${unmatched.map(nm).join(", ")}` };
    return { plat, verdict: "uncovered", via: [],
      detail: `${PLAT[plat]} policies exist but none is assigned to ${scope.groups.length ? unmatched.map(nm).join(", ") : "this scope"}` };
  }

  const RANK = { uncovered: 3, partial: 2, na: 1, covered: 0 };
  const worst = (rows) => rows.reduce((w, r) => (RANK[r.verdict] > RANK[w] ? r.verdict : w), "covered");

  // ---- the whole tenant ------------------------------------------------
  function analyze(ctx) {
    const comp = compliancePolicies(ctx);
    const appByPlat = { iOS: [], android: [], windows: [] };
    for (const p of ctx.appPols || []) if (appByPlat[p.platform]) appByPlat[p.platform].push({ name: p.name, platform: p.platform, t: targetsOf(p.assignments) });

    const results = [];
    for (const raw of ctx.policies || []) {
      const needComp = wantsCompliance(raw), needApp = wantsAppProtection(raw);
      if (!needComp && !needApp) continue;
      const scope = caScope(raw), plats = caPlatforms(raw), alt = alternatives(raw);
      const legs = [];
      if (needComp)
        legs.push({ kind: "compliance", label: "Require compliant device", rows: plats.map((pl) => platformVerdict(comp, pl, scope, ctx.names)) });
      if (needApp) {
        const rows = plats.map((pl) => {
          if (pl === "iOS" || pl === "android")
            return platformVerdict([...appByPlat[pl]], pl, scope, ctx.names);
          // Approved client app / app protection is an iOS-and-Android
          // mechanism; on any other platform the control is simply never
          // satisfied — which blocks, rather than protects.
          return { plat: pl, verdict: "na", via: [],
            detail: `approved client app / app protection does not exist on ${PLAT[pl]} — on this platform the control cannot be satisfied` };
        });
        legs.push({ kind: "app", label: "Require approved client app / app protection", rows });
      }
      const w = worst(legs.flatMap((l) => l.rows));
      results.push({ id: raw.id, name: raw.displayName || raw.name, state: raw.state, scope, alt, legs, worst: w });
    }
    results.sort((a, b) => RANK[b.worst] - RANK[a.worst] || String(a.name).localeCompare(String(b.name)));

    // The tenant default is what an uncovered device BECOMES. secureByDefault
    // false (Intune's own default is true, but old tenants vary): a device
    // with no compliance policy is marked COMPLIANT, so every gap above
    // passes the CA grant silently. true: it is marked noncompliant, so the
    // gap surfaces as users being blocked instead — loud, but at least not
    // silent. Not read at all: say so, never guess.
    const s = ctx.settings || null;
    const secure = s === null ? null : s.secureByDefault !== false;
    const perPlat = ALL_PLATFORMS.map((pl) => ({ plat: pl, label: PLAT[pl], n: comp.filter((c) => c.platform === pl).length }))
      .filter((x) => x.n || ["windows", "macOS", "iOS", "android"].includes(x.plat));
    return { results, comp, secure,
      summary: { compCount: comp.length, appCount: (ctx.appPols || []).length, perPlat,
        flagged: results.filter((r) => r.worst === "uncovered" || r.worst === "partial").length } };
  }

  // ---- Markdown --------------------------------------------------------
  const V_ICON = { covered: "✅", partial: "⚠️", uncovered: "❌", na: "🚫" };
  function toMd(res, meta = {}) {
    const L = [`# Compliant-device reality check — ${meta.tenantName || "tenant"}`, "", Brand.generatedBy(), ""];
    L.push(res.secure === null
      ? "Tenant default for devices with **no compliance policy**: not read (needs DeviceManagementConfiguration.Read.All)."
      : res.secure
      ? "Tenant default: devices with no compliance policy are marked **Not compliant** — a coverage gap below surfaces as blocked users, not as silent passes."
      : "Tenant default: devices with no compliance policy are marked **COMPLIANT** — every coverage gap below passes the device check silently. This single toggle decides what all the gaps mean.", "");
    L.push(`${res.summary.compCount} compliance polic${res.summary.compCount === 1 ? "y" : "ies"} (${res.summary.perPlat.map((x) => `${x.label}: ${x.n}`).join(", ")}) · ${res.summary.appCount} app-protection polic${res.summary.appCount === 1 ? "y" : "ies"} · ${res.results.length} CA polic${res.results.length === 1 ? "y" : "ies"} using device controls · ${res.summary.flagged} flagged`, "");
    for (const r of res.results) {
      L.push(`## ${V_ICON[r.worst]} ${r.name}`, "", `State: ${r.state === "enabled" ? "Enforced" : r.state === "enabledForReportingButNotEnforced" ? "Report-only" : "Off"}${r.alt.length ? ` · OR-alternatives present (${r.alt.join(", ")}) — an uncovered device passes via those instead` : ""}`, "");
      for (const leg of r.legs) {
        L.push(`### ${leg.label}`, "");
        for (const row of leg.rows) L.push(`- ${V_ICON[row.verdict]} **${PLAT[row.plat]}** — ${row.detail}${row.via.length ? ` (${row.via.join(", ")})` : ""}`);
        L.push("");
      }
    }
    return L.join("\n");
  }

  return { analyze, toMd, PLAT, V_ICON, platformOf, targetsOf };
})();
