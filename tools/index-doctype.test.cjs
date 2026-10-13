const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("index.html begins with the doctype and nothing before it", () => {
  const s = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(s.startsWith("<!DOCTYPE html>"), "text before or inside the doctype puts the page in quirks mode and prints it at the top");
  assert.ok(!/CTYPE html>/.test(s.replace("<!DOCTYPE html>", "")), "a stray fragment of the doctype remains");
});
