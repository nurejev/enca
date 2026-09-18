// The CHROME strings of js/branding.js under a BRAND_OVERRIDES look: the
// browser <title> and the login heading must wear the active brand, while the
// EXPORT credit stays the neutral product one whoever is signed in. Both
// halves matter — a self-hosted deployment whose tab still names the publisher
// leaks that name into every bookmark and screenshot, and an export that wore
// the deployment's name would be claiming authorship of the tool.
// Run with the other offline checks: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");

function load() {
  const src = fs.readFileSync(path.join(root, "js/branding.js"), "utf8");
  return new Function(`${src}\n; return { BRANDING, Brand };`)();
}
// What applyBranding() hands to Brand.setActive: a MERGED COPY, never a
// mutation of BRANDING (js/app.js activeBrand()).
const merge = (BRANDING, over) => Object.assign({}, BRANDING, over, { colors: BRANDING.colors });

test("with no override the chrome strings are the deployment's own", () => {
  const { BRANDING, Brand } = load();
  assert.equal(Brand.chromeTitle, Brand.title);
  assert.equal(Brand.pageTitle, [BRANDING.name, BRANDING.longName, BRANDING.org].filter(Boolean).join(" · "));
});

test("an override moves the <title> off the publisher's name", () => {
  const { BRANDING, Brand } = load();
  const before = Brand.pageTitle;
  Brand.setActive(merge(BRANDING, { name: "Dovilo CA", longName: "Access Baseline", org: "Dovilo" }));
  assert.equal(Brand.pageTitle, "Dovilo CA · Access Baseline · Dovilo");
  assert.notEqual(Brand.pageTitle, before);
  assert.ok(!/Limon-IT/.test(Brand.pageTitle));
});

test("an override moves the login heading fallback too", () => {
  const { BRANDING, Brand } = load();
  Brand.setActive(merge(BRANDING, { name: "Dovilo CA", longName: "Access Baseline", org: "Dovilo" }));
  assert.equal(Brand.chromeTitle, "Dovilo CA — Access Baseline");
});

test("the export credit stays neutral under an override", () => {
  const { BRANDING, Brand } = load();
  const title = Brand.title, credit = Brand.credit;
  Brand.setActive(merge(BRANDING, { name: "Dovilo CA", longName: "Access Baseline", org: "Dovilo" }));
  assert.equal(Brand.title, title);
  assert.equal(Brand.credit, credit);
  assert.ok(!/Dovilo/.test(Brand.generatedBy("Exported")));
});

test("an override with no longName gives the bare name", () => {
  const { BRANDING, Brand } = load();
  Brand.setActive(merge(BRANDING, { name: "Dovilo CA", longName: "", org: "Dovilo" }));
  assert.equal(Brand.chromeTitle, "Dovilo CA");
  assert.equal(Brand.pageTitle, "Dovilo CA · Dovilo");
});

test("clearing the override puts both chrome strings back", () => {
  const { BRANDING, Brand } = load();
  const page = Brand.pageTitle, chrome = Brand.chromeTitle;
  Brand.setActive(merge(BRANDING, { name: "Dovilo CA", org: "Dovilo" }));
  Brand.setActive(null);
  assert.equal(Brand.pageTitle, page);
  assert.equal(Brand.chromeTitle, chrome);
});

test("BRANDING itself is never mutated by an override", () => {
  const { BRANDING, Brand } = load();
  const org = BRANDING.org, name = BRANDING.name;
  Brand.setActive(merge(BRANDING, { name: "Dovilo CA", org: "Dovilo" }));
  assert.equal(BRANDING.org, org);
  assert.equal(BRANDING.name, name);
});

test("js/app.js paints the login heading from the active look, not the neutral title", () => {
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(app, /brandLoginTitle[\s\S]{0,80}B\.loginTitle \|\| Brand\.chromeTitle/);
  assert.ok(!/B\.loginTitle \|\| Brand\.title/.test(app), "the neutral Brand.title must not be the heading fallback");
});
