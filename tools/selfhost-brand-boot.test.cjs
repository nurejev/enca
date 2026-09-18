// Self-hosting (beta 25389): the deployment's branding reaches the FIRST
// paint. selfhost/docker-entrypoint.sh writes the branding file into
// js/selfhost-boot.js at container start, and that file paints from it with
// an empty localStorage — the first visit in a browser.
// No credentials, external packages or network.
// Run: node --test tools/selfhost-brand-boot.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const brand = (extra = {}) => JSON.stringify({
  v: 1,
  brand: {
    org: 'Contoso', hideOrgName: true, logo: PNG, logoWide: true, favicon: PNG,
    colorsLight: { '--green': '#0064c8', '--accent2': '#2b83dc' },
    colorsDark: { '--green': '#6aaef0' },
    ...extra,
  },
});

// A container start against a copy of the site.
function start(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enca-boot-'));
  fs.mkdirSync(path.join(dir, 'js'));
  for (const f of ['selfhost-boot.js', 'authConfig.js']) fs.copyFileSync(path.join(root, 'js', f), path.join(dir, 'js', f));
  const out = execFileSync('sh', [path.join(root, 'selfhost', 'docker-entrypoint.sh'), 'true'],
    { env: { ...process.env, ENCA_ROOT: dir, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { dir, out, boot: () => fs.readFileSync(path.join(dir, 'js', 'selfhost-boot.js'), 'utf8') };
}

// The boot script in a browser that has never been here: no localStorage.
function paint(src, store = {}) {
  const head = { children: [], appendChild(el) { this.children.push(el); return el; } };
  const html = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const box = {
    JSON, console: { warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    document: {
      documentElement: html, head,
      createElement: (tag) => ({ tag, id: '', textContent: '', rel: '', href: '' }),
    },
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(src, box);
  const style = head.children.find((e) => e.id === 'selfhostBootCss');
  const icon = head.children.find((e) => e.rel === 'icon');
  return { css: style ? style.textContent : '', favicon: icon ? icon.href : '', brandAttr: html.attrs['data-brand'] || '' };
}

test('a first visit is branded: the entrypoint writes the brand into the boot script and it paints', () => {
  const s = start({ ENCA_BRANDING: brand() });
  assert.match(s.out, /branding applied to the first paint/);
  const src = s.boot();
  assert.match(src, /ENCA-RUNTIME-BRAND/);
  assert.match(src, /window\.ENCA_BRAND_BOOT = "/);
  const r = paint(src);            // nothing in localStorage — the first visit
  assert.equal(r.brandAttr, 'selfhost');
  assert.match(r.css, /--green:#0064c8/);
  assert.match(r.css, /--green:#6aaef0/, 'the dark palette too');
  assert.ok(r.css.includes(`content:url("${PNG}")`), 'the logo replaces the image before it is painted');
  assert.match(r.css, /\.logo b\{display:none\}/, 'hideOrgName is honoured');
  assert.equal(r.favicon, PNG);
});

test('the block is idempotent, and a start without branding removes it', () => {
  const s = start({ ENCA_BRANDING: brand() });
  const again = execFileSync('sh', [path.join(root, 'selfhost', 'docker-entrypoint.sh'), 'true'],
    { env: { ...process.env, ENCA_ROOT: s.dir, ENCA_BRANDING: brand() }, encoding: 'utf8' });
  assert.match(again, /first paint/);
  assert.equal((s.boot().match(/>>> ENCA-RUNTIME-BRAND/g) || []).length, 1, 'one block, not two');
  fs.rmSync(path.join(s.dir, 'selfhost-branding.json'));
  execFileSync('sh', [path.join(root, 'selfhost', 'docker-entrypoint.sh'), 'true'], { env: { ...process.env, ENCA_ROOT: s.dir }, encoding: 'utf8' });
  assert.equal(s.boot().includes('ENCA-RUNTIME-BRAND'), false, 'a restart without branding stops painting the old one');
  assert.equal(s.boot(), fs.readFileSync(path.join(root, 'js', 'selfhost-boot.js'), 'utf8'), 'and leaves the file as it ships');
});

test('what the gear applied in this browser still wins over the deployment', () => {
  const s = start({ ENCA_BRANDING: brand() });
  const mine = { brand: { colorsLight: { '--green': '#ff0000' } } };
  const r = paint(s.boot(), { 'enca-selfhost-brand': JSON.stringify(mine) });
  assert.match(r.css, /--green:#ff0000/);
  assert.equal(r.css.includes('#0064c8'), false);
});

test('the deployment beats a cache of an older read of it', () => {
  const s = start({ ENCA_BRANDING: brand() });
  const stale = { brand: { colorsLight: { '--green': '#00ff00' } } };
  const r = paint(s.boot(), { 'enca-selfhost-brand-cache': JSON.stringify(stale) });
  assert.match(r.css, /--green:#0064c8/);
  assert.equal(r.css.includes('#00ff00'), false);
});

test('nothing in the branding can become code or escape a CSS rule', () => {
  const nasty = brand({
    colorsLight: { '--green': '#111}\n:root{--ink:red', '--ok': '#222' },
    logo: 'javascript:alert(1)',
    favicon: 'https://example.com/x.png',
  });
  const s = start({ ENCA_BRANDING: nasty });
  const src = s.boot();
  // the value is a STRING in the file, never an object literal
  assert.equal(/window\.ENCA_BRAND_BOOT = \{/.test(src), false);
  assert.equal(/\n:root\{--ink:red/.test(src), false, 'newlines are stripped before it is embedded');
  const r = paint(src);
  assert.equal(r.css.includes('--ink:red'), false, 'the charset guard drops a value that could close the rule');
  assert.match(r.css, /--ok:#222/, 'the rest of the palette still lands');
  assert.equal(r.css.includes('javascript:'), false, 'a logo that is not a data: URI is ignored');
  assert.equal(r.favicon, '', 'and so is a favicon that is not one');
});

test('a branding that is not JSON is refused, and the file is left alone', () => {
  const s = start({ ENCA_BRANDING: 'not json at all' });
  assert.equal(s.boot().includes('ENCA-RUNTIME-BRAND'), false);
  assert.equal(fs.existsSync(path.join(s.dir, 'selfhost-branding.json')), false);
});

test('a mounted branding file is picked up without any environment variable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enca-boot-'));
  fs.mkdirSync(path.join(dir, 'js'));
  fs.copyFileSync(path.join(root, 'js', 'selfhost-boot.js'), path.join(dir, 'js', 'selfhost-boot.js'));
  fs.writeFileSync(path.join(dir, 'selfhost-branding.json'), brand());
  execFileSync('sh', [path.join(root, 'selfhost', 'docker-entrypoint.sh'), 'true'], { env: { ...process.env, ENCA_ROOT: dir }, encoding: 'utf8' });
  const r = paint(fs.readFileSync(path.join(dir, 'js', 'selfhost-boot.js'), 'utf8'));
  assert.equal(r.brandAttr, 'selfhost');
  assert.match(r.css, /--green:#0064c8/);
});
