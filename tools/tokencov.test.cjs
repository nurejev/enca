// js/tokencov.js — the 🎫 CAE & token protection tab of 🛡 Checks (R21, T46).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const Render = new Function("const esc=(s)=>String(s);" + read("js/render.js") + ";return Render;")();
const TC = new Function(read("js/tokencov.js") + ";return TokenCov;")();
const ML = new Function("const Baseline=undefined;" + read("js/mslearn.js") + ";return MSLearn;")();
const EXO = "00000002-0000-0ff1-ce00-000000000000", SPO = "00000003-0000-0ff1-ce00-000000000000", TEAMS = "cc15fd57-2c6c-4117-a88c-83b1d56b4bbe";
const pol = (id, name, o) => ({ id, displayName: name, state: (o && o.state) || "enabled",
  conditions: { users: { includeUsers: ["All"] }, applications: { includeApplications: (o && o.apps) || ["All"] }, clientAppTypes: (o && o.cat) || ["all"],
    platforms: o && o.plat ? { includePlatforms: o.plat } : null, locations: o && o.loc ? { includeLocations: ["x"] } : null, devices: o && o.dev ? { deviceFilter: o.dev } : null },
  grantControls: { operator: "OR", builtInControls: ["mfa"] }, sessionControls: (o && o.session) || null });
const TP = { secureSignInSession: { isEnabled: true } };
const run = (raws) => TC.analyze(raws, { caGroup: Render.caGroup, learn: ML.runSome(["token-prot-", "cae-"], raws) });
const kinds = (m) => m.findings.map((f) => f.kind).sort();

test("no token protection for Admins is medium, for Internals info", () => {
  const m = run([pol("a", "CA100-Admins-MFA"), pol("b", "CA200-Internals-MFA")]);
  assert.strictEqual(m.findings.find((f) => f.persona.startsWith("Admins")).sev, "medium");
  assert.strictEqual(m.findings.find((f) => f.persona.startsWith("Internals")).sev, "info");
});
test("a well-formed token protection policy covers its persona and resources, no Learn findings", () => {
  const good = pol("t", "CA108-Admins-TokenProtection", { apps: [EXO, SPO, TEAMS], cat: ["mobileAppsAndDesktopClients"], plat: ["windows"], session: TP,
    dev: { mode: "exclude", rule: '(device.systemLabels -contains "CloudPC" -and device.trustType -eq "AzureAD") -or (device.systemLabels -contains "AzureVirtualDesktop" -and device.trustType -eq "AzureAD") -or (device.profileType -eq "SecureVM" -and device.trustType -eq "AzureAD")' } });
  const m = run([good, pol("a", "CA100-Admins-MFA")]);
  const row = m.rows.find((r) => r.key === 100);
  assert.strictEqual(row.tp.length, 1);
  assert.deepStrictEqual(row.tp[0].resources, ["Exchange Online", "SharePoint Online", "Teams Services"]);
  assert.strictEqual(row.tp[0].learn.length, 0);
  assert.deepStrictEqual(m.cover.find((c) => c.label === "Teams Services").on, [row.label]);
  assert.ok(!kinds(m).includes("tp-none"));
});
test("a misconfigured token protection policy is counted from MS Learn, not raised again in its own words", () => {
  const bad = pol("t", "CA108-Admins-TokenProtection", { apps: ["All"], session: TP });
  const m = run([bad]);
  const f = m.findings.find((x) => x.kind === "tp-learn");
  assert.ok(f && /Microsoft Learn finding/.test(f.text));
  assert.ok(m.rows[0].tp[0].learn.length >= 2);
});
test("report-only token protection only", () => {
  const m = run([pol("t", "CA208-Internals-TP", { state: "enabledForReportingButNotEnforced", apps: [EXO], cat: ["mobileAppsAndDesktopClients"], plat: ["windows"], session: TP })]);
  assert.ok(kinds(m).includes("tp-report-only"));
});
test("CAE: disabled points at MS Learn; strict without a location policy changes nothing; with one it is info", () => {
  const dis = run([pol("c", "CA305-Externals-CAE", { session: { continuousAccessEvaluation: { mode: "disabled" } } })]);
  assert.ok(kinds(dis).includes("cae-disabled"));
  const strict = run([pol("c", "CA009-Global-CAE", { session: { continuousAccessEvaluation: { mode: "strictLocation" } } })]);
  assert.ok(kinds(strict).includes("cae-strict-noloc"));
  const withLoc = run([pol("c", "CA009-Global-CAE", { session: { continuousAccessEvaluation: { mode: "strictLocation" } } }), pol("l", "CA010-Global-BlockCountries", { loc: true })]);
  assert.ok(kinds(withLoc).includes("cae-strict") && !kinds(withLoc).includes("cae-strict-noloc"));
});
test("Off policies are ignored; runSome leaves MS Learn's own counters alone", () => {
  const m = run([pol("t", "CA108-Admins-TP", { state: "disabled", session: TP })]);
  assert.strictEqual(m.rows.length, 0);
  assert.strictEqual(ML.suppressedCount(), 0);
});
test("render and export escape names", () => {
  const m = run([pol("a", "CA100-<b>x</b>", { session: TP })]);
  assert.ok(!TC.render(m, {}).includes("<b>x</b>"));
  assert.match(TC.toMd(m, "T"), /Token protection|token protection/);
});
