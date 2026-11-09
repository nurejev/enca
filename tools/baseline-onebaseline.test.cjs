// 🧬 Baseline (33205, Mihai 9 Nov: "when viewing the baselines in ENCA logged
// in to devcf, it shows every policy through each other. It should show only
// CloudFellows, or Joey+, or SMB"). devcf — the source tenant — holds all
// three baselines side by side, and their CA numbers overlap (36 of Joey's
// and all 19 of SMB Basic's are CloudFellows numbers too). The comparison
// matches only within the selected baseline's naming; the other baselines'
// policies are listed apart, never as clashes, extras or "also here" copies.
// No credentials, external packages or network.
// Run: node --test tools/baseline-onebaseline.test.cjs
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
  const src = ['groupTemplates.js', 'baselineData.js', 'baselineJoeyData.js', 'joeyPlusData.js', 'baselineSmbData.js', 'baseline.js', 'import.js']
    .map((f) => read(f)).join('\n;\n');
  vm.runInContext(`${src}\n;globalThis.B = Baseline; globalThis.CF = BASELINE; globalThis.J = BASELINE_JOEY; globalThis.JP = JOEY_PLUS; globalThis.S = BASELINE_SMB; globalThis.I = Importer;`, box);
  return { ...box, ls };
}

// devcf as it stands: every CloudFellows policy (E-Admins included), every
// Joey Verlinden policy plus the Joey+ additions, every SMB Basic policy.
function devcf(w) {
  let n = 0;
  const vm = (name, fam) => ({ id: `p${++n}`, name, state: 'report', fam, raw: { id: `p${n}`, displayName: name, state: 'enabledForReportingButNotEnforced' } });
  return [
    ...w.CF.policies.map((p) => vm(p.name, 'limonit')),
    ...w.J.policies.map((p) => vm(p.name, 'joey')),
    ...w.JP.entries().map((p) => vm(p.name, 'joey')),
    ...w.S.policies.map((p) => vm(p.name, 'smb')),
  ];
}
const eadmins = (w) => w.CF.policies.filter((p) => p.num >= 1100 && p.num <= 1105);

test('familyOf: each baseline\'s naming is recognised, and nothing else is claimed', () => {
  const w = world();
  for (const p of w.CF.policies) assert.equal(w.B.familyOf(p.name), 'limonit', p.name);
  for (const p of w.J.policies) assert.equal(w.B.familyOf(p.name), 'joey', p.name);
  for (const p of w.JP.entries()) assert.equal(w.B.familyOf(p.name), 'joey', p.name);
  for (const p of w.S.policies) assert.equal(w.B.familyOf(p.name), 'smb', p.name);
  assert.equal(w.B.familyOf('(NEW) CA201-BLOCK-SMB-Users-AnyApp-Windows-OutsideCompliantNetwork-v1.0.9'), 'smb', 'staging prefix aside');
  assert.equal(w.B.familyOf('(UP) CA201-BLOCK-Internals-IP-AnyApp-AnyPlatform-HighUserRisk-v3.0'), 'limonit');
  assert.equal(w.B.familyOf('Block legacy auth'), null, 'an unnumbered policy is nobody\'s');
  assert.equal(w.B.familyOf('CA050-MyOwnPolicy-v1.0'), null, 'the tenant\'s own numbering is nobody\'s');
});

for (const [id, own] of [['limonit', 'limonit'], ['joey', 'joey'], ['smb', 'smb']]) {
  test(`devcf under ${id}: every row is the selected baseline's own — no clash, no extra, no "also here" from another baseline`, () => {
    const w = world();
    const vms = devcf(w);
    const r = plain(w.B.compare(vms, id, { byDefinition: true }));
    assert.equal(r.counts.conflict || 0, 0, 'no number clash');
    assert.equal(r.counts.extra || 0, 0, 'no "not in baseline" noise');
    assert.equal(r.counts.missing || 0, 0, 'nothing missing — devcf holds the whole baseline');
    assert.equal(r.rows.filter((x) => (x.others || []).length).length, 0, 'no "also here" copies from the other baselines');
    for (const x of r.rows) {
      assert.ok(x.tenant, `CA${x.num} matched`);
      assert.equal(x.tenant.name, x.baseline.name, `CA${x.num} matched its own policy, not a namesake: ${x.tenant.name}`);
      assert.ok(!x.duplicates, `CA${x.num} reads no duplicates`);
    }
    assert.equal(r.coverage, 100);
    // the rest of the tenant is listed apart, by baseline, and adds up
    const inRows = new Set(r.rows.map((x) => x.tenant.id));
    const expectForeign = vms.filter((p) => !inRows.has(p.id));
    assert.equal(r.foreign.length, expectForeign.length, 'every policy not on a row is listed apart');
    assert.ok(r.foreign.every((f) => f.family !== own), 'none of them is the selected baseline\'s');
    assert.equal(r.foreignBy.reduce((k, g) => k + g.count, 0), r.foreign.length);
    assert.deepEqual(r.foreignBy.map((g) => g.id).sort(), ['joey', 'limonit', 'smb'].filter((f) => f !== own).sort());
  });
}

