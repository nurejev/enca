// js/locsignin.js — 🌐 Locations → vs. sign-ins (R19).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const LS = new Function(read("js/locsignin.js") + ";return LocSignin;")();
const Loc = new Function(read("js/causes.js") + ";" + read("js/locations.js") + ";return Locations;")();
const IP = "#microsoft.graph.ipNamedLocation", CTRY = "#microsoft.graph.countryNamedLocation";
const locs = [
  { "@odata.type": IP, id: "hq", displayName: "HQ", isTrusted: true, ipRanges: [{ cidrAddress: "203.0.113.0/24" }, { cidrAddress: "2001:db8:1::/48" }] },
  { "@odata.type": IP, id: "old", displayName: "Old office", isTrusted: true, ipRanges: [{ cidrAddress: "192.0.2.0/24" }] },
  { "@odata.type": IP, id: "vpn", displayName: "Vendor VPN", isTrusted: false, ipRanges: [{ cidrAddress: "198.51.100.0/24" }] },
  { "@odata.type": CTRY, id: "blk", displayName: "Blocked countries", countriesAndRegions: ["KP", "IR"] },
  { "@odata.type": CTRY, id: "ok", displayName: "Allowed countries", countriesAndRegions: ["NL", "BE"] },
];
const pol = (id, inc, exc) => ({ id, displayName: id, state: "enabled", conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] }, locations: { includeLocations: inc, excludeLocations: exc || [] } }, grantControls: { builtInControls: ["block"] } });
const pols = [pol("block-countries", ["blk"]), pol("mfa-outside", ["All"], ["AllTrusted"]), pol("allow", ["All"], ["ok"])];
const rec = (ip, cc, user, t, names) => ({ ipAddress: ip, location: { countryOrRegion: cc }, userId: user, createdDateTime: t || "2026-09-20T10:00:00Z", ...(names ? { networkLocationDetails: [{ networkType: "namedNetwork", networkNames: names }] } : {}) });
const run = (records) => LS.analyze({ locations: locs, policies: pols, records, days: 7, usedBy: Loc.usedBy });
const row = (m, id) => m.rows.find((r) => r.id === id);

test("CIDR v4 and v6", () => {
  assert.ok(LS.inCidr("203.0.113.9", "203.0.113.0/24"));
  assert.ok(!LS.inCidr("203.0.114.9", "203.0.113.0/24"));
  assert.ok(LS.inCidr("2001:db8:1:5::1", "2001:db8:1::/48"));
  assert.ok(!LS.inCidr("2001:db8:2::1", "2001:db8:1::/48"));
  assert.ok(!LS.inCidr("203.0.113.9", "2001:db8:1::/48"));
  assert.ok(LS.inCidr("10.0.0.1", "0.0.0.0/0"));
});
test("verdicts: in use, trusted unseen, seen unused, blocked country quiet", () => {
  const m = run([rec("203.0.113.9", "NL", "u1"), rec("2001:db8:1::7", "NL", "u2", "2026-09-21T09:00:00Z"), rec("198.51.100.4", "US", "u3")]);
  assert.strictEqual(row(m, "hq").n, 2);
  assert.strictEqual(row(m, "hq").users, 2);
  assert.strictEqual(row(m, "hq").last, "2026-09-21T09:00:00Z");
  assert.strictEqual(row(m, "hq").verdict, "in-use");
  assert.strictEqual(row(m, "old").verdict, "trusted-unseen");
  assert.strictEqual(m.findings.find((f) => f.id === "old").sev, "high");   // used via All trusted
  assert.strictEqual(row(m, "vpn").verdict, "seen-unused");
  assert.strictEqual(row(m, "blk").verdict, "country-unseen");
  assert.strictEqual(m.findings.find((f) => f.id === "blk").sev, "info");
});
test("countries no location names", () => {
  const m = run([rec("1.1.1.1", "US", "u1"), rec("1.1.1.2", "US", "u2"), rec("1.1.1.3", "NL", "u1")]);
  assert.deepStrictEqual(m.countries, [{ country: "US", n: 2, users: 2 }]);
});
test("Entra's own match counts even without an IP match", () => {
  const m = run([rec("", "", "u1", null, ["Old office"])]);
  assert.strictEqual(row(m, "old").n, 1);
  assert.strictEqual(row(m, "old").byLog, 1);
  assert.strictEqual(m.withLog, 1);
});
test("GPS country locations only take Entra's match", () => {
  const gps = [{ "@odata.type": CTRY, id: "g", displayName: "GPS NL", countriesAndRegions: ["NL"], countryLookupMethod: "authenticatorAppGps" }];
  const m = LS.analyze({ locations: gps, policies: [], records: [rec("1.1.1.1", "NL", "u")], usedBy: () => [] });
  assert.strictEqual(m.rows[0].n, 0);
});
test("render escapes and says when capped", () => {
  const m = LS.analyze({ locations: [{ "@odata.type": IP, id: "x", displayName: "<b>x</b>", ipRanges: [] }], policies: [], records: [], capped: true, usedBy: () => [] });
  const h = LS.render(m);
  assert.ok(!h.includes("<b>x</b>"));
  assert.match(h, /CAPPED/);
  assert.match(LS.toMd(m, "T"), /Named locations vs/);
});
