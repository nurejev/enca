// Regenerating js/baselineData.js from its reference tenant (build 25436).
// Run with the other offline checks: node --test tools/*.test.cjs
//
// The catalog's prose was written by a one-off generator that is not in this
// repo. So the rule this is built on, and what these tests exist to hold:
// COMPARE STRUCTURE, GENERATE PROSE. If the diff string-compared against
// prose re-derived here, one comma out of place would report all 105 policies
// as changed and the tool would be worse than useless. The comparison must
// ignore order and decoration; the serialiser is used only for the output.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const box = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(box);
for (const f of ["baselineData.js", "baselineJoeyData.js", "baselineLive.js", "baseline.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", f), "utf8"), box, { filename: f });
}
vm.runInContext("globalThis.B = Baseline;", box);
const { B } = box;

// A tenant view model, in the shape js/model.js produces.
const vmOf = (over = {}) => ({
  name: "CA205-GRANT-Internals-IP-AnyApp-AnyPlatform-Compliant-v3.0",
  users: { inc: ["CAB-SEC-U-Persona-Internals (group)"], exc: ["CAB-SEC-U-BreakGlass (group)"] },
  apps: { inc: ["All resources"], exc: [] },
  net: { inc: ["Any network or location"], exc: [] },
  cond: { platforms: ["Any device"], platformsExc: [], clientApps: ["Any client app"], risks: [], devFilter: null, authFlows: [], insider: [] },
  grant: { mode: "grant", controls: ["Require device to be marked compliant"], op: null },
  session: [],
  ...over,
});
const catOf = (over = {}) => ({
  num: 205, name: "CA205-GRANT-Internals-IP-AnyApp-AnyPlatform-Compliant-v3.0", version: "3.0", tag: "",
  include: ["CAB-SEC-U-Persona-Internals (group)"], exclude: ["CAB-SEC-U-BreakGlass (group)"],
  resources: "All resources", network: "Any network or location",
  conditions: ["Platforms: Any device", "Client apps: Any client app"],
  grant: "Require device to be marked compliant", block: false, session: "",
  ...over,
});

// ---- the serialiser --------------------------------------------------

test("a view model becomes a catalog entry with the catalog's own keys", () => {
  const e = B.vmToEntry(vmOf(), catOf());
  assert.deepEqual([...Object.keys(e)].map(String).sort(),
    ["block", "conditions", "exclude", "grant", "include", "name", "network", "num", "resources", "session", "tag", "version"]);
});

test("num, version, tag and shared belong to the CATALOG and are carried across", () => {
  // they describe the baseline's own numbering, not anything in the tenant
  const e = B.vmToEntry(vmOf(), catOf({ num: 205, version: "3.0", tag: "UP", shared: "CloudFellows" }));
  assert.equal(e.num, 205);
  assert.equal(e.tag, "UP");
  assert.equal(e.shared, "CloudFellows");
});

test("a policy the catalog does not define is tagged NEW and numbered from its name", () => {
  const e = B.vmToEntry(vmOf({ name: "CA512-GRANT-G_Admin-IP-AnyApp-AnyPlatform-MFA-v1.0" }), null);
  assert.equal(e.num, 512);
  assert.equal(e.tag, "NEW");
  assert.equal(e.version, "1.0");
});

test("the catalog's prose conventions are reproduced", () => {
  const e = B.vmToEntry(vmOf({
    apps: { inc: ["All resources"], exc: ["Azure Windows VM Sign-In"] },
    net: { inc: ["Any network or location"], exc: ["CountryWhitelist"] },
    grant: { mode: "grant", controls: ["Require risk remediation", "Authentication strength: Phishing-resistant MFA + TAP"], op: "AND" },
    session: [{ t: "Sign-in frequency: Every time" }],
  }), catOf());
  assert.equal(e.resources, "All resources · − Azure Windows VM Sign-In");
  assert.equal(e.network, "Any network or location · − CountryWhitelist");
  assert.equal(e.grant, "Require risk remediation<br>Authentication strength: Phishing-resistant MFA + TAP<br>_Require all of the selected controls_");
  assert.equal(e.session, "Sign-in frequency: Every time");
});

test("OR reads as one of the selected controls, and a single control gets no operator line", () => {
  const two = B.vmToEntry(vmOf({ grant: { mode: "grant", controls: ["A", "B"], op: "OR" } }), catOf());
  assert.match(two.grant, /_Require one of the selected controls_$/);
  const one = B.vmToEntry(vmOf({ grant: { mode: "grant", controls: ["A"], op: "OR" } }), catOf());
  assert.equal(one.grant, "A");
});

test("a block policy reads Block access", () => {
  const e = B.vmToEntry(vmOf({ grant: { mode: "block", controls: ["Block access"], op: null } }), catOf());
  assert.equal(e.block, true);
  assert.equal(e.grant, "Block access");
});

// ---- the comparison: it must NOT see what is not a change ------------

test("an identical policy produces no diff at all", () => {
  assert.deepEqual([...B.entryDiff(catOf(), B.vmToEntry(vmOf(), catOf()))], []);
});

test("GROUP ORDER is not a change — the header says it varies per read", () => {
  const cat = catOf({ exclude: ["A (group)", "B (group)", "C (group)"] });
  const ten = B.vmToEntry(vmOf({ users: { inc: cat.include, exc: ["C (group)", "A (group)", "B (group)"] } }), cat);
  assert.deepEqual([...B.entryDiff(cat, ten)], []);
});

