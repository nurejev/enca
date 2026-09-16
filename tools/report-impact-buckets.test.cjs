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
// the summarize the query performs (25380 shape), done here over the same rows, per policy part
const RO = new Set(["reportOnlySuccess", "reportOnlyFailure", "reportOnlyInterrupted"]);
function bucket(full, policyIds) {
  const DAY = 24 * HOUR, day = (t) => new Date(Math.floor(Date.parse(t) / DAY) * DAY).toISOString();
  const out = [];
  policyIds.forEach((pid, part) => {
    const n = new Map(), na = new Map(), ap = new Map(), ro = new Map(), sm = new Map();
    for (const r of full) {
      const B = day(r.Timestamp);
      if (part === 0) n.set(B, (n.get(B) || 0) + 1);
      for (const p of JSON.parse(r.ConditionalAccessPolicies)) {
        if (p.id !== pid) continue;
        if (p.result === "reportOnlyNotApplied") { const k = [B, p.id].join("|"); const e = na.get(k) || { Kind: "na", Bin: B, PolicyId: p.id, PolicyName: p.displayName, N: 0, First: r.Timestamp, Last: r.Timestamp }; e.N++; if (r.Timestamp < e.First) e.First = r.Timestamp; if (r.Timestamp > e.Last) e.Last = r.Timestamp; na.set(k, e); continue; }
        if (!RO.has(p.result)) continue;
        const ka = [B, p.id, r.Application].join("|"); const ea = ap.get(ka) || { Kind: "a", Bin: B, PolicyId: p.id, PolicyName: p.displayName, Application: r.Application, N: 0 }; ea.N++; ap.set(ka, ea);
        const k = [B, p.id, p.result, r.AccountObjectId, r.IsCompliant, r.IsManaged, r.AuthenticationRequirement, r.RiskLevelDuringSignIn, r.RiskLevelAggregated].join("|");
        let e = ro.get(k);
        if (!e) { e = { Kind: "ro", Bin: B, PolicyId: p.id, PolicyName: p.displayName, Result: p.result, AccountObjectId: r.AccountObjectId, AccountUpn: r.AccountUpn, AccountDisplayName: r.AccountDisplayName, IsCompliant: r.IsCompliant, IsManaged: r.IsManaged, AuthenticationRequirement: r.AuthenticationRequirement, RiskLevelDuringSignIn: r.RiskLevelDuringSignIn, RiskLevelAggregated: r.RiskLevelAggregated, N: 0, First: r.Timestamp, Last: r.Timestamp, apps: new Set(), Grant: JSON.stringify(p.enforcedGrantControls), Session: JSON.stringify(p.enforcedSessionControls) }; ro.set(k, e); }
        e.N++; e.apps.add(r.Application); if (r.Timestamp < e.First) e.First = r.Timestamp; if (r.Timestamp > e.Last) e.Last = r.Timestamp;
        if (p.result === "reportOnlyFailure") { const ks = [p.id, r.AccountObjectId].join("|"); const es = sm.get(ks); if (!es || r.Timestamp > es.Timestamp) sm.set(ks, { Kind: "s", PolicyId: p.id, AccountObjectId: r.AccountObjectId, Timestamp: r.Timestamp, RequestId: r.RequestId, Application: r.Application, ResourceDisplayName: r.ResourceDisplayName, ClientAppUsed: r.ClientAppUsed, OSPlatform: r.OSPlatform, Browser: r.Browser, IPAddress: r.IPAddress, City: r.City, Country: r.Country, IsCompliant: r.IsCompliant, IsManaged: r.IsManaged, DeviceTrustType: r.DeviceTrustType, ErrorCode: r.ErrorCode }); }
      }
    }
    out.push(...[...n].map(([B, N]) => ({ Kind: "n", Bin: B, N })), ...na.values(), ...ap.values(), ...[...ro.values()].map((e) => ({ ...e, Apps: JSON.stringify([...e.apps]), apps: undefined })), ...sm.values());
  });
  return out;
}
const ro = [{ id: "p1", name: P1.displayName }, { id: "p2", name: P2.displayName }, { id: "p3", name: "Staged, no traffic" }];
const strip = (p) => ({ key: p.key, verdict: p.verdict, success: p.success, interrupted: p.interrupted, failure: p.failure, notApplied: p.notApplied, evaluated: p.evaluated, controls: p.controls, first: p.first, last: p.last, apps: p.apps,
  users: p.users.map((u) => ({ upn: u.upn, success: u.success, interrupted: u.interrupted, failure: u.failure, apps: [...u.apps].sort(), riskWhy: u.riskWhy, denyWhy: u.denyWhy, last: u.last, sampled: u.failure > 0 ? u.samples.length > 0 : true })) });

