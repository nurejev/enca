// tools/trv2.test.cjs — T56 tenant restrictions v2 (js/trv2.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../js/trv2.js");

const OWN = "11111111-1111-1111-1111-111111111111";
const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const P = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const fresh = () => T.state({ tenantRestrictions: null }, [], { networkPacketTaggingStatus: "disabled" });
const allow = [{ tenantId: A, domain: "a.example", name: "Partner A" }, { tenantId: B, domain: "b.example", name: "Partner B" }];

test("no tenant names or ids in the code", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/trv2.js"), "utf8");
  assert.doesNotMatch(src, /limon|cloudfellows|trianti|leeuwendaal|perfetti|dovilo|020eb2d3/i);
});

test("order: partner creates and allows, then the default block, then enforcement", () => {
  const p = T.plan(fresh(), { allow, enforce: true }, { ownTenantId: OWN });
  assert.deepEqual(p.ops.map((o) => o.id), ["create:" + A, "allow:" + A, "create:" + B, "allow:" + B, "default-block", "utr-on"]);
  const def = p.ops.find((o) => o.id === "default-block");
  for (const id of ["allow:" + A, "allow:" + B]) assert.ok(def.requires.includes(id), id);
  assert.deepEqual(p.ops.at(-1).requires, ["default-block"]);
  assert.ok(p.canRun);
});

test("shapes: allow-all and block-all name both sides and the concrete targets", () => {
  const p = T.plan(fresh(), { allow }, { ownTenantId: OWN });
  const a = p.ops.find((o) => o.id === "allow:" + A).body.tenantRestrictions;
  assert.equal(a.usersAndGroups.accessType, "allowed");
  assert.deepEqual(a.usersAndGroups.targets, [{ target: "AllUsers", targetType: "user" }]);
  assert.deepEqual(a.applications.targets, [{ target: "AllApplications", targetType: "application" }]);
  const d = p.ops.find((o) => o.id === "default-block");
  assert.equal(d.method, "PATCH");
  assert.match(d.url, /\/v1\.0\/policies\/crossTenantAccessPolicy\/default$/);
  assert.equal(d.body.tenantRestrictions.applications.accessType, "blocked");
});

test("enforcement is a separate opt-in and goes to the beta networkAccess route", () => {
  const off = T.plan(fresh(), { allow }, { ownTenantId: OWN });
  assert.ok(!off.ops.some((o) => o.kind === "utr"));
  assert.ok(off.notes.some((n) => /nothing is blocked until/.test(n)));
  const on = T.plan(fresh(), { allow, enforce: true }, { ownTenantId: OWN });
  const u = on.ops.find((o) => o.kind === "utr");
  assert.match(u.url, /\/beta\/networkAccess\/settings\/crossTenantAccess$/);
  assert.equal(u.body.networkPacketTaggingStatus, "enabled");
});

test("an existing partner gets a PATCH, not a create, and keeps its before", () => {
  const raw = { usersAndGroups: { accessType: "blocked", targets: [{ target: "AllUsers", targetType: "user" }] }, applications: { accessType: "blocked", targets: [{ target: "AllApplications", targetType: "application" }] } };
  const st = T.state({ tenantRestrictions: null }, [{ tenantId: A, tenantRestrictions: raw }], {});
  const p = T.plan(st, { allow: [allow[0]] }, { ownTenantId: OWN });
  assert.ok(!p.ops.some((o) => o.id === "create:" + A));
  assert.deepEqual(p.ops.find((o) => o.id === "allow:" + A).before, raw);
});

test("already allowed and default already blocking: nothing to write", () => {
  const st = T.state({ tenantRestrictions: T.BLOCK_ALL() }, [{ tenantId: A, tenantRestrictions: T.ALLOW_ALL() }], { networkPacketTaggingStatus: "enabled" });
  const p = T.plan(st, { allow: [allow[0]], enforce: true }, { ownTenantId: OWN });
  assert.equal(p.ops.length, 0);
  assert.equal(p.canRun, false);
  assert.equal(T.verdict(st, { allow: [allow[0]] }, { ownTenantId: OWN }).state, "enforced");
});

test("an inheriting partner is a finding, and kept only when ticked", () => {
  const st = T.state({}, [{ tenantId: P, tenantRestrictions: null }], {});
  const p1 = T.plan(st, { allow }, { ownTenantId: OWN });
  assert.ok(p1.findings.some((f) => f.tenantId === P && f.sev === "warn"));
  assert.ok(!p1.ops.some((o) => o.tenantId === P));
  const p2 = T.plan(st, { allow, keepPartners: [P] }, { ownTenantId: OWN });
  assert.ok(p2.ops.some((o) => o.id === "keep:" + P));
  assert.ok(p2.ops.find((o) => o.id === "default-block").requires.includes("keep:" + P));
});

