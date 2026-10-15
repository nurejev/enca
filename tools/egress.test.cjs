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

test("32606: a policy that does not apply from a place reads passes, with why", () => {
  const m = run();
  assert.strictEqual(row(m, "ca600").todayWhy, "office is trusted");
  assert.strictEqual(row(m, "p002").todayWhy, "office is excluded");
  assert.strictEqual(row(m, "ca200").todayWhy, undefined, "applies today: no reason");
  const html = Egress.render(m, { filter: "all" });
  assert.doesNotMatch(html, />not applied</);
  assert.match(html, /eg-okt">passes<\/span><br><small class="muted">office is trusted/);
  assert.match(Egress.markdown(m, { filter: "all" }), /passes \(office is trusted\)/);
  assert.strictEqual(row(run({ mode: "trusted" }), "ca600").viaWhy, "egress is trusted");
});

// ---- 0.3.0 (32616): IPv6 — two paths, and the sign-in lookup ----
test("fmt: the RFC 5952 spelling Entra writes", () => {
  const f = (t) => { const c = Egress.cidr(t); return Egress.fmt(c.fam, c.net); };
  assert.strictEqual(f("2001:0DB8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
  assert.strictEqual(f("2001:db8:0:1:0:0:0:5"), "2001:db8:0:1::5");
  assert.strictEqual(f("2001:db8:0:0:1:0:0:5"), "2001:db8::1:0:0:5", "the first of two equal runs");
  assert.strictEqual(f("2001:db8:1:2:3:4:0:6"), "2001:db8:1:2:3:4:0:6", "a single zero group is never ::");
  assert.strictEqual(f("::ffff:192.0.2.1"), "::ffff:c000:201");
  assert.strictEqual(f("010.001.002.003"), "10.1.2.3");
  assert.strictEqual(Egress.hostText(Egress.cidr("2001:0db8::0001")), "2001:db8::1");
});

test("lookup: eq for an address, startswith for a range, null when too broad", () => {
  const l = (t) => Egress.lookup(Egress.cidr(t));
  assert.deepStrictEqual(l("2001:0DB8::1"), { op: "eq", text: "2001:db8::1" });
  assert.deepStrictEqual(l("85.145.244.194"), { op: "eq", text: "85.145.244.194" });
  // devcf's HeadQuarters stores its /64 with host bits set
  assert.deepStrictEqual(l("2001:1c00:208d:c900:288a:3088:5751:2021/64"), { op: "startswith", text: "2001:1c00:208d:c900:" });
  assert.deepStrictEqual(l("2a03:2880:f10c::/48"), { op: "startswith", text: "2a03:2880:f10c:" });
  assert.deepStrictEqual(l("2001:db8:0:0:5::/80"), { op: "startswith", text: "2001:db8:" }, "cut before zero groups Entra folds into ::");
  assert.deepStrictEqual(l("2001:db8:1:0::/64"), { op: "startswith", text: "2001:db8:1:" }, "a trailing zero group may fold too");
  assert.deepStrictEqual(l("198.51.100.0/24"), { op: "startswith", text: "198.51.100." });
  assert.strictEqual(l("10.0.0.0/8"), null);
  assert.strictEqual(l("2001::/16"), null);
  assert.ok(Egress.holds(Egress.cidr("2001:db8:0:0:5::/80"), "2001:db8::5:0:0:9"));
  assert.ok(!Egress.holds(Egress.cidr("2001:db8:0:0:5::/80"), "2001:db8::6:0:0:9"));
  assert.ok(!Egress.holds(Egress.cidr("2001:db8::/32"), "32.1.13.184"), "families never mix");
});

test("a v4 + v6 list is two paths: each family in its own location is no change, not partly inside", () => {
  // HHW holds the v4 address only, HQ the v6 /64 only — before 32616 both read partly inside, so outside
  const m = run({ egress: Egress.parse("198.51.100.23 2001:db8:208d:c900::5").entries, country: "NL" });
  assert.ok(m.dual);
  assert.deepStrictEqual(m.lanes.map((l) => l.fam), [4, 6]);
  assert.strictEqual(row(m, "ca1102").via, false); assert.strictEqual(row(m, "ca1102").via6, false);
  assert.strictEqual(row(m, "ca1102").imp.key, "same");
  assert.ok(!m.findings.some((f) => /Only part of the egress/.test(f.text)));
  assert.ok(m.findings.some((f) => /already inside .*HeadQuarters/.test(f.text)));
});

test("a v6 path outside the trusted locations: the worse path wins and the impact says which family", () => {
  const m = run({ egress: Egress.parse("203.0.113.10 2001:db8:ffff::/48").entries, country: "NL" });
  const r = row(m, "ca1102");
  assert.strictEqual(r.via, false); assert.strictEqual(r.via6, true);
  assert.strictEqual(r.imp.text, "break-glass blocked");
  assert.strictEqual(r.imp.note, "over IPv6 only");
  const md = Egress.markdown(m, { filter: "all" });
  assert.ok(/\| Policy \| State \| Today \| Via egress IPv4 \| Via egress IPv6 \| Impact \|/.test(md));
  assert.ok(/break-glass blocked \(over IPv6 only\)/.test(md));
  const html = Egress.render(m, { filter: "all" });
  assert.ok(html.includes("Via egress <span class=\"eg-fam\">IPv6</span>") && html.includes("over IPv6 only"));
});

test("a single-family list keeps the single path and the old columns", () => {
  const m = run({ egress: Egress.parse("2001:db8:ffff::1").entries, country: "DE" });
  assert.ok(!m.dual);
  assert.strictEqual(row(m, "ca1102").imp.text, "break-glass blocked");
  assert.ok(!row(m, "ca1102").imp.note);
  assert.ok(/\| Policy \| State \| Today \| Via egress \| Impact \|/.test(Egress.markdown(m, { filter: "all" })));
});