test("the forecast from buckets equals the forecast from rows — per policy, per user, denominator", () => {
  const full = rows();
  const fromRows = R.build(S.fromHunting(full), ro);
  const buckets = bucket(full, ["p1", "p2"]);
  // fed in pieces, as the days land, through the accumulator — the same way the tool does it
  const acc = R.accumulator(ro); const recs = S.fromRoBuckets(buckets);
  for (let i = 0; i < recs.length; i += 7) acc.add(recs.slice(i, i + 7));
  const fromBuckets = acc.finish();
  assert.ok(buckets.length < full.length / 4, `buckets ${buckets.length} vs rows ${full.length}`);
  assert.equal(fromBuckets.records, full.length, "denominator is the sign-in count, not the bucket count");
  assert.deepEqual(fromBuckets.counts, fromRows.counts);
  assert.deepEqual(fromBuckets.policies.map(strip), fromRows.policies.map(strip));
  assert.equal(fromBuckets.blockedUsers, fromRows.blockedUsers);
  assert.equal(fromBuckets.promptedUsers, fromRows.promptedUsers);
  assert.deepEqual(fromBuckets.users.map((u) => [u.upn, u.worst, u.success, u.interrupted, u.failure]), fromRows.users.map((u) => [u.upn, u.worst, u.success, u.interrupted, u.failure]));
  // the sample behind a denial is a real sign-in of that user (the bucket's latest)
  const p2 = fromBuckets.policies.find((p) => p.key === "p2"), cas = p2.users.find((u) => u.upn === "cas@x.nl");
  assert.equal(cas.samples.length, 1, "one sample denial per user × policy");
  assert.ok(/^r\d+$/.test(cas.samples[0].id) && cas.samples[0].controls.includes("RequireCompliantDevice"));
  assert.equal(cas.samples[0].when, [...full].filter((r) => r.AccountObjectId === "u3").map((r) => r.Timestamp).sort().at(-1), "the latest denial");
  // the accumulator gives the same answer whether finish() is called once or after every piece
  const acc2 = R.accumulator(ro); let mid; for (let i = 0; i < recs.length; i += 500) { acc2.add(recs.slice(i, i + 500)); mid = acc2.finish(); }
  assert.deepEqual(mid.counts, fromBuckets.counts); assert.equal(mid.records, fromBuckets.records);
  assert.equal(p2.verdict, "block");
  assert.equal(fromBuckets.policies.find((p) => p.key === "p3").verdict, "nodata");
});

test("numeric result codes and the query text", () => {
  const rec = S.fromRoBuckets([{ Kind: "ro", Bin: "2026-09-08T00:00:00Z", PolicyId: "p1", PolicyName: "P", Result: "7", N: 4, AccountObjectId: "u", AccountUpn: "u@x", Apps: '["A","B"]', Grant: '["Block"]', Session: "[]", First: "2026-09-08T06:01:00Z", Last: "2026-09-08T06:50:00Z", IsCompliant: 0 }])[0];
  assert.equal(rec.appliedConditionalAccessPolicies[0].result, "reportOnlyFailure");
  assert.equal(JSON.stringify(rec.appliedConditionalAccessPolicies[0].enforcedGrantControls), '["Block"]');
  assert.equal(rec.n, 4); assert.equal(rec.firstDateTime, "2026-09-08T06:01:00Z"); assert.equal(rec.createdDateTime, "2026-09-08T06:50:00Z");
  assert.equal(JSON.stringify(rec.apps), '["A","B"]'); assert.equal(rec.deviceDetail.isCompliant, false);
  const order = S.fromRoBuckets([{ Kind: "ro", N: 1 }, { Kind: "s", PolicyId: "p", AccountObjectId: "u" }, { Kind: "a", N: 2 }]).map((r) => r.kind);
  assert.equal(order.join(), "s,a,ro", "samples and app counts come first");
  const q = S.roBucketQuery({ from: "2026-09-08T00:00:00.000Z", to: "2026-09-09T00:00:00.000Z", interactiveOnly: true, cap: 20000, policyId: "p1" });
  for (const piece of ["let W = EntraIdSignInEvents", 'LogonType !has "non"', "mv-expand _X = _P", 'PolicyId =~ "p1"', 'extend Kind = "n"', 'extend Kind = "na"', 'extend Kind = "a"', 'extend Kind = "ro"', 'extend Kind = "s"', "make_set(Application, 32)", "arg_max(Timestamp, RequestId", "bin(Timestamp, 1d)", "take 20000"]) assert.ok(q.includes(piece), piece);
  assert.ok(!q.includes("Application, ClientAppUsed, OSPlatform"), "the user rows are not grouped by app, client or OS any more");
  assert.ok(!S.roBucketQuery({ from: "a", to: "b", interactiveOnly: false }).includes('!has "non"'));
  assert.ok(!S.roBucketQuery({ from: "a", to: "b", withTotals: false }).includes('Kind = "n"'), "totals only in part 0");
  assert.ok(S.roBucketQuery({ from: "a", to: "b" }).includes(`take ${S.RO_CAP}`));
  assert.ok(S.roBucketQuery({ from: "a", to: "b", table: "AADSignInEventsBeta" }).startsWith("let W = AADSignInEventsBeta"));
});
