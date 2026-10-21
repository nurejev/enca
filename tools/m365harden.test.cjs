// T61 🛡 Securing M365 — js/m365harden.js (pure). node --test tools/m365harden.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const H = require("../js/m365harden.js");

// The 160 recommendations of the CIS Microsoft 365 Foundations Benchmark
// v7.0.0 with their lowest profile level — the catalog must carry each once
// (2.1.9 twice: the DNS half ENCA can see and the Exchange half the script reads).
const LVL = {"1.1.1":1,"1.1.2":1,"1.1.3":1,"1.1.4":1,"1.2.1":2,"1.2.2":1,"1.3.1":1,"1.3.2":2,"1.3.3":2,"1.3.4":1,"1.3.5":1,"1.3.6":2,"1.3.7":2,"1.3.8":2,"1.3.9":1,"2.1.1":2,"2.1.2":1,"2.1.3":1,"2.1.4":2,"2.1.5":2,"2.1.6":1,"2.1.7":2,"2.1.8":1,"2.1.9":1,"2.1.10":1,"2.1.11":2,"2.1.12":1,"2.1.13":1,"2.1.14":1,"2.1.15":1,"2.2.1":1,"2.4.1":1,"2.4.2":1,"2.4.3":2,"2.4.4":1,"2.4.5":1,"3.1.1":1,"3.2.1":1,"3.2.2":1,"3.2.3":1,"3.3.1":1,"4.1":1,"4.2":1,"5.1.2.1":1,"5.1.2.2":1,"5.1.2.3":1,"5.1.2.4":1,"5.1.2.5":2,"5.1.2.6":2,"5.1.3.1":1,"5.1.3.2":2,"5.1.3.3":1,"5.1.3.4":2,"5.1.4.1":2,"5.1.4.2":1,"5.1.4.3":1,"5.1.4.4":1,"5.1.4.5":1,"5.1.4.6":2,"5.1.5.1":2,"5.1.5.2":1,"5.1.5.3":2,"5.1.5.4":1,"5.1.5.5":1,"5.1.5.6":1,"5.1.6.1":2,"5.1.6.2":1,"5.1.6.3":2,"5.1.8.1":1,"5.2.2.1":1,"5.2.2.2":1,"5.2.2.3":1,"5.2.2.4":1,"5.2.2.5":2,"5.2.2.6":1,"5.2.2.7":1,"5.2.2.8":2,"5.2.2.9":1,"5.2.2.10":1,"5.2.2.11":1,"5.2.2.12":1,"5.2.2.13":1,"5.2.2.14":2,"5.2.2.15":2,"5.2.2.16":2,"5.2.2.17":1,"5.2.3.1":1,"5.2.3.2":1,"5.2.3.3":1,"5.2.3.4":1,"5.2.3.5":1,"5.2.3.6":1,"5.2.3.7":2,"5.2.3.8":1,"5.2.3.9":1,"5.2.3.10":1,"5.2.4.1":1,"5.2.4.2":2,"5.2.4.3":1,"5.2.4.4":1,"5.2.4.5":1,"5.3.1":2,"5.3.2":1,"5.3.3":1,"5.3.4":1,"5.3.5":1,"6.1.1":1,"6.1.2":1,"6.1.3":1,"6.2.1":1,"6.2.2":1,"6.2.3":1,"6.3.1":2,"6.3.2":1,"6.5.1":1,"6.5.2":1,"6.5.3":2,"6.5.4":1,"6.5.5":2,"7.2.1":1,"7.2.2":1,"7.2.3":1,"7.2.4":2,"7.2.5":2,"7.2.6":2,"7.2.7":1,"7.2.8":2,"7.2.9":1,"7.2.10":1,"7.2.11":1,"7.3.1":2,"8.1.1":2,"8.1.2":1,"8.2.1":2,"8.2.2":1,"8.2.3":1,"8.2.4":1,"8.4.1":1,"8.5.1":2,"8.5.2":1,"8.5.3":1,"8.5.4":1,"8.5.5":2,"8.5.6":2,"8.5.7":1,"8.5.8":2,"8.5.9":2,"8.6.1":1,"9.1.1":1,"9.1.2":1,"9.1.3":1,"9.1.4":1,"9.1.5":2,"9.1.6":1,"9.1.7":1,"9.1.8":1,"9.1.9":1,"9.1.10":1,"9.1.11":1,"9.1.12":1};