test('devcf under Joey Verlinden: the CloudFellows E-Admins stay his expected shared rows; the rest of CloudFellows is listed apart', () => {
  const w = world();
  const r = plain(w.B.compare(devcf(w), 'joey'));
  for (const p of eadmins(w)) {
    const row = r.rows.find((x) => x.num === p.num);
    assert.equal(row.tenant.name, p.name, `CA${p.num} is matched under Joey`);
    assert.equal(row.shared, 'CloudFellows');
    assert.ok(!r.foreign.some((f) => f.name === p.name), 'not listed as another baseline');
  }
  const cf = r.foreignBy.find((g) => g.id === 'limonit');
  assert.equal(cf.count, w.CF.policies.length - eadmins(w).length);
  assert.equal(r.foreignBy.find((g) => g.id === 'smb').count, w.S.policies.length);
  // Joey+ CA018–CA023 are his rows too
  for (const p of w.JP.entries()) assert.equal(r.rows.find((x) => x.num === p.num && x.shared === 'Joey+').tenant.name, p.name);
});

test('devcf under SMB Basic: no E-Admins expected, so CloudFellows\' are listed with the rest of CloudFellows', () => {
  const w = world();
  const r = plain(w.B.compare(devcf(w), 'smb'));
  assert.equal(r.rows.length, w.S.policies.length);
  assert.equal(r.foreignBy.find((g) => g.id === 'limonit').count, w.CF.policies.length);
  assert.equal(r.foreignBy.find((g) => g.id === 'joey').count, w.J.policies.length + w.JP.entries().length);
});

test('a CloudFellows CA201 is never counted as SMB CA201 or Joey CA201 — an SMB tenant missing CA201 reads Missing, not matched', () => {
  const w = world();
  const cf201 = w.CF.policies.find((p) => p.num === 201).name;
  const smbOnly = w.S.policies.filter((p) => p.num !== 201 && p.num !== 1).map((p, i) => ({ id: `s${i}`, name: p.name, state: 'on' }));
  // the CF CA001 shares the word "global" with SMB CA001 — enough to pass before 33205
  const cf001 = w.CF.policies.find((p) => p.num === 1).name;
  const vms = [...smbOnly, { id: 'cf201', name: cf201, state: 'on' }, { id: 'cf001', name: cf001, state: 'on' }];
  const r = plain(w.B.compare(vms, 'smb'));
  assert.equal(r.rows.find((x) => x.num === 201).status, 'missing');
  assert.equal(r.rows.find((x) => x.num === 1).status, 'missing');
  assert.deepEqual(r.foreign.map((f) => f.id).sort(), ['cf001', 'cf201']);
  const j = plain(w.B.compare([{ id: 'cf201', name: cf201, state: 'on' }], 'joey'));
  assert.equal(j.rows.find((x) => x.num === 201).status, 'missing');
  assert.ok(w.B.mismatchReason(w.S.policies.find((p) => p.num === 1).name, cf001), 'mismatchReason says it is another baseline\'s');
  assert.match(w.B.mismatchReason(w.S.policies.find((p) => p.num === 1).name, cf001), /CloudFellows way/);
});

test('a tenant on ONE baseline reads exactly as before: an older version is still Outdated, its own unnamed-baseline policies still Not in baseline', () => {
  const w = world();
  const p1 = w.CF.policies.find((p) => p.num === 0);
  const older = p1.name.replace(/-v[\d.]+$/, '-v1.0.0');
  const vms = [{ id: 'a', name: older, state: 'on' }, { id: 'b', name: 'CA050-MyOwnPolicy-v1.0', state: 'on' }];
  const r = plain(w.B.compare(vms, 'limonit'));
  assert.equal(r.rows.find((x) => x.num === 0).status, 'outdated');
  assert.equal(r.rows.find((x) => x.num === 50).status, 'extra', 'nobody\'s naming: still judged against the selected catalog');
  assert.equal(r.foreign.length, 0);
});

