// 🌍 Fill from regions Settings (beta 32512): the markup and CSS contract that keeps the
// rows aligned. A field is a three-row cell (label, control, hint or status) and the grids
// share rows through subgrid; the old flex-column label that let a wrapped label push its
// input down must not come back. No browser needed: it reads the source.
// Run: node --test tools/dgfill-layout.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
const i0 = app.indexOf("function dgSettingsHtml"), i1 = app.indexOf("function dgSourcesHtml");
const settings = app.slice(i0, i1);

test("every Settings and deploy-group field is a three-part cell", () => {
  assert.equal((settings.match(/class="dg-cell/g) || []).length, 5, "four settings cells (the external marker is the wide one) plus the deploy-group template");
  assert.ok(!/<label class="mini">/.test(settings), "the old stacked mini label is gone");
  assert.ok(/dg-grid dg-g3/.test(settings) && /dg-grid dg-g4/.test(settings));
});

test("the external marker has a row of its own, with the select, starts with and a prefix input", () => {
  assert.match(settings, /dg-cell dg-wide[^]*?<select class="txt" data-dg-opt="extAttr"[^]*?dg-sw">starts with<\/span><input class="txt" data-dg-opt="extPrefix"/);
  assert.match(css, /\.dg-wide\{grid-column:1 \/ -1\}/);
});

test("cells share rows through subgrid, with a stacked fallback", () => {
  assert.match(css, /\.dg-cell\{display:grid;grid-row:span 3;grid-template-rows:subgrid/);
  assert.match(css, /@supports not \(grid-template-rows:subgrid\)\{\.dg-cell\{display:flex/);
});

test("narrow windows drop to two columns and then one", () => {
  assert.match(css, /@media \(max-width:900px\)\{\.dg-g3,\.dg-g4\{grid-template-columns:repeat\(2/);
  assert.match(css, /@media \(max-width:560px\)\{\.dg-g3,\.dg-g4\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("the select is styled like the inputs and the datalist arrow is hidden", () => {
  assert.match(css, /\.dg-opts select\.txt\{[^}]*border:1px solid var\(--border\);border-radius:10px/);
  assert.match(css, /\.dg-opts input::-webkit-calendar-picker-indicator\{display:none/);
});

test("every control keeps the data attribute the handlers read", () => {
  for (const k of ["mainDomain", "secondDomains", "prefix", "extAttr", "extPrefix"]) assert.ok(settings.includes(`data-dg-opt="${k}"`), k);
  assert.ok(settings.includes("data-dg-tgt="));
  assert.ok(settings.includes('list="dgDomList"'));
});
