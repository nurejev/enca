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
  // ---- membership matching ---------------------------------------------
  // A DIFFERENT group name does not mean a user is not covered: the CA
  // policy can include CAB-SEC-U-Persona-Externals while Intune assigns
  // "MAM - All BYOD" — and if the same people are in both, the coverage is
  // real. When the wiring has expanded memberships (ctx.members:
  // { groupId → { users:[ids], devices:n, capped:bool } }), the verdict is
  // computed on USERS, not on group names. Exclusions count per policy: a
  // user excluded from policy A can still be covered by policy B.
  function memberVerdict(onPlat, scope, ctx) {
    const members = ctx && ctx.members;
    if (!members) return null;
    const have = (id) => Object.prototype.hasOwnProperty.call(members, id);
    const asgIds = [...new Set(onPlat.flatMap((p) => p.t.groups))];
    const excIds = [...new Set(onPlat.flatMap((p) => p.t.exclude))];
    if (!scope.groups.length && !scope.users.length) return null;
    if (!scope.groups.every(have) || !asgIds.every(have) || !excIds.every(have)) return null;
    const caUsers = new Set(scope.groups.flatMap((g) => members[g].users));
    for (const u of scope.users) caUsers.add(u);
    const covered = new Set();
    for (const p of onPlat) {
      const ex = new Set(p.t.exclude.flatMap((g) => (members[g] || { users: [] }).users));
      for (const g of p.t.groups) for (const u of (members[g] || { users: [] }).users) if (!ex.has(u)) covered.add(u);
    }
    const uncov = [...caUsers].filter((u) => !covered.has(u));
    const deviceGroups = asgIds.filter((g) => (members[g] || {}).devices > 0);
    const capped = [...scope.groups, ...asgIds, ...excIds].some((g) => (members[g] || {}).capped);
    const contributing = onPlat.filter((p) => p.t.groups.some((g) => (members[g] || { users: [] }).users.some((u) => caUsers.has(u))));
    return { total: caUsers.size, uncovered: uncov.length, deviceGroups, capped, contributing };
  }

  function platformVerdict(pols, plat, scope, ctx) {
    const names = (ctx || {}).names;
    const nm = (id) => (names || {})[id] || id;
    // "3 policies" without the groups is a verdict nobody can act on: WHICH
    // groups are assigned is exactly what decides who falls through. Every
    // via entry therefore names the policy AND its assigned groups (and its
    // exclusion groups, because an exclusion is how coverage leaks too).
    const withGroups = (p) => {
      const g = p.t.allDevices ? ["All devices"] : p.t.allUsers ? ["All users"] : p.t.groups.map(nm);
      const ex = p.t.exclude.length ? ` excl. ${p.t.exclude.map(nm).join(", ")}` : "";
      return `${p.name} → ${g.length ? g.join(", ") : "(assigned to nothing)"}${ex}`;
    };
    const onPlat = pols.filter((p) => p.platform === plat);
    if (!onPlat.length) return { plat, verdict: "uncovered", via: [], detail: `no Intune policy exists for ${PLAT[plat]}` };
    const broad = onPlat.filter((p) => p.t.allDevices || p.t.allUsers);
    if (broad.length) return { plat, verdict: "covered", via: broad.map(withGroups),
      detail: `assigned to ${broad[0].t.allDevices ? "All devices" : "All users"}` };
    const assigned = new Set(onPlat.flatMap((p) => p.t.groups));
    if (scope.all || scope.guests || scope.roles.length) {
      // "All users" (or roles / guests) against group-assigned Intune
      // policies: that scope cannot be enumerated, so whoever is outside
      // the assigned groups falls through. Provable only as "not proven".
      return { plat, verdict: "partial", via: onPlat.map(withGroups),
        detail: `only group-assigned (${onPlat.length} polic${onPlat.length === 1 ? "y" : "ies"}) — the CA scope (${scope.all ? "All users" : scope.guests ? "guests" : "roles"}) cannot be enumerated, so anyone outside the assigned groups falls through to the tenant default` };
    }
    const matched = scope.groups.filter((g) => assigned.has(g));
    const unmatched = scope.groups.filter((g) => !assigned.has(g));
    if (scope.groups.length && !unmatched.length && !scope.users.length)
      return { plat, verdict: "covered", via: onPlat.filter((p) => p.t.groups.some((g) => scope.groups.includes(g))).map(withGroups),
        detail: "every included group is directly assigned a policy" };

    // Assignment alone could not prove it — try the members themselves.
    const mv = memberVerdict(onPlat, scope, ctx);
    if (mv) {
      const capNote = mv.capped ? " (a membership was truncated at the read cap — treat the count as a floor)" : "";
      if (!mv.total)
        return { plat, verdict: "partial", via: onPlat.map(withGroups),
          detail: "the included scope has no members today — nothing to cover, and nothing protected" };
      if (!mv.uncovered)
        return { plat, verdict: "covered", via: mv.contributing.map(withGroups),
          detail: `no group is assigned by name, but all ${mv.total} member${mv.total === 1 ? "" : "s"} of the CA scope sit inside assigned groups — matched by membership${capNote}` };
      const devNote = mv.deviceGroups.length
        ? ` — and ${mv.deviceGroups.length} assigned group${mv.deviceGroups.length === 1 ? " is a DEVICE group" : "s are DEVICE groups"} (${mv.deviceGroups.map(nm).join(", ")}), which cannot be matched to the users of the CA scope, so the real coverage may be higher`
        : "";
      if (mv.uncovered < mv.total)
        return { plat, verdict: "partial", via: onPlat.map(withGroups),
          detail: `${mv.total - mv.uncovered} of ${mv.total} members of the CA scope ${mv.total - mv.uncovered === 1 ? "is" : "are"} covered by membership; ${mv.uncovered} ${mv.uncovered === 1 ? "is" : "are"} in no assigned group${devNote}${capNote}` };
      return { plat, verdict: mv.deviceGroups.length ? "partial" : "uncovered", via: onPlat.map(withGroups),
        detail: `none of the ${mv.total} member${mv.total === 1 ? "" : "s"} of the CA scope is in any assigned group${devNote}${capNote}` };
    }

    // No membership data — fall back to what assignments alone can say.
    if (matched.length)
      return { plat, verdict: "partial", via: onPlat.map(withGroups),
        detail: `assigned for ${matched.map(nm).join(", ")} — NOT for ${unmatched.map(nm).join(", ")}` };
    return { plat, verdict: "uncovered", via: onPlat.map(withGroups),
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
        legs.push({ kind: "compliance", label: "Require compliant device", rows: plats.map((pl) => platformVerdict(comp, pl, scope, ctx)) });
      if (needApp) {
        const rows = plats.map((pl) => {
          if (pl === "iOS" || pl === "android")
            return platformVerdict([...appByPlat[pl]], pl, scope, ctx);
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
        membersExpanded: ctx.members ? Object.keys(ctx.members).length : 0,
        memberCap: ctx.memberCap || 0,
        flagged: results.filter((r) => r.worst === "uncovered" || r.worst === "partial").length } };
  }

  // Which groups a membership match could ever need: the include groups
  // (and named users' containers do not exist — users match directly) of
  // every device-grant CA policy whose scope is enumerable, plus every
  // assignment and exclusion group of the Intune policies on the platforms
  // those CA policies touch. The wiring expands exactly these, and only
  // when the assignment-level pass left something unproven.
  function expandCandidates(ctx) {
    const ids = new Set();
    const comp = compliancePolicies(ctx);
    const appAll = (ctx.appPols || []).map((p) => ({ platform: p.platform, t: targetsOf(p.assignments) }));
    for (const raw of ctx.policies || []) {
      if (!wantsCompliance(raw) && !wantsAppProtection(raw)) continue;
      const scope = caScope(raw);
      if (scope.all || scope.guests || scope.roles.length) continue;   // not enumerable — membership cannot help
      if (!scope.groups.length && !scope.users.length) continue;
      for (const g of scope.groups) ids.add(g);
      const plats = new Set(caPlatforms(raw));
      for (const p of [...comp, ...appAll]) if (plats.has(p.platform))
        for (const g of [...p.t.groups, ...p.t.exclude]) ids.add(g);
    }
    return [...ids];
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
    L.push(`${res.summary.compCount} compliance polic${res.summary.compCount === 1 ? "y" : "ies"} (${res.summary.perPlat.map((x) => `${x.label}: ${x.n}`).join(", ")}) · ${res.summary.appCount} app-protection polic${res.summary.appCount === 1 ? "y" : "ies"} · ${res.results.length} CA polic${res.results.length === 1 ? "y" : "ies"} using device controls · ${res.summary.flagged} flagged${res.summary.membersExpanded ? ` · memberships matched across ${res.summary.membersExpanded} groups${res.summary.memberCap ? ` (${res.summary.memberCap} more not expanded — over the read cap)` : ""}` : ""}`, "");
    for (const r of res.results) {
      L.push(`## ${V_ICON[r.worst]} ${r.name}`, "", `State: ${r.state === "enabled" ? "Enforced" : r.state === "enabledForReportingButNotEnforced" ? "Report-only" : "Off"}${r.alt.length ? ` · OR-alternatives present (${r.alt.join(", ")}) — an uncovered device passes via those instead` : ""}`, "");
      for (const leg of r.legs) {
        L.push(`### ${leg.label}`, "");
        for (const row of leg.rows) {
          L.push(`- ${V_ICON[row.verdict]} **${PLAT[row.plat]}** — ${row.detail}`);
          for (const v of row.via) L.push(`  - ${v}`);
        }
        L.push("");
      }
    }
    return L.join("\n");
  }

  return { analyze, toMd, expandCandidates, PLAT, V_ICON, platformOf, targetsOf };
})();