test("own tenant, bad ids, duplicates and the MSA tenant are refused from the list", () => {
  const n = T.normalizeAllow([
    { tenantId: OWN }, { tenantId: "nope" }, { domain: "not a domain" }, { tenantId: A }, { tenantId: A.toUpperCase() },
    { tenantId: T.MSA_TENANT }, {},
  ], OWN);
  assert.equal(n.ok.length, 1);
  assert.equal(n.refused.length, 6);
});

test("a domain without a tenant id blocks the run until it is looked up", () => {
  const p = T.plan(fresh(), { allow: [{ domain: "a.example" }] }, { ownTenantId: OWN });
  assert.equal(p.canRun, false);
  assert.ok(p.refusals.some((r) => /Look it up/.test(r)));
  assert.match(T.lookupUrl("a.example"), /findTenantInformationByDomainName\(domainName='a\.example'\)$/);
  const got = T.applyLookup({ domain: "a.example", name: "a.example" }, { tenantId: A.toUpperCase(), displayName: "Partner A" });
  assert.deepEqual(got, { tenantId: A, domain: "a.example", name: "Partner A" });
  assert.equal(T.applyLookup({ domain: "x.example" }, { tenantId: "junk" }), null);
});

test("an empty allowed list still plans, with a warning", () => {
  const p = T.plan(fresh(), { allow: [] }, { ownTenantId: OWN });
  assert.deepEqual(p.ops.map((o) => o.id), ["default-block"]);
  assert.ok(p.findings.some((f) => /No tenant is on the allowed list/.test(f.text)));
});

test("32708: Enforce is refused while no tenant is allowed — on the list or in the tenant", () => {
  const p = T.plan(fresh(), { allow: [], enforce: true }, { ownTenantId: OWN });
  assert.ok(p.refusals.some((r) => /Enforce needs at least one allowed tenant/.test(r)));
  assert.equal(p.canRun, false);
  // a partner already allow-all in the tenant counts (a second browser without the local list)
  const st = T.state({ tenantRestrictions: null }, [{ tenantId: P, tenantRestrictions: T.ALLOW_ALL() }], { networkPacketTaggingStatus: "disabled" });
  const q = T.plan(st, { allow: [], enforce: true }, { ownTenantId: OWN });
  assert.equal(q.refusals.length, 0);
  assert.ok(q.ops.some((o) => o.id === "utr-on"));
  // without Enforce an empty list still only writes the policy
  assert.equal(T.plan(fresh(), { allow: [] }, { ownTenantId: OWN }).refusals.length, 0);
});

test("32708: the card is optional and folded unless asked open; tenant allow-all partners are named", () => {
  const st = T.state({}, [{ tenantId: P, tenantRestrictions: T.ALLOW_ALL() }], { networkPacketTaggingStatus: "disabled" });
  const shut = T.card({ st, settings: { allow: [] } });
  assert.match(shut, /<details data-trv2fold>/);
  assert.match(shut, /class="tag">optional</);
  assert.match(shut, /not part of the chain or the verdict/);
  assert.match(shut, new RegExp("Also allowed in the tenant itself[^<]*" + P));
  assert.match(T.card({ st, settings: { allow: [] } }, { open: true }), /<details data-trv2fold open>/);
  assert.match(T.card({ err: "403" }), /optional/);
  assert.match(T.FIX.title, /optional/);
});

test("Microsoft accounts: blocked by the default, allowed only by their own entry", () => {
  const p = T.plan(fresh(), { allow, allowMsa: true }, { ownTenantId: OWN });
  assert.ok(p.ops.some((o) => o.id === "allow:msa" && o.url.endsWith(T.MSA_TENANT)));
  assert.ok(p.ops.find((o) => o.id === "default-block").requires.includes("allow:msa"));
});

test("effective: what a tenant's accounts get", () => {
  const st = T.state({ tenantRestrictions: T.BLOCK_ALL() }, [{ tenantId: A, tenantRestrictions: T.ALLOW_ALL() }, { tenantId: P, tenantRestrictions: null }], {});
  assert.equal(T.effective(st, A), "allowed");
  assert.equal(T.effective(st, P), "blocked");
  assert.equal(T.effective(st, B), "blocked");
  assert.equal(T.effective(fresh(), B), "allowed");
});