test("catalog: every benchmark recommendation, once, at its level; keys unique", () => {
  const ids = H.CATALOG.map((c) => c.cis);
  for (const [id, lvl] of Object.entries(LVL)) {
    const rows = H.CATALOG.filter((c) => c.cis === id);
    assert.ok(rows.length >= 1, `${id} missing`);
    for (const r of rows) assert.strictEqual(r.lvl, lvl, `${id} level`);
  }
  for (const id of ids) assert.ok(id in LVL, `${id} is not a v7.0.0 recommendation`);
  assert.strictEqual(new Set(ids).size, 160);
  assert.strictEqual(H.CATALOG.filter((c) => c.cis === "2.1.9").length, 2);
  const keys = H.CATALOG.map((c) => c.k);
  assert.strictEqual(new Set(keys).size, keys.length, "keys unique");
  for (const c of H.CATALOG) {
    assert.ok(H.AREAS.some(([a]) => a === c.area), `${c.k} area ${c.area}`);
    assert.ok(c.reach in H.REACH, `${c.k} reach`);
    if (c.reach === "fix") { assert.ok(c.fix && c.fix.scopes.length && c.fix.impact && c.fix.back, `${c.k} fix needs scopes, impact and way back`); }
    if (c.reach === "attest") assert.ok(c.portal || c.go, `${c.k} attest needs a place`);
    assert.ok(!/<\/?(b|i|em|strong|code|br)>/i.test(`${c.t} ${c.go || ""} ${c.fix ? c.fix.impact + c.fix.back : ""}`), `${c.k} plain text`);
  }
  const n = (r) => H.CATALOG.filter((c) => c.reach === r).length;
  assert.deepStrictEqual({ fix: n("fix"), check: n("check"), ca: n("ca"), dns: n("dns"), attest: n("attest"), ps: n("ps"), fabric: n("fabric") },
    { fix: 43, check: 9, ca: 17, dns: 3, attest: 16, ps: 61, fabric: 12 });
});

test("demo: the verdicts a reader would expect", () => {
  const m = H.judge(H.demo(), {});
  const st = (k) => m.rows.find((r) => r.k === k).st;
  assert.strictEqual(st("adm-ga-count"), "fail", "six GAs");
  assert.strictEqual(st("adm-cloud-only"), "fail", "one synced admin");
  assert.strictEqual(st("adm-licence"), "fail", "two admins hold E5");
  assert.strictEqual(st("grp-public"), "fail");
  assert.strictEqual(st("pw-never-expire"), "fail", "contoso.example expires at 90 days");
  assert.strictEqual(st("idle-timeout"), "fail");
  assert.strictEqual(st("forms-phishing"), "pass");
  assert.strictEqual(st("third-party-storage"), "fail", "service principal missing counts as open");
  assert.strictEqual(st("intune-byod-block"), "fail");
  assert.strictEqual(st("dev-laps"), "pass");
  assert.strictEqual(st("dev-quota"), "fail");
  assert.strictEqual(st("app-user-consent"), "fail");
  assert.strictEqual(st("app-no-secrets"), "fail");
  assert.strictEqual(st("ent-m365group-create"), "fail", "no Group.Unified object = default = users may create");
  assert.strictEqual(st("auth-lockout-threshold"), "pass", "defaults 10 / 60 s when no settings object");
  assert.strictEqual(st("auth-lockout-duration"), "pass");
  assert.strictEqual(st("auth-banned-list"), "fail");
  assert.strictEqual(st("auth-onprem-protect"), "na", "cloud-only");
  assert.strictEqual(st("auth-sms-voice"), "fail");
  assert.strictEqual(st("auth-companion"), "fail");
  assert.strictEqual(st("pim-standing"), "fail", "a third standing GA beyond two break-glass");
  assert.strictEqual(st("pim-pra-approval"), "pass");
  assert.strictEqual(st("pim-ga-approval"), "fail");
  assert.strictEqual(st("spo-sharing"), "fail");
  assert.strictEqual(st("dns-spf"), "pass");
  assert.strictEqual(st("dns-dmarc"), "fail", "p=none and no record on the initial domain");
  assert.strictEqual(st("dns-dkim"), "fail", "selector2 missing");
  assert.strictEqual(st("ent-linkedin"), "attested", "from the tenant record");
  assert.strictEqual(st("ent-kmsi"), "attest");
  assert.strictEqual(st("exo-smtp-auth"), "out");
  assert.strictEqual(st("fab-4"), "phase2");
  assert.strictEqual(st("auth-peruser-mfa"), "notread", "on demand");
  assert.ok(m.score.total > 30 && m.score.fixable > 15);
});

