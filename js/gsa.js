// ======================================================================
// 🌐 Global Secure Access — T56, Workspace 03 · Entra Tools (beta 32516; 32517 the macOS script and the devcf naming).
//
// Mihai, 14 Oct 2026: "T56 = Global Secure Access, and there the focus on
// the Microsoft traffic profile. Later we can add Internet Access and
// Private Access." Layout B of the token replay guard mockup — the
// readiness board: every link a "compliant network only" Conditional
// Access policy needs, at once, each with the fix that lives in Entra or
// Intune. The chain follows Microsoft Learn (Enable the compliant network
// check) and Kelvin Tegelaar's CyberDrain script (Making stolen tokens
// useless with Global Secure Access), read 14 Oct 2026.
//
// PURE: no Graph, no DOM. app.js reads the tenant into `raw` and calls
//   Gsa.model(raw, caPolicies)       → { links[8], verdict, policies[], groups[], groupIds[], ... }
//   Gsa.proof(signIns, policyIds)    → per policy: would block / would pass / blocked / passed, users
//   Gsa.render(model, ui)            → the flow, the selected step, the workspaces, the policy table, the proof, the groups
//   Gsa.preview(fix, opts)           → what a fix sends: the script(s) or the Graph request, for the workspace (32524)
//   Gsa.defaultSel(model)            → the step the flow opens on: the first that blocks
//   Gsa.windowsScript(opts)          → the Intune platform script (PowerShell) ENCA uploads
//   Gsa.macScript()                  → the macOS shell script (a download — the macOS
//                                      profiles stay by hand, see MAC_BY_HAND)
//   Gsa.demo()                       → a raw read for ?demo=1
//
// What it deliberately does NOT do: switch the policy On, or change its
// exclusions. Mihai, 14 Oct: "leave CA215 as is with current exclusions" —
// the admin-role question is in the admin handover, not in a button.
// ======================================================================
const Gsa = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const INTUNE_APP = "0000000a-0000-0000-c000-000000000000";       // Microsoft Intune
  const INTUNE_ENROLL = "d4ebce55-015a-49b5-a083-c84d1797ae8c";    // Microsoft Intune Enrollment
  const P1_PLANS = ["AAD_PREMIUM", "AAD_PREMIUM_P2"];
  // 32517 (Mihai 14 Oct: the macOS script is created in Intune too; names as
  // in devcf). The CloudFellows Intune convention read from cloudfellows.dev:
  //   Win - PSH - <category> - D - <name> - R<yy.m> - v<x>    platform script
  //   MACOS - SH - <category> - D - <name> - R<yy.m> - v<x>   shell script, scr-app-1NN-*.zsh
  //   INT-SEC-D-GSA-MAC-M365 / -WIN-M365                      the device groups
  // The release tag is the month the object is made (R26.10 = October 2026);
  // both release and version can be changed in the fix panel.
  const relTag = (d) => { const x = d || new Date(); return `R${String(x.getFullYear()).slice(2)}.${x.getMonth() + 1}`; };
  const names = (o) => { const rel = (o && o.rel) || relTag(), ver = (o && o.ver) || "v1.0"; return {
    win: `Win - PSH - Device Security - D - Install Global Secure Access Client - ${rel} - ${ver}`,
    rem: `Win - DHS - Device Security - D - Install Global Secure Access Client - ${rel} - ${ver}`,
    mac: `MACOS - SH - Software Installation - D - Install Global Secure Access Client - ${rel} - ${ver}`,
  }; };
  const WIN_FILE = "Install-GlobalSecureAccessClient.ps1", MAC_FILE = "scr-app-108-install-global-secure-access.zsh";
  const GROUPS = { win: "INT-SEC-D-GSA-WIN-M365", mac: "INT-SEC-D-GSA-MAC-M365" };
  // 32518, from Jhope188/LearnGraphAPI Baseline/Entra/GSA (lab, 12 Oct 2026):
  // the client signs in to the ZTNA Policy Service through this first-party
  // app; in that lab its service principal was missing and the client stayed
  // Partially Connected until it was created. The appId is the lab's, verified
  // there; the resource "ZTNA Policy Service" appId is NOT known, so not checked.
  const ZTNA_CLIENT = "ca01d00c-bfd6-46d6-ae7d-be5b5267d037";
  // The portal makes a backing group per traffic profile, _GSA_<guid>. It is
  // the profile's, not a group to use in Intune or Conditional Access.
  const isBacking = (name) => /^_GSA_[0-9a-f-]{8,}/i.test(String(name || ""));
  const SCRIPT_NAME = names().win;
  const LOCATION_NAME = "All Compliant Network Locations";

  // ---- the compliant network location and the policies that require it ----
  const isCn = (l) => /compliantNetworkNamedLocation/i.test((l && l["@odata.type"]) || "");
  function cnPolicies(caPolicies, cnId) {
    const out = [];
    for (const p of caPolicies || []) {
      const raw = p.raw || p, loc = (raw.conditions && raw.conditions.locations) || {};
      const ex = loc.excludeLocations || [], inc = loc.includeLocations || [];
      const names = (x) => x === cnId || /AllCompliantNetworkLocations/i.test(String(x));
      if (!ex.some(names) && !inc.some(names)) continue;
      const g = raw.grantControls || {}, u = (raw.conditions && raw.conditions.users) || {}, apps = (raw.conditions && raw.conditions.applications) || {};
      const block = (g.builtInControls || []).includes("block");
      const excApps = apps.excludeApplications || [];
      out.push({
        id: raw.id || p.id, name: raw.displayName || p.name || raw.id, state: raw.state || "",
        shape: block && inc.includes("All") && ex.some(names) ? "block outside the compliant network" : inc.some(names) ? "applies ON the compliant network" : "other",
        includeGroups: u.includeGroups || [], excludeGroups: u.excludeGroups || [], includeUsers: u.includeUsers || [], excludeUsers: u.excludeUsers || [],
        excludeRoles: u.excludeRoles || [], includeRoles: u.includeRoles || [],
        allUsers: (u.includeUsers || []).includes("All"),
        intuneOut: excApps.includes(INTUNE_APP), enrollOut: excApps.includes(INTUNE_ENROLL),
        // 32522: where the compliant network sits and what the grant is
        cnSide: ex.some(names) ? "excluded" : "included",
        grant: block ? "block" : [...(g.builtInControls || []), ...(g.authenticationStrength ? [`strength ${g.authenticationStrength.displayName || ""}`.trim()] : [])].join(` ${String(g.operator || "OR")} `) || "session controls only",
        platforms: ((raw.conditions && raw.conditions.platforms && raw.conditions.platforms.includePlatforms) || []).join(", "),
      });
    }
    return out;
  }

  // ---- the three macOS profiles, recognised by what they are ---------------
  // configurationPolicies (settings catalog) with the system extension policy
  // for the GSA bundle ids; a macOSCustomConfiguration named GSA … proxy; a
  // macOSCustomAppConfiguration for com.microsoft.globalsecureaccess. Input
  // objects carry their assignments.
  function macProfiles(policies, configs) {
    const out = {};
    const pick = (x) => ({ id: x.id, name: x.name || x.displayName, assigned: (x.assignments || []).length > 0, assignments: x.assignments || [], description: x.description || "" });
    const sys = (policies || []).find((p) => /GSA|Global Secure Access/i.test(p.name || "") && /system.?extension/i.test(p.name || "")) || (policies || []).find((p) => JSON.stringify(p.settings || "").includes("com.microsoft.globalsecureaccess"));
    if (sys) out.sysext = pick(sys);
    const proxy = (configs || []).find((c) => /macOSCustomConfiguration$/.test(c["@odata.type"] || "") && /GSA|Global Secure Access/i.test(c.displayName || "") && /proxy/i.test(c.displayName || ""));
    if (proxy) out.proxy = pick(proxy);
    const set = (configs || []).find((c) => /macOSCustomAppConfiguration$/.test(c["@odata.type"] || "") && (/^com\.microsoft\.globalsecureaccess/i.test(c.bundleId || "") || /GSA|Global Secure Access/i.test(c.displayName || "")));
    if (set) out.settings = pick(set);
    // 32523: every GSA profile listed, for the Intune card (duplicates show)
    const role = (x) => x === sys ? "system extensions" : x === proxy ? "transparent proxy" : x === set ? "client settings" : "";
    out.found = [...(policies || []).filter((p) => /GSA|Global Secure Access/i.test(p.name || "") || p === sys).map((p) => Object.assign(pick(p), { kind: "Settings catalog", role: role(p) })),
      ...(configs || []).filter((c) => /GSA|Global Secure Access/i.test(c.displayName || "") || c === proxy || c === set).map((c) => Object.assign(pick(c), { kind: /AppConfiguration$/.test(c["@odata.type"] || "") ? "Preference file" : "Custom", role: role(c) }))];
    return out;
  }

  // ---- the Intune objects for the client (32523) ---------------------------
  // Mihai: where is the Intune policy card — every remediation, script, app and
  // macOS profile T56 recognises, where it sits in Intune, who made it, and
  // whom it is assigned to. Same-name objects are flagged as duplicates.
  const WHERE = { rem: "Devices › Scripts and remediations › Remediations", win: "Devices › Scripts and remediations › Platform scripts", app: "Apps › Windows", mac: "Devices › macOS › Shell scripts", prof: "Devices › macOS › Configuration" };
  function targets(assignments, names) {
    const inc = [], exc = [];
    for (const a of assignments || []) {
      const t = a.target || {}, ty = t["@odata.type"] || "";
      const nm = /allDevices/i.test(ty) ? "All devices" : /allLicensedUsers/i.test(ty) ? "All users" : (names[t.groupId] || t.groupId || "?");
      (/exclusion/i.test(ty) ? exc : inc).push(nm);
    }
    return { inc, exc };
  }
  function intune(raw) {
    const names = raw.groupNames || {}, src = raw.sources || {}, rx = /global\s*secure\s*access/i;
    const rows = [], unread = [];
    const byEnca = (x) => /Created by ENCA/i.test(x.description || "") || x.publisher === "ENCA";
    const add = (k, list, kind, os, where) => {
      if (src[k] && src[k] !== "ok") { unread.push(`${kind}: not read — ${src[k]}`); return; }
      (list || []).forEach((x) => {
        const known = Array.isArray(x.assignments);
        rows.push({ id: x.id, name: x.displayName || x.name || x.id, kind: x.role ? `${kind} · ${x.role}` : kind, os, where, by: byEnca(x) ? "ENCA T56" : "baseline or by hand",
          assigned: known ? x.assignments.length > 0 : x.assigned, t: known ? targets(x.assignments, names) : null });
      });
    };
    add("healthScripts", (raw.healthScripts || []).filter((h) => rx.test(h.displayName || "")), "Remediation", "Windows", WHERE.rem);
    add("scripts", (raw.scripts || []).filter((s) => rx.test(`${s.displayName} ${s.fileName}`)), "Platform script", "Windows", WHERE.win);
    add("apps", (raw.apps || []).filter((a) => rx.test(a.displayName || "")), "App", "Windows", WHERE.app);
    add("shellScripts", (raw.shellScripts || []).filter((s) => rx.test(`${s.displayName} ${s.fileName}`)), "Shell script", "macOS", WHERE.mac);
    const mp = raw.macProfiles || {};
    const profs = mp.found || ["sysext", "proxy", "settings"].filter((k) => mp[k]).map((k) => Object.assign({}, mp[k], { kind: k === "sysext" ? "Settings catalog" : k === "proxy" ? "Custom" : "Preference file", role: k === "sysext" ? "system extensions" : k === "proxy" ? "transparent proxy" : "client settings" }));
    add("macProfiles", profs.map((p) => Object.assign({}, p, { role: p.role })), "Profile", "macOS", WHERE.prof);
    rows.forEach((r) => { r.dup = rows.filter((x) => x.name === r.name && x.where === r.where).length > 1; });
    const winKinds = new Set(rows.filter((r) => r.os === "Windows").map((r) => r.where));
    const missingProfiles = ["system extensions", "transparent proxy", "client settings"].filter((role) => !rows.some((r) => r.kind.endsWith(role)));
    return { rows, unread, winBoth: winKinds.size > 1, missingProfiles };
  }

  // ---- the model ----------------------------------------------------------
  // raw: { skus, status:{onboardingStatus,onboardingErrorMessage}, profile, signaling,
  //        sp:{id,appRoleAssignmentRequired,appRoles}, assigned:[{principalId,principalType,principalDisplayName}],
  //        locations:[], scripts:[], apps:[], shellScripts:[], groupNames:{id:name}, sources:{k:"ok"|err}, readAt }
  function model(raw, caPolicies) {
    const src = raw.sources || {};
    const unread = (k) => src[k] && src[k] !== "ok";
    const L = [];
    // 1 licence
    const p1 = (raw.skus || []).filter((s) => (s.servicePlans || []).some((p) => P1_PLANS.includes(p.servicePlanName)));
    const seats = p1.reduce((a, s) => a + ((s.prepaidUnits && s.prepaidUnits.enabled) || 0), 0), used = p1.reduce((a, s) => a + (s.consumedUnits || 0), 0);
    L.push({ k: "licence", lab: "Licence", h: "Entra ID P1", st: unread("skus") ? "unread" : seats ? "ok" : "bad", note: unread("skus") ? `not read — ${src.skus}` : seats ? `${used} of ${seats} used` : "no Entra ID P1 or P2 — the Microsoft traffic profile, the compliant network and source IP restoration all need it", help: "The Microsoft traffic profile, the compliant network check and source IP restoration come with Entra ID P1 or P2 — no extra licence." });
    // 2 tenant
    const st = raw.status && raw.status.onboardingStatus;
    const onboarded = st === "onboarded";
    const ztna = unread("ztna") ? null : (raw.ztna || []).length > 0;
    L.push({ k: "tenant", lab: "Tenant", h: "Global Secure Access", st: unread("status") ? "unread" : onboarded ? "ok" : /InProgress/.test(st || "") ? "warn" : "bad", note: unread("status") ? `not read — ${src.status}` : onboarded ? "activated" : st ? st.replace(/([A-Z])/g, " $1").toLowerCase() + (raw.status.onboardingErrorMessage ? ` — ${raw.status.onboardingErrorMessage}` : "") : "not activated",
      sub: ztna === null ? (src.ztna && src.ztna !== "ok" ? `ZTNA Policy Service Client not read — ${src.ztna}` : "") : ztna ? "ZTNA Policy Service Client: present" : "Info: the ZTNA Policy Service Client app is not in this tenant. Microsoft does not require it; one lab saw clients stay Partially Connected (sign-in errors 50097, 50187) until it was added. Create it only if your clients show that.",
      fix: !onboarded && !unread("status") && !/InProgress/.test(st || "") ? "onboard" : null, fix2: onboarded && ztna === false ? "ztnasp" : null });
    // 3 profile
    const prof = raw.profile, pols = (prof && prof.policies) || [];
    const profOn = !!prof && prof.state === "enabled", polsOff = pols.filter((x) => x.state !== "enabled").length;
    const allUsers = !!raw.sp && raw.sp.appRoleAssignmentRequired === false;
    const groups = (raw.assigned || []).filter((a) => a.principalType === "Group"), users = (raw.assigned || []).filter((a) => a.principalType === "User");
    const assigned = allUsers || groups.length || users.length;
    const profSt = !onboarded ? "wait" : unread("profile") ? "unread" : !prof ? "bad" : profOn && !polsOff && assigned ? "ok" : profOn ? "warn" : "bad";
    L.push({ k: "profile", lab: "Traffic", h: "Microsoft profile", st: profSt,
      note: !onboarded ? "waits on the tenant" : unread("profile") ? `not read — ${src.profile}` : !prof ? "no Microsoft traffic profile returned" : `${profOn ? "enabled" : "disabled"}${polsOff ? ` · ${polsOff} of ${pols.length} traffic policies off` : ""} · ${allUsers ? "all users" : assigned ? `${groups.length} group${groups.length === 1 ? "" : "s"}${users.length ? `, ${users.length} user${users.length === 1 ? "" : "s"}` : ""} assigned` : "nobody assigned"}`,
      fix: onboarded && prof && (!profOn || polsOff) ? "profile" : null, fix2: onboarded && prof && raw.sp && !assigned ? "assign" : onboarded && prof && raw.sp && !allUsers ? "assign" : null,
      help: "Device platforms (Windows, macOS, …) are set on the profile's Assignments page in the portal — there is no documented Graph call, so ENCA cannot read or set them. No devices assigned for a platform means no device of that platform gets the profile: check it there." });
    // 4 signalling
    const sig = raw.signaling && raw.signaling.signalingStatus === "enabled";
    L.push({ k: "signal", lab: "Signal", h: "CA signalling", st: !onboarded ? "wait" : unread("signaling") ? "unread" : sig ? "ok" : "bad", note: !onboarded ? "waits on the tenant" : unread("signaling") ? `not read — ${src.signaling}` : sig ? "enabled — source IP restored" : "disabled", fix: onboarded && !sig && !unread("signaling") ? "signal" : null, help: "Microsoft Learn calls it source IP restoration; the compliant network can only be targeted once it is on." });
    // 5 location
    const cn = (raw.locations || []).find(isCn) || null;
    L.push({ k: "location", lab: "Location", h: "Compliant network", st: unread("locations") ? "unread" : cn ? "ok" : sig ? "bad" : "wait", note: unread("locations") ? `not read — ${src.locations}` : cn ? `${cn.displayName}` : "not present — over Graph it is not made for you (the portal makes a second call); ENCA creates it", fix: !cn && !unread("locations") && sig ? "location" : null });
    // 6 client
    const winScript = (raw.scripts || []).find((s) => /global\s*secure\s*access/i.test(`${s.displayName} ${s.fileName}`)) || null;
    const winApp = (raw.apps || []).find((a) => /global\s*secure\s*access/i.test(a.displayName || "")) || null;
    // 32520 (Mihai 14 Oct: remediation it is — detect, if there, else deploy):
    // the Windows client as an Intune remediation (deviceHealthScripts), with
    // its run summary when read
    const winRem = (raw.healthScripts || []).find((h) => /global\s*secure\s*access/i.test(h.displayName || "")) || null;
    const macScript = (raw.shellScripts || []).find((s) => /global\s*secure\s*access/i.test(`${s.displayName} ${s.fileName}`)) || null;
    const winOk = !!(winRem || winScript || winApp);
    const rs = winRem && winRem.runSummary;
    // 32525: NOT read from runRemediationScript. Graph returns false on the
    // devcf remediation's assignment while the Intune portal shows remediation
    // on (Mihai checked, 14 Oct) — that property is no signal, so 32524's
    // detect-only verdict is gone.
    const remNote = winRem ? `Windows: ${winRem.displayName}${winRem.assigned === false ? " — NOT ASSIGNED" : ""}${rs ? ` (${rs.noIssueDetectedDeviceCount || 0} without issue · ${rs.issueRemediatedDeviceCount || 0} remediated · ${(rs.issueReoccurredDeviceCount || 0) + (rs.remediationScriptErrorDeviceCount || 0) + (rs.detectionScriptErrorDeviceCount || 0)} failing)` : ""}` : "";
    // the three macOS profiles the client cannot run without (made by hand,
    // in devcf as [OPTIONAL] MACOS - DCP - … GSA …): read, never written
    const mp = raw.macProfiles || {};
    const mprof = (k, label) => { const x = mp[k]; return x ? `${label} ${x.assigned ? "assigned" : "NOT ASSIGNED"}` : `${label} missing`; };
    const macProfOk = ["sysext", "proxy", "settings"].every((k) => mp[k] && mp[k].assigned);
    const macOk = !!macScript && macProfOk;
    L.push({ k: "client", lab: "Devices", h: "GSA client", st: unread("scripts") && unread("apps") ? "unread" : winOk && macOk ? "ok" : winOk || macScript ? "warn" : "bad",
      note: [winRem ? remNote : winScript ? `Windows: ${winScript.displayName}` : winApp ? `Windows: app ${winApp.displayName}` : "Windows: no remediation, script or app", macScript ? `macOS: ${macScript.displayName}` : "macOS: no shell script"].join(" · "),
      sub: unread("macProfiles") ? `macOS profiles not read — ${src.macProfiles}` : `macOS profiles: ${mprof("sysext", "system extensions")} · ${mprof("proxy", "transparent proxy")} · ${mprof("settings", "client settings")}`,
      help: "Windows: secure DNS (DNS over HTTPS) must be off in Edge and Chrome, or the client cannot tunnel by name — a settings catalog policy on the same devices. QUIC only matters once Internet Access is added.",
      fix: !winOk || (winRem && winRem.assigned === false) ? "winrem" : null, fix2: !macScript ? "macscript" : null, winScript, winApp, winRem, macScript, macProfOk });
    // 7 policy
    const policies = cnPolicies(caPolicies, cn && cn.id);
    const on = policies.filter((p) => p.state === "enabled"), ro = policies.filter((p) => p.state === "enabledForReportingButNotEnforced");
    L.push({ k: "policy", lab: "Policy", h: policies.length ? `${policies.length} polic${policies.length === 1 ? "y" : "ies"}` : "No policy", word: policies.length && !on.length && !ro.length ? "off" : null, st: !caPolicies ? "unread" : !policies.length ? (cn ? "bad" : "wait") : on.length ? "ok" : ro.length ? "warn" : "bad", note: !caPolicies ? "load 🗂 Policies first" : !policies.length ? "no Conditional Access policy names the compliant network" : `${on.length} on · ${ro.length} report-only · ${policies.length - on.length - ro.length} off — every one in the list below`, open: policies.length === 1 ? policies[0].id : null });
    // 8 proof — filled by proof(); the board shows it when read
    L.push({ k: "proof", lab: "Proof", h: "Sign-ins via GSA", st: "wait", note: "not read — 📈 Read the proof (7 days)" });

    // the groups Global Secure Access leans on: on the profile, and in the
    // policies that require the compliant network (include side only — an
    // exclusion is a group the policy does NOT reach)
    const gIds = new Map();
    groups.forEach((g) => { const name = g.principalDisplayName || (raw.groupNames || {})[g.principalId] || g.principalId; gIds.set(g.principalId, { id: g.principalId, name, backing: isBacking(name), why: isBacking(name) ? "the portal's backing group for the profile — do not use it in Intune or Conditional Access" : "assigned on the Microsoft traffic profile" }); });
    policies.forEach((p) => p.includeGroups.forEach((id) => { if (!gIds.has(id)) gIds.set(id, { id, name: (raw.groupNames || {})[id] || id, why: `included by ${p.name}` }); }));

    const ready = L.filter((l) => l.st === "ok").length;
    const firstBad = L.find((l) => l.st === "bad" || l.st === "warn");
    return { links: L, ready, total: L.length, verdict: verdict(L, policies), next: firstBad || null, policies, policiesLoaded: !!caPolicies, intune: intune(raw), cn, allUsers, groups: [...gIds.values()], groupIds: [...gIds.keys()], sp: raw.sp || null, profile: prof, readAt: raw.readAt || null, demo: !!raw.demo };
  }
  function verdict(L, policies) {
    const by = Object.fromEntries(L.map((l) => [l.k, l]));
    if (by.policy.st === "ok" && ["tenant", "profile", "signal", "location"].every((k) => by[k].st === "ok")) return { cls: "ok", h: "A stolen token no longer works outside the compliant network", p: "The chain is complete and at least one policy that requires the compliant network is on. Watch the proof for sign-ins it blocks that should not be blocked — a device without the client, an IPv6 path around the tunnel." };
    if (!policies.length) return { cls: "bad", h: "A stolen token still works from anywhere", p: "No Conditional Access policy requires the compliant network yet. Build the chain below first, then a block-outside-the-compliant-network policy in report-only." };
    return { cls: "bad", h: "A stolen token still works from anywhere", p: `${policies.map((p) => p.name).slice(0, 2).join(", ")} ${policies.some((p) => p.state === "enabled") ? "is on, but a link before it is missing — the compliant network cannot be satisfied, so it blocks people instead of tokens" : "is not on"}. Blocked at step ${L.indexOf(L.find((l) => l.st === "bad" || l.st === "warn") || L[0]) + 1} — ${(L.find((l) => l.st === "bad" || l.st === "warn") || L[0]).h}.` };
  }

  // ---- proof from the sign-in log -----------------------------------------
  function proof(signIns, policyIds) {
    const ids = new Set(policyIds || []);
    const per = {};
    let viaGsa = 0, total = 0;
    for (const s of signIns || []) {
      total++;
      if (s.isThroughGlobalSecureAccess === true || s.globalSecureAccessIpAddress) viaGsa++;
      for (const a of s.appliedConditionalAccessPolicies || []) {
        if (!ids.has(a.id)) continue;
        const p = per[a.id] || (per[a.id] = { wouldBlock: 0, wouldPass: 0, blocked: 0, passed: 0, notApplied: 0, usersBlock: new Set(), usersPass: new Set() });
        const r = a.result;
        if (r === "reportOnlyFailure") { p.wouldBlock++; p.usersBlock.add(s.userId); }
        else if (r === "reportOnlySuccess") { p.wouldPass++; p.usersPass.add(s.userId); }
        else if (r === "failure") { p.blocked++; p.usersBlock.add(s.userId); }
        else if (r === "success") { p.passed++; p.usersPass.add(s.userId); }
        else p.notApplied++;
      }
    }
    Object.values(per).forEach((p) => { p.usersBlock = p.usersBlock.size; p.usersPass = p.usersPass.size; });
    return { per, viaGsa, total };
  }
  function proofLink(m, pr) {
    const l = m.links.find((x) => x.k === "proof");
    if (!pr) return;
    const share = pr.total ? Math.round(pr.viaGsa / pr.total * 100) : 0;
    const block = Object.values(pr.per).reduce((a, p) => a + p.wouldBlock + p.blocked, 0);
    l.st = pr.total && share >= 90 && !block ? "ok" : pr.viaGsa ? "warn" : "bad";
    l.note = `${share}% of ${pr.total} sign-ins through GSA · ${block} would be or were blocked`;
  }

  // ---- render -------------------------------------------------------------
  const LANES = [["Foundation", ["licence", "tenant"]], ["Traffic path", ["profile", "signal", "location"]], ["Endpoint", ["client"]], ["Enforce", ["policy"]], ["Verify", ["proof"]]];
  const ICON = { ok: "✓", warn: "!", bad: "✕", wait: "…" };
  // the step the flow opens on: the first that blocks, else Proof
  const defaultSel = (m) => ((m.links.find((l) => l.st === "bad" || l.st === "warn") || m.links.find((l) => l.k === "proof") || m.links[0]).k);
  const ST = { ok: ["ok", "ready"], warn: ["warn", "partly"], bad: ["bad", "missing"], wait: ["wait", "waits"], unread: ["wait", "not read"] };
  const FIX_LABEL = { onboard: "Activate…", profile: "Enable profile…", assign: "Assign…", signal: "Enable…", location: "Create…", winscript: "Create Windows script…", macscript: "Create macOS script…", ztnasp: "Create ZTNA client SP (only if clients stay Partially Connected)…", winrem: "Create Windows remediation…" };
  function render(m, ui) {
    const u = ui || {};
    if (u.proof) proofLink(m, u.proof);
    const meter = m.links.map((l) => `<i class="${l.st === "ok" ? "ok" : l.st === "warn" ? "warn" : ""}"></i>`).join("");
    const head = `<section class="gsa-verdict ${m.verdict.cls}"><div class="gsa-big" aria-hidden="true">${m.verdict.cls === "ok" ? "✓" : "⚠"}</div><div><h3>${esc(m.verdict.h)}</h3><p>${esc(m.verdict.p)}</p></div><div><div class="gsa-meter" aria-label="${m.ready} of ${m.total} links ready">${meter}</div><div class="mini" style="margin-top:4px">${m.ready} of ${m.total} links ready</div></div></section>`;
    // 32524 (Mihai: "this should be more of a flow overview, and when edit
    // like create scripts that should happen below the flow overview"; then
    // "stacked"): the eight links are ONE flow in five lanes, the selected
    // step opens under it, and every fix opens as its own workspace below that
    // — several can be open at once, newest first. The flow stays in view.
    const sel = m.links.find((l) => l.k === u.sel) ? u.sel : defaultSel(m);
    const node = (l, i) => {
      const [cls, w0] = ST[l.st] || ST.wait, word = l.word || w0;
      return `<button type="button" class="gsa-node ${cls}${l.k === sel ? " sel" : ""}" data-gsasel="${l.k}" aria-pressed="${l.k === sel}" title="${esc(l.note)}"><span class="gsa-dot" aria-hidden="true">${ICON[cls] || "…"}</span><span class="gsa-lab">${i + 1} · ${esc(l.lab)}</span><b>${esc(l.h)}</b><span class="gsa-nv">${esc(word)}</span></button>`;
    };
    const lanes = LANES.map(([name, keys]) => `<div class="gsa-lane" style="grid-column:span ${keys.length}">${esc(name)}</div>`).join("");
    const flow = `<section class="list-card gsa-flow" aria-label="The chain, step by step"><div class="gsa-flow-in"><div class="gsa-lanes">${lanes}</div><div class="gsa-nodes">${m.links.map(node).join("")}</div></div><div class="gsa-legend mini muted"><span><i class="ok"></i>ready</span><span><i class="warn"></i>partly</span><span><i class="bad"></i>missing or off</span><span><i class="wait"></i>waits or not read</span><span>· click a step for its detail and fixes</span></div></section>`;
    const l = m.links.find((x) => x.k === sel), li = m.links.indexOf(l);
    const [cls, w0] = ST[l.st] || ST.wait;
    const acts = [];
    const act = (btn, h, sub) => acts.push(`<div class="gsa-actrow"><div><b>${esc(h)}</b>${sub ? `<div class="mini muted">${esc(sub)}</div>` : ""}</div>${btn}</div>`);
    const fixAct = (k, primary, optional) => { const f = FIXES[k] || {}; act(`<button class="btn sm${primary ? " primary" : ""}${optional ? " gsa-optional" : ""}" data-gsafix="${k}">${esc(FIX_LABEL[k].replace(/ \(only if[^)]*\)/, ""))}</button>`, f.title || FIX_LABEL[k], `${optional ? "Optional — only if clients stay Partially Connected. " : ""}writes to tenant · opens a workspace below with what it sends, its impact and the way back`); };
    if (l.fix) fixAct(l.fix, l.st === "bad", false);
    if (l.fix2 && l.fix2 !== l.fix) fixAct(l.fix2, false, l.fix2 === "ztnasp");
    if (l.k === "policy" && l.open) act(`<button class="btn sm" data-gsaopen="${esc(l.open)}">Open in Policies</button>`, "Open the policy", "state and exclusions are changed in 🗂 Policies — this tool leaves them as they are");
    if (l.k === "policy" && m.policies.length) act(`<button class="btn sm" data-gsajump="gsaPols">Show the list</button>`, `Every policy that names the compliant network (${m.policies.length})`, "the card below the workspaces");
    if (l.k === "client") act(`<button class="btn sm" data-gsajump="gsaIntune">Show the Intune card</button>`, "Every GSA remediation, script, app and macOS profile", "where it is in Intune and whom it is assigned to");
    if (l.k === "proof") act(`<button class="btn sm" data-gsaproof>📈 Read the proof (7 days)</button>`, "Read the sign-in log", "sign-ins through GSA, and what the compliant-network policies would block");
    // split on " · " outside brackets — a run summary "(0 without issue · …)" stays whole
    const parts = []; { let depth = 0, cur = ""; const t = String(l.note || ""); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (ch === "(") depth++; if (ch === ")") depth = Math.max(0, depth - 1); if (!depth && t.startsWith(" · ", i)) { parts.push(cur); cur = ""; i += 2; continue; } cur += ch; } parts.push(cur); }
    const read = parts.length > 2 || String(l.note || "").length > 90 ? `<ul class="gsa-read">${parts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(l.note)}</p>`;
    const prev = m.links[li - 1], waitWhy = l.st === "wait" && prev ? `<p class="mini muted">Waits on step ${li}, ${esc(prev.h)}.</p>` : "";
    const detail = `<section class="list-card gsa-detail ${cls}" id="gsaDetail" aria-live="polite"><div class="gsa-detail-main"><span class="gsa-lab">Step ${li + 1} of ${m.links.length} · ${esc(l.lab)}</span><h3>${esc(l.h)} <span class="gsa-st ${cls}">${esc(l.word || w0)}</span></h3>${read}${waitWhy}${l.sub ? `<p class="mini${/NOT ASSIGNED|missing|not read/.test(l.sub) ? " gsa-warn-txt" : " muted"}">${esc(l.sub)}</p>` : ""}${l.help ? `<p class="mini muted">${esc(l.help)}</p>` : ""}</div><div class="gsa-detail-act"><div class="gsa-lab">What you can do</div>${acts.length ? acts.join("") : `<p class="mini muted">${l.st === "ok" ? "Nothing to do here — this link is ready." : "Nothing ENCA can do from here — see the note."}</p>`}<div class="gsa-stepnav"><button class="btn sm" data-gsasel="${(m.links[li - 1] || l).k}"${li ? "" : " disabled"}>‹ Step ${li}</button><button class="btn sm" data-gsasel="${(m.links[li + 1] || l).k}"${li < m.links.length - 1 ? "" : " disabled"}>Step ${li + 2} ›</button></div></div></section>`;
    const work = (u.work || []).length ? `<section class="gsa-work" id="gsaWork" aria-label="Workspaces"><div class="gsa-work-head mini muted">⚙ Workspaces · ${u.work.length} open · newest first · each one runs on its own Apply</div>${u.work.join("")}</section>` : "";
    const yes = (b) => b ? '<span class="gsa-st ok">out</span>' : '<span class="gsa-st warn">not out</span>';
    const polRows = m.policies.map((p) => `<tr><td><a href="#" data-gsaopen="${esc(p.id)}"><b>${esc(p.name)}</b></a><div class="mini muted">${esc(p.shape)}${p.platforms ? ` · ${esc(p.platforms)}` : ""}</div></td><td><span class="gsa-st ${p.state === "enabled" ? "ok" : p.state === "enabledForReportingButNotEnforced" ? "warn" : "wait"}">${p.state === "enabled" ? "on" : p.state === "enabledForReportingButNotEnforced" ? "report-only" : "off"}</span></td><td class="mini">${p.cnSide === "excluded" ? "excluded — applies outside it" : "included — applies on it"}</td><td class="mini">${esc(p.grant)}</td><td class="mini">${p.allUsers ? "All users" : `${p.includeGroups.length} group${p.includeGroups.length === 1 ? "" : "s"}`}${p.excludeGroups.length ? ` · ${p.excludeGroups.length} excluded` : ""}</td><td class="mini">Intune ${yes(p.intuneOut)} · Enrollment ${yes(p.enrollOut)} · ${p.excludeRoles.length ? `${p.excludeRoles.length} admin role${p.excludeRoles.length === 1 ? "" : "s"} excluded` : "no admin role excluded"}</td>${u.proof ? `<td class="mini">${(() => { const x = u.proof.per[p.id]; return x ? `${x.wouldBlock + x.blocked} block (${x.usersBlock} users) · ${x.wouldPass + x.passed} pass` : "no sign-in evaluated"; })()}</td>` : ""}</tr>`).join("");
    // 32522 (Mihai: a dedicated card that shows every policy containing the
    // compliant network): full width, every loaded policy that names it on
    // either side, with where it sits and what the grant is
    const nOn = m.policies.filter((p) => p.state === "enabled").length, nRo = m.policies.filter((p) => p.state === "enabledForReportingButNotEnforced").length;
    const polHead = `<h3>Policies that name the compliant network <span class="mini muted">· ${m.policiesLoaded ? `${m.policies.length} found${m.policies.length ? ` · ${nOn} on · ${nRo} report-only · ${m.policies.length - nOn - nRo} off` : ""}` : "policies not loaded"}</span></h3>`;
    const polBody = !m.policiesLoaded ? '<p class="mini">Load 🗂 Policies first: this card lists every loaded policy that names the compliant network, on either side.</p>'
      : m.policies.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Policy</th><th>State</th><th>Compliant network</th><th>Grant</th><th>Covers</th><th>Checks</th>${u.proof ? "<th>7 days</th>" : ""}</tr></thead><tbody>${polRows}</tbody></table></div>`
      : '<p class="mini">None of the loaded policies names the compliant network. ENCA does not make this policy here: build it in 🧩 Policy building blocks → 🏗 Builder (block, any location except the compliant network, report-only) once links 1–6 are ready.</p>';
    const polTable = `<section class="list-card gsa-sect gsa-pols" id="gsaPols">${polHead}${polBody}<p class="mini muted">Read from the policies ENCA already holds — the ones loaded in 🗂 Policies, from the tenant or a file. This tool leaves them as they are: state and exclusions are changed in 🗂 Policies or 🎚 Set policy state. Without the Microsoft Intune and Intune Enrollment apps out, a new device cannot enrol to receive the client. Excluded admin roles are reported, not changed: see the admin handover.</p></section>`;
    // 32523: the Intune card
    const iv = m.intune || { rows: [], unread: [], missingProfiles: [] };
    const tg = (r) => r.t ? `${r.t.inc.length ? esc(r.t.inc.join(", ")) : '<span class="gsa-st bad">not assigned</span>'}${r.t.exc.length ? `<div class="mini muted">excluded: ${esc(r.t.exc.join(", "))}</div>` : ""}` : r.assigned === false ? '<span class="gsa-st bad">not assigned</span>' : r.assigned ? "assigned" : '<span class="muted">not read</span>';
    const ivRows = iv.rows.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.dup ? ' <span class="gsa-st warn">duplicate</span>' : ""}<div class="mini muted">${esc(r.kind)}</div></td><td class="mini">${esc(r.os)}</td><td class="mini">Intune › ${esc(r.where)}</td><td class="mini">${esc(r.by)}</td><td class="mini">${tg(r)}</td></tr>`).join("");
    const ivNotes = [
      ...(iv.winBoth ? ["Windows has more than one kind of deployment (remediation, platform script or app): each installs the client — keep one and remove the others' assignments."] : []),
      ...(iv.missingProfiles.length ? [`macOS profile not found: ${iv.missingProfiles.join(", ")} — make it by hand in Devices › macOS › Configuration.`] : []),
      ...iv.unread,
    ];
    const ivTable = `<section class="list-card gsa-sect gsa-intune" id="gsaIntune"><h3>Intune policies and scripts for the client <span class="mini muted">· ${iv.rows.length} found</span></h3>${iv.rows.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Policy</th><th>Platform</th><th>Where in Intune</th><th>Made by</th><th>Assigned to</th></tr></thead><tbody>${ivRows}</tbody></table></div>` : '<p class="mini">None found — no remediation, script, app or macOS profile with Global Secure Access (or GSA) in its name.</p>'}${ivNotes.map((n) => `<p class="mini gsa-warn-txt">${esc(n)}</p>`).join("")}<p class="mini muted">Matched by name. ENCA makes the Windows remediation and the macOS shell script (the fixes on the Devices link); the macOS profiles are read, never written. Made by ENCA T56 is read from the description ENCA writes.</p></section>`;
    const grpRows = m.groups.map((g) => `<tr${g.backing ? ' class="gsa-backing"' : ""}><td><b>${esc(g.name)}</b><div class="mini muted">${esc(g.id)}</div></td><td class="mini">${esc(g.why)}</td></tr>`).join("");
    const grpTable = `<section class="list-card gsa-sect"><h3>Groups Global Secure Access uses <span class="mini muted">· ${m.allUsers ? "the profile is on for all users" : `${m.groups.length}`}</span></h3>${m.groups.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Group</th><th>Why</th></tr></thead><tbody>${grpRows}</tbody></table></div><p class="mini muted">The same list is the <b>Used by GSA</b> scope of 👥 Groups (T12). <button class="btn sm" data-gsagroups>Open in Groups</button></p>` : '<p class="mini">No group yet — assign a pilot group to the profile, or a compliant-network policy that includes a group.</p>'}</section>`;
    const proofSect = u.proof ? `<section class="list-card gsa-sect"><h3>Sign-ins, last 7 days</h3><p class="mini">${u.proof.total} sign-ins read${u.proof.capped ? " (the first 5,000)" : ""} · ${u.proof.viaGsa} through Global Secure Access.</p><p class="mini muted">A sign-in a report-only policy would block is one that did not come through the client — a device without it, the client paused, or an IPv6 path around the tunnel (the client tunnels IPv4 only). Switch the policy on when this is near zero; this tool does not do that for you.</p></section>` : u.proofBusy ? `<section class="list-card gsa-sect"><p class="mini">Reading the sign-in log…</p></section>` : "";
    const later = `<p class="mini muted gsa-later">🌐 This tool covers the <b>Microsoft traffic profile</b>. Internet Access and Private Access come later; their profiles and assignments will join this board and the Used by GSA scope.</p>`;
    return head + flow + detail + work + polTable + ivTable + grpTable + proofSect + later;
  }

  // ---- the Intune platform script (Windows) -------------------------------
  // ENCA's own text, the same steps as Microsoft's client guidance: download
  // the client for the device's architecture from aka.ms, install it quietly,
  // and lock it down (the users-can't-disable keys). Prefer-IPv4 is optional
  // and off by default: it changes the network stack and needs a reboot.
  function windowsScript(opts) {
    // 32518: two client settings. Pilot = Learn's sample (and the
    // LearnGraphAPI lab): sign-out and Disable Private Access hidden, Disable
    // visible, every user may change it. Locked = all four on.
    const o = opts || {}, lock = o.lock === true;
    const vals = lock ? { HideDisableButton: 1, HideSignOutButton: 1, HideDisablePrivateAccessButton: 1, RestrictNonPrivilegedUsers: 1 } : { HideDisableButton: 0, HideSignOutButton: 1, HideDisablePrivateAccessButton: 1, RestrictNonPrivilegedUsers: 0 };
    return [
      "# Global Secure Access client — install and lock down",
      "# Written by ENCA T56 (Workspace 03 · Entra Tools). Runs as SYSTEM, once, as an Intune platform script.",
      "$ErrorActionPreference = 'Stop'",
      "$exe = Join-Path $env:ProgramFiles 'Global Secure Access Client\\TrayApp\\GlobalSecureAccessClient.exe'",
      "if (-not (Test-Path $exe)) {",
      "  $arm = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') -or ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')",
      "  $url = if ($arm) { 'https://aka.ms/GlobalSecureAccess-WindowsOnArm' } else { 'https://aka.ms/GlobalSecureAccess-windows' }",
      "  $file = Join-Path $env:TEMP 'GlobalSecureAccessClient.exe'",
      "  Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing",
      "  $p = Start-Process -FilePath $file -ArgumentList '/quiet', '/norestart' -Wait -PassThru",
      "  Remove-Item $file -Force -ErrorAction SilentlyContinue",
      "  if ($p.ExitCode -notin 0, 3010) { throw \"Global Secure Access client installer exit code $($p.ExitCode)\" }",
      "}",
      "$key = 'HKLM:\\SOFTWARE\\Microsoft\\Global Secure Access Client'",
      "New-Item -Path $key -Force | Out-Null",
      `# client settings: ${lock ? "locked down" : "pilot (Learn sample)"}`,
      ...Object.entries(vals).map(([k, v]) => `Set-ItemProperty -Path $key -Name '${k}' -Value ${v} -Type DWord -Force`),
      ...(o.ipv4 ? [
        "# Prefer IPv4: the client tunnels IPv4 only, so an IPv6 path to Entra goes around it. Takes effect after a reboot (Intune does not reboot for a platform script).",
        "$tcp6 = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters'",
        "Set-ItemProperty -Path $tcp6 -Name 'DisabledComponents' -Value 0x20 -Type DWord -Force",
      ] : []),
      "exit 0",
    ].join("\r\n");
  }
  // ---- the Windows remediation (32520) ------------------------------------
  // DETECT: the client in the uninstall keys (the walkthrough's detect_gsa.ps1,
  // no version baked in) and the client settings as chosen → exit 0 when both
  // hold, exit 1 otherwise. REMEDIATE: install when missing (the walkthrough's
  // install_gsa.ps1: architecture from Win32_Processor, the aka.ms installer,
  // TLS 1.2, quiet), then write the client settings. No restart — Intune says
  // never to restart from a remediation; prefer-IPv4 waits for the next one.
  // Output stays short: Intune keeps 2,048 characters.
  const settingVals = (lock) => lock ? { HideDisableButton: 1, HideSignOutButton: 1, HideDisablePrivateAccessButton: 1, RestrictNonPrivilegedUsers: 1 } : { HideDisableButton: 0, HideSignOutButton: 1, HideDisablePrivateAccessButton: 1, RestrictNonPrivilegedUsers: 0 };
  const psHash = (o) => `@{ ${Object.entries(o).map(([k, v]) => `${k} = ${v}`).join("; ")} }`;
  function detectScript(opts) {
    const o = opts || {};
    return [
      "# Detect Global Secure Access Client — ENCA T56. Exit 0 = installed and settings as required; exit 1 = remediate.",
      "$app = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Global Secure Access Client*' } | Select-Object -First 1",
      "if (-not $app) { Write-Output 'GSA client not installed'; exit 1 }",
      "$key = 'HKLM:\\SOFTWARE\\Microsoft\\Global Secure Access Client'",
      `$want = ${psHash(settingVals(o.lock === true))}`,
      "$drift = @(); foreach ($k in $want.Keys) { $cur = (Get-ItemProperty -Path $key -Name $k -ErrorAction SilentlyContinue).$k; if ($cur -ne $want[$k]) { $drift += \"$k=$cur\" } }",
      ...(o.ipv4 ? ["$v6 = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters' -Name DisabledComponents -ErrorAction SilentlyContinue).DisabledComponents", "if ($v6 -ne 0x20) { $drift += \"DisabledComponents=$v6\" }"] : []),
      "if ($drift.Count) { Write-Output \"GSA client $($app.DisplayVersion) installed; settings differ: $($drift -join ', ')\"; exit 1 }",
      "Write-Output \"GSA client $($app.DisplayVersion) installed; settings as required\"",
      "exit 0",
    ].join("\r\n");
  }
  function remediationScript(opts) {
    const o = opts || {};
    return [
      "# Remediate Global Secure Access Client — ENCA T56. Install when missing, then the client settings. Runs as SYSTEM, 64-bit.",
      "$ErrorActionPreference = 'Stop'",
      "$log = \"$env:ProgramData\\GSAInstall\\install.log\"",
      "New-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null",
      "function Log($m) { Add-Content -Path $log -Value ('{0} - {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }",
      "try {",
      "  $app = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Global Secure Access Client*' } | Select-Object -First 1",
      "  if (-not $app) {",
      "    # Win32_Processor.Architecture: 9 = x64, 12 = ARM64",
      "    $arm = ((Get-CimInstance Win32_Processor | Select-Object -First 1).Architecture -eq 12)",
      "    $url = if ($arm) { 'https://aka.ms/GlobalSecureAccess-WindowsOnArm' } else { 'https://aka.ms/GlobalSecureAccess-Windows' }",
      "    $exe = Join-Path $env:TEMP 'GlobalSecureAccessClient.exe'",
      "    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
      "    Log \"Downloading $url\"",
      "    Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing",
      "    $p = Start-Process -FilePath $exe -ArgumentList '/quiet', '/norestart' -Wait -PassThru",
      "    Remove-Item $exe -Force -ErrorAction SilentlyContinue",
      "    Log \"Installer exit code $($p.ExitCode)\"",
      "    if ($p.ExitCode -notin 0, 3010) { Write-Output \"GSA install failed, exit code $($p.ExitCode)\"; exit 1 }",
      "  }",
      "  $key = 'HKLM:\\SOFTWARE\\Microsoft\\Global Secure Access Client'",
      "  New-Item -Path $key -Force | Out-Null",
      `  $want = ${psHash(settingVals(o.lock === true))}`,
      "  foreach ($k in $want.Keys) { Set-ItemProperty -Path $key -Name $k -Value $want[$k] -Type DWord -Force }",
      ...(o.ipv4 ? ["  # prefer IPv4 — the client tunnels IPv4 only; takes effect at the next restart (no restart here)", "  Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters' -Name DisabledComponents -Value 0x20 -Type DWord -Force"] : []),
      `  Log 'Client settings written (${o.lock === true ? "locked down" : "pilot"})'`,
      "  Write-Output ('GSA client {0}; settings written' -f ($(if ($app) { 'present' } else { 'installed' })))",
      "  exit 0",
      "} catch { Log \"Fatal: $_\"; Write-Output \"GSA remediation failed: $_\"; exit 1 }",
    ].join("\r\n");
  }
  function remediationBody(opts) {
    return { "@odata.type": "#microsoft.graph.deviceHealthScript", displayName: names(opts).rem, description: "Detects the Global Secure Access client and its client settings; installs it from aka.ms (x64 or ARM64) when missing and writes the settings (" + ((opts && opts.lock) ? "locked down" : "pilot") + "). Created by ENCA T56.", publisher: "ENCA", runAsAccount: "system", runAs32Bit: false, enforceSignatureCheck: false, roleScopeTagIds: ["0"], detectionScriptContent: b64(detectScript(opts)), remediationScriptContent: b64(remediationScript(opts)) };
  }
  // the assignment: the device group, remediation on, daily (default) or hourly
  function remediationAssignment(groupId, schedule) {
    const runSchedule = schedule === "hourly" ? { "@odata.type": "#microsoft.graph.deviceHealthScriptHourlySchedule", interval: 1 } : { "@odata.type": "#microsoft.graph.deviceHealthScriptDailySchedule", interval: 1, time: "09:00:00.0000000", useUtc: false };
    return { target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId }, runRemediationScript: true, runSchedule };
  }

  // UTF-8 → base64, for scriptContent
  const b64 = (text) => { const bytes = new TextEncoder().encode(text); let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  function windowsScriptBody(opts) {
    return { "@odata.type": "#microsoft.graph.deviceManagementScript", displayName: names(opts).win, description: "Downloads the Global Secure Access client (x64 or ARM64) from aka.ms, installs it quietly and hides Disable, Sign out and Disable Private Access for users (lock-down). Runs once as SYSTEM. Created by ENCA T56.", fileName: WIN_FILE, runAsAccount: "system", runAs32Bit: false, enforceSignatureCheck: false, roleScopeTagIds: ["0"], scriptContent: b64(windowsScript(opts)) };
  }
  // macOS: the shell script in the style of the devcf scr-app-1NN installers
  // (zsh, a log under /Library/Logs/Microsoft/IntuneScripts, skip when the app
  // is there). It installs the client only: the system extension policy, the
  // transparent proxy profile and the client settings are Intune profiles the
  // board reads and says are missing or unassigned.
  function macScript() {
    return [
      "#!/bin/zsh",
      "# Install Global Secure Access Client for macOS — written by ENCA T56.",
      "# Intune shell script: run as root, not as the signed-in user. It does NOT approve the system extension or",
      "# the transparent proxy: those come from two profiles that must reach the Mac first, assigned to the same group —",
      "#   the system extension policy (Team ID UBF8T346G9; com.microsoft.globalsecureaccess and .tunnel)",
      "#   the transparent proxy profile (com.apple.vpn.managed, provider com.microsoft.globalsecureaccess.tunnel)",
      "# and optionally the client settings (com.microsoft.globalsecureaccess). Checks adopted from the",
      "# LearnGraphAPI GSA lab (Jhope188): macOS 14 or later, the package signed by Microsoft, a warning without profiles.",
      "appname=\"Global Secure Access Client\"",
      "url=\"https://aka.ms/GlobalSecureAccess-macOS\"",
      "teamid=\"UBF8T346G9\"",
      "minmajor=14",
      "logdir=\"/Library/Logs/Microsoft/IntuneScripts/GlobalSecureAccess\"",
      "mkdir -p \"$logdir\"",
      "exec >> \"$logdir/install.log\" 2>&1",
      "say() { echo \"$(date '+%Y-%m-%d %H:%M:%S') | $1\"; }",
      "say \"start\"",
      "if [[ $(id -u) -ne 0 ]]; then say \"must run as root\"; exit 1; fi",
      "major=$(sw_vers -productVersion | cut -d. -f1)",
      "if [[ $major -lt $minmajor ]]; then say \"macOS $major is below $minmajor — skipped\"; exit 0; fi",
      "# Learn's uninstall path is /Applications/GlobalSecureAccessClient; the app bundle name is checked too",
      "for p in \"/Applications/GlobalSecureAccessClient\" \"/Applications/Global Secure Access Client.app\"; do",
      "  if [[ -d \"$p\" ]]; then say \"$appname already installed ($p)\"; exit 0; fi",
      "done",
      "if ! /usr/bin/profiles show -all 2>/dev/null | grep -qi \"com.microsoft.globalsecureaccess\"; then say \"WARNING: no GSA profile on this Mac yet — the user may see approval prompts\"; fi",
      "tmp=$(mktemp -d /tmp/gsa.XXXXXX)",
      "trap 'rm -rf \"$tmp\"' EXIT",
      "pkg=\"$tmp/GlobalSecureAccessClient.pkg\"",
      "if ! curl -L --fail --silent --show-error --retry 3 --max-time 900 -o \"$pkg\" \"$url\"; then say \"download failed\"; exit 1; fi",
      "if [[ ! -s \"$pkg\" ]]; then say \"downloaded file is empty\"; exit 1; fi",
      "if ! /usr/sbin/pkgutil --check-signature \"$pkg\" | grep -q \"$teamid\"; then say \"package not signed by team $teamid — refused\"; exit 1; fi",
      "if ! /usr/sbin/installer -pkg \"$pkg\" -target /; then say \"install failed\"; exit 1; fi",
      "say \"$appname installed\"",
      "exit 0",
    ].join("\n");
  }
  function macScriptBody(opts) {
    return { "@odata.type": "#microsoft.graph.deviceShellScript", displayName: names(opts).mac, description: "Downloads the Global Secure Access client for macOS from aka.ms and installs it when it is not there. The client also needs the GSA system extension policy, the GSA transparent proxy profile and the GSA client settings, assigned to the same devices. Created by ENCA T56.", fileName: MAC_FILE, runAsAccount: "system", executionFrequency: "PT0S", retryCount: 3, blockExecutionNotifications: true, roleScopeTagIds: ["0"], scriptContent: b64(macScript()) };
  }

  // ---- what a fix sends, for the workspace (32524) -----------------------
  // Scripts as they will be uploaded (same functions as the upload), the
  // Graph requests as written. Pure: the workspace shows it, nothing runs.
  function preview(k, opts) {
    const o = opts || {}, nm = names({ rel: o.rel, ver: o.ver });
    const req = (lines) => [{ id: "req", label: "Graph request", lang: "http", text: lines.join("\n") }];
    const j = (x) => JSON.stringify(x, null, 2);
    if (k === "winrem") return [{ id: "det", label: "Detection", lang: "powershell", text: detectScript(o) }, { id: "rem", label: "Remediation", lang: "powershell", text: remediationScript(o) }, ...req([`POST /deviceManagement/deviceHealthScripts   (${nm.rem})`, `POST /deviceManagement/deviceHealthScripts/{id}/assign`, j({ deviceHealthScriptAssignments: [remediationAssignment("<" + (o.devGroup || GROUPS.win) + ">", o.schedule)] })])];
    if (k === "winscript") return [{ id: "win", label: WIN_FILE, lang: "powershell", text: windowsScript(o) }];
    if (k === "macscript") return [{ id: "mac", label: MAC_FILE, lang: "shell", text: macScript() }];
    if (k === "ztnasp") return req(["POST /v1.0/servicePrincipals", j({ appId: ZTNA_CLIENT })]);
    if (k === "location") return req(["POST /identity/conditionalAccess/namedLocations", j({ "@odata.type": "#microsoft.graph.compliantNetworkNamedLocation", displayName: LOCATION_NAME, compliantNetworkType: "allTenantCompliantNetworks", isTrusted: false })]);
    if (k === "signal") return req(["PATCH /networkAccess/settings/conditionalAccess", j({ "@odata.type": "#microsoft.graph.networkaccess.conditionalAccessSettings", signalingStatus: "enabled" })]);
    if (k === "onboard") return req(["POST /networkAccess/microsoft.graph.networkaccess.onboard", "{}", "", "then GET /networkAccess/tenantStatus every 15 s until onboarded (up to five minutes)"]);
    if (k === "profile") return req(["PATCH /networkAccess/forwardingProfiles/{Microsoft profile}", j({ state: "enabled" }), "", "PATCH /networkAccess/forwardingProfiles/{id}/policies/{each one off}", j({ state: "enabled" })]);
    if (k === "assign") return req(o.allUsers ? ["PATCH /v1.0/servicePrincipals/{the profile's app}", j({ appRoleAssignmentRequired: false })] : ["POST /v1.0/servicePrincipals/{the profile's app}/appRoleAssignedTo", j({ principalId: `<${o.group || "group"}>`, resourceId: "{the profile's app}", appRoleId: "{its user role, or the default}" })]);
    return [];
  }

  // ---- the fixes, described before they run (impact and recovery first) ----
  const FIXES = {
    onboard: { title: "Activate Global Secure Access", scopes: ["NetworkAccessPolicy.ReadWrite.All", "NetworkAccess.ReadWrite.All"], role: "Global Secure Access Administrator", changes: ["POST /networkAccess/microsoft.graph.networkaccess.onboard, then read the tenant status every 15 seconds until it says onboarded (up to five minutes)."], impact: "Activation moves no traffic and affects nobody by itself — traffic only moves once a profile is on, assigned and a client runs on the device.", recovery: "Offboarding is done in the Entra admin center (Global Secure Access → Settings); nothing else here depends on it yet." },
    profile: { title: "Enable the Microsoft traffic profile", scopes: ["NetworkAccess.ReadWrite.All"], role: "Global Secure Access Administrator", changes: ["PATCH the Microsoft traffic profile: state enabled.", "PATCH every traffic policy of the profile that is not enabled: state enabled."], impact: "Devices of ASSIGNED users that run the client start sending Microsoft 365 and Entra traffic through Global Secure Access. Nobody without an assignment or a client is affected.", recovery: "Set the profile back to disabled in Global Secure Access → Connect → Traffic forwarding (or here, after a re-read); traffic falls back to direct." },
    assign: { title: "Assign the Microsoft traffic profile", scopes: ["AppRoleAssignment.ReadWrite.All", "Application.ReadWrite.All"], role: "Application Administrator", changes: ["Pilot group (recommended): add the group to the profile's enterprise app (an app role assignment on its service principal).", "Or all users: set appRoleAssignmentRequired to false on that service principal — the CyberDrain route."], impact: "The assigned users' client starts tunnelling Microsoft traffic. A compliant-network policy will then pass them; anybody not assigned keeps failing it.", recovery: "Remove the assignment (Enterprise applications → the profile's app → Users and groups), or set Assignment required back to Yes." },
    signal: { title: "Enable Conditional Access signalling", scopes: ["NetworkAccess.ReadWrite.All"], role: "Global Secure Access Administrator", changes: ["PATCH /networkAccess/settings/conditionalAccess: signalingStatus enabled."], impact: "Entra sees the user's real source IP for traffic through the tunnel and can evaluate the compliant network. Named-location policies on IP ranges start seeing the original IP for those sign-ins.", recovery: "Turn it off in Global Secure Access → Settings → Session management only AFTER the policies that require the compliant network are off or deleted — Microsoft warns against disabling signalling while they exist, they would then fail everyone." },
    winrem: { title: "Create the Windows remediation", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST an Intune remediation (Devices → Scripts and remediations) named by the CloudFellows convention (Win - DHS - Device Security - D - Install Global Secure Access Client - R… - v…; SYSTEM, 64-bit). Detection: the client in the uninstall keys and the client settings as chosen. Remediation: install from aka.ms (x64 or ARM64) when missing, then write the settings.", `Assign it to the device group you name — ${GROUPS.win} by default, made empty when missing and the tick is on — with remediation on, daily or hourly.`], impact: "At its next scheduled run every device in the group installs the Global Secure Access client when it is missing, and every run puts the client settings back. Pilot settings hide sign-out and Disable Private Access but leave Disable visible; locked down hides all four. Nothing restarts the device. Licence: Microsoft lists Windows Enterprise E3/E5, Education A3/A5 or VDA for remediations.", recovery: "Remove the assignment or delete the remediation in Intune → Devices → Scripts and remediations; it stops running. The client stays installed — uninstall it per device from Apps & features if needed." },
    macscript: { title: "Create the macOS shell script", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST an Intune macOS shell script named by the CloudFellows convention (MACOS - SH - Software Installation - D - Install Global Secure Access Client - R… - v…; root, once, three retries, notifications blocked, file scr-app-108-install-global-secure-access.zsh) that downloads the client package from aka.ms and installs it when it is missing.", `Assign it to the device group you name — ${GROUPS.mac} by default (the group the GSA macOS profiles target in the baseline), created empty when missing and the tick is on.`], impact: "Every Mac in the group installs the Global Secure Access client at its next Intune check-in. Without the system extension policy and the transparent proxy profile on the same Macs the client asks the user to approve them or cannot tunnel — the board says which of the three profiles is missing or unassigned.", recovery: "Remove the assignment or delete the script in Intune → Devices → macOS → Shell scripts; remove the app from the Mac if needed." },
    ztnasp: { title: "Create the ZTNA Policy Service Client service principal", scopes: ["Application.ReadWrite.All"], role: "Application Administrator", changes: [`POST /servicePrincipals with appId ${ZTNA_CLIENT} — Microsoft's first-party app the client signs in through.`], impact: "Optional — Microsoft documents no requirement for this app. None for users: it adds Microsoft's enterprise application to the tenant. In the LearnGraphAPI lab the client stayed Partially Connected (sign-in errors 50097, 50187) while it was missing; whether creating it alone fixed that was not proven.", recovery: "Delete the enterprise application again (Enterprise applications → ZTNA Policy Service Client → Properties → Delete)." },
    location: { title: `Create “${LOCATION_NAME}”`, scopes: ["Policy.ReadWrite.ConditionalAccess"], role: "Conditional Access Administrator", changes: [`POST a compliantNetworkNamedLocation “${LOCATION_NAME}” (allTenantCompliantNetworks, not trusted).`], impact: "None until a policy names it.", recovery: "Delete the named location in 🧩 Policy building blocks → Locations, once no policy uses it." },
    winscript: { title: "Create the Windows platform script", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST an Intune platform script named by the CloudFellows convention (Win - PSH - Device Security - D - Install Global Secure Access Client - R… - v…; SYSTEM, 64-bit, file Install-GlobalSecureAccessClient.ps1) that downloads the client from aka.ms, installs it and sets the lock-down keys.", `Assign it to the device group you name — ${GROUPS.win} by default, created as an empty assigned security group when it does not exist and the tick is on.`], impact: "Every device in the group installs the Global Secure Access client at its next Intune check-in. Pilot settings (Learn's sample) hide sign-out and Disable Private Access but leave Disable visible; locked down, users cannot disable or sign out of the client. A platform script runs once and installs whatever version Microsoft serves then — it does not update the client.", recovery: "Remove the assignment or delete the script in Intune → Devices → Scripts; uninstall the client per device (Apps & features) if needed." },
  };

  // ---- demo -----------------------------------------------------------------
  function demo() {
    return {
      demo: true, readAt: Date.now(),
      skus: [{ skuPartNumber: "SPE_E3", prepaidUnits: { enabled: 220 }, consumedUnits: 214, servicePlans: [{ servicePlanName: "AAD_PREMIUM" }] }],
      status: { onboardingStatus: "onboarded" },
      profile: { id: "fp-m365", name: "Microsoft traffic profile", trafficForwardingType: "m365", state: "enabled", policies: [{ id: "pl-1", state: "enabled" }, { id: "pl-2", state: "disabled" }], servicePrincipal: { id: "sp-gsa-m365", appId: "a-gsa" } },
      signaling: { signalingStatus: "enabled" },
      sp: { id: "sp-gsa-m365", appRoleAssignmentRequired: true, appRoles: [] },
      assigned: [{ principalId: "g-gsa-pilot", principalType: "Group", principalDisplayName: "GSA-SEC-U-M365Profile-Pilot" }],
      locations: [{ "@odata.type": "#microsoft.graph.compliantNetworkNamedLocation", id: "loc-cn", displayName: LOCATION_NAME }],
      scripts: [], apps: [], shellScripts: [], healthScripts: [],
      macProfiles: { sysext: { name: "[OPTIONAL] MACOS - DCP - Device Configuration - D - Allow GSA System extensions- R26.6 - v3.0", assigned: false }, proxy: { name: "[OPTIONAL] MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - R26.6 - v3.0", assigned: true }, settings: { name: "[OPTIONAL] MACOS - DCP - Device Configuration - U - GSA System settings - R26.6 - v3.0", assigned: true } },
      groupNames: { "g-gsa-pilot": "GSA-SEC-U-M365Profile-Pilot", "g-mac": "INT-SEC-D-GSA-MAC-M365" },
      ztna: [],
      sources: { ztna: "ok", skus: "ok", status: "ok", profile: "ok", signaling: "ok", locations: "ok", scripts: "ok", apps: "ok", shellScripts: "ok", healthScripts: "ok", macProfiles: "ok" },
    };
  }
  // a demo CA policy that requires the compliant network, for ?demo=1 when
  // the demo set has none
  const demoPolicy = () => ({ raw: { id: "d-ca215", displayName: "CA215-BLOCK-Internals-CN-AllApps-WinMac-v1.0", state: "enabledForReportingButNotEnforced", conditions: { users: { includeGroups: ["g-internals"], excludeGroups: ["g-bg"], excludeRoles: [] }, applications: { includeApplications: ["All"], excludeApplications: [INTUNE_APP, INTUNE_ENROLL] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] }, platforms: { includePlatforms: ["windows", "macOS"] } }, grantControls: { operator: "OR", builtInControls: ["block"] } } });

  return { preview, defaultSel, LANES, detectScript, remediationScript, remediationBody, remediationAssignment, ZTNA_CLIENT, isBacking, model, macProfiles, proof, render, windowsScript, windowsScriptBody, macScript, macScriptBody, FIXES, demo, demoPolicy, cnPolicies, intune, names, relTag, GROUPS, WIN_FILE, MAC_FILE, SCRIPT_NAME, LOCATION_NAME, INTUNE_APP, INTUNE_ENROLL };
})();
if (typeof module !== "undefined") module.exports = Gsa;
