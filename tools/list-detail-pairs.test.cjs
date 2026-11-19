// The split view's list rows, built from a summary TABLE (ListDetail.pairs:
// 🚦 Sign-in log per policy, 🕓 Change audit summary) — beta 33309.
// A table cell says two things on two lines and its column header says what
// they are. Flattened with textContent both are lost: "1105" over
// "21 interrupted" read 110521 interrupted, and a bare — or "152 distinct"
// had no header left to explain it. No credentials, packages or network.
// Run: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const box = { console, Map, Set };
vm.createContext(box);
vm.runInContext(read("js/list-detail.js") + "\n;globalThis.LD = ListDetail;", box, { filename: "list-detail.js" });
const LD = box.LD;

// just enough of a DOM for a cell: child nodes with a tag and their text
const el = (tag, text) => ({ nodeType: 1, tagName: tag.toUpperCase(), textContent: text });
const tx = (text) => ({ nodeType: 3, textContent: text });
const td = (kids, attrs = {}) => ({ childNodes: kids, textContent: kids.map((k) => k.textContent).join(""),
  getAttribute: (n) => (n in attrs ? attrs[n] : null) });
const row = (...cells) => ({ cells });

test("two lines of one cell are two pieces — never 110521 interrupted", () => {
  const r = row(
    td([el("b", "REQ-PVM-MFA-Users-DLG")]),
    td([el("span", "1105"), el("div", "21 interrupted")]),
    td([tx("87 distinct")]));
  const { title, meta } = LD.rowText(r);
  assert.equal(title, "REQ-PVM-MFA-Users-DLG");
  assert.equal(meta, "1105 · 21 interrupted · 87 distinct");
  assert.ok(!meta.includes("110521"));
});

test("the title is the name alone; its second line opens the meta", () => {
  const signin = LD.rowText(row(td([el("b", "CA402-SESSION-GuestUsers-v1.0.1"), el("div", "report-only")]), td([tx("12")])));
  assert.equal(signin.title, "CA402-SESSION-GuestUsers-v1.0.1");
  assert.equal(signin.meta, "report-only · 12");
  const audit = LD.rowText(row(td([tx("\n  "), el("b", "CA-Exclude-BreakGlass"), el("div", "Group membership · exclusion group")]),
    td([el("span", "+3"), el("span", "−2")])));
  assert.equal(audit.title, "CA-Exclude-BreakGlass");
  assert.equal(audit.meta, "Group membership · exclusion group · +3 −2");
});

test("a cell says what it is: data-ldmeta replaces the bare value", () => {
  const r = row(td([el("b", "CA111")]),
    td([el("span", "185")], { "data-ldmeta": "185 failures" }),
    td([tx("152 distinct")], { "data-ldmeta": "152 users" }),
    td([tx("—")], { "data-ldmeta": "control not named in the log" }),
    td([tx("3 min ago")], { "data-ldmeta": "last 3 min ago" }));
  assert.equal(LD.rowText(r).meta, "185 failures · 152 users · control not named in the log · last 3 min ago");
});

test("an empty cell, a lone dash and an empty data-ldmeta add nothing", () => {
  const r = row(td([el("b", "Some group")]), td([]), td([el("span", "—")]), td([tx("x")], { "data-ldmeta": " " }), td([tx("2 h ago")]));
  assert.equal(LD.rowText(r).meta, "2 h ago");
});

test("🚦 the per-policy table labels its cells and counts what the filter left", () => {
  const app = read("js/app.js");
  const at = app.indexOf("ListDetail.pairs('siBody'");
  const view = app.slice(app.lastIndexOf('if (siView === "policies")', at), at);
  assert.equal((view.match(/data-ldmeta=/g) || []).length, 5, "failures, users, most affected, controls, last");
  assert.match(view, /control not named in the log/);
  assert.match(view, /siShown\(p\)/);
});

test("the pinned policy label pins to the panel, not to the page offset", () => {
  const css = read("css/list-detail.css");
  assert.match(css, /\.ld-pair-detail \.si-dethead\{[^}]*top:0/);
  // .ld-content scrolls sideways, which makes it the sticky scrollport and
  // one that never scrolls down — the label was pushed --si-dethead-top into
  // the list and stayed there
  assert.match(css, /\.ld-content:has\(>\.ld-pair-detail\)\{[^}]*overflow:visible/);
});

// ---- the sign-in rows inside the panel -------------------------------
const sbox = { console, Set, Map, JSON, Math, Date, Array, Object, Number, String, RegExp, Error };
vm.createContext(sbox);
vm.runInContext(read("js/signins.js") + "\n;globalThis.S = Signins;", sbox, { filename: "signins.js" });
const S = sbox.S;

test("no methods to list means no “signed in with”", () => {
  const hunting = S.authOf({ authenticationRequirement: "multiFactorAuthentication" });
  assert.equal(hunting.known, false);
  assert.equal(hunting.lead, "");
  assert.equal(hunting.line, hunting.summary);
  assert.ok(!/signed in with/.test(hunting.line));
  const entra = S.authOf({ authenticationRequirement: "multiFactorAuthentication", authenticationDetails: [
    { authenticationMethod: "Password", succeeded: true, authenticationStepRequirement: "Primary authentication" },
    { authenticationMethod: "Microsoft Authenticator", succeeded: true, authenticationStepResultDetail: "MFA completed in Azure AD" }] });
  assert.equal(entra.lead, "signed in with");
  assert.equal(entra.line, "signed in with " + entra.summary);
  const empty = S.authOf({ authenticationDetails: [] });
  assert.equal(empty.lead, "");
});

test("the platform is spelled as its name, whichever source wrote it", () => {
  const rec = (os) => ({ id: "1", createdDateTime: "2026-11-19T08:27:12Z", deviceDetail: { operatingSystem: os },
    appliedConditionalAccessPolicies: [{ id: "p", displayName: "CA111", result: "failure" }] });
  const os = (v) => S.parse(rec(v), "enforced").os;
  assert.equal(os("Ios"), "iOS");
  assert.equal(os("Ios 17.1"), "iOS 17.1");
  assert.equal(os("MacOs"), "macOS");
  assert.equal(os("Android"), "Android");
  assert.equal(os("Windows10"), "Windows10");
  assert.equal(os(""), "");
});
