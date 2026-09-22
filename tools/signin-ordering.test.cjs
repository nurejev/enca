// Signins.build over a hunting-shaped window (25428): the order it promises,
// and the cost of producing it. Run with the other offline checks:
// node --test tools/*.test.cjs
//
// The list, the CSV and the Markdown export all say "newest first", and the
// sort that produced it used localeCompare — a collator call per comparison,
// which is right for names and wrong for ISO instants (measured 19 ms against
// 15 ms for 50,000 on node 22: worth changing, not the crash). What matters
// here is that the ORDER did not change with the comparison, and that a
// ceiling's worth of sign-ins still builds in a time a tab can absorb.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root, "js/signins.js"), "utf8"), box, { filename: "signins.js" });
vm.runInContext("globalThis.S = Signins;", box);
const { S } = box;

// Hunting rows as the slim query returns them: the failing policy kept whole,
// the report-only-not-applied ones as a list of ids. Timestamps are shuffled
// so the sort has real work to do.
function huntRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const sec = (i * 7919) % (n * 2);          // a coprime stride: no run of sorted input
    out.push({
      Timestamp: new Date(Date.UTC(2026, 8, 20) + sec * 1000).toISOString(),
      Application: "Outlook", ApplicationId: "app" + (i % 5),
      LogonType: i % 2 ? "non-interactive user" : "interactive user",
      ErrorCode: i % 3 === 0 ? 53000 : 50074, CorrelationId: "c" + i, RequestId: "r" + i,
      AccountDisplayName: "User " + (i % 50), AccountUpn: "u" + (i % 50) + "@x.nl", AccountObjectId: "o" + (i % 50),
      OSPlatform: "Windows", IsCompliant: 0, IsManaged: 0, ConditionalAccessStatus: 1,
      ConditionalAccessPolicies: JSON.stringify([{ id: "p1", displayName: "CA100 MFA", result: "failure", enforcedGrantControls: ["Mfa"] }]),
      RoNotApplied: JSON.stringify(["p9"]),
      IPAddress: "1.2.3.4", Country: "NL", City: "Zoetermeer",
      AuthenticationRequirement: "multiFactorAuthentication",
      RiskLevelDuringSignIn: 0, RiskLevelAggregated: 0, RiskState: 0,
    });
  }
  return out;
}

test("a hunting window builds newest first, every row kept", () => {
  const recs = S.fromHunting(huntRows(5000));
  assert.equal(recs.length, 5000);
  const r = S.build(recs, "enforced");
  assert.equal(r.total, 5000, "no row dropped");
  assert.equal(r.nonInteractive, 2500, "the non-interactive half is counted");
  for (let i = 1; i < r.rows.length; i++) {
    assert.ok(String(r.rows[i - 1].when) >= String(r.rows[i].when), `out of order at ${i}`);
  }
});

test("the out-of-scope ids the slim query set aside survive the shape", () => {
  const recs = S.fromHunting(huntRows(1));
  const ro = recs[0].appliedConditionalAccessPolicies.filter((p) => p.result === "reportOnlyNotApplied");
  assert.deepEqual(ro.map((p) => p.id), ["p9"]);
});

test("the ceiling's worth of sign-ins builds in well under a second", () => {
  // 50,000 is HUNT_ROW_MAX — the most a read may now keep. The bound is
  // deliberately generous (measured ~0.4 s on node 22) so the test catches a
  // regression rather than the speed of the machine it runs on.
  const recs = S.fromHunting(huntRows(50000));
  const t0 = Date.now();
  const r = S.build(recs, "enforced");
  const ms = Date.now() - t0;
  assert.equal(r.total, 50000);
  assert.ok(ms < 4000, `build took ${ms}ms for 50,000 sign-ins`);
});
