// Report-only impact from BUCKETS (T26 2.0, build 25377) must agree with the
// same forecast built from the sign-in rows. The hunting engine is simulated:
// the full rows are grouped here exactly as Signins.roBucketQuery asks
// Microsoft to group them, shaped through Signins.fromRoBuckets, and both
// results go through ReportImpact.build. Run: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(box);
for (const f of ["signins.js", "reportimpact.js"]) vm.runInContext(fs.readFileSync(path.join(root, "js", f), "utf8"), box, { filename: f });
vm.runInContext("globalThis.S = Signins; globalThis.R = ReportImpact;", box);
const { S, R } = box;

// 40 hours of synthetic hunting rows: 3 users × 3 apps × 8 sign-ins an hour, two report-only policies, mixed verdicts
const HOUR = 3600000, T0 = Date.UTC(2026, 8, 8, 6);
const users = [["u1", "anna@x.nl", "Anna"], ["u2", "ben@x.nl", "Ben"], ["u3", "cas@x.nl", "Cas"]];
const apps = ["Outlook", "Teams", "SharePoint"];
const P1 = { id: "p1", displayName: "CA100 Require MFA" }, P2 = { id: "p2", displayName: "CA200 Compliant device" };
function rows() {
  const out = []; let i = 0;
  for (let h = 0; h < 40; h++) for (const [uid, upn, name] of users) for (const app of apps) for (let k = 0; k < 8; k++) {
    i++;
    const compliant = uid === "u1" ? 1 : 0;
    const r1 = h % 3 === 0 ? "reportOnlyInterrupted" : "reportOnlySuccess";
    const r2 = uid === "u3" ? "reportOnlyFailure" : (uid === "u2" && h % 2 ? "reportOnlyNotApplied" : "reportOnlySuccess");
    out.push({ Timestamp: new Date(T0 + h * HOUR + (i % 50) * 60000).toISOString(), RequestId: "r" + i, AccountObjectId: uid, AccountUpn: upn, AccountDisplayName: name,
      Application: app, ApplicationId: "a-" + app, ResourceDisplayName: app, ResourceId: "res", ClientAppUsed: "Browser", OSPlatform: "Windows", Browser: "Edge", DeviceTrustType: compliant ? "azuread" : "",
      IsCompliant: compliant, IsManaged: compliant, AuthenticationRequirement: h % 3 === 0 ? "singleFactorAuthentication" : "multiFactorAuthentication",
      RiskLevelDuringSignIn: h % 5 === 0 ? 10 : 0, RiskLevelAggregated: 0, RiskState: 0, LogonType: i % 4 === 0 ? "NonInteractive" : "Interactive", ErrorCode: 0, IPAddress: "1.2.3.4", City: "Zoetermeer", Country: "NL",
      ConditionalAccessPolicies: JSON.stringify([
        { id: P1.id, displayName: P1.displayName, result: r1, enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
        { id: P2.id, displayName: P2.displayName, result: r2, enforcedGrantControls: ["RequireCompliantDevice"], enforcedSessionControls: [] },
        { id: "p9", displayName: "Enforced", result: "success", enforcedGrantControls: ["Mfa"], enforcedSessionControls: [] },
      ]) });
  }
  return out;
}
// the summarize the query performs, done here over the same rows
const RO = new Set(["reportOnlySuccess", "reportOnlyFailure", "reportOnlyInterrupted"]);
function bucket(full) {
  const hour = (t) => new Date(Math.floor(Date.parse(t) / HOUR) * HOUR).toISOString();
  const n = new Map(), na = new Map(), ro = new Map();
  for (const r of full) {
    const H = hour(r.Timestamp);
    n.set(H, (n.get(H) || 0) + 1);
    for (const p of JSON.parse(r.ConditionalAccessPolicies)) {
      if (p.result === "reportOnlyNotApplied") { const k = [H, p.id].join("|"); const e = na.get(k) || { Kind: "na", Hour: H, PolicyId: p.id, PolicyName: p.displayName, N: 0, First: r.Timestamp, Last: r.Timestamp }; e.N++; if (r.Timestamp < e.First) e.First = r.Timestamp; if (r.Timestamp > e.Last) e.Last = r.Timestamp; na.set(k, e); continue; }
      if (!RO.has(p.result)) continue;
      const k = [H, p.id, p.result, r.AccountObjectId, r.Application, r.ClientAppUsed, r.OSPlatform, r.DeviceTrustType, r.IsCompliant, r.IsManaged, r.AuthenticationRequirement, r.RiskLevelDuringSignIn, r.RiskLevelAggregated, r.LogonType].join("|");
      let e = ro.get(k);
      if (!e) { e = { Kind: "ro", Hour: H, PolicyId: p.id, PolicyName: p.displayName, Result: p.result, AccountObjectId: r.AccountObjectId, AccountUpn: r.AccountUpn, AccountDisplayName: r.AccountDisplayName, Application: r.Application, ClientAppUsed: r.ClientAppUsed, OSPlatform: r.OSPlatform, DeviceTrustType: r.DeviceTrustType, IsCompliant: r.IsCompliant, IsManaged: r.IsManaged, AuthenticationRequirement: r.AuthenticationRequirement, RiskLevelDuringSignIn: r.RiskLevelDuringSignIn, RiskLevelAggregated: r.RiskLevelAggregated, LogonType: r.LogonType, N: 0, First: r.Timestamp, Grant: JSON.stringify(p.enforcedGrantControls), Session: JSON.stringify(p.enforcedSessionControls) }; ro.set(k, e); }
      e.N++;
      if (r.Timestamp < e.First) e.First = r.Timestamp;
      if (!e.Timestamp || r.Timestamp > e.Timestamp) Object.assign(e, { Timestamp: r.Timestamp, RequestId: r.RequestId, IPAddress: r.IPAddress, City: r.City, Country: r.Country, Browser: r.Browser, ErrorCode: r.ErrorCode, ResourceDisplayName: r.ResourceDisplayName, ResourceId: r.ResourceId, ApplicationId: r.ApplicationId, RiskState: r.RiskState });
    }
  }
  return [...[...n].map(([H, N]) => ({ Kind: "n", Hour: H, N })), ...na.values(), ...ro.values()];
}
const ro = [{ id: "p1", name: P1.displayName }, { id: "p2", name: P2.displayName }, { id: "p3", name: "Staged, no traffic" }];
const strip = (p) => ({ key: p.key, verdict: p.verdict, success: p.success, interrupted: p.interrupted, failure: p.failure, notApplied: p.notApplied, evaluated: p.evaluated, controls: p.controls, first: p.first, last: p.last, apps: p.apps,
  users: p.users.map((u) => ({ upn: u.upn, success: u.success, interrupted: u.interrupted, failure: u.failure, apps: [...u.apps].sort(), riskWhy: u.riskWhy, denyWhy: u.denyWhy, last: u.last })) });

test("the forecast from buckets equals the forecast from rows — per policy, per user, denominator", () => {
  const full = rows();
  const fromRows = R.build(S.fromHunting(full), ro);
  const buckets = bucket(full);
  const fromBuckets = R.build(S.fromRoBuckets(buckets), ro);
  assert.ok(buckets.length < full.length, `buckets ${buckets.length} vs rows ${full.length}`);   // two policies per row here; real tenants compress far more
  assert.equal(fromBuckets.records, full.length, "denominator is the sign-in count, not the bucket count");
  assert.deepEqual(fromBuckets.counts, fromRows.counts);
  assert.deepEqual(fromBuckets.policies.map(strip), fromRows.policies.map(strip));
  assert.equal(fromBuckets.blockedUsers, fromRows.blockedUsers);
  assert.equal(fromBuckets.promptedUsers, fromRows.promptedUsers);
  assert.deepEqual(fromBuckets.users.map((u) => [u.upn, u.worst, u.success, u.interrupted, u.failure]), fromRows.users.map((u) => [u.upn, u.worst, u.success, u.interrupted, u.failure]));
  // the sample behind a denial is a real sign-in of that user (the bucket's latest)
  const p2 = fromBuckets.policies.find((p) => p.key === "p2"), cas = p2.users.find((u) => u.upn === "cas@x.nl");
  assert.ok(cas.samples.length >= 1 && cas.samples.every((s) => /^r\d+$/.test(s.id)));
  assert.equal(p2.verdict, "block");
  assert.equal(fromBuckets.policies.find((p) => p.key === "p3").verdict, "nodata");
});

test("numeric result codes and the query text", () => {
  const rec = S.fromRoBuckets([{ Kind: "ro", Hour: "2026-09-08T06:00:00Z", PolicyId: "p1", PolicyName: "P", Result: "7", N: 4, AccountObjectId: "u", AccountUpn: "u@x", Application: "A", Grant: '["Block"]', Session: "[]", First: "2026-09-08T06:01:00Z", Timestamp: "2026-09-08T06:50:00Z", RequestId: "r1", IsCompliant: 0 }])[0];
  assert.equal(rec.appliedConditionalAccessPolicies[0].result, "reportOnlyFailure");
  assert.deepEqual(rec.appliedConditionalAccessPolicies[0].enforcedGrantControls, ["Block"]);
  assert.equal(rec.n, 4); assert.equal(rec.firstDateTime, "2026-09-08T06:01:00Z"); assert.equal(rec.createdDateTime, "2026-09-08T06:50:00Z");
  const q = S.roBucketQuery({ from: "2026-09-08T00:00:00.000Z", to: "2026-09-09T00:00:00.000Z", interactiveOnly: true, cap: 20000 });
  for (const piece of ["let W = EntraIdSignInEvents", 'LogonType !has "non"', "mv-expand _X = _P", 'extend Kind = "n"', 'extend Kind = "na"', 'extend Kind = "ro"', "arg_max(Timestamp, RequestId", "bin(Timestamp, 1h)", "take 20000"]) assert.ok(q.includes(piece), piece);
  assert.ok(!S.roBucketQuery({ from: "a", to: "b", interactiveOnly: false }).includes('!has "non"'));
  assert.ok(S.roBucketQuery({ from: "a", to: "b", table: "AADSignInEventsBeta" }).startsWith("let W = AADSignInEventsBeta"));
});