test("condition ORDER and case are not a change", () => {
  const cat = catOf({ conditions: ["Client apps: Any client app", "Platforms: Any device"] });
  const ten = B.vmToEntry(vmOf(), cat);   // the serialiser emits Platforms first
  assert.deepEqual([...B.entryDiff(cat, ten)], []);
});

test("markdown and <br> decoration are not a change", () => {
  const cat = catOf({ grant: "A<br>B<br>_Require all of the selected controls_" });
  const ten = B.vmToEntry(vmOf({ grant: { mode: "grant", controls: ["A", "B"], op: "AND" } }), cat);
  assert.deepEqual([...B.entryDiff(cat, ten)], []);
});

// ---- …and it MUST see what is -----------------------------------------

test("a real control change is reported, with both sides", () => {
  const cat = catOf();
  const ten = B.vmToEntry(vmOf({ grant: { mode: "block", controls: ["Block access"], op: null } }), cat);
  const d = [...B.entryDiff(cat, ten)].map((x) => String(x.field));
  assert.ok(d.includes("block"), "the grant mode changed");
  assert.ok(d.includes("grant"), "and so did the control");
});

test("a dropped exclusion group is reported", () => {
  const cat = catOf({ exclude: ["CAB-SEC-U-BreakGlass (group)", "CAB-SEC-U-CA205-Exclusion (group)"] });
  const ten = B.vmToEntry(vmOf(), cat);   // the tenant has only break-glass
  const d = [...B.entryDiff(cat, ten)];
  assert.equal(d.length, 1);
  assert.equal(String(d[0].field), "exclude");
});

test("a device filter change is reported", () => {
  const cat = catOf();
  const ten = B.vmToEntry(vmOf({ cond: { ...vmOf().cond, devFilter: { mode: "exclude", rule: 'device.trustType -eq "AzureAD"' } } }), cat);
  assert.ok([...B.entryDiff(cat, ten)].some((x) => String(x.field) === "conditions"));
});

// ---- the review, and the hold that does not swallow ------------------

const reviewOf = (rows, holds) => B.catalogReview({ rows }, holds);

test("rows are sorted into changed, new here, gone and unchanged", () => {
  const r = reviewOf([
    { num: 205, status: "ok", baseline: catOf(), tenant: vmOf() },
    { num: 206, status: "ok", baseline: catOf({ num: 206, grant: "Block access", block: true }), tenant: vmOf() },
    { num: 9, status: "missing", baseline: catOf({ num: 9 }), tenant: null },
    { num: 512, status: "extra", baseline: null, tenant: vmOf({ name: "CA512-GRANT-x-v1.0" }) },
  ], {});
  assert.equal(r.unchanged.length, 1);
  assert.equal(r.changed.length, 1);
  assert.equal(r.gone.length, 1);
  assert.equal(r.added.length, 1);
  assert.equal(Number(r.added[0].num), 512);
});

test("a hold takes the policy out of the run", () => {
  const cat = catOf({ exclude: ["CAB-SEC-U-BreakGlass (group)", "CAB-SEC-U-CA205-Exclusion (group)"] });
  const rows = [{ num: 205, status: "ok", baseline: cat, tenant: vmOf() }];
  const sig = String(B.diffSig([...B.entryDiff(cat, B.vmToEntry(vmOf(), cat))]));
  const r = reviewOf(rows, { 205: { reason: "drift in that tenant, not a baseline redesign", sig } });
  assert.equal(r.changed.length, 0);
  assert.equal(r.held.length, 1);
});

test("a hold does NOT swallow a LATER, different change", () => {
  // this is the whole point of tying a hold to a signature: the 58 dropped
  // exclusion groups stay held, but if one of those policies then changes its
  // grant, nobody has looked at that yet
  const cat = catOf({ exclude: ["CAB-SEC-U-BreakGlass (group)", "CAB-SEC-U-CA205-Exclusion (group)"] });
  const r = reviewOf(
    [{ num: 205, status: "ok", baseline: cat, tenant: vmOf({ grant: { mode: "block", controls: ["Block access"], op: null } }) }],
    { 205: { reason: "held earlier", sig: "exclude:cab-sec-u-breakglass (group)" } });
  assert.equal(r.held.length, 0, "the old signature no longer matches");
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0].reopened, true);
});

// ---- the output --------------------------------------------------------

test("the generated source carries the entries, the holds and the userimpact reminder", () => {
  const cat = catOf();
  const ten = B.vmToEntry(vmOf({ grant: { mode: "block", controls: ["Block access"], op: null } }), cat);
  const taken = [{ num: 205, ten, diff: [...B.entryDiff(cat, ten)] }];
  const src = String(B.catalogSource({}, taken, { 1: { reason: "tenant-specific VIP group" } }, { tenant: "cloudfellows.dev" }));
  assert.match(src, /regenerated from cloudfellows\.dev/);
  assert.match(src, /CA205/);
  assert.match(src, /DELIBERATE DEPARTURES/);
  assert.match(src, /CA001 — tenant-specific VIP group/);
  assert.match(src, /RE-CHECK js\/userimpact\.js/);
  assert.match(src, /revised: "\d{4}-\d{2}-\d{2}"/);
  // the entry itself is valid JSON on its own line
  const line = src.split("\n").find((l) => l.trim().startsWith("{"));
  assert.equal(JSON.parse(line.trim().replace(/,$/, "")).num, 205);
});

test("a pass that takes nothing says so rather than emitting an empty revision", () => {
  assert.match(String(B.catalogSource({}, [], {}, {})), /No policy change was taken/);
});
