// 🛡 Checks: every tab keeps its result across a tab switch (build 25434).
// Run with the other offline checks: node --test tools/*.test.cjs
//
// Leaving 📘 MS Learn and coming back used to throw the findings away and run
// the whole pass again — four Graph reads and 30 checks over every policy,
// plus the severity filter, the expanded findings and the Suggested fixes tab
// lost with it. Its three sibling tabs had the guard; this one did not.
//
// The bug is in a DOM-and-session-state path that has no unit harness, so what
// is asserted here is the STRUCTURE that makes it impossible: every one of the
// four tab-open functions returns early when it already holds a result. That
// is the regression a future tab would otherwise repeat.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const app = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");

// The tab, its open function, and the state that proves a result is in hand.
const TABS = [
  { tab: "bypass", fn: "openGapCheck", held: "gcResult" },
  { tab: "mslearn", fn: "openMsLearn", held: "mlGroups" },
  { tab: "cis", fn: "openCis", held: "ciResult" },
];

function body(fn) {
  const at = app.indexOf(`function ${fn}(`);
  assert.ok(at > 0, `${fn} not found — was it renamed?`);
  // to the next top-level function declaration
  const next = app.indexOf("\n  function ", at + 10), nextAsync = app.indexOf("\n  async function ", at + 10);
  const end = Math.min(...[next, nextAsync].filter((x) => x > 0));
  return app.slice(at, end > 0 ? end : at + 4000);
}

for (const { tab, fn, held } of TABS) {
  test(`${fn} (${tab}) renders its cached result instead of re-running`, () => {
    const src = body(fn);
    // An early return guarded by the state that holds the result. The
    // condition may itself contain parentheses (mlKey === mlReadKey()), so
    // this looks for the guard opening on that state and a return close by,
    // rather than trying to parse the condition.
    const guard = new RegExp(`if\\s*\\(\\s*${held}[\\s\\S]{0,140}?return;`);
    assert.match(src, guard,
      `${fn} must return early when ${held} is set — otherwise reopening the tab re-runs the whole pass`);
  });
}

test("openMsLearn's guard is keyed, because that tab runs by itself on open", () => {
  // Its siblings wait for a Run button, so a bare `if (result)` is safe for
  // them. This one auto-runs, so a result from another tenant, another policy
  // snapshot or the other scope must not be shown as the current one's.
  const src = body("openMsLearn");
  assert.match(src, /mlKey === mlReadKey\(\)/, "the cache guard must compare a key, not just presence");
  const key = app.slice(app.indexOf("const mlReadKey ="), app.indexOf("const mlReadKey =") + 200);
  for (const part of ["tenantId", "isDemo", "policiesReadAt", "mlDisabled"]) {
    assert.ok(key.includes(part), `the key must include ${part} — a change in it invalidates the result`);
  }
});

test("a completed run stamps the key, and an empty tenant clears it", () => {
  assert.ok(/mlKey = mlReadKey\(\);/.test(app), "runMsLearn must stamp the key when the result lands");
  assert.match(body("openMsLearn"), /No policies loaded[\s\S]*mlKey = null/,
    "with no policies there is no result, so no key may survive");
});
