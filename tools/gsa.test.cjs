// T56 🌐 Global Secure Access — js/gsa.js (pure). node --test tools/gsa.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const Gsa = require("../js/gsa.js");

const policy = (o) => ({ raw: Object.assign({ id: "p1", displayName: "CA215-BLOCK-Internals-CN", state: "enabledForReportingButNotEnforced", conditions: { users: { includeGroups: ["g-int"], excludeGroups: ["g-bg"] }, applications: { includeApplications: ["All"], excludeApplications: [Gsa.INTUNE_APP] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } }, grantControls: { builtInControls: ["block"] } }, o || {}) });

test("demo: the chain reads, the profile is partly on, the groups are the profile's and the policy's", () => {
  const m = Gsa.model(Gsa.demo(), [policy()]);
  assert.strictEqual(m.links.length, 8);
  const by = Object.fromEntries(m.links.map((l) => [l.k, l]));
  assert.strictEqual(by.licence.st, "ok");
  assert.strictEqual(by.tenant.st, "ok", "32521: a missing ZTNA Policy Service Client is information, not a warning");
  assert.match(by.tenant.sub, /^Info:/);
  assert.strictEqual(by.tenant.fix2, "ztnasp");
  assert.strictEqual(by.profile.st, "warn", "one traffic policy is off");
  assert.strictEqual(by.profile.fix, "profile");
  assert.strictEqual(by.location.st, "ok");
  assert.strictEqual(by.client.st, "bad");
  assert.strictEqual(by.client.fix, "winrem", "32520: the Windows client is a remediation");
  assert.strictEqual(by.client.fix2, "macscript");
  assert.match(by.client.sub, /system extensions NOT ASSIGNED/, "devcf: the system extension policy has no assignment");
  assert.strictEqual(by.policy.st, "warn", "report-only");
  assert.deepStrictEqual(m.groupIds.sort(), ["g-gsa-pilot", "g-int"]);
  assert.ok(!m.groupIds.includes("g-bg"), "an excluded group is not a group GSA uses");
});

test("not onboarded: every link after the tenant waits, and the fix is activation", () => {
  const raw = Object.assign(Gsa.demo(), { status: { onboardingStatus: "offboarded" }, profile: null, signaling: null, locations: [] });
  const m = Gsa.model(raw, []);
  const by = Object.fromEntries(m.links.map((l) => [l.k, l]));
  assert.strictEqual(by.tenant.fix, "onboard");
  assert.strictEqual(by.profile.st, "wait");
  assert.strictEqual(by.signal.st, "wait");
  assert.strictEqual(by.location.fix, null, "no location before signalling");
  assert.strictEqual(m.verdict.cls, "bad");
});

test("cnPolicies: Intune and Enrollment exclusions and admin roles are reported, not judged away", () => {
  const ps = Gsa.cnPolicies([policy({ conditions: { users: { includeUsers: ["All"], excludeRoles: ["62e90394-69f5-4237-9190-012177145e10"] }, applications: { excludeApplications: [] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } } })], "loc-cn");
  assert.strictEqual(ps.length, 1);
  assert.strictEqual(ps[0].allUsers, true);
  assert.strictEqual(ps[0].intuneOut, false);
  assert.strictEqual(ps[0].excludeRoles.length, 1);
  assert.strictEqual(ps[0].shape, "block outside the compliant network");
  assert.strictEqual(Gsa.cnPolicies([policy()], "other-id").length, 0, "a policy naming another location is not one");
});

test("proof counts report-only results per policy and sign-ins through GSA", () => {
  const s = (r, gsa, u) => ({ userId: u, isThroughGlobalSecureAccess: gsa, appliedConditionalAccessPolicies: [{ id: "p1", result: r }] });
  const pr = Gsa.proof([s("reportOnlyFailure", false, "a"), s("reportOnlyFailure", false, "a"), s("reportOnlySuccess", true, "b"), s("notApplied", false, "c")], ["p1"]);
  assert.strictEqual(pr.total, 4);
  assert.strictEqual(pr.viaGsa, 1);
  assert.strictEqual(pr.per.p1.wouldBlock, 2);
  assert.strictEqual(pr.per.p1.usersBlock, 1);
  assert.strictEqual(pr.per.p1.wouldPass, 1);
});

test("the Windows script: both architectures, the lock-down keys, IPv4 only when asked", () => {
  const t = Gsa.windowsScript({});
  assert.match(t, /GlobalSecureAccess-WindowsOnArm/);
  assert.match(t, /GlobalSecureAccess-windows/);
  assert.match(t, /RestrictNonPrivilegedUsers/);
  assert.match(t, /-Value 1 -Type DWord/);
  assert.doesNotMatch(t, /DisabledComponents/);
  assert.match(Gsa.windowsScript({ ipv4: true, lock: false }), /DisabledComponents[\s\S]*0x20/);
  assert.match(Gsa.windowsScript({ lock: false }), /-Value 0 -Type DWord/);
  const b = Gsa.windowsScriptBody({});
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(Buffer.from(b.scriptContent, "base64").toString("utf8"), Gsa.windowsScript({}));
});

test("every fix names its impact and its way back before its commands", () => {
  for (const [k, f] of Object.entries(Gsa.FIXES)) {
    assert.ok(f.impact && f.recovery && f.changes.length && f.scopes.length, k);
  }
});

test("render: the board, the policy table and no HTML from tenant names unescaped", () => {
  const raw = Gsa.demo(); raw.assigned[0].principalDisplayName = "<script>x</script>";
  const html = Gsa.render(Gsa.model(raw, [policy()]), {});
  assert.match(html, /gsa-flow/);
  assert.match(html, /CA215-BLOCK-Internals-CN/);
  assert.doesNotMatch(html, /<script>x/);
});