test("a source that was not granted says which permission — never a guess", () => {
  const S = H.demo(); S.spo = { ok: false, why: "not granted — needs SharePointTenantSettings.Read.All", scope: "spo" };
  const r = H.judge(S, {}).rows.find((x) => x.k === "spo-reshare");
  assert.strictEqual(r.st, "notread"); assert.match(r.now, /SharePointTenantSettings\.Read\.All/); assert.strictEqual(r.scope, "spo");
});

test("licence first: PIM rows on a tenant without P2 read Not licensed", () => {
  const S = H.demo(); S.skus.data[0].servicePlans = S.skus.data[0].servicePlans.filter((p) => p.servicePlanName !== "AAD_PREMIUM_P2");
  const m = H.judge(S, {});
  assert.strictEqual(m.rows.find((x) => x.k === "pim-ga-approval").st, "nolic");
  assert.strictEqual(m.rows.find((x) => x.k === "pim-pra-approval").st, "pass", "a pass stays a pass");
});

test("plan: two device-registration fixes are ONE whole-object PUT that keeps the quota", () => {
  const S = H.demo();
  const p = H.plan(S, ["dev-ga-localadmin", "dev-user-localadmin"], {});
  assert.strictEqual(p.steps.length, 1);
  const s = p.steps[0];
  assert.strictEqual(s.method, "PUT");
  assert.strictEqual(s.body.userDeviceQuota, 50, "a PUT without userDeviceQuota resets it to 0");
  assert.strictEqual(s.body.azureADJoin.localAdmins.enableGlobalAdmins, false);
  assert.match(s.body.azureADJoin.localAdmins.registeringUsers["@odata.type"], /noDeviceRegistrationMembership/);
  assert.ok(!("id" in s.body) && !("displayName" in s.body));
  assert.strictEqual(s.undo.azureADJoin.localAdmins.enableGlobalAdmins, true, "undo is the policy as it was");
  assert.deepStrictEqual(s.controls, ["dev-ga-localadmin", "dev-user-localadmin"]);
});

test("plan: authorization fixes merge; undo carries each original value", () => {
  const S = H.demo();
  const p = H.plan(S, ["ent-app-reg", "dev-bitlocker-read", "guest-invite", "app-user-consent"], {});
  assert.strictEqual(p.steps.length, 1);
  const b = p.steps[0].body;
  assert.strictEqual(b.defaultUserRolePermissions.allowedToCreateApps, false);
  assert.strictEqual(b.defaultUserRolePermissions.allowedToReadBitlockerKeysForOwnedDevice, false);
  assert.strictEqual(b.allowInvitesFrom, "adminsAndGuestInviters");
  assert.deepStrictEqual(b.defaultUserRolePermissions.permissionGrantPoliciesAssigned, ["ManagePermissionGrantsForOwnedResource.microsoft-dynamically-managed-permissions-for-team"], "owned-resource consent is kept");
  const u = p.steps[0].undo;
  assert.strictEqual(u.defaultUserRolePermissions.allowedToCreateApps, true);
  assert.strictEqual(u.allowInvitesFrom, "everyone");
  assert.strictEqual(u.defaultUserRolePermissions.permissionGrantPoliciesAssigned.length, 2);
});

test("plan: an input the fix needs is asked for, not guessed", () => {
  const S = H.demo();
  const p = H.plan(S, ["dev-join", "app-consent-workflow", "pim-ga-approval", "spo-domains", "auth-banned-list"], {});
  assert.strictEqual(p.steps.length, 0);
  assert.deepStrictEqual(p.refused.map((r) => r.k).sort(), ["app-consent-workflow", "auth-banned-list", "dev-join", "pim-ga-approval", "spo-domains"]);
  const ok = H.plan(S, ["dev-join", "auth-banned-list", "auth-lockout-threshold"], { "dev-join": { group: { id: "g-join" } }, "auth-banned-list": { words: ["contoso", "zoetermeer"] }, "auth-lockout-threshold": { number: 5 } });
  const put = ok.steps.find((s) => s.method === "PUT");
  assert.deepStrictEqual(put.body.azureADJoin.allowedToJoin.groups, ["g-join"]);
  const post = ok.steps.find((s) => s.method === "POST");
  assert.strictEqual(post.body.templateId, "5cf42378-d67d-4f36-ba46-e8b86229381d", "no settings object yet: ONE create for both password-rule fixes");
  const v = Object.fromEntries(post.body.values.map((x) => [x.name, x.value]));
  assert.deepStrictEqual(v, { EnableBannedPasswordCheck: "True", BannedPasswordList: "contoso\tzoetermeer", LockoutThreshold: "5" });
});

