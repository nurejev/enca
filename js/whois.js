// ======================================================================
// 🕵 Who is Anna to CA (T36, BETA) — one user, the whole Conditional
// Access picture on one screen.
//
// The question a service desk gets is never "which policies target group X"
// — it is "why can't Anna sign in" or "is Anna in the wave yet". Answering
// it today takes four tools: ⚖ Compare users for the include/exclude
// resolution, 🔗 User or Group analyzer for the memberships, 🚦 Sign-in
// failures for what actually happened to her and 🎚 Report-only impact for
// what will happen to her. This module composes those four answers for a
// single user and adds the one thing none of them frames: WHERE SHE IS IN
// THE ROLLOUT — which of the active baseline's deployment groups
// (CAD-SEC-U-DG-*) she is in, how she got there (direct, or nested via
// which parent), and which exclusion groups take her back out of an
// enforced policy.
//
// Pure functions over data the app hands in. The Graph reads live in
// app.js next to the other tools so the sign-in window cache and the
// consent prompts are shared; nothing here writes.
//
//   WhoIs.analyze({ user, vms, records, cat, dgPresent })  → res
//   WhoIs.render(res, opts)                                 → html
//   WhoIs.toMd(res, meta)                                   → markdown
//
// user     the shape Comparer.resolveUser returns, plus (optional)
//          direct:Set of direct group ids, via:{groupId:[parentName]},
//          dept, title, licence:{p1,p2,p1grace,lic0}|null, methods:[]|null
// vms      the app's policy view models (ALL states — Off is shown too, as
//          "becomes real when switched On")
// records  raw sign-in records for THIS user in the window (already filtered)
// cat      Baseline.active() — for the DG list, persona groups, exclusion
//          convention; null-safe
// dgPresent Map name(lower) → group | null: which DG groups the tenant has
// ======================================================================
const WhoIs = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const lc = (s) => String(s || "").toLowerCase();

  const STATE = { enabled: "on", enabledForReportingButNotEnforced: "ro", disabled: "off" };
  const STATE_LABEL = { on: "On", ro: "Report-only", off: "Off" };

  // ---------------------------------------------------------- lookup --
  // Like Comparer.buildLookup, but keeps Off policies and the CA number.
  // `seq` is the BASELINE's number — CA012 in "(NEW)CA012-BLOCK-…" — not
  // ENCA's running seq (CA001 = the first policy alphabetically): the person
  // reading this knows their policies by the number in the name, and a card
  // saying "from CA042, CA072" for policies called CA1001 and CA201 read as
  // a mismatch (0.6, same rule as 👥 CA groups 5.9.6). No number in the name
  // → empty, and every place that prints it falls back to the full name.
  const caNumOf = (name) => { const m = String(name || "").match(/\bCA\d{3,4}[A-Za-z]?\b/); return m ? m[0] : ""; };
  function buildLookup(vms) {
    return (vms || []).map((vm) => {
      const p = vm.raw || {}, u = ((p.conditions || {}).users) || {};
      return {
        id: p.id, name: p.displayName || vm.name || p.id, seq: caNumOf(p.displayName || vm.name), state: STATE[p.state] || "off",
        includeAll: (u.includeUsers || []).includes("All"),
        incUsers: new Set((u.includeUsers || []).filter((x) => x !== "All" && x !== "None" && x !== "GuestsOrExternalUsers")),
        excUsers: new Set((u.excludeUsers || []).filter((x) => x !== "GuestsOrExternalUsers")),
        incGroups: u.includeGroups || [], excGroups: u.excludeGroups || [],
        incRoles: u.includeRoles || [], excRoles: u.excludeRoles || [],
        incGuests: !!u.includeGuestsOrExternalUsers || (u.includeUsers || []).includes("GuestsOrExternalUsers"),
        excGuests: !!u.excludeGuestsOrExternalUsers || (u.excludeUsers || []).includes("GuestsOrExternalUsers"),
        controls: (vm.grant && vm.grant.controls) || [],
        op: (vm.grant && vm.grant.op) || "",
        // the raw grant ids — the labels above are for reading, these are
        // for deciding: approvedApplication is the control Microsoft retired
        // on 30 June 2026 (the policy is read-only since), compliantApplication
        // its replacement, compliantDevice the other half of the usual OR
        builtIn: (((p.grantControls || {}).builtInControls) || []).map((x) => String(x)),
        retired: (((p.grantControls || {}).builtInControls) || []).some((x) => /^approvedApplication$/i.test(String(x))),
        session: (vm.session || []).map((x) => (x && typeof x === "object") ? x.t : x).filter(Boolean),
        block: ((vm.grant && vm.grant.controls) || []).some((c) => /^block/i.test(String(c))),
        // risk-based = needs Entra ID P2 on every targeted user
        risk: !!(((p.conditions || {}).userRiskLevels || []).length || ((p.conditions || {}).signInRiskLevels || []).length || ((p.conditions || {}).insiderRiskLevels || []).length),
        userRisk: ((p.conditions || {}).userRiskLevels || []).map(lc), signInRisk: ((p.conditions || {}).signInRiskLevels || []).map(lc),
        // insiderRiskLevels is a comma-separated STRING on the wire ("minor,moderate"), not an array like the other two
        insiderRisk: (() => { const ir = (p.conditions || {}).insiderRiskLevels; return (Array.isArray(ir) ? ir : String(ir || "").split(",")).map((x) => lc(String(x).trim())).filter(Boolean); })(),
      };
    });
  }

  // How the user got into a group: "direct", "nested via X", or "member"
  // when the app could not read the direct list.
  function howOf(u, gid) {
    if (!u.direct) return "member";
    if (u.direct.has(gid)) return "direct";
    const via = (u.via && u.via[gid]) || [];
    return via.length ? `nested via ${via.join(", ")}` : "nested";
  }

  // Assignment state of one policy for the user — Comparer.stateFor with the
  // INCLUDE reason added, because "reaches her via DG-INT" is the whole point.
  function stateFor(P, u) {
    const name = (id) => u.names[id] || id;
    let why = null;
    if (P.includeAll) why = { kind: "all", text: "All users" };
    else if (P.incUsers.has(u.id)) why = { kind: "user", text: "named directly" };
    else {
      const g = P.incGroups.find((x) => u.groupIds.has(x));
      if (g) why = { kind: "group", id: g, text: name(g), how: howOf(u, g) };
      else {
        const r = P.incRoles.find((x) => u.roleIds.has(x));
        if (r) why = { kind: "role", id: r, text: name(r) };
        else if (P.incGuests && u.guest) why = { kind: "guest", text: "guest / external user type" };
      }
    }
    if (!why) return { s: "na" };
    if (P.excUsers.has(u.id)) return { s: "exc", inc: why, exc: { kind: "user", text: "named directly in the exclusions" } };
    const g = P.excGroups.find((x) => u.groupIds.has(x));
    if (g) return { s: "exc", inc: why, exc: { kind: "group", id: g, text: name(g), how: howOf(u, g) } };
    const r = P.excRoles.find((x) => u.roleIds.has(x));
    if (r) return { s: "exc", inc: why, exc: { kind: "role", id: r, text: name(r) } };
    if (P.excGuests && u.guest) return { s: "exc", inc: why, exc: { kind: "guest", text: "guest / external user type" } };
    return { s: "inc", inc: why };
  }

  // ------------------------------------------------- deployment groups --
  // The active baseline's deploy groups and persona (production) groups,
  // each with: does the tenant have it, is the user in it, how.
  function ladderOf(u, cat, dgPresent) {
    const byName = new Map();
    u.groupIds.forEach((id) => byName.set(lc(u.names[id] || id), id));
    const present = dgPresent || new Map();
    const rung = (name, kind) => {
      const key = lc(name);
      const gid = byName.get(key);
      const has = present.has(key) ? !!present.get(key) : (gid ? true : null);   // null = not checked
      return { name, kind, exists: has, inMember: !!gid, id: gid || (present.get(key) || {}).id || null, how: gid ? howOf(u, gid) : "" };
    };
    const deploy = ((cat && cat.predefined) || []).filter((n) => /-DG-/i.test(n)).map((n) => rung(n, "deploy"));
    const persona = ((cat && cat.personaGroups) || []).filter((p) => p.group).map((p) => ({ ...rung(p.group, "persona"), label: p.label }));
    return { deploy, persona, hasDg: deploy.length > 0 };
  }

  // The exclusion groups the user is in: every group of hers that some policy
  // names in its EXCLUDE list, with the policies it takes her out of. The
  // baseline's own naming convention is a second, weaker signal (a
  // convention-named group no policy references any more is reported as
  // dangling rather than dropped).
  function exclusionsOf(u, lookup, cat) {
    const isConv = (n) => { try { return !!(cat && cat.isExclusionGroup && cat.isExclusionGroup(n)); } catch { return false; } };
    const out = new Map();
    lookup.forEach((P) => P.excGroups.forEach((g) => {
      if (!u.groupIds.has(g)) return;
      if (!out.has(g)) out.set(g, { id: g, name: u.names[g] || g, how: howOf(u, g), policies: [], convention: isConv(u.names[g] || "") });
      out.get(g).policies.push({ id: P.id, seq: P.seq, name: P.name, state: P.state, targeted: stateFor(P, u).s !== "na" });
    }));
    u.groupIds.forEach((g) => {
      const n = u.names[g] || "";
      if (isConv(n) && !out.has(g)) out.set(g, { id: g, name: n, how: howOf(u, g), policies: [], convention: true, dangling: true });
    });
    return [...out.values()].map((x) => ({
      ...x,
      // a bypass = she is excluded from a policy that is ON and would otherwise reach her
      bypass: x.policies.some((p) => p.state === "on" && p.targeted),
    })).sort((a, b) => (b.bypass - a.bypass) || a.name.localeCompare(b.name));
  }

  // --------------------------------------------------------- sign-ins --
  // records → enforced failures/interrupts (Signins.parse) + the user's
  // report-only row (ReportImpact.build), both scoped to this user already.
  function logOf(records, userId, roPolicies, lookup) {
    const recs = (records || []).filter((r) => !userId || r.userId === userId);
    const rows = recs.map((r) => Signins.parse(r, "enforced")).filter(Boolean)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const blocked = rows.filter((r) => !r.interrupted).length;
    const interrupted = rows.length - blocked;
    const perPolicy = new Map();   // policy id → { blocked, interrupted }
    rows.forEach((r) => r.policies.forEach((p) => {
      const k = p.id || p.name;
      if (!perPolicy.has(k)) perPolicy.set(k, { blocked: 0, interrupted: 0 });
      perPolicy.get(k)[p.result === "interrupted" ? "interrupted" : "blocked"]++;
    }));
    // The records are this user's already, so the cross-policy user row is
    // the first (and only) one; a UPN that changed mid-window would make two,
    // which are folded here rather than losing one.
    let ro = null;
    try {
      const b = ReportImpact.build(recs, roPolicies || []);
      const us = b.users || [];
      if (us.length === 1) ro = us[0];
      else if (us.length > 1) {
        const pm = new Map();
        us.forEach((x) => x.policies.forEach((p) => {
          const k = p.id || p.key;
          if (!pm.has(k)) pm.set(k, { ...p, denyWhy: [...(p.denyWhy || [])], riskWhy: [...(p.riskWhy || [])], samples: [...(p.samples || [])] });
          else { const t = pm.get(k); t.success += p.success; t.interrupted += p.interrupted; t.failure += p.failure; t.denyWhy = t.denyWhy.concat(p.denyWhy || []); t.riskWhy = t.riskWhy.concat(p.riskWhy || []); }
        }));
        ro = { ...us[0], policies: [...pm.values()] };
      }
    } catch (e) { console.warn("whois: report-only build failed", e && e.message); }
    const failedIds = new Set(rows.map((r) => r.id));
    // How often each report-only policy was EVALUATED on her sign-ins and
    // found out of scope (reportOnlyNotApplied). ReportImpact drops those —
    // rightly, for impact — but for one person "no data" and "evaluated
    // 7,000 times, her sign-ins never matched its conditions" are opposite
    // answers, and the card said the first while the second was true.
    const roEval = new Map();
    recs.forEach((r) => (r.appliedConditionalAccessPolicies || []).forEach((p) => {
      if (!/^reportOnly/i.test(String(p.result || ""))) return;
      const k = p.id || p.displayName;
      const e = roEval.get(k) || roEval.set(k, { total: 0, notApplied: 0 }).get(k);
      e.total++; if (/notApplied/i.test(String(p.result))) e.notApplied++;
    }));
    return { rows, total: recs.length, passed: recs.filter((r) => !failedIds.has(r.id)).length, blocked, interrupted, perPolicy, ro, roEval, devices: devicesOf(recs, failedIds), mfa: mfaOf(recs, lookup) };
  }

  // The devices she signed in from, and what Conditional Access saw of each:
  // compliant (managed by Intune and passing its policy), managed but NOT
  // compliant, registered or joined but not managed, or unmanaged — nothing
  // Entra knows about. One row per device: the Entra device id when the
  // record carries one, else the device name, else OS + browser (a browser
  // sign-in from an unregistered laptop has no id and no name).
  const DEV_STATE = {
    compliant:  { label: "Compliant",                 cls: "ok",  note: "managed by Intune and compliant" },
    managed:    { label: "Managed, not compliant",    cls: "int", note: "managed by Intune, failing its compliance policy — a compliant-device grant blocks it" },
    registered: { label: "Registered, not managed",   cls: "int", note: "known to Entra (registered or joined) but not managed by Intune — a compliant-device grant blocks it" },
    unmanaged:  { label: "Unmanaged",                 cls: "blk", note: "nothing Entra knows about — a compliant-device grant blocks it, and a device filter cannot see it" },
  };
  const devStateOf = (dd) => dd.isCompliant ? "compliant" : dd.isManaged ? "managed" : dd.trustType ? "registered" : "unmanaged";
  function devicesOf(recs, failedIds) {
    const out = new Map();
    recs.forEach((r) => {
      const dd = r.deviceDetail || {};
      const key = dd.deviceId || dd.displayName || `${dd.operatingSystem || ""}|${dd.browser || ""}`;
      if (!out.has(key)) out.set(key, { id: dd.deviceId || "", name: dd.displayName || "", os: dd.operatingSystem || "", browser: dd.browser || "", trustType: dd.trustType || "", managed: !!dd.isManaged, compliant: !!dd.isCompliant, state: devStateOf(dd), count: 0, stopped: 0, last: "", apps: new Map() });
      const d = out.get(key);
      d.count++;
      if (failedIds.has(r.id)) d.stopped++;
      if (String(r.createdDateTime || "") > d.last) { d.last = r.createdDateTime || ""; d.state = devStateOf(dd); d.compliant = !!dd.isCompliant; d.managed = !!dd.isManaged; }
      const app = r.appDisplayName || r.resourceDisplayName || ""; if (app) d.apps.set(app, (d.apps.get(app) || 0) + 1);
    });
    const rows = [...out.values()].map((d) => ({ ...d, apps: [...d.apps.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a) }))
      .sort((a, b) => b.count - a.count);
    const by = { compliant: 0, managed: 0, registered: 0, unmanaged: 0 };
    rows.forEach((d) => { by[d.state] += d.count; });
    return { rows, by, total: recs.length };
  }

  // -------------------------------------------------------------- mfa --
  // "He keeps getting the Authenticator prompt on app X — which policy?"
  // The stopped-sign-ins table cannot answer it: a prompt the user COMPLETES
  // is a successful sign-in. So, per app, from her own records: the sign-ins
  // where MFA was required, which applied policies demanded it (result
  // success + an MFA / authentication-strength grant), and whether the MFA
  // was a FRESH prompt or a claim already in the token — the record's
  // authenticationDetails say which (Graph only; hunting rows carry the
  // requirement but not the steps, and are counted as "not known").
  const MFA_CTRL = /mfa|auth(entication)?.?strength/i;
  const isClaim = (t) => /claim in the token|satisfied by claim|already satisfied|previously satisfied/i.test(String(t || ""));
  const mfaStepOf = (rec) => {
    const steps = rec.authenticationDetails;
    if (!Array.isArray(steps)) return "unknown";
    const mfa = steps.filter((st) => /multi|mfa|second/i.test(String(st.authenticationStepRequirement || "")) || /mfa|authenticator|passkey|fido|hello|phone|sms|oath|text message|voice/i.test(String(st.authenticationMethod || "")));
    if (!mfa.length) return "unknown";
    if (mfa.some((st) => isClaim(st.authenticationStepResultDetail))) return "claim";
    if (mfa.some((st) => st.succeeded === true || /completed|success|verified/i.test(String(st.authenticationStepResultDetail || "")))) return "fresh";
    return "unknown";
  };
  function mfaOf(recs, lookup) {
    const byId = new Map((lookup || []).map((P) => [P.id, P]));
    const apps = new Map();
    const tot = { total: recs.length, required: 0, fresh: 0, claim: 0, unknown: 0, devices: new Set(), freshDevices: new Set(), policies: new Map() };
    recs.forEach((r) => {
      if (r.authenticationRequirement !== "multiFactorAuthentication") return;
      tot.required++;
      const how = mfaStepOf(r);
      tot[how]++;
      const dd = r.deviceDetail || {};
      const dev = dd.displayName || dd.deviceId || `${dd.operatingSystem || ""}|${dd.browser || ""}`;
      tot.devices.add(dev);
      if (how === "fresh") tot.freshDevices.add(dev);
      const demanded = (r.appliedConditionalAccessPolicies || []).filter((p) => p.result === "success" && [...(p.enforcedGrantControls || [])].some((c) => MFA_CTRL.test(String(c))));
      const app = r.appDisplayName || r.resourceDisplayName || "(app)";
      const a = apps.get(app) || apps.set(app, { app, required: 0, fresh: 0, claim: 0, unknown: 0, policies: new Map(), devices: new Set(), freshDevices: new Set(), lastFresh: "", last: "" }).get(app);
      a.required++; a[how]++;
      a.devices.add(dev); if (how === "fresh") { a.freshDevices.add(dev); if (String(r.createdDateTime || "") > a.lastFresh) a.lastFresh = r.createdDateTime || ""; }
      if (String(r.createdDateTime || "") > a.last) a.last = r.createdDateTime || "";
      demanded.forEach((p) => {
        const P = byId.get(p.id);
        const key = p.id || p.displayName;
        const e = a.policies.get(key) || a.policies.set(key, { id: p.id, name: (P && P.name) || p.displayName || p.id, seq: P ? P.seq : "", controls: new Set(), n: 0, fresh: 0 }).get(key);
        e.n++; if (how === "fresh") e.fresh++; (p.enforcedGrantControls || []).forEach((c) => e.controls.add(String(c)));
        const t = tot.policies.get(key) || tot.policies.set(key, { id: p.id, name: e.name, seq: e.seq, n: 0, fresh: 0 }).get(key);
        t.n++; if (how === "fresh") t.fresh++;
      });
    });
    const rows = [...apps.values()].map((a) => ({ ...a, policies: [...a.policies.values()].map((e) => ({ ...e, controls: [...e.controls] })).sort((x, y) => y.n - x.n), devices: a.devices.size, freshDevices: a.freshDevices.size }))
      .sort((x, y) => y.fresh - x.fresh || y.required - x.required);
    return { ...tot, devices: tot.devices.size, freshDevices: tot.freshDevices.size, policies: [...tot.policies.values()].sort((x, y) => y.n - x.n), apps: rows };
  }

  // ---------------------------------------------------------- retired --
  // "Require approved client app" was retired on 30 June 2026: a policy that
  // carries it is READ-ONLY (enforced until disabled, never editable), and
  // the day it is replaced by "Require app protection policy" — or the
  // control is simply removed — everyone who satisfied the policy THROUGH
  // the approved app (a mobile app on a device that is not compliant) is
  // blocked unless an Intune app protection policy already reaches them.
  // From her own records: per retired policy that reaches her, the sign-ins
  // it let through on the approved-app path; and whether any sign-in shows
  // an app protection policy already satisfied (a compliantApplication grant
  // met on a non-compliant device) — the evidence the replacement will pass.
  const isMobile = (rec) => /android|ios|ipad|iphone/i.test(String((rec.deviceDetail || {}).operatingSystem || ""));
  function retiredOf(recs, lookup, rows) {
    const reach = (rows || []).filter((r) => r.s === "inc" && r.state !== "off");
    const retired = reach.filter((r) => r.retired);
    const appPols = new Set((lookup || []).filter((P) => (P.builtIn || []).some((x) => /^compliantApplication$/i.test(x))).map((P) => P.id));
    const out = retired.map((P) => {
      const hasDev = (P.builtIn || []).some((x) => /^(compliantDevice|domainJoinedDevice)$/i.test(x));
      const hasApp = (P.builtIn || []).some((x) => /^compliantApplication$/i.test(x));
      const hits = recs.filter((r) => (r.appliedConditionalAccessPolicies || []).some((ap) => ap.id === P.id && /^(success|reportOnlySuccess)$/i.test(String(ap.result || "")))
        && !(hasDev && (r.deviceDetail || {}).isCompliant === true));   // through the device half → not the approved-app path
      const apps = new Map(), devices = new Set(); let last = "";
      hits.forEach((r) => { const a = r.appDisplayName || r.resourceDisplayName || "(app)"; apps.set(a, (apps.get(a) || 0) + 1); const dd = r.deviceDetail || {}; devices.add(dd.displayName || dd.deviceId || `${dd.operatingSystem || ""}|${dd.browser || ""}`); if (String(r.createdDateTime || "") > last) last = r.createdDateTime || ""; });
      return { id: P.id, name: P.name, seq: P.seq, state: P.state, hasDev, hasApp, viaApp: hits.length, mobile: hits.filter(isMobile).length, apps: [...apps.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => ({ app: a, n })), devices: devices.size, last };
    });
    // evidence of an app protection policy already working for her
    const appOk = recs.filter((r) => (r.appliedConditionalAccessPolicies || []).some((ap) => appPols.has(ap.id) && /^(success|reportOnlySuccess)$/i.test(String(ap.result || "")) && [...(ap.enforcedGrantControls || [])].some((c) => /compliantapp|appprotection|RequireCompliantApp/i.test(String(c)))) && (r.deviceDetail || {}).isCompliant !== true).length;
    const relies = out.filter((x) => x.viaApp > 0);
    const verdict = !retired.length ? "none" : !relies.length ? "clear" : appOk ? "ready" : "exposed";
    return { policies: out, relies, appOk, verdict, appPolicies: appPols.size };
  }

  // ------------------------------------------------------------- risk --
  // Identity Protection, two sources. The sign-in records already carry the
  // risk fields (the read has no $select), so risky sign-ins cost nothing
  // extra; the USER's risk state and the detections behind it are an
  // optional read (IdentityRiskyUser.Read.All + IdentityRiskEvent.Read.All)
  // held on user.risk — null = not read, { err } = refused, else the record.
  const RISK_ORDER = { none: 0, hidden: 0, low: 1, medium: 2, high: 3 };
  const riskLevelOf = (r) => {
    const a = lc(r.riskLevelAggregated), d = lc(r.riskLevelDuringSignIn);
    return (RISK_ORDER[a] || 0) >= (RISK_ORDER[d] || 0) ? (a || d || "none") : d;
  };
  function riskOf(records, userId, user, lookup) {
    const recs = (records || []).filter((r) => !userId || r.userId === userId);
    const rows = recs.filter((r) => (RISK_ORDER[riskLevelOf(r)] || 0) > 0 || /^(atRisk|confirmedCompromised)$/i.test(String(r.riskState || "")))
      .map((r) => ({
        id: r.id, when: r.createdDateTime, app: r.appDisplayName || r.resourceDisplayName || "(app)",
        level: riskLevelOf(r), state: r.riskState || "", detail: r.riskDetail || "",
        types: r.riskEventTypes_v2 || r.riskEventTypes || [],
        ip: r.ipAddress || "", city: (r.location || {}).city || "", country: (r.location || {}).countryOrRegion || "",
        caStatus: r.conditionalAccessStatus || "",
      })).sort((a, b) => String(b.when).localeCompare(String(a.when)));
    const byLevel = { high: 0, medium: 0, low: 0 };
    rows.forEach((r) => { if (r.level in byLevel) byLevel[r.level]++; });
    const worst = rows.reduce((m, r) => (RISK_ORDER[r.level] || 0) > (RISK_ORDER[m] || 0) ? r.level : m, "none");
    const ur = user && user.risk && !user.risk.err ? user.risk : null;
    const atRisk = !!ur && /^(atRisk|confirmedCompromised)$/i.test(String(ur.state || ""));
    // the risk-based policies that REACH her — the same stateFor() the
    // policies table uses, so a policy she is not targeted by, or is excluded
    // from, is not listed as reaching her (0.5.1: 0.5 listed every risk
    // policy in the tenant, twenty rows for a user five of them targeted) —
    // and whether they fire on what Identity Protection says about her now
    const allRisk = (lookup || []).filter((P) => P.risk && P.state !== "off");
    const policies = allRisk.filter((P) => stateFor(P, user).s === "inc").map((P) => ({
      id: P.id, name: P.name, seq: P.seq, state: P.state, userRisk: P.userRisk, signInRisk: P.signInRisk, insiderRisk: P.insiderRisk || [],
      firesNow: atRisk && P.userRisk.includes(lc(ur.level)),
      firesOnSignIn: P.signInRisk.some((l) => byLevel[l] > 0),
    }));
    const notReaching = { excluded: allRisk.filter((P) => stateFor(P, user).s === "exc").length, na: allRisk.filter((P) => stateFor(P, user).s === "na").length };
    return { read: !!(user && user.risk), err: user && user.risk && user.risk.err || "", user: ur, atRisk, signIns: rows, byLevel, worst, total: recs.length, policies, notReaching };
  }

  // ---------------------------------------------------------- analyze --
  function analyze({ user, vms, records, cat, dgPresent, days }) {
    const lookup = buildLookup(vms);
    const ladder = ladderOf(user, cat, dgPresent);
    const exclusions = exclusionsOf(user, lookup, cat);
    const roPolicies = lookup.filter((P) => P.state === "ro").map((P) => ({ id: P.id, name: P.name }));
    const log = records ? logOf(records, user.id, roPolicies, lookup) : null;
    const roByPolicy = new Map();
    if (log && log.ro) log.ro.policies.forEach((p) => roByPolicy.set(p.id || p.key, p));

    const rows = lookup.map((P) => {
      const st = stateFor(P, user);
      const cnt = log ? (log.perPolicy.get(P.id) || null) : null;
      let fc = P.state === "ro" && log ? (roByPolicy.get(P.id) || { success: 0, interrupted: 0, failure: 0, nodata: true }) : null;
      if (fc && fc.nodata && log.roEval && log.roEval.get(P.id) && log.roEval.get(P.id).notApplied) fc = { ...fc, nodata: false, scoped: true, notApplied: log.roEval.get(P.id).notApplied, evaluated: log.roEval.get(P.id).total };
      return { ...P, ...st, log: cnt, forecast: fc };
    }).sort((a, b) => {
      const o = { inc: 0, exc: 1, na: 2 };
      return (o[a.s] - o[b.s]) || (a.seq || "").localeCompare(b.seq || "") || a.name.localeCompare(b.name);
    });
    const reach = rows.filter((r) => r.s === "inc");
    const counts = {
      total: rows.length, reach: reach.length, excluded: rows.filter((r) => r.s === "exc").length, na: rows.filter((r) => r.s === "na").length,
      on: reach.filter((r) => r.state === "on").length, ro: reach.filter((r) => r.state === "ro").length, off: reach.filter((r) => r.state === "off").length,
    };
    // Where she is in the rollout: the highest deploy rung she is in, in the
    // baseline's own order; else the persona group; else nothing.
    const inDeploy = ladder.deploy.filter((r) => r.inMember);
    const inPersona = ladder.persona.filter((r) => r.inMember);
    const stage = inDeploy.length ? { kind: "deploy", groups: inDeploy } : inPersona.length ? { kind: "persona", groups: inPersona } : { kind: "none", groups: [] };
    // Forecast verdict: worst case over her report-only policies.
    let forecast = null;
    if (log) {
      const ro = log.ro;
      const block = ro ? ro.policies.filter((p) => p.failure) : [];
      const prompt = ro ? ro.policies.filter((p) => !p.failure && p.interrupted) : [];
      const scoped = rows.filter((r) => r.state === "ro" && r.s === "inc" && r.forecast && r.forecast.scoped);
      const silent = rows.filter((r) => r.state === "ro" && r.s === "inc" && r.forecast && r.forecast.nodata);
      forecast = { worst: block.length ? "block" : prompt.length ? "prompt" : (ro && ro.policies.length) ? "clean" : (scoped.length && !silent.length) ? "scoped" : "nodata", block, prompt, scoped, silent, roCount: counts.ro };
    }
    const risk = riskOf(records, user.id, user, lookup);
    const retired = records ? retiredOf(records.filter((r) => !user.id || r.userId === user.id), lookup, rows) : null;
    return { user, days: days || null, ladder, exclusions, rows, counts, stage, log, forecast, risk, retired, bypasses: exclusions.filter((x) => x.bypass) };
  }

  // ----------------------------------------------------------- render --
  const dot = (cls) => `<span class="wo-dot ${cls}"></span>`;
  const stateHtml = (st) => `<span class="wo-state ${st}">${dot(st)}${STATE_LABEL[st]}</span>`;
  const pill = (n, cls) => `<span class="pill ${n ? cls : "zero"}">${n}</span>`;
  const polLink = (r) => `<span class="pol-link" data-polid="${esc(r.id)}">${r.seq ? `<b>${esc(r.seq)}</b> ` : ""}${esc(r.name)}</span>`;
  // "nested via X" is the line that matters: she is in the group because
  // somebody put her in X, and whoever manages X decides — so it is marked,
  // not muted, wherever a group reason is written
  const howHtml = (how) => !how || how === "member" ? "" : /^nested/.test(how) ? ` <span class="wo-nest">↪ ${esc(how)}</span>` : ` <span class="mini muted">· ${esc(how)}</span>`;
  const whyHtml = (w) => {
    if (!w) return "";
    if (w.kind === "group") return `<b>${esc(w.text)}</b>${howHtml(w.how)}`;
    if (w.kind === "role") return `role <b>${esc(w.text)}</b>`;
    return `<b>${esc(w.text)}</b>`;
  };
  const fmtWhen = (iso) => { try { const d = new Date(iso); return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }); } catch { return String(iso || ""); } };
  const controlsHtml = (r) => {
    const c = (r.controls || []).map((x) => `<span class="ctrl${/^block/i.test(String(x)) ? " block" : ""}${/approved client app/i.test(String(x)) ? " ret" : ""}" ${/approved client app/i.test(String(x)) ? 'title="Retired by Microsoft on 30 June 2026 — the policy is read-only: it enforces until disabled and cannot be edited"' : ""}>${esc(x)}</span>`);
    if (r.retired) c.push('<span class="tag block" title="Carries the retired Require approved client app control — read-only since 30 June 2026, recreate rather than edit">read-only · retired control</span>');
    const s = (r.session || []).map((x) => `<span class="ctrl">${esc(x)}</span>`);
    return c.concat(s).join(r.op && c.length > 1 ? `<span class="mini muted"> ${esc(r.op)} </span>` : "") || '<span class="mini muted">—</span>';
  };

  function forecastHtml(fc) {
    if (!fc) return '<span class="mini muted">—</span>';
    if (fc.nodata) return '<span class="mini muted">no sign-in evaluated it — no data, not safe</span>';
    if (fc.scoped) return `<span class="mini muted" title="Every evaluation returned report-only: not applied — the policy looked at the sign-in and its conditions did not match">out of scope on her sign-ins — evaluated ${fc.notApplied.toLocaleString()}×, never matched</span>`;
    const tot = (fc.failure || 0) + (fc.interrupted || 0) + (fc.success || 0);
    const w = (n) => tot ? Math.round(n / tot * 100) : 0;
    const bar = `<div class="wo-fbar" title="${fc.failure || 0} would block · ${fc.interrupted || 0} would prompt · ${fc.success || 0} no change"><i class="b" style="width:${w(fc.failure || 0)}%"></i><i class="p" style="width:${w(fc.interrupted || 0)}%"></i><i class="n" style="width:${w(fc.success || 0)}%"></i></div>`;
    const parts = [];
    if (fc.failure) parts.push(`<span class="wo-res wb">would block ×${fc.failure}</span>`);
    if (fc.interrupted) parts.push(`<span class="wo-res wp">prompts ×${fc.interrupted}</span>`);
    if (fc.success && !fc.failure && !fc.interrupted) parts.push(`<span class="wo-res nc">no change ×${fc.success}</span>`);
    else if (fc.success) parts.push(`<span class="mini muted">no change ×${fc.success}</span>`);
    const why = (fc.denyWhy || []).slice(0, 2).map((d) => `${esc(d.what)}${d.n > 1 ? ` ×${d.n}` : ""}`).join("; ");
    return `${bar}${parts.join(" · ")}${why ? `<div class="mini muted">${why}</div>` : ""}`;
  }

  function render(res, opts = {}) {
    const u = res.user, c = res.counts, log = res.log, fc = res.forecast;
    const rangeLabel = opts.rangeLabel || (res.days ? `${res.days} days` : "window");
    const filter = opts.filter || "reach";
    // ---- identity + verdict tiles
    const facts = [];
    facts.push(`<span class="wo-fact">${u.guest ? "Guest" : "Member"} · <b>${u.enabled ? "Enabled" : "Disabled"}</b></span>`);
    if (u.dept) facts.push(`<span class="wo-fact">Department <b>${esc(u.dept)}</b></span>`);
    if (u.title) facts.push(`<span class="wo-fact">${esc(u.title)}</span>`);
    if (u.licence) {
      const L = u.licence;
      const lab = L.p2 ? "Entra ID P2" : L.p1 ? "Entra ID P1" : L.p1grace ? "P1 (seat expired)" : L.lic0 ? "no licences" : "no Entra ID P1/P2";
      facts.push(`<span class="wo-fact${L.p1 ? "" : " warn"}">Licence <b>${esc(lab)}</b></span>`);
      const riskHit = res.rows.some((r) => r.s === "inc" && r.state !== "off" && r.risk);
      if (riskHit && !L.p2) facts.push(`<span class="wo-fact warn">a risk-based policy reaches her — needs <b>P2</b></span>`);
    } else if (u.licence === null) facts.push(`<span class="wo-fact muted">Licence not read</span>`);
    if (u.methods) facts.push(`<span class="wo-fact${u.methods.length ? "" : " warn"}">MFA methods <b>${u.methods.length ? esc(u.methods.join(", ")) : "none registered"}</b></span>`);
    else if (u.methods === null) facts.push(`<span class="wo-fact muted">MFA methods <b>not read</b> <button class="btn sm" data-wo-methods>read</button></span>`);
    facts.push(`<span class="wo-fact">Roles <b>${u.roleIds.size ? esc([...u.roleIds].map((r) => u.names[r] || r).join(", ")) : "none"}</b></span>`);
    facts.push(`<span class="wo-fact">Groups <b>${u.groupIds.size}</b>${u.direct ? ` <span class="muted">(${u.direct.size} direct)</span>` : ""}</span>`);

    const stage = res.stage;
    const stageTile = stage.kind === "deploy"
      ? `<div class="wo-vt ok"><span class="k">Deployment stage</span><span class="v">${esc(stage.groups.map((g) => g.name.replace(/^.*-DG-/i, "")).join(" + "))}</span><span class="s">${esc(stage.groups.map((g) => `${g.name} · ${g.how}`).join(" · "))} · <a href="#" class="md-tool" data-tool="toolWave">🌊 the wave</a></span></div>`
      : stage.kind === "persona"
        ? `<div class="wo-vt"><span class="k">Persona group</span><span class="v">${esc(stage.groups.map((g) => (g.label || g.name).replace(/^\S+\s/, "")).join(" + "))}</span><span class="s">${esc(stage.groups.map((g) => `${g.name} · ${g.how}`).join(" · "))}</span></div>`
        : `<div class="wo-vt ${res.ladder.hasDg ? "warn" : ""}"><span class="k">Deployment stage</span><span class="v">${res.ladder.hasDg ? "Not in a wave" : "No waves"}</span><span class="s">${res.ladder.hasDg ? "in none of the deploy groups — only what targets All users reaches her" : "the active baseline has no deployment groups"}</span></div>`;
    const polTile = `<div class="wo-vt"><span class="k">Policies reaching her</span><span class="v">${c.reach} <span class="of">/ ${c.total}</span></span><span class="s">${c.on} enforced · ${c.ro} report-only · ${c.off} off${c.excluded ? ` · <span class="wo-res wb">${c.excluded} excluded</span>` : ""}</span></div>`;
    const logTile = log
      ? `<div class="wo-vt ${log.rows.length ? "bad" : "ok"}"><span class="k">Sign-ins CA stopped · ${esc(rangeLabel)}</span><span class="v">${log.rows.length}</span><span class="s">${log.blocked} blocked · ${log.interrupted} interrupted · ${log.total} sign-ins read</span></div>`
      : `<div class="wo-vt"><span class="k">Sign-ins CA stopped</span><span class="v muted">—</span><span class="s">sign-in log not read</span></div>`;
    const fcTile = fc
      ? fc.worst === "block"
        ? `<div class="wo-vt bad"><span class="k">If report-only went live</span><span class="v">Locked out</span><span class="s">by ${esc(fc.block.map((p) => p.name).join(", "))}${fc.prompt.length ? ` · prompts from ${fc.prompt.length} more` : ""}</span></div>`
        : fc.worst === "prompt"
          ? `<div class="wo-vt warn"><span class="k">If report-only went live</span><span class="v">Extra prompts</span><span class="s">from ${esc(fc.prompt.map((p) => p.name).join(", "))}</span></div>`
          : fc.worst === "clean"
            ? `<div class="wo-vt ok"><span class="k">If report-only went live</span><span class="v">No change</span><span class="s">her sign-ins already satisfy every report-only policy</span></div>`
            : fc.worst === "scoped"
              ? `<div class="wo-vt ok"><span class="k">If report-only went live</span><span class="v">Nothing for her</span><span class="s">${fc.scoped.length} report-only ${fc.scoped.length === 1 ? "policy reaches" : "policies reach"} her, all evaluated her sign-ins and none matched their conditions</span></div>`
              : `<div class="wo-vt"><span class="k">If report-only went live</span><span class="v muted">No data</span><span class="s">${c.ro ? `${c.ro} report-only ${c.ro === 1 ? "policy reaches" : "policies reach"} her, none evaluated a sign-in in the window` : "no report-only policy reaches her"}</span></div>`
      : `<div class="wo-vt"><span class="k">If report-only went live</span><span class="v muted">—</span><span class="s">sign-in log not read</span></div>`;

    // ---- identity risk tile: the user's Identity Protection state first,
    // the risky sign-ins in the window second, and the risk policy that
    // fires on it named — because "at risk" only matters through CA.
    const rk = res.risk || { read: false, signIns: [], byLevel: {}, policies: [] };
    const RS_LABEL = { atRisk: "At risk", confirmedCompromised: "Compromised", remediated: "Remediated", dismissed: "Dismissed", confirmedSafe: "Confirmed safe", none: "No risk" };
    const capL = (s) => s ? s[0].toUpperCase() + s.slice(1) : "";
    const siBits = rk.signIns.length ? `${rk.signIns.length} risky sign-in${rk.signIns.length === 1 ? "" : "s"} · ${esc(rangeLabel)} (${["high", "medium", "low"].filter((l) => rk.byLevel[l]).map((l) => `${rk.byLevel[l]} ${l}`).join(", ")})` : (log ? `no risky sign-in in ${esc(rangeLabel)}` : "");
    const fires = rk.policies.filter((p) => p.firesNow);
    const firesHtml = fires.length ? ` · fires ${fires.map((p) => polLink(p)).join(", ")}${fires.some((p) => p.state === "ro") ? " (report-only)" : ""}` : "";
    let riskTile;
    if (!rk.read) riskTile = `<div class="wo-vt${rk.signIns.length ? " warn" : ""}"><span class="k">Identity risk</span><span class="v${rk.signIns.length ? "" : " muted"}">${rk.signIns.length ? `${capL(rk.worst)} sign-in risk` : "Not read"}</span><span class="s">${siBits ? `${siBits} · ` : ""}user risk state <button class="btn sm" data-wo-risk>read</button></span></div>`;
    else if (rk.err) riskTile = `<div class="wo-vt${rk.signIns.length ? " warn" : ""}"><span class="k">Identity risk</span><span class="v muted">${rk.signIns.length ? `${capL(rk.worst)} sign-in risk` : "—"}</span><span class="s">${siBits ? `${siBits} · ` : ""}${esc(rk.err)}</span></div>`;
    else {
      const ur = rk.user, st = String(ur.state || "none"), lvl = lc(ur.level) || "none";
      const cls = rk.atRisk ? (lvl === "high" || st === "confirmedCompromised" ? "bad" : "warn") : rk.signIns.length ? "warn" : "ok";
      const v = rk.atRisk ? `${st === "confirmedCompromised" ? "Compromised" : `${capL(lvl)} user risk`}` : (RS_LABEL[st] || capL(st));
      const since = ur.updated ? ` · since ${esc(fmtWhen(ur.updated))}` : "";
      const s = rk.atRisk
        ? `${esc(RS_LABEL[st] || st)}${since}${ur.detail && ur.detail !== "none" ? ` · ${esc(ur.detail)}` : ""}${firesHtml}${siBits ? ` · ${siBits}` : ""}`
        : `${st === "none" ? "not flagged by Identity Protection" : `was ${esc(lvl)}${since}${ur.detail && ur.detail !== "none" ? ` · ${esc(ur.detail)}` : ""}`}${siBits ? ` · ${siBits}` : ""}`;
      riskTile = `<div class="wo-vt ${cls}"><span class="k">Identity risk</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    }

    const head = `<div class="list-card wo-card">
      <div class="wo-who">
        <div class="avatar wo-av">${esc((u.name || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase())}</div>
        <div>
          <div class="wo-name">${esc(u.name)}${u.guest ? ' <span class="tag new">guest</span>' : ""}${u.enabled ? "" : ' <span class="tag block">disabled</span>'}</div>
          <div class="muted">${esc(u.upn)} <span class="uupn">${esc(u.id)}</span></div>
          <div class="wo-facts">${facts.join("")}</div>
        </div>
        <div class="wo-actions">
          <button class="btn sm" data-wo-compare title="Open ⚖ Compare users with this user added — who added her to a group, and how she differs from a colleague">⚖ Compare</button>
          <button class="btn sm" data-wo-whatif title="Open 🧪 What-If with this user filled in">🧪 What-If</button>
          <button class="btn sm" data-wo-groupuse title="Open 🔗 User or Group analyzer — everything outside Conditional Access that points at her">🔗 Analyzer</button>
        </div>
      </div>
      <div class="wo-verdicts wo-5">${stageTile}${polTile}${riskTile}${logTile}${fcTile}</div>
    </div>`;

    // ---- deployment ladder
    const rung = (r) => {
      const cls = r.inMember ? "in" : r.exists === false ? "missing" : "out";
      const st = r.inMember ? `In · <b>${esc(r.how)}</b>` : r.exists === false ? "Not in this tenant" : "Not in";
      return `<div class="wo-rung ${cls}"><span class="g">${dot(r.inMember ? "on" : "na")}${esc(r.name)}${r.label ? ` <span class="mini muted">${esc(r.label.replace(/^\S+\s/, ""))}</span>` : ""}</span><span class="st">${st}</span></div>`;
    };
    const exclRung = (x) => `<div class="wo-rung ${x.bypass ? "excl" : "out"}"><span class="g">${dot(x.bypass ? "off" : "na")}${esc(x.name)}</span>
      <span class="st">Excluded · ${/^nested/.test(x.how) ? `<b class="wo-nest">↪ ${esc(x.how)}</b> <span class="mini muted">— whoever manages that group decides</span>` : `<b>${esc(x.how)}</b>`}</span>
      <span class="mini muted">${x.dangling ? "no policy references this group" : `from ${x.policies.map((p) => `${esc(p.seq || p.name)}${p.state === "on" ? "" : ` (${STATE_LABEL[p.state]})`}`).join(", ")}`}</span></div>`;
    const ladderHtml = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="ladder">🚀 Deployment groups <span class="mini muted">— ${res.ladder.hasDg ? "the ★ active baseline's deploy groups, membership read transitively" : "the ★ active baseline has no deployment groups; its persona groups are shown"}</span></h3>
      ${res.ladder.deploy.length ? `<div class="wo-ladder">${res.ladder.deploy.map(rung).join("")}</div>` : ""}
      ${res.ladder.persona.length ? `<div class="mini muted" style="margin:10px 0 4px">Persona groups (production)</div><div class="wo-ladder">${res.ladder.persona.map(rung).join("")}</div>` : ""}
      ${res.exclusions.length ? `<div class="mini muted" style="margin:10px 0 4px">Exclusion groups she is in</div><div class="wo-ladder">${res.exclusions.map(exclRung).join("")}</div>` : '<p class="mini muted" style="margin-top:10px">She is in no exclusion group.</p>'}
      ${res.bypasses.map((x) => `<div class="wo-callout bad"><b>Standing bypass.</b> She is in <b>${esc(x.name)}</b> (${/^nested/.test(x.how) ? `<span class="wo-nest">↪ ${esc(x.how)}</span> — she was never added to the exclusion group itself` : esc(x.how)}), which takes her out of ${x.policies.filter((p) => p.state === "on" && p.targeted).map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.seq ? `${p.seq} ${p.name}` : p.name)}</span>`).join(", ")} while ${x.policies.filter((p) => p.state === "on" && p.targeted).length === 1 ? "it is" : "they are"} <b>enforced</b>. Who put her there and when: <a href="#" class="md-tool" data-tool="toolCompare">⚖ Compare users</a> shows the membership next to a colleague's; <a href="#" class="md-tool" data-tool="toolAudit">🕓 Change audit</a> has the group change if it is inside the retention window.</div>`).join("")}
      ${stage.kind === "none" && res.ladder.hasDg ? `<div class="wo-callout"><b>Not in a wave.</b> None of the deploy groups has her, so only policies scoped to <b>All users</b> (or a role / another group) reach her. If she is supposed to be in the rollout, add her through <a href="#" class="md-tool" data-tool="toolCaGroups">👥 Conditional Access groups</a>.</div>` : ""}
    </div>`;

    // ---- policies table
    const chips = [
      ["reach", `Reaches her ${pill(c.reach, "green")}`], ["exc", `Excluded ${pill(c.excluded, "red")}`], ["na", `Not targeted ${pill(c.na, "zero")}`], ["all", `All ${pill(c.total, "zero")}`],
    ].map(([k, l]) => `<button class="fchip${filter === k ? " active" : ""}" data-wo-filter="${k}">${l}</button>`).join("");
    // Second chip row: the policy STATE. The two rows compose (reaches her ×
    // enforced), and the counts on the state chips follow the first row so
    // they say how many of what you are looking at are in each state.
    const byAssign = res.rows.filter((r) => filter === "all" || (filter === "reach" ? r.s === "inc" : filter === "exc" ? r.s === "exc" : r.s === "na"));
    const sfilter = opts.stateFilter || "any";
    const sCount = (st) => byAssign.filter((r) => r.state === st).length;
    const stateChips = [
      ["any", `Any state ${pill(byAssign.length, "zero")}`], ["on", `${dot("on")}Enforced ${pill(sCount("on"), "green")}`], ["ro", `${dot("ro")}Report-only ${pill(sCount("ro"), "amber")}`], ["off", `${dot("off")}Off ${pill(sCount("off"), "zero")}`],
    ].map(([k, l]) => `<button class="fchip${sfilter === k ? " active" : ""}" data-wo-sfilter="${k}">${l}</button>`).join("");
    const shown = byAssign.filter((r) => sfilter === "any" || r.state === sfilter);
    const via = (r) => r.s === "inc" ? whyHtml(r.inc)
      : r.s === "exc" ? `<span class="wo-ex"><b>EXCLUDED</b> · ${whyHtml(r.exc)}</span><div class="mini muted">would reach her via ${whyHtml(r.inc)}</div>`
        : '<span class="mini muted">not targeted</span>';
    const logCell = (r) => !log ? '<span class="mini muted">—</span>'
      : !r.log ? (r.state === "off" ? '<span class="mini muted">no verdicts (Off)</span>' : pill(0, "zero"))
        : `${r.log.blocked ? `${pill(r.log.blocked, "red")} blocked` : ""}${r.log.blocked && r.log.interrupted ? " · " : ""}${r.log.interrupted ? `${pill(r.log.interrupted, "amber")} interrupted` : ""}`;
    const tbl = `<div class="list-card wo-card">
      <h3 class="wo-h" data-wo-fold="policies">📋 Policies and how they reach her</h3>
      <div class="chip-filter" style="margin:8px 0 6px">${chips}</div>
      <div class="chip-filter" style="margin:0 0 10px">${stateChips}</div>
      <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>State</th><th>Reaches her via</th><th>Controls</th><th>Log · ${esc(rangeLabel)}</th><th>Forecast</th></tr></thead><tbody>
        ${shown.map((r) => `<tr class="${r.s === "exc" ? "wo-exrow" : r.state === "off" ? "wo-dim" : ""}"><td>${polLink(r)}</td><td>${stateHtml(r.state)}</td><td class="wo-via">${via(r)}</td><td>${controlsHtml(r)}</td><td class="wo-cnt">${logCell(r)}</td><td>${r.state === "ro" && r.s === "inc" ? forecastHtml(r.forecast) : r.state === "off" && r.s === "inc" ? '<span class="mini muted">becomes real when switched On</span>' : '<span class="mini muted">—</span>'}</td></tr>`).join("")
          || `<tr><td colspan="6" class="mini muted" style="padding:14px">Nothing in this filter.</td></tr>`}
      </tbody></table></div>
      <p class="mini muted" style="margin-top:8px">Same include/exclude resolution as ⚖ Compare users — groups expanded transitively, directory roles, guest type. Log and Forecast are this user's own rows from 🚦 Sign-in failures and 🎚 Report-only impact. Policy names open the policy card.</p>
    </div>`;

    // ---- identity risk: detections + risky sign-ins, only when there is
    // something to say (the tile already covers "nothing")
    let riskHtml = "";
    {
      const dets = (rk.user && rk.user.detections) || [];
      const rsi = rk.signIns.slice(0, 20);
      const nr = rk.notReaching || { excluded: 0, na: 0 };
      const nrText = (nr.excluded || nr.na) ? `<span class="muted">${[nr.na ? `${nr.na} not targeted at her` : "", nr.excluded ? `${nr.excluded} she is excluded from` : ""].filter(Boolean).join(", ")} — ${nr.excluded + nr.na === 1 ? "it is" : "they are"} in the policies table below, not here.</span>` : "";
      const polRows = rk.policies.length
        ? `<p class="mini" style="margin:0 0 8px">Risk-based policies reaching her: ${rk.policies.map((p) => `${polLink(p)}${p.state === "ro" ? " (report-only)" : ""} <span class="muted">— ${[p.userRisk.length ? `user risk ${p.userRisk.join("/")}` : "", p.signInRisk.length ? `sign-in risk ${p.signInRisk.join("/")}` : "", (p.insiderRisk || []).length ? `insider risk ${p.insiderRisk.join("/")}` : ""].filter(Boolean).join(", ")}${p.firesNow ? ' · <b class="wo-res blk">fires now</b>' : p.firesOnSignIn ? ' · <span class="wo-res int">fired on a sign-in in the window</span>' : ""}</span>`).join("<br>")}${nrText ? `<br>${nrText}` : ""}</p>`
        : (nr.excluded || nr.na) ? `<p class="mini" style="margin:0 0 8px">No risk-based policy reaches her. ${nrText}</p>` : "";
      if (dets.length || rsi.length || (rk.read && !rk.err && (rk.policies.length || nr.excluded || nr.na))) {
        const typeLabel = (t) => esc(String(t || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
        const lvlCls = (l) => l === "high" ? "blk" : l === "medium" ? "int" : "wb";
        riskHtml = `<div class="list-card wo-card">
          <h3 class="wo-h" data-wo-fold="risk">🛡 Identity risk${rsi.length ? ` <span class="mini muted">— ${rk.signIns.length} risky sign-in${rk.signIns.length === 1 ? "" : "s"} · ${esc(rangeLabel)}</span>` : ""}</h3>
          ${polRows}
          ${dets.length ? `<div class="mini muted" style="margin:6px 0 4px">Risk detections${rk.user.detWindow ? ` · last ${rk.user.detWindow} days` : ""}</div><div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>When</th><th>Detection</th><th>Level</th><th>State</th><th>Activity</th><th>Where</th></tr></thead><tbody>
            ${dets.map((d) => `<tr><td class="num">${esc(fmtWhen(d.when))}</td><td>${typeLabel(d.type)}${d.info ? `<div class="mini muted">${esc(d.info)}</div>` : ""}</td><td><span class="wo-res ${lvlCls(d.level)}">${capL(esc(d.level))}</span></td><td>${esc(d.state)}${d.detail && d.detail !== "none" ? `<div class="mini muted">${esc(d.detail)}</div>` : ""}</td><td>${esc(d.activity)}${d.source ? `<div class="mini muted">${esc(d.source)}</div>` : ""}</td><td>${esc([d.city, d.country].filter(Boolean).join(", "))}${d.ip ? `<div class="mini muted">${esc(d.ip)}</div>` : ""}</td></tr>`).join("")}
          </tbody></table></div>` : rk.read && !rk.err ? `<p class="mini muted" style="margin:6px 0">No risk detections on record for her${rk.user.detWindow ? ` in the last ${rk.user.detWindow} days` : ""}.</p>` : ""}
          ${rsi.length ? `<div class="mini muted" style="margin:10px 0 4px">Risky sign-ins · ${esc(rangeLabel)}</div><div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>When</th><th>App</th><th>Risk</th><th>State</th><th>Detections</th><th>Where</th><th>CA</th><th></th></tr></thead><tbody>
            ${rsi.map((r) => `<tr><td class="num">${esc(fmtWhen(r.when))}</td><td>${esc(r.app)}</td><td><span class="wo-res ${lvlCls(r.level)}">${capL(esc(r.level))}</span></td><td>${esc(r.state)}${r.detail && r.detail !== "none" ? `<div class="mini muted">${esc(r.detail)}</div>` : ""}</td><td class="mini">${(r.types || []).map(typeLabel).join(", ") || "—"}</td><td>${esc([r.city, r.country].filter(Boolean).join(", "))}${r.ip ? `<div class="mini muted">${esc(r.ip)}</div>` : ""}</td><td class="mini">${esc(r.caStatus || "—")}</td><td><button class="fchip" data-wo-replay="${esc(r.id)}" title="Prefill 🧪 What-If from this sign-in">🧪 Replay</button></td></tr>`).join("")}
          </tbody></table></div>${rk.signIns.length > rsi.length ? `<p class="mini muted" style="margin-top:6px">${rk.signIns.length - rsi.length} more — export CSV for all.</p>` : ""}` : ""}
          <p class="mini muted" style="margin-top:8px">Where this comes from: the user-risk line and the detections table are what Identity Protection says about her (only filled in on Entra ID P2); the risky sign-ins table is her own sign-in records in the window. This card only reads — to dismiss or confirm a risk, do it in the Entra portal under Identity Protection → Risky users.</p>
        </div>`;
      }
    }

    // ---- sign-ins + forecast
    // ---- devices: what she signs in from, and whether a compliant-device
    // grant that reaches her can be met from them
    let devHtml = "";
    if (log && log.devices) {
      const dv = log.devices;
      const needDev = res.rows.filter((r) => r.s === "inc" && r.state !== "off" && (r.controls || []).some((x) => /compliant|hybrid.?joined|domain.?joined/i.test(String(x))));   // the vm carries the label ("Require device to be marked compliant"), not the id
      const notOk = dv.by.managed + dv.by.registered + dv.by.unmanaged;
      const sum = ["compliant", "managed", "registered", "unmanaged"].filter((k) => dv.by[k]).map((k) => `<span class="wo-res ${DEV_STATE[k].cls}">${dv.by[k]}</span> ${DEV_STATE[k].label.toLowerCase()}`).join(" · ");
      devHtml = `<div class="list-card wo-card">
        <h3 class="wo-h" data-wo-fold="devices">💻 Devices she signs in from · ${esc(rangeLabel)} ${pill(dv.rows.length, "")}</h3>
        ${dv.rows.length ? `<p class="mini" style="margin:0 0 8px">${dv.total} sign-in${dv.total === 1 ? "" : "s"}: ${sum}.</p>
        ${needDev.length ? `<div class="wo-callout${notOk ? " bad" : " ok"}"><b>${notOk ? `${notOk} sign-in${notOk === 1 ? "" : "s"} from a device that cannot satisfy a compliant-device grant` : "Every sign-in came from a compliant device"}</b> — ${needDev.map((r) => polLink(r)).join(", ")} require${needDev.length === 1 ? "s" : ""} one${needDev.some((r) => r.state === "ro") ? " (report-only ones would, once live)" : ""}.${notOk ? " The enforced ones are the Blocked rows below; the report-only ones are the forecast." : ""}</div>` : ""}
        <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Device</th><th>OS · browser</th><th>State</th><th class="num">Sign-ins</th><th class="num">Stopped</th><th>Last seen</th></tr></thead><tbody>
          ${dv.rows.slice(0, 30).map((d) => `<tr><td><b>${esc(d.name || (d.id ? d.id.slice(0, 8) + "…" : d.os ? `${d.os} device` : "Unknown device"))}</b>${d.id ? `<div class="mini muted">${esc(d.id)}</div>` : ""}${d.apps.length ? `<div class="mini muted">${esc(d.apps.slice(0, 3).join(", "))}${d.apps.length > 3 ? ` +${d.apps.length - 3}` : ""}</div>` : ""}</td>
            <td>${esc([d.os, d.browser].filter(Boolean).join(" · ") || "—")}${d.trustType ? `<div class="mini muted">${esc(d.trustType)}</div>` : ""}</td>
            <td><span class="wo-res ${DEV_STATE[d.state].cls}" title="${esc(DEV_STATE[d.state].note)}">${DEV_STATE[d.state].label}</span></td>
            <td class="num">${d.count}</td><td class="num">${d.stopped || ""}</td><td class="num">${esc(fmtWhen(d.last))}</td></tr>`).join("")}
        </tbody></table></div>${dv.rows.length > 30 ? `<p class="mini muted" style="margin-top:6px">${dv.rows.length - 30} more devices.</p>` : ""}
        <p class="mini muted" style="margin-top:8px">State is what the sign-in record says Conditional Access saw at that moment (isCompliant, isManaged, trustType) — a device made compliant yesterday shows compliant only on the sign-ins since. Rows without an Entra device id are grouped by OS and browser.</p>`
          : `<p class="mini muted">No sign-ins in the window, so no devices.</p>`}
      </div>`;
    }
    // ---- MFA prompts: the complaint "I keep getting the Authenticator
    // prompt on X" — which policy demands it, and were they fresh prompts
    // ---- retired control: who breaks when approved client app goes
    let retHtml = "";
    if (res.retired && res.retired.policies.length) {
      const rt = res.retired;
      const V = {
        exposed: ["bad", "Blocked the day the control goes", `she satisfies ${rt.relies.length === 1 ? "this policy" : "these policies"} through the approved app on a device that is not compliant, and no sign-in shows an app protection policy working for her yet — assign one (and let the apps pick it up) before the control is replaced or removed.`],
        ready:   ["ok", "Ready for the replacement", `she satisfies ${rt.relies.length === 1 ? "this policy" : "these policies"} through the approved app, and ${rt.appOk} sign-in${rt.appOk === 1 ? "" : "s"} already show an app protection policy satisfied on a non-compliant device — swapping the control for Require app protection policy passes for her.`],
        clear:   ["ok", "Not affected", "no sign-in in the window went through the approved-app path — she uses a compliant device, or none of these apps on a phone."],
      };
      const [cls, head, why] = V[rt.verdict] || V.clear;
      retHtml = `<div class="list-card wo-card">
        <h3 class="wo-h" data-wo-fold="retired">📵 Retired control: Require approved client app <span class="mini muted">— ${rt.policies.length} polic${rt.policies.length === 1 ? "y" : "ies"} reaching her, read-only since 30 June 2026</span></h3>
        <div class="wo-callout${cls === "bad" ? " bad" : " ok"}"><b>${head}</b> — ${why}</div>
        <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>Policy</th><th>Grant</th><th class="num">Through the approved app</th><th>Apps</th><th class="num">Devices</th><th>Last</th></tr></thead><tbody>
          ${rt.policies.map((x) => `<tr class="${x.viaApp ? "" : "wo-dim"}"><td>${polLink(x)}${x.state === "ro" ? ' <span class="mini muted">(report-only)</span>' : ""}</td>
            <td class="mini">${x.hasDev ? "compliant device <b>or</b> approved app" : "approved app only"}${x.hasApp ? " <b>or</b> app protection policy" : ""}</td>
            <td class="num">${x.viaApp ? `<b>${x.viaApp}</b>${x.mobile !== x.viaApp ? ` <span class="mini muted">(${x.mobile} mobile)</span>` : ""}` : "0"}</td>
            <td class="mini">${x.apps.slice(0, 4).map((a) => `${esc(a.app)} ×${a.n}`).join(", ")}${x.apps.length > 4 ? ` +${x.apps.length - 4}` : ""}</td>
            <td class="num">${x.devices || ""}</td><td class="num">${x.last ? esc(fmtWhen(x.last)) : "—"}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="mini muted" style="margin-top:8px">“Through the approved app” = the policy applied with success on a sign-in whose device was not compliant — the only way that grant is met. Removing the control without a replacement turns such a policy into compliant-device-only; replacing it with Require app protection policy needs an Intune APP policy assigned to her and picked up by the app. ${rt.appPolicies ? `${rt.appPolicies} polic${rt.appPolicies === 1 ? "y" : "ies"} in the tenant already grant${rt.appPolicies === 1 ? "s" : ""} on app protection policy.` : "No policy in the tenant grants on app protection policy yet."} Report-only cannot evaluate that control — its report-only failures are not denials.</p>
      </div>`;
    }
    let mfaHtml = "";
    if (log && log.mfa) {
      const mf = log.mfa;
      const sessionRows = res.rows.filter((r) => r.s === "inc" && r.state !== "off" && (r.session || []).some((x) => /signInFrequency|persistentBrowser/i.test(String(x))));
      const known = mf.fresh + mf.claim;
      const pct = (n, d) => d ? `${Math.round(n / d * 100)}%` : "—";
      const why = [];
      if (mf.fresh && mf.freshDevices >= 3) why.push(`The fresh prompts came from <b>${mf.freshDevices} different devices</b>. A device with no session for her has to do MFA once before its token carries the claim — on a non-persistent VDI pool that is one prompt per host she lands on, which a person experiences as “continuously”.`);
      if (mf.fresh && sessionRows.length) why.push(`Session controls reaching her: ${sessionRows.map((r) => `${polLink(r)} <span class="muted">(${esc((r.session || []).join(", "))})</span>`).join(", ")} — a sign-in frequency re-prompts on its own clock, and a non-persistent browser session forgets the claim when the browser closes.`);
      if (mf.required && !mf.fresh && known) why.push(`Every MFA requirement in the window was satisfied by a claim already in the token — no fresh prompt was recorded. A prompt she sees that is not here is not Conditional Access: per-user MFA, security defaults, the app's own step-up, or a self-service registration flow.`);
      if (mf.unknown && !known) why.push(`Fresh vs reused cannot be told apart from the hunting source — switch the sign-in source to the Entra sign-in log to see which prompts were real.`);
      mfaHtml = `<div class="list-card wo-card">
        <h3 class="wo-h" data-wo-fold="mfa">🔐 MFA on her sign-ins · ${esc(rangeLabel)} <span class="mini muted">— ${mf.required} of ${mf.total} required it</span></h3>
        ${mf.required ? `<div class="wo-verdicts wo-3" style="margin:0 0 10px">
          <div class="wo-vt ${mf.fresh ? "warn" : "ok"}"><span class="k">Fresh prompts</span><span class="v">${mf.fresh}</span><span class="s">${pct(mf.fresh, known)} of the ${known} known — she had to pick up the phone</span></div>
          <div class="wo-vt ok"><span class="k">Satisfied by the token</span><span class="v">${mf.claim}</span><span class="s">an MFA claim already in the session — no prompt</span></div>
          <div class="wo-vt"><span class="k">Not known</span><span class="v">${mf.unknown}</span><span class="s">${mf.unknown ? "hunting rows carry no step detail" : "—"}</span></div>
        </div>
        ${why.map((w) => `<div class="wo-callout${/different devices|Session controls/.test(w) ? "" : " ok"}">${w}</div>`).join("")}
        <div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>App</th><th>Policies that demanded MFA</th><th class="num">Required</th><th class="num">Fresh</th><th class="num">By token</th><th class="num">Devices</th><th>Last fresh prompt</th></tr></thead><tbody>
          ${mf.apps.slice(0, 20).map((a) => `<tr><td><b>${esc(a.app)}</b></td>
            <td>${a.policies.length ? a.policies.map((p) => `${polLink(p)} <span class="mini muted">${esc(p.controls.join(", "))} · ${p.n}${p.fresh ? ` · <b>${p.fresh} fresh</b>` : ""}</span>`).join("<br>") : '<span class="muted">no applied policy carried an MFA grant — the requirement came from outside Conditional Access</span>'}</td>
            <td class="num">${a.required}</td><td class="num">${a.fresh ? `<b>${a.fresh}</b>` : ""}</td><td class="num">${a.claim || ""}</td><td class="num">${a.devices}${a.freshDevices ? ` <span class="mini muted">(${a.freshDevices} fresh)</span>` : ""}</td><td class="num">${a.lastFresh ? esc(fmtWhen(a.lastFresh)) : "—"}</td></tr>`).join("")}
        </tbody></table></div>${mf.apps.length > 20 ? `<p class="mini muted" style="margin-top:6px">${mf.apps.length - 20} more apps.</p>` : ""}
        <p class="mini muted" style="margin-top:8px">Required = the sign-in's authenticationRequirement was multi-factor. Fresh = the record's authentication steps show the MFA being performed; by token = the step says the requirement was satisfied by a claim in the token. Policies are the applied policies with result success that carried an MFA or authentication-strength grant — the ones that made the sign-in need it. A row with fresh prompts and no policy is per-user MFA or security defaults.</p>`
          : `<p class="mini muted">No sign-in in the window required MFA.</p>`}
      </div>`;
    }
    let logHtml = "";
    if (log) {
      const rows = log.rows.slice(0, opts.maxRows || 50);
      const sil = `<div class="list-card wo-card">
        <h3 class="wo-h" data-wo-fold="stopped">🚦 Sign-ins Conditional Access stopped · ${esc(rangeLabel)} ${pill(log.rows.length, "red")}</h3>
        ${log.rows.length ? `<div class="gu-tw"><table class="plist wo-tbl"><thead><tr><th>When</th><th>App · client</th><th>Policy</th><th>Result</th><th></th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td class="num">${esc(fmtWhen(r.when))}</td><td>${esc(r.app)}<div class="mini muted">${esc([r.browser || r.client, r.os, r.compliant ? "compliant" : r.managed ? "managed" : r.os ? "unmanaged" : "", [r.city, r.country].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}</div></td>
            <td>${r.policies.map((p) => `<span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>${(p.controls || []).length ? `<div class="mini" style="color:var(--on)">demanded ${esc(p.controls.join(", "))}</div>` : ""}`).join("<br>")}</td>
            <td><span class="wo-res ${r.interrupted ? "int" : "blk"}">${r.interrupted ? "Interrupted" : "Blocked"}</span><div class="mini muted">${esc(r.failureReason || (typeof Signins !== "undefined" && Signins.codeText ? Signins.codeText(r.errorCode) : "") || "")}${r.errorCode != null ? ` <span class="muted">(${esc(r.errorCode)})</span>` : ""}</div></td>
            <td><button class="fchip" data-wo-replay="${esc(r.id)}" title="Prefill 🧪 What-If from this sign-in">🧪 Replay</button></td></tr>`).join("")}
        </tbody></table></div>${log.rows.length > rows.length ? `<p class="mini muted" style="margin-top:6px">${log.rows.length - rows.length} more — export CSV for all.</p>` : ""}`
          : `<p class="mini muted">Nothing stopped her: ${log.total} sign-in${log.total === 1 ? "" : "s"} in the window, ${log.passed} passed every enforced policy.</p>`}
        <p class="mini muted" style="margin-top:8px">${log.total} sign-ins in the window · ${log.passed} passed</p>
      </div>`;
      const ro = log.ro;
      const items = [];
      if (fc && fc.block.length) fc.block.forEach((p) => items.push(`<div class="wo-callout bad"><b>Locked out</b> — <span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span> would deny ${p.failure} of her sign-ins${(p.denyWhy || []).length ? `: ${p.denyWhy.slice(0, 3).map((d) => `${esc(d.what)}${d.n > 1 ? ` ×${d.n}` : ""}`).join("; ")}` : ""}${(p.samples || []).length ? `<div class="mini muted">e.g. ${p.samples.slice(0, 2).map((s) => esc([s.app, s.browser || s.client, s.os, s.compliant ? "compliant" : s.os ? "unmanaged" : "", [s.city, s.country].filter(Boolean).join(" ")].filter(Boolean).join(" · "))).join(" — ")}</div>` : ""}</div>`));
      if (fc && fc.prompt.length) fc.prompt.forEach((p) => items.push(`<div class="wo-callout"><b>Extra prompts</b> — <span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span> would stop ${p.interrupted} sign-in${p.interrupted === 1 ? "" : "s"} for an extra step${(p.riskWhy || []).length ? ` (${p.riskWhy.map((d) => `${esc(d.what)} ×${d.n}`).join(", ")})` : ""}.</div>`));
      if (ro) ro.policies.filter((p) => !p.failure && !p.interrupted && p.success).forEach((p) => items.push(`<div class="wo-callout ok"><b>No change</b> — <span class="pol-link" data-polid="${esc(p.id)}">${esc(p.name)}</span>: ${p.success} sign-in${p.success === 1 ? "" : "s"} already satisfied it.</div>`));
      const scoped = res.rows.filter((r) => r.state === "ro" && r.s === "inc" && r.forecast && r.forecast.scoped);
      if (scoped.length) items.push(`<div class="wo-callout ok"><b>Out of scope on her sign-ins</b> — ${scoped.map((r) => `<span class="pol-link" data-polid="${esc(r.id)}">${esc(r.seq || r.name)}</span> <span class="muted">(${r.forecast.notApplied.toLocaleString()}×)</span>`).join(", ")} reach${scoped.length === 1 ? "es" : ""} her by assignment and ${scoped.length === 1 ? "was" : "were"} evaluated on her sign-ins, but the conditions never matched — no legacy client, no risk, not that app or platform. Going live changes nothing for her as she signs in today; a different client or a risk event would bring ${scoped.length === 1 ? "it" : "them"} into play.</div>`);
      const silent = res.rows.filter((r) => r.state === "ro" && r.s === "inc" && r.forecast && r.forecast.nodata);
      if (silent.length) items.push(`<div class="wo-callout"><b>No data</b> — ${silent.map((r) => `<span class="pol-link" data-polid="${esc(r.id)}">${esc(r.seq || r.name)}</span>`).join(", ")} reach${silent.length === 1 ? "es" : ""} her but ${silent.length === 1 ? "does" : "do"} not appear on any of her ${log.total.toLocaleString()} sign-in records — not even as “not applied”. A report-only policy is evaluated on every sign-in it is assigned to, so a policy missing from all of them was created after the window, or the source dropped its verdicts (the hunting adapter is the suspect — switch to the Entra sign-in log and compare). Not evidence of safety.</div>`);
      const fch = `<div class="list-card wo-card">
        <h3 class="wo-h" data-wo-fold="forecast">🎚 If everything in report-only went live today</h3>
        ${items.join("") || `<p class="mini muted">${c.ro ? "No report-only verdict on her sign-ins in this window." : "No report-only policy reaches her."}</p>`}
        <p class="mini muted" style="margin-top:8px">Worst case first, per policy, from the report-only verdicts on her own sign-ins. Zero traffic on a policy is shown as no data, never as safe.</p>
      </div>`;
      logHtml = `<div class="wo-split">${sil}${fch}</div>`;
    } else {
      logHtml = `<div class="list-card wo-card"><div class="run-prompt" style="padding:24px 20px"><p class="mini muted">The sign-in half was not read — ${esc(opts.logSkipped || "sign-in log not available")}.</p></div></div>`;
    }
    return head + ladderHtml + tbl + riskHtml + retHtml + devHtml + mfaHtml + logHtml;
  }

  // ------------------------------------------------------------- csv --
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function toCsv(res) {
    const H = ["ca", "policy", "state", "assignment", "via", "how", "controls", "blocked", "interrupted", "ro_would_block", "ro_would_prompt", "ro_no_change"];
    const L = [H.join(",")];
    res.rows.forEach((r) => L.push([
      r.seq, r.name, STATE_LABEL[r.state], r.s === "inc" ? "included" : r.s === "exc" ? "excluded" : "not targeted",
      r.s === "exc" ? (r.exc || {}).text : (r.inc || {}).text, r.s === "exc" ? (r.exc || {}).how || "" : (r.inc || {}).how || "",
      (r.controls || []).join(" " + (r.op || ",") + " "),
      r.log ? r.log.blocked : "", r.log ? r.log.interrupted : "",
      r.forecast && !r.forecast.nodata ? r.forecast.failure : "", r.forecast && !r.forecast.nodata ? r.forecast.interrupted : "", r.forecast && !r.forecast.nodata ? r.forecast.success : "",
    ].map(csvCell).join(",")));
    return L.join("\n");
  }

  // ------------------------------------------------------------ markdown --
  function toMd(res, meta = {}) {
    const e = (v) => String(v ?? "").replace(/\|/g, "\\|");
    const u = res.user, c = res.counts, log = res.log, fc = res.forecast;
    const L = [`# Who is ${e(u.name)} to Conditional Access — ${e(meta.tenant || "")}`, "", (typeof Brand !== "undefined" && Brand.generatedBy) ? Brand.generatedBy("Generated") : "", ""];
    L.push(`**${e(u.name)}** (${e(u.upn)}) — ${u.guest ? "guest" : "member"}, ${u.enabled ? "enabled" : "DISABLED"}${u.dept ? `, ${e(u.dept)}` : ""}${u.licence ? `, ${u.licence.p2 ? "Entra ID P2" : u.licence.p1 ? "Entra ID P1" : "no Entra ID P1/P2"}` : ""}${u.methods ? `, MFA methods: ${u.methods.length ? e(u.methods.join(", ")) : "none"}` : ""}`, "");
    L.push("## At a glance", "");
    L.push(`- **Deployment stage:** ${res.stage.kind === "none" ? (res.ladder.hasDg ? "not in any deploy group" : "the active baseline has no deploy groups") : res.stage.groups.map((g) => `${e(g.name)} (${e(g.how)})`).join(", ")}`);
    L.push(`- **Policies reaching her:** ${c.reach} of ${c.total} — ${c.on} enforced, ${c.ro} report-only, ${c.off} off${c.excluded ? `; excluded from ${c.excluded}` : ""}`);
    if (log) L.push(`- **Sign-ins CA stopped (${e(meta.rangeLabel || "window")}):** ${log.rows.length} — ${log.blocked} blocked, ${log.interrupted} interrupted, of ${log.total} sign-ins read`);
    if (res.risk) {
      const rk = res.risk;
      const si = rk.signIns.length ? `${rk.signIns.length} risky sign-in(s) in the window (${["high", "medium", "low"].filter((l) => rk.byLevel[l]).map((l) => `${rk.byLevel[l]} ${l}`).join(", ")})` : "no risky sign-in in the window";
      if (!rk.read) L.push(`- **Identity risk:** user risk not read — ${si}`);
      else if (rk.err) L.push(`- **Identity risk:** user risk not read (${e(rk.err)}) — ${si}`);
      else L.push(`- **Identity risk:** ${rk.atRisk ? `${e(rk.user.state)}, level ${e(rk.user.level)}${rk.user.updated ? ` since ${e(rk.user.updated)}` : ""}${rk.user.detail && rk.user.detail !== "none" ? ` (${e(rk.user.detail)})` : ""}` : String(rk.user.state || "none") === "none" ? "not flagged" : `${e(rk.user.state)}${rk.user.updated ? ` (${e(rk.user.updated)})` : ""}`}${rk.policies.filter((p) => p.firesNow).length ? ` — fires ${rk.policies.filter((p) => p.firesNow).map((p) => e(p.name)).join(", ")}` : ""} — ${si}`);
    }
    if (fc) L.push(`- **If report-only went live:** ${fc.worst === "block" ? `LOCKED OUT by ${fc.block.map((p) => e(p.name)).join(", ")}` : fc.worst === "prompt" ? `extra prompts from ${fc.prompt.map((p) => e(p.name)).join(", ")}` : fc.worst === "clean" ? "no change" : fc.worst === "scoped" ? `nothing for her — ${fc.scoped.length} report-only policies evaluated her sign-ins and never matched their conditions` : "no data"}`);
    L.push("", "## Deployment groups", "", "| Group | Status | How |", "| --- | --- | --- |");
    res.ladder.deploy.concat(res.ladder.persona).forEach((r) => L.push(`| ${e(r.name)} | ${r.inMember ? "IN" : r.exists === false ? "not in tenant" : "not in"} | ${e(r.how || "")} |`));
    if (res.exclusions.length) {
      L.push("", "### Exclusion groups she is in", "", "| Group | How | Excluded from | Bypass |", "| --- | --- | --- | --- |");
      res.exclusions.forEach((x) => L.push(`| ${e(x.name)} | ${e(x.how)} | ${x.policies.map((p) => `${e(p.seq || p.name)}${p.state === "on" ? "" : ` (${STATE_LABEL[p.state]})`}`).join(", ") || "(no policy references it)"} | ${x.bypass ? "**YES — enforced policy**" : "no"} |`));
    }
    L.push("", "## Policies", "", `| CA | Policy | State | Assignment | Via | Controls | Blocked | Interrupted | Forecast |`, "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    res.rows.forEach((r) => {
      const why = r.s === "exc" ? `EXCLUDED — ${e((r.exc || {}).text)}${(r.exc || {}).how ? ` (${e(r.exc.how)})` : ""}` : r.s === "inc" ? `${e((r.inc || {}).text)}${(r.inc || {}).how && r.inc.how !== "member" ? ` (${e(r.inc.how)})` : ""}` : "·";
      const fcs = r.forecast ? (r.forecast.nodata ? "no data" : r.forecast.scoped ? `out of scope (${r.forecast.notApplied}× not applied)` : `${r.forecast.failure} block / ${r.forecast.interrupted} prompt / ${r.forecast.success} ok`) : "";
      L.push(`| ${e(r.seq)} | ${e(r.name)} | ${STATE_LABEL[r.state]} | ${r.s === "inc" ? "✓" : r.s === "exc" ? "✗" : "·"} | ${why} | ${e((r.controls || []).join(` ${r.op || ","} `))} | ${r.log ? r.log.blocked : ""} | ${r.log ? r.log.interrupted : ""} | ${fcs} |`);
    });
    if (res.risk && ((res.risk.user && res.risk.user.detections || []).length || res.risk.signIns.length)) {
      const rk = res.risk;
      L.push("", "## Identity risk", "");
      if ((rk.user && rk.user.detections || []).length) {
        L.push("| When | Detection | Level | State | Activity | Where |", "| --- | --- | --- | --- | --- | --- |");
        rk.user.detections.forEach((d) => L.push(`| ${e(d.when)} | ${e(d.type)} | ${e(d.level)} | ${e(d.state)} | ${e(d.activity)} | ${e([d.city, d.country].filter(Boolean).join(", "))} ${e(d.ip)} |`));
        L.push("");
      }
      if (rk.signIns.length) {
        L.push("| When | App | Risk | State | Detections | Where | CA |", "| --- | --- | --- | --- | --- | --- | --- |");
        rk.signIns.forEach((r) => L.push(`| ${e(r.when)} | ${e(r.app)} | ${e(r.level)} | ${e(r.state)} | ${e((r.types || []).join(", "))} | ${e([r.city, r.country].filter(Boolean).join(", "))} ${e(r.ip)} | ${e(r.caStatus)} |`));
      }
    }
    if (log) {
      if (log.devices && log.devices.rows.length) {
        const dv = log.devices;
        L.push("", `## Devices she signs in from (${e(meta.rangeLabel || "window")})`, "");
        L.push(`${dv.total} sign-ins: ${["compliant", "managed", "registered", "unmanaged"].filter((k) => dv.by[k]).map((k) => `${dv.by[k]} ${DEV_STATE[k].label.toLowerCase()}`).join(", ")}.`, "");
        L.push("| Device | OS · browser | State | Sign-ins | Stopped | Last seen |", "| --- | --- | --- | --- | --- | --- |");
        dv.rows.forEach((d) => L.push(`| ${e(d.name || d.id || (d.os ? `${d.os} device` : "Unknown device"))} | ${e([d.os, d.browser].filter(Boolean).join(" · "))}${d.trustType ? ` (${e(d.trustType)})` : ""} | ${DEV_STATE[d.state].label} | ${d.count} | ${d.stopped} | ${e(d.last)} |`));
      }
      if (log.mfa && log.mfa.required) {
        const mf = log.mfa;
        L.push("", `## MFA on her sign-ins (${e(meta.rangeLabel || "window")})`, "");
        L.push(`${mf.required} of ${mf.total} sign-ins required MFA: ${mf.fresh} fresh prompts, ${mf.claim} satisfied by the token, ${mf.unknown} not known. Fresh prompts came from ${mf.freshDevices} device(s).`, "");
        L.push("| App | Policies that demanded MFA | Required | Fresh | By token | Devices | Last fresh prompt |", "| --- | --- | --- | --- | --- | --- | --- |");
        mf.apps.forEach((a) => L.push(`| ${e(a.app)} | ${a.policies.map((p) => `${e(p.seq || p.name)} (${e(p.controls.join(", "))}) ×${p.n}${p.fresh ? `, ${p.fresh} fresh` : ""}`).join("; ") || "none — outside Conditional Access"} | ${a.required} | ${a.fresh} | ${a.claim} | ${a.devices} | ${e(a.lastFresh)} |`));
      }
      if (res.retired && res.retired.policies.length) {
        const rt = res.retired;
        L.push("", "## Retired control: Require approved client app", "");
        L.push(`**${{ exposed: "Blocked the day the control goes", ready: "Ready for the replacement", clear: "Not affected" }[rt.verdict] || "Not affected"}** — ${rt.relies.length} of ${rt.policies.length} reaching polic${rt.policies.length === 1 ? "y" : "ies"} satisfied through the approved app; ${rt.appOk} sign-in(s) with an app protection policy already satisfied.`, "");
        L.push("| Policy | Grant | Through the approved app | Apps | Devices | Last |", "| --- | --- | --- | --- | --- | --- |");
        rt.policies.forEach((x) => L.push(`| ${e(x.seq || x.name)} | ${x.hasDev ? "compliant device or approved app" : "approved app only"}${x.hasApp ? " or app protection policy" : ""} | ${x.viaApp} | ${e(x.apps.slice(0, 4).map((a) => `${a.app} ×${a.n}`).join(", "))} | ${x.devices} | ${e(x.last)} |`));
      }
      L.push("", `## Sign-ins Conditional Access stopped (${e(meta.rangeLabel || "window")})`, "");
      if (!log.rows.length) L.push(`None — ${log.total} sign-ins, ${log.passed} passed.`);
      else {
        L.push("| When | App | Client | Policy | Result | Reason |", "| --- | --- | --- | --- | --- | --- |");
        log.rows.forEach((r) => L.push(`| ${e(r.when)} | ${e(r.app)} | ${e([r.browser || r.client, r.os, [r.city, r.country].filter(Boolean).join(" ")].filter(Boolean).join(" · "))} | ${r.policies.map((p) => e(p.name)).join("; ")} | ${r.interrupted ? "interrupted" : "BLOCKED"} | ${e(r.failureReason)}${r.errorCode != null ? ` (${r.errorCode})` : ""} |`));
      }
      L.push("", "## If everything in report-only went live", "");
      if (fc && fc.block.length) fc.block.forEach((p) => L.push(`- **LOCKED OUT** — ${e(p.name)} would deny ${p.failure} sign-in(s)${(p.denyWhy || []).length ? `: ${p.denyWhy.map((d) => `${e(d.what)} ×${d.n}`).join("; ")}` : ""}`));
      if (fc && fc.prompt.length) fc.prompt.forEach((p) => L.push(`- **Extra prompts** — ${e(p.name)} would stop ${p.interrupted} sign-in(s) for an extra step`));
      if (log.ro) log.ro.policies.filter((p) => !p.failure && !p.interrupted && p.success).forEach((p) => L.push(`- No change — ${e(p.name)} (${p.success} sign-ins already satisfied it)`));
      if (!(fc && (fc.block.length || fc.prompt.length)) && !(log.ro && log.ro.policies.length)) L.push(c.ro ? "No report-only verdict on her sign-ins in this window — no data, not safety." : "No report-only policy reaches her.");
    }
    L.push("", "✓ included · ✗ excluded · `·` not targeted. Resolution as ⚖ Compare users; log rows as 🚦 Sign-in failures; forecast as 🎚 Report-only impact.");
    return L.join("\n");
  }

  return { analyze, render, toMd, toCsv, buildLookup, stateFor, ladderOf, exclusionsOf, logOf };
})();
