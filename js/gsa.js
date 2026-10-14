// ======================================================================
// 🌐 Global Secure Access — T56, Workspace 03 · Entra Tools (beta 32516).
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
//   Gsa.render(model, ui)            → the board, the policy table, the proof, the groups
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
  const SCRIPT_NAME = "Global Secure Access Client (Windows) — ENCA";
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
        platforms: ((raw.conditions && raw.conditions.platforms && raw.conditions.platforms.includePlatforms) || []).join(", "),
      });
    }
    return out;
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
    L.push({ k: "tenant", lab: "Tenant", h: "Global Secure Access", st: unread("status") ? "unread" : onboarded ? "ok" : /InProgress/.test(st || "") ? "warn" : "bad", note: unread("status") ? `not read — ${src.status}` : onboarded ? "activated" : st ? st.replace(/([A-Z])/g, " $1").toLowerCase() + (raw.status.onboardingErrorMessage ? ` — ${raw.status.onboardingErrorMessage}` : "") : "not activated", fix: !onboarded && !unread("status") && !/InProgress/.test(st || "") ? "onboard" : null });
    // 3 profile
    const prof = raw.profile, pols = (prof && prof.policies) || [];
    const profOn = !!prof && prof.state === "enabled", polsOff = pols.filter((x) => x.state !== "enabled").length;
    const allUsers = !!raw.sp && raw.sp.appRoleAssignmentRequired === false;
    const groups = (raw.assigned || []).filter((a) => a.principalType === "Group"), users = (raw.assigned || []).filter((a) => a.principalType === "User");
    const assigned = allUsers || groups.length || users.length;
    const profSt = !onboarded ? "wait" : unread("profile") ? "unread" : !prof ? "bad" : profOn && !polsOff && assigned ? "ok" : profOn ? "warn" : "bad";
    L.push({ k: "profile", lab: "Traffic", h: "Microsoft profile", st: profSt,
      note: !onboarded ? "waits on the tenant" : unread("profile") ? `not read — ${src.profile}` : !prof ? "no Microsoft traffic profile returned" : `${profOn ? "enabled" : "disabled"}${polsOff ? ` · ${polsOff} of ${pols.length} traffic policies off` : ""} · ${allUsers ? "all users" : assigned ? `${groups.length} group${groups.length === 1 ? "" : "s"}${users.length ? `, ${users.length} user${users.length === 1 ? "" : "s"}` : ""} assigned` : "nobody assigned"}`,
      fix: onboarded && prof && (!profOn || polsOff) ? "profile" : null, fix2: onboarded && prof && raw.sp && !assigned ? "assign" : onboarded && prof && raw.sp && !allUsers ? "assign" : null });
    // 4 signalling
    const sig = raw.signaling && raw.signaling.signalingStatus === "enabled";
    L.push({ k: "signal", lab: "Signal", h: "CA signalling", st: !onboarded ? "wait" : unread("signaling") ? "unread" : sig ? "ok" : "bad", note: !onboarded ? "waits on the tenant" : unread("signaling") ? `not read — ${src.signaling}` : sig ? "enabled — source IP restored" : "disabled", fix: onboarded && !sig && !unread("signaling") ? "signal" : null, help: "Microsoft Learn calls it source IP restoration; the compliant network can only be targeted once it is on." });
    // 5 location
    const cn = (raw.locations || []).find(isCn) || null;
    L.push({ k: "location", lab: "Location", h: "Compliant network", st: unread("locations") ? "unread" : cn ? "ok" : sig ? "bad" : "wait", note: unread("locations") ? `not read — ${src.locations}` : cn ? `${cn.displayName}` : "not present — over Graph it is not made for you (the portal makes a second call); ENCA creates it", fix: !cn && !unread("locations") && sig ? "location" : null });
    // 6 client
    const winScript = (raw.scripts || []).find((s) => /global\s*secure\s*access/i.test(`${s.displayName} ${s.fileName}`)) || null;
    const winApp = (raw.apps || []).find((a) => /global\s*secure\s*access/i.test(a.displayName || "")) || null;
    const macScript = (raw.shellScripts || []).find((s) => /global\s*secure\s*access/i.test(`${s.displayName} ${s.fileName}`)) || null;
    const winOk = !!(winScript || winApp);
    L.push({ k: "client", lab: "Devices", h: "GSA client", st: unread("scripts") && unread("apps") ? "unread" : winOk ? (macScript ? "ok" : "warn") : "bad", note: [winScript ? `Windows: platform script ${winScript.displayName}` : winApp ? `Windows: app ${winApp.displayName}` : "Windows: no Intune script or app", macScript ? `macOS: ${macScript.displayName}` : "macOS: no shell script"].join(" · "), fix: !winScript ? "winscript" : null, winScript, winApp, macScript });
    // 7 policy
    const policies = cnPolicies(caPolicies, cn && cn.id);
    const on = policies.filter((p) => p.state === "enabled"), ro = policies.filter((p) => p.state === "enabledForReportingButNotEnforced");
    L.push({ k: "policy", lab: "Policy", h: policies.length ? policies.map((p) => (String(p.name).match(/\bCA\d{3,4}\b/) || [p.name])[0]).slice(0, 3).join(", ") : "No policy", st: !caPolicies ? "unread" : !policies.length ? (cn ? "bad" : "wait") : on.length ? "ok" : ro.length ? "warn" : "bad", note: !caPolicies ? "load 🗂 Policies first" : !policies.length ? "no Conditional Access policy names the compliant network" : `${on.length} on · ${ro.length} report-only · ${policies.length - on.length - ro.length} off`, open: policies.length ? policies[0].id : null });
    // 8 proof — filled by proof(); the board shows it when read
    L.push({ k: "proof", lab: "Proof", h: "Sign-ins via GSA", st: "wait", note: "not read — 📈 Read the proof (7 days)" });

    // the groups Global Secure Access leans on: on the profile, and in the
    // policies that require the compliant network (include side only — an
    // exclusion is a group the policy does NOT reach)
    const gIds = new Map();
    groups.forEach((g) => gIds.set(g.principalId, { id: g.principalId, name: g.principalDisplayName || (raw.groupNames || {})[g.principalId] || g.principalId, why: "assigned on the Microsoft traffic profile" }));
    policies.forEach((p) => p.includeGroups.forEach((id) => { if (!gIds.has(id)) gIds.set(id, { id, name: (raw.groupNames || {})[id] || id, why: `included by ${p.name}` }); }));

    const ready = L.filter((l) => l.st === "ok").length;
    const firstBad = L.find((l) => l.st === "bad" || l.st === "warn");
    return { links: L, ready, total: L.length, verdict: verdict(L, policies), next: firstBad || null, policies, cn, allUsers, groups: [...gIds.values()], groupIds: [...gIds.keys()], sp: raw.sp || null, profile: prof, readAt: raw.readAt || null, demo: !!raw.demo };
  }
  function verdict(L, policies) {
    const by = Object.fromEntries(L.map((l) => [l.k, l]));
    if (by.policy.st === "ok" && ["tenant", "profile", "signal", "location"].every((k) => by[k].st === "ok")) return { cls: "ok", h: "A stolen token no longer works outside the compliant network", p: "The chain is complete and at least one policy that requires the compliant network is on. Watch the proof for sign-ins it blocks that should not be blocked — a device without the client, an IPv6 path around the tunnel." };
    if (!policies.length) return { cls: "bad", h: "A stolen token still works from anywhere", p: "No Conditional Access policy requires the compliant network yet. Build the chain below first, then a block-outside-the-compliant-network policy in report-only." };
    return { cls: "bad", h: "A stolen token still works from anywhere", p: `${policies.map((p) => p.name).slice(0, 2).join(", ")} ${policies.some((p) => p.state === "enabled") ? "is on, but a link before it is missing — the compliant network cannot be satisfied, so it blocks people instead of tokens" : "is not on"}. Next: ${(L.find((l) => l.st === "bad" || l.st === "warn") || L[0]).h}.` };
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
  const ST = { ok: ["ok", "ready"], warn: ["warn", "partly"], bad: ["bad", "missing"], wait: ["wait", "waits"], unread: ["wait", "not read"] };
  const FIX_LABEL = { onboard: "Activate…", profile: "Enable profile…", assign: "Assign…", signal: "Enable…", location: "Create…", winscript: "Create Windows script…" };
  function render(m, ui) {
    const u = ui || {};
    if (u.proof) proofLink(m, u.proof);
    const meter = m.links.map((l) => `<i class="${l.st === "ok" ? "ok" : l.st === "warn" ? "warn" : ""}"></i>`).join("");
    const head = `<section class="gsa-verdict ${m.verdict.cls}"><div class="gsa-big" aria-hidden="true">${m.verdict.cls === "ok" ? "✓" : "⚠"}</div><div><h3>${esc(m.verdict.h)}</h3><p>${esc(m.verdict.p)}</p></div><div><div class="gsa-meter" aria-label="${m.ready} of ${m.total} links ready">${meter}</div><div class="mini" style="margin-top:4px">${m.ready} of ${m.total} links ready</div></div></section>`;
    const card = (l) => {
      const [cls, word] = ST[l.st] || ST.wait;
      const acts = [];
      if (l.fix) acts.push(`<button class="btn sm${l.st === "bad" ? " primary" : ""}" data-gsafix="${l.fix}">${esc(FIX_LABEL[l.fix])}</button>`);
      if (l.fix2 && l.fix2 !== l.fix) acts.push(`<button class="btn sm" data-gsafix="${l.fix2}">${esc(FIX_LABEL[l.fix2])}</button>`);
      if (l.k === "client") acts.push(`<button class="btn sm" data-gsadl="mac" title="The macOS shell script; the system extension, transparent proxy and client settings profiles stay by hand">⬇ macOS script</button>`);
      if (l.k === "policy" && l.open) acts.push(`<button class="btn sm" data-gsaopen="${esc(l.open)}">Open in Policies</button>`);
      if (l.k === "proof") acts.push(`<button class="btn sm" data-gsaproof>📈 Read the proof (7 days)</button>`);
      return `<div class="gsa-link ${cls}" role="listitem"><span class="gsa-lab">${esc(l.lab)}</span><h4>${esc(l.h)}</h4><span class="gsa-st ${cls}">${esc(word)}</span><p class="mini">${esc(l.note)}</p>${l.help ? `<p class="mini muted">${esc(l.help)}</p>` : ""}${acts.length ? `<div class="gsa-act">${acts.join("")}</div>` : ""}</div>`;
    };
    const board = `<div class="gsa-chain" role="list" aria-label="The chain">${m.links.map(card).join("")}</div>`;
    const fix = u.fixHtml ? `<div class="gsa-fix" id="gsaFixPanel">${u.fixHtml}</div>` : "";
    const yes = (b) => b ? '<span class="gsa-st ok">out</span>' : '<span class="gsa-st warn">not out</span>';
    const polRows = m.policies.map((p) => `<tr><td><a href="#" data-gsaopen="${esc(p.id)}"><b>${esc(p.name)}</b></a><div class="mini muted">${esc(p.shape)}${p.platforms ? ` · ${esc(p.platforms)}` : ""}</div></td><td><span class="gsa-st ${p.state === "enabled" ? "ok" : p.state === "enabledForReportingButNotEnforced" ? "warn" : "wait"}">${p.state === "enabled" ? "on" : p.state === "enabledForReportingButNotEnforced" ? "report-only" : "off"}</span></td><td class="mini">${p.allUsers ? "All users" : `${p.includeGroups.length} group${p.includeGroups.length === 1 ? "" : "s"}`}${p.excludeGroups.length ? ` · ${p.excludeGroups.length} excluded` : ""}</td><td class="mini">Intune ${yes(p.intuneOut)} · Enrollment ${yes(p.enrollOut)} · ${p.excludeRoles.length ? `${p.excludeRoles.length} admin role${p.excludeRoles.length === 1 ? "" : "s"} excluded` : "no admin role excluded"}</td>${u.proof ? `<td class="mini">${(() => { const x = u.proof.per[p.id]; return x ? `${x.wouldBlock + x.blocked} block (${x.usersBlock} users) · ${x.wouldPass + x.passed} pass` : "no sign-in evaluated"; })()}</td>` : ""}</tr>`).join("");
    const polTable = `<section class="list-card gsa-sect"><h3>Policies that name the compliant network</h3>${m.policies.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Policy</th><th>State</th><th>Covers</th><th>Checks</th>${u.proof ? "<th>7 days</th>" : ""}</tr></thead><tbody>${polRows}</tbody></table></div>` : '<p class="mini">None yet. ENCA does not make this policy here: build it in 🧩 Policy building blocks → 🏗 Builder (block, any location except the compliant network, report-only) once links 1–6 are ready.</p>'}<p class="mini muted">Read from the policies ENCA already holds. This tool leaves the policies as they are — their state and their exclusions are changed in 🗂 Policies or 🎚 Set policy state. Without the Microsoft Intune and Intune Enrollment apps out, a new device cannot enrol to receive the client. Excluded admin roles are reported, not changed: see the admin handover.</p></section>`;
    const grpRows = m.groups.map((g) => `<tr><td><b>${esc(g.name)}</b><div class="mini muted">${esc(g.id)}</div></td><td class="mini">${esc(g.why)}</td></tr>`).join("");
    const grpTable = `<section class="list-card gsa-sect"><h3>Groups Global Secure Access uses <span class="mini muted">· ${m.allUsers ? "the profile is on for all users" : `${m.groups.length}`}</span></h3>${m.groups.length ? `<div class="gu-tw"><table class="plist"><thead><tr><th>Group</th><th>Why</th></tr></thead><tbody>${grpRows}</tbody></table></div><p class="mini muted">The same list is the <b>Used by GSA</b> scope of 👥 Groups (T12). <button class="btn sm" data-gsagroups>Open in Groups</button></p>` : '<p class="mini">No group yet — assign a pilot group to the profile, or a compliant-network policy that includes a group.</p>'}</section>`;
    const proofSect = u.proof ? `<section class="list-card gsa-sect"><h3>Sign-ins, last 7 days</h3><p class="mini">${u.proof.total} sign-ins read${u.proof.capped ? " (the first 5,000)" : ""} · ${u.proof.viaGsa} through Global Secure Access.</p><p class="mini muted">A sign-in a report-only policy would block is one that did not come through the client — a device without it, the client paused, or an IPv6 path around the tunnel (the client tunnels IPv4 only). Switch the policy on when this is near zero; this tool does not do that for you.</p></section>` : u.proofBusy ? `<section class="list-card gsa-sect"><p class="mini">Reading the sign-in log…</p></section>` : "";
    const later = `<p class="mini muted gsa-later">🌐 This tool covers the <b>Microsoft traffic profile</b>. Internet Access and Private Access come later; their profiles and assignments will join this board and the Used by GSA scope.</p>`;
    return head + fix + board + `<div class="gsa-cols">${polTable}${grpTable}</div>` + proofSect + later;
  }

  // ---- the Intune platform script (Windows) -------------------------------
  // ENCA's own text, the same steps as Microsoft's client guidance: download
  // the client for the device's architecture from aka.ms, install it quietly,
  // and lock it down (the users-can't-disable keys). Prefer-IPv4 is optional
  // and off by default: it changes the network stack and needs a reboot.
  function windowsScript(opts) {
    const o = opts || {}, lock = o.lock === false ? 0 : 1;
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
      `foreach ($name in 'HideDisableButton', 'HideSignOutButton', 'HideDisablePrivateAccessButton', 'RestrictNonPrivilegedUsers') { Set-ItemProperty -Path $key -Name $name -Value ${lock} -Type DWord -Force }`,
      ...(o.ipv4 ? [
        "# Prefer IPv4: the client tunnels IPv4 only, so an IPv6 path to Entra goes around it. Takes effect after a reboot.",
        "$tcp6 = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters'",
        "Set-ItemProperty -Path $tcp6 -Name 'DisabledComponents' -Value 0x20 -Type DWord -Force",
      ] : []),
      "exit 0",
    ].join("\r\n");
  }
  // UTF-8 → base64, for scriptContent
  const b64 = (text) => { const bytes = new TextEncoder().encode(text); let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  function windowsScriptBody(opts) {
    return { "@odata.type": "#microsoft.graph.deviceManagementScript", displayName: SCRIPT_NAME, description: "Installs the Global Secure Access client and hides disable / sign-out for users. Created by ENCA T56.", fileName: "Install-GlobalSecureAccessClient.ps1", runAsAccount: "system", runAs32Bit: false, enforceSignatureCheck: false, scriptContent: b64(windowsScript(opts)) };
  }
  function macScript() {
    return [
      "#!/bin/bash",
      "# Global Secure Access client for macOS — install if missing. Written by ENCA T56.",
      "# Add it in Intune as a macOS shell script (run as root). The client also needs, by hand in Intune:",
      "#   a system extension policy (Team ID UBF8T346G9; com.microsoft.globalsecureaccess and .tunnel),",
      "#   a transparent proxy VPN profile (provider com.microsoft.globalsecureaccess.tunnel),",
      "#   and the client settings (HideDisableButton, HidePauseButton, HideQuitButton).",
      "[ -d \"/Applications/Global Secure Access Client.app\" ] && exit 0",
      "curl -L --fail --silent -o /tmp/GlobalSecureAccessClient.pkg \"https://aka.ms/GlobalSecureAccess-macOS\" || exit 1",
      "/usr/sbin/installer -pkg /tmp/GlobalSecureAccessClient.pkg -target / || exit 1",
      "rm -f /tmp/GlobalSecureAccessClient.pkg",
      "exit 0",
    ].join("\n");
  }

  // ---- the fixes, described before they run (impact and recovery first) ----
  const FIXES = {
    onboard: { title: "Activate Global Secure Access", scopes: ["NetworkAccessPolicy.ReadWrite.All", "NetworkAccess.ReadWrite.All"], role: "Global Secure Access Administrator", changes: ["POST /networkAccess/microsoft.graph.networkaccess.onboard, then read the tenant status every 15 seconds until it says onboarded (up to five minutes)."], impact: "Activation moves no traffic and affects nobody by itself — traffic only moves once a profile is on, assigned and a client runs on the device.", recovery: "Offboarding is done in the Entra admin center (Global Secure Access → Settings); nothing else here depends on it yet." },
    profile: { title: "Enable the Microsoft traffic profile", scopes: ["NetworkAccess.ReadWrite.All"], role: "Global Secure Access Administrator", changes: ["PATCH the Microsoft traffic profile: state enabled.", "PATCH every traffic policy of the profile that is not enabled: state enabled."], impact: "Devices of ASSIGNED users that run the client start sending Microsoft 365 and Entra traffic through Global Secure Access. Nobody without an assignment or a client is affected.", recovery: "Set the profile back to disabled in Global Secure Access → Connect → Traffic forwarding (or here, after a re-read); traffic falls back to direct." },
    assign: { title: "Assign the Microsoft traffic profile", scopes: ["AppRoleAssignment.ReadWrite.All", "Application.ReadWrite.All"], role: "Application Administrator", changes: ["Pilot group (recommended): add the group to the profile's enterprise app (an app role assignment on its service principal).", "Or all users: set appRoleAssignmentRequired to false on that service principal — the CyberDrain route."], impact: "The assigned users' client starts tunnelling Microsoft traffic. A compliant-network policy will then pass them; anybody not assigned keeps failing it.", recovery: "Remove the assignment (Enterprise applications → the profile's app → Users and groups), or set Assignment required back to Yes." },
    signal: { title: "Enable Conditional Access signalling", scopes: ["NetworkAccess.ReadWrite.All"], role: "Global Secure Access Administrator", changes: ["PATCH /networkAccess/settings/conditionalAccess: signalingStatus enabled."], impact: "Entra sees the user's real source IP for traffic through the tunnel and can evaluate the compliant network. Named-location policies on IP ranges start seeing the original IP for those sign-ins.", recovery: "Disable it again in Global Secure Access → Settings → Session management; a policy that requires the compliant network then fails everyone." },
    location: { title: `Create “${LOCATION_NAME}”`, scopes: ["Policy.ReadWrite.ConditionalAccess"], role: "Conditional Access Administrator", changes: [`POST a compliantNetworkNamedLocation “${LOCATION_NAME}” (allTenantCompliantNetworks, not trusted).`], impact: "None until a policy names it.", recovery: "Delete the named location in 🧩 Policy building blocks → Locations, once no policy uses it." },
    winscript: { title: "Create the Windows platform script", scopes: ["DeviceManagementConfiguration.ReadWrite.All", "DeviceManagementScripts.ReadWrite.All"], role: "Intune Administrator", changes: [`POST an Intune platform script “${SCRIPT_NAME}” (SYSTEM, 64-bit) that downloads the client from aka.ms, installs it and sets the lock-down keys.`, "Assign it to the pilot device group you name."], impact: "Every device in the group installs the Global Secure Access client at its next Intune check-in. With the lock-down on, users cannot disable or sign out of the client. A platform script runs once and installs whatever version Microsoft serves then — it does not update the client.", recovery: "Remove the assignment or delete the script in Intune → Devices → Scripts; uninstall the client per device (Apps & features) if needed." },
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
      scripts: [], apps: [], shellScripts: [],
      groupNames: { "g-gsa-pilot": "GSA-SEC-U-M365Profile-Pilot" },
      sources: { skus: "ok", status: "ok", profile: "ok", signaling: "ok", locations: "ok", scripts: "ok", apps: "ok", shellScripts: "ok" },
    };
  }
  // a demo CA policy that requires the compliant network, for ?demo=1 when
  // the demo set has none
  const demoPolicy = () => ({ raw: { id: "d-ca215", displayName: "CA215-BLOCK-Internals-CN-AllApps-WinMac-v1.0", state: "enabledForReportingButNotEnforced", conditions: { users: { includeGroups: ["g-internals"], excludeGroups: ["g-bg"], excludeRoles: [] }, applications: { includeApplications: ["All"], excludeApplications: [INTUNE_APP, INTUNE_ENROLL] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] }, platforms: { includePlatforms: ["windows", "macOS"] } }, grantControls: { operator: "OR", builtInControls: ["block"] } } });

  return { model, proof, render, windowsScript, windowsScriptBody, macScript, FIXES, demo, demoPolicy, cnPolicies, SCRIPT_NAME, LOCATION_NAME, INTUNE_APP, INTUNE_ENROLL };
})();
if (typeof module !== "undefined") module.exports = Gsa;