test("apply then undo: writes in order, undo reversed, a create is undone by DELETE", async () => {
  const S = H.demo();
  const p = H.plan(S, ["third-party-storage", "auth-banned-list", "spo-reshare"], { "auth-banned-list": { words: ["contoso"] } });
  const calls = [];
  const io = { patch: async (u, b) => calls.push(["PATCH", u, b]), put: async (u, b) => calls.push(["PUT", u, b]), post: async (u, b) => { calls.push(["POST", u, b]); return { id: u.includes("servicePrincipals") ? "sp-new" : "gs-new" }; }, del: async (u) => calls.push(["DELETE", u]) };
  const r = await H.apply(p, { io });
  assert.ok(r.results.every((x) => x.ok));
  assert.deepStrictEqual(calls.map((c) => `${c[0]} ${c[1]}`), ["POST /v1.0/servicePrincipals", "PATCH /v1.0/servicePrincipals/sp-new", "POST /v1.0/groupSettings", "PATCH /v1.0/admin/sharepoint/settings"]);
  assert.deepStrictEqual(r.undo.map((u) => `${u.method} ${u.url}`), ["PATCH /v1.0/admin/sharepoint/settings", "DELETE /v1.0/groupSettings/gs-new", "PATCH /v1.0/servicePrincipals/sp-new"]);
  assert.strictEqual(r.undo[0].body.isResharingByExternalUsersEnabled, true);
  calls.length = 0;
  await H.runUndo(r.undo, { io });
  assert.deepStrictEqual(calls.map((c) => c[0]), ["PATCH", "DELETE", "PATCH"]);
});

test("a failed write is reported, the rest still run", async () => {
  const S = H.demo();
  const p = H.plan(S, ["spo-reshare", "ent-app-reg"], {});
  const io = { patch: async (u) => { if (u.includes("sharepoint")) throw new Error("Graph 403 Forbidden"); } };
  const r = await H.apply(p, { io });
  assert.strictEqual(r.results.filter((x) => !x.ok).length, 1);
  assert.match(r.results.find((x) => !x.ok).why, /403/);
  assert.strictEqual(r.undo.length, 1, "only what was written can be undone");
});

test("the tenant record: compact, size-checked, round-trips", () => {
  const { body, size, full } = H.recordBody(null, "ent-kmsi", { kind: "attested", at: "2026-10-20", by: "mihai@limon-it.nl", why: "hidden in User settings | today" });
  assert.strictEqual(body.extensionName, "nl.limonit.enca.hardening");
  assert.ok(!full && size < 400);
  const back = H.parseRecord(body);
  assert.deepStrictEqual(back["ent-kmsi"], { kind: "attested", at: "2026-10-20", by: "mihai", why: "hidden in User settings   today" });
  let rec = body;
  for (let i = 0; i < 40; i++) rec = H.recordBody(rec, `k${i}`, { kind: "accepted", at: "2026-10-20", by: "someone.long.name", why: "x".repeat(60) }).body;
  assert.ok(H.recordBody(rec, "one-more", { kind: "accepted", at: "2026-10-20", by: "a", why: "b" }).full, "past 2 KB the write is refused");
});

