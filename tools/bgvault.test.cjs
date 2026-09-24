// js/bgvault.js — break-glass accounts in the restricted unit, and the
// scoped-role check on every restricted unit (T20 3.1, beta 32402).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const BV = new Function(read("js/bgvault.js") + ";return BgVault;")();
const PR = new Function(read("js/bgvault.js") + ";" + read("js/protect.js") + ";return Protect;")();

const U = (id, upn, o) => ({ id, displayName: id, userPrincipalName: upn || `${id}@contoso.onmicrosoft.com`, accountEnabled: true, onPremisesSyncEnabled: false, ...(o || {}) });
const BGU = { id: "au-bg", name: "CAB-SEC-RMAU-BreakGlass" };
const IN = { auId: "au-bg", auName: "CAB-SEC-RMAU-BreakGlass" };
const GA = (k) => ({ kind: k });

test("an account is in, open, elsewhere or unknown — never open when it was not read", () => {
  const a = BV.accounts({ members: [U("bg1"), U("bg2"), U("bg3"), U("bg4")], unit: BGU,
    prot: new Map([["bg1", IN], ["bg2", null], ["bg3", { auId: "au-x", auName: "Other RMAU" }]]),
    ga: new Map([["bg1", GA("permanent")], ["bg2", GA("permanent")]]) });
  const st = Object.fromEntries(a.rows.map((r) => [r.id, r.state]));
  assert.deepStrictEqual(st, { bg1: "in", bg2: "open", bg3: "other", bg4: "unknown" });
  assert.strictEqual(a.open, 1);
  assert.strictEqual(a.protectedN, 2, "a restricted unit protects it wherever it is");
  assert.strictEqual(a.canPlace, true);
});

test("unread members are unknown, not an empty group", () => {
  const a = BV.accounts({ members: null, error: "403", unit: BGU });
  assert.strictEqual(a.state, "unknown");
  assert.match(BV.panel(a), /not read/);
});

test("stale accounts only in a break-glass unit, never in a shared persona unit", () => {
  const unitUsers = [U("bg1"), U("old")];
  const a = BV.accounts({ members: [U("bg1")], unit: BGU, prot: new Map([["bg1", IN]]), unitUsers });
  assert.deepStrictEqual(a.stale.map((r) => r.id), ["old"]);
  const b = BV.accounts({ members: [U("bg1")], unit: { id: "au-glo", name: "CAB-SEC-RMAU-GLO-Exclusions" }, prot: new Map([["bg1", { auId: "au-glo", auName: "x" }]]), unitUsers });
  assert.deepStrictEqual(b.stale, [], "every other user of a persona unit would read as a former break-glass account");
});

test("no unit to go to: the tick is greyed and says why", () => {
  const miss = BV.accounts({ members: [U("bg1")], unit: { id: null, name: "CAB-SEC-RMAU-BreakGlass", missing: true }, prot: new Map([["bg1", null]]) });
  assert.strictEqual(miss.canPlace, false);
  assert.match(BV.placeWhy(miss), /does not exist yet/);
  assert.match(BV.panel(miss, { gid: "g" }), /pr-tick dis/);
  const none = BV.accounts({ members: [U("bg1")], unit: null, prot: new Map([["bg1", null]]) });
  assert.match(BV.placeWhy(none), /no break-glass vault/);
});

test("shape chips: synced and custom domain are deviations; the reset warning shows for a Global Administrator", () => {
  const a = BV.accounts({ members: [U("bg1", "bg1@contoso.com", { onPremisesSyncEnabled: true })], unit: BGU, prot: new Map([["bg1", null]]), ga: new Map([["bg1", GA("permanent")]]) });
  const h = BV.panel(a, { gid: "g", ticks: new Set(["bg1"]) });
  assert.match(h, /bg-dev[^>]*>synced/);
  assert.match(h, /custom domain/);
  assert.match(h, /nobody can reset these accounts/);
  assert.match(h, /data-pr-acc="bg1"[^>]*checked/);
  assert.match(h, /data-pr-pim/, "PIM not read → the button to read it");
});

test("tile counts each account once across groups", () => {
  const a = BV.accounts({ members: [U("bg1"), U("bg2")], unit: BGU, prot: new Map([["bg1", IN], ["bg2", null]]) });
  const b = BV.accounts({ members: [U("bg2")], unit: BGU, prot: new Map([["bg2", null]]) });
  const t = BV.tile([a, b]);
  assert.match(t, />1 \/ 2</);
  assert.match(t, /1 still editable/);
});

