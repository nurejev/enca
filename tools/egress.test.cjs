// T57 🛰 Egress & location impact — js/egress.js (pure). node --test tools/egress.test.cjs
const test = require("node:test");
const assert = require("node:assert");
const Egress = require("../js/egress.js");

const run = (opts) => {
  const d = Egress.demo();
  return Egress.model(Object.assign({ policies: d.policies, locations: d.locations, names: d.names, egress: Egress.parse(d.egress).entries, country: "DE", officeCountry: "NL", mode: "asis" }, opts || {}));
};
const row = (m, id) => m.rows.find((r) => r.id === id);

test("parse: IPv4, IPv6, CIDR, junk and duplicates", () => {
  const p = Egress.parse("192.0.2.80\n192.0.2.80, 198.51.100.0/24; 2001:db8::1 nonsense 300.1.1.1 10.0.0.0/33");
  assert.deepStrictEqual(p.entries.map((e) => e.text), ["192.0.2.80", "198.51.100.0/24", "2001:db8::1"]);
  assert.deepStrictEqual(p.bad, ["nonsense", "300.1.1.1", "10.0.0.0/33"]);
  assert.ok(Egress.isHost(p.entries[0]) && !Egress.isHost(p.entries[1]));
});

test("containment: v4 and v6, families never mix", () => {
  const c = Egress.cidr;
  assert.ok(Egress.within(c("203.0.113.10"), c("203.0.113.0/24")));
  assert.ok(!Egress.within(c("203.0.114.10"), c("203.0.113.0/24")));
  assert.ok(Egress.within(c("2001:db8:208d:c900:288a:3088:5751:2021"), c("2001:db8:208d:c900::/64")));
  assert.ok(!Egress.within(c("2001:db8:208d:c901::1"), c("2001:db8:208d:c900::/64")));
  assert.ok(!Egress.within(c("203.0.113.10"), c("::/0")));
  assert.ok(Egress.within(c("10.1.2.3"), c("0.0.0.0/0")));
});

test("country: the most frequent country Entra recorded wins", () => {
  const r = Egress.country([{ location: { countryOrRegion: "DE" }, createdDateTime: "1" }, { location: { countryOrRegion: "NL" }, createdDateTime: "3" }, { location: { countryOrRegion: "DE" }, createdDateTime: "2" }, { location: {} }]);
  assert.strictEqual(r.country, "DE"); assert.strictEqual(r.seen, 2); assert.deepStrictEqual(r.others, ["NL"]);
  assert.strictEqual(Egress.country([]), null);
});

test("devcf as it is, egress in DE: the P-2716 picture", () => {
  const m = run();
  assert.strictEqual(m.summary.total, 8);
  assert.strictEqual(row(m, "p003").imp.key, "noop", "P003 targets None");
  assert.strictEqual(row(m, "p002").today, false); assert.strictEqual(row(m, "p002").via, true);
  assert.strictEqual(row(m, "p002").imp.tone, "y");
  assert.strictEqual(row(m, "ca001").imp.text, "everyone blocked");
  assert.strictEqual(row(m, "ca1102").imp.text, "break-glass blocked");
  assert.strictEqual(row(m, "ca600").imp.text, "group blocked");
  assert.strictEqual(row(m, "ca210").imp.text, "MFA to register");
  assert.strictEqual(row(m, "ca200").imp.key, "nodep");
  assert.strictEqual(m.summary.lockouts, 2);
  assert.strictEqual(m.rows[0].imp.tone, "r", "lockouts first");
  assert.ok(m.findings.some((f) => /targets no resources/.test(f.text)));
  assert.ok(m.findings.some((f) => /CAE strict/.test(f.text) && f.sev === "OK"));
});

test("egress in NL: the country block passes, the trusted-network blocks still fire", () => {
  const m = run({ country: "NL" });
  assert.strictEqual(row(m, "ca001").imp.key, "same");
  assert.strictEqual(row(m, "ca1102").imp.key, "block");
});