test("the PowerShell script reads only, covers every PowerShell row, and its result loads back", () => {
  const ps = H.psScript({ tenantId: "t-1", spoAdminUrl: "https://contoso-admin.sharepoint.com", build: "beta" });
  for (const c of H.CATALOG.filter((x) => x.reach === "ps")) assert.ok(ps.includes(`Invoke-EncaCheck '${c.k}'`), c.k);
  const writes = ps.match(/\b(Set|New|Remove|Update|Enable|Disable|Add|Clear|Start|Stop|Grant|Revoke)-[A-Z][A-Za-z]+/g) || [];
  assert.deepStrictEqual(writes.filter((w) => w !== "Set-Content"), [], "only Get-* against the tenant (Set-Content writes the local JSON)");
  assert.ok(ps.indexOf("Connect-IPPSSession") < ps.indexOf("Connect-ExchangeOnline"), "IPPS first");
  const bad = H.parsePs(JSON.stringify({ schema: "enca-m365-ps/1", tenantId: "other", results: {} }), "t-1");
  assert.strictEqual(bad.ok, false);
  const good = H.parsePs("﻿" + JSON.stringify({ schema: "enca-m365-ps/1", tenantId: "t-1", ranAt: "2026-10-20T10:00:00Z", results: { "exo-smtp-auth": { pass: false, now: "SmtpClientAuthenticationDisabled False" }, "nope": { pass: true } } }), "t-1");
  assert.ok(good.ok); assert.deepStrictEqual(Object.keys(good.data.results), ["exo-smtp-auth"]);
  const S = H.demo(); S.ps = good;
  const r = H.judge(S, {}).rows.find((x) => x.k === "exo-smtp-auth");
  assert.strictEqual(r.st, "fail"); assert.match(r.now, /False/);
});

test("Intune settings go back whole, the check-in threshold always 1–120 (devcf 400, 33010)", () => {
  const S = H.demo(); S.intune.data = { "@odata.context": "x", secureByDefault: false, enhancedJailBreak: true };
  const s = H.plan(S, ["intune-secure-default"], {}).steps[0];
  assert.strictEqual(s.method, "PATCH");
  assert.deepStrictEqual(s.body, { settings: { secureByDefault: true, enhancedJailBreak: true, deviceComplianceCheckinThresholdDays: 30, isScheduledActionEnabled: true } });
  assert.strictEqual(s.undo.settings.secureByDefault, false);
  S.intune.data.deviceComplianceCheckinThresholdDays = 45;
  assert.strictEqual(H.plan(S, ["intune-secure-default"], {}).steps[0].body.settings.deviceComplianceCheckinThresholdDays, 45);
});

test("DNS verdicts", () => {
  assert.deepStrictEqual(H.spfVerdict({ spf: ["v=spf1 include:spf.protection.outlook.com ~all"] })[0], true);
  assert.deepStrictEqual(H.spfVerdict({ spf: ["v=spf1 include:spf.protection.outlook.com ?all"] })[0], false);
  assert.deepStrictEqual(H.spfVerdict({ spf: ["v=spf1 a", "v=spf1 b"] })[0], false);
  assert.deepStrictEqual(H.spfVerdict({ spf: ["v=spf1 redirect=_spf.example"], spfRedirect: "v=spf1 ip4:1.2.3.4 -all" })[0], true);
  assert.deepStrictEqual(H.dmarcVerdict({ dmarc: ["v=DMARC1; p=reject; rua=mailto:a@b; ruf=mailto:a@b"] }), [true, "p=reject"]);
  assert.strictEqual(H.dmarcVerdict({ dmarc: ["v=DMARC1; p=quarantine; pct=50; rua=mailto:a@b; ruf=mailto:a@b"] })[0], false);
});

test("the CA rows come from the 📐 engine's verdicts", () => {
  const ca = { results: [{ id: "5.2.2.3", status: "pass", policies: ["CA001 block legacy"] }, { id: "5.2.2.2", status: "reportonly", policies: ["CA002"] }, { id: "5.2.2.12", status: "fail", policies: [], near: [{ name: "CA020", missing: ["state: enabled"] }] }] };
  const m = H.judge(H.demo(), { ca });
  const st = (k) => m.rows.find((r) => r.k === k);
  assert.strictEqual(st("ca-3").st, "pass"); assert.strictEqual(st("ca-2").st, "report"); assert.strictEqual(st("ca-12").st, "fail"); assert.match(st("ca-12").now, /CA020/);
});

test("markdown: CIS references only when the gate allows", () => {
  const m = H.judge(H.demo(), {});
  assert.ok(!/5\.1\.2\.2|Center for Internet Security/.test(H.markdown(m, { tenant: "x" })));
  assert.ok(/5\.1\.2\.2/.test(H.markdown(m, { tenant: "x", refs: true })));
});
