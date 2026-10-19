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

test("the Windows install script: both architectures, installs only — the settings are the configuration's (0.15.0)", () => {
  const t = Gsa.windowsScript({ lock: true, ipv4: true });
  assert.match(t, /GlobalSecureAccess-WindowsOnArm/);
  assert.match(t, /'https:\/\/aka\.ms\/GlobalSecureAccess-Windows'/);
  assert.match(t, /'\/quiet', '\/norestart'/);
  assert.match(t, /if \(\$app\) \{ Write-Output "GSA client \$\(\$app\.DisplayVersion\) already installed"; exit 0 \}/, "installs only when missing");
  assert.doesNotMatch(t, /RestrictNonPrivilegedUsers|HideSignOutButton|DisabledComponents|Global Secure Access Client'$/m, "no client settings in the install");
  const b = Gsa.windowsScriptBody({});
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(b.fileName, Gsa.WIN_FILE);
  assert.match(b.description, /Writes no client settings/);
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
  // 0.15.0: the client settings live in the configuration
  const pilot = Gsa.cfgScript({});
  assert.match(pilot, /HideDisableButton = 0; HideSignOutButton = 1; HideDisablePrivateAccessButton = 1; RestrictNonPrivilegedUsers = 0/);
  const locked = Gsa.cfgScript({ lock: true });
  assert.match(locked, /HideDisableButton = 1; HideSignOutButton = 1; HideDisablePrivateAccessButton = 1; RestrictNonPrivilegedUsers = 1/);
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
  // 0.15.0: the install remediation installs, nothing else
  const d = Gsa.detectScript({});
  assert.match(d, /DisplayName -like 'Global Secure Access Client\*'/);
  assert.match(d, /if \(-not \$app\) \{ Write-Output 'GSA client not installed'; exit 1 \}/);
  assert.match(d, /\$MinVersion = '2\.34\.222\.0'/, "32817: the floor is in the script");
  assert.match(d, /-lt \(ConvertTo-Ver \$MinVersion\)\) \{[^}]*exit 1 \}/, "older than the floor: run the remediation");
  assert.match(d, /while \(\$n\.Count -lt 4\)/, "three-part DisplayVersion padded to four");
  assert.doesNotMatch(d, /\[version\]\$app|\[version\]\s*\$app/, "never [version] on the raw DisplayVersion");
  assert.match(d, /Detection error, not remediating: \$_"; exit 0/, "an unexpected error never starts a reinstall loop");
  assert.doesNotMatch(d, /Start-Service|Stop-Service|Set-Service/, "service state is reported, never enforced");
  assert.match(d, /exit 0 \}$/m);
  assert.doesNotMatch(d, /\$want|HideDisableButton/, "settings are the configuration's");
  const r = Gsa.remediationScript({ lock: true, ipv4: true });
  assert.match(r, /if \(\$app -and \(\(ConvertTo-Ver \$app\.DisplayVersion\) -ge \(ConvertTo-Ver \$MinVersion\)\)\) \{[^}]*exit 0 \}/, "32817: leaves a client at or above the floor alone, upgrades below it");
  assert.match(r, /TotalHours -lt 6/, "retry guard");
  assert.match(r, /Get-AuthenticodeSignature/);
  assert.match(r, /O=Microsoft Corporation/);
  assert.match(r, /finally \{ Remove-Item \$exe/, "temp installer always removed");
  assert.match(r, /aka\.ms served a build below the minimum/, "post-install version check");
  assert.match(r, /Architecture -eq 12/);
  assert.match(r, /GlobalSecureAccess-WindowsOnArm/);
  assert.match(r, /Tls12/);
  assert.doesNotMatch(r, /RestrictNonPrivilegedUsers|DisabledComponents|Global Secure Access Client'$/m);
  assert.doesNotMatch(r, /Restart-Computer|shutdown/i, "a remediation never restarts");
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
  // 0.13.1: devcf holds no Windows Enterprise licence — the remediation is outside the licence, which is the
  // admin's choice (Mihai: it can be enabled and works), so no fix is pushed; Replace… stays an option.
  // The detect-only reading is still no signal (no fix is offered BECAUSE of it)
  assert.strictEqual(m.links.find((l) => l.k === "client").fix, null);
  assert.ok(m.links.find((l) => l.k === "client").lanes.windows.actions.some((a) => a.fix === "winswap" && !a.primary));
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
  assert.match(c.sub, /remediations are not part of the licence/);
  // 0.13.1: …and a remediation is offered beside it, outside the licence, the admin's choice
  assert.ok(c.lanes.windows.actions.some((a) => a.fix === "winrem" && !a.primary && /your choice/.test(a.title)));
  // a remediation already there on Business Premium is a warning, never red (0.13.1)
  const r2 = okRaw({ skus: bp });
  const c2 = Gsa.model(r2, []).links.find((l) => l.k === "client");
  assert.strictEqual(c2.win.st, "warn");
  assert.match(c2.sub, /using it outside the licence is your choice/);
  const lic2 = c2.lanes.windows.stages.find((x) => x.k === "Licence");
  assert.deepStrictEqual([lic2.st, /your choice/.test(lic2.sub)], ["warn", true]);
  assert.strictEqual(c2.lanes.windows.st, "ok", "the devices are seen — the licence never decides the lane");
  assert.match(c2.sub, /remediations need Windows Enterprise E3\/E5, Education A3\/A5 or VDA/);
  assert.match(Gsa.render(Gsa.model(r2, []), { sel: "client" }), /this tenant holds Windows Business \(Business Premium\)/);
  assert.strictEqual(c2.fix, null, "0.13.1: Replace… is offered, never pushed");
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
  // 0.13.1: the licence is a warning and the admin's choice — Connected decides the lane, Replace… is optional
  assert.deepStrictEqual([W.st, W.word, W.fix, c.fix], ["bad", "not connected", null, null]);
  // 0.14.0: Redeploy… (the remediation on demand) and the Windows chain (no policy turns secure DNS off) come first
  // 0.15.0: no configuration deployment yet (this fixture has the install only) — the lane offers one
  assert.deepStrictEqual(actKeys(W), ["winrun", "wincfg", "jump", "winswap", "groups", "scope-win"]);
  const allowed = W.stages.find((s) => s.k === "Licence");
  assert.strictEqual(allowed.st, "warn");
  assert.match(allowed.text, /^Not in the licence — .*this tenant holds Windows Business \(Business Premium\)/);
  assert.match(allowed.sub, /using it outside the licence is your choice/);
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
  assert.deepStrictEqual(actKeys(W), ["winrun", "wincfg", "jump", "groups", "scope-win"]);
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

// ---- 0.12.0: Monitor — after setup, the traffic (18 Oct 2026) ----
const monRaw = (over) => Object.assign({ period: "24h", start: "2026-10-18T00:00:00Z", end: "2026-10-19T00:00:00Z", readAt: 1, sources: { usage: "ok", devices: "ok", traffic: "ok", alerts: "ok", signIns: "ok" }, usage: [], devices: [], traffic: { rows: [], next: null }, alerts: [], signIns: [] }, over || {});

test("0.12.0 Monitor: devices connected, not seen and outside the groups; client versions; the tiles", () => {
  const m = Gsa.model(okRaw(), [block()]); // LT-1 (d1) and LT-2 (d2) in the Windows group
  const s = Gsa.monitor(m, monRaw({
    devices: [{ deviceId: "d1", displayName: "LT-1", operatingSystem: "Windows 11", lastAccessDateTime: "2026-10-18T22:00:00Z" }, { deviceId: "x9", displayName: "LT-9", operatingSystem: "Windows 11", lastAccessDateTime: "2026-10-18T21:00:00Z" }],
    traffic: { rows: [{ createdDateTime: "2026-10-18T22:00:00Z", deviceId: "D1", agentVersion: "2.31.125", userPrincipalName: "a@x" }, { createdDateTime: "2026-10-18T21:00:00Z", deviceId: "x9", agentVersion: "2.28.96", userPrincipalName: "b@x" }], next: "https://graph.microsoft.com/beta/networkAccess/logs/traffic?$skiptoken=1" },
  }));
  assert.deepStrictEqual(s.counts, { expected: 2, seenExpected: 1, connected: 1, silent: 0, never: 1, outside: 1 });
  assert.deepStrictEqual(s.devices.map((d) => [d.name, d.st]), [["LT-2", "never"], ["LT-9", "outside"], ["LT-1", "connected"]]);
  assert.strictEqual(s.devices.find((d) => d.name === "LT-1").ver, "2.31.125", "the traffic row's device id matched in any case");
  assert.deepStrictEqual(s.versions.winOld.map((d) => d.name), ["LT-9"]);
  const tile = (k) => s.tiles.find((t) => t.k === k);
  assert.deepStrictEqual([tile("dev").n, tile("dev").of, tile("dev").st], ["1", " / 2", "warn"]);
  assert.strictEqual(tile("ver").st, "warn");
  assert.ok(s.trafficNext);
  // 0.13.0: okRaw keeps the demo group assigned and its app visible — the My Apps line comes last
  assert.deepStrictEqual(s.attention.map((a) => a.tag), ["never", "outdated", "my apps"]);
  // 7 days: a group device seen earlier in the period is silent
  const s7 = Gsa.monitor(m, monRaw({ period: "7d", start: "2026-10-12T00:00:00Z", devices: [{ deviceId: "d2", lastAccessDateTime: "2026-10-15T10:00:00Z" }] }));
  assert.strictEqual(s7.devices.find((d) => d.deviceId === "d2").st, "silent");
});

test("0.12.0 Monitor: through GSA, around the tunnel, blocked, the token alert first, a drop against a week earlier", () => {
  const m = Gsa.model(okRaw(), [block()]), g = m.guards[0].id;
  const si = (o) => Object.assign({ createdDateTime: "2026-10-18T10:00:00Z", userId: "u1", userPrincipalName: "a@x", appDisplayName: "Exchange", status: { errorCode: 0 }, deviceDetail: { deviceId: "d1", operatingSystem: "Windows10" }, appliedConditionalAccessPolicies: [{ id: g, result: "notApplied", conditionsNotSatisfied: "location" }] }, o);
  const s = Gsa.monitor(m, monRaw({
    signIns: [
      si({ isThroughGlobalSecureAccess: true }),
      si({ isThroughGlobalSecureAccess: true, createdDateTime: "2026-10-18T11:00:00Z" }),
      si({ isThroughGlobalSecureAccess: false, deviceDetail: { deviceId: "d2", displayName: "LT-2", operatingSystem: "Windows10" }, status: { errorCode: 53003 }, appliedConditionalAccessPolicies: [{ id: g, result: "failure", conditionsNotSatisfied: "none" }] }),
      si({ isThroughGlobalSecureAccess: false, deviceDetail: { displayName: "MB", operatingSystem: "MacOs" }, appliedConditionalAccessPolicies: [] }),
      si({ isThroughGlobalSecureAccess: false, userId: "u9", userPrincipalName: "z@x", deviceDetail: { operatingSystem: "Ios" }, appliedConditionalAccessPolicies: [] }),
    ],
    alerts: [{ alertType: "deviceTokenInconsistency", creationDateTime: "2026-10-18T12:00:00Z" }, { alertType: "crossTenantAnomaly" }],
    usage: [{ timeStampDateTime: "2026-10-11T10:00:00Z", totalTrafficCount: 600 }, { timeStampDateTime: "2026-10-18T10:00:00Z", totalTrafficCount: 50 }, { timeStampDateTime: "2026-10-18T11:00:00Z", totalTrafficCount: 500 }],
  }));
  const tile = (k) => s.tiles.find((t) => t.k === k);
  assert.deepStrictEqual([s.signIns.inScope, s.signIns.inScopeVia], [3, 2]);
  assert.deepStrictEqual([tile("via").n, tile("via").st], ["66.7", "bad"]);
  assert.deepStrictEqual(s.signIns.around.map((x) => x.deviceDetail.displayName), ["MB"], "a phone never tunnels — it is not around the tunnel");
  assert.deepStrictEqual([s.signIns.blocked, s.signIns.blockedUsers], [1, [["a@x", 1]]]);
  assert.deepStrictEqual([tile("token").n, tile("token").st], ["1", "bad"]);
  assert.deepStrictEqual(s.heartbeat.points.map((x) => [x.v, x.low]), [[50, true], [500, false]], "the week before the period is read to compare, not shown");
  assert.deepStrictEqual(s.attention.map((a) => a.tag), ["token", "drop", "around", "never", "blocked", "tenants", "my apps"]);
});

test("0.12.0 Monitor: the mode switch, the prompt, the board, the log filter", () => {
  const m = Gsa.model(okRaw(), [block()]);
  assert.strictEqual(Gsa.setupDone(m), true);
  assert.strictEqual(Gsa.setupDone(Gsa.model(Gsa.demo(), [])), false);
  assert.match(Gsa.render(m, {}), /data-gsamode="setup" aria-selected="true">🧩 Setup <span>/);
  const empty = Gsa.renderMonitor(m, null, {});
  assert.match(empty, /data-gsamonread>📈 Read the traffic/);
  assert.match(empty, /NetworkAccess-Reports\.Read\.All/);
  assert.match(Gsa.renderMonitor(m, null, { monBusy: true, monRead: 1200 }), /1,200 sign-ins so far/);
  const s = Gsa.monitor(m, monRaw({ traffic: { rows: [{ createdDateTime: "2026-10-18T22:00:00Z", deviceId: "d1", userPrincipalName: "a@x", destinationFQDN: "outlook.office365.com", trafficType: "microsoft365", action: "allow", initiatingProcessName: "olk.exe", sentBytes: 4096, receivedBytes: 2097152 }, { createdDateTime: "2026-10-18T21:00:00Z", deviceId: "d2", userPrincipalName: "b@x", destinationFQDN: "contoso.sharepoint.com", trafficType: "microsoft365", action: "block" }], next: null } }));
  const html = Gsa.renderMonitor(m, s, { period: "24h" });
  assert.match(html, /Setup complete — watching the traffic/);
  assert.match(html, /data-gsatile="dev"/);
  assert.match(html, /outlook\.office365\.com/);
  assert.match(html, /4 KB \/ 2\.0 MB/);
  assert.match(html, /class="fchip active" data-gsaperiod="24h"/);
  assert.match(html, /data-gsamode="monitor" aria-selected="true">📈 Monitor <span>live/);
  const f = Gsa.monLogRows(s, { q: "sharepoint" });
  assert.strictEqual(f.n, 1); assert.match(f.count, /^1 of 2 loaded/);
  assert.strictEqual(Gsa.monLogRows(s, { action: "block" }).n, 1);
  assert.strictEqual(Gsa.monLogRows(s, { q: "LT-1" }).n, 1, "matches the device name, not only its id");
});

test("0.12.0 Monitor: a refused source is named, never counted; the demo read", () => {
  const m = Gsa.model(Gsa.demo(), []);
  const s = Gsa.monitor(m, monRaw({ sources: { usage: "403", devices: "403", traffic: "Graph request failed (403)", alerts: "403", signIns: "ok" } }));
  assert.strictEqual(s.tiles.find((t) => t.k === "token").st, "na");
  assert.match(s.tiles.find((t) => t.k === "ver").sub, /not read — Graph request failed \(403\)/);
  assert.match(Gsa.renderMonitor(m, s, {}), /Not read: the heartbeat — 403/);
  const md = Gsa.model(Gsa.demo(), [Gsa.demoPolicy()]);
  const sd = Gsa.monitor(md, Gsa.demoMonitor(md, "24h", "2026-10-17T20:00:00.000Z", "2026-10-18T20:00:00.000Z"));
  assert.deepStrictEqual([sd.signIns.around.length, sd.signIns.would, sd.heartbeat.lows.length], [1, 1, 1]);
  assert.deepStrictEqual(sd.versions.winOld.map((d) => d.name), ["LT-DEMO-09"]);
  assert.ok(sd.devices.some((d) => d.name === "LT-DEMO-09" && d.st === "outside"));
});

test("0.13.0 My Apps: the profile's app shows for the assigned group, hides on a tag, the step stays as it was", () => {
  const by = (raw) => Gsa.model(raw, [block()]).links.find((l) => l.k === "profile");
  const shown = by(okRaw());
  assert.strictEqual(shown.st, "ok", "the tile is cosmetic — it never changes step 3");
  assert.deepStrictEqual([shown.myApps.known, shown.myApps.hidden, shown.myApps.shown, shown.myApps.who], [true, false, true, "1 group"]);
  assert.strictEqual(shown.fix3, "hideapp");
  assert.strictEqual(shown.badge, "in My Apps");
  assert.match(shown.note, /shown in My Apps to them/);
  const hid = by(okRaw({ sp: Object.assign({}, okRaw().sp, { tags: ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"] }) }));
  assert.deepStrictEqual([hid.myApps.hidden, hid.myApps.shown, hid.fix3, hid.badge], [true, false, "showapp", null]);
  assert.match(hid.note, /hidden from My Apps/);
  // all users and nobody assigned: no tile, nothing to hide
  const all = by(okRaw({ assigned: [] }));
  assert.deepStrictEqual([all.myApps.shown, all.fix3, all.badge], [false, null, null]);
  // tags not returned by the read: not known, nothing offered
  const r = okRaw(); delete r.sp.tags;
  const unk = by(r);
  assert.deepStrictEqual([unk.myApps.known, unk.fix3, unk.badge], [false, null, null]);
  assert.doesNotMatch(unk.note, /My Apps/);
});

test("0.13.0 My Apps: the tag list keeps every other tag; the preview, the board and Monitor offer the same fix", () => {
  assert.deepStrictEqual(Gsa.appTags(["A", "B"], true), ["A", "B", "HideApp"]);
  assert.deepStrictEqual(Gsa.appTags(["A", "HideApp", "B"], true), ["A", "B", "HideApp"], "never twice");
  assert.deepStrictEqual(Gsa.appTags(["A", "HideApp", "B"], false), ["A", "B"]);
  assert.deepStrictEqual(Gsa.appTags(undefined, false), []);
  const p = Gsa.preview("hideapp", { spId: "sp-1", tags: ["WindowsAzureActiveDirectoryIntegratedApp"] })[0].text;
  assert.match(p, /PATCH \/v1\.0\/servicePrincipals\/sp-1/);
  assert.match(p, /"WindowsAzureActiveDirectoryIntegratedApp",\s*"HideApp"/);
  assert.doesNotMatch(Gsa.preview("showapp", { spId: "sp-1", tags: ["X", "HideApp"] })[0].text, /"HideApp"/);
  // Assign: the tick adds the tag write for a pilot group, never for all users or an app already hidden
  const asg = (o) => Gsa.preview("assign", Object.assign({ group: "G", known: true, hidden: false, tags: [] }, o))[0].text;
  assert.match(asg({}), /Also hide ticked/);
  assert.doesNotMatch(asg({ hide: false }), /HideApp/);
  assert.doesNotMatch(asg({ allUsers: true }), /HideApp/);
  assert.doesNotMatch(asg({ hidden: true }), /HideApp/);
  for (const k of ["hideapp", "showapp"]) { const f = Gsa.FIXES[k]; assert.ok(f.title && f.impact && f.recovery && f.changes.length); assert.deepStrictEqual(f.scopes, ["Application.ReadWrite.All"]); }
  const m = Gsa.model(okRaw(), [block()]);
  const html = Gsa.render(m, { sel: "profile" });
  assert.match(html, /data-gsafix="hideapp"/);
  assert.match(html, /class="gsa-badge">in My Apps</);
  const s = Gsa.monitor(m, monRaw());
  const a = s.attention.find((x) => x.tag === "my apps");
  assert.strictEqual(a.fix, "hideapp");
  assert.match(a.sub, /GSA-SEC-U-M365Profile-Pilot see the GSA-Microsoft365trafficforwardingprofile tile/);
  assert.match(Gsa.renderMonitor(m, s, {}), /data-gsafix="hideapp"/);
  const hidden = Gsa.model(okRaw({ sp: Object.assign({}, okRaw().sp, { tags: ["HideApp"] }) }), [block()]);
  assert.ok(!Gsa.monitor(hidden, monRaw()).attention.some((x) => x.tag === "my apps"), "the line goes once hidden");
  assert.match(Gsa.render(hidden, { sel: "profile" }), /data-gsafix="showapp"/);
});

// ---- 0.14.0: the Windows chain, per-device stages, Redeploy (19 Oct 2026) ----
// Mihai: "where is the windows chain", "and where is the redeploy", "got
// installed but not windows config"; then "test it first against devcf".
const DEVCF_DNS_IDS = [
  // read on cloudfellows.dev with Lokka, 19 Oct: each definition and its child option
  "device_vendor_msft_policy_config_microsoft_edgev83diff~policy~microsoft_edge_dnsoverhttpsmode",
  "device_vendor_msft_policy_config_chromeintunev1~policy~googlechrome_dnsoverhttpsmode",
  "device_vendor_msft_policy_config_microsoft_edge~policy~microsoft_edge_builtindnsclientenabled",
  "device_vendor_msft_policy_config_chromeintunev1~policy~googlechrome_builtindnsclientenabled",
];
// the combined remediation and platform script ENCA wrote before 0.15.0 (the 32810 generator — the
// one deployed on Limon-IT, pilot, and devcf, locked down, on 18 Oct): install and settings in one
const LEGACY = require("./fixtures/gsa-win-combined-v1.json");
const remText = () => `${Gsa.detectScript()}\n${Gsa.remediationScript()}`;
const cfgText = (o) => `${Gsa.cfgDetectScript(o)}\n${Gsa.cfgRemediationScript(o)}`;
const limon19 = (o) => {
  // Limon-IT as read on 19 Oct: the remediation's detection on the Cloud PC
  // says installed, the client fetched its policy at 00:41Z, no tunnel token.
  // 0.15.0: by default as after Split… (install v2.0 + Configure v1.0, pilot);
  // { legacy: true } = the combined v1.0 deployed today
  const x = o || {};
  const r = limonIt();
  const h = r.healthScripts[0];
  h.contentText = x.legacy ? LEGACY.remPilot : remText();
  if (!x.legacy) {
    h.displayName = "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v2.0";
    r.healthScripts.push({ id: "hc", displayName: "Win - DHS - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.0", assigned: true, assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: W_GROUP }, runRemediationScript: true }], runSummary: { noIssueDetectedDeviceCount: 1 }, contentText: cfgText({}), runs: [{ id: "hc:mdm-1", detectionState: "success", remediationState: "skipped", preRemediationDetectionScriptOutput: x.missing ? "GSA client not installed - nothing to configure yet" : "GSA client 2.32.294; settings as required (pilot)", managedDevice: { id: "mdm-1", deviceName: "CPC-mihai-2L8IB", azureADDeviceId: null } }] });
  }
  h.runs = [{ id: "h:mdm-1", detectionState: x.missing ? "fail" : "success", remediationState: x.missing ? "remediationFailed" : "skipped", preRemediationDetectionScriptOutput: x.missing ? "GSA client not installed" : "GSA client 2.32.294 installed; settings as required", remediationScriptError: x.missing ? "download failed" : "", managedDevice: { id: "mdm-1", deviceName: "CPC-mihai-2L8IB", azureADDeviceId: null } }];
  r.sources.gsaAuth = "ok";
  r.gsaAuth = x.missing ? [] : [{ createdDateTime: "2026-10-19T00:41:00Z", appId: Gsa.ZTNA_CLIENT, appDisplayName: "ZTNA Policy Service Client", resourceDisplayName: "ZTNA Policy Service", deviceDetail: { deviceId: "CPC-1", displayName: "CPC-mihai-2L8IB" }, status: { errorCode: 0 } }];
  r.sources.winDns = "ok"; r.winDns = [];
  return r;
};

test("0.14.0 authIndex: the client's policy fetch and its tunnel token, per Entra device id; failures kept apart", () => {
  const ix = Gsa.authIndex({ sources: { gsaAuth: "ok" }, gsaAuth: [
    { createdDateTime: "2026-10-19T00:41:00Z", appId: Gsa.ZTNA_CLIENT, resourceDisplayName: "ZTNA Policy Service", deviceDetail: { deviceId: "A" }, status: { errorCode: 0 } },
    { createdDateTime: "2026-10-19T00:10:00Z", appId: Gsa.ZTNA_CLIENT, resourceDisplayName: "ZTNA Policy Service", deviceDetail: { deviceId: "a" }, status: { errorCode: 0 } },
    { createdDateTime: "2026-10-19T02:00:00Z", appId: Gsa.GSA_CLIENT_APP, appDisplayName: "Global Secure Access Client", resourceDisplayName: "Microsoft apps with Global Secure Access", deviceDetail: { deviceId: "b" }, status: { errorCode: 0 } },
    { createdDateTime: "2026-10-19T03:00:00Z", appId: Gsa.ZTNA_CLIENT, appDisplayName: "ZTNA Policy Service Client", resourceDisplayName: "ZTNA Policy Service", deviceDetail: { deviceId: "b" }, status: { errorCode: 50076, failureReason: "MFA required" } },
    { createdDateTime: "2026-10-19T03:00:00Z", appId: Gsa.ZTNA_CLIENT, deviceDetail: {}, status: { errorCode: 0 } },
  ] });
  assert.strictEqual(ix.read, true); assert.strictEqual(ix.map.size, 2);
  assert.deepStrictEqual(ix.map.get("a"), { policy: "2026-10-19T00:41:00Z", tunnel: "", fail: "", failAt: "" });
  const b = ix.map.get("b");
  assert.deepStrictEqual([b.policy, b.tunnel], ["", "2026-10-19T02:00:00Z"]);
  assert.match(b.fail, /ZTNA Policy Service Client → ZTNA Policy Service: MFA required/);
  const no = Gsa.authIndex({ sources: { gsaAuth: "Graph request failed (403)" } });
  assert.deepStrictEqual([no.read, no.err], [false, "Graph request failed (403)"]);
});

test("0.14.0 runIndex: Intune's run state per device — installed and the client version from the detection output, by Entra id or by name", () => {
  assert.deepStrictEqual(Gsa.runIndex({}).read, false, "no runs read → not read, never 'not installed'");
  assert.strictEqual(Gsa.runIndex({ runsErr: "403" }).err, "403");
  const ix = Gsa.runIndex({ runs: [
    { detectionState: "success", preRemediationDetectionScriptOutput: "GSA client 2.32.294 installed; settings as required", managedDevice: { id: "m1", deviceName: "CPC-mihai-2L8IB", azureADDeviceId: null } },
    { detectionState: "fail", remediationState: "remediationFailed", preRemediationDetectionScriptOutput: "GSA client not installed", remediationScriptError: "download failed", managedDevice: { id: "m2", deviceName: "LT-2", azureADDeviceId: "D2" } },
    { runState: "success", resultMessage: "", managedDevice: { id: "m3", deviceName: "LT-3", azureADDeviceId: "d3" } },
  ] });
  const a = ix.byName.get("cpc-mihai-2l8ib");
  assert.deepStrictEqual([a.installed, a.ver, a.managedId, a.failed], [true, "2.32.294", "m1", false]);
  assert.strictEqual(ix.byAad.size, 2, "a device with no Entra id is matched by name only");
  const b = ix.byAad.get("d2");
  assert.deepStrictEqual([b.installed, b.failed, b.err], [false, true, "download failed"]);
  assert.strictEqual(ix.byAad.get("d3").installed, true, "a platform script that ran successfully");
});

test("0.14.0/0.15.0 contentSettings: the four client settings, IPv4, the download and each script's part, read from ENCA's own scripts", () => {
  for (const lock of [false, true]) for (const ipv4 of [false, true]) {
    const rem = Gsa.contentSettings(cfgText({ lock, ipv4 }));
    const scr = Gsa.contentSettings(Gsa.cfgScript({ lock, ipv4 }));
    for (const c of [rem, scr]) assert.deepStrictEqual([c.known, c.mode, c.ipv4, c.installs, c.role], [true, lock ? "locked down" : "pilot", ipv4, false, "config"]);
    assert.deepStrictEqual([rem.checksClient, scr.checksClient], [true, false]);
  }
  for (const t of [remText(), Gsa.windowsScript()]) { const c = Gsa.contentSettings(t); assert.deepStrictEqual([c.role, c.known, c.aka, c.arm, c.wipes], ["install", false, true, true, false]); }
  for (const k of ["remPilot", "remLocked", "scriptPilot", "scriptLockedIpv4"]) assert.strictEqual(Gsa.contentSettings(LEGACY[k]).role, "both", k);
  const custom = Gsa.contentSettings("$want = @{ HideDisableButton = 1; HideSignOutButton = 0; HideDisablePrivateAccessButton = 1; RestrictNonPrivilegedUsers = 1 }");
  assert.deepStrictEqual([custom.known, custom.mode], [true, "custom"]);
  assert.deepStrictEqual([Gsa.contentSettings("Write-Output hi").known, Gsa.contentSettings(null).mode], [false, ""]);
});

test("0.14.0 devcf: the four DNS settings by their settings catalog ids; the policy ENCA writes reads back as off", () => {
  assert.deepStrictEqual(Gsa.DNS_SETTINGS.map((d) => d.def), DEVCF_DNS_IDS);
  const body = Gsa.winDnsBody({ rel: "R26.10" }, ["edgeDoh", "chromeDoh", "edgeDns", "chromeDns"]);
  assert.strictEqual(body.name, "Win - DCP - Device Configuration - D - GSA Browser DNS - R26.10 - v1.0");
  assert.deepStrictEqual([body.platforms, body.technologies], ["windows10", "mdm"]);
  const edge = body.settings[0].settingInstance;
  assert.strictEqual(edge.choiceSettingValue.value, `${DEVCF_DNS_IDS[0]}_1`);
  // devcf 19 Oct: the child is <id>_dnsoverhttpsmode, the option <id>_dnsoverhttpsmode_off ("Disable DNS-over-HTTPS")
  assert.deepStrictEqual(edge.choiceSettingValue.children[0].settingDefinitionId, `${DEVCF_DNS_IDS[0]}_dnsoverhttpsmode`);
  assert.deepStrictEqual(edge.choiceSettingValue.children[0].choiceSettingValue.value, `${DEVCF_DNS_IDS[0]}_dnsoverhttpsmode_off`);
  assert.strictEqual(body.settings[3].settingInstance.choiceSettingValue.value, `${DEVCF_DNS_IDS[3]}_0`);
  assert.match(body.description, /DNS-over-HTTPS must be off/);
  const back = Gsa.dnsCheck([Object.assign({ id: "p", assignments: [] }, body)]);
  assert.deepStrictEqual(Object.values(back.set).map((x) => x.off), [true, true, true, true]);
  // only what is missing goes into the policy
  assert.deepStrictEqual(Gsa.winDnsBody({}, ["chromeDoh"]).settings.map((x) => x.settingInstance.settingDefinitionId), [DEVCF_DNS_IDS[1]]);
  // a baseline that sets automatic: reported, never rewritten
  const auto = JSON.parse(JSON.stringify(Gsa.winDnsBody({}, ["edgeDoh"])));
  auto.name = "Win - Edge baseline";
  auto.settings[0].settingInstance.choiceSettingValue.children[0].choiceSettingValue.value = `${DEVCF_DNS_IDS[0]}_dnsoverhttpsmode_automatic`;
  const ck = Gsa.dnsCheck([auto]);
  assert.deepStrictEqual([ck.set.edgeDoh.off, ck.set.edgeDoh.mode, ck.set.edgeDoh.by], [false, "automatic", "Win - Edge baseline"]);
});

test("0.14.0 Windows chain: install, client settings, secure DNS (devcf: no policy turns it off), IPv4 optional", () => {
  const m = Gsa.model(limon19(), []), W = m.links.find((l) => l.k === "client").lanes.windows, ch = W.chain;
  assert.deepStrictEqual(ch.rows.map((r) => r.key), ["install", "settings", "dns", "ipv4"]);
  const [inst, set, dns, v4] = ch.rows;
  assert.deepStrictEqual([inst.found, inst.issues.length, inst.fix], [true, 0, "winrun"]);
  assert.match(inst.sub, /remediation · ⚠ not in the licence — your choice/);
  assert.match(inst.landed.text, /^1 of 1 installed · 0 failed · client 2\.32\.294/);
  // 0.15.0: the configuration is its own row — its own deployment, reach and runs
  assert.deepStrictEqual([set.found, set.name, set.sub, set.st], [true, "Win - DHS - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.0", "remediation · pilot · checks the client first", "ok"]);
  assert.deepStrictEqual([set.landed.st, set.landed.text, set.reach.text], ["ok", "1 of 1 as required", "INT-SEC-D-GSA-WIN-M365 — 1 Windows device"]);
  assert.deepStrictEqual([dns.st, dns.found], ["bad", false]);
  assert.match(dns.issues.map((i) => i.t).join(" | "), /Edge: no policy turns DNS-over-HTTPS off[\s\S]*Chrome: no policy turns DNS-over-HTTPS off[\s\S]*built-in DNS client is not turned off/);
  assert.deepStrictEqual([v4.optional, v4.st], [true, "na"]);
  assert.deepStrictEqual([ch.problems, ch.need], [1, ["edgeDoh", "chromeDoh", "edgeDns", "chromeDns"]]);
  const html = Gsa.render(m, { sel: "client" });
  assert.match(html, /id="gsaWin"[\s\S]*Windows chain — found by content/);
  assert.match(html, /data-gsafix="windns"/);
  // DNS set by a policy ENCA made → the row is ok, nothing more to create
  const r2 = limon19();
  r2.winDns = [Object.assign({ id: "p", assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: W_GROUP } }] }, Gsa.winDnsBody({}, ["edgeDoh", "chromeDoh", "edgeDns", "chromeDns"]))];
  const ch2 = Gsa.model(r2, []).links.find((l) => l.k === "client").lanes.windows.chain;
  assert.deepStrictEqual([ch2.rows[2].st, ch2.problems, ch2.need], ["ok", 0, []]);
  // DNS not read → the row says so and is never green
  const r3 = limon19(); r3.sources.winDns = "Graph request failed (403)";
  const d3 = Gsa.model(r3, []).links.find((l) => l.k === "client").lanes.windows.chain.rows[2];
  assert.deepStrictEqual([d3.st, d3.err], ["na", "Graph request failed (403)"]);
});

test("0.14.0 Limon-IT 19 Oct: installed, policy fetched, no tunnel — the lane says so and offers Redeploy per device", () => {
  const m = Gsa.model(limon19(), []), W = m.links.find((l) => l.k === "client").lanes.windows;
  const st = (k) => W.stages.find((s) => s.k === k);
  assert.deepStrictEqual([st("Installed").st, st("Installed").text], ["ok", "1 of 1 — client 2.32.294"]);
  assert.strictEqual(st("Ran (Intune)"), undefined, "Installed replaces the summary once run states are read");
  assert.strictEqual(st("Policy fetched").st, "ok");
  assert.match(st("Policy fetched").text, /^1 of 1 — CPC-mihai-2L8IB at /);
  assert.deepStrictEqual([st("Tunnel").st, st("Tunnel").text], ["bad", "0 of 1 — no token for the Microsoft traffic tunnel"]);
  assert.match(st("Tunnel").sub, /CPC-mihai-2L8IB fetched a policy without the Microsoft profile/);
  assert.deepStrictEqual([W.st, W.word], ["bad", "installed · no tunnel"]);
  assert.strictEqual(W.actions[0].fix, "winrun"); assert.strictEqual(W.actions[0].primary, true);
  const html = Gsa.render(m, { sel: "client" });
  assert.match(html, /<th>Client<\/th>/);
  assert.match(html, /CPC-mihai-2L8IB[\s\S]*?✓ 2\.32\.294[\s\S]*?policy /);
  assert.match(html, /data-gsafix="winrun" data-gsadev="mdm-1">Run now…/);
  // the client never installed: the lane names the first stage that fails
  const W2 = Gsa.model(limon19({ missing: true }), []).links.find((l) => l.k === "client").lanes.windows;
  assert.deepStrictEqual([W2.word, W2.stages.find((s) => s.k === "Installed").st], ["not installed", "bad"]);
  assert.match(W2.stages.find((s) => s.k === "Installed").sub, /failing: CPC-mihai-2L8IB \(download failed\)/);
  assert.strictEqual(W2.stages.find((s) => s.k === "Policy fetched").st, "na", "not installed comes first");
  // installed, never signed in
  const r3 = limon19(); r3.gsaAuth = [];
  assert.strictEqual(Gsa.model(r3, []).links.find((l) => l.k === "client").lanes.windows.word, "installed · not signed in");
});

test("0.14.0 Redeploy: a platform script gets a new version, never a per-device run; each write says its impact and way back", () => {
  const r = okRaw({ healthScripts: [] });
  r.scripts = [{ id: "w1", displayName: "Win - PSH - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: W_GROUP } }] }];
  r.seen = { days: 7, report: [], signIns: [] };
  const W = Gsa.model(r, []).links.find((l) => l.k === "client").lanes.windows;
  assert.ok(actKeys(W).includes("winredeploy")); assert.ok(!actKeys(W).includes("winrun"));
  for (const k of ["winrun", "winredeploy", "windns"]) assert.ok(Gsa.FIXES[k].impact && Gsa.FIXES[k].recovery, `${k} is described before it runs`);
  assert.deepStrictEqual(Gsa.FIXES.winrun.scopes, ["DeviceManagementManagedDevices.PrivilegedOperations.All", "DeviceManagementManagedDevices.Read.All"]);
  const run = Gsa.preview("winrun", { scriptId: "h1", sync: true, devs: [{ id: "m1", name: "CPC-1", on: true }, { id: "m2", name: "LT-2", on: false }] })[0].text;
  assert.match(run, /syncDevice   \(CPC-1\)[\s\S]*initiateOnDemandProactiveRemediation   \(CPC-1\)[\s\S]*"scriptPolicyId": "h1"/);
  assert.doesNotMatch(run, /LT-2/);
  const red = Gsa.preview("winredeploy", { name: "Win - PSH - X - R26.10 - v1.0", content: "Write-Output 1", scriptId: "w1" });
  assert.match(red[0].text, /^# redeploy \d{4}-\d\d-\d\d — ENCA T56\r\nWrite-Output 1$/);
  assert.match(red.map((t) => t.text).join("\n"), /PATCH \/deviceManagement\/deviceManagementScripts\/w1[\s\S]*v1\.1/);
  const dns = Gsa.preview("windns", { need: ["chromeDoh"], targets: [{ "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-win" }] })[0].text;
  assert.match(dns, /POST \/deviceManagement\/configurationPolicies[\s\S]*googlechrome_dnsoverhttpsmode_dnsoverhttpsmode_off[\s\S]*\/assign[\s\S]*g-win/);
  assert.doesNotMatch(dns, /microsoft_edge/);
  assert.strictEqual(Gsa.b64("é"), "w6k=", "the redeployed script is UTF-8 base64");
});

// ---- 0.14.1: never New-Item -Force on the client's own key (19 Oct 2026) ----
// Learn (New-Item): with -Force an existing registry key is replaced by an empty
// one. The remediations ENCA wrote on Limon-IT and devcf ran it on
// HKLM\SOFTWARE\Microsoft\Global Secure Access Client right after the install.
test("0.14.1: the scripts ENCA writes never re-create the client's key; the ones deployed before are flagged and not redeployed", () => {
  for (const lock of [false, true]) {
    // 0.15.0: only the configuration touches the key; the install never does
    const rem = Gsa.cfgRemediationScript({ lock }), scr = Gsa.cfgScript({ lock });
    for (const t of [rem, scr]) {
      assert.doesNotMatch(t.split("\r\n").filter((l) => !/^\s*#/.test(l)).join("\n"), /New-Item -Path \$key -Force/);
      assert.match(t, /if \(-not \(Test-Path \$key\)\) \{ New-Item -Path \$key \| Out-Null \}/);
    }
    assert.strictEqual(Gsa.contentSettings(cfgText({ lock })).wipes, false);
    assert.strictEqual(Gsa.contentSettings(scr).wipes, false);
    for (const t of [remText(), Gsa.windowsScript()]) assert.doesNotMatch(t, /\$key|Global Secure Access Client'/);
  }
  // the log folder's New-Item -ItemType Directory -Force is fine
  assert.strictEqual(Gsa.contentSettings("New-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null").wipes, false);
  // Limon-IT as deployed (pilot, v1.0): the old line is there
  const r = limon19({ legacy: true });
  assert.match(r.healthScripts[0].contentText, /\n  New-Item -Path \$key -Force \| Out-Null/);
  assert.strictEqual(Gsa.contentSettings(r.healthScripts[0].contentText).wipes, true);
  const W = Gsa.model(r, []).links.find((l) => l.k === "client").lanes.windows;
  const inst = W.chain.rows[0];
  assert.strictEqual(inst.st, "bad");
  assert.match(inst.issues.map((i) => i.t).join(" | "), /re-creates the client's registry key with New-Item -Force/);
  assert.ok(!actKeys(W).includes("winrun"), "Redeploy would run the wipe again — withheld");
  assert.ok(actKeys(W).includes("jump"), "the chain is one click away");
});

// ---- 0.15.0: installation and configuration split (19 Oct 2026) ----
// Mihai: "split installation from configuration ... make the configuration
// detect first if the client is installed ... separate to run and assign";
// then: [DEPRECATED] after the split yes, no mode in the name, one
// configuration only, install hourly and configuration daily.
test("0.15.0 the configuration scripts: the client checked first (remediation), written anyway (platform script), the key kept", () => {
  const d = Gsa.cfgDetectScript({}), r = Gsa.cfgRemediationScript({ ipv4: true }), p = Gsa.cfgScript({ lock: true });
  assert.match(d, /if \(-not \$app\) \{ Write-Output 'GSA client not installed - nothing to configure yet'; exit 0 \}/);
  assert.match(d, /settings differ: [\s\S]*exit 1/);
  assert.match(r, /if \(-not \$app\) \{ Write-Output 'GSA client not installed - skipped'; exit 0 \}/);
  assert.match(r, /DisabledComponents -Value 0x20/);
  assert.doesNotMatch(p, /\$app/, "a platform script runs once — it writes whether or not the client is there");
  for (const t of [r, p]) { assert.match(t, /if \(-not \(Test-Path \$key\)\) \{ New-Item -Path \$key \| Out-Null \}/); assert.strictEqual(Gsa.contentSettings(t).wipes, false); assert.doesNotMatch(t, /aka\.ms|Start-Process/); }
  // a split keeps the exact values a combined script wrote, custom ones too
  const vals = { HideDisableButton: 1, HideSignOutButton: 0, HideDisablePrivateAccessButton: 1, RestrictNonPrivilegedUsers: 0 };
  const c = Gsa.contentSettings(Gsa.cfgScript({ vals }));
  assert.deepStrictEqual([c.mode, c.vals], ["custom", vals]);
  const n = Gsa.names({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(n.remCfg, "Win - DHS - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.0", "no mode in the name (Mihai)");
  assert.strictEqual(n.winCfg, "Win - PSH - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.0");
  const b = Gsa.cfgRemediationBody({ rel: "R26.10", ver: "v1.0", lock: true });
  assert.strictEqual(b.displayName, n.remCfg);
  assert.match(b.description, /locked down: HideDisableButton 1, HideSignOutButton 1, HideDisablePrivateAccessButton 1, RestrictNonPrivilegedUsers 1/);
  assert.strictEqual(Buffer.from(b.remediationScriptContent, "base64").toString("utf8"), Gsa.cfgRemediationScript({ lock: true }));
  const sb = Gsa.cfgScriptBody({ rel: "R26.10", ver: "v1.0" });
  assert.deepStrictEqual([sb.displayName, sb.fileName, sb.runAsAccount], [n.winCfg, Gsa.CFG_FILE, "system"]);
  // the defaults: the install hourly, the configuration daily (Mihai)
  assert.match(Gsa.preview("winrem", {}).find((t) => t.id === "req").text, /Hourly/);
  assert.match(Gsa.preview("wincfg", {}).find((t) => t.id === "req").text, /Daily/);
  const tgt = { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" };
  assert.deepStrictEqual(Gsa.remediationAssignment(tgt, "daily").target, tgt, "a target as read is kept");
});

test("0.15.0 winRole and winCheck: install and configuration told apart by content; [DEPRECATED] left out; one configuration only", () => {
  assert.strictEqual(Gsa.winRole({ contentText: remText() }), "install");
  assert.strictEqual(Gsa.winRole({ contentText: cfgText({}) }), "config");
  assert.strictEqual(Gsa.winRole({ contentText: LEGACY.remPilot }), "both");
  assert.strictEqual(Gsa.winRole({ displayName: "Win - DHS - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.0" }), "config", "by name when the content was not read");
  assert.strictEqual(Gsa.winRole({ displayName: "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0" }), "install");
  const W = Gsa.model(limon19(), []).links.find((l) => l.k === "client").win;
  assert.deepStrictEqual([W.kind, W.combined, W.cfg && W.cfg.kind, W.cfgCount], ["rem", false, "rem", 1]);
  assert.match(W.name, /Install .* - v2\.0$/);
  // after the split: the old one, [DEPRECATED] and assigned to nobody, is never picked
  const r = limon19(); r.healthScripts.push({ id: "old", displayName: "[DEPRECATED] Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", assignments: [], assigned: false, contentText: LEGACY.remPilot });
  const W2 = Gsa.model(r, []).links.find((l) => l.k === "client").win;
  assert.deepStrictEqual([W2.obj.id, W2.deprecated.length, W2.combined], ["h", 1, false]);
  // a second assigned configuration is flagged: they would rewrite each other
  const r3 = limon19(); r3.healthScripts.push(Object.assign({}, r3.healthScripts[1], { id: "hc2", displayName: "Win - DHS - Device Security - D - Configure Global Secure Access Client - R26.10 - v1.1", contentText: cfgText({ lock: true }) }));
  const set3 = Gsa.model(r3, []).links.find((l) => l.k === "client").lanes.windows.chain.rows[1];
  assert.strictEqual(set3.st, "bad");
  assert.match(set3.issues.map((i) => i.t).join(" | "), /2 configurations are assigned — keep one/);
});

test("0.15.0 Limon-IT today: the combined v1.0 — Split… is the fix; its settings are read from it until then", () => {
  const m = Gsa.model(limon19({ legacy: true }), []), c = m.links.find((l) => l.k === "client"), W = c.lanes.windows;
  assert.deepStrictEqual([c.win.combined, c.win.cfg], [true, null]);
  const [inst, set] = W.chain.rows;
  assert.deepStrictEqual([inst.fix, inst.fixLabel, inst.st], ["winsplit", "Split…", "bad"]);
  assert.match(inst.issues.map((i) => i.t).join(" | "), /installs and configures in one — Split…/);
  assert.deepStrictEqual([set.found, set.sub, set.name], [true, "pilot · combined", "in the install remediation"]);
  assert.deepStrictEqual(actKeys(W), ["winsplit", "jump", "winswap", "groups", "scope-win"]);
  assert.strictEqual(W.actions[0].primary, true);
  assert.match(W.actions[0].sub, /the install as v2\.0 and the configuration, same groups; .* renamed \[DEPRECATED\]/);
  // what Split… sends: backup, install v2.0, configuration, both read back, then [DEPRECATED]
  const o = { kind: "rem", oldId: "h", oldName: c.win.name, installName: Gsa.majorName(c.win.name) };
  const tabs = Gsa.preview("winsplit", o);
  assert.deepStrictEqual(tabs.map((t) => t.id), ["det", "rem", "cdet", "crem", "req"]);
  assert.match(tabs.find((t) => t.id === "req").text, /a backup is downloaded first[\s\S]*Install Global Secure Access Client - R\d+\.\d+ - v2\.0[\s\S]*Configure Global Secure Access Client[\s\S]*read both back; only then:[\s\S]*"deviceHealthScriptAssignments": \[\][\s\S]*\[DEPRECATED\] Win - DHS/);
  assert.deepStrictEqual(Gsa.preview("winsplit", Object.assign({}, o, { kind: "script" })).map((t) => t.id), ["win", "cfg", "req"]);
  assert.match(Gsa.FIXES.winsplit.recovery, /Reassign the combined script from the backup/);
  assert.strictEqual(Gsa.majorName("Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", new Date(2026, 9, 19)), "Win - DHS - Device Security - D - Install Global Secure Access Client - R26.10 - v2.0");
  assert.strictEqual(Gsa.majorName("[DEPRECATED] Win - PSH - X - R26.6 - v3.1", new Date(2026, 9, 19)), "Win - PSH - X - R26.10 - v4.0");
  // the same for the platform script written before 0.15.0
  const r2 = okRaw({ healthScripts: [] }); r2.scripts = [{ id: "w1", displayName: "Win - PSH - Device Security - D - Install Global Secure Access Client - R26.10 - v1.0", assignments: [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: W_GROUP } }], contentText: LEGACY.scriptLockedIpv4 }];
  const W2 = Gsa.model(r2, []).links.find((l) => l.k === "client").lanes.windows;
  assert.deepStrictEqual([W2.chain.rows[0].fix, W2.chain.rows[3].found], ["winsplit", true]);
  assert.ok(!actKeys(W2).includes("winredeploy"), "a new version of a combined script would wipe again");
});

test("0.15.0 no configuration yet: the chain and the lane offer it, as a remediation or a platform script", () => {
  const r = limon19(); r.healthScripts.pop();
  const W = Gsa.model(r, []).links.find((l) => l.k === "client").lanes.windows, set = W.chain.rows[1];
  assert.deepStrictEqual([set.found, set.st, set.fix], [false, "warn", "wincfg"]);
  assert.match(set.issues[0].t, /no configuration — the client runs with its defaults/);
  assert.ok(actKeys(W).includes("wincfg"));
  assert.strictEqual(W.chain.problems, 1, "a missing configuration is a warning, not a problem — DNS is the one");
  // nothing deployed at all: the install first, the configuration beside it
  const W0 = Gsa.model(okRaw({ healthScripts: [] }), []).links.find((l) => l.k === "client").lanes.windows;
  assert.deepStrictEqual(actKeys(W0).slice(0, 2), ["winrem", "wincfg"]);
  const tg = [{ "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-win" }];
  const rem = Gsa.preview("wincfg", { targets: tg, lock: true });
  assert.deepStrictEqual(rem.map((t) => t.id), ["cdet", "crem", "req"]);
  assert.match(rem[2].text, /Configure Global Secure Access Client[\s\S]*"groupId": "g-win"[\s\S]*Daily/);
  const scr = Gsa.preview("wincfg", { targets: tg, kind: "script" });
  assert.deepStrictEqual(scr.map((t) => t.id), ["cfg", "req"]);
  assert.match(scr[1].text, /deviceManagementScripts[\s\S]*Win - PSH - Device Security - D - Configure Global Secure Access Client/);
  // the configuration misses the install's group: devices there get the client without the settings
  const r2 = limon19(); r2.healthScripts[1].assignments = [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: "g-other" } }]; r2.groupNames["g-other"] = "Pilot";
  const set2 = Gsa.model(r2, []).links.find((l) => l.k === "client").lanes.windows.chain.rows[1];
  assert.match(set2.issues.map((i) => i.t).join(" | "), /misses INT-SEC-D-GSA-WIN-M365, the install's group — devices there get the client without these settings/);
});

test("0.15.0 Replace… carries the configuration to the platform scripts", () => {
  const tabs = Gsa.preview("winswap", { remId: "h", cfgRemId: "hc", withCfg: true, remGroups: ["INT-SEC-D-GSA-WIN-M365"] });
  assert.deepStrictEqual(tabs.map((t) => t.id), ["win", "cfg", "req"]);
  assert.match(tabs[2].text, /Configure Global Secure Access Client[\s\S]*deviceHealthScripts\/hc\/assign/);
  const W = Gsa.model(limon19(), []).links.find((l) => l.k === "client").lanes.windows;
  assert.match(W.actions.find((a) => a.fix === "winswap").sub, /platform scripts \(install and configuration\) — same groups, the remediations unassigned/);
});

test("32815: no filter is no filter — null, the all-zeros GUID and type none read the same (gimi: a DNS policy and the install remediation on one group)", () => {
  const ZERO = "00000000-0000-0000-0000-000000000000", G = "48cf006b-2c1a-4748-8c5d-e4dbda8e099b";
  const grp = (fid, ft) => [{ target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: G, deviceAndAppManagementAssignmentFilterId: fid, deviceAndAppManagementAssignmentFilterType: ft } }];
  const policyAsg = grp(null, "none"), scriptAsg = grp(ZERO, "none");
  assert.strictEqual(Gsa.realFilter(null, "none"), null);
  assert.strictEqual(Gsa.realFilter(ZERO, "none"), null);
  assert.strictEqual(Gsa.realFilter(ZERO, undefined), null);
  assert.deepStrictEqual(Gsa.realFilter("f-1", "include"), { id: "f-1", mode: "include" });
  const r = Gsa.reach(policyAsg, scriptAsg, { [G]: "INT-SEC-D-GSA-WIN-M365" });
  assert.strictEqual(r.st, "ok", r.text);
  assert.strictEqual(r.text, "same group");
  assert.strictEqual(Gsa.reach(scriptAsg, policyAsg, {}).st, "ok", "the other way round too");
  // a real filter on one side is still told apart
  assert.strictEqual(Gsa.reach(grp("f-1", "include"), scriptAsg, { [G]: "G" }).st, "warn");
  assert.match(Gsa.reach(grp("f-1", "include"), scriptAsg, { [G]: "G" }).text, /another filter than the script/);
  assert.strictEqual(Gsa.reach(grp("f-1", "include"), grp("f-1", "include"), {}).st, "ok");
  assert.strictEqual(Gsa.reach(grp("f-1", "include"), grp("f-2", "include"), {}).st, "warn");
  // All devices with the zero-GUID filter is All devices, not "with a filter"
  const allDev = [{ target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget", deviceAndAppManagementAssignmentFilterId: ZERO, deviceAndAppManagementAssignmentFilterType: "none" } }];
  assert.strictEqual(Gsa.reach(allDev, scriptAsg, {}).text, "All devices");
});

test("32817 the install floor: one constant, identical in detection and remediation; the platform script checks the signature", () => {
  assert.match(Gsa.GSA_MIN_VERSION, /^\d+\.\d+\.\d+\.\d+$/);
  const f = (t) => (t.match(/\$MinVersion = '([^']+)'/) || [])[1];
  assert.strictEqual(f(Gsa.detectScript()), Gsa.GSA_MIN_VERSION);
  assert.strictEqual(f(Gsa.remediationScript()), Gsa.GSA_MIN_VERSION);
  assert.match(Gsa.windowsScript(), /Get-AuthenticodeSignature/);
  assert.match(Gsa.remediationBody({}).description, new RegExp(Gsa.GSA_MIN_VERSION.replace(/\./g, "\\.")));
  // the analyzer still reads the new scripts as an install
  const c = Gsa.contentSettings(`${Gsa.detectScript()}\n${Gsa.remediationScript()}`);
  assert.deepStrictEqual([c.role, c.known, c.aka, c.arm, c.wipes], ["install", false, true, true, false]);
});
