#!/usr/bin/env node
// ======================================================================
// THE TOOL SCREEN FRAME — checked, not trusted.
//
// css/app.css states the contract every tool screen follows: a head card,
// a sticky toolbar whose controls sit in one fixed order, and the result in
// a .tool-body. The stylesheet's `order` values make a screen DRAW in that
// order even when its markup does not, which is exactly why this file has
// to exist: a screen written in the wrong order would look right and tab
// wrong, and nothing on the page would say so.
//
// Build 25351 put all 33 screens in order and took 96 inline margins out.
// This is what stops the 34th from arriving out of order.
//
//   node tools/check-toolbar-order.js      # exits 1 on a slip
//
// As a git hook, alongside the plain-text check:
//   printf '#!/bin/sh\nexec node tools/check-plain-text.js && exec node tools/check-toolbar-order.js\n' > .git/hooks/pre-commit
//   chmod +x .git/hooks/pre-commit
//
// THE SLOTS, in order. A screen uses the ones it needs and skips the rest;
// what it may not do is put them in a different order.
//
//   tabs    .tool-tabs      the host's tab strip, mounted by app.js
//   find    .search         search within what this tool loaded
//   scope   .seg .tb-scope  which set the tool is looking at
//   filter  .chip-filter    chips that narrow the rows in that set
//   window  .tb-win         the time range read from the tenant
//   extra   anything else    this tool's own controls
//   act     .tb-actions     refresh, exports, the primary write
// ======================================================================
const fs = require("fs");
const path = require("path");

const IDX = path.join(__dirname, "..", "index.html");
const SLOT = ["tabs", "find", "scope", "filter", "window", "extra", "act"];
const VOID = new Set(["input", "img", "br", "hr", "meta", "link", "source", "area", "col", "embed", "track", "wbr"]);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

// A commented-out element must not unbalance the depth count, so comments are
// blanked to spaces of the same length and every offset still lines up.
function blankComments(s) {
  let out = "", i = 0;
  for (;;) {
    const a = s.indexOf("<!--", i);
    if (a < 0) { out += s.slice(i); break; }
    const b = s.indexOf("-->", a);
    if (b < 0) { out += s.slice(i); break; }
    out += s.slice(i, a) + " ".repeat(b + 3 - a);
    i = b + 3;
  }
  return out;
}

function topChildren(inner) {
  const probe = blankComments(inner);
  const out = [];
  let depth = 0, start = -1, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(probe)) !== null) {
    const close = m[1] === "/", name = m[2].toLowerCase();
    const selfc = m[3] === "/" || VOID.has(name);
    if (close) {
      depth--;
      if (depth === 0 && start >= 0) { out.push(inner.slice(start, TAG.lastIndex)); start = -1; }
    } else if (selfc) {
      if (depth === 0) out.push(m[0]);
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return out;
}

const attrOf = (t, n) => {
  const m = t.match(new RegExp('^<[a-zA-Z]+[^>]*?\\b' + n + '="([^"]*)"'));
  return m ? m[1] : "";
};

function slotOf(child) {
  const c = attrOf(child, "class").split(/\s+/);
  if (c.includes("tool-tabs")) return 0;
  if (c.includes("search")) return 1;
  if (c.includes("seg") || c.includes("tb-scope")) return 2;
  if (c.includes("chip-filter")) return 3;
  if (c.includes("tb-win")) return 4;
  if (c.includes("tb-actions")) return 6;
  return 5;
}

const html = fs.readFileSync(IDX, "utf8");
const fails = [];
const notes = [];
let screens = 0, toolbars = 0;

const SEC = /<section id="screen-([a-z0-9-]+)" class="screen tool"([^>]*)>([\s\S]*?)\n  <\/section>/g;
let s;
while ((s = SEC.exec(html)) !== null) {
  const id = s[1], attrs = s[2], body = s[3];
  screens++;

  // The spacing belongs to the stylesheet. An inline margin on any of the
  // three framed elements is the thing 25351 removed; it must not come back.
  const inline = [
    [/<div class="list-card readme" id="\w+" style="margin-top:/, "the head card"],
    [/<div class="toolbar"(?: id="\w+")? style="margin-top:/, "the toolbar"],
    [/<div class="tool-body"[^>]*style="margin-top:/, "the result body"],
  ];
  inline.forEach(([re, what]) => {
    if (re.test(body)) fails.push(`screen-${id}: ${what} sets its own margin — .screen.tool owns that now`);
  });

  // A screen without a toolbar has to say why, on the section itself. Build
  // 25353 gave 🔮 What-If, ⚖ Compare users and 🔗 Group usage real toolbars
  // — their controls were sitting inside their form card — and left one
  // declared exception: 🔒 Protect exclusions, whose controls are drawn into
  // its result by code shared with 👥 CA groups ⑥.
  const declared = (attrs.match(/data-no-toolbar="([^"]*)"/) || [])[1];
  const ti = body.indexOf('<div class="toolbar"');
  if (ti < 0) {
    if (declared) notes.push(`screen-${id}: no toolbar, declared — ${declared}`);
    else fails.push(`screen-${id}: no toolbar, and no data-no-toolbar on the section saying why. `
      + `A tool screen either has one or states the reason it does not.`);
    continue;
  }
  if (declared) fails.push(`screen-${id}: declares data-no-toolbar but has a toolbar — remove the attribute`);
  toolbars++;
  const openEnd = body.indexOf(">", ti) + 1;
  // mountToolTabs looks a toolbar up by id, so one without an id can never
  // host a tab strip. All 32 have one since 25353.
  if (!/ id="\w+"/.test(body.slice(ti, openEnd))) {
    fails.push(`screen-${id}: the toolbar has no id — mountToolTabs looks one up by id, `
      + `so this screen could never host a tab strip`);
  }

  const rest = body.slice(openEnd);
  const probe = blankComments(rest);
  let depth = 1, closeAt = -1, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(probe)) !== null) {
    const close = m[1] === "/", name = m[2].toLowerCase();
    const selfc = m[3] === "/" || VOID.has(name);
    if (close) { depth--; if (depth === 0) { closeAt = m.index; break; } }
    else if (!selfc) depth++;
  }
  if (closeAt < 0) { fails.push(`screen-${id}: the toolbar never closes`); continue; }

  const kids = topChildren(rest.slice(0, closeAt));
  const order = kids.map(slotOf);
  for (let i = 1; i < order.length; i++) {
    if (order[i] < order[i - 1]) {
      fails.push(`screen-${id}: ${SLOT[order[i]]} comes after ${SLOT[order[i - 1]]} — `
        + `the order is ${order.map((o) => SLOT[o]).join(" ")}, it must be `
        + `${[...order].sort((a, b) => a - b).map((o) => SLOT[o]).join(" ")}`);
      break;
    }
  }
}

if (screens !== 33) {
  notes.push(`${screens} screens carry .screen.tool — it was 33 at build 25351. `
    + `A new tool screen should carry it; a screen that stopped being one should not.`);
}

notes.forEach((n) => console.log("note:  " + n));
if (!fails.length) {
  console.log(`ok:    ${screens} tool screens, ${toolbars} toolbars, every one in slot order`);
  process.exit(0);
}
fails.forEach((f) => console.error("FAIL:  " + f));
console.error(`\n${fails.length} screen${fails.length === 1 ? "" : "s"} out of contract. `
  + `The order is in css/app.css under THE SLOT ORDER.`);
process.exit(1);
