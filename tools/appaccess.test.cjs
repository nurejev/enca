// T60 🔑 App access review — js/appaccess.js (pure). node --test tools/appaccess.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const A = require("../js/appaccess.js");

const NOW = Date.parse("2026-10-18T10:00:00Z");
const G = A.GRAPH_APP;

test("tiers: by permission AND api, delegated capped at HIGH, the community table's blind spots", () => {
  assert.deepStrictEqual(A.tierOf("Sites.Selected", "app", "00000003-0000-0ff1-ce00-000000000000"), { tier: "low", cap: "scoped" }, "Sites.Selected is the good pattern — the community table rates it High by its root");
  assert.strictEqual(A.tierOf("DeviceManagementApps.ReadWrite.All", "app", G).tier, "ep");
  assert.strictEqual(A.tierOf("DeviceManagementApps.ReadWrite.All", "del", G).tier, "high", "as a user it is capped by the user's own role");
  assert.strictEqual(A.tierOf("RoleManagement.ReadWrite.Directory", "app", G).tier, "t0");
  assert.strictEqual(A.tierOf("Sites.FullControl.All", "del", G).tier, "high", "delegated Sites.* is Unranked in the community table");
  assert.strictEqual(A.tierOf("EWS.AccessAsUser.All", "del", "00000002-0000-0ff1-ce00-000000000000").tier, "high");
  assert.strictEqual(A.tierOf("Exchange.ManageAsApp", "app", "00000002-0000-0ff1-ce00-000000000000").tier, "med", "on its own a key, not a door");
  assert.strictEqual(A.tierOf("user_impersonation", "del", "797f4846-ba00-4fd7-ba43-dac1f8f63013").cap, "azure");
  assert.strictEqual(A.tierOf("openid", "del", G).tier, "low");
  assert.strictEqual(A.tierOf("Something.Read.All", "app", "x").tier, "med");
  assert.strictEqual(A.tierOf("Something.ReadWrite.All", "app", "x").tier, "high");
});

// a fake Graph for read(): the expand returns 20, the re-read returns all
function readIO(nPerms) {
  const res = { id: "res", appId: G, displayName: "Microsoft Graph", appRoles: Array.from({ length: nPerms }, (_, i) => ({ id: `r${i}`, value: i === 0 ? "RoleManagement.ReadWrite.Directory" : `X${i}.Read.All` })) };
  const assigns = Array.from({ length: nPerms }, (_, i) => ({ id: `a${i}`, appRoleId: `r${i}`, resourceId: "res" }));
  const sp = { id: "big", appId: "app-big", displayName: "Big app", appOwnerOrganizationId: "t1", appRoleAssignments: assigns.slice(0, 20) };
  const calls = [];
  return { calls, all: async (url) => {
    calls.push(url);
    if (/\/servicePrincipals\?\$select/.test(url)) return [res, sp].map((x) => Object.assign({}, x));
    if (/servicePrincipals\/big\/appRoleAssignments/.test(url)) return assigns;
    if (/oauth2PermissionGrants/.test(url)) return [];
    if (/roleAssignments|roleDefinitions|applications|delegatedPermissionClassifications/.test(url)) return [];
    return [];
  }, one: async (url) => { calls.push(url); if (/servicePrincipals\/res\?/.test(url)) return res; return {}; } };
}

test("read: an app that came back with exactly 20 application permissions is read again, paged — 88, not 20", async () => {
  const io = readIO(88);
  const raw = await A.read(io, {});
  const m = A.analyze(raw, { tenantId: "t1", now: NOW });
  const big = m.apps.find((a) => a.id === "big");
  assert.strictEqual(big.appPerms.length, 88, "the community report would have shown 20 of 88");
  assert.strictEqual(big.tier, "t0", "the Tier 0 permission beyond the first 20 is found");
  assert.deepStrictEqual(raw.recapped, [{ id: "big", n: 88 }]);
  assert.ok(io.calls.some((u) => /\/oauth2PermissionGrants\?\$top=999/.test(u)), "ONE tenant-wide grant list, not one call per service principal");
});