test("simulated trusted: AllTrusted policies clear, policies naming HQ by id do not — and the finding says so", () => {
  const m = run({ mode: "trusted", country: "NL" });
  assert.strictEqual(row(m, "ca1102").imp.key, "same");
  assert.strictEqual(row(m, "ca600").imp.key, "same");
  assert.strictEqual(row(m, "p002").imp.key, "more", "P002 excludes HQ and HHW by id");
  assert.ok(m.findings.some((f) => /NEW trusted location does not help/.test(f.text) && /HeadQuarters/.test(f.text)));
});

test("egress inside the office range: nothing changes", () => {
  const m = run({ egress: Egress.parse("203.0.113.10").entries, country: "NL" });
  assert.ok(m.rows.every((r) => ["same", "nodep", "noop"].includes(r.imp.key)), m.rows.map((r) => r.imp.key).join());
  assert.ok(m.findings.some((f) => /already inside HeadQuarters \(trusted\)/.test(f.text)));
});

test("unknown country: country locations cannot be judged, and the finding asks for it", () => {
  const m = run({ country: "" });
  assert.strictEqual(row(m, "ca001").imp.key, "unknown");
  assert.ok(m.findings.some((f) => /country of the egress is unknown/.test(f.text)));
});

test("only part of the list inside a location is called out", () => {
  const m = run({ egress: Egress.parse("203.0.113.10 192.0.2.80").entries, country: "NL" });
  assert.strictEqual(row(m, "ca1102").imp.key, "block", "a list that is only partly inside is outside");
  assert.ok(m.findings.some((f) => /Only part of the egress list/.test(f.text)));
});

test("strict CAE is a finding", () => {
  const d = Egress.demo();
  d.policies[1].raw.sessionControls = { continuousAccessEvaluation: { mode: "strictLocation" } };
  const m = Egress.model({ policies: d.policies, locations: d.locations, names: d.names, egress: Egress.parse("192.0.2.80").entries, country: "DE", officeCountry: "NL" });
  assert.ok(m.findings.some((f) => /CAE strict location enforcement — a proxy/.test(f.text)));
});

test("render and markdown carry every policy and no raw markup in the names", () => {
  const m = run();
  const html = Egress.render(m, { filter: "all" });
  for (const r of m.rows) assert.ok(html.includes(r.name.replace(/&/g, "&amp;")), r.name);
  const md = Egress.markdown(m, { tenant: "cloudfellows.dev", countrySource: "sign-in log", filter: "all" });
  assert.match(md, /\| CA001-BLOCK-Global-ASR-AnyApp-AnyPlatform-CountryWhitelist-v1\.0\.2 \| off \|/);
  assert.match(md, /everyone blocked/);
  assert.ok(!/<b>|<span/.test(md));
});

test("markdown export: a 5-column verdict table, details per policy, and the table's filter", () => {
  const m = run();
  const md = Egress.markdown(m, { filter: "all" });
  const head = md.split("\n").find((l) => l.startsWith("| Policy"));
  assert.strictEqual(head, "| Policy | State | Today | Via egress | Impact |");
  for (const l of md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("|---"))) assert.strictEqual(l.split(" | ").length, 5, l);
  for (const r of m.rows) assert.ok(md.includes(`### ${r.name}`), r.name);
  assert.match(md, /- Excluded \(\d+\): /);
  assert.match(md, /- Shown: All — \d+ of \d+ policies/);
  const on = Egress.markdown(m, { filter: "on" });
  const onRows = m.rows.filter((r) => r.state === "enabled");
  assert.match(on, new RegExp(`- Shown: On only — ${onRows.length} of ${m.rows.length}`));
  for (const r of m.rows.filter((r) => r.state !== "enabled")) assert.ok(!on.includes(`### ${r.name}`), r.name);
  assert.ok(!/<b>|<span|<div/.test(md));
});
