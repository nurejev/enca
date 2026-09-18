// js/selfhost-boot.js must put the deployment's logo on the <img> ITSELF,
// not only paint over it with content:url(). The CSS rule leaves the markup's
// own src loaded and decodable, so the product's logo can still reach the
// screen on a cold start, and an engine that ignores content on a replaced
// element never replaces it at all.
// Run with the other offline checks: node --test tools/*.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js/selfhost-boot.js"), "utf8");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

// A DOM stub with exactly the surface the boot script touches.
function el(tag, { id = "", sel = [] } = {}) {
  return { tagName: tag, id, dataset: {}, style: {}, src: "", alt: "", nodeType: 1,
           matches: (s) => sel.includes(s), querySelectorAll: () => [] };
}
function run(brand, { noObserver = false } = {}) {
  const head = [], observers = [], listeners = {};
  const box = {
    window: { ENCA_BRAND_BOOT: brand == null ? undefined : JSON.stringify({ v: 1, brand }) },
    localStorage: { getItem: () => null },
    JSON, String, Object, Array,
    ...(noObserver ? {} : { MutationObserver: class {
      constructor(cb) { this.cb = cb; this.live = false; observers.push(this); }
      observe() { this.live = true; }
      disconnect() { this.live = false; }
      deliver(nodes) { this.cb([{ addedNodes: nodes }]); }
    } }),
    document: {
      documentElement: { setAttribute() {} },
      body: { nodeType: 1, matches: () => false, querySelectorAll: () => [] },
      head: { appendChild: (n) => head.push(n) },
      createElement: (t) => ({ tagName: t.toUpperCase(), rel: "", href: "", set textContent(v) { this._css = v; }, get textContent() { return this._css; } }),
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
    },
  };
  box.window.document = box.document;
  vm.createContext(box);
  vm.runInContext(src, box);
  return { head, observers, listeners, style: head.find((n) => n._css) };
}
const BRAND = { name: "Dovilo CA", org: "Dovilo", logo: PNG };
const LOGO_SEL = ".logo img, .login-card > img";

test("the branded src is set on an img the parser delivers", () => {
  const { observers } = run(BRAND);
  assert.equal(observers.length, 1, "one observer, watching for the logo imgs");
  const img = el("IMG", { id: "brandLogoLogin", sel: [LOGO_SEL] });
  observers[0].deliver([img]);
  assert.equal(img.src, PNG);
  assert.equal(img.alt, "Dovilo");
});

test("the content:url rule is still there as the other half", () => {
  const { style } = run(BRAND);
  assert.ok(style && style._css.includes(`content:url("${PNG}")`), "the CSS belt is still written");
});

test("an unrelated img is left alone", () => {
  const { observers } = run(BRAND);
  const other = el("IMG", { id: "someScreenshot", sel: [] });
  observers[0].deliver([other]);
  assert.equal(other.src, "");
});

test("a second delivery of the same node does not set it twice", () => {
  const { observers } = run(BRAND);
  const img = el("IMG", { id: "brandLogo", sel: [LOGO_SEL] });
  observers[0].deliver([img]);
  img.src = "changed-by-something-else";
  observers[0].deliver([img]);
  assert.equal(img.src, "changed-by-something-else");
});

test("a wide wordmark keeps its aspect on the first paint too", () => {
  const { observers } = run({ ...BRAND, logoWide: true });
  const head = el("IMG", { id: "brandLogo", sel: [LOGO_SEL] });
  const login = el("IMG", { id: "brandLogoLogin", sel: [LOGO_SEL] });
  observers[0].deliver([head, login]);
  assert.equal(head.style.width, "auto");
  assert.equal(head.style.height, "34px");
  assert.equal(login.style.height, "56px");
});

test("DOMContentLoaded sweeps once more and lets the observer go", () => {
  const { observers, listeners } = run(BRAND);
  assert.ok(observers[0].live, "observing while the body is parsed");
  listeners.DOMContentLoaded();
  assert.equal(observers[0].live, false, "disconnected once there is nothing left to catch");
});

test("a logo that fails the data: guard sets no src", () => {
  const { observers } = run({ ...BRAND, logo: "https://evil.example/mark.png" });
  if (observers.length) {
    const img = el("IMG", { id: "brandLogo", sel: [LOGO_SEL] });
    observers[0].deliver([img]);
    assert.equal(img.src, "", "an off-origin logo is not painted");
  }
});

test("a deployment with no branding registers nothing", () => {
  const { observers, head } = run(null);
  assert.equal(observers.length, 0);
  assert.equal(head.length, 0);
});

test("a browser with no MutationObserver still gets the favicon and the CSS", () => {
  // The first cut of this fix sat BEFORE the favicon link and had no guard, so
  // in a sandbox without MutationObserver it threw, the outer catch swallowed
  // it, and the favicon was silently lost. It is last, guarded, and has its
  // own catch for exactly that reason.
  const { head, style } = run({ ...BRAND, favicon: PNG }, { noObserver: true });
  const icon = head.find((n) => n.rel === "icon");
  assert.ok(icon && icon.href === PNG, "the favicon still lands");
  assert.ok(style && style._css.includes("content:url("), "and the CSS rule is still written");
});