test("analyze (demo): one row per app, the queue, Microsoft's own app kept out of it, the flags", () => {
  const raw = A.demo(NOW), m = A.analyze(raw, { tenantId: raw.tenantId, now: NOW });
  const by = (n) => m.apps.find((a) => a.name === n);
  assert.strictEqual(m.kpi.t0, 4); assert.strictEqual(m.kpi.unverified, 3); assert.strictEqual(m.kpi.unused, 4); assert.strictEqual(m.kpi.secrets, 2);
  assert.ok(!m.apps.some((a) => a.id.startsWith("res-")), "resource-only service principals are not rows");
  const spfx = by("SharePoint Online Web Client Extensibility");
  assert.ok(spfx.ms && !spfx.queue, "Microsoft's own app is listed, never queued");
  const cli = by("Microsoft Graph Command Line Tools");
  assert.ok(cli.origin.devTool && cli.queue && cli.suggest === "restrict", "a Microsoft developer tool consented for everyone is reviewed, not trusted");
  assert.strictEqual(cli.origin.kind, "ms", "verified publisher Microsoft Corporation is Microsoft, whatever the owner tenant");
  const get = by("IntuneGet by UgurLabs.com");
  assert.strictEqual(get.tier, "ep"); assert.ok(get.flags.some((f) => f.k === "unverified") && get.flags.some((f) => f.k === "vendorkeys"));
  assert.ok(!get.flags.some((f) => f.k === "everyone"), "a delegated User.Read for everyone is not an every-user risk");
  assert.strictEqual(by("ENCA (Limon-IT)").origin.kind, "partner", "Limon-IT is a partner by default");
  assert.strictEqual(by("Exchange automation").tier, "high", "Exchange.ManageAsApp with Exchange Administrator opens every mailbox");
  assert.ok(by("Teams automation (old)").flags.some((f) => f.k === "duplicate"));
  const ps = by("Graph automation (PowerShell)");
  assert.ok(ps.flags.some((f) => f.k === "sharedcert"), "the same certificate written as base64 and as hex is one certificate");
  assert.ok(ps.flags.some((f) => f.k === "secret") && ps.flags.some((f) => f.k === "owners"));
  assert.strictEqual(by("Harvest uploader").tier, "low");
  assert.strictEqual(by("Intune Documentation").consentUsers.length, 1);
  const files = m.matrix.find((r) => r.key === "files");
  assert.deepStrictEqual(files.own.map((a) => a.name).sort(), ["Lokka MCP", "SharePoint automation"]);
});

test("origin: your org, partner (editable list), Microsoft, third-party verified or not", () => {
  const sp = (owner, vp, extra) => Object.assign({ appId: "x", appOwnerOrganizationId: owner, verifiedPublisher: vp ? { displayName: vp } : {} }, extra || {});
  assert.strictEqual(A.originOf(sp("t1"), "T1").kind, "org");
  assert.strictEqual(A.originOf(sp("e5a881ef-27f1-496c-a1ac-b9ef42f1dafa"), "t1").partner, "Dovilo");
  assert.strictEqual(A.originOf(sp("e813e829-283a-4b53-97cd-bdeb800c764a"), "t1").partner, "CloudFellows");
  assert.strictEqual(A.originOf(sp("e5a881ef-27f1-496c-a1ac-b9ef42f1dafa"), "t1", A.partnerMap([])).kind, "tp", "an emptied list makes them third-party");
  assert.strictEqual(A.originOf(sp("zz", "Contoso Ltd"), "t1").verified, true);
  assert.strictEqual(A.originOf(sp("zz"), "t1").verified, false);
  assert.strictEqual(A.originOf(sp("f8cdef31-a31e-4b4a-93e4-5f571e91255a"), "t1").kind, "ms");
});

