// Render.personaChips — the T01 persona filter bar (build 25431).
// Run with the other offline checks: node --test tools/*.test.cjs
//
// The bar is handed the pool the OTHER filters already left, so what is
// asserted here is: which personas get a chip, what the counts mean, the
// order, and the two cases that would otherwise confuse a reader — a ticked
// persona whose count has fallen to zero, and a tenant with nothing to filter.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(root, "js/render.js"), "utf8"), box, { filename: "render.js" });
vm.runInContext("globalThis.R = Render;", box);
const { R } = box;

const P = (name, state = "on") => ({ id: name, name, state });
// A tenant shaped like Mihai's: Global, Admins, Internals, Guest admins, and
// something unnumbered.
const tenant = () => [
  P("CA001-Global-BlockLegacy-v1.0"), P("CA002-Global-RequireMFA-v1.0"),
  P("CA101-A_Admin-RequireMFA-v2.0"),
  P("CA201-U_Internal-RequireCompliant-v1.0"), P("CA202-U_Internal-SIF-v1.0"), P("CA203-U_Internal-TOU-v1.0"),
  P("CA500-G_Admin-TOU-v3.0"),
  P("Legacy policy with no number"),
];
const chips = (html) => [...html.matchAll(/data-persona="([^"]+)"[^>]*>([^<]*)</g)].map(m => [m[1], m[2]]);

test("one chip per persona the tenant has, in CA-number order, unnumbered last", () => {
  const got = chips(R.personaChips(tenant(), new Set()));
  assert.deepEqual(got.map(([k]) => k), ["all", "0", "100", "200", "500", "99999"]);
  assert.match(got[1][1], /^Global \(CA000–CA099\) \(2\)$/);
  assert.match(got[3][1], /^Internals \(CA200–CA299\) \(3\)$/);
  assert.match(got[5][1], /^Other \/ unnumbered \(1\)$/);
});

test("All personas carries the pool total and is active when nothing is ticked", () => {
  const html = R.personaChips(tenant(), new Set());
  assert.match(html, /data-persona="all"[^>]*aria-pressed="true"[^>]*>All personas \(8\)/);
});

test("a ticked persona is active and All is not", () => {
  const html = R.personaChips(tenant(), new Set(["200"]));
  assert.match(html, /data-persona="all"[^>]*aria-pressed="false"/);
  assert.match(html, /class="fchip active" data-persona="200"[^>]*aria-pressed="true"/);
  // the others stay unticked
  assert.match(html, /class="fchip " data-persona="0"/);
});

test("several personas can be on at once", () => {
  const html = R.personaChips(tenant(), new Set(["100", "500"]));
  assert.match(html, /class="fchip active" data-persona="100"/);
  assert.match(html, /class="fchip active" data-persona="500"/);
  assert.match(html, /class="fchip " data-persona="200"/);
});

test("counts follow the pool it is given — they are not tenant totals", () => {
  // what a state filter would leave: four of the eight, over two personas
  const pool = tenant().filter((p) => /CA00|CA2/.test(p.name));
  const got = chips(R.personaChips(pool, new Set()));
  assert.deepEqual(got.map(([k]) => k), ["all", "0", "200"]);
  assert.match(got[0][1], /All personas \(5\)/);
  assert.match(got[1][1], /Global \(CA000–CA099\) \(2\)/);
  assert.match(got[2][1], /Internals \(CA200–CA299\) \(3\)/);
  // the personas that pool has nothing for get no chip at all
  assert.ok(!got.some(([k]) => k === "500"));
});

test("a ticked persona keeps its chip at zero — the filter never vanishes under its own result", () => {
  // searched for something only Global matches, while Guest admins is ticked
  const pool = tenant().filter((p) => /Global/.test(p.name));
  const html = R.personaChips(pool, new Set(["500"]));
  const got = chips(html);
  assert.ok(got.some(([k, t]) => k === "500" && /\(0\)$/.test(t)), "the ticked chip is still there, reading zero");
  assert.match(html, /class="fchip active" data-persona="500"/);
  // and it still knows its name with no policy left to read it from
  assert.ok(got.some(([k, t]) => k === "500" && /Guest admins/.test(t)));
});

test("one persona is not a filter bar", () => {
  assert.equal(R.personaChips([P("CA001-Global-A-v1.0"), P("CA002-Global-B-v1.0")], new Set()), "");
  assert.equal(R.personaChips([], new Set()), "");
});

test("personaLabel answers for a key with nothing left to read", () => {
  assert.match(R.personaLabel("500"), /^Guest admins \(CA500–CA599\)$/);
  assert.equal(R.personaLabel("99999"), "Other / unnumbered");
});

test("policy names are escaped into the chip labels", () => {
  // caGroup builds the label from the CA number, not the name, so the only
  // way a name reaches a chip is through an unknown range — assert it is safe
  const html = R.personaChips([P("CA9900-<script>-v1.0"), P("CA001-Global-v1.0")], new Set());
  assert.ok(!html.includes("<script>"), "no raw markup from a policy name");
});
