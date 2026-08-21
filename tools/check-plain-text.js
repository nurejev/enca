#!/usr/bin/env node
// ======================================================================
// js/changelog.js, js/promote.js and the TOOL_VERSIONS notes in
// js/version.js are PLAIN TEXT. Every one of those strings is escaped when
// it is rendered, so a <b> written into an entry comes out as literal angle
// brackets mid-sentence on the page.
//
// The app already says so: js/changelog.js has carried the rule in its
// header since build 25156, and build 25162 added the CL_MARKUP self-check
// that console.warns on every channel and puts a "markup — will render
// literally" chip beside the offending entry on the beta site.
//
// Both of those fire AFTER the commit, and only if somebody is looking.
// This runs before it. Same regex as js/app.js CL_MARKUP, deliberately:
// two copies that disagree would be worse than one that is late.
//
//   node tools/check-plain-text.js          # exits 1 on a slip
//
// As a git hook:
//   printf '#!/bin/sh\nexec node tools/check-plain-text.js\n' > .git/hooks/pre-commit
//   chmod +x .git/hooks/pre-commit
//
// Carry the emphasis in the WORDS instead — capitals for the key term, the
// way the entries already do. Prose that NAMES an element is legitimate and
// does not trip this: "selecting from a <datalist>" is fine, because the
// check only looks for the tags an author reaches for to FORMAT.
// ======================================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MARKUP = /<\/?(?:b|i|em|strong|code|u|br|small|mark)\b[^>]*>|&(?:nbsp|amp|lt|gt|quot);/gi;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// A FILE THAT IS NOT ON THIS BRANCH IS NOT A SLIP. js/promote.js is
// beta-only by design, and this script is per-clone tooling that follows the
// working tree across branches — so on main the read would throw ENOENT and
// the pre-commit hook would refuse every commit for a file that is correctly
// absent. Missing means "nothing to check here", which is the honest answer;
// a file that EXISTS and cannot be parsed still throws, because that is a
// real problem.
const evaluate = (rel, name) => {
  if (!fs.existsSync(path.join(ROOT, rel))) return null;
  const m = { exports: {} };
  new Function("module", read(rel) + `\n;module.exports=typeof ${name}!=="undefined"?${name}:null;`)(m);
  return m.exports;
};

const slips = [];
const check = (where, text) => {
  const hits = String(text || "").match(MARKUP);
  if (hits) slips.push({ where, tags: [...new Set(hits)].join(" ") });
};

// js/changelog.js — one release per build, item.text is what renders.
for (const rel of evaluate("js/changelog.js", "CHANGELOG") || []) {
  for (const it of rel.items || []) check(`changelog ${rel.build} [${it.kind}] ${it.tool}`, it.text);
}

// js/promote.js — title/what/why and every line of the test checklist.
const promote = evaluate("js/promote.js", "PROMOTE");
for (const it of (promote && promote.items) || []) {
  for (const k of ["title", "what", "why"]) check(`promote item ${it.n}.${k}`, it[k]);
  (it.test || []).forEach((line, i) => check(`promote item ${it.n}.test[${i}]`, line));
}
for (const st of (promote && promote.staying) || []) {
  for (const k of ["title", "why"]) check(`promote staying.${k}`, st[k]);
}

// js/version.js — the per-tool notes.
const tools = evaluate("js/version.js", "TOOL_VERSIONS") || {};
for (const [key, v] of Object.entries(tools)) check(`version TOOL_VERSIONS.${key}.note`, v.note);

if (!slips.length) {
  console.log("plain text: clean (changelog, promotion queue, tool notes)");
  process.exit(0);
}
console.error(`plain text: ${slips.length} slip(s) — these render as literal angle brackets:\n`);
for (const s of slips) console.error(`  ${s.where}\n      ${s.tags}`);
console.error("\nCarry the emphasis in the words instead. See the header of this file.");
process.exit(1);
