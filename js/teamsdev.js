// ======================================================================
// Teams devices (T35) — the shared-device group, checked against what the
// tenant actually licenses.
//
// Every baseline exclusion for Teams Rooms, panels, common-area phones and
// call-queue accounts (CA000, CA004, CA007, CA008, CA014, CA015, CA016) rides
// on ONE dynamic group, CAB-SEC-U-TeamsSharedDevices, and that group is only
// as good as its membership rule. The rule ENCA has shipped since the R26.6
// catalog names three service plans — Teams_Room_Basic, Teams_Room_Pro and
// the legacy Teams_Room_Standard — so it catches Teams ROOMS and nothing
// else. A tenant with 500 common-area phones on Teams Shared Space (the
// licence Microsoft called Teams Shared Devices until April 2026) and 140
// auto-attendant resource accounts has none of them in the group, and every
// one of those accounts is hit by sign-in frequency, MFA, device-code blocks
// and risk policies the devices cannot satisfy.
//
// The rule cannot simply list "all Teams SKUs": dynamic membership sees
// SERVICE PLANS, not SKUs (there is no assignedLicenses.skuId in the rule
// grammar), and a device SKU is mostly made of plans every E3/E5 user also
// holds — MCOEV (Teams Phone), TEAMS1, MCOSTANDARD, Intune, Entra P1. Naming
// MCOEV would pull every E5 user into the exclusion group. So the question
// this module answers is: WHICH plans exist ONLY in the device SKUs this
// tenant owns? Those, and only those, can isolate the device accounts.
//
// Two sources, in this order:
//   1. the tenant's own subscribedSkus — the device SKUs are recognised by
//      part number, every plan they carry is collected, every plan any
//      OTHER subscription carries is removed, and what is left is the set
//      that isolates devices IN THIS TENANT. This is the source that
//      survives Microsoft renaming, re-bundling or adding a plan.
//   2. a bundled catalog of the device plans Microsoft's licensing reference
//      lists today — the fallback when the SKU read failed, and the source
//      of the rule js/groupTemplates.js ships for a tenant that has not run
//      this tool. It is also how a plan referenced by an existing rule gets
//      a name on screen.
//
// A device SKU whose plans are ALL shared with user SKUs cannot be isolated
// by plan at all, and the tool says so per SKU rather than pretending the
// rule covers it: that SKU's accounts need a name-prefix clause (the tool
// can add one) or an assigned group.
//
// AND NOT A PERSON. A device match alone is not enough: a person whose own
// account was handed a Shared Space or Rooms licence (a DECT handset licensed
// on the user rather than on a device account) matches every device plan and
// would land in the exclusion group — an MFA bypass for a human. So the rule
// has a second half: NOT holding any plan that marks a USER SUITE (E1, E3,
// E5, F1, F3, A3, A5, Business). Those marker plans are derived the same way
// in reverse — plans the tenant's user suites carry that NO device SKU
// carries, the smallest set that covers every suite — with the SharePoint
// plans as the static fallback, because no device SKU has ever carried
// SharePoint. Such accounts are counted and named separately: they are a
// licensing problem (device licence on a person) that the rule keeps out of
// the group but cannot fix.
//
// Teams Phone Standard is deliberately NOT a device licence here. It is a
// per-user add-on that real people hold, its only plan is MCOEV, and a rule
// that matched it would exclude those people from MFA. It is listed under
// "user licences" so nobody wonders where it went.
//
// Pure analysis over a ctx the wiring fills from Graph (or demo data); the
// ONE write — replacing a group's membershipRule — lives in the wiring
// behind an explicit confirmation, and this module only builds the text.
//   ctx = {
//     skus:     subscribedSkus[] | null (null = the read failed),
//     groups:   [{ id, displayName, membershipRule, ruleState, dynamic,
//                  memberCount|null, description }],
//     groupsPartial, policies: raw CA policies[], names: { id → name },
//     prefixes: ["mtr-", …] optional UPN prefixes the person typed,
//     preview:  { count: n|null, sample: [{id,name,upn,enabled}], capped }
//   }
// ======================================================================
const TeamsDev = (() => {
  // Service plans that exist ONLY in device / resource-account SKUs, per
  // https://learn.microsoft.com/entra/identity/users/licensing-service-plan-reference
  // (read 2026-09-02). `family` says which device population a plan stands for.
  const CATALOG = {
    "8081ca9c-188c-4b49-a8e5-c23b5e9463a8": { name: "Teams_Room_Basic", label: "Teams Rooms (Basic + Pro)", family: "rooms" },
    "ec17f317-f4bc-451e-b2da-0167e5c260f9": { name: "Teams_Room_Pro", label: "Teams Rooms (Basic + Pro)", family: "rooms" },
    "c8529366-cffd-4415-ab8f-be0144a33ab1": { name: "Teams_Rooms_Basic", label: "Teams Rooms Basic", family: "rooms" },
    "0374d34c-6be4-4dbb-b3f0-26105db0b28a": { name: "Teams_Rooms_Pro", label: "Teams Rooms Pro", family: "rooms" },
    "ecc74eae-eeb7-4ad5-9c88-e8b2bfca75b8": { name: "MTRProManagement", label: "Teams Rooms Pro Management", family: "rooms" },
    "92c6b761-01de-457a-9dd9-793a975238f7": { name: "Teams_Room_Standard", label: "Teams Rooms Standard (legacy)", family: "rooms" },
    "79d69417-9e27-4a13-b7a5-80c513145533": { name: "Teams_Room_Premium", label: "Teams Rooms Premium (legacy)", family: "rooms" },
    "bdaa59a3-74fd-4137-981a-31d4f84eb8a0": { name: "MMR_P1", label: "Meeting Room Managed Services (legacy Premium)", family: "rooms" },
    "f47330e9-c134-43b3-9993-e7f004506889": { name: "MCOEV_VIRTUALUSER", label: "Teams Phone Resource Account", family: "resourceAccount" },
    "0628a73f-3b4a-4989-bd7b-0f8823144313": { name: "MCOEV_VIRTUALUSER_GOV", label: "Teams Phone Resource Account (GCC)", family: "resourceAccount" },
    "cfce7ae3-4b41-4438-999c-c0e91f3b7fb9": { name: "SPECIALTY_DEVICES", label: "Specialty devices (Teams Shared Space, Teams Rooms)", family: "shared" },
  };
  // Plans a Teams device SKU carries that USER SKUs carry too. A rule naming
  // one of these matches people, not devices — the trap this tool exists to
  // catch. Labels say which people.
  const TRAPS = {
    "4828c8ec-dc2e-4779-b502-87ac9ce28ab7": "MCOEV — Teams Phone (every E5 and Teams Phone Standard user)",
    "db23fce2-a974-42ef-9002-d78dd42a0f22": "MCOEV_GOV — Teams Phone for Government (every user with it)",
    "57ff2da0-773e-42df-b2af-ffb7a2317929": "TEAMS1 — Microsoft Teams (practically every licensed user)",
    "304767db-7d23-49e8-a945-4a7eb65f9f28": "TEAMS_GOV — Microsoft Teams for Government (every user)",
    "0feaeb32-d00e-4d66-bd5a-43b5b83db82c": "MCOSTANDARD — Skype for Business Online Plan 2 (every E3/E5 user)",
    "c1ec4a95-1f05-45b3-a911-aa3fa01094f5": "INTUNE_A — Intune Plan 1 (every EMS / M365 user)",
    "41781fb2-bc02-4b7c-bd55-b576c07bb09d": "AAD_PREMIUM — Entra ID P1 (every EMS / M365 user)",
    "efb87545-963c-4e0d-99df-69c6916d9eb0": "EXCHANGE_S_ENTERPRISE — Exchange Online Plan 2 (every E3/E5 user)",
    "3e26ee1f-8a5f-4d52-aee2-b81ce45c8f40": "MCOMEETADV — Audio Conferencing (every E5 user)",
    "4a51bca5-1eff-43f5-878c-177680f191af": "WHITEBOARD_PLAN3 — Whiteboard (every E3/E5 user)",
    "871d91ec-ec1a-452b-a83f-bd76c7d770ef": "WINDEFATP — Defender for Endpoint (every E5 user)",
  };
  // How a subscribed SKU is recognised as a device licence, by part number.
  // Order matters only for the label; `kind` decides the population.
  const DEVICE_SKUS = [
    { re: /^Microsoft_Teams_Rooms_/i, kind: "rooms", label: "Teams Rooms" },
    { re: /^MEETING_ROOM/i, kind: "rooms", label: "Teams Rooms Standard (legacy)" },
    { re: /^MTR_PREM/i, kind: "rooms", label: "Teams Rooms Premium (legacy)" },
    { re: /^MCOCAP/i, kind: "shared", label: "Teams Shared Space (was Teams Shared Devices)" },
    { re: /shared_?space|shared_?devices?/i, kind: "shared", label: "Teams Shared Space" },
    { re: /^PHONESYSTEM_VIRTUALUSER/i, kind: "resourceAccount", label: "Teams Phone Resource Account" },
  ];
  // Per-user Teams add-ons that LOOK like device licences on a licence page
  // and are not: real people hold them. Listed so their absence from the
  // rule reads as a decision.
  const USER_SKUS = [
    { re: /^MCOEV(_|$)/i, label: "Teams Phone Standard — a per-user add-on, people hold it" },
    { re: /^MCOTEAMS_ESSENTIALS/i, label: "Teams Phone with Calling Plan — per user" },
    { re: /^MCOPSTN/i, label: "Calling Plan — per user" },
    { re: /BUSINESS_VOICE/i, label: "Business Voice — per user" },
    { re: /^Teams_Premium/i, label: "Teams Premium — per user" },
  ];
  // User SUITES — the licences that mean "this is a person". An account
  // holding one of these together with a device licence is a person with a
  // device licence, not a device, and the rule keeps it out.
  const SUITE_SKUS = /^(SPE_E[35]|SPE_F1|M365_F1|SPE_E5_|ENTERPRISEPACK|ENTERPRISEPREMIUM|ENTERPRISEWITHSCAL|STANDARDPACK|STANDARDWOFFPACK|DESKLESSPACK|DESKLESSWOFFPACK|SPB$|O365_BUSINESS|SMB_BUSINESS|M365EDU_A[35]|ENTERPRISEPACKPLUS|Microsoft_365_E[35]|Microsoft_365_F[13]|Microsoft_365_Business|Office_365_E[135]|Microsoft_365_Copilot_Business|DEVELOPERPACK)/i;
  // Plans that mark a user suite and have never been in a device SKU — the
  // static fallback for the NOT half of the rule when the SKUs cannot be read.
  const SUITE_MARKERS = {
    "5dbe027f-2339-4123-9542-606e4d348a72": { name: "SHAREPOINTENTERPRISE", label: "SharePoint Plan 2 — E3, E5, A3, A5" },
    "c7699d2e-19aa-44de-8edf-1736da088ca1": { name: "SHAREPOINTSTANDARD", label: "SharePoint Plan 1 — E1, Business Basic / Standard / Premium" },
    "902b47e5-dcb2-4fdc-858b-c63a90a2bdb9": { name: "SHAREPOINTDESKLESS", label: "SharePoint Kiosk — F1, F3" },
  };
  const KIND_LABEL = { rooms: "Teams Rooms", shared: "Teams Shared Space / common-area devices", resourceAccount: "Teams Phone resource accounts (auto attendants, call queues)" };
  const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const CANONICAL = "CAB-SEC-U-TeamsSharedDevices";
  // Group names this app already treats as the shared-device group (the same
  // list MS Learn checks accepts), so a tenant that named it differently is
  // found rather than told to create a second one.
  const ALIASES = ["CAB-SEC-U-TeamsSharedDevices", "CAB-SEC-U-SharedDevices", "CAB-SEC-U-Persona-SharedDevices",
    "CAB-SEC-U-TeamsDevices", "CA-TeamsSharedDevices - Exclude", "CA-SharedDevices - Exclude"];
  const NAME_HINT = /teams|shared.?dev|shared.?space|\bmtr\b|rooms?\b|common.?area|resource.?acc/i;

  const clause = (id) => `(user.assignedPlans -any (assignedPlan.servicePlanId -eq "${id}" -and assignedPlan.capabilityStatus -eq "Enabled"))`;
  const prefixClause = (p) => `(user.userPrincipalName -startsWith "${String(p).replace(/"/g, "")}")`;
  // "holds NONE of these plans enabled" — Microsoft's own -all shape for a
  // negative (groups-dynamic-membership, example 3). Status is part of it so
  // a plan lingering as Deleted after a licence was removed does not keep an
  // account out of the group.
  const notClause = (ids) => ids.length
    ? `(user.assignedPlans -all (${ids.map((id) => `(assignedPlan.servicePlanId -ne "${id}" -or assignedPlan.capabilityStatus -ne "Enabled")`).join(" -and ")}))`
    : "";
  // The rule text: (device plans -or UPN prefixes) -and not a user suite.
  function buildRule(planIds, prefixes, markers) {
    const parts = [...new Set(planIds || [])].map(clause).concat((prefixes || []).map((p) => String(p).trim()).filter(Boolean).map(prefixClause));
    if (!parts.length) return "";
    const not = notClause([...new Set(markers || [])]);
    return not ? `(${parts.join(" -or ")}) -and ${not}` : parts.join(" -or ");
  }
  const catalogRule = () => buildRule(Object.keys(CATALOG), [], Object.keys(SUITE_MARKERS));
  const RULE_MAX = 3072;   // Microsoft's limit on the body of a membership rule

  const skuKind = (part) => {
    const p = String(part || "");
    for (const d of DEVICE_SKUS) if (d.re.test(p)) return { kind: d.kind, label: d.label };
    for (const u of USER_SKUS) if (u.re.test(p)) return { kind: "phoneUser", label: u.label };
    return { kind: "other", label: "" };
  };

  // What every subscription is, and which plans isolate the devices.
  function classifySkus(skus) {
    const rows = (skus || []).map((s) => {
      const k = skuKind(s.skuPartNumber);
      return {
        skuId: s.skuId, part: s.skuPartNumber || s.skuId, kind: k.kind, label: k.label,
        status: s.capabilityStatus || "", enabled: (s.prepaidUnits || {}).enabled ?? null, consumed: s.consumedUnits ?? null,
        plans: (s.servicePlans || []).map((p) => ({ id: String(p.servicePlanId || "").toLowerCase(), name: p.servicePlanName || "" })),
        isolating: [], isolatable: null,
      };
    });
    const isDevice = (r) => r.kind === "rooms" || r.kind === "shared" || r.kind === "resourceAccount";
    // Plans a rule must not name: anything a non-device subscription in
    // THIS tenant carries, plus the known user plans whatever the tenant
    // owns today — a tenant with only Rooms Pro and no E5 would otherwise
    // see WHITEBOARD_PLAN3 as "unique" and put its first E5 buyer in the
    // exclusion group the day the licence arrives.
    const userPlans = new Set(Object.keys(TRAPS));
    for (const r of rows) if (!isDevice(r)) for (const p of r.plans) userPlans.add(p.id);
    const planMap = new Map();   // id → { id, name, skus:[part], unique }
    for (const r of rows) {
      if (!isDevice(r)) continue;
      for (const p of r.plans) {
        if (!planMap.has(p.id)) planMap.set(p.id, { id: p.id, name: p.name, skus: [], unique: !userPlans.has(p.id), label: (CATALOG[p.id] || {}).label || "", family: (CATALOG[p.id] || {}).family || r.kind });
        planMap.get(p.id).skus.push(r.part);
      }
      r.isolating = r.plans.filter((p) => !userPlans.has(p.id)).map((p) => p.id);
      r.isolatable = r.isolating.length > 0;
    }
    const devicePlans = [...planMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    // The NOT half: plans that mark a user suite. Candidates are every plan
    // a suite SKU carries that no device SKU carries; the smallest set that
    // covers every suite is chosen greedily, static markers first so the
    // answer is stable across tenants that own the same suites.
    const devicePlanIds = new Set(planMap.keys());
    const suites = rows.filter((r) => !isDevice(r) && SUITE_SKUS.test(r.part));
    for (const r of suites) r.suite = true;
    const markers = [];
    let uncovered = suites.filter((r) => r.plans.some((p) => !devicePlanIds.has(p.id)));
    const uncoverable = suites.filter((r) => !r.plans.some((p) => !devicePlanIds.has(p.id))).map((r) => r.part);
    while (uncovered.length) {
      const score = new Map();
      for (const r of uncovered) for (const p of r.plans) if (!devicePlanIds.has(p.id)) score.set(p.id, (score.get(p.id) || 0) + 1);
      const best = [...score.entries()].sort((x, y) => y[1] - x[1] || (SUITE_MARKERS[y[0]] ? 1 : 0) - (SUITE_MARKERS[x[0]] ? 1 : 0) || x[0].localeCompare(y[0]))[0][0];
      markers.push(best);
      uncovered = uncovered.filter((r) => !r.plans.some((p) => p.id === best));
    }
    const markerInfo = markers.map((id) => {
      const nm = (SUITE_MARKERS[id] || {}).name || (rows.flatMap((r) => r.plans).find((p) => p.id === id) || {}).name || id;
      return { id, name: nm, label: (SUITE_MARKERS[id] || {}).label || `marks ${suites.filter((r) => r.plans.some((p) => p.id === id)).map((r) => r.part).join(", ")}`, suites: suites.filter((r) => r.plans.some((p) => p.id === id)).map((r) => r.part) };
    });
    return { rows, devicePlans, userPlans, suites, markers, markerInfo, uncoverable };
  }

  // Every plan GUID a rule names, split into what it means.
  function rulePlans(rule) {
    const txt = String(rule || "");
    const pick = (re) => [...new Set([...txt.matchAll(re)].map((m) => m[1].toLowerCase()))];
    // Plans the rule REQUIRES (-eq) versus plans it keeps OUT (-ne). A GUID
    // with neither operator (an -in list, say) counts as required.
    const excludes = pick(/servicePlanId\s+-ne\s+"([0-9a-f-]{36})"/gi);
    const eqs = pick(/servicePlanId\s+-eq\s+"([0-9a-f-]{36})"/gi);
    const all = [...new Set((txt.match(GUID_RE) || []).map((g) => g.toLowerCase()))];
    const ids = all.filter((id) => eqs.includes(id) || !excludes.includes(id));
    return {
      ids, excludes,
      known: ids.filter((id) => CATALOG[id]),
      traps: ids.filter((id) => TRAPS[id]),
      unknown: ids.filter((id) => !CATALOG[id] && !TRAPS[id]),
      usesPlans: /assignedPlans/i.test(rule || ""),
      prefixes: [...String(rule || "").matchAll(/userPrincipalName\s+-startsWith\s+"([^"]+)"/gi)].map((m) => m[1]),
    };
  }

  const isAlias = (name) => ALIASES.some((a) => a.toLowerCase() === String(name || "").toLowerCase());

  // Which CA policies reference a group, and which controls a Teams device
  // cannot satisfy — from Microsoft's supported-policies table for Teams Rooms
  // on Windows/Android, Teams phones and panels.
  const UNSUPPORTED = [
    { key: "mfa", label: "require MFA (Teams Rooms on Windows cannot; Android devices only with a non-interactive factor)", test: (p) => (((p.grantControls || {}).builtInControls) || []).includes("mfa") },
    { key: "strength", label: "authentication strength (no Teams device supports it)", test: (p) => !!((p.grantControls || {}).authenticationStrength) },
    { key: "hybrid", label: "require hybrid-joined device", test: (p) => (((p.grantControls || {}).builtInControls) || []).includes("domainJoinedDevice") },
    { key: "approvedApp", label: "require approved client app / app protection policy", test: (p) => { const b = ((p.grantControls || {}).builtInControls) || []; return b.includes("approvedApplication") || b.includes("compliantApplication"); } },
    { key: "pwd", label: "require password change", test: (p) => (((p.grantControls || {}).builtInControls) || []).includes("passwordChange") },
    { key: "tou", label: "terms of use acceptance", test: (p) => (((p.grantControls || {}).termsOfUse) || []).length > 0 },
    { key: "sif", label: "sign-in frequency (devices sign out on the interval)", test: (p) => !!(((p.sessionControls || {}).signInFrequency || {}).isEnabled) },
    { key: "pbs", label: "persistent browser session", test: (p) => !!(((p.sessionControls || {}).persistentBrowser || {}).isEnabled) },
    { key: "aer", label: "app-enforced restrictions", test: (p) => !!(((p.sessionControls || {}).applicationEnforcedRestrictions || {}).isEnabled) },
    { key: "cas", label: "Conditional Access app control", test: (p) => !!(((p.sessionControls || {}).cloudAppSecurity || {}).isEnabled) },
    { key: "tokenProt", label: "token protection", test: (p) => !!(((p.sessionControls || {}).secureSignInSession || {}).isEnabled) },
    { key: "cae", label: "customised continuous access evaluation (must stay disabled for devices)", test: (p) => { const c = ((p.sessionControls || {}).continuousAccessEvaluation || {}); return !!c.mode && c.mode !== "disabled"; } },
    { key: "dcf", label: "blocks device code flow (remote sign-in of Teams Android devices)", test: (p) => (((p.conditions || {}).authenticationFlows || {}).transferMethods || "").toLowerCase().includes("devicecodeflow") && (((p.grantControls || {}).builtInControls) || []).includes("block") },
    { key: "insider", label: "insider risk condition (not supported on devices)", test: (p) => ((((p.conditions || {}).insiderRiskLevels) || "") + "").length > 0 && (((p.conditions || {}).insiderRiskLevels) || "") !== "none" },
  ];
  const stateWord = (s) => s === "enabled" ? "On" : s === "enabledForReportingButNotEnforced" ? "Report-only" : "Off";

  function caRows(policies, targetIds, names) {
    const tset = new Set(targetIds || []);
    return (policies || []).filter((p) => p.state !== "disabled").map((p) => {
      const u = ((p.conditions || {}).users) || {};
      const inc = u.includeGroups || [], exc = u.excludeGroups || [];
      const all = (u.includeUsers || []).includes("All");
      const includesTarget = inc.some((g) => tset.has(g));
      const excludesTarget = exc.some((g) => tset.has(g));
      const unsupported = UNSUPPORTED.filter((c) => { try { return c.test(p); } catch { return false; } }).map((c) => c.label);
      const block = (((p.grantControls || {}).builtInControls) || []).includes("block");
      const reaches = (all || includesTarget) && !excludesTarget;
      return { id: p.id, name: p.displayName || p.id, state: stateWord(p.state), enforced: p.state === "enabled",
        all, includesTarget, excludesTarget, reaches, unsupported, block,
        verdict: !reaches ? (excludesTarget ? "excluded" : "out of scope") : unsupported.length ? "breaks" : block ? "check" : "reaches" };
    }).sort((a, b) => ({ breaks: 0, check: 1, reaches: 2, excluded: 3, "out of scope": 4 })[a.verdict] - ({ breaks: 0, check: 1, reaches: 2, excluded: 3, "out of scope": 4 })[b.verdict] || a.name.localeCompare(b.name));
  }

  function analyze(ctx) {
    const skusRead = Array.isArray(ctx.skus);
    const cls = classifySkus(skusRead ? ctx.skus : []);
    const deviceSkus = cls.rows.filter((r) => r.kind === "rooms" || r.kind === "shared" || r.kind === "resourceAccount");
    const phoneUserSkus = cls.rows.filter((r) => r.kind === "phoneUser");
    // The plans the rule should name: unique device plans from the tenant,
    // or the whole catalog when the tenant could not be read.
    const tenantUnique = cls.devicePlans.filter((p) => p.unique).map((p) => p.id);
    const ruleSource = skusRead && deviceSkus.length ? "tenant" : skusRead ? "catalog-no-device-skus" : "catalog";
    const planIds = ruleSource === "tenant" ? tenantUnique : Object.keys(CATALOG);
    const prefixes = (ctx.prefixes || []).map((p) => String(p).trim()).filter(Boolean);
    // The NOT half: tenant-derived when suites were read, the static
    // SharePoint markers otherwise (and when the tenant has no suite at all,
    // so the first E5 bought is kept out from day one).
    const markers = ruleSource === "tenant" && cls.markers.length ? cls.markers : Object.keys(SUITE_MARKERS);
    const markerInfo = ruleSource === "tenant" && cls.markers.length ? cls.markerInfo : Object.entries(SUITE_MARKERS).map(([id, m]) => ({ id, name: m.name, label: m.label, suites: [] }));
    const rule = buildRule(planIds, prefixes, markers);
    const notIsolatable = deviceSkus.filter((r) => r.isolatable === false);
    const deviceAccounts = deviceSkus.reduce((n, r) => n + (r.consumed || 0), 0);

    // Candidate groups: the canonical/alias names, anything whose rule names
    // a Teams plan, and anything whose name says Teams/shared/rooms.
    const groups = (ctx.groups || []).map((g) => {
      const rp = rulePlans(g.membershipRule);
      const alias = isAlias(g.displayName);
      const have = new Set(rp.ids);
      const missing = planIds.filter((id) => !have.has(id));
      const missingMarkers = markers.filter((id) => !rp.excludes.includes(id));
      const missingPrefixes = prefixes.filter((p) => !rp.prefixes.map((x) => x.toLowerCase()).includes(p.toLowerCase()));
      const extra = rp.known.filter((id) => !planIds.includes(id));   // in the catalog, not unique HERE — harmless, kept
      let verdict, why;
      if (!g.dynamic) { verdict = "assigned"; why = "an assigned group — nothing keeps it current; members are added by hand, so a new phone or room is unprotected until somebody remembers"; }
      else if (rp.traps.length) { verdict = "trap"; why = `the rule names ${rp.traps.length === 1 ? "a plan" : "plans"} that real users hold too (${rp.traps.map((id) => TRAPS[id].split(" — ")[0]).join(", ")}) — this group contains PEOPLE, and every policy excluding it excludes them from MFA`; }
      else if (!rp.usesPlans && !rp.prefixes.length) { verdict = "other"; why = "a dynamic rule that does not look at service plans or UPN prefixes — read it by hand before trusting it as the device group"; }
      else if (!missing.length && !missingPrefixes.length && !missingMarkers.length) { verdict = "current"; why = "names every plan that isolates a device account in this tenant and keeps user-suite holders out"; }
      else {
        verdict = "update";
        const bits = [];
        if (missing.length) bits.push(`misses ${missing.length} of ${planIds.length} device plan${planIds.length === 1 ? "" : "s"} — the accounts those licences sit on are NOT in the group today`);
        if (missingPrefixes.length) bits.push(`misses ${missingPrefixes.length} UPN prefix${missingPrefixes.length === 1 ? "" : "es"}`);
        if (missingMarkers.length) bits.push(`does not keep out user-suite holders (no -ne on ${missingMarkers.map((id) => ((SUITE_MARKERS[id] || {}).name) || (markerInfo.find((m) => m.id === id) || {}).name || id).join(", ")}) — a person whose own account holds a device licence lands in the group`);
        why = bits.join("; ");
      }
      const refs = (ctx.policies || []).filter((p) => p.state !== "disabled").map((p) => {
        const u = ((p.conditions || {}).users) || {};
        const how = (u.excludeGroups || []).includes(g.id) ? "excluded" : (u.includeGroups || []).includes(g.id) ? "included" : null;
        return how ? { id: p.id, name: p.displayName || p.id, how, state: stateWord(p.state) } : null;
      }).filter(Boolean);
      return { id: g.id, name: g.displayName || g.id, alias, canonical: String(g.displayName || "").toLowerCase() === CANONICAL.toLowerCase(),
        dynamic: !!g.dynamic, ruleState: g.ruleState || "", rule: g.membershipRule || "", memberCount: g.memberCount ?? null,
        plans: rp, missing, missingPrefixes, missingMarkers, extra, verdict, why, refs, description: g.description || "" };
    }).filter((g) => g.alias || g.plans.known.length || g.plans.traps.length || NAME_HINT.test(g.name))
      .sort((a, b) => (b.canonical - a.canonical) || (b.alias - a.alias) || (b.refs.length - a.refs.length) || a.name.localeCompare(b.name));

    // The group the baseline exclusions ride on: canonical name first, an
    // alias next, then the dynamic group most policies exclude.
    const target = groups.find((g) => g.canonical) || groups.find((g) => g.alias)
      || groups.filter((g) => g.dynamic && g.plans.known.length).sort((a, b) => b.refs.length - a.refs.length)[0] || null;
    const ca = caRows(ctx.policies, target ? [target.id] : [], ctx.names || {});
    const summary = {
      deviceSkus: deviceSkus.length, deviceAccounts, notIsolatable: notIsolatable.length,
      planCount: planIds.length, groups: groups.length,
      needUpdate: groups.filter((g) => g.verdict === "update").length,
      traps: groups.filter((g) => g.verdict === "trap").length,
      caBreaks: ca.filter((r) => r.verdict === "breaks").length,
      caBreaksOn: ca.filter((r) => r.verdict === "breaks" && r.enforced).length,
      caExcluded: ca.filter((r) => r.excludesTarget).length,
      previewCount: ctx.preview ? ctx.preview.count : null,
      peopleCount: ctx.people ? ctx.people.count : null,
      markerCount: markers.length, suites: cls.suites.length,
    };
    return { skusRead, ruleSource, skuRows: cls.rows, deviceSkus, phoneUserSkus, devicePlans: cls.devicePlans, planIds, prefixes,
      markers, markerInfo, suiteSkus: cls.suites, uncoverable: cls.uncoverable || [], people: ctx.people || null,
      rule, ruleLen: rule.length, ruleTooLong: rule.length > RULE_MAX, notIsolatable, groups, target, ca, summary,
      groupsPartial: !!ctx.groupsPartial, preview: ctx.preview || null, totalDynamic: ctx.totalDynamic ?? null };
  }

  // ---- Markdown export ----
  function toMd(res, meta = {}) {
    const s = res.summary;
    const L = [`# Teams devices — ${meta.tenantName || "tenant"}`, "",
      (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy() : "", "",
      "## Licences", "",
      res.skusRead ? `- Device SKUs found: **${s.deviceSkus}** carrying **${s.deviceAccounts.toLocaleString()}** assigned licences (an upper bound on device accounts — one account can hold two).` : "- Subscribed SKUs: **NOT READ** — the rule below comes from the bundled catalog, not from this tenant.",
      ...res.deviceSkus.map((r) => `- ${r.part} — ${r.label} · ${r.consumed ?? "?"}/${r.enabled ?? "?"} assigned · ${r.isolatable ? `isolated by ${r.isolating.map((id) => (CATALOG[id] || {}).name || id).join(", ")}` : "**NOT isolatable by service plan** — every plan it carries is also in a user SKU"}`),
      ...res.phoneUserSkus.map((r) => `- ${r.part} — ${r.label} · ${r.consumed ?? "?"}/${r.enabled ?? "?"} — **a user licence, deliberately not in the rule**`),
      "", "## Recommended membership rule", "",
      `Source: ${res.ruleSource === "tenant" ? "the plans unique to this tenant's device SKUs" : "the bundled catalog"} · ${s.planCount} plan${s.planCount === 1 ? "" : "s"}${res.prefixes.length ? ` · UPN prefixes ${res.prefixes.join(", ")}` : ""} · ${res.ruleLen} characters${res.ruleTooLong ? " — OVER Microsoft's 3072 limit" : ""}`, "",
      "```", res.rule, "```", "",
      "Device plans (the account must hold one):", "",
      ...res.planIds.map((id) => `- \`${id}\` ${(CATALOG[id] || {}).name || (res.devicePlans.find((p) => p.id === id) || {}).name || ""} — ${(CATALOG[id] || {}).label || "not in the bundled catalog: unique to a device SKU in this tenant"}`),
      "", "User-suite markers (the account must hold NONE of them — a person with a device licence stays out):", "",
      ...res.markerInfo.map((m) => `- \`${m.id}\` ${m.name} — ${m.label}`),
      s.previewCount != null ? `\nThe rule matches **${s.previewCount.toLocaleString()}** account${s.previewCount === 1 ? "" : "s"} in this tenant today.` : "",
      ...(s.peopleCount != null ? [`\n**${s.peopleCount.toLocaleString()}** account${s.peopleCount === 1 ? "" : "s"} hold a device licence AND a user suite — people with a device licence on their own account. The rule keeps them out of the group; the licence belongs on a device account.`, "",
        ...(res.people && res.people.sample.length ? ["| Account | UPN | Licences | State |", "|---|---|---|---|",
          ...res.people.sample.map((u) => `| ${u.name || ""} | ${u.upn || ""} | ${(u.skus || []).map((id) => { const r = res.skuRows.find((x) => x.skuId === id); return r ? r.part : id; }).join(", ")} | ${u.enabled ? "enabled" : "disabled"} |`),
          ...(res.people.capped ? [`\nFirst ${res.people.sample.length} of ${s.peopleCount.toLocaleString()}.`] : [])] : [])] : []),
      "", "## Groups", ""];
    if (!res.groups.length) L.push("No group in this tenant looks like the Teams shared-device group.");
    for (const g of res.groups) {
      L.push(`### ${g.name}${g.canonical ? " (canonical)" : g.alias ? " (accepted alias)" : ""}`, "",
        `- ${g.dynamic ? `Dynamic · rule ${g.ruleState || "?"}` : "Assigned"}${g.memberCount != null ? ` · ${g.memberCount.toLocaleString()} members` : ""}`,
        `- Verdict: **${g.verdict}** — ${g.why}`,
        ...(g.refs.length ? [`- Conditional Access: ${g.refs.map((r) => `${r.how} in ${r.name} (${r.state})`).join("; ")}`] : ["- Not referenced by any active Conditional Access policy"]),
        ...(g.rule ? ["", "```", g.rule, "```"] : []), "");
    }
    L.push("## Conditional Access reach", "",
      res.target ? `Policies that reach the accounts in **${res.target.name}** and carry a control Teams devices cannot satisfy: **${s.caBreaks}** (${s.caBreaksOn} enforced). ${s.caExcluded} polic${s.caExcluded === 1 ? "y excludes" : "ies exclude"} the group.` : "No target group — every All-users policy reaches the device accounts.", "",
      "| Policy | State | Reaches devices | Unsupported controls |", "|---|---|---|---|",
      ...res.ca.filter((r) => r.verdict !== "out of scope").map((r) => `| ${r.name} | ${r.state} | ${r.excludesTarget ? "no — excluded" : r.reaches ? "yes" : "no"} | ${r.unsupported.join("; ") || (r.block ? "block — check the devices' trusted locations / platforms" : "—")} |`),
      "", "## Sources", "",
      "- [Supported Conditional Access policies for Teams Rooms and Teams Android devices](https://learn.microsoft.com/microsoftteams/rooms/supported-ca-and-compliance-policies)",
      "- [Conditional Access best practices for Teams Rooms and panels](https://learn.microsoft.com/microsoftteams/rooms/conditional-access-and-compliance-for-devices)",
      "- [Product names and service plan identifiers for licensing](https://learn.microsoft.com/entra/identity/users/licensing-service-plan-reference)",
      "- [Teams Shared Space licensing](https://learn.microsoft.com/microsoftteams/teams-add-on-licensing/teams-shared-device-license)",
      "- [Dynamic membership rules — assignedPlans](https://learn.microsoft.com/entra/identity/users/groups-dynamic-membership#rules-with-complex-expressions)");
    return L.join("\n");
  }

  return { CATALOG, TRAPS, DEVICE_SKUS, USER_SKUS, SUITE_SKUS, SUITE_MARKERS, KIND_LABEL, CANONICAL, ALIASES, RULE_MAX, UNSUPPORTED,
    buildRule, catalogRule, clause, prefixClause, notClause, skuKind, classifySkus, rulePlans, isAlias, caRows, analyze, toMd };
})();
