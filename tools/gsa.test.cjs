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

test("the macOS shell script body: root, once, retries, the client installer from aka.ms", () => {
  const b = Gsa.macScriptBody({ rel: "R26.10", ver: "v1.0" });
  assert.strictEqual(b["@odata.type"], "#microsoft.graph.deviceShellScript");
  assert.strictEqual(b.runAsAccount, "system");
  assert.strictEqual(b.executionFrequency, "PT0S");
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
  assert.match(c.note, /3 without issue · 1 remediated · 0 failing/);
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
  assert.strictEqual(l.h, "3 policies");
  const html = Gsa.render(m, {});
  ["CA215-BLOCK-Internals-CN", "CA216-REQ-Admins-OnCN", "CA217-BLOCK-Guests-CN"].forEach((n) => assert.ok(html.includes(n), n));
  assert.ok(!html.includes("CA001-no-cn"));
  assert.match(html, /3 found · 1 on · 1 report-only · 1 off/);
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
  assert.strictEqual((html.match(/data-gsasel="/g) || []).length, 8 + 2, "eight nodes plus the two step buttons");
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
  for (const k of Object.keys(Gsa.FIXES)) assert.ok(Gsa.preview(k, {}).length, `${k} has a preview`);
});

test("32524 devcf (read 14 Oct): the chain as the live board showed it, and the remediation assigned with remediation OFF is detect only", () => {
  const raw = require("./fixtures/gsa-devcf-20261014.json");
  raw.macProfiles = Gsa.macProfiles(raw._macPolicies, raw._macConfigs);
  const m = Gsa.model(raw, raw._ca);
  const st = Object.fromEntries(m.links.map((l) => [l.k, l.st]));
  assert.deepStrictEqual(st, { licence: "ok", tenant: "ok", profile: "ok", signal: "ok", location: "ok", client: "warn", policy: "bad", proof: "wait" });
  const c = m.links.find((l) => l.k === "client");
  assert.ok(c.remOff);
  assert.match(c.note, /DETECT ONLY/);
  assert.strictEqual(c.fix, "winrem", "the fix is offered so the assignment can get remediation on");
  assert.strictEqual(m.links.find((l) => l.k === "licence").note, "4 of 4 used");
  assert.match(m.verdict.p, /Blocked at step 6 — GSA client/);
  assert.ok(Gsa.intune(raw).rows.find((r) => r.kind === "Remediation").remOff);
  raw.healthScripts[0].assignments[0].runRemediationScript = true;
  const m2 = Gsa.model(raw, raw._ca);
  assert.strictEqual(m2.links.find((l) => l.k === "client").st, "ok", "remediation on: the devices link is ready, as the board showed it");
  assert.match(m2.verdict.p, /Blocked at step 7 — 1 policy/);
});