test("names follow the CloudFellows Intune convention read from devcf", () => {
  const n = Gsa.names({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(n.win, "Win - PSH - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0");
  assert.strictEqual(n.mac, "MACOS - SH - Software Installation - D - Install Global Secure Access Client - R26.10 - v1.0");
  assert.strictEqual(Gsa.relTag(new Date(2026, 9, 14)), "R26.10");
  assert.strictEqual(Gsa.GROUPS.mac, "INT-SEC-D-GSA-MAC-M365");
  assert.match(Gsa.MAC_FILE, /^scr-app-1\d\d-.*\.zsh$/);
});

test("the macOS shell script body: root, weekly (0.9.0, v1.2), retries, the client installer from aka.ms", () => {
  const b = Gsa.macScriptBody({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(b["@odata.type"], "#microsoft.graph.deviceShellScript");
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(b.executionFrequency, "P7D", "0.9.0: weekly — v1.2 upgrades in place");
  assert.strictEqual(b.retryCount, 3);
  const t = Buffer.from(b.scriptContent, "base64").toString("utf8");
  assert.match(t, /^#!\/bin\/zsh/);
  assert.match(t, /aka\.ms\/GlobalSecureAccess-macOS/);
  assert.match(t, /installer -pkg/);
});

test("macProfiles recognises the devcf GSA profiles and their assignment", () => {
  const mp = Gsa.macProfiles(
    [{ id: "c1", name: "[OPTIONAL] MACOS - DCP - Device Configuration - D - Allow GSA System extensions- R26.6 - v3.0", assignments: [] }],
    [{ "@odata.type": "#microsoft.graph.macOSCustomConfiguration", id: "p1", displayName: "[OPTIONAL] MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - R26.6 - v3.0", assignments: [{ id: "a" }] },
     { "@odata.type": "#microsoft.graph.macOSCustomAppConfiguration", id: "s1", displayName: "[OPTIONAL] MACOS - DCP - Device Configuration - U - GSA System settings - R26.6 - v3.0", bundleId: "com.microsoft.globalsecureaccess.plist", assignments: [{ id: "b" }] }]);
  assert.strictEqual(mp.sysext.assigned, false);
  assert.strictEqual(mp.proxy.assigned, true);
  assert.strictEqual(mp.settings.assigned, true);
});

test("32518 from the LearnGraphAPI lab: pilot vs locked client settings, the backing group, the macOS guards", () => {
  const pilot = Gsa.windowsScript({});
  assert.match(pilot, /'HideDisableButton' -Value 0/);
  assert.match(pilot, /'HideSignOutButton' -Value 1/);
  assert.match(pilot, /'RestrictNonPrivilegedUsers' -Value 0/);
  const locked = Gsa.windowsScript({ lock: true });
  assert.match(locked, /'HideDisableButton' -Value 1/);
  assert.match(locked, /'RestrictNonPrivilegedUsers' -Value 1/);
  assert.ok(Gsa.isBacking("_GSA_2ec642ab-1111-2222-3333-444455556666"));
  assert.ok(!Gsa.isBacking("INT-SEC-D-GSA-MAC-M365"));
  const raw = Gsa.demo(); raw.assigned.push({ principalId: "g-back", principalType: "Group", principalDisplayName: "_GSA_2ec642ab-1111" });
  const g = Gsa.model(raw, []).groups.find((x) => x.id === "g-back");
  assert.ok(g.backing && /do not use/.test(g.why));
  const mac = Gsa.macScript();
  assert.match(mac, /pkgutil --check-signature/);
  assert.match(mac, /minmajor=14/);
  assert.match(mac, /\/Applications\/GlobalSecureAccessClient/);
  const raw2 = Gsa.demo(); raw2.ztna = [{ id: "sp", appId: Gsa.ZTNA_CLIENT }];
  assert.strictEqual(Gsa.model(raw2, []).links.find((l) => l.k === "tenant").st, "ok");
});

test("32520 the Windows remediation: detect, if there, else deploy", () => {
  const d = Gsa.detectScript({});
  assert.match(d, /DisplayName -like 'Global Secure Access Client\*'/);
  assert.match(d, /exit 1/);
  assert.match(d, /exit 0/);
  const r = Gsa.remediationScript({ lock: true });
  assert.match(r, /if \(-not \$app\)/, "installs only when missing");
  assert.match(r, /Architecture -eq 12/);
  assert.match(r, /GlobalSecureAccess-WindowsOnArm/);
  assert.match(r, /Tls12/);
  assert.match(r, /'RestrictNonPrivilegedUsers' -Value|RestrictNonPrivilegedUsers = 1/);
  assert.doesNotMatch(r, /Restart-Computer|shutdown/i, "a remediation never restarts");
  assert.doesNotMatch(Gsa.remediationScript({}), /DisabledComponents/);
  assert.match(Gsa.remediationScript({ ipv4: true }), /DisabledComponents -Value 0x20/);
  const b = Gsa.remediationBody({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(b.displayName, "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0");
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(b.runAs32Bit, false);
  assert.strictEqual(Buffer.from(b.detectionScriptContent, "base64").toString("utf8"), Gsa.detectScript({ rel: "R26.10", ver: "v1.0" }));
  const a = Gsa.remediationAssignment("g1", "hourly");
  assert.strictEqual(a.runRemediationScript, true);
  assert.match(a.runSchedule["@odata.type"], /Hourly/);
  assert.match(Gsa.remediationAssignment("g1").runSchedule["@odata.type"], /Daily/);
  const raw = Gsa.demo(); raw.healthScripts = [{ id: "h", displayName: b.displayName, assigned: true, runSummary: { noIssueDetectedDeviceCount: 3, issueRemediatedDeviceCount: 1 } }];
  const c = Gsa.model(raw, []).links.find((l) => l.k === "client");
  // 32708: judged by reach and landing — the note says what landed
  assert.match(c.note, /4 with the client · 0 failing/);
  assert.strictEqual(c.fix, null);
  raw.healthScripts[0].assigned = false;
  assert.strictEqual(Gsa.model(raw, []).links.find((l) => l.k === "client").fix, "winrem", "an unassigned remediation offers the fix again");
});

test("32522: the policy card lists every policy that names the compliant network, both sides, with grant; off is off, not missing", () => {
  const on = policy({ id: "p2", displayName: "CA216-REQ-Admins-OnCN", state: "enabled", conditions: { users: { includeGroups: ["g-adm"] }, applications: { includeApplications: ["All"] }, locations: { includeLocations: ["AllCompliantNetworkLocations"] } }, grantControls: { operator: "AND", builtInControls: ["mfa", "compliantDevice"] } });
  const off = policy({ id: "p3", displayName: "CA217-BLOCK-Guests-CN", state: "disabled" });
  const other = policy({ id: "p4", displayName: "CA001-no-cn", conditions: { users: {}, applications: {}, locations: { includeLocations: ["All"], excludeLocations: ["AllTrusted"] } } });
  const m = Gsa.model(Gsa.demo(), [policy(), on, off, other]);
  assert.deepStrictEqual(m.policies.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.strictEqual(m.policies[0].cnSide, "excluded");
  assert.strictEqual(m.policies[1].cnSide, "included");
  assert.strictEqual(m.policies[1].grant, "mfa AND compliantDevice");
  const l = m.links.find((x) => x.k === "policy");
  // 32708 (B1): only the guarding policies count — p2 requires MFA ON the
  // compliant network and blocks nothing outside it
  assert.strictEqual(l.h, "2 policies");
  assert.deepStrictEqual(m.guards.map((p) => p.id), ["p1", "p3"]);
  assert.match(l.note, /1 other policy names it without blocking everything outside it — not counted/);
  const html = Gsa.render(m, {});
  ["CA215-BLOCK-Internals-CN", "CA216-REQ-Admins-OnCN", "CA217-BLOCK-Guests-CN"].forEach((n) => assert.ok(html.includes(n), n));
  assert.ok(!html.includes("CA001-no-cn"));
  assert.match(html, /3 found · 1 on · 1 report-only · 1 off/);
  assert.match(html, /not counted — it does not block sign-ins outside the compliant network/);
  const m2 = Gsa.model(Gsa.demo(), [off]);
  assert.strictEqual(m2.links.find((x) => x.k === "policy").word, "off");
  assert.match(Gsa.render(m2, {}), /gsa-nv">off</, "32524: the node says off");
  assert.match(Gsa.render(m2, { sel: "policy" }), /gsa-st bad">off</, "and so does the step when opened");
  assert.match(Gsa.render(Gsa.model(Gsa.demo(), null), {}), /policies not loaded/);
});

test("32523: the Intune card lists every GSA remediation, script and macOS profile, where it is, who made it, whom it is assigned to; duplicates and two Windows routes flagged", () => {
  const raw = Gsa.demo();
  const g = (id) => ({ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: id } });
  const mac = "MACOS - SH - Software Installation - D - Install Global Secure Access Client - R26.10 - v1.0";
  raw.shellScripts = [{ id: "s1", displayName: mac, description: "… Created by ENCA T56.", assignments: [g("g-mac")] }, { id: "s2", displayName: mac, description: "Created by ENCA T56.", assignments: [] }, { id: "s3", displayName: "MACOS - SH - Other app", assignments: [] }];
  raw.healthScripts = [{ id: "h1", displayName: "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", publisher: "ENCA", assignments: [g("g-win"), { target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: "g-bg" } }] }];
  raw.scripts = [{ id: "w1", displayName: "Win - PSH - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", assignments: [{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }] }];
  raw.groupNames = Object.assign({}, raw.groupNames, { "g-mac": "INT-SEC-D-GSA-MAC-M365", "g-win": "INT-SEC-D-GSA-WIN-M365", "g-bg": "CAB-SEC-U-BreakGlass" });
  const iv = Gsa.intune(raw);
  assert.strictEqual(iv.rows.length, 7, "1 remediation, 1 platform script, 2 shell scripts, 3 profiles; the other app script is not GSA");
  const rem = iv.rows.find((r) => r.id === "h1");
  assert.strictEqual(rem.by, "ENCA T56");
  assert.deepStrictEqual(rem.t, { inc: ["INT-SEC-D-GSA-WIN-M365"], exc: ["CAB-SEC-U-BreakGlass"] });
  assert.match(rem.where, /Remediations$/);
  assert.deepStrictEqual(iv.rows.find((r) => r.id === "w1").t.inc, ["All devices"]);
  assert.ok(iv.rows.filter((r) => r.os === "macOS" && /Shell/.test(r.kind)).every((r) => r.dup));
  assert.strictEqual(iv.rows.find((r) => r.id === "s2").assigned, false);
  assert.ok(iv.winBoth);
  assert.strictEqual(iv.rows.filter((r) => /Profile/.test(r.kind)).length, 3);
  assert.deepStrictEqual(iv.missingProfiles, []);
  const html = Gsa.render(Gsa.model(raw, []), {});
  assert.match(html, /Intune policies and scripts for the client <span class="mini muted">· 7 found/);
  assert.match(html, /duplicate/);
  assert.match(html, /more than one kind of deployment/);
  raw.sources = Object.assign({}, raw.sources, { macProfiles: "403 Forbidden" });
  assert.match(Gsa.intune(raw).unread[0], /Profile: not read — 403/);
});

test("32524: the flow — eight steps in five lanes, the first that blocks opens, a chosen step opens, workspaces stack under the detail", () => {
  const m = Gsa.model(Gsa.demo(), [policy()]);
  assert.deepStrictEqual(Gsa.LANES.flatMap((l) => l[1]), m.links.map((l) => l.k), "the lanes cover every link once, in chain order");
  assert.strictEqual(Gsa.defaultSel(m), "profile", "demo: the profile is partly on — the first that blocks");
  const html = Gsa.render(m, {});
  assert.strictEqual((html.match(/data-gsasel="/g) || []).length, 8 + 2 + 3, "eight nodes, the two step buttons, and the three step links of the reach card (0.9.1)");
  assert.match(html, /class="gsa-node warn sel" data-gsasel="profile"/);
  assert.match(html, /id="gsaDetail"/);
  assert.match(html, /Step 3 of 8/);
  assert.doesNotMatch(html, /id="gsaWork"/, "no workspace until a fix is opened");
  const h2 = Gsa.render(m, { sel: "client", work: ["<section class=\"gsa-wpanel\" data-gsaw=\"winrem\">A</section>", "<section class=\"gsa-wpanel\" data-gsaw=\"macscript\">B</section>"] });
  assert.match(h2, /class="gsa-node bad sel" data-gsasel="client"/);
  assert.match(h2, /data-gsafix="winrem"/);
  assert.match(h2, /data-gsafix="macscript"/);
  assert.match(h2, /2 open · newest first/);
  const order = ['class="list-card gsa-flow"', 'id="gsaDetail"', 'id="gsaWork"', 'id="gsaPols"', 'id="gsaIntune"'].map((k) => h2.indexOf(k));
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, "flow, then the step, then the workspaces, then the cards");
  assert.strictEqual(Gsa.render(m, { sel: "nope" }).includes('class="gsa-node warn sel" data-gsasel="profile"'), true, "an unknown step falls back to the first that blocks");
});

test("32524: preview — each fix shows what it sends; scripts are the uploaded text", () => {
  const o = { rel: "R26.10", ver: "v1.0", lock: true, devGroup: "INT-SEC-D-GSA-WIN-M365" };
  const rem = Gsa.preview("winrem", o);
  assert.deepStrictEqual(rem.map((t) => t.id), ["det", "rem", "req"]);
  assert.strictEqual(rem[0].text, Gsa.detectScript(o));
  assert.strictEqual(rem[1].text, Gsa.remediationScript(o));
  assert.match(rem[2].text, /"runRemediationScript": true/);
  assert.strictEqual(Gsa.preview("macscript", o)[0].text, Gsa.macScript());
  assert.match(Gsa.preview("ztnasp")[0].text, new RegExp(Gsa.ZTNA_CLIENT));
  assert.match(Gsa.preview("assign", { allUsers: true })[0].text, /appRoleAssignmentRequired": false/);
  for (const k of Object.keys(Gsa.FIXES).filter((x) => !/^macfix-/.test(x))) assert.ok(Gsa.preview(k, {}).length, `${k} has a preview`);  // macfix-* need the chain (0.9.0 test)
});

test("32524/32525 devcf (read 14 Oct, every link live): the chain as the board shows it; runRemediationScript false is no signal", () => {
  const raw = require("./fixtures/gsa-devcf-20261014.json");
  raw.macProfiles = Gsa.macProfiles(raw._macPolicies, raw._macConfigs);
  const m = Gsa.model(raw, raw._ca);
  const st = Object.fromEntries(m.links.map((l) => [l.k, l.st]));
  // 32708 (B3): the remediation was assigned but had not run on any device —
  // step 6 is partly, not ready
  assert.deepStrictEqual(st, { licence: "ok", tenant: "ok", profile: "ok", signal: "ok", location: "ok", client: "warn", policy: "bad", proof: "wait" });
  assert.strictEqual(m.links.find((l) => l.k === "licence").note, "4 of 4 used");
  assert.match(m.links.find((l) => l.k === "profile").note, /enabled · 1 group assigned/);
  assert.strictEqual(raw.healthScripts[0].assignments[0].runRemediationScript, false, "what Graph returns — the portal shows remediation on");
  // 0.11.0: devcf holds no Windows Enterprise licence — the remediation cannot run, so the lane offers
  // the platform script; the detect-only reading is still no signal (no fix is offered BECAUSE of it)
  assert.strictEqual(m.links.find((l) => l.k === "client").fix, "winswap");
  assert.doesNotMatch(m.links.find((l) => l.k === "client").note, /DETECT ONLY/);
  assert.match(m.verdict.p, /Blocked at step 6 — GSA client/);
  assert.strictEqual(Gsa.defaultSel(m), "client");
  assert.ok(m.groups.some((g) => g.name === "GSA-SEC-U-M365-ALL-PILOT"));
});

test("0.6.3: Read the proof says it is reading, how far, and answers in the step", () => {
  const m = () => Gsa.model(Gsa.demo(), [policy()]);
  const busy = Gsa.render(m(), { sel: "proof", proofBusy: true, proofRead: 1998 });
  assert.match(busy, /data-gsaproof disabled aria-busy="true">⏳ Reading… 1,998 sign-ins/);
  const pr = Gsa.proof([{ userId: "u1", isThroughGlobalSecureAccess: true, appliedConditionalAccessPolicies: [{ id: "p1", result: "reportOnlySuccess" }] }, { userId: "u2", appliedConditionalAccessPolicies: [{ id: "p1", result: "reportOnlyFailure" }] }], ["p1"]);
  const done = Gsa.render(m(), { sel: "proof", proof: pr });
  assert.match(done, /↻ Read again \(7 days\)/);
  assert.match(done, /read 2 sign-ins · 2 in the policies(?:&#39;|') scope, 1 of them through Global Secure Access/);
  assert.match(done, /data-gsajump="gsaPols">Show per policy/);
  const err = Gsa.render(m(), { sel: "proof", proofErr: "AuditLog.Read.All was not granted" });
  assert.match(err, /The read stopped[\s\S]*AuditLog\.Read\.All was not granted/);
});

test("0.8.0 (32703): the three macOS profiles come with the script — Learn's shapes, the fix choice, a consolidated baseline policy", () => {
  const o = { rel: "R26.10", ver: "v1.0" };
  // names: devcf's, without [OPTIONAL]
  assert.strictEqual(Gsa.names(o).sysext, "MACOS - DCP - Device Configuration - D - Allow GSA System Extensions - R26.10 - v1.0");
  assert.strictEqual(Gsa.names(o).proxy, "MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - R26.10 - v1.0");
  assert.strictEqual(Gsa.names(o).settings, "MACOS - DCP - Device Configuration - D - GSA System settings - R26.10 - v1.0", "0.9.0: D — a device payload");
  // system extensions: settings catalog, both bundle ids under Microsoft's team, user overrides allowed (devcf's own shape)
  const sx = Gsa.macSysextBody(o);
  assert.strictEqual(sx.platforms, "macOS"); assert.strictEqual(sx.technologies, "mdm,appleRemoteManagement");
  const flat = JSON.stringify(sx.settings);
  for (const id of ["com.microsoft.globalsecureaccess.tunnel", "com.microsoft.globalsecureaccess", "UBF8T346G9", "com.apple.system-extension-policy_allowuseroverrides_true", "com.apple.system-extension-policy_allowedsystemextensions_generickey_keytobereplaced"]) assert.ok(flat.includes(id), id);
  assert.match(sx.description, /Created by ENCA T56/);
  // transparent proxy: Learn's plist verbatim, device channel
  const px = Gsa.macProxyBody(o), plist = Buffer.from(px.payload, "base64").toString("utf8");
  assert.strictEqual(px["@odata.type"], "#microsoft.graph.macOSCustomConfiguration");
  assert.strictEqual(px.deploymentChannel, "deviceChannel");
  assert.strictEqual(plist, Gsa.macProxyPlist());
  assert.match(plist, /<key>VPNType<\/key>\n\s*<string>TransparentProxy<\/string>/);
  assert.match(plist, /ProviderBundleIdentifier<\/key>\n\s*<string>com\.microsoft\.globalsecureaccess\.tunnel</);
  assert.match(plist, /certificate leaf\[subject\.OU\] = UBF8T346G9/);
  assert.match(plist, /<key>RemoteAddress<\/key>\n\s*<string>100\.64\.0\.0</);
  // client settings: preference file for the Learn domain; pilot sample by default, lock = all four hidden
  const st = Gsa.macSettingsBody(o), pilot = Buffer.from(st.configurationXml, "base64").toString("utf8");
  assert.strictEqual(st["@odata.type"], "#microsoft.graph.macOSCustomAppConfiguration");
  assert.strictEqual(st.bundleId, "com.microsoft.globalsecureaccess", "Learn's domain, not devcf's …globalsecureaccess.plist");
  assert.match(pilot, /HidePauseButton<\/key>\n<false\/>/); assert.match(pilot, /HideDisableButton<\/key>\n<false\/>/);
  assert.match(pilot, /HideQuitButton<\/key>\n<true\/>/); assert.match(pilot, /HideDisablePrivateAccessButton<\/key>\n<true\/>/);
  const locked = Buffer.from(Gsa.macSettingsBody({ rel: "R26.10", lock: true }).configurationXml, "base64").toString("utf8");
  assert.doesNotMatch(locked, /<false\/>/);
  // the fix choice: no script → macscript (makes the profiles too); script there but a profile missing or unassigned → macprof; all there → none
  const client = (raw) => Gsa.model(raw, []).links.find((l) => l.k === "client");
  const raw = Gsa.demo();
  assert.strictEqual(client(raw).fix2, "macscript");
  raw.shellScripts.push({ id: "s2", displayName: Gsa.names(o).mac, fileName: Gsa.MAC_FILE });
  assert.strictEqual(client(raw).fix2, "macprof", "the script is there, the system extension policy is unassigned");
  assert.ok(client(raw).macProf && client(raw).macProf.proxy, "the profiles as read travel on the link");
  raw.macProfiles.sysext.assigned = true;
  assert.strictEqual(client(raw).fix2, null);
  assert.strictEqual(client(raw).st, "bad", "0.11.0: assignments alone no longer make macOS ready — nothing is seen through GSA, and Windows is still missing");
  // ticks: unset = missing or unassigned; a false stays false
  const mp = raw.macProfiles;
  assert.strictEqual(Gsa.wantProfile({}, Gsa.MAC_PROFILES[0], mp), false, "assigned → not ticked");
  assert.strictEqual(Gsa.wantProfile({}, Gsa.MAC_PROFILES[0], { sysext: { assigned: false } }), true);
  assert.strictEqual(Gsa.wantProfile({}, Gsa.MAC_PROFILES[1], {}), true, "missing → ticked");
  assert.strictEqual(Gsa.wantProfile({ pProxy: false }, Gsa.MAC_PROFILES[1], {}), false);
  // preview: the script tab only from the script side; a found profile is reused, an unticked one left alone
  const ps = Gsa.preview("macscript", Object.assign({ macProf: {} }, o));
  assert.deepStrictEqual(ps.map((t) => t.id), ["mac", "sysext", "proxy", "settings", "req"]);
  assert.match(ps[4].text, /POST \/deviceManagement\/deviceShellScripts/);
  const pp = Gsa.preview("macprof", Object.assign({ macProf: { proxy: { name: "[OPTIONAL] MACOS - DCP - Device Configuration - D - GSA Transparent Proxy - R26.10 - v3.0", assigned: false } }, pSet: false }, o));
  assert.deepStrictEqual(pp.map((t) => t.id), ["sysext", "proxy", "req"]);
  assert.match(pp[2].text, /GSA Transparent Proxy - R26.10 - v3.0 is in Intune — reused/);
  assert.match(pp[2].text, /client settings: not ticked/);
  assert.doesNotMatch(pp[2].text, /deviceShellScripts/);
  // a baseline whose GSA extensions sit in one consolidated System Extensions policy (devcf since 15 Oct) is found by its settings, and marked
  const consolidated = Gsa.macProfiles([{ id: "c9", name: "MACOS - DCP - Device Security - D - System Extensions - R26.10 - v1.0", assignments: [{ id: "a" }], settings: [{ settingInstance: { groupSettingCollectionValue: [{ children: [{ simpleSettingCollectionValue: [{ value: "com.microsoft.wdav.epsext" }, { value: "com.microsoft.globalsecureaccess" }] }] }] } }] }], []);
  assert.strictEqual(consolidated.sysext.id, "c9");
  assert.strictEqual(consolidated.sysext.consolidated, true);
  assert.ok(consolidated.found.some((f) => f.id === "c9" && f.role === "system extensions"), "the Intune card lists it");
  const r2 = Gsa.demo(); r2.macProfiles = Object.assign({}, r2.macProfiles, { sysext: consolidated.sysext });
  assert.match(client(r2).sub, /system extensions assigned \(in the baseline's System Extensions policy\)/);
  // one not naming GSA is not it
  assert.strictEqual(Gsa.macProfiles([{ id: "c8", name: "MACOS - DCP - Device Security - D - System Extensions - R26.6", settings: [{ x: "com.microsoft.wdav.netext" }] }], []).sysext, undefined);
  // the fix panel renders its button from either side
  const m = Gsa.model(raw, []);
  raw.macProfiles.sysext.assigned = false;
  const h = Gsa.render(Gsa.model(raw, []), { sel: "client" });
  assert.match(h, /data-gsafix="macprof">Create macOS profiles…/);
  assert.ok(Gsa.FIXES.macprof && Gsa.FIXES.macprof.recovery, "described before it runs");
  void m;
});

test("0.9.0: the macOS chain — found by content, checked against Learn, reach and landed; fixes as plans", () => {
  const b64 = (t) => Buffer.from(t, "utf8").toString("base64");
  // the v1.2 script is the baseline's, byte for byte, file 109
  assert.strictEqual(Gsa.MAC_FILE, "scr-app-109-install-global-secure-access.zsh");
  const t = Gsa.macScript();
  assert.match(t, /pkgutil --check-signature/); assert.match(t, /UBF8T346G9/); assert.match(t, /minmajor=14/);
  assert.match(t, /com\.apple\.system-extension-policy/); assert.match(t, /com\.apple\.vpn\.managed/); assert.match(t, /trap cleanup EXIT/);
  // the devcf shape before the repairs
  const raw = Gsa.demo(); raw.macChain = Gsa.demoMac();
  const m = Gsa.model(raw, []), c = m.links.find((l) => l.k === "client"), mac = c.mac;
  const by = Object.fromEntries(mac.rows.map((r) => [r.key, r]));
  assert.strictEqual(by.script.st, "bad"); assert.strictEqual(by.script.mode, "repair");
  assert.ok(by.script.issues.some((i) => /signed by Microsoft/.test(i.t)), "no signature check is a problem");
  assert.ok(by.script.issues.some((i) => /both approvals/.test(i.t)));
  assert.strictEqual(by.sysext.consolidated, true, "found by its settings, not its name");
  assert.strictEqual(by.sysext.reach.text, "assigned to nobody"); assert.strictEqual(by.sysext.mode, "assign");
  assert.strictEqual(by.proxy.st, "ok", "Learn's plist, same group");
  assert.strictEqual(by.settings.mode, "repair");
  assert.ok(by.settings.issues.some((i) => i.sev === "bad" && /com\.microsoft\.globalsecureaccess\.plist/.test(i.t)));
  assert.ok(by.settings.issues.some((i) => i.sev === "note" && /named U/.test(i.t)));
  assert.strictEqual(by.settings.mood, "lock-down");
  assert.strictEqual(mac.noMac, true, "one member, no managed Mac");
  assert.strictEqual(mac.problems, 4); assert.strictEqual(c.st, "bad", "0.11.0: neither platform seen through GSA"); assert.match(c.sub, /4 problems/);
  // repair: new version, assigned like the old one, old unassigned and renamed — never deleted
  const rp = Gsa.macFixPlan("macfix-settings", mac, { rel: "R26.10" });
  assert.deepStrictEqual(rp.ops.map((x) => x.do), ["post", "assign", "assign", "patch"]);
  assert.strictEqual(rp.ops[0].body.displayName, "[OPTIONAL] MACOS - DCP - Device Configuration - D - GSA System settings - R26.10 - v3.2", "U → D, version bumped, [OPTIONAL] kept");
  assert.strictEqual(rp.ops[0].body.bundleId, "com.microsoft.globalsecureaccess");
  assert.doesNotMatch(Buffer.from(rp.ops[0].body.configurationXml, "base64").toString(), /<false\/>/, "lock-down read from the old one");
  assert.deepStrictEqual(rp.ops[2].targets, [], "the old one unassigned");
  assert.match(rp.ops[3].body.displayName, /^\[DEPRECATED\] \[OPTIONAL\] .* - U - GSA System settings - R26\.10 - v3\.1$/);
  assert.ok(!rp.ops.some((x) => /delete/i.test(x.do)));
  // assign keeps what is there and adds the script's group
  const ap = Gsa.macFixPlan("macfix-sysext", mac, {});
  assert.strictEqual(ap.mode, "assign"); assert.deepStrictEqual(ap.ops[0].targets.map((x) => x.groupId), ["g-mac"]);
  // the script repair carries v1.2
  const sp = Gsa.macFixPlan("macfix-script", mac, { rel: "R26.10" });
  assert.strictEqual(Buffer.from(sp.ops[0].body.scriptContent, "base64").toString("utf8"), Gsa.macScript());
  assert.match(sp.ops[0].body.displayName, / - v1\.2$/);
  // a complete row has nothing to do
  assert.strictEqual(Gsa.macFixPlan("macfix-proxy", mac, {}).mode, "none");
  // system extensions missing but another policy sets the payload on the Macs: add to it (backup + PUT), not a second policy
  const ch = Gsa.demoMac(); ch.policies = [{ id: "p-mde", name: "MACOS - DCP - Defender - D - MDE System Settings - R26.10 - v3.3", technologies: "mdm,appleRemoteManagement", roleScopeTagIds: ["0"], assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-mac" } }],
    settings: [{ settingInstance: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance", settingDefinitionId: "com.apple.system-extension-policy_com.apple.system-extension-policy", groupSettingCollectionValue: [{ children: [{ "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance", settingDefinitionId: "com.apple.system-extension-policy_allowedsystemextensions", groupSettingCollectionValue: [{ children: [
      { settingDefinitionId: "com.apple.system-extension-policy_allowedsystemextensions_generickey", simpleSettingCollectionValue: [{ value: "com.microsoft.wdav.netext" }] },
      { settingDefinitionId: "com.apple.system-extension-policy_allowedsystemextensions_generickey_keytobereplaced", simpleSettingValue: { value: "UBF8T346G9" } }] }] }] }] } }] }];
  const mac2 = Gsa.macCheck(ch, {});
  assert.strictEqual(mac2.rows.find((r) => r.key === "sysext").found, null);
  assert.deepStrictEqual(mac2.otherSx.map((p) => p.id), ["p-mde"]);
  const add = Gsa.macFixPlan("macfix-sysext", mac2, { rel: "R26.10" });
  assert.strictEqual(add.mode, "add"); assert.deepStrictEqual(add.ops.map((x) => x.do), ["backup", "put"]);
  const f = Gsa.sysextFacts({ settings: add.ops[1].body.settings });
  assert.ok(f.ids, "both GSA ids under the team after the PUT"); assert.ok(JSON.stringify(add.ops[1].body.settings).includes("com.microsoft.wdav.netext"), "what it had is kept");
  assert.ok(!Gsa.macCheck(Object.assign({}, ch, { policies: [ch.policies[0]] }), {}).rows.find((r) => r.key === "sysext").found);
  assert.strictEqual(Gsa.macFixPlan("macfix-sysext", mac2, { sxMode: "new" }).mode, "create", "the person may still pick a separate policy");
  // reach: an exclusion of the script's group, All devices, a filter
  const sA = [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g1" } }];
  assert.strictEqual(Gsa.reach([{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }, { target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: "g1" } }], sA, {}).st, "warn");
  assert.strictEqual(Gsa.reach([{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }], sA, {}).st, "ok");
  assert.strictEqual(Gsa.reach([{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g2" } }], sA, { g1: "Macs" }).text, "misses Macs — the script's group");
  // content: a legacy Extensions template and the team in both lists are named
  assert.ok(Gsa.contentIssues("sysext", { "@odata.type": "#microsoft.graph.macOSExtensionsConfiguration", systemExtensionsAllowedTeamIdentifiers: ["UBF8T346G9"] }).some((i) => /deprecated Extensions template/.test(i.t)));
  // a proxy with another provider is not GSA's; one with the user channel is wrong
  const px = Gsa.macProxyBody({}); px.deploymentChannel = "userChannel";
  assert.ok(Gsa.contentIssues("proxy", px).some((i) => /user channel/.test(i.t)));
  // the table renders a button per row that has a fix
  const h = Gsa.render(m, { sel: "client" });
  assert.match(h, /id="gsaMac"/); assert.strictEqual((h.match(/data-gsafix="macfix-/g) || []).length, 3);
  // preview: the body as sent and the requests in order
  const pv = Gsa.preview("macfix-settings", { mac, rel: "R26.10" });
  assert.deepStrictEqual(pv.map((x) => x.id), ["settings", "req"]); assert.match(pv[1].text, /\/assign/);
  // names
  assert.strictEqual(Gsa.bumpName("[DEPRECATED] MACOS - X - D - Y - R26.6 - v3.0"), `MACOS - X - D - Y - ${Gsa.relTag()} - v3.1`);
  assert.strictEqual(Gsa.bumpName("My GSA policy"), `My GSA policy - ${Gsa.relTag()} - v1.0`);
  void b64;
});

test("0.9.1: step 7 is never a dead end; the reach card says who is who", () => {
  // policies not read: a read button, words that say what is not known
  const raw = Gsa.demo(); raw.sp.appRoleAssignmentRequired = false;
  let m = Gsa.model(raw, null), pol = m.links.find((l) => l.k === "policy");
  assert.match(pol.note, /has not read this tenant's Conditional Access policies/);
  let h = Gsa.render(m, { sel: "policy" });
  assert.match(h, /data-gsareadpols>📥 Read the policies/);
  assert.doesNotMatch(h, /Nothing ENCA can do from here/);
  // read, none names the compliant network: the builder, pre-filled
  m = Gsa.model(raw, []); h = Gsa.render(m, { sel: "policy" });
  assert.match(h, /data-gsabuild>Create it in report-only…/);
  // report-only: on to the proof
  m = Gsa.model(raw, [policy()]); h = Gsa.render(m, { sel: "policy" });
  assert.match(h, /data-gsasel="proof">Step 8 · the proof/);
  // the reach card: profile for all users, no group needed; policies; devices by OS
  raw.macChain = Gsa.demoMac();
  m = Gsa.model(raw, null); h = Gsa.render(m, {});
  const card = h.slice(h.indexOf('id="gsaReach"'));
  assert.match(card, /Who gets the Microsoft traffic profile\?/);
  assert.match(card, /<b>All users\.<\/b> <i>Assignment required<\/i> is off/);
  assert.match(card, /makes no difference/, "a group still assigned while all users get it is named as making no difference");
  assert.match(card, /Not known yet — the policies are not read/);
  assert.match(card, /macOS: <b>INT-SEC-D-GSA-MAC-M365<\/b>[^<]*<span class="muted">\(install script, transparent proxy, client settings; 1 device, 0 managed Macs\)/);
  assert.match(card, /Windows: <span class="muted">nothing assigned/);
  assert.match(card, /client on 0 managed Macs and no Windows device — so nobody&#39;s traffic goes through Global Secure Access yet/);
  assert.doesNotMatch(card, /No group yet/);
  // the device group joins the Used by GSA scope
  assert.ok(m.groupIds.includes("g-mac"));
  // a pilot group, assignment required on: only they get it
  const r2 = Gsa.demo(); const m2 = Gsa.model(r2, [policy()]);
  assert.match(Gsa.render(m2, {}), /<b>GSA-SEC-U-M365Profile-Pilot<\/b> — only they get the profile/);
});

// ---- 32708: the go-live recheck (18 Oct 2026) --------------------------------
const W_GROUP = "g-win";
const okRaw = (over) => {
  // a tenant where every link is ready: profile for all users, the remediation
  // on a group of two joined devices that ran on both, no Mac in the tenant
  const r = Gsa.demo();
  r.profile.policies.forEach((p) => { p.state = "enabled"; });
  r.sp.appRoleAssignmentRequired = false;
  r.macProfiles = {}; r.macManaged = 0;
  r.groupNames[W_GROUP] = "INT-SEC-D-GSA-WIN-M365";
  r.winGroups = { [W_GROUP]: { devices: 2, windows: 2, joined: 2, hybrid: 0, registered: 0, users: 0, list: [{ deviceId: "d1", displayName: "LT-1", operatingSystem: "Windows", trustType: "AzureAd" }, { deviceId: "d2", displayName: "LT-2", operatingSystem: "Windows", trustType: "AzureAd" }] } };
  // 0.11.0: both devices seen by Global Secure Access — one in its device report, one by a sign-in through it
  r.seen = { days: 7, report: [{ deviceId: "d1", displayName: "LT-1", operatingSystem: "Windows 11 Enterprise", trafficType: "microsoft365", lastAccessDateTime: "2026-10-18T10:00:00Z" }], signIns: [{ createdDateTime: "2026-10-18T11:00:00Z", deviceDetail: { deviceId: "D2", displayName: "LT-2", operatingSystem: "Windows10" } }] };
  r.healthScripts = [{ id: "h", displayName: "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", assigned: true, assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: W_GROUP } }], runSummary: { noIssueDetectedDeviceCount: 1, issueRemediatedDeviceCount: 1 } }];
  return Object.assign(r, over || {});
};
const block = (o) => policy(Object.assign({ state: "enabled", conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"], excludeApplications: [Gsa.INTUNE_APP, Gsa.INTUNE_ENROLL] }, platforms: { includePlatforms: ["windows", "macOS"] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } } }, o || {}));

test("32708 B1: the verdict is green only for a block-outside policy on All resources, the whole chain ready, everybody covered", () => {
  const good = Gsa.model(okRaw(), [block()]);
  assert.strictEqual(good.links.find((l) => l.k === "client").st, "ok", "Windows-only tenant: step 6 can be green (S7)");
  assert.strictEqual(good.verdict.cls, "ok");
  assert.strictEqual(good.links.find((l) => l.k === "policy").st, "ok");
  // (a) the only enabled policy requires MFA ON the compliant network
  const a = Gsa.model(okRaw(), [policy({ state: "enabled", conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] }, locations: { includeLocations: ["loc-cn"] } }, grantControls: { builtInControls: ["mfa"] } })]);
  assert.strictEqual(a.verdict.cls, "bad");
  assert.match(a.verdict.p, /none blocks every resource outside it/);
  assert.strictEqual(a.links.find((l) => l.k === "policy").word, "none blocks");
  // (b) block outside, one app only
  const b = Gsa.model(okRaw(), [block({ conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["00000002-0000-0ff1-ce00-000000000000"] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } } })]);
  assert.strictEqual(b.verdict.cls, "bad");
  assert.strictEqual(b.guards.length, 0);
  assert.match(Gsa.render(b, {}), /not counted — it does not cover All resources/);
  // (c) on for All users, profile on one pilot group, no client anywhere
  const c = Gsa.model(Gsa.demo(), [block()]);
  assert.strictEqual(c.verdict.cls, "bad");
  assert.strictEqual(c.verdict.h, "The policy is on — it blocks people, not tokens");
  assert.match(c.verdict.p, /step 6 \(GSA client\)/);
  assert.match(c.verdict.p, /do not get the Microsoft profile or the client/);
  assert.strictEqual(c.links.find((l) => l.k === "policy").st, "bad");
  assert.match(c.links.find((l) => l.k === "policy").sub, /blocks people, not tokens/);
});

test("32708 B2: who must pass against who can — groups by id, All users, devices with the client", () => {
  const raw = okRaw(); raw.sp.appRoleAssignmentRequired = true; // profile: the demo's one pilot group
  const m = Gsa.model(raw, [block()]);
  assert.strictEqual(m.scope.st, "bad");
  assert.match(m.scope.lines[0].t, /requires the compliant network of All users, but the Microsoft profile is assigned to GSA-SEC-U-M365Profile-Pilot/);
  // scoped to the profile's own group: covered
  const m2 = Gsa.model(raw, [block({ conditions: { users: { includeGroups: ["g-gsa-pilot"] }, applications: { includeApplications: ["All"] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } } })]);
  assert.strictEqual(m2.scope.st, "ok");
  assert.strictEqual(m2.verdict.cls, "ok");
  // report-only: the same gap is a warning before anybody switches it on
  const m3 = Gsa.model(raw, [block({ state: "enabledForReportingButNotEnforced" })]);
  assert.strictEqual(m3.scope.st, "warn");
  assert.match(m3.scope.lines[0].t, /would require/);
  assert.match(Gsa.render(m3, {}), /gsa-scope warn/);
  // no device carries the client
  const raw4 = okRaw(); raw4.winGroups[W_GROUP] = { devices: 0, windows: 0, joined: 0, hybrid: 0, registered: 0, users: 0 };
  const m4 = Gsa.model(raw4, [block()]);
  assert.ok(m4.scope.lines.some((x) => /no device carries the Global Secure Access client/.test(x.t)));
  assert.strictEqual(m4.verdict.cls, "bad");
});

test("32708 B3/S8: Windows judged by reach and landing, not by name", () => {
  const w = (over, rs) => { const r = okRaw(); Object.assign(r.winGroups[W_GROUP], over || {}); if (rs) r.healthScripts[0].runSummary = rs; return Gsa.model(r, []).links.find((l) => l.k === "client"); };
  assert.strictEqual(w().win.st, "ok");
  const empty = w({ devices: 0, windows: 0, joined: 0 });
  assert.strictEqual(empty.win.st, "bad");
  assert.match(empty.note, /no Windows device and no user in it/);
  const never = w(null, { noIssueDetectedDeviceCount: 0, issueRemediatedDeviceCount: 0 });
  assert.strictEqual(never.win.st, "warn");
  assert.match(never.note, /has not run on any device yet/);
  const held = w(null, { noIssueDetectedDeviceCount: 1, issueDetectedDeviceCount: 3 });
  assert.match(held.sub, /found without the client and not remediated — check in Intune that the assignment has remediation on/);
  const reg = w({ registered: 1 });
  assert.strictEqual(reg.win.st, "warn");
  assert.match(reg.sub, /Entra registered device/);
  const html = Gsa.render(Gsa.model(okRaw(), []), { sel: "client" });
  assert.match(html, /Ready when every device in scope has been seen through Global Secure Access/);
  assert.match(html, /INT-SEC-D-GSA-WIN-M365 — 2 Windows devices/);
  assert.match(html, /no Intune-managed Mac in this tenant and no macOS script — not in scope/i);
});

test("32708 B4: remediations need Windows Enterprise; Business Premium gets the platform script", () => {
  const bp = [{ skuPartNumber: "SPB", prepaidUnits: { enabled: 10 }, servicePlans: [{ servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", servicePlanName: "AAD_PREMIUM" }, { servicePlanId: "8e229017-d77b-43d5-9305-903395523b99", servicePlanName: "WINBIZ" }] }];
  const lic = Gsa.winLicence(bp);
  assert.deepStrictEqual([lic.known, lic.ent, lic.biz], [true, false, true]);
  assert.strictEqual(Gsa.winLicence(Gsa.demo().skus).ent, true);
  assert.strictEqual(Gsa.winLicence(null).known, false);
  // nothing deployed, Business Premium → the platform script is the fix
  const r = Gsa.demo(); r.skus = bp;
  const c = Gsa.model(r, []).links.find((l) => l.k === "client");
  assert.strictEqual(c.fix, "winscript");
  assert.match(c.sub, /remediations are not licensed/);
  // a remediation already there on Business Premium is said, red
  const r2 = okRaw({ skus: bp });
  const c2 = Gsa.model(r2, []).links.find((l) => l.k === "client");
  assert.strictEqual(c2.win.st, "bad");
  assert.match(c2.sub, /remediations need Windows Enterprise E3\/E5, Education A3\/A5 or VDA/);
  assert.match(Gsa.render(Gsa.model(r2, []), { sel: "client" }), /this tenant holds Windows Business \(Business Premium\)/);
  assert.strictEqual(c2.fix, "winswap", "0.11.0: the remediation that cannot run hands its groups to the platform script");
});

test("32708 S1: a found but unassigned remediation, any release tag, is the one the fix assigns", () => {
  const r = okRaw();
  r.healthScripts[0].displayName = "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.9 - v1.0";
  r.healthScripts[0].assigned = false; r.healthScripts[0].assignments = [];
  const c = Gsa.model(r, []).links.find((l) => l.k === "client");
  assert.strictEqual(c.fix, "winrem");
  assert.strictEqual(c.win.obj.id, "h", "the runner reuses this object, whatever name the form would build");
  assert.strictEqual(c.win.st, "bad");
  assert.match(c.note, /assigned to nobody/);
});

test("32708 S3: the compliant network location's well-known id is recognised without the locations read", () => {
  assert.strictEqual(Gsa.CN_ID, "3d46dbda-8382-466a-856d-eb00cbc6b910");
  const r = okRaw(); r.sources.locations = "403 Forbidden"; r.locations = [];
  const m = Gsa.model(r, [block({ conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] }, locations: { includeLocations: ["All"], excludeLocations: [Gsa.CN_ID] } } })]);
  assert.strictEqual(m.policies.length, 1);
  assert.strictEqual(m.policies[0].guard, true);
  assert.match(Gsa.FIXES.location.changes.join(" "), /Read the named locations again first[\s\S]*NOT create/);
});

test("32708 S5: the proof — not applied for the location alone means in scope and through GSA; non-interactive counted", () => {
  const a = (r, ns) => [{ id: "p1", result: r, conditionsNotSatisfied: ns }];
  const pr = Gsa.proof([
    { userId: "u1", signInEventTypes: ["nonInteractiveUser"], isThroughGlobalSecureAccess: true, appliedConditionalAccessPolicies: a("reportOnlyNotApplied", "location") },
    { userId: "u2", signInEventTypes: ["interactiveUser"], appliedConditionalAccessPolicies: a("reportOnlyFailure", "none") },
    { userId: "u3", signInEventTypes: ["interactiveUser"], appliedConditionalAccessPolicies: a("reportOnlyNotApplied", "users") },
    { userId: "u4", signInEventTypes: ["nonInteractiveUser"], appliedConditionalAccessPolicies: a("notApplied", "location") },
  ], ["p1"]);
  assert.deepStrictEqual([pr.total, pr.inScope, pr.inScopeVia, pr.interactive, pr.nonInteractive], [4, 3, 2, 2, 2]);
  assert.deepStrictEqual([pr.per.p1.wouldBlock, pr.per.p1.wouldPass, pr.per.p1.notApplied], [1, 2, 1]);
  const m = Gsa.model(okRaw(), [block({ state: "enabledForReportingButNotEnforced" })]);
  const html = Gsa.render(m, { sel: "proof", proof: pr });
  assert.match(html, /67% of 3 sign-ins in the policies(?:&#39;|') scope passed through GSA · 1 would be or were blocked · read 2 interactive and 2 non-interactive/);
});

test("32708 S4/L: the report-only template and the texts that drifted", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  assert.match(src, /CA215-BLOCK-Internals-CN-AllApps-WindowsOrMACOS-Require Global Secure Access client active-v1\.0/);
  assert.match(src, /platforms: \{ includePlatforms: \["windows", "macOS"\]/);
  assert.doesNotMatch(src, /CA200-BLOCK-Internals-OutsideCompliantNetwork/);
  assert.doesNotMatch(src, /"scr-app-108-install-global-secure-access"/);
  assert.doesNotMatch(Gsa.FIXES.macscript.changes.join(" "), /scr-app-108|root, once/);
  assert.match(Gsa.FIXES.macscript.changes.join(" "), /weekly[\s\S]*scr-app-109/);
  const html = Gsa.render(Gsa.model(Gsa.demo(), []), {});
  assert.doesNotMatch(html, /the macOS profiles are read, never written/);
  assert.doesNotMatch(html, /ENCA does not make this policy here/);
  assert.match(html, /Create it in report-only…<\/b> opens the 🏗 Policy builder pre-filled/);
});

test("32708 L6: other excluded apps are shown as holes, by count", () => {
  const p = block({ conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"], excludeApplications: [Gsa.INTUNE_APP, Gsa.INTUNE_ENROLL, "00000002-0000-0000-c000-000000000000", "2793995e-0a7d-40d7-bd35-6968ba142197"] }, locations: { includeLocations: ["All"], excludeLocations: ["loc-cn"] } } });
  const m = Gsa.model(okRaw(), [p]);
  assert.deepStrictEqual(m.policies[0].otherOut, ["00000002-0000-0000-c000-000000000000", "2793995e-0a7d-40d7-bd35-6968ba142197"]);
  assert.match(Gsa.render(m, {}), /2 other apps excluded — a stolen token still reaches them/);
});

test("32708 L7/L8: adding the GSA ids keeps the baseline policy's name; a legacy Extensions profile is flagged", () => {
  const chain = Gsa.demoMac();
  const sx = chain.policies[0];
  sx.assignments = [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-mac" } }];
  // the baseline's consolidated policy, broken (team in both lists) → repair, which ADDS to it
  sx.settings = Gsa.macSysextSettings();
  sx.settings.push({ settingInstance: { settingDefinitionId: "com.apple.system-extension-policy_allowedteamidentifiers", simpleSettingCollectionValue: [{ value: "UBF8T346G9" }] } });
  const plan = Gsa.macFixPlan("macfix-sysext", Gsa.macCheck(chain, {}), {});
  assert.strictEqual(plan.mode, "add");
  const put = plan.ops.find((o) => o.do === "put");
  assert.strictEqual(put.body.name, "MACOS - DCP - Device Security - D - System Extensions - R26.10 - v1.0", "name unchanged — the importer matches it by name");
  assert.match(put.body.description, /added by ENCA T56/);
  const legacy = Gsa.macCheck(Object.assign({}, Gsa.demoMac(), { configs: [...Gsa.demoMac().configs, { "@odata.type": "#microsoft.graph.macOSExtensionsConfiguration", id: "x-old", displayName: "Old Extensions", systemExtensionsAllowedTeamIdentifiers: ["ABCDE12345"], assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-mac" } }] }] }), {});
  assert.deepStrictEqual(legacy.otherSxLegacy.map((x) => x.name), ["Old Extensions"]);
  assert.match(Gsa.macTable(legacy), /A deprecated Extensions profile also sets system extensions on these Macs \(Old Extensions\)/);
});

// ---- 0.11.0: step 6 as two lanes, decided by what GSA has seen (18 Oct 2026) ----
const BP = [{ skuPartNumber: "SPB", prepaidUnits: { enabled: 1 }, servicePlans: [{ servicePlanId: "41781fb2-bc02-4b7c-bd55-b576c07bb09d", servicePlanName: "AAD_PREMIUM" }, { servicePlanId: "8e229017-d77b-43d5-9305-903395523b99", servicePlanName: "WINBIZ" }] }];
const limonIt = () => {
  // Limon-IT as read on 18 Oct 20:30: the remediation on the Cloud PC that its
  // licence cannot run, the macOS chain on the MacBook, nothing seen through GSA
  const r = okRaw({ skus: BP });
  r.winGroups[W_GROUP].list = [{ deviceId: "cpc-1", displayName: "CPC-mihai-2L8IB", operatingSystem: "Windows", trustType: "AzureAd" }];
  Object.assign(r.winGroups[W_GROUP], { devices: 1, windows: 1, joined: 1 });
  r.healthScripts[0].runSummary = { noIssueDetectedDeviceCount: 0, issueRemediatedDeviceCount: 0 };
  r.healthScripts[0].assignments[0].runRemediationScript = false;
  r.seen = { days: 7, report: [], signIns: [] };
  const chain = Gsa.demoMac();
  chain.groups["g-mac"] = { devices: 1, managedMacs: 1, users: 0, list: [{ deviceId: "mac-1", displayName: "MacBook Pro van Mihai", operatingSystem: "MacMDM", trustType: "AzureAd" }] };
  r.macChain = chain; r.shellScripts = chain.scripts; r.macManaged = 1;
  return r;
};
const actKeys = (L) => L.actions.map((a) => a.fix || (a.groups ? "groups" : a.jump ? "jump" : a.copy ? "copy" : ""));

test("0.11.0 Limon-IT: nothing seen through GSA — both lanes red, each with its own actions", () => {
  const m = Gsa.model(limonIt(), []), c = m.links.find((l) => l.k === "client"), W = c.lanes.windows, M = c.lanes.macOS;
  assert.strictEqual(c.st, "bad");
  assert.deepStrictEqual([W.st, W.word, W.fix, c.fix], ["bad", "blocked · licence", "winswap", "winswap"]);
  assert.deepStrictEqual(actKeys(W), ["winswap", "groups", "scope-win"]);
  const allowed = W.stages.find((s) => s.k === "Allowed to run");
  assert.match(allowed.text, /this tenant holds Windows Business \(Business Premium\)/);
  assert.match(allowed.sub, /detect-only/);
  assert.deepStrictEqual(W.stages.find((s) => s.gate), { k: "Connected", gate: true, st: "bad", text: "0 of 1 Windows device seen through GSA in the last 7 days" });
  assert.deepStrictEqual([M.st, M.word], ["bad", "deployed · not connected"]);
  assert.deepStrictEqual(actKeys(M), ["jump", "copy", "scope-mac"]);
  assert.match(M.stages.find((s) => s.gate).text, /^0 of 1 Mac seen through GSA/);
  const html = Gsa.render(m, { sel: "client" });
  assert.match(html, /data-gsafix="winswap">Replace…/);
  assert.match(html, /systemextensionsctl list \| grep -i globalsecureaccess/);
  assert.match(html, /CPC-mihai-2L8IB[\s\S]*?not connected/);
  assert.match(html, /<span class="gsa-split"><i class="bad">Win ✕<\/i><i class="bad">Mac ✕<\/i><\/span>/);
});

test("0.11.0: the Windows lane keeps its actions whatever happens on macOS (Mihai: if I choose mac, I don't see the options for windows later)", () => {
  const r = limonIt(); r.skus = Gsa.demo().skus; // licensed — nothing to replace
  const m = Gsa.model(r, []), W = m.links.find((l) => l.k === "client").lanes.windows;
  assert.deepStrictEqual([W.fix, W.word], [null, "not connected"]);
  assert.deepStrictEqual(actKeys(W), ["groups", "scope-win"]);
  const html = Gsa.render(m, { sel: "client" });
  assert.match(html, /data-gsafix="scope-win"/);
  assert.match(html, /data-gsagroups/);
  const detail = html.split('id="gsaDetail"')[1].split("</section>")[0];
  assert.doesNotMatch(detail, /data-gsafix=/, "the step's own action column carries no single fix slot any more");
  assert.match(detail, /data-gsajump="gsaLanes"/);
});

test("0.11.0: connected — the device report and the sign-ins through GSA, by Entra device id, any case", () => {
  const ix = Gsa.seenIndex({ sources: { seenReport: "ok", seenSignins: "ok" }, seen: { days: 7, report: [{ deviceId: "AA", lastAccessDateTime: "2026-10-17T10:00:00Z", operatingSystem: "Windows 11" }], signIns: [{ createdDateTime: "2026-10-18T09:00:00Z", deviceDetail: { deviceId: "aa" } }, { createdDateTime: "2026-10-16T09:00:00Z", deviceDetail: {} }] } });
  assert.strictEqual(ix.read, true); assert.strictEqual(ix.map.size, 1);
  const e = ix.map.get("aa");
  assert.strictEqual(e.last, "2026-10-18T09:00:00Z");
  assert.deepStrictEqual([...e.via].sort(), ["sign-in", "traffic"]);
  const half = Gsa.seenIndex({ sources: { seenReport: "Graph request failed (403)", seenSignins: "ok" }, seen: { report: null, signIns: [] } });
  assert.strictEqual(half.read, true); assert.match(half.err, /device report: Graph request failed \(403\)/);
  const r = okRaw(); r.sources.seenReport = "403"; r.sources.seenSignins = "403";
  const c = Gsa.model(r, []).links.find((l) => l.k === "client");
  assert.deepStrictEqual([c.lanes.windows.st, c.lanes.windows.word], ["warn", "not read"]);
  assert.notStrictEqual(c.st, "ok", "never green on what was not read");
  const r2 = okRaw(); r2.seen.signIns = [];
  const c2 = Gsa.model(r2, []).links.find((l) => l.k === "client");
  assert.deepStrictEqual([c2.lanes.windows.st, c2.st], ["warn", "warn"]);
  assert.match(c2.note, /1 of 2 Windows devices seen through GSA/);
  // B2: the scope check counts the devices GSA has seen
  const good = Gsa.model(okRaw(), [block()]);
  assert.match(good.scope.lines[0].t, /and 2 devices carry the client/);
});

test("0.11.0: a platform out of scope is kept in the tenant (the ENCA settings record) and leaves the step to the other", () => {
  const rec = Gsa.scopeRecord({ "@odata.context": "x", id: "nl.limonit.enca", extensionName: "nl.limonit.enca", other: 1 }, "macOS", true, "mihai@limon-it.nl", " no Macs here ", "2026-10-18T19:00:00Z");
  assert.deepStrictEqual(rec, { "@odata.type": "microsoft.graph.openTypeExtension", extensionName: "nl.limonit.enca", other: 1, t56MacOutAt: "2026-10-18T19:00:00Z", t56MacOutBy: "mihai@limon-it.nl", t56MacOutWhy: "no Macs here" });
  assert.deepStrictEqual(Gsa.scopeOut(rec).macOS, { at: "2026-10-18T19:00:00Z", by: "mihai@limon-it.nl", why: "no Macs here" });
  assert.strictEqual(Gsa.scopeOut(rec).windows, null);
  const back = Gsa.scopeRecord(rec, "macOS", false);
  assert.deepStrictEqual([back.t56MacOutAt, Gsa.scopeOut(back).macOS, back.other], ["", null, 1]);
  const r = limonIt(); r.encaSettings = rec;
  r.seen.report = [{ deviceId: "CPC-1", lastAccessDateTime: "2026-10-18T19:30:00Z", operatingSystem: "Windows 11 Enterprise" }];
  const c = Gsa.model(r, []).links.find((l) => l.k === "client");
  assert.deepStrictEqual([c.lanes.windows.st, c.lanes.macOS.st, c.st], ["ok", "na", "ok"]);
  assert.strictEqual(c.fix2, null, "no macOS fix while macOS is out of scope");
  assert.deepStrictEqual(actKeys(c.lanes.macOS), ["scope-mac"]);
  assert.strictEqual(c.lanes.macOS.actions[0].label, "Back in scope…");
  assert.match(c.lanes.macOS.stages[0].text, /taken out of scope .* by mihai@limon-it\.nl — no Macs here/);
  r.encaSettings = Gsa.scopeRecord(rec, "Windows", true, "x", "", "2026-10-18T19:00:00Z");
  assert.strictEqual(Gsa.model(r, []).links.find((l) => l.k === "client").st, "bad", "both out: nothing carries the client — never green");
});

test("0.11.0: a deployment for everyone is judged by the Windows devices GSA has seen", () => {
  const r = okRaw(); r.healthScripts[0].assignments = [{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" }, runRemediationScript: true }];
  const W = Gsa.model(r, []).links.find((l) => l.k === "client").lanes.windows;
  assert.strictEqual(W.st, "ok");
  assert.match(W.summary, /^2 Windows devices seen through GSA .* cannot list who is missing/);
});

test("0.11.0: what Replace and Not in scope send, before they run", () => {
  const tabs = Gsa.preview("winswap", { remId: "rem-1", remGroups: ["INT-SEC-D-GSA-WIN-M365"] });
  assert.deepStrictEqual(tabs.map((t) => t.id), ["win", "req"]);
  assert.match(tabs[1].text, /deviceManagementScripts\/\{id\}\/assign[\s\S]*<INT-SEC-D-GSA-WIN-M365>[\s\S]*only when that landed: POST \/deviceManagement\/deviceHealthScripts\/rem-1\/assign/);
  assert.match(Gsa.FIXES.winswap.impact, /runs once per device/);
  assert.match(Gsa.FIXES.winswap.recovery, /backup/);
  const s = Gsa.preview("scope-mac", { rec: null, who: "a@b", why: "no Macs" })[0].text;
  assert.match(s, /^POST \/v1\.0\/organization\/\{tenant id\}\/extensions\n/);
  assert.match(s, /"t56MacOutWhy": "no Macs"/);
  const s2 = Gsa.preview("scope-mac", { rec: { t56MacOutAt: "2026-10-18T19:00:00Z" } })[0].text;
  assert.match(s2, /^PATCH \/v1\.0\/organization\/\{tenant id\}\/extensions\/nl\.limonit\.enca/);
  assert.match(s2, /"t56MacOutAt": ""/);
});