test('the table lists the other baselines collapsed, with a count and a link per baseline; the summary says they are not counted', () => {
  const w = world();
  const r = w.B.compare(devcf(w), 'limonit', { byDefinition: true });
  const html = w.B.renderTable(r, 'all', '', new Set());
  assert.match(html, /<details class="list-card bl-foreign"[^>]*>/);
  assert.doesNotMatch(html, /<details class="list-card bl-foreign"[^>]* open>/, 'collapsed by default');
  const n = r.foreign.length;
  assert.match(html, new RegExp(`Other baselines in this tenant \\(${n}\\)`));
  assert.match(html, /data-blcat-pick="joey"/);
  assert.match(html, /data-blcat-pick="smb"/);
  assert.match(w.B.renderTable(r, 'all', '', new Set(), { foreignOpen: true }), /bl-foreign"[^>]* open>/, 'stays open when the view says so');
  assert.match(w.B.renderSummary(r, 'all'), new RegExp(`${n} policies belong to other baselines`));
  // a filter that empties the table still shows the fold
  assert.match(w.B.renderTable(r, 'missing', '', new Set()), /Other baselines in this tenant/);
  // the search narrows it too
  assert.match(w.B.renderTable(r, 'all', 'smb-users', new Set()), /Other baselines in this tenant \(5\)/);
  assert.match(w.B.toMd(r, 'devcf'), new RegExp(`## Other baselines in this tenant \\(${n}\\)`));
});

test('the catalog picker numbers: per baseline, how many policies carry its naming', () => {
  const w = world();
  const c = plain(w.B.familyCounts(devcf(w)));
  assert.deepEqual(c, { limonit: w.CF.policies.length, joey: w.J.policies.length + w.JP.entries().length, smb: w.S.policies.length });
});

test('the catalog last shown is remembered per tenant, and never changes the active baseline', () => {
  const w = world();
  w.B.use('devcf-tenant');
  assert.equal(w.B.viewed(), null);
  const before = w.B.activeCatalogId();
  assert.equal(w.B.setViewed('smb'), true);
  assert.equal(w.B.viewed(), 'smb');
  assert.equal(w.B.activeCatalogId(), before, 'looking is not choosing');
  assert.equal(w.B.stored(), null, 'no active-baseline choice was written');
  w.B.use('other-tenant');
  assert.equal(w.B.viewed(), null, 'per tenant');
  w.B.use('devcf-tenant');
  assert.equal(w.B.viewed(), 'smb');
  assert.equal(w.B.setViewed('nope'), false);
});

test('📥 Import plan: a same-number policy of another baseline is never offered as the one to replace in place', () => {
  const w = world();
  const cf001 = w.CF.policies.find((p) => p.num === 1);
  const cf000 = w.CF.policies.find((p) => p.num === 0);
  const existing = [cf001, cf000].map((p, i) => ({ id: `e${i}`, displayName: p.name, state: 'enabled' }));
  // SMB CA001 vs CloudFellows CA001 ("global" in common), Joey CA000 vs CloudFellows CA000 ("global", "mfa")
  const bundle = { policies: [
    { displayName: w.S.policies.find((p) => p.num === 1).name, state: 'disabled', conditions: {} },
    { displayName: w.J.policies.find((p) => p.num === 0).name, state: 'disabled', conditions: {} },
  ], groups: [] };
  const plan = w.I.plan(bundle, existing);
  for (const p of plan) {
    assert.equal(p.upgrade, false, `${p.name} is deployed alongside, not over another baseline's CA${p.num}`);
    assert.equal(p.exists, false);
  }
  // within one baseline, an older version still upgrades in place
  const older = { id: 'o', displayName: cf001.name.replace(/-v[\d.]+$/, '-v1.0.0'), state: 'enabled' };
  const same = w.I.plan({ policies: [{ displayName: cf001.name, state: 'disabled', conditions: {} }], groups: [] }, [older]);
  assert.equal(same[0].upgrade, true);
});