const GRP = BV.ROLES.groups.id, USR = BV.ROLES.users.id;
test("scope verdicts: correct, role missing, nobody, empty unit, not read", () => {
  const r = BV.scopes({ pim: true, units: [
    { id: "a", name: "A", groups: 3, users: 0 },
    { id: "b", name: "B", groups: 1, users: 2, gaUsers: 2 },
    { id: "c", name: "C", groups: 4, users: 0 },
    { id: "d", name: "D", groups: 0, users: 0 },
    { id: "e", name: "E", groups: 1, users: 0 },
  ], scoped: new Map([
    ["a", { active: [{ roleTemplateId: GRP, who: "x" }], eligible: [] }],
    ["b", { active: [{ roleTemplateId: GRP, who: "x" }], eligible: [] }],
    ["c", { active: [], eligible: [] }],
    ["d", { active: [], eligible: [] }],
    ["e", { active: null, error: "403" }],
  ]) });
  const v = Object.fromEntries(r.rows.map((x) => [x.unit.id, x.verdict]));
  assert.deepStrictEqual(v, { a: "ok", b: "warn", c: "bad", d: "empty", e: "unknown" });
  assert.deepStrictEqual(r.rows.find((x) => x.unit.id === "b").missing, ["User Administrator"]);
  assert.strictEqual(r.rows[0].verdict, "bad", "worst first");
  const h = BV.scopeCard(r);
  assert.match(h, /Global Administrators? in it stay/, "a User Administrator cannot reach the Global Administrators — said on the row");
});

test("an eligible (PIM) assignment satisfies the need, and is tagged eligible", () => {
  const r = BV.scopes({ pim: true, units: [{ id: "a", name: "A", groups: 0, users: 1 }], scoped: new Map([["a", { active: [], eligible: [{ roleTemplateId: USR, who: "IAM", whoType: "group" }] }]]) });
  assert.strictEqual(r.rows[0].verdict, "ok");
  assert.match(BV.scopeCard(r), /eligible/);
});

test("MS Learn band: High for open accounts, nothing when all is well", () => {
  const open = BV.accounts({ members: [U("bg1")], unit: BGU, prot: new Map([["bg1", null]]) });
  assert.match(BV.learnBand(open, null, "CAB-SEC-U-BreakGlass"), /High/);
  assert.match(BV.learnBand(open, null), /data-ml-bg-open/);
  const ok = BV.accounts({ members: [U("bg1")], unit: BGU, prot: new Map([["bg1", IN]]) });
  const sc = BV.scopes({ units: [{ id: "au-bg", name: "x", groups: 1, users: 1 }], scoped: new Map([["au-bg", { active: [{ roleTemplateId: GRP }, { roleTemplateId: USR }], eligible: null }]]) }).rows[0];
  assert.strictEqual(BV.learnBand(ok, sc), "");
});

test("Protect: open accounts make a fully locked break-glass group “accounts”, and attention", () => {
  const acc = BV.accounts({ members: [U("bg1")], unit: BGU, prot: new Map([["bg1", null]]) });
  const g = { id: "g-bg", name: "CAB-SEC-U-BreakGlass", breakGlass: true, refs: { include: [], exclude: ["p"] } };
  const ctx = { status: new Map([["g-bg", IN]]), statusError: null, nestingOf: () => "disabled", nestedOf: () => 0, ineligible: () => null, target: () => null, nestAvail: true, bgAcc: () => acc };
  const c = PR.classify(g, ctx);
  assert.strictEqual(c.cat, "accounts");
  assert.strictEqual(c.canAcc, true);
  assert.ok(PR.matches(c, "attention"));
  const html = PR.render([g], ctx, { bg: new Map([["g-bg", { acc, ticked: 1, html: BV.panel(acc, { gid: "g-bg" }) }]]), bgTile: BV.tile([acc]), accN: 1 });
  assert.match(html, /data-pr-accall="g-bg"[^>]*checked/);
  assert.match(html, /pr-subrow/);
  assert.match(html, /id="prBgAck"/, "second acknowledgement when an account is ticked");
  assert.match(html, /id="prGo">Protect 1</);
  const none = { ...ctx, bgAcc: () => BV.accounts({ members: [U("bg1")], unit: BGU, prot: new Map([["bg1", IN]]) }) };
  assert.strictEqual(PR.classify(g, none).cat, "full");
});