test("backup needs a tenant id; without a plan undo restores everything it holds, enforcement first", () => {
  const raw = { usersAndGroups: { accessType: "allowed", targets: [{ target: "AllUsers", targetType: "user" }] } };
  const st = T.state({ tenantRestrictions: null }, [{ tenantId: P, tenantRestrictions: raw }], { networkPacketTaggingStatus: "disabled" });
  assert.throws(() => T.backup(st, ""), /tenant id/);
  const bk = T.backup(st, OWN, "2026-10-17T00:00:00Z");
  const u = T.undoOps(bk, [A]);
  assert.deepEqual(u.map((o) => o.id), ["undo-utr", "undo-default", "undo-partner:" + P, "undo-create:" + A]);
  assert.equal(u[0].body.networkPacketTaggingStatus, "disabled");
  assert.equal(u[1].body.tenantRestrictions, null);
  assert.deepEqual(u[2].body.tenantRestrictions, raw);
  assert.equal(u[3].method, "DELETE");
  assert.throws(() => T.undoOps({}), /Not a tenant restrictions backup/);
});

test("backup with the plan: put back touches only what the run touched", () => {
  const blocked = T.BLOCK_ALL();
  const st = T.state({ tenantRestrictions: null }, [{ tenantId: B, tenantRestrictions: blocked }, { tenantId: P, tenantRestrictions: null }], { networkPacketTaggingStatus: "disabled" });
  const p = T.plan(st, { allow, enforce: false }, { ownTenantId: OWN });
  const bk = T.backup(st, OWN, null, p.ops);
  assert.deepEqual(bk.touched, { default: true, utr: false, created: [A] });
  assert.deepEqual(Object.keys(bk.partners), [B], "P was not touched, A did not exist");
  const u = T.undoOps(bk);
  assert.deepEqual(u.map((o) => o.id), ["undo-default", "undo-partner:" + B, "undo-create:" + A]);
  assert.deepEqual(u[1].body.tenantRestrictions, blocked);
});

test("card and preview for T56: escaped, the verdict word, the request list in order", () => {
  const st = T.state({}, [{ tenantId: P, tenantRestrictions: null }], { networkPacketTaggingStatus: "disabled" });
  const html = T.card({ st, settings: { allow: [{ tenantId: A, name: "<b>A</b>" }] } });
  assert.match(html, /id="gsaTrv2"/);
  assert.match(html, /gsa-st wait">not set up/);
  assert.match(html, /&lt;b&gt;A&lt;\/b&gt; \(allowed\)/);
  assert.match(html, /inherit the default: 1/);
  assert.match(html, /data-gsafix="trv2"/);
  assert.doesNotMatch(html, /<b>A<\/b>/);
  assert.match(T.card({ err: "403" }), /not read[\s\S]*403/);
  const pv = T.preview(T.plan(st, { allow, enforce: true }, { ownTenantId: OWN }));
  assert.match(pv[0].text, /^1\. POST \/v1\.0\/policies\/crossTenantAccessPolicy\/partners/);
  assert.match(pv[0].text, /PATCH \/beta\/networkAccess\/settings\/crossTenantAccess/);
  assert.ok(T.preview(null)[0].text.length > 0);
  assert.ok(T.FIX.impact && T.FIX.recovery && T.FIX.changes.length && T.FIX.scopes.length);
});

test("an unreadable GSA setting is reported, not guessed", () => {
  const st = T.state({}, [], { error: "403 Forbidden" });
  assert.equal(st.utr, "unknown");
  const p = T.plan(st, { allow }, { ownTenantId: OWN });
  assert.ok(p.findings.some((f) => /could not be read \(403 Forbidden\)/.test(f.text)));
});

test("CSV round trip, header required, comments and BOM ignored", () => {
  const r = T.parseCsv("\uFEFF# allowed tenants\ndomain;tenantId;name\na.example;" + A + ";Partner A\nb.example;;Partner B\n");
  assert.equal(r.error, null);
  assert.deepEqual(r.rows[1], { domain: "b.example", tenantId: "", name: "Partner B" });
  assert.match(T.parseCsv("foo,bar\n1,2").error, /header/);
  assert.equal(T.parseCsv(T.toCsv(allow)).rows.length, 2);
});

test("verdict: off, policy only, incomplete", () => {
  assert.equal(T.verdict(fresh(), { allow }, { ownTenantId: OWN }).state, "off");
  const pol = T.state({ tenantRestrictions: T.BLOCK_ALL() }, [{ tenantId: A, tenantRestrictions: T.ALLOW_ALL() }], { networkPacketTaggingStatus: "disabled" });
  assert.equal(T.verdict(pol, { allow: [allow[0]] }, { ownTenantId: OWN }).state, "policy");
  const inc = T.state({ tenantRestrictions: T.BLOCK_ALL() }, [], { networkPacketTaggingStatus: "enabled" });
  assert.equal(T.verdict(inc, { allow: [allow[0]] }, { ownTenantId: OWN }).state, "incomplete");
});
