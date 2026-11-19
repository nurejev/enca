// 🚨 E-Admins as their own import (33311, Mihai 19 Nov: "the cf must also have
// the create those 6. may put them seperate to import in the baseline tool").
// The six emergency-access policies (CA1100–CA1105) are expected under the
// CloudFellows and Joey Verlinden baselines, and ENCA carries its own copy
// (js/eadminsData.js). The comparison says which of them a tenant still
// needs (toCreateEAdmins) — the count on 🚨 Create E-Admins — and under
// CloudFellows they no longer hide inside "Import baseline (n)", which needs
// a backup ZIP they may not even be in.
// No credentials, external packages or network.
// Run: node --test tools/eadmins-separate.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));
const caGroup = (n) => { const m = /CA(\d{3,4})/.exec(String(n || '')); const num = m ? +m[1] : null; return { num, label: num == null ? 'Other' : `CA${Math.floor(num / 100)}xx` }; };

function world() {
  const ls = new Map();
  const box = { console: { log() {}, warn() {}, error() {} }, Set, Map, URL, structuredClone, JSON, Date, Math, encodeURIComponent, decodeURIComponent, setTimeout, toolHeadTail: () => '',
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) }, document: { dispatchEvent() {} }, CustomEvent: class {},
    Render: { caGroup }, AUTH_CONFIG: { scopes: [] }, BRANDING: { name: 'ENCA' }, Brand: { generatedBy: () => 'ENCA' } };
  vm.createContext(box);
  const src = ['groupTemplates.js', 'baselineData.js', 'baselineJoeyData.js', 'joeyPlusData.js', 'baselineSmbData.js', 'eadminsData.js', 'baseline.js', 'import.js']
    .map((f) => read(f)).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.B = Baseline; globalThis.CF = BASELINE; globalThis.S = BASELINE_SMB; globalThis.I = Importer; globalThis.EA = E_ADMINS;`, box);
  return box;
}
let n = 0;
const pvm = (name) => ({ id: `p${++n}`, name, state: 'off', raw: { id: `p${n}`, displayName: name, state: 'disabled' } });
const isEa = (r) => r.num >= 1100 && r.num <= 1105;
const GAP = ['missing', 'outdated', 'conflict'];
const eaNames = (w) => w.CF.policies.filter((p) => p.num >= 1100 && p.num <= 1105).map((p) => p.name);

test('CloudFellows, empty tenant: the six are the E-Admins gap and are not in the baseline import', () => {
  const w = world();
  const res = w.B.compare([], 'limonit');
  assert.equal(res.toCreateEAdmins.length, 6);
  assert.deepEqual(plain(res.toCreateEAdmins.map((r) => r.num)), [1100, 1101, 1102, 1103, 1104, 1105]);
  assert.equal(res.toImport.filter(isEa).length, 0, 'the six are not counted in Import baseline (n)');
  const gapRows = res.rows.filter((r) => GAP.includes(r.status)).length;
  assert.equal(res.toImport.length + 6, gapRows, 'nothing else left the import');
  assert.equal(res.toImportShared.filter(isEa).length, 6, 'they read as "+6 from ENCA\'s own copy"');
});

test('CloudFellows, the six in place: nothing to create', () => {
  const w = world();
  const res = w.B.compare(eaNames(w).map(pvm), 'limonit');
  assert.equal(res.toCreateEAdmins.length, 0);
  assert.equal(res.toImportShared.filter(isEa).length, 0);
});

test('CloudFellows, CA1100 at an older version: it is in the E-Admins gap', () => {
  const w = world();
  const names = eaNames(w);
  const old = names[0].replace(/-v\d+(\.\d+)*$/, '-v2.0');
  assert.notEqual(old, names[0]);
  const res = w.B.compare([old, ...names.slice(1)].map(pvm), 'limonit');
  assert.deepEqual(plain(res.toCreateEAdmins.map((r) => r.num)), [1100]);
});

test('Joey Verlinden, empty tenant: the same six, and his own import count is what it was', () => {
  const w = world();
  const res = w.B.compare([], 'joey');
  assert.equal(res.toCreateEAdmins.length, 6);
  assert.equal(res.toImport.filter((r) => r.shared).length, 0);
  assert.equal(res.toImport.length, res.rows.filter((r) => GAP.includes(r.status) && !r.shared).length);
});

test('SMB Basic covers its own break-glass: no E-Admins gap', () => {
  const w = world();
  const res = w.B.compare([], 'smb');
  assert.equal(res.toCreateEAdmins.length, 0);
});

test('the summary says the CloudFellows six come from ENCA\'s own copy', () => {
  const w = world();
  assert.match(w.B.sharedText(w.B.compare([], 'limonit').toImportShared), /6 🚨 E-Admins/);
});

// ---- the import the button opens: ONLY the six, from ENCA's own copy ----
const onlySix = (w, catId) => {
  const to = w.B.withContract(w.B.catalog(catId)), cf = w.B.catalog('limonit');
  return w.I.mergeShared({}, w.EA.bundle(), { label: w.EA.source.label, breakGlassFrom: cf.breakGlassGroup, breakGlassTo: to.breakGlassGroup });
};

test('ENCA\'s own copy holds the six the CloudFellows catalog names', () => {
  const w = world();
  assert.deepEqual(plain([...w.EA.names()].sort()), plain(eaNames(w).sort()));
});

test('the six alone, into an empty tenant: every one is taken as-is and forced Off', () => {
  const w = world();
  const m = onlySix(w, 'limonit');
  assert.equal(m.added.length, 6);
  const plan = w.I.plan(w.I.prepareBundle(m.bundle), []);
  assert.equal(plan.length, 6);
  assert.ok(plan.every((p) => p.asIs && p.forceOff), 'an emergency-access policy never lands On from this route');
  assert.ok(plan.every((p) => w.I.landingState(p, 'enabledForReportingButNotEnforced') === 'disabled'), 'not Report-only either, whatever the run lands');
});

test('under Joey Verlinden the break-glass group in the six is his, not CloudFellows\'', () => {
  const w = world();
  const joeyBg = w.B.withContract(w.B.catalog('joey')).breakGlassGroup, cfBg = w.B.catalog('limonit').breakGlassGroup;
  assert.notEqual(joeyBg.toLowerCase(), cfBg.toLowerCase());
  const names = onlySix(w, 'joey').bundle.groups.map((g) => g.displayName.toLowerCase());
  assert.ok(names.includes(joeyBg.toLowerCase()));
  assert.ok(!names.includes(cfBg.toLowerCase()));
});

test('under CloudFellows the break-glass group keeps its name', () => {
  const w = world();
  const cfBg = w.B.catalog('limonit').breakGlassGroup;
  assert.ok(onlySix(w, 'limonit').bundle.groups.some((g) => g.displayName === cfBg));
});

test('an E-Admins policy the tenant holds at an older version is planned, and still lands Off', () => {
  const w = world();
  const m = onlySix(w, 'limonit');
  const old = eaNames(w)[0].replace(/-v\d+(\.\d+)*$/, '-v2.0');
  const plan = w.I.plan(w.I.prepareBundle(m.bundle), [{ id: 't1', displayName: old, state: 'enabled' }]);
  const it = plan.find((p) => p.num === 1100);
  assert.ok(it && !it.exists, 'the newer version is not skipped as already there');
  assert.equal(w.I.landingState(it, 'enabledForReportingButNotEnforced'), 'disabled');
});

// ---- the button itself: markup and wiring, read from the shipped files ----
test('🚨 Create E-Admins sits on the Baseline toolbar, hidden until the comparison says there is a gap', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bar = html.slice(html.indexOf('id="blToolbar"'), html.indexOf('id="blCatalogPanel"'));
  const m = /<button class="btn" id="blEaCreate" style="display:none"[^>]*>/.exec(bar);
  assert.ok(m, 'the button is in the Baseline toolbar and starts hidden');
  assert.ok(bar.indexOf('id="blEaCreate"') < bar.indexOf('id="blImport"'), 'before 📥 Import baseline, which stays the last, primary action');
});
test('the button is painted from toCreateEAdmins and opens the import as shipped, never as a baseline switch', () => {
  const app = read('app.js');
  assert.match(app, /blResult\.toCreateEAdmins/);
  const h = app.slice(app.indexOf('$("blEaCreate").addEventListener'));
  assert.ok(h.length > 100, 'a click handler exists');
  const body = h.slice(0, h.indexOf('\n  });'));
  assert.match(body, /Importer\.mergeShared\(\{\}, E_ADMINS\.bundle\(\)/);
  assert.match(body, /mode: "shipped"/);
  assert.match(body, /only/);
  // the six carry CloudFellows names, so an import that guessed its baseline
  // from them would preflight CloudFellows' break-glass group under Joey's
  assert.match(body, /m\.bundle\.catalogId = res\.catalog\.id/);
});
test('the six alone, marked as an import for Joey Verlinden: his break-glass group, still as-is and Off', () => {
  const w = world();
  const m = onlySix(w, 'joey');
  m.bundle.catalogId = 'joey';
  assert.equal(w.I.catalogOfBundle(m.bundle), 'joey');
  const prepared = w.I.prepareBundle(m.bundle);
  const plan = w.I.plan(prepared, []);
  assert.equal(plan.length, 6);
  assert.ok(plan.every((p) => p.asIs && p.forceOff));
  const joeyBg = w.B.withContract(w.B.catalog('joey')).breakGlassGroup;
  assert.ok(prepared.groups.some((g) => g.displayName === joeyBg));
});

test('the baseline tenant holds the six under a (UP) staging prefix: still nothing to create', () => {
  const w = world();
  const res = w.B.compare(eaNames(w).map((nm) => pvm(`(UP)${nm}`)), 'limonit');
  assert.equal(res.toCreateEAdmins.length, 0);
});
