// js/idscore.js — the Entra Identity Secure Score tab and dashboard pieces.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const IS = new Function(read("js/idscore.js") + ";return IdScore;")();
const DEMO = new Function(read("js/demo.js") + ";return DEMO_DATA;")();

const pol = (name, state, extra) => ({ displayName: name, state, conditions: { users: { includeUsers: [], includeRoles: [] }, applications: { includeApplications: ["All"] }, clientAppTypes: ["all"], ...(extra.conditions || {}) }, grantControls: extra.grantControls || { builtInControls: [] } });
const RAWS = [
  pol("CA100-admins-MFA", "disabled", { conditions: { users: { includeRoles: ["62e90394-69f5-4237-9190-012177145e10"] } }, grantControls: { builtInControls: ["mfa"] } }),
  pol("CA002-legacy", "enabledForReportingButNotEnforced", { conditions: { users: { includeUsers: ["All"] }, clientAppTypes: ["exchangeActiveSync", "other"] }, grantControls: { builtInControls: ["block"] } }),
  pol("CA000-all-MFA", "enabled", { conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: ["All"] } }, grantControls: { authenticationStrength: { id: "x" } } }),
];

test("latest: newest row, percentage and the 30-day change", () => {
  const s = IS.latest(DEMO.idScores);
  assert.strictEqual(s.at.slice(0, 10), "2026-09-23");
  assert.strictEqual(s.pct, Math.round((34 / 71) * 1000) / 10);
  assert.ok(s.delta > 0 && s.deltaFrom);
  assert.strictEqual(IS.latest([]), null);
});

test("evidence: On beats report-only beats Off; none says so", () => {
  assert.strictEqual(IS.evidence("adminMfa", RAWS).verdict, "on", "the All-users MFA strength counts for admins too");
  assert.strictEqual(IS.evidence("legacy", RAWS).verdict, "report");
  assert.match(IS.evidence("legacy", RAWS).text, /nothing enforces it yet/);
  assert.strictEqual(IS.evidence("adminMfa", RAWS.slice(0, 1)).verdict, "off");
  assert.strictEqual(IS.evidence("signinRisk", RAWS).verdict, "none");
  assert.strictEqual(IS.evidence("nope", RAWS), null);
});

test("model over the demo recommendations", () => {
  const m = IS.model(DEMO.idScores, DEMO.idRecommendations, RAWS);
  assert.strictEqual(m.counts.all, DEMO.idRecommendations.length);
  assert.ok(m.rows[0].open, "open ones sort first");
  const legacy = m.rows.find((r) => r.type === "blockLegacyAuthentication");
  assert.strictEqual(legacy.lost, 8);
  assert.strictEqual(legacy.ev.verdict, "report");
  assert.strictEqual(m.rows.find((r) => r.type === "staleApps").lost, null, "best-practice items carry no points");
  assert.strictEqual(m.rows.find((r) => r.type === "pwagePolicyNew").parked, true);
  assert.ok(m.oneSwitch >= 1);
});

test("render and dashboard: escaped, filtered, read prompt before a read", () => {
  const recs = JSON.parse(JSON.stringify(DEMO.idRecommendations));
  recs[0].displayName = "<img src=x onerror=alert(1)>";
  const m = IS.model(DEMO.idScores, recs, RAWS);
  const html = IS.render(m, { filter: "all" });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(IS.render(m, { filter: "done" }).includes("Completed"));
  assert.match(IS.dashboardRecs(null, {}), /data-ovrun="is"/);
  assert.match(IS.dashboardRecs(m, {}), /data-ovtab="checks:idscore"/);
  assert.strictEqual(IS.dashboardTile(null, {}).unread, true);
  assert.match(IS.dashboardTile(m, {}).n, /%$/);
  assert.match(IS.toMd(m, "Contoso"), /# Identity Secure Score — Contoso/);
});
