// tools/pim PowerShell scripts (New-PimBaseline, New-PimRegions,
// Find-PimDuplicates, PimCommon) against the fake Graph in
// tools/pim/tests/FakeGraph.ps1 — no tenant, no network. Runs
// tools/pim/tests/Test-PimScripts.ps1 when PowerShell 7 (pwsh) is on PATH
// (or PWSH points at it); skipped otherwise.
// Run: node --test tools/pimscripts.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const root = path.join(__dirname, "..");
const harness = path.join(root, "tools", "pim", "tests", "Test-PimScripts.ps1");
const pwsh = [process.env.PWSH, "pwsh"].find((p) => {
  if (!p) return false;
  const r = spawnSync(p, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], { encoding: "utf8" });
  return r.status === 0 && Number(String(r.stdout).trim()) >= 7;
});

test("tools/pim: every script's pass conditions against the fake Graph", { skip: pwsh ? false : "pwsh (PowerShell 7) not found — set PWSH to run", timeout: 600000 }, () => {
  assert.ok(fs.existsSync(harness));
  const r = spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-File", harness], { cwd: root, encoding: "utf8", timeout: 590000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  assert.equal(fails.length, 0, out);
  assert.equal(r.status, 0, out);
  const pass = Number((out.match(/# pass (\d+)/) || [])[1] || 0);
  assert.ok(pass >= 24, `expected at least 24 passing script tests, got ${pass}\n${out}`);
});
