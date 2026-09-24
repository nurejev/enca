// js/workloadid.js — 🚦 Sign-in log → 🤖 Workload identities (R46, T47).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const WL = new Function(read("js/workloadid.js") + ";return WorkloadId;")();
const LS = new Function(read("js/locsignin.js") + ";return LocSignin;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();
const D = DEMO.workload;
const run = (o) => WL.analyze({ policies: [D.policy, D.policyRo], rows: WL.fromGraph(D.signIns), sps: D.servicePrincipals, tenantId: D.tenantId,
  locations: DEMO.namedLocations, inCidr: LS.inCidr, days: 7, ...(o || {}) });
const by = (m, name) => m.list.find((s) => s.name === name);

test("scope: named, all owned, excluded, attribute filter", () => {
  const t = WL.targets({ conditions: { clientApplications: { includeServicePrincipals: ["ServicePrincipalsInMyTenant"], excludeServicePrincipals: ["x"] } } });
  assert.strictEqual(WL.inScope(t, { id: "y" }, "single"), true);
  assert.strictEqual(WL.inScope(t, { id: "x" }, "single"), false);
  assert.strictEqual(WL.inScope(t, { id: "y" }, "mi"), false);
  const f = WL.targets({ conditions: { clientApplications: { includeServicePrincipals: ["y"], servicePrincipalFilter: { mode: "include", rule: "x" } } } });
  assert.strictEqual(WL.inScope(f, { id: "y" }, "single"), null);
  assert.strictEqual(WL.targets({ conditions: {} }), null);
});
test("kinds from the directory", () => {
  assert.strictEqual(WL.kindOf(D.servicePrincipals["sp-payroll"], false, D.tenantId), "single");
  assert.strictEqual(WL.kindOf(D.servicePrincipals["sp-mi-func"], false, D.tenantId), "mi");
  assert.strictEqual(WL.kindOf(D.servicePrincipals["sp-ticket"], false, D.tenantId), "multi");
  assert.strictEqual(WL.kindOf({ appOwnerOrganizationId: D.tenantId, signInAudience: "AzureADMultipleOrgs" }, false, D.tenantId), "multiHere");
  assert.strictEqual(WL.kindOf({ appOwnerOrganizationId: "f8cdef31-a31e-4b4a-93e4-5f571e91255a" }, false, D.tenantId), "microsoft");
});
test("demo verdicts", () => {
  const m = run();
  assert.strictEqual(by(m, "svc-backup-graph").verdict, "blocked");
  assert.strictEqual(by(m, "svc-backup-graph").blocked, 1);
  assert.strictEqual(by(m, "svc-payroll-export").verdict, "covered");
  assert.strictEqual(by(m, "app-hr-sync").verdict, "ro");   // only the report-only all-owned policy reaches it
  assert.strictEqual(by(m, "mi-func-invoices").verdict, "cannot");
  assert.strictEqual(by(m, "Contoso Ticketing").verdict, "cannot");
  assert.strictEqual(by(m, "svc-payroll-export").outside, 0);   // 203.0.113.40 is HQ egress
  assert.strictEqual(by(m, "svc-backup-graph").outside, 1);
  assert.strictEqual(m.unreachableOutside, 2);
});
test("per policy: blocked from the log, names it can never act on", () => {
  const m = run();
  const c900 = m.cards.find((c) => c.id === "demo-wid-900");
  assert.strictEqual(c900.res.failure, 1);
  assert.strictEqual(c900.cannot, 1);   // the managed identity it names
  assert.strictEqual(m.cards.find((c) => c.id === "demo-wid-901").state, "ro");
});
test("hunting rows: no policy results, 53003 counted", () => {
  const rows = WL.fromHunting([{ ServicePrincipalId: "sp-hrsync", ApplicationId: "a", IPAddress: "192.0.2.81", Country: "US", n: 40, blocked: 3, failed: 5, last: "2026-07-21T09:00:00Z", name: "app-hr-sync", mi: "0" }]);
  assert.strictEqual(rows[0].policies, null);
  const m = WL.analyze({ policies: [D.policy], rows, sps: D.servicePrincipals, tenantId: D.tenantId, locations: [], inCidr: LS.inCidr, source: "hunting", days: 30 });
  assert.strictEqual(m.list.find((s) => s.id === "sp-hrsync").blocked, 3);
  assert.match(WL.render(m, {}), /not in the hunting table/);
  assert.match(WL.huntQuery("EntraIdSpnSignInEvents", "a", "b"), /^EntraIdSpnSignInEvents\n/);
});
test("Microsoft apps hidden by default", () => {
  const sps = { ...D.servicePrincipals, ms: { id: "ms", displayName: "Office 365 Exchange Online", appOwnerOrganizationId: "f8cdef31-a31e-4b4a-93e4-5f571e91255a" } };
  const rows = WL.fromGraph(D.signIns.concat([{ ...D.signIns[0], servicePrincipalId: "ms", servicePrincipalName: "Office 365 Exchange Online", appId: "" }]));
  const m = WL.analyze({ policies: [D.policy], rows, sps, tenantId: D.tenantId, locations: [], inCidr: LS.inCidr });
  assert.strictEqual(m.hiddenMicrosoft, 1);
  assert.strictEqual(WL.analyze({ policies: [D.policy], rows, sps, tenantId: D.tenantId, locations: [], inCidr: LS.inCidr, showMicrosoft: true }).hiddenMicrosoft, 0);
});
test("render escapes", () => {
  const m = run({ sps: { ...D.servicePrincipals, "sp-hrsync": { ...D.servicePrincipals["sp-hrsync"], displayName: "<b>x</b>" } } });
  assert.ok(!WL.render(m, {}).includes("<b>x</b>"));
  assert.match(WL.toMd(m, "T"), /Workload identity/);
});
