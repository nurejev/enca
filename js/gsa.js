// ======================================================================
// 🌐 Global Secure Access — T56, Workspace 03 · Entra Tools (beta 32516; 32517 the macOS script and the devcf naming; 32703 the three macOS profiles made with it).
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
//   Gsa.clientLanes(raw, c)          → 0.11.0: step 6 as two lanes (Windows, macOS), each decided by
//                                      what Global Secure Access has seen (seenIndex), with its own
//                                      actions; scopeOut / scopeRecord read and write the ENCA
//                                      settings record (open extension nl.limonit.enca on the tenant)
//   Gsa.windowsScript(opts)          → the Intune platform script (PowerShell) ENCA uploads
//   Gsa.macScript()                  → the macOS shell script; macSysextBody / macProxyBody /
//                                      macSettingsBody the three profiles it needs (0.8.0)
//   Gsa.demo()                       → a raw read for ?demo=1
//
// What it deliberately does NOT do: switch the policy On, or change its
// exclusions. Mihai, 14 Oct: "leave CA215 as is with current exclusions" —
// the admin-role question is in the admin handover, not in a button.
// ======================================================================
const Gsa = (() => {
  // 0.7.0: tenant restrictions v2 lives in js/trv2.js (pure). The browser has
  // it as a global; node (the tests) requires it beside this file.
  const T2 = typeof Trv2 !== "undefined" ? Trv2 : (typeof require === "function" ? (() => { try { return require("./trv2.js"); } catch { return null; } })() : null);
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
    // 0.8.0: the three macOS profiles, devcf's names without its [OPTIONAL]
    sysext: `MACOS - DCP - Device Configuration - D - Allow GSA System Extensions - ${rel} - ${ver}`,
    proxy: `MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - ${rel} - ${ver}`,
    // 0.9.0 (Mihai: a device policy with a U name): D — a preference file is a device payload
    settings: `MACOS - DCP - Device Configuration - D - GSA System settings - ${rel} - ${ver}`,
  }; };
  const WIN_FILE = "Install-GlobalSecureAccessClient.ps1", MAC_FILE = "scr-app-109-install-global-secure-access.zsh";
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
  const LOCATION_NAME = "All Compliant Network locations";
  // 32708 (go-live recheck S3): the compliant network location has ONE id in
  // every tenant — Learn's example and cloudfellows.dev both read 3d46dbda-…,
  // and Learn documents no create for the type: Entra makes it when signalling
  // is switched on. A policy that names this id is recognised even when the
  // named locations could not be read.
  const CN_ID = "3d46dbda-8382-466a-856d-eb00cbc6b910";
  // 32708 (B4): Remediations need Windows Enterprise E3/E5, Education A3/A5 or
  // VDA (Learn, Remediations → Licensing). Business Premium carries Windows
  // Business (WINBIZ), which is not on that list. Matched by service plan id.
  const WIN_ENT_PLANS = {
    "21b439ba-a0ca-424f-a6cc-52f954a5b111": "Windows 10/11 Enterprise (M365 E3/E5)",
    "e7c91390-7625-45be-94e0-e16907e03118": "Windows 10/11 Enterprise (E3/E5, A3/A5, VDA)",
    "e041597c-9c7f-4ed9-99b0-2663301576f7": "Windows 10 Enterprise E3, local only (M365 F3)",
  };
  const WIN_BIZ_PLAN = "8e229017-d77b-43d5-9305-903395523b99";
  function winLicence(skus, unread) {
    if (unread || !Array.isArray(skus)) return { known: false, ent: null, entNames: [], biz: false };
    const live = skus.filter((x) => ((x.prepaidUnits && x.prepaidUnits.enabled) || 0) > 0 && !/suspended|deleted/i.test(x.capabilityStatus || ""));
    const has = (id) => live.some((x) => (x.servicePlans || []).some((pl) => pl.servicePlanId === id));
    const ent = Object.keys(WIN_ENT_PLANS).filter(has);
    return { known: true, ent: ent.length > 0, entNames: ent.map((id) => WIN_ENT_PLANS[id]), biz: has(WIN_BIZ_PLAN) };
  }

  // ---- the compliant network location and the policies that require it ----
  const isCn = (l) => /compliantNetworkNamedLocation/i.test((l && l["@odata.type"]) || "") || (l && l.id) === CN_ID;
  function cnPolicies(caPolicies, cnId) {
    const out = [];
    for (const p of caPolicies || []) {
      const raw = p.raw || p, loc = (raw.conditions && raw.conditions.locations) || {};
      const ex = loc.excludeLocations || [], inc = loc.includeLocations || [];
      const names = (x) => (cnId && x === cnId) || x === CN_ID || /AllCompliantNetworkLocations/i.test(String(x));
      if (!ex.some(names) && !inc.some(names)) continue;
      const g = raw.grantControls || {}, u = (raw.conditions && raw.conditions.users) || {}, apps = (raw.conditions && raw.conditions.applications) || {};
      const block = (g.builtInControls || []).includes("block");
      const excApps = apps.excludeApplications || [];
      // 32708 (B1): only a policy that BLOCKS everything OUTSIDE the compliant
      // network, for All resources, stops a stolen token. Anything else that
      // names the location (MFA on it, one app) is listed, never counted.
      const blockOut = block && inc.includes("All") && ex.some(names);
      const allApps = (apps.includeApplications || []).includes("All");
      const otherOut = excApps.filter((x) => x !== INTUNE_APP && x !== INTUNE_ENROLL);
      out.push({
        guard: blockOut && allApps, allApps, otherOut,
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
    // 0.8.0: a baseline that pre-approves the GSA extensions in ONE
    // consolidated system-extension policy (devcf since 15 Oct 2026, "MACOS -
    // DCP - Device Security - D - System Extensions") counts — its settings
    // name com.microsoft.globalsecureaccess; the read opens the settings of
    // every macOS system-extension policy for this. Marked consolidated.
    const sys = (policies || []).find((p) => /GSA|Global Secure Access/i.test(p.name || "") && /system.?extension/i.test(p.name || "")) || (policies || []).find((p) => JSON.stringify(p.settings || "").includes("com.microsoft.globalsecureaccess"));
    if (sys) out.sysext = Object.assign(pick(sys), { consolidated: !/GSA|Global Secure Access/i.test(sys.name || "") });
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

  // ---- 32708: the Windows client judged by reach and landing (B3, B4, S8) ----
  // raw.winGroups: { groupId: { devices, windows, joined, hybrid, registered, users } },
  // read by app.js for the groups a GSA remediation, platform script or app is
  // assigned to. A deployment is no longer "ready" because of its name.
  function winCheck(raw, lic) {
    const rx = /global\s*secure\s*access/i, nm = raw.groupNames || {}, wg = raw.winGroups || {};
    const isAsg = (x) => (Array.isArray(x.assignments) ? x.assignments.length > 0 : x.assigned !== false);
    const pick = (list) => [...list].sort((a, b) => isAsg(b) - isAsg(a))[0] || null;
    const rem = pick((raw.healthScripts || []).filter((h) => rx.test(h.displayName || "")));
    const scr = pick((raw.scripts || []).filter((x) => rx.test(`${x.displayName} ${x.fileName}`)));
    const app = pick((raw.apps || []).filter((a) => rx.test(a.displayName || "")));
    const obj = rem || scr || app, kind = rem ? "rem" : scr ? "script" : app ? "app" : null;
    const issues = [], bad = (t) => issues.push({ t, sev: "bad" }), warn = (t) => issues.push({ t, sev: "warn" });
    const L = lic || { known: false };
    if (!obj) {
      if (L.known && !L.ent) warn("no Windows Enterprise, Education or VDA licence in this tenant — remediations are not licensed (Business Premium carries Windows Business), so ENCA offers the platform script.");
      return { st: "bad", kind: null, obj: null, name: "", unassigned: false, issues, reach: { st: "bad", text: "—", windows: 0 }, landed: { st: "na", text: "—" }, text: "no remediation, script or app" };
    }
    const asg = Array.isArray(obj.assignments) ? obj.assignments : null;
    const unassigned = asg ? !asg.length : obj.assigned === false;
    const r = { all: false, allUsers: false, groups: [], windows: 0, registered: 0, users: 0, unknown: 0 };
    for (const a of asg || []) { const t = a.target || {}, ty = t["@odata.type"] || ""; if (/exclusion/i.test(ty)) continue; if (/allDevices/i.test(ty)) r.all = true; else if (/allLicensedUsers/i.test(ty)) r.allUsers = true; else if (t.groupId) r.groups.push(t.groupId); }
    for (const id of r.groups) { const g = wg[id]; if (!g) { r.unknown++; continue; } r.windows += g.windows || 0; r.registered += g.registered || 0; r.users += g.users || 0; }
    const where = [r.all ? "All devices" : "", r.allUsers ? "All users" : "", ...r.groups.map((id) => nm[id] || id)].filter(Boolean).join(", ");
    let reachSt = "ok", reachText;
    if (unassigned) { reachSt = "bad"; reachText = "assigned to nobody"; }
    else if (!asg) { reachSt = "na"; reachText = "assignments not read"; }
    else if (r.all || r.allUsers) reachText = where;
    else if (!r.unknown && !r.windows && !r.users) { reachSt = "bad"; reachText = `${where} — no Windows device and no user in ${r.groups.length === 1 ? "it" : "them"}`; }
    else reachText = `${where}${r.unknown ? " — members not read" : ` — ${r.windows} Windows device${r.windows === 1 ? "" : "s"}${r.users ? `, ${r.users} user${r.users === 1 ? "" : "s"}` : ""}`}`;
    if (r.registered) warn(`${r.registered} Entra registered device${r.registered === 1 ? "" : "s"} in the group — the Microsoft profile needs Entra joined or hybrid joined; there the client carries Private Access only.`);
    let landSt = "na", landText = "not read";
    if (kind === "rem" && obj.runSummary) {
      const rs = obj.runSummary, ok = (rs.noIssueDetectedDeviceCount || 0) + (rs.issueRemediatedDeviceCount || 0);
      const fail = (rs.issueReoccurredDeviceCount || 0) + (rs.remediationScriptErrorDeviceCount || 0) + (rs.detectionScriptErrorDeviceCount || 0);
      const held = (rs.issueDetectedDeviceCount || 0) + (rs.remediationSkippedDeviceCount || 0);
      if (!ok && !fail && !held) { landSt = "warn"; landText = "has not run on any device yet"; }
      else {
        landText = `${ok} with the client · ${fail} failing${held ? ` · ${held} without it, not remediated` : ""}${rs.detectionScriptPendingDeviceCount ? ` · ${rs.detectionScriptPendingDeviceCount} pending` : ""}`;
        landSt = fail || held ? "warn" : "ok";
        if (held) warn(`${held} device${held === 1 ? "" : "s"} found without the client and not remediated — check in Intune that the assignment has remediation on.`);
      }
    } else if (kind === "script" && obj.runSummary) {
      const ok = obj.runSummary.successDeviceCount || 0, fail = obj.runSummary.errorDeviceCount || 0;
      landSt = ok && !fail ? "ok" : "warn"; landText = !ok && !fail ? "has not run on any device yet" : `${ok} ok · ${fail} failed`;
    } else if (kind === "app" && obj.installSummary) {
      const is = obj.installSummary, ok = is.installedDeviceCount || 0, fail = is.failedDeviceCount || 0;
      landSt = ok && !fail ? "ok" : "warn"; landText = !ok && !fail ? "not installed on any device yet" : `${ok} installed · ${fail} failed${is.pendingInstallDeviceCount ? ` · ${is.pendingInstallDeviceCount} pending` : ""}`;
    }
    if (kind === "rem" && L.known && !L.ent) bad("remediations need Windows Enterprise E3/E5, Education A3/A5 or VDA — this tenant holds none (Business Premium carries Windows Business). Use the platform script instead, or license the users.");
    const st = reachSt === "bad" || issues.some((i) => i.sev === "bad") ? "bad" : reachSt === "ok" && landSt === "ok" && !issues.length ? "ok" : "warn";
    const kindName = { rem: "remediation", script: "platform script", app: "app" }[kind];
    return { st, kind, obj, name: obj.displayName, unassigned, issues, reach: Object.assign({ st: reachSt, text: reachText }, r), landed: { st: landSt, text: landText }, text: `${kindName} ${obj.displayName} — ${reachText}; ${landText}` };
  }
  function winTable(win, lic) {
    if (!win) return "";
    const cls = (st) => st === "ok" ? "ok" : st === "bad" ? "bad" : "warn", icon = (st) => st === "ok" ? "✓" : st === "bad" ? "✕" : "!";
    const kindName = { rem: "Remediation", script: "Platform script", app: "App" }[win.kind] || "Deployment";
    const licTxt = !lic || !lic.known ? '<span class="muted">licences not read</span>' : lic.ent ? `<span class="gsa-ok-txt">✓ ${esc(lic.entNames.join(", "))}</span>` : `<span class="${win.kind === "rem" ? "gsa-bad-txt" : "muted"}">${win.kind === "rem" ? "✕" : "·"} no Windows Enterprise, Education or VDA${lic.biz ? " — Windows Business (Business Premium)" : ""}: remediations not licensed</span>`;
    const row = win.obj ? `<tr><td><b>${esc(kindName)}</b></td><td>${esc(win.name)}</td><td class="gsa-${cls(win.reach.st)}-txt">${icon(win.reach.st)} ${esc(win.reach.text)}</td><td class="gsa-${cls(win.landed.st)}-txt">${icon(win.landed.st)} ${esc(win.landed.text)}</td><td>${licTxt}</td></tr>` : `<tr><td><b>Deployment</b></td><td><span class="gsa-warn-txt">not found</span></td><td>—</td><td>—</td><td>${licTxt}</td></tr>`;
    const notes = win.issues.map((i) => `<p class="mini ${i.sev === "bad" ? "gsa-bad-txt" : "gsa-warn-txt"}">${esc(i.t)}</p>`).join("");
    return `<div class="gsa-mac"><div class="gsa-lab" style="margin:10px 0 4px">Windows — found by name, judged by reach and landing${win.st === "ok" ? ' · <span class="gsa-ok-txt">complete</span>' : ` · <span class="gsa-${cls(win.st)}-txt">${win.st === "bad" ? "not ready" : "partly"}</span>`}</div><div class="gsa-tablewrap"><table class="gsa-mtable"><thead><tr><th>Object</th><th>Found</th><th>Reaches</th><th>Landed</th><th>Licence</th></tr></thead><tbody>${row}</tbody></table></div>${notes}</div>`;
  }
  // ---- 0.11.0: step 6 as two lanes, decided by what GSA has seen ------------
  // Mihai, 18 Oct: "I am still stuck at step 6. I cannot complete it and just
  // see that everything is now ok" — and, mid-review, "if I choose mac, I
  // don't see the options for windows later". The step had one Windows and
  // one macOS fix slot, and the Windows one went as soon as a remediation
  // existed and was assigned: on Limon-IT (Business Premium) the remediation
  // could not run and nothing was left to press. Now each platform is a LANE
  // with its own actions that never disappear, and the stage that DECIDES a
  // lane is Connected: has Global Secure Access itself seen the devices in
  // the deployment's groups — its device report and the sign-ins marked
  // through GSA, the last 7 days. Intune's run state explains why not; it no
  // longer decides (macOS turned green on assignments alone before this).
  const ENCA_EXT = "nl.limonit.enca";
  const SEEN_DAYS = 7;
  const MAC_CHECK_CMDS = [
    'ls -d "/Applications/Global Secure Access Client.app" "/Applications/GlobalSecureAccessClient/Global Secure Access Client.app" 2>/dev/null',
    "systemextensionsctl list | grep -i globalsecureaccess",
    "tail -n 30 /Library/Logs/Microsoft/IntuneScripts/GlobalSecureAccess/install.log",
  ];
  const TRUST = { AzureAd: "Entra joined", ServerAd: "hybrid joined", Workplace: "Entra registered" };
  const when = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : String(iso || ""); };
  // The ENCA settings record (agreed 18 Oct): ONE open extension on the
  // tenant's organization object, so a choice made here holds in every
  // browser and for every colleague. Step 6 keeps per platform when, by whom
  // and why it was taken out of scope; "" means in scope (written as "" rather
  // than removed, so a PATCH means the same whether Graph merges or replaces).
  function scopeOut(rec) {
    const r = rec || {};
    const one = (p) => (r[`t56${p}OutAt`] ? { at: String(r[`t56${p}OutAt`]), by: String(r[`t56${p}OutBy`] || ""), why: String(r[`t56${p}OutWhy`] || "") } : null);
    return { windows: one("Win"), macOS: one("Mac") };
  }
  function scopeRecord(rec, platform, outOn, who, why, at) {
    const p = platform === "macOS" ? "Mac" : "Win";
    const body = { "@odata.type": "microsoft.graph.openTypeExtension", extensionName: ENCA_EXT };
    for (const [k, v] of Object.entries(rec || {})) if (!/^@odata|^id$|^extensionName$/.test(k)) body[k] = v;
    body[`t56${p}OutAt`] = outOn ? String(at || new Date().toISOString()) : "";
    body[`t56${p}OutBy`] = outOn ? String(who || "") : "";
    body[`t56${p}OutWhy`] = outOn ? String(why || "").trim().slice(0, 200) : "";
    return body;
  }
  // what Global Secure Access has seen, by Entra device id (lower case):
  // raw.seen.report — /networkAccess/reports/deviceReport, the devices with
  // traffic through GSA and their lastAccessDateTime — and raw.seen.signIns —
  // the sign-ins marked isThroughGlobalSecureAccess, interactive and not
  function seenIndex(raw) {
    const src = raw.sources || {}, s = raw.seen || null;
    const okR = src.seenReport === "ok", okS = src.seenSignins === "ok";
    const map = new Map();
    const add = (id, at, name, os, via) => {
      if (!id) return;
      const k = String(id).toLowerCase(), e = map.get(k) || { last: "", name: "", os: "", via: new Set() };
      if (String(at || "") > e.last) e.last = String(at || "");
      if (!e.name && name) e.name = name;
      if (!e.os && os) e.os = os;
      e.via.add(via); map.set(k, e);
    };
    if (s && okR) for (const d of s.report || []) add(d.deviceId, d.lastAccessDateTime, d.displayName, d.operatingSystem, "traffic");
    if (s && okS) for (const x of s.signIns || []) { const dd = x.deviceDetail || {}; add(dd.deviceId, x.createdDateTime, dd.displayName, dd.operatingSystem, "sign-in"); }
    const errs = [src.seenReport && !okR ? `device report: ${src.seenReport}` : "", src.seenSignins && !okS ? `sign-ins: ${src.seenSignins}` : ""].filter(Boolean);
    return { read: !!s && (okR || okS), err: !s ? "read the tenant again" : errs.join(" · "), map, days: (s && s.days) || SEEN_DAYS, capped: !!(s && s.capped) };
  }
  // the devices a lane expects: the members of the groups its deployment is
  // assigned to, as read (lists[gid].list), one per Entra device id
  function groupDevices(gids, lists, names, osRx) {
    const devices = [], unknown = [];
    for (const gid of gids) {
      const g = lists[gid];
      if (!g || !Array.isArray(g.list)) { unknown.push(gid); continue; }
      for (const d of g.list) {
        if (!d.deviceId || !osRx.test(d.operatingSystem || "") || devices.some((x) => x.deviceId === d.deviceId)) continue;
        devices.push({ deviceId: d.deviceId, name: d.displayName || d.deviceId, trust: TRUST[d.trustType] || d.trustType || "", group: names[gid] || gid });
      }
    }
    return { devices, unknown };
  }
  // the stage that decides a lane: how many of its devices GSA has seen
  function connectedGate(dev, seen, os, osRx, allTargets) {
    for (const d of dev.devices) { const e = seen.map.get(String(d.deviceId).toLowerCase()); d.seen = e ? { last: e.last, via: [...e.via] } : null; }
    const total = dev.devices.length, n = dev.devices.filter((d) => d.seen).length, days = seen.days;
    const noun = (k) => (os === "macOS" ? `Mac${k === 1 ? "" : "s"}` : `Windows device${k === 1 ? "" : "s"}`);
    if (!seen.read) return { st: "unread", text: `not read — ${seen.err}`, connected: 0, total };
    if (allTargets) {
      const k = [...seen.map.values()].filter((e) => osRx.test(e.os || "")).length;
      return { st: k ? "ok" : "bad", text: `${k} ${noun(k)} seen through GSA in the last ${days} days — the deployment targets everyone, so ENCA cannot list who is missing`, connected: k, total: null };
    }
    if (!total && dev.unknown.length) return { st: "unread", text: "the group's members were not read — read the tenant again", connected: 0, total: 0, membersUnknown: true };
    if (!total) return { st: "bad", text: `no ${noun(2)} in the group`, connected: 0, total: 0 };
    return { st: n === total ? "ok" : n ? "warn" : "bad", text: `${n} of ${total} ${noun(total)} seen through GSA in the last ${days} days${seen.capped ? " (sign-ins: the newest read)" : ""}`, connected: n, total, membersUnknown: dev.unknown.length > 0 };
  }
  const scopeAct = (platform, off) => ({ fix: platform === "macOS" ? "scope-mac" : "scope-win", label: off ? "Back in scope…" : "Not in scope…", title: off ? `Put ${platform} back in scope` : `${platform} is not in scope here`, sub: off ? `out since ${when(off.at)}${off.by ? ` by ${off.by}` : ""}${off.why ? ` — ${off.why}` : ""} · kept in the tenant's ENCA settings record` : "accept and skip — kept in the tenant (the ENCA settings record), so every browser and colleague sees it" });
  const offStage = (platform, off) => ({ k: "Scope", st: "na", text: `${platform} taken out of scope ${when(off.at)}${off.by ? ` by ${off.by}` : ""}${off.why ? ` — ${off.why}` : ""}`, sub: `step 6 does not wait for ${platform}; a compliant-network policy that covers ${platform} sign-ins still blocks every device without the client` });
  function clientLanes(raw, c) {
    const { win, lic, mac, macScriptX, mp, off, seen } = c, names = raw.groupNames || {};
    // ---- Windows
    const W = { os: "Windows", icon: "🪟", stages: [], actions: [], devices: [] };
    const asg = win.obj && Array.isArray(win.obj.assignments) ? win.obj.assignments : [];
    const wGroups = (win.reach && win.reach.groups) || [];
    const wAll = !!(win.obj && !win.unassigned && win.reach && (win.reach.all || win.reach.allUsers));
    const wDev = groupDevices(wGroups, raw.winGroups || {}, names, /^windows/i);
    const wGate = connectedGate(wDev, seen, "Windows", /windows/i, wAll);
    if (!win.obj && seen.read) {
      const k = [...seen.map.values()].filter((e) => /windows/i.test(e.os || "")).length;
      Object.assign(wGate, k ? { st: "warn", text: `${k} Windows device${k === 1 ? "" : "s"} seen through GSA, but nothing in Intune keeps the client on them` } : { st: "bad", text: "no Windows device seen through GSA — nothing deploys the client yet" });
    }
    W.devices = wDev.devices; W.connected = wGate.connected; W.membersUnknown = !!wGate.membersUnknown || wAll;
    const licBad = win.kind === "rem" && lic.known && !lic.ent;
    W.fix = off.windows ? null : !win.obj ? (lic.known && !lic.ent ? "winscript" : "winrem") : win.kind === "rem" && win.unassigned ? "winrem" : win.kind === "script" && win.unassigned ? "winscript" : licBad ? "winswap" : null;
    if (off.windows) { W.st = "na"; W.word = "not in scope"; W.summary = "not in scope"; W.stages.push(offStage("Windows", off.windows)); }
    else {
      const kindName = { rem: "Remediation", script: "Platform script", app: "App" }[win.kind] || "Deployment";
      const sch = (asg.find((a) => a.runSchedule) || {}).runSchedule;
      W.stages.push({ k: "Deployed", st: win.obj ? "ok" : "bad", text: win.obj ? `${kindName} ${win.name}` : "Nothing installs the client — no remediation, platform script or app", sub: win.kind === "rem" ? (sch ? (/Hourly/i.test(sch["@odata.type"] || "") ? "runs every hour" : /Daily/i.test(sch["@odata.type"] || "") ? "runs daily" : "runs once") : "") : win.kind === "script" ? "runs once per device" : "" });
      if (win.obj) W.stages.push({ k: "Reaches", st: win.reach.st === "ok" ? "ok" : win.reach.st === "na" ? "na" : "bad", text: win.reach.text, sub: (win.issues.find((i) => /registered device/.test(i.t)) || {}).t || "" });
      if (win.kind === "rem") {
        const detectOnly = asg.length > 0 && asg.every((a) => a.runRemediationScript === false);
        W.stages.push({ k: "Allowed to run", st: !lic.known ? "na" : lic.ent ? "ok" : "bad", text: !lic.known ? "licences not read" : lic.ent ? `Licensed — ${lic.entNames.join(", ")}` : `No — remediations need Windows Enterprise E3/E5, Education A3/A5 or VDA; this tenant holds ${lic.biz ? "Windows Business (Business Premium)" : "none of them"}`, sub: detectOnly ? "Graph reads the assignment as detect-only — if Intune also shows Remediation script: No, it detects and installs nothing" : "" });
      }
      if (win.obj) W.stages.push({ k: "Ran (Intune)", st: win.landed.st === "ok" ? "ok" : win.landed.st === "na" ? "na" : "warn", text: win.landed.text, sub: (win.issues.find((i) => /not remediated/.test(i.t)) || {}).t || "" });
      W.stages.push({ k: "Connected", gate: true, st: wGate.st === "unread" ? "na" : wGate.st, text: wGate.text });
      W.st = wGate.st === "unread" ? (win.obj ? "warn" : "bad") : wGate.st;
      W.word = W.st === "ok" ? "connected" : !win.obj ? "nothing deployed" : licBad && W.st === "bad" ? "blocked · licence" : wGate.st === "unread" ? "not read" : W.st === "warn" ? "partly connected" : "not connected";
      W.summary = wGate.text;
    }
    if (W.fix) W.actions.push({ fix: W.fix, primary: true, sub: W.fix === "winswap" ? "same groups · the remediation is unassigned and kept, after the script's assignment lands · way back: reassign it from the backup" : "" });
    if (!off.windows && wGroups.length) W.actions.push({ groups: true, title: "Devices in the group", sub: `${wGroups.map((id) => names[id] || id).join(", ")} — add or remove devices in 👥 Groups (Used by GSA)` });
    W.actions.push(scopeAct("Windows", off.windows));
    // ---- macOS
    const M = { os: "macOS", icon: "🍎", stages: [], actions: [], devices: [] };
    const rows = mac ? mac.rows : null;
    const scriptAsg = mac ? mac.scriptAsg || [] : (macScriptX && macScriptX.assignments) || [];
    const mt = tgt(scriptAsg), mGroups = mt.inc.map((x) => x.id), mAll = !!(mt.all || mt.allUsers);
    const mDev = groupDevices(mGroups, (raw.macChain && raw.macChain.groups) || {}, names, /mac/i);
    const mGate = connectedGate(mDev, seen, "macOS", /mac/i, mAll && !!macScriptX);
    M.devices = mDev.devices; M.connected = mGate.connected; M.membersUnknown = !!mGate.membersUnknown || mAll;
    M.fix = c.macNa ? null : mac ? (!macScriptX ? "macscript" : null) : !macScriptX ? "macscript" : !c.macProfOk ? "macprof" : null;
    if (off.macOS) { M.st = "na"; M.word = "not in scope"; M.summary = "not in scope"; M.stages.push(offStage("macOS", off.macOS)); }
    else if (c.macAuto) { M.st = "na"; M.word = "not in scope"; M.summary = "no Intune-managed Mac — not in scope"; M.stages.push({ k: "Scope", st: "na", text: "no Intune-managed Mac in this tenant and no macOS script — not in scope", sub: "the macOS lane returns when a Mac is enrolled" }); }
    else {
      const profFound = rows ? rows.slice(1).filter((r) => r.found).length : ["sysext", "proxy", "settings"].filter((k) => mp[k]).length;
      M.stages.push({ k: "Deployed", st: !macScriptX ? "bad" : profFound === 3 ? "ok" : "warn", text: macScriptX ? `Install script ${macScriptX.displayName} + ${profFound} of 3 profiles` : "No install script for the client", sub: macScriptX ? "system extensions, transparent proxy, client settings" : "" });
      if (macScriptX) {
        const grp = mac && mac.groups.length ? mac.groups.map((g) => `${g.name} · ${typeof g.devices === "number" ? `${g.devices} device${g.devices === 1 ? "" : "s"}, ${g.managedMacs} managed Mac${g.managedMacs === 1 ? "" : "s"}` : "members not read"}`).join(", ") : scriptAsg.length ? (mAll ? "All devices" : "assigned") : "assigned to nobody";
        const pr = rows ? rows.slice(1).filter((r) => r.found && r.reach.st !== "ok" && r.reach.st !== "na") : [];
        M.stages.push({ k: "Reaches", st: !scriptAsg.length || (mac && mac.noMac) || pr.some((r) => r.reach.st === "bad") ? "bad" : pr.length ? "warn" : "ok", text: grp, sub: [mac && mac.noMac ? "no managed Mac in the group — nothing lands" : "", ...pr.map((r) => `${r.label}: ${r.reach.text}`)].filter(Boolean).join(" · ") });
      }
      if (rows) {
        const iss = rows.flatMap((r) => (r.found ? r.issues : []));
        M.stages.push({ k: "Content", st: iss.some((i) => i.sev === "bad") ? "bad" : iss.length ? "warn" : "ok", text: iss.length ? `${iss.length} issue${iss.length === 1 ? "" : "s"} — the chain table below fixes each` : "script and profiles as Learn" });
        const land = rows.slice(1).filter((r) => r.found);
        const sx2 = [...(mac.otherSx || []), ...(mac.otherSxLegacy || [])].map((x) => x.name);
        const landSt = land.some((r) => r.landed.bad) ? "bad" : sx2.length ? "warn" : land.length && land.every((r) => !/no device|not read/.test(r.landed.text)) ? "ok" : land.length ? "warn" : "na";
        M.stages.push({ k: "Profiles landed", st: landSt, text: land.length ? land.map((r) => `${r.label}: ${r.landed.text}`).join(" · ") : "no profile found", sub: sx2.length ? `A second system-extension payload reaches these Macs: ${sx2.join(", ")}` : "" });
        const sr = rows[0], rs = sr.found && sr.found.runSummary;
        if (sr.found) M.stages.push({ k: "Ran (Intune)", st: !rs ? "na" : (rs.errorDeviceCount || 0) > 0 ? "bad" : (rs.successDeviceCount || 0) > 0 ? "ok" : "warn", text: !rs ? "not read" : rs.successDeviceCount || rs.errorDeviceCount ? `${rs.successDeviceCount || 0} ok · ${rs.errorDeviceCount || 0} failed` : "the install script has not reported a run yet", sub: "on a first install it waits until both approvals are on the Mac, then installs" });
      }
      M.stages.push({ k: "Connected", gate: true, st: mGate.st === "unread" ? "na" : mGate.st, text: mGate.text });
      M.st = mGate.st === "unread" ? (macScriptX ? "warn" : "bad") : mGate.st === "ok" ? "ok" : !macScriptX ? "bad" : mGate.st;
      M.word = M.st === "ok" ? "connected" : !macScriptX ? "nothing deployed" : mGate.st === "unread" ? "not read" : M.st === "warn" ? "partly connected" : "deployed · not connected";
      M.summary = mGate.text;
    }
    if (M.fix) M.actions.push({ fix: M.fix, primary: true });
    if (!off.macOS && !c.macAuto && mac && mac.problems) M.actions.push({ jump: "gsaMac", label: "Show the chain", title: "Repair the chain", sub: `${mac.problems} problem${mac.problems === 1 ? "" : "s"} — the chain table below has a fix per row` });
    if (!off.macOS && !c.macAuto && macScriptX) M.actions.push({ copy: true, title: "Check a Mac", sub: "three read-only commands — run them in Terminal on a Mac in the group" });
    M.actions.push(scopeAct("macOS", off.macOS));
    return { windows: W, macOS: M };
  }
  // the lanes, the rule and the devices table — under the step 6 detail
  function laneHtml(L) {
    const cls = (st) => (st === "ok" ? "ok" : st === "bad" ? "bad" : st === "na" ? "na" : "warn");
    const ic = (st) => ({ ok: "✓", bad: "✕", na: "–" }[cls(st)] || "!");
    const li = (s) => `<li${s.gate ? ' class="gate"' : ""}><span class="gsa-ic ${cls(s.st)}">${ic(s.st)}</span><span class="gsa-sk">${esc(s.k)}${s.gate ? "<small>decides the step</small>" : ""}</span><span class="gsa-sv">${esc(s.text)}${s.sub ? `<span class="mini muted">${esc(s.sub)}</span>` : ""}</span></li>`;
    const row = (title, sub, btn) => `<div class="gsa-actrow"><div><b>${esc(title)}</b>${sub ? `<div class="mini muted">${esc(sub)}</div>` : ""}</div>${btn}</div>`;
    const act = (a) => {
      if (a.fix) { const f = FIXES[a.fix] || {}; return row(a.title || f.title || FIX_LABEL[a.fix] || a.fix, a.sub || "writes to tenant · opens a workspace below with what it sends, its impact and the way back", `<button class="btn sm${a.primary ? " primary" : ""}" data-gsafix="${esc(a.fix)}">${esc(a.label || FIX_LABEL[a.fix] || "Open…")}</button>`); }
      if (a.groups) return row(a.title, a.sub, '<button class="btn sm" data-gsagroups>Open in Groups</button>');
      if (a.jump) return row(a.title, a.sub, `<button class="btn sm" data-gsajump="${esc(a.jump)}">${esc(a.label || "Show")}</button>`);
      if (a.copy) return `<div class="gsa-actrow gsa-cmd"><div><b>${esc(a.title)}</b><div class="mini muted">${esc(a.sub)}</div><pre class="gsa-pre" data-gsacmd>${esc(MAC_CHECK_CMDS.join("\n"))}</pre></div><button class="btn sm" data-gsacopycmd>Copy</button></div>`;
      return "";
    };
    return `<div class="gsa-pl ${cls(L.st)}"><div class="gsa-pl-h"><b>${L.icon} ${esc(L.os)}</b><span class="gsa-st ${cls(L.st)}">${esc(L.word)}</span></div><ul class="gsa-stages">${L.stages.map(li).join("")}</ul><div class="gsa-pl-acts"><div class="gsa-lab">What you can do — ${esc(L.os)}, whatever you do on the other</div>${L.actions.map(act).join("")}</div></div>`;
  }
  function lanesHtml(l) {
    const ln = l.lanes; if (!ln) return "";
    const sn = l.seen || { read: false, err: "", days: SEEN_DAYS };
    const dev = [["Windows", ln.windows], ["macOS", ln.macOS]].filter(([, L]) => L.st !== "na").flatMap(([os, L]) => L.devices.map((d) => Object.assign({ os }, d)));
    const rows = dev.map((d) => `<tr><td><b>${esc(d.name)}</b>${d.trust ? `<div class="mini muted">${esc(d.trust)}</div>` : ""}</td><td>${esc(d.os)}</td><td class="mini">${esc(d.group)}</td><td class="mini">${d.seen ? `${esc(when(d.seen.last))} <span class="muted">· ${esc(d.seen.via.join(" + "))}</span>` : sn.read ? `not in the last ${sn.days} days` : "not read"}</td><td>${d.seen ? '<span class="gsa-st ok">connected</span>' : sn.read ? '<span class="gsa-st bad">not connected</span>' : '<span class="gsa-st">not read</span>'}</td></tr>`).join("");
    const table = rows ? `<h3 style="margin:14px 0 6px">Devices in scope <span class="mini muted">· one row per device, both platforms</span></h3><div class="gsa-tablewrap"><table class="gsa-mtable"><thead><tr><th>Device</th><th>Platform</th><th>Group</th><th>Last seen through GSA</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : "";
    const rule = `<div class="gsa-rule"><span aria-hidden="true">ⓘ</span><span><b>Ready when every device in scope has been seen through Global Secure Access</b> in the last ${sn.days} days — in its device report and in the sign-ins marked through Global Secure Access. Intune's run state stays on screen to explain why a device is not there yet; it no longer decides the step.${sn.read ? "" : ` <span class="gsa-warn-txt">Not read: ${esc(sn.err)}</span>`}</span></div>`;
    return `<section class="list-card gsa-sect gsa-lanes2" id="gsaLanes">${rule}<div class="gsa-pl-grid">${laneHtml(ln.windows)}${laneHtml(ln.macOS)}</div>${table}</section>`;
  }
  // ---- 32708 (B2): who must pass against who can ----------------------------
  // A guarding policy that includes people the Microsoft profile does not
  // reach, or reaches no device with the client, blocks people, not tokens.
  // Checked as assignments (groups compared by id); nested membership is not
  // expanded, so a gap here means "not assigned as that group", said so.
  function scopeCheck(policies, prof, devices, names) {
    const nm = (id) => (names || {})[id] || id;
    const lines = [], add = (sev, t) => lines.push({ sev, t });
    const live = (policies || []).filter((p) => p.guard && p.state !== "disabled");
    if (!live.length) return { st: "na", lines };
    for (const p of live) {
      const sev = p.state === "enabled" ? "bad" : "warn", verb = p.state === "enabled" ? "requires" : "would require";
      if (!prof) add("warn", `${p.name}: the Microsoft profile's assignment was not read, so who it covers is not known.`);
      else if (!prof.allUsers) {
        const miss = [];
        if (p.allUsers) miss.push("All users");
        p.includeGroups.filter((id) => !prof.groupIds.includes(id)).forEach((id) => miss.push(nm(id)));
        const direct = p.includeUsers.filter((u) => u !== "All" && !/^Guests/i.test(u) && !prof.userIds.includes(u)).length;
        if (direct) miss.push(`${direct} user${direct === 1 ? "" : "s"} named directly`);
        if (miss.length) add(sev, `${p.name} ${verb} the compliant network of ${miss.join(", ")}, but the Microsoft profile is assigned to ${prof.groupIds.length ? prof.groupIds.map(nm).join(", ") : "no group"}${prof.userIds.length ? ` and ${prof.userIds.length} user${prof.userIds.length === 1 ? "" : "s"}` : ""} — everybody in the policy and not on the profile is blocked. Scope the policy to the profile's group, or assign the profile wider.`);
        if (p.includeRoles.length) add("warn", `${p.name} includes ${p.includeRoles.length} directory role${p.includeRoles.length === 1 ? "" : "s"} — role holders cannot be checked against the profile here.`);
      }
      if (devices === 0) add(sev, `${p.name}: no device carries the Global Secure Access client yet — every sign-in in its scope ${p.state === "enabled" ? "is" : "would be"} blocked.`);
    }
    const st = lines.some((l) => l.sev === "bad") ? "bad" : lines.length ? "warn" : "ok";
    if (!lines.length) add("ok", `Everybody the ${live.length === 1 ? "policy includes" : "policies include"} gets the Microsoft profile${devices ? `, and ${devices} device${devices === 1 ? "" : "s"} carry the client` : ""}.`);
    return { st, lines };
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
      // 32708 (S6): Learn — a profile has User and device assignments AND
      // Device platform assignments, evaluated together; "All users and
      // devices" with no platform means nobody. Graph returns assignmentRules
      // on the profile (null on cloudfellows.dev); shown when it carries any.
      sub: prof && prof.assignmentRules ? `Assignment rules as Graph returns them: ${JSON.stringify(prof.assignmentRules).slice(0, 400)}` : onboarded && prof ? "Check Device platform assignments on the profile's Assignments page in the portal: Windows and macOS ticked. With no platform ticked nobody gets the profile, whoever is assigned." : "",
      help: "Learn: a traffic profile has User and device assignments AND Device platform assignments — a device gets the profile only when it matches both. ENCA reads and sets the user and group side; the platforms are set on the profile's Assignments page in the portal (no documented Graph call). Nested group membership is supported." });
    // 4 signalling
    const sig = raw.signaling && raw.signaling.signalingStatus === "enabled";
    L.push({ k: "signal", lab: "Signal", h: "CA signalling", st: !onboarded ? "wait" : unread("signaling") ? "unread" : sig ? "ok" : "bad", note: !onboarded ? "waits on the tenant" : unread("signaling") ? `not read — ${src.signaling}` : sig ? "enabled — source IP restored" : "disabled", fix: onboarded && !sig && !unread("signaling") ? "signal" : null, help: "Microsoft Learn calls it source IP restoration; the compliant network can only be targeted once it is on." });
    // 5 location
    const cn = (raw.locations || []).find(isCn) || null;
    L.push({ k: "location", lab: "Location", h: "Compliant network", st: unread("locations") ? "unread" : cn ? "ok" : sig ? "bad" : "wait", note: unread("locations") ? `not read — ${src.locations}` : cn ? `${cn.displayName}` : "not present — Entra makes it itself when signalling is switched on (Learn documents no create). Read the tenant again; if it stays missing, switch signalling off and on in the portal, or let the fix try (not documented)", fix: !cn && !unread("locations") && sig ? "location" : null });
    // 6 client
    const rxG6 = /global\s*secure\s*access/i;
    const winScript = (raw.scripts || []).find((s) => rxG6.test(`${s.displayName} ${s.fileName}`)) || null;
    const winApp = (raw.apps || []).find((a) => rxG6.test(a.displayName || "")) || null;
    // 32520 (Mihai 14 Oct: remediation it is — detect, if there, else deploy):
    // the Windows client as an Intune remediation (deviceHealthScripts)
    const winRem = (raw.healthScripts || []).find((h) => rxG6.test(h.displayName || "")) || null;
    const macScript = (raw.shellScripts || []).find((s) => rxG6.test(`${s.displayName} ${s.fileName}`)) || null;
    // 32708 (go-live recheck B3, B4, S7, S8): Windows is judged like macOS —
    // who the deployment reaches (its groups' Windows devices, their join
    // type) and what landed (the run summary) — and the remediation route
    // only where the tenant holds a Windows Enterprise/Education/VDA licence.
    const lic = winLicence(raw.skus, unread("skus"));
    const win = winCheck(raw, lic);
    // the three macOS profiles the client cannot run without
    const mp = raw.macProfiles || {};
    const mprof = (k, label) => { const x = mp[k]; return x ? `${label} ${x.assigned ? "assigned" : "NOT ASSIGNED"}${x.consolidated ? " (in the baseline's System Extensions policy)" : ""}` : `${label} missing`; };
    // 0.9.0: with the chain read (content, reach, landed) the check decides;
    // the name-based profiles above stay for a read without it
    const mac = raw.macChain ? macCheck(raw.macChain, raw.groupNames || {}) : null;
    const macProfOk = mac ? mac.rows.slice(1).every((r) => r.st === "ok") : ["sysext", "proxy", "settings"].every((k) => mp[k] && mp[k].assigned);
    const macScriptX = mac ? (mac.rows[0].found || null) : macScript;
    const macOk = mac ? mac.ok : !!macScript && macProfOk;
    // 32708 (S7): no Intune-managed Mac and no macOS script — macOS is not in
    // scope, so a Windows-only tenant can reach a green step 6
    // 0.11.0: a platform an admin took out of scope (the ENCA settings record
    // on the organization object) is not in scope, like a tenant without a Mac
    const scopeOff = scopeOut(raw.encaSettings), seenIx = seenIndex(raw);
    const macAuto = raw.macManaged === 0 && !macScriptX;
    const macNa = !!scopeOff.macOS || macAuto;
    // 0.11.0: two lanes, each decided by what Global Secure Access has seen
    const pl = clientLanes(raw, { win, lic, mac, macScriptX, macProfOk, mp, macNa, macAuto, off: scopeOff, seen: seenIx });
    const sts = [pl.windows.st, pl.macOS.st].filter((x) => x !== "na");
    const clientSt = unread("scripts") && unread("apps") && unread("healthScripts") ? "unread" : !sts.length ? "bad" : sts.every((x) => x === "ok") ? "ok" : sts.every((x) => x === "bad") ? "bad" : "warn";
    // the Windows fix: nothing deployed → the remediation, or the platform
    // script where the licence does not cover remediations; a found but
    // unassigned remediation → the same workspace, which assigns THAT one (S1)
    const winFix = pl.windows.fix;
    L.push({ k: "client", lab: "Devices", h: "GSA client", st: clientSt,
      note: [`Windows: ${pl.windows.summary}${scopeOff.windows ? "" : ` — ${win.text}`}`, `macOS: ${pl.macOS.summary}${macNa ? "" : macScriptX ? ` — ${macScriptX.displayName}` : " — no shell script"}`].join(" · "),
      sub: [...win.issues.map((i) => `Windows: ${i.t}`), macNa ? "" : mac ? (unread("macChain") ? `macOS chain not read — ${src.macChain}` : mac.problems ? `macOS: ${mac.problems} problem${mac.problems === 1 ? "" : "s"} in the chain — the table below says which and fixes each` : "macOS: the script and the three profiles are complete, as Learn, and reach the same Macs") : unread("macProfiles") ? `macOS profiles not read — ${src.macProfiles}` : `macOS profiles: ${mprof("sysext", "system extensions")} · ${mprof("proxy", "transparent proxy")} · ${mprof("settings", "client settings")}`].filter(Boolean).join(" "),
      help: "Step 6 is ready when every device in scope has been seen through Global Secure Access in the last 7 days — its device report and the sign-ins marked through GSA; Intune's run state explains why a device is not there yet. Windows: the device must be Entra joined or hybrid joined — on an Entra registered device the client carries Private Access only (Learn). Secure DNS (DNS over HTTPS) must be off in Edge and Chrome, or the client cannot tunnel by name — a settings catalog policy on the same devices. QUIC only matters once Internet Access is added. From November 2026 Windows Update upgrades clients at 2.31.125 or later.",
      // 0.8.0 (Mihai 17 Oct: after creating the macOS script the profiles
      // were missing and nothing was offered): no script → the script
      // workspace, which makes the profiles too; script there but a profile
      // missing or unassigned → the same workspace from the profiles' side
      fix: winFix, fix2: macNa ? null : mac ? (!macScriptX ? "macscript" : null) : !macScript ? "macscript" : !macProfOk ? "macprof" : null, winScript, winApp, winRem, win, lic, macScript: macScriptX, macProfOk, macProf: mp, mac, macNa, lanes: pl, seen: { read: seenIx.read, err: seenIx.err, days: seenIx.days }, split: [{ t: "Win", st: pl.windows.st }, { t: "Mac", st: pl.macOS.st }] });
    // 7 policy
    const policies = cnPolicies(caPolicies, cn && cn.id);
    // 32708 (B1): only the GUARDING policies count — block outside the
    // compliant network, All resources. The others are listed, never "ok".
    const guards = policies.filter((p) => p.guard), others = policies.length - guards.length;
    const on = guards.filter((p) => p.state === "enabled"), ro = guards.filter((p) => p.state === "enabledForReportingButNotEnforced");
    // 32708 (B2): who must sign in through GSA against who can — the profile's
    // users and the devices that carry the client
    const pGroups = groups.filter((g) => !isBacking(g.principalDisplayName || "")).map((g) => g.principalId), pUsers = users.map((u) => u.principalId);
    const macDev = macNa || !macScriptX ? 0 : mac && mac.groups.length && mac.groups.every((g) => typeof g.managedMacs === "number") ? mac.groups.reduce((n, g) => n + g.managedMacs, 0) : null;
    const winDev = !win.obj || win.reach.st === "bad" ? 0 : win.reach.st === "na" || win.reach.all || win.reach.allUsers || win.reach.unknown || win.reach.users ? null : win.reach.windows;
    const devCount = seenIx.read && !pl.windows.membersUnknown && !pl.macOS.membersUnknown ? pl.windows.connected + pl.macOS.connected : winDev === 0 && macDev === 0 ? 0 : (winDev || 0) + (macDev || 0) > 0 ? (winDev || 0) + (macDev || 0) : null;
    const scope = scopeCheck(policies, onboarded && prof && !unread("assigned") ? { allUsers, groupIds: pGroups, userIds: pUsers } : null, devCount, raw.groupNames || {});
    const chain = ["tenant", "profile", "signal", "location", "client"].map((k) => L.find((l) => l.k === k)).filter((l) => l.st !== "ok");
    const word7 = !guards.length && policies.length ? "none blocks" : guards.length && !on.length && !ro.length ? "off" : null;
    const note7 = !caPolicies ? "ENCA has not read this tenant's Conditional Access policies yet, so it cannot tell whether one already requires the compliant network"
      : !policies.length ? "no Conditional Access policy names the compliant network"
      : `${guards.length ? `${on.length} on · ${ro.length} report-only · ${guards.length - on.length - ro.length} off` : "no policy blocks sign-ins outside the compliant network for all resources"}${others ? ` · ${others} other polic${others === 1 ? "y names" : "ies name"} it without blocking everything outside it — not counted` : ""} — every one in the list below`;
    const st7 = !caPolicies ? "unread" : !policies.length ? (cn ? "bad" : "wait") : on.length ? (scope.st === "bad" || chain.length ? "bad" : scope.st === "warn" ? "warn" : "ok") : ro.length ? "warn" : "bad";
    const next7 = !caPolicies ? "The read takes the policies only — it changes nothing, and you stay on this board."
      : !guards.length && cn ? "Create it in report-only: the Policy builder opens pre-filled — Windows and macOS, the profile's users — and you choose the exclusions."
      : on.length ? (chain.length ? `It is on while ${chain.map((l) => `step ${L.indexOf(l) + 1} (${l.h})`).join(", ")} ${chain.length === 1 ? "is" : "are"} not ready — it blocks people, not tokens. Put it back in report-only until the chain is complete.` : "")
      : ro.length ? "Report-only: read the proof (step 8) before anybody switches it on." : guards.length ? "Off: put it in report-only with 🎚 Policy state on the policy list, then read the proof." : "";
    L.push({ k: "policy", lab: "Policy", h: guards.length ? `${guards.length} polic${guards.length === 1 ? "y" : "ies"}` : policies.length ? `${policies.length} naming it` : "No policy", word: word7, st: st7, note: note7, open: (guards.length === 1 ? guards[0] : policies.length === 1 ? policies[0] : {}).id || null,
      // 0.9.1 (Mihai: "nothing happens and can continue"): every state has a next step
      sub: [scope.st !== "na" && scope.st !== "ok" ? scope.lines.map((x) => x.t).join(" ") : "", next7].filter(Boolean).join(" "), scope });
    // 8 proof — filled by proof(); the board shows it when read
    L.push({ k: "proof", lab: "Proof", h: "Sign-ins via GSA", st: "wait", note: "not read — 📈 Read the proof (7 days)" });

    // the groups Global Secure Access leans on: on the profile, and in the
    // policies that require the compliant network (include side only — an
    // exclusion is a group the policy does NOT reach)
    const gIds = new Map();
    groups.forEach((g) => { const name = g.principalDisplayName || (raw.groupNames || {})[g.principalId] || g.principalId; gIds.set(g.principalId, { id: g.principalId, name, backing: isBacking(name), why: isBacking(name) ? "the portal's backing group for the profile — do not use it in Intune or Conditional Access" : "assigned on the Microsoft traffic profile" }); });
    policies.forEach((p) => p.includeGroups.forEach((id) => { if (!gIds.has(id)) gIds.set(id, { id, name: (raw.groupNames || {})[id] || id, why: `included by ${p.name}` }); }));

    // 0.9.1 (Mihai: "it says assigned to all users and then no groups — make it
    // clear what is what"): who Global Secure Access reaches, three questions —
    // users through the profile, users through the policies, devices through Intune
    const nmOf = (id) => id === "__all" ? "All devices" : id === "__users" ? "All users (their devices)" : (raw.groupNames || {})[id] || id;
    const devs = { macOS: new Map(), Windows: new Map() };
    const rxG = /global\s*secure\s*access/i;
    const addDev = (os, what, asg) => (asg || []).forEach((a) => { const t = a.target || {}, ty = t["@odata.type"] || ""; if (/exclusion/i.test(ty)) return; const id = /allDevices/i.test(ty) ? "__all" : /allLicensedUsers/i.test(ty) ? "__users" : t.groupId; if (!id) return; const e = devs[os].get(id) || { id, name: nmOf(id), what: new Set() }; e.what.add(what); devs[os].set(id, e); });
    (raw.healthScripts || []).filter((h) => rxG.test(h.displayName || "")).forEach((h) => addDev("Windows", "remediation", h.assignments));
    (raw.scripts || []).filter((x) => rxG.test(`${x.displayName} ${x.fileName}`)).forEach((x) => addDev("Windows", "platform script", x.assignments));
    const macL = L.find((l) => l.k === "client"), macC = macL && macL.mac;
    if (macC) macC.rows.filter((r) => r.found && !isDep(r.name)).forEach((r) => addDev("macOS", r.label.toLowerCase(), r.found.assignments));
    else { (raw.shellScripts || []).filter((x) => rxG.test(`${x.displayName} ${x.fileName}`)).forEach((x) => addDev("macOS", "install script", x.assignments)); (((raw.macProfiles || {}).found) || []).forEach((x) => addDev("macOS", x.role || "profile", x.assignments)); }
    const macGroups = macC ? macC.groups : [];
    const devList = (os) => [...devs[os].values()].map((e) => Object.assign({}, e, { what: [...e.what], info: macGroups.find((g) => g.id === e.id) || null }));
    const profGroups = groups.map((g) => ({ id: g.principalId, name: g.principalDisplayName || (raw.groupNames || {})[g.principalId] || g.principalId, backing: isBacking(g.principalDisplayName || "") }));
    const polAll = policies.filter((p) => (p.includeUsers || []).includes("All"));
    const reachInfo = {
      profile: { allUsers, onboarded, groups: profGroups.filter((g) => !g.backing), backing: profGroups.filter((g) => g.backing), users: users.length, read: !unread("assigned") && !!prof },
      policies: { loaded: !!caPolicies, count: policies.length, allUsers: polAll.map((p) => p.name), groups: [...new Map(policies.flatMap((p) => p.includeGroups.map((id) => [id, { id, name: (raw.groupNames || {})[id] || id, by: p.name }]))).values()] },
      devices: { macOS: devList("macOS"), Windows: devList("Windows"), managedMacs: macGroups.length && macGroups.every((g) => typeof g.managedMacs === "number") ? macGroups.reduce((n, g) => n + g.managedMacs, 0) : null },
    };
    // the device groups join the Used by GSA scope of T12
    [...devs.macOS.values(), ...devs.Windows.values()].filter((e) => !/^__/.test(e.id)).forEach((e) => { if (!gIds.has(e.id)) gIds.set(e.id, { id: e.id, name: e.name, why: `gets the client on ${devs.macOS.has(e.id) ? "macOS" : "Windows"} (${[...e.what].join(", ")})` }); });
    const ready = L.filter((l) => l.st === "ok").length;
    const firstBad = L.find((l) => l.st === "bad" || l.st === "warn");
    return { links: L, ready, total: L.length, verdict: verdict(L, policies, scope), next: firstBad || null, policies, guards, scope, policiesLoaded: !!caPolicies, intune: intune(raw), cn, allUsers, reachInfo, groups: [...gIds.values()], groupIds: [...gIds.keys()], sp: raw.sp || null, profile: prof, readAt: raw.readAt || null, demo: !!raw.demo };
  }
  function verdict(L, policies, scope) {
    const by = Object.fromEntries(L.map((l) => [l.k, l]));
    const guards = policies.filter((p) => p.guard), on = guards.filter((p) => p.state === "enabled");
    // 32708 (go-live recheck B1, B2): green only when a guarding policy is on
    // AND every link before it is ready — the client on the devices included —
    // AND everybody the policy includes gets the profile. Anything less blocks
    // people, not tokens.
    const missing = ["tenant", "profile", "signal", "location", "client"].map((k) => by[k]).filter((l) => l.st !== "ok");
    const sc = scope || { st: "na", lines: [] };
    if (on.length && !missing.length && (sc.st === "ok" || sc.st === "na")) return { cls: "ok", h: "A stolen token no longer works outside the compliant network", p: "The chain is complete, at least one policy blocks every resource outside the compliant network, and everybody it includes gets the Microsoft profile. Watch the proof for sign-ins it blocks that should not be blocked — a device without the client, an IPv6 path around the tunnel." };
    if (on.length) {
      const why = [...missing.map((l) => `step ${L.indexOf(l) + 1} (${l.h}) is ${l.st === "warn" ? "not complete" : l.st === "unread" ? "not read" : "missing"}`), ...(sc.st === "bad" || sc.st === "warn" ? ["people it includes do not get the Microsoft profile or the client"] : [])];
      return { cls: "bad", h: "The policy is on — it blocks people, not tokens", p: `${on.map((p) => p.name).slice(0, 2).join(", ")} is on, but ${why.join("; ")}. Everybody in its scope who cannot pass through Global Secure Access is blocked. Put it back in report-only until this board is green.` };
    }
    if (!policies.length) return { cls: "bad", h: "A stolen token still works from anywhere", p: "No Conditional Access policy requires the compliant network yet. Build the chain below first, then a block-outside-the-compliant-network policy in report-only." };
    if (!guards.length) return { cls: "bad", h: "A stolen token still works from anywhere", p: `${policies.length} polic${policies.length === 1 ? "y names" : "ies name"} the compliant network, but none blocks every resource outside it — ${policies.map((p) => p.name).slice(0, 2).join(", ")}. Only a block for All resources, any location except the compliant network, stops a replayed token.` };
    const first = L.find((l) => l.st === "bad" || l.st === "warn") || L[0];
    return { cls: "bad", h: "A stolen token still works from anywhere", p: `${guards.map((p) => p.name).slice(0, 2).join(", ")} is not on. Blocked at step ${L.indexOf(first) + 1} — ${first.h}.` };
  }

  // ---- proof from the sign-in log -----------------------------------------
  // 32708 (go-live recheck S5): a block-outside-the-compliant-network policy
  // reads NOT APPLIED for a sign-in that came through the compliant network —
  // the location condition is not met — and so does a sign-in of somebody the
  // policy does not include. conditionsNotSatisfied tells them apart: only
  // "location" missing means in scope and passed through GSA. The share is
  // over the sign-ins the policies are about, not over the whole tenant, and
  // the read carries non-interactive sign-ins (token refresh — where a
  // replayed token shows) beside the interactive ones.
  const notSat = (a) => String(a.conditionsNotSatisfied || "").split(/[,\s]+/).filter((x) => x && x !== "none");
  function proof(signIns, policyIds) {
    const ids = new Set(policyIds || []);
    const per = {};
    let viaGsa = 0, total = 0, inScope = 0, inScopeVia = 0, interactive = 0, nonInteractive = 0;
    for (const s of signIns || []) {
      total++;
      const types = s.signInEventTypes || [];
      if (types.includes("nonInteractiveUser") || s.isInteractive === false) nonInteractive++; else interactive++;
      const via = s.isThroughGlobalSecureAccess === true || !!s.globalSecureAccessIpAddress;
      if (via) viaGsa++;
      let scoped = false, passed = false;
      for (const a of s.appliedConditionalAccessPolicies || []) {
        if (!ids.has(a.id)) continue;
        const p = per[a.id] || (per[a.id] = { wouldBlock: 0, wouldPass: 0, blocked: 0, passed: 0, notApplied: 0, usersBlock: new Set(), usersPass: new Set() });
        const r = a.result, ns = notSat(a);
        if (r === "reportOnlyFailure") { p.wouldBlock++; p.usersBlock.add(s.userId); scoped = true; }
        else if (r === "failure") { p.blocked++; p.usersBlock.add(s.userId); scoped = true; }
        else if (r === "reportOnlySuccess" || r === "success" || (/notApplied/i.test(r || "") && ns.length === 1 && ns[0] === "location")) {
          if (r === "success") p.passed++; else p.wouldPass++;
          p.usersPass.add(s.userId); scoped = true; passed = true;
        }
        else p.notApplied++;
      }
      if (scoped) { inScope++; if (passed || via) inScopeVia++; }
    }
    Object.values(per).forEach((p) => { p.usersBlock = p.usersBlock.size; p.usersPass = p.usersPass.size; });
    return { per, viaGsa, total, inScope, inScopeVia, interactive, nonInteractive };
  }
  function proofLink(m, pr) {
    const l = m.links.find((x) => x.k === "proof");
    if (!pr) return;
    const block = Object.values(pr.per).reduce((a, p) => a + p.wouldBlock + p.blocked, 0);
    const base = pr.inScope || 0, share = base ? Math.round((pr.inScopeVia || 0) / base * 100) : 0;
    l.st = base && share >= 90 && !block ? "ok" : base ? "warn" : "bad";
    l.note = base ? `${share}% of ${base} sign-ins in the policies' scope passed through GSA · ${block} would be or were blocked · read ${pr.interactive || 0} interactive and ${pr.nonInteractive || 0} non-interactive` : `no sign-in in the policies' scope among the ${pr.total} read (${pr.interactive || 0} interactive, ${pr.nonInteractive || 0} non-interactive) · ${pr.viaGsa} through GSA overall`;
  }

  // ---- render -------------------------------------------------------------
  const LANES = [["Foundation", ["licence", "tenant"]], ["Traffic path", ["profile", "signal", "location"]], ["Endpoint", ["client"]], ["Enforce", ["policy"]], ["Verify", ["proof"]]];
  const ICON = { ok: "✓", warn: "!", bad: "✕", wait: "…" };
  // the step the flow opens on: the first that blocks, else Proof
  const defaultSel = (m) => ((m.links.find((l) => l.st === "bad" || l.st === "warn") || m.links.find((l) => l.k === "proof") || m.links[0]).k);
  const ST = { ok: ["ok", "ready"], warn: ["warn", "partly"], bad: ["bad", "missing"], wait: ["wait", "waits"], unread: ["wait", "not read"] };
  const FIX_LABEL = { winswap: "Replace…", "scope-win": "Not in scope…", "scope-mac": "Not in scope…", onboard: "Activate…", profile: "Enable profile…", assign: "Assign…", signal: "Enable…", location: "Create…", winscript: "Create Windows script…", macscript: "Create macOS script and profiles…", macprof: "Create macOS profiles…", "macfix-script": "Fix the macOS script…", "macfix-sysext": "Fix system extensions…", "macfix-proxy": "Fix the transparent proxy…", "macfix-settings": "Fix the client settings…", ztnasp: "Create ZTNA client SP (only if clients stay Partially Connected)…", winrem: "Create Windows remediation…", trv2: "Set up tenant restrictions…" };
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
      return `<button type="button" class="gsa-node ${cls}${l.k === sel ? " sel" : ""}" data-gsasel="${l.k}" aria-pressed="${l.k === sel}" title="${esc(l.note)}"><span class="gsa-dot" aria-hidden="true">${ICON[cls] || "…"}</span><span class="gsa-lab">${i + 1} · ${esc(l.lab)}</span><b>${esc(l.h)}</b><span class="gsa-nv">${esc(word)}</span>${l.split ? `<span class="gsa-split">${l.split.map((s) => `<i class="${s.st === "ok" ? "ok" : s.st === "bad" ? "bad" : s.st === "na" ? "na" : "warn"}">${s.t} ${s.st === "ok" ? "✓" : s.st === "bad" ? "✕" : s.st === "na" ? "–" : "!"}</i>`).join("")}</span>` : ""}</button>`;
    };
    const lanes = LANES.map(([name, keys]) => `<div class="gsa-lane" style="grid-column:span ${keys.length}">${esc(name)}</div>`).join("");
    const flow = `<section class="list-card gsa-flow" aria-label="The chain, step by step"><div class="gsa-flow-in"><div class="gsa-lanes">${lanes}</div><div class="gsa-nodes">${m.links.map(node).join("")}</div></div><div class="gsa-legend mini muted"><span><i class="ok"></i>ready</span><span><i class="warn"></i>partly</span><span><i class="bad"></i>missing or off</span><span><i class="wait"></i>waits or not read</span><span>· click a step for its detail and fixes</span></div></section>`;
    const l = m.links.find((x) => x.k === sel), li = m.links.indexOf(l);
    const [cls, w0] = ST[l.st] || ST.wait;
    const acts = [];
    const act = (btn, h, sub) => acts.push(`<div class="gsa-actrow"><div><b>${esc(h)}</b>${sub ? `<div class="mini muted">${esc(sub)}</div>` : ""}</div>${btn}</div>`);
    const fixAct = (k, primary, optional) => { const f = FIXES[k] || {}; act(`<button class="btn sm${primary ? " primary" : ""}${optional ? " gsa-optional" : ""}" data-gsafix="${k}">${esc(FIX_LABEL[k].replace(/ \(only if[^)]*\)/, ""))}</button>`, f.title || FIX_LABEL[k], `${optional ? "Optional — only if clients stay Partially Connected. " : ""}writes to tenant · opens a workspace below with what it sends, its impact and the way back`); };
    // 0.11.0: step 6's fixes live in its two lanes, below — never in one slot here
    if (l.fix && l.k !== "client") fixAct(l.fix, l.st === "bad", false);
    if (l.fix2 && l.fix2 !== l.fix && l.k !== "client") fixAct(l.fix2, false, l.fix2 === "ztnasp");
    if (l.k === "policy" && !m.policiesLoaded) act(`<button class="btn sm primary" data-gsareadpols>📥 Read the policies</button>`, "Read the policies", "the same read as 🗂 Policies → from the tenant; back here when it is done");
    if (l.k === "policy" && m.policiesLoaded && !(m.guards || []).length && m.cn) act(`<button class="btn sm primary" data-gsabuild>Create it in report-only…</button>`, "Create the policy, report-only", `opens 🏗 Policy builder pre-filled — block all resources outside the compliant network, Windows and macOS, ${m.allUsers ? "all users" : "the Microsoft profile's groups"}, the Intune apps out — you set the exclusions and save`);
    if (l.k === "policy" && m.policies.some((p) => p.state === "enabledForReportingButNotEnforced")) act(`<button class="btn sm" data-gsasel="proof">Step 8 · the proof</button>`, "Read the proof", "what the report-only policy would have blocked in the last 7 days");
    if (l.k === "policy" && l.open) act(`<button class="btn sm" data-gsaopen="${esc(l.open)}">Open in Policies</button>`, "Open the policy", "state and exclusions are changed in 🗂 Policies — this tool leaves them as they are");
    if (l.k === "policy" && m.policies.length) act(`<button class="btn sm" data-gsajump="gsaPols">Show the list</button>`, `Every policy that names the compliant network (${m.policies.length})`, "the card below the workspaces");
    if (l.k === "client") act(`<button class="btn sm primary" data-gsajump="gsaLanes">Show the lanes</button>`, "Windows and macOS — each with its own actions", "below: what each platform needs, and which devices Global Secure Access has seen");
    if (l.k === "client") act(`<button class="btn sm" data-gsajump="gsaIntune">Show the Intune card</button>`, "Every GSA remediation, script, app and macOS profile", "where it is in Intune and whom it is assigned to");
    // 0.6.3 (Mihai: nothing happens when selecting Read the proof): the read
    // ran, but its only signs were a line at the foot of the page and the
    // step's note at the end — the button now says it is reading and how far,
    // and the answer lands here, in the step, with a way to the per-policy view
    if (l.k === "proof") {
      const pr = u.proof, n = u.proofRead || 0;
      act(u.proofBusy ? `<button class="btn sm" data-gsaproof disabled aria-busy="true">⏳ Reading… ${n ? `${n.toLocaleString()} sign-ins` : "the sign-in log"}</button>` : `<button class="btn sm" data-gsaproof>${pr ? "↻ Read again (7 days)" : "📈 Read the proof (7 days)"}</button>`, "Read the sign-in log", u.proofBusy ? "the last 7 days, interactive and non-interactive, up to 5,000 of each — a large tenant takes a minute" : pr ? `read ${pr.total.toLocaleString()} sign-ins${pr.capped ? " (capped)" : ""} · ${(pr.inScope || 0).toLocaleString()} in the policies' scope, ${(pr.inScopeVia || 0).toLocaleString()} of them through Global Secure Access` : "sign-ins through GSA, and what the compliant-network policies would block");
      if (pr && m.policies.length) act(`<button class="btn sm" data-gsajump="gsaPols">Show per policy</button>`, "What each policy would block", "the 7 days column on the policy card");
      if (u.proofErr && !u.proofBusy) act("", "The read stopped", u.proofErr);
    }
    // split on " · " outside brackets — a run summary "(0 without issue · …)" stays whole
    const parts = []; { let depth = 0, cur = ""; const t = String(l.note || ""); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (ch === "(") depth++; if (ch === ")") depth = Math.max(0, depth - 1); if (!depth && t.startsWith(" · ", i)) { parts.push(cur); cur = ""; i += 2; continue; } cur += ch; } parts.push(cur); }
    const read = parts.length > 2 || String(l.note || "").length > 90 ? `<ul class="gsa-read">${parts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(l.note)}</p>`;
    const prev = m.links[li - 1], waitWhy = l.st === "wait" && prev ? `<p class="mini muted">Waits on step ${li}, ${esc(prev.h)}.</p>` : "";
    const detail = `<section class="list-card gsa-detail ${cls}" id="gsaDetail" aria-live="polite"><div class="gsa-detail-main"><span class="gsa-lab">Step ${li + 1} of ${m.links.length} · ${esc(l.lab)}</span><h3>${esc(l.h)} <span class="gsa-st ${cls}">${esc(l.word || w0)}</span></h3>${read}${waitWhy}${l.sub ? `<p class="mini${/NOT ASSIGNED|missing|not read/.test(l.sub) ? " gsa-warn-txt" : " muted"}">${esc(l.sub)}</p>` : ""}${l.help ? `<p class="mini muted">${esc(l.help)}</p>` : ""}</div><div class="gsa-detail-act"><div class="gsa-lab">What you can do</div>${acts.length ? acts.join("") : `<p class="mini muted">${l.st === "ok" ? "Nothing to do here — this link is ready." : "Nothing ENCA can do from here — see the note."}</p>`}<div class="gsa-stepnav"><button class="btn sm" data-gsasel="${(m.links[li - 1] || l).k}"${li ? "" : " disabled"}>‹ Step ${li}</button><button class="btn sm" data-gsasel="${(m.links[li + 1] || l).k}"${li < m.links.length - 1 ? "" : " disabled"}>Step ${li + 2} ›</button></div></div></section>`;
    const work = (u.work || []).length ? `<section class="gsa-work" id="gsaWork" aria-label="Workspaces"><div class="gsa-work-head mini muted">⚙ Workspaces · ${u.work.length} open · newest first · each one runs on its own Apply</div>${u.work.join("")}</section>` : "";
    const yes = (b) => b ? '<span class="gsa-st ok">out</span>' : '<span class="gsa-st warn">not out</span>';
    const polRows = m.policies.map((p) => `<tr><td><a href="#" data-gsaopen="${esc(p.id)}"><b>${esc(p.name)}</b></a><div class="mini muted">${esc(p.shape)}${p.platforms ? ` · ${esc(p.platforms)}` : ""}</div>${p.guard ? "" : `<div class="mini gsa-warn-txt">not counted — ${p.shape !== "block outside the compliant network" ? "it does not block sign-ins outside the compliant network" : "it does not cover All resources"}</div>`}</td><td><span class="gsa-st ${p.state === "enabled" ? "ok" : p.state === "enabledForReportingButNotEnforced" ? "warn" : "wait"}">${p.state === "enabled" ? "on" : p.state === "enabledForReportingButNotEnforced" ? "report-only" : "off"}</span></td><td class="mini">${p.cnSide === "excluded" ? "excluded — applies outside it" : "included — applies on it"}</td><td class="mini">${esc(p.grant)}</td><td class="mini">${p.allUsers ? "All users" : `${p.includeGroups.length} group${p.includeGroups.length === 1 ? "" : "s"}`}${p.excludeGroups.length ? ` · ${p.excludeGroups.length} excluded` : ""}</td><td class="mini">Intune ${yes(p.intuneOut)} · Enrollment ${yes(p.enrollOut)} · ${p.excludeRoles.length ? `${p.excludeRoles.length} admin role${p.excludeRoles.length === 1 ? "" : "s"} excluded` : "no admin role excluded"}${(p.otherOut || []).length ? ` · <span class="gsa-warn-txt" title="${esc(p.otherOut.join(", "))}">${p.otherOut.length} other app${p.otherOut.length === 1 ? "" : "s"} excluded — a stolen token still reaches ${p.otherOut.length === 1 ? "it" : "them"}</span>` : ""}</td>${u.proof ? `<td class="mini">${(() => { const x = u.proof.per[p.id]; return x ? `${x.wouldBlock + x.blocked} block (${x.usersBlock} users) · ${x.wouldPass + x.passed} pass` : "no sign-in evaluated"; })()}</td>` : ""}</tr>`).join("");
    // 32522 (Mihai: a dedicated card that shows every policy containing the
    // compliant network): full width, every loaded policy that names it on
    // either side, with where it sits and what the grant is
    const nOn = m.policies.filter((p) => p.state === "enabled").length, nRo = m.policies.filter((p) => p.state === "enabledForReportingButNotEnforced").length;
    const polHead = `<h3>Policies that name the compliant network <span class="mini muted">· ${m.policiesLoaded ? `${m.policies.length} found${m.policies.length ? ` · ${nOn} on · ${nRo} report-only · ${m.policies.length - nOn - nRo} off` : ""}` : "policies not loaded"}</span></h3>`;
    const polBody = !m.policiesLoaded ? '<p class="mini">Not read yet: this card lists every policy that names the compliant network, on either side, once the policies are read. <button class="btn sm" data-gsareadpols>📥 Read the policies</button></p>'
      : m.policies.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Policy</th><th>State</th><th>Compliant network</th><th>Grant</th><th>Covers</th><th>Checks</th>${u.proof ? "<th>7 days</th>" : ""}</tr></thead><tbody>${polRows}</tbody></table></div>`
      : '<p class="mini">None of the loaded policies names the compliant network. Step 7 · <b>Create it in report-only…</b> opens the 🏗 Policy builder pre-filled (block, any location except the compliant network, All resources, Windows and macOS) — nothing is written until you save.</p>';
    const polTable = `<section class="list-card gsa-sect gsa-pols" id="gsaPols">${polHead}${polBody}<p class="mini muted">Read from the policies ENCA already holds — the ones loaded in 🗂 Policies, from the tenant or a file. This tool leaves them as they are: state and exclusions are changed in 🗂 Policies or 🎚 Set policy state. Without the Microsoft Intune and Intune Enrollment apps out, a new device cannot enrol to receive the client. Excluded admin roles are reported, not changed: see the admin handover.</p></section>`;
    // 32523: the Intune card
    const iv = m.intune || { rows: [], unread: [], missingProfiles: [] };
    const tg = (r) => r.t ? `${r.t.inc.length ? esc(r.t.inc.join(", ")) : '<span class="gsa-st bad">not assigned</span>'}${r.t.exc.length ? `<div class="mini muted">excluded: ${esc(r.t.exc.join(", "))}</div>` : ""}` : r.assigned === false ? '<span class="gsa-st bad">not assigned</span>' : r.assigned ? "assigned" : '<span class="muted">not read</span>';
    const ivRows = iv.rows.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.dup ? ' <span class="gsa-st warn">duplicate</span>' : ""}<div class="mini muted">${esc(r.kind)}</div></td><td class="mini">${esc(r.os)}</td><td class="mini">Intune › ${esc(r.where)}</td><td class="mini">${esc(r.by)}</td><td class="mini">${tg(r)}</td></tr>`).join("");
    const ivNotes = [
      ...(iv.winBoth ? ["Windows has more than one kind of deployment (remediation, platform script or app): each installs the client — keep one and remove the others' assignments."] : []),
      ...(iv.missingProfiles.length && !(m.links.find((x) => x.k === "client") || {}).macNa ? [`macOS profile not found: ${iv.missingProfiles.join(", ")} — step 6 creates or repairs it.`] : []),
      ...iv.unread,
    ];
    const ivTable = `<section class="list-card gsa-sect gsa-intune" id="gsaIntune"><h3>Intune policies and scripts for the client <span class="mini muted">· ${iv.rows.length} found</span></h3>${iv.rows.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Policy</th><th>Platform</th><th>Where in Intune</th><th>Made by</th><th>Assigned to</th></tr></thead><tbody>${ivRows}</tbody></table></div>` : '<p class="mini">None found — no remediation, script, app or macOS profile with Global Secure Access (or GSA) in its name.</p>'}${ivNotes.map((n) => `<p class="mini gsa-warn-txt">${esc(n)}</p>`).join("")}<p class="mini muted">Matched by name here; step 6 judges each by reach and landing. ENCA makes the Windows remediation (or platform script), the macOS shell script and the three macOS profiles (the fixes on the Devices link). Made by ENCA T56 is read from the description ENCA writes.</p></section>`;
    const grpRows = m.groups.map((g) => `<tr${g.backing ? ' class="gsa-backing"' : ""}><td><b>${esc(g.name)}</b><div class="mini muted">${esc(g.id)}</div></td><td class="mini">${esc(g.why)}</td></tr>`).join("");
    // 0.9.1: who it reaches — three questions, each answered for what it is
    const ri = m.reachInfo || { profile: {}, policies: {}, devices: { macOS: [], Windows: [] } };
    const who = (k) => `<span class="gsa-who ${k}">${k === "dev" ? "devices" : "users"}</span>`;
    const gl = (list) => list.map((g) => `<b>${esc(g.name)}</b>`).join(", ");
    const pr = ri.profile, po = ri.policies, dv = ri.devices;
    const profAns = !pr.onboarded ? '<span class="muted">Global Secure Access is not activated yet (step 2).</span>' : !pr.read ? '<span class="muted">Not read — the profile\'s assignments could not be read.</span>' : pr.allUsers ? `<b>All users.</b> <i>Assignment required</i> is off on the profile's enterprise app, so every signed-in user's client tunnels Microsoft traffic. <span class="muted">No group is needed or used here${pr.groups.length ? ` — the group${pr.groups.length === 1 ? "" : "s"} still assigned (${gl(pr.groups)}) make${pr.groups.length === 1 ? "s" : ""} no difference` : ""}.</span>` : pr.groups.length || pr.users ? `${gl(pr.groups)}${pr.users ? `${pr.groups.length ? " and " : ""}${pr.users} user${pr.users === 1 ? "" : "s"} directly` : ""} — only they get the profile.` : '<span class="gsa-bad-txt">Nobody</span> — Assignment required is on and no group or user is assigned (step 3).';
    const polAns = !po.loaded ? '<span class="muted">Not known yet — the policies are not read.</span> <button class="btn sm" data-gsareadpols>📥 Read the policies</button>' : !po.count ? '<span class="muted">No policy requires the compliant network yet (step 7), so nobody has to sign in through Global Secure Access.</span>' : `${po.allUsers.length ? `<b>All users</b> (${esc(po.allUsers.join(", "))})${po.groups.length ? ", and " : ""}` : ""}${po.groups.map((g) => `<b>${esc(g.name)}</b> <span class="muted">(${esc(g.by)})</span>`).join(", ")}${!po.allUsers.length && !po.groups.length ? '<span class="muted">users or roles only — see the policy</span>' : ""}`;
    const devLine = (os, list) => `${os}: ${list.length ? list.map((e) => `<b>${esc(e.name)}</b> <span class="muted">(${esc(e.what.join(", "))}${e.info && typeof e.info.devices === "number" ? `; ${e.info.devices} device${e.info.devices === 1 ? "" : "s"}, ${e.info.managedMacs} managed Mac${e.info.managedMacs === 1 ? "" : "s"}` : ""})</span>`).join(", ") : '<span class="muted">nothing assigned</span>'}`;
    const devAns = `${devLine("macOS", dv.macOS || [])}<br>${devLine("Windows", dv.Windows || [])}`;
    const winN = (dv.Windows || []).length, macN = dv.managedMacs;
    const line = !pr.onboarded ? "" : `Profile for ${pr.allUsers ? "all users" : pr.groups.length ? `${pr.groups.length} group${pr.groups.length === 1 ? "" : "s"}` : "nobody"}; the client on ${macN == null ? `${(dv.macOS || []).length ? "the macOS groups below" : "no Mac"}` : `${macN} managed Mac${macN === 1 ? "" : "s"}`} and ${winN ? "the Windows groups below" : "no Windows device"}${(macN === 0 || !(dv.macOS || []).length) && !winN ? " — so nobody's traffic goes through Global Secure Access yet" : ""}.`;
    // 32708 (B2): the three answers compared — who must pass against who can
    const sc = m.scope || { st: "na", lines: [] };
    const scopeHtml = sc.st === "na" ? "" : `<div class="gsa-scope ${sc.st}">${sc.lines.map((x) => `<p class="mini ${x.sev === "bad" ? "gsa-bad-txt" : x.sev === "warn" ? "gsa-warn-txt" : "gsa-ok-txt"}">${x.sev === "ok" ? "✓" : x.sev === "bad" ? "✕" : "!"} ${esc(x.t)}</p>`).join("")}</div>`;
    const grpTable = `<section class="list-card gsa-sect gsa-reach" id="gsaReach"><h3>Who Global Secure Access reaches <span class="mini muted">· users through the profile and the policies, devices through Intune</span></h3>${line ? `<p class="mini"><b>${esc(line)}</b></p>` : ""}${scopeHtml}<div class="gu-tw"><table class="plist gsa-reachtab"><thead><tr><th>Question</th><th>Who</th><th>Answer</th><th></th></tr></thead><tbody>
      <tr><td><b>Who gets the Microsoft traffic profile?</b></td><td>${who("usr")}</td><td>${profAns}${pr.backing && pr.backing.length ? `<div class="mini muted">${gl(pr.backing)}: the portal's backing group for the profile — do not use it in Intune or Conditional Access.</div>` : ""}</td><td><button class="btn sm" data-gsasel="profile">Step 3</button></td></tr>
      <tr><td><b>Who must sign in through it?</b><div class="mini muted">the compliant-network policies' include</div></td><td>${who("usr")}</td><td>${polAns}</td><td><button class="btn sm" data-gsasel="policy">Step 7</button></td></tr>
      <tr><td><b>Which devices get the client?</b><div class="mini muted">Intune targets of the scripts, remediation and profiles</div></td><td>${who("dev")}</td><td>${devAns}</td><td><button class="btn sm" data-gsasel="client">Step 6</button></td></tr>
    </tbody></table></div>${m.groups.length ? `<p class="mini muted">The groups in this table${m.groups.length <= 3 ? ` (${esc(m.groups.map((g) => g.name).join(", "))})` : ""} are the <b>Used by GSA</b> scope of 👥 Groups (T12). <button class="btn sm" data-gsagroups>Open in Groups</button></p>` : ""}</section>`;
    const proofSect = u.proof ? `<section class="list-card gsa-sect"><h3>Sign-ins, last 7 days</h3><p class="mini">${u.proof.total} sign-ins read — ${u.proof.interactive || 0} interactive, ${u.proof.nonInteractive || 0} non-interactive${u.proof.capped ? " (each capped at the newest 5,000)" : ""} · ${u.proof.inScope || 0} in the policies' scope, ${u.proof.inScopeVia || 0} of them through Global Secure Access · ${u.proof.viaGsa} through it overall.</p><p class="mini muted">A sign-in a report-only policy would block is one that did not come through the client — a device without it, the client paused, or an IPv6 path around the tunnel (the client tunnels IPv4 only). Switch the policy on when this is near zero; this tool does not do that for you.</p></section>` : u.proofBusy ? `<section class="list-card gsa-sect"><p class="mini">Reading the sign-in log…</p></section>` : "";
    const later = `<p class="mini muted gsa-later">🌐 This tool covers the <b>Microsoft traffic profile</b>. Internet Access and Private Access come later; their profiles and assignments will join this board and the Used by GSA scope.</p>`;
    // 0.7.0: the tenant restrictions card (built by app.js from js/trv2.js)
    // sits between the step and the workspaces — a protection of its own,
    // not a link of the compliant-network chain, so the eight steps and the
    // verdict stay about stolen tokens
    // 32708: Windows judged by reach and landing, in the same table form as macOS
    // 0.11.0: the two lanes and the devices table; the macOS chain table (per-row repairs) under them
    const macSect = l.k === "client" ? `${lanesHtml(l)}${l.mac && !l.macNa ? `<section class="list-card gsa-sect gsa-macsect" id="gsaMac">${macTable(l.mac)}</section>` : ""}` : "";
    return head + flow + detail + macSect + (u.trv2Html || "") + work + polTable + ivTable + grpTable + proofSect + later;
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
  // v1.2, identical to the CloudFellows baseline R26.10.V3.5.x MacScripts/scr-app-109-install-global-secure-access.zsh
  const MAC_SCRIPT_LINES = [
    "#!/bin/zsh",
    "# Install / update the Global Secure Access client for macOS - CF macOS baseline R26.10, script v1.2 (also ENCA T56)",
    "# [OPTIONAL] object: imported and assigned only when the 'GSA' bundle (or this object) is selected in the importer.",
    "# Intune shell script, runs as root on a weekly schedule with retries. Needs, assigned to the same Macs:",
    "#   - allowed system extensions, team UBF8T346G9: com.microsoft.globalsecureaccess + .tunnel  (baseline 'System Extensions', always imported)",
    "#   - the transparent proxy profile, com.apple.vpn.managed / provider com.microsoft.globalsecureaccess.tunnel ('[OPTIONAL] ... GSA Transparent Proxy')",
    "#   - the client settings preference file, domain com.microsoft.globalsecureaccess ('[OPTIONAL] ... GSA System settings')",
    "# v1.2 (2026-10-17): the package must be signed by Microsoft (team UBF8T346G9) before it is installed as root; macOS 14 or",
    "#   later (Learn's minimum); a first install waits for BOTH approvals - the system extension allow-list and the GSA",
    "#   transparent proxy (matched on its provider, not on any TransparentProxy) - read with xmllint from the installed",
    "#   profiles; temp files cleaned on every exit; downloads capped at 15 minutes; the extension state is logged after install.",
    "# v1.1 (2026-10-16): first install waits for the transparent proxy profile; runs weekly and upgrades in place when aka.ms",
    "#   serves a newer client (package version vs installed CFBundleShortVersionString). v1.0 (ENCA T56) installed once.",
    "# Log: /Library/Logs/Microsoft/IntuneScripts/GlobalSecureAccess/install.log",
    "# Exit 1 = not done yet (Intune retries up to 3 times, then the weekly run picks it up); exit 0 = installed or up to date.",
    "",
    "appname=\"Global Secure Access Client\"",
    "url=\"https://aka.ms/GlobalSecureAccess-macOS\"",
    "teamid=\"UBF8T346G9\"",
    "minmajor=14",
    "logdir=\"/Library/Logs/Microsoft/IntuneScripts/GlobalSecureAccess\"",
    "mkdir -p \"$logdir\"",
    "exec >> \"$logdir/install.log\" 2>&1",
    "say() { echo \"$(date '+%Y-%m-%d %H:%M:%S') | $1\"; }",
    "",
    "tmp=\"\"",
    "cleanup() { [[ -n \"$tmp\" && -d \"$tmp\" ]] && /bin/rm -rf \"$tmp\"; }",
    "trap cleanup EXIT",
    "",
    "ver_gt() {   # true when $1 is newer than $2 (dotted numbers, e.g. 1.1.26060207)",
    "    local -a a b",
    "    a=(${(s:.:)1}); b=(${(s:.:)2})",
    "    local i x y",
    "    for (( i = 1; i <= ${#a} || i <= ${#b}; i++ )); do",
    "        x=${a[$i]:-0}; y=${b[$i]:-0}",
    "        (( x > y )) && return 0",
    "        (( x < y )) && return 1",
    "    done",
    "    return 1",
    "}",
    "",
    "# --- the installed configuration profiles, as XML; xp <xpath> is true when it matches ---",
    "profiles_xml=\"\"",
    "xp() { [[ \"$(print -r -- \"$profiles_xml\" | /usr/bin/xmllint --xpath \"boolean($1)\" - 2>/dev/null)\" == \"true\" ]]; }",
    "# a profile item is the dict that carries PayloadType; its settings sit under PayloadContent",
    "SYSEXT_OK=\"//dict[key='PayloadType' and string='com.apple.system-extension-policy']//key[.='AllowedSystemExtensions']/following-sibling::dict[1]/key[.='$teamid']/following-sibling::array[1]/string[.='com.microsoft.globalsecureaccess.tunnel'] | //dict[key='PayloadType' and string='com.apple.system-extension-policy']//key[.='AllowedTeamIdentifiers']/following-sibling::array[1]/string[.='$teamid']\"",
    "PROXY_OK=\"//dict[key='PayloadType' and string='com.apple.vpn.managed']//key[.='ProviderBundleIdentifier']/following-sibling::string[1][.='com.microsoft.globalsecureaccess.tunnel']\"",
    "",
    "if [[ $(/usr/bin/id -u) -ne 0 ]]; then say \"must run as root (Intune: run as signed-in user = No)\"; exit 1; fi",
    "major=$(/usr/bin/sw_vers -productVersion | /usr/bin/cut -d. -f1)",
    "if (( major < minmajor )); then say \"macOS $major is below $minmajor - the client does not support it, skipped\"; exit 0; fi",
    "",
    "# --- installed version (both locations the client has used) ---",
    "installed_app=\"\"",
    "for p in \"/Applications/Global Secure Access Client.app\" \"/Applications/GlobalSecureAccessClient/Global Secure Access Client.app\"; do",
    "    if [[ -d \"$p\" ]]; then installed_app=\"$p\"; break; fi",
    "done",
    "installed_ver=\"\"",
    "if [[ -n \"$installed_app\" ]]; then",
    "    installed_ver=$(/usr/bin/defaults read \"$installed_app/Contents/Info.plist\" CFBundleShortVersionString 2>/dev/null)",
    "fi",
    "say \"start v1.2 - macOS $(/usr/bin/sw_vers -productVersion) - installed: ${installed_ver:-none}\"",
    "",
    "# --- first install only: wait until MDM has delivered both approvals, so the user sees no prompt ---",
    "if [[ -z \"$installed_app\" ]]; then",
    "    profiles_xml=$(/usr/bin/profiles show -type configuration -output stdout-xml 2>/dev/null)",
    "    missing=()",
    "    xp \"$SYSEXT_OK\" || missing+=(\"system extension allow-list (com.apple.system-extension-policy, team $teamid, com.microsoft.globalsecureaccess.tunnel)\")",
    "    xp \"$PROXY_OK\" || missing+=(\"transparent proxy (com.apple.vpn.managed, provider com.microsoft.globalsecureaccess.tunnel)\")",
    "    if (( ${#missing} )); then",
    "        for m in \"${missing[@]}\"; do say \"not on this Mac yet: $m\"; done",
    "        say \"waiting for MDM - retrying later\"",
    "        exit 1",
    "    fi",
    "    say \"approvals present: system extensions and transparent proxy\"",
    "fi",
    "",
    "# --- download the current package ---",
    "tmp=$(/usr/bin/mktemp -d /tmp/gsa.XXXXXX)",
    "pkg=\"$tmp/GlobalSecureAccessClient.pkg\"",
    "if ! /usr/bin/curl -L --fail --silent --show-error --retry 3 --connect-timeout 30 --max-time 900 -o \"$pkg\" \"$url\" || [[ ! -s \"$pkg\" ]]; then",
    "    say \"download failed ($url)\"",
    "    if [[ -n \"$installed_app\" ]]; then exit 0; fi   # installed: keep the current version, try again next run",
    "    exit 1",
    "fi",
    "",
    "# --- signed by Microsoft, or nothing is installed ---",
    "sig=$(/usr/sbin/pkgutil --check-signature \"$pkg\" 2>&1)",
    "if ! print -r -- \"$sig\" | /usr/bin/grep -q \"($teamid)\"; then",
    "    say \"package NOT signed by Microsoft (team $teamid) - refused\"",
    "    print -r -- \"$sig\" | /usr/bin/head -5 | while IFS= read -r l; do say \"  $l\"; done",
    "    exit 1",
    "fi",
    "",
    "# --- version inside the package (Distribution file; client versions look like 1.1.26060207, the bundled MAU like 4.8x.x) ---",
    "pkg_ver=\"\"",
    "if /usr/bin/xar -xf \"$pkg\" Distribution -C \"$tmp\" 2>/dev/null && [[ -f \"$tmp/Distribution\" ]]; then",
    "    pkg_ver=$(/usr/bin/grep -oE 'version=\"1\\.[0-9]+\\.[0-9]{6,}\"' \"$tmp/Distribution\" | /usr/bin/head -1 | /usr/bin/sed -E 's/version=\"([^\"]+)\"/\\1/')",
    "fi",
    "say \"package version: ${pkg_ver:-unknown} (signed, team $teamid)\"",
    "",
    "# --- decide ---",
    "if [[ -n \"$installed_app\" ]]; then",
    "    if [[ -z \"$pkg_ver\" || -z \"$installed_ver\" ]]; then",
    "        say \"cannot compare versions - keeping the installed client\"; exit 0",
    "    fi",
    "    if ! ver_gt \"$pkg_ver\" \"$installed_ver\"; then",
    "        say \"up to date ($installed_ver)\"; exit 0",
    "    fi",
    "    say \"upgrading $installed_ver -> $pkg_ver\"",
    "else",
    "    say \"installing ${pkg_ver:-unknown version}\"",
    "fi",
    "",
    "if ! /usr/sbin/installer -pkg \"$pkg\" -target /; then",
    "    say \"install failed\"; exit 1",
    "fi",
    "say \"$appname ${pkg_ver} installed\"",
    "ext=$(/usr/bin/systemextensionsctl list 2>/dev/null | /usr/bin/grep -i \"globalsecureaccess\")",
    "say \"system extension: ${ext:-not listed yet (activates when the client starts)}\"",
    "exit 0",
  ];
  function macScript() { return MAC_SCRIPT_LINES.join("\n") + "\n"; }
  // ---- the three macOS profiles, as Learn's "Install the Global Secure
  // Access client for macOS" documents them (0.8.0, read 17 Oct 2026) ------
  // System extensions: a settings catalog policy, Allowed System Extensions
  // for the two bundle ids under Microsoft's team id — the shape devcf's own
  // policy has. Transparent proxy: a custom profile carrying Learn's plist
  // verbatim (com.apple.vpn.managed, device channel). Client settings: a
  // preference file for com.microsoft.globalsecureaccess with the four Hide…
  // keys — Learn's sample by default (Pause and Disable shown, Quit and
  // Disable Private Access hidden), lock = all four hidden (devcf v3.1).
  const GSA_TEAM = "UBF8T346G9", GSA_EXTS = ["com.microsoft.globalsecureaccess.tunnel", "com.microsoft.globalsecureaccess"], GSA_DOMAIN = "com.microsoft.globalsecureaccess";
  const MADE = "Created by ENCA T56.";
  function macSysextSettings() {
    const str = (value) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue", value });
    return [{ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting", settingInstance: {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance", settingDefinitionId: "com.apple.system-extension-policy_com.apple.system-extension-policy",
      groupSettingCollectionValue: [{ children: [
        { "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance", settingDefinitionId: "com.apple.system-extension-policy_allowuseroverrides", choiceSettingValue: { value: "com.apple.system-extension-policy_allowuseroverrides_true", children: [] } },
        { "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance", settingDefinitionId: "com.apple.system-extension-policy_allowedsystemextensions", groupSettingCollectionValue: [{ children: [
          { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance", settingDefinitionId: "com.apple.system-extension-policy_allowedsystemextensions_generickey", simpleSettingCollectionValue: GSA_EXTS.map(str) },
          { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance", settingDefinitionId: "com.apple.system-extension-policy_allowedsystemextensions_generickey_keytobereplaced", simpleSettingValue: str(GSA_TEAM) },
        ] }] },
      ] }] } }];
  }
  function macSysextBody(opts) {
    return { name: names(opts).sysext, description: `Allowed System Extensions for the Global Secure Access client: ${GSA_EXTS.join(" and ")}, team ${GSA_TEAM}; user overrides allowed. Pre-approves the client's extensions so the install asks nothing. ${MADE}`, platforms: "macOS", technologies: "mdm,appleRemoteManagement", roleScopeTagIds: ["0"], settings: macSysextSettings() };
  }
  function macProxyPlist() {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "  <dict>",
      "    <key>PayloadUUID</key>", "    <string>87cbb424-6af7-4748-9d43-f1c5dda7a0a6</string>",
      "    <key>PayloadType</key>", "    <string>Configuration</string>",
      "    <key>PayloadOrganization</key>", "    <string>Microsoft Corporation</string>",
      "    <key>PayloadIdentifier</key>", `    <string>${GSA_DOMAIN}</string>`,
      "    <key>PayloadDisplayName</key>", "    <string>Global Secure Access Proxy Configuration</string>",
      "    <key>PayloadDescription</key>", "    <string>Add Global Secure Access Proxy Configuration</string>",
      "    <key>PayloadVersion</key>", "    <integer>1</integer>",
      "    <key>PayloadEnabled</key>", "    <true/>",
      "    <key>PayloadRemovalDisallowed</key>", "    <true/>",
      "    <key>PayloadScope</key>", "    <string>System</string>",
      "    <key>PayloadContent</key>",
      "    <array>",
      "      <dict>",
      "        <key>PayloadUUID</key>", "        <string>04e13063-2bb8-4b72-b1ed-45290f91af68</string>",
      "        <key>PayloadType</key>", "        <string>com.apple.vpn.managed</string>",
      "        <key>PayloadOrganization</key>", "        <string>Microsoft Corporation</string>",
      "        <key>PayloadIdentifier</key>", `        <string>${GSA_DOMAIN}</string>`,
      "        <key>PayloadDisplayName</key>", "        <string>Global Secure Access Proxy Configuration</string>",
      "        <key>PayloadDescription</key>", "        <string/>",
      "        <key>PayloadVersion</key>", "        <integer>1</integer>",
      "        <key>TransparentProxy</key>",
      "        <dict>",
      "          <key>AuthenticationMethod</key>", "          <string>Password</string>",
      "          <key>Order</key>", "          <integer>1</integer>",
      "          <key>ProviderBundleIdentifier</key>", "          <string>com.microsoft.globalsecureaccess.tunnel</string>",
      "          <key>ProviderDesignatedRequirement</key>", `          <string>identifier "com.microsoft.globalsecureaccess.tunnel" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = ${GSA_TEAM}</string>`,
      "          <key>ProviderType</key>", "          <string>app-proxy</string>",
      "          <key>RemoteAddress</key>", "          <string>100.64.0.0</string>",
      "        </dict>",
      "        <key>UserDefinedName</key>", "        <string>Global Secure Access Proxy Configuration</string>",
      "        <key>VPNSubType</key>", `        <string>${GSA_DOMAIN}</string>`,
      "        <key>VPNType</key>", "        <string>TransparentProxy</string>",
      "      </dict>",
      "    </array>",
      "  </dict>",
      "</plist>",
    ].join("\n");
  }
  function macProxyBody(opts) {
    return { "@odata.type": "#microsoft.graph.macOSCustomConfiguration", displayName: names(opts).proxy, description: `Learn's transparent proxy profile for the Global Secure Access client (com.apple.vpn.managed, provider com.microsoft.globalsecureaccess.tunnel, team ${GSA_TEAM}, device channel). Without it the client asks the user to allow the proxy and cannot tunnel. ${MADE}`, payloadName: "GSA Transparent Proxy", payloadFileName: "GSA Transparent Proxy.xml", deploymentChannel: "deviceChannel", roleScopeTagIds: ["0"], payload: b64(macProxyPlist()) };
  }
  function macSettingsPlist(opts) {
    const lock = !!(opts && opts.lock), v = (b) => (b ? "<true/>" : "<false/>");
    return ["<key>HidePauseButton</key>", v(lock), "<key>HideDisableButton</key>", v(lock), "<key>HideQuitButton</key>", v(true), "<key>HideDisablePrivateAccessButton</key>", v(true)].join("\n");
  }
  function macSettingsBody(opts) {
    const lock = !!(opts && opts.lock);
    return { "@odata.type": "#microsoft.graph.macOSCustomAppConfiguration", displayName: names(opts).settings, description: `Preference file ${GSA_DOMAIN}: ${lock ? "HidePauseButton, HideDisableButton, HideQuitButton and HideDisablePrivateAccessButton true — the tray menu has no bypass left (lock-down)" : "HideQuitButton and HideDisablePrivateAccessButton true, Pause and Disable shown — Learn's pilot sample"}. ${MADE}`, bundleId: GSA_DOMAIN, fileName: `${GSA_DOMAIN}.plist`, roleScopeTagIds: ["0"], configurationXml: b64(macSettingsPlist(opts)) };
  }
  // the profiles a macOS workspace makes: key on the read, option, body
  const MAC_PROFILES = [
    { key: "sysext", opt: "pSys", role: "system extensions", kind: "settings catalog", path: "/deviceManagement/configurationPolicies", nameKey: "name", body: macSysextBody, name: (o) => names(o).sysext },
    { key: "proxy", opt: "pProxy", role: "transparent proxy", kind: "custom profile, Learn's plist", path: "/deviceManagement/deviceConfigurations", nameKey: "displayName", body: macProxyBody, name: (o) => names(o).proxy },
    { key: "settings", opt: "pSet", role: "client settings", kind: "preference file", path: "/deviceManagement/deviceConfigurations", nameKey: "displayName", body: macSettingsBody, name: (o) => names(o).settings },
  ];
  // an unset option means "the ones that are missing or unassigned"
  const wantProfile = (o, p, mp) => { const v = (o || {})[p.opt]; if (v != null) return !!v; const x = (mp || {})[p.key]; return !(x && x.assigned); };
  function macScriptBody(opts) {
    return { "@odata.type": "#microsoft.graph.deviceShellScript", displayName: names(opts).mac, description: "v1.2 (the CloudFellows baseline script): downloads the Global Secure Access client for macOS from aka.ms, installs it only when it is signed by Microsoft (team UBF8T346G9), waits on a first install until the system extension allow-list and the GSA transparent proxy are on the Mac, then runs weekly and upgrades in place. macOS 14 or later. Created by ENCA T56.", fileName: MAC_FILE, runAsAccount: "system", executionFrequency: "P7D", retryCount: 3, blockExecutionNotifications: true, roleScopeTagIds: ["0"], scriptContent: b64(macScript()) };
  }

  // ---- 0.9.0 (Mihai 17 Oct: "we need this to be robust and complete") ----
  // The macOS chain checked four ways per object, whatever it is called:
  //   FOUND    by content — a settings catalog (or the deprecated Extensions
  //            template) allowing the GSA extensions or team UBF8T346G9, a
  //            custom profile whose plist names the GSA tunnel provider, a
  //            preference file for com.microsoft.globalsecureaccess (the
  //            ".plist" slip included), a shell script downloading the client
  //   CONTENT  compared with Learn (Install the Global Secure Access client for
  //            macOS; Add a property list file to macOS devices)
  //   REACH    the object's assignments against the install script's
  //   LANDED   what Intune reports per device
  // A row has at most one fix (macfix-<key>): create when nothing is found,
  // repair when the content is wrong (a new version, the old one unassigned
  // and renamed [DEPRECATED], never deleted), assign when it is right but
  // misses the script's Macs. System extensions are never made a second time
  // when another policy already sets that payload on the Macs — the GSA ids
  // are added to that policy instead (a PUT, with a backup downloaded first).
  const b64dec = (s) => { try { const bin = atob(String(s || "")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); } catch { return ""; } };
  const DEP_RX = /^\s*\[DEPRECATED\]\s*/i;
  const isDep = (n) => DEP_RX.test(n || "");
  const SET_KEYS = ["HidePauseButton", "HideDisableButton", "HideQuitButton", "HideDisablePrivateAccessButton"];
  const SX = "com.apple.system-extension-policy";
  function walkSettings(node, out) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) { node.forEach((n) => walkSettings(n, out)); return out; }
    if (node.settingDefinitionId) (out[node.settingDefinitionId] = out[node.settingDefinitionId] || []).push(node);
    for (const v of Object.values(node)) if (v && typeof v === "object") walkSettings(v, out);
    return out;
  }
  function sysextFacts(p) {
    if (/macOSExtensionsConfiguration$/.test(p["@odata.type"] || "")) {
      const ms = (p.systemExtensionsAllowed || []).filter((x) => x.teamIdentifier === GSA_TEAM).map((x) => x.bundleId);
      const teams = p.systemExtensionsAllowedTeamIdentifiers || [];
      return { legacy: true, payload: true, ids: GSA_EXTS.every((id) => ms.includes(id)), team: teams.includes(GSA_TEAM), both: false, pairs: [] };
    }
    const by = walkSettings(p.settings || [], {});
    const pairs = [];
    for (const g of by[`${SX}_allowedsystemextensions`] || []) for (const item of g.groupSettingCollectionValue || []) {
      const kids = item.children || [];
      const ids = ((kids.find((k) => k.settingDefinitionId === `${SX}_allowedsystemextensions_generickey`) || {}).simpleSettingCollectionValue || []).map((v) => v.value);
      const team = (((kids.find((k) => k.settingDefinitionId === `${SX}_allowedsystemextensions_generickey_keytobereplaced`) || {}).simpleSettingValue) || {}).value;
      pairs.push({ team, ids });
    }
    const teams = (by[`${SX}_allowedteamidentifiers`] || []).flatMap((t) => (t.simpleSettingCollectionValue || []).map((v) => v.value));
    const ms = pairs.filter((x) => x.team === GSA_TEAM);
    const payload = !!((by[`${SX}_${SX}`] || []).length || pairs.length || teams.length);
    return { legacy: false, payload, ids: GSA_EXTS.every((id) => ms.some((x) => x.ids.includes(id))), team: teams.includes(GSA_TEAM), both: ms.length > 0 && teams.includes(GSA_TEAM), pairs };
  }
  const proxyPlist = (c) => b64dec(c.payload);
  const isGsaProxy = (c) => /macOSCustomConfiguration$/.test(c["@odata.type"] || "") && /com\.microsoft\.globalsecureaccess\.tunnel/.test(proxyPlist(c)) && /com\.apple\.vpn\.managed/.test(proxyPlist(c));
  const isGsaSettings = (c) => /macOSCustomAppConfiguration$/.test(c["@odata.type"] || "") && /^com\.microsoft\.globalsecureaccess(\.plist)?$/i.test(String(c.bundleId || "").trim());
  const isGsaScript = (s) => /GlobalSecureAccess-macOS/i.test(b64dec(s.scriptContent)) || (!s.scriptContent && /global\s*secure\s*access/i.test(`${s.displayName} ${s.fileName}`));
  function settingsKeys(c) {
    const x = b64dec(c.configurationXml), out = {}, other = [];
    const rx = /<key>\s*([^<]+?)\s*<\/key>\s*<(true|false|string|integer|real|array|dict)\b[^>]*?(\/?)>/g; let mm;
    while ((mm = rx.exec(x))) { const k = mm[1], t = mm[2]; if (SET_KEYS.includes(k)) out[k] = t === "true" ? true : t === "false" ? false : `not a boolean (${t})`; else other.push(k); }
    return { keys: out, other };
  }
  // the issues per kind: { t: text, sev: "bad" | "note" }
  function contentIssues(key, o) {
    const iss = [], bad = (t) => iss.push({ t, sev: "bad" }), note = (t) => iss.push({ t, sev: "note" });
    const nm = o.displayName || o.name || "";
    if (/ - U - /.test(nm) && key !== "sysext") note("named U — it is a device payload (the CloudFellows importer sends U names to All users)");
    if (key === "script") {
      const t = b64dec(o.scriptContent);
      if (!t) { note("script content not read"); return iss; }
      if (!/pkgutil\s+--check-signature/.test(t) || !t.includes(GSA_TEAM)) bad("installs the package without checking it is signed by Microsoft (team UBF8T346G9)");
      if (o.executionFrequency === "PT0S" || !/ver_gt|upgrad/i.test(t)) bad("installs once and never upgrades the client");
      if (!/system-extension-policy/.test(t) || !/vpn\.managed|ProviderBundleIdentifier/.test(t)) bad("does not wait for both approvals (system extensions and the GSA proxy) — the user can get approval prompts");
      if (/scr-app-108/i.test(o.fileName || "")) note("file scr-app-108 is OneDrive Open at Login in the CloudFellows baseline — ENCA uses 109");
      if (o.runAsAccount && o.runAsAccount !== "system") bad("runs as the signed-in user — the installer needs root");
    } else if (key === "sysext") {
      const f = sysextFacts(o);
      if (f.legacy) bad("deprecated Extensions template (2408) — Learn: move to the settings catalog Allowed System Extensions");
      if (!f.ids && !f.team) bad("the GSA extensions are not allowed (com.microsoft.globalsecureaccess and .tunnel, team UBF8T346G9)");
      if (f.both) bad("team UBF8T346G9 is in allowed extensions and allowed teams together — Intune says the profile then fails");
    } else if (key === "proxy") {
      const p = proxyPlist(o);
      if (!p) { note("profile payload not read"); return iss; }
      if (!/<key>VPNType<\/key>\s*<string>TransparentProxy<\/string>/.test(p)) bad("VPNType is not TransparentProxy");
      if (!/<key>ProviderBundleIdentifier<\/key>\s*<string>com\.microsoft\.globalsecureaccess\.tunnel<\/string>/.test(p)) bad("provider is not com.microsoft.globalsecureaccess.tunnel");
      if (!/<key>ProviderType<\/key>\s*<string>app-proxy<\/string>/.test(p)) bad("ProviderType is not app-proxy");
      if (!/subject\.OU\]\s*=\s*UBF8T346G9/.test(p)) bad("the designated requirement does not name team UBF8T346G9");
      if (o.deploymentChannel && o.deploymentChannel !== "deviceChannel") bad("user channel — Learn: device channel");
    } else if (key === "settings") {
      const dom = String(o.bundleId || "").trim();
      if (dom !== GSA_DOMAIN) bad(`preference domain ${dom} — the client reads ${GSA_DOMAIN}, so these keys most likely never reach it`);
      const k = settingsKeys(o);
      SET_KEYS.filter((x) => typeof k.keys[x] === "string").forEach((x) => bad(`${x} is ${k.keys[x]}`));
      if (k.other.length) note(`keys the client does not know: ${k.other.join(", ")}`);
      if (!Object.keys(k.keys).length) bad("none of the four Hide… keys is set");
    }
    return iss;
  }
  function settingsMode(o) { const k = settingsKeys(o).keys; return SET_KEYS.every((x) => k[x] === true) ? "lock-down" : k.HideQuitButton === true && k.HideDisablePrivateAccessButton === true && k.HidePauseButton === false && k.HideDisableButton === false ? "pilot" : "custom"; }
  // assignments → what they reach
  function tgt(asg) {
    const r = { inc: [], exc: [], all: null, allUsers: null };
    for (const a of asg || []) {
      const t = a.target || a, ty = t["@odata.type"] || "", f = t.deviceAndAppManagementAssignmentFilterId ? { id: t.deviceAndAppManagementAssignmentFilterId, mode: t.deviceAndAppManagementAssignmentFilterType } : null;
      if (/exclusion/i.test(ty)) r.exc.push(t.groupId);
      else if (/allDevices/i.test(ty)) r.all = { filter: f };
      else if (/allLicensedUsers/i.test(ty)) r.allUsers = { filter: f };
      else if (t.groupId) r.inc.push({ id: t.groupId, filter: f });
    }
    return r;
  }
  function reach(objAsg, scriptAsg, names) {
    const nm = (ids) => ids.map((id) => names[id] || id).join(", ");
    if (!objAsg || !objAsg.length) return { st: "bad", text: "assigned to nobody" };
    const o = tgt(objAsg), s = tgt(scriptAsg);
    const desc = [o.all ? `All devices${o.all.filter ? " (filter)" : ""}` : "", o.allUsers ? "All users" : "", o.inc.length ? nm(o.inc.map((x) => x.id)) : ""].filter(Boolean).join(" + ");
    if (!scriptAsg || !scriptAsg.length) return { st: "na", text: `${desc} — no assigned install script to compare with` };
    const sIds = s.inc.map((x) => x.id);
    const excl = sIds.filter((id) => o.exc.includes(id));
    if (excl.length) return { st: "warn", text: `excludes ${nm(excl)} — the script's group` };
    if (o.all) return o.all.filter ? { st: "ok", text: "All devices, with a filter — check the filter takes the script's Macs" } : { st: "ok", text: "All devices" };
    if (s.all) return { st: "warn", text: `the script runs on All devices, this reaches ${desc} only` };
    const missing = sIds.filter((id) => !o.inc.some((x) => x.id === id));
    if (!missing.length) {
      const fdiff = s.inc.some((x) => { const y = o.inc.find((z) => z.id === x.id); return JSON.stringify(x.filter) !== JSON.stringify(y && y.filter); });
      return fdiff ? { st: "warn", text: `${nm(sIds)}, but with another filter than the script` } : { st: "ok", text: o.inc.length === sIds.length ? "same group" : `includes ${nm(sIds)}` };
    }
    if (o.allUsers) return { st: "warn", text: "All users — the script targets devices; a Mac without a licensed user is missed" };
    return { st: "bad", text: `misses ${nm(missing)} — the script's group` };
  }
  function landed(o, key) {
    if (key === "script") { const r = o.runSummary; return r ? { text: `${r.successDeviceCount || 0} ok · ${r.errorDeviceCount || 0} failed`, bad: (r.errorDeviceCount || 0) > 0 } : { text: "not read" }; }
    if (o.overview) { const v = o.overview, n = (v.successCount || 0) + (v.errorCount || 0) + (v.failedCount || 0) + (v.conflictCount || 0) + (v.pendingCount || 0); return { text: n ? `${v.successCount || 0} ok · ${(v.errorCount || 0) + (v.failedCount || 0)} error · ${v.conflictCount || 0} conflict · ${v.pendingCount || 0} pending` : "no device has reported", bad: (v.errorCount || 0) + (v.failedCount || 0) + (v.conflictCount || 0) > 0 }; }
    if (typeof o.reported === "number") return { text: o.reported ? `${o.reported} device${o.reported === 1 ? "" : "s"} reported — states in Intune` : "no device has reported" };
    return { text: "not read" };
  }
  // the best candidate: not deprecated, assigned, newest
  const pickBest = (list) => [...list].sort((a, b) => (isDep(a.displayName || a.name) - isDep(b.displayName || b.name)) || (((b.assignments || []).length > 0) - ((a.assignments || []).length > 0)) || String(b.lastModifiedDateTime || "").localeCompare(String(a.lastModifiedDateTime || "")))[0] || null;
  const MAC_KEYS = [["script", "Install script"], ["sysext", "System extensions"], ["proxy", "Transparent proxy"], ["settings", "Client settings"]];
  function macCheck(chain, names) {
    const c = chain || {}, nm = names || {};
    const cand = {
      script: (c.scripts || []).filter(isGsaScript),
      sysext: [...(c.policies || []), ...(c.configs || []).filter((x) => /macOSExtensionsConfiguration$/.test(x["@odata.type"] || ""))].filter((p) => { const f = sysextFacts(p); return f.ids || f.team; }),
      proxy: (c.configs || []).filter(isGsaProxy),
      settings: (c.configs || []).filter(isGsaSettings),
    };
    const best = Object.fromEntries(Object.entries(cand).map(([k, v]) => [k, pickBest(v)]));
    const scriptAsg = best.script ? best.script.assignments || [] : [];
    // other policies that set the system-extension payload: a second one is a conflict
    // 32708 (L8): the deprecated Extensions template sets the same payload
    const otherSx = [...(c.policies || []), ...(c.configs || []).filter((x) => /macOSExtensionsConfiguration$/.test(x["@odata.type"] || ""))].filter((p) => p !== best.sysext && !isDep(p.name || p.displayName) && sysextFacts(p).payload && (p.assignments || []).length);
    const rows = MAC_KEYS.map(([key, label]) => {
      const o = best[key];
      if (!o) return { key, label, found: null, also: [], issues: [], reach: { st: "bad", text: "—" }, landed: { text: "—" }, st: "bad", mode: "create", why: "not found" };
      const issues = contentIssues(key, o);
      const rc = key === "script" ? (scriptAsg.length ? { st: "ok", text: tgt(scriptAsg).inc.map((x) => nm[x.id] || x.id).join(", ") || (tgt(scriptAsg).all ? "All devices" : "") } : { st: "bad", text: "assigned to nobody" }) : reach(o.assignments, scriptAsg, nm);
      const badC = issues.some((i) => i.sev === "bad");
      const st = badC || rc.st === "bad" ? "bad" : rc.st === "warn" || issues.length ? "warn" : "ok";
      const consolidated = key === "sysext" && !/GSA|Global Secure Access/i.test(o.name || o.displayName || "");
      return { key, label, found: o, name: o.displayName || o.name, consolidated, also: cand[key].filter((x) => x !== o).map((x) => x.displayName || x.name), issues, reach: rc, landed: landed(o, key), st,
        mode: badC ? "repair" : rc.st === "bad" || rc.st === "warn" ? "assign" : null, mood: key === "settings" ? settingsMode(o) : null };
    });
    // the script's groups: who is in them
    const gids = tgt(scriptAsg).inc.map((x) => x.id), gi = (c.groups || {});
    const groups = gids.map((id) => Object.assign({ id, name: nm[id] || id }, gi[id] || {}));
    const noMac = groups.length && groups.every((g) => typeof g.managedMacs === "number" && g.managedMacs === 0 && !g.users);
    const problems = rows.filter((r) => r.st === "bad").length + (noMac ? 1 : 0);
    return { rows, groups, noMac, otherSx: otherSx.filter((p) => p.name !== undefined).map((p) => ({ id: p.id, name: p.name })), otherSxLegacy: otherSx.filter((p) => p.name === undefined).map((p) => ({ id: p.id, name: p.displayName })), policiesById: Object.fromEntries((c.policies || []).map((p) => [p.id, p])), problems, scriptAsg, ok: !problems && rows.every((r) => r.st === "ok") };
  }
  // ---- names: next version, U → D, the [OPTIONAL] prefix kept ------------
  function bumpName(old, d) {
    let n = String(old || "").replace(DEP_RX, "").replace(/ - U - /, " - D - ").trim();
    const mm = n.match(/^(.*?)(?: - R\d+(?:\.\d+)?)? - v(\d+)(?:\.(\d+))?(?:\.\d+)*\s*$/);
    return mm ? `${mm[1]} - ${relTag(d)} - v${mm[2]}.${(+(mm[3] || 0)) + 1}` : `${n} - ${relTag(d)} - v1.0`;
  }
  // the GSA ids added to an existing system-extension policy (the PUT body's settings)
  function sysextAdd(settings) {
    const s = JSON.parse(JSON.stringify(settings || []));
    const str = (value) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue", value });
    const by = walkSettings(s, {});
    const grp = (by[`${SX}_allowedsystemextensions`] || [])[0];
    if (grp) {
      const item = (grp.groupSettingCollectionValue || []).find((it) => (((it.children || []).find((k) => k.settingDefinitionId === `${SX}_allowedsystemextensions_generickey_keytobereplaced`) || {}).simpleSettingValue || {}).value === GSA_TEAM);
      if (item) { const coll = item.children.find((k) => k.settingDefinitionId === `${SX}_allowedsystemextensions_generickey`); const have = coll.simpleSettingCollectionValue.map((v) => v.value); GSA_EXTS.filter((id) => !have.includes(id)).forEach((id) => coll.simpleSettingCollectionValue.push(str(id))); }
      else grp.groupSettingCollectionValue.push({ children: [
        { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance", settingDefinitionId: `${SX}_allowedsystemextensions_generickey`, simpleSettingCollectionValue: GSA_EXTS.map(str) },
        { "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance", settingDefinitionId: `${SX}_allowedsystemextensions_generickey_keytobereplaced`, simpleSettingValue: str(GSA_TEAM) }] });
      return s.map((x) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting", settingInstance: x.settingInstance }));
    }
    // no allowed-extensions group yet: the policy gets ENCA's whole block beside what it has
    return [...s.map((x) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting", settingInstance: x.settingInstance })), ...macSysextSettings()];
  }
  const stripTarget = (t) => { const o = { "@odata.type": t["@odata.type"] }; ["groupId", "deviceAndAppManagementAssignmentFilterId", "deviceAndAppManagementAssignmentFilterType"].forEach((k) => { if (t[k] != null) o[k] = t[k]; }); return o; };
  const PATHS = { cfg: "/deviceManagement/deviceConfigurations", pol: "/deviceManagement/configurationPolicies", script: "/deviceManagement/deviceShellScripts" };
  const kindOf = (o) => o.name !== undefined && o.settings !== undefined ? "pol" : /deviceShellScript$/.test(o["@odata.type"] || "") || o.scriptContent !== undefined && !o.bundleId ? "script" : "cfg";
  // the plan of one macOS fix: what it changes, impact, way back, and the ops the runner sends
  function macFixPlan(k, mac, opts) {
    const o = opts || {}, key = String(k).replace(/^macfix-/, ""), row = ((mac && mac.rows) || []).find((r) => r.key === key);
    if (!row) return null;
    if (row.found && !row.mode) return { mode: "none", row, ops: [], changes: ["Nothing to do — this row is found, as Learn, and reaches the script's Macs."], title: `${row.label}: complete`, impact: "None.", recovery: "None." };
    const label = row.label.toLowerCase(), cur = row.found, today = new Date().toISOString().slice(0, 10);
    const scriptT = ((mac.scriptAsg || []).map((a) => stripTarget(a.target || a)));
    const groupOp = scriptT.length ? null : { do: "group", name: String(o.macGroup || GROUPS.mac).trim(), make: o.mkGroup !== false };
    const targetsFor = (old) => { const t = (old || []).map((a) => stripTarget(a.target || a)); scriptT.forEach((x) => { if (!t.some((y) => y.groupId && y.groupId === x.groupId || /allDevices/i.test(y["@odata.type"]) && /allDevices/i.test(x["@odata.type"]))) t.push(x); }); return t; };
    const ops = [], changes = [];
    const nameOpts = { rel: o.rel, ver: o.ver };
    const bodyFor = (name) => key === "sysext" ? Object.assign(macSysextBody(nameOpts), { name }) : key === "proxy" ? Object.assign(macProxyBody(nameOpts), { displayName: name }) : key === "settings" ? Object.assign(macSettingsBody(Object.assign({ lock: o.lock }, nameOpts)), { displayName: name }) : Object.assign(macScriptBody(nameOpts), { displayName: name });
    const kind = key === "sysext" ? "pol" : key === "script" ? "script" : "cfg";
    let mode = row.mode || (row.found ? null : "create");
    // system extensions: another policy already sets the payload → add to it, unless the person picks a separate one
    const sxTarget = key === "sysext" && (mode === "create" || mode === "repair") && (o.sxMode || "add") === "add" ? (mode === "repair" && row.consolidated ? cur : mode === "create" && mac.otherSx.length ? mac.otherSx[0] : null) : null;
    if (mode === "create" && !sxTarget) {
      const name = key === "script" ? names(nameOpts).mac : names(nameOpts)[key];
      if (groupOp) ops.push(groupOp);
      ops.push({ do: "post", kind, path: PATHS[kind], body: bodyFor(name), label: `${name} created`, as: "new", reuseByName: true });
      ops.push({ do: "assign", kind, id: "$new", targets: scriptT.length ? scriptT : "$group", label: `assigned to ${scriptT.length ? "the script's group" : o.macGroup || GROUPS.mac}` });
      changes.push(`POST a ${key === "sysext" ? "settings catalog policy" : key === "proxy" ? "custom profile (Learn's plist)" : key === "settings" ? `preference file (${GSA_DOMAIN}, ${o.lock ? "lock-down" : "pilot"})` : "shell script (v1.2)"} named ${name}.`, `Assign it to ${scriptT.length ? "the install script's targets" : `${o.macGroup || GROUPS.mac}${o.mkGroup !== false ? " (made when missing)" : ""}`}.`);
      return { mode, row, ops, changes, title: `Create the ${label}`, impact: `Macs in the group get the ${label} at their next check-in.`, recovery: `Unassign or delete ${name} in Intune.` };
    }
    if (sxTarget) {
      const pol = (mac.policiesById || {})[sxTarget.id] || sxTarget;
      // 32708 (L7): the policy keeps its NAME — it is the baseline's own (the
      // importer matches it by name); what changed goes in its description
      const newName = pol.name;
      ops.push({ do: "backup", file: `ENCA-backup-${(pol.name || "policy").replace(/[^\w.-]+/g, "_")}`, data: pol, label: "backup of the policy downloaded" });
      ops.push({ do: "put", kind: "pol", path: `${PATHS.pol}/${pol.id}`, body: { name: newName, description: `${today}: the Global Secure Access extensions (${GSA_EXTS.join(", ")}, team ${GSA_TEAM}) added by ENCA T56. | ${pol.description || ""}`.slice(0, 1000), platforms: "macOS", technologies: pol.technologies || "mdm,appleRemoteManagement", roleScopeTagIds: pol.roleScopeTagIds || ["0"], settings: sysextAdd(pol.settings) }, label: `${newName}: the GSA extensions added` });
      if (scriptT.length && reach(pol.assignments, mac.scriptAsg, {}).st !== "ok") ops.push({ do: "assign", kind: "pol", id: pol.id, targets: targetsFor(pol.assignments), label: "the script's group added to its assignments" });
      changes.push(`Download a backup of ${pol.name}.`, `PUT it back, name unchanged, with ${GSA_EXTS.join(" and ")} added under team ${GSA_TEAM} and the change dated in its description — every other setting as it is. One policy keeps setting the system-extension payload, so Intune reports no conflict.`, ...(ops.some((x) => x.do === "assign") ? ["Add the install script's targets to its assignments, keeping the ones it has."] : []));
      return { mode: "add", row, ops, changes, title: `Add the GSA extensions to ${pol.name}`, impact: "Every Mac the policy reaches gets the two GSA extensions pre-approved; harmless where the client is not installed. Nothing else in the policy changes.", recovery: `Import the downloaded backup, or remove the two ids from ${pol.name} in Intune.` };
    }
    if (mode === "assign") {
      ops.push({ do: "assign", kind: kindOf(cur), id: cur.id, targets: targetsFor(cur.assignments), label: `${row.name}: the script's targets added` });
      changes.push(`Add the install script's targets to ${row.name}, keeping its own assignments${(row.reach.text || "").startsWith("excludes") ? " (its exclusion of the script's group is left — remove that by hand)" : ""}.`);
      return { mode, row, ops, changes, title: `Assign the ${label} to the script's Macs`, impact: `The script's Macs get ${row.name} at their next check-in.`, recovery: `Remove the added assignment from ${row.name}.` };
    }
    // repair: a corrected next version, the old one unassigned and marked
    const newName = bumpName(row.name), ck = kindOf(cur);
    const lock = key === "settings" ? (o.lock != null ? o.lock : settingsMode(cur) === "lock-down") : o.lock;
    const body = key === "settings" ? Object.assign(macSettingsBody(Object.assign({}, nameOpts, { lock })), { displayName: newName }) : bodyFor(newName);
    const why = row.issues.filter((i) => i.sev === "bad").map((i) => i.t).join("; ");
    ops.push({ do: "post", kind, path: PATHS[kind], body, label: `${newName} created`, as: "new", reuseByName: true });
    ops.push({ do: "assign", kind, id: "$new", targets: targetsFor(cur.assignments), label: `${newName} assigned like ${row.name}${scriptT.length ? " and to the script's targets" : ""}` });
    ops.push({ do: "assign", kind: ck, id: cur.id, targets: [], label: `${row.name} unassigned` });
    const depName = `[DEPRECATED] ${row.name}`.slice(0, 250), depDesc = `DEPRECATED ${today}: ${why}; replaced by ${newName} (ENCA T56). | ${cur.description || ""}`.slice(0, 1000);
    ops.push(ck === "pol" ? { do: "put", kind: ck, path: `${PATHS.pol}/${cur.id}`, body: { name: depName, description: depDesc, platforms: "macOS", technologies: cur.technologies || "mdm,appleRemoteManagement", roleScopeTagIds: cur.roleScopeTagIds || ["0"], settings: (cur.settings || []).map((x) => ({ "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting", settingInstance: x.settingInstance })) }, label: `${row.name} renamed [DEPRECATED]` }
      : { do: "patch", kind: ck, path: `${PATHS[ck]}/${cur.id}`, body: { "@odata.type": cur["@odata.type"] || (ck === "script" ? "#microsoft.graph.deviceShellScript" : undefined), displayName: depName, description: depDesc }, label: `${row.name} renamed [DEPRECATED]` });
    changes.push(`POST ${newName} — ${key === "settings" ? `domain ${GSA_DOMAIN}, the four keys ${lock ? "all hidden (lock-down, as the old one)" : "as Learn's pilot sample"}` : key === "proxy" ? "Learn's transparent-proxy plist" : key === "script" ? "the v1.2 script: Microsoft signature check, waits for both approvals, weekly upgrade" : "Allowed System Extensions for the two GSA ids"}.`,
      `Assign it to everything ${row.name} is assigned to${scriptT.length ? ", plus the install script's targets" : ""}.`, `Unassign ${row.name} and rename it [DEPRECATED], with the date and the reason in its description. It is not deleted.`);
    return { mode: "repair", row, ops, changes, title: `Repair the ${label}`, impact: `Macs in the groups get ${newName} instead of ${row.name} at their next check-in${key === "settings" && lock ? " — with lock-down the tray loses Pause, Disable, Quit and Disable Private Access" : ""}.`, recovery: `Assign ${row.name} again (remove [DEPRECATED] from its name) and unassign ${newName}.` };
  }
  function macTable(mac) {
    if (!mac) return "";
    const cls = (st) => st === "ok" ? "ok" : st === "warn" || st === "na" ? "warn" : "bad";
    const icon = (st) => st === "ok" ? "✓" : st === "warn" || st === "na" ? "!" : "✕";
    const btn = (r) => { const m = r.found ? r.mode : "create"; if (!m) return ""; const lab = m === "repair" ? "Repair…" : m === "assign" ? "Assign…" : r.key === "script" ? "Create…" : "Create…"; return `<button class="btn sm${r.st === "bad" ? " primary" : ""}" data-gsafix="${r.key === "script" && !r.found ? "macscript" : `macfix-${r.key}`}">${lab}</button>`; };
    const rows = mac.rows.map((r) => `<tr><td><b>${esc(r.label)}</b></td><td>${r.found ? `${esc(r.name)}${r.consolidated ? ' <span class="muted">(the baseline\'s own policy)</span>' : ""}${r.mood ? ` <span class="muted">· ${esc(r.mood)}</span>` : ""}${r.also.length ? `<div class="mini muted">also: ${esc(r.also.join(" · "))}</div>` : ""}` : '<span class="gsa-warn-txt">not found</span>'}</td><td>${r.found ? (r.issues.length ? r.issues.map((i) => `<div class="${i.sev === "bad" ? "gsa-bad-txt" : "muted"}">${i.sev === "bad" ? "✕" : "·"} ${esc(i.t)}</div>`).join("") : '<span class="gsa-ok-txt">✓ as Learn</span>') : "—"}</td><td class="gsa-${cls(r.reach.st)}-txt">${r.found ? `${icon(r.reach.st)} ${esc(r.reach.text)}` : "—"}</td><td class="muted">${esc(r.landed.text)}</td><td>${btn(r)}</td></tr>`).join("");
    const grp = mac.groups.length ? `<p class="mini${mac.noMac ? " gsa-warn-txt" : " muted"}">${mac.noMac ? "⚠ " : ""}The script's group${mac.groups.length > 1 ? "s" : ""}: ${mac.groups.map((g) => `${esc(g.name)} — ${typeof g.devices === "number" ? `${g.devices} device${g.devices === 1 ? "" : "s"}, ${g.managedMacs} managed Mac${g.managedMacs === 1 ? "" : "s"}${g.users ? `, ${g.users} users` : ""}` : "members not read"}`).join(" · ")}${mac.noMac ? ". Nothing in this table lands on a Mac until a managed Mac is in the group." : ""}</p>` : "";
    const sx = mac.otherSx.length && !mac.rows.find((r) => r.key === "sysext").found ? `<p class="mini muted">Another policy already sets system extensions on these Macs (${esc(mac.otherSx.map((p) => p.name).join(", "))}); Create adds the GSA ids to it instead of making a second policy, which Intune would report as a conflict.</p>` : "";
    const sxOld = (mac.otherSxLegacy || []).length ? `<p class="mini gsa-warn-txt">A deprecated Extensions profile also sets system extensions on these Macs (${esc(mac.otherSxLegacy.map((p) => p.name).join(", "))}) — two system-extension payloads conflict. Move it to the settings catalog (Allowed System Extensions) and unassign it; ENCA does not edit the old template.</p>` : "";
    return `<div class="gsa-mac"><div class="gsa-lab" style="margin:10px 0 4px">macOS chain — found by content, checked against Learn${mac.problems ? ` · <span class="gsa-bad-txt">${mac.problems} problem${mac.problems === 1 ? "" : "s"}</span>` : ' · <span class="gsa-ok-txt">complete</span>'}</div><div class="gsa-tablewrap"><table class="gsa-mtable"><thead><tr><th>Object</th><th>Found</th><th>Content</th><th>Reaches the script's Macs</th><th>Landed</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${grp}${sx}${sxOld}</div>`;
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
    // 0.11.0: the platform script takes the remediation's groups; the record that keeps a platform out of scope
    if (k === "winswap") return [{ id: "win", label: WIN_FILE, lang: "powershell", text: windowsScript(o) }, ...req([`POST /deviceManagement/deviceManagementScripts   (${nm.win}; a GSA platform script already in Intune is reused)`, "POST /deviceManagement/deviceManagementScripts/{id}/assign", j({ deviceManagementScriptAssignments: (o.remGroups && o.remGroups.length ? o.remGroups : ["the remediation's groups"]).map((g) => ({ "@odata.type": "#microsoft.graph.deviceManagementScriptAssignment", target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: `<${g}>` } })) }), "", `then, only when that landed: POST /deviceManagement/deviceHealthScripts/${o.remId || "{remediation}"}/assign`, j({ deviceHealthScriptAssignments: [] }), "", "a backup of the remediation's assignments is downloaded first"])];
    if (k === "scope-win" || k === "scope-mac") {
      const platform = k === "scope-mac" ? "macOS" : "Windows", cur = scopeOut(o.rec)[platform === "macOS" ? "macOS" : "windows"];
      return req([o.rec ? `PATCH /v1.0/organization/{tenant id}/extensions/${ENCA_EXT}` : "POST /v1.0/organization/{tenant id}/extensions", j(scopeRecord(o.rec, platform, !cur, o.who || "<you>", o.why || "", "<now>"))]);
    }
    if (k === "trv2") return T2 ? T2.preview(o.plan) : [];
    if (/^macfix-/.test(k)) {
      const plan = macFixPlan(k, o.mac, o); if (!plan) return [];
      const tabs = [];
      const body = (plan.ops.find((x) => x.do === "post" || x.do === "put" && x.body.settings) || {}).body;
      if (body) {
        if (body.scriptContent) tabs.push({ id: "mac", label: MAC_FILE, lang: "shell", text: b64dec(body.scriptContent) });
        else if (body.payload) tabs.push({ id: "proxy", label: "Transparent proxy (plist)", lang: "xml", text: b64dec(body.payload) });
        else if (body.configurationXml) tabs.push({ id: "settings", label: `Client settings (${body.bundleId})`, lang: "xml", text: b64dec(body.configurationXml) });
        else tabs.push({ id: "sysext", label: "System extensions (JSON)", lang: "json", text: j(body.settings) });
      }
      const say = (x) => x.do === "post" ? [`POST ${x.path}   (${x.label.replace(/ created$/, "")}; reused when one of that name is there)`] : x.do === "put" ? [`PUT ${x.path}   (${x.label})`] : x.do === "patch" ? [`PATCH ${x.path}`, j(x.body)] : x.do === "assign" ? [`POST ${x.id === "$new" ? `${PATHS[x.kind]}/{new}` : `${PATHS[x.kind]}/${x.id}`}/assign   (${x.label})`, j(Array.isArray(x.targets) ? x.targets : [`<${o.macGroup || GROUPS.mac}>`])] : x.do === "group" ? [`find or make the device group ${x.name}`] : x.do === "backup" ? ["download a JSON backup of the policy first"] : [];
      tabs.push({ id: "req", label: "Graph requests", lang: "http", text: plan.ops.flatMap((x) => [...say(x), ""]).join("\n").trim() });
      return tabs;
    }
    if (k === "macscript" || k === "macprof") {
      // 0.8.0: the script, the three profiles as sent, and the requests —
      // an unticked profile is left out, a found one is assigned, not made
      const mp = o.macProf || {};
      const tabs = k === "macscript" ? [{ id: "mac", label: MAC_FILE, lang: "shell", text: macScript() }] : [];
      const lines = [];
      if (k === "macscript") lines.push(`POST /deviceManagement/deviceShellScripts   (${nm.mac}; reused when a script of that name is there)`, `POST /deviceManagement/deviceShellScripts/{id}/assign`, j({ deviceManagementScriptAssignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: `<${o.macGroup || GROUPS.mac}>` } }] }), "");
      for (const p of MAC_PROFILES) {
        if (!wantProfile(o, p, mp)) { lines.push(`— ${p.role}: not ticked, left as it is`, ""); continue; }
        const found = mp[p.key];
        if (p.key === "sysext") tabs.push({ id: "sysext", label: "System extensions (JSON)", lang: "json", text: j(macSysextBody(o)) });
        if (p.key === "proxy") tabs.push({ id: "proxy", label: "Transparent proxy (plist)", lang: "xml", text: macProxyPlist() });
        if (p.key === "settings") tabs.push({ id: "settings", label: "Client settings (plist)", lang: "xml", text: macSettingsPlist(o) });
        if (found) lines.push(`— ${p.role}: ${found.name} is in Intune — reused, not created again`);
        else lines.push(`POST ${p.path}   (${p.name(o)}, ${p.kind})`);
        lines.push(`POST ${p.path}/{id}/assign`, j({ assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: `<${o.macGroup || GROUPS.mac}>` } }] }), "");
      }
      tabs.push({ id: "req", label: "Graph requests", lang: "http", text: lines.join("\n").trim() });
      return tabs;
    }
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
    winrem: { title: "Create the Windows remediation", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST an Intune remediation (Devices → Scripts and remediations) named by the CloudFellows convention (Win - DHS - Device Security - D - Install Global Secure Access Client - R… - v…; SYSTEM, 64-bit). Detection: the client in the uninstall keys and the client settings as chosen. Remediation: install from aka.ms (x64 or ARM64) when missing, then write the settings.", `Assign it to the device group you name — ${GROUPS.win} by default, made empty when missing and the tick is on — with remediation on, daily or hourly.`], impact: "At its next scheduled run every device in the group installs the Global Secure Access client when it is missing, and every run puts the client settings back. Pilot settings hide sign-out and Disable Private Access but leave Disable visible; locked down hides all four. Nothing restarts the device. Licence: remediations need Windows Enterprise E3/E5, Education A3/A5 or VDA (Learn) and the tenant's Windows license verification (Intune → Tenant administration → Connectors and tokens → Windows data) — not Business Premium, which carries Windows Business; step 6 offers the platform script there. A remediation found by step 6 is reused and assigned, never made a second time; every assignment it has is written back with remediation ON.", recovery: "Remove the assignment or delete the remediation in Intune → Devices → Scripts and remediations; it stops running. The client stays installed — uninstall it per device from Apps & features if needed." },
    macscript: { title: "Create the macOS client — script and profiles", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST an Intune macOS shell script named by the CloudFellows convention (MACOS - SH - Software Installation - D - Install Global Secure Access Client - R… - v…; root, weekly, three retries, notifications blocked, file scr-app-109-install-global-secure-access.zsh — the CloudFellows baseline script v1.2) that downloads the client package from aka.ms, installs it only when it is signed by Microsoft (team UBF8T346G9), waits on a first install until the system-extension and proxy approvals are on the Mac, and upgrades in place when aka.ms serves a newer client — reused, not made again, when a script of that name is there.", "POST the three profiles the client cannot run without, as ticked below (ticked by default when missing or unassigned; one already in Intune is reused and only assigned): a settings catalog policy allowing the system extensions com.microsoft.globalsecureaccess.tunnel and com.microsoft.globalsecureaccess (team UBF8T346G9), a custom profile with Learn's transparent-proxy plist (com.apple.vpn.managed, device channel), and a preference file for com.microsoft.globalsecureaccess with the four Hide… keys as chosen.", `Assign all of them to the device group you name — ${GROUPS.mac} by default (the group the GSA macOS profiles target in the baseline), created empty when missing and the tick is on.`], impact: "Every Mac in the group installs the Global Secure Access client at its next Intune check-in and gets the profiles — before or after the script, the order does not matter. Nothing moves until the Microsoft profile is on and assigned to the user. The profiles pre-approve the extension and the proxy; without them the client asks the user to approve them or cannot tunnel. The client settings only hide tray buttons.", recovery: "Unassign or delete the three profiles in Intune → Devices → macOS → Configuration and the script in Devices → macOS → Shell scripts; the client stays installed (uninstall: the Uninstall Global Secure Access Client app). Nothing in Entra changes." },
    // 0.9.0: one entry per chain row; macFixPlan(k, mac, opts) says create, repair, assign or add
    "macfix-script": { title: "Fix the macOS install script", scopes: ["DeviceManagementScripts.ReadWrite.All", "DeviceManagementConfiguration.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["As the plan below says."], impact: "As the plan below says.", recovery: "As the plan below says." },
    "macfix-sysext": { title: "Fix the system extensions", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["As the plan below says."], impact: "As the plan below says.", recovery: "As the plan below says." },
    "macfix-proxy": { title: "Fix the transparent proxy profile", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["As the plan below says."], impact: "As the plan below says.", recovery: "As the plan below says." },
    "macfix-settings": { title: "Fix the client settings", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["As the plan below says."], impact: "As the plan below says.", recovery: "As the plan below says." },
    macprof: { title: "Create the macOS profiles", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST the profiles the client cannot run without, as ticked below (ticked by default when missing or unassigned; one already in Intune is reused and only assigned): a settings catalog policy allowing the system extensions com.microsoft.globalsecureaccess.tunnel and com.microsoft.globalsecureaccess (team UBF8T346G9), a custom profile with Learn's transparent-proxy plist (com.apple.vpn.managed, device channel), and a preference file for com.microsoft.globalsecureaccess with the four Hide… keys as chosen. The shell script already in Intune is left as it is.", `Assign them to the device group you name — ${GROUPS.mac} by default, created empty when missing and the tick is on.`], impact: "Every Mac in the group gets the profiles at its next Intune check-in: the extension and the proxy are pre-approved, so the installed client loads its extension and tunnels without an approval prompt. Nothing moves until the Microsoft profile is on and assigned to the user. The client settings only hide tray buttons.", recovery: "Unassign or delete the profiles in Intune → Devices → macOS → Configuration; the client stays installed and falls back to asking the user. Nothing in Entra changes." },
    ztnasp: { title: "Create the ZTNA Policy Service Client service principal", scopes: ["Application.ReadWrite.All"], role: "Application Administrator", changes: [`POST /servicePrincipals with appId ${ZTNA_CLIENT} — Microsoft's first-party app the client signs in through.`], impact: "Optional — Microsoft documents no requirement for this app. None for users: it adds Microsoft's enterprise application to the tenant. In the LearnGraphAPI lab the client stayed Partially Connected (sign-in errors 50097, 50187) while it was missing; whether creating it alone fixed that was not proven.", recovery: "Delete the enterprise application again (Enterprise applications → ZTNA Policy Service Client → Properties → Delete)." },
    location: { title: `Make “${LOCATION_NAME}” appear`, scopes: ["Policy.ReadWrite.ConditionalAccess"], role: "Conditional Access Administrator", changes: ["Read the named locations again first — Entra creates this location itself when Conditional Access signalling is switched on (Learn), often a little after the switch. Found: nothing is written.", `Still missing: POST a compliantNetworkNamedLocation “${LOCATION_NAME}” (allTenantCompliantNetworks, not trusted). Learn documents List, Get and Update for this type, NOT create — if Graph refuses, switch signalling off and on in Global Secure Access → Settings → Session management → Adaptive access and read again.`], impact: "None until a policy names it.", recovery: "Delete the named location in 🧩 Policy building blocks → Locations, once no policy uses it." },
    winscript: { title: "Create the Windows platform script (Business Premium route)", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All", "Group.ReadWrite.All"], role: "Intune Administrator", changes: ["POST an Intune platform script named by the CloudFellows convention (Win - PSH - Device Security - D - Install Global Secure Access Client - R… - v…; SYSTEM, 64-bit, file Install-GlobalSecureAccessClient.ps1) that downloads the client from aka.ms, installs it and sets the lock-down keys.", `Assign it to the device group you name — ${GROUPS.win} by default, created as an empty assigned security group when it does not exist and the tick is on.`], impact: "Every device in the group installs the Global Secure Access client at its next Intune check-in. Pilot settings (Learn's sample) hide sign-out and Disable Private Access but leave Disable visible; locked down, users cannot disable or sign out of the client. A platform script runs once and installs whatever version Microsoft serves then — it does not update the client.", recovery: "Remove the assignment or delete the script in Intune → Devices → Scripts; uninstall the client per device (Apps & features) if needed." },
    // 0.11.0 (Mihai 18 Oct, go build): the remediation that cannot run on a
    // Business Premium tenant hands its groups to the platform script; and a
    // platform can be taken out of step 6's scope, kept in the tenant
    winswap: { title: "Replace the Windows remediation with the platform script", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All"], role: "Intune Administrator", changes: ["Download a backup of the remediation's assignments first.", "POST an Intune platform script named by the CloudFellows convention (Win - PSH - Device Security - D - Install Global Secure Access Client - R… - v…; SYSTEM, 64-bit, file Install-GlobalSecureAccessClient.ps1) — a GSA platform script already in Intune is reused, never made a second time.", "Assign it to the remediation's groups, the script's own assignments kept.", "Only when that assignment has landed: remove the remediation's assignments. The remediation itself stays in Intune."], impact: "The devices in those groups get the client from the platform script at their next Intune Management Extension check-in. A platform script runs once per device, and again only when the script changes — a user who removes the client does not get it back the way a remediation puts it back. Nobody outside those groups is affected, and nothing that worked stops: the remediation could not run on this tenant's licence.", recovery: "Reassign the remediation from the backup (Intune → Scripts and remediations → Remediations → Assignments) and remove the platform script's assignments. The client stays installed where the script already ran." },
    "scope-win": { title: "Windows — in or out of step 6's scope", scopes: ["Organization.ReadWrite.All"], role: "Global Administrator, or another role that may update the organization", changes: [`Write the ENCA settings record — the open extension ${ENCA_EXT} on this tenant's organization object — with Windows out of scope (when, by whom and why) or back in scope. POST when the record is not there yet, else PATCH; the other settings in it are kept.`], impact: "Only ENCA reads this record: step 6 stops waiting for Windows devices, or waits for them again. Nothing changes for users, devices or policies — and a compliant-network policy that covers Windows sign-ins still blocks every Windows device without the client.", recovery: `Put Windows back in scope here — the same record. Or remove the record with Graph: DELETE /organization/{tenant id}/extensions/${ENCA_EXT}.` },
    "scope-mac": { title: "macOS — in or out of step 6's scope", scopes: ["Organization.ReadWrite.All"], role: "Global Administrator, or another role that may update the organization", changes: [`Write the ENCA settings record — the open extension ${ENCA_EXT} on this tenant's organization object — with macOS out of scope (when, by whom and why) or back in scope. POST when the record is not there yet, else PATCH; the other settings in it are kept.`], impact: "Only ENCA reads this record: step 6 stops waiting for Macs, or waits for them again. Nothing changes for users, devices or policies — and a compliant-network policy whose platforms include macOS still blocks every Mac without the client; leave macOS out of its platforms then.", recovery: `Put macOS back in scope here — the same record. Or remove the record with Graph: DELETE /organization/{tenant id}/extensions/${ENCA_EXT}.` },
  };


  if (T2) FIXES.trv2 = T2.FIX;

  // ---- demo -----------------------------------------------------------------
  function demo() {
    return {
      demo: true, readAt: Date.now(),
      skus: [{ skuPartNumber: "SPE_E3", prepaidUnits: { enabled: 220 }, consumedUnits: 214, servicePlans: [{ servicePlanName: "AAD_PREMIUM", servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d" }, { servicePlanName: "WIN10_PRO_ENT_SUB", servicePlanId: "21b439ba-a0ca-424f-a6cc-52f954a5b111" }] }],
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
      // 0.11.0: what GSA has seen (nothing yet) and the ENCA settings record (none)
      seen: { days: 7, since: new Date(Date.now() - 7 * 86400000).toISOString(), report: [], signIns: [], capped: false },
      encaSettings: null,
      // 0.7.0: cross-tenant access as a fresh tenant has it — no tenant
      // restrictions, one partner that inherits the default, enforcement off
      trv2: { default: { tenantRestrictions: null }, partners: [{ tenantId: "5f0c1a2b-0000-4000-8000-00000000d3e0", tenantRestrictions: null }], utr: { networkPacketTaggingStatus: "disabled" } },
      sources: { seenReport: "ok", seenSignins: "ok", encaSettings: "ok", trv2: "ok", ztna: "ok", skus: "ok", status: "ok", profile: "ok", signaling: "ok", locations: "ok", scripts: "ok", apps: "ok", shellScripts: "ok", healthScripts: "ok", macProfiles: "ok" },
    };
  }
  // 0.9.0: devcf as read on 17 Oct before the repairs — a v1.1-style script
  // without a signature check, the consolidated System Extensions policy
  // unassigned, the proxy as Learn, the client settings with the .plist slip
  // and a U name, and a group whose only member Intune no longer manages
  function demoMac() {
    const asg = [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-mac" } }];
    const v11 = ["#!/bin/zsh", "url=\"https://aka.ms/GlobalSecureAccess-macOS\"", "ver_gt() { :; }", "profiles show -type configuration -output stdout-xml | grep -q '<key>TransparentProxy</key>' || exit 1", "installer -pkg \"$pkg\" -target /"].join("\n");
    const xml = SET_KEYS.map((k) => `<key>${k}</key>\n<true/>`).join("\n");
    return {
      scripts: [{ id: "s-mac", displayName: "[OPTIONAL] MACOS - SH - Software Installation - D - Install Global Secure Access Client - R26.10 - v1.1", fileName: MAC_FILE, executionFrequency: "P7D", runAsAccount: "system", scriptContent: b64(v11), assignments: asg, runSummary: { successDeviceCount: 0, errorDeviceCount: 0 } }],
      policies: [{ id: "p-sx", name: "MACOS - DCP - Device Security - D - System Extensions - R26.10 - v1.0", description: "single system-extension allow-list", technologies: "mdm,appleRemoteManagement", roleScopeTagIds: ["0"], settings: macSysextSettings(), assignments: [] }],
      configs: [
        { "@odata.type": "#microsoft.graph.macOSCustomConfiguration", id: "c-px", displayName: "[OPTIONAL] MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - R26.10 - v3.0", payload: b64(macProxyPlist()), deploymentChannel: "deviceChannel", assignments: asg, overview: { successCount: 0, errorCount: 0, conflictCount: 0, pendingCount: 0 } },
        { "@odata.type": "#microsoft.graph.macOSCustomAppConfiguration", id: "c-st", displayName: "[OPTIONAL] MACOS - DCP - Device Configuration - U - GSA System settings - R26.10 - v3.1", bundleId: "com.microsoft.globalsecureaccess.plist", fileName: "Policies.plist", configurationXml: b64(xml), assignments: asg, overview: { successCount: 0, errorCount: 0, conflictCount: 0, pendingCount: 0 } }],
      groups: { "g-mac": { devices: 1, managedMacs: 0, users: 0, list: [{ deviceId: "dm-1", displayName: "BYO-VM-DEMO", operatingSystem: "MacMDM", trustType: "Workplace" }] } },
    };
  }
  // a demo CA policy that requires the compliant network, for ?demo=1 when
  // the demo set has none
  const demoPolicy = () => ({ raw: { id: "d-ca215", displayName: "CA215-BLOCK-Internals-CN-AllApps-WinMac-v1.0", state: "enabledForReportingButNotEnforced", conditions: { users: { includeGroups: ["g-internals"], excludeGroups: ["g-bg"], excludeRoles: [] }, applications: { includeApplications: ["All"], excludeApplications: [INTUNE_APP, INTUNE_ENROLL] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] }, platforms: { includePlatforms: ["windows", "macOS"] } }, grantControls: { operator: "OR", builtInControls: ["block"] } } });

  return { ENCA_EXT, SEEN_DAYS, MAC_CHECK_CMDS, scopeOut, scopeRecord, seenIndex, clientLanes, lanesHtml, CN_ID, WIN_ENT_PLANS, winLicence, winCheck, winTable, scopeCheck, verdict, MAC_PATHS: PATHS, macCheck, macFixPlan, macTable, bumpName, sysextAdd, sysextFacts, contentIssues, reach, demoMac, b64dec, preview, defaultSel, LANES, detectScript, remediationScript, remediationBody, remediationAssignment, ZTNA_CLIENT, isBacking, model, macProfiles, proof, render, windowsScript, windowsScriptBody, macScript, macScriptBody, macSysextBody, macSysextSettings, macProxyBody, macProxyPlist, macSettingsBody, macSettingsPlist, MAC_PROFILES, wantProfile, GSA_TEAM, GSA_EXTS, GSA_DOMAIN, FIXES, demo, demoPolicy, cnPolicies, intune, names, relTag, GROUPS, WIN_FILE, MAC_FILE, SCRIPT_NAME, LOCATION_NAME, INTUNE_APP, INTUNE_ENROLL };
})();
if (typeof module !== "undefined") module.exports = Gsa;
