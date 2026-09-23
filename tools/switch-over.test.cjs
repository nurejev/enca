// ⇄ Switch over (Importer.switchCandidates / switchOver, build 25484).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");

function world(opts = {}) {
  const pols = new Map(), calls = [];
  const Graph = {
    async gget(url) { const p = pols.get(url.split("/").pop()); if (!p) throw new Error("Graph request failed (404): does not exist"); return JSON.parse(JSON.stringify(p)); },
    async gpatch(url, body) {
      const id = url.split("/").pop(); calls.push([id, body.state]);
      if (opts.refuse === id) throw new Error("Graph request failed (400): BadRequest");
      if (opts.sticky !== id) Object.assign(pols.get(id), body);
      return null;
    },
  };
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, TextDecoder, structuredClone, JSON, setTimeout,
    localStorage: { getItem: () => null, setItem() {} }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup: (n) => { const m = /\bCA(\d{3,4})\b/.exec(String(n || "")); const num = m ? +m[1] : null; return { num, key: num == null ? null : Math.floor(num / 100) * 100, label: "x" }; } }, AUTH_CONFIG: { scopes: [] }, BRANDING: { name: "ENCA" }, Graph, Assign: {} };
  vm.createContext(box);
  const src = ["policy-compare.js", "baselineData.js", "baselineJoeyData.js", "baseline.js", "import.js"].filter((f) => fs.existsSync(path.join(root, "js", f)))
    .map((f) => fs.readFileSync(path.join(root, "js", f), "utf8")).join("\n;\n");
  vm.runInContext(`${src}\n;globalThis.I = Importer;`, box);
  return { I: box.I, pols, calls };
}
const raw = (id, name, state, users) => ({ id, displayName: name, state,
  conditions: { users: users || { includeUsers: ["All"], excludeGroups: ["bg"] }, applications: { includeApplications: ["All"] }, clientAppTypes: ["all"] },
  grantControls: { operator: "OR", builtInControls: ["mfa"] } });
const vm_ = (r) => ({ id: r.id, name: r.displayName, state: r.state, raw: r });
const fast = { missing: [1, 1], stale: [1, 1] };

test("a newer version Off beside an older one On is a candidate; On beside On is the half-switch (since 25486)", () => {
  const w = world();
  const list = [raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "disabled"),
    raw("c", "CA300-GRANT-Externals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), raw("d", "CA300-GRANT-Externals-IP-AnyApp-AnyPlatform-MFA-v1.1", "enabled")].map(vm_);
  const c = w.I.switchCandidates(list);
  assert.equal(c.length, 2);
  assert.equal(c[0].newer.id, "b");
  assert.equal(c[0].newerWasOff, true);
  assert.equal(c[1].newer.id, "d");
  assert.equal(c[1].newerWasOff, false);
  assert.equal(c[0].targetState, "enabled");
  assert.equal(c[0].needsCompare, false);
});

test("names or scope that differ need a Compare first", () => {
  const w = world();
  const list = [raw("a", "CA101-GRANT-Admins-IdentityProtection-AnyApp-AnyPlatform-Phishing-Resistant-MFA-v1.0", "enabled"),
    raw("b", "CA101-GRANT-Admins-IP-AnyApp-AnyPlatform-MFA-v1.2.1", "disabled", { includeGroups: ["admins"] })].map(vm_);
  const c = w.I.switchCandidates(list)[0];
  assert.equal(c.needsCompare, true);
  assert.ok(c.reasons.some((x) => /names differ/i.test(x)));
  assert.ok(c.reasons.some((x) => /Assignments/i.test(x)));
});

test("the switch: new version to the old state and read back, THEN the old one Off", async () => {
  const w = world();
  const a = raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabledForReportingButNotEnforced"), b = raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "disabled");
  w.pols.set("a", a); w.pols.set("b", b);
  const c = w.I.switchCandidates([a, b].map(vm_));
  const r = await w.I.switchOver(c, { readWaits: fast });
  assert.equal(r[0].ok, true, r[0].error);
  assert.deepEqual(JSON.parse(JSON.stringify(w.calls)), [["b", "enabledForReportingButNotEnforced"], ["a", "disabled"]]);
  assert.equal(w.pols.get("b").state, "enabledForReportingButNotEnforced");
  assert.equal(w.pols.get("a").state, "disabled");
});

test("a new version that does not read back leaves the old one untouched", async () => {
  const w = world({ sticky: "b" });
  const a = raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), b = raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "disabled");
  w.pols.set("a", a); w.pols.set("b", b);
  const r = await w.I.switchOver(w.I.switchCandidates([a, b].map(vm_)), { readWaits: fast });
  assert.equal(r[0].ok, false);
  assert.equal(w.pols.get("a").state, "enabled");
  assert.ok(!w.calls.some((c) => c[0] === "a"));
});

test("Report-only first overrides the old state", async () => {
  const w = world();
  const a = raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), b = raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "disabled");
  w.pols.set("a", a); w.pols.set("b", b);
  await w.I.switchOver(w.I.switchCandidates([a, b].map(vm_)), { readWaits: fast, reportOnlyFirst: true });
  assert.equal(w.pols.get("b").state, "enabledForReportingButNotEnforced");
  assert.equal(w.pols.get("a").state, "disabled");
});

test("an older version that refuses to go Off is reported as partly done", async () => {
  const w = world({ refuse: "a" });
  const a = raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), b = raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "disabled");
  w.pols.set("a", a); w.pols.set("b", b);
  const r = await w.I.switchOver(w.I.switchCandidates([a, b].map(vm_)), { readWaits: fast });
  assert.equal(r[0].ok, false);
  assert.equal(r[0].newerDone, true);
  assert.match(r[0].error, /both apply/);
});

test("25486: a newer version already On beside an older one still On is half a switch — only the older goes Off", async () => {
  const w = world();
  const a = raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), b = raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "enabled");
  w.pols.set("a", a); w.pols.set("b", b);
  const c = w.I.switchCandidates([a, b].map(vm_));
  assert.equal(c.length, 1);
  const r = await w.I.switchOver(c, { readWaits: fast, reportOnlyFirst: true });
  assert.equal(r[0].ok, true, r[0].error);
  assert.deepEqual(JSON.parse(JSON.stringify(w.calls)), [["a", "disabled"]], "the On newer version is not touched, not even by Report-only first");
  // a Report-only newer beside an On older is not offered
  const w2 = world();
  const c2 = w2.I.switchCandidates([raw("a", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0", "enabled"), raw("b", "CA200-GRANT-Internals-IP-AnyApp-AnyPlatform-MFA-v1.0.1", "enabledForReportingButNotEnforced")].map(vm_));
  assert.equal(c2.length, 0);
});