test("notes stamp: written, parsed, replaces an earlier stamp, keeps what somebody else wrote, 1024 at most", () => {
  const line = A.stamp("Quarantined", { date: "2026-10-18", by: "adm-mimo", review: "2027-01-18", reason: "unverified · endpoint write" });
  assert.strictEqual(line, "ENCA T60 · Quarantined 2026-10-18 · adm-mimo · review 2027-01-18 · unverified endpoint write");
  const p = A.parseStamp(line);
  assert.deepStrictEqual([p.decision, p.date, p.by, p.review, p.reason], ["Quarantined", "2026-10-18", "adm-mimo", "2027-01-18", "unverified endpoint write"]);
  const notes = A.withStamp("Owner: Workplace team\nENCA T60 · Approved 2026-01-01", line);
  assert.deepStrictEqual(notes.split("\n"), [line, "Owner: Workplace team"]);
  assert.ok(A.withStamp("x".repeat(2000), line).length <= 1024);
  assert.strictEqual(A.parseStamp("Approved by nobody"), null);
});

// a fake directory for the writes
function writeIO(state) {
  const calls = [];
  const sps = state.sps, grants = state.grants || [], assigns = state.assigns || [];
  const spOf = (url) => sps.find((s) => url.includes(`/servicePrincipals/${s.id}`));
  return { calls,
    read: async (url) => { calls.push(["read", url]); if (/oauth2PermissionGrants\//.test(url)) { const g = grants.find((x) => url.endsWith(x.id)); return g ? Object.assign({}, g) : null; } if (/adminConsentRequestPolicy/.test(url)) return Object.assign({}, state.acrp); const s = spOf(url); return s && !s.deleted ? Object.assign({}, s) : null; },
    all: async (url) => { calls.push(["all", url]); if (/appRoleAssignments/.test(url)) return assigns.filter((a) => url.includes(a.principalId)); if (/oauth2PermissionGrants/.test(url)) return grants.filter((g) => decodeURIComponent(url).includes(g.clientId)); return []; },
    patch: async (url, body) => { calls.push(["patch", url, body]); if (state.forbid) throw new Error("Graph request failed (403): Authorization_RequestDenied"); if (/oauth2PermissionGrants\//.test(url)) { Object.assign(grants.find((x) => url.endsWith(x.id)), body); return; } Object.assign(spOf(url), body); },
    post: async (url, body) => { calls.push(["post", url, body]); if (/restore$/.test(url)) { const s = sps.find((x) => url.includes(x.id)); if (s) s.deleted = false; } return {}; },
    del: async (url) => { calls.push(["del", url]); if (/servicePrincipals\/[^/]+$/.test(url)) { spOf(url).deleted = true; return; } if (/oauth2PermissionGrants\//.test(url)) { const i = grants.findIndex((x) => url.endsWith(x.id)); grants.splice(i, 1); } },
    put: async (url, body) => { calls.push(["put", url, body]); Object.assign(state.acrp, body); },
  };
}
const ledger = () => ({ rows: {}, stopped: false, start() {}, done(i, d, st) { this.rows[i] = st; }, skip(i, d, st) { this.rows[i] = st; }, fail(i) { this.rows[i] = "failed"; }, part(i) { this.rows[i] = "partly"; } });

test("writes: quarantine reads before and after; never ENCA's own registration; never one of Microsoft's own apps; remove only what is quarantined", async () => {
  const state = { sps: [{ id: "s1", appId: "a1", accountEnabled: true, notes: "keep me" }, { id: "s2", appId: "self", accountEnabled: true }, { id: "s3", appId: "ms", accountEnabled: true }, { id: "s4", appId: "a4", accountEnabled: true }] };
  const io = writeIO(state), L = ledger();
  const ops = [
    { kind: "quarantine", app: { id: "s1", appId: "a1", name: "One" }, by: "adm-mimo" },
    { kind: "quarantine", app: { id: "s2", appId: "self", name: "ENCA" } },
    { kind: "quarantine", app: { id: "s3", appId: "ms", name: "Microsoft app", ms: true } },
    { kind: "remove", app: { id: "s4", appId: "a4", name: "Four" } },
    { kind: "quarantine", app: { id: "gone", appId: "g", name: "Gone" } },
  ];
  const r = await A.apply(ops, { io, ledger: L, selfAppId: "SELF", today: "2026-10-18" });
  assert.deepStrictEqual(r.map((x) => x.outcome), ["quarantined", "refused", "refused", "refused", "skipped"]);
  assert.strictEqual(state.sps[0].accountEnabled, false);
  assert.match(state.sps[0].notes, /^ENCA T60 · Quarantined 2026-10-18 · adm-mimo\nkeep me$/);
  assert.match(r[3].detail, /quarantine it first/);
  assert.ok(!io.calls.some((c) => c[0] === "patch" && /s2|s3/.test(c[1])), "no write to the refused apps");
  assert.deepStrictEqual(L.rows, { 0: "quarantined", 1: "refused", 2: "refused", 3: "refused", 4: "skipped" });
});

test("writes: remove revokes every grant, deletes, and keeps what it took so restore can give it back", async () => {
  const state = { sps: [{ id: "s1", appId: "a1", accountEnabled: false, notes: "" }], grants: [{ id: "g1", clientId: "s1", resourceId: "res", consentType: "AllPrincipals", scope: "User.Read Mail.Read" }], assigns: [{ id: "ar1", principalId: "s1", resourceId: "res", appRoleId: "r1" }] };
  const io = writeIO(state);
  const [r] = await A.apply([{ kind: "remove", app: { id: "s1", appId: "a1", name: "One" }, names: { r1: "Mail.Read" } }], { io });
  assert.strictEqual(r.outcome, "removed");
  assert.ok(io.calls.some((c) => c[0] === "del" && /res\/appRoleAssignedTo\/ar1$/.test(c[1])));
  assert.ok(state.sps[0].deleted && state.grants.length === 0);
  assert.deepStrictEqual(r.undo.map((u) => u.type), ["app", "del"]);
  assert.strictEqual(r.undo[0].value, "Mail.Read");
  const back = await A.restore({ id: "s1", name: "One", removed: true, undo: r.undo }, io);
  assert.strictEqual(back.outcome, "restored");
  assert.ok(io.calls.some((c) => c[0] === "post" && /deletedItems\/s1\/restore$/.test(c[1])));
  assert.ok(io.calls.some((c) => c[0] === "post" && /servicePrincipals\/s1\/appRoleAssignments$/.test(c[1]) && c[2].appRoleId === "r1"));
  assert.ok(io.calls.some((c) => c[0] === "post" && /\/oauth2PermissionGrants$/.test(c[1]) && c[2].scope === "User.Read Mail.Read"));
});

test("writes: reduce takes only the chosen scopes off a grant; a 403 is the directory-role gate, said so", async () => {
  const state = { sps: [{ id: "s1", appId: "a1", accountEnabled: true }], grants: [{ id: "g1", clientId: "s1", resourceId: "res", consentType: "AllPrincipals", scope: "User.Read Mail.Read Files.Read.All" }] };
  const io = writeIO(state);
  const [r] = await A.apply([{ kind: "revoke", app: { id: "s1", appId: "a1", name: "One" }, revoke: [{ type: "del", grantId: "g1", scopes: ["Mail.Read", "Files.Read.All"] }] }], { io, today: "2026-10-18" });
  assert.strictEqual(r.outcome, "reduced");
  assert.strictEqual(state.grants[0].scope, "User.Read");
  assert.match(state.sps[0].notes, /^ENCA T60 · Reduced 2026-10-18/);
  const s2 = { sps: [{ id: "s1", appId: "a1", accountEnabled: true }], forbid: true };
  const [f] = await A.apply([{ kind: "quarantine", app: { id: "s1", appId: "a1", name: "One" } }], { io: writeIO(s2) });
  assert.strictEqual(f.outcome, "failed"); assert.match(f.detail, /Cloud Application Administrator or Application Administrator/);
});

test("writes: restrict assigns the group FIRST, then switches assignment on — never a lock-out", async () => {
  const state = { sps: [{ id: "s1", appId: "a1", accountEnabled: true, appRoleAssignmentRequired: false, appRoles: [{ id: "user-role", allowedMemberTypes: ["User"], displayName: "User", isEnabled: true }] }] };
  const io = writeIO(state);
  const [r] = await A.apply([{ kind: "restrict", app: { id: "s1", appId: "a1", name: "One" }, groupId: "grp1" }], { io });
  assert.strictEqual(r.outcome, "restricted");
  const iPost = io.calls.findIndex((c) => c[0] === "post"), iPatch = io.calls.findIndex((c) => c[0] === "patch");
  assert.ok(iPost >= 0 && iPost < iPatch, "assignment before assignment-required");
  assert.strictEqual(io.calls[iPost][2].appRoleId, "user-role", "an app that declares a user role gets it, not the default");
  const s2 = { sps: [{ id: "s1", appId: "a1", accountEnabled: true }] };
  const io2 = writeIO(s2); await A.apply([{ kind: "restrict", app: { id: "s1", appId: "a1", name: "One" }, groupId: "grp1" }], { io: io2 });
  assert.strictEqual(io2.calls.find((c) => c[0] === "post")[2].appRoleId, "00000000-0000-0000-0000-000000000000");
});

test("admin consent requests: PUT with the group's members as reviewers, read back; off keeps the reviewers", async () => {
  const state = { sps: [], acrp: { isEnabled: false, reviewers: [] } };
  const io = writeIO(state);
  const on = await A.setAcrp(io, true, "grp-appops", 14);
  assert.ok(on.ok);
  const put = io.calls.find((c) => c[0] === "put");
  assert.match(put[1], /\/v1\.0\/policies\/adminConsentRequestPolicy$/);
  assert.deepStrictEqual(put[2].reviewers, [{ query: "/groups/grp-appops/transitiveMembers/microsoft.graph.user", queryType: "MicrosoftGraph" }]);
  assert.strictEqual(put[2].requestDurationInDays, 14);
  const off = await A.setAcrp(io, false);
  assert.ok(off.ok); assert.strictEqual(state.acrp.reviewers.length, 1, "switching off keeps who would review");
});

test("settings: legacy consent is bad, Microsoft-managed is good, requests off is the fix", () => {
  const s = A.settingsOf({ authz: { defaultUserRolePermissions: { allowedToCreateApps: true, permissionGrantPoliciesAssigned: ["ManagePermissionGrantsForSelf.microsoft-user-default-legacy"] } }, acrp: { isEnabled: false, reviewers: [] }, classes: [] });
  const k = (x) => s.find((c) => c.k === x);
  assert.strictEqual(k("userconsent").sev, "bad"); assert.strictEqual(k("createapps").sev, "warn"); assert.ok(k("acrp").fixable);
  const t = A.settingsOf({ authz: { defaultUserRolePermissions: { permissionGrantPoliciesAssigned: ["ManagePermissionGrantsForSelf.microsoft-user-default-recommended"] } } });
  assert.strictEqual(t.find((c) => c.k === "userconsent").sev, "ok"); assert.strictEqual(t.find((c) => c.k === "acrp").sev, "unknown");
});

test("your own table (community CSV format) wins over ENCA's tier", () => {
  const custom = A.parseCustomCsv("Type,Permission,Privilege,Reason\nApplication,Directory.Read.All,High,Recon\nDelegated,Mail,Low,We allow it");
  const raw = A.demo(NOW), m = A.analyze(raw, { tenantId: raw.tenantId, now: NOW, custom });
  const p = m.apps.find((a) => a.name === "Lokka MCP").appPerms.find((x) => x.value === "Directory.Read.All");
  assert.strictEqual(p.tier, "high"); assert.strictEqual(p.custom, "Recon");
  assert.throws(() => A.parseCustomCsv("App,Perm\nx,y"), /Type, Permission, Privilege/);
});

test("report and CSV: every app, the matrix, the settings, plain text — no HTML", () => {
  const raw = A.demo(NOW), m = A.analyze(raw, { tenantId: raw.tenantId, now: NOW });
  const md = A.markdown(m, { tenant: "Contoso", build: "v2.0.6-beta.4" });
  assert.match(md, /^# App access review — Contoso/);
  assert.match(md, /## Decisions needed — 14/); assert.match(md, /## Who can do what/); assert.match(md, /Admin consent requests — off/);
  assert.match(md, /1 app\(s\) re-read past Graph's 20-item expand/);
  assert.doesNotMatch(md, /<\/?(b|i|code|span|div)\b/);
  const c = A.csv(m).split("\r\n");
  assert.strictEqual(c.length, m.apps.length + 1);
  assert.match(c[0], /^"App","AppId","Origin"/);
  assert.ok(A.permCsv(m).split("\r\n").length > m.apps.length);
});
