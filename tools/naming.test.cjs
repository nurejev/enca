// js/naming.js — the 📏 Naming tab of 🛡 Checks (R25, T45).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const Render = new Function("const esc=(s)=>String(s);" + read("js/render.js") + ";return Render;")();
const Baseline = (() => { try { return new Function(read("js/baseline.js") + ";return Baseline;")(); } catch { return null; } })();
const NM = new Function(read("js/naming.js") + ";return Naming;")();
const personaKey = Baseline ? Baseline.personaKey : (n) => (/admin/i.test(n) ? "admin" : /internal/i.test(n) ? "internal" : /guest/i.test(n) ? "guest" : /global/i.test(n) ? "global" : null);
const PG = [
  { key: "admins", group: "CAB-SEC-U-Persona-Admins" }, { key: "internals", group: "CAB-SEC-U-Persona-Internals" },
  { key: "externals", group: "CAB-SEC-U-Persona-Externals" }, { key: "global", group: null },
];
const vm = (id, name, inc, state) => ({ id, name, state: state || "on", users: { inc: inc || ["All users"], exc: [] } });
const run = (vms, pg) => NM.analyze(vms, { caGroup: Render.caGroup, personaKey, personaGroups: pg || PG, catalogLabel: "CloudFellows" });
const kinds = (m) => m.findings.map((f) => `${f.kind}:${f.id}`).sort();

test("a clean set has no findings", () => {
  const m = run([vm("a", "CA001-Global-BlockLegacy-v1.0"), vm("b", "CA100-Admins-MFA-v2.0", ["CAB-SEC-U-Persona-Admins"]), vm("c", "CA200-Internals-MFA-v1.0", ["CAB-SEC-U-Persona-Internals"])]);
  assert.deepStrictEqual(m.findings, []);
});
test("a version pair and a same-name pair are NOT duplicates", () => {
  const m = run([vm("a", "CA204-Internals-MFA-v1.0"), vm("b", "CA204-Internals-MFA-v1.1"), vm("c", "(NEW) CA204-Internals-MFA-v1.2")]);
  assert.strictEqual(m.counts.duplicate, 0);
});
test("one number, two different names, is a duplicate on both", () => {
  const m = run([vm("a", "CA204-Internals-MFA-v1.0"), vm("b", "CA204-Internals-BlockLegacy-v1.0")]);
  assert.deepStrictEqual(kinds(m), ["duplicate:a", "duplicate:b"]);
  assert.match(m.findings[0].why, /also “CA204-Internals-/);
});
test("name says one persona, number another", () => {
  const m = run([vm("a", "CA215-Admins-Compliant-v1.0")]);
  assert.deepStrictEqual(kinds(m), ["name-range:a"]);
  // Guests may live in Externals or Guest users
  assert.strictEqual(run([vm("b", "CA310-Guests-MFA"), vm("c", "CA410-Guests-MFA")]).counts["name-range"], 0);
});
test("assignment names another persona's group", () => {
  const m = run([vm("a", "CA215-Internals-Compliant-v1.0", ["CAB-SEC-U-Persona-Admins"])]);
  assert.deepStrictEqual(kinds(m), ["name-assign:a"]);
  const off = run([vm("a", "CA215-Internals-Compliant-v1.0", ["CAB-SEC-U-Persona-Admins"])], []);
  assert.strictEqual(off.assignChecked, false);
  assert.strictEqual(off.counts["name-assign"], 0);
});
test("unnumbered suggests the next free number in the persona the name reads", () => {
  const m = run([vm("x", "CA000-Global-Block"), vm("y", "CA001-Global-MFA"), vm("z", "Global block legacy (old)")]);
  const f = m.findings.find((x) => x.id === "z");
  assert.strictEqual(f.kind, "unnumbered");
  assert.match(f.why, /CA002/);
});
test("a number in no persona range", () => {
  const m = run([vm("a", "CA1450-Test")]);
  assert.deepStrictEqual(kinds(m), ["no-range:a"]);
});
test("gaps are information, never counted", () => {
  const m = run([vm("a", "CA100-Admins-A"), vm("b", "CA103-Admins-B")]);
  assert.strictEqual(m.findings.length, 0);
  assert.deepStrictEqual(m.gaps[0].free, [101, 102]);
  assert.match(NM.render(m, {}), /information, not a finding/);
});
test("render and export escape names", () => {
  const m = run([vm("a", "<b>x</b>")]);
  assert.ok(!NM.render(m, {}).includes("<b>x</b>"));
  assert.match(NM.toMd(m, "T"), /Unnumbered/);
});
